import type { BotConfig, Trade } from '@goodz/core';

import type { AppLogger } from '../lib/logger';

export type NotificationChannel = 'telegram' | 'webhook';

export interface NotificationChannelResult {
  channel: NotificationChannel;
  ok: boolean;
  status: number | null;
  error?: string;
}

export interface NotificationTestResult {
  ok: boolean;
  channels: NotificationChannelResult[];
}

export interface NotificationOptions {
  maxAttempts?: number;
  retryBaseMs?: number;
  timeoutMs?: number;
  dedupeWindowMs?: number;
  maxQueue?: number;
  now?: () => number;
}

interface NotificationTarget {
  channel: NotificationChannel;
  url: string;
  body: Record<string, unknown>;
}

interface NotificationJob extends NotificationTarget {
  attempts: number;
  nextAt: number;
  lastStatus: number | null;
  lastError: string | null;
}

class NotificationHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
    readonly retryable: boolean,
  ) {
    super(`HTTP ${status}`);
  }
}

/**
 * Reliable, non-blocking notification fan-out.
 *
 * Events are deduplicated by key, copied into a bounded in-memory queue and
 * delivered to Telegram and/or a webhook with timeout, exponential backoff and
 * a per-channel attempt cap. The engine never awaits delivery; a stuck channel
 * cannot slow the trading loop. URLs, bot tokens and chat IDs are never logged.
 */
export class NotificationService {
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;
  private readonly dedupeWindowMs: number;
  private readonly maxQueue: number;
  private readonly now: () => number;
  private readonly queue: NotificationJob[] = [];
  private readonly seen = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private timerAt = 0;
  private draining = false;

