import { describe, expect, it } from 'vitest';

import {
  DELIVERY_MAX_AGE_MS,
  DELIVERY_MAX_ATTEMPTS,
  nextAttemptDelayMs,
} from '../../src/disclosure-delivery.ts';
import {
  TRANSPORT_MAX_AGE_MS,
  TRANSPORT_MAX_ATTEMPTS,
  nextTransportAttemptDelayMs,
  nextTransportState,
  outcomeSemantics,
  spendsAttempt,
  transportRetryBudgetExhausted,
  type ExternalTransportAttemptOutcome,
} from '../../src/external-transport.ts';

/**
 * N7-A §32 — the transport retry policy and the outcome taxonomy.
 *
 * The taxonomy is where the security content is. Two of its fourteen values are refusals FreightOS
 * makes about itself rather than failures a remote host caused, and both of them are places where
 * an obvious-looking implementation loses data or hides a decision.
 */

const ALL_OUTCOMES: ExternalTransportAttemptOutcome[] = [
  'accepted',
  'configuration_invalid',
  'destination_disabled',
  'egress_disabled',
  'authorization_withdrawn',
  'authentication_failed',
  'address_rejected',
  'connection_failed',
  'timeout',
  'rate_limited',
  'remote_rejected_retryable',
  'remote_rejected_terminal',
  'protocol_invalid',
  'internal_error',
];

const createdAt = new Date('2026-05-01T00:00:00.000Z');
const soon = new Date('2026-05-01T00:05:00.000Z');
const muchLater = new Date('2026-05-03T00:00:00.000Z');

