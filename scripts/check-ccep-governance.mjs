#!/usr/bin/env node
// CI gate: repository-native CCEP governance must preserve the protocol invariants.
//
// This is intentionally narrow. CCEP is not an installed production-handoff architecture layer, so
// it does not belong in governance-layers.json. This gate only verifies the durable engineering
// protocol package, its package/CI wiring, and the most important no-self-clearance, custody,
// review-class, phase, permission, sidecar, and owner-authority invariants.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const REPO_ROOT =
  process.env.CCEP_REPO_ROOT ?? fileURLToPath(new URL('..', import.meta.url));

const REQUIRED_DOCS = Object.freeze({
  'docs/governance/CROSS_AGENT_CONTINUOUS_ENGINEERING_PROTOCOL.md': Object.freeze([
    'Cross-Agent Continuous Engineering Protocol',
    'AGENT_IDENTITY',
    'ENGINEERING_ROLE',
    'IMPLEMENTER_RESULT != INDEPENDENT_REVIEW_RESULT != OWNER_DECISION',
    'LEVEL_A_ISOLATED_SESSION_REVIEW',
    'LEVEL_B_CROSS_AGENT_REVIEW',
    'SINGLE_PROVIDER_ONLY',
    'CROSS_AGENT_AVAILABLE',
    'CODEX_ONLY',
    'TAKEOVER',
    'READY_FOR_INDEPENDENT_REREVIEW',
    'INDEPENDENT_REREVIEW',
    'READY_FOR_OWNER_MERGE_DECISION',
    'REMOTE_INTEGRATION_VERIFICATION',
    'READY_FOR_OWNER_FINAL_MERGE_DECISION',
    'OWNER_AUTHORIZED_MERGE',
    'POST_MERGE_VERIFICATION',
    'COMPLETE',
    'git worktree list --porcelain',
    'Repository identity is not worktree identity',
    'detect -> reproduce -> classify -> report',
    'detect -> fix -> review own fix -> approve',
    'executed deterministic evidence',
    'Git object identity',
    'DISCOVERED',
    'CONFIRMED',
    'REMEDIATION_REQUIRED',
    'IMPLEMENTED',
    'READY_FOR_REREVIEW',
    'CLOSED',
    'PARTIAL',
    'KNOWN_LIMITATION',
    'DEFERRED_BY_OWNER',
    'OPEN',
    'NOT_PROVEN',
    'prior failure condition',
    'positive control',
    'negative control',
    'mkdtemp',
    'P0 READ_ONLY',
    'P1 LOCAL_EXECUTION',
    'P2 DISPOSABLE_MUTATION',
    'P3 REPOSITORY_WRITE',
    'P4 EXTERNAL_MUTATION',
    'NETWORK',
    'DEPENDENCY_INSTALL',
    'PUSH',
    'MERGE',
    'DEPLOY',
    'INFRASTRUCTURE_MUTATION',
    'LOCAL_ACCEPTANCE does not imply PUSH',
    'PUSH does not imply MERGE',
    'REMOTE_CI_PASS does not imply MERGE',
    'MERGE does not imply DEPLOY',
    'external sidecar is live operational state',
    'CHAIN_OF_CUSTODY',
    'COMMAND_LEDGER',
    'NEXT_PERMITTED_PHASE',
  ]),
  'docs/governance/CROSS_AGENT_HANDOFF_TEMPLATE.md': Object.freeze([
    'REPORT_TYPE=HANDOFF',
    'TO_ENGINEERING_ROLE=TAKEOVER_AGENT',
    'CHAIN_OF_CUSTODY',
    'WORKTREE_PATH',
    'STAGED',
    'UNSTAGED',
    'UNTRACKED',
    'P0_READ_ONLY',
    'P4_EXTERNAL_MUTATION',
    'DEPENDENCY_INSTALL',
    'CANDIDATE_FROZEN',
    'FINDING_LEDGER',
    'COMMAND_LEDGER',
    'NEXT_PERMITTED_PHASE',
  ]),
  'docs/governance/INDEPENDENT_REVIEW_PROTOCOL.md': Object.freeze([
    'LEVEL_A_ISOLATED_SESSION_REVIEW',
    'LEVEL_B_CROSS_AGENT_REVIEW',
    'git worktree list --porcelain',
    'reviewer operates read-only on the target',
    'detect -> reproduce -> classify -> report',
    'REMEDIATION_REQUIRED',
    'READY_FOR_OWNER_MERGE_DECISION',
    'NOT_PROVEN',
    'A review verdict is not owner merge authority',
  ]),
  'docs/governance/REMEDIATION_PROTOCOL.md': Object.freeze([
    'FINDINGS_ACCEPTED_FOR_REMEDIATION',
    'git worktree list --porcelain',
    'NEW_STATE=IMPLEMENTED',
    'READY_FOR_INDEPENDENT_REREVIEW',
    'A pre-existing green suite alone is not closure evidence',
    'must not independently claim final acceptance',
  ]),
  'docs/governance/OWNER_CHECKPOINTS.md': Object.freeze([
    'Reserved Owner Decisions',
    'LOCAL_ACCEPTANCE does not imply PUSH',
    'PUSH does not imply MERGE',
    'REMOTE_CI_PASS does not imply MERGE',
    'MERGE does not imply DEPLOY',
    'P0 READ_ONLY',
    'P4 EXTERNAL_MUTATION',
    'No permission class silently grants unrelated external authority',
  ]),
});

