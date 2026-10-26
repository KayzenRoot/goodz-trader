import { describe, expect, it } from 'vitest';

import {
  dayShort,
  fmtBps,
  fmtCompact,
  fmtDateTime,
  fmtDuration,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtPrice,
  fmtRelative,
  fmtSignedMoney,
  fmtSignedPct,
  fmtTime,
  pairBase,
  pairQuote,
} from './format';

describe('format', () => {
  it('formats money in pt-BR', () => {
    expect(fmtMoney(1234.5)).toBe('1.234,50 USDT');
    expect(fmtSignedMoney(12.3)).toBe('+12,30 USDT');
    expect(fmtSignedMoney(-2)).toBe('-2,00 USDT');
    expect(fmtMoney(Number.NaN)).toBe('—');
    expect(fmtNumber(1234.5, 0)).toBe('1.235');
    expect(fmtNumber(null)).toBe('—');
  });

  it('formats percentages and bps', () => {
    expect(fmtPct(12.345)).toBe('12,35%');
    expect(fmtSignedPct(1.2)).toBe('+1,20%');
    expect(fmtSignedPct(-1.2)).toBe('-1,20%');
    expect(fmtBps(8.5)).toBe('8,5 bps');
    expect(fmtBps(null)).toBe('—');
  });

  it('formats prices adaptively', () => {
    expect(fmtPrice(100000.5)).toBe('100.000,50');
    expect(fmtPrice(0.12345678)).toBe('0,123457');
    expect(fmtPrice(null)).toBe('—');
    expect(fmtCompact(1500)).not.toBe('—');
    expect(fmtCompact(null)).toBe('—');
  });

  it('formats durations', () => {
    expect(fmtDuration(45)).toBe('45s');
    expect(fmtDuration(125)).toBe('2m 5s');
    expect(fmtDuration(3_661)).toBe('1h 1m');
    expect(fmtDuration(null)).toBe('—');
  });

  it('formats dates and symbols', () => {
    expect(dayShort('2026-03-10')).toBe('10/03');
    expect(pairBase('BTC_USDT')).toBe('BTC');
    expect(pairQuote('BTC_USDT')).toBe('USDT');
    expect(fmtTime(null)).toBe('—');
    expect(fmtTime(Date.now())).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(fmtDateTime(Date.now())).toMatch(/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/);
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtRelative(Date.now() - 60_000)).not.toBe('—');
    expect(fmtRelative(null)).toBe('—');
  });
});
