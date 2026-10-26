import { describe, expect, it } from 'vitest';

import { btcContract, config, snapshot } from './fixtures';
import { evaluateEntry, type RiskContext } from '../src';

const now = 1_700_000_000_000;

function context(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    config: config(),
    contract: btcContract,
    snapshot: snapshot(),
    equity: 1_000,
    availableBalance: 1_000,
    dayPnl: 0,
    dayTrades: 0,
    consecutiveLosses: 0,
    lastLossAt: null,
    ordersLastMinute: 0,
    openPositions: 0,
    now,
    mode: 'paper',
    ...overrides,
  };
}

describe('evaluateEntry', () => {
  it('allows a properly sized long', () => {
    const decision = evaluateEntry(context(), 'long');
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.qty).toBeGreaterThanOrEqual(1);
    expect(decision.notionalUsd).toBeLessThanOrEqual(500);
    expect(decision.marginUsd).toBeLessThanOrEqual(100);
    expect(decision.riskUsd).toBeLessThanOrEqual(5);
    expect(decision.reason).toBe('ok');
  });

  it('blocks when the kill switch is active', () => {
    const decision = evaluateEntry(
      context({ config: config({ execution: { killSwitch: true } }) }),
      'long',
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'kill_switch' });
  });

  it('blocks live trading when the contract API is disabled', () => {
    const decision = evaluateEntry(
      context({ mode: 'live', contract: { ...btcContract, apiAllowed: false } }),
      'long',
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'api_disabled' });
  });

  it('blocks below minimum equity', () => {
    const decision = evaluateEntry(context({ equity: 10 }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'min_equity' });
  });

  it('blocks at the daily loss limit', () => {
    const decision = evaluateEntry(context({ dayPnl: -25 }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'daily_stop' });
  });

  it('blocks at the daily profit target when enabled', () => {
    const decision = evaluateEntry(context({ dayPnl: 50 }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'daily_target' });
  });

  it('allows trading past the target when stopOnTarget is disabled', () => {
    const decision = evaluateEntry(
      context({ dayPnl: 50, config: config({ daily: { stopOnTarget: false } }) }),
      'long',
    );
    expect(decision.allowed).toBe(true);
  });

  it('blocks at the daily trade cap', () => {
    const decision = evaluateEntry(context({ dayTrades: 200 }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'max_trades' });
  });

  it('blocks on consecutive losses', () => {
    const decision = evaluateEntry(context({ consecutiveLosses: 5 }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'consecutive_losses' });
  });

  it('blocks during the post-loss cooldown', () => {
    const decision = evaluateEntry(context({ lastLossAt: now - 5_000 }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'cooldown' });
  });

  it('allows once the cooldown expires', () => {
    const decision = evaluateEntry(context({ lastLossAt: now - 31_000 }), 'long');
    expect(decision.allowed).toBe(true);
  });

  it('blocks when a position is already open', () => {
    const decision = evaluateEntry(context({ openPositions: 1 }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'open_position' });
  });

  it('blocks on a wide spread', () => {
    const decision = evaluateEntry(context({ snapshot: snapshot({ spreadBps: 20 }) }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'spread' });
  });

  it('blocks on the order rate limit', () => {
    const decision = evaluateEntry(context({ ordersLastMinute: 30 }), 'long');
    expect(decision).toMatchObject({ allowed: false, reason: 'orders_rate' });
  });

  it('blocks leverage above the contract maximum', () => {
    const decision = evaluateEntry(
      context({
        config: config({ leverage: 125 }),
        contract: { ...btcContract, maxLeverage: 100 },
      }),
      'long',
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'leverage' });
  });

  it('blocks leverage below the contract minimum', () => {
    const decision = evaluateEntry(
      context({ config: config({ leverage: 1 }), contract: { ...btcContract, minLeverage: 5 } }),
      'long',
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'leverage' });
  });

  it('blocks when the minimum contract is too large for the risk budget', () => {
    const decision = evaluateEntry(
      context({ config: config({ risk: { maxNotionalUsd: 5 } }) }),
      'long',
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'min_size' });
  });

  it('uses contract steps and caps the notional', () => {
    const decision = evaluateEntry(
      context({
        contract: { ...btcContract, volUnit: 0.1, minVol: 0.1 },
        config: config({ risk: { maxNotionalUsd: 150 } }),
      }),
      'short',
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(Math.abs(decision.qty * 10 - Math.round(decision.qty * 10))).toBeLessThan(1e-8);
    expect(decision.notionalUsd).toBeLessThanOrEqual(150);
  });

  it('rejects invalid market prices', () => {
    const decision = evaluateEntry(
      context({ snapshot: snapshot({ mid: 0, bid: 0, ask: 0 }) }),
      'long',
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'invalid_price' });
  });

  it('rejects invalid contract values', () => {
    const decision = evaluateEntry(
      context({ contract: { ...btcContract, contractSize: 0 } }),
      'long',
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'invalid_price' });
  });
});
