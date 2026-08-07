# Phase 0 — Proposed Pull-Request Plan

Deliverable D of `20_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`. Repository-specific, aligned to
`18_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md`, and ordered by the blocker sequence in
[`PHASE_0_GAP_AND_RISK_REGISTER.md`](PHASE_0_GAP_AND_RISK_REGISTER.md) §2.

Only SR-1 is delivered. Nothing else in this plan is authorized to start; SR-2 in particular is
explicitly gated by owner ruling 4 and must not begin until the post-merge baseline is returned and
accepted.

---

## D-0. Roadmap hierarchy — decided

**Owner ruling 1. This is no longer an open blocker.** The earlier framing of "three simultaneously
active roadmaps" is superseded by a single spine with two mandatory overlays.

| Rank | Roadmap                                                                                   | Role                                                                   | Progress                                                      |
| ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | v1.2 approved ten-PR Phase 1 sequence (`docs/decisions/0002-phase-1-owner-rulings.md` §5) | **Primary delivery spine**                                             | PR 1 merged; **PR 2 in flight** (PR #5); PRs 3–10 not started |
| 2    | v1.3.0 security and resilience (`18_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md`)               | **Mandatory cross-cutting control and acceptance overlay**             | Phase 0 PR 0.1 merged; PR 0.2 is this document                |
| 3    | v1.4.0 network architecture (v1.4.0 `23_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md`)           | **Mandatory cross-cutting architectural and interoperability overlay** | not started                                                   |

**The newer packages do not create separate competing implementation programs.** Their internal phase
numbering describes requirement sets, not an independent schedule.

### Per-PR obligation

Every remaining v1.2 spine PR must identify, in its description and its evidence:

1. applicable **v1.3.0 controls and gates**;
2. applicable **v1.4.0 architecture requirements**;
3. **evidence produced** for each applicable requirement;
4. any **conflict requiring owner approval**.

### Evidence rule

**No requirement may be marked satisfied merely because it appears in documentation.** Acceptance
requires repository and test evidence — the same rule already applied to the gate matrix.

### How the overlaps resolve under the hierarchy

The overlaps identified during intake are real; the hierarchy tells each one where it lands.

| Overlap                                                             | Resolution                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| v1.3.0 PR 1.1 + 1.2 ≈ v1.2 Phase 1 PR 2 (identity and organization) | Spine PR 2 (PR #5) is the delivery. v1.3.0 SEC-01/SEC-02 are the acceptance overlay on it. SR-2 completes SEC-01 where PR #5 stops short. |
| v1.4.0 PR 4 (transactional outbox) ≈ v1.3.0 PR 3.2                  | One piece of work — SR-6 — satisfying both overlays. Not two PRs.                                                                         |
| v1.4.0 PR 3 (event envelope) ≈ v1.2 Phase 1 PR 6 (event contracts)  | Delivered by spine PR 6, with the v1.4.0 envelope requirements as its architecture overlay.                                               |
| v1.3.0 PR 1.3 (cross-tenant isolation suite)                        | No spine counterpart. Standalone overlay work — SR-3.                                                                                     |

### Overlay-only PRs

SR-2 through SR-12 below are overlay work with **no spine counterpart**. They do not compete with the
v1.2 sequence and are not a second program; each exists because a control, an architectural
requirement, or a governance rule has nowhere in the domain sequence to attach.

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

## D-2. SR-2 — Verified actor binding _(first runtime security implementation objective)_

| Field       | Value                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| **Roadmap** | completes v1.3.0 PR 1.1 (_trusted server-side actor and tenant context_) — gate SEC-01 |
| **Blocker** | #1, cross-tenant / fabricated authority, R3                                            |
| **Status**  | **BLOCKED — owner ruling 4. Not started, and must not start yet.**                     |

**Owner ruling 4 confirms this as the first runtime security implementation objective**, because
fabricated actor or tenant authority is the highest immediate control risk. It also fixes hard
preconditions, none of which is currently met.

### D-2.0 Preconditions — every one is mandatory

| #   | Precondition                                                                          | Current state                                                   |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | PR #5 completes **final independent rereview**                                        | not started — `get_reviews` returns `[]`                        |
| 2   | PR #5 **merges**                                                                      | open, unmerged, `mergeable_state: clean`, CI green at `0ca3628` |
| 3   | PR #5 is **verified on `main`**                                                       | n/a until merged                                                |
| 4   | Local `main` updated, **clean tree confirmed**                                        | n/a                                                             |
| 5   | Authority model **re-evaluated against the merged state**                             | n/a                                                             |
| 6   | Relevant authority and tenant-boundary tests **reproduced against the merged commit** | n/a                                                             |
| 7   | Post-merge baseline and exact PR plan **returned to the owner and accepted**          | n/a                                                             |

Two of these deserve emphasis because they are easy to skip:

- **SR-2 is not cut from PR #5's branch, and not from a moving target.** It is cut from `main` after
  the merge. Building against an unmerged branch would stack security work on unreviewed security
  work.
- **PR #5's own report is explicitly not sufficient evidence.** Its verification table (254 unit,
  248 integration, later 370 integration after remediation) was produced on its own branch. The
  authority and tenant-boundary tests must be **re-run against the merged commit on `main`**, and the
  merged behaviour re-read from the merged SQL — a rebase or a merge commit can change what is
  actually in force.

### D-2.1 Objective

Make it structurally impossible for a caller to place an unverified identifier into `app.actor_id`
or `app.tenant_id`. Today `withLegalContext()` accepts whatever strings it is handed. Afterwards, the
actor and tenant fields of a `LegalContext` can only be produced by deriving them from a verified
principal, and a bare string is a type error.

**Scope is SEC-01 and nothing else.** Not SEC-02, not SEC-03, not audit-plane isolation, not
redaction, and **no dependency upgrade** — owner instruction is explicit that dependency work must
not be mixed into SR-2.

### D-2.2 Required contents — the eleven items owner ruling 4 enumerates

| #   | Requirement                                                            | Planned implementation                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Trusted actor derivation**                                           | A `resolveActor()` in `packages/identity` that takes an authentication result — never a request field — and resolves it against `users` / `service_accounts` for the tenant, returning a nominal `VerifiedActor` or refusing. Construction of `VerifiedActor` is impossible outside the resolver.                                                                                                                           |
| 2   | **Trusted organization / tenant derivation**                           | The tenant is **derived from the resolved principal's membership**, not accepted alongside it. A caller cannot pass a tenant at all; passing one becomes a type error. This closes the larger half of the gap — today a holder of the app credential can select any tenant.                                                                                                                                                 |
| 3   | **Elimination of caller-controlled identity as independent authority** | `applyLegalContext()` and `withLegalContext()` accept only `VerifiedActor` + derived scope. A compile-fail fixture proves a string literal is rejected. Constraint 6 is the invariant under test.                                                                                                                                                                                                                           |
| 4   | **Runtime-role restrictions**                                          | Assert, in an integration test rather than in prose, that `freightos_app` holds no privilege that would let it forge a principal: no write on identity tables (verified against the merged 0017 boundary), no ownership, no `BYPASSRLS`, no `SET ROLE` reachability to a definer owner.                                                                                                                                     |
| 5   | **Control-plane authority boundaries**                                 | `app.is_control_plane()` must not be reachable from an app-role session however context is set; `freightos_control_plane` and `freightos_admin` paths remain separate and audited; a test asserts an app session cannot escalate into either.                                                                                                                                                                               |
| 6   | **Cross-tenant negative tests**                                        | Every resolution path attempted across a tenant boundary refuses, and the refusal is **indistinguishable from "does not exist"** so the boundary is not an existence oracle.                                                                                                                                                                                                                                                |
| 7   | **Fabricated, borrowed, stale, and revoked identity tests**            | Four distinct suites: an identifier that never existed; a valid identifier belonging to another principal; a principal resolved before a revocation and used after it; a principal whose membership is revoked, inactive, or outside its effective window. All refuse identically.                                                                                                                                          |
| 8   | **Service-account behavior**                                           | Service accounts resolve through the same boundary as humans, carry their own credential-type constraints, and cannot acquire a human principal's scope. A service account from tenant A resolving in tenant B refuses.                                                                                                                                                                                                     |
| 9   | **Audit attribution**                                                  | Every `audit_events` row written after this PR carries an actor that was **verified**, not asserted. A test asserts that no code path can write an audit row with an unverified actor. This is what makes AUD-01's attribution meaningful rather than shaped.                                                                                                                                                               |
| 10  | **Migration and rollback behavior**                                    | Expected: no schema change. If resolution needs an index, it is an additive `CREATE INDEX` with a matching `DROP` in the down migration, and the apply → revert → re-apply cycle is proven as it is for every existing migration. No destructive change; no combined destructive-schema-plus-code-dependency step (`08_…` §7).                                                                                              |
| 11  | **Compatibility with the v1.4.0 network identity model**               | Checked against v1.4.0 `03_NETWORK_PARTICIPANT_IDENTITY_GRAPH.md` before implementation. The nominal type and the resolver signature must not foreclose the network participant graph — in particular, canonical immutable IDs with versioned external aliases (v1.4.0 gate NA-01) and cross-organization deny-by-default (NA-02). If the two models conflict, that is a §D-9 escalation, not something to resolve in code. |

### D-2.3 Files likely affected

`packages/context/src/legal.ts` (nominal `VerifiedActor`, derived scope type),
`packages/identity/src/resolve-actor.ts` (new),
`packages/database/src/session.ts` (accept only verified inputs),
`packages/database/test/integration/` (new authority suites),
plus call sites and fixtures. **Exact list is not knowable until the merged `main` exists** — that is
part of what the post-merge baseline returns.

### D-2.4 Evidence required before SR-2 can be called done

Reproduced against the merged commit, with exact exit statuses: `pnpm verify`, `pnpm test`,
`pnpm test:integration`, the migration apply/revert/re-apply cycle, and the new authority suites.
Plus a **deliberate-regression demonstration**: remove the derivation, show the new tests fail.

### D-2.5 Rollback

Revert the merge; the previous signatures return. No data change, so no data rollback.

### D-2.6 Owner approval still required

- Whether `system:` actors are allowlisted in configuration or in the database.
- If the v1.4.0 identity graph and the PR #5 authority model disagree on canonical identifier
  semantics, which controls.

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

| Field       | Value                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Roadmap** | v1.3.0 PR 2.2 — gates DATA-01, DATA-02                                                                                                |
| **Blocker** | #3, R2 now / R3 once anything runs                                                                                                    |
| **Status**  | **Proposal only. Owner ruling 5 permits preparation while PR #5 is pending.** No code has been written and no branch has been opened. |

**Objective.** Build the redaction boundary _before_ the first line of application logging exists.
There is currently **no logger anywhere in the repository**, which makes this the cheapest it will
ever be, and makes it the only security control that gets harder every day it waits.

Owner ruling 5 states the requirement directly: _the redaction control must exist before broad
application logging is introduced._

### D-5.1 Isolation — the condition on which this work is permitted

Owner ruling 5 permits code only if it is isolated from identity and authorization, database
ownership, RLS policies, PR #5 files, migrations, live integrations, and production deployment.
The design below satisfies every one, and the isolation is structural rather than promised:

| Must be isolated from      | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity and authorization | `packages/telemetry` has **no dependency on `packages/identity`**. It never resolves a principal and never reads an authorization decision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Database ownership         | It opens no database connection. `pg` is not a dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| RLS policies               | It touches no table and no policy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PR #5 files                | **One mechanical overlap, stated exactly.** Verified with `git diff --name-only origin/main...origin/claude/phase-1-pr-2-identity-organization`. SR-5 would add `packages/telemetry/**` (new — no overlap), edit `eslint.config.js` (**PR #5 does not touch it**), and add one importer entry to `pnpm-lock.yaml` (**PR #5 does touch it** — a lockfile line, not a semantic conflict). `vitest.workspace.ts` and `eslint.config.js` need no edit for discovery: their globs are `packages/*/test/unit/**` and `packages/**/*.ts`, so a new package is picked up automatically. `docs/governance/DATA_CLASSIFICATION.md` **is** touched by PR #5, so the classification-register rewrite is deferred out of the code PR entirely (§D-5.4). |
| Migrations                 | None. No `.sql` file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Live integrations          | No network client. No exporter is configured; the sink is in-process.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Production deployment      | Nothing is deployed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Under ADR-0024 layering, `packages/telemetry` sits at **L1** alongside `packages/context` — it
depends on nothing in the workspace, so it introduces no same-layer or upward edge and
`validate-scope.mjs`'s `PACKAGE_LAYERING` check is satisfied by construction.

**No branch has been opened.** Opening one now would stack a second security branch beside PR #5 and
PR #8, which owner ruling 5 warns against. Awaiting explicit instruction on whether to cut it from
`main` after PR #8 merges.

### D-5.2 Design — fail-safe by construction

The control is a **type-directed structured logger**, not a regex scrubber over free text. A regex
scrubber fails open on the value it did not anticipate; a type boundary fails closed on the value
nobody classified.

1. **Nothing is loggable until it is classified.** The logger accepts a map of
   `Classified<T>` values, each carrying a D0–D5 tag from
   `policies/data-classification.yaml`. A bare `string`, `object`, or `unknown` is a **compile
   error**, not a runtime warning.
2. **D4 and D5 are rejected at the type level.** `policies/data-classification.yaml` states
   `D4.logs_and_prompts: prohibited`. The logger's signature accepts `D0 | D1 | D2 | D3` only, so a
   D4/D5 value cannot be passed. Where a D4/D5 field must be referenced, only a
   non-reversible token derived from it may be logged.
3. **Unclassified input is redacted, never passed through.** The runtime path — for values crossing
   a boundary the type system cannot see, such as a caught error's `message` — replaces the value
   with a fixed marker. Fail closed.
4. **Redaction is irreversible.** A fixed marker, or a keyed digest that cannot be inverted without
   the key. Not masking that leaves a recoverable prefix and suffix.
5. **The default sink drops.** With `OTEL_EXPORTER_OTLP_ENDPOINT` empty, records go nowhere — the
   posture `.env.example` already documents. No exporter is configured by this PR.
6. **Errors are wrapped, not logged raw.** A raw `Error` may carry a connection URI or a query
   parameter in its message; the wrapper classifies before emission.
7. **`console.*` is banned outside the package** by an ESLint rule, so the guardrail cannot be
   bypassed by convenience.

### D-5.3 Required test matrix

Owner ruling 5 requires proof for six data categories across supported logging paths. Each cell is a
test that **fails on the pre-fix version and passes after** — the standard `15_…` §6 sets.

| Category                 | Representative synthetic values                                                                                         | Assertion                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Secrets                  | API keys, private keys, signing material                                                                                | absent from every emitted record, verbatim and as any substring ≥ 8 chars |
| Credentials              | connection URIs with passwords, basic-auth headers, `DATABASE_*_URL` values                                             | absent, including the password component alone                            |
| Tokens                   | bearer tokens, session identifiers, refresh tokens, signed URLs                                                         | absent                                                                    |
| Personal data            | names, emails, phone numbers, driver licence numbers, addresses                                                         | absent or irreversibly tokenized                                          |
| Financial data           | bank account and routing numbers, card numbers, payment instructions, settlement amounts tied to a counterparty         | absent                                                                    |
| Protected logistics data | carrier margins, customer rates, internal notes, maintenance strategy, chain-of-custody detail — the Article III.4 list | absent unless separately authorized and classified ≤ D3                   |

Plus:

- **Property-based tests** over generated payloads, not a fixed fixture list — the failure mode is
  the value nobody thought of.
- **A compile-fail fixture** proving an unclassified value and a D4/D5 value are both type errors.
- **A lint-failure fixture** proving `console.log` outside the package fails CI.
- **An error-path test** proving a thrown `Error` carrying a connection URI does not emit it.
- **A negative control**: a D0 value that _should_ appear does appear, so the tests are not passing
  because the logger emits nothing.

### D-5.4 Deferred out of the code PR

`docs/governance/DATA_CLASSIFICATION.md` needs restructuring onto D0–D5 with per-field owner,
purpose, retention class, and sharing rule (`templates/DATA_PROCESSING_INVENTORY_TEMPLATE.md`).
PR #5 edits that file, so it is **the only semantic contact point** between the two workstreams and
is deferred to a separate documentation PR. What remains is a single `pnpm-lock.yaml` importer line,
which is a mechanical conflict at worst.

**Migration impact.** None. **Rollback.** Revert; nothing depends on it yet, which is the point of
doing it first. **Dependencies.** None — independent of PR #5 and of SR-2.

**Owner approval.** (a) Whether to open the SR-5 branch now or hold until PR #8 merges — held
pending instruction. (b) Retention periods per class (OQ-12, needs counsel); the library can ship
with retention _classes_ declared and periods marked `POLICY_REQUIRED`, matching the pattern
ADR-0025 already set for detention.

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

**Note.** Owner instruction separates dependency _scanning_ from dependency _remediation_. Scanning
is **SR-11**; remediation is **SR-10**. Neither belongs in SR-8's SBOM/provenance work and neither
belongs in SR-2.

---

## D-8a. SR-9 — Top-level handoff registry _(owner ruling 2)_

| Field       | Value                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| **Roadmap** | governance — implements the forward rule fixed by owner ruling 2            |
| **Blocker** | none — prevents recurrence of the C-6 class of defect                       |
| **Status**  | **deferred by owner ruling 2** to a later, narrowly scoped documentation PR |

**Objective.** Give later handoff packages a place to register themselves that is **outside every
checksummed historical package**, so no future installation has to edit v1.2 to be discoverable.

**Files.** A new top-level index — `docs/production-handoff/README.md` — listing every installed
package, its version, its controlling scope, its installation commit, and its integrity-manifest
path. Plus a validator asserting that every directory under `docs/production-handoff/` has a registry
entry and a verified manifest.

**Migration impact.** None. **Rollback.** Revert.

**Explicitly not in scope.** Removing or rewriting the pointers already merged into v1.2's
`00_MASTER_HANDOFF.md`. Owner ruling 2 forbids further edits to v1.2 to attach later handoffs; it
does not require unwinding the two already there, and unwinding them would mean editing v1.2 again
to satisfy a rule about not editing v1.2.

**Dependencies.** None. Should land before a v1.5.0 package is ever installed.

**Owner approval.** Whether the registry lives at `docs/production-handoff/README.md` or at the
repository root.

---

## D-8b. SR-10 — Dependency advisory remediation _(isolated)_

| Field       | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| **Roadmap** | v1.3.0 `08_…` §2 dependency update with risk review — gate SDLC-02             |
| **Blocker** | #9 → tracked as **PR0-R-16**                                                   |
| **Status**  | proposal; assessment complete in `PHASE_0_GAP_AND_RISK_REGISTER.md` Appendix A |

**Objective.** Clear the five open advisories through the **narrowest** change that clears them.
Owner instruction is explicit: **no forced or broad dependency upgrade**, and **not mixed into SR-2**.

**Files.** `package.json` (the `vitest` and `@vitest/coverage-v8` devDependency ranges only),
`pnpm-lock.yaml`, and whatever configuration the upgrade actually requires — the empirical test
recorded in Appendix A determines that, rather than a guess.

**Migration impact.** None. No runtime dependency changes.

**Security invariants.** The change must not alter any test's _meaning_. A dependency upgrade that
silently changes which tests run, or relaxes a coverage threshold to stay green, converts a security
control into decoration. The suite counts must be identical before and after, or every difference
must be explained.

**Tests and evidence.** `pnpm audit` before and after with the exact advisory list; `pnpm verify`,
`pnpm test`, `pnpm test:integration` with exit statuses and **identical test counts**; the coverage
run still meeting its thresholds.

**Rollback.** Revert; the lockfile returns to the pinned prior versions.

**Dependencies.** None on PR #5. **Must not be combined with SR-2 or SR-11.**

**Owner approval.** Whether to accept the major-version move the fix requires, or to temporarily
accept the advisories with the justification recorded in Appendix A.

---

## D-8c. SR-11 — Automated dependency scanning in CI _(dedicated change)_

| Field       | Value                                                           |
| ----------- | --------------------------------------------------------------- |
| **Roadmap** | v1.3.0 `08_…` §4 dependency and license scanning — gate SDLC-02 |
| **Blocker** | #9                                                              |

**Objective.** Make the pipeline find its own advisories. Today GitHub Dependabot found five that CI
did not look for.

**Files.** `.github/workflows/ci.yml` — a blocking dependency-audit step, plus a license scan.

**Security invariants.** The step must be **blocking**. A non-blocking scan reproduces the exact
failure mode `ci.yml` already documents for the secret scan: output nobody reads that looks like
coverage. If a severity threshold or a time-boxed allowlist is needed to land it, each entry must
carry an owner and an expiration, per `01_…` Article X.

**Tests and evidence.** A demonstration that the step fails on a known-vulnerable dependency and
passes after remediation.

**Rollback.** Revert the workflow change.

**Dependencies.** Ordering matters: **SR-10 before SR-11**, or CI goes red on the advisories the
moment the scan is added. Alternatively SR-11 first with a documented, expiring allowlist — that is
the owner's call.

---

## D-8d. SR-12 — Backup and restore, with proven restoration _(owner ruling 6, R4)_

| Field       | Value                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| **Roadmap** | v1.3.0 PR 5.4 — gates DR-01, DR-02                                                                        |
| **Blocker** | #4 — **the only R4 in the register**                                                                      |
| **Status**  | sequenced **immediately after SR-2**, or earlier if it can be done without conflicting with PR #5 or SR-2 |

**Objective.** Close the only R4 finding. Owner ruling 6 is explicit that **documentation alone will
not close it** — closure requires an actual restore.

**Smallest independently reviewable form.** Scripts plus evidence, no infrastructure commitment:
`scripts/backup.sh` and `scripts/restore.sh` operating against the local PostgreSQL 16 that
`scripts/dev-postgres.sh` already provides, and a runbook. This deliberately does **not** select a
cloud provider, which `22_…` places before Phase 5 and which Phase 0 was forbidden from choosing.
It proves the _procedure_ and produces the _evidence_; provider-specific immutable and cross-region
storage is a later, separate PR.

**Evidence required for closure — all nine, per owner ruling 6:**

| #   | Evidence                                                                  | How                                                                                                                                       |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A backup created from a safe synthetic or approved nonproduction database | `pg_dump`/`pg_basebackup` against a seeded synthetic database. **No production customer data** — none exists, and none may be introduced. |
| 2   | Encrypted storage and access controls                                     | backup encrypted at rest; restricted file permissions; the key handled outside the repository                                             |
| 3   | Restoration into an **isolated** environment                              | a second cluster or a distinct database name, never over the source                                                                       |
| 4   | Integrity checks after restoration                                        | row counts per table, constraint and FK validation, migration-version table matches                                                       |
| 5   | **Tenant-boundary verification after restoration**                        | the RLS suite re-run against the restored database — a restore that loses policies is a restore that loses isolation                      |
| 6   | Measured recovery time and observed data-loss window                      | wall-clock RTO and the actual RPO, recorded as numbers, compared against `policies/slo-defaults.yaml`                                     |
| 7   | Documented failure handling                                               | what to do when a restore fails midway, when a backup is corrupt, and when the migration version does not match                           |
| 8   | Repeatable commands or automation                                         | committed scripts, not a transcript of hand-typed commands                                                                                |
| 9   | No production customer data in chat, commits, or fixtures                 | synthetic fixtures only; the same constraint that governs every other test in this repository                                             |

**Explicitly not claimable until an actual restore has succeeded.** Until then DR-01 and DR-02 remain
NOT IMPLEMENTED, and backup capability must not be represented as accepted.

**Migration impact.** None. **Rollback.** Revert the scripts; no state to unwind.

**Dependencies.** Sequenced after SR-2 by owner ruling 6. It touches no file PR #5 touches, so if it
can be completed without conflicting with PR #5 or SR-2 it may run earlier.

**Owner approval.** Where restore evidence is preserved — committed to the repository, or held in an
approved external evidence store. Measured numbers and logs may be committed; database contents may
not.

---

## D-9. Owner decisions required

Ordered by what they block.

0. **Already applied in SR-1, and reversible: the v1.2 `SHA256SUMS.txt` digest for
   `00_MASTER_HANDOFF.md`.** `main` was failing CI before this pull request because both handoff
   install commits added the pointer that `23_…` §4 requires to a file the Phase 0 preservation
   ruling checksums, without regenerating the digest. One line is updated to match the file as the
   owner merged it. Alternatives and reasoning: `README.md` §A.4a. Revert is one line if the owner
   prefers the pointer live outside the checksummed package instead.

1. ~~**Roadmap reconciliation.**~~ **CLOSED — owner ruling 1.** v1.2's ten-PR sequence is the
   delivery spine; v1.3.0 is the mandatory control and acceptance overlay; v1.4.0 is the mandatory
   architectural and interoperability overlay; the newer packages do not create separate competing
   programs. Per-PR obligations and the evidence rule are in §D-0.

2. ~~**PR #5 disposition.**~~ **DIRECTED — owner ruling 4.** SR-2 does not begin against an unmerged
   or moving PR #5. PR #5 completes final independent rereview, merges, and is verified on `main`;
   then local `main` is updated, a clean tree confirmed, the authority model re-evaluated against the
   merged state, and the authority and tenant-boundary tests **reproduced against the merged
   commit** — PR #5's own report is not sufficient evidence. SR-2 is then cut from the updated
   `main`, and **not started until the post-merge baseline and exact PR plan are returned**.
   Preconditions and current state: §D-2.0.

3. **Audit isolation depth — blocks SR-4.** Separate schema (recommended now) versus separate
   database (the stronger reading of Article V.3). Cost and operational complexity differ
   materially. **Open.**

4. ~~**Backup and restore blocked on infrastructure.**~~ **DIRECTED — owner ruling 6.** It remains the
   only R4 and must stay prominently tracked, but it is **no longer blocked on a cloud decision**:
   SR-12 proves the procedure against a local synthetic database and produces all nine required
   evidence items, deferring provider-specific immutable and cross-region storage to a later PR.
   Sequenced immediately after SR-2, or earlier if it can be completed without conflicting with
   PR #5 or SR-2. **Backup capability may not be represented as accepted until an actual restore has
   succeeded and the evidence is preserved.** Still open within it: where restore evidence is stored
   (§D-8d).

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

9. **Dependency remediation disposition — blocks SR-10 and orders SR-11.** Whether to accept the
   major-version move the advisory fix requires, or temporarily accept the advisories with the
   justification recorded in `PHASE_0_GAP_AND_RISK_REGISTER.md` Appendix A. Also whether SR-11 lands
   before SR-10 with an expiring allowlist, or after it.

10. **SR-5 branch timing — blocks nothing, needs a yes or no.** Owner ruling 5 permits preparing the
    logging and redaction guardrail while PR #5 is pending. The proposal is complete (§D-5); **no
    branch has been opened and no code written**, because opening one now would stack a third
    security branch beside PR #5 and PR #8, which the same ruling warns against. Say the word and it
    is cut from `main` after PR #8 merges.

---

## D-9a. Resulting order

Owner rulings 1, 4, 5, and 6 together fix most of the sequence. What remains open is marked.

| #   | Work                                                           | Gate              | Precondition                                                   |
| --- | -------------------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| 1   | **SR-1** — Phase 0 intake                                      | —                 | done; PR #8                                                    |
| 2   | **PR #5** — spine PR 2, identity and organization              | SEC-01/02 partial | final independent rereview → merge → verify on `main`          |
| 3   | **SR-2** — verified actor binding                              | SEC-01            | post-merge baseline returned **and accepted** (§D-2.0)         |
| 4   | **SR-12** — backup and restore with proven restoration         | DR-01, DR-02      | after SR-2, or earlier if genuinely non-conflicting (ruling 6) |
| —   | **SR-5** — redaction guardrail                                 | DATA-02           | independent of the above; awaiting a go/no-go on the branch    |
| —   | **SR-10** → **SR-11** — advisory remediation, then CI scanning | SDLC-02           | independent; ordering per §D-8c                                |
| —   | **SR-9** — handoff registry                                    | governance        | before any v1.5.0 package is installed                         |
| 5   | **SR-3** — cross-tenant isolation suite                        | SEC-03            | after SR-2                                                     |
| 6   | **SR-4** — audit plane isolation and integrity chain           | AUD-01            | after SR-2; needs decision 3                                   |
| 7   | **SR-6** — idempotency, outbox publisher, inbox                | EVT-01/02/03      | after SR-2 and SR-4                                            |
| 8   | **SR-7** — criticality registry and SLOs                       | REL-01/02         | independent                                                    |
| 9   | **SR-8** — SBOM, provenance, CODEOWNERS, manifest verification | SDLC-01/02        | independent                                                    |

Rows without a number are not blocked by the numbered chain and can interleave.

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
