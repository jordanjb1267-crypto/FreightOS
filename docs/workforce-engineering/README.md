# Agent Workforce Engineering — v1.8.0 W0/W1 Audit

**Status:** W0 (repository job inventory) and W1 (role decomposition) audit deliverables. Nothing
here is an implementation claim. **Date:** 2026-08-15. **Baseline:** `main` @ `09624b9`.
**Branch:** `audit/v1.8.0-workforce-w0-w1`. **Authority:** owner instruction
`CLAUDE_START_HERE.md` (W0/W1 only) executing `09_IMPLEMENTATION_SEQUENCE.md` W0 and W1 of the
v1.8.0 package, under the additional controlling requirements recorded in §A.7.

This directory holds the eleven required W0/W1 artifacts plus this intake README — twelve files,
and no other tracked path changed. It follows the precedent of `docs/security-resilience/` (v1.3
Phase 0): audit deliverables live in `docs/<topic>/`, never inside an installed handoff package.

| Document                                                                 | Deliverable                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| This file                                                                | Repository and governance intake, method, precedence, attestation                    |
| [`CURRENT_WORKFORCE_INVENTORY.md`](CURRENT_WORKFORCE_INVENTORY.md)       | W0 — every real or declared workforce component, proven from code/schema/test/config |
| [`ROLE_DECOMPOSITION_MATRIX.md`](ROLE_DECOMPOSITION_MATRIX.md)           | W1 — every registry manifest, v1.8 job and platform component classified             |
| [`JOB_BOOK_IMPLEMENTATION_MATRIX.md`](JOB_BOOK_IMPLEMENTATION_MATRIX.md) | W1 — 76 jobs × design status × implementation status × 18 design attributes          |
| [`WORK_UNIT_OWNERSHIP_MAP.md`](WORK_UNIT_OWNERSHIP_MAP.md)               | Representative lifecycle × accountable owner; orphans and duplicate owners           |
| [`HANDOFF_EDGE_INVENTORY.md`](HANDOFF_EDGE_INVENTORY.md)                 | Every declared interaction edge; typed vs free-form; cross-participant boundary      |
| [`TOOL_COMMAND_DRIFT.md`](TOOL_COMMAND_DRIFT.md)                         | Job-book tools/commands vs registry vs policy vocabulary vs code                     |
| [`EVALUATION_GAP_MATRIX.md`](EVALUATION_GAP_MATRIX.md)                   | Mandatory evaluation case families and certification-blocking failures per job       |
| [`WORKFORCE_SIMULATION_GAP.md`](WORKFORCE_SIMULATION_GAP.md)             | The seven simulations × ten mandatory verifications × harness reality; §7 proof      |
| [`WF_01_WF_40_MATRIX.md`](WF_01_WF_40_MATRIX.md)                         | Workforce acceptance gates WF-01..WF-40 scored with repository evidence              |
| [`PROPOSED_ADDITIVE_PR_SEQUENCE.md`](PROPOSED_ADDITIVE_PR_SEQUENCE.md)   | Recommended additive sequence for later phases, including conditional AWE-D1         |
| [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md)                               | Genuine unresolved product/legal/authority choices only                              |

The scoring rule that governs every matrix here is the one the repository already adopted from
v1.4.0 `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md`:

> A gate cannot be PASS when evidence exists only in an unmerged branch, mock, or document.

Corollaries applied throughout: handoff text (including v1.8 Job Books, matrices, contracts and
simulations) is **design** evidence only; `config/agents/registry.yaml` entries are **declared**
only; an implementation claim requires code, schema, migration, test, config or runtime evidence at
`09624b9`, cited as `path:line`; and design completeness and implementation completeness are
scored as **separate dimensions**, so an implementation gap is never reported as the only problem
when the Job Book itself is incomplete.

---

## A. Repository and governance intake

### A.1 Repository state

| Item                    | Value                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Remote                  | `https://github.com/jordanjb1267-crypto/FreightOS`                                        |
| Default branch          | `main`                                                                                    |
| Baseline commit         | `09624b9` — _Merge pull request #31 … install-agentic-operations-handoffs-v1.5-v1.8_      |
| `origin/main` at intake | `09624b91c7e90f7265a589632ab1e5ac71c3d0d2` (equal to local `main`)                        |
| Working branch          | `audit/v1.8.0-workforce-w0-w1`, branched from `main` after the controlling reading (§A.5) |
| Working tree at intake  | `clean`                                                                                   |
| Package manager         | pnpm 10.33.0 (`corepack pnpm`), Node 24.18.0 locally; CI uses Node 22                     |
| Language                | TypeScript (strict), SQL migrations, ESM `.mjs` validators, one Python validator          |
| Database                | PostgreSQL 16 (integration tests only; **no database was connected during this audit**)   |
| Test runner             | Vitest 3 — projects `unit`, `integration`, `config-contract`                              |

