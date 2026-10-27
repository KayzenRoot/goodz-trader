# Foundation evidence (M0/M1)

Date: 2026-10-26
Main commit: `025a8aa` (foundation evidence + issue map merged via PR #33)
Repository: <https://github.com/KayzenRoot/goodz-trader>

This is the evidence packet for the foundation/MVP issue set. Demo PnL is synthetic and is
**not** evidence of trading edge.

## CI and security

| Gate                       | Result                   | Evidence                                                               |
| -------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| CI / Quality               | ✅                       | run `40409048001` — Quality, E2E and **Quality Gate** success          |
| CodeQL                     | ✅                       | run `40409048044` — javascript-typescript, security-and-quality        |
| Security                   | ✅                       | run `40409047985` — Gitleaks, Semgrep (`--severity ERROR`), actionlint |
| OpenSSF Scorecard          | ✅                       | run `40409048000` — CLI JSON artifact + job summary                    |
| Codecov                    | ✅                       | Quality job step "Upload coverage to Codecov" success (OIDC)           |
| StepSecurity Harden-Runner | ✅                       | audit mode in Quality/E2E jobs                                         |
| ECC Tools AgentShield      | ✅ **100/100 (Grade A)** | issue #1 comment `6428386758`; 0 critical/high/medium/low              |
| Dependabot alerts          | ✅ 0 open                | after zod 4.6.7, vitest 4.1.12, @fastify/static 10.1.7, esbuild 0.28.2 |

## Tests

| Suite          | Result                                                                      |
| -------------- | --------------------------------------------------------------------------- |
| `@goodz/core`  | 62 tests passed, ~98% lines                                                 |
| `@goodz/mexc`  | 22 tests passed, ~92% lines                                                 |
| `@goodz/api`   | 51 tests passed; coverage floor 65% lines / 63% statements / 45% branches   |
| `@goodz/web`   | 14 tests passed, ~98% lines                                                 |
| Playwright E2E | 4/4: overview, paper start/stop, settings persistence, trades/terminal/logs |

Commands executed locally and in CI: `pnpm format:check`, `lint`, `typecheck`,
`test:coverage`, `build`, `pnpm --filter @goodz/web e2e`.

## Repository governance

| Setting                   | Value                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruleset `main-protection` | id `25916370`: PR required, linear history, conversation resolution, **Quality Gate** + **CodeQL (javascript-typescript)**, no force/delete, no bypass, squash-only |
| Ruleset `release-tags`    | id `25916371`: `v*` tags cannot be moved/deleted                                                                                                                    |
| Merge policy              | squash only, auto-delete head branch, auto-merge enabled                                                                                                            |
| Secret protection         | secret scanning + push protection enabled                                                                                                                           |
| Dependency security       | Dependabot alerts + security updates, dependency review on PRs                                                                                                      |
| Disclosure                | private vulnerability reporting enabled                                                                                                                             |
| Actions token             | read-only; Actions cannot approve PRs                                                                                                                               |
| Dependabot config         | weekly, grouped, 7-day cooldown, major versions ignored (known exceptions closed)                                                                                   |

## GitHub Apps

Analyzed installed apps and selected non-duplicative ones:

- **ECC Tools** — used; AgentShield 100/100.
- **Codecov** — used; OIDC upload.
- **Socket Security** — installed for dependency PR review; native dependency review remains the required gate.
- **StepSecurity** — used; Harden-Runner audit.
- **Greptile** — optional, permission update pending; not required.
- **Renovate** — disabled for this repo via `renovate.json`; Dependabot is authoritative.
- **Sonar / Sentry / CircleCI / Cirrus / reviewdog** — not used; would duplicate existing gates.

Details: [GITHUB_APPS.md](GITHUB_APPS.md).

## Deliverables verified

- Monorepo: web, API, core, MEXC client; SQLite ledger; paper/live brokers.
- Settings page with API credentials (AES-GCM), mode, leverage, strategy, risk, daily guard,
  fees, notifications, kill switch, live gates.
- Dashboard: Overview, Terminal, Trades, Analytics, Settings, Logs/Audit; demo labels.
- Risk guard: sizing, stop/target, cooldown, consecutive losses, max trades/orders, spread,
  kill switch, halt without auto-resume.
- ECC adapted for OpenCode: instructions, 10 agents, 12 commands, 12 skills, rules.
- 24 issues + 6 milestones + labels; roadmap in [ROADMAP.md](../ROADMAP.md).

## Known limitations / not claimed

- **Live trading was not validated with real funds.** Market/cancel/partial-fill semantics are
  beta until issue #17.
- Private WS/reconciliation is implemented in issue #16; live semantics (market/cancel/partial
  fills) still require the blocked validation in issue #17.
- Docker image was not built locally because the Docker daemon was unavailable; the file is
  provided and the Docker path is an open issue (#21).
- SQLite REAL money is not exact fixed-point (issue #24).
- Demo PnL is synthetic; no profitability claim.
- The first protected PR (#33) merged successfully; future changes must follow the same path.
- Scorecard score is low primarily because the ruleset/PR history is new; it will improve as
  PRs are merged with review.
