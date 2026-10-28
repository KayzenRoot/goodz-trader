import type {
  AuditEntry,
  BotConfig,
  BotStatus,
  DailyStats,
  EquityPoint,
  HaltReason,
  LogEntry,
  OrderRecord,
  Trade,
  TradeStatus,
} from '@goodz/core';

import type { Db } from './database';

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StoredConfig {
  config: BotConfig;
  secrets: string;
  updatedAt: number;
}

export interface BotStateRowInternal {
  status: BotStatus;
  mode: 'paper' | 'live';
  dayKey: string;
  startedAt: number | null;
  stoppedAt: number | null;
  haltReason: HaltReason | null;
  lastError: string | null;
  realizedDay: number;
  feesDay: number;
  tradesDay: number;
  winsDay: number;
  lossesDay: number;
  consecutiveLosses: number;
  lastLossAt: number | null;
  updatedAt: number;
}

export interface TradeQuery {
  limit: number;
  offset: number;
  status?: TradeStatus;
  symbol?: string;
  mode?: 'paper' | 'live';
}

interface TradeRow {
  id: string;
  mode: string;
  symbol: string;
  side: string;
  status: string;
  qty: number;
  contract_size: number;
  entry_price: number | null;
  exit_price: number | null;
  notional_usd: number;
  margin_usd: number;
  leverage: number;
  fees: number;
  gross_pnl: number;
  net_pnl: number;
  r_multiple: number;
  risk_usd: number;
  open_reason: string;
  close_reason: string;
  opened_at: number | null;
  closed_at: number | null;
  created_at: number;
  updated_at: number;
  is_demo: number;
  meta: string;
}

