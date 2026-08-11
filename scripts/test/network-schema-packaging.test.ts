import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * N2 §8 — THE PACKAGING CONTRACT THAT MAKES READING THE PROTECTED SCHEMAS SAFE.
 *
 * `@freightos/schemas` validates network payloads against the authoritative v1.4.0 contracts by
 * reading them from `docs/production-handoff/v1.4.0-network-architecture/schemas/` at runtime.
 * That is only sound if every consumer of the package has that directory on disk — and that is a
 * property of how this repository packages code, not something the module can guarantee alone.
 *
 * The question the N2 ruling asks is: DOES A BUILT/CONSUMED PACKAGE REQUIRE THE REPOSITORY-ROOT
 * docs TREE AT RUNTIME? The answer is that there is no built package to consume. Every workspace
 * package is `private`, defines no `build` script, publishes no `dist`, declares no `files`
 * allowlist, and exports TypeScript SOURCE through `exports: {".": "./src/index.ts"}`. Consumption
 * is in-workspace source resolution, so a consumer is by construction inside the same checkout as
 * the schemas.
 *
 * THIS FILE PINS THAT CONTRACT so it cannot change silently. If someone later adds a build step, a
 * `files` allowlist, or publishes any of these packages, the direct-read design stops being sound
 * and must be replaced by generation-plus-parity — and these assertions are what force that
 * conversation instead of shipping a package whose validators throw ENOENT in production.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PACKAGES = join(ROOT, 'packages');

interface PackageManifest {
  name?: string;
  private?: boolean;
  files?: unknown;
  main?: unknown;
  exports?: Record<string, string>;
  scripts?: Record<string, string>;
}

function manifests(): { dir: string; pkg: PackageManifest }[] {
  return readdirSync(PACKAGES)
    .filter((d) => existsSync(join(PACKAGES, d, 'package.json')))
    .map((d) => ({
      dir: d,
      pkg: JSON.parse(readFileSync(join(PACKAGES, d, 'package.json'), 'utf8')) as PackageManifest,
    }));
}

describe('the workspace publishes no build output — so there is no docs-less consumer', () => {
  it('marks every workspace package private', () => {
    const all = manifests();
    expect(all.length, 'no workspace packages found — the check would be vacuous').toBeGreaterThan(
      3,
    );
    for (const { dir, pkg } of all) {
      expect(pkg.private, `packages/${dir} is not private — it could be published`).toBe(true);
    }
  });

  it('defines no build script in any package, so no dist artifact exists to consume', () => {
    for (const { dir, pkg } of manifests()) {
      expect(
        pkg.scripts?.['build'],
        `packages/${dir} gained a build script — a built consumer would not carry the docs tree, ` +
          'so the direct-read schema design must be replaced by generation plus a parity gate',
      ).toBeUndefined();
    }
    for (const { dir } of manifests()) {
      expect(existsSync(join(PACKAGES, dir, 'dist')), `packages/${dir}/dist exists`).toBe(false);
    }
  });

  it('exports TypeScript source and declares no files allowlist', () => {
    for (const { dir, pkg } of manifests()) {
      expect(
        pkg.files,
        `packages/${dir} declares a files allowlist — packaging changed`,
      ).toBeUndefined();
      const entries = Object.values(pkg.exports ?? {});
      expect(entries.length, `packages/${dir} exports nothing`).toBeGreaterThan(0);
      for (const target of entries) {
        expect(target, `packages/${dir} exports built output rather than source`).toMatch(
          /^\.\/src\/.*\.ts$/,
        );
      }
    }
  });

  it('ships no container image that could receive code without the docs tree', () => {
    // A Dockerfile copying only `packages/` would reintroduce exactly the failure this guards.
    for (const candidate of ['Dockerfile', 'Dockerfile.app', 'docker/Dockerfile']) {
      expect(existsSync(join(ROOT, candidate)), `${candidate} appeared — re-verify §8`).toBe(false);
    }
  });
});

