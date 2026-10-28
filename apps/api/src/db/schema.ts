export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bot_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        config TEXT NOT NULL,
        secrets TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bot_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL DEFAULT 'stopped',
        mode TEXT NOT NULL DEFAULT 'paper',
        day_key TEXT NOT NULL DEFAULT '',
        started_at INTEGER,
        stopped_at INTEGER,
        halt_reason TEXT,
        last_error TEXT,
        realized_day REAL NOT NULL DEFAULT 0,
        fees_day REAL NOT NULL DEFAULT 0,
        trades_day INTEGER NOT NULL DEFAULT 0,
        wins_day INTEGER NOT NULL DEFAULT 0,
        losses_day INTEGER NOT NULL DEFAULT 0,
        consecutive_losses INTEGER NOT NULL DEFAULT 0,
        last_loss_at INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'paper',
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        status TEXT NOT NULL,
        qty REAL NOT NULL,
        contract_size REAL NOT NULL,
        entry_price REAL,
        exit_price REAL,
        notional_usd REAL NOT NULL,
        margin_usd REAL NOT NULL,
        leverage INTEGER NOT NULL,
        fees REAL NOT NULL DEFAULT 0,
        gross_pnl REAL NOT NULL DEFAULT 0,
        net_pnl REAL NOT NULL DEFAULT 0,
        r_multiple REAL NOT NULL DEFAULT 0,
        risk_usd REAL NOT NULL DEFAULT 0,
        open_reason TEXT NOT NULL DEFAULT '',
        close_reason TEXT NOT NULL DEFAULT '',
        opened_at INTEGER,
        closed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_demo INTEGER NOT NULL DEFAULT 0,
        meta TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_trades_closed_at ON trades(closed_at);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
      CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
      CREATE INDEX IF NOT EXISTS idx_trades_mode ON trades(mode);

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        trade_id TEXT NOT NULL,
        exchange_order_id TEXT,
        client_order_id TEXT NOT NULL UNIQUE,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        action TEXT NOT NULL,
        type TEXT NOT NULL,
        price REAL,
        qty REAL NOT NULL,
        filled_qty REAL NOT NULL DEFAULT 0,
        avg_price REAL,
        fee REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_trade ON orders(trade_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      CREATE TABLE IF NOT EXISTS equity_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        equity REAL NOT NULL,
        balance REAL NOT NULL,
        unrealized REAL NOT NULL,
        day_pnl REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_equity_ts ON equity_snapshots(ts);

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

      CREATE TABLE IF NOT EXISTS daily_stats (
        day_key TEXT PRIMARY KEY,
        start_equity REAL NOT NULL,
        end_equity REAL NOT NULL,
        realized_pnl REAL NOT NULL,
        fees REAL NOT NULL,
        trades INTEGER NOT NULL,
        wins INTEGER NOT NULL,
        losses INTEGER NOT NULL,
        target_hit INTEGER NOT NULL,
        stop_hit INTEGER NOT NULL,
        max_drawdown_pct REAL NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL,
        ip TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
    `,
  },
  {
    id: 2,
    name: 'ledger_micros',
    sql: `
      ALTER TABLE trades ADD COLUMN fees_micros INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE trades ADD COLUMN gross_pnl_micros INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE trades ADD COLUMN net_pnl_micros INTEGER NOT NULL DEFAULT 0;

      UPDATE trades SET
        fees_micros = CAST(ROUND(fees * 1000000) AS INTEGER),
        gross_pnl_micros = CAST(ROUND(gross_pnl * 1000000) AS INTEGER),
        net_pnl_micros = CAST(ROUND(net_pnl * 1000000) AS INTEGER);

      CREATE TABLE IF NOT EXISTS ledger_reconciliation (
        trade_id TEXT PRIMARY KEY,
        legacy_net REAL NOT NULL,
        exact_net_micros INTEGER NOT NULL,
        recomputed_net_micros INTEGER NOT NULL,
        delta_micros INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      INSERT OR REPLACE INTO ledger_reconciliation
        (trade_id, legacy_net, exact_net_micros, recomputed_net_micros, delta_micros, created_at)
      SELECT
        id,
        net_pnl,
        net_pnl_micros,
        CAST(ROUND((gross_pnl - fees) * 1000000) AS INTEGER),
        CAST(ROUND((gross_pnl - fees) * 1000000) AS INTEGER) - net_pnl_micros,
        CAST(strftime('%s', 'now') AS INTEGER) * 1000
      FROM trades;
    `,
  },
];