interface OrderRowDb {
  id: string;
  trade_id: string;
  exchange_order_id: string | null;
  client_order_id: string;
  symbol: string;
  side: string;
  action: string;
  type: string;
  price: number | null;
  qty: number;
  filled_qty: number;
  avg_price: number | null;
  fee: number;
  status: string;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface StateRowDb {
  status: string;
  mode: string;
  day_key: string;
  started_at: number | null;
  stopped_at: number | null;
  halt_reason: string | null;
  last_error: string | null;
  realized_day: number;
  fees_day: number;
  trades_day: number;
  wins_day: number;
  losses_day: number;
  consecutive_losses: number;
  last_loss_at: number | null;
  updated_at: number;
}

const now = () => Date.now();

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export class Repository {
  constructor(private readonly db: Db) {}

  // -------------------------------------------------------------------------
  // Config & bot state
  // -------------------------------------------------------------------------

  getConfig(): StoredConfig | null {
    const row = this.db
      .prepare('SELECT config, secrets, updated_at FROM bot_config WHERE id = 1')
      .get() as { config: string; secrets: string; updated_at: number } | undefined;
    if (!row) return null;
    return {
      config: parseJson<BotConfig>(row.config, {} as BotConfig),
      secrets: row.secrets,
      updatedAt: row.updated_at,
    };
  }

  saveConfig(config: BotConfig, encryptedSecrets: string): void {
    this.db
      .prepare(
        `INSERT INTO bot_config (id, config, secrets, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET config = excluded.config, secrets = excluded.secrets, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(config), encryptedSecrets, now());
  }

  ensureConfig(config: BotConfig, encryptedSecrets = ''): void {
    this.db
      .prepare(
        `INSERT INTO bot_config (id, config, secrets, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(JSON.stringify(config), encryptedSecrets, now());
  }

  getState(): BotStateRowInternal {
    const row = this.db.prepare('SELECT * FROM bot_state WHERE id = 1').get() as
      StateRowDb | undefined;
    if (!row) {
      const initial = this.defaultState();
      this.saveState(initial);
      return initial;
    }
    return {
      status: row.status as BotStatus,
      mode: row.mode === 'live' ? 'live' : 'paper',
      dayKey: row.day_key,
      startedAt: row.started_at,
      stoppedAt: row.stopped_at,
      haltReason: row.halt_reason as HaltReason | null,
      lastError: row.last_error,
      realizedDay: row.realized_day,
      feesDay: row.fees_day,
      tradesDay: row.trades_day,
      winsDay: row.wins_day,
      lossesDay: row.losses_day,
      consecutiveLosses: row.consecutive_losses,
      lastLossAt: row.last_loss_at,
      updatedAt: row.updated_at,
    };
  }

  saveState(state: BotStateRowInternal): void {
    this.db
      .prepare(
        `INSERT INTO bot_state (
          id, status, mode, day_key, started_at, stopped_at, halt_reason, last_error,
          realized_day, fees_day, trades_day, wins_day, losses_day, consecutive_losses,
          last_loss_at, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          mode = excluded.mode,
          day_key = excluded.day_key,
          started_at = excluded.started_at,
          stopped_at = excluded.stopped_at,
          halt_reason = excluded.halt_reason,
          last_error = excluded.last_error,
          realized_day = excluded.realized_day,
          fees_day = excluded.fees_day,
          trades_day = excluded.trades_day,
          wins_day = excluded.wins_day,
          losses_day = excluded.losses_day,
          consecutive_losses = excluded.consecutive_losses,
          last_loss_at = excluded.last_loss_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        state.status,
        state.mode,
        state.dayKey,
        state.startedAt,
        state.stoppedAt,
        state.haltReason,
        state.lastError,
        state.realizedDay,
        state.feesDay,
        state.tradesDay,
        state.winsDay,
        state.lossesDay,
        state.consecutiveLosses,
        state.lastLossAt,
        state.updatedAt,
      );
  }

  defaultState(): BotStateRowInternal {
    return {
      status: 'stopped',
      mode: 'paper',
      dayKey: '',
      startedAt: null,
      stoppedAt: null,
      haltReason: null,
      lastError: null,
      realizedDay: 0,
      feesDay: 0,
      tradesDay: 0,
      winsDay: 0,
      lossesDay: 0,
      consecutiveLosses: 0,
      lastLossAt: null,
      updatedAt: now(),
    };
  }

  // -------------------------------------------------------------------------
  // Trades & orders
  // -------------------------------------------------------------------------

  insertTrade(trade: Trade): void {
    this.db
      .prepare(
        `INSERT INTO trades (
          id, mode, symbol, side, status, qty, contract_size, entry_price, exit_price,
          notional_usd, margin_usd, leverage, fees, gross_pnl, net_pnl, r_multiple,
          risk_usd, open_reason, close_reason, opened_at, closed_at, created_at,
          updated_at, is_demo, meta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trade.id,
        trade.mode,
        trade.symbol,
        trade.side,
        trade.status,
        trade.qty,
        trade.contractSize,
        trade.entryPrice,
        trade.exitPrice,
        trade.notionalUsd,
        trade.marginUsd,
        trade.leverage,
        trade.fees,
        trade.grossPnl,
        trade.netPnl,
        trade.rMultiple,
        trade.riskUsd,
        trade.openReason,
        trade.closeReason,
        trade.openedAt,
        trade.closedAt,
        trade.createdAt,
        trade.updatedAt,
        trade.isDemo ? 1 : 0,
        JSON.stringify(trade.meta ?? {}),
      );
  }

  updateTrade(trade: Trade): void {
    this.db
      .prepare(
        `UPDATE trades SET
          mode = ?, symbol = ?, side = ?, status = ?, qty = ?, contract_size = ?,
          entry_price = ?, exit_price = ?, notional_usd = ?, margin_usd = ?, leverage = ?,
          fees = ?, gross_pnl = ?, net_pnl = ?, r_multiple = ?, risk_usd = ?,
          open_reason = ?, close_reason = ?, opened_at = ?, closed_at = ?,
          updated_at = ?, is_demo = ?, meta = ?
        WHERE id = ?`,
      )
      .run(
        trade.mode,
        trade.symbol,
        trade.side,
        trade.status,
        trade.qty,
        trade.contractSize,
        trade.entryPrice,
        trade.exitPrice,
        trade.notionalUsd,
        trade.marginUsd,
        trade.leverage,
        trade.fees,
        trade.grossPnl,
        trade.netPnl,
        trade.rMultiple,
        trade.riskUsd,
        trade.openReason,
        trade.closeReason,
        trade.openedAt,
        trade.closedAt,
        trade.updatedAt,
        trade.isDemo ? 1 : 0,
        JSON.stringify(trade.meta ?? {}),
        trade.id,
      );
  }

  getTrade(id: string): Trade | null {
    const row = this.db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as
      TradeRow | undefined;
    return row ? this.mapTrade(row) : null;
  }

  listTrades(query: TradeQuery): { items: Trade[]; total: number } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.status) {
      clauses.push('status = ?');
      params.push(query.status);
    }
    if (query.symbol) {
      clauses.push('symbol = ?');
      params.push(query.symbol);
    }
    if (query.mode) {
      clauses.push('mode = ?');
      params.push(query.mode);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS count FROM trades ${where}`).get(...params) as {
        count: number;
      }
    ).count;
    const items = (
      this.db
        .prepare(
          `SELECT * FROM trades ${where}
           ORDER BY COALESCE(closed_at, created_at) DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...params, query.limit, query.offset) as TradeRow[]
    ).map((row) => this.mapTrade(row));
    return { items, total };
  }

  getOpenTrades(): Trade[] {
    return (
      this.db
        .prepare(`SELECT * FROM trades WHERE status IN ('open', 'pending') ORDER BY created_at ASC`)
        .all() as TradeRow[]
    ).map((row) => this.mapTrade(row));
  }

  getClosedTradesSince(ts: number, mode?: 'paper' | 'live'): Trade[] {
    const rows = mode
      ? (this.db
          .prepare(
            `SELECT * FROM trades WHERE status = 'closed' AND closed_at >= ? AND mode = ? ORDER BY closed_at ASC`,
          )
          .all(ts, mode) as TradeRow[])
      : (this.db
          .prepare(
            `SELECT * FROM trades WHERE status = 'closed' AND closed_at >= ? ORDER BY closed_at ASC`,
          )
          .all(ts) as TradeRow[]);
    return rows.map((row) => this.mapTrade(row));
  }

  getClosedTrades(limit = 5000, mode?: 'paper' | 'live'): Trade[] {
    const rows = mode
      ? (this.db
          .prepare(
            `SELECT * FROM trades WHERE status = 'closed' AND mode = ? ORDER BY closed_at DESC LIMIT ?`,
          )
          .all(mode, limit) as TradeRow[])
      : (this.db
          .prepare(`SELECT * FROM trades WHERE status = 'closed' ORDER BY closed_at DESC LIMIT ?`)
          .all(limit) as TradeRow[]);
    return rows.map((row) => this.mapTrade(row));
  }

  getRealizedPnl(mode: 'paper' | 'live'): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(net_pnl), 0) AS total FROM trades WHERE status = 'closed' AND mode = ?`,
      )
      .get(mode) as { total: number };
    return row.total;
  }

  countTrades(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM trades').get() as { count: number })
      .count;
  }

  countDemoTrades(): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS count FROM trades WHERE is_demo = 1').get() as {
        count: number;
      }
    ).count;
  }

  insertOrder(order: OrderRecord): void {
    this.db
      .prepare(
        `INSERT INTO orders (
          id, trade_id, exchange_order_id, client_order_id, symbol, side, action, type,
          price, qty, filled_qty, avg_price, fee, status, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        order.id,
        order.tradeId,
        order.exchangeOrderId,
        order.clientOrderId,
        order.symbol,
        order.side,
        order.action,
        order.type,
        order.price,
        order.qty,
        order.filledQty,
        order.avgPrice,
        order.fee,
        order.status,
        order.error,
        order.createdAt,
        order.updatedAt,
      );
  }

  updateOrder(order: OrderRecord): void {
    this.db
      .prepare(
        `UPDATE orders SET
          exchange_order_id = ?, filled_qty = ?, avg_price = ?, fee = ?, status = ?, error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        order.exchangeOrderId,
        order.filledQty,
        order.avgPrice,
        order.fee,
        order.status,
        order.error,
        order.updatedAt,
        order.id,
      );
  }

  getOrdersByTrade(tradeId: string): OrderRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM orders WHERE trade_id = ? ORDER BY created_at ASC')
      .all(tradeId) as OrderRowDb[];
    return rows.map((row) => this.mapOrder(row));
  }

  getOrderByClientId(clientOrderId: string): OrderRecord | null {
    const row = this.db
      .prepare('SELECT * FROM orders WHERE client_order_id = ?')
      .get(clientOrderId) as OrderRowDb | undefined;
    return row ? this.mapOrder(row) : null;
  }

  getOpenOrders(): OrderRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM orders WHERE status IN ('pending', 'open') ORDER BY created_at ASC`)
      .all() as OrderRowDb[];
    return rows.map((row) => this.mapOrder(row));
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  ping(): boolean {
    const row = this.db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return row?.ok === 1;
  }

  // -------------------------------------------------------------------------
  // Equity, logs, daily stats and audit
  // -------------------------------------------------------------------------

  insertEquity(point: EquityPoint): void {
    this.db
      .prepare(
        'INSERT INTO equity_snapshots (ts, equity, balance, unrealized, day_pnl) VALUES (?, ?, ?, ?, ?)',
      )
      .run(point.ts, point.equity, point.balance, point.unrealized, point.dayPnl);
  }

  listEquity(sinceTs: number, limit = 5000): EquityPoint[] {
    return (
      this.db
        .prepare(
          'SELECT ts, equity, balance, unrealized, day_pnl FROM equity_snapshots WHERE ts >= ? ORDER BY ts ASC LIMIT ?',
        )
        .all(sinceTs, limit) as Array<{
        ts: number;
        equity: number;
        balance: number;
        unrealized: number;
        day_pnl: number;
      }>
    ).map((row) => ({
      ts: row.ts,
      equity: row.equity,
      balance: row.balance,
      unrealized: row.unrealized,
      dayPnl: row.day_pnl,
    }));
  }

  latestEquity(): EquityPoint | null {
    const row = this.db
      .prepare(
        'SELECT ts, equity, balance, unrealized, day_pnl FROM equity_snapshots ORDER BY ts DESC LIMIT 1',
      )
      .get() as
      | { ts: number; equity: number; balance: number; unrealized: number; day_pnl: number }
      | undefined;
    return row
      ? {
          ts: row.ts,
          equity: row.equity,
          balance: row.balance,
          unrealized: row.unrealized,
          dayPnl: row.day_pnl,
        }
      : null;
  }

  deleteEquityBefore(ts: number): number {
    return this.db.prepare('DELETE FROM equity_snapshots WHERE ts < ?').run(ts).changes;
  }

  deleteLogsBefore(ts: number): number {
    return this.db.prepare('DELETE FROM logs WHERE ts < ?').run(ts).changes;
  }

  deleteAuditBefore(ts: number): number {
    return this.db.prepare('DELETE FROM audit_log WHERE ts < ?').run(ts).changes;
  }

  insertLog(
    level: AppLogLevel,
    category: string,
    message: string,
    data: Record<string, unknown> | null,
  ): number {
    const result = this.db
      .prepare('INSERT INTO logs (ts, level, category, message, data) VALUES (?, ?, ?, ?, ?)')
      .run(now(), level, category, message, data ? JSON.stringify(data) : null);
    return Number(result.lastInsertRowid);
  }

  listLogs(query: { limit: number; level?: AppLogLevel; category?: string }): LogEntry[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.level) {
      clauses.push('level = ?');
      params.push(query.level);
    }
    if (query.category) {
      clauses.push('category = ?');
      params.push(query.category);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM logs ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params, query.limit) as Array<{
      id: number;
      ts: number;
      level: string;
      category: string;
      message: string;
      data: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      ts: row.ts,
      level: row.level as AppLogLevel,
      category: row.category,
      message: row.message,
      data: parseJson<Record<string, unknown> | null>(row.data, null),
    }));
  }

  upsertDailyStats(stats: DailyStats): void {
    this.db
      .prepare(
        `INSERT INTO daily_stats (
          day_key, start_equity, end_equity, realized_pnl, fees, trades, wins, losses,
          target_hit, stop_hit, max_drawdown_pct, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(day_key) DO UPDATE SET
          start_equity = excluded.start_equity,
          end_equity = excluded.end_equity,
          realized_pnl = excluded.realized_pnl,
          fees = excluded.fees,
          trades = excluded.trades,
          wins = excluded.wins,
          losses = excluded.losses,
          target_hit = excluded.target_hit,
          stop_hit = excluded.stop_hit,
          max_drawdown_pct = excluded.max_drawdown_pct,
          updated_at = excluded.updated_at`,
      )
      .run(
        stats.dayKey,
        stats.startEquity,
        stats.endEquity,
        stats.realizedPnl,
        stats.fees,
        stats.trades,
        stats.wins,
        stats.losses,
        stats.targetHit ? 1 : 0,
        stats.stopHit ? 1 : 0,
        stats.maxDrawdownPct,
        stats.updatedAt,
      );
  }

  getDailyStats(dayKey: string): DailyStats | null {
    const row = this.db.prepare('SELECT * FROM daily_stats WHERE day_key = ?').get(dayKey) as
      | {
          day_key: string;
          start_equity: number;
          end_equity: number;
          realized_pnl: number;
          fees: number;
          trades: number;
          wins: number;
          losses: number;
          target_hit: number;
          stop_hit: number;
          max_drawdown_pct: number;
          updated_at: number;
        }
      | undefined;
    return row
      ? {
          dayKey: row.day_key,
          startEquity: row.start_equity,
          endEquity: row.end_equity,
          realizedPnl: row.realized_pnl,
          fees: row.fees,
          trades: row.trades,
          wins: row.wins,
          losses: row.losses,
          targetHit: row.target_hit === 1,
          stopHit: row.stop_hit === 1,
          maxDrawdownPct: row.max_drawdown_pct,
          updatedAt: row.updated_at,
        }
      : null;
  }

  insertAudit(entry: Omit<AuditEntry, 'id'>): void {
    this.db
      .prepare('INSERT INTO audit_log (ts, actor, action, detail, ip) VALUES (?, ?, ?, ?, ?)')
      .run(entry.ts, entry.actor, entry.action, entry.detail, entry.ip);
  }

  listAudit(limit = 100): AuditEntry[] {
    return this.db
      .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
      .all(limit) as AuditEntry[];
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private mapTrade(row: TradeRow): Trade {
    return {
      id: row.id,
      mode: row.mode === 'live' ? 'live' : 'paper',
      symbol: row.symbol,
      side: row.side === 'short' ? 'short' : 'long',
      status: row.status as TradeStatus,
      qty: row.qty,
      contractSize: row.contract_size,
      entryPrice: row.entry_price,
      exitPrice: row.exit_price,
      notionalUsd: row.notional_usd,
      marginUsd: row.margin_usd,
      leverage: row.leverage,
      fees: row.fees,
      grossPnl: row.gross_pnl,
      netPnl: row.net_pnl,
      rMultiple: row.r_multiple,
      riskUsd: row.risk_usd,
      openReason: row.open_reason,
      closeReason: row.close_reason,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isDemo: row.is_demo === 1,
      meta: parseJson<Record<string, unknown>>(row.meta, {}),
    };
  }

  private mapOrder(row: OrderRowDb): OrderRecord {
    return {
      id: row.id,
      tradeId: row.trade_id,
      exchangeOrderId: row.exchange_order_id,
      clientOrderId: row.client_order_id,
      symbol: row.symbol,
      side: row.side === 'short' ? 'short' : 'long',
      action: row.action === 'close' ? 'close' : 'open',
      type: row.type === 'limit' ? 'limit' : 'market',
      price: row.price,
      qty: row.qty,
      filledQty: row.filled_qty,
      avgPrice: row.avg_price,
      fee: row.fee,
      status: row.status as OrderRecord['status'],
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
