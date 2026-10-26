import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Repository } from '../db/repo';
import { parseInput } from './helpers';

interface LogRoutesDeps {
  repo: Repository;
}

export function registerLogRoutes(app: FastifyInstance, deps: LogRoutesDeps): void {
  app.get('/api/logs', async (request) => {
    const query = parseInput(
      z.object({
        limit: z.coerce.number().int().min(1).max(500).default(100),
        level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
        category: z.string().trim().min(1).max(64).optional(),
      }),
      request.query,
    );
    return { items: deps.repo.listLogs(query) };
  });

  app.get('/api/audit', async (request) => {
    const query = parseInput(
      z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
      request.query,
    );
    return { items: deps.repo.listAudit(query.limit) };
  });
}
