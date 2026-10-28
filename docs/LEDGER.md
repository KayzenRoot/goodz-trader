# Ledger, micro-USDT and reconciliation

## Model

`packages/core/src/money.ts` defines the canonical integer unit: **1 micro-USDT = 0.000001
USDT**. Ledger arithmetic that must not drift uses `toMicros`, `fromMicros`, `addMicros`,
`sumMicros` and `mulMicrosBps` (one rounding at the end).

Trades keep their original REAL columns for compatibility with the UI, CSV and existing
analytics. Migration `2_ledger_micros` adds:

- `trades.fees_micros`
- `trades.gross_pnl_micros`
- `trades.net_pnl_micros`
- `ledger_reconciliation` (one row per historical trade with the legacy net, recomputed net and
  delta in micros)

New/updated trades are **dual-written**: the REAL value and its micro representation. Historical
REAL values are not rewritten. `getRealizedPnl`, `getNetPnlSince` and `getFeesSince` sum the
integer columns, so equity/day-guard sums do not accumulate floating drift.

## Migration and rollback

Migration 2 is additive and idempotent through `schema_migrations`:

```sql
ALTER TABLE trades ADD COLUMN ..._micros INTEGER NOT NULL DEFAULT 0;
UPDATE trades SET ... = ROUND(... * 1000000);
INSERT INTO ledger_reconciliation SELECT ...;
```

Rollback is by **restoring the pre-upgrade backup** (see `docs/RUNBOOK.md`). There is no
destructive down migration; the REAL columns remain the source for display and were never
changed, so a read-only rollback also works if the new columns are ignored.

## Reconciliation command

```bash
BACKUP_DIR=./backups pnpm backup          # before upgrading a production DB
pnpm ledger:reconcile                     # prints JSON
pnpm ledger:reconcile -- --out reports/ledger.json
```

The report contains:

- number of trades and rows with a non-zero delta;
- total/max absolute delta in micros and USDT;
- exact closed net from micros vs the legacy float sum and their difference;
- an explicit note that the micros columns are additive.

A non-zero `mismatches` means the legacy `net_pnl` differs from `gross_pnl - fees`; it is
reported, **not silently corrected**. Investigate the trade and the exchange history before
touching data.

## Invariants tested

- Numeric/string round-trip within one micro.
- `sumMicros` of 10,000 × 0.01 equals exactly 100 (naive float does not).
- `gross - fees` and net conservation per trade.
- Migration backfill values and `ledger_reconciliation` delta.
- Repository insert/update dual-write.
- Daily rehydration uses the exact sum.

## Compatibility

- UI, CSV and API responses keep `fees`, `grossPnl` and `netPnl` as numbers (REAL).
- Analytics continues to read REAL trade fields; converting every aggregation to micros is a
  follow-up. The daily guard and realized PnL already use exact sums.
- No historical value is changed in place; the backup is the rollback mechanism.

## Limitations

- Per-trade micros are rounded from the REAL value. The sum is exact for those rounded values,
  not a reconstruction of an unrecorded higher precision.
- Funding is not stored as a separate ledger column yet.
- An on-chain/exchange statement importer that compares exchange fees per fill is future work.
