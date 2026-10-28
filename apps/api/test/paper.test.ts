import type { MarketView, OrderRequest } from '@goodz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PaperBroker } from '../src/brokers/paper';
import { closeDatabase, openDatabase, type Db } from '../src/db/database';
import { Repository } from '../src/db/repo';
import { btcContract, testLogger } from './helpers';

const market = (bid: number, ask: number): MarketView => ({
  snapshot: {
    symbol: 'BTC_USDT',
    ts: Date.now(),
    mid: (bid + ask) / 2,
    bid,
    ask,
    last: (bid + ask) / 2,
    spreadBps: ((ask - bid) / ((bid + ask) / 2)) * 10_000,
    imbalance: 0,
    tradeDelta: 0,
    emaFast: bid,
    emaSlow: bid,
    volatilityBps: 0,
  },
  bids: [{ price: bid, qty: 10 }],
  asks: [{ price: ask, qty: 10 }],
  tape: [],
  source: 'synthetic',
  connected: true,
  lastTickAt: Date.now(),
  latencyMs: 0,
});

let db: Db;
let repo: Repository;
let broker: PaperBroker;

beforeEach(() => {
  db = openDatabase(':memory:');
  repo = new Repository(db);
  broker = new PaperBroker({
    repo,
    contract: btcContract,
    startingBalance: 1_000,
    feeMaker: 0.0002,
    feeTaker: 0.0006,
    slippageBps: 3,
    logger: testLogger,
  });
});

const order = (overrides: Partial<OrderRequest> = {}): OrderRequest => ({
  symbol: 'BTC_USDT',
  side: 'long',
  action: 'open',
  type: 'market',
  qty: 10,
  leverage: 10,
  marginMode: 'isolated',
  clientOrderId: `gz_${Math.random().toString(36).slice(2)}`,
  ...overrides,
});

describe('PaperBroker', () => {
  it('starts with the configured balance and no position id', async () => {
    expect(await broker.getEquity()).toBe(1_000);
    expect(await broker.getAvailableBalance()).toBe(1_000);
    expect(await broker.getExchangePositionId()).toBeNull();
    expect((await broker.reconcile()).openOrders).toBe(0);
  });

  it('rejects orders before the first market snapshot', async () => {
    const result = await broker.placeOrder(order());
    expect(result.status).toBe('rejected');
    expect(result.error).toContain('Feed');
  });

  it('fills a market long at the ask with slippage and taker fee', async () => {
    await broker.onSnapshot(market(99_990, 100_010));
    const result = await broker.placeOrder(order());
    expect(result.status).toBe('filled');
    expect(result.avgPrice).toBeCloseTo(100_040, 2);
    expect(result.fee).toBeGreaterThan(0);
    expect(
      await broker.pollOrder({
        exchangeOrderId: result.exchangeOrderId,
        clientOrderId: result.clientOrderId,
      }),
    ).toMatchObject({ status: 'filled' });
  });

  it('fills a resting maker order when the market crosses', async () => {
    await broker.onSnapshot(market(99_990, 100_010));
    const clientOrderId = 'gz_maker_1';
    const placed = await broker.placeOrder(
      order({ type: 'limit', price: 100_000, postOnly: true, clientOrderId }),
    );
    expect(placed.status).toBe('open');
    expect(broker.getOpenOrderCount()).toBe(1);

    const fills = await broker.onSnapshot(market(99_980, 99_995));
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ clientOrderId, status: 'filled', avgPrice: 100_000 });
    expect(fills[0]?.fee).toBeGreaterThan(0);
  });

  it('rejects a post-only order that would cross the spread', async () => {
    await broker.onSnapshot(market(99_990, 100_010));
    const result = await broker.placeOrder(
      order({ type: 'limit', price: 100_020, postOnly: true }),
    );
    expect(result.status).toBe('rejected');
    expect(result.error).toContain('Post-only');
  });

  it('simulates deterministic partial maker fills', async () => {
    const partial = new PaperBroker({
      repo,
      contract: btcContract,
      startingBalance: 1_000,
      feeMaker: 0.0002,
      feeTaker: 0.0006,
      slippageBps: 3,
      logger: testLogger,
      partialFillRatio: 0.5,
    });

    await partial.onSnapshot(market(99_990, 100_010));
    const clientOrderId = 'gz_partial_1';
    const placed = await partial.placeOrder(
      order({ type: 'limit', price: 100_000, postOnly: true, clientOrderId }),
    );
    expect(placed.status).toBe('open');

    const first = await partial.onSnapshot(market(99_980, 99_995));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      clientOrderId,
      status: 'open',
      filledQty: 5,
      avgPrice: 100_000,
    });
    expect(first[0]?.fee).toBeGreaterThan(0);
    expect(partial.getOpenOrderCount()).toBe(1);

    const firstFee = first[0]?.fee ?? 0;
    const nextFill = async () => (await partial.onSnapshot(market(99_980, 99_995)))[0] ?? null;
    let last = await nextFill();
    let snapshots = 0;
    while (last && last.status !== 'filled' && snapshots < 10) {
      snapshots += 1;
      last = await nextFill();
    }
    expect(last).toMatchObject({ clientOrderId, status: 'filled', filledQty: 10 });
    expect(last?.fee).toBeGreaterThan(firstFee);
    expect(
      await partial.pollOrder({ exchangeOrderId: clientOrderId, clientOrderId }),
    ).toMatchObject({ status: 'filled', filledQty: 10 });
    await partial.disconnect();
  });

  it('cancels a resting order and disconnects cleanly', async () => {
    await broker.onSnapshot(market(99_990, 100_010));
    const result = await broker.placeOrder(order({ type: 'limit', price: 99_900, postOnly: true }));
    await broker.cancelOrder({
      exchangeOrderId: result.exchangeOrderId,
      clientOrderId: result.clientOrderId,
    });
    expect(
      await broker.pollOrder({
        exchangeOrderId: result.exchangeOrderId,
        clientOrderId: result.clientOrderId,
      }),
    ).toMatchObject({ status: 'canceled' });

    const second = await broker.placeOrder(order({ type: 'limit', price: 99_900 }));
    await broker.disconnect();
    expect(
      await broker.pollOrder({
        exchangeOrderId: second.exchangeOrderId,
        clientOrderId: second.clientOrderId,
      }),
    ).toMatchObject({ status: 'canceled' });
  });

  it('closes a position at the bid with slippage', async () => {
    const fill = await broker
      .onSnapshot(market(99_990, 100_010))
      .then(() => broker.closePosition({ symbol: 'BTC_USDT', side: 'long', qty: 10 }));
    expect(fill.exitPrice).toBeCloseTo(99_960.003, 2);
    expect(fill.filledQty).toBe(10);
  });

  it('rejects a close without a market snapshot', async () => {
    await expect(
      broker.closePosition({ symbol: 'BTC_USDT', side: 'long', qty: 10 }),
    ).rejects.toThrow('Feed');
  });
});

// Keep the DB handle close deterministic for each test.
afterEach(() => {
  void broker.disconnect();
  closeDatabase(db);
});
