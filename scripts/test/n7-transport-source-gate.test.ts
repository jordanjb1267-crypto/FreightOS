import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * N7 transport authority, proven at the SOURCE — the endpoint gate.
 *
 * Behaviour cannot prove this one. N7-A opens no socket, so no behavioural test can observe where a
 * future sender would connect; every test written today would pass against an implementation that
 * accepted a `url` argument, because nothing would dial it. And the dangerous version of the bug is
 * the one that agrees with the tests: an honest fixture would pass the same endpoint the
 * destination names, and the caller-supplied parameter would look correct until the day someone
 * passed a different one.
 *
 * So the rule is structural and it is set BEFORE the sender exists:
 *
 *     a future sender derives its destination from `destination_id` and from nothing a caller
 *     supplies.
 *
 * `destination_id` is a governed, immutable, recipient-authored row. A `url`, `host` or `port`
 * parameter is an SSRF entry point with a signature — it is the difference between "where this
 * artifact goes is configuration" and "where this artifact goes is an argument".
 *
 * The gate is written now, while the surface is small and the answer is obviously yes, rather than
 * alongside the adapter that would need an exemption from it.
 */

const MODULE = fileURLToPath(
  new URL('../../packages/context/src/external-transport.ts', import.meta.url),
);

/** Executable source only. The prose explaining the refusals must not trip the detector. */
function executableSource(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function exportedSignatures(source: string): readonly string[] {
  const out: string[] = [];
  const re = /export function\s+\w+\s*\(([\s\S]*?)\)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]!);
  return out;
}

/**
 * Parameter NAMES, without types, and with a trailing `?` stripped.
 *
 * The `?` strip is not cosmetic: mutations D-C, D-D, D-E and D-I all walked through the N6 gate
 * because `purpose?` failed a `^\w+$` test and was discarded before any forbidden word was looked
 * for. An optional parameter is exactly how caller-supplied authority arrives in practice, because
 * it is the form that does not break existing callers.
 */
function parameterNames(signature: string): readonly string[] {
  return signature
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.split(':')[0]!.trim())
    .map((name) => name.replace(/\?$/, ''))
    .filter((name) => /^\w+$/.test(name));
}

/** Property names inside an inline object parameter — the other way an argument arrives. */
function objectPropertyNames(source: string): readonly string[] {
  const out: string[] = [];
  const re = /readonly\s+(\w+)\s*[?]?\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]!);
  return out;
}

const SOURCE = executableSource(readFileSync(MODULE, 'utf8'));

/** What a caller must never be able to hand a transport surface. */
const FORBIDDEN_PARAMETERS = [
  'url',
  'uri',
  'endpoint',
  'host',
  'hostname',
  'port',
  'address',
  'origin',
  'target',
  'credential',
  'secret',
  'token',
  'header',
  // The escape-hatch family, carried over from the N6 gate unchanged. An option that disables the
  // destination binding would be a caller asserting a destination, which is the same class of
  // thing as passing one.
  'override',
  'ignore',
  'trust',
  'skip',
  'bypass',
  'force',
] as const;

describe('no N7 surface accepts a caller-supplied endpoint', () => {
  const signatures = exportedSignatures(SOURCE);
  const names = [...signatures.flatMap((s) => parameterNames(s)), ...objectPropertyNames(SOURCE)];

  it('exports functions and binds parameters at all — else the gate is vacuous', () => {
    // Every assertion below is "no parameter is named X", which an empty parameter list satisfies
    // perfectly. This is what stops the gate from silently becoming a no-op if the module is
    // refactored into a class or an object literal.
    expect(signatures.length, 'no exported function signatures found').toBeGreaterThanOrEqual(4);
    expect(names.length, 'no parameter names found').toBeGreaterThanOrEqual(6);
  });

  for (const forbidden of FORBIDDEN_PARAMETERS) {
    it(`binds no \`${forbidden}\` parameter or property`, () => {
      const offending = names.filter((n) => n.toLowerCase().includes(forbidden));
      expect(offending, `named after ${forbidden}: ${offending.join(', ')}`).toEqual([]);
    });
  }

  it('names the real parameters, so the absences above are about this module', () => {
    // The module's actual surface: attempt numbers, counts, timestamps, an outcome, a random
    // source. None of them is a destination, and the gate therefore costs nothing until somebody
    // adds one.
    const lower = names.map((n) => n.toLowerCase());
    for (const expected of ['outcome', 'attemptnumber', 'attemptcount', 'createdat', 'now']) {
      expect(lower, `the module no longer binds ${expected}`).toContain(expected);
    }
  });

  it('imports nothing that could resolve or reach an address', () => {
    // A module that took no endpoint parameter but imported `node:dns` would satisfy every
    // assertion above while being exactly what they exist to prevent.
    for (const forbidden of [
      'node:http',
      'node:https',
      'node:net',
      'node:tls',
      'node:dns',
      'undici',
      'axios',
      'node-fetch',
      'got',
    ]) {
      expect(SOURCE, `imports ${forbidden}`).not.toContain(forbidden);
    }
    expect(SOURCE).not.toMatch(/\bfetch\s*\(/);
  });

  it('derives the retry policy from N6 rather than restating it — OR-09', () => {
    // The source form of the derivation. Two constants with the same value drift the moment one is
    // tuned; an import cannot. Asserted here as well as behaviourally, because the behavioural
    // test would still pass if someone replaced the import with a literal that happens to match
    // today.
    expect(SOURCE).toContain("from './disclosure-delivery.ts'");
    expect(SOURCE).toMatch(/TRANSPORT_MAX_ATTEMPTS\s*=\s*DELIVERY_MAX_ATTEMPTS/);
    expect(SOURCE).toMatch(/TRANSPORT_MAX_AGE_MS\s*=\s*DELIVERY_MAX_AGE_MS/);
    // And no literal restatement of the ruled numbers anywhere in the module.
    expect(SOURCE).not.toMatch(/=\s*6\s*;/);
    expect(SOURCE).not.toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
});
