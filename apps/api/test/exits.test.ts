import { describe, expect, it } from 'vitest';

import { evaluateExit } from '../src/bot/exits';

const config = {
  minHoldMs: 500,
  trailingStartBps: 10,
  trailingDistanceBps: 5,
  timeStopSec: 60,
};

function position(overrides: Record<string, unknown> = {}) {
  return {
    side: 'long' as const,
    entryPrice: 100_000,
    stopPrice: 99_900,
    takeProfitPrice: 100_300,
    trailingStopPrice: null as number | null,
    openedAt: 1_000,
    ...overrides,
  };
}

describe('evaluateExit', () => {
  it('waits for the minimum hold time', () => {
    expect(evaluateExit(position(), 100_500, 1_400, config)).toEqual({
      reason: null,
      trailingStopPrice: null,
    });
  });

  it('returns stop and take-profit reasons', () => {
    expect(evaluateExit(position(), 99_850, 2_000, config)).toMatchObject({
      reason: 'stop_loss',
    });
    expect(evaluateExit(position(), 100_400, 2_000, config)).toMatchObject({
      reason: 'take_profit',
    });
  });

  it('ratchets the trailing stop and exits on it', () => {
    const decision = evaluateExit(position(), 100_200, 2_000, config);
    expect(decision.reason).toBeNull();
    expect(decision.trailingStopPrice).toBeCloseTo(100_149.9, 6);

    const next = evaluateExit(
      position({ trailingStopPrice: decision.trailingStopPrice }),
      100_150,
      2_100,
      config,
    );
    expect(next.trailingStopPrice).toBeCloseTo(100_149.9, 6);
    expect(next.reason).toBeNull();

    expect(
      evaluateExit(
        position({ trailingStopPrice: decision.trailingStopPrice }),
        100_050,
        2_200,
        config,
      ),
    ).toMatchObject({ reason: 'trailing_stop' });
  });

  it('uses the shorter side semantics for a short', () => {
    const short = position({
      side: 'short' as const,
      stopPrice: 100_100,
      takeProfitPrice: 99_700,
    });
    expect(evaluateExit(short, 100_150, 2_000, config)).toMatchObject({ reason: 'stop_loss' });
    expect(evaluateExit(short, 99_600, 2_000, config)).toMatchObject({ reason: 'take_profit' });
  });

  it('applies the time stop last', () => {
    expect(evaluateExit(position(), 100_000, 1_000 + 60_000, config)).toMatchObject({
      reason: 'time_stop',
    });
  });
});
