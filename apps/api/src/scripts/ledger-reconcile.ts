import { fromMicros, reconciliationDelta } from '@goodz/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { openDatabase } from '../db/database';

const databasePath = process.env.DATABASE_PATH ?? './.data/goodz.db';
const outPath = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : undefined;

const db = openDatabase(databasePath);

const rows = db
  .prepare(
    `SELECT
       COUNT(*) AS trades,
       COALESCE(SUM(delta_micros), 0) AS total_delta_micros,
       COALESCE(MAX(ABS(delta_micros)), 0) AS max_abs_delta_micros,
       COALESCE(SUM(CASE WHEN delta_micros != 0 THEN 1 ELSE 0 END), 0) AS mismatches
     FROM ledger_reconciliation`,
  )
  .get() as {
  trades: number;
  total_delta_micros: number;
  max_abs_delta_micros: number;
  mismatches: number;
};

const totals = db
  .prepare(
    `SELECT
       COALESCE(SUM(net_pnl_micros), 0) AS exact_micros,
       COALESCE(SUM(net_pnl), 0) AS legacy_float
     FROM trades WHERE status = 'closed'`,
  )
  .get() as { exact_micros: number; legacy_float: number };

const report = {
  ok: rows.mismatches === 0,
  database: databasePath,
  generatedAt: new Date().toISOString(),
  trades: rows.trades,
  mismatches: rows.mismatches,
  totalDeltaMicros: rows.total_delta_micros,
  totalDeltaUsdt: fromMicros(rows.total_delta_micros),
  maxAbsDeltaMicros: rows.max_abs_delta_micros,
  maxAbsDeltaUsdt: fromMicros(rows.max_abs_delta_micros),
  exactClosedNetMicros: totals.exact_micros,
  exactClosedNetUsdt: fromMicros(totals.exact_micros),
  legacyFloatClosedNet: totals.legacy_float,
  floatVsExactMicros: reconciliationDelta(totals.legacy_float, totals.exact_micros),
  note: 'The micros columns are additive; restore the pre-migration backup to roll back. Historical REAL values were not rewritten.',
};

db.close();

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
