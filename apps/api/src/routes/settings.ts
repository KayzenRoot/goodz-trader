import {
  secretInputSchema,
  settingsUpdateSchema,
  symbolSchema,
  type SettingsResponse,
} from '@goodz/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Repository } from '../db/repo';
import type { SessionService } from '../services/auth';
import type { EventBus } from '../services/events';
import type { MarketDataService } from '../services/market-data';
import type { NotificationService } from '../services/notifier';
import type { SettingsService } from '../services/settings';
import type { TradingEngine } from '../bot/engine';
import { parseInput } from './helpers';

interface SettingsRoutesDeps {
  repo: Repository;
  settings: SettingsService;
  session: SessionService;
  engine: TradingEngine;
  market: MarketDataService;
  events: EventBus;
  notifier: NotificationService;
}

const testConnectionSchema = z.object({
  apiKey: z.string().trim().min(8).max(128).optional(),
  apiSecret: z.string().trim().min(8).max(256).optional(),
});

export function registerSettingsRoutes(app: FastifyInstance, deps: SettingsRoutesDeps): void {
  app.get('/api/settings', async () => deps.settings.public());

  app.put('/api/settings', async (request, reply) => {
    const input = parseInput(settingsUpdateSchema, request.body);
    const status = deps.engine.getStatus().status;
    if (status === 'running' || status === 'starting' || status === 'stopping') {
      return reply.code(409).send({
        error: 'bot_running',
        message: 'Pare o bot antes de alterar as configurações.',
      });
    }

    const previous = deps.settings.config();
    const result = deps.settings.update(input, {
      actor: 'dashboard',
      ip: request.ip,
    });
    deps.events.publish('config', result);

    if (
      previous.paper.feed !== result.config.paper.feed ||
      previous.primarySymbol !== result.config.primarySymbol ||
      previous.paper.seed !== result.config.paper.seed
    ) {
      deps.market.switchTo(
        result.config.mode === 'live' ? 'mexc' : result.config.paper.feed,
        result.config.primarySymbol,
        result.config.paper.seed,
      );
    }
    return result;
  });

  app.post(
    '/api/settings/test-connection',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const input = parseInput(testConnectionSchema, request.body ?? {});
      const result = await deps.settings.testConnection(input);
      return { ok: true, ...result };
    },
  );

  app.post(
    '/api/settings/test-notifications',
    {
      config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    },
    async () => deps.notifier.testConnection(),
  );

  app.post('/api/settings/kill-switch', async (request) => {
    const { enabled } = parseInput(z.object({ enabled: z.boolean() }), request.body);
    const result = deps.settings.setKillSwitch(enabled, { actor: 'dashboard', ip: request.ip });
    deps.events.publish('config', result);
    if (enabled) {
      await deps.engine.emergencyStop();
    }
    return result;
  });

  app.get('/api/settings/secrets/status', async (): Promise<SettingsResponse['secrets']> => {
    return deps.settings.public().secrets;
  });

  app.get('/api/settings/audit', async (request) => {
    const query = parseInput(
      z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
      request.query,
    );
    return { items: deps.repo.listAudit(query.limit) };
  });

  app.get('/api/settings/contract/:symbol', async (request) => {
    const { symbol } = parseInput(z.object({ symbol: symbolSchema }), request.params);
    const client = deps.settings.createClient();
    try {
      return { contract: await client.getContract(symbol), source: 'mexc' };
    } catch {
      return { contract: null, source: 'unavailable' };
    }
  });

  app.post('/api/settings/test-credentials', async (request) => {
    const input = parseInput(secretInputSchema, request.body ?? {});
    return deps.settings.testConnection({ apiKey: input.apiKey, apiSecret: input.apiSecret });
  });
}
