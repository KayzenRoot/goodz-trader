# GitHub apps, audits and repo security

## Installed apps (observed on 2026-10-26)

The account has these relevant apps installed (GitHub → Settings → Applications →
Installed GitHub Apps). Most are granted **all repositories**; verify repository access in
each app's Configure page.

| App                               | Free for public repo | Decision for Goodz Trader                                                                                                                                                                        |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ECC Tools**                     | Yes                  | **Use.** Installed on all repos. `/ecc-tools audit` returned **100/100 (Grade A)** on issue #1. Run `/ecc-tools analyze` when evolving agent config; review its PR instead of accepting blindly. |
| **Codecov**                       | Yes                  | **Use.** CI uploads LCOV via OIDC; `Upload coverage to Codecov` passed on PR #33. Badge + status.                                                                                                |
| **Socket Security**               | Yes                  | **Use.** PR #33 shows `Socket Security: Pull Request Alerts` and `Project Report` passing. Dependency-review remains the required gate.                                                          |
| **StepSecurity Actions Security** | Yes                  | **Use.** `harden-runner` in audit mode in Quality/E2E; passed on PR #33. Move to block mode only after a clean baseline.                                                                         |
| **SonarCloud**                    | Yes                  | **Use automatically.** `SonarCloud Code Analysis` passed on PR #33. It is not a required check; no token/workflow is needed for the current automatic analysis.                                  |
| **Semgrep OSS**                   | Yes                  | **Use in addition to CI.** `Semgrep OSS` check passed on PR #33; the workflow adds severity gating and SARIF.                                                                                    |
| **Gitleaks app**                  | Yes                  | **Use in addition to CI.** `gitleaks` check passed on PR #33; the workflow scans full history with `.gitleaks.toml`.                                                                             |
| **Greptile**                      | Yes (public)         | **Optional.** AI PR review. A permission update is pending; approve only if you want a second reviewer. Keep it non-blocking.                                                                    |
| **Renovate**                      | Yes                  | **Disabled for this repo.** `renovate.json` sets `enabled: false`; Dependabot is authoritative to avoid duplicate PRs.                                                                           |
| **reviewdog**                     | Yes                  | **Not used.** CI already annotates lint/test output; adding it would duplicate ESLint.                                                                                                           |
| **Sentry**                        | Free tier            | **Optional.** Useful later for frontend errors; requires DSN and privacy review. Not enabled.                                                                                                    |
| **CircleCI / Cirrus CI**          | Free tier            | **Not used.** GitHub Actions is the single CI source.                                                                                                                                            |

Other installed apps (Chromatic, Claude, Cloudflare, Cursor, Linear, Railway, Render,
Supabase, Vercel, etc.) are unrelated to this repo's quality gates and are not configured.

## Observed checks on PR #33

The first protected PR exercised more than the native workflow:

| Check                                                 | Source               | Result |
| ----------------------------------------------------- | -------------------- | ------ |
| Quality / E2E / **Quality Gate**                      | GitHub Actions       | ✅     |
| **CodeQL (javascript-typescript)**                    | GitHub Actions       | ✅     |
| CodeQL                                                | GitHub code scanning | ✅     |
| Gitleaks / Semgrep / Actionlint                       | GitHub Actions       | ✅     |
| Dependency Review                                     | GitHub Actions       | ✅     |
| gitleaks                                              | Gitleaks app         | ✅     |
| Semgrep OSS                                           | Semgrep app          | ✅     |
| SonarCloud Code Analysis                              | SonarCloud app       | ✅     |
| Socket Security: Pull Request Alerts / Project Report | Socket app           | ✅     |

The ruleset requires only **Quality Gate** and **CodeQL (javascript-typescript)**. App checks
are informative unless explicitly promoted; this avoids coupling merges to vendor outages.

## Native, required gates

| Capability               | Implementation                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| CI / quality gate        | `.github/workflows/ci.yml` → **Quality Gate** required check                                            |
| SAST                     | CodeQL (`javascript-typescript`, security-and-quality)                                                  |
| Secret scanning          | GitHub secret scanning + push protection + non-provider patterns (feature availability depends on plan) |
| Dependency alerts        | Dependabot alerts + security updates                                                                    |
| Dependency review        | `dependency-review-action` on PRs                                                                       |
| Supply chain             | OpenSSF Scorecard CLI (JSON artifact + summary)                                                         |
| Container base updates   | Dependabot Docker                                                                                       |
| Vulnerability disclosure | private vulnerability reporting                                                                         |
| Branch protection        | `main` ruleset + tag ruleset                                                                            |

## App configuration checklist

### ECC Tools

- [x] Installed (all repositories).
- [x] Free for public repos.
- [x] `/ecc-tools audit` on issue #1: **100/100 (Grade A)**, 0 findings.
- [ ] `/ecc-tools analyze` only if you want a hosted PR of suggestions; compare with
      `.opencode/` before merging.

### Codecov

- [x] App installed.
- [x] CI uses `codecov/codecov-action@v5` with OIDC (`id-token: write`).
- [x] `codecov.yml` sets project auto + patch target 70%, non-blocking for merge.
- [x] First upload passed on PR #33.

### Socket Security

- [x] App installed.
- [x] PR alerts + project report passed on PR #33.
- [ ] Do not grant it workflow/secret write access.

### StepSecurity Harden-Runner

- [x] App installed.
- [x] Audit mode in `quality` and `e2e` CI jobs.
- [ ] Review egress baseline for 1-2 weeks; then consider `block` with an allowlist.

### Sonar / Greptile / Renovate

- [x] SonarCloud automatic analysis passed; no extra workflow needed.
- [ ] Approve Greptile permission update only if you want AI PR review.
- [x] Renovate disabled for this repo; Dependabot only.

## Repo settings checklist

- [x] Secret scanning, push protection; non-provider patterns/validity checks depend on plan.
- [x] Dependabot alerts + security updates.
- [x] Private vulnerability reporting.
- [x] Actions default token read-only; PR approvals disabled.
- [x] Squash-only merges; delete head branches.
- [x] `main` ruleset: PR, linear history, Quality Gate + CodeQL, conversation resolution,
      squash-only, no bypass.
- [x] `v*` tag ruleset: no deletion / no force push.
- [ ] Optional: require signed commits (only after local signing is configured).
- [ ] Optional: environment `production` with manual approval for deploys.

## Why not require every app

Every app sees code and metadata, increases notification noise and can create conflicting
status checks. This is a single-maintainer trading app: require the two native gates, let the
installed apps comment, and promote an app check only after it proves reliable.
