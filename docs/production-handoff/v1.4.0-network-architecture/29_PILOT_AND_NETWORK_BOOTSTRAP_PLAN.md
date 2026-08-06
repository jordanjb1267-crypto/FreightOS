# 29 — Pilot and Network Bootstrap Plan

## 1. Pilot selection criteria

Choose a workflow with:

- frequent pain;
- measurable economic/operational outcome;
- two or more participant types;
- available evidence;
- bounded legal risk;
- reversible rollout;
- existing application entry point;
- realistic known partners.

## 2. Recommended first pilots

### Option A — Facility arrival, dwell, and detention

Participants: driver/carrier, facility, shipper/broker. Produces high-value timeline, evidence, exception, and settlement data.

### Option B — Roadside service coordination

Participants: driver/fleet, provider, dispatcher, optionally shipper/broker. Exercises real-time command, approval, location, evidence, and mission-replanning.

### Option C — Shipment execution and document reconciliation

Participants: carrier, broker/shipper, facility. Exercises tender, assignment, milestones, POD, charges, invoice truth.

## 3. Pilot stages

1. internal synthetic workflow;
2. shadow mode using real but non-authoritative data;
3. one known counterparty in sandbox;
4. production read/observe;
5. reversible low-risk commands;
6. expanded volume with error budget;
7. second participant/system implementation proving interoperability.

## 4. Success metrics

- event completeness and latency;
- duplicate/gap rate;
- time saved;
- exception detection and resolution;
- economic recovery or avoided cost;
- partner integration effort;
- user trust and override rate;
- security/privacy incidents;
- reconciliation accuracy;
- repeat usage.

## 5. Network proof

A pilot proves network architecture only when at least two independently implemented endpoints exchange the same canonical workflow without private database coupling.

## 6. Stop conditions

Pause or roll back for cross-tenant exposure, incorrect authority, unreconciled duplicate side effects, unacceptable data drift, unresolved critical security finding, or user operations being materially impaired.
