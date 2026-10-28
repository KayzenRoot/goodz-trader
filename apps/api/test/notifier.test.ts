import { botConfigSchema, type BotConfig, type Trade } from '@goodz/core';
import { describe, expect, it, vi } from 'vitest';

import type { AppLogger } from '../src/lib/logger';
import { NotificationService } from '../src/services/notifier';

function config(overrides: Partial<BotConfig['notifications']> = {}): BotConfig {
  return botConfigSchema.parse({
    notifications: {
      telegramEnabled: true,
      telegramChatId: '123456789',
      webhookUrl: 'https://hooks.example.test/goodz',
      notifyOnTrade: true,
      notifyOnHalt: true,
      ...overrides,
    },
  });
}

function fakeLogger() {
  const logger = {
    child: (): AppLogger => logger,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger;
}

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trd_notify',
    mode: 'paper',
    symbol: 'BTC_USDT',
    side: 'long',
    status: 'closed',
    qty: 10,
    contractSize: 0.0001,
    entryPrice: 100_000,
    exitPrice: 100_100,
    notionalUsd: 100,
    marginUsd: 10,
    leverage: 10,
    fees: 0.06,
    grossPnl: 1,
    netPnl: 0.94,
    rMultiple: 1.2,
    riskUsd: 0.8,
    openReason: 'test',
    closeReason: 'take_profit',
    openedAt: 1,
    closedAt: 2,
    createdAt: 1,
    updatedAt: 2,
    isDemo: false,
    meta: {},
    ...overrides,
  };
}

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function fetchMock(response: () => Response) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return response();
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch, raw: fetchImpl };
}

function notifier(
  cfg: Partial<BotConfig['notifications']> = {},
  fetchImpl: typeof fetch,
  logger = fakeLogger(),
) {
  return {
    service: new NotificationService(
      () => config(cfg),
      () => 'secret-token',
      logger,
      fetchImpl,
      { retryBaseMs: 1, timeoutMs: 100, dedupeWindowMs: 60_000 },
    ),
    logger,
  };
}

describe('NotificationService', () => {
  it('fans out to Telegram and webhook and deduplicates by key', async () => {
    const { calls, fetchImpl } = fetchMock(() => new Response('{}', { status: 200 }));
    const { service, logger } = notifier({}, fetchImpl);

    service.notifyTrade(trade());
    service.notifyTrade(trade());
    await service.waitForIdle();

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/botsecret-token/sendMessage'),
        'https://hooks.example.test/goodz',
      ]),
    );
    expect(calls[0]?.body).toMatchObject({ chat_id: '123456789' });
    expect(String(calls[0]?.body.text)).toContain('fechado');
    expect(String(calls[1]?.body.text)).toContain('fechado');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('retries 429 and recovers without exposing the destination', async () => {
    let attempt = 0;
    const { calls, fetchImpl } = fetchMock(() => {
      attempt += 1;
      if (attempt === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '0' },
        });
      }
      return new Response('{}', { status: 200 });
    });
    const { service, logger } = notifier({ telegramEnabled: false }, fetchImpl);

    service.notifyHalt('error', 'teste', 'halt:test:1');
    await service.waitForIdle();

    expect(calls).toHaveLength(2);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('gives up after the attempt cap on 5xx and redacts secrets', async () => {
    const { calls, fetchImpl } = fetchMock(() => new Response('boom', { status: 500 }));
    const { service, logger } = notifier({ telegramEnabled: false }, fetchImpl);

    service.notifyHalt('error', 'falha', 'halt:redact:1');
    await service.waitForIdle();

    expect(calls).toHaveLength(3);
    expect(logger.warn).toHaveBeenCalledWith(
      'Notificação descartada após falha',
      expect.objectContaining({ channel: 'webhook', attempts: 3, status: 500 }),
    );
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toContain('hooks.example.test');
    expect(logged).not.toContain('123456789');
    expect(logged).not.toContain('secret-token');
  });

  it('does not retry a permanent 4xx', async () => {
    const { calls, fetchImpl } = fetchMock(() => new Response('bad', { status: 400 }));
    const { service, logger } = notifier({ telegramEnabled: false }, fetchImpl);

    service.notifyHalt('error', 'permanente', 'halt:400:1');
    await service.waitForIdle();

    expect(calls).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Notificação descartada após falha',
      expect.objectContaining({ attempts: 1, status: 400 }),
    );
  });

  it('returns immediately while the channel is slow', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const { service } = notifier({ telegramEnabled: false }, fetchImpl);

    const started = Date.now();
    service.notifyHalt('error', 'slow', 'halt:slow:1');
    expect(Date.now() - started).toBeLessThan(100);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release();
    await service.waitForIdle();
  });

  it('tests each configured channel and never returns the token', async () => {
    const { fetchImpl } = fetchMock(() => new Response('{}', { status: 200 }));
    const { service } = notifier({}, fetchImpl);

    const result = await service.testConnection();
    expect(result.ok).toBe(true);
    expect(result.channels).toEqual([
      { channel: 'telegram', ok: true, status: 200 },
      { channel: 'webhook', ok: true, status: 200 },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(JSON.stringify(result)).not.toContain('123456789');
  });

  it('reports a missing channel without calling fetch', async () => {
    const { raw, fetchImpl } = fetchMock(() => new Response('{}', { status: 200 }));
    const { service } = notifier({ telegramEnabled: false, webhookUrl: '' }, fetchImpl);

    const result = await service.testConnection();
    expect(result).toEqual({ ok: false, channels: [] });
    expect(raw).not.toHaveBeenCalled();
  });
});
