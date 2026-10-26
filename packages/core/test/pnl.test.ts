import { describe, expect, it } from 'vitest';

import {
  expectancy,
  grossPnl,
  maxDrawdownPct,
  netPnlFromFees,
  notionalUsd,
  profitFactor,
  rMultiple,
  tradeFees,
  winRate,
} from '../src';

describe('pnl', () => {
  it('computes long and short gross pnl', () => {
    expect(grossPnl('long', 100, 110, 2, 1)).toBe(20);
    expect(grossPnl('short', 100, 90, 2, 1)).toBe(20);
    expect(grossPnl('short', 100, 110, 2, 1)).toBe(-20);
  });

  it('computes notional and fees', () => {
    expect(notionalUsd(100, 2, 0.5)).toBe(100);
    expect(tradeFees(100, 110, 0.0002, 0.0006)).toBeCloseTo(0.086, 8);
    expect(netPnlFromFees(10, 0.5)).toBe(9.5);
  });

  it('computes R multiples safely', () => {
    expect(rMultiple(10, 5)).toBe(2);
    expect(rMultiple(10, 0)).toBe(0);
  });

  it('computes max drawdown', () => {
    expect(maxDrawdownPct([100, 120, 90, 130, 110])).toBeCloseTo(25, 8);
    expect(maxDrawdownPct([100, 110])).toBe(0);
    expect(maxDrawdownPct([])).toBe(0);
    expect(maxDrawdownPct([0, 0])).toBe(0);
  });

  it('computes win rate and profit factor', () => {
    expect(winRate(6, 4)).toBe(60);
    expect(winRate(0, 0)).toBe(0);
    expect(profitFactor(60, 30)).toBe(2);
    expect(profitFactor(60, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(profitFactor(0, 0)).toBe(0);
  });

  it('computes expectancy', () => {
    expect(expectancy(50, 10, 5)).toBeCloseTo(2.5, 6);
  });
});
