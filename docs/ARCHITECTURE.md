# Architecture

## Context

Goodz Trader is a single-user, self-hosted trading system for MEXC USDT perpetual futures.
It is optimized for fast paper/live iteration, strong risk controls and a readable ledger —
not for multi-tenant scale. One process owns one active contract and (by default) one
position.

## System diagram

```
┌─────────────────────────────┐         HTTP /api + WS /ws          ┌──────────────────────────────┐
│ apps/web (React 19 + Vite)  │ ──────────────────────────────────> │ apps/api (Fastify 5)         │
│ · Overview / Terminal       │ <────────────────────────────────── │ · auth, rate limit, helmet    │
│ · Trades / Analytics        │        status / market / trade      │ · REST + WebSocket fan-out    │
│ · Settings / Logs           │        log / equity events          │ · static SPA in production    │
└─────────────────────────────┘                                     └──────────────┬───────────────┘
                                                                                   │
                                      ┌────────────────────────────────────────────┼──────────────────────┐
                                      │                                            │                      │
                              ┌───────▼────────┐                        ┌──────────▼─────────┐   ┌────────▼────────┐
                              │ TradingEngine  │                        │ MarketDataService  │   │ SettingsService │
                              │ state machine  │                        │ synthetic | MEXC   │   │ AES-GCM secrets │
                              │ risk + exits   │                        │ ticker/book/tape   │   │ live gate       │
                              └───┬────────┬───┘                        └──────────┬─────────┘   └────────┬────────┘
                                  │        │                                       │                      │
                     ┌────────────▼─┐  ┌───▼──────────┐                            │                      │
                     │ PaperBroker  │  │ LiveBroker   │                            │                      │
                     │ sim fills    │  │ MEXC signed  │                            │                      │
                     └──────────────┘  └──────┬───────┘                            │                      │
                                              │                                    │                      │
                                      ┌───────▼────────┐                  ┌────────▼─────────┐   ┌────────▼────────┐
                                      │ MEXC REST/WS   │                  │ EventBus         │   │ SQLite (WAL)     │
                                      │ contract.mexc  │                  │ typed pub/sub    │   │ trades/orders/   │
                                      └────────────────┘                  └──────────────────┘   │ equity/logs/     │
                                                                                                 │ daily/audit      │
                                                                                                 └──────────────────┘
```

## Packages

| Package         | Responsibility                                                                          | Must not                                        |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `packages/core` | Zod config schemas, EMA/flow strategy, risk sizing, PnL, analytics, daily guard helpers | Import Fastify/React/SQLite                     |
| `packages/mexc` | HMAC signing, REST client, public WS, raw mappers                                       | Know about the bot or DB                        |
| `apps/api`      | Engine, brokers, market service, repository, auth, HTTP/WS, settings                    | Put domain math in routes                       |
| `apps/web`      | Control surface, charts, tables, settings form                                          | Place orders directly or trust client-side risk |

## Engine lifecycle

```
idle/stopped --start--> starting --ok--> running
                              │             │
                              │             ├─ daily target/stop ─┐
                              │             ├─ consecutive losses ─┤
                              │             ├─ kill switch ────────┤
                              │             └─ error ──────────────┤
                              │                                   ▼
                              └─ error/exception ─────────────> halted
                                                                  │
                             running --stop--> stopping --> stopped│
                                                                  │
                             halted --manual start (guard passes) ┘
```

Key rules:

- `starting` validates config, contract, credentials, flat account, leverage and daily guard.
- `running` processes serialized market ticks. A tick can: fill pending entry, manage exit,
  manage guard, evaluate a new signal, snapshot equity.
- `halted` cancels pending orders, optionally flattens, disconnects the broker and never
  resumes automatically.
- On process restart, a previously `running` bot is reported `stopped` and an error is shown.
  Paper open trades are adopted; live open trades block start and require manual action.

## Order lifecycle

```
signal -> evaluateEntry -> Trade(pending) + Order(pending) -> broker.placeOrder
   │                                                            │
   │                     ┌──────────────────────────────────────┤
   │                     ▼                                      ▼
   │              filled (market / maker)                 open (limit)
   │                     │                                      │
   │                     ▼                                      ▼
   │              Trade(open) + position                 poll / onSnapshot
   │                     │                                      │
   │                     │<──────────── filled ────────────────┘
   │                     ▼
   │              exit trigger (TP/SL/trail/time/manual/guard)
   │                     ▼
   └──────────────> broker.closePosition -> Trade(closed) + fees + daily stats + equity
```

- Every order has a client order ID (`gz_...`) used as `externalOid`; submit retries reuse it,
  so a lost response cannot duplicate the order.
- Market entries/exits are confirmed by polling the order state (live) or immediate fill
  (paper). Maker entries wait `makerTimeoutMs`, may requote up to `maxRequotes` when the passive
  price improves, and optionally fall back to one taker order.
