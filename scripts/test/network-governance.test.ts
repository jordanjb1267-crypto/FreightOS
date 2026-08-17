import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
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
    // below the real total so that legitimately adding an artifact does not fail this, while a
    // check that silently stopped walking the tree does.
    //
    // AWE-0 raised it. Before, 63 + 42 = 105 covered v1.4.0 and v1.3.0 and a floor of 100 was
    // right. The six accepted architecture packages added 561 more, and leaving the floor at 100
    // would have let all five JSON-manifest packages fall out of the walk unnoticed — which is the
    // precise condition AWE-0 exists to end.
    const verified = /manifest-verified artifacts: (\d+)/.exec(run.output);
    expect(verified, 'validator printed no artifact count').not.toBeNull();
    expect(Number(verified![1])).toBeGreaterThanOrEqual(650);
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
    // AWE-0's review replaced the frozen required-id list with roles anchored to root PATHS, so the
    // message names the anchor rather than the id. The property under test is unchanged.
    expect(run.output).toContain('omits an anchored governance layer');
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

/**
 * The JSON-manifest half, and the containment rules — AWE-0, revised after independent review.
 *
 * Five of the six accepted architecture packages ship `{"files":[{"path","sha256","bytes"}]}`
 * rather than `sha256sum` lines, and that format difference is the whole reason 561 artifacts went
 * unverified: the gate parsed one format and had nothing to say about the other. Silence read as
 * PASS.
 *
 * EVERY MUTATION BELOW RUNS AGAINST A DISPOSABLE FIXTURE PACKAGE, never against an accepted one.
 * The tests above this line are older than AWE-0 and do tamper with the real v1.4.0 package; that
 * pattern is pre-existing on the accepted base and is left exactly as it was. What AWE-0 adds does
 * not extend it: an independent review flagged mutating immutable accepted artifacts as a hazard,
 * and a fixture removes the hazard for the new cases without rewriting the old ones. The fixture is
 * registered as a real layer, so the gate treats it exactly as it treats a governed package.
 */
