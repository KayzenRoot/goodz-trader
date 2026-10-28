import {
  botConfigSchema,
  LIVE_CONFIRMATION_PHRASE,
  type BotConfig,
  type SettingsResponse,
  type SettingsUpdate,
} from '@goodz/core';
import { MexcFuturesClient, MexcApiError, type ConnectionTestResult } from '@goodz/mexc';

import type { Repository, StoredConfig } from '../db/repo';
import { decryptJson, encryptJson, maskSecret } from '../lib/crypto';
import { HttpError } from '../lib/http-error';
import type { AppLogger } from '../lib/logger';

export interface StoredSecrets {
  apiKey?: string;
  apiSecret?: string;
  telegramBotToken?: string;
}

export interface SettingsServiceOptions {
  repo: Repository;
  secret: string;
  liveTradingEnabled: boolean;
  authRequired: boolean;
  mexcBaseUrl: string;
  envApiKey?: string;
  envApiSecret?: string;
  logger: AppLogger;
  clientFactory?: (credentials: {
    apiKey: string;
    apiSecret: string;
    source: 'settings' | 'env' | 'none';
  }) => MexcFuturesClient;
}

export class SettingsService {
  constructor(private readonly options: SettingsServiceOptions) {}

  ensureDefaults(): BotConfig {
    const existing = this.options.repo.getConfig();
    if (existing) {
      const parsed = botConfigSchema.safeParse(existing.config);
      if (parsed.success) return parsed.data;
      this.options.logger.warn('Configuração salva inválida; usando defaults', {
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const defaults = botConfigSchema.parse({});
    this.options.repo.ensureConfig(defaults, '');
    return defaults;
  }

  config(): BotConfig {
    const stored = this.options.repo.getConfig();
    if (!stored) return botConfigSchema.parse({});
    const parsed = botConfigSchema.safeParse(stored.config);
    return parsed.success ? parsed.data : botConfigSchema.parse({});
  }

  storedSecrets(): StoredSecrets {
    const stored = this.options.repo.getConfig();
    if (!stored?.secrets) return {};
    const decrypted = decryptJson<StoredSecrets>(stored.secrets, this.options.secret);
    if (!decrypted) {
      this.options.logger.warn(
        'Não foi possível descriptografar as credenciais. Verifique APP_SECRET.',
      );
      return {};
    }
    return decrypted;
  }

  credentials(): { apiKey: string; apiSecret: string; source: 'settings' | 'env' | 'none' } {
    const stored = this.storedSecrets();
    if (stored.apiKey && stored.apiSecret) {
      return { apiKey: stored.apiKey, apiSecret: stored.apiSecret, source: 'settings' };
    }
    if (this.options.envApiKey && this.options.envApiSecret) {
      return {
        apiKey: this.options.envApiKey,
        apiSecret: this.options.envApiSecret,
        source: 'env',
      };
    }
    return { apiKey: '', apiSecret: '', source: 'none' };
  }

  public(): SettingsResponse {
    const stored = this.storedSecrets();
    const credentials = this.credentials();
    const updatedAt = this.options.repo.getConfig()?.updatedAt ?? null;
    return {
      config: this.config(),
      secrets: {
        hasApiKey: Boolean(credentials.apiKey),
        apiKeyMasked: maskSecret(credentials.apiKey),
        credentialSource: credentials.source,
        hasTelegramToken: Boolean(stored.telegramBotToken),
      },
      updatedAt,
      liveTradingEnabled: this.options.liveTradingEnabled,
      confirmationPhrase: LIVE_CONFIRMATION_PHRASE,
      authRequired: this.options.authRequired,
    };
  }

  update(input: SettingsUpdate, meta: { actor: string; ip: string | null }): SettingsResponse {
    const current = this.storedSecrets();
    const next: StoredSecrets = { ...current };
    const incoming = input.secrets;

    if (incoming.clearApiCredentials) {
      delete next.apiKey;
      delete next.apiSecret;
    }

    if (incoming.apiKey || incoming.apiSecret) {
      if (!incoming.apiKey || !incoming.apiSecret) {
        throw new HttpError(
          400,
          'incomplete_credentials',
          'Informe API key e API secret juntas para salvar credenciais.',
        );
      }
      next.apiKey = incoming.apiKey;
      next.apiSecret = incoming.apiSecret;
    }

    if (incoming.clearTelegramToken) delete next.telegramBotToken;
    if (incoming.telegramBotToken) next.telegramBotToken = incoming.telegramBotToken;

    const encrypted = Object.keys(next).length ? encryptJson(next, this.options.secret) : '';
    this.options.repo.saveConfig(input.config, encrypted);

    const previous = this.config();
    const changed = diffTopLevel(previous, input.config);
    this.options.repo.insertAudit({
      ts: Date.now(),
      actor: meta.actor,
      action: 'settings.update',
      detail: JSON.stringify({
        changed,
        credentials: incoming.apiKey
          ? 'rotated'
          : incoming.clearApiCredentials
            ? 'cleared'
            : 'unchanged',
      }),
      ip: meta.ip,
    });
    this.options.logger.info('Configurações atualizadas', { changed });

    return this.public();
  }

  setKillSwitch(enabled: boolean, meta: { actor: string; ip: string | null }): SettingsResponse {
    const config = this.config();
    const next: BotConfig = {
      ...config,
      execution: { ...config.execution, killSwitch: enabled },
    };
    const stored = this.options.repo.getConfig();
    this.options.repo.saveConfig(next, stored?.secrets ?? '');
    this.options.repo.insertAudit({
      ts: Date.now(),
      actor: meta.actor,
      action: enabled ? 'settings.kill_switch_on' : 'settings.kill_switch_off',
      detail: JSON.stringify({ enabled }),
      ip: meta.ip,
    });
    this.options.logger.warn('Kill switch alterado', { enabled });
    return this.public();
  }

  assertLiveUnlocked(phrase: string): void {
    if (!this.options.liveTradingEnabled) {
      throw new HttpError(
        409,
        'live_disabled',
        'Trading real está desativado no servidor. Defina LIVE_TRADING_ENABLED=true e reinicie.',
      );
    }
    if (phrase.trim() !== LIVE_CONFIRMATION_PHRASE) {
      throw new HttpError(
        409,
        'live_confirmation_required',
        `Digite exatamente: ${LIVE_CONFIRMATION_PHRASE}`,
      );
    }
    const credentials = this.credentials();
    if (credentials.source === 'none') {
      throw new HttpError(
        409,
        'credentials_missing',
        'Configure a API key e a API secret da MEXC.',
      );
    }
    if (this.config().execution.killSwitch) {
      throw new HttpError(409, 'kill_switch_active', 'Desative o kill switch antes de iniciar.');
    }
  }

  createClient(credentials = this.credentials()): MexcFuturesClient {
    if (this.options.clientFactory) return this.options.clientFactory(credentials);
    return new MexcFuturesClient({
      apiKey: credentials.apiKey || undefined,
      apiSecret: credentials.apiSecret || undefined,
      baseUrl: this.options.mexcBaseUrl,
    });
  }

  async testConnection(
    input?: {
      apiKey?: string;
      apiSecret?: string;
    },
    options: { audit?: boolean } = {},
  ): Promise<ConnectionTestResult> {
    const credentials =
      input?.apiKey && input.apiSecret
        ? { apiKey: input.apiKey, apiSecret: input.apiSecret, source: 'settings' as const }
        : this.credentials();

    if (credentials.source === 'none') {
      throw new HttpError(400, 'credentials_missing', 'Informe a API key e a API secret da MEXC.');
    }

    try {
      const client = this.createClient(credentials);
      const result = await client.testConnection();
      if (options.audit !== false) {
        this.options.repo.insertAudit({
          ts: Date.now(),
          actor: 'dashboard',
          action: 'settings.test_connection',
          detail: JSON.stringify({ equity: result.equity, positions: result.openPositions }),
          ip: null,
        });
      }
      return result;
    } catch (error) {
      if (error instanceof MexcApiError) {
        throw new HttpError(502, 'mexc_error', error.friendly);
      }
      throw error;
    }
  }

  /**
   * Preflight for real money. It never places an order; it reports every gate
   * that must be green before the start dialog can succeed.
   */
  async liveReadiness(): Promise<{
    ready: boolean;
    blockers: string[];
    checks: {
      credentials: boolean;
      serverFlag: boolean;
      oneWay: boolean;
      equityUsd: number;
      minEquityUsd: number;
      equityOk: boolean;
      openPositions: number;
      openOrders: number;
      flat: boolean;
      openLedgerTrades: number;
      ledgerFlat: boolean;
      killSwitch: boolean;
      positionMode: number | null;
    };
  }> {
    const config = this.config();
    const checks = {
      credentials: this.credentials().source !== 'none',
      serverFlag: this.options.liveTradingEnabled,
      oneWay: false,
      equityUsd: 0,
      minEquityUsd: config.risk.minEquityUsd,
      equityOk: false,
      openPositions: 0,
      openOrders: 0,
      flat: false,
      openLedgerTrades: this.options.repo.getOpenTrades().length,
      ledgerFlat: this.options.repo.getOpenTrades().length === 0,
      killSwitch: config.execution.killSwitch,
      positionMode: null as number | null,
    };
    const blockers: string[] = [];

    if (!checks.credentials) blockers.push('Credenciais MEXC não configuradas.');
    if (!checks.serverFlag) blockers.push('LIVE_TRADING_ENABLED está false no servidor.');
    if (checks.killSwitch) blockers.push('Kill switch ativo; desative antes de operar.');

    if (checks.credentials) {
      try {
        const result = await this.testConnection(undefined, { audit: false });
        checks.positionMode = result.positionMode;
        checks.oneWay = result.positionMode === 2;
        checks.equityUsd = result.equity;
        checks.equityOk = result.equity >= config.risk.minEquityUsd;
        checks.openPositions = result.openPositions;
        checks.openOrders = result.openOrders;
        checks.flat = result.openPositions === 0 && result.openOrders === 0;
        if (!checks.oneWay) blockers.push('Conta MEXC em hedge; mude para one-way.');
        if (!checks.equityOk) {
          blockers.push(
            `Equity ${result.equity.toFixed(2)} USDT abaixo do mínimo ${config.risk.minEquityUsd} USDT.`,
          );
        }
        if (!checks.flat) blockers.push('Existem posições ou ordens abertas na MEXC.');
      } catch (error) {
        blockers.push(
          `Falha ao consultar a MEXC: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
        );
      }
    }

    if (!checks.ledgerFlat) blockers.push('Existe trade aberto no ledger local.');
    return { ready: blockers.length === 0, blockers, checks };
  }

  telegramToken(): string {
    return this.storedSecrets().telegramBotToken ?? '';
  }
}

function diffTopLevel(previous: BotConfig, next: BotConfig): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const key of keys) {
    const before = JSON.stringify((previous as unknown as Record<string, unknown>)[key]);
    const after = JSON.stringify((next as unknown as Record<string, unknown>)[key]);
    if (before !== after) changed.push(key);
  }
  return changed;
}

export type { StoredConfig };
