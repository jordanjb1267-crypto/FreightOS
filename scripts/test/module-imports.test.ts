import { describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs script module with no type declarations.
import { importSpecifiersIn } from '../lib/module-imports.mjs';

/**
 * R2-03 — dependency-edge extraction for the ADR-0024 layering check.
 *
 * The first version required a `from` clause, so a bare side-effect import was not an edge as far
 * as the validator was concerned:
 *
 *   import '@freightos/identity';
 *
 * It is the same edge — the module loads and its top level runs — and the layering rule is broken
 * exactly as much as it would be by a named import. Two of the four planted violations below went
 * straight past the old parser.
 *
 * The negative direction matters as much: a pattern loose enough to catch every import form is also
 * loose enough to invent edges from comments and string literals, and a validator that cries wolf
 * gets bypassed rather than fixed.
 */
const specifiers = (source: string): string[] => importSpecifiersIn(source) as string[];

describe('every import form is an edge — R2-03', () => {
  it('finds a bare package side-effect import', () => {
    expect(specifiers(`import '@freightos/identity';`)).toEqual(['@freightos/identity']);
    expect(specifiers(`import "@freightos/identity";`)).toEqual(['@freightos/identity']);
  });

  it('finds a bare relative side-effect import that escapes a package', () => {
    expect(specifiers(`import '../../identity/src/index.ts';`)).toEqual([
      '../../identity/src/index.ts',
    ]);
  });

  it('finds a dynamic import', () => {
    expect(specifiers(`const load = () => import('@freightos/identity');`)).toEqual([
      '@freightos/identity',
    ]);
    expect(specifiers(`await import(\n  '@freightos/identity'\n);`)).toEqual([
      '@freightos/identity',
    ]);
  });

  it('finds a require', () => {
    expect(specifiers(`const x = require('@freightos/identity');`)).toEqual([
      '@freightos/identity',
    ]);
  });

  it('finds the four forms the check already handled', () => {
    expect(specifiers(`import x from '@freightos/config';`)).toEqual(['@freightos/config']);
    expect(specifiers(`import type { T } from '@freightos/context';`)).toEqual([
      '@freightos/context',
    ]);
    expect(specifiers(`export { a } from './local.ts';`)).toEqual(['./local.ts']);
    expect(specifiers(`export * from '@freightos/schemas';`)).toEqual(['@freightos/schemas']);
  });

  it('finds several in one file, once each', () => {
    const source = [
      `import '@freightos/identity';`,
      `import a from '@freightos/config';`,
      `import '@freightos/identity';`,
      `const b = () => import('./local.ts');`,
    ].join('\n');
    expect(specifiers(source).sort()).toEqual([
      './local.ts',
      '@freightos/config',
      '@freightos/identity',
    ]);
  });
});

describe('comments and strings are not edges — R2-03', () => {
  it('ignores a line comment', () => {
    expect(specifiers(`// import '@freightos/identity';\nconst x = 1;`)).toEqual([]);
  });

  it('ignores a block comment, including a doc comment spanning lines', () => {
    expect(
      specifiers(`/**\n * import '@freightos/identity';\n * require('@freightos/config')\n */`),
    ).toEqual([]);
  });

  it('ignores import syntax inside an ordinary string', () => {
    expect(specifiers(`const advice = "import '@freightos/identity';";`)).toEqual([]);
    expect(specifiers("const advice = `import '@freightos/identity';`;")).toEqual([]);
  });

  it('ignores a specifier-shaped value that is not an import', () => {
    expect(specifiers(`const name = '@freightos/identity';`)).toEqual([]);
    expect(specifiers(`log('importing @freightos/identity now');`)).toEqual([]);
  });

  it('still finds a real import in a file that also comments about one', () => {
    // The case a blunt "strip everything that looks like a comment" would get wrong in the other
    // direction: the comment must not hide the statement below it.
    const source = [
      `// We deliberately do not import '@freightos/identity' here.`,
      `import { a } from '@freightos/config';`,
    ].join('\n');
    expect(specifiers(source)).toEqual(['@freightos/config']);
  });

  it('is not confused by an escaped quote inside a string', () => {
    const source = `const s = 'it\\'s fine';\nimport '@freightos/config';`;
    expect(specifiers(source)).toEqual(['@freightos/config']);
  });
});