The four preconditions of the instruction (§0) held at intake: branch `main`, clean tree, local
`main` equal to `origin/main`, and the v1.8 package present at
`docs/production-handoff/v1.8.0-agent-workforce-engineering-certification/`. No repair was needed
and none was performed.

### A.2 Commands run at intake

```text
$ git status --short                        → (empty)
$ git branch --show-current                 → main
$ git rev-parse HEAD                        → 09624b91c7e90f7265a589632ab1e5ac71c3d0d2
$ git rev-parse origin/main                 → 09624b91c7e90f7265a589632ab1e5ac71c3d0d2
$ git log -5 --oneline --decorate           → 09624b9 (HEAD -> main, origin/main, origin/HEAD) Merge pull request #31 …
                                              159152a docs: install FreightOS agentic operations handoffs v1.5-v1.7
                                              9e846a1 Merge pull request #30 …
                                              3fe204b docs: install FreightOS agent workforce engineering handoff v1.8.0
                                              41e030e Merge pull request #28 … n7-external-transport-architecture
$ (cd docs/production-handoff/v1.2 && shasum -a 256 -c SHA256SUMS.txt)   → 90 OK, 0 non-OK
$ node scripts/check-network-governance.mjs → NETWORK_GOVERNANCE=PASS  layers declared: 3  manifest-verified artifacts: 105
$ node <audit-local>/check-manifest-json.mjs → facilityos-v1.0.0 OK 38/38 · v1.5.0 OK 34/34 · v1.6.0 OK 38/38 · v1.7.0 OK 31/31 · v1.8.0 OK 188/188
$ git switch -c audit/v1.8.0-workforce-w0-w1
```

The `MANIFEST.json` check is an audit-local script (not part of the repository) because nothing in
CI verifies the `MANIFEST.json` files of the five packages installed after v1.4.0 — see finding
W01-F-GOV-01 in `PROPOSED_ADDITIVE_PR_SEQUENCE.md` and the governance-wiring card AWE-0.

### A.3 Handoff package presence and linkage

| Check                                                                        | Result                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.2 base handoff present and byte-pinned                                    | `docs/production-handoff/v1.2/SHA256SUMS.txt` — 90/90 OK; verified in CI                                                                                                           |
| v1.3.0 and v1.4.0 declared in `governance-layers.json` and manifest-verified | `NETWORK_GOVERNANCE=PASS`, 105 artifacts; verified in CI                                                                                                                           |
| v1.5.0, FacilityOS v1.0.0, v1.6.0, v1.7.0, v1.8.0 present                    | Installed by `3fe204b` and `159152a`; each ships a `MANIFEST.json` (JSON `files[]` of `{path,sha256,bytes}`)                                                                       |
| Those five `MANIFEST.json` files verified by anything in CI                  | **No.** `governance-layers.json` declares three layers only; `check-network-governance.mjs` parses only `sha256sum`-format manifests                                               |
| Any repo-authored file inside an installed package                           | None, and none was added by this audit (installed packages are immutable — SR ruling 2)                                                                                            |
| v1.8.0 package tree                                                          | 13 numbered docs, `README.md`, `COMBINED_HANDOFF.md`, `MANIFEST.json`, 5 contracts, 3 matrices, 6 diagrams, 7 simulations, 76 Job Books × (`.json` + `.md`) — 188 manifest entries |

### A.4 Validators and CI surface touched by this change

Only two CI steps can be affected by a docs-only change: `pnpm format:check` (prettier walks
`docs/**` except `docs/production-handoff/`) and the gitleaks secret scan. No validator or test
reads `docs/` generically (`check-network-governance.mjs` walks only the three declared layer
roots; `check-handoff-provenance.mjs` checks only enumerated v1.2 copies; `validate-scope.mjs`,
both egress gates and every `scripts/test/*.test.ts` never open `docs/`; `vitest.config.ts` has no
`docs/` glob). Section D below records the validation actually run.

### A.5 Controlling architecture read, in precedence order

