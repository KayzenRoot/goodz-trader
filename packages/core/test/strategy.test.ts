import { describe, expect, it } from 'vitest';

import { config, snapshot } from './fixtures';
import { MomentumScalper, type Signal } from '../src';

function feed(
  scalper: MomentumScalper,
  prices: number[],
  options: { imbalance?: number; tradeDelta?: number; startTs?: number; stepMs?: number } = {},
): Signal | null {
  const {
    imbalance = 0.4,
    tradeDelta = 0.6,
    startTs = 1_700_000_000_000,
    stepMs = 1_000,
  } = options;
  let signal: Signal | null = null;
  for (const [index, price] of prices.entries()) {
    signal =
      scalper.next({
        ts: startTs + index * stepMs,
        mid: price,
        bid: price - 0.5,
        ask: price + 0.5,
        imbalance,
        tradeDelta,
      }) ?? signal;
  }
  return signal;
}

describe('MomentumScalper', () => {
  it('does not signal before enough samples', () => {
    const scalper = new MomentumScalper(config().strategy);
    const signal = feed(
      scalper,
      Array.from({ length: 10 }, (_, i) => 100_000 + i),
    );
    expect(signal).toBeNull();
  });

  it('goes long when trend, imbalance and trade delta agree', () => {
    const scalper = new MomentumScalper(config().strategy);
    const prices = Array.from({ length: 30 }, (_, i) => 100_000 + i * 5);
    const signal = feed(scalper, prices);
    expect(signal?.side).toBe('long');
    expect(signal?.strength).toBeGreaterThan(0);
    expect(signal?.reason).toContain('trend=');
  });

  it('goes short when the same measurements point down', () => {
    const scalper = new MomentumScalper(config().strategy);
    const prices = Array.from({ length: 30 }, (_, i) => 100_000 - i * 5);
    const signal = feed(scalper, prices, { imbalance: -0.4, tradeDelta: -0.6 });
    expect(signal?.side).toBe('short');
  });

  it('rejects a long trend when flow disagrees', () => {
    const scalper = new MomentumScalper(config().strategy);
    const prices = Array.from({ length: 30 }, (_, i) => 100_000 + i * 5);
    const signal = feed(scalper, prices, { imbalance: -0.4, tradeDelta: -0.6 });
    expect(signal).toBeNull();
  });

  it('honours the cooldown between signals', () => {
    const scalper = new MomentumScalper(config({ strategy: { cooldownMs: 5_000 } }).strategy);
    const prices = Array.from({ length: 80 }, (_, i) => 100_000 + i * 10);
    const first = feed(scalper, prices, { stepMs: 500 });
    expect(first).not.toBeNull();

    const second = scalper.next({
      ts: 1_700_000_000_000 + 79 * 500 + 1_000,
      mid: 100_500,
      bid: 100_499,
      ask: 100_501,
      imbalance: 0.5,
      tradeDelta: 0.7,
    });
    expect(second).toBeNull();
  });

  it('resets its state', () => {
    const scalper = new MomentumScalper(config().strategy);
    feed(
      scalper,
      Array.from({ length: 30 }, (_, i) => 100_000 + i),
    );
    expect(scalper.snapshot().samples).toBe(30);
    scalper.reset();
    expect(scalper.snapshot()).toEqual({ fast: null, slow: null, samples: 0 });
  });

  it('ignores invalid prices', () => {
    const scalper = new MomentumScalper(config().strategy);
    expect(
      scalper.next({
        ts: 1,
        mid: Number.NaN,
        bid: 0,
        ask: 0,
        imbalance: 0.5,
        tradeDelta: 0.5,
      }),
    ).toBeNull();
  });

  it('snapshot helper matches the fixture market', () => {
    const scalper = new MomentumScalper(config().strategy);
    const input = snapshot();
    scalper.next({
      ts: input.ts,
      mid: input.mid,
      bid: input.bid,
      ask: input.ask,
      imbalance: input.imbalance,
      tradeDelta: input.tradeDelta,
    });
    expect(scalper.snapshot().fast).toBe(100_000);
  });
});
