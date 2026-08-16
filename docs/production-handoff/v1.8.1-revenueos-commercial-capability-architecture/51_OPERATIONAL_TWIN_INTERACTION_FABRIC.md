# 51 — Operational Twin Interaction Fabric

## Purpose

This additive audit-candidate standard closes the coexistence boundary between a participant's Operational Twin, its human workforce, its existing software estate, FreightOS agents/services, and the wider FreightOS network.

It does **not** require a customer to replace its TMS, WMS, YMS, ERP, ELD, telematics, maintenance, accounting, email, document, or other operational systems. It does not promote autonomy. Existing v1.3–v1.8 security, authority, network, workflow, Job Book, and certification rules remain controlling.

## North-star contract

The Operational Twin is the participant's governed semantic and operational coordination layer. It must be useful in all of these conditions:

1. human-led operation with FreightOS only observing;
2. human-led operation with FreightOS assisting/drafting;
3. mixed human + agent collaboration on shared WorkUnits;
4. selected actions executed only after explicit approval;
5. selected workflows operating under bounded autonomy;
6. legacy counterparties interacting through email/EDI/API/link/document channels;
7. connected counterparties exchanging canonical FreightOS network artifacts;
8. native counterparties coordinating through their own Twins and independently evaluated authority.

A customer may occupy different modes simultaneously by workflow. Example: autonomous document/status work, approval-gated dispatch, human-led pricing, and observe-only maintenance.

## The Twin is not automatically the system of record

For every material fact or command domain, the Twin SHALL know the declared authority relationship between FreightOS and external systems. The Twin may be:

- authoritative;
- a governed mirror of an external authoritative system;
- a derived projection;
- a holder of customer-approved configuration;
- a receiver of network assertions with provenance;
- a coordination layer spanning multiple systems.

No adapter may silently make FreightOS authoritative merely because it can read or write a field.

## Five interaction surfaces

```text
HUMAN WORKFORCE
      ↕
TWIN WORKBENCH / WORKUNITS
      ↕
PARTICIPANT OPERATIONAL TWIN
  ↙        ↓         ↘
AGENTS   SYSTEMS    NETWORK
         OF RECORD
```

The Twin must keep these surfaces separate enough to preserve authority and provenance while making them feel like one coherent operating environment to the customer.

## Internal state versus network state

Internal Twin state is never automatically a network publication. Network communication is a projection:

```text
Internal fact/work state
      ↓
disclosure + purpose + relationship policy
      ↓
canonical network artifact
      ↓
receiving participant independently authenticates/evaluates
      ↓
its own Twin / WorkUnit / authority plane
```

## Customer-understandable guarantees

The customer must be able to answer:

- What is FreightOS doing now?
- What is a person doing now?
- Which system is authoritative for this fact?
- What came from my TMS/WMS/etc.?
- What did FreightOS infer or propose?
- What changed and who approved it?
- What is waiting for my approval?
- What was sent to a counterparty?
- What did that counterparty actually acknowledge?
- What will happen if an integration is stale or unavailable?
- Which workflows are observe/assist/approval/autonomous today?

## Non-regression

This layer must not create:

- a shadow TMS/WMS/ERP;
- hidden customer-specific business logic inside adapters;
- hidden learned configuration;
- authority transfer through network messages;
- cross-tenant data leakage;
- duplicate side effects during sync/writeback;
- a requirement that all counterparties become FreightOS customers.