describe('the retry policy mirrors N6 by derivation, not by coincidence — OR-09', () => {
  it('is the SAME constant, so the two cannot drift when one is tuned', () => {
    expect(TRANSPORT_MAX_ATTEMPTS).toBe(DELIVERY_MAX_ATTEMPTS);
    expect(TRANSPORT_MAX_AGE_MS).toBe(DELIVERY_MAX_AGE_MS);
    // The ruled values, so "they agree" is not satisfied by both being wrong together.
    expect(TRANSPORT_MAX_ATTEMPTS).toBe(6);
    expect(TRANSPORT_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('produces the identical schedule for the identical randomness', () => {
    // Full jitter means the delay is random in [0, cap); pinning `random` is what makes it
    // comparable at all. Equality across the whole range proves delegation rather than a
    // reimplementation that happens to agree at attempt 1.
    for (const r of [0, 0.25, 0.5, 0.999]) {
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        expect(nextTransportAttemptDelayMs(attempt, () => r)).toBe(
          nextAttemptDelayMs(attempt, () => r),
        );
      }
    }
  });

  it('doubles from thirty seconds and caps at thirty minutes, with full jitter', () => {
    const atMax = (attempt: number): number => nextTransportAttemptDelayMs(attempt, () => 0.999999);
    expect(atMax(1)).toBeLessThan(30_000);
    expect(atMax(1)).toBeGreaterThan(29_900);
    expect(atMax(2)).toBeGreaterThan(59_900);
    // Capped, and it stays capped however many attempts are asked about.
    expect(atMax(7)).toBeLessThan(30 * 60 * 1000);
    expect(atMax(20)).toBeLessThan(30 * 60 * 1000);
    expect(atMax(20)).toBeGreaterThan(29 * 60 * 1000);
    // FULL jitter, not equal jitter: the floor is zero, not half the window.
    expect(nextTransportAttemptDelayMs(5, () => 0)).toBe(0);
  });

  it('exhausts on attempts OR age, whichever comes first', () => {
    expect(transportRetryBudgetExhausted(5, createdAt, soon)).toBe(false);
    expect(transportRetryBudgetExhausted(6, createdAt, soon)).toBe(true);
    // Age alone is enough. An obligation that has been retried twice over two days is stale even
    // though four attempts remain — the counterparty's view of that shipment has moved on.
    expect(transportRetryBudgetExhausted(2, createdAt, muchLater)).toBe(true);
  });
});

describe('the outcome taxonomy separates what we did from what happened', () => {
  it('classifies every one of the fourteen values, with no default', () => {
    // A missing entry would surface as `undefined` at runtime and as a silent "not terminal, not
    // retryable" — the most dangerous possible default for a transport decision.
    for (const outcome of ALL_OUTCOMES) {
      expect(outcomeSemantics(outcome), `${outcome} has no classification`).toBeDefined();
      expect(typeof outcomeSemantics(outcome).spendsAttempt).toBe('boolean');
    }
    expect(ALL_OUTCOMES).toHaveLength(14);
  });

  it('spends an attempt only when something actually left the building', () => {
    // The five outcomes decided locally: nothing was sent, so nothing is charged. Under a
    // one-axis model these would each have had to be misfiled as either a failure or a success.
    for (const outcome of [
      'configuration_invalid',
      'destination_disabled',
      'egress_disabled',
      'authorization_withdrawn',
      'address_rejected',
    ] as const) {
      expect(spendsAttempt(outcome), `${outcome} charged the retry budget`).toBe(false);
    }
    // And the nine that did reach out, including `internal_error` — we cannot tell how far the
    // request got, and assuming it reached nobody is how a caller ends up sending twice.
    for (const outcome of [
      'accepted',
      'authentication_failed',
      'connection_failed',
      'timeout',
      'rate_limited',
      'remote_rejected_retryable',
      'remote_rejected_terminal',
      'protocol_invalid',
      'internal_error',
    ] as const) {
      expect(spendsAttempt(outcome), `${outcome} did not charge the retry budget`).toBe(true);
    }
  });

  it('leaves an obligation UNTOUCHED when egress is switched off — the kill-switch case', () => {
    // THE ONE THAT WOULD LOSE DATA IF GOT WRONG. `egress_disabled` is an operational pause we
    // chose. Terminating here would convert a reversible pause into permanent loss, because OR-10
    // forbids recreating the obligation once it is terminal — so nothing could bring it back.
    for (const current of ['pending', 'failed_retryable'] as const) {
      expect(
        nextTransportState({
          current,
          outcome: 'egress_disabled',
          attemptCount: 3,
          createdAt,
          now: soon,
        }),
      ).toBe(current);
    }
  });

  it('TERMINATES an obligation whose authorization was withdrawn, without spending an attempt', () => {
    // The complement, and the reason one axis was not enough: this also sends nothing, and it also
    // must not be retried — N5-A revocation is append-only and `effective_until` only moves
    // forward, so withdrawn authority never returns. Left pending, the obligation would be owed
    // forever against permission that no longer exists.
    expect(spendsAttempt('authorization_withdrawn')).toBe(false);
    expect(
      nextTransportState({
        current: 'pending',
        outcome: 'authorization_withdrawn',
        attemptCount: 0,
        createdAt,
        now: soon,
      }),
    ).toBe('terminated_unauthorized');
  });

  it('routes each terminal outcome to the state that names its cause', () => {
    // `terminated_failed` for everything would be true and useless: an operator must be able to
    // tell "they revoked the destination" from "our credential is wrong" without reading a log.
    const cases: [ExternalTransportAttemptOutcome, string][] = [
      ['accepted', 'accepted'],
      ['configuration_invalid', 'terminated_failed'],
      ['destination_disabled', 'terminated_destination_disabled'],
      ['authorization_withdrawn', 'terminated_unauthorized'],
      ['authentication_failed', 'terminated_failed'],
      ['address_rejected', 'terminated_failed'],
      ['remote_rejected_terminal', 'terminated_failed'],
      ['protocol_invalid', 'terminated_failed'],
    ];
    for (const [outcome, expected] of cases) {
      expect(
        nextTransportState({
          current: 'pending',
          outcome,
          attemptCount: 1,
          createdAt,
          now: soon,
        }),
        `${outcome} resolved to the wrong state`,
      ).toBe(expected);
    }
    // Non-vacuity: the mapping really does distinguish, rather than returning one value.
    expect(new Set(cases.map(([, s]) => s)).size).toBe(4);
  });

  it('retries a retryable outcome while budget remains and terminates when it runs out', () => {
    const retryable = (attemptCount: number, now: Date): string =>
      nextTransportState({
        current: 'pending',
        outcome: 'timeout',
        attemptCount,
        createdAt,
        now,
      });

    expect(retryable(1, soon)).toBe('failed_retryable');
    expect(retryable(5, soon)).toBe('failed_retryable');
    // Exhaustion TERMINATES rather than parking. A permanently `failed_retryable` obligation is
    // indistinguishable from one still being worked.
    expect(retryable(6, soon)).toBe('terminated_failed');
    expect(retryable(1, muchLater)).toBe('terminated_failed');
  });

  it('cannot be pushed over budget by an outcome that spent nothing', () => {
    // The two axes composed. At five spent attempts an `egress_disabled` leaves the count at five
    // and the obligation pending; a `timeout` would take it to six and terminate it. If a refusal
    // we made ourselves were charged, the kill switch would silently burn the budget.
    expect(spendsAttempt('egress_disabled')).toBe(false);
    expect(
      nextTransportState({
        current: 'pending',
        outcome: 'egress_disabled',
        attemptCount: 5,
        createdAt,
        now: soon,
      }),
    ).toBe('pending');
    expect(
      nextTransportState({
        current: 'pending',
        outcome: 'timeout',
        attemptCount: 6,
        createdAt,
        now: soon,
      }),
    ).toBe('terminated_failed');
  });
});
