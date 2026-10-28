# Runbook

## Local development

```powershell
pnpm install
pnpm dev
# dashboard http://localhost:5173
# API      http://localhost:3001/api/health
```

- `.data/goodz.db` is the ledger. Delete it with `pnpm db:reset` (destructive).
- `.data/dev-secret` is generated in development. Production requires `APP_SECRET`.
- `SEED_DEMO=true` only populates an empty trades table. Set false for production.

## Production (Docker)

1. Create `.env` from `.env.example` and set:
   - `APP_SECRET` (32+ random chars, never reuse dev)
   - `AUTH_PASSWORD` (strong)
   - `HOST=0.0.0.0`, `PORT=3001`
   - `DATABASE_PATH=/data/goodz.db`
   - `WEB_DIST_PATH=/app/apps/web/dist`
   - `LIVE_TRADING_ENABLED=false` until validated
   - `SEED_DEMO=false`
   - `COOKIE_SECURE=true` behind HTTPS
2. `docker compose up -d --build`
3. Check `docker compose ps` and `curl http://127.0.0.1:3001/api/health`.
4. Put it behind a reverse proxy with TLS. Publish only 443; keep the container port bound to
   `127.0.0.1`. Set `AUTH_PASSWORD`, `APP_ORIGIN=https://your-host` and
   `COOKIE_SECURE=true`. Firewall should allow only the proxy and your admin IP.
5. Back up the volume before enabling live.

## Backup, restore and retention

The backup uses SQLite's online backup API (WAL-safe), then runs `integrity_check` and verifies
trade/order/equity counts. Run it while the bot is running; it does not block trading.

```bash
# host / development
pnpm backup                       # ./backups by default
BACKUP_KEEP=14 pnpm backup

# container
docker compose exec goodz node apps/api/scripts/backup.mjs /backups
```

Restore **only with the API stopped**:

```bash
docker compose stop goodz
docker compose run --rm --entrypoint node goodz \
  apps/api/scripts/restore.mjs /backups/goodz-2026-01-01T00-00-00-000Z.db /data/goodz.db
docker compose up -d
```

The restore verifies the backup before replacing the target, removes stale `-wal`/`-shm`
files and reports the restored row counts. Compare those counts and the dashboard PnL with the
pre-restore values.

Retention (daily, after startup):

- `RETENTION_LOGS_DAYS` (default 14)
- `RETENTION_EQUITY_DAYS` (default 90)
- `RETENTION_AUDIT_DAYS` (default 365)
- Trades and orders are **never** pruned: they are the ledger.
- Set `MAINTENANCE_ENABLED=false` only if an external job owns retention.

## Upgrade and rollback

```bash
git fetch --tags
git checkout vX.Y.Z
docker compose build --pull
docker compose up -d
```

Before upgrading: run a backup and confirm `/api/health`. If the new version fails, check out
the previous tag, rebuild and restore the pre-upgrade backup only if the schema migration is
incompatible. Never restore an old backup over a database that has newer live trades without
exporting those trades first.

## Startup checklist

- [ ] `/api/health` returns ok.
- [ ] Dashboard loads and shows **Parado**.
- [ ] Settings show the expected symbol, leverage, daily target/stop.
- [ ] API connection test shows the expected equity and one-way mode.
- [ ] Feed is connected and fresh.
- [ ] Kill switch is off.
- [ ] For live: account is flat, one-way, key is read+trade only, IP whitelisted.
- [ ] Paper validation complete; size starts at minimum.
- [ ] Type the confirmation phrase and start.
- [ ] Watch the first fill/exit and compare with MEXC.

## Normal stop

Use **Parar** (topbar), keep "Fechar posição aberta" enabled. The API cancels pending orders,
closes the position, disconnects and persists `stopped`.

## Emergency stop

Use the red **kill switch**. It halts, cancels, attempts a market close and blocks restart.
If the close fails, close manually on MEXC. Do not restart until flat/reconciled.

## Daily reset

- Boundary: `resetHourUtc` (default 00:00 UTC).
- The engine rolls counters on the next tick and writes `daily_stats`.
- A halt does not auto-clear at reset; restart manually after the guard passes.

## Logs

- Dashboard: **Logs & auditoria** (stream + DB).
- Docker: `docker compose logs -f goodz`.
- DB: `logs` table, `audit_log` table.
- Logs redact auth headers, API keys, secrets and tokens. If you see a secret, treat it as an
  incident and rotate immediately.

## Backup

SQLite WAL means copy the database safely:

