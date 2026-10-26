import { describe, expect, it } from 'vitest';

import { dayKey, dayStartMs, msUntilReset, nextResetMs, progressPct } from '../src';

describe('daily guard helpers', () => {
  const ts = Date.parse('2026-03-10T12:00:00.000Z');

  it('uses a configurable UTC reset hour', () => {
    expect(dayKey(ts, 0)).toBe('2026-03-10');
    expect(dayKey(ts, 13)).toBe('2026-03-09');
    expect(dayKey(Date.parse('2026-03-10T23:59:00.000Z'), 0)).toBe('2026-03-10');
  });

  it('calculates day boundaries', () => {
    expect(dayStartMs('2026-03-10', 0)).toBe(Date.parse('2026-03-10T00:00:00.000Z'));
    expect(dayStartMs('2026-03-10', 8)).toBe(Date.parse('2026-03-10T08:00:00.000Z'));
  });

  it('calculates the next reset', () => {
    expect(nextResetMs(ts, 0)).toBe(Date.parse('2026-03-11T00:00:00.000Z'));
    expect(nextResetMs(ts, 13)).toBe(Date.parse('2026-03-10T13:00:00.000Z'));
    expect(msUntilReset(ts, 13)).toBe(3_600_000);
  });

  it('clamps progress to 0-100', () => {
    expect(progressPct(25, 100)).toBe(25);
    expect(progressPct(150, 100)).toBe(100);
    expect(progressPct(-10, 100)).toBe(0);
    expect(progressPct(10, 0)).toBe(0);
  });
});
