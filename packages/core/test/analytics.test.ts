import { describe, expect, it } from 'vitest';

import { equity, trade } from './fixtures';
import {
  buildDailySeries,
  buildExitReasons,
  buildHourlySeries,
  buildRDistribution,
  summarizeTrades,
} from '../src';

const now = Date.parse('2026-03-10T12:00:00.000Z');
const day = 86_400_000;

function sample() {
  return [
    trade({
      id: 'w1',
      netPnl: 10,
      fees: 0.2,
      closedAt: now - day,
      openedAt: now - day - 60_000,
      rMultiple: 1.5,
      closeReason: 'take_profit',
    }),
    trade({
      id: 'w2',
      netPnl: 20,
      fees: 0.3,
      closedAt: now - 2 * day,
      openedAt: now - 2 * day - 30_000,
      rMultiple: 2.5,
      closeReason: 'trailing',
    }),
    trade({
      id: 'l1',
      netPnl: -5,
      fees: 0.1,
      closedAt: now - 2 * day + 3_600_000,
      openedAt: now - 2 * day + 3_600_000 - 20_000,
      rMultiple: -1,
      closeReason: 'stop_loss',
    }),
    trade({
      id: 'l2',
      netPnl: -8,
      fees: 0.1,
      closedAt: now - 8 * day,
      openedAt: now - 8 * day - 10_000,
      rMultiple: -0.5,
      closeReason: 'time_stop',
    }),
    trade({ id: 'open', status: 'open', closedAt: null, netPnl: 0 }),
  ];
}

describe('analytics', () => {
  it('summarizes closed trades', () => {
    const summary = summarizeTrades(sample(), equity([1_000, 1_020, 1_010]), now);
    expect(summary.trades).toBe(4);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(2);
    expect(summary.totalPnl).toBe(17);
    expect(summary.weekPnl).toBe(25);
    expect(summary.winRate).toBe(50);
    expect(summary.profitFactor).toBeCloseTo(2.3077, 3);
    expect(summary.bestTrade).toBe(20);
    expect(summary.worstTrade).toBe(-8);
    expect(summary.maxDrawdownPct).toBeCloseTo(0.9804, 3);
    expect(summary.avgHoldSec).toBeGreaterThan(0);
    expect(summary.currentStreak).toBe(1);
    expect(summary.longestWinStreak).toBe(1);
  });

  it('handles an empty history', () => {
    const summary = summarizeTrades([], [], now);
    expect(summary.trades).toBe(0);
    expect(summary.profitFactor).toBe(0);
    expect(summary.equity).toBe(0);
    expect(summary.maxDrawdownPct).toBe(0);
  });

  it('sums tiny trades exactly with micros', () => {
    const trades = Array.from({ length: 10_000 }, (_, index) =>
      trade({
        id: `micro-${index}`,
        netPnl: 0.01,
        fees: 0.000001,
        closedAt: now - 1_000,
        openedAt: now - 61_000,
      }),
    );
    const summary = summarizeTrades(trades, [], now);
    expect(summary.totalPnl).toBe(100);
    expect(summary.dayPnl).toBe(100);
    expect(summary.fees).toBe(0.01);

    const daily = buildDailySeries(trades, 1, now);
    expect(daily.reduce((sum, item) => sum + item.pnl, 0)).toBe(100);
    expect(daily.reduce((sum, item) => sum + item.fees, 0)).toBe(0.01);
  });

  it('builds a filled daily series', () => {
    const series = buildDailySeries(sample(), 10, now);
    expect(series).toHaveLength(10);
    expect(series.at(-2)?.pnl).toBe(10);
    const total = series.reduce((sum, item) => sum + item.pnl, 0);
    expect(total).toBe(17);
  });

  it('builds hourly performance', () => {
    const series = buildHourlySeries(sample());
    expect(series).toHaveLength(24);
    expect(series.reduce((sum, item) => sum + item.trades, 0)).toBe(4);
    expect(series[12]?.trades).toBe(3);
  });

  it('builds R distribution buckets', () => {
    const distribution = buildRDistribution(sample());
    expect(distribution.reduce((sum, item) => sum + item.count, 0)).toBe(4);
    expect(distribution.find((item) => item.bucket === '1R a 2R')?.count).toBe(1);
    expect(distribution.find((item) => item.bucket === '> 2R')?.count).toBe(1);
  });

  it('aggregates exit reasons', () => {
    const reasons = buildExitReasons(sample());
    expect(reasons).toHaveLength(4);
    expect(reasons[0]?.count).toBe(1);
    expect(reasons.reduce((sum, item) => sum + item.pnl, 0)).toBe(17);
  });
});
