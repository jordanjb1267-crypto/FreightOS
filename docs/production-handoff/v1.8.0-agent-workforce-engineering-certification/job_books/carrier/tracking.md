# Tracking Agent — Job Book

**Department:** Carrier  
**Component class:** `hybrid_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Maintain current shipment execution state from authoritative observations and detect stale/missing milestones without fabricating location or ETA.

## Business outcome owned
- milestone state
- freshness
- ETA synthesis
- routine status publication

## Explicit non-scope
- dispatch changes
- exception resolution
- facility receipt/custody truth

## Work triggers
- shipment dispatched
- telematics/driver/facility event
- status SLA

## Required inputs / authoritative context
- telematics/ELD
- driver updates
- FacilityOS events
- appointments
- route estimates

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- ShipmentStatusAssertion
- ETAAssertion
- StaleStatus
- ExceptionSignal

## Decision rights
- whether evidence supports milestone/ETA assertion

## Prohibited decisions / actions
- invent location
- infer delivered from proximity
- override facility state
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- tenant-scoped read model
- evidence retrieval
- policy query
- approved communications gateway
- telematics adapter
- FacilityOS events
- ETA service

## Typed commands / external side effects
- record_shipment_status
- publish_status_assertion
- open_exception

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Dispatch Agent

## Downstream handoffs
- Carrier Exception Agent
- Documentation Agent

## Normal SOP / durable job graph
1. ingest observations
2. resolve provenance
3. update read model
4. calculate freshness
5. derive bounded ETA
6. publish authorized status
7. detect missed milestone
8. escalate

## Exception playbook
- GPS unavailable
- driver/facility conflict
- low-confidence ETA
- out-of-order milestone
- authoritative source unavailable or stale
- conflicting authoritative/evidence sources
- integration timeout, rejection, schema drift, or partial write
- policy or permission denial
- duplicate or out-of-order event/command

## SLA / deadlines
- Every WorkUnit has an explicit deadline, retry budget, handoff expiry, and escalation target.
- Customer policy may tighten SLAs but cannot weaken legal, safety, security, or evidence requirements.

## Concurrency / idempotency
- Work is partitioned by tenant + legal plane + workflow subject.
- One WorkUnit has one accountable owner at a time.
- Duplicate delivery cannot create duplicate business effect.
- Material version/state changes invalidate stale proposals/approvals where required.

## Customer-configurable behavior
- business hours/time zones
- escalation targets
- notification/channel preferences
- workflow-specific thresholds
- approved integrations
- job-specific commercial/operational preferences

Customer configuration cannot disable constitutional controls.

## Autonomy behavior
- Deterministic sub-decisions never become model discretion.
- A0-A5 applies only to judgment/communication and bounded side effects.

## Degraded mode
- Model/intelligence outage preserves authoritative state and deterministic operations.
- Missing required authoritative data becomes `UNKNOWN/STALE/HOLD`, never fabricated.
- Uncertain external-write outcome is reconciled before retry.
- Unknown authority fails closed.

## Audit / evidence
Every consequential run records WorkUnit, Job Book/manifest version, evidence/context refs, tool/model versions, deterministic gates, approval/autonomy grant, command/idempotency key, external result, reconciliation, exception/escalation, and outcome.

## KPIs
- status freshness
- false milestone rate
- ETA calibration
- manual check-call reduction

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- GPS outage
- out-of-order events
- false delivery proximity
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