const PROHIBITED_LIVE_STATE_PATTERNS = Object.freeze([
  {
    pattern: /AWE-RR-\d{2}/,
    reason: 'historical AWE-0 finding IDs must not become normative CCEP package state',
  },
  {
    pattern: /AWE_0=/,
    reason: 'historical AWE-0 phase state must remain in sidecar reports, not durable CCEP docs',
  },
  {
    pattern: /\/Users\//,
    reason: 'local absolute worktree or sidecar paths must not be committed as normative state',
  },
  {
    pattern: /FreightOS-agent-continuity/,
    reason: 'the live external sidecar name/path must not be a repository-native constant',
  },
  {
    pattern: /\b(?:[0-9a-f]{40})\b/,
    reason: 'live commit coordinates must not be embedded in durable CCEP protocol docs',
  },
]);

const REQUIRED_PACKAGE_SCRIPTS = Object.freeze({
  'validate:ccep': 'node scripts/check-ccep-governance.mjs',
});

function readText(root, relPath, errors) {
  const path = join(root, relPath);
  if (!existsSync(path)) {
    errors.push(`${relPath} is missing`);
    return null;
  }
  return readFileSync(path, 'utf8');
}

function checkDocs(root, errors) {
  for (const [relPath, requiredTerms] of Object.entries(REQUIRED_DOCS)) {
    const text = readText(root, relPath, errors);
    if (text === null) continue;
    for (const term of requiredTerms) {
      if (!text.includes(term)) {
        errors.push(`${relPath} is missing required CCEP term: ${term}`);
      }
    }
    for (const { pattern, reason } of PROHIBITED_LIVE_STATE_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`${relPath} contains prohibited live/transient state: ${reason}`);
      }
    }
  }
}

function checkPackageScripts(root, errors) {
  const text = readText(root, 'package.json', errors);
  if (text === null) return;
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (error) {
    errors.push(`package.json is not valid JSON: ${error.message}`);
    return;
  }
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  for (const [name, command] of Object.entries(REQUIRED_PACKAGE_SCRIPTS)) {
    if (scripts[name] !== command) {
      errors.push(`package.json scripts.${name} must be ${JSON.stringify(command)}`);
    }
  }
  if (typeof scripts.validate !== 'string' || !scripts.validate.includes('pnpm validate:ccep')) {
    errors.push('package.json scripts.validate must include pnpm validate:ccep');
  }
}

function argvFromLine(line) {
  return line
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.replace(/^['"]|['"]$/g, ''));
}

function directBlockingWorkflowCommands(workflowText, errors) {
  let doc;
  try {
    doc = parseYaml(workflowText);
  } catch (error) {
    errors.push(`.github/workflows/ci.yml is not valid YAML: ${error.message}`);
    return [];
  }
  const jobs = doc?.jobs && typeof doc.jobs === 'object' ? doc.jobs : {};
  const commands = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;
    if (job.if !== undefined || job['continue-on-error'] !== undefined) continue;
    if (!Array.isArray(job.steps)) continue;
    for (const step of job.steps) {
      if (!step || typeof step !== 'object' || typeof step.run !== 'string') continue;
      if (step.if !== undefined || step['continue-on-error'] !== undefined) continue;
      for (const rawLine of step.run.split('\n')) {
        const line = rawLine.replace(/(^|\s)#.*$/, '$1').trim();
        if (line.length === 0) continue;
        if (/&&|\|\||[;|]/.test(line)) continue;
        commands.push({ job: jobName, argv: argvFromLine(line) });
      }
    }
  }
  return commands;
}

function checkWorkflow(root, errors) {
  const text = readText(root, '.github/workflows/ci.yml', errors);
  if (text === null) return;
  const commands = directBlockingWorkflowCommands(text, errors);
  const hasCcepGate = commands.some(
    ({ argv }) => argv[0] === 'node' && argv[1] === 'scripts/check-ccep-governance.mjs',
  );
  if (!hasCcepGate) {
    errors.push(
      '.github/workflows/ci.yml must directly run node scripts/check-ccep-governance.mjs in a blocking step',
    );
  }
}

export function validateCcepGovernance(root = REPO_ROOT) {
  const errors = [];
  checkDocs(root, errors);
  checkPackageScripts(root, errors);
  checkWorkflow(root, errors);
  return {
    ok: errors.length === 0,
    errors,
    docs: Object.keys(REQUIRED_DOCS),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateCcepGovernance();
  if (!result.ok) {
    console.error('CCEP_GOVERNANCE=FAIL');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('CCEP_GOVERNANCE=PASS');
  console.log('CCEP_DOC_PACKAGE=PASS');
  console.log('NO_SELF_CLEARANCE=PASS');
  console.log('REVIEW_CLASS_MODEL=PASS');
  console.log('PHASE_STATE_MACHINE=PASS');
  console.log('GIT_CUSTODY_MODEL=PASS');
  console.log('PERMISSION_AND_OWNER_AUTHORITY=PASS');
  console.log('SIDECAR_BOUNDARY=PASS');
  console.log('LIVE_STATE_EXCLUSION=PASS');
  console.log(`  ccep documents checked: ${result.docs.length}`);
}
