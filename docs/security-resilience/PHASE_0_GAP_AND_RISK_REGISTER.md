# Phase 0 — Gap and Risk Register

Deliverable C of `20_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`. Maps the current state of the
repository against every gate in
`docs/production-handoff/v1.3.0-security-resilience/19_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md`.

**Baseline:** `1f74bdd` (= `origin/main`), clean tree.

**Scoring rule, taken from v1.4.0 `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md` and applied to both
matrices:** _a gate cannot be PASS when evidence exists only in an unmerged branch, mock, or
document._ PR #5 (`0ca3628`) is unmerged, so nothing it delivers is scored as present. Where it is
relevant it is noted as **in flight** so the PR plan does not duplicate it.

**Status vocabulary**

| Status          | Meaning here                                                                          |
| --------------- | ------------------------------------------------------------------------------------- |
| PASS            | The control exists on `main` and the gate's minimum evidence is reproducible today    |
| PARTIAL         | A real, tested component of the control exists; the gate's full evidence set does not |
| FAIL            | A control is present but demonstrably insufficient for its stated purpose             |
| NOT IMPLEMENTED | No control exists                                                                     |

**Risk tiers** are the package's own (`02_SECURITY_GOVERNANCE_AND_RISK_OWNERSHIP.md` §3):
R0 routine · R1 controlled · R2 significant · R3 critical · R4 existential. The tier records the
_maximum plausible impact of the gap if the system were carrying production traffic_, which is the
only reading that makes the register useful for sequencing. It is not a claim that the risk is live
today — nothing is deployed.

---

## 1. Gate matrix — all 32 gates

### Security

| Gate   | Requirement                | Status              | Tier | Evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | -------------------------- | ------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01 | Trusted identity context   | **PARTIAL**         | R3   | Transaction-scoped context exists, fails closed when absent, and is tested (`rls.test.ts`). But `app.actor_id` and `app.tenant_id` are caller-supplied session variables with no verification, and no authenticated principal model or `users` table exists on `main`. The gate's actual requirement — "client-supplied actor/tenant identifiers cannot create authority" — is not established. _In flight: PR #5 adds a verified-actor admin boundary._ |
| SEC-02 | Authority table protection | **NOT IMPLEMENTED** | R3   | No authority-bearing table exists on `main`, so nothing is protected and nothing is exposed. Constraint 7 holds vacuously. _In flight: PR #5 revokes all runtime writes on five authority tables and routes them through audited `SECURITY DEFINER` operations._                                                                                                                                                                                         |
| SEC-03 | Cross-tenant isolation     | **PARTIAL**         | R3   | Database layer only: RLS `ENABLE` + `FORCE` on all four tables, cross-tenant denial proven by `rls.test.ts` and `ledger.test.ts`. The gate requires DB **and** API, storage, cache, search, export, and vector paths. Six of seven layers do not exist to test.                                                                                                                                                                                          |
| SEC-04 | Privileged access          | **NOT IMPLEMENTED** | R3   | No MFA, no JIT elevation, no break-glass identity, no alerting, no access review. `freightos_control_plane` is a standing RLS-bypass login with no step-up and no review cadence. _In flight: PR #5 adds a `NOLOGIN` definer-owner model and a named `freightos_admin` operator connection._                                                                                                                                                             |
| SEC-05 | Secret protection          | **PARTIAL**         | R2   | `gitleaks` 8.24.3 scans **full history** in CI with `--exit-code=1`; `.env` gitignored; env validation fails closed; no production secret exists to leak. Missing: managed secret store, rotation procedure, tested rotation, secret-access logging, image/artifact scanning (no image is built).                                                                                                                                                        |

### Data and privacy