describe('the authoritative schemas are reachable the way the module reaches them', () => {
  it('resolves every registered v1.4 contract from the repository root', () => {
    // The module walks up for `pnpm-workspace.yaml` rather than counting `../` segments, so this
    // asserts the same anchor it uses.
    expect(existsSync(join(ROOT, 'pnpm-workspace.yaml'))).toBe(true);
    const dir = join(ROOT, 'docs/production-handoff/v1.4.0-network-architecture/schemas');
    const found = readdirSync(dir).filter((f) => f.endsWith('.schema.json'));
    expect(found.length, 'the protected v1.4 schema directory is empty').toBe(8);
  });

  it('loads and validates from a FOREIGN working directory under raw node type-stripping', () => {
    // THE CONSUMER-SHAPE PROOF, and the strongest one available in a source-resolved workspace.
    //
    // `pnpm db:up`, `db:down` and `db:status` already run repository source through
    // `node --experimental-strip-types`, so that is a real execution mode rather than a synthetic
    // one — and it is stricter than vitest, because strip-only mode refuses any syntax needing
    // code generation. Running it with cwd set outside the repository additionally proves the
    // module resolves the schemas from its own module URL and not from the caller's cwd.
    const script = `
      const m = await import(${JSON.stringify(join(ROOT, 'packages/schemas/src/network.ts'))});
      const registered = m.listRegisteredSchemas();
      const ref = m.validateV14LogisticsObjectReference({
        network_id: 'obj-00000001', object_type: 'example-only',
      });
      const evt = m.validateV14NetworkEventEnvelope({});
      // N3 adds a contract in a SECOND source directory — packages/schemas/schemas, not the
      // protected handoff tree. Same probe, because the question is identical and the answer is
      // no longer implied: does this resolve from the module's own URL, or from the caller's cwd?
      const corr = m.validateN3EventCorrection({
        corrected_event_id: '018f3a4b-0000-7000-8000-000000000001',
        replacement_event_id: '018f3a4b-0000-7000-8000-000000000002',
        reason: 'r',
        effective_at: '2026-08-10T12:00:00Z',
      });
      const badCorr = m.validateN3EventCorrection({ reason: 'r' });
      process.stdout.write(JSON.stringify({
        cwd: process.cwd(),
        registered: registered.length,
        v14: registered.filter((s) => s.layer === 'v1.4').length,
        n3: registered.filter((s) => s.layer === 'n3').length,
        durableRefs: registered.filter((s) =>
          s.durableRef.startsWith('https://schemas.rigreceipts.com/network/')).length,
        refValid: ref.valid,
        emptyEnvelopeValid: evt.valid,
        correctionValid: corr.valid,
        badCorrectionValid: badCorr.valid,
      }));
    `;
    const out = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script],
      { cwd: '/', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const result = JSON.parse(out) as Record<string, unknown>;

    expect(result['cwd'], 'the probe did not run outside the repository').toBe('/');
    // 8 protected v1.4 contracts + the N3 correction contract + the v1.2 envelope.
    expect(result['registered']).toBe(10);
    expect(result['v14']).toBe(8);
    expect(result['n3']).toBe(1);
    // Every contract a network event can reference resolves under the owner-controlled namespace.
    // The tenth is the v1.2 envelope, which deliberately gets no production alias.
    expect(result['durableRefs']).toBe(9);
    // Positive and negative in the same probe, so a module that threw or returned a constant
    // could not produce these pairs.
    expect(result['refValid']).toBe(true);
    expect(result['emptyEnvelopeValid']).toBe(false);
    expect(result['correctionValid']).toBe(true);
    expect(result['badCorrectionValid']).toBe(false);
  }, 60_000);
});

