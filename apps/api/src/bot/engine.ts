import { randomBytes } from 'node:crypto';

import {
  dayKey,
  dayStartMs,
  evaluateEntry,
  grossPnl,
  maxDrawdownPct,
  MomentumScalper,
  notionalUsd,
  progressPct,
  rMultiple,
  type BotConfig,
  type BotMode,
  type BotStatus,
  type CloseResult,
  type ContractSpec,
  type EngineStatus,
  type EntryMetrics,
  type HaltReason,
  type MarketView,
  type OrderRecord,
  type OrderResult,
  type PositionView,
  type Side,
  type Trade,
} from '@goodz/core';
import { MexcApiError, type MexcFuturesClient } from '@goodz/mexc';

import { createBroker, type Broker, type BrokerReconciliation } from '../brokers';
import type { BotStateRowInternal, Repository } from '../db/repo';
import { evaluateExit } from './exits';
import { evaluateReconciliation } from './reconcile';
import { evaluateRequote, isPartialFill, makerLimitPrice, mergeFill, remainingQty } from './maker';
import { HttpError } from '../lib/http-error';
import type { AppLogger } from '../lib/logger';
import { fallbackContract } from '../services/contracts';
import type { EventBus } from '../services/events';
import type { MarketDataService } from '../services/market-data';
import type { NotificationService } from '../services/notifier';
import type { SettingsService } from '../services/settings';

interface RuntimePosition {
  tradeId: string;
  symbol: string;
  side: Side;
  qty: number;
  entryPrice: number;
  entryFee: number;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  stopPrice: number;
  takeProfitPrice: number;
  trailingStopPrice: number | null;
  openedAt: number;
  riskUsd: number;
  exchangePositionId: number | null;
}

interface PendingEntry {
  tradeId: string;
  orderId: string;
  clientOrderId: string;
  exchangeOrderId: string | null;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  expiresAt: number;
  fallbackAttempted: boolean;
  riskUsd: number;
  notionalUsd: number;
  marginUsd: number;
  reason: string;
  createdAt: number;
  lastRequoteAt: number;
  requotes: number;
  cancelFailures: number;
  /** Total filled across every order attempt for this entry. */
  filledQty: number;
  /** Total filled before the currently resting order was placed. */
  filledBase: number;
  /** Fees accrued before the currently resting order was placed. */
  feeBase: number;
  fee: number;
  avgPrice: number | null;
}

interface EntryMetricsInternal {
  makerAttempts: number;
  makerFills: number;
  takerFallbacks: number;
  requotes: number;
  partialFills: number;
  makerFillMsTotal: number;
  makerFillSamples: number;
  fallbackCostUsd: number;
}

export interface EngineOptions {
  repo: Repository;
  settings: SettingsService;
  market: MarketDataService;
  events: EventBus;
  logger: AppLogger;
  notifier: NotificationService;
  now?: () => number;
  clientFactory?: () => MexcFuturesClient;
  wsUrl?: string;
}

export class TradingEngine {
  private status: BotStatus = 'stopped';
  private mode: BotMode = 'paper';
  private config: BotConfig;
  private contract: ContractSpec;
  private symbol: string;
  private broker: Broker | null = null;
  private client: MexcFuturesClient | null = null;
  private scalper: MomentumScalper;
  private state: BotStateRowInternal;
  private position: RuntimePosition | null = null;
  private pending: PendingEntry | null = null;
  private marketView: MarketView;
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private haltReason: HaltReason | null = null;
  private lastError: string | null = null;
  private day: string;
  private dailyStartEquity = 0;
  private realizedDay = 0;
  private feesDay = 0;
  private tradesDay = 0;
  private winsDay = 0;
  private lossesDay = 0;
  private consecutiveLosses = 0;
  private lastLossAt: number | null = null;
  private accountEquity = 0;
  private availableBalance = 0;
  private orderTimestamps: number[] = [];
  private lastEquityAt = 0;
  private lastStatusAt = 0;
  private lastGuardLogAt = 0;
  private lastGuardReason = '';
  private lastStaleLogAt = 0;
  private processing = false;
  private halting = false;
  private deferredReconcile: BrokerReconciliation | null = null;
  private entryMetrics: EntryMetricsInternal = createEntryMetrics();
  private accountTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private readonly now: () => number;

  constructor(private readonly options: EngineOptions) {
    this.now = options.now ?? Date.now;
    this.config = options.settings.config();
    this.symbol = this.config.primarySymbol;
    this.contract = fallbackContract(this.symbol);
    this.scalper = new MomentumScalper(this.config.strategy);
    this.state = options.repo.getState();
    this.mode = this.config.mode;
    this.day = dayKey(this.now(), this.config.daily.resetHourUtc);
    this.marketView = options.market.getView();
    this.options.events.subscribe((event) => {
      if (event.type === 'market') {
        this.marketView = event.data;
        void this.onMarket(event.data);
      }
    });
  }

  /**
   * Loads persisted state after a process restart. Never resumes trading
   * automatically: a bot that was running is reported as stopped so a human
   * can verify account state first.
   */
  bootstrap(): EngineStatus {
    this.config = this.options.settings.config();
    this.mode = this.config.mode;
    this.symbol = this.config.primarySymbol;
    this.contract = fallbackContract(this.symbol);
    this.scalper = new MomentumScalper(this.config.strategy);
    this.state = this.options.repo.getState();
    this.day = dayKey(this.now(), this.config.daily.resetHourUtc);
    this.rehydrateDay();
    this.accountEquity =
      this.mode === 'paper'
        ? this.config.paper.startingBalance + this.options.repo.getRealizedPnl('paper')
        : (this.options.repo.latestEquity()?.equity ?? 0);
    this.availableBalance = this.accountEquity;
    this.status =
      this.state.status === 'running' ||
      this.state.status === 'starting' ||
      this.state.status === 'stopping'
        ? 'stopped'
        : this.state.status;
    this.startedAt = this.state.startedAt;
    this.stoppedAt = this.state.stoppedAt ?? this.now();
    this.haltReason = this.state.haltReason;
    this.lastError =
      this.state.status === 'running'
        ? 'O processo foi reiniciado; o bot está parado. Verifique a MEXC antes de reiniciar.'
        : this.state.lastError;
    this.adoptPersistedPosition();
    this.persistState();
    return this.getStatus();
  }

  getStatus(): EngineStatus {
    const now = this.now();
    const snapshot = this.marketView.snapshot;
    const position = this.positionView(snapshot?.mid ?? null);
    const unrealized = position?.unrealizedPnl ?? 0;
    const equity =
      this.mode === 'live'
        ? this.accountEquity
        : this.config.paper.startingBalance +
          this.options.repo.getRealizedPnl('paper') +
          unrealized;
    const dayPnl = this.realizedDay + unrealized;
    const dayPnlPct = this.dailyStartEquity > 0 ? (dayPnl / this.dailyStartEquity) * 100 : 0;
    const view = this.options.market.getView();
    const diagnostics = this.options.market.diagnostics;

    return {
      status: this.status,
      mode: this.mode,
      symbol: this.symbol,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      uptimeSec:
        this.status === 'running' && this.startedAt
          ? Math.floor((now - this.startedAt) / 1_000)
          : 0,
      dayKey: this.day,
      equity: round(equity),
      availableBalance: round(
        this.mode === 'paper'
          ? Math.max(0, equity - (position?.marginUsd ?? 0))
          : this.availableBalance,
      ),
      dayPnl: round(dayPnl),
      dayPnlPct: round(dayPnlPct, 2),
      realizedDay: round(this.realizedDay),
      unrealized: round(unrealized),
      feesDay: round(this.feesDay),
      tradesDay: this.tradesDay,
      winsDay: this.winsDay,
      lossesDay: this.lossesDay,
      consecutiveLosses: this.consecutiveLosses,
      targetProgress: progressPct(Math.max(0, dayPnl), this.config.daily.profitTargetUsd),
      lossProgress: progressPct(Math.max(0, -dayPnl), this.config.daily.lossLimitUsd),
      ordersLastMinute: this.ordersLastMinute(now),
      haltReason: this.haltReason,
      lastError: this.lastError,
      position,
      feed: {
        source: view.source,
        connected: view.connected,
        lastTickAt: view.lastTickAt,
        latencyMs: view.latencyMs,
        reconnects: diagnostics.reconnects,
        message: view.connected ? null : 'Feed de mercado sem conexão',
      },
      api:
        this.mode === 'live'
          ? {
              connected: this.status === 'running',
              latencyMs: null,
              lastCheckedAt: this.startedAt,
              message: this.status === 'running' ? 'Conectado à MEXC' : 'Conta não conectada',
            }
          : {
              connected: false,
              latencyMs: null,
              lastCheckedAt: null,
              message: 'Paper mode — nenhuma ordem real é enviada',
            },
      demoData: this.options.repo.countDemoTrades() > 0,
      entryMetrics: this.entryMetricsView(),
    };
  }

