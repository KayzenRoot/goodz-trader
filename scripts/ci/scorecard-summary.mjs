#!/usr/bin/env node
/**
 * Render an OpenSSF Scorecard JSON result as a GitHub job summary.
 * Usage: node scripts/ci/scorecard-summary.mjs results.json
 */
import { appendFileSync, readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'results.json';
const result = JSON.parse(readFileSync(file, 'utf8'));
const checks = Array.isArray(result.checks) ? result.checks : [];

const rows = checks
  .map((check) => {
    const score = check.score < 0 ? 'n/a' : `${check.score}/10`;
    const reason = String(check.reason ?? '').replaceAll('|', '\\|');
    return `| ${check.name} | ${score} | ${reason} |`;
  })
  .join('\n');

const summary = `## OpenSSF Scorecard

**Score:** ${result.score ?? 'n/a'}/10 · **Repo:** ${result.repo?.name ?? 'unknown'} · **Commit:** \`${result.repo?.commit ?? 'unknown'}\`

| Check | Score | Reason |
| --- | --- | --- |
${rows}

> Scores of \`-1\` mean "not applicable / not enough data". Branch protection and code review
> scores improve after the ruleset is active and PRs are merged. This job is informational;
> **Quality Gate** and **CodeQL** are the required checks.
`;

appendFileSync(process.env.GITHUB_STEP_SUMMARY ?? 'scorecard-summary.md', summary, 'utf8');
console.log(summary);