| Rank | Package                                                                                                                                                                                                 | Role                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1    | `docs/production-handoff/v1.2/` — Constitution, `02_GOVERNANCE…`, `08_AGENT_OPERATING_SYSTEM`, `09_AUTONOMY_POLICY…`, `21_SEQUENCING…`; `config/scope/module_states.yaml`; ADR-0004/0005/0011/0015/0018 | Base and binding; "the stricter restriction wins if prose and configuration disagree" (`02_…:97`) |
| 2    | `v1.3.0-security-resilience/` — `12_AI_AGENT_SECURITY_AUTHORITY`, `19_ACCEPTANCE_GATES_EVIDENCE_MATRIX` (AI-01..05)                                                                                     | Controlling for AI-agent authority; model output is untrusted input                               |
| 3    | `v1.4.0-network-architecture/` — `13_AGENT_TO_AGENT…`, `14_HUMAN_APPROVAL…`, `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX`                                                                                      | Additive-subordinate; supplies the evidence rule and NA-11                                        |
| 4    | `v1.5.0-enterprise-agent-operations/`                                                                                                                                                                   | Additive; 22 canonical roles; logical duties stay separately governed when runtime collapses      |
| 5    | `facilityos-v1.0.0-enterprise-agent-operations/`                                                                                                                                                        | Additive; 17 facility manifests; physical-control prohibition (read with v1.2 `09_…:49-53`)       |
| 6    | `v1.6.0-brokerage-enterprise-agent-operations/`                                                                                                                                                         | Additive; separate Brokerage plane; installation authorizes no brokerage                          |
| 7    | `v1.7.0-agentic-logistics-network-coherence/`                                                                                                                                                           | Additive coherence layer; 23-step representative lifecycle; Twin fact lifecycle                   |
| 8    | `v1.8.0-agent-workforce-engineering-certification/` — all numbered docs, contracts, matrices, simulations, diagrams, and every Job Book                                                                 | Additive; "the runtime must not create an agent solely because this package names one" (`11_…`)   |

Repository governance read alongside: `docs/decisions/0001`, `0002` (rulings A–H), `0003–0018`
(ADR-N series), `docs/governance/OPEN_QUESTIONS.md` (OQ-1..21), `N7_OWNER_RULINGS.md`,
`POLICY_REGISTRY.md`, `ACCEPTANCE_THRESHOLDS.md`, `docs/security-resilience/*`, `adr/0014–0027`,
`checklists/*` (all unsigned). Where packages overlap, the stricter rule was preserved; the
fourteen overlaps that mattered for classification are listed in `ROLE_DECOMPOSITION_MATRIX.md`
§Method.

### A.6 Method

1. **W0 inventory** — four category groups searched independently against `packages/`,
   `scripts/`, `schemas/`, `config/`, `checklists/`, `db/reference/`, `.github/`, then every
   `EXISTS`/`PARTIAL` citation re-opened by an independent verifier and downgraded where it did not
   hold. Declarations, schemas without producers, tables without consumers, and pure functions
   without callers are named as such.
2. **W1 decomposition** — one writer per workforce (carrier first, then brokerage, facility,
   shipper, service provider) plus one for code-only platform components; every row then attacked
   by three independent refuters (deterministic-alternative, merge/sprawl, horizon/authority/human)
   and a classification changed only when at least two lenses refuted it with non-low confidence
   and never toward a more permissive class.
3. **Cross-cutting** — ownership map, simulation gap and the WF-01..WF-40 matrix built from the
   above; every non-FAIL gate then challenged by three refuters asked to prove the evidence is only
   a document, mock or unmerged branch.
4. **Assembly and validation** — prettier, the repository validators, unit tests, and the
   integrity baselines re-run; results in §D.

### A.7 Owner's additional controlling requirements (approved 2026-08-15)

Scope exactly W0/W1 · design completeness (`DESIGN_COMPLETE | DESIGN_PARTIAL | DESIGN_STUB`) and
implementation (`IMPLEMENTED | IMPLEMENTATION_PARTIAL | IMPLEMENTATION_ABSENT`) scored separately ·
the facility/shipper/service-provider fidelity cliff scored per Job Book against eighteen
job-specific attributes and reported as design gaps, not implementation-ready specifications · the
PR sequence must not presume W2 is next and carries a conditional **AWE-D1 Workforce Design
Remediation** phase · no workforce described as completely designed / implementation ready /
autonomously operable while any production job has placeholder commands, missing typed handoffs,
unresolved ownership, generic tools, incomplete DAGs or non-job-specific evaluation · installed
packages immutable; remediation goes to a new additive v1.8.x/v1.9 package · OD-1/OD-2/OD-3 stay
open unless conclusively resolved · exactly twelve files under `docs/workforce-engineering/` ·
evidence rule as above · one local commit, no push.

---

## B. Headline findings

