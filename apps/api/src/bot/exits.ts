import type { Side } from '@goodz/core';

export interface ExitPositionState {
  side: Side;
  entryPrice: number;
  stopPrice: number;
  takeProfitPrice: number;
  trailingStopPrice: number | null;
  openedAt: number;
}

export interface ExitStrategyConfig {
  minHoldMs: number;
  trailingStartBps: number;
  trailingDistanceBps: number;
  timeStopSec: number;
}

export interface ExitDecision {
  reason: string | null;
  trailingStopPrice: number | null;
}

/**
 * Pure exit arbitration shared by the live engine and the backtester, so a
 * replay cannot silently diverge from live TP/SL/trailing/time-stop behavior.
 */
export function evaluateExit(
  position: ExitPositionState,
  mark: number,
  now: number,
  config: ExitStrategyConfig,
): ExitDecision {
  if (now - position.openedAt < config.minHoldMs) {
    return { reason: null, trailingStopPrice: position.trailingStopPrice };
  }

  const direction = position.side === 'long' ? 1 : -1;
  const profitBps = ((mark - position.entryPrice) / position.entryPrice) * 10_000 * direction;
  let trailingStopPrice = position.trailingStopPrice;

  if (profitBps >= config.trailingStartBps) {
    const candidate =
      position.side === 'long'
        ? mark * (1 - config.trailingDistanceBps / 10_000)
        : mark * (1 + config.trailingDistanceBps / 10_000);
    trailingStopPrice =
      trailingStopPrice === null
        ? candidate
        : position.side === 'long'
          ? Math.max(trailingStopPrice, candidate)
          : Math.min(trailingStopPrice, candidate);
  }

  if (position.side === 'long') {
    if (mark <= position.stopPrice) return { reason: 'stop_loss', trailingStopPrice };
    if (trailingStopPrice !== null && mark <= trailingStopPrice) {
      return { reason: 'trailing_stop', trailingStopPrice };
    }
    if (mark >= position.takeProfitPrice) return { reason: 'take_profit', trailingStopPrice };
  } else {
    if (mark >= position.stopPrice) return { reason: 'stop_loss', trailingStopPrice };
    if (trailingStopPrice !== null && mark >= trailingStopPrice) {
      return { reason: 'trailing_stop', trailingStopPrice };
    }
    if (mark <= position.takeProfitPrice) return { reason: 'take_profit', trailingStopPrice };
  }

  if (now - position.openedAt >= config.timeStopSec * 1_000) {
    return { reason: 'time_stop', trailingStopPrice };
  }
  return { reason: null, trailingStopPrice };
}