- Requote order: cancel -> confirm -> post replacement for the unfilled quantity with a new
  client order ID. If cancel cannot be confirmed, no replacement is sent.
- A partial fill becomes the position with the **actual** filled quantity; the remainder is
  canceled and never chased. Entry fees are the sum of the exchange reports.
- Fees are persisted on the trade, not inferred later. `netPnl = grossPnl - fees`.
- A canceled maker attempt remains as `canceled` for audit; it has no PnL.

## Risk invariants

1. No entry without `evaluateEntry` returning `allowed: true`.
2. Position size = min(qty by risk, qty by notional, qty by margin), floored to `volUnit`,
   never rounded above the budget.
3. Daily guard uses net realized + unrealized, including fees.
4. Halt reasons are explicit and persisted; start refuses while the guard is still tripped.
5. Exit is always allowed. A blocked entry must never block a close.
6. One position at a time by default (`maxOpenPositions=1`).
7. Live mode requires server flag + phrase + credentials + flat one-way account.
8. Kill switch persists and blocks start until a human disables it.

## Data model

| Table               | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `bot_config`        | Versioned JSON config + encrypted secrets (singleton)       |
| `bot_state`         | Status, day counters, halt reason, last error (singleton)   |
| `trades`            | Full entry/exit ledger, fees, net PnL, R, reason, demo flag |
| `orders`            | Exchange/client IDs, fill state, fee, error                 |
| `equity_snapshots`  | Periodic equity/balance/unrealized/day PnL points           |
| `daily_stats`       | Day start/end equity, realized, fees, wins/losses, drawdown |
| `logs`              | Structured app/engine logs for the dashboard                |
| `audit_log`         | Settings, auth, start/stop/kill actions                     |
| `schema_migrations` | Applied migration IDs                                       |

SQLite is configured with WAL, `busy_timeout=5000`, `synchronous=NORMAL`, foreign keys.
All queries use prepared statements. The DB is the ledger; WS is a projection.

Retention prunes only high-volume observability tables (`logs`, `equity_snapshots`, old
`audit_log` rows); trades and orders are never deleted. Backups use SQLite's online backup API
and are verified with `integrity_check` plus row counts before being accepted.

## Event flow

`MarketDataService` publishes `market` (source, snapshot, book, tape). The engine consumes
it and publishes `status` (1s throttle), `trade`, `equity`, `log`; settings publishes
`config`. `EventBus` fans out to the `/ws` route. Clients receive an initial status+market
on connect and a heartbeat every 20s. Market frames are dropped if the socket buffer exceeds
2 MB to avoid unbounded memory.

## Security

- Dashboard session: optional password, HMAC-signed HttpOnly SameSite=Strict cookie, 12h TTL,
  rate-limited login, audit log.
- Secrets: AES-256-GCM with a key derived from `APP_SECRET`; no secret is ever returned.
- HTTP: Helmet CSP, CORS allowlist, global + route rate limits, Zod validation, body limit.
- MEXC: API key read+trade only, IP whitelist; no withdrawal permission is ever requested.
- CI: CodeQL, Semgrep, Gitleaks, dependency review, Dependabot, Scorecard.
- Threat model and reporting: [SECURITY.md](../SECURITY.md).

## Failure modes

| Failure                   | Behavior                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Market feed stale >5s     | Entries blocked; status warning; exits still attempted? No — no fresh price, no synthetic fills.       |
| MEXC public WS drop       | Feed status offline; reconnect with backoff; REST fallback for dashboard queries.                      |
| MEXC private WS drop      | Order/position stream reconnects; REST polling keeps working; on re-login the broker reconciles.       |
| Reconciliation divergence | Orphan/duplicate position or order, side/qty mismatch -> halt and require manual review.               |
| Order rejected            | Trade marked rejected; no position; error logged.                                                      |
| Close fails               | Position retained; error surfaced and notified; kill switch remains available; manual close required.  |
| Notification failure      | Bounded queue retries with backoff; trading is never blocked; final failure is logged without secrets. |
| Process crash             | Bot does not auto-resume; paper position can be adopted; live requires manual reconciliation.          |
| SQLite locked             | 5s busy timeout; write failure logged; engine reports error.                                           |
| Clock drift               | REST syncs server time; signature window 5s.                                                           |

## Deliberate limitations (tracked as issues)

- Private WS is implemented, but live fill/cancel/partial-fill semantics still require a tiny
  real validation (issue #17).
- No full depth snapshot+version reconciliation for incremental WS depth (REST polling).
- No backtester/replay of historical order book.
- SQLite REAL money is not exact fixed-point.
- No multi-symbol concurrent engine.
- No liquidation price / funding projection in the UI.
- Live cancel body and market-order price semantics need validation with a tiny real order.
