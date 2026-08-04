# RIG FreightOS Production Handoff

**Version:** 1.2.0  
**Prepared:** 2026-08-04  
**Purpose:** Production source-of-truth package for Claude Code and all future engineering, product, compliance, and commercial work on RIG FreightOS.

## Ecosystem

- **RigReceipts** — carrier economics, expense, rate, and cash-flow intelligence
- **RIGDESK CarrierOS** — fleet, driver, equipment, maintenance, repair, and carrier operations
- **RIG FreightOS** — governed agentic dispatch and multimodal freight operating platform
- **RIG Freight Network** — shipper control tower, licensed digital brokerage, and future autonomous exchange
- **RIG FacilityOS** — shipper/receiver, appointment, gate, yard, dock, custody, and warehouse coordination
- **RIG Autonomous Vehicle Operations** — provider-independent mission orchestration, remote-assistance coordination, and autonomous fleet/maintenance linkage

This is a production architecture and implementation-control package. It is not a claim that the production application has already been built.

## Binding priority

1. `01_CONSTITUTION.md`
2. `02_GOVERNANCE_AND_NON_REGRESSION.md`
3. `09_AUTONOMY_POLICY_AND_AUTHORITY.md`
4. `10_SECURITY_COMPLIANCE_AND_LEGAL_GATES.md`
5. `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md`
6. `19_PHYSICAL_LOGISTICS_AND_AUTONOMOUS_MOBILITY.md`
7. `00_MASTER_HANDOFF.md`
8. Architecture, domain, and pricing documents
9. Phase prompts
10. Code comments and implementation convenience

## Immediate implementation target

> **RIGDESK AI Dispatch Copilot for dry-van owner-operators and small fleets using existing broker relationships.**

The core must still be mode-neutral, enterprise-hierarchical, and capable of later road, rail, ocean, and air adapters.

**Current execution rule:** build Horizon 1 only. FacilityOS, A4/A5 Autonomous Dispatch, Brokerage, Exchange, live autonomous missions, rail, ocean, and air remain gated as defined in `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md`.

## Start here

1. Read `17_CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md`.
2. Start a new Claude Code session inside a new `rig-freightos` Git repository.
3. Give Claude `16_CLAUDE_MASTER_BUILD_PROMPT.md`.
4. Do not permit implementation before Claude completes the repository audit and Phase 0 plan.
5. Begin with `prompts/HORIZON_1_KICKOFF.md`, then execute only Phase 0 through Phase 3 sequentially.
6. Enforce all phase exit gates, the Horizon 1 stop rule, and non-regression rules.
7. Never activate brokerage actions before `checklists/BROKERAGE_LEGAL_GATE.md` is fully satisfied.
8. Never activate live autonomous-vehicle missions before `checklists/AUTONOMOUS_VEHICLE_ACTIVATION_GATE.md` is signed.
9. Never permit FreightOS to issue dynamic-driving-task, robotics, PLC, conveyor, or safety-interlock commands.

## Validate

```bash
python3 scripts/validate_handoff.py
```
