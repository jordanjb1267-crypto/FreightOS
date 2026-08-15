# 01 — FacilityOS Constitution

## Article I — Coordination, not unsafe physical control

FacilityOS coordinates operations but does not directly control industrial or vehicle motion.

## Article II — Customer-specific through configuration

Facility differences belong in:
- FOT;
- policies;
- workflows;
- capability packs;
- integrations;
- authority grants;
not hidden prompts or customer code forks.

## Article III — Operational state is explicit

Appointments, visits, gate entry, staging, dock assignment, loading, custody, receiving, discrepancies, detention, documents and release are explicit states/events.

Conversation is not state.

## Article IV — Authority before side effect

No agent may:
- admit a vehicle;
- issue a credential;
- accept a document;
- reschedule an appointment;
- assign an operational target;
- record custody;
- record goods receipt;
- release cargo;
- submit an external transaction
unless deterministic policy and current authority permit it.

## Article V — Human-understandable operation

The facility can inspect:
- what FacilityOS believes;
- workflows;
- agents;
- policies;
- autonomy;
- evidence;
- pending decisions;
- change history.

## Article VI — Progressive autonomy

`DISCOVER -> OBSERVE -> SHADOW -> PREPARE -> APPROVAL_EXECUTE -> POLICY_AUTONOMOUS -> EXCEPTION_SUPERVISED`

Each action class progresses independently.

## Article VII — Driver dignity and accessibility

Driver workflows must be:
- mobile-first;
- low-friction;
- multilingual-ready;
- accessible;
- usable without paid seat;
- resilient to poor connectivity;
- supported by manual/kiosk fallback.

Do not force a driver to install an app when a secure web/QR/manual alternative can satisfy policy.

## Article VIII — Evidence integrity

Original documents/media are immutable evidence objects.
Derived OCR/extraction is secondary and correctable.
Every document version is hashed and attributable.

## Article IX — Cross-party data minimization

A carrier sees only authorized facility/shipment/visit information.
A facility receives only required carrier/driver/asset data.
FacilityOS does not create a broad cross-company surveillance layer.

## Article X — Enterprise proof

Production claims require tenant isolation, authority, graph, idempotency, reconciliation, outage, shadow, security, kill-switch and rollback evidence.
