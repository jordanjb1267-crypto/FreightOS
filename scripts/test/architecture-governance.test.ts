import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * AWE-0 — the binding between accepted architecture and repository authority has to be checkable.
 *
 * Six accepted architecture packages (607 files) were substantive, internally coherent, and bound
 * to the repository's controlling authority by nothing: zero ADR references in either direction,
 * zero module ids from `config/scope/module_states.yaml`, no declared precedence, and no CI check
 * that would have noticed any of it. `scripts/check-architecture-governance.mjs` closes that.
 *
 * This file proves the closing works by breaking it ten ways, one per failure mode the remediation
 * claims to catch, and requiring a failure FOR THE STATED REASON each time. A validator that fails
 * generically on every mutation proves only that it dislikes change; each assertion below pins the
 * specific message, so a rule that silently stopped firing would surface as a wrong-reason failure
 * rather than a green run.
 *
 * Mutations are restored in `afterEach` rather than at the end of each test, so a failing assertion
 * cannot leave a modified registry, ADR or planted runtime file behind. The unit project runs in a
 * single fork (see vitest.config.ts), so no concurrent reader can land inside the mutation window.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VALIDATOR = join(ROOT, 'scripts', 'check-architecture-governance.mjs');
const LAYERS = join(ROOT, 'governance-layers.json');

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

/** Files to put back after a mutation, captured before it is applied. */
const restore: { path: string; content: Buffer | null }[] = [];

function mutate(path: string, next: Buffer | string | null): void {
  restore.push({ path, content: existsSync(path) ? readFileSync(path) : null });
  if (next === null) rmSync(path, { force: true });
  else writeFileSync(path, next);
}

interface Registry {
  architectureGovernance: { expectedGovernedPackages: number; [k: string]: unknown };
  layers: {
    id: string;
    version: string;
    root: string;
    role: string;
    precedence: number;
    integrityFile: string;
    integrityFormat: string;
    architecture?: {
      governanceStatus: string;
      authorizes: string;
      moduleScope: string[];
      maxHorizon: number;
      adrRelations: { adr: string; relation: string; evidence: string }[];
      unresolvedAuthority: { topic: string; note: string }[];
    };
  }[];
}

function readRegistry(): Registry {
  return JSON.parse(readFileSync(LAYERS, 'utf8')) as Registry;
}

/** Apply `edit` to the parsed registry and write it back as the mutation under test. */
function withRegistry(edit: (registry: Registry) => void): Run {
  const registry = readRegistry();
  edit(registry);
  mutate(LAYERS, `${JSON.stringify(registry, null, 2)}\n`);
  return runValidator();
}

const layerOf = (registry: Registry, id: string) => {
  const layer = registry.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`fixture drift: no layer ${id}`);
  return layer;
};

