import {
  clamp,
  computeImbalance,
  computeTradeDelta,
  gaussian,
  mulberry32,
  nextEma,
  standardDeviation,
  type BookLevel,
  type MarketSnapshot,
  type MarketView,
  type TapePrint,
} from '@goodz/core';
import { MexcPublicWs, type Depth, type MexcFuturesClient, type RawTicker } from '@goodz/mexc';

import type { AppLogger } from '../lib/logger';
import { basePriceFor } from './contracts';
import type { EventBus } from './events';

export interface MarketDataOptions {
  symbol: string;
  feed: 'synthetic' | 'mexc';
  client: MexcFuturesClient;
  wsUrl: string;
  eventBus: EventBus;
  logger: AppLogger;
  intervalMs?: number;
  seed?: number;
}

const EMPTY_VIEW: MarketView = {
  snapshot: null,
  bids: [],
  asks: [],
  tape: [],
  source: 'none',
  connected: false,
  lastTickAt: null,
  latencyMs: null,
};

export class MarketDataService {
  private view: MarketView = { ...EMPTY_VIEW };
  private symbol: string;
  private feed: 'synthetic' | 'mexc';
  private timer: NodeJS.Timeout | null = null;
  private depthTimer: NodeJS.Timeout | null = null;
  private ws: MexcPublicWs | null = null;
  private stopped = true;
  private rng: () => number;
  private mid = 100;
  private trend = 0;
  private trendTicks = 0;
  private fastEma: number | undefined;
  private slowEma: number | undefined;
  private midHistory: number[] = [];
  private tape: TapePrint[] = [];
  private tradeWindow: Array<{ ts: number; side: 'buy' | 'sell'; qty: number }> = [];
  private bids: BookLevel[] = [];
  private asks: BookLevel[] = [];
  private lastEmit = 0;
  private lastTicker: RawTicker | null = null;
  private reconnectCount = 0;

  constructor(private readonly options: MarketDataOptions) {
    this.symbol = options.symbol;
    this.feed = options.feed;
    this.rng = mulberry32(options.seed ?? 42);
    this.mid = basePriceFor(options.symbol);
    this.fastEma = this.mid;
    this.slowEma = this.mid;
    this.bids = [];
    this.asks = [];
  }

  get feedSource(): 'synthetic' | 'mexc' | 'none' {
    return this.view.source;
  }

  getView(): MarketView {
    return {
      ...this.view,
      snapshot: this.view.snapshot ? { ...this.view.snapshot } : null,
      bids: this.view.bids.map((level) => ({ ...level })),
      asks: this.view.asks.map((level) => ({ ...level })),
      tape: this.view.tape.map((print) => ({ ...print })),
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    if (this.feed === 'mexc') this.startMexc();
    else this.startSynthetic();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.depthTimer) clearInterval(this.depthTimer);
    this.timer = null;
    this.depthTimer = null;
    this.ws?.stop();
    this.ws = null;
    this.view = { ...EMPTY_VIEW, source: this.feed, connected: false };
    this.options.eventBus.publish('market', this.getView());
  }

  switchTo(feed: 'synthetic' | 'mexc', symbol: string, seed = 42): void {
    if (this.feed === feed && this.symbol === symbol && !this.stopped) return;
    this.stop();
    this.feed = feed;
    this.symbol = symbol;
    this.rng = mulberry32(seed);
    this.mid = basePriceFor(symbol);
    this.fastEma = this.mid;
    this.slowEma = this.mid;
    this.midHistory = [];
    this.tape = [];
    this.tradeWindow = [];
    this.bids = [];
    this.asks = [];
    this.reconnectCount = 0;
    this.lastEmit = 0;
    this.start();
  }

  // -------------------------------------------------------------------------
  // Synthetic feed
  // -------------------------------------------------------------------------

  private startSynthetic(): void {
    this.options.logger.info('Feed sintético iniciado', { symbol: this.symbol });
    this.view = {
      ...EMPTY_VIEW,
      source: 'synthetic',
      connected: true,
    };
    this.tickSynthetic();
    this.timer = setInterval(() => this.tickSynthetic(), this.options.intervalMs ?? 500);
  }

  private tickSynthetic(): void {
    const rng = this.rng;
    this.trendTicks -= 1;
    if (this.trendTicks <= 0) {
      this.trendTicks = 12 + Math.floor(rng() * 30);
      this.trend = (rng() - 0.5) * 1.6;
      if (rng() > 0.82) this.trend *= 2.2;
    }

    const shock = gaussian(rng) * 0.00028 + this.trend * 0.00007;
    this.mid = Math.max(0.000001, this.mid * (1 + shock));
    const spreadBps = 0.8 + rng() * 1.8;
    const bid = this.mid * (1 - spreadBps / 20_000);
    const ask = this.mid * (1 + spreadBps / 20_000);
    const priceUnit = Math.max(this.mid * 0.0000005, 0.0001);

    const bidLevels: BookLevel[] = [];
    const askLevels: BookLevel[] = [];
    for (let level = 0; level < 10; level += 1) {
      const distance = priceUnit * (level + 1);
      const bidBias = 1 + Math.max(0, this.trend) * (5 - level) * 0.12;
      const askBias = 1 + Math.max(0, -this.trend) * (5 - level) * 0.12;
      bidLevels.push({
        price: roundPrice(bid - distance),
        qty: Math.max(1, Math.round((2 + rng() * 18) * bidBias)),
      });
      askLevels.push({
        price: roundPrice(ask + distance),
        qty: Math.max(1, Math.round((2 + rng() * 18) * askBias)),
      });
    }

    this.bids = bidLevels;
    this.asks = askLevels;
    this.midHistory.push(this.mid);
    if (this.midHistory.length > 60) this.midHistory.shift();

    const prints = 1 + Math.floor(rng() * 3);
    for (let index = 0; index < prints; index += 1) {
      const buy = rng() < 0.5 + this.trend * 0.25;
      this.pushTape({
        ts: Date.now(),
        price: buy ? ask : bid,
        qty: Math.max(1, Math.round(1 + rng() * 14)),
        side: buy ? 'buy' : 'sell',
      });
    }

    this.emitSnapshot(Date.now());
  }