describe('JSON-manifest integrity and manifest containment', () => {
  const FIXTURE_DIR = join(ROOT, 'docs', 'production-handoff', 'v0.0.0-awe0-fixture');
  const FIXTURE_ROOT = 'docs/production-handoff/v0.0.0-awe0-fixture';

  /** Files created by a fixture, torn down in reverse order after each test. */
  const created: string[] = [];

  function writeFixtureFile(name: string, content: string): void {
    const path = join(FIXTURE_DIR, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    created.push(path);
  }

  function fixtureFiles() {
    return readdirSync(FIXTURE_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name !== 'MANIFEST.json' && e.name !== 'MANIFEST.sha256')
      .map((e) => e.name)
      .map((f) => {
        const bytes = readFileSync(join(FIXTURE_DIR, f));
        return {
          path: f,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
        };
      });
  }

  /** Rebuild the fixture manifest from whatever is on disk, optionally with extra entries. */
  function writeManifest(extra: { path: string; sha256: string; bytes: number }[] = []): void {
    const files = fixtureFiles();
    const path = join(FIXTURE_DIR, 'MANIFEST.json');
    writeFileSync(
      path,
      `${JSON.stringify({ package: 'awe0-fixture', version: '0.0.0', files: [...files, ...extra] }, null, 2)}\n`,
    );
    if (!created.includes(path)) created.push(path);
  }

  function writeShaManifest(extra: { path: string; sha256: string }[] = []): void {
    const lines = [
      ...fixtureFiles().map((f) => `${f.sha256}  ${f.path}`),
      ...extra.map((f) => `${f.sha256}  ${f.path}`),
    ];
    const path = join(FIXTURE_DIR, 'MANIFEST.sha256');
    writeFileSync(path, `${lines.join('\n')}\n`);
    if (!created.includes(path)) created.push(path);
  }

  /** Declare the fixture as a layer. Integrity is the only gate under test here. */
  function registerFixture(
    expectedArtifacts: number,
    integrityFile = 'MANIFEST.json',
    integrityFormat = 'manifest-json',
  ): void {
    const layers = JSON.parse(readFileSync(LAYERS, 'utf8'));
    layers.layers.push({
      id: 'awe0-fixture',
      version: 'v0.0.0',
      root: FIXTURE_ROOT,
      role: 'additive-subordinate',
      integrityFile,
      integrityFormat,
      expectedArtifacts,
      generatedCopies: null,
      note: 'Disposable test fixture.',
    });
    mutate(LAYERS, `${JSON.stringify(layers, null, 2)}\n`);
  }

  /** Two ordinary files plus a manifest, registered. The baseline every mutation starts from. */
  function buildFixture(): void {
    writeFixtureFile('A.md', '# A\n');
    writeFixtureFile('B.md', '# B\n');
    writeManifest();
    registerFixture(2);
  }

  function canonicalAliasEntries(): { path: string; sha256: string; bytes: number }[] {
    const bytes = readFileSync(join(FIXTURE_DIR, 'README.md'));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return [
      { path: 'dir/../README.md', sha256, bytes: bytes.length },
      { path: 'dir//README.md', sha256, bytes: bytes.length },
      { path: 'dir/./README.md', sha256, bytes: bytes.length },
    ];
  }

  /** The sha256 and byte length of a real file elsewhere in the repository. */
  function digestOf(relPath: string): { sha256: string; bytes: number } {
    const bytes = readFileSync(join(ROOT, relPath));
    return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  }

  afterEach(() => {
    // `recursive` because a fixture may have planted a directory, and `force` because a test may
    // already have removed the entry itself. The whole fixture tree goes last, unconditionally, so
    // a failed assertion cannot leave a package behind for the next file to trip over.
    while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true });
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  it('verifies a well-formed JSON-manifest package', () => {
    buildFixture();
    const run = runValidator();
    expect(run.output).toContain('NETWORK_GOVERNANCE=PASS');
    expect(run.ok, 'a valid JSON-manifest fixture did not verify').toBe(true);
  });

  it('fails when a manifest-protected artifact is modified', () => {
    buildFixture();
    writeFileSync(join(FIXTURE_DIR, 'A.md'), '# A\nunreviewed edit\n');

    const run = runValidator();
    expect(run.ok, 'a modified artifact did not fail the check').toBe(false);
    expect(run.output).toContain('NETWORK_GOVERNANCE=FAIL');
    expect(run.output).toContain('content changed');
  });

  it('fails when an unlisted file is added beside a JSON-manifest package', () => {
    buildFixture();
    writeFixtureFile('UNLISTED_ARTIFACT.md', 'content nobody reviewed\n');

    const run = runValidator();
    expect(run.ok, 'an unlisted extra artifact did not fail the check').toBe(false);
    expect(run.output).toContain('absent from the manifest');
    expect(run.output).toContain('UNLISTED_ARTIFACT.md');
  });

  it('fails when a manifest-listed file is deleted', () => {
    buildFixture();
    rmSync(join(FIXTURE_DIR, 'B.md'), { force: true });

    const run = runValidator();
    expect(run.ok, 'a missing artifact did not fail the check').toBe(false);
    expect(run.output).toContain('manifest lists a file that is missing');
  });

  it('AWE-RR-01: rejects JSON manifest aliases instead of counting them as artifacts', () => {
    writeFixtureFile('README.md', '# only real artifact\n');
    const bytes = readFileSync(join(FIXTURE_DIR, 'README.md'));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(
      join(FIXTURE_DIR, 'MANIFEST.json'),
      `${JSON.stringify(
        {
          package: 'awe0-fixture',
          version: '0.0.0',
          files: [{ path: 'README.md', sha256, bytes: bytes.length }, ...canonicalAliasEntries()],
        },
        null,
        2,
      )}\n`,
    );
    created.push(join(FIXTURE_DIR, 'MANIFEST.json'));
    registerFixture(4);

    const run = runValidator();
    expect(run.ok, 'JSON aliases that all resolve to one file were accepted').toBe(false);
    expect(run.output).toContain('manifest path is not canonical');
    expect(run.output).not.toContain('NETWORK_GOVERNANCE=PASS');
  });

  it('AWE-RR-01: rejects sha256 manifest aliases under the same canonical identity contract', () => {
    writeFixtureFile('README.md', '# only real artifact\n');
    const entries = canonicalAliasEntries();
    writeShaManifest([{ path: 'README.md', sha256: entries[0]!.sha256 }, ...entries]);
    registerFixture(4, 'MANIFEST.sha256', 'sha256sums');

    const run = runValidator();
    expect(run.ok, 'sha256 aliases that all resolve to one file were accepted').toBe(false);
    expect(run.output).toContain('manifest path is not canonical');
    expect(run.output).not.toContain('NETWORK_GOVERNANCE=PASS');
  });

  it('fails when the manifest is edited to disagree about a size', () => {
    // The mutation only the JSON format admits, and the reason `bytes` is checked at all: a
    // hand-edited manifest entry whose hash still matches.
    buildFixture();
    const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, 'MANIFEST.json'), 'utf8')) as {
      files: { path: string; sha256: string; bytes: number }[];
    };
    manifest.files[0]!.bytes += 1;
    writeFileSync(join(FIXTURE_DIR, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const run = runValidator();
    expect(run.ok, 'a manifest size that disagrees with disk did not fail the check').toBe(false);
    expect(run.output).toContain('size changed');
  });

  it('fails closed when a JSON manifest is unreadable rather than verifying nothing', () => {
    buildFixture();
    writeFileSync(join(FIXTURE_DIR, 'MANIFEST.json'), '{ not json');

    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('manifest is not valid JSON');
  });

  // ── Containment. A manifest entry is a path chosen by the package being verified, so it is
  // untrusted input to the gate that verifies it. Before AWE-0's review, each of the five forms
  // below hashed correctly, PASSED, and pushed the verified-artifact count UP.

  it('fails on a `../` manifest entry that escapes the package root', () => {
    buildFixture();
    const target = digestOf('docs/production-handoff/v1.4.0-network-architecture/MANIFEST.sha256');
    writeManifest([{ path: '../v1.4.0-network-architecture/MANIFEST.sha256', ...target }]);

    const run = runValidator();
    expect(run.ok, 'a traversal entry did not fail the check').toBe(false);
    expect(run.output).toContain('manifest path escapes the package root');
  });

  it('fails on a normalisation escape that only becomes traversal after resolving', () => {
    // `!path.startsWith('..')` would pass this. Containment is decided on the resolved path.
    buildFixture();
    const target = digestOf('docs/production-handoff/v1.4.0-network-architecture/MANIFEST.sha256');
    writeManifest([{ path: 'sub/../../v1.4.0-network-architecture/MANIFEST.sha256', ...target }]);

    const run = runValidator();
    expect(run.ok, 'a normalisation escape did not fail the check').toBe(false);
    expect(run.output).toContain('manifest path escapes the package root');
  });

  it('fails on an absolute manifest path, and says so', () => {
    // `join('/pkg', '/etc/hosts')` re-roots to `/pkg/etc/hosts`, so this used to surface as
    // "manifest lists a file that is missing" — a message that sends a reader hunting for an
    // artifact that was never meant to be there.
    buildFixture();
    const abs = join(ROOT, 'docs/production-handoff/v1.4.0-network-architecture/MANIFEST.sha256');
    writeManifest([
      {
        path: abs,
        ...digestOf('docs/production-handoff/v1.4.0-network-architecture/MANIFEST.sha256'),
      },
    ]);

    const run = runValidator();
    expect(run.ok, 'an absolute manifest path did not fail the check').toBe(false);
    expect(run.output).toContain('manifest path is absolute');
  });

  it('fails when one package satisfies its manifest with another package’s files', () => {
    // The decisive form: a package holding no content of its own, verifying green on borrowed
    // artifacts, and contributing them to the repository-wide count.
    buildFixture();
    const target = digestOf('docs/production-handoff/v1.4.0-network-architecture/MANIFEST.sha256');
    rmSync(join(FIXTURE_DIR, 'A.md'), { force: true });
    rmSync(join(FIXTURE_DIR, 'B.md'), { force: true });
    writeFileSync(
      join(FIXTURE_DIR, 'MANIFEST.json'),
      `${JSON.stringify(
        {
          package: 'awe0-fixture',
          version: '0.0.0',
          files: [{ path: '../v1.4.0-network-architecture/MANIFEST.sha256', ...target }],
        },
        null,
        2,
      )}\n`,
    );

    const run = runValidator();
    expect(run.ok, 'cross-package manifest satisfaction did not fail the check').toBe(false);
    expect(run.output).toContain('manifest path escapes the package root');
  });

  it('fails on a listed symlink rather than hashing whatever it points at', () => {
    buildFixture();
    const linkPath = join(FIXTURE_DIR, 'C.md');
    symlinkSync(
      join(ROOT, 'docs/production-handoff/v1.4.0-network-architecture/MANIFEST.sha256'),
      linkPath,
    );
    created.push(linkPath);
    const target = digestOf('docs/production-handoff/v1.4.0-network-architecture/MANIFEST.sha256');
    writeManifest([{ path: 'C.md', ...target }]);

    const run = runValidator();
    expect(run.ok, 'a symlinked artifact did not fail the check').toBe(false);
    expect(run.output).toContain('traverses a symlink');
  });

  it('does not adopt another package through a symlinked directory', () => {
    // The walk used to follow the link and enrol every file behind it as this package's content,
    // green, with the foreign hashes all genuine.
    buildFixture();
    const linkPath = join(FIXTURE_DIR, 'adopted');
    symlinkSync(join(ROOT, 'docs/production-handoff/v1.4.0-network-architecture'), linkPath);
    created.push(linkPath);

    const run = runValidator();
    expect(run.ok, 'a symlinked directory did not fail the check').toBe(false);
    expect(run.output).toContain('absent from the manifest');
    expect(run.output).toContain('adopted');
    // And it must NOT have enumerated the target's contents as members of this package.
    expect(run.output).not.toContain('01_NETWORK_ARCHITECTURE_CONSTITUTION.md');
  });

  it('fails cleanly when a manifest entry names a directory', () => {
    // This used to throw EISDIR out of readFileSync: exit 1, but no FAIL banner, no accumulated
    // failures and a raw stack trace, which reads as a broken tool rather than a governance stop.
    buildFixture();
    mkdirSync(join(FIXTURE_DIR, 'sub'), { recursive: true });
    created.push(join(FIXTURE_DIR, 'sub'));
    writeManifest([{ path: 'sub', sha256: 'f'.repeat(64), bytes: 0 }]);

    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('NETWORK_GOVERNANCE=FAIL');
    expect(run.output).toContain('is not a regular file');
    expect(run.output).not.toContain('at Object.readFileSync');
  });

  it('fails cleanly on a symlink loop instead of crashing the walk', () => {
    // A cycle used to surface as an uncaught ELOOP with no banner — and because `walk` is shared,
    // a cycle anywhere under docs/production-handoff/ took down BOTH gates.
    buildFixture();
    const loopPath = join(FIXTURE_DIR, 'loop');
    symlinkSync('.', loopPath);
    created.push(loopPath);

    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('NETWORK_GOVERNANCE=FAIL');
    expect(run.output).not.toContain('ELOOP');
  });

  // ── Per-layer completeness.

  it('fails when one layer is hollowed out even though the global total stays high', () => {
    // Completeness used to be one global sum, so emptying a package left the total looking healthy.
    buildFixture();
    writeFileSync(
      join(FIXTURE_DIR, 'MANIFEST.json'),
      `${JSON.stringify({ package: 'awe0-fixture', version: '0.0.0', files: [] }, null, 2)}\n`,
    );
    rmSync(join(FIXTURE_DIR, 'A.md'), { force: true });
    rmSync(join(FIXTURE_DIR, 'B.md'), { force: true });

    const run = runValidator();
    expect(run.ok, 'a hollowed layer did not fail the check').toBe(false);
    expect(run.output).toContain('manifest lists 0 artifacts, expected 2');
    // The global floor is untouched: the other eight layers still verify 666 between them.
    expect(run.output).not.toContain('the check did nothing');
  });

  it('fails when a layer declares no expectedArtifacts at all', () => {
    buildFixture();
    const layers = JSON.parse(readFileSync(LAYERS, 'utf8'));
    delete layers.layers.find((l: { id: string }) => l.id === 'awe0-fixture').expectedArtifacts;
    writeFileSync(LAYERS, `${JSON.stringify(layers, null, 2)}\n`);

    const run = runValidator();
    expect(run.ok).toBe(false);
    expect(run.output).toContain('expectedArtifacts must be a positive integer');
  });

  it('fails when a package on disk is declared in no layer', () => {
    // Coverage, derived from position: content under docs/production-handoff/ is read as binding,
    // so content nothing verifies must not be there. No frozen list of package ids is consulted.
    writeFixtureFile('A.md', '# A\n');
    writeManifest();

    const run = runValidator();
    expect(run.ok, 'an undeclared package on disk did not fail the check').toBe(false);
    expect(run.output).toContain('unverified governance package');
    expect(run.output).toContain(FIXTURE_ROOT);
  });

  it('fails when an anchored governance layer is dropped from the registry', () => {
    const layers = JSON.parse(readFileSync(LAYERS, 'utf8'));
    layers.layers = layers.layers.filter(
      (l: { root: string }) => l.root !== 'docs/production-handoff/v1.3.0-security-resilience',
    );
    mutate(LAYERS, `${JSON.stringify(layers, null, 2)}\n`);

    const run = runValidator();
    expect(run.ok, 'dropping the controlling layer did not fail the check').toBe(false);
    expect(run.output).toContain('omits an anchored governance layer');
  });
});