afterEach(() => {
  while (restore.length > 0) {
    const entry = restore.pop()!;
    if (entry.content === null) rmSync(entry.path, { force: true });
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
      ['ADR relations', /ADR relations verified: (\d+)/, 20],
      ['module bindings', /module bindings verified: (\d+)/, 40],
      ['runtime files', /runtime source files scanned: (\d+)/, 20],
    ] as const) {
      const match = pattern.exec(run.output);
      expect(match, `validator printed no ${label} count`).not.toBeNull();
      expect(Number(match![1]), `${label} below the anti-vacuity floor`).toBeGreaterThanOrEqual(
        floor,
      );
    }
  });

  // 1 -----------------------------------------------------------------------
  it('fails when an accepted package is omitted from the registry', () => {
    const run = withRegistry((registry) => {
      registry.layers = registry.layers.filter(
        (l) => l.id !== 'agent-workforce-engineering-certification',
      );
      registry.architectureGovernance.expectedGovernedPackages = 5;
      // Renumber so the omission cannot be mistaken for the dense-precedence rule firing.
      registry.layers.forEach((l, index) => {
        l.precedence = index + 1;
      });
    });

    expect(run.ok, 'an unregistered accepted package did not fail the check').toBe(false);
    expect(run.output).toContain('unregistered governance package');
    expect(run.output).toContain('v1.8.0-agent-workforce-engineering-certification');
    // And the anti-vacuity floor: dropping the layer must not be silently absorbed by lowering the
    // expected count, which is exactly what a careless fix would do.
    expect(run.output).toContain('carries no `architecture` block');
  });

  // 2 -----------------------------------------------------------------------
  it('fails on duplicate package identity', () => {
    const run = withRegistry((registry) => {
      const original = layerOf(registry, 'brokerage-enterprise-agent-operations');
      registry.layers.push({ ...original, precedence: registry.layers.length + 1 });
      registry.architectureGovernance.expectedGovernedPackages += 1;
    });

    expect(run.ok, 'a duplicated package identity did not fail the check').toBe(false);
    expect(run.output).toContain('duplicate package identity');
    expect(run.output).toContain('brokerage-enterprise-agent-operations');
  });

  it('fails when two layers claim the same repository path under different ids', () => {
    const run = withRegistry((registry) => {
      const original = layerOf(registry, 'brokerage-enterprise-agent-operations');
      registry.layers.push({
        ...original,
        id: 'brokerage-enterprise-agent-operations-copy',
        precedence: registry.layers.length + 1,
      });
      registry.architectureGovernance.expectedGovernedPackages += 1;
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('duplicate package path');
  });

  // 3 -----------------------------------------------------------------------
  it('fails on a reference to an ADR that does not exist', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'enterprise-agent-operations').architecture!.adrRelations.push({
        adr: 'ADR-9999',
        relation: 'governed-by',
        evidence: 'invented authority',
      });
    });

    expect(run.ok, 'a nonexistent ADR reference did not fail the check').toBe(false);
    expect(run.output).toContain('ADR-9999');
    expect(run.output).toContain('no such decision record');
  });

  it('fails when a package claims authority from an ADR that is not Accepted', () => {
    // ADR-0011 uses the `## Status` header shape rather than `**Status:**`, so this also proves the
    // sectioned parser is live. Reading only the inline shape would treat three accepted ADRs as
    // statusless; reading neither would let any string through.
    const adr = join(ROOT, 'adr', '0011-safety-critical-control-boundary.md');
    mutate(adr, readFileSync(adr, 'utf8').replace('## Status\nAccepted.', '## Status\nProposed.'));

    const run = runValidator();
    expect(run.ok, 'a non-Accepted ADR did not fail the check').toBe(false);
    expect(run.output).toContain('ADR-0011');
    expect(run.output).toContain('not Accepted');
  });

  // 4 -----------------------------------------------------------------------
  it('fails on a malformed ADR relationship', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'agentic-logistics-network-coherence').architecture!.adrRelations.push({
        adr: 'ADR-0015',
        relation: 'supersedes',
        evidence: 'a relation nothing can enforce',
      });
    });

    expect(run.ok, 'an unrecognised relation did not fail the check').toBe(false);
    expect(run.output).toContain('"supersedes" is not one of');
  });

  it('fails when a relation carries no evidence', () => {
    const run = withRegistry((registry) => {
      layerOf(
        registry,
        'agentic-logistics-network-coherence',
      ).architecture!.adrRelations[0]!.evidence = '  ';
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('relation declares no evidence');
  });

  it('refuses to let an unresolved item name an ADR', () => {
    // The back door: an open question dressed as authority by acquiring an `adr` field. A package
    // proposal with no accepted authority behind it must stay visibly unresolved.
    const run = withRegistry((registry) => {
      const architecture = layerOf(
        registry,
        'revenueos-commercial-capability-architecture',
      ).architecture!;
      (architecture.unresolvedAuthority[0] as Record<string, unknown>).adr = 'ADR-0007';
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('carries an "adr" field');
  });

  it('fails when a package declares neither a relation nor an unresolved item', () => {
    const run = withRegistry((registry) => {
      const architecture = layerOf(registry, 'enterprise-agent-operations').architecture!;
      architecture.adrRelations = [];
      architecture.unresolvedAuthority = [];
    });

    expect(run.ok, 'a silently unbound package did not fail the check').toBe(false);
    expect(run.output).toContain('declares neither an ADR relation nor an unresolved item');
  });

  // 5 -----------------------------------------------------------------------
  it('fails on package version drift', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'agent-workforce-engineering-certification').version = 'v9.9.9';
    });

    expect(run.ok, 'a drifted package version did not fail the check').toBe(false);
    expect(run.output).toContain('does not appear in the root directory name');
  });

  it('fails on an invalid package path', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'agent-workforce-engineering-certification').root =
        'docs/production-handoff/v1.8.0-does-not-exist';
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('declared root does not exist as a directory');
  });

  it('fails on acceptance-status drift', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'facilityos-enterprise-agent-operations').architecture!.governanceStatus =
        'proposed';
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('governanceStatus must be "accepted"');
  });

  it('fails closed on an unknown manifest format rather than skipping the package', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'agent-workforce-engineering-certification').integrityFormat = 'trust-me';
    });

    expect(run.ok, 'an undeclared manifest format did not fail the check').toBe(false);
    expect(run.output).toContain('integrityFormat "trust-me" is not one of');
  });

  // 6 -----------------------------------------------------------------------
  // Integrity/tamper coverage for the JSON-manifest packages lives beside the gate that owns it,
  // in scripts/test/network-governance.test.ts.

  // 7 -----------------------------------------------------------------------
  it('fails when architecture asserts implementation authority for a gated module', () => {
    // `digital_brokerage` is LEGAL_AND_MARKET_GATED with implementation_allowed=false. A document
    // claiming implementation authority over it must fail closed, not be reconciled.
    const run = withRegistry((registry) => {
      layerOf(registry, 'brokerage-enterprise-agent-operations').architecture!.authorizes =
        'implementation';
    });

    expect(run.ok, 'a package/module contradiction did not fail the check').toBe(false);
    expect(run.output).toContain('digital_brokerage');
    expect(run.output).toContain('forbids implementation');
  });

  it('fails when moduleScope names a module the scope registry does not declare', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'enterprise-agent-operations').architecture!.moduleScope.push(
        'shadow_module',
      );
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('shadow_module');
    expect(run.output).toContain('does not declare');
  });

  // 8 -----------------------------------------------------------------------
  it('fails when architecture exceeds the authorized Horizon without being design-only', () => {
    const run = withRegistry((registry) => {
      const architecture = layerOf(
        registry,
        'revenueos-commercial-capability-architecture',
      ).architecture!;
      architecture.authorizes = 'implementation';
    });

    expect(run.ok, 'a package/Horizon contradiction did not fail the check').toBe(false);
    expect(run.output).toContain('above horizon_authorized=1');
  });

  it('fails when a package under-declares the Horizon its scope reaches', () => {
    // The quieter half: a package could otherwise scope a Horizon 4 module while declaring
    // maxHorizon 1, and every other check would agree with it.
    const run = withRegistry((registry) => {
      layerOf(registry, 'revenueos-commercial-capability-architecture').architecture!.maxHorizon =
        1;
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('cannot under-declare the Horizon');
  });

  // 9 -----------------------------------------------------------------------
  it('fails on ambiguous precedence', () => {
    const run = withRegistry((registry) => {
      layerOf(registry, 'agentic-logistics-network-coherence').precedence = layerOf(
        registry,
        'brokerage-enterprise-agent-operations',
      ).precedence;
    });

    expect(run.ok, 'two layers at the same rank did not fail the check').toBe(false);
    expect(run.output).toContain('ambiguous precedence');
  });

  it('refuses to let a subordinate layer outrank the controlling security layer', () => {
    const run = withRegistry((registry) => {
      // Swap v1.8.0 above v1.3.0. Nothing else changes; the ordering alone is the violation.
      layerOf(registry, 'agent-workforce-engineering-certification').precedence = 2;
      layerOf(registry, 'security-privacy-resilience').precedence = 8;
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('No layer below may be weakened');
  });

  // 10 ----------------------------------------------------------------------
  it('fails when runtime code reads the architecture registry', () => {
    // The rule that would be worthless as a promise. If a runtime module reads this registry,
    // registering a documentation package becomes a way to make a runtime check pass — the exact
    // confusion the five-rung authorization ladder exists to prevent.
    const planted = join(ROOT, 'packages', 'context', 'src', '__awe0_runtime_authority_probe.ts');
    mkdirSync(join(ROOT, 'packages', 'context', 'src'), { recursive: true });
    mutate(
      planted,
      'export const REGISTRY = "governance-layers.json";\n' +
        'export const authorized = (): boolean => REGISTRY.length > 0;\n',
    );

    const run = runValidator();
    expect(run.ok, 'runtime code reading the registry did not fail the check').toBe(false);
    expect(run.output).toContain('references governance-layers.json');
    expect(run.output).toContain('would then make a runtime gate pass');
  });

  it('fails when a founding layer is reclassified as an architecture package', () => {
    // The dodge the previous rule invites: move the controlling security layer into the
    // architecture set, where the design-only ladder would appear to apply to it.
    const run = withRegistry((registry) => {
      const security = layerOf(registry, 'security-privacy-resilience');
      security.architecture = {
        ...layerOf(registry, 'enterprise-agent-operations').architecture!,
      };
      registry.architectureGovernance.expectedGovernedPackages += 1;
    });

    expect(run.ok).toBe(false);
    expect(run.output).toContain('must not carry an `architecture` block');
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

    expect(run.ok, 'removing the policy block did not fail the check').toBe(false);
    expect(run.output).toContain('no `architectureGovernance` block');
  });
});