  private entryMetricsView(): EntryMetrics {
    const metrics = this.entryMetrics;
    return {
      makerAttempts: metrics.makerAttempts,
      makerFills: metrics.makerFills,
      takerFallbacks: metrics.takerFallbacks,
      requotes: metrics.requotes,
      partialFills: metrics.partialFills,
      makerFillRatePct:
        metrics.makerAttempts > 0
          ? round((metrics.makerFills / metrics.makerAttempts) * 100, 1)
          : 0,
      avgMakerFillMs:
        metrics.makerFillSamples > 0
          ? Math.round(metrics.makerFillMsTotal / metrics.makerFillSamples)
          : null,
      fallbackCostUsd: round(metrics.fallbackCostUsd),
    };
  }

  async start(confirmation = ''): Promise<EngineStatus> {
    if (this.status === 'starting' || this.status === 'running') {
      throw new HttpError(409, 'already_running', 'O bot já está em execução.');
    }

    const config = this.options.settings.config();
    const mode = config.mode;
    if (config.execution.killSwitch) {
      throw new HttpError(
        409,
        'kill_switch_active',
        'Kill switch ativo. Desative nas configurações e revise o risco antes de iniciar.',
      );
    }
    if (mode === 'live') {
      this.options.settings.assertLiveUnlocked(confirmation);
    }

    this.entryMetrics = createEntryMetrics();
    this.status = 'starting';
    this.lastError = null;
    this.haltReason = null;
    this.config = config;
    this.mode = mode;
    this.symbol = config.primarySymbol;
    this.emitStatus();

    try {
      this.client = this.options.clientFactory?.() ?? this.options.settings.createClient();
      this.contract = await this.loadContract(this.client, this.symbol, mode);
      if (config.leverage > this.contract.maxLeverage) {
        throw new HttpError(
          400,
          'leverage_too_high',
          `A alavancagem ${config.leverage}x excede o máximo ${this.contract.maxLeverage}x de ${this.symbol}.`,
        );
      }

      this.broker = createBroker({
        mode,
        config,
        contract: this.contract,
        repo: this.options.repo,
        client: this.client,
        logger: this.options.logger,
        wsUrl: this.options.wsUrl,
        onReconnect: (reconciliation) => this.handleBrokerReconnect(reconciliation),
      });
      await this.broker.connect();

      const reconciliation = await this.broker.reconcile();
      this.log('info', 'Broker reconciliation (start)', { ...reconciliation });
      this.options.repo.insertAudit({
        ts: this.now(),
        actor: 'risk-engine',
        action: 'broker.reconcile.start',
        detail: JSON.stringify(reconciliation),
        ip: null,
      });
      if (mode === 'live' && (reconciliation.openPositions > 0 || reconciliation.openOrders > 0)) {
        throw new HttpError(
          409,
          'reconciliation_failed',
          `Diverg?ncia na MEXC: ${reconciliation.openPositions} posi??o(?es), ${reconciliation.openOrders} ordem(ns) aberta(s). O bot n?o inicia.`,
        );
      }

      this.day = dayKey(this.now(), config.daily.resetHourUtc);
      this.rehydrateDay();
      this.accountEquity =
        mode === 'live'
          ? await this.broker.getEquity()
          : config.paper.startingBalance + this.options.repo.getRealizedPnl('paper');
      this.availableBalance =
        mode === 'live' ? await this.broker.getAvailableBalance() : this.accountEquity;
      this.prepareOpenTrades(mode);

      if (this.realizedDay <= -Math.abs(config.daily.lossLimitUsd)) {
        throw new HttpError(
          409,
          'daily_stop',
          `Stop diário já atingido (${this.realizedDay.toFixed(2)} USDT). Aguarde o reset ou revise os limites.`,
        );
      }
      if (config.daily.stopOnTarget && this.realizedDay >= config.daily.profitTargetUsd) {
        throw new HttpError(
          409,
          'daily_target',
          `Meta diária já atingida (${this.realizedDay.toFixed(2)} USDT). Aguarde o reset.`,
        );
      }

      this.scalper = new MomentumScalper(config.strategy);
      this.position = this.position ?? null;
      this.pending = null;
      this.orderTimestamps = [];
      this.status = 'running';
      this.startedAt = this.now();
      this.stoppedAt = null;
      this.haltReason = null;
      this.dailyStartEquity =
        this.options.repo.getDailyStats(this.day)?.startEquity ??
        Math.max(0.01, this.accountEquity - this.realizedDay);

      const feed = mode === 'live' ? 'mexc' : config.paper.feed;
      this.options.market.switchTo(feed, this.symbol, config.paper.seed);
      this.persistState();
      this.startTimers();
      this.log('info', 'Bot iniciado', {
        mode,
        symbol: this.symbol,
        leverage: config.leverage,
        feed,
        equity: this.accountEquity,
      });
      this.options.repo.insertAudit({
        ts: this.now(),
        actor: 'dashboard',
        action: 'bot.start',
        detail: JSON.stringify({ mode, symbol: this.symbol, leverage: config.leverage }),
        ip: null,
      });
      this.emitStatus();
      this.recordEquity(true);
      return this.getStatus();
    } catch (error) {
      this.status = 'error';
      this.lastError = friendlyError(error);
      this.persistState();
      this.emitStatus();
      this.log('error', 'Falha ao iniciar o bot', { error: this.lastError });
      try {
        await this.broker?.disconnect();
      } catch {
        // ignore
      }
      this.broker = null;
      throw error instanceof HttpError ? error : new HttpError(502, 'start_failed', this.lastError);
    }
  }

  async stop(closePosition = false): Promise<EngineStatus> {
    if (this.status === 'stopped' || this.status === 'idle') {
      return this.getStatus();
    }
    this.status = 'stopping';
    this.emitStatus();

    if (this.pending) await this.cancelPending('manual_stop');
    if (closePosition && this.position) {
      await this.closeCurrent('manual_stop');
    }
    try {
      await this.broker?.disconnect();
    } catch (error) {
      this.log('warn', 'Erro ao desconectar broker', { error: friendlyError(error) });
    }
    this.clearTimers();
    this.broker = null;
    this.status = 'stopped';
    this.stoppedAt = this.now();
    this.haltReason = null;
    this.persistState();
    this.updateDailyStats();
    this.emitStatus();
    this.log('info', 'Bot parado', { closePosition });
    return this.getStatus();
  }

  async emergencyStop(): Promise<EngineStatus> {
    await this.halt('kill_switch', true);
    return this.getStatus();
  }