| Gate    | Requirement              | Status              | Tier | Evidence / gap                                                                                                                                                                                                                                                                                                                        |
| ------- | ------------------------ | ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATA-01 | Classification inventory | **PARTIAL**         | R2   | `docs/governance/DATA_CLASSIFICATION.md` defines classes and inventories the fields that exist. It does not carry the per-field owner, purpose, retention class, and sharing rule that `policies/data-classification.yaml` requires, and does not use the package's D0–D5 vocabulary. Retention periods are explicitly unset (OQ-12). |
| DATA-02 | Logging redaction        | **NOT IMPLEMENTED** | R3   | No logger, no telemetry emission, no redaction library, and therefore no test. `OTEL_EXPORTER_OTLP_ENDPOINT` is declared and unused.                                                                                                                                                                                                  |
| DATA-03 | Deletion                 | **NOT IMPLEMENTED** | R2   | No deletion engine, no deletion record, no propagation, no reconciliation report. Nothing to delete from.                                                                                                                                                                                                                             |

### Audit

| Gate   | Requirement       | Status      | Tier | Evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ----------------- | ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUD-01 | Append-only audit | **PARTIAL** | R3   | Strongest control present. `audit_events` is append-only by trigger **and** privilege revocation; proven by `ledger.test.ts` (15 tests). Attribution is complete in _shape_ (actor type, actor id, correlation, causation, policy version). Gaps: attribution is not _verified_ (see SEC-01); no hash chain or sequence linkage; audit shares the operational database, so Article V.3's "operationally isolated" is unmet; no retention policy. |

### Events and integration

| Gate   | Requirement    | Status              | Tier | Evidence / gap                                                                                                                                                                                                                                                                                                              |
| ------ | -------------- | ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EVT-01 | Idempotency    | **NOT IMPLEMENTED** | R3   | No idempotency-key store, no duplicate-request handling, no stable replayed response. The requirement is recorded in a comment at `0003_audit_and_outbox.up.sql:130` and nowhere implemented.                                                                                                                               |
| EVT-02 | Outbox / inbox | **PARTIAL**         | R3   | The outbox **table** is real, well-shaped (CloudEvents envelope, unique `event_id`, attempt counter, expiring claim lease), RLS-protected, `DELETE`/`TRUNCATE` revoked, and status transitions guarded by `app.outbox_guard()`. There is **no publisher, no consumer, no inbox, and no crash-window test**. Half a control. |
| EVT-03 | Reconciliation | **NOT IMPLEMENTED** | R3   | No reconciliation record, detector, owner assignment, or report. The package ships `schemas/reconciliation-record.schema.json`; nothing consumes it.                                                                                                                                                                        |

### Reliability

| Gate   | Requirement        | Status              | Tier | Evidence / gap                                                                                                                                                                                                                                                                                 |
| ------ | ------------------ | ------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REL-01 | Criticality / SLOs | **NOT IMPLEMENTED** | R2   | No service is classified A–D. No SLI, SLO, RTO, RPO, dashboard, alert, or on-call runbook exists. `policies/slo-defaults.yaml` is unused.                                                                                                                                                      |
| REL-02 | Degraded operation | **NOT IMPLEMENTED** | R3   | No workflow exists to degrade. No fail-open/fail-closed declaration per workflow, no last-known-good cache, no circuit breaker, no bulkhead. The model gateway's disabled-by-default posture is the only fail-closed dependency behavior, and it is configuration, not a tested degraded mode. |
| REL-03 | Cell isolation     | **NOT IMPLEMENTED** | R2   | No cell abstraction, no placement, no per-cell quota. ADR-0010 records the intent.                                                                                                                                                                                                             |
| REL-04 | Capacity           | **NOT IMPLEMENTED** | R2   | No load test, no declared demand, no headroom measurement.                                                                                                                                                                                                                                     |

### Disaster recovery

