# ADR-0025 — Detention is a policy-driven mechanism with no built-in default

**Status:** Accepted (owner ruling, Phase 1)
**Date:** 2026-08-04
**Relates to:** `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md:84` (detention clock and evidence is a
permitted Horizon 1 facility primitive)

## Context

Detention is named three times in the preserved handoff and defined nowhere.
`07_DATA_MODEL_AND_STATE_MACHINES.md:75` and
`19_PHYSICAL_LOGISTICS_AND_AUTONOMOUS_MOBILITY.md:233` list `DetentionClock` as a required entity;
`21_…:84` authorizes "detention clock and evidence" as a Horizon 1 primitive;
`14_TEST_AND_ACCEPTANCE_STRATEGY.md:74` requires detention calculation tests. There is no state
machine, no free-time rule, no clock-start definition, and no rounding rule anywhere in the
package.

Free time is a **commercial term**, negotiated per shipper, receiver, facility, or contract. It is
not a technical constant, and FreightOS inventing one would be inventing a commercial term on a
customer's behalf — the same category of error that
`02_GOVERNANCE_AND_NON_REGRESSION.md:66` prohibits when it forbids replacing deterministic
calculators with model arithmetic, and that Constitution Art. VI.4 prohibits when it forbids agents
amending terms.

Deferring the mechanism until the rules arrive would leave the largest facility primitive
unbuilt and put an owner-side procurement on the Phase 1 critical path.

## Decision

Phase 1 implements the detention **mechanism** without an authoritative business default. The
mechanism is policy-driven, and the policy is data.

### Required policy fields

| Field | Notes |
| --- | --- |
| Policy identifier | Stable, referenced by every calculation |
| Tenant | Owner of the policy |
| Legal entity | The accountable entity |
| Facility or counterparty scope | Most specific applicable scope wins |
| Effective start and end | Effective-dated; overlapping scopes at one instant are rejected |
| Trigger event | Which recorded event starts the clock |
| Stop event | Which recorded event stops it |
| Free-time duration | **No default** |
| Time zone | IANA identifier; required — the arithmetic is wrong without it (ADR-0022) |
| Paused-time rules | Facility closure, carrier-caused delay, and their intervals |
| Rounding method | Explicit; never implicit |
| Evidence requirements | What must be present before a calculation is evidenced |
| Accessorial linkage | An opaque reference recording that an accessorial applies |
| Source | Where the rule came from |
| Provenance | How it was obtained and by whom |
| Authoritative status | `true` only for a real commercial rule |
| Version | Immutable once a calculation cites it |

### Binding behaviour

1. **No active detention policy means no detention clock may begin.**
2. The system returns an explicit `POLICY_REQUIRED` (or equivalent) **fail-closed** result. Not a
   zero duration, not a null, not a silently skipped clock.
3. **No code-level default free-time allowance is permitted.** There is no constant, no fallback,
   no configuration default, and no "reasonable" value.
4. Synthetic test fixtures may contain clearly labelled non-production values.
5. **Synthetic values must not be used as production defaults.** A fixture policy carries
   `authoritative: false`, and a calculation citing a non-authoritative policy is itself marked
   non-authoritative.
6. **Changing the applicable policy must not retroactively alter previously recorded
   calculations.** A new result requires a new versioned calculation. The prior calculation
   remains, with the policy version it actually used.
7. **Every calculation records** policy version, start event, stop event, rounding rule, actor,
   evidence, and resulting duration.

### Clock derivation

Start and stop are **derived from recorded events**, never entered directly:

- **Start** — the later of the committed appointment start and the vehicle-visit arrival, then
  offset by the policy's free-time duration.
- **Stop** — the earlier of service completion and departure.

Both reference the source event identifiers, so the derivation is reproducible from the ledger
rather than trusted from a stored number. This is what makes requirement 7 verifiable rather than
declarative.

### What detention does not do in Phase 1

It produces an **evidenced duration** and an accessorial *linkage point*. It computes no charge and
creates no billing artifact. Charge computation is a billing concern, billing is disabled
(`checklists/HORIZON_1_PRODUCTION_RELEASE_GATE.md`), and `scripts/validate-scope.mjs` asserts
`BILLING_DISABLED=PASS`.

### State machine

Proposed in `docs/plans/phase-1-definition-and-owner-decisions.md` §5.11 and reproduced in the
canonical glossary:

```text
NOT_STARTED → RUNNING ⇄ PAUSED → STOPPED → EVIDENCED → DISPUTED → RESOLVED
```

Terminal: `RESOLVED`, `VOIDED`. `NOT_STARTED → RUNNING` is the transition that returns
`POLICY_REQUIRED` when no policy applies.

## Consequences

**Good.** Detention-rule procurement leaves the Phase 1 critical path while FreightOS is prevented
from inventing commercial terms. The mechanism, its evidence model, its state machine, and its
tests can all be built and merged now. When real rules arrive they are data, not a code change.
Requirement 6 makes historical calculations reproducible, which is what a disputed detention claim
actually turns on.

**Cost.** A tenant with no configured policy gets no detention tracking at all. That is visible
and deliberate: `POLICY_REQUIRED` is a louder, more honest failure than a clock silently started
against an invented allowance, and it surfaces the missing rule to the person who can supply it.

**Test obligation.** `POLICY_REQUIRED` behaviour is one of the enumerated domain invariants
requiring 100% coverage in `docs/governance/ACCEPTANCE_THRESHOLDS.md`. A default that creeps in
later would make that test fail, which is the point.

**Outstanding owner deliverable, no longer blocking.** Real free-time rules remain OQ-4 in
`docs/governance/OPEN_QUESTIONS.md`. This ruling changes it from blocking PR 7 to blocking only
production detention *behaviour* for a given tenant.
