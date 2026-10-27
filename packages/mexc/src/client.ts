import type { Candle, ContractSpec, OrderRequest } from '@goodz/core';

import { MexcApiError } from './errors';
import { buildAuthHeaders, buildQuery, signPayload, type QueryValue } from './sign';
import {
  mapContract,
  mapDeal,
  mapDepth,
  mapKlines,
  mapTicker,
  type ConnectionTestResult,
  type Deal,
  type Depth,
  type MexcEnvelope,
  type RawAsset,
  type RawContract,
  type RawDeal,
  type RawDepth,
  type RawKline,
  type RawOrder,
  type RawPosition,
  type RawTicker,
  type Ticker,
} from './types';

export interface MexcClientOptions {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  timeoutMs?: number;
  recvWindow?: number;
  fetchImpl?: typeof fetch;
  rateLimit?: boolean;
  maxCallsPerWindow?: number;
  windowMs?: number;
  now?: () => number;
}

interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  auth?: boolean;
  retries?: number;
}

export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxCalls = 15,
    private readonly windowMs = 2_000,
    private readonly now: () => number = Date.now,
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = this.now();
      this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < this.windowMs);
      if (this.timestamps.length < this.maxCalls) {
        this.timestamps.push(now);
        return;
      }
      const oldest = this.timestamps[0] ?? now;
      const wait = Math.max(1, this.windowMs - (now - oldest));
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

