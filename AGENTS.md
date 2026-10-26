# Goodz Trader — Agent Instructions

This repository is a MEXC Futures scalping engine plus a real-time risk dashboard.
The source of truth for planned work is the GitHub issue tracker + milestones. Read the
relevant issue before changing behavior. Do not invent scope that is not in an issue or
explicitly requested by the user.

## Non-negotiable safety rules

1. **Paper first.** Any strategy, sizing or execution change must be validated in paper mode
   with tests before it can be enabled live.
2. **Never bypass the risk guard.** `packages/core/src/risk.ts` is the only authority for
   entry sizing and limits. Do not place an order from a route, UI handler or script.
3. **Live trading is double-gated.** `LIVE_TRADING_ENABLED=true` in the server AND the exact
   confirmation phrase in the start dialog are required. Never weaken or automate this.
4. **Secrets never enter git, logs, fixtures, screenshots or issue bodies.** API secrets are
   encrypted with AES-256-GCM and never returned to the browser. Redact tokens in logs.
5. **Tests must never call the real MEXC private API.** Use `fakeClient`, paper broker or a
   local mock. Public market data may be used only in explicit integration tests.
6. **A halted bot stays halted** until a human restarts it. Do not silently resume after a
   daily stop, consecutive-loss halt or kill switch.
7. **Daily loss is sacred.** Any change to daily PnL, fees, sizing or close logic needs a
   regression test for `daily_stop` and `daily_target`.
8. **No guaranteed profit claims.** This is risky leveraged trading software, not financial
   advice. Never market it as a money printer.

## Architecture

```
apps/web (React/Vite) ──HTTP + WS──> apps/api (Fastify)
                                      │
                                      ├─ bot/engine.ts (state machine, exits, guard)
                                      ├─ brokers/paper.ts | brokers/live.ts
                                      ├─ services/market-data.ts (synthetic | MEXC)
                                      ├─ services/settings.ts (AES-GCM secrets)
                                      ├─ db/repo.ts (SQLite WAL ledger)
                                      └─ routes/* (REST + /ws)
packages/core   domain: zod schemas, strategy, risk, PnL, analytics
packages/mexc   signed REST client + public WS
```

- One bot process, one active symbol, one position by default.
- The engine reacts to `market` events; the UI consumes `status`, `trade`, `log`, `equity`
  and `market` events through the same event bus.
- SQLite is the ledger. The WebSocket is a projection, never the source of truth.

## Commands

```bash
pnpm install
pnpm dev                 # API :3001 + Vite :5173
pnpm build
pnpm start               # serves built dashboard + API on :3001
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm e2e                 # built app, Playwright
pnpm db:reset
```

## Definition of Done

- The change is linked to an issue and respects the approved scope.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; coverage does not regress.
- New trading behavior has unit tests for the happy path, blocked path and fee/PnL math.
- New endpoints have validation, auth/rate-limit considerations and an integration test.
- New UI states include loading, empty, error, mobile and keyboard focus.
- Documentation is updated (`README`, ADR, runbook or safety doc) when behavior changes.
- No secrets, no `console.log` of sensitive data, no direct push to `main`.
- The PR uses a conventional commit title and the template checklist.

## Code standards

- TypeScript strict, `noUncheckedIndexedAccess`; no `any` in new domain code.
- Validate every external input (HTTP, env, MEXC, WS) with Zod at the boundary.
- Keep money math in `packages/core`; round at the edge and persist fees explicitly.
- SQL must use prepared statements. Never interpolate user values.
- Prefer small pure functions and dependency injection over singletons.
- UI copy is pt-BR; code identifiers and API errors are English or stable codes.
- Accessible controls: labels, `aria-*`, focus-visible, no color-only state.
- New dependencies need a reason, license check and lockfile update.

## ECC workflow (adapted for OpenCode)

Use the ECC commands available in `.opencode/commands`:

1. `/plan` — implementation blueprint for non-trivial work.
2. `tdd-workflow` skill — write the failing test first.
3. Implement the smallest coherent diff.
4. `/code-review` and `/security` — fresh-context review.
5. `/verify` — run the actual gates, paste evidence.
6. Commit with conventional commits; open a PR. Never push to `main`.

See `docs/engineering/ECC.md` and `docs/engineering/QUALITY_GATES.md`.

## Read first

- `docs/ARCHITECTURE.md`
- `docs/TRADING_SAFETY.md`
- `docs/MEXC.md`
- `docs/RUNBOOK.md`
- `CONTRIBUTING.md`
- `PROJECT.md` in `.opencode/instructions/`
