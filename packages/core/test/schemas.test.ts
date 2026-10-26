import { describe, expect, it } from 'vitest';

import { botConfigSchema, envBooleanSchema, LIVE_CONFIRMATION_PHRASE } from '../src';

describe('botConfigSchema', () => {
  it('fills safe defaults', () => {
    const config = botConfigSchema.parse({});
    expect(config.mode).toBe('paper');
    expect(config.leverage).toBe(10);
    expect(config.primarySymbol).toBe('BTC_USDT');
    expect(config.paper.feed).toBe('synthetic');
    expect(config.daily.lossLimitUsd).toBe(25);
    expect(config.execution.killSwitch).toBe(false);
    expect(config.watchlist).toEqual(['BTC_USDT']);
  });

  it('deep-merges partial updates', () => {
    const config = botConfigSchema.parse({ risk: { riskPerTradePct: 1.2 } });
    expect(config.risk.riskPerTradePct).toBe(1.2);
    expect(config.risk.maxTradesPerDay).toBe(200);
  });

  it('rejects a fast EMA above the slow EMA', () => {
    const result = botConfigSchema.safeParse({ strategy: { fastEma: 30, slowEma: 20 } });
    expect(result.success).toBe(false);
  });

  it('rejects a take profit that does not cover fees', () => {
    const result = botConfigSchema.safeParse({
      strategy: { takeProfitBps: 8 },
      execution: { feeMaker: 0.0002, feeTaker: 0.0006 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a trailing start above take profit', () => {
    const result = botConfigSchema.safeParse({
      strategy: { takeProfitBps: 20, trailingStartBps: 25 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a trailing distance above its start', () => {
    const result = botConfigSchema.safeParse({
      strategy: { trailingStartBps: 10, trailingDistanceBps: 12 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unbalanced daily target', () => {
    const result = botConfigSchema.safeParse({
      daily: { profitTargetUsd: 1, lossLimitUsd: 100 },
    });
    expect(result.success).toBe(false);
  });

  it('requires the primary symbol in the watchlist', () => {
    const result = botConfigSchema.safeParse({
      primarySymbol: 'ETH_USDT',
      watchlist: ['BTC_USDT'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid symbols and leverage', () => {
    expect(botConfigSchema.safeParse({ primarySymbol: 'BTCUSDT' }).success).toBe(false);
    expect(botConfigSchema.safeParse({ leverage: 0 }).success).toBe(false);
    expect(botConfigSchema.safeParse({ leverage: 126 }).success).toBe(false);
  });
});

describe('envBooleanSchema', () => {
  it('parses common environment boolean forms', () => {
    expect(envBooleanSchema.parse('true')).toBe(true);
    expect(envBooleanSchema.parse('1')).toBe(true);
    expect(envBooleanSchema.parse('false')).toBe(false);
    expect(envBooleanSchema.parse('0')).toBe(false);
    expect(envBooleanSchema.parse(true)).toBe(true);
  });
});

describe('live confirmation', () => {
  it('is explicit and in Portuguese', () => {
    expect(LIVE_CONFIRMATION_PHRASE).toBe('CONFIRMO TRADING REAL');
  });
});