export class MexcFuturesClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly timeoutMs: number;
  private readonly recvWindow: number;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: SlidingWindowRateLimiter | null;
  private readonly now: () => number;
  private timeOffsetMs = 0;

  constructor(options: MexcClientOptions = {}) {
    let baseUrl = options.baseUrl ?? 'https://contract.mexc.com';
    while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    this.baseUrl = baseUrl;
    this.apiKey = options.apiKey?.trim() ?? '';
    this.apiSecret = options.apiSecret?.trim() ?? '';
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.recvWindow = options.recvWindow ?? 5;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.limiter =
      options.rateLimit === false
        ? null
        : new SlidingWindowRateLimiter(
            options.maxCallsPerWindow ?? 15,
            options.windowMs ?? 2_000,
            this.now,
          );
  }

  get hasCredentials(): boolean {
    return this.apiKey.length > 0 && this.apiSecret.length > 0;
  }

  get clockOffsetMs(): number {
    return this.timeOffsetMs;
  }

  private requireCredentials(): void {
    if (!this.hasCredentials) {
      throw new MexcApiError(
        'Configure a API key e a API secret da MEXC antes de usar endpoints privados.',
        'NO_CREDENTIALS',
        'auth',
      );
    }
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    if (options.auth) this.requireCredentials();

    const queryString = options.query ? buildQuery(options.query) : '';
    const url = `${this.baseUrl}${path}${queryString ? `?${queryString}` : ''}`;
    const bodyString = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    const paramString = method === 'GET' ? queryString : (bodyString ?? '');
    const maxAttempts = 1 + Math.max(0, options.retries ?? (method === 'GET' ? 1 : 0));

    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        if (this.limiter) await this.limiter.acquire();

        const headers: Record<string, string> = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'goodz-trader/0.1',
        };

        if (options.auth) {
          const timestamp = String(Math.floor(this.now() + this.timeOffsetMs));
          Object.assign(
            headers,
            buildAuthHeaders({
              apiKey: this.apiKey,
              apiSecret: this.apiSecret,
              timestamp,
              paramString,
              recvWindow: this.recvWindow,
            }),
          );
        }

        const response = await this.fetchImpl(url, {
          method,
          headers,
          body: bodyString,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        const text = await response.text();
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          throw new MexcApiError(
            `Resposta inválida da MEXC (${response.status})`,
            `HTTP_${response.status}`,
            path,
            response.status,
          );
        }

        const envelope = parsed as MexcEnvelope<T> | null;
        if (!response.ok) {
          const code = envelope?.code ?? `HTTP_${response.status}`;
          throw new MexcApiError(
            envelope?.message ?? `Falha HTTP ${response.status} na MEXC`,
            code,
            path,
            response.status,
          );
        }
        if (!envelope || typeof envelope !== 'object') {
          throw new MexcApiError('Resposta vazia da MEXC', 'EMPTY_RESPONSE', path, response.status);
        }
        if (
          envelope.success === false ||
          (typeof envelope.code === 'number' && envelope.code !== 0)
        ) {
          throw new MexcApiError(
            envelope.message ?? 'Operação rejeitada pela MEXC',
            envelope.code ?? 'REJECTED',
            path,
            response.status,
          );
        }

        return envelope.data;
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof MexcApiError
            ? error.retryable
            : error instanceof TypeError ||
              (error instanceof DOMException && error.name === 'TimeoutError');
        if (!retryable || attempt === maxAttempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }

    throw lastError;
  }

  // -------------------------------------------------------------------------
  // Public market data
  // -------------------------------------------------------------------------

  async getServerTime(): Promise<number> {
    const data = await this.request<number | { timestamp: number }>(
      'GET',
      '/api/v1/contract/ping',
      {
        retries: 2,
      },
    );
    if (typeof data === 'number') return data;
    return data?.timestamp ?? Date.now();
  }

  async syncTime(): Promise<number> {
    const serverTime = await this.getServerTime();
    this.timeOffsetMs = serverTime - this.now();
    return this.timeOffsetMs;
  }

  async getContractDetail(symbol?: string): Promise<ContractSpec[]> {
    const data = await this.request<RawContract[]>(
      'GET',
      '/api/v1/contract/detail',
      symbol ? { query: { symbol } } : {},
    );
    return (data ?? []).map(mapContract);
  }

  async getContract(symbol: string): Promise<ContractSpec> {
    const contracts = await this.getContractDetail(symbol);
    const contract = contracts.find((item) => item.symbol === symbol);
    if (!contract) {
      throw new MexcApiError(`Contrato ${symbol} não encontrado`, 1001, '/api/v1/contract/detail');
    }
    return contract;
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const data = await this.request<RawTicker>('GET', '/api/v1/contract/ticker', {
      query: { symbol },
    });
    return mapTicker(data);
  }

  async getDepth(symbol: string, limit = 20): Promise<Depth> {
    const data = await this.request<RawDepth>(
      'GET',
      `/api/v1/contract/depth/${encodeURIComponent(symbol)}`,
      { query: { limit } },
    );
    return mapDepth(data);
  }

  async getDeals(symbol: string, limit = 50): Promise<Deal[]> {
    const data = await this.request<RawDeal[]>(
      'GET',
      `/api/v1/contract/deals/${encodeURIComponent(symbol)}`,
      { query: { limit } },
    );
    return (data ?? []).map(mapDeal);
  }

  async getKlines(
    symbol: string,
    interval = 'Min1',
    start?: number,
    end?: number,
  ): Promise<Candle[]> {
    const data = await this.request<RawKline>(
      'GET',
      `/api/v1/contract/kline/${encodeURIComponent(symbol)}`,
      { query: { interval, start, end }, retries: 2 },
    );
    return mapKlines(data);
  }

  async getFundingRate(symbol: string): Promise<{ fundingRate: number; nextSettleTime: number }> {
    return this.request('GET', `/api/v1/contract/funding_rate/${encodeURIComponent(symbol)}`);
  }

  // -------------------------------------------------------------------------
  // Private account / trading
  // -------------------------------------------------------------------------

  async getAssets(): Promise<RawAsset[]> {
    return this.request<RawAsset[]>('GET', '/api/v1/private/account/assets', { auth: true });
  }

  async getUsdtAsset(): Promise<RawAsset> {
    const assets = await this.getAssets();
    const usdt = assets.find((asset) => asset.currency === 'USDT');
    if (!usdt) {
      throw new MexcApiError('Conta USDT não encontrada na MEXC', 1000, '/account/assets');
    }
    return usdt;
  }

  async getOpenPositions(symbol?: string): Promise<RawPosition[]> {
    return this.request<RawPosition[]>('GET', '/api/v1/private/position/open_positions', {
      auth: true,
      query: symbol ? { symbol } : {},
    });
  }

  async getOpenOrders(symbol?: string): Promise<RawOrder[]> {
    const suffix = symbol ? encodeURIComponent(symbol) : '';
    return this.request<RawOrder[]>('GET', `/api/v1/private/order/list/open_orders/${suffix}`, {
      auth: true,
      query: { page_num: 1, page_size: 100 },
    });
  }

  async getOrder(orderId: string): Promise<RawOrder> {
    return this.request<RawOrder>(
      'GET',
      `/api/v1/private/order/get/${encodeURIComponent(orderId)}`,
      { auth: true },
    );
  }

  async getPositionMode(): Promise<number> {
    return this.request<number>('GET', '/api/v1/private/position/position_mode', { auth: true });
  }

  async changePositionMode(positionMode: 1 | 2): Promise<void> {
    await this.request('POST', '/api/v1/private/position/change_position_mode', {
      auth: true,
      body: { positionMode },
    });
  }

  async getLeverage(symbol: string): Promise<number> {
    const data = await this.request<Array<{ leverage: number }>>(
      'GET',
      '/api/v1/private/position/leverage',
      { auth: true, query: { symbol } },
    );
    return data?.[0]?.leverage ?? 0;
  }

  async changeLeverage(input: {
    symbol: string;
    leverage: number;
    openType: 1 | 2;
    positionType?: 1 | 2;
    positionId?: number;
  }): Promise<void> {
    const body = input.positionId
      ? { positionId: input.positionId, leverage: input.leverage }
      : {
          symbol: input.symbol,
          leverage: input.leverage,
          openType: input.openType,
          positionType: input.positionType ?? 1,
        };
    await this.request('POST', '/api/v1/private/position/change_leverage', {
      auth: true,
      body,
    });
  }

  /**
   * Builds the documented private WS login payload. The WS signature is
   * HMAC_SHA256(apiKey + reqTime) with no request body.
   */
  wsLoginPayload(): { apiKey: string; reqTime: string; signature: string } {
    this.requireCredentials();
    const reqTime = String(Math.floor(this.now() + this.timeOffsetMs));
    return {
      apiKey: this.apiKey,
      reqTime,
      signature: signPayload(this.apiKey, this.apiSecret, reqTime, ''),
    };
  }

  async placeOrder(input: OrderRequest): Promise<{ orderId: string }> {
    const side =
      input.action === 'open' ? (input.side === 'long' ? 1 : 3) : input.side === 'long' ? 4 : 2;
    const type = input.type === 'market' ? 5 : input.postOnly ? 2 : 1;
    const body: Record<string, unknown> = {
      symbol: input.symbol,
      price: input.type === 'market' ? 0 : input.price,
      vol: input.qty,
      leverage: input.leverage,
      side,
      type,
      openType: input.marginMode === 'isolated' ? 1 : 2,
      externalOid: input.clientOrderId,
    };
    if (input.positionId) body.positionId = input.positionId;
    if (input.reduceOnly) body.reduceOnly = true;

    // `externalOid` makes submit idempotent: retrying after a lost response
    // returns the existing order instead of creating a duplicate.
    const data = await this.request<string | number>('POST', '/api/v1/private/order/submit', {
      auth: true,
      body,
      retries: 2,
    });
    return { orderId: String(data) };
  }

  async cancelOrders(orderIds: string[]): Promise<void> {
    if (orderIds.length === 0) return;
    await this.request('POST', '/api/v1/private/order/cancel', {
      auth: true,
      body: orderIds,
    });
  }

  async cancelAll(symbol?: string): Promise<void> {
    await this.request('POST', '/api/v1/private/order/cancel_all', {
      auth: true,
      body: symbol ? { symbol } : {},
    });
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const offsetMs = await this.syncTime();
    const [asset, positions, orders, positionMode] = await Promise.all([
      this.getUsdtAsset(),
      this.getOpenPositions(),
      this.getOpenOrders(),
      this.getPositionMode(),
    ]);

    return {
      serverTime: Math.floor(this.now() + offsetMs),
      offsetMs,
      equity: asset.equity,
      availableBalance: asset.availableBalance,
      currency: asset.currency,
      positionMode,
      openPositions: positions.length,
      openOrders: orders.length,
    };
  }
}
