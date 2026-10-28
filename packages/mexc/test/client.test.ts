import { describe, expect, it } from 'vitest';

import { MexcFuturesClient, MexcApiError, signPayload } from '../src';

interface Call {
  url: string;
  init: RequestInit;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const now = 1_700_000_000_000;
const client = (fetchImpl: typeof fetch, withAuth = true) =>
  new MexcFuturesClient({
    apiKey: withAuth ? 'mx-key' : undefined,
    apiSecret: withAuth ? 'mx-secret' : undefined,
    baseUrl: 'https://contract.mexc.com/',
    fetchImpl,
    rateLimit: false,
    now: () => now,
  });

describe('MexcFuturesClient public endpoints', () => {
  it('fetches and maps a ticker', async () => {
    const mock = mockFetch(() =>
      json({
        success: true,
        code: 0,
        data: {
          symbol: 'BTC_USDT',
          lastPrice: 100_000,
          bid1: 99_990,
          ask1: 100_010,
          timestamp: now,
        },
      }),
    );
    const ticker = await client(mock.fetchImpl, false).getTicker('BTC_USDT');
    expect(ticker).toMatchObject({ bid: 99_990, ask: 100_010, lastPrice: 100_000 });
    expect(mock.calls[0]?.url).toBe(
      'https://contract.mexc.com/api/v1/contract/ticker?symbol=BTC_USDT',
    );
    expect(mock.calls[0]?.init.method).toBe('GET');
  });

  it('maps contract detail and throws for an unknown contract', async () => {
    const raw = {
      symbol: 'BTC_USDT',
      baseCoin: 'BTC',
      quoteCoin: 'USDT',
      contractSize: 0.0001,
      minLeverage: 1,
      maxLeverage: 125,
      priceScale: 2,
      volScale: 0,
      volUnit: 1,
      priceUnit: 0.1,
      minVol: 1,
      maxVol: 1_000,
      apiAllowed: true,
    };
    const mock = mockFetch(() => json({ success: true, code: 0, data: [raw] }));
    const mexc = client(mock.fetchImpl, false);
    await expect(mexc.getContract('BTC_USDT')).resolves.toMatchObject({ symbol: 'BTC_USDT' });
    await expect(mexc.getContract('ETH_USDT')).rejects.toBeInstanceOf(MexcApiError);
  });

  it('accepts a single contract object for the symbol query', async () => {
    const raw = {
      symbol: 'BTC_USDT',
      baseCoin: 'BTC',
      quoteCoin: 'USDT',
      contractSize: 0.0001,
      minLeverage: 1,
      maxLeverage: 500,
      priceScale: 1,
      volScale: 0,
      volUnit: 1,
      priceUnit: 0.1,
      minVol: 1,
      maxVol: 400_000,
      makerFeeRate: 0,
      takerFeeRate: 0.0001,
      apiAllowed: true,
    };
    const mock = mockFetch(() => json({ success: true, code: 0, data: raw }));
    const mexc = client(mock.fetchImpl, false);
    await expect(mexc.getContract('BTC_USDT')).resolves.toMatchObject({
      symbol: 'BTC_USDT',
      priceUnit: 0.1,
      maxLeverage: 500,
      makerFeeRate: 0,
      takerFeeRate: 0.0001,
    });
  });

  it('maps klines query parameters', async () => {
    const mock = mockFetch(() =>
      json({
        success: true,
        code: 0,
        data: { time: [1], open: [1], high: [2], low: [0], close: [1.5], vol: [3] },
      }),
    );
    const candles = await client(mock.fetchImpl, false).getKlines('BTC_USDT', 'Min1', 1, 2);
    expect(candles).toHaveLength(1);
    expect(mock.calls[0]?.url).toContain('interval=Min1');
    expect(mock.calls[0]?.url).toContain('start=1');
    expect(mock.calls[0]?.url).toContain('end=2');
  });

  it('throws a friendly MEXC error', async () => {
    const mock = mockFetch(() =>
      json({ success: false, code: 2005, message: 'Insufficient balance', data: null }, 200),
    );
    const error = await client(mock.fetchImpl)
      .getAssets()
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(MexcApiError);
    expect((error as MexcApiError).retryable).toBe(false);
    expect((error as MexcApiError).friendly).toContain('Saldo insuficiente');
  });
});

describe('MexcFuturesClient authentication', () => {
  it('refuses private endpoints without credentials', async () => {
    const mock = mockFetch(() => json({ success: true, code: 0, data: [] }));
    await expect(client(mock.fetchImpl, false).getAssets()).rejects.toMatchObject({
      code: 'NO_CREDENTIALS',
    });
  });

  it('signs a private GET request', async () => {
    const mock = mockFetch(() => json({ success: true, code: 0, data: [] }));
    await client(mock.fetchImpl).getAssets();
    const headers = mock.calls[0]?.init.headers as Record<string, string>;
    expect(headers.ApiKey).toBe('mx-key');
    expect(headers['Request-Time']).toBe(String(now));
    expect(headers.Signature).toBe(signPayload('mx-key', 'mx-secret', String(now), ''));
  });

  it('signs a private GET with a sorted query string', async () => {
    const mock = mockFetch(() => json({ success: true, code: 0, data: [] }));
    await client(mock.fetchImpl).getOpenPositions('BTC_USDT');
    const call = mock.calls[0];
    const headers = call?.init.headers as Record<string, string>;
    const query = new URL(call?.url ?? '').searchParams.toString();
    expect(query).toBe('symbol=BTC_USDT');
    expect(headers.Signature).toBe(signPayload('mx-key', 'mx-secret', String(now), query));
  });

  it('signs the exact JSON body sent to the exchange', async () => {
    const mock = mockFetch(() => json({ success: true, code: 0, data: 123456789 }));
    const result = await client(mock.fetchImpl).placeOrder({
      symbol: 'BTC_USDT',
      side: 'long',
      action: 'open',
      type: 'market',
      qty: 10,
      leverage: 10,
      marginMode: 'isolated',
      clientOrderId: 'gz_test_1',
    });
    expect(result.orderId).toBe('123456789');

    const call = mock.calls[0];
    const headers = call?.init.headers as Record<string, string>;
    const body = String(call?.init.body);
    expect(headers.Signature).toBe(signPayload('mx-key', 'mx-secret', String(now), body));
    expect(JSON.parse(body)).toMatchObject({
      symbol: 'BTC_USDT',
      vol: 10,
      side: 1,
      type: 5,
      openType: 1,
      leverage: 10,
      externalOid: 'gz_test_1',
      price: 0,
    });
  });

  it('maps close orders to the correct MEXC sides', async () => {
    const mock = mockFetch(() => json({ success: true, code: 0, data: 1 }));
    const mexc = client(mock.fetchImpl);
    await mexc.placeOrder({
      symbol: 'BTC_USDT',
      side: 'long',
      action: 'close',
      type: 'limit',
      qty: 1,
      price: 100,
      postOnly: false,
      reduceOnly: true,
      leverage: 10,
      marginMode: 'isolated',
      clientOrderId: 'gz_test_2',
      positionId: 42,
    });
    const body = JSON.parse(String(mock.calls[0]?.init.body));
    expect(body).toMatchObject({
      side: 4,
      type: 1,
      price: 100,
      positionId: 42,
      reduceOnly: true,
    });
  });
});

describe('MexcFuturesClient market and account helpers', () => {
  it('fetches depth, deals and funding', async () => {
    const mock = mockFetch((call) => {
      if (call.url.includes('/depth/')) {
        return json({
          success: true,
          code: 0,
          data: { bids: [[100, 2, 1]], asks: [[101, 3]], version: 1, timestamp: now },
        });
      }
      if (call.url.includes('/deals/')) {
        return json({
          success: true,
          code: 0,
          data: [{ p: 100, v: 2, T: 1, t: now }],
        });
      }
      return json({
        success: true,
        code: 0,
        data: { fundingRate: 0.0001, nextSettleTime: now },
      });
    });
    const mexc = client(mock.fetchImpl, false);
    await expect(mexc.getDepth('BTC_USDT', 5)).resolves.toMatchObject({ bids: [{ price: 100 }] });
    await expect(mexc.getDeals('BTC_USDT', 5)).resolves.toHaveLength(1);
    await expect(mexc.getFundingRate('BTC_USDT')).resolves.toMatchObject({ fundingRate: 0.0001 });
  });

  it('covers account and order helper endpoints', async () => {
    const mock = mockFetch((call) => {
      if (call.url.includes('/position/open_positions')) {
        return json({ success: true, code: 0, data: [] });
      }
      if (call.url.includes('/order/list/open_orders')) {
        return json({ success: true, code: 0, data: [] });
      }
      if (call.url.includes('/position/position_mode')) {
        return json({ success: true, code: 0, data: 2 });
      }
      if (call.url.includes('/position/leverage')) {
        return json({ success: true, code: 0, data: [{ leverage: 10 }] });
      }
      if (call.url.includes('/order/get/')) {
        return json({
          success: true,
          code: 0,
          data: {
            orderId: 1,
            symbol: 'BTC_USDT',
            price: 100,
            vol: 1,
            side: 1,
            orderType: 5,
            openType: 1,
            state: 3,
            dealVol: 1,
            dealAvgPrice: 100,
          },
        });
      }
      return json({ success: true, code: 0, data: null });
    });
    const mexc = client(mock.fetchImpl);
    await expect(mexc.getOpenPositions('BTC_USDT')).resolves.toEqual([]);
    await expect(mexc.getOpenOrders('BTC_USDT')).resolves.toEqual([]);
    await expect(mexc.getPositionMode()).resolves.toBe(2);
    await expect(mexc.getLeverage('BTC_USDT')).resolves.toBe(10);
    await expect(mexc.getOrder('1')).resolves.toMatchObject({ orderId: 1 });
    await expect(mexc.changePositionMode(2)).resolves.toBeUndefined();
    await expect(
      mexc.changeLeverage({ symbol: 'BTC_USDT', leverage: 10, openType: 1, positionType: 1 }),
    ).resolves.toBeUndefined();
    await expect(mexc.cancelOrders(['1', '2'])).resolves.toBeUndefined();
    await expect(mexc.cancelAll('BTC_USDT')).resolves.toBeUndefined();
    await expect(mexc.cancelOrders([])).resolves.toBeUndefined();
  });

  it('maps post-only limit entries', async () => {
    const mock = mockFetch(() => json({ success: true, code: 0, data: 999 }));
    const mexc = client(mock.fetchImpl);
    await mexc.placeOrder({
      symbol: 'BTC_USDT',
      side: 'short',
      action: 'open',
      type: 'limit',
      qty: 2,
      price: 101,
      postOnly: true,
      leverage: 10,
      marginMode: 'cross',
      clientOrderId: 'gz_limit',
    });
    const body = JSON.parse(String(mock.calls[0]?.init.body));
    expect(body).toMatchObject({ side: 3, type: 2, price: 101, openType: 2 });
  });

  it('retries a retryable GET error', async () => {
    let calls = 0;
    const mock = mockFetch(() => {
      calls += 1;
      if (calls === 1) {
        return json({ success: false, code: 510, message: 'rate limited', data: null }, 200);
      }
      return json({ success: true, code: 0, data: now });
    });
    const mexc = client(mock.fetchImpl, false);
    await expect(mexc.getServerTime()).resolves.toBe(now);
    expect(calls).toBe(2);
  });

  it('maps HTTP errors and empty bodies', async () => {
    const httpMock = mockFetch(
      () =>
        new Response('upstream down', { status: 502, headers: { 'Content-Type': 'text/plain' } }),
    );
    await expect(client(httpMock.fetchImpl, false).getTicker('BTC_USDT')).rejects.toMatchObject({
      code: 'HTTP_502',
    });

    const emptyMock = mockFetch(() => new Response('', { status: 200 }));
    await expect(client(emptyMock.fetchImpl, false).getTicker('BTC_USDT')).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
    });
  });
});