describe('the registry cannot become runtime-mutable or gain a resolver', () => {
  const source = (): string => readFileSync(join(ROOT, 'packages/schemas/src/network.ts'), 'utf8');

  it('exposes no registration/mutation API — schema registration is a source-and-review act', () => {
    // M6. Governed contracts are defined by committed source under review. A runtime path that
    // could add or replace a schema would let ordinary code redefine a governed contract, which is
    // the whole property the content lock exists to protect.
    for (const forbidden of [
      'export function registerSchema',
      'export function addSchema',
      'export function replaceSchema',
      'export function deregisterSchema',
      'export function setContentHash',
      'export function deprecateSchema',
    ]) {
      expect(source(), `${forbidden} would make governed contracts runtime-mutable`).not.toContain(
        forbidden,
      );
    }
  });

  it('exposes no object resolver — naming a thing is not reaching it', () => {
    // M5. An object reference is a shape. The moment this module can turn one into data, "I can
    // name it" becomes "I can read it", which is the exact inference N2 forbids.
    for (const forbidden of [
      'resolveObject',
      'fetchObject',
      'loadObject',
      'dereference',
      'getObjectByReference',
    ]) {
      expect(source(), `${forbidden} would turn naming into access`).not.toContain(forbidden);
    }
  });

  it('takes no database dependency, directly or transitively', () => {
    // The scope form of authority-neutrality: a module that cannot reach a database cannot leak
    // one. Asserted on the import list rather than on behaviour, because behaviour only samples.
    const text = source();
    for (const forbidden of ["from 'pg'", 'from "pg"', '@freightos/database', 'node:net']) {
      expect(text, `the registry imported ${forbidden}`).not.toContain(forbidden);
    }
    const pkg = JSON.parse(
      readFileSync(join(PACKAGES, 'schemas/package.json'), 'utf8'),
    ) as PackageManifest & { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['ajv', 'ajv-formats']);
  });

  it('exposes no implicit-version alias', () => {
    // M7. Durable artifacts are graded by the contract they were written under.
    for (const forbidden of [
      'latestVersion',
      'currentVersion',
      'resolveLatest',
      'newestVersion',
      "'latest'",
    ]) {
      expect(source(), `${forbidden} would let version identity float`).not.toContain(forbidden);
    }
  });
});

describe('object_type is syntactic in N2, not governed vocabulary', () => {
  it('hardcodes no object-type list anywhere in the registry module', () => {
    // N2 §5/§24. The v1.4 contract defines `object_type` as a non-blank open string and N2 keeps it
    // that way. The strings used in tests — shipment, railcar, vessel_voyage, flight, trailer — are
    // VALIDATION EXAMPLES demonstrating mode-neutrality. They are not canonical FreightOS types,
    // and nothing in this repository may treat them as approved vocabulary. A future canonical
    // domain-model workstream governs object-type semantics: code, meaning, identity lifecycle,
    // source of truth, correction semantics and alias mapping.
    const text = readFileSync(join(ROOT, 'packages/schemas/src/network.ts'), 'utf8');
    for (const example of ['shipment', 'railcar', 'vessel_voyage', 'flight', 'trailer']) {
      expect(text, `${example} leaked from a test example into the registry module`).not.toContain(
        `'${example}'`,
      );
    }
    expect(text).not.toMatch(/OBJECT_TYPES|ObjectType\s*=|allowedObjectTypes/);
  });

  it('keeps the governed contract open so any object kind validates', () => {
    const contract = JSON.parse(
      readFileSync(
        join(
          ROOT,
          'docs/production-handoff/v1.4.0-network-architecture/schemas/logistics-object-reference.schema.json',
        ),
        'utf8',
      ),
    ) as { properties: { object_type: Record<string, unknown> } };
    // No enum, no const, no pattern — open string with a non-blank floor, exactly as governed.
    expect(contract.properties.object_type['enum']).toBeUndefined();
    expect(contract.properties.object_type['const']).toBeUndefined();
    expect(contract.properties.object_type['pattern']).toBeUndefined();
    expect(contract.properties.object_type['minLength']).toBe(1);
  });
});
