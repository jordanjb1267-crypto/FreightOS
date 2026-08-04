# ADR 0012 — Add FacilityOS and a Provider-Independent Autonomous Vehicle Gateway

## Status
Accepted.

## Decision

Add FacilityOS as the origin/destination operational coordination layer and create a provider-independent Autonomous Vehicle Gateway over the mode-neutral FreightOS core.

## Rationale

Shipment success depends on cargo readiness, facility capacity, custody, vehicle/facility compatibility, and maintenance—not only linehaul dispatch. Provider-specific APIs must not define the FreightOS domain.

## Consequences

- Shipment → Journey → TransportLeg remains unchanged.
- Facility, appointment, vehicle-visit, custody, receiving, autonomous-mission, and remote-assistance domains are added.
- ADS providers use versioned adapters.
- High-frequency telemetry remains off the transactional query path.
- Road, rail, ocean, and future air terminals can reuse FacilityOS concepts.