```bash
# preferred: stop the container, copy the volume, start
docker compose stop goodz
docker run --rm -v goodz-data:/data -v "$PWD/backups:/backup" alpine \
  sh -c 'cp /data/goodz.db /backup/goodz-$(date +%Y%m%d-%H%M%S).db'
docker compose start goodz
```

For a hot copy, use `sqlite3 .backup` or `VACUUM INTO`; do not copy only the `.db` while WAL
has uncheckpointed pages. Test restores quarterly.

## Restore

1. Stop the app.
2. Replace `/data/goodz.db` with the backup (remove `-wal`/`-shm`).
3. Start the app; verify `/api/health`, `/api/trades` and the ledger count against the backup.
4. Start in paper/stopped state first.

## Upgrade

1. Read the PR/changelog and migration notes.
2. Back up the DB.
3. `git pull` / build image.
4. `docker compose up -d --build`.
5. Verify migrations, health, settings and a paper start.
6. Resume live only after the preflight checklist.

## Rollback

- Keep the previous image tag and DB backup.
- Stop app, restore DB, run previous image.
- If a migration is not backward compatible, do not downgrade without the matching backup.

## Rotate MEXC keys

1. Stop the bot and flatten.
2. Create a new key (read+trade, IP whitelist), delete the old one after validation.
3. Update Settings or env, test connection, audit the change.
4. If a leak is suspected, rotate before any other investigation.

## Incident response

1. Kill switch.
2. Check MEXC manually for positions/orders.
3. Preserve evidence: logs, trades CSV, timestamps, request IDs.
4. Determine blast radius: paper only, live position, credentials, host.
5. Fix, test, document, then restart small.
6. Open an incident issue with timeline and follow-ups.

## Health indicators

| Indicator      | Healthy  | Action                                   |
| -------------- | -------- | ---------------------------------------- |
| `/api/health`  | 200 `ok` | check container/logs                     |
| Feed last tick | < 2s     | check network/MEXC; entries block at 5s  |
| WS dashboard   | online   | polling fallback still works             |
| API latency    | < 500ms  | inspect rate limits/logs                 |
| Halt reason    | none     | read reason, fix guard, restart manually |
| DB size        | stable   | prune equity/logs per retention policy   |

## Private WS reconnect / reconciliation

- The private WS reconnects with exponential backoff; REST polling continues meanwhile.
- On every successful re-login, the broker performs a full position/order reconciliation and
  writes an audit entry (`broker.reconcile.reconnect`).
- Divergence (orphan/duplicate position, side/qty mismatch, orphan/duplicate order) halts the
  bot. Check MEXC manually, reconcile the ledger, then restart.
- A process crash does not auto-resume. Startup refuses live if the repo has an open trade or
  the exchange has any position/order; resolve manually.

## Maker entries and partial fills

- Post-only orders can sit unfilled. The engine requotes at most `maxRequotes` times, only
  when the passive price improves by `requoteMinMoveBps`.
- If a maker order only partially fills, the bot opens the position with that quantity and
  cancels the remainder. Do not manually add the missing size unless that is a deliberate,
  separately risk-checked trade.
- A taker fallback is sent at most once per entry, after the maker timeout/rejection and only
  if the risk guard still allows it.
- An ambiguous submit/requote response (timeout, lost ack) halts the bot and triggers
  `cancel_all`; do not restart until MEXC shows the account flat or you have reconciled it.
- Check `entryMetrics` (maker fill rate, average fill time, requotes, partials, fallback cost)
  before raising size. A low maker fill rate with high fallback cost means the edge may be
  eaten by fees.

## Notifications

- Configure Telegram (`chat id` + bot token) and/or a webhook in **Settings → Notificações**.
- The delivery queue is in-memory, bounded and non-blocking. Each channel gets up to 3
  attempts with exponential backoff; `429` honors `Retry-After`, other `4xx` are not retried.
- Events are deduplicated for 5 minutes by trade/halt/day/feed key, so a flapping feed or a
  repeated close failure does not spam the channel.
- Use **Testar notificações** to send one message per configured channel. The result shows only
  channel name/status; tokens, chat ids and webhook URLs are never returned or logged.
- Alerts cover trade close, halt, close failure, stale feed and daily target/stop.
- A notification outage never blocks trading. Check the dashboard/logs if alerts stop arriving.

## Known operational gaps

- Automated on-host backups exist, but shipping them off-host is left to the operator/cron.
- No Prometheus endpoint yet (tracked issue).
- No automatic live-position reconciliation after a **process crash** (manual review required).
- No alert when the process dies (use Docker restart + external monitoring).
