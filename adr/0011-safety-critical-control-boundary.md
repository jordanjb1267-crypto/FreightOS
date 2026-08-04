# ADR 0011 — Separate Freight Mission Orchestration from Safety-Critical Motion Control

## Status
Accepted.

## Decision

FreightOS may orchestrate commercial missions, appointments, credentials, custody, facility targets, remote-assistance requests, maintenance requests, and operational holds. It may not command the dynamic driving task, robotics, PLCs, conveyors, dock restraints, safety interlocks, or industrial motion.

## Rationale

The system can create substantial logistics value without becoming the safety-certified controller of vehicles or warehouse machinery. Keeping the boundary explicit limits unsafe authority, vendor coupling, certification burden, and agent/MCP attack surface.

## Consequences

- Provider adapters expose strategic mission contracts only.
- Safety-critical commands are structurally absent and prohibited by policy/tests.
- Physical systems may reject or defer FreightOS requests.
- Facility and vehicle state must preserve authoritative-provider provenance.
- A future remote-driving or industrial-control product requires a new company decision, legal/safety program, architecture, and ADR.
