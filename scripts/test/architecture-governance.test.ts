import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * AWE-0 — the binding between accepted architecture and repository authority has to be checkable.
 *
 * Six accepted architecture packages (567 tracked files) were substantive, internally coherent, and
 * bound to the repository's controlling authority by nothing: zero ADR references in either
 * direction, zero module ids from `config/scope/module_states.yaml`, and no CI check that would
 * have noticed any of it. `scripts/check-architecture-governance.mjs` closes that.
 *
 * This file proves the closing works by breaking it, and it is the SECOND version of that proof.
 * An independent adversarial review broke the first candidate seven ways, and every break had the
 * same shape: a rule whose expectations lived inside the document it validated, or a rule that
 * checked a string where it needed to check a structure. Each of those exploits now has a test
 * named after the finding it closes, and each pins the SPECIFIC failure message — a validator that
 * fails generically on every mutation proves only that it dislikes change.
 *
 * A correctly registered seventh package deliberately asserts PASS. A gate that cannot be
 * satisfied correctly is as broken as one that cannot be failed.
 *
 * NOTHING HERE MUTATES AN ACCEPTED PACKAGE OR AN ACCEPTED ADR. The first candidate edited
 * `adr/0011-safety-critical-control-boundary.md` in place to test the not-Accepted path; the
 * repository already contains genuinely Proposed authority (`ADR-N0015`), so the same property is
 * tested against real repository state with no mutation at all. Registry, workflow and planted
 * source files are restored in `afterEach`, and the unit project runs in a single fork, so no
 * concurrent reader can land inside a mutation window.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VALIDATOR = join(ROOT, 'scripts', 'check-architecture-governance.mjs');
const LAYERS = join(ROOT, 'governance-layers.json');
const LIB = join(ROOT, 'scripts', 'lib', 'governance-layers.mjs');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'ci.yml');

interface Run {
  ok: boolean;
  output: string;
}

function runValidator(): Run {
  try {
    return { ok: true, output: execFileSync('node', [VALIDATOR], { encoding: 'utf8' }) };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** Paths to put back after a mutation, captured before it is applied. */
const restore: { path: string; content: Buffer | null }[] = [];
/** Paths created by a test, removed wholesale afterwards. */
const planted: string[] = [];

function mutate(path: string, next: Buffer | string | null): void {
  restore.push({ path, content: existsSync(path) ? readFileSync(path) : null });
  if (next === null) rmSync(path, { force: true });
  else writeFileSync(path, next);
}

function plant(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  planted.push(path);
}

interface Relation {
  authority: string;
  authoritySource: string;
  relation: string;
  evidence: string;
}
interface Architecture {
  governanceStatus: string;
  implementationAuthority: string;
  moduleScope: string[];
  maxHorizon: number;
  adrRelations: Relation[];
  unresolvedAuthority: { id: string; topic: string; note: string }[];
}
interface Layer {
  id: string;
  version: string;
  root: string;
  role: string;
  integrityFile: string;
  integrityFormat: string;
  expectedArtifacts?: number;
  architecture?: Architecture;
  architectureExemption?: { anchor: string; note: string };
}
interface Registry {
  subordination: string;
  architectureGovernance: Record<string, unknown> & {
    expectedRelationCounts: Record<string, number>;
    authoritySources: Record<string, { expectedRecords?: number }> & {
      expectedCollidingNumbers: number;
    };
    ciWiring: { requiredGates: string[]; expectedRequiredGates: number };
    mandate: { record: string; clause: string; immutabilityClause: string };
    authorityModel: {
      classes?: Record<string, string>;
      resolution: string[];
      precedence: {
        edges: { higher: string; lower: string }[];
        incomparable: string[][];
        strictestWinsSubjects: string[];
        conflictDisposition: string;
        classAnchor: string;
      };
    };
  };
  layers: Layer[];
}

const readRegistry = (): Registry => JSON.parse(readFileSync(LAYERS, 'utf8')) as Registry;

/** Apply `edit` to the parsed registry and write it back as the mutation under test. */
function withRegistry(edit: (registry: Registry) => void): Run {
  const registry = readRegistry();
  edit(registry);
  mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);
  return runValidator();
}

const layerOf = (registry: Registry, id: string): Layer => {
  const layer = registry.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`fixture drift: no layer ${id}`);
  return layer;
};

/**
 * Re-record a package's reviewed digest so a test can isolate ONE rule.
 *
 * Editing an `architecture` block legitimately trips the reviewed-binding digest, which would make
 * every mutation below fail for that reason and prove nothing about the rule under test. Tests that
 * target the digest itself do not call this.
 */
function digestArchitecture(architecture: Architecture): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
      );
    }
    return value;
  };
  const digest = execFileSync(
    'node',
    [
      '-e',
      `const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(process.argv[1]).digest('hex'))`,
      JSON.stringify(canonical(architecture)),
    ],
    { encoding: 'utf8' },
  );
  return digest;
}

