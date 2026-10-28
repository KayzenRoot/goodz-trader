import { fromMicros, sumMicros, toMicros } from './money';
import { maxDrawdownPct, profitFactor, winRate } from './pnl';
import type { EquityPoint, MetricsSummary, Trade } from './types';

const DAY_MS = 86_400_000;

function sortedClosed(trades: Trade[]): Trade[] {
  return trades
    .filter((trade) => trade.status === 'closed' && trade.closedAt !== null)
    .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
}

export function summarizeTrades(
  trades: Trade[],
  equity: EquityPoint[] = [],
  now = Date.now(),
): MetricsSummary {
  const closed = sortedClosed(trades);
  const wins = closed.filter((trade) => trade.netPnl > 0);
  const losses = closed.filter((trade) => trade.netPnl <= 0);
  const grossProfitMicros = sumMicros(wins.map((trade) => toMicros(trade.netPnl)));
  const grossLossMicros = Math.abs(sumMicros(losses.map((trade) => toMicros(trade.netPnl))));
  const totalPnlMicros = sumMicros(closed.map((trade) => toMicros(trade.netPnl)));
  const feesMicros = sumMicros(closed.map((trade) => toMicros(trade.fees)));
  const grossProfit = fromMicros(grossProfitMicros);
  const grossLoss = fromMicros(grossLossMicros);
  const totalPnl = fromMicros(totalPnlMicros);
  const fees = fromMicros(feesMicros);
  const dayStart = now - DAY_MS;
  const weekStart = now - 7 * DAY_MS;
  const dayPnl = fromMicros(
    sumMicros(
      closed
        .filter((trade) => (trade.closedAt ?? 0) >= dayStart)
        .map((trade) => toMicros(trade.netPnl)),
    ),
  );
  const weekPnl = fromMicros(
    sumMicros(
      closed
        .filter((trade) => (trade.closedAt ?? 0) >= weekStart)
        .map((trade) => toMicros(trade.netPnl)),
    ),
  );
  const lastEquity = equity.at(-1)?.equity ?? 0;
  const firstEquity = equity.at(0)?.equity ?? 0;
  const dayPnlPct = firstEquity > 0 ? (dayPnl / firstEquity) * 100 : 0;
  const holdTimes = closed
    .filter((trade) => trade.openedAt !== null && trade.closedAt !== null)
    .map((trade) => ((trade.closedAt ?? 0) - (trade.openedAt ?? 0)) / 1_000);
  const streaks = calculateStreaks(closed);

  return {
    equity: lastEquity,
    dayPnl: round(dayPnl),
    dayPnlPct: round(dayPnlPct, 2),
    weekPnl: round(weekPnl),
    totalPnl: round(totalPnl),
    winRate: winRate(wins.length, losses.length),
    profitFactor: profitFactor(grossProfit, grossLoss),
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    avgWin: wins.length ? round(grossProfit / wins.length) : 0,
    avgLoss: losses.length ? round(grossLoss / losses.length) : 0,
    expectancy: round(
      (winRate(wins.length, losses.length) / 100) * (wins.length ? grossProfit / wins.length : 0) -
        (1 - winRate(wins.length, losses.length) / 100) *
          (losses.length ? grossLoss / losses.length : 0),
    ),
    fees: round(fees),
    maxDrawdownPct: maxDrawdownPct(equity.map((point) => point.equity)),
    bestTrade: closed.length
      ? fromMicros(Math.max(...closed.map((trade) => toMicros(trade.netPnl))))
      : 0,
    worstTrade: closed.length
      ? fromMicros(Math.min(...closed.map((trade) => toMicros(trade.netPnl))))
      : 0,
    currentStreak: streaks.current,
    longestWinStreak: streaks.longestWin,
    longestLossStreak: streaks.longestLoss,
    avgHoldSec: holdTimes.length
      ? round(holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length)
      : 0,
  };
}

