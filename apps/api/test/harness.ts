import { TradingEngine } from '../src/bot/engine';
import { buildApp } from '../src/app';
import { closeDatabase, openDatabase, type Db } from '../src/db/database';
import { Repository } from '../src/db/repo';
import type { Env } from '../src/env';
import { SessionService } from '../src/services/auth';
import { EventBus } from '../src/services/events';
import { MarketDataService } from '../src/services/market-data';
import { NotificationService } from '../src/services/notifier';
import { SettingsService } from '../src/services/settings';
import { fakeClient, testLogger } from './helpers';

export interface Harness {
  app: Awaited<ReturnType<typeof buildApp>>;
  db: Db;
  repo: Repository;
  settings: SettingsService;
  session: SessionService;
  engine: TradingEngine;
  market: MarketDataService;
  events: EventBus;
  close: () => Promise<void>;
}

export async function createHarness(options: { password?: string } = {}): Promise<Harness> {
  const db = openDatabase(':memory:');
  const repo = new Repository(db);
  const events = new EventBus();
  const client = fakeClient();
  const secret = 'test-secret-0123456789-0123456789-0123456789';
  const authRequired = Boolean(options.password);

  const env: Env = {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3001,
    LOG_LEVEL: 'silent',
    DATABASE_PATH: ':memory:',
    APP_SECRET: secret,
    AUTH_PASSWORD: options.password,
    MEXC_BASE_URL: 'https://contract.mexc.com',
    MEXC_WS_URL: 'wss://contract.mexc.com/edge',
    LIVE_TRADING_ENABLED: false,
    SEED_DEMO: false,
    COOKIE_SECURE: false,
    TRUST_PROXY: false,
    MAINTENANCE_ENABLED: false,
    RETENTION_LOGS_DAYS: 14,
    RETENTION_EQUITY_DAYS: 90,
    RETENTION_AUDIT_DAYS: 365,
    authRequired,
  };

  const settings = new SettingsService({
    repo,
    secret,
    liveTradingEnabled: false,
    authRequired,
    mexcBaseUrl: env.MEXC_BASE_URL,
    logger: testLogger,
    clientFactory: () => client,
  });
  settings.ensureDefaults();

  const session = new SessionService({
    password: options.password,
    secret,
    secureCookie: false,
    repo,
    logger: testLogger,
  });

  const market = new MarketDataService({
    symbol: 'BTC_USDT',
    feed: 'synthetic',
    client,
    wsUrl: env.MEXC_WS_URL,
    eventBus: events,
    logger: testLogger,
    intervalMs: 150,
    seed: 42,
  });

  const notifier = new NotificationService(
    () => settings.config(),
    () => '',
    testLogger,
    async () => new Response('{}', { status: 200 }),
  );

  const engine = new TradingEngine({
    repo,
    settings,
    market,
    events,
    logger: testLogger,
    notifier,
    clientFactory: () => client,
  });
  engine.bootstrap();

  const app = await buildApp({
    env,
    repo,
    settings,
    session,
    engine,
    market,
    events,
    notifier,
    logger: testLogger,
  });

  return {
    app,
    db,
    repo,
    settings,
    session,
    engine,
    market,
    events,
    close: async () => {
      await engine.stop(false);
      market.stop();
      await app.close();
      closeDatabase(db);
    },
  };
}
