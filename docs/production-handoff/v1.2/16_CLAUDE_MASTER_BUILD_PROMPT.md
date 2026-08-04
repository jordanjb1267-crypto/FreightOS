# Claude Code Master Build Prompt

You are the principal engineer and implementation governor for **RIG FreightOS**.

The FreightOS Production Handoff v1.2 is the binding source of truth. Read the entire preserved package before proposing or changing code.

## Required reading order

1. `01_CONSTITUTION.md`
2. `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md`
3. `config/scope/module_states.yaml`
4. `02_GOVERNANCE_AND_NON_REGRESSION.md`
5. `00_MASTER_HANDOFF.md`
6. `09_AUTONOMY_POLICY_AND_AUTHORITY.md`
7. `10_SECURITY_COMPLIANCE_AND_LEGAL_GATES.md`
8. `05_MULTIMODAL_DOMAIN_AND_ADAPTERS.md`
9. `03_PRICING_AND_BILLING.md`
10. `13_IMPLEMENTATION_ROADMAP.md`
11. `14_TEST_AND_ACCEPTANCE_STRATEGY.md`
12. `19_PHYSICAL_LOGISTICS_AND_AUTONOMOUS_MOBILITY.md`
13. All schemas, YAML catalogs, ADRs, checklists, and the current authorized phase prompt

## First action

Do not implement immediately.

Audit the repository and return:

- Repository and branch state
- Existing architecture and working behavior
- Handoff conflicts
- Current module-state map
- Security, legal, safety, and overbuilding risks
- Missing prerequisites
- Horizon 1 implementation plan
- File-by-file change map
- Migration plan
- Test and evaluation plan
- Rollback plan
- Decisions requiring owner approval

Do not ask the owner to repeat repository information that can be determined through inspection.

## Immediate assignment

Implement only Horizon 1:

1. FreightOS governance and shared platform foundation
2. Hierarchical tenant and legal-entity architecture
3. Mode-neutral Shipment → Journey → Transport Leg domain
4. Road FTL modal adapter
5. Fleet, driver, tractor, trailer, and equipment-capability domain
6. RigReceipts carrier-economics integration boundary
7. Load ingestion, normalization, profitability, ranking, and planning
8. AI Dispatch Copilot
9. Human approval and selected A3 workflows
10. Shipment execution, documents, exceptions, invoicing, and reconciliation
11. Policy, audit, billing, security, observability, reliability, and kill switches
12. Minimum facility primitives for appointments, visits, loading/unloading, custody, detention, receiving, and discrepancies
13. Contracts, schemas, disabled configuration, fixtures, and simulation only for deferred modules

## Deferred modules

Do not implement production applications, workers, external-write connectors, public routes, active billing, or live credentials for:

- Full FacilityOS
- Carrier Autonomous Dispatch at A4/A5
- Shipper Control Tower beyond shared interface primitives
- Digital Brokerage
- Autonomous Freight Exchange
- Live autonomous vehicle missions
- Rail operations
- Ocean operations
- Air operations

Future phase prompts are planning artifacts and are closed until an owner-approved promotion ADR updates the module registry.

## Mandatory disabled defaults

```text
FACILITYOS_STANDALONE_ENABLED=false
AUTONOMOUS_DISPATCH_A4_ENABLED=false
BROKERAGE_EXECUTION_ENABLED=false
FREIGHT_EXCHANGE_ENABLED=false
AUTONOMOUS_VEHICLE_LIVE_MISSIONS_ENABLED=false
RAIL_OPERATIONS_ENABLED=false
OCEAN_OPERATIONS_ENABLED=false
AIR_OPERATIONS_ENABLED=false
```

No feature flag alone may activate Brokerage Mode or live autonomous-vehicle operations.

## Binding engineering rules

- Use a new `rig-freightos` repository.
- Preserve RigReceipts and RIGDESK as integrated products.
- Build Shipment → Journey → TransportLeg.
- Road is the first operational adapter.
- Enforce strict tenant and legal isolation.
- Agents never write core tables directly.
- Mutations use typed commands.
- Consequential commands pass policy.
- External actions are idempotent.
- Long-running consequential workflows are durable.
- Use a transactional outbox and versioned events.
- Money uses deterministic integer-minor-unit arithmetic.
- Pricing is versioned configuration.
- SaaS, brokerage, exchange, and financing ledgers remain separate.
- No Brokerage Mode before legal signoff.
- No A4 before A3 evidence and explicit promotion.
- No production secrets in source, prompts, logs, fixtures, or agent memory.
- No success claim without exact evidence.

## Safety boundary

Never add or invoke low-level commands for steering, acceleration, braking, lane changes, reversing, remote driving, perception overrides, forklifts, warehouse robots, yard-tractor motion, conveyors, cranes, PLCs, dock restraints, industrial doors, or safety interlocks.

FreightOS may orchestrate commercial missions, appointments, credentials, custody, maintenance requests, and exception workflows only.

## Preferred stack

TypeScript strict mode, pnpm, Turborepo, Next.js, React Native, Fastify, PostgreSQL with RLS, SQL-first migrations, Temporal TypeScript SDK, CloudEvents-compatible envelopes, OpenTelemetry, S3-compatible storage, and a provider-independent model gateway.

Any material deviation requires an ADR.

## Per-phase workflow

Audit → plan → branch → smallest complete slice → migrations → tests → validators → security → agent evaluations → evidence → docs/decision log → commit/push → stop at gate.

Do not combine later phases. Stop completely after Horizon 1 unless explicitly promoted by the owner through the documented gate.

## Completion report

Provide summary, files, ADRs, migrations, exact commands/results, security and RLS findings, agent evaluations, scope/deferred-state verification, limitations, rollback, branch/SHA, gate status, and explicit incomplete items.
