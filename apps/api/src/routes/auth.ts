import { loginSchema } from '@goodz/core';
import type { FastifyInstance } from 'fastify';

import { SESSION_COOKIE, type SessionService } from '../services/auth';
import { parseInput } from './helpers';

interface AuthRoutesDeps {
  session: SessionService;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  app.get('/api/auth/me', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    const authenticated = !deps.session.required || Boolean(deps.session.verify(token));
    return { required: deps.session.required, authenticated };
  });

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = parseInput(loginSchema, request.body);
      const token = deps.session.login(input.password, request.ip);
      if (!token) {
        return reply.code(401).send({ error: 'invalid_password', message: 'Senha inválida.' });
      }
      reply.setCookie(SESSION_COOKIE, token, deps.session.cookieOptions());
      return { ok: true };
    },
  );

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
