import type { Side } from './types';

const round = (value: number, digits = 8) => Number(value.toFixed(digits));

export function grossPnl(
  side: Side,
  entryPrice: number,
  exitPrice: number,
  qty: number,
  contractSize: number,
): number {
  const direction = side === 'long' ? 1 : -1;
  return round((exitPrice - entryPrice) * direction * qty * contractSize);
}

export function notionalUsd(price: number, qty: number, contractSize: number): number {
  return round(price * qty * contractSize);
}

export function tradeFees(
  entryNotional: number,
  exitNotional: number,
  entryFeeRate: number,
  exitFeeRate: number,
): number {
  return round(entryNotional * entryFeeRate + exitNotional * exitFeeRate);
}

export function netPnlFromFees(gross: number, fees: number): number {
  return round(gross - fees);
}

export function rMultiple(netPnl: number, riskUsd: number): number {
  if (riskUsd <= 0) return 0;
  return round(netPnl / riskUsd, 4);
}

export function maxDrawdownPct(equity: number[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  for (const value of equity) {
    if (!Number.isFinite(value)) continue;
    peak = Math.max(peak, value);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, ((peak - value) / peak) * 100);
    }
  }
  return round(maxDrawdown, 4);
}

export function winRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return round((wins / total) * 100, 2);
}

export function profitFactor(grossProfit: number, grossLoss: number): number {
  if (grossLoss <= 0) return grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
  return round(grossProfit / grossLoss, 3);
}

export function expectancy(winRatePct: number, avgWin: number, avgLoss: number): number {
  const p = winRatePct / 100;
  return round(p * avgWin - (1 - p) * Math.abs(avgLoss), 6);
}
