import { botConfigSchema, type EngineStatus } from '@goodz/core';
import { describe, expect, it } from 'vitest';

import { buildOperationalAlerts } from './alerts';

const now = Date.UTC(2026, 0, 1, 12);

function status(overrides: Partial<EngineStatus> = {}): EngineStatus {
  return {
    status: 'running',
    mode: 'paper',
    symbol: 'BTC_USDT',
    startedAt: now - 60_000,
    stoppedAt: null,
    uptimeSec: 60,
    dayKey: '2026-01-01',
    equity: 1_000,
    availableBalance: 900,
    dayPnl: 0,
    dayPnlPct: 0,
    realizedDay: 0,
    unrealized: 0,
    feesDay: 0,
    tradesDay: 1,
    winsDay: 1,
    lossesDay: 0,
    consecutiveLosses: 0,
    targetProgress: 0,
    lossProgress: 0,
    ordersLastMinute: 0,
    haltReason: null,
    lastError: null,
    position: null,
    feed: {
      source: 'synthetic',
      connected: true,
      lastTickAt: now - 1_000,
      latencyMs: 20,
      reconnects: 0,
      message: null,
    },
    api: { connected: false, latencyMs: null, lastCheckedAt: null, message: null },
    demoData: false,
    entryMetrics: {
      makerAttempts: 0,
      makerFills: 0,
      takerFallbacks: 0,
      requotes: 0,
      partialFills: 0,
      makerFillRatePct: 0,
      avgMakerFillMs: null,
      fallbackCostUsd: 0,
    },
    ...overrides,
  };
}

const config = botConfigSchema.parse({});

describe('buildOperationalAlerts', () => {
  it('returns no alerts in a nominal paper session', () => {
    expect(buildOperationalAlerts(status(), config, now)).toEqual([]);
  });

  it('prioritizes kill switch, halt, feed and live API failures', () => {
    const alerts = buildOperationalAlerts(
      status({
        status: 'halted',
        mode: 'live',
        haltReason: 'daily_stop',
        api: { connected: false, latencyMs: null, lastCheckedAt: null, message: null },
        feed: {
          source: 'mexc',
          connected: false,
          lastTickAt: now - 60_000,
          latencyMs: null,
          reconnects: 2,
          message: 'offline',
        },
      }),
      botConfigSchema.parse({ execution: { killSwitch: true } }),
      now,
    );
    expect(alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        'kill-switch',
        'halt',
        'feed-offline',
        'api-offline',
        'feed-reconnects',
      ]),
    );
    expect(alerts[0]?.severity).toBe('critical');
  });

  it('warns about a stale feed and near-limit drawdown, informs target/demo', () => {
    const alerts = buildOperationalAlerts(
      status({
        feed: {
          source: 'mexc',
          connected: true,
          lastTickAt: now - 20_000,
          latencyMs: 100,
          reconnects: 0,
          message: null,
        },
        lossProgress: 85,
        targetProgress: 100,
        demoData: true,
        position: {
          id: 'p',
          symbol: 'BTC_USDT',
          side: 'long',
          qty: 1,
          entryPrice: 100_000,
          markPrice: 99_900,
          notionalUsd: 10,
          marginUsd: 1,
          leverage: 10,
          unrealizedPnl: -0.5,
          unrealizedPct: -50,
          openedAt: now - 5_000,
          stopPrice: 99_800,
          takeProfitPrice: 100_200,
          trailingStopPrice: null,
        },
      }),
      config,
      now,
    );
    expect(alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining(['feed-stale', 'loss-progress', 'target-hit', 'demo-data']),
    );
    expect(alerts.find((alert) => alert.id === 'feed-stale')?.detail).toContain('20s');
  });
});
