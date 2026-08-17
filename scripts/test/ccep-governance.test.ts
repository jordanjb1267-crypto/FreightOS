import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateCcepGovernance } from '../check-ccep-governance.mjs';
import {
  assertInsideFixture,
  createGovernanceFixture,
  SOURCE_ROOT,
  type GovernanceFixture,
} from './helpers/governance-fixture';

let fixture: GovernanceFixture;

const rel = {
  ccepDoc: 'docs/governance/CROSS_AGENT_CONTINUOUS_ENGINEERING_PROTOCOL.md',
  policy: 'docs/governance/ccep-policy.json',
  tests: 'scripts/test/ccep-governance.test.ts',
  checker: 'scripts/check-ccep-governance.mjs',
  workflow: '.github/workflows/ci.yml',
  package: 'package.json',
  architectureChecker: 'scripts/check-architecture-governance.mjs',
  sensitiveNetworkDoc:
    'docs/production-handoff/v1.4.0-network-architecture/01_NETWORK_ARCHITECTURE_CONSTITUTION.md',
  sensitiveConsentSchema:
    'docs/production-handoff/v1.4.0-network-architecture/schemas/consent-grant.schema.json',
  layers: 'governance-layers.json',
  governanceLib: 'scripts/lib/governance-layers.mjs',
};

function pathOf(root: string, relPath: string): string {
  return join(root, relPath);
}

function mutate(relPath: string, edit: (text: string) => string): void {
  const path = pathOf(fixture.root, relPath);
  assertInsideFixture(fixture.root, path);
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
}

function replace(relPath: string, content: string): void {
  const path = pathOf(fixture.root, relPath);
  assertInsideFixture(fixture.root, path);
  writeFileSync(path, content);
}

