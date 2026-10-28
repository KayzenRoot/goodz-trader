import { describe, expect, it } from 'vitest';

import {
  addMicros,
  fromMicros,
  MICROS_PER_USDT,
  mulMicrosBps,
  reconciliationDelta,
  sumMicros,
  toMicros,
} from '../src/money';

describe('money micros', () => {
  it('round-trips numeric and string values', () => {
    expect(toMicros(0.1)).toBe(100_000);
    expect(toMicros('0.1')).toBe(100_000);
    expect(toMicros('12.345678')).toBe(12_345_678);
    expect(toMicros('-1.000001')).toBe(-1_000_001);
    expect(fromMicros(12_345_678)).toBe(12.345678);
    expect(toMicros('0.0000005')).toBe(1);
    expect(toMicros('0.0000004')).toBe(0);
  });

  it('avoids floating drift in sums', () => {
    const values = Array.from({ length: 10_000 }, () => toMicros(0.01));
    expect(fromMicros(sumMicros(values))).toBe(100);
    expect(sumMicros(values)).toBe(100 * MICROS_PER_USDT);
  });

  it('adds, subtracts and applies bps with one rounding', () => {
    expect(addMicros(100_000, 250_000)).toBe(350_000);
    expect(mulMicrosBps(1_000_000, 6)).toBe(600);
    expect(reconciliationDelta(0.3, toMicros('0.300000'))).toBe(0);
  });

  it('rejects invalid or unsafe values', () => {
    expect(() => toMicros(Number.NaN)).toThrow('inválido');
    expect(() => toMicros('1,5')).toThrow('inválido');
    expect(() => toMicros(Number.MAX_SAFE_INTEGER)).toThrow('seguro');
    expect(() => fromMicros(1.5)).toThrow('seguro');
  });
});
