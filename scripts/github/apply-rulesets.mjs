#!/usr/bin/env node
/**
 * Apply the JSON rulesets idempotently. Requires repo admin.
 *   node scripts/github/apply-rulesets.mjs --dry-run
 *   node scripts/github/apply-rulesets.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.env.GITHUB_REPO ?? 'KayzenRoot/goodz-trader';
const dryRun = process.argv.includes('--dry-run');
const here = dirname(fileURLToPath(import.meta.url));

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
}

const existing = JSON.parse(gh(['api', `repos/${repo}/rulesets`]));
const byName = new Map(existing.map((item) => [item.name, item]));

for (const file of ['main.json', 'tags.json']) {
  const ruleset = JSON.parse(readFileSync(join(here, 'rulesets', file), 'utf8'));
  const found = byName.get(ruleset.name);
  if (dryRun) {
    console.log(`[dry] ${found ? 'update' : 'create'} ruleset ${ruleset.name}`);
    continue;
  }
  if (found) {
    gh([
      'api',
      '--method',
      'PUT',
      `repos/${repo}/rulesets/${found.id}`,
      '--input',
      join(here, 'rulesets', file),
    ]);
    console.log(`updated ruleset ${ruleset.name}`);
  } else {
    gh([
      'api',
      '--method',
      'POST',
      `repos/${repo}/rulesets`,
      '--input',
      join(here, 'rulesets', file),
    ]);
    console.log(`created ruleset ${ruleset.name}`);
  }
}
