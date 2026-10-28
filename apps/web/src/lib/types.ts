import type {
  AnalyticsResponse,
  AuditEntry,
  BotConfig,
  BotEventMap,
  Candle,
  ContractSpec,
  EquityPoint,
  LogEntry,
  MetricsSummary,
  OrderRecord,
  SettingsResponse,
  Trade,
} from '@goodz/core';

export type LiveEvent = {
  [K in keyof BotEventMap]: { type: K; data: BotEventMap[K]; ts: number };
}[keyof BotEventMap];

export interface MetricsResponse {
  rangeDays: number;
  summary: MetricsSummary;
  equity: EquityPoint[];
  daily: Array<{
    dayKey: string;
    pnl: number;
    fees: number;
    trades: number;
    wins: number;
    losses: number;
  }>;
  updatedAt: number;
}

export interface TradesResponse {
  items: Trade[];
  total: number;
  limit: number;
  offset: number;
}

export interface TradeDetailResponse {
  trade: Trade;
  orders: OrderRecord[];
}

export interface LogsResponse {
  items: LogEntry[];
}

export interface AuditResponse {
  items: AuditEntry[];
}

export interface CandleResponse {
  source: 'mexc' | 'synthetic';
  candles: Candle[];
}

export interface ContractResponse {
  contract: ContractSpec | null;
  source: 'mexc' | 'fallback' | 'unavailable';
}

export interface AuthMe {
  required: boolean;
  authenticated: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  serverTime: number;
  offsetMs: number;
  equity: number;
  availableBalance: number;
  currency: string;
  positionMode: number;
  openPositions: number;
  openOrders: number;
}

export interface NotificationTestResult {
  ok: boolean;
  channels: Array<{
    channel: 'telegram' | 'webhook';
    ok: boolean;
    status: number | null;
    error?: string;
  }>;
}

export interface SettingsPayload {
  config: BotConfig;
  secrets: {
    apiKey?: string;
    apiSecret?: string;
    telegramBotToken?: string;
    clearApiCredentials?: boolean;
    clearTelegramToken?: boolean;
  };
}

export type { AnalyticsResponse, BotConfig, EquityPoint, LogEntry, SettingsResponse, Trade };
