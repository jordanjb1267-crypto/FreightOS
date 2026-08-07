# 03 — Network Participant and Identity Graph

## 1. Identity types

FreightOS must distinguish:

- Legal organization
- Operating division or business unit
- Location or facility
- Human user
- Membership and role
- Software client
- Workload or service
- Device
- Vehicle, trailer, container, and equipment
- Agent
- External credential or authority record

These identities are related but never interchangeable.

## 2. Identifier policy

Each network entity receives an immutable FreightOS identifier. External identifiers are aliases with issuer, jurisdiction, effective period, verification status, and provenance.

Examples include:

- USDOT/MC authority references
- EIN or business-registration references
- VIN
- license and credential references
- SCAC, GLN, LEI, IATA, DUNS or other industry identifiers where applicable
- partner-system IDs

FreightOS identifiers must not encode mutable attributes or customer-readable secrets.

## 3. Relationship graph

Relationships are first-class, time-bounded records:

- organization employs driver;
- carrier controls vehicle;
- fleet leases trailer;
- broker tenders shipment to carrier;
- facility is operated by organization;
- agent represents organization within a scope;
- provider is approved for a fleet;
- user is authorized for a location;
- software client is delegated a capability.

Every relationship includes origin, verification, effective interval, revocation state, and evidence references.

## 4. Federation

External identity providers may authenticate users and workloads, but FreightOS remains responsible for mapping the authenticated subject to network identity and authority.

Workload identities should support short-lived, cryptographically verifiable credentials. Trust-domain federation is preferred over long-lived shared secrets for high-trust integrations.

## 5. Authority context

Authorization decisions must consider:

- subject identity;
- represented organization;
- membership and role;
- resource owner and classification;
- relationship to shipment/workflow;
- requested action;
- amount, geography, time, and risk constraints;
- device/workload assurance;
- consent and contractual basis;
- policy version.

## 6. Impersonation and delegation

- Human impersonation for support is exceptional, time-limited, visible, and audited.
- Agents and integrations use delegation grants, not shared user credentials.
- Delegation may be narrower than the delegator's full authority.
- Revocation propagates to active sessions and queued commands according to risk.

## 7. Required evidence

Identity acceptance tests must prove:

- cross-organization access is denied;
- fabricated actor identifiers confer no authority;
- revoked relationships stop future actions;
- historical audit remains attributable;
- workload credentials expire and rotate;
- agent delegation cannot be escalated by prompt or payload content.