  async closePositionManually(): Promise<EngineStatus> {
    if (!this.position) {
      throw new HttpError(409, 'no_position', 'Não existe posição aberta para fechar.');
    }
    if (this.status !== 'running') {
      throw new HttpError(
        409,
        'bot_not_running',
        'O bot não está em execução. Feche a posição pela MEXC neste caso.',
      );
    }
    const closed = await this.closeCurrent('manual_close');
    if (!closed) {
      throw new HttpError(
        502,
        'close_failed',
        this.lastError ?? 'Falha ao fechar a posição. Verifique a MEXC manualmente.',
      );
    }
    return this.getStatus();
  }

  private async onMarket(view: MarketView): Promise<void> {
    if (this.status !== 'running' || this.processing) return;
    const snapshot = view.snapshot;
    if (!snapshot) return;
    const now = this.now();
    if (view.lastTickAt && now - view.lastTickAt > 5_000) {
      if (now - this.lastStaleLogAt > 10_000) {
        this.lastStaleLogAt = now;
        this.log('warn', 'Feed de mercado atrasado; entradas bloqueadas', {
          lastTickAt: view.lastTickAt,
        });
        this.options.notifier.notifyFeedStale(view.source, view.lastTickAt);
      }
      return;
    }

    this.processing = true;
    try {
      await this.tick(view);
    } catch (error) {
      this.lastError = friendlyError(error);
      this.log('error', 'Erro no ciclo do bot', { error: this.lastError });
      this.emitStatus();
    } finally {
      this.processing = false;
      if (this.deferredReconcile) {
        const reconciliation = this.deferredReconcile;
        this.deferredReconcile = null;
        this.handleBrokerReconnect(reconciliation);
      }
    }
  }

  private async tick(view: MarketView): Promise<void> {
    const snapshot = view.snapshot;
    if (!snapshot) return;
    const now = this.now();

    if (dayKey(now, this.config.daily.resetHourUtc) !== this.day) {
      this.rollDay(now);
    }

    const fills = await this.broker?.onSnapshot(view);
    if (fills?.length) await this.processFills(fills);

    if (this.position) {
      const exitReason = this.exitReason(snapshot.mid, now);
      if (exitReason) {
        await this.closeCurrent(exitReason);
      }
    }

    if (this.pending) {
      await this.managePending(now);
    }

    // managePending may halt (cancel failure, ambiguous requote). Never open a
    // new trade after a halt decision.
    if (this.status !== 'running') return;

    this.refreshEquity();

    const guard = this.guardTriggered();
    if (guard) {
      await this.halt(guard, this.config.daily.closeOnStop || guard !== 'daily_target');
      return;
    }

    if (!this.position && !this.pending) {
      const signal = this.scalper.next({
        ts: now,
        mid: snapshot.mid,
        bid: snapshot.bid,
        ask: snapshot.ask,
        imbalance: snapshot.imbalance,
        tradeDelta: snapshot.tradeDelta,
      });
      if (signal) {
        const decision = evaluateEntry(
          {
            config: this.config,
            contract: this.contract,
            snapshot,
            equity: this.currentEquity(),
            availableBalance: this.currentAvailable(),
            dayPnl: this.realizedDay + (this.position ? this.unrealizedNet() : 0),
            dayTrades: this.tradesDay,
            consecutiveLosses: this.consecutiveLosses,
            lastLossAt: this.lastLossAt,
            ordersLastMinute: this.ordersLastMinute(now),
            openPositions: 0,
            now,
            mode: this.mode,
          },
          signal.side,
        );
        if (decision.allowed) {
          await this.placeEntry(signal.side, decision, signal.reason);
        } else {
          this.logBlocked(decision.reason, decision.detail, now);
        }
      }
    }

    if (now - this.lastEquityAt > 15_000 || this.position) this.recordEquity(false);
    if (now - this.lastStatusAt > 1_000) this.emitStatus();
  }

  private exitReason(mark: number, now: number): string | null {
    const position = this.position;
    if (!position) return null;
    const decision = evaluateExit(
      {
        side: position.side,
        entryPrice: position.entryPrice,
        stopPrice: position.stopPrice,
        takeProfitPrice: position.takeProfitPrice,
        trailingStopPrice: position.trailingStopPrice,
        openedAt: position.openedAt,
      },
      mark,
      now,
      this.config.strategy,
    );
    position.trailingStopPrice = decision.trailingStopPrice;
    return decision.reason;
  }

