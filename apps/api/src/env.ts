import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { envBooleanSchema } from '@goodz/core';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_PATH: z.string().default('./.data/goodz.db'),
  APP_SECRET: z.string().min(32).optional(),
  AUTH_PASSWORD: z.string().min(8).optional(),
  APP_ORIGIN: z.string().url().optional(),
  WEB_DIST_PATH: z.string().optional(),
  MEXC_BASE_URL: z.string().url().default('https://contract.mexc.com'),
  MEXC_WS_URL: z.string().url().default('wss://contract.mexc.com/edge'),
  MEXC_API_KEY: z.string().optional(),
  MEXC_API_SECRET: z.string().optional(),
  LIVE_TRADING_ENABLED: envBooleanSchema.default(false),
  SEED_DEMO: envBooleanSchema.optional(),
  COOKIE_SECURE: envBooleanSchema.default(false),
  TRUST_PROXY: envBooleanSchema.default(false),
});

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  HOST: string;
  PORT: number;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  DATABASE_PATH: string;
  APP_SECRET: string;
  AUTH_PASSWORD?: string;
  APP_ORIGIN?: string;
  WEB_DIST_PATH?: string;
  MEXC_BASE_URL: string;
  MEXC_WS_URL: string;
  MEXC_API_KEY?: string;
  MEXC_API_SECRET?: string;
  LIVE_TRADING_ENABLED: boolean;
  SEED_DEMO: boolean;
  COOKIE_SECURE: boolean;
  TRUST_PROXY: boolean;
  authRequired: boolean;
}

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;

  const parsed = envSchema.parse(source);
  const appSecret = parsed.APP_SECRET ?? readOrCreateDevSecret(parsed.NODE_ENV);
  const seedDemo = parsed.SEED_DEMO ?? parsed.NODE_ENV !== 'production';

  const env = {
    ...parsed,
    APP_SECRET: appSecret,
    SEED_DEMO: seedDemo,
    APP_ORIGIN:
      parsed.APP_ORIGIN ?? (parsed.NODE_ENV === 'production' ? undefined : 'http://localhost:5173'),
    DATABASE_PATH: parsed.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(parsed.DATABASE_PATH),
    WEB_DIST_PATH: parsed.WEB_DIST_PATH ? resolve(parsed.WEB_DIST_PATH) : undefined,
    authRequired: Boolean(parsed.AUTH_PASSWORD),
  };

  if (source === process.env) cached = env;
  return env;
}

function readOrCreateDevSecret(nodeEnv: 'development' | 'test' | 'production'): string {
  if (nodeEnv === 'production') {
    throw new Error(
      "APP_SECRET é obrigatório em produção. Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  const file = resolve('./.data/dev-secret');
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // File does not exist yet; create it below with an atomic exclusive write.
  }

  mkdirSync(dirname(file), { recursive: true });
  const value = randomBytes(32).toString('hex');
  try {
    writeFileSync(file, value, { mode: 0o600, flag: 'wx' });
    return value;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      const existing = readFileSync(file, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    throw error;
  }
}

export function resetEnvForTests(): void {
  cached = null;
}
