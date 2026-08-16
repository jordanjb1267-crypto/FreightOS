# 55 — Network Communication and Counterparty Interaction Standard

## Goal

Every participant Twin should communicate seamlessly with the broader FreightOS network while preserving each participant's independent authority, confidentiality, systems of record, and adoption level.

## Network participation remains asymmetric

A native FreightOS carrier can communicate with a broker using only EDI/email/API. A native facility can coordinate with a non-native driver. A connected shipper can exchange canonical events without adopting a native Twin. Network utility must not require simultaneous native adoption.

## Inbound network path

```text
network artifact
→ authenticate sender/workload
→ resolve participant + relationship
→ verify schema/version/signature/freshness
→ purpose/disclosure policy
→ map canonical object references
→ create/update local WorkUnit or observation
→ local Twin/policy/authority evaluation
→ human/agent processing
```

Receipt of a network artifact never transfers sender authority.

## Outbound network path

```text
internal Twin/work state
→ candidate network projection
→ classification + purpose + relationship
→ minimum-necessary field projection
→ customer/network disclosure policy
→ canonical artifact
→ durable send
→ acknowledgement/result
→ reconciliation
```

## Internal versus external vocabulary

The Twin may preserve a customer's local vocabulary and system identifiers while the network uses canonical FreightOS semantics. Mapping is versioned and provenance-bearing.

## Conversation continuity

Human emails, SMS/voice transcripts, EDI messages, API events, and native agent/network messages may all belong to one business conversation/workflow, but the canonical business state must not depend on free-form transcript alone.

Required correlation should include, where applicable:

- participant IDs;
- shipment/load/visit/service-case references;
- WorkUnit/workflow ID;
- correlation/causation IDs;
- sender identity;
- channel;
- message/artifact version;
- evidence references;
- acknowledgement/reconciliation state.

## Counterparty trust boundary

One participant's agent cannot invoke another participant's internal tools. It may send a Request/Proposal/Tender/etc.; the receiving side independently evaluates identity, relationship, policy, authority, and current state.

## Human-network bridge

A customer employee may use the Twin workbench to communicate outward through FreightOS while FreightOS handles canonical references, evidence, channel routing, tracking, and reconciliation. This is valuable even when the employee remains the decision maker.
