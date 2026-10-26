# GitHub apps, audits and repo security

## Installed apps (observed on 2026-10-26)

The account has these relevant apps installed (GitHub → Settings → Applications →
Installed GitHub Apps). Most are granted **all repositories**; verify repository access in
each app's Configure page.

| App                                | Free for public repo | Decision for Goodz Trader                                                                                                                                                                    |
| ---------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ECC Tools**                      | Yes                  | **Use.** Installed on all repos. Run `/ecc-tools audit` on an issue and `/ecc-tools analyze` when evolving agent config. Do not let it duplicate our local ECC files blindly; review its PR. |
| **Codecov**                        | Yes                  | **Use.** CI uploads LCOV via OIDC; badge + coverage status.                                                                                                                                  |
| **Socket Security**                | Yes                  | **Use.** Automatically reviews dependency PRs (Dependabot/Renovate). Keep alerts informational; dependency-review remains the required gate.                                                 |
| **StepSecurity Actions Security**  | Yes                  | **Use.** `harden-runner` in audit mode in CI. Move to block mode only after a clean baseline.                                                                                                |
| **Greptile**                       | Yes (public)         | **Optional.** AI PR review. A permission update is pending; approve only if you want a second reviewer. Keep it non-blocking.                                                                |
| **SonarQubeCloud**                 | Yes (public)         | **Optional.** Requires importing the project and a `SONAR_TOKEN`; CodeQL + Semgrep already cover SAST. Add only if you need the hosted quality gate.                                         |
| **Renovate**                       | Yes                  | **Disabled for this repo.** Dependabot is authoritative; running both creates duplicate PRs. Add `renovate.json` with `"enabled": false` if the app starts opening PRs.                      |
| **reviewdog**                      | Yes                  | **Not used.** CI already annotates lint/test output; adding it would duplicate ESLint.                                                                                                       |
| **Sentry**                         | Free tier            | **Optional.** Useful later for frontend errors; requires DSN and privacy review. Not enabled.                                                                                                |
| **CircleCI / Cirrus CI**           | Free tier            | **Not used.** GitHub Actions is the single CI source.                                                                                                                                        |
| **Codecov, Socket, Harden-Runner** | —                    | The three free apps with a concrete, non-duplicative role.                                                                                                                                   |

Other installed apps (Chromatic, Claude, Cloudflare, Cursor, Linear, Railway, Render,
Supabase, Vercel, etc.) are unrelated to this repo's quality gates and are not configured.

## Native, required gates

| Capability               | Implementation                                                   |
| ------------------------ | ---------------------------------------------------------------- |
| CI / quality gate        | `.github/workflows/ci.yml` → **Quality Gate** required check     |
| SAST                     | CodeQL (`javascript-typescript`, security-and-quality)           |
| Secret scanning          | GitHub secret scanning + push protection + non-provider patterns |
| Dependency alerts        | Dependabot alerts + security updates                             |
| Dependency review        | `dependency-review-action` on PRs                                |
| Supply chain             | OpenSSF Scorecard weekly                                         |
| Container base updates   | Dependabot Docker                                                |
| Vulnerability disclosure | private vulnerability reporting                                  |
| Branch protection        | `main` ruleset + tag ruleset                                     |

## App configuration checklist

### ECC Tools

- [x] Installed (all repositories).
- [x] Free for public repos.
- [x] Commented `/ecc-tools audit` on issue #1: **100/100 (Grade A)**, 0 findings.
- [ ] Comment `/ecc-tools analyze` only if you want a hosted PR of suggestions; compare with
      `.opencode/` before merging.

### Codecov

- [x] App installed.
- [x] CI uses `codecov/codecov-action@v5` with OIDC (`id-token: write`).
- [x] `codecov.yml` sets project auto + patch target 70%, non-blocking for merge.
- [ ] Confirm the first upload/badge after the first green CI run.

### Socket Security

- [x] App installed.
- [ ] Confirm it comments on the first dependency PR.
- [ ] Do not grant it workflow/secret write access.

### StepSecurity Harden-Runner

- [x] App installed.
- [x] Audit mode in `quality` and `e2e` CI jobs.
- [ ] Review egress baseline for 1-2 weeks; then consider `block` with an allowlist.

### Greptile / Sonar / Renovate

- [ ] Approve Greptile permission update only if you want AI PR review.
- [ ] Renovate: disable for this repo if it opens duplicate Dependabot PRs (`renovate.json`).
- [ ] Sonar: only after a token/import; otherwise skip.

## Repo settings checklist

- [x] Secret scanning, push protection, non-provider patterns, validity checks.
- [x] Dependabot alerts + security updates.
- [x] Private vulnerability reporting.
- [x] Actions default token read-only; PR approvals disabled.
- [x] Squash-only merges; delete head branches.
- [x] `main` ruleset: PR, linear history, Quality Gate + CodeQL, conversation resolution.
- [x] `v*` tag ruleset: no deletion / no force push.
- [ ] Optional: require signed commits (only after local signing is configured).
- [ ] Optional: environment `production` with manual approval for deploys.

## Why not install every app

Every app sees code and metadata, increases notification noise and can create conflicting
status checks. This is a single-maintainer trading app: native gates plus at most one
high-signal PR reviewer is enough. Revisit when the team grows.
