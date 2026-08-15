# 00 — FreightOS Brokerage Enterprise Agent Operations Master Handoff

## 1. Executive mandate

FreightOS SHALL support a separately governed **Brokerage Plane** through which an authorized brokerage entity can automate the commercial and operational work of arranging transportation between shippers and unrelated carriers.

The brokerage plane must connect directly to:
- shipper demand and requirements;
- carrier capacity and qualification;
- carrier agent organizations;
- FacilityOS origin/destination readiness;
- shipment execution;
- documents/evidence;
- claims/exceptions;
- invoicing, carrier pay status, and settlement evidence.

## 2. Legal-plane separation

```text
Carrier-Agent Plane
  acts for one appointed carrier
  cannot allocate among unrelated carriers
  cannot earn brokerage compensation

Brokerage Plane
  acts for authorized brokerage entity
  can source/select unrelated carriers
  can negotiate both commercial sides within authority
  can tender/allocate freight
  records brokerage compensation and regulated transaction records
```

Credentials, contracts, queues, ledgers, bank/payment integrations, audit scopes, agents, and authority MUST remain distinguishable.

No prompt, tenant setting, user role, or model output may convert one plane into the other.

## 3. Broker Operational Twin

Every brokerage tenant receives a versioned, inspectable Broker Operational Twin (BOT) defining how that brokerage actually operates:
- legal brokerage entity/authority;
- branches/divisions/teams/books;
- shipper accounts/contracts;
- lanes/modes/equipment;
- routing guides;
- carrier network/approval policies;
- pricing and margin policies;
- credit/payment terms and limits;
- carrier-pay practices;
- tender/negotiation SOPs;
- exception/accessorial rules;
- claims workflows;
- documentation requirements;
- communication templates/channels;
- accounting/TMS/CRM/load-board/integration systems;
- approval hierarchy;
- segregation-of-duties;
- record retention;
- customer-specific requirements;
- data-sharing rights.

The customer can inspect, correct, approve, version and diff the BOT.

## 4. Broker Agent Organization

Canonical roles:
- Brokerage Operations Orchestrator
- Shipper Intake Agent
- Requirements Agent
- Shipper Pricing Agent
- Carrier Sourcing Agent
- Carrier Qualification Agent
- Allocation Agent
- Negotiation Agent
- Tender/Booking Agent
- Shipment Execution Agent
- Tracking/Communication Agent
- Facility Coordination Agent
- Documentation Agent
- Accessorial Agent
- Margin Risk Agent
- Claims/Evidence Agent
- Shipper Billing Agent
- Carrier Pay/Reconciliation Agent
- Compliance Supervisor Agent
- Customer/Carrier Relationship Support Agent
- Configuration Steward

Logical responsibilities stay separately governed even when small tenants use fewer runtime workers.

## 5. Canonical brokerage lifecycle

```text
Shipper Demand / RFQ
      ↓
Requirements + Legal Context
      ↓
Price / Quote
      ↓
Shipper Commitment
      ↓
Carrier Sourcing
      ↓
Carrier Qualification
      ↓
Carrier Buy Negotiation
      ↓
Allocation
      ↓
Tender / Acceptance
      ↓
Shipment / Facility Execution
      ↓
Documents / POD / Accessorials
      ↓
Shipper Invoice
      ↓
Carrier Pay Status
      ↓
Broker Transaction Record
      ↓
Reconciliation / Close
```

Every transition is a typed business artifact.

## 6. Autonomous brokerage endpoint

The mature operating model may be:

```text
Human Brokerage Leadership / Compliance
              ↓
Policy + Contract + Risk Configuration
              ↓
Brokerage Agents
              ↓
Routine quote/source/negotiate/tender/track/document/reconcile
              ↓
Human Exception / Relationship / High-Risk Supervision
```

Human labor can be dramatically reduced, but legal authority and compliance remain attached to the authorized entity.

## 7. Customer-specific, canonical product

A customer's unique shipper contracts, margin rules, carrier preferences, communication style, branches and SOPs are BOT/configuration/policy.

They do not justify a permanent software fork.

## 8. Enterprise replication

Every brokerage feature must support:
- shared SaaS;
- dedicated execution partition;
- dedicated enterprise cell;
- versioned APIs/events;
- auditable customer configuration;
- repeatable onboarding;
- contractual SLOs;
- export/retention;
- customer security/procurement review.

## 9. Existing controls remain controlling

If this package conflicts with existing FreightOS security, tenant isolation, authority, legal gating, settlement, network neutrality, or physical-safety rules, preserve the stricter rule and escalate.
