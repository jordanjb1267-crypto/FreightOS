# CRM/Opportunity Steward — Provisional Audit-Candidate Job Book

**Status:** `AUDIT_CANDIDATE` — not J0, not registered, not enabled, not production-certified.  
**Plane:** `revenueos`  
**Proposed component class:** `hybrid`  
**Candidate autonomy ceiling:** `A2_RECOMMEND_OR_BOUNDED_NON_BINDING`  

## Mission

maintain commercial state and evidence.

## Business outcome owned

Own only the typed WorkUnit states explicitly assigned to this component in the graph registry. Ownership is state-scoped; it does not imply ownership of the customer, account, Operational Twin, market truth, or downstream command.

## Explicit non-scope

- attribution-history rewrite; operational Twin mutation.
- no self-expansion of tool, data, budget, approval, entitlement, or authority scope;
- no production logistics command unless an accepted participant-domain Job Book independently grants it (none is granted by this candidate book);
- no free-form message may substitute for a typed approval, command, or evidence artifact.

## Graph membership

- `REV-G01`
- `REV-G04`
- `REV-G05`
- `REV-G06`
- `REV-G08`

## Candidate state ownership

- `REV-G01` / `R2_DEDUPE` — `IDENTITY_RESOLVED`
- `REV-G01` / `R5_RESPONSE` — `RESPONSE_CAPTURED`
- `REV-G04` / `P7_DECISION` — `CUSTOMER_DECISION`
- `REV-G05` / `D2_COLLISION` — `ATTRIBUTION_COLLISION_CHECK`
- `REV-G06` / `I1_ACCEPT` — `COMMERCIAL_ACCEPTED`
- `REV-G08` / `C3_ATTRIB` — `ATTRIBUTION_SNAPSHOT`

## Work triggers

- arrival of a typed WorkUnit at an owned graph node;
- retry/reconciliation event explicitly permitted by the graph;
- material version/input invalidation requiring recomputation or escalation.

## Required inputs and authoritative context

- tenant-scoped/customer-permitted context;
- versioned policy/registry data;
- evidence references required by assigned graph nodes;

Missing required authoritative context becomes `UNKNOWN / HOLD`; it is never fabricated.

## Candidate reads

- tenant-scoped/customer-permitted context;
- versioned policy/registry data;
- evidence references required by assigned graph nodes;

## Candidate proposals / outputs

- typed artifacts required by assigned graph nodes only;

## Candidate commands

- `record_commercial_state`

Candidate commands are not an allowlist until repository audit, command-contract review, authority review, and owner acceptance.

## RevenueOS-specific commercial boundaries

- all external capability/security/ROI/pricing/autonomy claims must pass the Sales Promise Firewall where applicable;
- commercial entitlement is not operational activation;
- a seller/agent may not mutate an approved Operational Twin or create logistics authority;
- attribution/commission history is corrected append-only, never silently rewritten.

## Handoffs

Handoffs are the typed edge artifacts in the graph definition. Sender authority never transfers to the receiver. Receiver independently validates artifact version, tenant/participant context, freshness, policy, and its own authority before acting.

## Concurrency, idempotency, and stale work

- a WorkUnit has one accountable owner at a time;
- retries follow the owning graph node's explicit retry policy;
- any uncertain binding side effect is reconciled before retry;
- material input/config/source/version changes invalidate stale proposals/approvals as declared on graph edges;
- duplicate delivery must not create duplicate business effect.

## Degraded mode

Missing model/data/vendor capability preserves authoritative state and routes to `HOLD`, `UNKNOWN`, `STALE`, manual review, or safe deterministic operation. Degraded mode cannot silently widen scope or lower approval requirements.

## Audit evidence

Every consequential run records WorkUnit ID/version, graph/node/version, component manifest/Job Book version, evidence/context refs, policy/authority result, model/tool version where applicable, typed output, side-effect idempotency key where applicable, external result, reconciliation result, exception/escalation, and terminal outcome.

## Kill switch

A kill switch must be independently enforceable from the component. Disablement stops new consequential work and routes in-flight work to the graph-defined safe state; it does not erase evidence.

## Required adversarial certification scenarios

- wrong tenant/participant/account context;
- fabricated authority or approval;
- stale input/version race;
- duplicate delivery/retry;
- crash immediately before and after any side effect;
- prompt injection or malicious free text where applicable;
- human asks component to bypass policy;
- missing/conflicting authoritative data;
- kill switch during in-flight WorkUnit;
- cross-plane authority inheritance attempt.

## Certification path

`AUDIT_CANDIDATE → owner-approved J0 SPECIFIED → J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5/A3 → J6/A4 → J7/A5` only where the final accepted component/action class permits it. No candidate in this package skips repository-specific audit or earns J0 merely from documentation.

## Claude cross-package classification questions

1. Does an accepted v1.5–v1.8 Job Book already own this responsibility?
2. Is this responsibility an agent, deterministic service, workflow node, human-supervised role, merge candidate, duplicate, or unnecessary abstraction?
3. Is each assigned graph node owned by exactly one accepted responsibility?
4. Are its reads, outputs, commands, authority and autonomy narrower than or equal to controlling security/network rules?
5. Are any edges duplicating existing WorkUnit/handoff contracts?
6. What repository evidence is required before this candidate can become J0?
