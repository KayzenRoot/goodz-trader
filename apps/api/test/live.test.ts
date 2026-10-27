import type { PositionView } from '@goodz/core';
import type { MexcFuturesClient } from '@goodz/mexc';
import { describe, expect, it, vi } from 'vitest';

import { LiveBroker } from '../src/brokers/live';
import { btcContract, testLogger } from './helpers';

function fakeClient(overrides: Record<string, unknown> = {}) {
  const client = {
    syncTime: vi.fn(async () => 0),
    getPositionMode: vi.fn(async () => 2),
    getOpenPositions: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
    getOpenOrders: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
    getUsdtAsset: vi.fn(async () => ({
      currency: 'USDT',
      equity: 1_000,
      availableBalance: 900,
      positionMargin: 100,
      cashBalance: 1_000,
      frozenBalance: 0,
      unrealized: 0,
    })),
    getOrder: vi.fn(async () => ({
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
      takerFee: 0.06,
      makerFee: 0,
    })),
    placeOrder: vi.fn(async () => ({ orderId: '1' })),
    cancelOrders: vi.fn(async () => undefined),
    cancelAll: vi.fn(async () => undefined),
    changeLeverage: vi.fn(async () => undefined),
    ...overrides,
  };
  return client;
}

function broker(client: ReturnType<typeof fakeClient>) {
  return new LiveBroker({
    client: client as unknown as MexcFuturesClient,
    contract: btcContract,
    symbol: 'BTC_USDT',
    leverage: 10,
    marginMode: 'isolated',
    logger: testLogger,
    pollIntervalMs: 1,
  });
}

describe('LiveBroker preflight', () => {
  it('connects a flat one-way account and sets leverage', async () => {
    const client = fakeClient();
    await broker(client).connect();
    expect(client.changeLeverage).toHaveBeenCalledTimes(2);
    expect(client.cancelAll).not.toHaveBeenCalled();
  });

  it('refuses hedge mode', async () => {
    const client = fakeClient({ getPositionMode: vi.fn(async () => 1) });
    await expect(broker(client).connect()).rejects.toThrow('hedge');
  });

  it('refuses an existing position', async () => {
    const client = fakeClient({ getOpenPositions: vi.fn(async () => [{ positionId: 1 }]) });
    await expect(broker(client).connect()).rejects.toThrow('posição aberta');
  });

  it('cancels stale orders and refuses zero balance', async () => {
    const client = fakeClient({ getOpenOrders: vi.fn(async () => [{ orderId: 1 }]) });
    await broker(client).connect();
    expect(client.cancelAll).toHaveBeenCalledWith('BTC_USDT');

    const zero = fakeClient({
      getUsdtAsset: vi.fn(async () => ({
        currency: 'USDT',
        equity: 0,
        availableBalance: 0,
        positionMargin: 0,
        cashBalance: 0,
        frozenBalance: 0,
        unrealized: 0,
      })),
    });
    await expect(broker(zero).connect()).rejects.toThrow('Saldo');
  });
});

describe('LiveBroker operations', () => {
  it('maps order polling and cancels orders', async () => {
    const client = fakeClient();
    const live = broker(client);
    await expect(
      live.pollOrder({ exchangeOrderId: '1', clientOrderId: 'gz_1' }),
    ).resolves.toMatchObject({ status: 'filled', avgPrice: 100, fee: 0.06 });
    await live.cancelOrder({ exchangeOrderId: '1', clientOrderId: 'gz_1' });
    expect(client.cancelOrders).toHaveBeenCalledWith(['1']);
    expect(await live.onSnapshot({} as never)).toEqual([]);
  });

  it('waits for a market fill and closes a position', async () => {
    const client = fakeClient();
    const live = broker(client);
    const result = await live.placeOrder({
      symbol: 'BTC_USDT',
      side: 'long',
      action: 'open',
      type: 'market',
      qty: 1,
      leverage: 10,
      marginMode: 'isolated',
      clientOrderId: 'gz_entry',
    });
    expect(result).toMatchObject({ status: 'filled', filledQty: 1 });

    client.getOpenPositions.mockResolvedValueOnce([
      { positionId: 7, symbol: 'BTC_USDT', positionType: 1, holdVol: 1 },
    ]);
    const close = await live.closePosition({ symbol: 'BTC_USDT', side: 'long', qty: 1 });
    expect(close).toMatchObject({ exitPrice: 100, filledQty: 1 });
  });

  it('reconciles and finds exchange positions', async () => {
    const client = fakeClient();
    client.getOpenPositions.mockResolvedValueOnce([
      { positionId: 9, symbol: 'BTC_USDT', positionType: 1, holdVol: 1 },
    ]);
    const live = broker(client);
    await expect(live.getExchangePositionId('BTC_USDT', 'long')).resolves.toBe(9);
    const reconciliation = await live.reconcile();
    expect(reconciliation).toMatchObject({ openPositions: 0, openOrders: 0 });
    await live.disconnect();
    expect(client.cancelAll).toHaveBeenCalled();
  });

  it('returns detailed reconciliation for orphan detection', async () => {
    const client = fakeClient();
    client.getOpenPositions.mockResolvedValueOnce([
      { positionId: 11, symbol: 'BTC_USDT', positionType: 1, holdVol: 2 },
    ]);
    client.getOpenOrders.mockResolvedValueOnce([
      {
        orderId: 22,
        symbol: 'BTC_USDT',
        price: 100,
        vol: 1,
        side: 1,
        orderType: 2,
        openType: 1,
        state: 1,
        externalOid: 'gz_22',
      },
    ]);
    const live = broker(client);
    const reconciliation = await live.reconcile();
    expect(reconciliation).toMatchObject({
      openPositions: 1,
      openOrders: 1,
      positions: [{ positionId: 11, side: 'long', qty: 2 }],
      orders: [{ orderId: '22', clientOrderId: 'gz_22', status: '1' }],
    });
  });

  it('returns mark price and equity', async () => {
    const live = broker(fakeClient());
    expect(await live.getEquity()).toBe(1_000);
    expect(await live.getAvailableBalance()).toBe(900);
    const position: PositionView = {
      id: 'p',
      symbol: 'BTC_USDT',
      side: 'long',
      qty: 1,
      entryPrice: 100,
      markPrice: 101,
      notionalUsd: 100,
      marginUsd: 10,
      leverage: 10,
      unrealizedPnl: 1,
      unrealizedPct: 10,
      openedAt: Date.now(),
      stopPrice: null,
      takeProfitPrice: null,
      trailingStopPrice: null,
    };
    expect(live.markPrice(position)).toBe(101);
  });
});
