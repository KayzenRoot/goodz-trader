import { describe, expect, it } from 'vitest';

import {
  evaluateRequote,
  isPartialFill,
  makerLimitPrice,
  mergeFill,
  remainingQty,
} from '../src/bot/maker';

describe('makerLimitPrice', () => {
  it('quotes the best passive price on each side', () => {
    expect(makerLimitPrice({ side: 'long', bid: 100, ask: 100.1, priceUnit: 0.1 })).toBe(100);
    expect(makerLimitPrice({ side: 'short', bid: 100, ask: 100.1, priceUnit: 0.1 })).toBe(100.1);
  });

  it('clamps tick rounding so a post-only order never crosses', () => {
    expect(makerLimitPrice({ side: 'long', bid: 100.09, ask: 100.1, priceUnit: 0.1 })).toBe(100);
    expect(makerLimitPrice({ side: 'short', bid: 100, ask: 100.01, priceUnit: 0.1 })).toBe(100.1);
  });

  it('returns null for invalid books', () => {
    expect(makerLimitPrice({ side: 'long', bid: 0, ask: 100, priceUnit: 0.1 })).toBeNull();
    expect(makerLimitPrice({ side: 'long', bid: 100, ask: 100, priceUnit: 0.1 })).toBeNull();
    expect(makerLimitPrice({ side: 'short', bid: 100, ask: 99, priceUnit: 0.1 })).toBeNull();
  });
});

describe('evaluateRequote', () => {
  const base = {
    side: 'long' as const,
    currentPrice: 100,
    bid: 100,
    ask: 100.2,
    priceUnit: 0.1,
    requotes: 0,
    maxRequotes: 1,
    elapsedSinceLastQuoteMs: 500,
    requoteAfterMs: 400,
    requoteMinMoveBps: 1,
  };

  it('holds when requotes are disabled or exhausted', () => {
    expect(evaluateRequote({ ...base, maxRequotes: 0 })).toEqual({
      action: 'hold',
      reason: 'disabled',
    });
    expect(evaluateRequote({ ...base, requotes: 1 })).toEqual({
      action: 'hold',
      reason: 'max_requotes',
    });
  });

  it('holds before the requote delay', () => {
    expect(evaluateRequote({ ...base, elapsedSinceLastQuoteMs: 100 })).toEqual({
      action: 'hold',
      reason: 'too_soon',
    });
  });

  it('holds when the passive price did not improve enough', () => {
    expect(evaluateRequote({ ...base, bid: 100.005 })).toEqual({
      action: 'hold',
      reason: 'no_improvement',
    });
  });

  it('requotes when the bid improves beyond the threshold', () => {
    const decision = evaluateRequote({ ...base, bid: 100.1 });
    expect(decision).toMatchObject({ action: 'requote', price: 100.1 });
    if (decision.action === 'requote') expect(decision.improvementBps).toBeCloseTo(10, 5);
  });

  it('requotes a short when the ask improves downward', () => {
    const decision = evaluateRequote({
      ...base,
      side: 'short',
      currentPrice: 100.2,
      bid: 100,
      ask: 100.1,
    });
    expect(decision).toMatchObject({ action: 'requote', price: 100.1 });
  });
});

describe('partial fill helpers', () => {
  it('tracks the remaining quantity', () => {
    expect(remainingQty(10, 4)).toBe(6);
    expect(remainingQty(10, 10)).toBe(0);
    expect(remainingQty(10, 12)).toBe(0);
  });

  it('detects partial fills', () => {
    expect(isPartialFill(10, 4)).toBe(true);
    expect(isPartialFill(10, 10)).toBe(false);
    expect(isPartialFill(10, 0)).toBe(false);
  });

  it('merges per-order reports without double counting', () => {
    const first = mergeFill(
      { requestedQty: 10, filledBase: 0, filledQty: 0, avgPrice: null, price: 100 },
      { filledQty: 4, avgPrice: 100 },
    );
    expect(first).toEqual({ filledQty: 4, added: 4, avgPrice: 100 });

    const repeat = mergeFill(
      { requestedQty: 10, filledBase: 0, filledQty: 4, avgPrice: 100, price: 100 },
      { filledQty: 4, avgPrice: 100 },
    );
    expect(repeat).toEqual({ filledQty: 4, added: 0, avgPrice: 100 });
  });

  it('adds fills from a requoted order and caps at the requested quantity', () => {
    const requoted = mergeFill(
      { requestedQty: 10, filledBase: 4, filledQty: 4, avgPrice: 100, price: 100.1 },
      { filledQty: 3, avgPrice: 100.1 },
    );
    expect(requoted.filledQty).toBe(7);
    expect(requoted.added).toBe(3);
    expect(requoted.avgPrice).toBeCloseTo((100 * 4 + 100.1 * 3) / 7, 8);

    const capped = mergeFill(
      { requestedQty: 10, filledBase: 7, filledQty: 7, avgPrice: 100, price: 100 },
      { filledQty: 9, avgPrice: 100 },
    );
    expect(capped.filledQty).toBe(10);
    expect(capped.added).toBe(3);
  });
});
