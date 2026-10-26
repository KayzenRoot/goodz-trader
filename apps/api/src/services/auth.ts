import { randomBytes } from 'node:crypto';

import { constantTimeEqual, signSession, verifySession, type SessionPayload } from '../lib/crypto';
import type { Repository } from '../db/repo';
import type { AppLogger } from '../lib/logger';

export interface SessionOptions {
  password?: string;
  secret: string;
  secureCookie: boolean;
  ttlMs?: number;
  repo: Repository;
  logger: AppLogger;
}

export const SESSION_COOKIE = 'goodz_session';

export class SessionService {
  private readonly ttlMs: number;

  constructor(private readonly options: SessionOptions) {
    this.ttlMs = options.ttlMs ?? 12 * 60 * 60 * 1_000;
  }

  get required(): boolean {
    return Boolean(this.options.password);
  }

  login(password: string, ip: string | null): string {
    if (!this.options.password) {
      return this.issue();
    }
    if (!constantTimeEqual(password, this.options.password)) {
      this.options.repo.insertAudit({
        ts: Date.now(),
        actor: 'dashboard',
        action: 'auth.login_failed',
        detail: 'Senha inválida',
        ip,
      });
      return '';
    }
    this.options.repo.insertAudit({
      ts: Date.now(),
      actor: 'dashboard',
      action: 'auth.login',
      detail: 'Login realizado',
      ip,
    });
    this.options.logger.info('Login no dashboard', { ip });
    return this.issue();
  }

  issue(): string {
    const payload: SessionPayload = {
      exp: Date.now() + this.ttlMs,
      nonce: randomBytes(12).toString('hex'),
    };
    return signSession(payload, this.options.secret);
  }

  verify(token: string | undefined): SessionPayload | null {
    return verifySession(token, this.options.secret);
  }

  cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: this.options.secureCookie,
      path: '/',
      maxAge: Math.floor(this.ttlMs / 1_000),
    };
  }
}
