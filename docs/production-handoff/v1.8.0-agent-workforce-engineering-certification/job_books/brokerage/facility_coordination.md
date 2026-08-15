# Facility Coordination Agent — Job Book

**Department:** Brokerage  
**Component class:** `agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Coordinate brokerage-side appointments, readiness, BOL/POD, delay and facility exceptions through FreightOS/FacilityOS without owning facility state.

## Business outcome owned
- facility requests/changes
- cross-party appointment/document coordination

## Explicit non-scope
- gate admission
- dock authority
- custody/goods receipt

## Work triggers
- booking confirmed
- ETA change
- facility exception
- document requirement

## Required inputs / authoritative context
- FacilityOS state
- shipment requirements
- carrier ETA
- shipper commitments

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- FacilityRequest
- AppointmentCoordination
- FacilityExceptionImpact

## Decision rights
- how/when to request change inside authority

## Prohibited decisions / actions
- declare facility accepted/received without event
- override facility hold
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- FreightOS network
- FacilityOS adapter
- communications

## Typed commands / external side effects
- request_appointment
- request_facility_update

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Broker Shipment Execution Agent

## Downstream handoffs
- FacilityOS
- Tracking/Communication Agent

## Normal SOP / durable job graph
1. resolve facility endpoint
2. load appointment/requirements
3. request/coordinate
4. track response
5. propagate
6. open exception

## Exception playbook
- appointment unavailable
- BOL rejected
- facility not connected
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
- A0 observe; A1 recommend; A2 prepare; A3 exact approved execution; A4 policy-bounded certified execution; A5 routine exception-supervised execution.

## Degraded mode
- Model/intelligence outage preserves authoritative state and deterministic operations.
- Missing required authoritative data becomes `UNKNOWN/STALE/HOLD`, never fabricated.
- Uncertain external-write outcome is reconciled before retry.
- Unknown authority fails closed.

## Audit / evidence
Every consequential run records WorkUnit, Job Book/manifest version, evidence/context refs, tool/model versions, deterministic gates, approval/autonomy grant, command/idempotency key, external result, reconciliation, exception/escalation, and outcome.

## KPIs
- coordination latency
- manual calls avoided

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
