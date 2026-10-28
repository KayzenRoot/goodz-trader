import pino, { type Logger } from 'pino';

import type { AppLogLevel } from '../db/repo';

export function createLogger(nodeEnv: string, level: string): Logger {
  const pretty =
    nodeEnv !== 'production' && nodeEnv !== 'test'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', singleLine: true },
        }
      : undefined;

  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'apiKey',
        'apiSecret',
        'password',
        'token',
        '*.apiKey',
        '*.apiSecret',
        '*.password',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
    ...(pretty ? { transport: pretty } : {}),
  });
}

export interface AppLogger {
  child(category: string): AppLogger;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

type Persist = (
  level: AppLogLevel,
  category: string,
  message: string,
  data: Record<string, unknown> | null,
) => number | void;

/**
 * Writes structured logs to stdout and to SQLite for the dashboard log view.
 * The persisted sink is optional so libraries can be tested without a DB.
 */
export class DbLogger implements AppLogger {
  constructor(
    private readonly logger: Logger,
    private readonly persist?: Persist,
    private readonly category = 'app',
  ) {}

  child(category: string): DbLogger {
    return new DbLogger(this.logger, this.persist, category);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug({ category: this.category, ...data }, message);
    this.safePersist('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info({ category: this.category, ...data }, message);
    this.safePersist('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn({ category: this.category, ...data }, message);
    this.safePersist('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.logger.error({ category: this.category, ...data }, message);
    this.safePersist('error', message, data);
  }

  /**
   * Persistence must never crash the process. During shutdown the SQLite
   * connection may already be closed while pending rejections/timers log.
   */
  private safePersist(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ): void {
    try {
      this.persist?.(level, this.category, message, data ?? null);
    } catch {
      // stdout already has the record; drop the SQLite projection.
    }
  }
}
