import { describe, expect, it } from 'vitest';

import { loadEnv, resetEnvForTests } from '../src/env';

const secret = 'x'.repeat(40);

describe('loadEnv', () => {
  it('parses explicit configuration', () => {
    resetEnvForTests();
    const env = loadEnv({
      NODE_ENV: 'test',
      APP_SECRET: secret,
      DATABASE_PATH: ':memory:',
      PORT: '4100',
      LIVE_TRADING_ENABLED: 'true',
      SEED_DEMO: 'false',
      COOKIE_SECURE: '1',
      TRUST_PROXY: '0',
    });
    expect(env).toMatchObject({
      NODE_ENV: 'test',
      PORT: 4100,
      DATABASE_PATH: ':memory:',
      LIVE_TRADING_ENABLED: true,
      SEED_DEMO: false,
      COOKIE_SECURE: true,
      TRUST_PROXY: false,
    });
  });

  it('requires a secret in production', () => {
    resetEnvForTests();
    expect(() =>
      loadEnv({ NODE_ENV: 'production', DATABASE_PATH: ':memory:' } as NodeJS.ProcessEnv),
    ).toThrow('APP_SECRET');
  });

  it('defaults demo seeding in development and requires auth only when a password exists', () => {
    resetEnvForTests();
    const env = loadEnv({
      NODE_ENV: 'development',
      APP_SECRET: secret,
      DATABASE_PATH: ':memory:',
    } as NodeJS.ProcessEnv);
    expect(env.SEED_DEMO).toBe(true);
    expect(env.authRequired).toBe(false);

    resetEnvForTests();
    const secured = loadEnv({
      NODE_ENV: 'development',
      APP_SECRET: secret,
      AUTH_PASSWORD: 'password-123',
      DATABASE_PATH: ':memory:',
    } as NodeJS.ProcessEnv);
    expect(secured.authRequired).toBe(true);
  });
});
