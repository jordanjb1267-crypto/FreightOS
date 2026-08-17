import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { validateCcepGovernance } from '../check-ccep-governance.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const fixtures: string[] = [];

function copy(relPath: string, fixtureRoot: string): void {
  const source = join(ROOT, relPath);
  const target = join(fixtureRoot, relPath);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

function buildFixture(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'freightos-ccep-'));
  fixtures.push(fixtureRoot);
  for (const relPath of [
    '.github/workflows/ci.yml',
    'package.json',
    'docs/governance/CROSS_AGENT_CONTINUOUS_ENGINEERING_PROTOCOL.md',
    'docs/governance/CROSS_AGENT_HANDOFF_TEMPLATE.md',
    'docs/governance/INDEPENDENT_REVIEW_PROTOCOL.md',
    'docs/governance/REMEDIATION_PROTOCOL.md',
    'docs/governance/OWNER_CHECKPOINTS.md',
  ]) {
    copy(relPath, fixtureRoot);
  }
  return fixtureRoot;
}

function mutate(fixtureRoot: string, relPath: string, edit: (text: string) => string): void {
  const path = join(fixtureRoot, relPath);
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
}

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop()!, { recursive: true, force: true });
  }
});

describe('CCEP governance validator', () => {
  it('passes on the committed CCEP package and CI wiring', () => {
    const result = validateCcepGovernance(ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails if no-self-clearance is removed from the durable protocol', () => {
    const fixture = buildFixture();
    mutate(fixture, 'docs/governance/CROSS_AGENT_CONTINUOUS_ENGINEERING_PROTOCOL.md', (text) =>
      text.replace(
        'IMPLEMENTER_RESULT != INDEPENDENT_REVIEW_RESULT != OWNER_DECISION',
        'IMPLEMENTER_RESULT equals OWNER_DECISION',
      ),
    );

    const result = validateCcepGovernance(fixture);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      'IMPLEMENTER_RESULT != INDEPENDENT_REVIEW_RESULT != OWNER_DECISION',
    );
  });

  it('fails if live AWE-0 state leaks into repository-native CCEP docs', () => {
    const fixture = buildFixture();
    mutate(
      fixture,
      'docs/governance/CROSS_AGENT_CONTINUOUS_ENGINEERING_PROTOCOL.md',
      (text) => `${text}\nAWE_0=COMPLETE\n`,
    );

    const result = validateCcepGovernance(fixture);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('historical AWE-0 phase state');
  });

  it('fails if package validation no longer includes the CCEP gate', () => {
    const fixture = buildFixture();
    mutate(fixture, 'package.json', (text) => {
      const pkg = JSON.parse(text) as { scripts: Record<string, string> };
      pkg.scripts.validate = pkg.scripts.validate.replace(' && pnpm validate:ccep', '');
      return `${JSON.stringify(pkg, null, 2)}\n`;
    });

    const result = validateCcepGovernance(fixture);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      'package.json scripts.validate must include pnpm validate:ccep',
    );
  });

  it('fails if CI does not directly execute the CCEP validator', () => {
    const fixture = buildFixture();
    mutate(fixture, '.github/workflows/ci.yml', (text) =>
      text.replace(
        'run: node scripts/check-ccep-governance.mjs',
        'run: echo node scripts/check-ccep-governance.mjs',
      ),
    );

    const result = validateCcepGovernance(fixture);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      '.github/workflows/ci.yml must directly run node scripts/check-ccep-governance.mjs',
    );
  });
});
