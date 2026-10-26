import type { Trade } from '@goodz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, type Harness } from './harness';
import { testConfig } from './helpers';

const now = Date.now();

function sampleTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trd_test_1',
    mode: 'paper',
    symbol: 'BTC_USDT',
    side: 'long',
    status: 'closed',
    qty: 10,
    contractSize: 0.0001,
    entryPrice: 100_000,
    exitPrice: 100_050,
    notionalUsd: 100,
    marginUsd: 10,
    leverage: 10,
    fees: 0.08,
    grossPnl: 0.5,
    netPnl: 0.42,
    rMultiple: 1.2,
    riskUsd: 0.35,
    openReason: 'unit test',
    closeReason: 'take_profit',
    openedAt: now - 30_000,
    closedAt: now,
    createdAt: now - 30_000,
    updatedAt: now,
    isDemo: false,
    meta: {},
    ...overrides,
  };
}

describe('API', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('exposes health and default status', async () => {
    const health = await harness.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ ok: true, name: 'Goodz Trader', bot: 'stopped' });

    const status = await harness.app.inject({ method: 'GET', url: '/api/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ status: 'stopped', mode: 'paper', symbol: 'BTC_USDT' });
  });

  it('returns settings with safe defaults and no secrets', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/settings' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.config).toMatchObject({ mode: 'paper', leverage: 10 });
    expect(body.secrets).toMatchObject({
      hasApiKey: false,
      credentialSource: 'none',
      hasTelegramToken: false,
    });
    expect(body.confirmationPhrase).toBe('CONFIRMO TRADING REAL');
  });

  it('validates and persists settings', async () => {
    const config = testConfig({ daily: { profitTargetUsd: 80, lossLimitUsd: 40 } });
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { config, secrets: {} },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().config.daily.profitTargetUsd).toBe(80);

    const stored = harness.settings.config();
    expect(stored.daily.lossLimitUsd).toBe(40);
  });

  it('rejects invalid settings', async () => {
    const config = testConfig();
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        config: { ...config, strategy: { ...config.strategy, takeProfitBps: 2 } },
        secrets: {},
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('validation_error');
  });

  it('encrypts and masks API credentials', async () => {
    const config = testConfig();
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        config,
        secrets: { apiKey: 'mx-api-key-123456', apiSecret: 'mx-secret-123456' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.secrets.hasApiKey).toBe(true);
    expect(body.secrets.apiKeyMasked).not.toContain('mx-secret');

    const raw = JSON.stringify(body);
    expect(raw).not.toContain('mx-secret-123456');

    const dbRow = harness.repo.getConfig();
    expect(dbRow?.secrets).not.toContain('mx-secret-123456');
    const credentials = harness.settings.credentials();
    expect(credentials.source).toBe('settings');
    expect(credentials.apiSecret).toBe('mx-secret-123456');
  });

  it('starts and stops the paper engine', async () => {
    const start = await harness.app.inject({
      method: 'POST',
      url: '/api/bot/start',
      payload: {},
    });
    expect(start.statusCode).toBe(202);
    expect(start.json().status).toBe('running');

    const status = await harness.app.inject({ method: 'GET', url: '/api/status' });
    expect(status.json().status).toBe('running');

    const blocked = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { config: testConfig(), secrets: {} },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe('bot_running');

    const stop = await harness.app.inject({
      method: 'POST',
      url: '/api/bot/stop',
      payload: { closePosition: true },
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().status).toBe('stopped');
  });

  it('blocks live start when the server flag is off', async () => {
    const config = testConfig({ mode: 'live' });
    const saved = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { config, secrets: {} },
    });
    expect(saved.statusCode).toBe(200);

    const start = await harness.app.inject({
      method: 'POST',
      url: '/api/bot/start',
      payload: { confirmation: 'CONFIRMO TRADING REAL' },
    });
    expect(start.statusCode).toBe(409);
    expect(start.json().error).toBe('live_disabled');
  });

  it('refuses to close a position when flat', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/bot/close-position',
      payload: {},
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('no_position');
  });

  it('lists trades, details, CSV and audit entries', async () => {
    harness.repo.insertTrade(sampleTrade());

    const list = await harness.app.inject({ method: 'GET', url: '/api/trades?limit=10' });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(1);
    expect(list.json().items[0].id).toBe('trd_test_1');

    const detail = await harness.app.inject({ method: 'GET', url: '/api/trades/trd_test_1' });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().trade.netPnl).toBe(0.42);

    const csv = await harness.app.inject({ method: 'GET', url: '/api/trades/export.csv' });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('trd_test_1');

    const audit = await harness.app.inject({ method: 'GET', url: '/api/settings/audit' });
    expect(audit.statusCode).toBe(200);

    const logs = await harness.app.inject({ method: 'GET', url: '/api/logs' });
    expect(logs.statusCode).toBe(200);
  });

  it('returns market data, synthetic candles and contract metadata', async () => {
    const snapshot = await harness.app.inject({ method: 'GET', url: '/api/market/snapshot' });
    expect(snapshot.statusCode).toBe(200);

    const candles = await harness.app.inject({
      method: 'GET',
      url: '/api/market/candles?symbol=BTC_USDT&interval=Min1&limit=50',
    });
    expect(candles.statusCode).toBe(200);
    expect(candles.json().source).toBe('synthetic');
    expect(candles.json().candles).toHaveLength(50);

    const contract = await harness.app.inject({
      method: 'GET',
      url: '/api/market/contract/BTC_USDT',
    });
    expect(contract.statusCode).toBe(200);
    expect(contract.json().contract.maxLeverage).toBe(125);
  });

  it('handles the kill switch', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/settings/kill-switch',
      payload: { enabled: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().config.execution.killSwitch).toBe(true);

    const start = await harness.app.inject({
      method: 'POST',
      url: '/api/bot/start',
      payload: {},
    });
    expect(start.statusCode).toBe(409);
    expect(start.json().error).toBe('kill_switch_active');
  });
});

describe('auth', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness({ password: 'correct-horse-battery' });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('protects API routes and accepts a valid session cookie', async () => {
    const unauth = await harness.app.inject({ method: 'GET', url: '/api/status' });
    expect(unauth.statusCode).toBe(401);

    const badLogin = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong-password' },
    });
    expect(badLogin.statusCode).toBe(401);

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'correct-horse-battery' },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = String(login.headers['set-cookie']);
    const token = setCookie.split(';')[0]?.split('=')[1];
    expect(token).toBeTruthy();

    const authorized = await harness.app.inject({
      method: 'GET',
      url: '/api/status',
      cookies: { goodz_session: token as string },
    });
    expect(authorized.statusCode).toBe(200);
  });

  it('leaves auth endpoints public', async () => {
    const me = await harness.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ required: true, authenticated: false });
  });
});
