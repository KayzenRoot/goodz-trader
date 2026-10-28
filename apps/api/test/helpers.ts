import {
  botConfigSchema,
  type BotConfig,
  type ContractSpec,
  type EngineStatus,
  type Trade,
} from '@goodz/core';
import type { MexcFuturesClient } from '@goodz/mexc';

import type { AppLogger } from '../src/lib/logger';

const noop = () => undefined;

export const testLogger: AppLogger = {
  child: () => testLogger,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

export const btcContract: ContractSpec = {
  symbol: 'BTC_USDT',
  baseCoin: 'BTC',
  quoteCoin: 'USDT',
  contractSize: 0.0001,
  minVol: 1,
  maxVol: 5_000_000,
  volUnit: 1,
  priceUnit: 0.5,
  priceScale: 2,
  volScale: 0,
  minLeverage: 1,
  maxLeverage: 125,
  makerFeeRate: 0.0002,
  takerFeeRate: 0.0006,
  apiAllowed: true,
};

export function testConfig(overrides: Record<string, unknown> = {}): BotConfig {
  return botConfigSchema.parse(overrides);
}

/**
 * Contract loader avoids any network call in tests. Any other client method
 * intentionally throws so an accidental live call is visible.
 */
export function fakeClient(): MexcFuturesClient {
  return {
    getContract: async (symbol: string) => ({ ...btcContract, symbol }),
    getContractDetail: async () => [btcContract],
    getKlines: async () => [],
    getDepth: async () => ({ bids: [], asks: [], version: 1, timestamp: Date.now() }),
    testConnection: async () => ({
      serverTime: Date.now(),
      offsetMs: 0,
      equity: 1_000,
      availableBalance: 900,
      currency: 'USDT',
      positionMode: 2,
      openPositions: 0,
      openOrders: 0,
    }),
    hasCredentials: false,
    clockOffsetMs: 0,
  } as unknown as MexcFuturesClient;
}

export function sampleClosedTrade(overrides: Partial<Trade> = {}): Trade {
  const now = Date.now();
  return {
    id: 'trd_test_1',
    mode: 'paper',
    symbol: 'BTC_USDT',
    side: 'long',
    status: 'closed',
    qty: 10,
    contractSize: 0.0001,
    entryPrice: 100_000,
    exitPrice: 100_050,
    notionalUsd: 100,
    marginUsd: 10,
    leverage: 10,
    fees: 0.08,
    grossPnl: 0.5,
    netPnl: 0.42,
    rMultiple: 1.2,
    riskUsd: 0.35,
    openReason: 'unit test',
    closeReason: 'take_profit',
    openedAt: now - 30_000,
    closedAt: now,
    createdAt: now - 30_000,
    updatedAt: now,
    isDemo: false,
    meta: {},
    ...overrides,
  };
}

export function idleStatus(overrides: Partial<EngineStatus> = {}): EngineStatus {
  return {
    status: 'stopped',
    mode: 'paper',
    symbol: 'BTC_USDT',
    startedAt: null,
    stoppedAt: null,
    uptimeSec: 0,
    dayKey: '2026-10-26',
    equity: 1_000,
    availableBalance: 1_000,
    dayPnl: 0,
    dayPnlPct: 0,
    realizedDay: 0,
    unrealized: 0,
    feesDay: 0,
    tradesDay: 0,
    winsDay: 0,
    lossesDay: 0,
    consecutiveLosses: 0,
    targetProgress: 0,
    lossProgress: 0,
    haltReason: null,
    lastError: null,
    position: null,
    feed: {
      source: 'synthetic',
      connected: true,
      lastTickAt: Date.now(),
      latencyMs: 0,
      reconnects: 0,
      message: null,
    },
    api: {
      connected: false,
      latencyMs: null,
      lastCheckedAt: null,
      message: 'Paper mode',
    },
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
