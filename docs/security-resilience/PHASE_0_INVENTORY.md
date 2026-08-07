# Phase 0 — Current-State Security and Reliability Inventory

Deliverable B of `20_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`, and roadmap PR 0.2.

**Scope of this inventory:** branch `claude/freightos-handoff-setup-xbwhlc` at `1f74bdd`
(= `origin/main`), clean tree. Where the in-flight PR #5 branch
(`claude/phase-1-pr-2-identity-organization`, head `0ca3628`, unmerged) changes a line item, that is
stated explicitly and marked _in flight_. In-flight work is never counted as present.

**No secret value appears in this document.** Credential _classes_ and their locations are named;
values are not, and none were read from a production source, because no production source exists.

---

## 1. Services and owners

| Service | Status                 |
| ------- | ---------------------- |
| —       | **No service exists.** |

The repository contains five library packages and no deployable unit. There is no HTTP server, no
worker, no scheduled job, no queue consumer, and no user-facing application.

| Package                           | Purpose                                                                      | Runtime?      | Owner of record  |
| --------------------------------- | ---------------------------------------------------------------------------- | ------------- | ---------------- |
| `packages/config`                 | environment validation, scope registry reading, autonomy-ceiling computation | library       | repository owner |
| `packages/context`                | legal-context type, capability resolution, kill-switch mode resolution       | library       | repository owner |
| `packages/database`               | migration runner, migration CLI, transaction-scoped session context          | library + CLI | repository owner |
| `packages/schemas`                | JSON Schema loading and validation                                           | library       | repository owner |
| _(in flight)_ `packages/identity` | permissions, memberships, lifecycle, policy inheritance, service accounts    | library       | repository owner |

**Gap:** `02_SECURITY_GOVERNANCE_AND_RISK_OWNERSHIP.md` §2 requires nine named accountability roles.
None is assigned. "Repository owner" is the only owner recorded anywhere, and it is recorded as a
placeholder in `config/agents/registry.yaml`.

**Criticality classes** per `policies/service-criticality.yaml` (A/B/C/D) are **not assigned to
anything**, because there is nothing running to assign them to. The class model itself is unused in
the repository.

## 2. Databases, schemas, runtime roles, owners, migration roles

One PostgreSQL 16 database. Schemas: `public` (domain tables), `app` (enforcement functions and
enums).

### 2.1 Roles on `main`

| Role                      | Attributes                                                                                         | Purpose                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `freightos_migrator`      | `LOGIN`, `CREATEROLE`, owns the database and all objects; **not** `SUPERUSER`, **not** `BYPASSRLS` | applies migrations                                               |
| `freightos_app`           | `LOGIN`, no ownership                                                                              | runtime connection, subject to RLS                               |
| `freightos_control_plane` | `LOGIN`, no ownership                                                                              | explicit, audited RLS bypass for global control-plane operations |

`0001_platform_foundation.up.sql` creates all three. Because every table declares
`FORCE ROW LEVEL SECURITY`, the owner (`freightos_migrator`) is itself bound by policy — a migration
that could not write through its own policies fails rather than silently succeeding.

**Constraint 7 (runtime roles must not own authority-bearing objects) holds on `main`, but
vacuously**: no authority-bearing table exists yet. `freightos_app` owns nothing.

