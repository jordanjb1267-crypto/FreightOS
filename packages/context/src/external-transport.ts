import {
  DELIVERY_MAX_AGE_MS,
  DELIVERY_MAX_ATTEMPTS,
  nextAttemptDelayMs,
  retryBudgetExhausted,
} from './disclosure-delivery.ts';

/**
 * N7-A — the transport retry policy and the attempt-outcome taxonomy.
 *
 * PURE DECISION LOGIC. Nothing in this module opens a socket, resolves a name, or knows what an
 * HTTP status code is. It answers two questions a future adapter will ask, neither of which
 * requires the adapter to exist: how long to wait before the next attempt, and what an outcome
 * means for the obligation.
 *
 * The vocabularies are the database's `app.network_external_transport_attempt_outcome` and
 * `app.network_external_transport_state`, and the unions below are checked against the catalog by
 * an integration test rather than kept in step by hand.
 */

/**
 * The closed taxonomy, in migration 0035's declaration order.
 *
 * Declared as a value and the type derived from it, rather than the other way round, so the list an
 * integration test compares against the catalog IS the list the exhaustive `Record` below is keyed
 * by. Two hand-maintained copies would agree until the day one of them was edited.
 */
export const TRANSPORT_ATTEMPT_OUTCOMES = [
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
] as const;

export type ExternalTransportAttemptOutcome = (typeof TRANSPORT_ATTEMPT_OUTCOMES)[number];

/** The obligation states migration 0035 declares, in declaration order. */
export const TRANSPORT_STATES = [
  'pending',
  'failed_retryable',
  'accepted',
  'terminated_failed',
  'terminated_unauthorized',
  'terminated_destination_disabled',
] as const;

export type ExternalTransportState = (typeof TRANSPORT_STATES)[number];

/**
 * TWO INDEPENDENT AXES, and keeping them independent is the point.
 *
 *   `spendsAttempt` — did we actually try to reach a remote host? Only a real external attempt may
 *   consume one of the obligation's six. Charging a refusal we made ourselves against the budget
 *   would let a kill switch quietly exhaust an obligation, so that when the switch went back on the
 *   obligation was already dead for a reason nobody could see in the ledger.
 *
 *   `resolves` — is the obligation finished, and how? Independent of the above, because the two
 *   genuinely come apart: `authorization_withdrawn` spends no attempt and ENDS the obligation,
 *   while `egress_disabled` spends no attempt and ends nothing.
 *
 * Collapsing them into one enum forced exactly one of those two cases to be wrong.
 */
export interface OutcomeSemantics {
  /** Did an external attempt actually occur? Only then may the retry budget be charged. */
  readonly spendsAttempt: boolean;
  /**
   * The terminal state this outcome forces, `'retry'` if the obligation should be attempted again
   * while budget remains, or `null` if the obligation is untouched.
   */
  readonly resolves:
    | 'accepted'
    | 'terminated_failed'
    | 'terminated_unauthorized'
    | 'terminated_destination_disabled'
    | 'retry'
    | null;
}

