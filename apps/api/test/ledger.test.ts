import { toMicros } from '@goodz/core';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { migrate } from '../src/db/database';
import { MIGRATIONS } from '../src/db/schema';
import { closeDatabase, openDatabase } from '../src/db/database';
import { Repository } from '../src/db/repo';
import { sampleClosedTrade } from './helpers';

function legacyDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  db.exec(MIGRATIONS[0]?.sql ?? '');
  db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (1, ?)').run(Date.now());
  db.prepare(
    `INSERT INTO trades (
      id, mode, symbol, side, status, qty, contract_size, entry_price, exit_price,
      notional_usd, margin_usd, leverage, fees, gross_pnl, net_pnl, r_multiple,
      risk_usd, open_reason, close_reason, opened_at, closed_at, created_at,
      updated_at, is_demo, meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'trd_legacy',
    'paper',
    'BTC_USDT',
    'long',
    'closed',
    10,
    0.0001,
    100_000,
    100_100,
    100,
    10,
    10,
    0.1,
    0.3,
    0.19,
    1,
    0.14,
    'legacy',
    'take_profit',
    1_700_000_000_000,
    1_700_000_060_000,
    1_700_000_000_000,
    1_700_000_060_000,
    0,
    '{}',
  );
  return db;
}

describe('ledger micros', () => {
  it('backfills legacy trades and records the reconciliation delta', () => {
    const db = legacyDatabase();
    migrate(db);

    const row = db
      .prepare('SELECT fees_micros, gross_pnl_micros, net_pnl_micros FROM trades WHERE id = ?')
      .get('trd_legacy') as {
      fees_micros: number;
      gross_pnl_micros: number;
      net_pnl_micros: number;
    };
    expect(row).toEqual({
      fees_micros: 100_000,
      gross_pnl_micros: 300_000,
      net_pnl_micros: 190_000,
    });

    const reconciliation = db
      .prepare('SELECT * FROM ledger_reconciliation WHERE trade_id = ?')
      .get('trd_legacy') as {
      legacy_net: number;
      exact_net_micros: number;
      recomputed_net_micros: number;
      delta_micros: number;
    };
    expect(reconciliation).toMatchObject({
      legacy_net: 0.19,
      exact_net_micros: 190_000,
      recomputed_net_micros: 200_000,
      delta_micros: 10_000,
    });

    const repo = new Repository(db);
    expect(repo.getRealizedPnl('paper')).toBe(0.19);
    db.close();
  });

  it('dual-writes and updates the integer columns', () => {
    const db = openDatabase(':memory:');
    const repo = new Repository(db);
    const trade = sampleClosedTrade({ id: 'trd_micros', fees: 0.08, netPnl: 0.42 });
    repo.insertTrade(trade);

    const inserted = db
      .prepare('SELECT fees_micros, gross_pnl_micros, net_pnl_micros FROM trades WHERE id = ?')
      .get(trade.id) as {
      fees_micros: number;
      gross_pnl_micros: number;
      net_pnl_micros: number;
    };
    expect(inserted).toEqual({
      fees_micros: 80_000,
      gross_pnl_micros: 500_000,
      net_pnl_micros: 420_000,
    });
    expect(inserted.gross_pnl_micros - inserted.fees_micros).toBe(inserted.net_pnl_micros);

    trade.netPnl = -0.123456;
    trade.fees = 0.000001;
    repo.updateTrade(trade);
    const updated = db
      .prepare('SELECT fees_micros, net_pnl_micros FROM trades WHERE id = ?')
      .get(trade.id) as Record<string, number>;
    expect(updated).toEqual({ fees_micros: 1, net_pnl_micros: toMicros(-0.123456) });
    closeDatabase(db);
  });
});
