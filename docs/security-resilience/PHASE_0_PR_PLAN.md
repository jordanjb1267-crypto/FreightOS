# Phase 0 — Proposed Pull-Request Plan

Deliverable D of `20_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`. Repository-specific, aligned to
`18_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md`, and ordered by the blocker sequence in
[`PHASE_0_GAP_AND_RISK_REGISTER.md`](PHASE_0_GAP_AND_RISK_REGISTER.md) §2.

Nothing in this plan is authorized to start. It is the plan the prompt asks for; the owner decides
what proceeds.

---

## D-0. The sequencing problem, stated before the plan

**Three roadmaps are simultaneously active against one repository, and none of them references the
other two.**

| Roadmap                                     | Where                                             | Progress                                                      |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| v1.2 Horizon 1 Phase 1 — ten-PR sequence    | `docs/decisions/0002-phase-1-owner-rulings.md` §5 | PR 1 merged; **PR 2 in flight** (PR #5); PRs 3–10 not started |
| v1.3.0 security and resilience — Phases 0–8 | `18_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md`        | Phase 0 PR 0.1 merged; PR 0.2 is this document                |
| v1.4.0 network architecture — Phases 0–7    | v1.4.0 `23_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md` | not started                                                   |

They overlap rather than conflict, and the overlap is substantial:

- v1.3.0 PR 1.1 + PR 1.2 ≈ v1.2 Phase 1 PR 2 (identity and organization foundation) — **the same
  work**, currently in flight as PR #5.
- v1.4.0 PR 4 (transactional outbox) ≈ v1.3.0 PR 3.2 — the same work.
- v1.4.0 PR 3 (universal event envelope) ≈ v1.2 Phase 1 PR 6 (event contracts).
- v1.3.0 PR 1.3 (cross-tenant isolation suite) has no counterpart in either other roadmap and is
  purely additive.

**Recommended reading, offered for approval rather than adopted:** treat v1.2's ten-PR sequence as
the _delivery spine_ — it is the only roadmap with owner-approved, repository-specific PRs — and
treat v1.3.0 and v1.4.0 as **cross-cutting requirement sets that attach to that spine**, plus a
small number of standalone infrastructure PRs (below) that have no domain counterpart. That
satisfies constraint 3's "in order" requirement in substance without running three parallel
sequences over one codebase, and it avoids the large-bang rewrite constraint 2 forbids.

**This is an owner decision (see §D-9, item 1). Until it is made, the plan below sequences only the
standalone security work, which does not collide with any v1.2 domain PR.**

---

## D-1. SR-1 — Phase 0 intake (this pull request)

| Field                   | Value                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Roadmap**             | v1.3.0 PR 0.2 — current-state inventory                                                                                             |
| **Objective**           | Deliver the Phase 0 governance intake, security and reliability inventory, gate-mapped gap register, and this plan                  |
| **Files**               | `docs/security-resilience/README.md`, `PHASE_0_INVENTORY.md`, `PHASE_0_GAP_AND_RISK_REGISTER.md`, `PHASE_0_PR_PLAN.md`              |
| **Migration impact**    | none                                                                                                                                |
| **Security invariants** | no runtime code; no permission, credential, or side effect changed; no secret value recorded                                        |
| **Tests / evidence**    | `pnpm verify` exit 0; `pnpm test` 56 passed; `pnpm test:integration` 49 passed; both handoff `MANIFEST.sha256` verifications exit 0 |
| **Rollback**            | revert the merge commit; no runtime effect either way                                                                               |
| **Dependencies**        | none                                                                                                                                |
| **Owner approval**      | none required to _write_ it; §D-9 lists what it escalates                                                                           |

---

## D-2. SR-2 — Verified actor binding _(first implementation PR)_

| Field       | Value                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| **Roadmap** | completes v1.3.0 PR 1.1 (_trusted server-side actor and tenant context_) — gate SEC-01 |
| **Blocker** | #1, cross-tenant / fabricated authority, R3                                            |

**Objective.** Make it structurally impossible for a caller to place an unverified identifier into
`app.actor_id`. Today `withLegalContext()` accepts whatever string it is handed. After this PR the
actor field of a `LegalContext` can only be produced by resolving a principal against the identity
tables, and a raw string is a type error.

**Files likely affected.**
`packages/context/src/legal.ts` (introduce a nominal `VerifiedActor`),
`packages/identity/src/` (new `resolve-actor.ts` — resolve a user or service-account principal to a
`VerifiedActor`, refusing revoked, inactive, out-of-window, or wrong-tenant principals),
`packages/database/src/session.ts` (accept only `VerifiedActor`),
plus every call site and test fixture.

**Migration impact.** None expected. If the resolution query needs an index, it is an additive
`CREATE INDEX` with a matching `DROP` in the down migration. No destructive change.

**Security invariants.**

1. A `VerifiedActor` cannot be constructed from a string literal anywhere outside the resolver.
2. Resolution failure refuses; it never falls back to the supplied value.
3. Resolution is tenant-scoped: a principal from another tenant resolves to a refusal, and the
   refusal reason is identical to "does not exist" so the boundary is not an existence oracle.
4. `system:` actors follow a separate, explicitly allowlisted path and cannot be minted by request
   input.

**Tests and evidence.** Fabricated-actor, borrowed-actor, cross-tenant-actor, revoked-actor, and
expired-window refusals; a compile-fail fixture proving a bare string is rejected by the type
system; the existing 370 in-flight integration tests still passing.

**Rollback.** Revert the merge; the previous signature is restored. No data change.

**Dependencies.** **PR #5 must merge first** — the identity tables it resolves against live there.
If PR #5 does not merge, this PR cannot start, and SR-7 or SR-8 below become the first PR instead.

**Owner approval.** Whether `system:` actors are allowlisted in configuration or in the database.

---

## D-3. SR-3 — Cross-tenant isolation suite as a CI blocker

| Field       | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| **Roadmap** | v1.3.0 PR 1.3 — gate SEC-03; also satisfies the Phase 1 phase gate |
| **Blocker** | #1, R3                                                             |

**Objective.** A single named suite that must pass for any merge, asserting cross-tenant denial on
every storage and retrieval path that exists — and failing loudly when a _new_ path is added without
a test, so the suite cannot silently fall behind the architecture.

**Files.** `packages/database/test/integration/cross-tenant-isolation.test.ts` (new), a small
layer-registry module listing every isolation-bearing path with the test that covers it, a CI step,
and a validator that fails when a registered layer has no test or an unregistered client library
appears in `package.json`.

**Migration impact.** None.

**Security invariants.** Six or more varied unauthorized identities — absent context, wrong tenant,
fabricated tenant, fabricated actor, revoked membership, cross-tenant service account — collapse to
the _same_ denied outcome and the same error text. No runtime owner or superuser access is used
anywhere in the suite; a test that connects as superuser fails the suite, because RLS does not apply
to superusers and such a test proves nothing.

**Tests and evidence.** The suite itself is the evidence. Required: exact `vitest` output and exit
status, plus a deliberate-regression demonstration — remove one policy, show the suite fails.

**Rollback.** Revert; CI loses a blocking step, nothing else.

**Dependencies.** SR-2 for the identity-derived cases; the database-only cases can land first.

**Owner approval.** None. This is additive and cannot weaken anything.

---

## D-4. SR-4 — Audit plane isolation and integrity chain

| Field       | Value                       |
| ----------- | --------------------------- |
| **Roadmap** | v1.3.0 PR 2.1 — gate AUD-01 |
| **Blocker** | #6, R3                      |

**Objective.** Close the two AUD-01 gaps named in the register: audit records share a schema and a
failure domain with application data, and consecutive records are not linked, so a deletion at the
storage layer is undetectable.

**Files.** New migration `00NN_audit_plane.up.sql` / `.down.sql`: move `audit_events` behind a
dedicated `audit` schema owned by a `NOLOGIN` role; expose insertion only through a
`SECURITY DEFINER` function with a pinned `search_path`; revoke direct `INSERT` from
`freightos_app`; add a monotonic per-tenant sequence and a `prev_hash`/`record_hash` chain computed
in the definer, not by the caller. Runbook `docs/runbooks/audit-plane.md`.

**Migration impact.** Expand-and-contract, mandatory. Add the new path, dual-write, backfill the
chain in bounded batches, verify counts and hashes, switch readers, and only then revoke the old
grant — in a later migration. `08_…` §7 prohibits a destructive change plus a code dependency in one
irreversible step. Down migration restores the direct grant.

**Security invariants.** No role that can write application data can write, edit, or delete an audit
record directly. The chain is computed inside the definer from the stored predecessor; a caller
cannot supply either hash. Breaking a link is detectable by a verification query. Audit remains
readable under the same tenant isolation.

**Tests and evidence.** Existing `ledger.test.ts` extended: direct insert as `freightos_app` fails;
tampering with a middle record is detected by chain verification; the migration's expand phase is
proven backward compatible by running the pre-migration test suite against the post-expand schema.

**Rollback.** Down migration restores prior grants and drops the chain columns. Because the change
is expanded before it is contracted, rollback never loses records.

**Dependencies.** SR-2 (so recorded actors are verified — an integrity chain over unverified
attribution is precision without accuracy).

**Owner approval.** Whether audit moves to a separate _database_ rather than a separate schema.
A separate schema is the cheap 80%; a separate database is what Article V.3's "operationally
isolated" most defensibly means, and it is a real architecture decision with cost. Recommended
default: separate schema now, separate database as a recorded Phase 2 obligation.

_Related carry-forward:_ PR #5 records `ROLLBACK_INDEPENDENT_DENIAL_AUDIT` as deferred to Phase 3 —
denial records currently roll back with the transaction that produced them. That remains open and
belongs to this workstream.

---

## D-5. SR-5 — Classification metadata, redaction library, logging guardrail

| Field       | Value                                  |
| ----------- | -------------------------------------- |
| **Roadmap** | v1.3.0 PR 2.2 — gates DATA-01, DATA-02 |
| **Blocker** | #3, R2 now / R3 once anything runs     |

**Objective.** Build the redaction boundary _before_ the first line of logging code exists. There is
currently no logger, which makes this the cheapest it will ever be.

**Files.** New `packages/telemetry` — a logger that accepts only structured fields carrying a
declared D0–D5 classification, refuses D4/D5 at the type level, and irreversibly redacts anything
unclassified. `docs/governance/DATA_CLASSIFICATION.md` restructured onto the package's D0–D5
vocabulary with per-field owner, purpose, retention class, and sharing rule, per
`templates/DATA_PROCESSING_INVENTORY_TEMPLATE.md`. An ESLint rule banning `console.*` outside the
telemetry package.

**Migration impact.** None.

**Security invariants.** A D4/D5 value cannot reach a log, trace, metric label, or error message.
An unclassified value is redacted, not passed through — fail closed, not fail open. Redaction is
irreversible, not masking that can be inverted.

**Tests and evidence.** Property-based tests over generated payloads asserting no D4/D5 value
appears in output; a compile-fail fixture; a lint-failure fixture.

**Rollback.** Revert; nothing depends on it yet, which is the point of doing it first.

**Dependencies.** None. **This PR is unblocked today** and does not require PR #5.

**Owner approval.** Retention periods per class (OQ-12, needs counsel). The library can ship with
retention _classes_ declared and periods marked `POLICY_REQUIRED`, matching the pattern ADR-0025
already established for detention.

---

## D-6. SR-6 — Idempotency store, outbox publisher, consumer inbox

| Field       | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| **Roadmap** | v1.3.0 PR 3.1–3.3; also v1.4.0 PR 4 — gates EVT-01, EVT-02, EVT-03 |
| **Blocker** | #5, R3                                                             |

**Objective.** Give the existing outbox table a publisher and a consumer, and add the idempotency
store that does not exist. Explicitly: at-least-once delivery with idempotent consumers and
exactly-once _business effects_ — never a claim of exactly-once delivery.

**Files.** Migration adding `inbox_events` (consumer dedupe, unique on consumer + `event_id`) and
`idempotency_keys` (scope, key, request digest, stored response, expiry). New
`packages/events` with a publisher honouring the existing claim lease, bounded retry with
backoff, a dead-letter status, and a replay path. Reconciliation record per
`schemas/reconciliation-record.schema.json`.

**Migration impact.** Purely additive tables and indexes; both reversible.

**Security invariants.** The publisher runs under tenant context and cannot read across tenants. A
replayed key returns the stored response without re-executing the effect. A duplicate delivery
produces one business effect. Dead-lettered events are visible and cannot be silently dropped.
No external side effect is enabled by this PR — the publisher's only sink is an in-repository
test double.

**Tests and evidence.** Crash-window tests: kill the publisher mid-claim and prove no loss and no
duplicate; duplicate, reordered, and delayed delivery; lease expiry; replay after dead-letter. Per
`15_…` §4 these are bounded fault-injection experiments with declared abort conditions.

**Rollback.** Down migration drops the additive tables; the publisher is a separate package that can
be disabled by configuration before revert.

**Dependencies.** SR-2 (publisher needs a verified system actor); SR-4 (dispatch decisions are
consequential and must be audited).

**Owner approval.** Event-platform selection (`22_…`, required before Phase 3). This PR can and
should be built against the PostgreSQL outbox only, deferring broker selection — which is also the
`21_…` §5 warning about not making a global service a synchronous dependency.

---

## D-7. SR-7 — Criticality registry, SLO definitions, degraded-mode declarations

| Field       | Value                                      |
| ----------- | ------------------------------------------ |
| **Roadmap** | v1.3.0 PR 4.1 / 4.3 — gates REL-01, REL-02 |
| **Blocker** | #9, R2                                     |

**Objective.** Make the A–D criticality model and the SLO defaults real repository artifacts that
CI enforces, rather than unused files in a handoff package.

**Files.** `config/reliability/service-criticality.yaml` and `config/reliability/slo.yaml` (root
operational copies following the existing generated-copy-plus-provenance pattern), a validator
extension in `scripts/` asserting that every declared component has a class, an owner, a degraded
mode, and — for Class A/B — a runbook file that exists. `docs/runbooks/` entries for each.

**Migration impact.** None.

**Security invariants.** None directly; a declared degraded mode must be fail-closed for anything
authority-bearing, and the validator enforces that an authority-bearing component cannot declare a
fail-open degraded mode.

**Tests and evidence.** Validator negative tests: a component without an owner fails; a Class A
component without a runbook fails; an authority component declaring fail-open fails.

**Rollback.** Revert; CI loses a step.

**Dependencies.** None. **Unblocked today.**

**Owner approval.** Whether to adopt `policies/slo-defaults.yaml` as-is (the package's own
recommendation) or revise after measured load. Recommended: adopt as _initial targets, not external
commitments_, exactly as the file already labels itself.

---

## D-8. SR-8 — Supply-chain evidence in CI

| Field       | Value                             |
| ----------- | --------------------------------- |
| **Roadmap** | v1.3.0 PR 5.1 — gate SDLC-02      |
| **Blocker** | #9, R2 (R3 once anything deploys) |

**Objective.** Produce SBOM and provenance for what the repository actually builds, add the
source-control controls `08_…` §2 requires that cost nothing today, and close the governance-integrity
gap recorded in the intake — **CI verifies the v1.2 package checksums only; the v1.3.0 and v1.4.0
`MANIFEST.sha256` files are not verified by any automated check.**

**Files.** `.github/workflows/ci.yml` (SBOM generation, provenance attestation, dependency and
license scan, plus a `sha256sum -c MANIFEST.sha256` step for each of the two newer packages),
`.github/CODEOWNERS` (identity, authorization, migrations, agent config, CI, and security controls),
and a documented branch-protection expectation.

**Migration impact.** None.

**Security invariants.** No new credential is introduced. The SBOM and attestation are artifacts of
CI, not of a deployment, and this PR must not be described as satisfying SDLC-02's
"deployment-time verification" half — there is no deployment.

**Tests and evidence.** CI run producing an SBOM with a recorded digest; a `CODEOWNERS`-required
review demonstrated on the PR itself.

**Rollback.** Revert the workflow change.

**Dependencies.** None. **Unblocked today.**

**Owner approval.** Branch-protection and required-review settings are repository _settings_, not
files. Only the owner can change them, and SDLC-01 and AI-05 cannot be evidenced without them.

---

## D-9. Owner decisions required

Ordered by what they block.

1. **Roadmap reconciliation — blocks everything.** Three active roadmaps (§D-0). Which sequence
   governs, and does the recommendation to treat v1.2's ten-PR spine as primary with v1.3.0/v1.4.0
   attached as cross-cutting requirements stand? Without this, any implementation PR risks being
   out of order under one of the three.

2. **PR #5 disposition — blocks SR-2, SR-3, SR-4, SR-6.** PR #5 delivers substantially all of
   v1.3.0 PR 1.1 and PR 1.2. Is it accepted as satisfying those, with SR-2 completing the
   trusted-actor requirement? Or are they separate follow-on work? It remains unmerged and under
   independent rereview; no gate is scored on it either way.

3. **Audit isolation depth — blocks SR-4.** Separate schema (recommended now) versus separate
   database (the stronger reading of Article V.3). Cost and operational complexity differ
   materially.

4. **Backup and restore — highest tier in the register (R4), blocked on infrastructure.** No backup
   exists and no restore has ever been performed. Implementation requires a cloud and region
   decision, which `22_…` places before Phase 5 and which Phase 0 was explicitly forbidden from
   making. **The decision should be sequenced earlier than the implementation**, so that the first
   environment holding real records is not the one that discovers it has no recovery path.

5. **Named risk owners — blocks IR-01 and every evidence gate that needs an approver.**
   `02_…` §2 requires nine roles. None is assigned. One person may hold several, but the record must
   distinguish them, and `19_…` §Release rule forbids the implementer of a change from waiving its
   own failed R3/R4 gate — which is unenforceable while every role is one unnamed person.

6. **Repository settings — blocks SDLC-01 and AI-05.** Branch protection, required reviews, and
   force-push prohibition cannot be set from a pull request.

7. **Retention periods — blocks DATA-01 completion and audit retention.** OQ-12, open since Phase 0,
   needs counsel. SR-5 can ship with periods marked `POLICY_REQUIRED`.

8. **Event platform selection — needed before Phase 3 completes, not before SR-6 starts.**
   SR-6 should be built against the PostgreSQL outbox alone.

---

## D-10. What this plan deliberately does not propose

- **No agent runtime, policy engine, or remediation automation.** `18_…` §Sequencing constraints
  forbids agent execution before identity, policy, audit, and idempotency foundations. Gates
  AI-02 through AI-04 stay NOT IMPLEMENTED until SR-2, SR-4, and SR-6 are done.
- **No cell or region work.** `18_…` forbids claiming multi-region resilience before exercising it,
  and no region exists.
- **No connector, webhook, payment, dispatch, or roadside path.** Constraint 9, and the legal gates
  in `checklists/` are unsigned.
- **No change to Horizon 1 scope, pricing, module states, autonomy ceilings, or deferred-module
  flags.** The v1.3.0 package is additive; it does not authorize scope expansion, and
  `scripts/validate-scope.mjs` would fail the build if any of this plan tried.
- **No large-bang rewrite.** Every PR above is independently reviewable, individually revertable,
  and leaves the repository releasable.
