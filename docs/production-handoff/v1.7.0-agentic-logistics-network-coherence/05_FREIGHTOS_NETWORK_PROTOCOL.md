# 05 — FreightOS Agentic Logistics Protocol

## Purpose

The protocol is the shared language between:
- FreightOS-native agents;
- external systems;
- partner applications;
- EDI/API adapters.

## Artifact classes

### Observation
"I observed X."

### Assertion
"Participant states X with provenance."

### Request
"Please perform/consider X."

### Proposal
"I propose X."

### Commercial Offer
"Here are exact commercial terms."

### Approval
"Authorized actor approves exact version/scope."

### Command
"Execute this authorized bounded action."

### Result
"External/business action returned X."

### Event
"Material state transition occurred."

### Evidence Envelope
"These artifacts support the state."

### Correction / Dispute
"Previous assertion/event is contested/corrected."

## Core protocol fields

- message ID/version
- tenant/participant
- legal plane
- sender identity
- represented organization
- recipient/capability
- logistics object refs
- correlation/causation
- timestamp
- expiry
- policy/evidence refs
- schema version
- idempotency key where command
- signature/auth proof as required.

## Meaning before transport

The same semantic artifact may travel via:
- native API;
- event bus;
- webhook;
- EDI;
- MCP;
- partner API;
- email/document adapter.

Transport does not define business semantics.

## Example

Carrier delay:

```text
Observation: predicted delay
→ ShipmentEvent proposal
→ authoritative carrier status event
→ FreightOS propagates impacted commitment
→ FacilityOS evaluates appointment
→ Broker/Shipper receives authorized exception
```

No party needs access to another party's full internal state.