| Gate  | Requirement       | Status              | Tier | Evidence / gap                                                                                                                                                                                           |
| ----- | ----------------- | ------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DR-01 | Backup integrity  | **NOT IMPLEMENTED** | R4   | **No backup of any kind exists**, therefore no monitoring, no immutability, no cross-region copy. Tiered R4 because `02_…` §3 places unrecoverable data loss at R4 and this is the gap that produces it. |
| DR-02 | Restore proof     | **NOT IMPLEMENTED** | R4   | No restore has ever been performed. Migration reversibility is proven (`migrations.test.ts`), which is schema recovery, not data recovery, and must not be reported as satisfying this gate.             |
| DR-03 | Regional recovery | **NOT IMPLEMENTED** | R3   | No region is selected. No failover, no reconciliation after failover.                                                                                                                                    |

### Secure delivery

| Gate    | Requirement        | Status              | Tier | Evidence / gap                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------ | ------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDLC-01 | Protected delivery | **PARTIAL**         | R2   | CI is blocking, runs on every pull request, and nothing is `continue-on-error`. Work lands through reviewed pull requests; direct commits to `main` are prohibited by the constitution. Gaps: branch-protection settings are not evidenced in-repo, no `CODEOWNERS`, no signed commits, and **no artifact is built at all**, so "exact tested artifact promoted" has no subject. |
| SDLC-02 | Supply chain       | **NOT IMPLEMENTED** | R3   | No SBOM, no provenance attestation, no artifact signature, no deployment-time verification. `pnpm install --frozen-lockfile` and a committed lockfile are the only supply-chain controls.                                                                                                                                                                                        |
| SDLC-03 | Safe migration     | **PARTIAL**         | R3   | Every migration has a tested down path; apply → revert → re-apply and partial revert are proven against a live cluster (19 integration tests). **No expand-and-contract tooling, no backfill batching, no dual-version compatibility test** — `08_…` §7's actual requirement.                                                                                                    |
| SDLC-04 | Canary rollback    | **NOT IMPLEMENTED** | R3   | No deployment, no canary, no rollback automation.                                                                                                                                                                                                                                                                                                                                |

### Incident response

| Gate  | Requirement        | Status              | Tier | Evidence / gap                                                                                                                                                                                                                                        |
| ----- | ------------------ | ------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IR-01 | Incident readiness | **NOT IMPLEMENTED** | R2   | No named roles, no severity matrix in-repo, no contact path, no incident register, no evidence-preservation process. `docs/runbooks/` holds two files, neither an incident runbook. The package ships the matrix and templates; they are not adopted. |
| IR-02 | Exercise           | **NOT IMPLEMENTED** | R2   | No tabletop, no technical exercise.                                                                                                                                                                                                                   |

### AI and agents

| Gate  | Requirement          | Status              | Tier | Evidence / gap                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | -------------------- | ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI-01 | Agent registry       | **PARTIAL**         | R2   | 32 agents registered and schema-validated, with declared ceilings clamped in CI (25 of 32 clamped below their declared value) and a 12-verb physical-control denylist. Missing per gate: per-agent accountable owner (placeholder only), tool list (**empty for all 32**, which the registry itself defines as "no tool may be called"), limits, approval path, and per-agent kill switch. |
| AI-02 | Deterministic policy | **NOT IMPLEMENTED** | R3   | No policy engine, no action envelope, no authorization step. Also no agent runtime, so nothing is currently unauthorized either.                                                                                                                                                                                                                                                           |
| AI-03 | Injection resistance | **NOT IMPLEMENTED** | R3   | No prompt-injection, secret-exfiltration, cross-tenant-retrieval, or tool-abuse suite.                                                                                                                                                                                                                                                                                                     |
| AI-04 | Bounded remediation  | **NOT IMPLEMENTED** | R3   | No runbook automation, no rate limit, no rollback, no kill switch for remediation.                                                                                                                                                                                                                                                                                                         |
| AI-05 | No self-deployment   | **PARTIAL**         | R2   | Structurally satisfied today: there is no deployment path at all, and CI cannot merge or deploy. But it is satisfied by absence, not by an enforced control, and no test asserts it. Branch protection and required-review settings are not evidenced in the repository.                                                                                                                   |

### Vendors

