import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { APP_NAME } from '@goodz/core';
import { MexcApiError } from '@goodz/mexc';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { ZodError } from 'zod';

import type { TradingEngine } from './bot/engine';
import type { Repository } from './db/repo';
import type { Env } from './env';
import { HttpError } from './lib/http-error';
import type { AppLogger } from './lib/logger';
import type { SessionService } from './services/auth';
import { SESSION_COOKIE } from './services/auth';
import type { EventBus, OutboundEvent } from './services/events';
import type { MarketDataService } from './services/market-data';
import type { MetricsRegistry } from './services/metrics';
import type { NotificationService } from './services/notifier';
import type { SettingsService } from './services/settings';
import { registerAuthRoutes } from './routes/auth';
import { registerBotRoutes } from './routes/bot';
import { registerLogRoutes } from './routes/logs';
import { registerSettingsRoutes } from './routes/settings';
import { registerStatusRoutes } from './routes/status';
import { registerTradeRoutes } from './routes/trades';

export interface AppDependencies {
  env: Env;
  repo: Repository;
  settings: SettingsService;
  session: SessionService;
  engine: TradingEngine;
  market: MarketDataService;
  events: EventBus;
  notifier: NotificationService;
  metrics: MetricsRegistry;
  logger: AppLogger;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: deps.env.TRUST_PROXY,
    bodyLimit: 1_048_576,
    genReqId: () => `req_${Math.random().toString(36).slice(2, 12)}`,
  });

  await app.register(cookie);
  if (deps.env.APP_ORIGIN) {
    await app.register(cors, {
      origin: [deps.env.APP_ORIGIN],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });
  }
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    allowList: (request) => request.url.startsWith('/api/health'),
  });
  await app.register(websocket);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.raw.url ?? '';
    if (!url.startsWith('/api') && !url.startsWith('/ws')) return;
    if (url.startsWith('/api/health') || url.startsWith('/api/auth/')) return;
    if (url.startsWith('/ws')) return; // checked before subscribing
    if (!deps.session.required) return;

    const token = request.cookies[SESSION_COOKIE];
    if (!deps.session.verify(token)) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Faça login no dashboard para continuar.',
      });
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url ?? 'unmatched';
    if (route !== '/metrics') {
      deps.metrics.observeHttp(request.method, route, reply.statusCode, reply.elapsedTime);
    }
    if (request.url.startsWith('/api/health')) return;
    if (reply.elapsedTime > 1_000 || reply.statusCode >= 500) {
      deps.logger.warn('Requisição lenta ou com erro', {
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        elapsedMs: Math.round(reply.elapsedTime),
      });
    }
  });

  registerAuthRoutes(app, { session: deps.session });
  registerStatusRoutes(app, {
    repo: deps.repo,
    settings: deps.settings,
    engine: deps.engine,
    market: deps.market,
    events: deps.events,
    metrics: deps.metrics,
    nodeEnv: deps.env.NODE_ENV,
    metricsEnabled: deps.env.METRICS_ENABLED,
    metricsToken: deps.env.METRICS_TOKEN,
  });
  registerSettingsRoutes(app, {
    repo: deps.repo,
    settings: deps.settings,
    session: deps.session,
    engine: deps.engine,
    market: deps.market,
    events: deps.events,
    notifier: deps.notifier,
  });
  registerBotRoutes(app, { engine: deps.engine, settings: deps.settings });
  registerTradeRoutes(app, { repo: deps.repo });
  registerLogRoutes(app, { repo: deps.repo });

  registerWebSocket(app, deps);

  const webDist = deps.env.WEB_DIST_PATH;
  const hasWeb = Boolean(webDist && existsSync(join(webDist, 'index.html')));
  if (webDist && hasWeb) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      wildcard: true,
      index: ['index.html'],
      maxAge: deps.env.NODE_ENV === 'production' ? '1h' : 0,
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
      return reply.code(404).send({ error: 'not_found', message: 'Rota não encontrada.' });
    }
    if (webDist && hasWeb) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found', message: 'Dashboard não compilado.' });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Dados inválidos.',
        details: error.issues,
      });
    }
    if (error instanceof MexcApiError) {
      return reply.code(502).send({
        error: 'mexc_error',
        code: error.code,
        message: error.friendly,
      });
    }
    if (error.validation) {
      return reply.code(400).send({
        error: 'validation_error',
        message: error.message,
      });
    }

    deps.logger.error('Erro não tratado', {
      error: error.message,
      stack: deps.env.NODE_ENV === 'production' ? undefined : error.stack,
      method: request.method,
      url: request.url,
      requestId: request.id,
    });
    return reply.code(500).send({
      error: 'internal_error',
      message: 'Erro interno. Consulte os logs do servidor.',
      requestId: request.id,
    });
  });

  deps.logger.info(`${APP_NAME} API pronta`, {
    environment: deps.env.NODE_ENV,
    authRequired: deps.session.required,
    liveTradingEnabled: deps.settings.public().liveTradingEnabled,
    web: hasWeb,
  });

  return app;
}

function registerWebSocket(app: FastifyInstance, deps: AppDependencies): void {
  app.get('/ws', { websocket: true }, (socket, request) => {
    if (deps.session.required) {
      const token = request.cookies[SESSION_COOKIE];
      if (!deps.session.verify(token)) {
        socket.close(1008, 'unauthorized');
        return;
      }
    }

    const send = (event: OutboundEvent) => {
      if (socket.readyState !== 1) return;
      if (event.type === 'market' && socket.bufferedAmount > 2_000_000) return;
      socket.send(JSON.stringify(event));
    };

    send({ type: 'status', data: deps.engine.getStatus(), ts: Date.now() });
    send({ type: 'market', data: deps.market.getView(), ts: Date.now() });

    const unsubscribe = deps.events.subscribe(send);
    const heartbeat = setInterval(() => {
      if (socket.readyState === 1) {
        socket.send(
          JSON.stringify({ type: 'heartbeat', data: { ts: Date.now() }, ts: Date.now() }),
        );
      }
    }, 20_000);

    socket.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    socket.on('error', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
