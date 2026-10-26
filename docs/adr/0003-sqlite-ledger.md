# ADR 0003 — SQLite WAL ledger, append-only audit, explicit fees

- Status: accepted
- Date: 2026-10-26

## Context

The bot needs durable trades/orders/equity/daily stats and a UI log/audit trail. A single
user and a single process do not need Postgres. The ledger must be inspectable, backup-able
and fast enough for hundreds of orders/day.

## Decision

- SQLite with WAL, `busy_timeout=5000`, `synchronous=NORMAL`, foreign keys.
- A tiny migration runner in `db/database.ts`; migrations are ordered SQL in `db/schema.ts`.
- All access through `Repository` using prepared statements.
- Trades persist gross PnL, fees, net PnL, R multiple and close reason.
- Equity snapshots are periodic; daily stats are upserted.
- Audit and app logs are separate tables; logs are capped in the UI, audit is append-only.
- Demo rows are flagged `is_demo` and labeled.

## Why not an ORM

The schema is small, the hot path is simple, and avoiding an ORM keeps the API bundle and
mental model small. Prepared statements make SQL injection impossible if values are bound.

## Consequences

- No multi-writer concurrency. One process is assumed.
- REAL money is not exact fixed-point. Values are rounded at boundaries; this is a known
  limitation and an open issue. Do not claim accounting-grade precision.
- Backups must include WAL or use `sqlite3 .backup`/`VACUUM INTO`.
- Migrations are forward-only; rollback requires a DB backup.

## Follow-ups

- Retention/pruning for logs/equity.
- Fixed-point or integer micro-USDT migration with reconciliation.
- Encrypted backup export.
