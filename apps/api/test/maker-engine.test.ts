import type { MarketView, OrderRecord, OrderResult, Trade } from '@goodz/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHarness, type Harness } from './harness';

interface PendingShape {
  tradeId: string;
  orderId: string;
  clientOrderId: string;
  exchangeOrderId: string | null;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  price: number;
  expiresAt: number;
  fallbackAttempted: boolean;
  riskUsd: number;
  notionalUsd: number;
  marginUsd: number;
  reason: string;
  createdAt: number;
  lastRequoteAt: number;
  requotes: number;
  cancelFailures: number;
  filledQty: number;
  filledBase: number;
  feeBase: number;
  fee: number;
  avgPrice: number | null;
}

interface EngineInternals {
  pending: PendingShape | null;
  broker: {
    cancelOrder?: (input: unknown) => Promise<void>;
    placeOrder?: (input: {
      qty: number;
      price?: number;
      clientOrderId: string;
    }) => Promise<OrderResult>;
  } | null;
  marketView: MarketView;
  openPositionFromFill: (trade: Trade, fill: OrderResult) => Promise<void>;
  cancelPending: (reason: string) => Promise<void>;
  managePending: (now: number) => Promise<void>;
  entryMetrics: {
    makerFills: number;
    partialFills: number;
    takerFallbacks: number;
    requotes: number;
  };
}

function view(bid: number, ask: number): MarketView {
  return {
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
  };
}

const now = Date.now();

function pendingTrade(id: string): Trade {
  return {
    id,
    mode: 'paper',
    symbol: 'BTC_USDT',
    side: 'long',
    status: 'pending',
    qty: 10,
    contractSize: 0.0001,
    entryPrice: null,
    exitPrice: null,
    notionalUsd: 100,
    marginUsd: 10,
    leverage: 10,
    fees: 0,
    grossPnl: 0,
    netPnl: 0,
    rMultiple: 0,
    riskUsd: 1.4,
    openReason: 'maker test',
    closeReason: '',
    openedAt: null,
    closedAt: null,
    createdAt: now - 1_000,
    updatedAt: now - 1_000,
    isDemo: false,
    meta: { entryStyle: 'maker', requestedQty: 10, stopPrice: 140 },
  };
}

function pendingOrder(tradeId: string, clientOrderId: string): OrderRecord {
  return {
    id: `ord_${tradeId}`,
    tradeId,
    exchangeOrderId: null,
    clientOrderId,
    symbol: 'BTC_USDT',
    side: 'long',
    action: 'open',
    type: 'limit',
    price: 100_000,
    qty: 10,
    filledQty: 0,
    avgPrice: null,
    fee: 0,
    status: 'pending',
    error: null,
    createdAt: now - 1_000,
    updatedAt: now - 1_000,
  };
}

function pendingEntry(tradeId: string, clientOrderId: string): PendingShape {
  return {
    tradeId,
    orderId: `ord_${tradeId}`,
    clientOrderId,
    exchangeOrderId: null,
    symbol: 'BTC_USDT',
    side: 'long',
    qty: 10,
    price: 100_000,
    expiresAt: now + 5_000,
    fallbackAttempted: false,
    riskUsd: 1.4,
    notionalUsd: 100,
    marginUsd: 10,
    reason: 'maker test',
    createdAt: now - 500,
    lastRequoteAt: now - 500,
    requotes: 1,
    cancelFailures: 0,
    filledQty: 4,
    filledBase: 0,
    feeBase: 0,
    fee: 0.02,
    avgPrice: 100_000,
  };
}

