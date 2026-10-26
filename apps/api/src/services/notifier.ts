import type { BotConfig, Trade } from '@goodz/core';

import type { AppLogger } from '../lib/logger';

export class NotificationService {
  constructor(
    private readonly config: () => BotConfig,
    private readonly telegramToken: () => string,
    private readonly logger: AppLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  notifyTrade(trade: Trade): void {
    const config = this.config();
    if (!config.notifications.notifyOnTrade) return;
    const sign = trade.netPnl >= 0 ? '+' : '';
    const text = [
      `${trade.netPnl >= 0 ? '✅' : '❌'} ${trade.symbol} ${trade.side.toUpperCase()} fechado`,
      `PnL: ${sign}${trade.netPnl.toFixed(4)} USDT (${trade.rMultiple.toFixed(2)}R)`,
      `Motivo: ${trade.closeReason}`,
      `Modo: ${trade.mode}`,
    ].join('\n');
    this.send(text);
  }

  notifyHalt(reason: string, detail: string): void {
    const config = this.config();
    if (!config.notifications.notifyOnHalt) return;
    this.send(`🛑 Goodz Trader pausado\nMotivo: ${reason}\n${detail}`);
  }

  private send(text: string): void {
    const config = this.config();
    const jobs: Array<Promise<unknown>> = [];

    if (config.notifications.telegramEnabled && config.notifications.telegramChatId) {
      const token = this.telegramToken();
      if (token) {
        jobs.push(
          this.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: config.notifications.telegramChatId,
            text,
            disable_web_page_preview: true,
          }),
        );
      }
    }

    if (config.notifications.webhookUrl) {
      jobs.push(this.post(config.notifications.webhookUrl, { text, source: 'goodz-trader' }));
    }

    for (const job of jobs) {
      job.catch((error: unknown) => {
        this.logger.warn('Falha ao enviar notificação', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private async post(url: string, body: unknown): Promise<void> {
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }
}
