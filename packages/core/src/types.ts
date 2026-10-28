import type { BotConfig } from './schemas';

export type BotMode = 'paper' | 'live';

export type BotStatus =
  'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'halted' | 'error';

export type HaltReason =
  | 'daily_target'
  | 'daily_stop'
  | 'consecutive_losses'
  | 'max_trades'
  | 'kill_switch'
  | 'manual'
  | 'error'
  | 'config';

export type Side = 'long' | 'short';
export type TradeStatus = 'pending' | 'open' | 'closed' | 'canceled' | 'rejected';
export type OrderAction = 'open' | 'close';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'pending' | 'open' | 'filled' | 'canceled' | 'rejected';

export interface ContractSpec {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  contractSize: number;
  minVol: number;
  maxVol: number;
  volUnit: number;
  priceUnit: number;
  priceScale: number;
  volScale: number;
  minLeverage: number;
  maxLeverage: number;
  makerFeeRate: number;
  takerFeeRate: number;
  apiAllowed: boolean;
}

export interface MarketSnapshot {
  symbol: string;
  ts: number;
  mid: number;
  bid: number;
  ask: number;
  last: number;
  spreadBps: number;
  imbalance: number;
  tradeDelta: number;
  emaFast: number;
  emaSlow: number;
  volatilityBps: number;
}

export interface Signal {
  side: Side;
  strength: number;
  reason: string;
}

export interface BookLevel {
  price: number;
  qty: number;
}

export interface TapePrint {
  ts: number;
  price: number;
  qty: number;
  side: 'buy' | 'sell';
}

export interface MarketView {
  snapshot: MarketSnapshot | null;
  bids: BookLevel[];
  asks: BookLevel[];
  tape: TapePrint[];
  source: 'synthetic' | 'mexc' | 'none';
  connected: boolean;
  lastTickAt: number | null;
  latencyMs: number | null;
}

export interface PositionView {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  entryPrice: number;
  markPrice: number;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  openedAt: number;
  stopPrice: number | null;
  takeProfitPrice: number | null;
  trailingStopPrice: number | null;
}

export interface Trade {
  id: string;
  mode: BotMode;
  symbol: string;
  side: Side;
  status: TradeStatus;
  qty: number;
  contractSize: number;
  entryPrice: number | null;
  exitPrice: number | null;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  fees: number;
  grossPnl: number;
  netPnl: number;
  rMultiple: number;
  riskUsd: number;
  openReason: string;
  closeReason: string;
  openedAt: number | null;
  closedAt: number | null;
  createdAt: number;
  updatedAt: number;
  isDemo: boolean;
  meta: Record<string, unknown>;
}

export interface OrderRecord {
  id: string;
  tradeId: string;
  exchangeOrderId: string | null;
  clientOrderId: string;
  symbol: string;
  side: Side;
  action: OrderAction;
  type: OrderType;
  price: number | null;
  qty: number;
  filledQty: number;
  avgPrice: number | null;
  fee: number;
  status: OrderStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  action: OrderAction;
  type: OrderType;
  qty: number;
  price?: number;
  postOnly?: boolean;
  reduceOnly?: boolean;
  leverage: number;
  marginMode: 'isolated' | 'cross';
  clientOrderId: string;
  positionId?: number;
}

export interface OrderResult {
  exchangeOrderId: string;
  clientOrderId: string;
  status: OrderStatus;
  filledQty: number;
  avgPrice: number | null;
  fee: number;
  error?: string;
  raw?: unknown;
}

export interface CloseResult {
  exitPrice: number;
  filledQty: number;
  fee: number;
  exchangeOrderId: string | null;
  raw?: unknown;
}

export interface EquityPoint {
  ts: number;
  equity: number;
  balance: number;
  unrealized: number;
  dayPnl: number;
}

export interface DailyStats {
  dayKey: string;
  startEquity: number;
  endEquity: number;
  realizedPnl: number;
  fees: number;
  trades: number;
  wins: number;
  losses: number;
  targetHit: boolean;
  stopHit: boolean;
  maxDrawdownPct: number;
  updatedAt: number;
}

export interface LogEntry {
  id: number;
  ts: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  data: Record<string, unknown> | null;
}

export interface AuditEntry {
  id: number;
  ts: number;
  actor: string;
  action: string;
  detail: string;
  ip: string | null;
}

export interface FeedStatus {
  source: 'synthetic' | 'mexc' | 'none';
  connected: boolean;
  lastTickAt: number | null;
  latencyMs: number | null;
  reconnects: number;
  message: string | null;
}

export interface ApiHealth {
  connected: boolean;
  latencyMs: number | null;
  lastCheckedAt: number | null;
  message: string | null;
}

export interface EntryMetrics {
  makerAttempts: number;
  makerFills: number;
  takerFallbacks: number;
  requotes: number;
  partialFills: number;
  makerFillRatePct: number;
  avgMakerFillMs: number | null;
  fallbackCostUsd: number;
}

export interface EngineStatus {
  status: BotStatus;
  mode: BotMode;
  symbol: string;
  startedAt: number | null;
  stoppedAt: number | null;
  uptimeSec: number;
  dayKey: string;
  equity: number;
  availableBalance: number;
  dayPnl: number;
  dayPnlPct: number;
  realizedDay: number;
  unrealized: number;
  feesDay: number;
  tradesDay: number;
  winsDay: number;
  lossesDay: number;
  consecutiveLosses: number;
  targetProgress: number;
  lossProgress: number;
  haltReason: HaltReason | null;
  lastError: string | null;
  position: PositionView | null;
  feed: FeedStatus;
  api: ApiHealth;
  demoData: boolean;
  entryMetrics: EntryMetrics;
}

export interface SecretStatus {
  hasApiKey: boolean;
  apiKeyMasked: string;
  credentialSource: 'settings' | 'env' | 'none';
  hasTelegramToken: boolean;
}

export interface SettingsResponse {
  config: BotConfig;
  secrets: SecretStatus;
  updatedAt: number | null;
  liveTradingEnabled: boolean;
  confirmationPhrase: string;
  authRequired: boolean;
}

export interface MetricsSummary {
  equity: number;
  dayPnl: number;
  dayPnlPct: number;
  weekPnl: number;
  totalPnl: number;
  winRate: number;
  profitFactor: number;
  trades: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  fees: number;
  maxDrawdownPct: number;
  bestTrade: number;
  worstTrade: number;
  currentStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  avgHoldSec: number;
}

export interface AnalyticsResponse {
  rangeDays: number;
  summary: MetricsSummary;
  daily: Array<{
    dayKey: string;
    pnl: number;
    fees: number;
    trades: number;
    wins: number;
    losses: number;
  }>;
  hourly: Array<{ hour: number; pnl: number; trades: number; winRate: number }>;
  rDistribution: Array<{ bucket: string; count: number }>;
  exitReasons: Array<{ reason: string; count: number; pnl: number }>;
  equity: EquityPoint[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BotEventMap {
  status: EngineStatus;
  market: MarketView;
  trade: Trade;
  equity: EquityPoint;
  log: LogEntry;
  config: SettingsResponse;
  heartbeat: { ts: number };
}
