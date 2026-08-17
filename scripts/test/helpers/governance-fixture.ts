import { execFileSync } from 'node:child_process';
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

export interface GovernanceFixture {
  root: string;
  cleanup: () => void;
}

let sourceFiles: string[] | null = null;

function trackedAndUntrackedSourceFiles(): string[] {
  if (sourceFiles) return sourceFiles;
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: SOURCE_ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file.length > 0);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: SOURCE_ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file.length > 0);
  sourceFiles = [...new Set([...tracked, ...untracked])].sort();
  return sourceFiles;
}

export function createGovernanceFixture(prefix = 'freightos-governance-'): GovernanceFixture {
  const root = mkdtempSync(join(tmpdir(), prefix));
  for (const relPath of trackedAndUntrackedSourceFiles()) {
    const source = join(SOURCE_ROOT, relPath);
    const target = join(root, relPath);
    mkdirSync(dirname(target), { recursive: true });
    const stats = lstatSync(source);
    if (stats.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), target);
    } else {
      copyFileSync(source, target, constants.COPYFILE_FICLONE);
    }
  }

  const sourceNodeModules = join(SOURCE_ROOT, 'node_modules');
  if (existsSync(sourceNodeModules)) {
    symlinkSync(sourceNodeModules, join(root, 'node_modules'), 'dir');
  }

  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function assertInsideFixture(fixtureRoot: string, targetPath: string): void {
  const rel = relative(fixtureRoot, targetPath).split(sep).join('/');
  if (rel === '' || rel.startsWith('../') || rel === '..') {
    throw new Error(`test mutation target is outside fixture root: ${targetPath}`);
  }
}