describe('MexcFuturesClient private WS login and idempotent submit', () => {
  it('builds the private WS login payload', () => {
    const mexc = client(mockFetch(() => json({ success: true, code: 0, data: null })).fetchImpl);
    const payload = mexc.wsLoginPayload();
    expect(payload).toEqual({
      apiKey: 'mx-key',
      reqTime: String(now),
      signature: signPayload('mx-key', 'mx-secret', String(now), ''),
    });
  });

  it('retries a lost submit response with the same externalOid', async () => {
    let calls = 0;
    const mock = mockFetch(() => {
      calls += 1;
      if (calls === 1) throw new TypeError('connection reset');
      return json({ success: true, code: 0, data: 987654321 });
    });
    const result = await client(mock.fetchImpl).placeOrder({
      symbol: 'BTC_USDT',
      side: 'long',
      action: 'open',
      type: 'market',
      qty: 10,
      leverage: 10,
      marginMode: 'isolated',
      clientOrderId: 'gz_idempotent_1',
    });
    expect(result.orderId).toBe('987654321');
    expect(calls).toBe(2);
    const first = JSON.parse(String(mock.calls[0]?.init.body));
    const second = JSON.parse(String(mock.calls[1]?.init.body));
    expect(first.externalOid).toBe('gz_idempotent_1');
    expect(second.externalOid).toBe('gz_idempotent_1');
  });

  it('refuses WS login without credentials', () => {
    const mexc = client(
      mockFetch(() => json({ success: true, code: 0, data: null })).fetchImpl,
      false,
    );
    expect(() => mexc.wsLoginPayload()).toThrow('API key');
  });
});

