# 02 — Unified Platform Architecture

## Platform layers

### Layer 1 — FreightOS Network Kernel
Owns:
- participant identities;
- relationships;
- canonical logistics references;
- event/intent/command/evidence envelopes;
- capability registry;
- schema/conformance;
- subscriptions/routing;
- trust/audit.

### Layer 2 — Authority and Policy
Owns:
- tenancy;
- legal plane;
- permissions;
- delegation;
- approvals;
- autonomy grants;
- exposure;
- kill switches.

### Layer 3 — Durable Operations Runtime
Owns:
- graph state;
- checkpointing;
- retries;
- deadlines;
- human interrupts;
- side-effect gateways;
- reconciliation;
- degraded mode.

### Layer 4 — Intelligence Runtime
Owns:
- classification;
- extraction;
- planning;
- optimization;
- drafting;
- summarization;
- anomaly detection.

Intelligence cannot grant authority.

### Layer 5 — Participant Profiles
Carrier / Broker / Facility / Shipper / Service.

Each profile provides:
- Twin schema;
- canonical agent manifests;
- workflow catalog;
- UI/application surfaces;
- integration pack;
- evaluation suites.

### Layer 6 — Capability Packs
- Road
- Rail
- Ocean
- Facility
- Maintenance/Service
- Brokerage
- future Air
- commodity/specialty packs.

### Layer 7 — Experience + Integration
Native apps, partner apps, APIs, EDI, MCP, email/document gateways.

## Shared kernel rule

If a capability can be expressed once in the network kernel, do not reimplement it independently in Carrier/Broker/Facility applications.

Examples:
- identity;
- evidence;
- document reference;
- approvals;
- event envelopes;
- idempotency;
- reconciliation;
- audit.

## Domain ownership rule

Do not centralize domain truth unnecessarily.

Examples:
- RigDesk may own detailed asset/service state;
- FacilityOS may own facility visit/receiving state;
- Brokerage Plane owns brokerage commercial transaction state;
- FreightOS core owns canonical shipment/journey/network coordination.

Use governed references/events.