| Gate   | Requirement            | Status              | Tier | Evidence / gap                                                                                                                                                          |
| ------ | ---------------------- | ------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VEN-01 | Critical vendor review | **NOT IMPLEMENTED** | R2   | No vendor is tiered V0–V3. `INTEGRATION_REGISTRY.md` lists intended integrations and their gating but performs no security, continuity, incident, data, or exit review. |
| VEN-02 | Connector containment  | **NOT IMPLEMENTED** | R3   | No connector exists. No per-connector credential, worker isolation, circuit breaker, kill switch, or reconciliation.                                                    |

### Roll-up

| Status          | Count |
| --------------- | ----- |
| PASS            | **0** |
| PARTIAL         | 11    |
| FAIL            | 0     |
| NOT IMPLEMENTED | 21    |

**No gate passes.** That is the correct and expected result for a repository with no deployable
unit, and it is stated plainly rather than softened.

---

## 2. Blockers, in the order required by the prompt

`20_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md` §C fixes the ordering. Each blocker below names what
must be true before the next layer is worth building.

### 1. Cross-tenant or fabricated-authority risk — **R3**

`app.actor_id` and `app.tenant_id` are caller-supplied and unverified; there is no principal,
membership, role, or permission model on `main`; there is no service tier to assign context from a
verified session. Every downstream control — audit attribution, policy decisions, agent authority,
approvals — inherits its trustworthiness from this. Nothing else should be built first.

_Mitigating context:_ the RLS substrate underneath is correct, forced, and tested, and PR #5 already
implements the identity model and a verified-actor mutation boundary. The blocker is real; the work
is largely done and unmerged.

### 2. Privileged and runtime database ownership risk — **R3**

`freightos_migrator` owns every object and holds `CREATEROLE`. It is correctly **not** a superuser
and **not** `BYPASSRLS`, and `FORCE ROW LEVEL SECURITY` binds it — that is the right shape. What is
missing is the separation the package requires: no `NOLOGIN` definer owners on `main`, no
distinction between deployment authority and runtime authority beyond `freightos_app`, and
`freightos_control_plane` is a standing unaudited RLS bypass with no step-up, expiry, or review.

### 3. Secrets and sensitive logging — **R2 now, R3 once anything runs**

Today: no production secret exists, and full-history secret scanning is enforced. The gap is
forward-looking and structural — there is **no logger and no redaction library**, so the first line
of logging code written will be written without a guardrail. `05_…` and `DATA-02` require D4/D5
values to be provably excluded. Building the redaction boundary _before_ the first service is
strictly cheaper than retrofitting it.

### 4. Unrecoverable data and untested backups — **R4**

No backup exists. No restore has ever been performed. This is the highest-tier gap in the register
and the only R4. It is not urgent _today_ because there is no production data, and it becomes
urgent the moment there is — which is why it must be sequenced before, not after, the first
environment carries real records.

### 5. Unsafe live external side effects and duplicate effects — **R3**

No live side effect exists, which is the correct state and is enforced by scope validation, unsigned
legal gates, and `MODEL_GATEWAY_ENABLED=false`. The gap is that **no idempotency store, no consumer
inbox, no reconciliation, and no connector containment exist**, so the first integration would be
built onto nothing. `EVT-01`, `EVT-02`, and `EVT-03` must precede the first connector.

### 6. Unaudited consequential actions — **R3**

Audit is append-only and well-shaped, and that is genuinely good. Two gaps: the recorded actor is
unverified (blocker 1), and audit is not operationally isolated from application writes — same
database, same failure domain, same backup that does not exist. Article V.3 requires isolation.

### 7. Unbounded agent authority — **R2 today**

Bounded by absence: no runtime, no tools, all 32 `allowed_tools` empty, ceilings clamped in CI, and
a physical-control denylist. The risk is that the bound is a _convention plus a validator_ rather
than a runtime gate, and the runtime gate (`AI-02`) does not exist. Sequencing constraint from
`18_…`: agent execution must not be implemented before identity, policy, audit, and idempotency.

