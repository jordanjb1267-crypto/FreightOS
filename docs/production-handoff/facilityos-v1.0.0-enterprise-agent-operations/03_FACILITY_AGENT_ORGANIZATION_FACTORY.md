# 03 — Facility Agent Organization Factory

## Factory inputs

- tenant/site
- FOT version
- enabled workflow packs
- integration bindings
- facility policies
- authority grants
- autonomy certifications
- operating calendar
- SLO tier.

## Core agent manifests

### Facility Operations Orchestrator
Coordinates graph routing; no blanket authority.

### Cargo/Order Readiness
Reads authoritative inventory/order readiness.

### Appointment
Schedules/recommends/reschedules inside policy.

### Carrier/Driver Coordination
Communicates authorized instructions/status.

### Gate
Prepares/verifies visit credentials and check-in state.

### Yard Orchestration
Recommends staging/queue targets, never physical motion.

### Dock
Coordinates dock readiness/assignment target.

### Shipping Office
Manages origin-office workflow and document readiness.

### Receiving Office
Manages destination-office workflow, receipt/discrepancy.

### Document/BOL
Ingests, correlates, extracts, validates and routes documents.

### Load/Unload Verification
Coordinates required evidence/checklist.

### Custody/Evidence
Proposes/records custody only through governed command.

### Detention
Runs clocks/evidence per contract/facility policy.

### Discrepancy
Manages shortage/overage/damage/rejection workflow.

### Capacity/Labor Planning
Forecasts/recommends; does not command workforce/industrial systems unless separately governed.

### Exception
Routes operational exceptions/escalations.

### Customer Communication
Sends governed notifications.

## Context

Agent task context is limited to:
- tenant/site;
- visit/shipment;
- relevant FOT subset;
- current system-of-record state;
- current workflow;
- authority/policy;
- evidence.

No broad tenant prompt.

## Agent communication

Typed:
- observation
- request
- proposal
- approval request
- command request
- result
- escalation.

Free-form agent chat is never execution authority.
