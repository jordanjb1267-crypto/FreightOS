import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The dead-test sweep — `RETURNED_UNINVOKED_TEST_BODY = 0`.
 *
 * A test that never runs its assertions is worse than a missing test, because the suite reports it
 * as passing. This repository has now paid for four detector defects (T-01…T-04), every one of
 * which was a test that appeared to prove something it did not, so the class deserves a mechanical
 * check rather than review attention.
 *
 * Three shapes are caught, chosen because each is silent:
 *
 *   1. A body that RETURNS a function instead of running it. `it('x', () => () => expect(...))`
 *      passes instantly and asserts nothing. Vitest sees a resolved value, not a missed assertion.
 *   2. `.only`, which does not weaken one test — it disables every other test in the file, and the
 *      run still reports green.
 *   3. `.skip` / `.todo` left behind. Vitest reports these, but they scroll past in a 1000-test
 *      run and a permanently skipped security control is indistinguishable from one that was never
 *      written.
 *
 * THE DETECTOR HAS ITS OWN CONTROL. A sweep that has never been observed to fire is a sweep nobody
 * has tested, and this one would report a clean repository just as happily if its regexes were
 * wrong. The last test plants each shape in a temporary file and requires the detector to catch it.
 */

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'coverage') {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) testFiles(full, out);
    else if (full.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/**
 * A test body that returns a function rather than running it.
 *
 * Matches `it('…', () => () =>` and the `async` variants — the arrow-returning-arrow shape. It does
 * NOT match `() => expect(...)`, which is an ordinary concise body that does assert, nor
 * `() => somePromise`, which vitest awaits.
 */
const RETURNED_BODY =
  /\b(it|test)\s*\(\s*[^)]*?,\s*(async\s*)?\(\s*\)\s*=>\s*(async\s*)?\(\s*\)\s*=>/;

const ONLY = /\b(it|test|describe)\.only\s*\(/;
const SKIPPED = /\b(it|test|describe)\.(skip|todo)\s*\(/;

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly kind: string;
}

function sweep(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // Strip line comments so prose describing these shapes — this file's own header, for one —
      // is not itself a finding. A gate that forces its reasoning to be deleted to stay green is a
      // gate that will have its reasoning deleted.
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (RETURNED_BODY.test(code))
        findings.push({ file, line: i + 1, kind: 'RETURNED_UNINVOKED_TEST_BODY' });
      if (ONLY.test(code)) findings.push({ file, line: i + 1, kind: 'FOCUSED_TEST' });
      if (SKIPPED.test(code)) findings.push({ file, line: i + 1, kind: 'SKIPPED_TEST' });
    });
  }
  return findings;
}

describe('dead-test sweep', () => {
  const files = testFiles(join(ROOT, 'packages')).concat(testFiles(join(ROOT, 'scripts')));

  it('scans a non-trivial number of test files, so a clean result means something', () => {
    // Anti-vacuity first. Every assertion below is "the sweep found nothing", which is exactly what
    // a sweep over an empty file list reports.
    expect(files.length, 'the sweep found no test files at all').toBeGreaterThan(40);
  });

  it('finds no test body that is returned instead of invoked', () => {
    const findings = sweep(files)
      .filter((f) => f.kind === 'RETURNED_UNINVOKED_TEST_BODY')
      .map((f) => `${f.file.replace(ROOT, '')}:${f.line}`);
    expect(findings).toEqual([]);
  });

  it('finds no focused test — one `.only` silently disables every other test in its file', () => {
    const findings = sweep(files)
      .filter((f) => f.kind === 'FOCUSED_TEST')
      .map((f) => `${f.file.replace(ROOT, '')}:${f.line}`);
    expect(findings).toEqual([]);
  });

  it('finds no skipped or todo test', () => {
    const findings = sweep(files)
      .filter((f) => f.kind === 'SKIPPED_TEST')
      .map((f) => `${f.file.replace(ROOT, '')}:${f.line}`);
    expect(findings).toEqual([]);
  });

  it('DETECTOR CONTROL — the sweep fires on each shape it claims to catch', () => {
    // Without this, the three empty results above are equally consistent with a clean repository
    // and with three regexes that match nothing at all. Each planted line is written the way the
    // defect actually appears, not as a string crafted to satisfy the pattern.
    // The planted lines are ASSEMBLED rather than written as literals, because this file is itself
    // inside the swept tree and a literal `it` + `.skip(` here would be a real finding. Exempting
    // the sweep from its own scan was the alternative and is exactly the smell it exists to catch —
    // a gate that does not apply to itself is a gate with one permanent blind spot.
    const IT = 'it';
    const dir = mkdtempSync(join(tmpdir(), 'dead-test-control-'));
    try {
      const returned = join(dir, 'returned.test.ts');
      writeFileSync(
        returned,
        [
          "import { it, expect } from 'vitest';",
          `${IT}('asserts nothing at all', () ${'=>'} () ${'=>'} {`,
          '  expect(1).toBe(2);',
          '});',
          '',
        ].join('\n'),
      );
      const asyncReturned = join(dir, 'async-returned.test.ts');
      writeFileSync(
        asyncReturned,
        [
          "import { it, expect } from 'vitest';",
          `${IT}('also asserts nothing', async () ${'=>'} async () ${'=>'} {`,
          '  expect(1).toBe(2);',
          '});',
          '',
        ].join('\n'),
      );
      const focused = join(dir, 'focused.test.ts');
      writeFileSync(
        focused,
        [
          "import { it, expect } from 'vitest';",
          `${IT}.only('disables its neighbours', () => {`,
          '  expect(1).toBe(1);',
          '});',
          '',
        ].join('\n'),
      );
      const skipped = join(dir, 'skipped.test.ts');
      writeFileSync(
        skipped,
        [
          "import { it, expect } from 'vitest';",
          `${IT}.skip('never runs', () => {`,
          '  expect(1).toBe(1);',
          '});',
          '',
        ].join('\n'),
      );

      const kinds = sweep([returned, asyncReturned, focused, skipped]).map((f) => f.kind);
      expect(kinds.filter((k) => k === 'RETURNED_UNINVOKED_TEST_BODY')).toHaveLength(2);
      expect(kinds).toContain('FOCUSED_TEST');
      expect(kinds).toContain('SKIPPED_TEST');

      // And it does NOT fire on an ordinary concise body, which is the false positive that would
      // make this gate unusable and get it deleted.
      const healthy = join(dir, 'healthy.test.ts');
      writeFileSync(
        healthy,
        [
          "import { it, expect } from 'vitest';",
          "it('asserts normally', () => expect(1).toBe(1));",
          "it('asserts in a block', async () => {",
          '  expect(await Promise.resolve(1)).toBe(1);',
          '});',
          '',
        ].join('\n'),
      );
      expect(sweep([healthy])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
