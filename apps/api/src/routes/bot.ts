import { startBotSchema, stopBotSchema } from '@goodz/core';
import type { FastifyInstance } from 'fastify';

import type { SettingsService } from '../services/settings';
import type { TradingEngine } from '../bot/engine';
import { parseInput } from './helpers';

interface BotRoutesDeps {
  engine: TradingEngine;
  settings: SettingsService;
}

export function registerBotRoutes(app: FastifyInstance, deps: BotRoutesDeps): void {
  app.post(
    '/api/bot/start',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = parseInput(startBotSchema, request.body ?? {});
      const status = await deps.engine.start(input.confirmation ?? '');
      return reply.code(202).send(status);
    },
  );

  app.post(
    '/api/bot/stop',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const input = parseInput(stopBotSchema, request.body ?? {});
      return deps.engine.stop(input.closePosition);
    },
  );

  app.post(
    '/api/bot/close-position',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async () => deps.engine.closePositionManually(),
  );

  app.post(
    '/api/bot/kill',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      deps.settings.setKillSwitch(true, { actor: 'dashboard', ip: request.ip });
      return deps.engine.emergencyStop();
    },
  );

  app.get('/api/bot/status', async () => deps.engine.getStatus());
}
