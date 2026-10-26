import type { Trade } from '@goodz/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, openDatabase, type Db } from '../src/db/database';
import { Repository } from '../src/db/repo';
import { EventBus } from '../src/services/events';
import { MarketDataService } from '../src/services/market-data';
import { NotificationService } from '../src/services/notifier';
import { seedDemoData } from '../src/services/demo';
import { fakeClient, testConfig, testLogger } from './helpers';

let db: Db;
let repo: Repository;
let events: EventBus;

beforeEach(() => {
  db = openDatabase(':memory:');
  repo = new Repository(db);
  events = new EventBus();
});

afterEach(() => {
  closeDatabase(db);
});

const trade = (): Trade => ({
  id: 'trd_demo',
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
  openReason: 'test',
  closeReason: 'take_profit',
  openedAt: Date.now() - 10_000,
  closedAt: Date.now(),
  createdAt: Date.now() - 10_000,
  updatedAt: Date.now(),
  isDemo: true,
  meta: {},
});

describe('demo seeder', () => {
  it('seeds deterministic paper history once', () => {
    const config = testConfig();
    const inserted = seedDemoData(repo, config, Date.now());
    expect(inserted).toBeGreaterThan(100);
    expect(repo.countTrades()).toBe(inserted);
    expect(repo.countDemoTrades()).toBe(inserted);
    expect(repo.listEquity(0).length).toBeGreaterThan(100);
    expect(seedDemoData(repo, config, Date.now())).toBe(0);
  });
});

describe('market data service', () => {
  it('produces synthetic snapshots and can switch symbols', async () => {
    const service = new MarketDataService({
      symbol: 'BTC_USDT',
      feed: 'synthetic',
      client: fakeClient(),
      wsUrl: 'wss://example.invalid',
      eventBus: events,
      logger: testLogger,
      intervalMs: 40,
      seed: 7,
    });
    const received: string[] = [];
    const unsubscribe = events.subscribe((event) => {
      if (event.type === 'market') received.push(event.data.snapshot?.symbol ?? 'none');
    });

    service.start();
    await new Promise((resolve) => setTimeout(resolve, 180));
    const view = service.getView();
    expect(view.snapshot?.symbol).toBe('BTC_USDT');
    expect(view.bids.length).toBeGreaterThan(0);
    expect(view.asks.length).toBeGreaterThan(0);
    expect(view.connected).toBe(true);
    expect(received.length).toBeGreaterThan(0);

    service.switchTo('synthetic', 'ETH_USDT', 9);
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(service.getView().snapshot?.symbol).toBe('ETH_USDT');
    service.stop();
    expect(service.getView().connected).toBe(false);
    unsubscribe();
  });
});

describe('notification service', () => {
  it('sends telegram and webhook notifications', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 200 }),
    ) as unknown as typeof fetch;
    const config = testConfig({
      notifications: {
        telegramEnabled: true,
        telegramChatId: '123',
        webhookUrl: 'https://example.com/hook',
        notifyOnTrade: true,
        notifyOnHalt: true,
      },
    });
    const service = new NotificationService(
      () => config,
      () => 'telegram-token',
      testLogger,
      fetchImpl,
    );
    service.notifyTrade(trade());
    service.notifyHalt('daily_stop', 'limite atingido');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not send when notifications are disabled', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
    const service = new NotificationService(
      () => testConfig(),
      () => '',
      testLogger,
      fetchImpl,
    );
    service.notifyTrade(trade());
    service.notifyHalt('manual', 'teste');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('repository', () => {
  it('persists orders, equity, logs, daily stats and audit', () => {
    repo.insertTrade(trade());
    expect(repo.listTrades({ limit: 10, offset: 0 }).total).toBe(1);
    expect(repo.getRealizedPnl('paper')).toBe(0.42);
    expect(repo.getClosedTradesSince(0, 'paper')).toHaveLength(1);
    expect(repo.getClosedTrades(10, 'live')).toHaveLength(0);

    const stored = repo.getTrade('trd_demo');
    expect(stored?.netPnl).toBe(0.42);
    if (stored) {
      stored.netPnl = 0.5;
      stored.updatedAt = Date.now();
      repo.updateTrade(stored);
      expect(repo.getTrade('trd_demo')?.netPnl).toBe(0.5);
    }

    repo.insertOrder({
      id: 'ord_1',
      tradeId: 'trd_demo',
      exchangeOrderId: 'ex_1',
      clientOrderId: 'gz_1',
      symbol: 'BTC_USDT',
      side: 'long',
      action: 'open',
      type: 'market',
      price: null,
      qty: 10,
      filledQty: 10,
      avgPrice: 100_000,
      fee: 0.06,
      status: 'filled',
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(repo.getOrdersByTrade('trd_demo')).toHaveLength(1);
    expect(repo.getOrderByClientId('gz_1')?.status).toBe('filled');
    repo.insertEquity({ ts: Date.now(), equity: 1_000, balance: 1_000, unrealized: 0, dayPnl: 0 });
    expect(repo.latestEquity()?.equity).toBe(1_000);
    expect(repo.listEquity(0)).toHaveLength(1);
    repo.insertLog('info', 'test', 'mensagem', { ok: true });
    expect(repo.listLogs({ limit: 10 })).toHaveLength(1);
    repo.insertAudit({ ts: Date.now(), actor: 'test', action: 'test', detail: 'ok', ip: null });
    expect(repo.listAudit(10)).toHaveLength(1);
    repo.upsertDailyStats({
      dayKey: '2026-10-26',
      startEquity: 1_000,
      endEquity: 1_100,
      realizedPnl: 100,
      fees: 1,
      trades: 10,
      wins: 6,
      losses: 4,
      targetHit: false,
      stopHit: false,
      maxDrawdownPct: 2,
      updatedAt: Date.now(),
    });
    expect(repo.getDailyStats('2026-10-26')?.realizedPnl).toBe(100);
  });
});