- **The repository is a governed platform substrate, not a workforce.** Implemented and tested:
  computed autonomy ceiling with CI clamp; fail-closed capability matrix (application half; DB half
  for 3 of 12 resource groups); most-restrictive-wins kill switches with a seeded standing
  suspension of `autonomous_mobility`; identity/authorization with non-weakening policy
  inheritance; append-only audit ledger and network event journal; N1–N7 through an idempotent
  transport intent and a brokered external-transport permit control plane; `FORCE` RLS in 16
  migrations; database-enforced human approval points. Absent: any LLM call, prompt, agent loop,
  tool registry, orchestrator, workflow engine, queue consumer, outbox producer/consumer, worker
  daemon, HTTP client (egress CI-enforced at zero), freight-domain table, exception model,
  reconciliation process, `evals/`, simulation harness (`CURRENT_WORKFORCE_INVENTORY.md`).
- **0 of 76 v1.8 jobs are implemented**; 24 have a declared registry manifest (all with
  `allowed_tools: []` and a dangling `evaluation_suite`), 52 do not; 7 manifests (autonomous
  mobility) map to no job.
- **Design fidelity cliff, confirmed and scored:** 0 `DESIGN_COMPLETE`, 35 `DESIGN_PARTIAL`, **41
  `DESIGN_STUB`** (18 facility, 12 shipper, 10 service provider, 1 brokerage) — placeholder
  `*_typed_command`, department-generic tools, zero upstream/downstream edges, template evaluation
  scenarios; even the 36 authored carrier/brokerage books are template-only on typed handoffs,
  autonomy-by-action, degraded mode, evidence/audit and rollback/kill, and 22 of 36 have no
  job-specific evaluation scenarios (`JOB_BOOK_IMPLEMENTATION_MATRIX.md`). The 40
  facility/shipper/service-provider books are **architecture-blocking design stubs**.
- **Decomposition (after three adversarial refuter lenses):** of 78 agent-shaped roles (71 v1.8
  agent/hybrid/human-supervised jobs + 7 registry-only manifests), W1 keeps **4 KEEP_AGENT** and
  **8 HYBRID_AGENT**; **69 should not remain full agents** (41 deterministic services, 22 workflow
  services, 7 merges, 1 human-only, plus agent→hybrid downgrades). Carrier: 2 keep-agent
  (negotiation, exception), 2 hybrid (planning, documentation), 8 deterministic, 2 workflow
  (dispatch, chief dispatch orchestrator); all 14 `MISSING_IMPLEMENTATION`. All 62 non-carrier rows
  are `NOT_IN_CURRENT_HORIZON` by module state (`ROLE_DECOMPOSITION_MATRIX.md`).
- **Ownership:** every lifecycle step is orphan at runtime (no WorkUnit exists); in the design, 41
  jobs have no edges, 10 of the 23 representative steps have stub owners, and 8 same-participant
  duplicate-owner risks exist (`WORK_UNIT_OWNERSHIP_MAP.md`).
- **Edges:** 89 design edges (73 CSV, 89 Job Book, 61 diagram — three disagreeing sources), all
  untyped; the design handoff schema leaves `acceptanceState` optional; no schema or table in the
  repository (`HANDOFF_EDGE_INVENTORY.md`).
- **Tools/commands:** 91 distinct design commands, 0 in any policy or permission vocabulary; 40
  placeholder commands; 40 generic tool sets; 76 jobs name tools while no tool registry exists;
  registry prohibited actions not reproduced in 19 of 24 matched books (`TOOL_COMMAND_DRIFT.md`).
- **Evaluation:** `evals/` absent; no test references a job; 14 of 76 books have job-specific
  scenarios; highest truthful certification level is at most J0 (unattested) for 35 books and
  below J0 for 41 (`EVALUATION_GAP_MATRIX.md`).
- **Simulations:** seven 3–5-line stubs covering 21 of 70 mandatory verification cells on paper;
  no harness of any kind (`WORKFORCE_SIMULATION_GAP.md`).
- **Gates WF-01..WF-40:** **0 PASS, 6 PARTIAL (all platform-mechanism-with-no-job), 33 FAIL, 1
  NOT YET APPLICABLE** after three adversarial refuter lenses lowered WF-17/25/35 to FAIL; per the package's blocking clauses no job is production-certified and no
  workforce carries an autonomy claim (`WF_01_WF_40_MATRIX.md`).
- **Highest truthful claims:** Carrier DESIGNED (not implementation-ready); Brokerage DESIGNED,
  gated, no activation; Facility, Shipper, Service Provider below DESIGNED; platform IMPLEMENTED
  substrate with no jobs.
