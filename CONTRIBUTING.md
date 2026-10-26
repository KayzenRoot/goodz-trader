# Contributing

## Workflow

1. Pick an open issue. Read its acceptance criteria and linked docs.
2. Create a branch from `main`: `feat/12-maker-timeout`, `fix/31-daily-fees`, `docs/...`.
3. Plan non-trivial changes (`/plan`) and write/execute the failing test first (`tdd-workflow`).
4. Keep the diff bounded. Do not mix refactors with behavior changes.
5. Run the local gates:
   ```bash
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
   For UI/control-flow changes also run `pnpm e2e`.
6. Open a PR using the template. Link the issue. `main` requires the **Quality Gate** and
   **CodeQL** checks, a linear history and conversation resolution.
7. Squash merge only. Delete the branch after merge.

## Commits

Conventional commits, imperative, ≤100 chars:

```
feat(engine): reuse canceled maker trade on taker fallback
fix(web): keep save disabled while bot is running
test(risk): cover consecutive-loss halt
docs(safety): add live validation checklist
```

Scopes: `api`, `web`, `core`, `mexc`, `risk`, `engine`, `db`, `ci`, `docs`, `deps`, `repo`.

## Definition of Done

- Linked issue and acceptance criteria satisfied.
- Tests for the happy path, blocked path and fee/PnL math where relevant.
- No secrets in code, fixtures, logs, screenshots or issue text.
- Docs/ADR/runbook updated if behavior changed.
- UI states: loading, empty, error, stale data, mobile, keyboard/focus.
- No new `any`; all external inputs validated with Zod.
- The PR body includes verification evidence (commands + result).

## Trading changes

Any change that can place, size, close or halt an order requires:

- A test that proves the risk guard still blocks when it should.
- A paired update to `docs/TRADING_SAFETY.md` if a limit changes.
- Manual paper validation and, for live semantics, a tiny live validation documented in the
  issue. If live validation was not performed, label the behavior **beta**.
- Never weaken the live gate, secret handling or daily guard to make a test pass.

## Security

Do not open public issues for vulnerabilities. Use GitHub private vulnerability reporting
(Security → Advisories). See [SECURITY.md](SECURITY.md).

## Development notes

- Node 22+, pnpm 11+, Windows/macOS/Linux supported.
- API dev server runs on `127.0.0.1:3001`; Vite on `5173` and proxies `/api` + `/ws`.
- The DB lives in `.data/goodz.db` (gitignored). `pnpm db:reset` recreates it.
- E2E uses a unique temporary DB and `SEED_DEMO=true`; never point tests at real keys.
- The default `APP_SECRET` in development is generated in `.data/dev-secret`; production
  requires an explicit 32+ character value.
