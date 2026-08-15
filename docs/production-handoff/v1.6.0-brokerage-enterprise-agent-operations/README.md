# FreightOS Brokerage Enterprise Agent Operations Handoff v1.6.0

**Status:** additive production architecture and implementation-control package  
**Date:** 2026-08-14  
**Legal activation:** brokerage execution remains legal/promotion-gated. Installing this package does not authorize FreightOS, RIG, a customer, or any agent to perform unlicensed brokerage.

## Purpose

This package completes the principal operational communication triangle:

```text
Shipper / Customer
        ↓
Brokerage Agent Organization
        ↓
FreightOS Network
   ↙              ↘
Carrier Agents   FacilityOS Agents
        \          /
         Shipment Execution
              ↓
      Documents / Settlement
```

It defines a customer-deployable brokerage operating system that can serve:
- a one-person licensed broker;
- a small brokerage;
- a freight agency operating under a lawful brokerage arrangement;
- a regional 3PL;
- a large enterprise brokerage with many branches/teams;
- future multimodal brokerage/forwarding capabilities subject to separate legal-plane rules.

## Core architecture

```text
Canonical FreightOS Brokerage Plane
        +
Broker Operational Twin
        +
Broker Agent Organization Factory
        +
Typed Durable Brokerage Workflow Graphs
        +
Legal / Authority / Financial Responsibility Gate
        +
Customer Policies / Contracts / Routing Guides
        +
Integration Adapters
        ↓
Customer-specific brokerage automation
without customer-specific product forks
```

## Strategic endpoint

The long-term target is not merely "AI assists brokers."

The target is:

> **A properly authorized brokerage entity whose routine operational brokerage work is executed by policy-bounded FreightOS agents, with humans supervising exceptions, compliance, relationships, strategy, and high-risk actions.**

This can reduce or replace much of the human broker workflow, but the software/agents do not erase the legal brokerage entity, authority, financial responsibility, recordkeeping, contract, and compliance obligations that apply to brokerage activity.

## Relationship to existing FreightOS packages

Additive to:
- FreightOS complete production handoffs;
- v1.3.0 Security/Privacy/Resilience;
- v1.4.0 Network Architecture;
- v1.5.0 Enterprise Agent Operations;
- FacilityOS Enterprise Agent Operations v1.0.0.

Do not modify earlier handoff files merely to install this package.

## Repository destination

```text
docs/production-handoff/v1.6.0-brokerage-enterprise-agent-operations/
```

## Read order

1. `00_MASTER_HANDOFF.md`
2. `01_BROKERAGE_AGENT_CONSTITUTION.md`
3. `02_BROKER_OPERATIONAL_TWIN.md`
4. `03_BROKER_AGENT_ORGANIZATION_FACTORY.md`
5. `04_BROKERAGE_WORKFLOW_GRAPH_STANDARD.md`
6. `05_SHIPPER_INTAKE_RFQ_AND_QUOTING.md`
7. `06_CARRIER_NETWORK_SOURCING_AND_QUALIFICATION.md`
8. `07_PRICING_MARGIN_AND_NEGOTIATION.md`
9. `08_ALLOCATION_TENDER_AND_BOOKING.md`
10. `09_SHIPMENT_EXECUTION_AND_COMMUNICATION.md`
11. `10_FACILITY_APPOINTMENT_AND_DOCUMENT_COORDINATION.md`
12. `11_ACCESSORIAL_EXCEPTION_AND_CLAIMS_EVIDENCE.md`
13. `12_INVOICING_CARRIER_PAY_AND_RECONCILIATION.md`
14. `13_BROKER_TRANSACTION_RECORD_AND_TRANSPARENCY.md`
15. `14_AUTHORITY_FINANCIAL_RESPONSIBILITY_AND_COMPLIANCE.md`
16. `15_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md`
17. `16_AUTONOMY_SHADOW_AND_CERTIFICATION.md`
18. `17_ENTERPRISE_SCALE_BRANCH_AND_BOOK_ARCHITECTURE.md`
19. `18_FREIGHTOS_NETWORK_COMMUNICATION.md`
20. `19_SECURITY_PRIVACY_CONFLICTS_AND_DATA_GOVERNANCE.md`
21. `20_OBSERVABILITY_AND_BROKERAGE_OUTCOMES.md`
22. `21_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md`
23. `22_ACCEPTANCE_GATES.md`
24. `23_IMPLEMENTATION_ROADMAP.md`
25. `24_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`
26. contracts/diagrams/templates/source registry.

## Current-law design note

The source registry is dated 2026-08-14 and must be revalidated before live brokerage activation. Transportation counsel remains required for the specific operating model and customer contracts.
