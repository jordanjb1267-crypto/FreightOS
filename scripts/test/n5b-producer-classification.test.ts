import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The answer to "what stops N5-B from ever trusting a producer-supplied classification?".
 *
 * This is not a precaution against a hypothetical. TWO REGISTERED CONTRACTS already carry a
 * producer-controlled payload property named exactly `classification` — `evidence-envelope.v1` and
 * `event-envelope.v1` — and `network_events` carries an ungoverned column of the same name that N3
 * froze as authority-inert. An implementation that resolved sensitivity by looking for a field
 * called `classification` would compile, pass every behavioural test written against honest
 * fixtures, and hand the disclosure ceiling to whoever writes the event.
 *
 * The behavioural suites prove the CURRENT evaluator ignores those values. This proves the
 * evaluator cannot start reading them without a test failing, which is a different guarantee: a
 * behavioural test only covers the values it thinks to try.
 *
 * COMMENTS ARE STRIPPED FIRST. The module documents at length what it refuses to read, so a
 * comment-blind matcher would flag the file for saying the right thing.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EVALUATOR = 'packages/context/src/disclosure-sensitivity.ts';

/** Comments only — string literals are deliberately left alone, as in the lock-coverage gate. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

const evaluatorCode = (): string => stripComments(readFileSync(join(ROOT, EVALUATOR), 'utf8'));

/**
 * The shapes that would give an event producer control of the ceiling.
 *
 * Deliberately broader than `classification` alone: the same failure arrives under any name a
 * producer can write, so `sensitivity`, `visibility` and `shareability` read off a payload are
 * equally disqualifying.
 */
const FORBIDDEN: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'any mention of classification', pattern: /\bclassification\b/ },
  { label: 'a payload sensitivity claim', pattern: /\.\s*sensitivity\b/ },
  { label: 'a payload visibility claim', pattern: /\bvisibility\b/ },
  { label: 'a payload shareability claim', pattern: /\bshareab/i },
  {
    label: 'a dynamic property lookup for authority',
    pattern: /\[\s*['"`](classification|sensitivity|visibility|shareable)['"`]\s*\]/,
  },
  { label: 'reading the event payload at all', pattern: /\bevent\s*\.\s*data\b/ },
  { label: 'a caller-supplied override', pattern: /\boverride|force_disclose|ceiling_override\b/i },
];

describe('N5-B never derives sensitivity from anything a producer controls', () => {
  it('names no producer-controlled field anywhere in the evaluator', () => {
    const code = evaluatorCode();
    const found = FORBIDDEN.filter((f) => f.pattern.test(code)).map((f) => f.label);
    expect(
      found,
      `${EVALUATOR} references a producer-controlled field. Sensitivity must resolve from ` +
        'durable_schema_ref through governed metadata and from nothing else.',
    ).toEqual([]);
  });

  it('detects each forbidden shape in synthetic source — the detector works', () => {
    // ANTI-VACUITY. Without this, a stripper bug that blanked the file would leave the assertion
    // above passing over an empty string and reporting perfect compliance.
    const cases: readonly [string, string][] = [
      ['classification', 'const level = event.data.classification;'],
      ['sensitivity', 'const level = payload.sensitivity;'],
      ['visibility', 'if (envelope.visibility === "public") return permit;'],
      ['shareable', 'const ok = record.shareable;'],
      ['dynamic lookup', "const level = payload['classification'];"],
      ['payload read', 'const raw = event.data;'],
      ['override', 'if (grant.override_sensitivity) return permit;'],
    ];
    for (const [label, source] of cases) {
      const stripped = stripComments(source);
      expect(
        FORBIDDEN.some((f) => f.pattern.test(stripped)),
        `${label} was not detected`,
      ).toBe(true);
    }
  });

  it('does not flag the module for DOCUMENTING what it refuses to read', () => {
    // The other half of the control. The evaluator's header names every forbidden field on
    // purpose; a rule that fired on that would be deleted rather than fixed — R2-03.
    const documented = `
      /**
       * WHAT N5-B NEVER READS: network_events.classification, a payload classification field,
       * caller-supplied sensitivity, visibility or shareability.
       */
      const level = assignment.sensitivityCode;
    `;
    const stripped = stripComments(documented);
    expect(FORBIDDEN.some((f) => f.pattern.test(stripped))).toBe(false);
  });

  it('resolves sensitivity from the durable schema ref and the purpose alone', () => {
    // The positive statement of the same rule: the resolver's signature is the enforcement, because
    // a predicate cannot consult an argument it was never given.
    const code = evaluatorCode();
    expect(code).toMatch(
      /export function evaluateSensitivityCeiling\(\s*durableSchemaRef: string,\s*purposeCode: string,\s*metadata: SensitivityMetadata \| null,\s*\)/,
    );
  });

  it('keeps the governed metadata type free of any producer-supplied field', () => {
    // `SensitivityMetadata` is the only channel through which sensitivity can enter. If a payload
    // ever reaches the resolver, it reaches it through this type.
    const code = evaluatorCode();
    const block = /export interface SensitivityMetadata \{([\s\S]*?)\n\}/.exec(code)?.[1] ?? '';
    expect(block, 'SensitivityMetadata interface not found').not.toBe('');
    expect(
      block
        .trim()
        .split('\n')
        .map((l) =>
          l
            .trim()
            .replace(/^readonly\s+/, '')
            .split(':')[0]
            ?.trim(),
        )
        .sort(),
    ).toEqual(['assignments', 'purposeCeilings', 'sensitivities']);
  });

  it('leaves the N5-A evaluator entirely alone', () => {
    // N5-B composes with N5-A in a separate module. If this file ever starts importing internals
    // from `disclosure.ts` beyond its public types and entry point, composition has become
    // modification and the N5-A digest stops being independently replayable.
    const code = evaluatorCode();
    // `[^}]` rather than `[\s\S]`: a lazy any-char match would start at the FIRST import in the
    // file and swallow the `@freightos/schemas` block on its way here.
    const imported = /import \{([^}]*?)\} from '\.\/disclosure\.ts';/.exec(code)?.[1] ?? '';
    expect(imported, 'expected a single named import block from ./disclosure.ts').not.toBe('');
    const names = imported
      .split(',')
      .map((s) => s.replace(/\btype\b/, '').trim())
      .filter(Boolean)
      .sort();
    expect(names).toEqual([
      'DisclosureAllow',
      'DisclosureDecision',
      'DisclosureDenialReason',
      'DisclosureInput',
      'evaluateDisclosure',
    ]);
  });
});