function runCcepCli(root = fixture.root): { ok: boolean; output: string } {
  try {
    return {
      ok: true,
      output: execFileSync('node', [pathOf(SOURCE_ROOT, rel.checker)], {
        cwd: SOURCE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, CCEP_REPO_ROOT: root },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function runArchitectureAnchor(root = fixture.root): { ok: boolean; output: string } {
  try {
    return {
      ok: true,
      output: execFileSync('node', [pathOf(SOURCE_ROOT, rel.architectureChecker)], {
        cwd: SOURCE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, GOVERNANCE_REPO_ROOT: root },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

beforeEach(() => {
  fixture = createGovernanceFixture('freightos-ccep-governance-');
});

afterEach(() => {
  fixture.cleanup();
});

describe('CCEP governance validator', () => {
  it('CCEP-T01: passes on the committed CCEP package and CI wiring', () => {
    const result = validateCcepGovernance(fixture.root);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('CCEP-T02: validates the machine-readable policy contract structurally', () => {
    mutate(rel.policy, (text) => {
      const policy = JSON.parse(text);
      policy.permittedTransitions = policy.permittedTransitions.filter(
        (edge: { from: string; to: string }) =>
          edge.from !== 'READY_FOR_INDEPENDENT_REREVIEW' || edge.to !== 'INDEPENDENT_REREVIEW',
      );
      return `${JSON.stringify(policy, null, 2)}\n`;
    });

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('must flow through an independent reviewer');
  });

  it('CCEP-T03: fails if no-self-clearance is weakened in the policy contract', () => {
    mutate(rel.policy, (text) => {
      const policy = JSON.parse(text);
      policy.noSelfClearance.implementerMayNotDeclare = ['CLOSED'];
      return `${JSON.stringify(policy, null, 2)}\n`;
    });

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('noSelfClearance contract is weakened');
  });

  it('CCEP-T04: fails if live AWE-0 state leaks into repository-native CCEP docs', () => {
    mutate(rel.ccepDoc, (text) => `${text}\nAWE_0=COMPLETE\n`);

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('historical AWE-0 phase state');
  });

  it('CCEP-T05: fails if package validation no longer includes the CCEP gate', () => {
    mutate(rel.package, (text) => {
      const pkg = JSON.parse(text) as { scripts: Record<string, string> };
      pkg.scripts.validate = pkg.scripts.validate.replace(' && pnpm validate:ccep', '');
      return `${JSON.stringify(pkg, null, 2)}\n`;
    });

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      'package.json scripts.validate must include pnpm validate:ccep',
    );
  });

  it('CCEP-T06: fails if CI does not directly execute the CCEP validator', () => {
    mutate(rel.workflow, (text) =>
      text.replace(
        'run: node scripts/check-ccep-governance.mjs',
        'run: echo node scripts/check-ccep-governance.mjs',
      ),
    );

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      '.github/workflows/ci.yml must directly run node scripts/check-ccep-governance.mjs',
    );
  });

  it('CCEP-T07: fails if a required CCEP document is deleted from the fixture', () => {
    replace(rel.ccepDoc, '');

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Cross-Agent Continuous Engineering Protocol');
  });

  it('CCEP-T08: fails when required semantic policy is removed while prose keywords remain', () => {
    mutate(rel.policy, (text) => {
      const policy = JSON.parse(text);
      policy.noSelfClearance.reviewReadinessRequiresIndependentReviewBeforeOwnerMergeReadiness = false;
      return `${JSON.stringify(policy, null, 2)}\n`;
    });

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('noSelfClearance contract is weakened');
  });

  it('CCEP-T09: does not claim semantic prose validation when prose is contradicted', () => {
    mutate(
      rel.ccepDoc,
      (text) =>
        `${text}\n\n` +
        '<!-- Fixture contradiction: OWNER and IMPLEMENTER tokens remain, but this prose is ' +
        'not semantically accepted by the checker. -->\n',
    );

    const run = runCcepCli();
    expect(run.ok).toBe(true);
    expect(run.output).toContain('CCEP_POLICY_CONTRACT=PASS');
    expect(run.output).toContain('not proven: semantic completeness or truth');
    expect(run.output).not.toContain('NO_SELF_CLEARANCE=PASS');
    expect(run.output).not.toContain('PHASE_STATE_MACHINE=PASS');
  });

  it('CCEP-T10: fails if the machine-readable CCEP policy file is missing', () => {
    replace(rel.policy, '{');

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('ccep-policy.json is not valid JSON');
  });

  it('CCEP-T11: fails if the required CCEP regression inventory becomes vacuous', () => {
    replace(rel.tests, "import { describe } from 'vitest';\ndescribe('empty', () => {});\n");

    const result = validateCcepGovernance(fixture.root);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('missing active regression case CCEP-T01');
  });

  it('CCEP-T12: independent architecture anchor fails if the CCEP checker is trivialized', () => {
    replace(
      rel.checker,
      "#!/usr/bin/env node\nconsole.log('CCEP_GOVERNANCE=PASS');\nprocess.exit(0);\n",
    );

    const run = runArchitectureAnchor();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('CCEP control surface changed');
    expect(run.output).toContain(rel.checker);
  });

  it('CCEP-T13: fails if the CCEP CI step is made non-blocking or masked', () => {
    mutate(rel.workflow, (text) =>
      text.replace(
        'run: node scripts/check-ccep-governance.mjs',
        'continue-on-error: true\n        run: node scripts/check-ccep-governance.mjs',
      ),
    );
    const nonBlocking = validateCcepGovernance(fixture.root);
    expect(nonBlocking.ok).toBe(false);

    mutate(rel.workflow, (text) =>
      text.replace(
        'continue-on-error: true\n        run: node scripts/check-ccep-governance.mjs',
        'run: node scripts/check-ccep-governance.mjs || true',
      ),
    );
    const masked = validateCcepGovernance(fixture.root);
    expect(masked.ok).toBe(false);
    expect(masked.errors.join('\n')).toContain('blocking step');
  });

  it('CCEP-T14: negative fixtures mutate only disposable roots', () => {
    const before = Object.fromEntries(
      [
        rel.workflow,
        rel.sensitiveNetworkDoc,
        rel.sensitiveConsentSchema,
        rel.layers,
        rel.governanceLib,
      ].map((relPath) => [relPath, readFileSync(pathOf(SOURCE_ROOT, relPath), 'utf8')]),
    );

    mutate(rel.workflow, (text) =>
      text.replace('run: node scripts/check-ccep-governance.mjs', 'run: true'),
    );
    mutate(rel.sensitiveNetworkDoc, (text) => `${text}\n<!-- fixture mutation -->\n`);
    replace(rel.sensitiveConsentSchema, '');
    mutate(rel.layers, (text) => {
      const layers = JSON.parse(text);
      layers.layers = [];
      return `${JSON.stringify(layers, null, 2)}\n`;
    });
    mutate(rel.governanceLib, (text) => `${text}\nexport const CCEP_FIXTURE_MUTATION = true;\n`);

    expect(validateCcepGovernance(fixture.root).ok).toBe(false);
    for (const [relPath, content] of Object.entries(before)) {
      expect(readFileSync(pathOf(SOURCE_ROOT, relPath), 'utf8')).toBe(content);
    }
  });
});
