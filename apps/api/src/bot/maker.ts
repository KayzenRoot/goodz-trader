import { roundToStep, type Side } from '@goodz/core';

const EPSILON = 1e-9;

export interface MakerQuoteInput {
  side: Side;
  bid: number;
  ask: number;
  priceUnit: number;
}

/**
 * Best passive price for a post-only entry. The quote sits on our own side of
 * the book and is clamped so tick rounding cannot accidentally cross the
 * spread (which would be rejected by the exchange).
 */
export function makerLimitPrice(input: MakerQuoteInput): number | null {
  const { side, bid, ask, priceUnit } = input;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
  if (ask <= bid) return null;
  const tick = priceUnit > 0 ? priceUnit : 0.01;

  if (side === 'long') {
    const onBid = roundToStep(bid, tick);
    if (onBid > 0 && onBid < ask) return onBid;
    const inside = roundToStep(ask - tick, tick);
    return inside > 0 && inside < ask ? inside : null;
  }

  const onAsk = roundToStep(ask, tick);
  if (onAsk > bid) return onAsk;
  const inside = roundToStep(bid + tick, tick);
  return inside > bid ? inside : null;
}

export interface RequoteInput extends MakerQuoteInput {
  currentPrice: number;
  requotes: number;
  maxRequotes: number;
  elapsedSinceLastQuoteMs: number;
  requoteAfterMs: number;
  requoteMinMoveBps: number;
}

export type RequoteDecision =
  | { action: 'requote'; price: number; improvementBps: number }
  | {
      action: 'hold';
      reason: 'disabled' | 'max_requotes' | 'too_soon' | 'no_improvement' | 'invalid_price';
    };

/**
 * A requote is only worth the cancel/replace risk when the passive price has
 * actually improved by a meaningful amount. The total maker time is bounded by
 * maxRequotes and by the original order expiry.
 */
export function evaluateRequote(input: RequoteInput): RequoteDecision {
  if (input.maxRequotes <= 0) return { action: 'hold', reason: 'disabled' };
  if (input.requotes >= input.maxRequotes) return { action: 'hold', reason: 'max_requotes' };
  if (input.elapsedSinceLastQuoteMs < input.requoteAfterMs) {
    return { action: 'hold', reason: 'too_soon' };
  }

  const price = makerLimitPrice(input);
  if (price === null) return { action: 'hold', reason: 'invalid_price' };

  const improvementBps =
    input.side === 'long'
      ? ((price - input.currentPrice) / input.currentPrice) * 10_000
      : ((input.currentPrice - price) / input.currentPrice) * 10_000;

  if (improvementBps <= EPSILON || improvementBps < input.requoteMinMoveBps) {
    return { action: 'hold', reason: 'no_improvement' };
  }
  return { action: 'requote', price, improvementBps };
}

/** Remaining contracts after any partial fill, rounded to avoid float drift. */
export function remainingQty(requestedQty: number, filledQty: number): number {
  return Number(Math.max(0, requestedQty - filledQty).toFixed(8));
}

/** True when the exchange filled only part of the requested quantity. */
export function isPartialFill(requestedQty: number, filledQty: number): boolean {
  return filledQty > 0 && filledQty + EPSILON < requestedQty;
}

export interface FillState {
  requestedQty: number;
  /** Quantity filled before the currently resting order was placed. */
  filledBase: number;
  /** Quantity filled across every order attempt. */
  filledQty: number;
  avgPrice: number | null;
  /** Limit price used when the exchange omits the average fill price. */
  price: number;
}

export interface FillUpdate {
  filledQty: number;
  avgPrice: number | null;
}

export interface MergedFill {
  filledQty: number;
  added: number;
  avgPrice: number | null;
}

/**
 * Merges one exchange order report into the accumulated entry state. Exchange
 * reports are per-order, so a requote must keep the previous fills and add the
 * new order's deals without double counting.
 */
export function mergeFill(state: FillState, update: FillUpdate): MergedFill {
  const orderFilled = Math.max(0, update.filledQty ?? 0);
  const total = Math.min(state.requestedQty, Number((state.filledBase + orderFilled).toFixed(8)));
  const added = Math.max(0, Number((total - state.filledQty).toFixed(8)));
  if (added <= 0) {
    return { filledQty: state.filledQty, added: 0, avgPrice: state.avgPrice };
  }

  const price = update.avgPrice ?? state.price;
  const avgPrice =
    state.avgPrice === null || state.filledQty <= 0
      ? price
      : (state.avgPrice * state.filledQty + price * added) / (state.filledQty + added);
  return { filledQty: total, added, avgPrice };
}
