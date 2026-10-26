import { describe, expect, it } from 'vitest';

import {
  bps,
  clamp,
  computeImbalance,
  computeTradeDelta,
  decimalsForStep,
  floorToStep,
  gaussian,
  mulberry32,
  nextEma,
  roundToStep,
  standardDeviation,
} from '../src';

describe('indicators', () => {
  it('computes EMA with the standard smoothing factor', () => {
    expect(nextEma(undefined, 100, 10)).toBe(100);
    expect(nextEma(100, 200, 10)).toBeCloseTo(118.1818, 3);
    expect(nextEma(100, 200, 3)).toBe(150);
  });

  it('converts price differences to basis points', () => {
    expect(bps(101, 100)).toBeCloseTo(100, 8);
    expect(bps(100, 100)).toBe(0);
    expect(bps(100, 0)).toBe(0);
  });

  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('rounds quantities to the exchange step', () => {
    expect(floorToStep(1.987, 0.1)).toBe(1.9);
    expect(floorToStep(1.999999, 1)).toBe(1);
    expect(roundToStep(1.987, 0.1)).toBe(2);
    expect(decimalsForStep(0.001)).toBe(3);
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(0.00000001)).toBe(8);
    expect(floorToStep(2, 0)).toBe(2);
  });

  it('computes order flow measurements', () => {
    expect(computeImbalance(70, 30)).toBeCloseTo(0.4);
    expect(computeImbalance(0, 0)).toBe(0);
    expect(computeTradeDelta(80, 20)).toBeCloseTo(0.6);
    expect(computeTradeDelta(0, 0)).toBe(0);
  });

  it('computes sample standard deviation', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
    expect(standardDeviation([1])).toBe(0);
  });

  it('produces deterministic pseudo-random values', () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    const values = Array.from({ length: 5 }, () => first());
    expect(values).toEqual(Array.from({ length: 5 }, () => second()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(Number.isFinite(gaussian(first))).toBe(true);
  });
});
