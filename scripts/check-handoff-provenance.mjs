#!/usr/bin/env node
// CI gate: detect unreviewed drift between the immutable handoff package and the generated
// operational copies at the repository root. Owner ruling 2.
//
// Four ways this fails, all of them real:
//   1. The handoff itself changed        -> the binding source was edited outside a reviewed
//                                           handoff-version change.
//   2. A generated copy changed          -> someone edited a root copy instead of the handoff,
//                                           so the two silently disagree.
//   3. A declared override changed       -> an authorised correction was modified without review.
//   4. A generated file is missing/extra -> the copy set no longer mirrors the handoff.
//
// Exit 0 = clean, 1 = drift.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROVENANCE_FILE,
  REPO_ROOT,
  enumerateHandoffFiles,
  readProvenance,
  sha256,
} from './handoff-sources.mjs';

if (!existsSync(PROVENANCE_FILE)) {
  console.error('PROVENANCE=FAIL');
  console.error('- handoff-provenance.json is missing. Run `pnpm sync:handoff`.');
  process.exit(1);
}

const provenance = readProvenance();
const overrides = provenance.overrides ?? {};
const recorded = new Map(provenance.generatedFiles.map((f) => [f.destination, f]));
const actual = enumerateHandoffFiles();
const errors = [];

for (const file of actual) {
  const entry = recorded.get(file.destination);

  if (!entry) {
    errors.push(
      `unrecorded handoff file: ${file.source} has no entry in handoff-provenance.json. ` +
        `Run \`pnpm sync:handoff\`.`,
    );
    continue;
  }

  // 1. Has the binding source moved underneath us?
  if (entry.sourceSha256 !== file.sourceSha256) {
    errors.push(
      `handoff source changed: ${file.source}\n` +
        `    recorded ${entry.sourceSha256}\n` +
        `    actual   ${file.sourceSha256}\n` +
        `    The preserved package is immutable. Only a reviewed handoff-version change may ` +
        `alter it.`,
    );
    continue;
  }

  const destAbs = join(REPO_ROOT, file.destination);
  if (!existsSync(destAbs)) {
    errors.push(`missing generated copy: ${file.destination}. Run \`pnpm sync:handoff\`.`);
    continue;
  }

  const destHash = sha256(destAbs);
  const override = overrides[file.destination];

  if (override) {
    // 3. Authorised correction — must match its reviewed hash, and must cite an ADR.
    if (!override.adr || !override.reason) {
      errors.push(`override for ${file.destination} must declare both "adr" and "reason".`);
    } else if (override.sha256 !== destHash) {
      errors.push(
        `override changed without review: ${file.destination} (authorised by ${override.adr})\n` +
          `    recorded ${override.sha256}\n` +
          `    actual   ${destHash}`,
      );
    }
    continue;
  }

  // 2. Plain copy — must be byte-identical to the handoff.
  if (destHash !== file.sourceSha256) {
    errors.push(
      `unreviewed drift: ${file.destination} differs from ${file.source}\n` +
        `    handoff ${file.sourceSha256}\n` +
        `    copy    ${destHash}\n` +
        `    Either restore it with \`pnpm sync:handoff\`, or declare an override in ` +
        `handoff-provenance.json citing the ADR that authorises the change.`,
    );
  }
}

// 4. Entries recorded but no longer produced by the handoff.
for (const destination of recorded.keys()) {
  if (!actual.some((f) => f.destination === destination)) {
    errors.push(`stale provenance entry: ${destination} no longer exists in the handoff.`);
  }
}

for (const destination of Object.keys(overrides)) {
  if (!recorded.has(destination)) {
    errors.push(`override declared for ${destination}, which is not a generated file.`);
  }
}

if (errors.length > 0) {
  console.error('PROVENANCE=FAIL');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

const overrideCount = Object.keys(overrides).length;
console.log('PROVENANCE=PASS');
console.log(`FILES=${actual.length}`);
console.log(`VERBATIM=${actual.length - overrideCount}`);
console.log(`AUTHORISED_OVERRIDES=${overrideCount}`);
for (const [destination, o] of Object.entries(overrides)) {
  console.log(`  override ${destination} (${o.adr})`);
}
