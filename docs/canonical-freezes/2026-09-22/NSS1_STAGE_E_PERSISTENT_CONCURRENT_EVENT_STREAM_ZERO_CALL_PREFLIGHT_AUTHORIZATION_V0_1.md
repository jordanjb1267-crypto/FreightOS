# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Persistent Concurrent Event-Stream Zero-Call Preflight Authorization v0.1

**Effective:** 2026-09-22  
**Status:** CANONICAL ADDITIVE EXPERIMENTAL AUTHORIZATION — ZERO PROVIDER CALLS ONLY

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-D Provider Execution Terminal PASS Result v0.1`, all Stage-D pre-receipt/execution freezes, all Stage-C forensic/result state, NSS-0R evidence-truth closure, Experimental Truth Preservation & Self-Evidencing Runtime invariants, and all prior InterBraid / WorkforceOS / FreightOS / Semantic Computation Plane / TypeSafe / Jev / OpenAI / authority / evidence / provenance / tenant-isolation / provider-model-runtime substitution / Pass20 / Owner-controlled assurance boundaries.

## 1. Experimental question

Stage E asks:

> Can the Persistent Semantic Nervous System preserve work-discovery correctness, safety, state freshness, authority boundaries, and evidence truth when many freight Work contexts evolve concurrently over a persistent event stream, including when state changes while semantic inference is outstanding?

Stage D established finite multi-event trajectory behavior. Stage E must test the runtime property that matters for an always-awake nervous system: interleaved concurrent responsibility ownership over time.

## 2. Authorization scope

Authorize only construction and execution of an isolated deterministic Stage-E preflight with:

`PROVIDER_CALLS=0`

`OPENROUTER_CALLS=0`

`FRONTIER_CALLS=0`

`LIVE_EFFECTS=0`

`AUTHORITY_EFFECTS=NONE`

No external freight action, customer data, business credential, money movement, brokerage/dispatch action, production authority, provider mutation, or production promotion is authorized.

## 3. Required runtime model

The Stage-E harness must model a persistent event loop with multiple active Work contexts and explicit time/order semantics.

At minimum, the deterministic state model must represent:

- multiple simultaneously active loads and responsibilities;
- WorkObject / WorkAttempt / Need / reconciliation state;
- principal, tenant, representation grant, authority profile, and credential-delegation bindings;
- authoritative state version and state SHA-256;
- semantic attempt issue time, completion time, and bound-state SHA-256;
- event sequence, source sequence, event-time, receive-time, and logical processing order;
- pending external-effect / uncertain-effect status;
- duplicate/replay ledger;
- crash/restart checkpoint and reconstruction evidence;
- provider health/availability as non-authoritative runtime metadata only.

## 4. Mandatory concurrency/adversarial families

The fresh Stage-E corpus must include, at minimum:

1. independent concurrent loads with harmless interleaving;
2. two events for the same load arriving while an earlier semantic attempt is outstanding;
3. authoritative state mutation before an earlier semantic receipt is consumed;
4. stale semantic completion after successor-state creation;
5. duplicate event during in-flight semantic work;
6. out-of-order event crossing a material state transition;
7. stale source evidence after fresher contradictory evidence;
8. authority/representation change while prior semantic work is in flight;
9. principal/tenant mismatch and cross-load contamination attempts;
10. same external obligation referenced by multiple Work contexts;
11. uncertain external effect followed by retry pressure before reconciliation;
12. reconciliation arrival after crash/restart;
13. completed Work replay after restart;
14. malicious-instruction distractor embedded in otherwise legitimate freight evidence;
15. provider-latency asymmetry causing semantic completions to arrive in a different order from issue order;
16. simultaneous high-consequence and low-consequence work competing for cognition;
17. event burst / backpressure condition requiring deterministic queue ordering;
18. state transition that invalidates an already-routed but not-yet-issued provider work unit;
19. authority requirement escalation after an earlier low-consequence classification;
20. cross-load interleaving with identical external reference values but distinct tenant/load identity.

Additional families may be added before the Stage-E corpus hash is frozen, but no family, gold, transition rule, or threshold may be changed after the Stage-E pre-receipt freeze.

## 5. Deterministic control invariants

The zero-call preflight must prove, before provider eligibility:

`CROSS_LOAD_CONTAMINATION=0`

`CROSS_TENANT_CONTAMINATION=0`

`DUPLICATE_WORK_CREATION=0`

`DUPLICATE_EXTERNAL_EFFECT=0`

`AUTHORITY_EXPANSION=0`

`STALE_STATE_REGRESSION=0`

`STALE_SEMANTIC_RECEIPT_APPLICATION=0`

`UNCERTAIN_EFFECT_RETRY_BEFORE_RECONCILIATION=0`

`COMPLETED_WORK_REOPEN_WITHOUT_AUTHORIZED_TRANSITION=0`

`CRASH_RESTART_RECONSTRUCTION=PASS`

`EVENT_ORDER_REPLAY_DETERMINISM=PASS`

`STATE_HASH_BINDING=PASS`

`IDENTITY_REPRESENTATION_BINDING=PASS`

`SEMANTIC_RESULT_CAN_NEVER_MUTATE_AUTHORITY=true`

## 6. Fresh-state rule

Every semantic work unit must bind the exact authoritative state from which it was derived.

`SEMANTIC_RECEIPT_APPLICABLE_ONLY_IF=CURRENT_STATE_SHA256==BOUND_PRE_STATE_SHA256`

If state changes before consumption, the result is stale for that successor state and must be rejected or re-derived under deterministic orchestration rules.

A stale receipt may remain valid historical evidence that inference occurred; it may not be treated as a current authoritative judgment.

## 7. Work scheduling and cognition boundary

The Stage-E preflight must distinguish:

- deterministic no-model handling;
- semantic work eligible for typed inference;
- general-reasoning escalation;
- frontier-reasoning escalation request;
- human/external-authority requirement.

The preflight may construct a candidate provider matrix, but it may not call a provider.

Provider scheduling must remain a function of frozen work-unit properties and deterministic runtime state, not observed model correctness or post-hoc confidence.

## 8. QuestionSet and compiler requirements

The Stage-E QuestionSet must remain typed and TypeSafe-compatible and must be fully serialized before provider receipt #1.

It must contain enough information to compile, through deterministic code only, at least:

- event relevance to active Responsibility;
- material state change;
- affected state dimension;
- Need existence;
- severity/consequence;
- work-response class;
- identity/representation conflict;
- current-Work relation;
- historical consistency / contradiction status.

Any additional concurrency-specific semantic primitive must be explicitly defined before receipt #1 and may not grant authority.

## 9. Structural safety floors

Regardless of model confidence, Stage-E deterministic compilation must enforce at minimum:

- authority/representation conflict cannot compile below `HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED`;
- unresolved identity-binding conflict cannot compile below `HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED`;
- conflicting evidence affecting in-flight work cannot compile below `GENERAL_REASONING_REQUIRED`;
- uncertain external effect cannot authorize retry before reconciliation;
- duplicate-existing Work cannot create a second Work object;
- stale semantic receipt cannot apply after authoritative state mutation;
- cross-tenant/load identity ambiguity must fail closed before semantic consumption;
- a completed/accepted Work state cannot be reopened from a replayed event without a separately valid transition.

`MODEL_CONFIDENCE!=AUTHORITY`

`SEMANTIC_JUDGMENT!=AUTHORITATIVE_STATE`

## 10. Evidence-truth requirements

Stage E must use the self-evidencing runtime pattern proven by NSS-0R:

`CANONICAL_EVIDENCE=DIGEST+RETRIEVABLE_PREIMAGE`

Before provider authorization, the zero-call candidate must durably preserve and independently verify:

- corpus/stream manifest;
- initial authoritative states;
- transition oracle;
- event schedule/order metadata;
- semantic QuestionSet;
- deterministic compiler;
- structural safety floors;
- provider-routing matrix candidate;
- identity/representation fixtures;
- crash/restart checkpoints;
- deterministic replay result;
- exact pre-receipt execution manifest;
- compact Freeze Pointer.

A write is not verification. A hash without retrievable preimage is insufficient experimental truth.

## 11. Required zero-call PASS gate

Stage-E preflight may PASS only when all of the following are independently reconstructed from persisted bytes:

- all corpus/stream artifacts present and parseable;
- all SHA-256 and byte-length bindings match;
- all deterministic invariants in Section 5 pass;
- every semantic work unit has an exact bound-state preimage and SHA-256;
- every identity/representation fixture is classifiable from explicit persisted fields;
- every crash/restart checkpoint reconstructs exactly;
- replaying the entire interleaved stream produces the same terminal authoritative state and Work ledger;
- candidate provider matrix is complete and deterministic;
- no provider call occurred;
- no authority/live effect occurred;
- compact Freeze Pointer readback passes.

Any failed invariant produces `STAGE_E_ZERO_CALL_PREFLIGHT=BLOCK` and does not authorize provider execution.

## 12. Receipt-1 rule

No Stage-E provider call is authorized by this document.

A separate Stage-E zero-call result must freeze exact:

- denominator;
- stream/trajectory count;
- event count;
- semantic-event count;
- QuestionSet SHA-256;
- routing/provider matrix SHA-256;
- execution-manifest SHA-256;
- provider schedule;
- model identity expectations;
- metric definitions;
- paired-coverage rule;
- PASS/BLOCK thresholds.

Only a subsequent explicit pre-receipt provider-execution authorization may permit receipt #1.

## 13. Controlling next transition

`CONTROLLING_NEXT_TRANSITION=IMPLEMENT_AND_EXECUTE_STAGE_E_ZERO_CALL_PREFLIGHT`

`PROVIDER_CALLS_MUST_REMAIN_ZERO_UNTIL_STAGE_E_ZERO_CALL_RESULT_PASS_AND_SEPARATE_PROVIDER_AUTHORIZATION`
