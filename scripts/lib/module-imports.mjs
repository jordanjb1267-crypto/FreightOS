/**
 * Dependency-edge extraction for the ADR-0024 layering check — R2-03.
 *
 * Its own module so it can be unit-tested against planted violations and against the false
 * positives a looser pattern would produce. scripts/validate-scope.mjs is a top-level script and
 * cannot be imported without running the whole validation.
 */

import { readFileSync } from 'node:fs';

/**
 * Every form a module specifier can take — R2-03.
 *
 * The first version required a `from` clause, which meant a bare side-effect import
 *
 *   import '@freightos/identity';
 *   import '../../identity/src/index.ts';
 *
 * was not an edge as far as this check was concerned. It is the same edge: the module loads, its
 * top level runs, and the layering rule the check exists to enforce is broken exactly as much as
 * it would be by a named import. A dependency taken for effect is still a dependency.
 *
 * The patterns cover, in order: `import x from '…'` and `export … from '…'`, bare `import '…'`,
 * dynamic `import('…')` with a literal specifier, and `require('…')`. `import type` is included
 * deliberately — a type-only edge still couples two packages and the manifest should declare it.
 */
const IMPORT_PATTERNS = [
  /(?:^|[^\w$])(?:import|export)\s[^;]*?\sfrom\s*(['"])([^'"]+)\1/g,
  /(?:^|[^\w$])import\s*(['"])([^'"]+)\1/g,
  /(?:^|[^\w$])import\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
  /(?:^|[^\w$])require\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
];

/**
 * Blank out comments and string CONTENTS, preserving length and newlines.
 *
 * Matching runs against this masked copy, so `import` syntax inside a comment or inside an ordinary
 * string cannot create an edge; the specifier itself is then read back from the original text at
 * the same offset. Two passes rather than one cleverer regex is the point — a pattern that tries to
 * know whether it is inside a string is right until it is not, and this is a security check.
 */
function maskCommentsAndStrings(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '//') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (text[i] === "'" || text[i] === '"' || text[i] === '`') {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length && text[j] !== quote) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      // The quotes stay, so a specifier's position is still recoverable; the contents become a run
      // of spaces of the same length. A string whose CONTENTS look like an import is therefore
      // inert, because the `import` keyword inside it was blanked with everything else.
      out += quote + text.slice(i + 1, j).replace(/[^\n]/g, ' ') + (text[j] ?? '');
      i = j + 1;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

export function importSpecifiersIn(text) {
  const masked = maskCommentsAndStrings(text);
  const specifiers = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of masked.matchAll(pattern)) {
      const blanked = match[2];
      if (blanked === undefined) continue;
      // A real specifier survives masking as a run of spaces of its own length, so its offset is
      // where the original text still holds it. A comment became spaces entirely, so nothing in one
      // can match at all.
      const at = match.index + match[0].lastIndexOf(blanked);
      const specifier = text.slice(at, at + blanked.length);
      if (specifier.length > 0) specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

/** Read a file and return every module specifier it imports, in any form. */
export function importSpecifiers(file) {
  return importSpecifiersIn(readFileSync(file, 'utf8'));
}
