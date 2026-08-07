# GS1 EPCIS Alignment Profile

## Purpose

Use EPCIS concepts for supply-chain visibility events while preserving FreightOS command, approval, workflow, and service-specific extensions.

## Concept mapping

| FreightOS | EPCIS-aligned concept |
|---|---|
| Event subjects | EPCs/objects, aggregation, transaction or association subjects as applicable |
| Event time | eventTime |
| Recorded time | recordTime |
| Business step | bizStep |
| Disposition/state | disposition |
| Location | readPoint / bizLocation |
| Related commercial object | bizTransactionList |
| Source/destination | sourceList / destinationList |
| Sensor evidence | sensorElementList |

## Rules

- Do not label an event EPCIS-conformant unless required structure and vocabulary rules pass.
- FreightOS event envelope metadata may wrap or reference an EPCIS payload.
- Commands and approvals are not forced into EPCIS visibility-event semantics.
- Canonical translation records semantic loss and unsupported extensions.
