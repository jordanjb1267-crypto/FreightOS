import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * OR-13 — the external transport envelope is DEFERRED TO N7-B, asserted mechanically.
 *
 * A ruling with no detector is a comment. This file is the detector.
 *
 * The thing being prevented is specific and easy to do by accident: registering a governed N2
 * durable schema for the external wire frame. A durable schema is, by design, the hardest artifact
 * in this repository to change — `network_schema_versions.durable_schema_ref` is a primary key,
 * `content_hash` pins the bytes, and the doctrine is that a semantic change requires a NEW
 * reference rather than a repoint. That immutability is exactly why registering one before the
 * first adapter has had to produce a frame would be expensive to undo: the envelope's field set,
 * serialization, signing surface and acknowledgement semantics are all still open.
 *
 * The second half of the ruling is the distinction, which is the part a later reader is most
 * likely to collapse:
 *
 *     artifact payload durable_schema_ref   !=   external transport envelope version
 *
 * The first says what the bytes inside mean and is governed by N2 today. The second would say what
 * frame carries them and is governed by nothing yet. One version field cannot express both, because
 * a destination accepting envelope v1 while accepting only some payload versions is ordinary.
 */

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const MIGRATIONS = join(ROOT, 'packages/database/migrations');

/**
 * Words that would name an external WIRE FRAME, as opposed to N3's `event-envelope` or N5's
 * `evidence-envelope` — both of which are internal contracts that predate N7 and are not what this
 * ruling defers. The list is about the transport frame specifically.
 */
const WIRE_ENVELOPE_MARKERS = [
  'transport-envelope',
  'transport_envelope',
  'external-envelope',
  'external_envelope',
  'wire-envelope',
  'wire_envelope',
  'delivery-envelope',
  'webhook-envelope',
];

function sqlFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join(MIGRATIONS, f));
}

/** Executable SQL only — the migrations discuss the deferral at length, and must stay able to. */
function executable(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTs(full, out);
    else if (full.endsWith('.ts') && !full.includes('/test/') && !full.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('OR-13 — N7-A registers no external wire envelope', () => {
  it('inserts no transport-envelope durable schema into the N2 registry', () => {
    // Every INSERT into `network_schema_versions`, across every migration, graded on the
    // EXECUTABLE text. Scoping to 0035 alone would miss the obvious workaround of registering it
    // from a later migration, and this gate has to survive N7-B being written by someone reading
    // only the directive.
    const offenders: string[] = [];
    for (const file of sqlFiles()) {
      const sql = executable(file);
      if (!/INSERT\s+INTO\s+network_schema_versions/i.test(sql)) continue;
      for (const marker of WIRE_ENVELOPE_MARKERS) {
        if (sql.toLowerCase().includes(marker)) {
          offenders.push(`${file.split('/').pop()}: ${marker}`);
        }
      }
    }
    expect(offenders).toEqual([]);

    // ANTI-VACUITY. The scan must actually be reaching a migration that registers durable schemas,
    // or "no transport envelope found" is a statement about an unread file. 0029 seeds nine.
    const registering = sqlFiles().filter((f) =>
      /INSERT\s+INTO\s+network_schema_versions/i.test(executable(f)),
    );
    expect(
      registering.length,
      'no migration registers any durable schema, so the scan is empty',
    ).toBeGreaterThan(0);
  });

  it('adds no durable schema at all in 0035 — N7-A touches the N2 registry not at all', () => {
    const n7 = executable(join(MIGRATIONS, '0035_network_external_transport_foundation.up.sql'));
    expect(n7).not.toMatch(/INSERT\s+INTO\s+network_schema_versions/i);
    expect(n7).not.toMatch(/UPDATE\s+network_schema_versions/i);
    expect(n7).not.toMatch(/DELETE\s+FROM\s+network_schema_versions/i);
    // It DOES reference the table, as a foreign-key target for destination compatibility — which is
    // the routing half the ruling explicitly keeps. Asserting the reference exists stops the three
    // absences above from being satisfied by a migration that forgot the registry entirely.
    expect(n7).toMatch(/REFERENCES network_schema_versions \(durable_schema_ref\)/);
  });

  it('ships no external serialization or envelope-construction code', () => {
    const offenders: string[] = [];
    for (const file of walkTs(join(ROOT, 'packages'))) {
      const src = readFileSync(file, 'utf8');
      for (const marker of WIRE_ENVELOPE_MARKERS) {
        if (src.toLowerCase().includes(marker))
          offenders.push(`${file.replace(ROOT, '')}: ${marker}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps payload-schema version and envelope version as separate dimensions', () => {
    // The destination carries `durable_schema_ref` — the PAYLOAD contract — and no envelope
    // version column of any name. One column carrying both would be the collapse the ruling
    // prevents, and it would be invisible afterwards: nothing about a single `version` column says
    // which of the two dimensions it lost.
    const n7 = executable(join(MIGRATIONS, '0035_network_external_transport_foundation.up.sql'));
    const destinationTable = /CREATE TABLE network_transport_destinations \(([\s\S]*?)\n\);/.exec(
      n7,
    );
    expect(destinationTable, 'the destination table was not found').not.toBeNull();
    const body = destinationTable![1]!;
    expect(body).toContain('durable_schema_ref');
    for (const forbidden of [
      'envelope_version',
      'protocol_version',
      'wire_version',
      'transport_version',
    ]) {
      expect(body, `destinations carry ${forbidden}, which N7-A must not decide`).not.toContain(
        forbidden,
      );
    }
  });

  it('matches the payload contract EXACTLY — no prefix, family or floating alias', () => {
    // The routing half is what N7-A ships in place of the deferred envelope, so its exactness is
    // the load-bearing property rather than an incidental one. A foreign key to a primary-keyed
    // `durable_schema_ref` IS exact matching, structurally: there is no representation for a
    // pattern, a prefix or a version range.
    const n7 = executable(join(MIGRATIONS, '0035_network_external_transport_foundation.up.sql'));
    expect(n7).toMatch(
      /durable_schema_ref text NOT NULL REFERENCES network_schema_versions \(durable_schema_ref\)/,
    );
    // And nothing anywhere in 0035 does pattern matching on a schema reference.
    expect(n7).not.toMatch(/durable_schema_ref\s+(LIKE|SIMILAR TO|~)/i);
    expect(n7).not.toMatch(/split_part\s*\(\s*durable_schema_ref/i);
    expect(n7).not.toMatch(/left\s*\(\s*durable_schema_ref/i);
  });

  it('records the deferral where a reader will meet it, not only in a commit message', () => {
    // A ruling that lives only in this test is a ruling nobody reading the architecture will find.
    const rulings = readFileSync(join(ROOT, 'docs/governance/N7_OWNER_RULINGS.md'), 'utf8');
    expect(rulings).toContain('OR-13');
    expect(rulings).toContain('DEFERRED TO N7-B');
    expect(rulings).toContain(
      'artifact payload durable_schema_ref   !=   external transport envelope version',
    );

    const adr = readFileSync(
      join(ROOT, 'docs/decisions/0018-n7-external-transport-boundary.md'),
      'utf8',
    );
    expect(adr).toContain('OR-13');
    expect(adr).toContain('n7-envelope-deferral-gate');
  });
});
