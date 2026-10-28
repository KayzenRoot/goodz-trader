import { TradingEngine } from './bot/engine';
import { buildApp } from './app';
import { openDatabase, closeDatabase } from './db/database';
import { Repository } from './db/repo';
import { loadEnv } from './env';
import { createLogger, DbLogger } from './lib/logger';
import { SessionService } from './services/auth';
import { seedDemoData } from './services/demo';
import { EventBus } from './services/events';
import { MarketDataService } from './services/market-data';
import { NotificationService } from './services/notifier';
import { SettingsService } from './services/settings';

const env = loadEnv();
const pino = createLogger(env.NODE_ENV, env.LOG_LEVEL);
const db = openDatabase(env.DATABASE_PATH);
const repo = new Repository(db);
const events = new EventBus();
const logger = new DbLogger(
  pino,
  (level, category, message, data) => {
    const id = repo.insertLog(level, category, message, data ?? null);
    events.publish('log', {
      id,
      ts: Date.now(),
      level,
      category,
      message,
      data: data ?? null,
    });
    return id;
  },
  'app',
);

const settings = new SettingsService({
  repo,
  secret: env.APP_SECRET,
  liveTradingEnabled: env.LIVE_TRADING_ENABLED,
  authRequired: env.authRequired,
  mexcBaseUrl: env.MEXC_BASE_URL,
  envApiKey: env.MEXC_API_KEY,
  envApiSecret: env.MEXC_API_SECRET,
  logger: logger.child('settings'),
});

const config = settings.ensureDefaults();
if (env.SEED_DEMO) {
  const inserted = seedDemoData(repo, config);
  if (inserted > 0) {
    logger.info('Dados demo semeados para o dashboard', { trades: inserted });
  }
}

const session = new SessionService({
  password: env.AUTH_PASSWORD,
  secret: env.APP_SECRET,
  secureCookie: env.COOKIE_SECURE,
  repo,
  logger: logger.child('auth'),
});

const market = new MarketDataService({
  symbol: config.primarySymbol,
  feed: config.mode === 'live' ? 'mexc' : config.paper.feed,
  client: settings.createClient({ apiKey: '', apiSecret: '', source: 'none' }),
  wsUrl: env.MEXC_WS_URL,
  eventBus: events,
  logger: logger.child('market'),
  seed: config.paper.seed,
});

const notifier = new NotificationService(
  () => settings.config(),
  () => settings.telegramToken(),
  logger.child('notifier'),
);

const engine = new TradingEngine({
  repo,
  settings,
  market,
  events,
  logger: logger.child('engine'),
  notifier,
  wsUrl: env.MEXC_WS_URL,
});

engine.bootstrap();
market.start();

const app = await buildApp({
  env,
  repo,
  settings,
  session,
  engine,
  market,
  events,
  notifier,
  logger,
});

await app.listen({ host: env.HOST, port: env.PORT });
logger.info('Servidor iniciado', {
  url: `http://${env.HOST}:${env.PORT}`,
  authRequired: env.authRequired,
  liveTradingEnabled: env.LIVE_TRADING_ENABLED,
  seedDemo: env.SEED_DEMO,
  database: env.DATABASE_PATH,
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn('Encerrando servidor', { signal });
  const status = engine.getStatus();
  if (status.mode === 'live' && status.position) {
    logger.error(
      'POSIÇÃO REAL ABERTA durante shutdown. O processo não fecha posições automaticamente; verifique a MEXC.',
      { tradeId: status.position.id },
    );
  }
  try {
    await engine.stop(false);
  } catch (error) {
    logger.error('Falha ao parar o bot no shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  market.stop();
  await app.close();
  closeDatabase(db);
  logger.info('Servidor encerrado');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});
