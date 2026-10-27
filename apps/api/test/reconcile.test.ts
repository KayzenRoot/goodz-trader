import { describe, expect, it } from 'vitest';

import { evaluateReconciliation } from '../src/bot/reconcile';
import type { BrokerReconciliation } from '../src/brokers';

function reconciliation(overrides: Partial<BrokerReconciliation> = {}): BrokerReconciliation {
  return {
    openPositions: overrides.positions?.length ?? 0,
    openOrders: overrides.orders?.length ?? 0,
    message: 'test',
    positions: [],
    orders: [],
    ...overrides,
  };
}

const position = (side: 'long' | 'short', qty = 1) => ({
  positionId: 1,
  symbol: 'BTC_USDT',
  side,
  qty,
});
const order = (id = '1') => ({ orderId: id, clientOrderId: `gz_${id}`, status: '1' });

describe('evaluateReconciliation', () => {
  it('accepts a flat, clean account', () => {
    expect(
      evaluateReconciliation({ position: null, pending: false }, reconciliation()),
    ).toMatchObject({
      action: 'ok',
    });
  });

  it('halts on an orphan position', () => {
    const decision = evaluateReconciliation(
      { position: null, pending: false },
      reconciliation({ positions: [position('long')] }),
    );
    expect(decision).toMatchObject({ action: 'halt', code: 'orphan_position' });
  });

  it('defers a position that arrived while an entry is pending', () => {
    const decision = evaluateReconciliation(
      { position: null, pending: true },
      reconciliation({ positions: [position('long')] }),
    );
    expect(decision).toMatchObject({ action: 'await_fill' });
  });

  it('halts when a pending fill and an order appear together with a position', () => {
    const decision = evaluateReconciliation(
      { position: null, pending: true },
      reconciliation({ positions: [position('long')], orders: [order()] }),
    );
    expect(decision).toMatchObject({ action: 'halt', code: 'pending_position_order_conflict' });
  });

  it('halts on duplicate positions', () => {
    const decision = evaluateReconciliation(
      { position: null, pending: true },
      reconciliation({ positions: [position('long'), position('long')] }),
    );
    expect(decision).toMatchObject({ action: 'halt', code: 'multiple_positions' });
  });

  it('halts on duplicate pending orders', () => {
    const decision = evaluateReconciliation(
      { position: null, pending: true },
      reconciliation({ orders: [order('1'), order('2')] }),
    );
    expect(decision).toMatchObject({ action: 'halt', code: 'duplicate_orders' });
  });

  it('halts on orphan orders', () => {
    const decision = evaluateReconciliation(
      { position: null, pending: false },
      reconciliation({ orders: [order()] }),
    );
    expect(decision).toMatchObject({ action: 'halt', code: 'orphan_orders' });
  });

  it('accepts a matching position', () => {
    const decision = evaluateReconciliation(
      { position: { side: 'long', qty: 2 }, pending: false },
      reconciliation({ positions: [position('long', 2)] }),
    );
    expect(decision).toMatchObject({ action: 'ok' });
  });

  it('halts on side or quantity mismatch', () => {
    expect(
      evaluateReconciliation(
        { position: { side: 'long', qty: 2 }, pending: false },
        reconciliation({ positions: [position('short', 2)] }),
      ),
    ).toMatchObject({ action: 'halt', code: 'position_side_mismatch' });
    expect(
      evaluateReconciliation(
        { position: { side: 'long', qty: 3 }, pending: false },
        reconciliation({ positions: [position('long', 2)] }),
      ),
    ).toMatchObject({ action: 'halt', code: 'position_qty_mismatch' });
  });

  it('halts on orphan orders while a position is open', () => {
    const decision = evaluateReconciliation(
      { position: { side: 'long', qty: 1 }, pending: false },
      reconciliation({ positions: [position('long')], orders: [order()] }),
    );
    expect(decision).toMatchObject({ action: 'halt', code: 'orphan_orders' });
  });
});