  // -------------------------------------------------------------------------
  // MEXC feed
  // -------------------------------------------------------------------------

  private startMexc(): void {
    this.options.logger.info('Feed MEXC iniciado', { symbol: this.symbol });
    this.view = {
      ...EMPTY_VIEW,
      source: 'mexc',
      connected: false,
    };

    const ws = new MexcPublicWs({
      symbol: this.symbol,
      onTicker: (ticker) => {
        this.lastTicker = ticker;
        this.mid = ticker.lastPrice || (ticker.bid1 + ticker.ask1) / 2;
        this.bids = [{ price: ticker.bid1, qty: 1 }];
        this.asks = [{ price: ticker.ask1, qty: 1 }];
        this.pushTape({
          ts: ticker.timestamp,
          price: ticker.lastPrice,
          qty: 1,
          side: 'buy',
        });
        this.view = { ...this.view, connected: true };
        this.emitSnapshot(ticker.timestamp);
      },
      onDeal: (deal) => {
        this.pushTape(deal);
        this.emitSnapshot(deal.ts);
      },
      onStatus: (status) => {
        this.reconnectCount = status.reconnects;
        this.view = {
          ...this.view,
          connected: status.connected,
          latencyMs: status.connected ? this.view.latencyMs : null,
        };
        if (status.message) {
          this.options.logger.warn('Feed MEXC desconectado', {
            message: status.message,
            reconnects: status.reconnects,
          });
        }
        this.options.eventBus.publish('market', this.getView());
      },
    });
    this.ws = ws;
    ws.start();

    const pollDepth = async () => {
      try {
        const depth: Depth = await this.options.client.getDepth(this.symbol, 20);
        if (depth.bids.length) this.bids = depth.bids;
        if (depth.asks.length) this.asks = depth.asks;
        this.emitSnapshot(Date.now());
      } catch (error) {
        this.options.logger.warn('Falha ao atualizar order book', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void pollDepth();
    this.depthTimer = setInterval(() => void pollDepth(), 1_500);
  }

  // -------------------------------------------------------------------------
  // Snapshot + helpers
  // -------------------------------------------------------------------------

  private pushTape(print: TapePrint): void {
    this.tape.push(print);
    if (this.tape.length > 40) this.tape.shift();
    this.tradeWindow.push({ ts: print.ts, side: print.side, qty: print.qty });
    const cutoff = Date.now() - 3_000;
    this.tradeWindow = this.tradeWindow.filter((trade) => trade.ts >= cutoff);
  }

  private emitSnapshot(ts: number): void {
    const now = Date.now();
    if (now - this.lastEmit < 180) return;
    this.lastEmit = now;

    if (this.bids.length === 0 || this.asks.length === 0) return;
    const bestBid = this.bids[0]?.price ?? this.mid;
    const bestAsk = this.asks[0]?.price ?? this.mid;
    const mid = this.mid || (bestBid + bestAsk) / 2;
    const fast = nextEma(this.fastEma, mid, 6);
    const slow = nextEma(this.slowEma, mid, 24);
    this.fastEma = fast;
    this.slowEma = slow;

    const bidVolume = this.bids.slice(0, 5).reduce((sum, level) => sum + level.qty, 0);
    const askVolume = this.asks.slice(0, 5).reduce((sum, level) => sum + level.qty, 0);
    const buys = this.tradeWindow
      .filter((trade) => trade.side === 'buy')
      .reduce((sum, trade) => sum + trade.qty, 0);
    const sells = this.tradeWindow
      .filter((trade) => trade.side === 'sell')
      .reduce((sum, trade) => sum + trade.qty, 0);
    const returns = this.midHistory
      .slice(-30)
      .map((price, index, values) =>
        index === 0 ? 0 : (price - (values[index - 1] ?? price)) / (values[index - 1] || price),
      )
      .slice(1);
    const volatility = standardDeviation(returns) * 10_000;

    const snapshot: MarketSnapshot = {
      symbol: this.symbol,
      ts,
      mid,
      bid: bestBid,
      ask: bestAsk,
      last: this.tape.at(-1)?.price ?? mid,
      spreadBps: mid > 0 ? ((bestAsk - bestBid) / mid) * 10_000 : 0,
      imbalance: computeImbalance(bidVolume, askVolume),
      tradeDelta: computeTradeDelta(buys, sells),
      emaFast: fast,
      emaSlow: slow,
      volatilityBps: clamp(volatility, 0, 500),
    };

    this.view = {
      ...this.view,
      snapshot,
      bids: this.bids.slice(0, 12),
      asks: this.asks.slice(0, 12),
      tape: this.tape.slice(-30),
      lastTickAt: now,
      latencyMs: this.feed === 'mexc' ? Math.max(0, now - ts) : 0,
      connected: this.feed === 'synthetic' ? true : this.view.connected,
    };
    this.options.eventBus.publish('market', this.getView());
  }

  get diagnostics(): { reconnects: number; source: 'synthetic' | 'mexc' | 'none' } {
    return { reconnects: this.reconnectCount, source: this.view.source };
  }
}

function roundPrice(value: number): number {
  return Number(value.toFixed(8));
}
