# Phase 0 Decision Record

**Status:** Accepted
**Date:** 2026-08-04
**Branch:** `claude/freightos-handoff-setup-xbwhlc`
**Base:** `main` @ `e20e11892801292931a2a1be535005ef6ac49539`
**Authority:** Owner ruling accepting the Horizon 1 audit and authorizing Phase 0 only.

---

## 1. Accepted audit findings

The repository audit was accepted by the owner. The findings this record acts on:

**Verified clean.** The preserved handoff package at `docs/production-handoff/v1.2/` is pristine:
90/90 SHA256 checksums match, `PACKAGE_TREE.md` matches disk exactly, all internal file
references resolve, `validate_handoff.py` returns `HANDOFF_VALIDATION=PASS` / `FILES=91`, and git
history shows 91 files added in one owner commit with no deletion or rename since.

**Verified gaps.** Each confirmed by direct inspection:

| ID  | Finding                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Zero `CREATE POLICY` statements exist. `db/0003` and `db/0004` enable RLS on **no** tables despite every table carrying `tenant_id`. `invoice_lines` has no `tenant_id`. `tenants` is unprotected.                                                                                            |
| G2  | `07_…:5` mandates `created_by` on every record; **no table in any migration has it**. Several tables lack `organization_node_id` / `legal_entity_id` / `authority_mode`, so the mandated isolation predicate cannot be written.                                                               |
| G3  | No transactional outbox schema, despite Art. II.6, `06_…:56,83`, `16_…:105`, `00_…:177`.                                                                                                                                                                                                      |
| G4  | `config/agents/registry.yaml` cannot validate against `schemas/agent-manifest.schema.json`: 4 keys present, 10 required, and 2 named differently (`max_autonomy`/`maximum_autonomy`, `prohibited`/`prohibited_actions`).                                                                      |
| G5  | The registry grants `max_autonomy: A4` to 13 agents — 7 on the `carrier_agent` plane — while `carrier_copilot.autonomy_max` is `A3` and `AUTONOMOUS_DISPATCH_A4_ENABLED` is `false`. Both sides are configuration, so the prose-vs-config tie-break does not resolve it.                      |
| G6  | `event-envelope.schema.json` restricts `authoritymode` to three values with `additionalProperties: false`, but `db/0005` adds `facility_operator` and `autonomous_mobility`. Facility and AV events are unemittable. `legalentityid` is required, so system-scope events cannot be enveloped. |
| G7  | Nothing enforces append-only audit, despite Art. II.1 making audit authoritative.                                                                                                                                                                                                             |
| G8  | Kill switches: 7 scopes and 7 modes named in a five-line section. No table, no schema, no semantics, no precedence rule, no authority model.                                                                                                                                                  |
| G9  | 6 of 13 required governance artifacts do not exist.                                                                                                                                                                                                                                           |
| G10 | No CI, no dependency manifest, no lockfile.                                                                                                                                                                                                                                                   |
| G11 | No application-side anti-overbuilding validation. `validate_handoff.py` guards only the handoff package.                                                                                                                                                                                      |
| G12 | `db/0005` bundles 10 Horizon 1 `FOUNDATION_ONLY` tables with 6 `PARTNER_AND_SAFETY_GATED` AV tables.                                                                                                                                                                                          |
| G13 | `horizon_1_production_release` gate is referenced by both Horizon 1 products and does not exist as an artifact.                                                                                                                                                                               |

---

## 2. Owner rulings (binding)

1. **Repository and handoff location.** Keep `jordanjb1267-crypto/FreightOS` and
   `docs/production-handoff/v1.2/`. Record accepted deviations from the older `rig-freightos` and
   `docs/handoff/v1.2/` references. Do not rename or relocate. → ADR-0014.
2. **Root implementation inputs.** No symlinks. The handoff stays immutable. Generated operational
   copies at the repository root: `config/`, `schemas/`, `db/reference/`, `checklists/`, `adr/`,
   `scripts/` — each carrying provenance, with CI detecting unreviewed drift. Handoff SQL is
   **reference DDL**, not production migration SQL. Reviewed implementation migrations live in
   `packages/database/migrations/`. → ADR-0017.
3. **RigReceipts / RIGDESK.** Contract and simulation boundaries only. No live credentials, no live
   external writes, no invented economics or maintenance decisions, no claim of production
   connection. _(Phase 1 scope — recorded here as a standing constraint.)_
4. **Legal authority model.** Replace the overloaded `authority_mode` with two explicit dimensions,
   `legal_authority_class` and `operating_context`. → ADR-0015.
5. **Infrastructure baseline.** pnpm, Turborepo, strict TypeScript, Fastify modular monolith, REST
   - generated OpenAPI, PostgreSQL 16, thin typed SQL layer, reviewed raw SQL migrations, Temporal
     TS SDK with local Docker, CloudEvents envelopes, transactional outbox, S3-compatible abstraction
     with local MinIO, GitHub Actions, Vitest, PostgreSQL integration tests, Playwright only when web
     apps exist, OpenTelemetry, internal provider-independent model gateway, MCP as an adapter only.
     No production credentials, AI provider, or cloud provider selected in Phase 0. → ADR-0016.
