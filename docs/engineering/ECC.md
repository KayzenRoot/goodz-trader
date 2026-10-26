# ECC integration

Upstream: [affaan-m/ECC](https://github.com/affaan-m/ECC) — Everything Claude Code,
MIT, release **v2.2.3 (2026-10-01)**. Cloned for review at commit
`25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b`.

## Why

ECC packages an engineering operating system: plan → test → implement → review → verify →
remember. We adopted the parts that fit a single TypeScript trading app and a solo
maintainer, without the hook runtime or the entire 311-skill catalog.

## Installed

| Path                                                   | Source                    | Purpose                                        |
| ------------------------------------------------------ | ------------------------- | ---------------------------------------------- |
| `.opencode/instructions/INSTRUCTIONS.md`               | ECC OpenCode instructions | security, TDD, git, patterns                   |
| `.opencode/instructions/PROJECT.md`                    | local                     | Goodz-specific invariants                      |
| `.opencode/commands/*.md`                              | ECC commands              | plan, tdd, review, security, e2e, verify, docs |
| `.opencode/prompts/agents/*.txt`                       | ECC agents                | planner, architect, reviewers, TDD, E2E, DB    |
| `.opencode/rules/common`, `.opencode/rules/typescript` | ECC rules                 | reference standards                            |
| `skills/*`                                             | ECC skills                | 12 on-demand workflows                         |
| `opencode.json`                                        | local                     | registers skills/agents/commands               |

## Not installed (intentionally)

- ECC hooks/plugin runtime (OpenCode plugin build) — adds runtime surface and hooks we do
  not need for a trading app; CI/E2E already enforce gates.
- The full 311-skill / 71-agent catalog — context cost and collision risk.
- Bundled MCP servers (e.g. chrome-devtools) — the browser tooling is chosen separately.
- ECC's multi-model `ccg-workflow` commands — external runtime, out of scope.
- GitHub App / paid ECC Pro — not required for the public repo; native CodeQL + Semgrep +
  Gitleaks cover the audit path.

## How to use

Inside OpenCode in this repo:

```
/plan "add private order WS reconciliation"
/tdd
/code-review
/security
/verify
```

Skills load on demand (`tdd-workflow`, `security-review`, `e2e-testing`,
`verification-loop`, `coding-standards`, `api-design`, `frontend-patterns`,
`backend-patterns`, `database-migrations`, `strategic-compact`, `eval-harness`,
`search-first`).

## Updating ECC

1. Clone upstream shallow and review the diff:
   ```bash
   git clone --depth 1 https://github.com/affaan-m/ECC.git /tmp/ecc
   git -C /tmp/ecc rev-parse HEAD
   ```
2. Re-copy only the selected commands/prompts/skills/rules. Do not stack a second install.
3. Run `pnpm format` (ECC files are Markdown; Prettier may reformat them).
4. Update this file with the new commit/release.
5. Open a PR; `/security` and `/code-review` the changes.

## Provenance

ECC is MIT-licensed; its license remains with the upstream project. Our local additions
(`PROJECT.md`, agent selection, `opencode.json`) are covered by this repo's MIT license.