describe('MexcFuturesClient connection test', () => {
  it('checks time, equity, positions, orders and position mode', async () => {
    const mock = mockFetch((call) => {
      if (call.url.includes('/ping')) return json({ success: true, code: 0, data: now + 200 });
      if (call.url.includes('/account/assets')) {
        return json({
          success: true,
          code: 0,
          data: [
            {
              currency: 'USDT',
              equity: 1_000,
              availableBalance: 900,
              positionMargin: 100,
              cashBalance: 1_000,
              frozenBalance: 0,
              unrealized: 0,
            },
          ],
        });
      }
      if (call.url.includes('/position/open_positions')) {
        return json({ success: true, code: 0, data: [] });
      }
      if (call.url.includes('/order/list/open_orders')) {
        return json({ success: true, code: 0, data: [] });
      }
      if (call.url.includes('/position/position_mode')) {
        return json({ success: true, code: 0, data: 2 });
      }
      return json({ success: true, code: 0, data: null });
    });

    const mexc = client(mock.fetchImpl);
    const result = await mexc.testConnection();
    expect(result).toMatchObject({
      equity: 1_000,
      availableBalance: 900,
      positionMode: 2,
      openPositions: 0,
      openOrders: 0,
      offsetMs: 200,
    });
    expect(mexc.clockOffsetMs).toBe(200);
  });

  it('refuses an account without USDT', async () => {
    const mock = mockFetch((call) => {
      if (call.url.includes('/ping')) return json({ success: true, code: 0, data: now });
      return json({ success: true, code: 0, data: [] });
    });
    await expect(client(mock.fetchImpl).testConnection()).rejects.toMatchObject({ code: 1000 });
  });
});