function recordBindingDigest(id: string, digest: string): void {
  // Quote-agnostic: the library is prettier-formatted with single quotes, and pinning the helper to
  // one style is how this fixture silently stopped re-accepting anything.
  const pattern = new RegExp(`(['"]${id}['"]:\\s*['"])[0-9a-f]{64}(['"])`);
  const lib = readFileSync(LIB, 'utf8');
  if (!pattern.test(lib)) throw new Error(`fixture drift: no reviewed digest recorded for ${id}`);
  mutate(LIB, lib.replace(pattern, `$1${digest}$2`));
}

function reacceptBinding(id: string): void {
  const registry = readRegistry();
  recordBindingDigest(id, digestArchitecture(layerOf(registry, id).architecture!));
}

afterEach(() => {
  while (planted.length > 0) rmSync(planted.pop()!, { recursive: true, force: true });
  while (restore.length > 0) {
    const entry = restore.pop()!;
    if (entry.content === null) rmSync(entry.path, { recursive: true, force: true });
    else writeFileSync(entry.path, entry.content);
  }
});

describe('architecture governance binding', () => {
  it('passes on the unmodified repository and reports non-trivial coverage', () => {
    const run = runValidator();
    expect(run.output).toContain('ARCHITECTURE_GOVERNANCE=PASS');
    expect(run.ok).toBe(true);

    // ANTI-VACUITY. A gate that bound nothing would also print PASS. The floors sit below the real
    // totals so that adding a package or a relation does not fail this, while a check that quietly
    // stopped walking the registry does.
    for (const [label, pattern, floor] of [
      ['governed packages', /governed architecture packages: (\d+)/, 6],
      ['verified exemptions', /layers exempt with a verified anchor: (\d+)/, 3],
      ['authority relations', /authority relations verified: (\d+)/, 20],
      ['module bindings', /module bindings verified: (\d+)/, 40],
      ['runtime files', /runtime source files scanned: (\d+)/, 20],
      ['ci run steps', /blocking run steps: (\d+)/, 10],
    ] as const) {
      const match = pattern.exec(run.output);
      expect(match, `validator printed no ${label} count`).not.toBeNull();
      expect(Number(match![1]), `${label} below the anti-vacuity floor`).toBeGreaterThanOrEqual(
        floor,
      );
    }
    // Both authority namespaces must actually have been read. The first candidate reported
    // "26 relations verified" while one of its two declared sources contributed zero records.
    expect(run.output).toMatch(/authority records indexed: adr\/ \d+, docs\/decisions\/ [1-9]\d*/);
  });

  // ── F-01: the obligation must derive from position, not from a frozen list ──────────────────

  it('F-01: fails when a seventh governed package is registered with no binding', () => {
    plant(join(ROOT, 'docs/production-handoff/v0.0.0-awe0-probe/00_MASTER.md'), '# probe\n');
    plant(
      join(ROOT, 'docs/production-handoff/v0.0.0-awe0-probe/MANIFEST.json'),
      `${JSON.stringify({ package: 'probe', version: '0.0.0', files: [] }, null, 2)}\n`,
    );
    const run = withRegistry((registry) => {
      registry.layers.push({
        id: 'awe0-probe',
        version: 'v0.0.0',
        root: 'docs/production-handoff/v0.0.0-awe0-probe',
        role: 'additive-subordinate',
        integrityFile: 'MANIFEST.json',
        integrityFormat: 'manifest-json',
        expectedArtifacts: 1,
      });
    });

    expect(run.ok, 'an unbound seventh package did not fail the check').toBe(false);
    expect(run.output).toContain('awe0-probe');
    expect(run.output).toContain('carries no `architecture` block and no verified exemption');
    // And it is NOT the old failure mode: nothing complains about an expected package count.
    expect(run.output).not.toContain('expectedGovernedPackages');
  });

  it('F-01: fails when a seventh package sits on disk registered nowhere', () => {
    plant(join(ROOT, 'docs/production-handoff/v0.0.0-awe0-probe/00_MASTER.md'), '# probe\n');
    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('unregistered governance package');
  });

  it('F-01: PASSES when a seventh package is registered correctly', () => {
    // The other half of the requirement. Adding a package correctly must not be blocked by a frozen
    // count — the only thing it needs is a real binding and a recorded review, neither of which is
    // an obligation list.
    plant(join(ROOT, 'docs/production-handoff/v0.0.0-awe0-probe/00_MASTER.md'), '# probe\n');
    plant(
      join(ROOT, 'docs/production-handoff/v0.0.0-awe0-probe/MANIFEST.json'),
      `${JSON.stringify({ package: 'probe', version: '0.0.0', files: [] }, null, 2)}\n`,
    );
    const registry = readRegistry();
    const architecture: Architecture = {
      governanceStatus: 'accepted',
      implementationAuthority: 'none',
      moduleScope: ['freightos_shared_core'],
      maxHorizon: 1,
      adrRelations: [
        {
          authority: 'ADR-0013',
          authoritySource: 'adr',
          relation: 'governed-by',
          evidence: 'ADR-0013 authorizes Horizon 1 production implementation only.',
        },
      ],
      unresolvedAuthority: [],
    };
    registry.layers.push({
      id: 'awe0-probe',
      version: 'v0.0.0',
      root: 'docs/production-handoff/v0.0.0-awe0-probe',
      role: 'additive-subordinate',
      integrityFile: 'MANIFEST.json',
      integrityFormat: 'manifest-json',
      expectedArtifacts: 1,
      architecture,
    });
    registry.architectureGovernance.expectedRelationCounts['governed-by'] += 1;
    mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);

    // Record the review, exactly as the gate's own failure message instructs.
    const first = runValidator();
    const digest = /Add "([0-9a-f]{64})" once the content has been reviewed/.exec(first.output);
    expect(digest, 'the gate did not tell the author which digest to record').not.toBeNull();
    mutate(
      LIB,
      readFileSync(LIB, 'utf8').replace(
        'export const REVIEWED_BINDING_DIGESTS = Object.freeze({',
        `export const REVIEWED_BINDING_DIGESTS = Object.freeze({\n  'awe0-probe': '${digest![1]}',`,
      ),
    );

    const run = runValidator();
    expect(run.output, 'a correctly registered seventh package did not pass').toContain(
      'ARCHITECTURE_GOVERNANCE=PASS',
    );
    expect(run.ok).toBe(true);
    expect(run.output).toContain('governed architecture packages: 7');
  });

  it('F-01: refuses an exemption whose anchor cannot be proved', () => {
    const run = withRegistry((registry) => {
      const layer = layerOf(registry, 'agent-workforce-engineering-certification');
      delete layer.architecture;
      layer.architectureExemption = {
        anchor: 'accepted-network-decision',
        note: 'claiming an anchor this package does not have',
      };
      registry.architectureGovernance.expectedRelationCounts['governed-by'] -= 2;
      registry.architectureGovernance.expectedRelationCounts['constrained-by'] -= 2;
    });

    expect(run.ok, 'an unearned exemption did not fail the check').toBe(false);
    expect(run.output).toContain('no Accepted record under docs/decisions/ cites');
  });

  it('AWE-RR-02: refuses an accepted-decision exemption for a prefix-similar package root', () => {
    plant(join(ROOT, 'docs/production-handoff/v1.4.0-network/README.md'), '# prefix probe\n');
    plant(
      join(ROOT, 'docs/production-handoff/v1.4.0-network/MANIFEST.json'),
      `${JSON.stringify({ package: 'prefix-probe', version: '0.0.0', files: [] }, null, 2)}\n`,
    );
    const run = withRegistry((registry) => {
      registry.layers.push({
        id: 'awe0-prefix-probe',
        version: 'v1.4.0',
        root: 'docs/production-handoff/v1.4.0-network',
        role: 'additive-subordinate',
        integrityFile: 'MANIFEST.json',
        integrityFormat: 'manifest-json',
        expectedArtifacts: 1,
        architectureExemption: {
          anchor: 'accepted-network-decision',
          note: 'must not inherit v1.4.0-network-architecture by textual prefix',
        },
      });
    });

    expect(run.ok, 'a prefix-similar package inherited another package exemption').toBe(false);
    expect(run.output).toContain('awe0-prefix-probe');
    expect(run.output).toContain('no Accepted record under docs/decisions/ cites');
  });

  // ── F-02: the unresolved-authority inventory must be preserved ──────────────────────────────

  it('F-02: fails when recorded unresolved authority is deleted', () => {
    const run = withRegistry((registry) => {
      for (const layer of registry.layers) {
        if (layer.architecture) layer.architecture.unresolvedAuthority = [];
      }
    });

    expect(run.ok, 'deleting the unresolved-authority inventory did not fail the check').toBe(
      false,
    );
    expect(run.output).toContain('unresolvedAuthority no longer records');
    expect(run.output).toContain('RESOLVED_AUTHORITY');
  });

  it('F-02: fails when a single known item is dropped', () => {
    const run = withRegistry((registry) => {
      const architecture = layerOf(
        registry,
        'revenueos-commercial-capability-architecture',
      ).architecture!;
      architecture.unresolvedAuthority = architecture.unresolvedAuthority.filter(
        (u) => u.id !== 'first-governed-egress-channel',
      );
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('first-governed-egress-channel');
  });

  it('F-02: PASSES when an item is resolved through explicit change control', () => {
    // Governed resolution must remain possible, or the mechanism becomes a ratchet nobody can ever
    // release and the pressure goes into deleting it.
    const registry = readRegistry();
    const architecture = layerOf(registry, 'enterprise-agent-operations').architecture!;
    architecture.unresolvedAuthority = architecture.unresolvedAuthority.filter(
      (u) => u.id !== 'action-command-vocabulary',
    );
    mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);
    mutate(
      LIB,
      readFileSync(LIB, 'utf8').replace(
        'export const RESOLVED_AUTHORITY = Object.freeze({});',
        `export const RESOLVED_AUTHORITY = Object.freeze({\n` +
          `  'docs/production-handoff/v1.5.0-enterprise-agent-operations:action-command-vocabulary': {\n` +
          `    resolvedBy: 'ADR-0004',\n    note: 'test fixture',\n  },\n});`,
      ),
    );
    reacceptBinding('enterprise-agent-operations');

    const run = runValidator();
    expect(run.output, 'a governed resolution was rejected').toContain(
      'ARCHITECTURE_GOVERNANCE=PASS',
    );
    expect(run.output).toContain('resolved: 1');
  });

  it('F-02: refuses a resolution citing authority that is not Accepted', () => {
    const registry = readRegistry();
    const architecture = layerOf(registry, 'enterprise-agent-operations').architecture!;
    architecture.unresolvedAuthority = [];
    mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);
    mutate(
      LIB,
      readFileSync(LIB, 'utf8').replace(
        'export const RESOLVED_AUTHORITY = Object.freeze({});',
        `export const RESOLVED_AUTHORITY = Object.freeze({\n` +
          `  'docs/production-handoff/v1.5.0-enterprise-agent-operations:action-command-vocabulary': {\n` +
          `    resolvedBy: 'ADR-N0015',\n    note: 'a Proposed record cannot close anything',\n  },\n});`,
      ),
    );
    reacceptBinding('enterprise-agent-operations');

    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('not Accepted');
  });

  it('AWE-RR-03: layer id rename plus digest reacceptance cannot erase known unresolved authority', () => {
    const registry = readRegistry();
    const layer = layerOf(registry, 'enterprise-agent-operations');
    const oldId = layer.id;
    layer.id = 'enterprise-agent-operations-renamed';
    layer.architecture!.unresolvedAuthority = [];
    mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);

    const digest = digestArchitecture(layer.architecture!);
    const oldEntry = new RegExp(`(['"]${oldId}['"]:\\s*['"])[0-9a-f]{64}(['"])`);
    mutate(
      LIB,
      readFileSync(LIB, 'utf8').replace(
        oldEntry,
        `'enterprise-agent-operations-renamed': '${digest}'`,
      ),
    );

    const run = runValidator();
    expect(run.ok, 'renaming a mutable layer id erased known unresolved authority').toBe(false);
    expect(run.output).toContain(
      'unresolvedAuthority no longer records "action-command-vocabulary"',
    );
    expect(run.output).toContain('v1.5.0-enterprise-agent-operations');
  });

  // ── F-03: authority references must be source-qualified ─────────────────────────────────────

  it('F-03: refuses an authority reference with no declared source', () => {
    const run = withRegistry((registry) => {
      const relation = layerOf(registry, 'enterprise-agent-operations').architecture!
        .adrRelations[0]!;
      delete (relation as Partial<Relation>).authoritySource;
    });

    expect(run.ok, 'an unqualified authority reference did not fail the check').toBe(false);
    expect(run.output).toContain('declares authoritySource');
  });

  it('F-03: refuses a bare id whose form does not match its declared source', () => {
    // `ADR-0018` is the autonomy ceiling in adr/ and `ADR-N0018` is the N7 transport boundary in
    // docs/decisions/. Declaring the wrong source for an id is the collision, made explicit.
    const run = withRegistry((registry) => {
      const relation = layerOf(registry, 'enterprise-agent-operations').architecture!
        .adrRelations[3]!;
      relation.authoritySource = 'network-decision';
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('is not a valid id for source "network-decision"');
  });

  it('F-03: PASSES on a correctly source-qualified network decision', () => {
    const registry = readRegistry();
    layerOf(registry, 'enterprise-agent-operations').architecture!.adrRelations.push({
      authority: 'ADR-N0014',
      authoritySource: 'network-decision',
      relation: 'constrained-by',
      evidence: 'ADR-N0014 is Accepted and is cited here only to prove the namespace resolves.',
    });
    registry.architectureGovernance.expectedRelationCounts['constrained-by'] += 1;
    mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);
    reacceptBinding('enterprise-agent-operations');

    const run = runValidator();
    expect(run.output, 'a valid N-qualified reference was rejected').toContain(
      'ARCHITECTURE_GOVERNANCE=PASS',
    );
  });

  it('F-03: refuses a Proposed network decision as controlling authority', () => {
    // ADR-N0015 really is "Proposed — awaiting external rereview" in this repository. No accepted
    // artifact is mutated to produce this case.
    const registry = readRegistry();
    layerOf(registry, 'enterprise-agent-operations').architecture!.adrRelations.push({
      authority: 'ADR-N0015',
      authoritySource: 'network-decision',
      relation: 'governed-by',
      evidence: 'A Proposed decision must not be usable as controlling authority.',
    });
    registry.architectureGovernance.expectedRelationCounts['governed-by'] += 1;
    mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);
    reacceptBinding('enterprise-agent-operations');

    const run = runValidator();
    expect(run.ok, 'Proposed authority was accepted as controlling').toBe(false);
    expect(run.output).toContain('ADR-N0015');
    expect(run.output).toContain('not Accepted');
  });

  it('F-03: refuses a qualified reference to a record that does not exist', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'enterprise-agent-operations').architecture!.adrRelations.push({
        authority: 'ADR-N9999',
        authoritySource: 'network-decision',
        relation: 'governed-by',
        evidence: 'invented authority',
      });
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('no such record in docs/decisions/');
  });

  it('F-03: fails when the declared count of colliding numbers drifts', () => {
    const run = withRegistry((registry) => {
      registry.architectureGovernance.authoritySources.expectedCollidingNumbers = 3;
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('exist in both authority sources, expected 3');
  });

  // ── F-04: CI enforcement must be structural ─────────────────────────────────────────────────

  const ciEvasions: [string, (yaml: string) => string][] = [
    [
      'the command behind `true` with a trailing comment',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: true # node scripts/check-architecture-governance.mjs',
        ),
    ],
    [
      'the command only echoed',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: echo "node scripts/check-architecture-governance.mjs"',
        ),
    ],
    [
      'the command present only in a comment',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: ls\n      # node scripts/check-architecture-governance.mjs',
        ),
    ],
    [
      'the step made conditional',
      (y) =>
        y.replace(
          '- name: Architecture governance binding (ADR, module state, Horizon)\n',
          '- name: Architecture governance binding (ADR, module state, Horizon)\n        if: false\n',
        ),
    ],
    [
      'the step made non-blocking',
      (y) =>
        y.replace(
          '- name: Architecture governance binding (ADR, module state, Horizon)\n',
          '- name: Architecture governance binding (ADR, module state, Horizon)\n        continue-on-error: true\n',
        ),
    ],
    [
      'the step made non-blocking with string continue-on-error',
      (y) =>
        y.replace(
          '- name: Architecture governance binding (ADR, module state, Horizon)\n',
          '- name: Architecture governance binding (ADR, module state, Horizon)\n        continue-on-error: "true"\n',
        ),
    ],
    [
      'the step made non-blocking with expression continue-on-error',
      (y) =>
        y.replace(
          '- name: Architecture governance binding (ADR, module state, Horizon)\n',
          '- name: Architecture governance binding (ADR, module state, Horizon)\n        continue-on-error: ${{ always() }}\n',
        ),
    ],
    [
      'the command present only in a heredoc',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: |\n          cat <<EOF\n          node scripts/check-architecture-governance.mjs\n          EOF',
        ),
    ],
    [
      'the command inside an uncalled shell function',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: |\n          check_architecture() {\n            node scripts/check-architecture-governance.mjs\n          }\n          true',
        ),
    ],
    [
      'the command inside a dead shell branch',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: |\n          if false; then\n            node scripts/check-architecture-governance.mjs\n          fi',
        ),
    ],
    [
      'the command followed by failure masking with || true',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: node scripts/check-architecture-governance.mjs || true',
        ),
    ],
    [
      'the command followed by failure masking with semicolon true',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: node scripts/check-architecture-governance.mjs; true',
        ),
    ],
    [
      'the step replaced by a different validator',
      (y) =>
        y.replace(
          'run: node scripts/check-architecture-governance.mjs',
          'run: node scripts/validate-scope.mjs',
        ),
    ],
  ];

  for (const [label, evade] of ciEvasions) {
    it(`F-04: fails with ${label}`, () => {
      mutate(WORKFLOW, evade(readFileSync(WORKFLOW, 'utf8')));
      const run = runValidator();
      expect(run.ok, `CI evasion "${label}" did not fail the check`).toBe(false);
      expect(run.output).toContain(
        'does not actually RUN scripts/check-architecture-governance.mjs',
      );
    });
  }

  it('F-04: fails when the workflow no longer runs on a change', () => {
    mutate(
      WORKFLOW,
      readFileSync(WORKFLOW, 'utf8').replace(
        /^on:\n(?:.*\n)*?\n/m,
        'on:\n  workflow_dispatch:\n\n',
      ),
    );
    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('neither pull_request nor push');
  });

  it('AWE-RR-04: fails when path filters make governed changes unreachable', () => {
    mutate(
      WORKFLOW,
      readFileSync(WORKFLOW, 'utf8').replace(
        'pull_request:',
        'pull_request:\n    paths:\n      - README.md',
      ),
    );
    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('declares path filters');
  });

  it('AWE-RR-05: required governance gates cannot remove the architecture gate itself', () => {
    mutate(
      WORKFLOW,
      readFileSync(WORKFLOW, 'utf8').replace(
        'run: node scripts/check-architecture-governance.mjs',
        'run: node scripts/validate-scope.mjs',
      ),
    );
    const run = withRegistry((registry) => {
      registry.architectureGovernance.ciWiring.requiredGates =
        registry.architectureGovernance.ciWiring.requiredGates.filter(
          (gate) => gate !== 'scripts/check-architecture-governance.mjs',
        );
      registry.architectureGovernance.ciWiring.expectedRequiredGates = 2;
    });
    expect(run.ok, 'requiredGates metadata removed its own validator').toBe(false);
    expect(run.output).toContain('must exactly match the anchored required gate set');
    expect(run.output).toContain('does not actually RUN scripts/check-architecture-governance.mjs');
  });

  // ── F-05: the runtime-authority guard ───────────────────────────────────────────────────────

  const runtimeProbes: [string, string, string][] = [
    [
      'a sibling lib/ directory',
      'packages/context/lib/probe.ts',
      'export const R = "governance-layers.json";',
    ],
    [
      'a generated dist/ directory',
      'packages/context/src/dist/probe.ts',
      'export const R = "governance-layers.json";',
    ],
    [
      'a .cjs module',
      'packages/context/src/probe.cjs',
      'module.exports = { R: "governance-layers.json" };',
    ],
    [
      'a .cts module',
      'packages/context/src/probe.cts',
      'export const R = "governance-layers.json";',
    ],
    [
      'a bin/ entrypoint',
      'packages/context/bin/probe.ts',
      'export const R = "governance-layers.json";',
    ],
    [
      'a .tsx module',
      'packages/context/src/probe.tsx',
      'export const R = "governance-layers.json";',
    ],
    [
      'a string-concatenated reference',
      'packages/context/src/probe.ts',
      'export const R = "governance-" + "layers.json";',
    ],
    [
      'a path assembled through join()',
      'packages/context/src/probe.ts',
      'import { join } from "node:path";\nexport const R = join("x", "governance", "-layers.json");',
    ],
  ];

  for (const [label, relPath, source] of runtimeProbes) {
    it(`F-05: detects a runtime consumer in ${label}`, () => {
      plant(join(ROOT, relPath), source);
      const run = runValidator();
      expect(run.ok, `a runtime consumer in ${label} was not detected`).toBe(false);
      expect(run.output).toContain('references governance-layers.json');
      expect(run.output).toContain('would then make a runtime gate pass');
    });
  }

  it('AWE-RR-07: detects the reviewed array-join construction of governance-layers.json', () => {
    plant(
      join(ROOT, 'packages/context/src/probe.ts'),
      'const seg = ["governance", "layers.json"];\nexport const R = seg.join("-");\n',
    );
    const run = runValidator();
    expect(run.ok, 'array-join construction of governance-layers.json was not detected').toBe(
      false,
    );
    expect(run.output).toContain('references governance-layers.json');
  });

  // ── F-06: form is checked; content is pinned to a review ────────────────────────────────────

  const bindingEdits: [string, (registry: Registry) => void][] = [
    [
      'module scope silently shrinks',
      (r) => {
        const a = layerOf(r, 'brokerage-enterprise-agent-operations').architecture!;
        a.moduleScope = a.moduleScope.filter((m) => m !== 'digital_brokerage');
        a.maxHorizon = 2;
      },
    ],
    [
      'a relation is repointed at a different ADR',
      (r) => {
        layerOf(
          r,
          'agent-workforce-engineering-certification',
        ).architecture!.adrRelations[2]!.authority = 'ADR-0001';
      },
    ],
    [
      'a governed-by is downgraded',
      (r) => {
        const a = layerOf(r, 'agent-workforce-engineering-certification').architecture!;
        a.adrRelations[0]!.relation = 'additive-beneath';
        r.architectureGovernance.expectedRelationCounts['governed-by'] -= 1;
        r.architectureGovernance.expectedRelationCounts['additive-beneath'] += 1;
      },
    ],
    [
      'evidence is replaced with filler',
      (r) => {
        layerOf(
          r,
          'agent-workforce-engineering-certification',
        ).architecture!.adrRelations[0]!.evidence = 'lorem ipsum dolor sit amet';
      },
    ],
  ];

  for (const [label, edit] of bindingEdits) {
    it(`F-06: fails when ${label}`, () => {
      const run = withRegistry(edit);
      expect(run.ok, `"${label}" did not fail the check`).toBe(false);
      expect(run.output).toContain('the architecture binding has changed since it was reviewed');
    });
  }

  it('F-06: fails on a Horizon no module in the scope registry reaches', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'agent-workforce-engineering-certification').architecture!.maxHorizon = 99;
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('above the highest horizon any module');
  });

  it('F-06: fails when a package under-declares the Horizon its scope reaches', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'revenueos-commercial-capability-architecture').architecture!.maxHorizon =
        1;
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('cannot under-declare the Horizon');
  });

  it('F-06: fails when the relation-kind split drifts', () => {
    const run = withRegistry((registry) => {
      registry.architectureGovernance.expectedRelationCounts['governed-by'] = 99;
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('expected 99');
  });

  it('F-06: refuses an unresolved item that names an authority', () => {
    const run = withRegistry((registry) => {
      const item = layerOf(registry, 'revenueos-commercial-capability-architecture').architecture!
        .unresolvedAuthority[0] as Record<string, unknown>;
      item.authority = 'ADR-0007';
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('carries an "authority" field');
  });

  it('AWE-RR-06: fails when the authority model is deleted', () => {
    const run = withRegistry((registry) => {
      delete (registry.architectureGovernance as Partial<Registry['architectureGovernance']>)
        .authorityModel;
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('architectureGovernance.authorityModel is missing');
    expect(run.output).not.toMatch(/^AUTHORITY_MODEL=PASS$/m);
  });

  it('AWE-RR-06: fails when the authority model is empty', () => {
    const run = withRegistry((registry) => {
      registry.architectureGovernance.authorityModel =
        {} as Registry['architectureGovernance']['authorityModel'];
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('architectureGovernance.authorityModel.classes is missing');
    expect(run.output).not.toMatch(/^AUTHORITY_MODEL=PASS$/m);
  });

  it('AWE-RR-06: fails when the subordination doctrine is inverted in prose', () => {
    const run = withRegistry((registry) => {
      registry.subordination = 'Network architecture controls and weakens security requirements.';
      registry.architectureGovernance.authorityModel.resolution[0] =
        'An additive-subordinate requirement beats any controlling requirement.';
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('subordination no longer matches');
    expect(run.output).toContain('authorityModel.resolution no longer matches');
    expect(run.output).not.toMatch(/^AUTHORITY_MODEL=PASS$/m);
  });

  it('AWE-RR-06: fails on unsupported contradictory precedence edges', () => {
    const run = withRegistry((registry) => {
      registry.architectureGovernance.authorityModel.precedence.edges.push({
        higher: 'additive-subordinate',
        lower: 'controlling',
      });
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('unsupported edge additive-subordinate>controlling');
    expect(run.output).not.toMatch(/^AUTHORITY_MODEL=PASS$/m);
  });

  it('AWE-RR-06: fails on authority precedence cycles', () => {
    const run = withRegistry((registry) => {
      registry.architectureGovernance.authorityModel.precedence.edges.push({
        higher: 'additive-subordinate',
        lower: 'base',
      });
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('precedence contains a cycle');
    expect(run.output).not.toMatch(/^AUTHORITY_MODEL=PASS$/m);
  });

  it('AWE-RR-06: fails when strictest-wins subjects are weakened', () => {
    const run = withRegistry((registry) => {
      registry.architectureGovernance.authorityModel.precedence.strictestWinsSubjects = [
        'security',
      ];
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('strictestWinsSubjects');
    expect(run.output).not.toMatch(/^AUTHORITY_MODEL=PASS$/m);
  });

  // ── F-07: the characterisation test for a limitation deliberately left open ──────────────────

  it('F-07: a coordinated artifact+manifest edit still passes, and that is documented', () => {
    // NOT A FIX. Package-local manifests cannot detect a change that updates both the artifact and
    // the manifest, because nothing outside the package pins the manifest. A real trust root is a
    // separate architecture decision, and inventing a weak one here would be worse than naming the
    // limit. This test exists so the limit is a recorded property with a failing-loudly tripwire if
    // anyone ever believes it was closed.
    const record = join(ROOT, 'docs/governance/AWE_0_ARCHITECTURE_GOVERNANCE_WIRING.md');
    expect(readFileSync(record, 'utf8'), 'F-07 is no longer recorded as open').toContain('F-07');
    // Whitespace-collapsed: the note is a wrapped comment, and the property under test is that the
    // gate states the limit — not how prettier happened to break the line.
    const gate = readFileSync(join(ROOT, 'scripts/check-network-governance.mjs'), 'utf8')
      .replace(/\s*\/\/\s*/g, ' ')
      .replace(/\s+/g, ' ');
    expect(gate, 'the integrity gate no longer states the F-07 limit').toContain(
      'NOT tamper resistance against a COORDINATED edit',
    );
  });

  // ── F-09: a layer may not demote its own authority ──────────────────────────────────────────

  it('F-09: fails when the controlling security layer demotes itself', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'security-privacy-resilience').role = 'additive-subordinate';
    });
    expect(run.ok, 'a self-demoting controlling layer did not fail the check').toBe(false);
    expect(run.output).toContain('is anchored as "controlling"');
    expect(run.output).toContain('cannot demote or promote its own authority');
  });

  it('F-09: fails when an architecture package promotes itself to controlling', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'agent-workforce-engineering-certification').role = 'controlling';
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('is anchored as "additive-subordinate"');
  });

  it('F-09: fails when a founding layer is reclassified as an architecture package', () => {
    const run = withRegistry((registry) => {
      const security = layerOf(registry, 'security-privacy-resilience');
      delete security.architectureExemption;
      security.architecture = { ...layerOf(registry, 'enterprise-agent-operations').architecture! };
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('must not carry an `architecture` block');
  });

  // ── F-12 / F-13 / identity ──────────────────────────────────────────────────────────────────

  it('F-13: an architecture package cannot self-declare implemented, certified or live', () => {
    for (const value of ['implementation', 'implemented', 'certified', 'live']) {
      const run = withRegistry((registry) => {
        layerOf(registry, 'enterprise-agent-operations').architecture!.implementationAuthority =
          value;
      });
      expect(run.ok, `implementationAuthority="${value}" did not fail the check`).toBe(false);
      expect(run.output).toContain('implementationAuthority must be "none"');
      // Restore between iterations so each value is tested against a clean registry.
      const entry = restore.pop()!;
      writeFileSync(entry.path, entry.content!);
    }
  });

  it('AWE-RR-08: unknown authority-like architecture metadata fails even after digest reacceptance', () => {
    const registry = readRegistry();
    const architecture = layerOf(registry, 'enterprise-agent-operations').architecture! as
      (Architecture & { runtimeAuthority?: string }) | Architecture;
    (architecture as Architecture & { runtimeAuthority: string }).runtimeAuthority = 'live';
    mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);
    reacceptBinding('enterprise-agent-operations');

    const run = runValidator();
    expect(run.ok, 'unknown authority-bearing metadata was accepted').toBe(false);
    expect(run.output).toContain(
      'architecture field "runtimeAuthority" is not in the allowed schema',
    );
  });

  it('fails on an exact version mismatch such as v1.7.0 against v1.7.01', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'agentic-logistics-network-coherence').version = 'v1.7';
    });
    expect(run.ok, 'a prefix version match was accepted').toBe(false);
    expect(run.output).toContain('does not appear as a whole segment');
  });

  it('does not let a duplicate module id inflate the completeness counter', () => {
    const before = /module bindings verified: (\d+)/.exec(runValidator().output)![1];
    const run = withRegistry((registry) => {
      const a = layerOf(registry, 'enterprise-agent-operations').architecture!;
      a.moduleScope = [...a.moduleScope, 'carrier_core'];
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('moduleScope lists carrier_core more than once');
    const after = /module bindings verified: (\d+)/.exec(run.output);
    // The gate failed, so it printed no notes — the point is that the duplicate was refused rather
    // than counted. Re-running with the duplicate removed must reproduce the original count.
    expect(after).toBeNull();
    expect(before).toBe(String(Number(before)));
  });

  it('fails on duplicate package identity and on duplicate package path', () => {
    const dup = withRegistry((registry) => {
      registry.layers.push({ ...layerOf(registry, 'brokerage-enterprise-agent-operations') });
    });
    expect(dup.ok).toBe(false);
    expect(dup.output).toContain('duplicate package identity');

    const first = restore.pop()!;
    writeFileSync(first.path, first.content!);
    const path = withRegistry((registry) => {
      registry.layers.push({
        ...layerOf(registry, 'brokerage-enterprise-agent-operations'),
        id: 'brokerage-copy',
      });
    });
    expect(path.ok).toBe(false);
    expect(path.output).toContain('duplicate package path');
  });

  it('fails when the mandate citation no longer matches its source', () => {
    const run = withRegistry((registry) => {
      registry.architectureGovernance.mandate.clause = 'a clause nobody wrote';
    });
    expect(run.ok, 'a drifted mandate citation did not fail the check').toBe(false);
    expect(run.output).toContain('not present verbatim');
  });

  it('fails closed when the registry is missing entirely', () => {
    mutate(LAYERS, null);
    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('governance-layers.json is missing');
  });

  it('fails closed when the architecture governance policy block is removed', () => {
    const run = withRegistry((registry) => {
      delete (registry as Partial<Registry>).architectureGovernance;
    });
    expect(run.ok).toBe(false);
    expect(run.output).toContain('no `architectureGovernance` block');
  });
});
