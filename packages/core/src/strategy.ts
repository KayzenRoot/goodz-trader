import { bps, clamp, nextEma } from './indicators';
import type { StrategyConfig } from './schemas';
import type { Signal } from './types';

export interface StrategyInput {
  ts: number;
  mid: number;
  bid: number;
  ask: number;
  imbalance: number;
  tradeDelta: number;
}

/**
 * Fast momentum + order-flow scalper.
 *
 * It only emits a signal when three independent measurements agree:
 * 1. short-term EMA trend above a configurable bps threshold;
 * 2. order-book imbalance in the same direction;
 * 3. aggressive trade delta in the same direction.
 *
 * The engine is responsible for risk checks, sizing and exits.
 */
export class MomentumScalper {
  private fast: number | undefined;
  private slow: number | undefined;
  private samples = 0;
  private lastSignalAt = 0;

  constructor(private readonly config: StrategyConfig) {}

  next(input: StrategyInput): Signal | null {
    if (!Number.isFinite(input.mid) || input.mid <= 0) return null;

    this.fast = nextEma(this.fast, input.mid, this.config.fastEma);
    this.slow = nextEma(this.slow, input.mid, this.config.slowEma);
    this.samples += 1;

    if (this.samples < this.config.slowEma) return null;
    if (input.ts - this.lastSignalAt < this.config.cooldownMs) return null;

    const trend = bps(this.fast, this.slow);
    const { entryThresholdBps, imbalanceThreshold, tradeDeltaThreshold } = this.config;

    const long =
      trend >= entryThresholdBps &&
      input.imbalance >= imbalanceThreshold &&
      input.tradeDelta >= tradeDeltaThreshold;
    const short =
      trend <= -entryThresholdBps &&
      input.imbalance <= -imbalanceThreshold &&
      input.tradeDelta <= -tradeDeltaThreshold;

    if (!long && !short) return null;

    const side = long ? 'long' : 'short';
    const alignment =
      Math.abs(trend) / Math.max(entryThresholdBps, 0.0001) +
      Math.abs(input.imbalance) / Math.max(imbalanceThreshold, 0.0001) +
      Math.abs(input.tradeDelta) / Math.max(tradeDeltaThreshold, 0.0001);

    this.lastSignalAt = input.ts;

    return {
      side,
      strength: clamp(alignment / 6, 0, 1),
      reason: `trend=${trend.toFixed(2)}bps imb=${input.imbalance.toFixed(3)} delta=${input.tradeDelta.toFixed(3)}`,
    };
  }

  reset(): void {
    this.fast = undefined;
    this.slow = undefined;
    this.samples = 0;
    this.lastSignalAt = 0;
  }

  snapshot(): { fast: number | null; slow: number | null; samples: number } {
    return {
      fast: this.fast ?? null,
      slow: this.slow ?? null,
      samples: this.samples,
    };
  }
}