_In flight (PR #5):_ four further roles — `freightos_hierarchy_owner`, `freightos_identity_guard`,
`freightos_admin_owner` (all `NOLOGIN` `SECURITY DEFINER` owners) and `freightos_admin` (a human
operator connection holding `USAGE` on schema `admin` and `EXECUTE` on ten functions and nothing
else).

### 2.2 Tables on `main`

Four. Every one has `ENABLE` **and** `FORCE ROW LEVEL SECURITY`.

| Table           | Tenancy                                | Policies                                                             | Runtime privileges       |
| --------------- | -------------------------------------- | -------------------------------------------------------------------- | ------------------------ |
| `tenants`       | root of tenancy                        | `tenants_isolation`                                                  | `SELECT, INSERT, UPDATE` |
| `audit_events`  | `tenant_id`                            | `audit_events_isolation`                                             | `SELECT, INSERT` only    |
| `outbox_events` | `tenant_id`                            | `outbox_events_isolation`                                            | `SELECT, INSERT, UPDATE` |
| `kill_switches` | `tenant_id`, nullable for system scope | `kill_switches_read`, `kill_switches_write`, `kill_switches_release` | `SELECT, INSERT, UPDATE` |

_In flight (PR #5):_ fifteen more tables — `legal_entities`, `operating_authorities`,
`organization_nodes`, `organization_node_closure`, `roles`, `permissions`, `role_permissions`,
`users`, `memberships`, `membership_roles`, `service_accounts`, `service_account_credentials`,
`service_account_permissions`, `policy_bindings`, `carrier_appointments`. All nineteen forced.

### 2.3 Enforcement functions on `main` (schema `app`)

`assert_legal_context`, `bump_version`, `current_actor_id`, `current_legal_authority_class`,
`current_operating_context`, `current_tenant_id`, `is_control_plane`, `is_permitted_legal_pairing`,
`outbox_guard`, `reject_mutation`, `resolve_kill_switch_mode`, `set_updated_at`.

_In flight (PR #5):_ 47 further `app.*` functions and 13 `admin.*` `SECURITY DEFINER` functions.

### 2.4 Migration tooling

- SQL-first, paired `NNNN_name.up.sql` / `.down.sql`, applied by `packages/database/src/migrator.ts`.
- Every migration on `main` has a tested down path. `migrations.test.ts` proves apply → revert →
  re-apply and partial revert.
- Migrations run as `freightos_migrator`. **A superuser must never be used** — `.env.example` states
  why: a superuser bypasses RLS, so a migration that cannot write through its own policies would
  appear to succeed.
- **No expand-and-contract tooling exists** (`08_SECURE_SDLC` §7). No backfill batching, no
  reconciliation step, no dual-version compatibility test.

## 3. Identity and authorization flows

**On `main`: there is no identity model.** No `users`, `memberships`, `roles`, `permissions`, or
`service_accounts` table. No authentication, no session, no token, no MFA, no password handling, no
identity provider.

What exists is the _context primitive_ the eventual identity layer will feed:

- `packages/database/src/session.ts` — `withLegalContext()` opens a transaction and sets six
  session variables through `set_config(…, true)` (transaction-scoped, so context cannot leak to
  the next borrower of a pooled connection): `app.tenant_id`, `app.actor_id`,
  `app.legal_authority_class`, `app.operating_context`, `app.legal_entity_id`,
  `app.organization_node_id`.
- Absent values are written as empty string and read back as SQL `NULL` via `nullif`, so dependent
  policies fail closed rather than matching everything.
- `packages/context` validates the context shape before it is applied, and refuses
  `brokerage` under Horizon 1 rules.
- `app.assert_legal_context()` refuses when context is missing.

**The authority weakness, stated plainly:** `app.actor_id` is whatever the caller passed. Nothing
verifies it. `app.tenant_id` is likewise caller-set, so a holder of the `freightos_app` credential
can select any tenant. That is the standard RLS shape — the application tier is trusted to set
context — but **the trusted application tier does not exist**, so the property required by SEC-01
("client-supplied actor/tenant identifiers cannot create authority") is not established today. This
is C-3 in the intake and blocker #1 in the register.

_In flight (PR #5):_ a full membership/role/permission model, three self-elevation guards running
`SECURITY DEFINER` under a `NOLOGIN` owner, and an `admin.*` mutation boundary that verifies the
actor against the `users` table before publishing it into `app.actor_id`.

## 4. Tenant-boundary enforcement points

| Layer                     | Enforcement on `main`                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Database                  | RLS, `ENABLE` + `FORCE`, on all 4 tables; policies key on `app.current_tenant_id()` with an explicit `app.is_control_plane()` bypass |
| Service                   | none — no service                                                                                                                    |
| Cache                     | none — no cache                                                                                                                      |
| Object storage            | none — no storage client; MinIO is declared in compose only                                                                          |
| Search                    | none                                                                                                                                 |
| Analytics                 | none                                                                                                                                 |
| Vector store / embeddings | none                                                                                                                                 |
| Export paths              | none                                                                                                                                 |
| Agent retrieval           | none — no agent runtime                                                                                                              |

`04_TENANT_ISOLATION_DATA_PROTECTION.md` requires isolation in _multiple_ layers. Exactly one layer
exists. It is tested: `rls.test.ts` (15 tests) and `ledger.test.ts` (15 tests) prove cross-tenant
denial and append-only behavior against a live PostgreSQL.

## 5. Queues, event delivery, retries, dead letters

| Component                     | State                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outbox_events` table         | **exists** — CloudEvents-shaped envelope, `status`, `attempts`, `claimed_at`/`claim_expires_at` lease so a crashed publisher's claim expires, `last_error`, `event_id UNIQUE` |
| Trigger guard                 | `app.outbox_guard()` constrains status transitions; `DELETE`/`TRUNCATE` revoked from both runtime roles                                                                       |
| Publisher / dispatcher        | **absent**                                                                                                                                                                    |
| Consumer inbox / dedupe table | **absent**                                                                                                                                                                    |
| Retry policy                  | **absent** — `attempts` is a column nothing increments                                                                                                                        |
| Dead-letter queue             | **absent**                                                                                                                                                                    |
| Replay                        | **absent**                                                                                                                                                                    |
| Reconciliation                | **absent** — no `reconciliation-record` implementation despite the schema shipped in the package                                                                              |
| Broker / streaming platform   | **not selected**                                                                                                                                                              |

So: the transactional-outbox _table_ is real and tested, and nothing reads from it. Half of
`07_EVENT_BUS_IDEMPOTENCY_RECONCILIATION.md` is scaffolding without a runtime.

**Idempotency:** no idempotency-key store exists on `main`. The comment at
`0003_audit_and_outbox.up.sql:130` records the requirement; nothing implements it.

## 6. Object stores, caches, search, analytics, embeddings

None of these exist as code. `docker-compose.yml` declares MinIO behind the `full` profile for
future Phase 2 document storage, and `.env.example` carries `OBJECT_STORAGE_*` development
placeholders pointing at `localhost:9000`. No client library is installed, no bucket is created, no
object is written. No cache, no search index, no analytics store, no vector store.

## 7. Environments, cloud accounts, regions, deployment mechanisms

| Item                   | State                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Cloud provider         | **not selected** — deliberately deferred; Phase 0 was forbidden from selecting one                   |
| Accounts / projects    | none                                                                                                 |
| Regions                | none                                                                                                 |
| Environments           | `development` and `test` only; `FREIGHTOS_ENV` accepts `staging` and `production` but neither exists |
| Deployment mechanism   | **none** — CI verifies and stops                                                                     |
| Infrastructure as code | **none**                                                                                             |
| Artifact registry      | none                                                                                                 |
| Feature-flag service   | none — eight compile-time-mandatory-`false` flags in `packages/config` only                          |

`22_DECISIONS_REQUIRED.md` places "primary cloud and region strategy" before Phase 5. It remains
open and is correctly still open.

## 8. Secrets and credential classes

No secret value is printed here, and none exists in the repository.

| Class                                                   | Where declared                                                              | Current value class                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| Database connection URIs (migrator, app, control-plane) | `.env.example`, validated by `packages/config/src/env.ts`                   | local development literals (`devonly`) |
| Object-storage access key / secret                      | `.env.example`                                                              | local MinIO defaults                   |
| Temporal endpoint                                       | `.env.example`                                                              | localhost                              |
| Model-gateway provider credential                       | **none** — `MODEL_GATEWAY_ENABLED=false`, no provider selected              | n/a                                    |
| CI secrets                                              | none referenced in `ci.yml` beyond the ephemeral service-container password | n/a                                    |

Controls in place:

- `.env` is gitignored; `.env.example` states it must never be committed.
- `gitleaks` 8.24.3 runs in CI over **full history** (`fetch-depth: 0`), not a commit range, with
  `--exit-code=1`. The commentary in `ci.yml` records why: a range scan under a shallow clone read
  ~0 bytes and still reported success.
- `packages/config/src/env.ts` fails closed on missing or malformed values.

Absent: managed secret store, rotation procedure, rotation test, break-glass credential, secret
access logging, per-integration credential scoping (there are no integrations).

### 8.1 Dependency vulnerabilities — open, and CI does not look for them

`pnpm audit` at `1f74bdd` reports **5 vulnerabilities: 1 critical, 1 high, 3 moderate.** All five
are in the test toolchain, reached transitively through `vitest`:

| Severity | Package   | Vulnerable | Patched    | Path                    | Advisory            |
| -------- | --------- | ---------- | ---------- | ----------------------- | ------------------- |
| critical | `vitest`  | `<3.2.6`   | `>=3.2.6`  | `.>vitest`              | GHSA-5xrq-8626-4rwp |
| high     | `vite`    | `<=6.4.2`  | `>=6.4.3`  | `.>vitest>vite`         | GHSA-fx2h-pf6j-xcff |
| moderate | `vite`    | `<=6.4.1`  | `>=6.4.2`  | `.>vitest>vite`         | GHSA-4w7w-66w2-5vf9 |
| moderate | `vite`    | `<=6.4.2`  | `>=6.4.3`  | `.>vitest>vite`         | GHSA-v6wh-96g9-6wx3 |
| moderate | `esbuild` | `<=0.24.2` | `>=0.25.0` | `.>vitest>vite>esbuild` | GHSA-67mh-4wv8-2f99 |

**Exploitability in this repository is low and should not be overstated.** Every one requires a
listening development or UI server — the critical advisory requires the Vitest UI server to be
running; the `vite` and `esbuild` advisories are dev-server path-traversal and permissive-CORS
issues. This repository never starts `vitest --ui` or a Vite dev server, in CI or locally, and
`vitest` is a `devDependency` that ships in nothing because nothing ships.

**The finding that matters is not the CVEs; it is that the repository's own pipeline did not find
them.** `.github/workflows/ci.yml` has no `pnpm audit`, no dependency scan, and no license scan.
These were surfaced by GitHub Dependabot on push, out of band. A dependency-scanning step is folded
into SR-8 in [`PHASE_0_PR_PLAN.md`](PHASE_0_PR_PLAN.md), and it should be blocking, because a
non-blocking scan is the same failure mode `ci.yml` already documents for the secret scan: output
nobody reads that looks like coverage.

Branch `origin/dependabot/npm_and_yarn/vitest-3.2.6` exists and is unmerged; it addresses the
critical advisory. Merging it is outside this pull request's scope and is listed as an owner
decision.

## 9. External integrations and side effects

**Zero live external side effects exist.** No outbound call to any third party is made by any code
path in the repository. `docs/governance/INTEGRATION_REGISTRY.md` records the intended set and its
gating; the security-relevant summary:

| Integration                                           | State                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| RigReceipts economics boundary                        | contract-and-simulation only (Ruling B); contract does not yet exist    |
| RIGDESK maintenance hooks                             | contract-and-simulation only (Ruling C); fail-closed asymmetry declared |
| Load boards, email ingestion                          | not registered, Phase 2                                                 |
| EDI X12 204/990/214/210                               | deliberately not registered — ADR-0023, licensing unresolved            |
| Object storage, Temporal                              | baseline fixed, local only, no production provider                      |
| Model gateway                                         | `MODEL_GATEWAY_ENABLED=false`, fails closed                             |
| Brokerage, ADS providers, rail/ocean/air, WMS/YMS/WES | **prohibited** — legal gates unsigned                                   |

No vendor is tiered V0–V3 per `16_VENDOR_INTEGRATION_SECURITY.md` §2. No connector kill switch,
circuit breaker, webhook signature validation, or SSRF allowlist exists, because no connector
exists.

## 10. Audit, logging, telemetry

**Audit — the strongest control currently on `main`.**

`audit_events` carries tenant, legal entity, authority class, operating context, actor type, actor
id, versioned event type (`^rig\.freight\.[a-z0-9_.-]+\.v[0-9]+$`), resource, correlation id,
causation id, policy version, payload, and `created_by`. Append-only is enforced two ways:

1. `BEFORE UPDATE`, `BEFORE DELETE`, and `BEFORE TRUNCATE` triggers calling `app.reject_mutation()`;
2. `REVOKE UPDATE, DELETE, TRUNCATE … FROM freightos_app, freightos_control_plane`.

Proven by `ledger.test.ts` (15 tests) against a live database.

Not present: hash chaining or sequence-number linkage between records; a separate audit _store_
(audit lives in the same database as application data, which `01_…` Article V.3 says must be
"logically and operationally isolated" — logically it is, operationally it is not); retention
policy; export tooling other than the in-flight `admin.export_tenant_audit`.

**Logging and telemetry.** `OTEL_SERVICE_NAME` and `OTEL_EXPORTER_OTLP_ENDPOINT` are declared and
validated; **no OpenTelemetry SDK is installed and no span, metric, or log is emitted anywhere**.
There is no logger, no redaction library, no trace propagation, no correlation-id plumbing outside
the database columns. `DATA-02` (logging redaction) therefore has nothing to test.

## 11. Backups, restore tooling, restore evidence

| Item                                 | State                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Backup of any kind                   | **none**                                                                  |
| Backup schedule / monitoring         | none                                                                      |
| Immutable or object-locked retention | none                                                                      |
| Cross-region or cross-account copies | none                                                                      |
| Restore tooling                      | none                                                                      |
| Restore evidence                     | **none has ever been produced**                                           |
| Recovery runbook                     | `docs/runbooks/` contains `README.md` and `kill-switch.md` only on `main` |

The only recovery capability that exists and is proven is **migration reversibility**: every
migration has a down path, and `migrations.test.ts` proves apply → revert → re-apply and partial
revert against a live cluster. That is schema recovery, not data recovery.

`13_BACKUP_RESTORE_BUSINESS_CONTINUITY.md` §1 — "a backup is not valid evidence of recoverability
until it has been restored and verified" — currently has no backup to fail.

_In flight (PR #5):_ `docs/runbooks/database-migration-recovery.md` and
`docs/runbooks/control-plane-access.md`.

## 12. Agents, tools, permissions, approval paths, kill switches

**Agent runtime: none.** No orchestrator, no model client, no tool dispatcher, no prompt, no
evaluation harness.

`config/agents/registry.yaml` — 32 entries, generated from the v1.2 handoff by
`scripts/generate-agent-registry.mjs`, an authorized provenance override. Each entry validates
against `schemas/agent-manifest.schema.json`. Security-relevant properties:

- `allowed_tools` is **empty for every one of the 32 agents**, and the file states that empty means
  _no tool may be called_. The tool registry and per-tool schemas are Phase 2 deliverables.
- `maximum_autonomy` is a **declared ceiling, not a grant**. The effective ceiling is
  `min(declared, module ceiling, horizon ceiling)`, computed by
  `effectiveMaximumAutonomy()` in `packages/config/src/autonomy.ts` (ADR-0018).
- `scripts/validate-scope.mjs` enforces this in CI: `AUTONOMY_CEILING=PASS`, with
  **25 of 32 agents clamped below their declared ceiling**.
- Twelve forbidden physical-control verbs are checked in CI (`SAFETY_BOUNDARY=PASS`), per ADR-0011.

No agent action envelope, no deterministic policy gate, no approval service, no per-agent kill
switch, and no injection-resistance suite exists. `policies/agent-authority.example.yaml` and
`schemas/agent-action-envelope.schema.json` ship in the handoff package and are not implemented.

**Kill switches — partially real.** `kill_switches` on `main` has scopes and modes as enums, an
RLS-protected table with separate read/write/release policies, and `app.resolve_kill_switch_mode()`
computing the effective mode. `docs/runbooks/kill-switch.md` documents operation.
What is missing is the **enforcement point**: nothing calls the resolver before performing an
action, because there is no action to perform. OQ-14 records that Phase 1 reads the mode and Phase 3
is the enforcement point. _In flight (PR #5):_ scope expansion to legal entity and organization node
plus a definer-owned write guard.

## 13. Critical workflows and current degraded behavior

**No logistics workflow is implemented.** No shipment, consignment, journey, leg, load opportunity,
dispatch, appointment, document, invoice, or settlement code path exists on `main`.

Consequently there is no degraded mode to describe, no fail-open/fail-closed declaration per
workflow, no last-known-good cache, no circuit breaker, and no bulkhead. `06_CELLULAR_ARCHITECTURE`
and `REL-02` have no subject.

What _is_ declared fail-closed today, and tested:

| Behavior                                                                                 | Where                                          | Evidence                          |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| Missing or inconsistent legal context refuses                                            | `app.assert_legal_context`, `packages/context` | `rls.test.ts`, unit tests         |
| Absent legal entity reads as `NULL`, not "match all"                                     | `session.ts`, `app.current_legal_entity_id`    | `rls.test.ts`                     |
| Malformed environment refuses at startup                                                 | `packages/config/src/env.ts`                   | `packages/config/test/unit`       |
| A deferred-module flag set `true` is a validation error, not a boolean                   | `env.ts` `mustBeFalse`                         | unit tests + `validate-scope.mjs` |
| Model gateway disabled → call fails closed rather than reaching an unconfigured provider | `MODEL_GATEWAY_ENABLED=false`                  | env schema                        |
| Cross-tenant read/write denied                                                           | RLS on all four tables                         | `rls.test.ts`, `ledger.test.ts`   |
| Audit record cannot be edited or deleted by either runtime role                          | triggers + `REVOKE`                            | `ledger.test.ts`                  |

## 14. Summary of what is genuinely enforced today

Stated without inflation, this is the whole list:

1. Row-level security, forced, on every table that exists, with cross-tenant denial tested against a
   live database.
2. Append-only audit, enforced by both trigger and privilege, tested.
3. Transaction-scoped context that cannot leak across a pooled connection, and fails closed when
   absent.
4. Reversible migrations with a proven apply/revert/re-apply cycle.
5. Scope and autonomy-ceiling enforcement in CI, including a physical-control-verb denylist.
6. Full-history secret scanning in CI.
7. Fail-closed environment validation, with eight deferred-module flags that cannot be turned on by
   configuration.

Everything else in `19_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md` is partial or absent. That is scored
gate by gate in [`PHASE_0_GAP_AND_RISK_REGISTER.md`](PHASE_0_GAP_AND_RISK_REGISTER.md).
