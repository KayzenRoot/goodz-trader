import type {
  AnalyticsResponse,
  EquityPoint,
  OrderRecord,
  BotConfig,
  BotMode,
  ContractSpec,
  EngineStatus,
  MarketView,
  SettingsResponse,
  Trade,
  TradeStatus,
} from '@goodz/core';

import type {
  AuthMe,
  AuditResponse,
  CandleResponse,
  ContractResponse,
  LogsResponse,
  MetricsResponse,
  NotificationTestResult,
  SettingsPayload,
  TestConnectionResult,
  TradeDetailResponse,
  TradesResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401) {
    window.dispatchEvent(new Event('goodz:unauthorized'));
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiError(
      response.status,
      body.error ?? 'request_failed',
      body.message ?? `Falha na requisição (${response.status}).`,
      body.details,
    );
  }

  return payload as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<{ ok: boolean; version: string }>('/api/health'),
  status: () => request<EngineStatus>('/api/status'),
  metrics: (days = 30, mode?: BotMode) =>
    request<MetricsResponse>(`/api/metrics?days=${days}${mode ? `&mode=${mode}` : ''}`),
  analytics: (days = 30, mode?: BotMode) =>
    request<AnalyticsResponse>(`/api/analytics?days=${days}${mode ? `&mode=${mode}` : ''}`),
  equity: (hours = 24) => request<{ items: EquityPoint[] }>(`/api/equity?hours=${hours}`),
  settings: () => request<SettingsResponse>('/api/settings'),
  updateSettings: (payload: SettingsPayload) =>
    request<SettingsResponse>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  testConnection: (apiKey?: string, apiSecret?: string) =>
    request<TestConnectionResult>('/api/settings/test-connection', json({ apiKey, apiSecret })),
  testNotifications: () =>
    request<NotificationTestResult>('/api/settings/test-notifications', json({})),
  setKillSwitch: (enabled: boolean) =>
    request<SettingsResponse>('/api/settings/kill-switch', json({ enabled })),
  startBot: (confirmation?: string) =>
    request<EngineStatus>('/api/bot/start', json({ confirmation })),
  stopBot: (closePosition: boolean) =>
    request<EngineStatus>('/api/bot/stop', json({ closePosition })),
  closePosition: () => request<EngineStatus>('/api/bot/close-position', json({})),
  killBot: () => request<EngineStatus>('/api/bot/kill', json({})),
  trades: (params: {
    limit?: number;
    offset?: number;
    status?: TradeStatus;
    symbol?: string;
    mode?: BotMode;
  }) => {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    if (params.status) query.set('status', params.status);
    if (params.symbol) query.set('symbol', params.symbol);
    if (params.mode) query.set('mode', params.mode);
    return request<TradesResponse>(`/api/trades?${query.toString()}`);
  },
  trade: (id: string) => request<TradeDetailResponse>(`/api/trades/${encodeURIComponent(id)}`),
  openOrders: () => request<{ items: OrderRecord[] }>('/api/orders'),
  logs: (params: { limit?: number; level?: string; category?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.level) query.set('level', params.level);
    if (params.category) query.set('category', params.category);
    return request<LogsResponse>(`/api/logs?${query.toString()}`);
  },
  audit: (limit = 100) => request<AuditResponse>(`/api/settings/audit?limit=${limit}`),
  market: () => request<MarketView>('/api/market/snapshot'),
  candles: (symbol: string, interval = 'Min1', limit = 200) =>
    request<CandleResponse>(
      `/api/market/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
    ),
  contract: (symbol: string) =>
    request<ContractResponse>(`/api/market/contract/${encodeURIComponent(symbol)}`),
  authMe: () => request<AuthMe>('/api/auth/me'),
  login: (password: string) => request<{ ok: boolean }>('/api/auth/login', json({ password })),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', json({})),
  exportTradesUrl: (mode?: BotMode) => `/api/trades/export.csv${mode ? `?mode=${mode}` : ''}`,
};

export type { BotConfig, ContractSpec, SettingsResponse, Trade };
