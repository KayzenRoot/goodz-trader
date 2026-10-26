# ADR 0002 — Server-side risk guard is the only entry authority

- Status: accepted
- Date: 2026-10-26

## Context

Leveraged scalping can lose the account quickly. A UI-only or strategy-only limit is easy to
bypass, and fee drag can turn a positive backtest into a losing live run. We need explicit,
testable, persisted limits that survive restarts and cannot be disabled by the browser.

## Decision

- `evaluateEntry` in `packages/core/src/risk.ts` returns allow/block + sizing.
- The engine is the only caller of the broker for entries.
- Limits: leverage vs contract, notional, margin, risk %, spread, trades/day, orders/min,
  consecutive losses, cooldown, min equity, open positions, API-disabled contracts.
- Daily guard uses net PnL including fees; reset hour UTC; halt reasons persisted.
- Live start is double-gated (server flag + typed phrase). Kill switch persists.
- Targets/take-profit must exceed round-trip fees + 2 bps (schema validation).

## Consequences

- Some valid trades are blocked (e.g., min contract too large for the risk budget). That is
  intentional: we block instead of rounding up.
- Changing a limit requires tests and a docs update; the guard is not a UI preference.
- A halt requires a human restart; this is slower but safer than auto-resume.

## Invariants

1. No entry if `allowed !== true`.
2. Exit is never blocked by entry guards.
3. Position size never exceeds the min of the three caps.
4. Net PnL and fees are persisted; no gross-only daily guard.
5. Halt reasons are stable codes, not free text.

## Follow-ups

- Liquidation-price and funding-aware guard.
- Portfolio-wide exposure if multi-symbol is added.
- Alerting on repeated guard blocks.