  constructor(
    private readonly config: () => BotConfig,
    private readonly telegramToken: () => string,
    private readonly logger: AppLogger,
    private readonly fetchImpl: typeof fetch = fetch,
    options: NotificationOptions = {},
  ) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.retryBaseMs = Math.max(1, options.retryBaseMs ?? 500);
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 5_000);
    this.dedupeWindowMs = Math.max(0, options.dedupeWindowMs ?? 300_000);
    this.maxQueue = Math.max(1, options.maxQueue ?? 200);
    this.now = options.now ?? Date.now;
  }

  notifyTrade(trade: Trade): void {
    const config = this.config();
    if (!config.notifications.notifyOnTrade) return;
    const sign = trade.netPnl >= 0 ? '+' : '';
    const text = [
      `${trade.netPnl >= 0 ? '✅' : '🔴'} ${trade.symbol} ${trade.side.toUpperCase()} fechado`,
      `PnL: ${sign}${trade.netPnl.toFixed(4)} USDT (${trade.rMultiple.toFixed(2)}R)`,
      `Motivo: ${trade.closeReason}`,
      `Modo: ${trade.mode}`,
    ].join('\n');
    this.enqueue(`trade:${trade.id}`, text);
  }

  notifyHalt(reason: string, detail: string, key = `halt:${reason}`): void {
    const config = this.config();
    if (!config.notifications.notifyOnHalt) return;
    this.enqueue(key, `⏸️ Goodz Trader pausado\nMotivo: ${reason}\n${detail}`.trim());
  }

  notifyDaily(kind: 'daily_stop' | 'daily_target', pnl: number, key = `daily:${kind}`): void {
    const text =
      kind === 'daily_target'
        ? `🎯 Meta diária atingida: +${pnl.toFixed(4)} USDT\nO bot foi pausado e não abre novas entradas hoje.`
        : `🛑 Stop diário atingido: ${pnl.toFixed(4)} USDT\nO bot foi pausado e não abre novas entradas hoje.`;
    this.enqueue(key, text);
  }

  notifyCloseFailure(tradeId: string, error: string, key = `close_fail:${tradeId}`): void {
    this.enqueue(
      key,
      `⚠️ Falha ao fechar posição ${tradeId}\n${error.slice(0, 300)}\nVerifique a MEXC manualmente.`,
    );
  }

  notifyFeedStale(source: string, lastTickAt: number, key = `feed_stale:${source}`): void {
    const ageSec = Math.max(0, Math.round((this.now() - lastTickAt) / 1_000));
    this.enqueue(
      key,
      `📡 Feed de mercado atrasado (${source}) há ${ageSec}s\nEntradas bloqueadas até o feed voltar.`,
    );
  }

  /**
   * Sends a single test message to every configured channel. Runs outside the
   * queue and returns per-channel status without exposing destinations.
   */
  async testConnection(): Promise<NotificationTestResult> {
    const targets = this.targets('Goodz Trader: teste de notificação');
    if (targets.length === 0) return { ok: false, channels: [] };

    const channels = await Promise.all(
      targets.map(async (target): Promise<NotificationChannelResult> => {
        try {
          const status = await this.post(target.url, target.body);
          return { channel: target.channel, ok: true, status };
        } catch (error) {
          return {
            channel: target.channel,
            ok: false,
            status: error instanceof NotificationHttpError ? error.status : null,
            error: this.safeError(error),
          };
        }
      }),
    );
    return { ok: channels.every((channel) => channel.ok), channels };
  }

  /** Resolves when the queue is empty (used by drills and tests). */
  async waitForIdle(timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while ((this.queue.length > 0 || this.draining) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  private enqueue(key: string, text: string): void {
    const now = this.now();
    this.pruneSeen(now);
    if (this.seen.has(key)) return;
    this.seen.set(key, now);

    const targets = this.targets(text);
    if (targets.length === 0) return;

    for (const target of targets) {
      this.queue.push({
        ...target,
        attempts: 0,
        nextAt: now,
        lastStatus: null,
        lastError: null,
      });
    }

    if (this.queue.length > this.maxQueue) {
      const dropped = this.queue.length - this.maxQueue;
      this.queue.splice(0, dropped);
      this.logger.warn('Fila de notificações cheia; eventos antigos descartados', {
        dropped,
        maxQueue: this.maxQueue,
      });
    }

    this.schedule(0);
  }

  private targets(text: string): NotificationTarget[] {
    const config = this.config();
    const targets: NotificationTarget[] = [];

    if (config.notifications.telegramEnabled && config.notifications.telegramChatId) {
      const token = this.telegramToken();
      if (token) {
        targets.push({
          channel: 'telegram',
          url: `https://api.telegram.org/bot${token}/sendMessage`,
          body: {
            chat_id: config.notifications.telegramChatId,
            text,
            disable_web_page_preview: true,
          },
        });
      }
    }

    if (config.notifications.webhookUrl) {
      targets.push({
        channel: 'webhook',
        url: config.notifications.webhookUrl,
        body: { text, source: 'goodz-trader' },
      });
    }

    return targets;
  }

  private schedule(delayMs: number): void {
    const due = this.now() + Math.max(0, delayMs);
    if (this.timer && this.timerAt <= due) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerAt = due;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.drain();
      },
      Math.max(0, due - this.now()),
    );
    this.timer.unref?.();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (;;) {
        const now = this.now();
        const index = this.queue.findIndex((job) => job.nextAt <= now);
        if (index < 0) {
          if (this.queue.length > 0) {
            const nextAt = Math.min(...this.queue.map((job) => job.nextAt));
            this.schedule(nextAt - now);
          }
          return;
        }

        const [job] = this.queue.splice(index, 1);
        if (!job) return;
        job.attempts += 1;

        try {
          job.lastStatus = await this.post(job.url, job.body);
        } catch (error) {
          const http = error instanceof NotificationHttpError ? error : null;
          job.lastStatus = http?.status ?? null;
          job.lastError = this.safeError(error);
          const retryable = http ? http.retryable : true;

          if (retryable && job.attempts < this.maxAttempts) {
            const backoff = this.retryBaseMs * 2 ** (job.attempts - 1);
            const delay = Math.max(http?.retryAfterMs ?? 0, backoff);
            job.nextAt = this.now() + delay;
            this.queue.push(job);
            continue;
          }

          this.logger.warn('Notificação descartada após falha', {
            channel: job.channel,
            attempts: job.attempts,
            status: job.lastStatus,
            error: job.lastError,
          });
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) {
        const nextAt = Math.min(...this.queue.map((job) => job.nextAt));
        this.schedule(nextAt - this.now());
      }
    }
  }

  private async post(url: string, body: unknown): Promise<number> {
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (response.ok) return response.status;

    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    const retryable = response.status === 429 || response.status >= 500;
    throw new NotificationHttpError(response.status, retryAfterMs, retryable);
  }

  private pruneSeen(now: number): void {
    if (this.dedupeWindowMs <= 0) {
      this.seen.clear();
      return;
    }
    for (const [key, ts] of this.seen) {
      if (now - ts > this.dedupeWindowMs) this.seen.delete(key);
    }
  }

  private safeError(error: unknown): string {
    if (error instanceof NotificationHttpError) return error.message;
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout';
      return 'network error';
    }
    return 'unknown error';
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1_000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.min(30_000, Math.max(0, date - Date.now()));
}
