# Observability

## Endpoints

| Endpoint            | Auth                              | Purpose                                                          |
| ------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `/api/health/live`  | Public                            | Process liveness; always 200 while the event loop is responsive. |
| `/api/health/ready` | Public                            | Readiness; 503 when SQLite `SELECT 1` fails.                     |
| `/api/health`       | Public                            | Backward-compatible aggregate (status + DB + uptime).            |
| `/metrics`          | Bearer token, or loopback in prod | Prometheus text exposition (v0.0.4).                             |

`/metrics` is rate-limited to 120 requests/minute. Set `METRICS_TOKEN` (16+ chars) when the
scraper is not on loopback. Without a token, production accepts only `127.0.0.1`/`::1`; a
reverse proxy that reaches the API from a private address must send the token.

## Metric contract

| Metric                                | Type      | Meaning                                                |
| ------------------------------------- | --------- | ------------------------------------------------------ |
| `goodz_build_info`                    | gauge     | `{version}` build identity.                            |
| `goodz_process_uptime_seconds`        | gauge     | Process uptime.                                        |
| `goodz_process_rss_bytes`             | gauge     | Resident memory.                                       |
| `goodz_db_up`                         | gauge     | SQLite ping succeeded.                                 |
| `goodz_bot_running` / `_halted`       | gauge     | Bot state.                                             |
| `goodz_halt_reason_info`              | gauge     | `{reason}` when halted.                                |
| `goodz_equity_usd`                    | gauge     | Current equity.                                        |
| `goodz_day_pnl_usd` / `_pct`          | gauge     | Day PnL net of fees.                                   |
| `goodz_fees_day_usd` / `trades_day`   | gauge     | Day fees and closed trades.                            |
| `goodz_orders_last_minute`            | gauge     | Orders submitted in the last 60s.                      |
| `goodz_feed_connected`                | gauge     | Market feed connected.                                 |
| `goodz_feed_staleness_seconds`        | gauge     | Seconds since last tick; `-1` if never.                |
| `goodz_feed_latency_ms`               | gauge     | Last feed latency; `-1` if unknown.                    |
| `goodz_api_connected`                 | gauge     | Private MEXC API connected.                            |
| `goodz_position_open` / `_qty`        | gauge     | Open position presence/size.                           |
| `goodz_unrealized_pnl_usd`            | gauge     | Open position unrealized PnL.                          |
| `goodz_maker_fill_rate_pct`           | gauge     | Session maker fill rate.                               |
| `goodz_maker_fill_time_ms`            | gauge     | Session average maker fill time; `-1` if unknown.      |
| `goodz_requotes` / `partial_fills`    | gauge     | Session requote/partial counts.                        |
| `goodz_taker_fallbacks`               | gauge     | Session taker fallback count.                          |
| `goodz_fallback_cost_usd`             | gauge     | Estimated fallback fee cost.                           |
| `goodz_http_requests_total`           | counter   | `{method,route,status}`; route is the Fastify pattern. |
| `goodz_http_request_duration_seconds` | histogram | Same labels, 10 buckets + `+Inf`.                      |

Labels are intentionally low-cardinality: HTTP route **patterns** and status classes, never raw
URLs, query strings, symbols list, user data, tokens or account identifiers. `/metrics` itself
is excluded from HTTP observations.

## Prometheus

Copy `deploy/prometheus/prometheus.yml` and `deploy/prometheus/alerts.yml` next to your
Prometheus config. Put the metrics token in `goodz-metrics-token` with mode `0400`.

```bash
docker run --rm -v "$PWD/deploy/prometheus:/etc/prometheus" \
  prom/prometheus promtool check config /etc/prometheus/prometheus.yml
```

The rules cover process/scrape down, DB down, halt, stale feed, private API disconnect, high
order rate and 5xx rate. Route alerts to the same Telegram/webhook used by the bot.

### Alert test

1. Configure the bot notification channel and use **Settings → Notificações → Testar**; this
   proves the delivery path.
2. In Prometheus, verify the rule is loaded:
   `curl -s localhost:9090/api/v1/rules | jq '.data.groups[].rules[].name'`.
3. Fire a synthetic alert without touching production by stopping a canary/scrape target, or
   temporarily point the job at a closed port; `GoodzDown` must enter `firing` within 1 minute.
4. Confirm the alert reaches Telegram/Uptime Kuma and then restore the target.

## Uptime Kuma / external monitor

- Monitor `GET /api/health/ready` every 30s, expecting HTTP 200 and keyword `"db":true`.
- Monitor the container/host and the public dashboard separately from the trading feed.
- Use a second monitor for `/metrics` only if the scraper is external; send the Bearer token.
- Alert on TLS certificate expiry for the dashboard hostname.

## SLO and playbook

- Availability target: 99.5% monthly for `/api/health/ready`.
- Scrape interval 15s; `GoodzDown` fires after 1m, so a single missed scrape is tolerated.
- **GoodzDown**: check `docker compose ps`, container logs and host disk. Restart only after
  confirming the account is flat/reconciled.
- **GoodzDbDown**: stop the bot, run `pnpm backup` if the file is readable, check disk space and
  restore only with the API stopped (see the runbook).
- **GoodzBotHalted**: read the halt reason, check MEXC positions/orders and the ledger; do not
  auto-resume a daily stop or kill switch.
- **GoodzFeedStale**: entries are blocked, exits may still be impossible without a price; verify
  MEXC public status and reconnect. Do not force a trade from the dashboard.
- **GoodzApiDisconnected**: a running live bot cannot reconcile; stop it and run the startup
  reconciliation.
- **High order rate / 5xx**: inspect requotes, rate-limit responses and recent deploys.

The dashboard **Logs** page is the first place to inspect errors. Logs are retained in SQLite
for 14 days by default (`RETENTION_LOGS_DAYS`).