- **PR sequence:** AWE-0 governance wiring/README truth → conditional **AWE-D1 Workforce Design
  Remediation (triggered)** as a new additive package → AWE-1 contracts → AWE-2 vocabulary →
  AWE-3 carrier (Phase 2+, deterministic first) → AWE-4 evals → AWE-5 shadow → AWE-6/7 gated
  workforces → AWE-8 claims registry; W2 is not presumed next (`PROPOSED_ADDITIVE_PR_SEQUENCE.md`).
- **Owner decisions:** OD-1 (roster of record) and OD-3 (authority/path for the 41 stub Job Books)
  remain **open**; **OD-2 was resolved during review** by an independent resolver-refuter — the AV
  manifests stay declared, suspended and A0 with no workstream (`OWNER_DECISIONS.md`).
- **Governance finding outside the workforce:** the five packages installed after v1.4.0 ship
  `MANIFEST.json` files that nothing in CI verifies (W01-F-GOV-01); README is stale
  (W01-F-README-01).

## C. Explicit non-claims

- No workforce, department, or job is described here as implemented, implementation-ready,
  shadow-validated, or certified at any J-level or A-level.
- No agent runtime, prompt, tool registry, WorkUnit, handoff, certification record, evaluation
  suite, or simulation harness was created.
- No module state, autonomy ceiling, legal gate, safety gate, permission, role, migration, or
  external integration was changed or exercised.

## D. Validation and attestation

All of the following were run after the twelve files were written, from the audit branch.

```text
$ pnpm format:check                                    → All matched files use Prettier code style!
$ python3 docs/production-handoff/v1.2/scripts/validate_handoff.py
                                                       → SEQUENCING_DOCTRINE=PASS · HORIZON_1_STOP_RULE=PASS
                                                         DEFERRED_PRODUCTS_DISABLED=PASS · SAFETY_BOUNDARY=PASS
$ node scripts/check-handoff-provenance.mjs            → AUTHORISED_OVERRIDES=3 (no unreviewed drift)
$ node scripts/check-network-governance.mjs            → NETWORK_GOVERNANCE=PASS · layers 3 · artifacts 105
$ node scripts/check-network-egress.mjs                → 33 source files, 70 migrations, 6 manifests; 0 egress
$ node scripts/check-egress-allowlist.mjs              → 0 primitives outside the allowlist
$ node scripts/validate-scope.mjs                      → DEFERRED_MODULES_DISABLED=PASS · AUTONOMY_CEILING=PASS
                                                         SAFETY_BOUNDARY=PASS · BILLING_DISABLED=PASS
                                                         PACKAGE_LAYERING=PASS · 32 agents (25 clamped)
$ pnpm test            (vitest --project unit)         → 35 files, 616 tests, all passing
$ (cd docs/production-handoff/v1.2 && shasum -a 256 -c SHA256SUMS.txt)
                                                       → 90 OK, 0 non-OK  (identical to intake)
$ node <audit-local>/check-manifest-json.mjs           → FacilityOS 38/38 · v1.5.0 34/34 · v1.6.0 38/38
                                                         v1.7.0 31/31 · v1.8.0 188/188 · 0 mismatched,
                                                         0 missing, 0 unlisted  (identical to intake)
$ git status --short                                   → (clean)
$ git diff --stat main..HEAD -- . ':(exclude)docs/workforce-engineering'
                                                       → (empty — no other tracked path changed)
$ git log main..HEAD --oneline                         → exactly one commit: "docs: v1.8.0 workforce
                                                         W0/W1 audit — inventory and role decomposition"
$ git log origin/main..HEAD --oneline                  → the same single commit (local only, unpushed)
```

`pnpm test:integration` and `pnpm test:config-contract` were **not** run: they require a
PostgreSQL 16 server, and this audit connected to no database. The unit project covers every test
that runs without one. (`pnpm` is invoked through `corepack`; the single unit test that shells out
to a bare `pnpm` binary fails with `spawnSync pnpm ENOENT` unless one is on `PATH` — an
environment artifact, unrelated to these documents, and it passes with a `pnpm` shim on `PATH`.)

**Attestation.** During this work no live brokerage, carrier, FacilityOS, shipper,
service-provider, payment, migration, permission, deployment or external production side effect
was enabled, changed or exercised. No database connection was opened. No module state, autonomy
ceiling, legal gate, safety gate, role or permission was altered. No installed handoff package was
modified — v1.2, v1.3.0, v1.4.0, FacilityOS v1.0.0, v1.5.0, v1.6.0, v1.7.0 and v1.8.0 all
re-verify byte-identical to intake. Nothing was pushed, no pull request was opened and nothing was
merged; the work stops at W0/W1 pending review.
