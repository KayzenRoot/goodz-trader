import { z } from 'zod';

import { CONFIG_VERSION, DEFAULT_SYMBOL, MAX_SUPPORTED_LEVERAGE } from './constants';

export const symbolSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{2,20}_[A-Z0-9]{2,10}$/, 'Use o formato BASE_QUOTE, por exemplo BTC_USDT');

const booleanFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const envBooleanSchema = booleanFromEnv;

const nested = <T extends z.ZodTypeAny>(schema: T): z.ZodDefault<T> =>
  schema.default(schema.parse({}) as never);

export const paperSchema = nested(
  z.object({
    startingBalance: z.number().positive().max(1_000_000).default(1_000),
    feed: z.enum(['synthetic', 'mexc']).default('synthetic'),
    seed: z.number().int().min(1).max(2_147_483_647).default(42),
  }),
);

export const riskSchema = nested(
  z.object({
    riskPerTradePct: z.number().min(0.05).max(5).default(0.5),
    maxNotionalUsd: z.number().positive().max(1_000_000).default(500),
    maxMarginPerTradeUsd: z.number().positive().max(100_000).default(100),
    maxTradesPerDay: z.number().int().min(1).max(10_000).default(200),
    maxOrdersPerMinute: z.number().int().min(1).max(600).default(30),
    maxConsecutiveLosses: z.number().int().min(1).max(50).default(5),
    cooldownAfterLossSec: z.number().int().min(0).max(3_600).default(30),
    maxSpreadBps: z.number().min(0).max(100).default(8),
    minEquityUsd: z.number().min(0).max(1_000_000).default(20),
    maxOpenPositions: z.number().int().min(1).max(5).default(1),
  }),
);

export const dailySchema = nested(
  z.object({
    profitTargetUsd: z.number().min(0).max(1_000_000).default(50),
    lossLimitUsd: z.number().min(1).max(1_000_000).default(25),
    resetHourUtc: z.number().int().min(0).max(23).default(0),
    stopOnTarget: z.boolean().default(true),
    closeOnStop: z.boolean().default(true),
  }),
);

export const strategySchema = nested(
  z
    .object({
      fastEma: z.number().int().min(2).max(200).default(6),
      slowEma: z.number().int().min(3).max(500).default(24),
      entryThresholdBps: z.number().min(0).max(100).default(0.6),
      imbalanceThreshold: z.number().min(0).max(1).default(0.2),
      tradeDeltaThreshold: z.number().min(0).max(100).default(0.5),
      takeProfitBps: z.number().min(5).max(500).default(26),
      stopLossBps: z.number().min(3).max(500).default(14),
      trailingStartBps: z.number().min(5).max(500).default(14),
      trailingDistanceBps: z.number().min(2).max(200).default(6),
      timeStopSec: z.number().int().min(5).max(3_600).default(60),
      cooldownMs: z.number().int().min(100).max(60_000).default(1_200),
      minHoldMs: z.number().int().min(0).max(10_000).default(500),
      entryStyle: z.enum(['maker', 'taker']).default('maker'),
      makerTimeoutMs: z.number().int().min(200).max(10_000).default(1_500),
      allowTakerFallback: z.boolean().default(true),
      maxSlippageBps: z.number().min(0).max(100).default(4),
    })
    .refine((value) => value.fastEma < value.slowEma, {
      message: 'A EMA rápida deve ser menor que a EMA lenta',
      path: ['fastEma'],
    }),
);

export const executionSchema = nested(
  z.object({
    feeMaker: z.number().min(0).max(0.01).default(0.0002),
    feeTaker: z.number().min(0).max(0.01).default(0.0006),
    slippageBps: z.number().min(0).max(100).default(3),
    killSwitch: z.boolean().default(false),
  }),
);

export const notificationsSchema = nested(
  z.object({
    telegramEnabled: z.boolean().default(false),
    telegramChatId: z.string().trim().max(64).default(''),
    webhookUrl: z.string().trim().url().or(z.literal('')).default(''),
    notifyOnTrade: z.boolean().default(true),
    notifyOnHalt: z.boolean().default(true),
  }),
);

export const botConfigSchema = z
  .object({
    version: z.literal(CONFIG_VERSION).default(CONFIG_VERSION),
    mode: z.enum(['paper', 'live']).default('paper'),
    primarySymbol: symbolSchema.default(DEFAULT_SYMBOL),
    watchlist: z.array(symbolSchema).min(1).max(5).default([DEFAULT_SYMBOL]),
    leverage: z.number().int().min(1).max(MAX_SUPPORTED_LEVERAGE).default(10),
    marginMode: z.enum(['isolated', 'cross']).default('isolated'),
    paper: paperSchema,
    risk: riskSchema,
    daily: dailySchema,
    strategy: strategySchema,
    execution: executionSchema,
    notifications: notificationsSchema,
  })
  .superRefine((value, ctx) => {
    const roundTripFeeBps = (value.execution.feeMaker + value.execution.feeTaker) * 10_000;
    if (value.strategy.takeProfitBps <= roundTripFeeBps + 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['strategy', 'takeProfitBps'],
        message: `O take profit precisa superar as taxas (${roundTripFeeBps.toFixed(1)} bps) + 2 bps`,
      });
    }
    if (value.strategy.trailingStartBps >= value.strategy.takeProfitBps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['strategy', 'trailingStartBps'],
        message: 'O trailing deve começar antes do take profit',
      });
    }
    if (value.strategy.trailingDistanceBps >= value.strategy.trailingStartBps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['strategy', 'trailingDistanceBps'],
        message: 'A distância do trailing deve ser menor que o gatilho',
      });
    }
    if (
      value.daily.profitTargetUsd > 0 &&
      value.daily.profitTargetUsd < value.daily.lossLimitUsd / 10
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['daily', 'profitTargetUsd'],
        message: 'Meta diária muito pequena em relação ao stop diário (risco/retorno < 1:10)',
      });
    }
    if (!value.watchlist.includes(value.primarySymbol)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['watchlist'],
        message: 'A watchlist precisa incluir o símbolo principal',
      });
    }
  });

export const secretInputSchema = z.object({
  apiKey: z.string().trim().min(8).max(128).optional(),
  apiSecret: z.string().trim().min(8).max(256).optional(),
  telegramBotToken: z.string().trim().min(8).max(256).optional(),
  clearApiCredentials: z.boolean().optional(),
  clearTelegramToken: z.boolean().optional(),
});

export const settingsUpdateSchema = z.object({
  config: botConfigSchema,
  secrets: secretInputSchema.default({}),
});

export const startBotSchema = z.object({
  confirmation: z.string().optional(),
});

export const stopBotSchema = z.object({
  closePosition: z.boolean().default(false),
});

export const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

export type BotConfig = z.infer<typeof botConfigSchema>;
export type SecretsInput = z.infer<typeof secretInputSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
export type PaperConfig = z.infer<typeof paperSchema>;
export type RiskConfig = z.infer<typeof riskSchema>;
export type DailyConfig = z.infer<typeof dailySchema>;
export type StrategyConfig = z.infer<typeof strategySchema>;
export type ExecutionConfig = z.infer<typeof executionSchema>;
export type NotificationsConfig = z.infer<typeof notificationsSchema>;
