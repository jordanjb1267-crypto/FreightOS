# 05 — Entitlement and Activation Architecture

## Separation

Commercial entitlement and operational activation are separate state machines.

### Entitlement state

```text
PROPOSED → CONTRACTED → ACTIVE → SUSPENDED → EXPIRED / TERMINATED
```

### Activation state

```text
NOT_CONFIGURED
 → CONFIGURING
 → SHADOW
 → APPROVAL_REQUIRED
 → ACTIVE_BOUNDED
 → SUSPENDED
 → DECOMMISSIONED
```

The exact implementation vocabulary is subject to repository audit.

## Entitlement key

At minimum:

```text
organization/legal entity
participant/Twin identity
capability_id + version range
commercial offer/SKU
quantity/meter limit
contract/effective period
commercial restrictions
source contract/order
```

## Activation key

At minimum:

```text
participant/Twin
capability version
workflow/job versions
integration bindings
policy version
legal gate state
customer approvals
autonomy grants
certification evidence
rollout mode
kill switch / suspension state
```

## Invariants

1. Active entitlement with failed activation gates = commercially licensed but unavailable/held.
2. Active capability with expired/terminated entitlement must enter controlled suspension/continuity behavior; do not abruptly create unsafe operational failure.
3. Payment status never bypasses safety/legal/policy requirements.
4. Commercial staff may request entitlement changes but may not directly grant production authority.
5. Trial/pilot entitlements have explicit limits and expiry.
6. Entitlements are versioned and auditable.
7. A capability cannot read unrelated Twin data merely because the organization licenses another capability.

## Metering

Metering must be generated from authoritative business events where possible, not LLM token counts. Candidate units include asset, managed shipment, facility visit, service case, integration/network volume, or enterprise platform commitment.

Meter data must be replayable/reconcilable and separated from operational truth when the billing projection is derived.
