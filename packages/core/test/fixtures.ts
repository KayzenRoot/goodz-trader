import {
  botConfigSchema,
  type BotConfig,
  type ContractSpec,
  type EquityPoint,
  type MarketSnapshot,
  type Trade,
} from '../src';

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

export function config(overrides: Record<string, unknown> = {}): BotConfig {
  return botConfigSchema.parse(overrides);
}

export function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbol: 'BTC_USDT',
    ts: 1_700_000_000_000,
    mid: 100_000,
    bid: 99_990,
    ask: 100_010,
    last: 100_000,
    spreadBps: 2,
    imbalance: 0.3,
    tradeDelta: 0.4,
    emaFast: 100_050,
    emaSlow: 100_000,
    volatilityBps: 3,
    ...overrides,
  };
}

export function trade(overrides: Partial<Trade> = {}): Trade {
  const closedAt = overrides.closedAt ?? 1_700_000_000_000;
  return {
    id: `trade-${Math.random().toString(36).slice(2)}`,
    mode: 'paper',
    symbol: 'BTC_USDT',
    side: 'long',
    status: 'closed',
    qty: 10,
    contractSize: 0.0001,
    entryPrice: 100_000,
    exitPrice: 100_030,
    notionalUsd: 100,
    marginUsd: 10,
    leverage: 10,
    fees: 0.08,
    grossPnl: 0.3,
    netPnl: 0.22,
    rMultiple: 1.5,
    riskUsd: 0.15,
    openReason: 'test',
    closeReason: 'take_profit',
    openedAt: closedAt - 30_000,
    closedAt,
    createdAt: closedAt - 30_000,
    updatedAt: closedAt,
    isDemo: false,
    meta: {},
    ...overrides,
  };
}

export function equity(values: number[]): EquityPoint[] {
  return values.map((value, index) => ({
    ts: 1_700_000_000_000 + index * 60_000,
    equity: value,
    balance: value,
    unrealized: 0,
    dayPnl: 0,
  }));
}
