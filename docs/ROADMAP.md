# Roadmap

The **GitHub issue tracker is the source of truth**. This document is a map of the
milestones and the intended production sequence. Issue numbers are live links.

## Current status

- M0, M1, M3, M4 and M5 are complete on `main` (tests, E2E, Docker, backup drill,
  observability, dashboard, backtest, ledger micros).
- M2 is complete except **[#17](https://github.com/KayzenRoot/goodz-trader/issues/17)**, which
  is **blocked on real MEXC credentials and a deliberately tiny live order**. Live trading
  remains disabled until that validation is recorded.

## Milestones

| Milestone                        | Goal                              | Exit criteria                                                 |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| **M0 — Foundation & governance** | Repo, CI, rulesets, ECC, docs     | main protected, CI green, issues created, foundation merged   |
| **M1 — Paper MVP**               | Working paper scalper + dashboard | start/stop, settings, risk guard, ledger, E2E green           |
| **M2 — Live hardening**          | Safe live path                    | private WS/reconciliation, live validation, kill switch drill |
| **M3 — Dashboard Pro**           | Deeper analytics/UX               | mobile polish, accessibility, trade replay, alerts            |
| **M4 — Deploy & ops**            | Reproducible self-host            | Docker, backups, observability, runbook drills                |
| **M5 — Research**                | Backtest & optimization           | replay harness, fee/slippage/funding model, parameter reports |

## M0 — Foundation & governance

- [#1](https://github.com/KayzenRoot/goodz-trader/issues/1) Epic: foundation, governance and quality pipeline
- [#2](https://github.com/KayzenRoot/goodz-trader/issues/2) Rulesets, branch protection and repository security
- [#3](https://github.com/KayzenRoot/goodz-trader/issues/3) CI + Playwright E2E as Quality Gate
- [#4](https://github.com/KayzenRoot/goodz-trader/issues/4) ECC integration for OpenCode
- [#5](https://github.com/KayzenRoot/goodz-trader/issues/5) ADRs, architecture, safety, MEXC and runbook

## M1 — Paper MVP

- [#6](https://github.com/KayzenRoot/goodz-trader/issues/6) MEXC client: signed REST, public WS, contracts
- [#7](https://github.com/KayzenRoot/goodz-trader/issues/7) Paper broker + synthetic/MEXC feeds + deterministic demo
- [#8](https://github.com/KayzenRoot/goodz-trader/issues/8) Momentum + order-flow strategy with maker-first/fallback
- [#9](https://github.com/KayzenRoot/goodz-trader/issues/9) Server-side risk guard: sizing, daily stop/target, kill switch
- [#10](https://github.com/KayzenRoot/goodz-trader/issues/10) SQLite ledger and fee/PnL analytics
- [#11](https://github.com/KayzenRoot/goodz-trader/issues/11) Fastify API, WebSocket, auth and encrypted settings
- [#12](https://github.com/KayzenRoot/goodz-trader/issues/12) Settings page with full bot control
- [#13](https://github.com/KayzenRoot/goodz-trader/issues/13) Overview + visual risk guard + system health
- [#14](https://github.com/KayzenRoot/goodz-trader/issues/14) Terminal: candles, order book, tape and position
- [#15](https://github.com/KayzenRoot/goodz-trader/issues/15) Trades & Analytics with CSV export

## M2 — Live hardening

- [#16](https://github.com/KayzenRoot/goodz-trader/issues/16) Private WS, reconciliation and idempotency
- [#17](https://github.com/KayzenRoot/goodz-trader/issues/17) Live validation with minimum notional and ledger reconciliation (**blocked**)
- [#18](https://github.com/KayzenRoot/goodz-trader/issues/18) Maker-first live: post-only, requote, partial fills
- [#19](https://github.com/KayzenRoot/goodz-trader/issues/19) Reliable notifications (Telegram/webhook) with retry

## M3 — Dashboard Pro

- [#20](https://github.com/KayzenRoot/goodz-trader/issues/20) Mobile, accessibility, trade replay and alert center

## M4 — Deploy & observability

- [#21](https://github.com/KayzenRoot/goodz-trader/issues/21) Docker, backup/restore, retention and runbook drill
- [#22](https://github.com/KayzenRoot/goodz-trader/issues/22) Prometheus metrics, health and external alerting

## M5 — Research

- [#23](https://github.com/KayzenRoot/goodz-trader/issues/23) Backtest/replay with fees, slippage, funding and walk-forward
- [#24](https://github.com/KayzenRoot/goodz-trader/issues/24) Fixed-point ledger and exact reconciliation

## Sequencing rule

Do not start M2 live work until M1 paper E2E is green and the live preflight has a manual
validation record. Do not increase notional until a full live session reconciles with the
MEXC ledger (fees and average prices).

## Definition of done (per issue)

See `AGENTS.md`. Closed issues must include evidence: PR link, commands run, test output and
any manual validation. A demo PnL is not evidence of edge.
