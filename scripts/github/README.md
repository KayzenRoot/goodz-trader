# GitHub bootstrap

Reproducible repository governance via `gh`. Requires an authenticated `gh` with `repo`
scope and admin on the repository.

## 1. Issues, labels, milestones

```bash
node scripts/github/bootstrap.mjs --dry-run
node scripts/github/bootstrap.mjs
```

Idempotent: skips existing titles and updates labels with `--force`. Backlog source:
[`backlog.mjs`](backlog.mjs). The 24 issues cover M0-M5.

## 2. Rulesets

```bash
node scripts/github/apply-rulesets.mjs --dry-run
node scripts/github/apply-rulesets.mjs
```

- `main-protection`: PR, linear history, conversation resolution, **Quality Gate** +
  **CodeQL**, no force push/delete, no bypass.
- `release-tags`: `v*` tags cannot be moved or deleted.

The required checks must exist at least once (push a PR/commit after enabling workflows).
If a check name changes, update `rulesets/main.json` and rerun.

## 3. Repo merge/security settings

```bash
node scripts/github/apply-settings.mjs --dry-run
node scripts/github/apply-settings.mjs
```

Squash-only, auto-delete branch, secret scanning/push protection, Dependabot,
private reporting, read-only Actions token. Endpoints unsupported by the plan are reported
as warnings, not fatal.

## 4. Optional: inspect installed GitHub Apps

`gh api /user/installations` requires a GitHub App token, not a user token. Use the web UI:
<https://github.com/settings/installations>. Recommendations and policy:
[`docs/engineering/GITHUB_APPS.md`](../../docs/engineering/GITHUB_APPS.md).

## 5. After the first PR

- Wait for **Quality Gate** and **CodeQL** to appear.
- Verify the ruleset via:
  ```bash
  gh api repos/KayzenRoot/goodz-trader/rulesets
  gh api repos/KayzenRoot/goodz-trader/branches/main/protection 2>/dev/null || true
  ```
- Do not merge with red checks, even as admin.