6. **Mandatory defect closure.** Twelve items, listed in §5 below. Every carrier agent must have an
   effective maximum autonomy of A3 or lower, unelevatable by any registry value, fallback,
   configuration merge, or model output. → ADR-0018.
7. **Working rules.** Feature branch from `main`. Do not modify the preserved package. This decision
   record precedes code. Stop and report at completion.

---

## 3. Scope boundary for Phase 0

**In scope** (from `prompts/PHASE_0_FOUNDATION.md` plus the defect-closure list):
monorepo and toolchain; formatting, linting, typecheck, tests, CI; environment validation; domain,
command, event, policy and agent-manifest schema packages; PostgreSQL development setup;
tenant/legal context; threat model and decision log; handoff validator in CI; machine-readable
module-state registry and anti-overbuilding validator; platform tables (audit, outbox, kill
switches) with RLS.

**Explicitly out of scope for Phase 0** — deferred to their own authorized phases:

- Domain tables (shipment, journey, leg, fleet, driver, equipment, load opportunity) — **Phase 1**
- RigReceipts / RIGDESK contract and simulation packages — **Phase 1**
- Modal adapter SDK and the road adapter — **Phase 1**
- Minimum facility primitives — **Phase 1**
- Agent runtime, tools, evaluation harness — **Phase 2**
- Any A3 execution path — **Phase 3**

Building any of the above now would itself violate the sequencing doctrine. Phase 0 builds the
platform; it does not build the product.

---

## 4. Files to be created

```
Root toolchain      package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json,
                    eslint.config.js, .prettierrc.json, .gitignore, .npmrc, .env.example,
                    docker-compose.yml, vitest.config.ts
CI                  .github/workflows/ci.yml
Generated copies    config/**, schemas/**, db/reference/**, checklists/**, adr/0001-0013,
                    scripts/validate_handoff.py   (+ PROVENANCE.md in each)
New ADRs            adr/0014 repository-and-handoff-location
                    adr/0015 legal-authority-class-and-operating-context
                    adr/0016 infrastructure-baseline
                    adr/0017 reference-ddl-vs-implementation-migrations
                    adr/0018 autonomy-ceiling-enforcement
Governance          docs/governance/{RISK_REGISTER,DATA_CLASSIFICATION,INTEGRATION_REGISTRY,
                    POLICY_REGISTRY,THREAT_MODEL}.md
                    docs/runbooks/** (kill-switch runbook + index of the 24 required)
                    docs/decisions/0001-phase-0-decision-record.md  (this file)
New gate            checklists/HORIZON_1_PRODUCTION_RELEASE_GATE.md   (closes G13)
Scripts             scripts/check-handoff-provenance.mjs   (drift detection)
                    scripts/validate-scope.mjs             (anti-overbuilding)
                    scripts/dev-postgres.sh                (local cluster for tests/CI)
Packages            packages/config      env validation, scope registry, autonomy ceiling
                    packages/schemas     domain/command/event/policy/agent-manifest schemas
                    packages/context     tenant + legal authority + operating context
                    packages/database    migrations, client, RLS session helpers
```

---

## 5. Defect closure plan

