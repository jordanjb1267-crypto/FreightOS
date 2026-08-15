# 15 — Integration and Counterparty Adoption Strategy

## Three participation levels

### Level 1 — External
Email/link/EDI/API interaction.
No native FreightOS product required.

### Level 2 — Connected
Verified participant identity + integrations + network events.

### Level 3 — Native
Operational Twin + Agent Organization + native FreightOS application.

## Migration path

```text
External Counterparty
→ sees lower-friction FreightOS interactions
→ connects API/EDI
→ gains participant identity/history
→ adopts native automation when value is clear
```

## Why this matters

The network should not require simultaneous multi-sided adoption.

A brokerage customer can create immediate value while communicating with non-native carriers/facilities.

A carrier customer can create immediate value while interacting with legacy brokers/facilities.

## Adapter doctrine

Adapters translate to canonical protocol.
Do not fork business logic into every connector.

## Conformance

Before production write:
- auth
- mappings
- duplicates
- ordering
- retries
- idempotency
- reconciliation
- revocation
- schema/version
must pass.