  private async placeEntry(
    side: Side,
    decision: Extract<ReturnType<typeof evaluateEntry>, { allowed: true }>,
    reason: string,
    forceTaker = false,
  ): Promise<void> {
    const snapshot = this.marketView.snapshot;
    if (!snapshot || !this.broker) return;
    const now = this.now();
    const tradeId = id('trd');
    const clientOrderId = id('gz', 10);
    const wantsMaker = !forceTaker && this.config.strategy.entryStyle === 'maker';
    const makerPrice = wantsMaker
      ? makerLimitPrice({
          side,
          bid: snapshot.bid,
          ask: snapshot.ask,
          priceUnit: this.contract.priceUnit,
        })
      : null;
    const maker = wantsMaker && makerPrice !== null;

    if (wantsMaker && !maker) {
      this.log('warn', 'Preço passivo inválido; avaliando fallback taker', {
        bid: snapshot.bid,
        ask: snapshot.ask,
        priceUnit: this.contract.priceUnit,
      });
      if (!this.config.strategy.allowTakerFallback) {
        this.logBlocked('invalid_price', 'Sem preço passivo válido para post-only', now);
        return;
      }
    }
    if (maker) this.entryMetrics.makerAttempts += 1;

    const trade: Trade = {
      id: tradeId,
      mode: this.mode,
      symbol: this.symbol,
      side,
      status: 'pending',
      qty: decision.qty,
      contractSize: this.contract.contractSize,
      entryPrice: null,
      exitPrice: null,
      notionalUsd: decision.notionalUsd,
      marginUsd: decision.marginUsd,
      leverage: this.config.leverage,
      fees: 0,
      grossPnl: 0,
      netPnl: 0,
      rMultiple: 0,
      riskUsd: decision.riskUsd,
      openReason: reason,
      closeReason: '',
      openedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
      isDemo: false,
      meta: {
        entryStyle: maker ? 'maker' : 'taker',
        requestedQty: decision.qty,
        stopPrice: decision.stopDistance,
      },
    };
    this.options.repo.insertTrade(trade);

    const order: OrderRecord = {
      id: id('ord'),
      tradeId,
      exchangeOrderId: null,
      clientOrderId,
      symbol: this.symbol,
      side,
      action: 'open',
      type: maker ? 'limit' : 'market',
      price: maker ? makerPrice : null,
      qty: decision.qty,
      filledQty: 0,
      avgPrice: null,
      fee: 0,
      status: 'pending',
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.options.repo.insertOrder(order);
    this.orderTimestamps.push(now);

    try {
      const result = await this.broker.placeOrder({
        symbol: this.symbol,
        side,
        action: 'open',
        type: maker ? 'limit' : 'market',
        qty: decision.qty,
        price: maker ? (makerPrice ?? undefined) : undefined,
        postOnly: maker,
        leverage: this.config.leverage,
        marginMode: this.config.marginMode,
        clientOrderId,
      });
      this.applyOrderResult(order, result);
      this.options.repo.updateOrder(order);

      if (result.status === 'filled') {
        await this.openPositionFromFill(trade, result);
        return;
      }
      if (result.status === 'open') {
        this.pending = {
          tradeId,
          orderId: order.id,
          clientOrderId,
          exchangeOrderId: result.exchangeOrderId || null,
          symbol: this.symbol,
          side,
          qty: decision.qty,
          price: maker ? (makerPrice ?? snapshot.mid) : snapshot.mid,
          expiresAt: now + (maker ? this.config.strategy.makerTimeoutMs : 5_000),
          fallbackAttempted: !maker,
          riskUsd: decision.riskUsd,
          notionalUsd: decision.notionalUsd,
          marginUsd: decision.marginUsd,
          reason,
          createdAt: now,
          lastRequoteAt: now,
          requotes: 0,
          cancelFailures: 0,
          filledQty: 0,
          filledBase: 0,
          feeBase: 0,
          fee: 0,
          avgPrice: null,
        };
        this.absorbFill(this.pending, result);
        this.log('info', 'Ordem de entrada aberta', {
          tradeId,
          side,
          type: maker ? 'maker' : 'taker',
          price: this.pending.price,
          qty: decision.qty,
        });
        this.emitStatus();
        return;
      }

      await this.rejectTrade(trade, order, result.error ?? 'Ordem rejeitada');
      if (maker) await this.tryTakerFallback(side, reason, 'post_only_rejected');
    } catch (error) {
      const message = friendlyError(error);
      if (trade.status === 'pending') await this.rejectTrade(trade, order, message);
      this.lastError = message;
      this.log('warn', 'Falha ao enviar ordem de entrada; estado da ordem é incerto', {
        error: message,
      });
      // The submit may have reached the exchange even though the response was
      // lost. Stop and cancel all instead of risking a second entry.
      await this.halt('error', false);
    }
  }

  /**
   * A maker entry that cannot rest is retried once as taker only when the
   * configuration allows it. The guard is re-evaluated so the fallback can
   * never bypass risk limits.
   */
  private async tryTakerFallback(side: Side, reason: string, cause: string): Promise<void> {
    if (!this.config.strategy.allowTakerFallback) return;
    const snapshot = this.marketView.snapshot;
    if (!snapshot) return;
    const now = this.now();
    const decision = evaluateEntry(
      {
        config: this.config,
        contract: this.contract,
        snapshot,
        equity: this.currentEquity(),
        availableBalance: this.currentAvailable(),
        dayPnl: this.realizedDay,
        dayTrades: this.tradesDay,
        consecutiveLosses: this.consecutiveLosses,
        lastLossAt: this.lastLossAt,
        ordersLastMinute: this.ordersLastMinute(now),
        openPositions: this.position ? 1 : 0,
        now,
        mode: this.mode,
      },
      side,
    );
    if (!decision.allowed) {
      this.logBlocked(decision.reason, decision.detail, now);
      return;
    }

    this.entryMetrics.takerFallbacks += 1;
    this.entryMetrics.fallbackCostUsd +=
      decision.notionalUsd *
      Math.max(0, this.config.execution.feeTaker - this.config.execution.feeMaker);
    this.log('warn', 'Fallback taker acionado', {
      cause,
      notional: round(decision.notionalUsd),
    });
    await this.placeEntry(side, decision, `${reason} fallback=taker`, true);
  }

  private async processFills(fills: OrderResult[]): Promise<void> {
    for (const fill of fills) {
      const pending = this.pending;
      if (!pending || fill.clientOrderId !== pending.clientOrderId) continue;
      const trade = this.options.repo.getTrade(pending.tradeId);
      if (!trade) {
        this.pending = null;
        return;
      }

      const added = this.absorbFill(pending, fill);
      if (added > 0 && fill.status === 'open' && isPartialFill(pending.qty, pending.filledQty)) {
        this.log('info', 'Fill maker parcial recebido', {
          tradeId: pending.tradeId,
          filledQty: pending.filledQty,
          requestedQty: pending.qty,
          avgPrice: pending.avgPrice,
        });
        this.emitStatus();
      }

      if (fill.status === 'filled') {
        await this.openPositionFromFill(trade, fill);
        return;
      }
      if (fill.status === 'rejected' || fill.status === 'canceled') {
        await this.handlePendingTerminal(trade, fill);
        return;
      }
    }
  }

  private async managePending(now: number): Promise<void> {
    const pending = this.pending;
    if (!pending) return;

    if (this.mode === 'live' && this.broker) {
      const result = await this.pollPendingOrder(pending);
      if (result) {
        const trade = this.options.repo.getTrade(pending.tradeId);
        if (!trade) {
          this.pending = null;
          return;
        }
        this.applyPolledResult(pending, result);
        if (result.status === 'filled') {
          await this.openPositionFromFill(trade, result);
          return;
        }
        if (result.status === 'rejected' || result.status === 'canceled') {
          await this.handlePendingTerminal(trade, result);
          return;
        }
      }
    }

    if (now >= pending.expiresAt) {
      await this.expirePending(now);
      return;
    }

    const trade = this.options.repo.getTrade(pending.tradeId);
    const snapshot = this.marketView.snapshot;
    if (!trade || !snapshot || pending.fallbackAttempted) return;
    const decision = evaluateRequote({
      side: pending.side,
      bid: snapshot.bid,
      ask: snapshot.ask,
      priceUnit: this.contract.priceUnit,
      currentPrice: pending.price,
      requotes: pending.requotes,
      maxRequotes: this.config.strategy.maxRequotes,
      elapsedSinceLastQuoteMs: now - pending.lastRequoteAt,
      requoteAfterMs: this.config.strategy.requoteAfterMs,
      requoteMinMoveBps: this.config.strategy.requoteMinMoveBps,
    });
    if (decision.action !== 'requote') return;
    this.log('info', 'Requote maker: preço passivo melhorou', {
      tradeId: trade.id,
      from: pending.price,
      to: decision.price,
      improvementBps: round(decision.improvementBps, 2),
    });
    await this.requotePending(trade, pending, now, { price: decision.price });
  }

  private async requotePending(
    trade: Trade,
    pending: PendingEntry,
    now: number,
    options: { price?: number; skipCancel?: boolean } = {},
  ): Promise<void> {
    if (this.pending !== pending) return;

    if (options.skipCancel) {
      this.markRestingOrder(pending, 'rejected');
    } else {
      const canceled = await this.cancelResting(pending);
      if (!canceled) {
        await this.handleCancelFailure(now);
        return;
      }
      this.markRestingOrder(pending, 'canceled');

      // The exchange may fill between our cancel and the acknowledgement.
      const late = await this.pollPendingOrder(pending);
      if (late) {
        this.applyPolledResult(pending, late);
        if (late.status === 'filled' || pending.filledQty > 0) {
          await this.openPositionFromFill(trade, late);
          return;
        }
      }
    }

    const price =
      options.price ??
      makerLimitPrice({
        side: pending.side,
        bid: this.marketView.snapshot?.bid ?? 0,
        ask: this.marketView.snapshot?.ask ?? 0,
        priceUnit: this.contract.priceUnit,
      });
    if (price === null) {
      await this.finalizePending('requote_failed');
      return;
    }

    const qty = remainingQty(pending.qty, pending.filledQty);
    if (qty <= 0) {
      await this.openPositionFromFill(trade, this.pendingFill(pending));
      return;
    }

    const clientOrderId = id('gz', 10);
    const order: OrderRecord = {
      id: id('ord'),
      tradeId: trade.id,
      exchangeOrderId: null,
      clientOrderId,
      symbol: this.symbol,
      side: pending.side,
      action: 'open',
      type: 'limit',
      price,
      qty,
      filledQty: 0,
      avgPrice: null,
      fee: 0,
      status: 'pending',
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.options.repo.insertOrder(order);
    this.orderTimestamps.push(now);

    pending.filledBase = pending.filledQty;
    pending.feeBase = pending.fee;
    pending.price = price;
    pending.requotes += 1;
    pending.lastRequoteAt = now;
    this.entryMetrics.requotes += 1;

    try {
      const result = await this.broker?.placeOrder({
        symbol: this.symbol,
        side: pending.side,
        action: 'open',
        type: 'limit',
        qty,
        price,
        postOnly: true,
        leverage: this.config.leverage,
        marginMode: this.config.marginMode,
        clientOrderId,
      });
      if (!result) {
        await this.finalizePending('requote_failed');
        return;
      }

      this.applyOrderResult(order, result);
      this.options.repo.updateOrder(order);
      pending.orderId = order.id;
      pending.clientOrderId = clientOrderId;
      pending.exchangeOrderId = result.exchangeOrderId || null;
      this.absorbFill(pending, result);

      if (result.status === 'filled') {
        await this.openPositionFromFill(trade, result);
        return;
      }
      if (result.status === 'open') {
        this.log('info', 'Requote maker enviado', {
          tradeId: trade.id,
          price,
          qty,
          requotes: pending.requotes,
        });
        this.emitStatus();
        return;
      }
      await this.handlePendingTerminal(trade, result);
    } catch (error) {
      const message = friendlyError(error);
      order.status = 'rejected';
      order.error = message;
      order.updatedAt = now;
      this.options.repo.updateOrder(order);
      this.log('warn', 'Falha no requote maker; estado da ordem é incerto', {
        tradeId: trade.id,
        error: message,
      });
      this.lastError = 'Falha ao enviar requote maker. O bot foi pausado para reconciliar ordens.';
      this.finalizePending('requote_failed');
      this.emitStatus();
      await this.halt('error', false);
    }
  }

  private async handlePendingTerminal(trade: Trade, result: OrderResult): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    this.absorbFill(pending, result);

    if (result.status === 'filled' || pending.filledQty > 0) {
      await this.openPositionFromFill(trade, result);
      return;
    }

    const maker = trade.meta.entryStyle === 'maker';
    if (
      result.status === 'rejected' &&
      maker &&
      !pending.fallbackAttempted &&
      pending.requotes < this.config.strategy.maxRequotes
    ) {
      this.log('warn', 'Post-only rejeitado; tentando novo preço passivo', {
        tradeId: trade.id,
        requotes: pending.requotes,
      });
      await this.requotePending(trade, pending, this.now(), { skipCancel: true });
      return;
    }

    const side = pending.side;
    const reason = pending.reason;
    const shouldFallback =
      result.status === 'rejected' &&
      maker &&
      !pending.fallbackAttempted &&
      this.config.strategy.allowTakerFallback;
    await this.finalizePending(
      result.status === 'rejected' ? 'rejected' : 'canceled',
      result.status === 'rejected' ? 'rejected' : 'canceled',
    );
    if (shouldFallback) await this.tryTakerFallback(side, reason, 'post_only_rejected');
  }

  private async expirePending(now: number): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    const trade = this.options.repo.getTrade(pending.tradeId);
    if (!trade) {
      this.pending = null;
      return;
    }

    const canceled = await this.cancelResting(pending);
    if (!canceled) {
      await this.handleCancelFailure(now);
      return;
    }
    this.markRestingOrder(pending, 'canceled');

    // A late fill can land after the cancel was acknowledged.
    const late = await this.pollPendingOrder(pending);
    if (late) {
      this.applyPolledResult(pending, late);
    }
    if (pending.filledQty > 0) {
      await this.openPositionFromFill(trade, late ?? this.pendingFill(pending));
      return;
    }

    const side = pending.side;
    const reason = pending.reason;
    const shouldFallback =
      trade.meta.entryStyle === 'maker' &&
      !pending.fallbackAttempted &&
      this.config.strategy.allowTakerFallback;
    await this.finalizePending('expired');
    if (shouldFallback) await this.tryTakerFallback(side, reason, 'maker_timeout');
  }

