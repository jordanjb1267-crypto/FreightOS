# 05 — Universal Event Model

## 1. Purpose

A FreightOS event is an immutable statement that something relevant occurred, was asserted, was observed, was inferred, or was corrected.

## 2. Event classes

- **Observed:** produced by a sensor, device, system, or authenticated human observation.
- **Asserted:** claimed by a participant but not independently verified.
- **Verified:** accepted after prescribed evidence or counterparty confirmation.
- **Derived:** computed from other events or models.
- **Predicted:** forecast with model/version/confidence metadata.
- **Command-result:** outcome of an attempted command.
- **Correction:** supersedes or clarifies prior event content without deletion.
- **Dispute:** challenges an event or derived state.

## 3. Required envelope

Every event includes:

- event ID;
- type and semantic version;
- source identity;
- subject references;
- occurred-at and recorded-at timestamps;
- tenant/organization context;
- classification and visibility policy reference;
- correlation, causation, workflow, and trace IDs;
- schema reference;
- idempotency/deduplication material;
- evidence references where required;
- signature or transport-authentication context;
- payload.

## 4. Naming

Use reverse-domain or controlled namespace naming:

```text
com.freightos.shipment.arrived.v1
com.freightos.facility.gate-entered.v1
com.freightos.vehicle.fault-observed.v1
com.freightos.service.repair-authorized.v1
com.freightos.settlement.invoice-disputed.v1
```

The major event version belongs in the type or schema reference. Minor compatible evolution follows registry policy.

## 5. Ordering

Global ordering is not required and should not be claimed. Ordering guarantees are defined per aggregate, partition key, or workflow. Consumers must tolerate late arrival and explicitly handle sequence gaps.

## 6. Delivery

Events use durable publication, consumer acknowledgements, retry with backoff, dead-letter isolation, replay, and reconciliation. Delivery semantics are at-least-once unless a specific transport proves stronger semantics; consumers remain idempotent.

## 7. Corrections

A correction event references the original event, reason, correcting authority, and effective time. Derived projections must identify whether they incorporate the correction.

## 8. Evidence thresholds

Examples:

- arrival may accept geofence + authenticated device;
- custody transfer may require both parties or signed document evidence;
- bank-account change is not an event-only operation and requires command/approval controls;
- repair completion may require provider assertion plus work-order evidence;
- detention charge requires policy, timeline events, and supporting documentation.
