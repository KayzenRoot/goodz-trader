#!/usr/bin/env node
/**
 * Idempotent GitHub bootstrap: labels, milestones and issues.
 * Requires an authenticated `gh` with repo scope. Safe to rerun.
 *
 *   node scripts/github/bootstrap.mjs --dry-run
 *   node scripts/github/bootstrap.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { issues, labels, milestones } from './backlog.mjs';

const repo = process.env.GITHUB_REPO ?? 'KayzenRoot/goodz-trader';
const dryRun = process.argv.includes('--dry-run');
const dir = mkdtempSync(join(tmpdir(), 'goodz-issues-'));

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
}

function ensureLabels() {
  for (const [name, color, description] of labels) {
    if (dryRun) {
      console.log(`[dry] label ${name}`);
      continue;
    }
    gh([
      'label',
      'create',
      name,
      '--repo',
      repo,
      '--color',
      color,
      '--description',
      description,
      '--force',
    ]);
  }
}

function ensureMilestones() {
  const existing = JSON.parse(gh(['api', `repos/${repo}/milestones?state=all`, '--paginate']));
  const byTitle = new Map(existing.map((item) => [item.title, item]));
  for (const milestone of milestones) {
    if (byTitle.has(milestone.title)) continue;
    if (dryRun) {
      console.log(`[dry] milestone ${milestone.title}`);
      continue;
    }
    gh([
      'api',
      '--method',
      'POST',
      `repos/${repo}/milestones`,
      '-f',
      `title=${milestone.title}`,
      '-f',
      `description=${milestone.description}`,
    ]);
    console.log(`created milestone ${milestone.title}`);
  }
}

function ensureIssues() {
  const existing = JSON.parse(
    gh(['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '500', '--json', 'title']),
  );
  const seen = new Set(existing.map((item) => item.title));
  let created = 0;

  for (const issue of issues) {
    if (seen.has(issue.title)) continue;
    if (dryRun) {
      console.log(`[dry] issue ${issue.title}`);
      continue;
    }
    const bodyFile = join(dir, `issue-${created}.md`);
    writeFileSync(bodyFile, issue.body, 'utf8');
    const args = [
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      issue.title,
      '--body-file',
      bodyFile,
      '--milestone',
      issue.milestone,
    ];
    if (issue.labels.length) args.push('--label', issue.labels.join(','));
    const url = gh(args).trim();
    console.log(`created ${url}`);
    created += 1;
  }

  console.log(`issues: ${created} created, ${issues.length - created} already present`);
}

console.log(`repo: ${repo}${dryRun ? ' (dry run)' : ''}`);
ensureLabels();
ensureMilestones();
ensureIssues();