### 8. Missing rollback and degraded behavior — **R3**

Schema rollback is proven. Application rollback, canary, feature-flag kill, degraded mode,
last-known-good configuration, and circuit breaking do not exist. `REL-02` requires AI plus two
critical external dependencies to be able to fail without unsafe core outage; there is no core to
keep up.

### 9. Remaining reliability and compliance evidence gaps — **R2**

No SLO, no error budget, no capacity test, no observability, no incident process, no vendor tiering,
no control catalog, no named risk owners. These are the largest volume of work and the least
dangerous to defer, provided they are not deferred past the point where a real environment exists.

---

## 3. Alignment with the existing risk register

`docs/governance/RISK_REGISTER.md` holds 15 build-scope risks (R-01…R-15) framed for Horizon 1
delivery, not for production security. The two registers do not conflict and should not be merged:

- R-03 (cross-tenant exposure) and R-04 (audit tampering) are marked _Mitigated_ there **for the
  code that exists**. That remains accurate at the database layer and is consistent with SEC-03 and
  AUD-01 being PARTIAL here — the difference is that the v1.3.0 gates require six more layers and
  verified attribution.
- R-14 (credentials in source) _Mitigated_ is consistent with SEC-05 PARTIAL.
- Nothing in `RISK_REGISTER.md` covers backups, restore, SLOs, incident response, supply chain, or
  vendor risk. Those enter the project through this document.

**Proposed change (needs owner agreement, not made here):** add an R0–R4 tier column to
`RISK_REGISTER.md` and cross-reference it to this register, rather than maintaining two vocabularies.

---

## 4. Decisions from `22_DECISIONS_REQUIRED.md` that are already answerable

Recorded so the owner sees which are genuinely open and which the repository has effectively
settled.

| Decision                    | Required before | Repository position                                                                                                                                                                        |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity provider strategy  | Phase 1         | **Open.** No provider chosen. The package recommends managed identity; the repository builds authorization internally and has no authentication at all.                                    |
| Policy engine               | Phase 1         | **Open.** No engine. `config/policy/base_policy.yaml` holds vocabularies without rules.                                                                                                    |
| Highly sensitive encryption | Phase 2         | Open. No KMS, no field encryption.                                                                                                                                                         |
| Audit retention             | Phase 2         | Open. Audit exists; retention is unset (OQ-12).                                                                                                                                            |
| Event platform              | Phase 3         | Open. Outbox table only; no broker selected.                                                                                                                                               |
| Exactly-once policy         | Phase 3         | **Effectively settled by design** — the outbox carries a unique `event_id` and a claim lease, consistent with at-least-once delivery plus idempotent consumers. Needs recording as an ADR. |
| Production SLOs             | Phase 4         | Open. `policies/slo-defaults.yaml` unused.                                                                                                                                                 |
| Primary cloud and region    | Phase 5         | **Deliberately open** — Phase 0 was forbidden from selecting a provider.                                                                                                                   |
| Backup isolation            | Phase 5         | Open.                                                                                                                                                                                      |
| AI provider data policy     | Phase 6         | **Partially settled** — `MODEL_GATEWAY_ENABLED=false`, provider-independent gateway (ADR-0009/0016), no provider selected, so no training-rights exposure exists yet.                      |
| Agent execution ceiling     | Phase 6         | **Settled and enforced** — every carrier agent resolves to A3 or lower in Horizon 1; `AUTONOMOUS_DISPATCH_A4_ENABLED` is mandatory-`false`; 25 of 32 agents clamped in CI.                 |
| Autonomous remediation      | Phase 6         | Open. Nothing implemented; Level 1 is the package's recommended start.                                                                                                                     |
| Cell placement unit         | Phase 7         | Open. ADR-0010 records intent only.                                                                                                                                                        |
| External assurance          | Phase 8         | Open.                                                                                                                                                                                      |
