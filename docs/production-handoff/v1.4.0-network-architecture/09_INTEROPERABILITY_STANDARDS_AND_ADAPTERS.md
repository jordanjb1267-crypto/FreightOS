# 09 — Interoperability Standards and Adapter Architecture

## 1. Strategy

FreightOS owns a canonical model but must map to external standards through versioned profiles. Adapters translate syntax and semantics; they do not silently invent missing facts.

## 2. Baseline standards

- **GS1 EPCIS/CBV:** supply-chain visibility event semantics and business context.
- **CloudEvents:** portable event envelope conventions.
- **AsyncAPI:** event-driven interface contracts.
- **OpenAPI:** HTTP API contracts.
- **DCSA standards:** ocean booking, bill of lading, track-and-trace, and platform interoperability profiles.
- **IATA ONE Record:** air-cargo logistics objects, APIs, and federated data-sharing concepts.
- **UN/CEFACT reference data models:** multimodal and buy-ship-pay semantic alignment.
- **EDI/X12 and EDIFACT:** legacy partner compatibility where required.
- **OIDC/OAuth and workload identity standards:** participant and system authentication/delegation.

## 3. Adapter rules

Every adapter declares:

- source and target versions;
- supported messages/objects/events;
- field and code mappings;
- semantic loss;
- defaults and prohibited inference;
- timezone/unit/currency behavior;
- identifier mapping;
- security and consent expectations;
- retry/idempotency behavior;
- conformance tests;
- deprecation status.

## 4. Anti-corruption layer

External schemas terminate at an adapter boundary. Core domain logic consumes canonical objects and events. Partner-specific quirks must not spread throughout the core.

## 5. Round-trip integrity

Where two-way interoperability is promised, tests must prove that supported fields survive canonical translation and return without unauthorized mutation or semantic drift.

## 6. Conformance claims

FreightOS may state:

- mapped;
- profile-compatible;
- partially conformant;
- conformant;
- certified by an external program.

These labels are not interchangeable. Evidence must support the exact claim.
