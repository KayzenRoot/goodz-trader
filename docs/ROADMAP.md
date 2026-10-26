# Roadmap

The **GitHub issue tracker is the source of truth**. This document is a map of the
milestones and the intended production sequence. Issue numbers are added when created.

## Milestones

| Milestone                        | Goal                              | Exit criteria                                                 |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| **M0 — Foundation & governance** | Repo, CI, rulesets, ECC, docs     | main protected, CI green, issues created, foundation merged   |
| **M1 — Paper MVP**               | Working paper scalper + dashboard | start/stop, settings, risk guard, ledger, E2E green           |
| **M2 — Live hardening**          | Safe live path                    | private WS/reconciliation, live validation, kill switch drill |
| **M3 — Dashboard Pro**           | Deeper analytics/UX               | mobile polish, accessibility, trade replay, alerts            |
| **M4 — Deploy & ops**            | Reproducible self-host            | Docker, backups, observability, runbook drills                |
| **M5 — Research**                | Backtest & optimization           | replay harness, fee/slippage/funding model, parameter reports |

## Issue map (titles)

### Foundation / governance (M0)

- [Epic] M0 — Foundation, governance and quality pipeline
- Configure rulesets, branch protection and repository security
- ADR 0001 — engine architecture and risk boundaries
- CI quality gate + Playwright E2E
- ECC agent workflow integration for OpenCode

### Paper MVP (M1)

- MEXC Futures client: signed REST + public WS + contract metadata
- Deterministic paper broker and synthetic/live market feeds
- Momentum + order-flow scalper with maker timeout/fallback
- Risk guard: daily stop, target, sizing, cooldown, kill switch
- Trade ledger, fees, equity snapshots and analytics
- Fastify API, WebSocket stream, auth and rate limiting
- Settings page with full bot/API/risk control
- Overview dashboard and visual risk guard
- Trades & Analytics pages with CSV export
- E2E tests for paper start/stop and settings persistence

### Live hardening (M2)

- Live preflight, one-way mode, flat-account checks and API validation
- Private MEXC WS for order/position updates and reconciliation after crash
- Maker-first real execution: post-only, requote, cancel/replace
- Idempotency and duplicate-order protection at the broker boundary
- Live validation with minimum notional and ledger reconciliation
- Notification delivery retries and halt alerts
- Security review of live trading and secret rotation drill

### Dashboard Pro (M3)

- Mobile/responsive polish and keyboard accessibility audit
- Trade replay and per-trade chart markers
- Alert center and daily report
- Symbol/strategy comparison and multi-symbol read-only view

### Deploy & ops (M4)

- Reproducible Docker image and Compose deployment
- Backup/restore drill and retention policy
- Prometheus metrics, healthchecks and external alerting
- Multi-environment configuration (dev/staging/prod)

### Research (M5)

- Historical candle/order-book replay harness
- Fee, spread, slippage and funding model
- Parameter sweep with out-of-sample/walk-forward reports
- Strategy comparison and risk-of-ruin report

## Sequencing rule

Do not start M2 live work until M1 paper E2E is green and the live preflight issue has a
manual validation record. Do not increase notional until a full live session reconciles with
the MEXC ledger (fees and average prices).

## Definition of done (per issue)

See `AGENTS.md`. Closed issues must include evidence: PR link, commands run, test output and
any manual validation. A demo PnL is not evidence of edge.