  private async handleCancelFailure(now: number): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    pending.cancelFailures += 1;

    const late = await this.pollPendingOrder(pending);
    if (late) {
      this.applyPolledResult(pending, late);
      if (late.status === 'filled' || pending.filledQty > 0) {
        const trade = this.options.repo.getTrade(pending.tradeId);
        if (trade) await this.openPositionFromFill(trade, late);
        return;
      }
    }

    if (pending.cancelFailures >= 3) {
      this.lastError =
        'Não foi possível cancelar a ordem maker. O bot foi pausado para evitar ordem duplicada.';
      this.log('error', this.lastError, { tradeId: pending.tradeId });
      this.emitStatus();
      void this.halt('error', false);
      return;
    }

    pending.expiresAt = now + 500;
    this.log('warn', 'Cancelamento da ordem maker falhou; nova tentativa em 500ms', {
      tradeId: pending.tradeId,
      attempt: pending.cancelFailures,
    });
    this.emitStatus();
  }

  private async cancelPending(reason: string): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    const canceled = await this.cancelResting(pending);
    if (!canceled) {
      this.log('warn', 'Cancelamento não confirmado; o broker fará cancel_all no shutdown', {
        tradeId: pending.tradeId,
      });
    }

    const trade = this.options.repo.getTrade(pending.tradeId);
    if (pending.filledQty > 0 && trade) {
      // Never discard a partial fill: it is a real exchange position.
      await this.openPositionFromFill(trade, this.pendingFill(pending));
      return;
    }
    this.markRestingOrder(pending, 'canceled');
    this.pending = null;
    if (trade && trade.status === 'pending') {
      trade.status = 'canceled';
      trade.closeReason = reason;
      trade.updatedAt = this.now();
      this.options.repo.updateTrade(trade);
    }
    this.emitStatus();
  }

  private async cancelResting(pending: PendingEntry): Promise<boolean> {
    try {
      await this.broker?.cancelOrder({
        exchangeOrderId: pending.exchangeOrderId,
        clientOrderId: pending.clientOrderId,
      });
      return true;
    } catch (error) {
      this.log('warn', 'Falha ao cancelar ordem pendente', {
        tradeId: pending.tradeId,
        error: friendlyError(error),
      });
      return false;
    }
  }

  private async pollPendingOrder(pending: PendingEntry): Promise<OrderResult | null> {
    try {
      return (
        (await this.broker?.pollOrder({
          exchangeOrderId: pending.exchangeOrderId,
          clientOrderId: pending.clientOrderId,
        })) ?? null
      );
    } catch (error) {
      this.log('warn', 'Falha ao consultar ordem pendente', {
        tradeId: pending.tradeId,
        error: friendlyError(error),
      });
      return null;
    }
  }

  private applyPolledResult(pending: PendingEntry, result: OrderResult): void {
    this.absorbFill(pending, result);
    const order = this.options.repo.getOrderByClientId(pending.clientOrderId);
    if (!order) return;
    this.applyOrderResult(order, result);
    order.filledQty = Math.max(0, pending.filledQty - pending.filledBase);
    this.options.repo.updateOrder(order);
  }

  /**
   * Adds the current order's fills to the pending entry. `filledBase` keeps
   * fills from earlier requoted orders, so the total is never double-counted.
   */
  private absorbFill(pending: PendingEntry, result: OrderResult): number {
    const merged = mergeFill(
      {
        requestedQty: pending.qty,
        filledBase: pending.filledBase,
        filledQty: pending.filledQty,
        avgPrice: pending.avgPrice,
        price: pending.price,
      },
      { filledQty: result.filledQty ?? 0, avgPrice: result.avgPrice },
    );

    pending.fee = Number((pending.feeBase + (result.fee ?? 0)).toFixed(8));
    if (merged.added <= 0) return 0;
    pending.avgPrice = merged.avgPrice;
    pending.filledQty = merged.filledQty;
    return merged.added;
  }

  private markRestingOrder(pending: PendingEntry, status: 'canceled' | 'rejected'): void {
    const order = this.options.repo.getOrderByClientId(pending.clientOrderId);
    if (!order) return;
    order.filledQty = Math.max(0, Number((pending.filledQty - pending.filledBase).toFixed(8)));
    order.avgPrice = pending.avgPrice;
    order.fee = Math.max(0, Number((pending.fee - pending.feeBase).toFixed(8)));
    order.status = status;
    order.updatedAt = this.now();
    this.options.repo.updateOrder(order);
  }

  private finalizePending(reason: string, status: 'canceled' | 'rejected' = 'canceled'): void {
    const pending = this.pending;
    if (!pending) return;
    this.markRestingOrder(pending, status);
    this.pending = null;
    const trade = this.options.repo.getTrade(pending.tradeId);
    if (trade && trade.status === 'pending') {
      trade.status = status === 'rejected' ? 'rejected' : 'canceled';
      trade.closeReason = reason;
      trade.updatedAt = this.now();
      this.options.repo.updateTrade(trade);
    }
    this.emitStatus();
  }

  private pendingFill(pending: PendingEntry): OrderResult {
    return {
      exchangeOrderId: pending.exchangeOrderId ?? '',
      clientOrderId: pending.clientOrderId,
      status: 'filled',
      filledQty: pending.filledQty,
      avgPrice: pending.avgPrice,
      fee: pending.fee,
    };
  }

  private async openPositionFromFill(trade: Trade, fill: OrderResult): Promise<void> {
    const pending = this.pending;
    const requestedQty = pending?.qty ?? trade.qty;
    const qty = pending && pending.filledQty > 0 ? pending.filledQty : fill.filledQty;
    const entryPrice =
      pending?.avgPrice ?? fill.avgPrice ?? pending?.price ?? this.marketView.snapshot?.mid;
    if (!entryPrice || qty <= 0) return;
    const entryFee = pending?.fee ?? fill.fee;
    const partial = isPartialFill(requestedQty, qty);
    const notional = notionalUsd(entryPrice, qty, this.contract.contractSize);
    const margin = notional / this.config.leverage;
    const stopDistance = (entryPrice * this.config.strategy.stopLossBps) / 10_000;
    const stopPrice =
      trade.side === 'long'
        ? entryPrice * (1 - this.config.strategy.stopLossBps / 10_000)
        : entryPrice * (1 + this.config.strategy.stopLossBps / 10_000);
    const takeProfitPrice =
      trade.side === 'long'
        ? entryPrice * (1 + this.config.strategy.takeProfitBps / 10_000)
        : entryPrice * (1 - this.config.strategy.takeProfitBps / 10_000);
    const now = this.now();

    trade.status = 'open';
    trade.entryPrice = entryPrice;
    trade.qty = qty;
    trade.notionalUsd = round(notional);
    trade.marginUsd = round(margin);
    trade.fees = entryFee;
    trade.riskUsd = round(qty * stopDistance * this.contract.contractSize);
    trade.openedAt = now;
    trade.updatedAt = now;
    trade.meta = {
      ...trade.meta,
      stopPrice,
      takeProfitPrice,
      exchangeOrderId: fill.exchangeOrderId,
      requestedQty,
      partialFill: partial,
      requotes: pending?.requotes ?? 0,
    };
    this.options.repo.updateTrade(trade);

    const order = this.options.repo.getOrderByClientId(fill.clientOrderId);
    if (order) {
      this.applyOrderResult(order, fill);
      order.status = partial ? 'canceled' : 'filled';
      order.filledQty = qty;
      order.avgPrice = entryPrice;
      order.fee = entryFee;
      this.options.repo.updateOrder(order);
    }

    this.position = {
      tradeId: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      qty,
      entryPrice,
      entryFee,
      notionalUsd: notional,
      marginUsd: margin,
      leverage: trade.leverage,
      stopPrice,
      takeProfitPrice,
      trailingStopPrice: null,
      openedAt: now,
      riskUsd: trade.riskUsd,
      exchangePositionId:
        this.mode === 'live' ? await this.fetchExchangePositionId(trade.side) : null,
    };

    if (trade.meta.entryStyle === 'maker') {
      this.entryMetrics.makerFills += 1;
      this.entryMetrics.makerFillMsTotal += Math.max(0, now - (pending?.createdAt ?? now));
      this.entryMetrics.makerFillSamples += 1;
    }
    if (partial) this.entryMetrics.partialFills += 1;

    this.pending = null;
    this.options.events.publish('trade', trade);
    this.log('info', partial ? 'Posição aberta com fill parcial' : 'Posição aberta', {
      tradeId: trade.id,
      side: trade.side,
      entryPrice,
      qty,
      requestedQty,
      notional: round(notional),
      requotes: pending?.requotes ?? 0,
    });
    this.emitStatus();
    this.updateDailyStats();
    this.recordEquity(true);
  }

  private async closeCurrent(reason: string): Promise<boolean> {
    const position = this.position;
    const broker = this.broker;
    if (!position || !broker) return false;

    this.orderTimestamps.push(this.now());
    try {
      const result = await broker.closePosition({
        symbol: position.symbol,
        side: position.side,
        qty: position.qty,
        positionId: position.exchangePositionId ?? undefined,
      });
      this.applyClose(position, result, reason);
      return true;
    } catch (error) {
      this.lastError = friendlyError(error);
      this.log('error', 'Falha ao fechar posição', {
        error: this.lastError,
        tradeId: position.tradeId,
      });
      this.options.notifier.notifyCloseFailure(position.tradeId, this.lastError);
      this.emitStatus();
      return false;
    }
  }

  private applyClose(position: RuntimePosition, fill: CloseResult, reason: string): void {
    const trade = this.options.repo.getTrade(position.tradeId);
    if (!trade) return;
    const gross = grossPnl(
      position.side,
      position.entryPrice,
      fill.exitPrice,
      fill.filledQty,
      this.contract.contractSize,
    );
    const fees = round(position.entryFee + fill.fee);
    const net = round(gross - fees);
    const now = this.now();

    trade.status = 'closed';
    trade.exitPrice = fill.exitPrice;
    trade.qty = fill.filledQty;
    trade.fees = fees;
    trade.grossPnl = gross;
    trade.netPnl = net;
    trade.rMultiple = rMultiple(net, position.riskUsd);
    trade.closeReason = reason;
    trade.closedAt = now;
    trade.updatedAt = now;
    this.options.repo.updateTrade(trade);

    this.position = null;
    this.realizedDay = round(this.realizedDay + net);
    this.feesDay = round(this.feesDay + fees);
    this.tradesDay += 1;
    if (net > 0) {
      this.winsDay += 1;
      this.consecutiveLosses = 0;
    } else {
      this.lossesDay += 1;
      this.consecutiveLosses += 1;
      this.lastLossAt = now;
    }
    this.state = { ...this.state, ...this.snapshotCounters() };
    this.persistState();
    this.updateDailyStats();
    this.recordEquity(true);
    this.options.events.publish('trade', trade);
    this.options.notifier.notifyTrade(trade);
    this.log(net >= 0 ? 'info' : 'warn', 'Posição fechada', {
      tradeId: trade.id,
      reason,
      netPnl: net,
      rMultiple: trade.rMultiple,
    });
    this.emitStatus();
  }

  private guardTriggered(): HaltReason | null {
    const unrealized = this.position ? this.unrealizedNet() : 0;
    const dayPnl = this.realizedDay + unrealized;
    if (dayPnl <= -Math.abs(this.config.daily.lossLimitUsd)) return 'daily_stop';
    if (
      this.config.daily.stopOnTarget &&
      this.config.daily.profitTargetUsd > 0 &&
      dayPnl >= this.config.daily.profitTargetUsd
    ) {
      return 'daily_target';
    }
    if (this.tradesDay >= this.config.risk.maxTradesPerDay) return 'max_trades';
    if (this.consecutiveLosses >= this.config.risk.maxConsecutiveLosses) {
      return 'consecutive_losses';
    }
    return null;
  }

  private async halt(reason: HaltReason, closePosition: boolean): Promise<void> {
    if (this.halting) return;
    this.halting = true;
    this.status = 'halted';
    this.haltReason = reason;
    this.stoppedAt = this.now();
    this.clearTimers();
    this.log('warn', 'Bot pausado pelo risk guard', { reason });
    if (reason === 'daily_stop' || reason === 'daily_target') {
      this.options.notifier.notifyDaily(
        reason,
        this.realizedDay + (this.position ? this.unrealizedNet() : 0),
        `daily:${reason}:${this.day}`,
      );
    } else {
      this.options.notifier.notifyHalt(
        reason,
        this.getStatus().lastError ?? '',
        `halt:${reason}:${this.startedAt ?? this.stoppedAt ?? 0}`,
      );
    }
    if (this.pending) await this.cancelPending(reason);
    if (closePosition && this.position) await this.closeCurrent(reason);
    try {
      await this.broker?.disconnect();
    } catch {
      // ignore
    }
    this.broker = null;
    this.persistState();
    this.updateDailyStats();
    this.emitStatus();
    this.options.repo.insertAudit({
      ts: this.now(),
      actor: 'risk-engine',
      action: 'bot.halt',
      detail: JSON.stringify({ reason, closePosition }),
      ip: null,
    });
    this.halting = false;
  }

  private rollDay(now: number): void {
    this.updateDailyStats();
    const previousDay = this.day;
    this.day = dayKey(now, this.config.daily.resetHourUtc);
    this.realizedDay = 0;
    this.feesDay = 0;
    this.tradesDay = 0;
    this.winsDay = 0;
    this.lossesDay = 0;
    this.consecutiveLosses = 0;
    this.lastLossAt = null;
    this.dailyStartEquity = this.currentEquity();
    this.state = { ...this.state, dayKey: this.day, ...this.snapshotCounters() };
    this.persistState();
    this.log('info', 'Novo dia de trading', { previousDay, day: this.day });
  }

  private rehydrateDay(): void {
    const dayStart = dayStartMs(this.day, this.config.daily.resetHourUtc);
    const trades = this.options.repo.getClosedTradesSince(dayStart, this.mode);
    this.realizedDay = this.options.repo.getNetPnlSince(dayStart, this.mode);
    this.feesDay = this.options.repo.getFeesSince(dayStart, this.mode);
    this.tradesDay = trades.length;
    this.winsDay = trades.filter((trade) => trade.netPnl > 0).length;
    this.lossesDay = trades.filter((trade) => trade.netPnl <= 0).length;
    this.consecutiveLosses = 0;
    this.lastLossAt = null;
    for (const trade of [...trades].reverse()) {
      if (trade.netPnl > 0) break;
      this.consecutiveLosses += 1;
      this.lastLossAt = trade.closedAt;
    }
    this.dailyStartEquity =
      this.options.repo.getDailyStats(this.day)?.startEquity ??
      Math.max(0.01, this.currentEquity() - this.realizedDay);
    this.state = { ...this.state, dayKey: this.day, ...this.snapshotCounters() };
    this.persistState();
  }

  private handleBrokerReconnect(reconciliation: BrokerReconciliation): void {
    if (this.status !== 'running' || this.halting) return;
    if (this.processing) {
      this.deferredReconcile = reconciliation;
      return;
    }

    const decision = evaluateReconciliation(
      {
        position: this.position ? { side: this.position.side, qty: this.position.qty } : null,
        pending: Boolean(this.pending),
      },
      reconciliation,
    );

    this.log('warn', 'Private WS reconectado; estado reconciliado', {
      ...reconciliation,
      decision: decision.action,
      code: decision.code,
    });
    this.options.repo.insertAudit({
      ts: this.now(),
      actor: 'risk-engine',
      action: 'broker.reconcile.reconnect',
      detail: JSON.stringify({ ...reconciliation, decision: decision.action, code: decision.code }),
      ip: null,
    });

    if (decision.action === 'ok') return;
    if (decision.action === 'await_fill') {
      this.log('warn', decision.message);
      return;
    }

    this.lastError = decision.message;
    this.emitStatus();
    void this.halt('error', false);
  }

  private prepareOpenTrades(mode: BotMode): void {
    const openTrades = this.options.repo.getOpenTrades();
    for (const trade of openTrades) {
      if (trade.status === 'pending') {
        trade.status = 'canceled';
        trade.closeReason = 'restart_cleanup';
        trade.updatedAt = this.now();
        this.options.repo.updateTrade(trade);
        continue;
      }
      if (mode === 'live') {
        throw new HttpError(
          409,
          'open_trade_exists',
          'Existe um trade aberto no banco. Feche a posição na MEXC e limpe o trade antes de iniciar.',
        );
      }
      if (this.position) {
        if (this.position.tradeId === trade.id && this.position.symbol === trade.symbol) {
          // A paper position adopted by bootstrap is already the runtime state.
          continue;
        }
        throw new HttpError(
          409,
          'multiple_positions',
          'Existe mais de um trade aberto no paper mode.',
        );
      }
      const stopPrice =
        typeof trade.meta.stopPrice === 'number'
          ? trade.meta.stopPrice
          : trade.entryPrice
            ? trade.entryPrice *
              (trade.side === 'long'
                ? 1 - this.config.strategy.stopLossBps / 10_000
                : 1 + this.config.strategy.stopLossBps / 10_000)
            : 0;
      const takeProfitPrice =
        typeof trade.meta.takeProfitPrice === 'number'
          ? trade.meta.takeProfitPrice
          : trade.entryPrice
            ? trade.entryPrice *
              (trade.side === 'long'
                ? 1 + this.config.strategy.takeProfitBps / 10_000
                : 1 - this.config.strategy.takeProfitBps / 10_000)
            : 0;
      this.position = {
        tradeId: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        qty: trade.qty,
        entryPrice: trade.entryPrice ?? 0,
        entryFee: trade.fees,
        notionalUsd: trade.notionalUsd,
        marginUsd: trade.marginUsd,
        leverage: trade.leverage,
        stopPrice,
        takeProfitPrice,
        trailingStopPrice: null,
        openedAt: trade.openedAt ?? trade.createdAt,
        riskUsd: trade.riskUsd,
        exchangePositionId: null,
      };
    }
  }

  private adoptPersistedPosition(): void {
    const open = this.options.repo.getOpenTrades().filter((trade) => trade.status === 'open');
    if (!open.length) return;
    const trade = open[0];
    if (!trade) return;
    this.position = {
      tradeId: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      qty: trade.qty,
      entryPrice: trade.entryPrice ?? 0,
      entryFee: trade.fees,
      notionalUsd: trade.notionalUsd,
      marginUsd: trade.marginUsd,
      leverage: trade.leverage,
      stopPrice:
        typeof trade.meta.stopPrice === 'number'
          ? trade.meta.stopPrice
          : (trade.entryPrice ?? 0) * 0.999,
      takeProfitPrice:
        typeof trade.meta.takeProfitPrice === 'number'
          ? trade.meta.takeProfitPrice
          : (trade.entryPrice ?? 0) * 1.001,
      trailingStopPrice: null,
      openedAt: trade.openedAt ?? trade.createdAt,
      riskUsd: trade.riskUsd,
      exchangePositionId: null,
    };
  }

  private positionView(mark: number | null): PositionView | null {
    const position = this.position;
    if (!position) return null;
    const markPrice = mark ?? position.entryPrice;
    const gross = grossPnl(
      position.side,
      position.entryPrice,
      markPrice,
      position.qty,
      this.contract.contractSize,
    );
    const exitFee =
      notionalUsd(markPrice, position.qty, this.contract.contractSize) *
      this.config.execution.feeTaker;
    const unrealized = round(gross - position.entryFee - exitFee);
    return {
      id: position.tradeId,
      symbol: position.symbol,
      side: position.side,
      qty: position.qty,
      entryPrice: position.entryPrice,
      markPrice,
      notionalUsd: round(notionalUsd(markPrice, position.qty, this.contract.contractSize)),
      marginUsd: round(position.marginUsd),
      leverage: position.leverage,
      unrealizedPnl: unrealized,
      unrealizedPct: position.marginUsd > 0 ? round((unrealized / position.marginUsd) * 100, 2) : 0,
      openedAt: position.openedAt,
      stopPrice: position.stopPrice,
      takeProfitPrice: position.takeProfitPrice,
      trailingStopPrice: position.trailingStopPrice,
    };
  }

  private unrealizedNet(): number {
    const position = this.position;
    const mark = this.marketView.snapshot?.mid;
    if (!position || !mark) return 0;
    const view = this.positionView(mark);
    return view?.unrealizedPnl ?? 0;
  }

  private currentEquity(): number {
    if (this.mode === 'live') return this.accountEquity;
    return (
      this.config.paper.startingBalance +
      this.options.repo.getRealizedPnl('paper') +
      this.unrealizedNet()
    );
  }

  private currentAvailable(): number {
    if (this.mode === 'live') return this.availableBalance;
    return Math.max(0, this.currentEquity() - (this.position?.marginUsd ?? 0));
  }

  private refreshEquity(): void {
    this.accountEquity =
      this.mode === 'live'
        ? this.accountEquity
        : this.config.paper.startingBalance + this.options.repo.getRealizedPnl('paper');
    this.availableBalance = this.mode === 'live' ? this.availableBalance : this.accountEquity;
  }

  private async refreshAccount(): Promise<void> {
    if (this.mode !== 'live' || !this.broker) return;
    try {
      this.accountEquity = await this.broker.getEquity();
      this.availableBalance = await this.broker.getAvailableBalance();
      this.emitStatus();
    } catch (error) {
      this.log('warn', 'Falha ao atualizar saldo da MEXC', { error: friendlyError(error) });
    }
  }

  private async fetchExchangePositionId(side: Side): Promise<number | null> {
    if (!this.broker?.getExchangePositionId) return null;
    try {
      return await this.broker.getExchangePositionId(this.symbol, side);
    } catch {
      return null;
    }
  }

  private recordEquity(force: boolean): void {
    const now = this.now();
    if (!force && now - this.lastEquityAt < 15_000) return;
    this.lastEquityAt = now;
    const position = this.positionView(this.marketView.snapshot?.mid ?? null);
    const unrealized = position?.unrealizedPnl ?? 0;
    const equity = this.currentEquity();
    const balance =
      this.mode === 'live'
        ? this.accountEquity
        : this.config.paper.startingBalance + this.options.repo.getRealizedPnl('paper');
    this.options.repo.insertEquity({
      ts: now,
      equity: round(equity),
      balance: round(balance),
      unrealized: round(unrealized),
      dayPnl: round(this.realizedDay + unrealized),
    });
    this.options.events.publish('equity', {
      ts: now,
      equity: round(equity),
      balance: round(balance),
      unrealized: round(unrealized),
      dayPnl: round(this.realizedDay + unrealized),
    });
  }

  private updateDailyStats(): void {
    const equity = this.currentEquity();
    const start = this.options.repo.getDailyStats(this.day)?.startEquity ?? this.dailyStartEquity;
    const dayEquity = this.options.repo
      .listEquity(dayStartMs(this.day, this.config.daily.resetHourUtc))
      .map((point) => point.equity)
      .concat(equity);
    this.options.repo.upsertDailyStats({
      dayKey: this.day,
      startEquity: round(start),
      endEquity: round(equity),
      realizedPnl: round(this.realizedDay),
      fees: round(this.feesDay),
      trades: this.tradesDay,
      wins: this.winsDay,
      losses: this.lossesDay,
      targetHit:
        this.config.daily.profitTargetUsd > 0 &&
        this.realizedDay >= this.config.daily.profitTargetUsd,
      stopHit: this.realizedDay <= -Math.abs(this.config.daily.lossLimitUsd),
      maxDrawdownPct: maxDrawdownPct(dayEquity),
      updatedAt: this.now(),
    });
  }

  private persistState(): void {
    this.state = {
      status: this.status,
      mode: this.mode,
      dayKey: this.day,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      haltReason: this.haltReason,
      lastError: this.lastError,
      realizedDay: this.realizedDay,
      feesDay: this.feesDay,
      tradesDay: this.tradesDay,
      winsDay: this.winsDay,
      lossesDay: this.lossesDay,
      consecutiveLosses: this.consecutiveLosses,
      lastLossAt: this.lastLossAt,
      updatedAt: this.now(),
    };
    this.options.repo.saveState(this.state);
  }

  private snapshotCounters() {
    return {
      realizedDay: this.realizedDay,
      feesDay: this.feesDay,
      tradesDay: this.tradesDay,
      winsDay: this.winsDay,
      lossesDay: this.lossesDay,
      consecutiveLosses: this.consecutiveLosses,
      lastLossAt: this.lastLossAt,
    };
  }

  private startTimers(): void {
    this.clearTimers();
    this.accountTimer = setInterval(() => void this.refreshAccount(), 15_000);
    this.statusTimer = setInterval(() => {
      this.emitStatus();
      if (this.status === 'running') this.updateDailyStats();
    }, 30_000);
  }

  private clearTimers(): void {
    if (this.accountTimer) clearInterval(this.accountTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.accountTimer = null;
    this.statusTimer = null;
  }

  private emitStatus(): void {
    this.lastStatusAt = this.now();
    this.options.events.publish('status', this.getStatus());
  }

  private ordersLastMinute(now: number): number {
    this.orderTimestamps = this.orderTimestamps.filter((timestamp) => now - timestamp < 60_000);
    return this.orderTimestamps.length;
  }

  private logBlocked(reason: string, detail: string, now: number): void {
    if (reason === this.lastGuardReason && now - this.lastGuardLogAt < 5_000) return;
    this.lastGuardReason = reason;
    this.lastGuardLogAt = now;
    this.log('debug', 'Entrada bloqueada pelo risco', { reason, detail });
  }

  private async rejectTrade(trade: Trade, order: OrderRecord, error: string): Promise<void> {
    trade.status = 'rejected';
    trade.closeReason = error;
    trade.updatedAt = this.now();
    this.options.repo.updateTrade(trade);
    order.status = 'rejected';
    order.error = error;
    order.updatedAt = this.now();
    this.options.repo.updateOrder(order);
    this.options.events.publish('trade', trade);
    this.emitStatus();
  }

  private applyOrderResult(order: OrderRecord, result: OrderResult): void {
    order.exchangeOrderId = result.exchangeOrderId || null;
    order.filledQty = result.filledQty;
    order.avgPrice = result.avgPrice;
    order.fee = result.fee;
    order.status = result.status;
    order.error = result.error ?? null;
    order.updatedAt = this.now();
  }

  private async loadContract(
    client: MexcFuturesClient,
    symbol: string,
    mode: BotMode,
  ): Promise<ContractSpec> {
    try {
      return await client.getContract(symbol);
    } catch (error) {
      if (mode === 'paper') {
        this.log('warn', 'Contrato indisponível; usando metadados fallback no paper', {
          symbol,
          error: friendlyError(error),
        });
        return fallbackContract(symbol);
      }
      throw new HttpError(
        502,
        'contract_unavailable',
        `Não foi possível carregar o contrato ${symbol} da MEXC: ${friendlyError(error)}`,
      );
    }
  }

  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (level === 'debug') this.options.logger.debug(message, data);
    else this.options.logger[level](message, data);
  }
}

function id(prefix: string, bytes = 8): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`;
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}

function createEntryMetrics(): EntryMetricsInternal {
  return {
    makerAttempts: 0,
    makerFills: 0,
    takerFallbacks: 0,
    requotes: 0,
    partialFills: 0,
    makerFillMsTotal: 0,
    makerFillSamples: 0,
    fallbackCostUsd: 0,
  };
}

function friendlyError(error: unknown): string {
  if (error instanceof MexcApiError) return error.friendly;
  if (error instanceof Error) return error.message;
  return String(error);
}
