import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * N0 — the governance wiring itself has to be checkable.
 *
 * The v1.4.0 network package shipped 63 manifest-listed artifacts and the v1.3.0 security package
 * 42, and nothing in CI verified either. Both are cited as binding by every downstream network PR,
 * so an unreviewed edit to a schema, an acceptance gate or a prohibited-shortcut clause would have
 * propagated silently. `scripts/check-network-governance.mjs` closes that; this file proves the
 * closing works, by breaking it three ways and requiring a failure each time.
 *
 * The mutations restore the repository in `afterEach` rather than at the end of each test, so a
 * failing assertion cannot leave a modified governance package behind.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VALIDATOR = join(ROOT, 'scripts', 'check-network-governance.mjs');
const LAYERS = join(ROOT, 'governance-layers.json');
const V14 = join(ROOT, 'docs', 'production-handoff', 'v1.4.0-network-architecture');

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
  if (next === null) execFileSync('rm', ['-f', path]);
  else writeFileSync(path, next);
}

afterEach(() => {
  while (restore.length > 0) {
    const entry = restore.pop()!;
    if (entry.content === null) execFileSync('rm', ['-f', entry.path]);
    else writeFileSync(entry.path, entry.content);
  }
});

describe('layered governance integrity', () => {
  it('passes on the unmodified repository and reports a non-trivial artifact count', () => {
    const run = runValidator();
    expect(run.output).toContain('NETWORK_GOVERNANCE=PASS');
    expect(run.ok).toBe(true);

    // ANTI-VACUITY. A validator that verified nothing would also print PASS. The floor is set well
    // below the real total (63 + 42 = 105) so that legitimately adding an artifact does not fail
    // this, while a check that silently stopped walking the tree does.
    const verified = /manifest-verified artifacts: (\d+)/.exec(run.output);
    expect(verified, 'validator printed no artifact count').not.toBeNull();
    expect(Number(verified![1])).toBeGreaterThanOrEqual(100);
  });

  it('fails when a manifest-protected artifact is modified', () => {
    const target = join(V14, '01_NETWORK_ARCHITECTURE_CONSTITUTION.md');
    mutate(target, `${readFileSync(target, 'utf8')}\n<!-- unreviewed edit -->\n`);

    const run = runValidator();
    expect(run.ok, 'a modified governance artifact did not fail the check').toBe(false);
    expect(run.output).toContain('NETWORK_GOVERNANCE=FAIL');
    expect(run.output).toContain('content changed');
    expect(run.output).toContain('01_NETWORK_ARCHITECTURE_CONSTITUTION.md');
  });

  it('fails when an unlisted file is added beside the package', () => {
    // `sha256sum -c` alone would pass here: it verifies what the manifest LISTS and is silent about
    // anything else on disk. Unlisted content that reads as authoritative is the gap this closes.
    mutate(join(V14, 'UNLISTED_ARTIFACT.md'), 'content nobody reviewed\n');

    const run = runValidator();
    expect(run.ok, 'an unlisted extra artifact did not fail the check').toBe(false);
    expect(run.output).toContain('absent from the manifest');
    expect(run.output).toContain('UNLISTED_ARTIFACT.md');
  });

  it('fails when a manifest-listed file is deleted', () => {
    mutate(join(V14, 'schemas', 'consent-grant.schema.json'), null);

    const run = runValidator();
    expect(run.ok, 'a missing governance artifact did not fail the check').toBe(false);
    expect(run.output).toContain('manifest lists a file that is missing');
  });

  it('fails when the controlling layer declaration is removed', () => {
    const layers = JSON.parse(readFileSync(LAYERS, 'utf8'));
    layers.layers = layers.layers.filter((l: { id: string }) => l.id !== 'network-architecture');
    mutate(LAYERS, `${JSON.stringify(layers, null, 2)}\n`);

    const run = runValidator();
    expect(run.ok, 'dropping a controlling layer did not fail the check').toBe(false);
    expect(run.output).toContain('omits the required layer');
  });

  it('fails when the base layer disagrees with handoff-provenance.json', () => {
    // The two descriptions of the v1.2 layer must not drift apart. Overloading a single version
    // string to mean three packages is what this separation exists to avoid, so the separation
    // itself has to be checked.
    const layers = JSON.parse(readFileSync(LAYERS, 'utf8'));
    const base = layers.layers.find((l: { id: string }) => l.id === 'production-handoff');
    base.version = 'v9.9';
    mutate(LAYERS, `${JSON.stringify(layers, null, 2)}\n`);

    const run = runValidator();
    expect(run.ok, 'a drifted base-layer version did not fail the check').toBe(false);
    expect(run.output).toContain('disagrees with handoff-provenance.json');
  });

  it('fails closed when the layer declaration is missing entirely', () => {
    mutate(LAYERS, null);
    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('governance-layers.json is missing');
  });
});

describe('N0 decision records are internally consistent', () => {
  const decisions = join(ROOT, 'docs', 'decisions');

  it('registers every N0 ADR with a status and a decision section', () => {
    const adrs = readdirSync(decisions).filter((f) => /^00(0[3-9]|1[01])-/.test(f));

    // Anti-vacuity: the nine N0 ADRs the workstream is required to produce.
    expect(adrs.length, 'expected the nine N0 decision records').toBe(9);

    for (const file of adrs) {
      const text = readFileSync(join(decisions, file), 'utf8');
      expect(text, `${file} has no status`).toMatch(/\*\*Status:\*\*/);
      expect(text, `${file} has no decision section`).toMatch(/^## Decision/m);
      expect(text, `${file} has no alternatives section`).toMatch(/^## Alternatives considered/m);
    }
  });

  it('states the participant zero-authority invariant in the identity ADR', () => {
    // The single most load-bearing sentence in N0. If it is ever softened, this fails.
    const text = readFileSync(join(decisions, '0003-network-identity-separation.md'), 'utf8');
    expect(text.toLowerCase()).toContain('confers zero security authority');
  });

  it('references only governance documents that exist', () => {
    // SCOPED TO THE N0 DOCUMENTS, deliberately. The earlier decision records sometimes QUOTE a path
    // rather than link to it — 0001 cites the handoff's own `docs/handoff/v1.2/` while recording the
    // deviation ADR-0014 resolved, and that string is correct as a quotation and wrong as a link.
    // Telling the two apart needs intent, not a regex, so this checks the documents this workstream
    // owns and where every backticked path is a live reference.
    const owned = [
      ...readdirSync(decisions)
        .filter((f) => /^00(0[3-9]|1[01])-/.test(f))
        .map((f) => join(decisions, f)),
      join(ROOT, 'docs', 'governance', 'NETWORK_SECURITY_NON_REGRESSION_CHECKLIST.md'),
      join(ROOT, 'docs', 'plans', 'N1_NETWORK_PARTICIPANT_REGISTRY_CONTRACT.md'),
    ];

    const referenced = new Set<string>();
    for (const file of owned) {
      for (const m of readFileSync(file, 'utf8').matchAll(/`(docs\/[A-Za-z0-9_./-]+)`/g)) {
        referenced.add(m[1]!);
      }
    }
    expect(referenced.size, 'no cross-document references found to check').toBeGreaterThan(0);
    const missing = [...referenced].filter((p) => !existsSync(join(ROOT, p)));
    expect(missing, 'N0 documents reference paths that do not exist').toEqual([]);
  });
});
