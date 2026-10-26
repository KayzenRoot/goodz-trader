# Quality gates

## Local gates (must pass before PR)

| Command              | Enforces                                             |
| -------------------- | ---------------------------------------------------- |
| `pnpm format:check`  | Prettier formatting                                  |
| `pnpm lint`          | ESLint 9 + TypeScript + React hooks/a11y             |
| `pnpm typecheck`     | strict TS across workspace                           |
| `pnpm test`          | Vitest unit/integration                              |
| `pnpm test:coverage` | thresholds: core 85%, MEXC 80%, API 70%, web lib 70% |
| `pnpm build`         | API bundle + web production build                    |
| `pnpm e2e`           | Playwright paper/control flows                       |

Coverage thresholds are floors, not goals. Trading math and signing should stay near 100%.
Current floors: core 85%, MEXC 80%, API 70%, web lib 70% (lines/statements; branches/functions
have their own floors in each `vitest.config.ts`).

Bootstrap scripts: `scripts/github/bootstrap.mjs`, `apply-rulesets.mjs`, `apply-settings.mjs`.
See `scripts/github/README.md`.

## CI (`ci.yml`)

- `quality`: checkout → pnpm 11.20.0 → Node 22 → frozen install → format/lint/typecheck/coverage/build.
- `e2e`: frozen install → Playwright chromium → build → E2E → upload report on failure.
- `quality-gate`: aggregates both; this is the required status check.

## CodeQL (`codeql.yml`)

JavaScript/TypeScript analysis on push, PR and weekly schedule. SARIF uploaded to code
scanning. The `CodeQL` job is a required check on `main`.

## Security (`security.yml`)

- **Gitleaks** — secret history scan.
- **Semgrep** — `--config=auto`, SARIF upload.
- **actionlint** — workflow syntax/expressions.
- Runs on push, PR and weekly.

## Dependency review (`dependency-review.yml`)

PR-only. Fails on high severity, comments summary. Dependabot opens grouped weekly PRs for
npm and GitHub Actions, plus Docker base updates.

## OpenSSF Scorecard (`scorecard.yml`)

Weekly + main push; publishes results and SARIF. Tracks branch protection, token
permissions, pinned actions, dangerous workflow patterns.

## Rulesets (GitHub)

`main`:

- require PR (0 approvals — solo maintainer), conversation resolution, linear history
- required checks: **Quality Gate**, **CodeQL**
- block force push and deletion
- no bypass actors

`v*` tags: block deletion and non-fast-forward.

Repository: squash-only merges, auto-delete head branch, secret scanning + push protection,
Dependabot alerts/security updates, private vulnerability reporting, read-only default
workflow token.

## Review expectations

- Trading/risk changes: security-reviewer + code-reviewer + a manual paper run.
- Secret/auth changes: security review, and rotate any test value.
- MEXC client changes: signing test + live validation issue update.
- Frontend changes: screenshot + keyboard/mobile check.

## What CI does not prove

- Profitability, slippage, queue position, funding or liquidation.
- Live MEXC semantics (no private testnet). A tiny live validation is required.
- That a demo/seed PnL is real. Demo rows are labeled and excluded from claims.
