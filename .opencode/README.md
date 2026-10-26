# OpenCode / ECC integration

This project adapts selected components of [affaan-m/ECC](https://github.com/affaan-m/ECC)
(Everything Claude Code, MIT, v2.2.3) to OpenCode.

Installed here:

- `.opencode/instructions/INSTRUCTIONS.md` — ECC's consolidated engineering rules.
- `.opencode/instructions/PROJECT.md` — Goodz-specific safety and architecture rules.
- `.opencode/commands/` — plan, tdd, code-review, security, build-fix, e2e, refactor-clean,
  verify, test-coverage, update-docs, checkpoint, eval.
- `.opencode/prompts/agents/` — planner, architect, code-reviewer, security-reviewer,
  tdd-guide, e2e-runner, build-error-resolver, doc-updater, refactor-cleaner,
  database-reviewer.
- `.opencode/rules/common` and `.opencode/rules/typescript` — ECC rule packs for reference.
- `skills/` — tdd-workflow, security-review, e2e-testing, verification-loop,
  coding-standards, api-design, frontend-patterns, backend-patterns, database-migrations,
  strategic-compact, eval-harness, search-first.
- `opencode.json` — registers instructions, skills, agents and commands.

Deliberately **not** installed: ECC hooks/plugin runtime, MCP servers, all 311 skills and
71 agents. They add context and runtime surface that this single-app repo does not need.
The full ECC repo remains the upstream source for optional additions.

## Updating

```bash
git clone --depth 1 https://github.com/affaan-m/ECC.git /tmp/ecc
# review upstream diff, then copy only the components above
```

Record the upstream commit in `docs/engineering/ECC.md`. Do not stack a second install
method into the same harness.
