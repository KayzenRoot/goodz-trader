## What

<!-- One paragraph. Link the issue: Closes #123 -->

## Why

<!-- User/risk/ops motivation. What breaks without this? -->

## Scope

- [ ] Bounded to the linked issue
- [ ] No unrelated refactor
- [ ] Live-trading behavior is marked beta if not manually validated

## Risk review

- [ ] Touches entry sizing, daily guard, fees or exits
- [ ] Touches secrets/auth/session
- [ ] Touches MEXC signing/order semantics
- [ ] Touches DB schema/migrations
- [ ] None of the above

If any box is checked, describe the blast radius and rollback:

## Verification

<!-- Paste commands + concise results, not claims. -->

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm e2e   # UI/control-flow changes
```

- [ ] No secrets, keys, real account data or demo PnL presented as real performance
- [ ] Docs/ADR/runbook updated when behavior changed
- [ ] Screenshots attached for UI changes (desktop + mobile)
- [ ] Risk guard tests cover blocked paths
- [ ] Live path was NOT exercised with real funds, or the issue documents the tiny validation

## Screenshots / evidence

<!-- Dashboard, logs, test output. Redact keys, tokens and balances if sensitive. -->
