# Agent Operating System

## Principle

Agents are bounded workers. They cannot bypass domain services, policy, approval, billing, or audit.

## Carrier agents

Chief Dispatch Orchestrator, Capacity, Load Discovery, Profitability, Planning, Negotiation, Feasibility, Dispatch, Tracking, Exception, Documentation, Settlement, Carrier Risk.

## Shipper agents

Shipment Intake, Requirements, Quote Analysis, Routing Guide, Tender, Tracking, Exception, Invoice Audit, Service Analytics.

## Brokerage agents

Brokerage Intake, Shipper Pricing, Capacity Sourcing, Carrier Qualification, Allocation, Negotiation, Tender, Shipment Execution, Margin Risk, Claims, Settlement, Compliance Supervisor.

## Runtime

Agent registry, manifest loader, context builder, tool gateway, model router, structured-output validator, memory, evaluation hooks, budget controls, traces, policy client, audit writer.

## Context

Tenant-scoped, workflow-scoped, purpose-limited, freshness-labeled, permission-filtered, redacted, and budgeted. Never dump entire tenant histories into prompts.

## Memory

Allowed: workflow facts, approved preferences, policy references, summaries linked to authoritative records.

Prohibited: credentials, unredacted bank data, cross-tenant data, unverified legal conclusions, unbounded permanent history.

## Evaluation

Golden, adversarial, missing-data, stale-data, permission-denial, tool-failure, hallucination, schema, cost, latency, and shadow fixtures.

## Promotion

Offline → historical replay → adversarial → shadow → A2 → A3 → limited A4 canary → tenant A4 → monitoring → rollback.

## Facility agents

Facility Operations Orchestrator, Order Readiness, Appointment, Facility Capacity, Gate, Yard Orchestration, Dock, Load Verification, Receiving, Facility Exception, Labor/Resource Planning, and Facility Customer Communication.

## Autonomous mobility agents

Autonomous Mission Orchestrator, ODD and Eligibility, Vehicle/Facility Compatibility, Remote Assistance Coordinator, Autonomous Maintenance Coordinator, Mission Exception, and Mission Reconciliation.

All are bounded by the safety-critical control prohibition. The ODD agent consumes provider-authoritative decisions; it cannot grant eligibility itself.