| #   | Defect                                    | Resolution in Phase 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Missing RLS policies                      | `packages/database/migrations/` defines the canonical pattern: `ENABLE` + `FORCE ROW LEVEL SECURITY`, a `PERMISSIVE` tenant-isolation policy with `USING` **and** `WITH CHECK`, and `app.current_tenant_id()` which **raises when unset** so missing context fails closed (Art. I.2). Session state is transaction-scoped (`SET LOCAL`). Roles: `freightos_migrator` (owner), `freightos_app` (RLS-subject), `freightos_control_plane` (explicit, audited bypass). Negative tests prove cross-tenant reads and writes fail. |
| 2   | Missing common record fields              | A canonical common-field contract is defined once and applied to every Phase 0 table: `id, tenant_id, created_at, updated_at, created_by, version`. `created_by` is `NOT NULL` and sourced from session context. Phase 1 inherits the pattern. Recorded in ADR-0017.                                                                                                                                                                                                                                                        |
| 3   | Missing transactional outbox              | `outbox_events` table with CloudEvents-compatible columns, a claim/lease mechanism, delivery attempt tracking, and a dead-letter state. Written in the same transaction as the state change.                                                                                                                                                                                                                                                                                                                                |
| 4   | Agent registry / manifest incompatibility | Root `schemas/agent-manifest.schema.json` is corrected to the new legal model and root `config/agents/registry.yaml` is regenerated to validate against it. A CI check validates every entry. Field renames (`max_autonomy`→`maximum_autonomy`, `prohibited`→`prohibited_actions`, `planes`→`legal_authority_class`+`operating_context`) recorded in ADR-0015.                                                                                                                                                              |
| 5   | A4 grants vs A3 ceiling                   | `packages/config` exposes `effectiveMaximumAutonomy()`, which returns `min(registry value, module ceiling)` and clamps deferred-module agents to `A0`. A CI validator asserts no carrier agent resolves above A3. There is no configuration path that raises it. ADR-0018.                                                                                                                                                                                                                                                  |
| 6   | Event-envelope incompatibility            | Root `schemas/event-envelope.schema.json` carries `legal_authority_class` + `operating_context`, and makes `legal_entity_id` optional **only** when `operating_context = system` and an authorized actor is present — enforced by JSON Schema conditionals, not convention.                                                                                                                                                                                                                                                 |
| 7   | Legal-authority ambiguity                 | Two PostgreSQL enums (`legal_authority_class`, `operating_context`), a context type in `packages/context`, and fail-closed validation. Brokerage is rejected unconditionally in Horizon 1. ADR-0015.                                                                                                                                                                                                                                                                                                                        |
| 8   | Missing append-only audit                 | `audit_events` gets a trigger rejecting `UPDATE` and `DELETE`, plus revoked table privileges for the application role. Tested.                                                                                                                                                                                                                                                                                                                                                                                              |
| 9   | Missing kill-switch schema                | `kill_switches` table over the 7 scopes and 7 modes, with a documented precedence rule (**the most restrictive mode across all applicable scopes wins**) and a resolution function. Tested.                                                                                                                                                                                                                                                                                                                                 |
| 10  | Missing governance artifacts              | Risk register, data-classification register, integration registry, policy registry, decision log, runbooks — created under `docs/governance/` and `docs/runbooks/`.                                                                                                                                                                                                                                                                                                                                                         |
| 11  | Missing CI                                | GitHub Actions: typecheck, lint, format check, unit tests, PostgreSQL integration tests, handoff validator, provenance/drift check, anti-overbuilding validator, secret scan.                                                                                                                                                                                                                                                                                                                                               |
| 12  | Missing anti-overbuilding validation      | `scripts/validate-scope.mjs` encodes all nine failure conditions from `21_…:189-199`, the prohibited-directory list including the anti-rename clause, the eight mandatory-false defaults, and the autonomy ceiling.                                                                                                                                                                                                                                                                                                         |

---

## 6. Migration strategy

- Handoff SQL under `db/reference/` is **reference DDL** and is never executed.
- Implementation migrations live in `packages/database/migrations/` as numbered, reviewed, raw SQL
  pairs: `NNNN_name.up.sql` and `NNNN_name.down.sql`. Every migration has a tested down path,
  closing the gap that the reference DDL has no rollback (Art. VIII.2 requires rollback).
- A `schema_migrations` table records version, name, checksum, and applied timestamp. Checksums are
  verified on every run so an edited applied migration fails loudly.
- `db/0005` is **not** applied. Its facility half is Phase 1 work; its AV half stays preserved as
  reference only. This resolves G12 without deleting future architecture (Art. X.7).
- Phase 0 migrations create platform tables only: tenants, audit, outbox, kill switches. No domain
  tables.

## 7. CI design

`.github/workflows/ci.yml`, single workflow, PostgreSQL 16 service container:

1. `pnpm install --frozen-lockfile`
2. `pnpm format:check` · `pnpm lint` · `pnpm typecheck`
3. `pnpm test` — unit
4. `pnpm test:integration` — migrations apply → down → re-apply, RLS negative tests, audit
   append-only tests, kill-switch precedence tests
5. `python3 scripts/validate_handoff.py` — handoff integrity
6. `node scripts/check-handoff-provenance.mjs` — drift between handoff and generated root copies
7. `node scripts/validate-scope.mjs` — anti-overbuilding + autonomy ceiling + mandatory defaults
8. secret scan

Any failure fails the build. No step is advisory.

## 8. Rollback points

| Point                 | Rollback                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Any commit            | Branch is never merged to `main` directly; revert the PR merge commit.                   |
| Migrations            | Every migration has a tested `.down.sql`; `pnpm db:down` unwinds in reverse order.       |
| Generated root copies | Regenerable from the immutable handoff via `pnpm sync:handoff`; drift is detected in CI. |
| Toolchain             | Additive only — no existing file is modified except `README.md`.                         |

Phase 0 adds no runtime service, no public route, no external connector, and no credential, so
there is no deployed surface to roll back.

## 9. Exit evidence required

Per `checklists/PHASE_EXIT_GATE.md` and the owner's report list: branch and exact HEAD SHA; every
file added or changed; exact commands executed; exact test results and exit codes; validator
results; RLS and isolation results; deferred-module and autonomy-ceiling results; secret-scan
results; migration apply/recovery/reapply results; remaining unresolved gaps; rollback procedure;
and an explicit statement of whether Phase 0 satisfies its exit gate.

**Known gate dependency:** `13_IMPLEMENTATION_ROADMAP.md` names "legal-plane ambiguity resolved" as
a Phase 0 exit condition. Owner ruling 4 resolves it; ADR-0015 records it. That condition is
therefore satisfied by this phase rather than blocked on it.