const SEMANTICS: Readonly<Record<ExternalTransportAttemptOutcome, OutcomeSemantics>> = {
  accepted: { spendsAttempt: true, resolves: 'accepted' },

  // OUR configuration is wrong, and we found out before reaching anyone. Retrying an invalid
  // destination produces the identical failure every time and buries the signal an operator needs
  // under six copies of it.
  configuration_invalid: { spendsAttempt: false, resolves: 'terminated_failed' },

  // The recipient revoked the destination. Discovered locally — the revocation row is right there —
  // so no attempt was made, and there is nowhere left to send.
  destination_disabled: { spendsAttempt: false, resolves: 'terminated_destination_disabled' },

  // THE KILL SWITCH. We chose not to send. No attempt, and NOTHING RESOLVED: the obligation is
  // still owed and must still be owed when egress is turned back on. An implementation that
  // terminated here would convert a reversible operational pause into permanent data loss, and
  // OR-10 forbids recreating the obligation afterwards — so the loss would be unrecoverable.
  egress_disabled: { spendsAttempt: false, resolves: null },

  // Reauthorization refused, so no permit was minted and nothing left the building. It spends no
  // attempt for that reason — and it is nonetheless TERMINAL, because N5-A revocation is
  // append-only and a grant's `effective_until` only moves forward. Authorization that has been
  // withdrawn does not come back; an obligation left pending against it would be owed forever.
  authorization_withdrawn: { spendsAttempt: false, resolves: 'terminated_unauthorized' },

  // Terminal, and deliberately so: retrying a rejected credential is how accounts get locked.
  authentication_failed: { spendsAttempt: true, resolves: 'terminated_failed' },

  // Refused by our own SSRF control set, not by a remote host. Retrying an address our own policy
  // forbids is retrying a decision, not an outage — and no packet was sent.
  address_rejected: { spendsAttempt: false, resolves: 'terminated_failed' },

  connection_failed: { spendsAttempt: true, resolves: 'retry' },
  timeout: { spendsAttempt: true, resolves: 'retry' },
  rate_limited: { spendsAttempt: true, resolves: 'retry' },
  remote_rejected_retryable: { spendsAttempt: true, resolves: 'retry' },

  // The counterparty said no in a way that will not change by repetition.
  remote_rejected_terminal: { spendsAttempt: true, resolves: 'terminated_failed' },

  // The response was not something this protocol version can interpret. A contract mismatch, and
  // re-sending produces the same malformed frame.
  protocol_invalid: { spendsAttempt: true, resolves: 'terminated_failed' },

  // Ours, and transient by assumption. It spends an attempt because we cannot tell how far the
  // request got — assuming it reached nobody is how a caller ends up sending twice.
  internal_error: { spendsAttempt: true, resolves: 'retry' },
};

export function outcomeSemantics(outcome: ExternalTransportAttemptOutcome): OutcomeSemantics {
  return SEMANTICS[outcome];
}

/** Does this outcome consume one of the obligation's six attempts? */
export function spendsAttempt(outcome: ExternalTransportAttemptOutcome): boolean {
  return SEMANTICS[outcome].spendsAttempt;
}

/**
 * THE RETRY POLICY, DERIVED RATHER THAN RESTATED — OR-09.
 *
 * The ruling is "mirror N6", and its stated rationale is that a second, different retry policy in
 * an adjacent phase is a thing that will drift. Two constants with the same value today drift the
 * moment one of them is tuned; an assignment cannot. So these are N6's constants under N7's names,
 * and `nextTransportAttemptDelayMs` calls N6's function rather than reimplementing the same
 * doubling-with-full-jitter schedule beside it.
 *
 * Six attempts, twenty-four hours, thirty seconds doubling to a thirty-minute cap, full jitter.
 * Exhaustion TERMINATES the obligation rather than parking it — a transport that is owed forever is
 * an operational lie, and OR-10 forbids resurrecting it.
 */
export const TRANSPORT_MAX_ATTEMPTS = DELIVERY_MAX_ATTEMPTS;
export const TRANSPORT_MAX_AGE_MS = DELIVERY_MAX_AGE_MS;

export function nextTransportAttemptDelayMs(attemptNumber: number, random: () => number): number {
  return nextAttemptDelayMs(attemptNumber, random);
}

export function transportRetryBudgetExhausted(
  attemptCount: number,
  createdAt: Date,
  now: Date,
): boolean {
  return retryBudgetExhausted(attemptCount, createdAt, now);
}

/**
 * The obligation's next state after one attempt.
 *
 * `attemptCount` is the obligation's count AFTER this outcome was applied — the value the
 * database's `attempt_count` will hold — so an outcome that spent nothing arrives with the count
 * unchanged and cannot push the obligation over its budget.
 */
export function nextTransportState(input: {
  readonly current: ExternalTransportState;
  readonly outcome: ExternalTransportAttemptOutcome;
  readonly attemptCount: number;
  readonly createdAt: Date;
  readonly now: Date;
}): ExternalTransportState {
  const { resolves } = SEMANTICS[input.outcome];

  if (resolves === null) return input.current;
  if (resolves !== 'retry') return resolves;

  // Retryable — but only while budget remains. Exhaustion is a TERMINATION, not a permanent
  // `failed_retryable`: an obligation that says "retryable" forever is one no operator can
  // distinguish from one that is genuinely still being worked.
  return transportRetryBudgetExhausted(input.attemptCount, input.createdAt, input.now)
    ? 'terminated_failed'
    : 'failed_retryable';
}
