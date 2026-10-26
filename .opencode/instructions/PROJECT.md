# Goodz Trader — project-specific agent rules

These rules complement `AGENTS.md` and ECC's `INSTRUCTIONS.md`. If they conflict with a
GitHub issue, stop and ask; do not silently choose.

## Product boundaries

- The product is a **single-user, self-hosted MEXC Futures scalper + dashboard**.
- It is not a custodial service, copy-trading platform, signal group or multi-tenant SaaS.
- One engine process, one active contract, one open position by default.
- UI language: pt-BR. Code, identifiers, logs and stable error codes: English.
- The bot may place many leveraged orders. Every new feature must make this safer, faster
  or more observable — not merely more profitable in a demo.

## Trading invariants

- Entry path: strategy signal -> `evaluateEntry` -> broker order. Any other path is a bug.
- Exit is always allowed even when entries are blocked (stop, target, kill switch).
- Fees are part of PnL and of the daily guard. Never report gross as net.
- Use the contract's `contractSize`, `volUnit`, `minVol`, `priceUnit` and `maxLeverage`.
- Live start requires: flat account, one-way mode, credentials, server flag, phrase.
- `execution.killSwitch=true` blocks start and forces emergency flatten.
- A daily stop/halt is not a suggestion. Do not auto-resume.
- Demo rows are marked `is_demo`; never mix them into live reporting without a visible label.

## Data rules

- SQLite in WAL mode. All writes go through `Repository`; no ad-hoc SQL in routes.
- Monetary values are REAL at the boundary but must be rounded and audited. Exact
  fixed-point accounting is an open issue; do not claim it is exact.
- Never delete trades to "fix" stats. Append an adjustment or document the migration.
- Settings updates are audited; secrets are encrypted and masked.
- Logs are structured, retained in SQLite and streamed. Do not log secrets or raw headers.

## Frontend rules

- The dashboard is a control surface, not decoration. Every destructive action needs a
  confirmation dialog and an accessible label.
- Loading, empty, error and stale-data states are mandatory.
- Use the existing UI primitives (`components/ui`) before adding a dependency.
- Charts must not block the initial route: lazy-load heavy pages.
- Mobile must remain usable at 390px; no horizontal page scroll.
- Do not show green/red as the only signal; pair it with text/icon.

## Testing rules

- Core math: 90%+ coverage is expected.
- MEXC signing and client: test query ordering, exact JSON body signing, error mapping.
- API: integration tests via `app.inject`; test auth, validation, live gate and settings.
- E2E: paper start/stop, settings persistence, trades/terminal/logs.
- Never write a test that depends on the real MEXC private API or real keys.
- A test that asserts demo PnL as real profit is forbidden.

## Change control

- One PR per issue unless the issue explicitly bundles a foundation.
- No direct pushes to `main`; the ruleset requires a PR + Quality Gate + CodeQL.
- Update `docs/ROADMAP.md` when an issue is split or deferred.
- If a live-trading behavior is not validated manually, mark it "beta" in the issue and UI.
- When uncertain about MEXC semantics, add a documented assumption and an integration test;
  do not guess silently.