export function buildDailySeries(
  trades: Trade[],
  days: number,
  now = Date.now(),
): Array<{
  dayKey: string;
  pnl: number;
  fees: number;
  trades: number;
  wins: number;
  losses: number;
}> {
  const result = new Map<
    string,
    { dayKey: string; pnl: number; fees: number; trades: number; wins: number; losses: number }
  >();
  const start = now - days * DAY_MS;

  for (let index = days - 1; index >= 0; index -= 1) {
    const key = new Date(now - index * DAY_MS).toISOString().slice(0, 10);
    result.set(key, { dayKey: key, pnl: 0, fees: 0, trades: 0, wins: 0, losses: 0 });
  }

  for (const trade of sortedClosed(trades)) {
    if ((trade.closedAt ?? 0) < start) continue;
    const key = new Date(trade.closedAt ?? 0).toISOString().slice(0, 10);
    const item = result.get(key) ?? {
      dayKey: key,
      pnl: 0,
      fees: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };
    item.pnl += toMicros(trade.netPnl);
    item.fees += toMicros(trade.fees);
    item.trades += 1;
    if (trade.netPnl > 0) item.wins += 1;
    else item.losses += 1;
    result.set(key, item);
  }

  return [...result.values()]
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
    .map((item) => ({ ...item, pnl: fromMicros(item.pnl), fees: fromMicros(item.fees) }));
}

export function buildHourlySeries(
  trades: Trade[],
): Array<{ hour: number; pnl: number; trades: number; winRate: number }> {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    pnl: 0,
    trades: 0,
    wins: 0,
    winRate: 0,
  }));

  for (const trade of sortedClosed(trades)) {
    const hour = new Date(trade.closedAt ?? 0).getUTCHours();
    const item = hours[hour];
    if (!item) continue;
    item.pnl += toMicros(trade.netPnl);
    item.trades += 1;
    if (trade.netPnl > 0) item.wins += 1;
  }

  return hours.map(({ hour, pnl, trades, wins }) => ({
    hour,
    pnl: fromMicros(pnl),
    trades,
    winRate: winRate(wins, trades - wins),
  }));
}

export function buildRDistribution(trades: Trade[]): Array<{ bucket: string; count: number }> {
  const buckets = [
    { min: -Infinity, max: -2, label: '< -2R' },
    { min: -2, max: -1, label: '-2R a -1R' },
    { min: -1, max: 0, label: '-1R a 0' },
    { min: 0, max: 1, label: '0 a 1R' },
    { min: 1, max: 2, label: '1R a 2R' },
    { min: 2, max: Infinity, label: '> 2R' },
  ];

  return buckets.map(({ min, max, label }) => ({
    bucket: label,
    count: sortedClosed(trades).filter((trade) => trade.rMultiple >= min && trade.rMultiple < max)
      .length,
  }));
}

export function buildExitReasons(
  trades: Trade[],
): Array<{ reason: string; count: number; pnl: number }> {
  const map = new Map<string, { reason: string; count: number; pnl: number }>();
  for (const trade of sortedClosed(trades)) {
    const reason = trade.closeReason || 'unknown';
    const item = map.get(reason) ?? { reason, count: 0, pnl: 0 };
    item.count += 1;
    item.pnl += toMicros(trade.netPnl);
    map.set(reason, item);
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .map((item) => ({ ...item, pnl: fromMicros(item.pnl) }));
}

function calculateStreaks(closed: Trade[]): {
  current: number;
  longestWin: number;
  longestLoss: number;
} {
  let current = 0;
  let longestWin = 0;
  let longestLoss = 0;

  for (const trade of closed) {
    if (trade.netPnl > 0) {
      current = current >= 0 ? current + 1 : 1;
      longestWin = Math.max(longestWin, current);
    } else {
      current = current <= 0 ? current - 1 : -1;
      longestLoss = Math.max(longestLoss, Math.abs(current));
    }
  }

  return { current, longestWin, longestLoss };
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}
