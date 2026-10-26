#!/usr/bin/env node
/**
 * Apply repository merge/security/Actions settings. Requires repo admin.
 * Some security endpoints may be unavailable for private repos / plans; the
 * script reports rather than failing the whole run.
 */
import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPO ?? 'KayzenRoot/goodz-trader';
const dryRun = process.argv.includes('--dry-run');

function gh(args) {
  try {
    const output = execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`ok: gh ${args.join(' ')}`);
    return output;
  } catch (error) {
    const message = error?.stderr?.toString?.() ?? error.message;
    console.warn(`warn: gh ${args.join(' ')} -> ${message.trim()}`);
    return null;
  }
}

const repoPatch = {
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  allow_auto_merge: true,
  delete_branch_on_merge: true,
  has_wiki: false,
  has_projects: true,
  has_discussions: false,
};

const securityPatch = {
  security_and_analysis: {
    secret_scanning: { status: 'enabled' },
    secret_scanning_push_protection: { status: 'enabled' },
    secret_scanning_non_provider_patterns: { status: 'enabled' },
    secret_scanning_validity_checks: { status: 'enabled' },
  },
};

if (dryRun) {
  console.log('[dry] repo patch', repoPatch);
  console.log('[dry] security patch', securityPatch);
  process.exit(0);
}

try {
  execFileSync('gh', ['api', '--method', 'PATCH', `repos/${repo}`, '--input', '-'], {
    input: JSON.stringify(repoPatch),
    encoding: 'utf8',
  });
  console.log('ok: repo merge settings');
} catch (error) {
  console.warn('warn: repo merge settings', error?.stderr?.toString?.() ?? error.message);
}

gh(['api', '--method', 'PUT', `repos/${repo}/vulnerability-alerts`]);
gh(['api', '--method', 'PUT', `repos/${repo}/automated-security-fixes`]);
gh(['api', '--method', 'PUT', `repos/${repo}/private-vulnerability-reporting`]);
gh([
  'api',
  '--method',
  'PUT',
  `repos/${repo}/actions/permissions/workflow`,
  '-f',
  'default_workflow_permissions=read',
  '-F',
  'can_approve_pull_request_reviews=false',
]);

// security_and_analysis is only accepted for public repos on supported plans.
try {
  execFileSync('gh', ['api', '--method', 'PATCH', `repos/${repo}`, '--input', '-'], {
    input: JSON.stringify(securityPatch),
    encoding: 'utf8',
  });
  console.log('ok: security_and_analysis');
} catch (error) {
  console.warn('warn: security_and_analysis', error?.stderr?.toString?.() ?? error.message);
}
