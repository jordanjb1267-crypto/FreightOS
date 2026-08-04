// Shared source-of-truth mapping between the immutable handoff package and the generated
// operational copies at the repository root.
//
// Owner ruling 2: no symlinks; docs/production-handoff/v1.2/ stays immutable; operational copies
// live at the root with provenance and CI drift detection.
//
// The handoff SQL is reference DDL and is copied to db/reference/ — deliberately NOT to a path a
// migration runner would ever scan. Reviewed implementation migrations live in
// packages/database/migrations/ (ADR-0017).

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const HANDOFF_ROOT = join(REPO_ROOT, 'docs', 'production-handoff', 'v1.2');
export const PROVENANCE_FILE = join(REPO_ROOT, 'handoff-provenance.json');

/** handoff subdirectory -> repository-root destination */
export const DIRECTORY_MAP = Object.freeze({
  config: 'config',
  schemas: 'schemas',
  db: join('db', 'reference'),
  checklists: 'checklists',
  adr: 'adr',
  scripts: 'scripts',
});

export const HANDOFF_VERSION = 'v1.2';
export const HANDOFF_SOURCE_PATH = 'docs/production-handoff/v1.2';

export function sha256(absolutePath) {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

/** Every file the handoff contributes, as { source, destination, sourceSha256 }. */
export function enumerateHandoffFiles() {
  const files = [];
  for (const [handoffDir, destDir] of Object.entries(DIRECTORY_MAP)) {
    const absDir = join(HANDOFF_ROOT, handoffDir);
    for (const abs of walk(absDir)) {
      const withinDir = relative(absDir, abs);
      files.push({
        source: `${HANDOFF_SOURCE_PATH}/${handoffDir}/${withinDir.split(sep).join('/')}`,
        destination: join(destDir, withinDir).split(sep).join('/'),
        sourceSha256: sha256(abs),
      });
    }
  }
  return files.sort((a, b) => a.destination.localeCompare(b.destination));
}

export function readProvenance() {
  return JSON.parse(readFileSync(PROVENANCE_FILE, 'utf8'));
}