describe('maker partial fill adoption', () => {
  let harness: Harness;
  let internal: EngineInternals;

  beforeEach(async () => {
    harness = await createHarness();
    internal = harness.engine as unknown as EngineInternals;
  });

  afterEach(async () => {
    await harness.close();
  });

  it('opens the position with the filled quantity and real fees', async () => {
    const trade = pendingTrade('trd_partial');
    const clientOrderId = 'gz_partial';
    harness.repo.insertTrade(trade);
    harness.repo.insertOrder(pendingOrder(trade.id, clientOrderId));
    internal.pending = pendingEntry(trade.id, clientOrderId);

    await internal.openPositionFromFill(trade, {
      exchangeOrderId: '42',
      clientOrderId,
      status: 'filled',
      filledQty: 4,
      avgPrice: 100_000,
      fee: 0.02,
    });

    const stored = harness.repo.getTrade(trade.id);
    expect(stored).toMatchObject({ status: 'open', qty: 4, fees: 0.02, entryPrice: 100_000 });
    expect(stored?.meta).toMatchObject({
      requestedQty: 10,
      partialFill: true,
      requotes: 1,
    });
    expect(harness.repo.getOrderByClientId(clientOrderId)).toMatchObject({
      status: 'canceled',
      filledQty: 4,
      avgPrice: 100_000,
      fee: 0.02,
    });
    expect(harness.engine.getStatus().position).toMatchObject({ qty: 4, entryPrice: 100_000 });
    expect(harness.engine.getStatus().entryMetrics).toMatchObject({
      makerFills: 1,
      partialFills: 1,
      makerAttempts: 0,
      makerFillRatePct: 0,
    });
    expect(internal.pending).toBeNull();
  });

  it('adopts a partial fill instead of canceling the trade', async () => {
    const trade = pendingTrade('trd_cancel_partial');
    const clientOrderId = 'gz_cancel_partial';
    harness.repo.insertTrade(trade);
    harness.repo.insertOrder(pendingOrder(trade.id, clientOrderId));
    internal.pending = {
      ...pendingEntry(trade.id, clientOrderId),
      filledQty: 3,
      fee: 0.015,
    };
    const cancelOrder = vi.fn(async () => undefined);
    internal.broker = { cancelOrder };

    await internal.cancelPending('manual_stop');

    expect(cancelOrder).toHaveBeenCalledTimes(1);
    const stored = harness.repo.getTrade(trade.id);
    expect(stored).toMatchObject({ status: 'open', qty: 3, fees: 0.015 });
    expect(stored?.meta).toMatchObject({ partialFill: true, requestedQty: 10 });
    expect(harness.engine.getStatus().position).toMatchObject({ qty: 3 });
    expect(internal.pending).toBeNull();
  });

  it('requotes when the passive price improves', async () => {
    const trade = pendingTrade('trd_requote');
    const oldClientOrderId = 'gz_requote_1';
    harness.repo.insertTrade(trade);
    harness.repo.insertOrder(pendingOrder(trade.id, oldClientOrderId));
    internal.pending = {
      ...pendingEntry(trade.id, oldClientOrderId),
      price: 100,
      filledQty: 0,
      avgPrice: null,
      fee: 0,
      requotes: 0,
      lastRequoteAt: now - 1_000,
      expiresAt: now + 5_000,
    };
    internal.marketView = view(100.5, 101);

    const cancelOrder = vi.fn(async () => undefined);
    const placeOrder = vi.fn(
      async (input: {
        qty: number;
        price?: number;
        clientOrderId: string;
      }): Promise<OrderResult> => ({
        exchangeOrderId: '2',
        clientOrderId: input.clientOrderId,
        status: 'open',
        filledQty: 0,
        avgPrice: null,
        fee: 0,
      }),
    );
    internal.broker = { cancelOrder, placeOrder };

    await internal.managePending(now);

    expect(cancelOrder).toHaveBeenCalledTimes(1);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(placeOrder.mock.calls[0]?.[0]).toMatchObject({ qty: 10, price: 100.5 });
    expect(internal.pending).toMatchObject({ requotes: 1, price: 100.5 });
    expect(internal.pending?.clientOrderId).not.toBe(oldClientOrderId);
    expect(harness.repo.getOrderByClientId(oldClientOrderId)).toMatchObject({ status: 'canceled' });
    expect(internal.entryMetrics.requotes).toBe(1);
  });

  it('falls back to one taker order after the maker timeout', async () => {
    const trade = pendingTrade('trd_timeout');
    const clientOrderId = 'gz_timeout';
    harness.repo.insertTrade(trade);
    harness.repo.insertOrder(pendingOrder(trade.id, clientOrderId));
    internal.pending = {
      ...pendingEntry(trade.id, clientOrderId),
      filledQty: 0,
      avgPrice: null,
      fee: 0,
      requotes: 1,
      lastRequoteAt: now - 2_000,
      expiresAt: now - 1,
    };
    internal.marketView = view(100, 100.05);

    const cancelOrder = vi.fn(async () => undefined);
    const placeOrder = vi.fn(
      async (input: {
        qty: number;
        price?: number;
        clientOrderId: string;
      }): Promise<OrderResult> => ({
        exchangeOrderId: '9',
        clientOrderId: input.clientOrderId,
        status: 'filled',
        filledQty: input.qty,
        avgPrice: 100.05,
        fee: 0.03,
      }),
    );
    internal.broker = { cancelOrder, placeOrder };

    await internal.managePending(now);

    expect(cancelOrder).toHaveBeenCalledTimes(1);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(internal.pending).toBeNull();
    expect(internal.entryMetrics.takerFallbacks).toBe(1);
    expect(harness.repo.getTrade(trade.id)?.status).toBe('canceled');
    expect(harness.engine.getStatus().position).toMatchObject({ side: 'long' });
  });
});
