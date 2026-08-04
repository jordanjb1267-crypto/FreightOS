# ADR 0002 — Mode-neutral freight core

**Status:** Accepted

Shipment, Journey, and TransportLeg are universal. Road, rail, ocean, and air implement versioned modal adapters. Truck-specific fields cannot define the core model.
