import {
  APP_NAME,
  buildDailySeries,
  buildExitReasons,
  buildHourlySeries,
  buildRDistribution,
  summarizeTrades,
  symbolSchema,
  type AnalyticsResponse,
  type Candle,
} from '@goodz/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Repository } from '../db/repo';
import { fallbackContract, isKnownContract } from '../services/contracts';
import { generateSyntheticCandles } from '../services/candles';
import type { EventBus } from '../services/events';
import type { MarketDataService } from '../services/market-data';
import type { SettingsService } from '../services/settings';
import type { TradingEngine } from '../bot/engine';
import { parseInput } from './helpers';

interface StatusRoutesDeps {
  repo: Repository;
  settings: SettingsService;
  engine: TradingEngine;
  market: MarketDataService;
  events: EventBus;
}

const rangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(30),
  mode: z.enum(['paper', 'live']).optional(),
});

const candlesSchema = z.object({
  symbol: symbolSchema.default('BTC_USDT'),
  interval: z.enum(['Min1', 'Min5', 'Min15', 'Min60', 'Hour4']).default('Min1'),
  limit: z.coerce.number().int().min(20).max(500).default(200),
});

const intervalSeconds: Record<string, number> = {
  Min1: 60,
  Min5: 300,
  Min15: 900,
  Min60: 3_600,
  Hour4: 14_400,
};

const candleCache = new Map<
  string,
  { at: number; candles: Candle[]; source: 'mexc' | 'synthetic' }
>();

export function registerStatusRoutes(app: FastifyInstance, deps: StatusRoutesDeps): void {
  app.get('/api/health', async () => {
    const status = deps.engine.getStatus();
    return {
      ok: true,
      name: APP_NAME,
      version: '0.1.0',
      now: Date.now(),
      bot: status.status,
      mode: status.mode,
      feed: status.feed,
      db: true,
      uptime: process.uptime(),
    };
  });

  app.get('/api/status', async () => deps.engine.getStatus());

  app.get('/api/metrics', async (request) => {
    const query = parseInput(rangeSchema, request.query);
    const now = Date.now();
    const since = now - query.days * 86_400_000;
    const trades = deps.repo.getClosedTradesSince(since, query.mode);
    const equity = deps.repo.listEquity(since);
    const summary = summarizeTrades(trades, equity, now);
    return {
      rangeDays: query.days,
      summary,
      equity,
      daily: buildDailySeries(trades, query.days, now),
      updatedAt: now,
    };
  });

  app.get('/api/analytics', async (request) => {
    const query = parseInput(rangeSchema, request.query);
    const now = Date.now();
    const since = now - query.days * 86_400_000;
    const trades = deps.repo.getClosedTradesSince(since, query.mode);
    const equity = deps.repo.listEquity(since);
    const payload: AnalyticsResponse = {
      rangeDays: query.days,
      summary: summarizeTrades(trades, equity, now),
      daily: buildDailySeries(trades, query.days, now),
      hourly: buildHourlySeries(trades),
      rDistribution: buildRDistribution(trades),
      exitReasons: buildExitReasons(trades),
      equity,
    };
    return payload;
  });

  app.get('/api/equity', async (request) => {
    const query = parseInput(
      z.object({
        hours: z.coerce
          .number()
          .int()
          .min(1)
          .max(24 * 90)
          .default(24),
        limit: z.coerce.number().int().min(10).max(5_000).default(2_000),
      }),
      request.query,
    );
    const since = Date.now() - query.hours * 3_600_000;
    return { items: deps.repo.listEquity(since, query.limit) };
  });

  app.get('/api/market/snapshot', async () => deps.market.getView());

  app.get('/api/market/candles', async (request) => {
    const query = parseInput(candlesSchema, request.query);
    const key = `${query.symbol}:${query.interval}:${query.limit}`;
    const cached = candleCache.get(key);
    if (cached && Date.now() - cached.at < 5_000) return cached;

    const fallback = () => {
      const payload = {
        at: Date.now(),
        source: 'synthetic' as const,
        candles: generateSyntheticCandles({
          symbol: query.symbol,
          intervalSec: intervalSeconds[query.interval] ?? 60,
          limit: query.limit,
          endPrice: deps.market.getView().snapshot?.mid,
        }),
      };
      candleCache.set(key, payload);
      return payload;
    };

    if (deps.market.getView().source !== 'mexc') return fallback();

    try {
      const client = deps.settings.createClient();
      const intervalSec = intervalSeconds[query.interval] ?? 60;
      const end = Math.floor(Date.now() / 1_000);
      const start = end - intervalSec * query.limit;
      const candles = await client.getKlines(query.symbol, query.interval, start, end);
      if (candles.length < 5) return fallback();
      const payload = { at: Date.now(), source: 'mexc' as const, candles };
      candleCache.set(key, payload);
      return payload;
    } catch {
      return fallback();
    }
  });

  app.get('/api/market/contract/:symbol', async (request) => {
    const { symbol } = parseInput(z.object({ symbol: symbolSchema }), request.params);
    try {
      const client = deps.settings.createClient();
      const contract = await client.getContract(symbol);
      return { contract, source: 'mexc' };
    } catch {
      if (!isKnownContract(symbol) && deps.settings.config().mode === 'live') {
        return { contract: null, source: 'unavailable' };
      }
      return { contract: fallbackContract(symbol), source: 'fallback' };
    }
  });
}
