import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Db } from '../src/db/database';
import { Repository } from '../src/db/repo';
import { SettingsService, type SettingsServiceOptions } from '../src/services/settings';
import { fakeClient, testConfig, testLogger } from './helpers';

let db: Db;
let repo: Repository;

function service(options: Partial<Omit<SettingsServiceOptions, 'repo'>> = {}) {
  return new SettingsService({
    repo,
    secret: 'test-secret-0123456789-0123456789-0123456789',
    liveTradingEnabled: false,
    authRequired: false,
    mexcBaseUrl: 'https://contract.mexc.com',
    logger: testLogger,
    clientFactory: () => fakeClient(),
    ...options,
  });
}

beforeEach(() => {
  db = openDatabase(':memory:');
  repo = new Repository(db);
});

afterEach(() => {
  closeDatabase(db);
});

describe('SettingsService', () => {
  it('seeds and returns safe defaults', () => {
    const settings = service();
    const defaults = settings.ensureDefaults();
    expect(defaults.mode).toBe('paper');
    expect(settings.public().secrets.credentialSource).toBe('none');
    expect(settings.public().confirmationPhrase).toBe('CONFIRMO TRADING REAL');
  });

  it('saves encrypted credentials and masks them', () => {
    const settings = service();
    settings.ensureDefaults();
    settings.update(
      {
        config: testConfig(),
        secrets: { apiKey: 'mx-key-123456', apiSecret: 'mx-secret-123456' },
      },
      { actor: 'test', ip: '127.0.0.1' },
    );
    const publicSettings = settings.public();
    expect(publicSettings.secrets.hasApiKey).toBe(true);
    expect(publicSettings.secrets.apiKeyMasked).toContain('••••');
    expect(JSON.stringify(publicSettings)).not.toContain('mx-secret-123456');
    expect(settings.credentials()).toMatchObject({
      apiKey: 'mx-key-123456',
      source: 'settings',
    });
    expect(repo.listAudit(1)[0]?.action).toBe('settings.update');
  });

  it('requires key and secret together and can clear them', () => {
    const settings = service();
    settings.ensureDefaults();
    expect(() =>
      settings.update(
        { config: testConfig(), secrets: { apiKey: 'only-key' } },
        { actor: 'test', ip: null },
      ),
    ).toThrow('API key e API secret');

    settings.update(
      {
        config: testConfig(),
        secrets: { apiKey: 'mx-key-123456', apiSecret: 'mx-secret-123456' },
      },
      { actor: 'test', ip: null },
    );
    settings.update(
      { config: testConfig(), secrets: { clearApiCredentials: true } },
      { actor: 'test', ip: null },
    );
    expect(settings.credentials().source).toBe('none');
  });

  it('falls back to environment credentials', () => {
    const settings = service({ envApiKey: 'env-key', envApiSecret: 'env-secret' });
    settings.ensureDefaults();
    expect(settings.credentials()).toMatchObject({ source: 'env', apiKey: 'env-key' });
  });

  it('enforces the live gate and kill switch', () => {
    const disabled = service();
    disabled.ensureDefaults();
    expect(() => disabled.assertLiveUnlocked('CONFIRMO TRADING REAL')).toThrow('desativado');

    const enabled = service({ liveTradingEnabled: true });
    enabled.ensureDefaults();
    enabled.update(
      {
        config: testConfig({ mode: 'live' }),
        secrets: { apiKey: 'mx-key-123456', apiSecret: 'mx-secret-123456' },
      },
      { actor: 'test', ip: null },
    );
    expect(() => enabled.assertLiveUnlocked('errado')).toThrow('CONFIRMO TRADING REAL');
    expect(() => enabled.assertLiveUnlocked('CONFIRMO TRADING REAL')).not.toThrow();

    const killSwitch = enabled.setKillSwitch(true, { actor: 'test', ip: null });
    expect(killSwitch.config.execution.killSwitch).toBe(true);
    expect(() => enabled.assertLiveUnlocked('CONFIRMO TRADING REAL')).toThrow('kill switch');
    enabled.setKillSwitch(false, { actor: 'test', ip: null });
    expect(() => enabled.assertLiveUnlocked('CONFIRMO TRADING REAL')).not.toThrow();
  });

  it('tests the connection through the injected client', async () => {
    const settings = service();
    settings.ensureDefaults();
    await expect(
      settings.testConnection({ apiKey: 'mx-key-123456', apiSecret: 'mx-secret-123456' }),
    ).resolves.toMatchObject({ equity: 1_000 });
  });

  it('stores and clears a telegram token', () => {
    const settings = service();
    settings.ensureDefaults();
    settings.update(
      { config: testConfig(), secrets: { telegramBotToken: 'telegram-token-123' } },
      { actor: 'test', ip: null },
    );
    expect(settings.telegramToken()).toBe('telegram-token-123');
    expect(settings.public().secrets.hasTelegramToken).toBe(true);
    settings.update(
      { config: testConfig(), secrets: { clearTelegramToken: true } },
      { actor: 'test', ip: null },
    );
    expect(settings.telegramToken()).toBe('');
  });
});
