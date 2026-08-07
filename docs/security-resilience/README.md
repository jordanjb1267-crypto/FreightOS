# Security and Resilience — v1.3.0 Phase 0

This directory holds the Phase 0 deliverables required by
`docs/production-handoff/v1.3.0-security-resilience/20_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`
and by roadmap PR 0.2 in `18_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md`.

| Document                                                               | Deliverable                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| This file                                                              | A — repository and governance intake                      |
| [`PHASE_0_INVENTORY.md`](PHASE_0_INVENTORY.md)                         | B — current-state security and reliability inventory      |
| [`PHASE_0_GAP_AND_RISK_REGISTER.md`](PHASE_0_GAP_AND_RISK_REGISTER.md) | C — gap and risk register mapped to every acceptance gate |
| [`PHASE_0_PR_PLAN.md`](PHASE_0_PR_PLAN.md)                             | D — repository-specific pull-request plan                 |

Nothing here is an implementation claim. `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md` in the v1.4.0
package states the rule this directory follows throughout: **a gate cannot be PASS when evidence
exists only in an unmerged branch, mock, or document.**

---

## A. Repository and governance intake

### A.1 Repository state

| Item                   | Value                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Remote                 | `https://github.com/jordanjb1267-crypto/FreightOS`                                    |
| Default branch         | `main`                                                                                |
| Baseline commit        | `1f74bdd` — _Merge pull request #7 … install-network-architecture-handoff-v1.4.0_     |
| Working branch         | `claude/freightos-handoff-setup-xbwhlc`, branched from `origin/main`                  |
| Working tree at intake | clean                                                                                 |
| Package manager        | pnpm 10.33.0, workspaces at `packages/*`, Turborepo                                   |
| Language               | TypeScript strict, ESM, Node ≥ 22, `--experimental-strip-types` for the migration CLI |
| Database               | PostgreSQL 16 (ADR-0016)                                                              |
| Test runner            | Vitest 2.1.9, two projects: `unit`, `integration`                                     |

### A.2 Commands

| Purpose                       | Command                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Full gate                     | `pnpm verify` (`format:check` → `lint` → `typecheck` → `test` → `validate`)     |
| Unit tests                    | `pnpm test`                                                                     |
| Integration tests             | `pnpm test:integration` (requires a live PostgreSQL 16)                         |
| Governance validators         | `pnpm validate` (`validate:handoff`, `validate:provenance`, `validate:scope`)   |
| Migrations                    | `pnpm db:up`, `pnpm db:down`, `pnpm db:status`                                  |
| Local database without Docker | `scripts/dev-postgres.sh start`                                                 |
| Local stack                   | `docker-compose.yml` (PostgreSQL; Temporal and MinIO behind the `full` profile) |

### A.3 Deployment topology and production-capable environments

**There are none.** This is a material intake finding, not an omission in this document.

- No `apps/`, `services/`, `workers/`, `functions/`, `deploy/`, `infra/`, or `terraform/` directory
  exists. The repository builds no deployable unit.
- The only workflow is `.github/workflows/ci.yml`. It runs verification. It does not build an
  artifact, publish an image, or deploy anything.
- No cloud account, project, region, cluster, or hosting provider is selected anywhere in the
  repository. ADR-0016 fixes an infrastructure _baseline_ (PostgreSQL 16, Temporal, S3-compatible
  storage, provider-independent model gateway) and explicitly defers provider selection.
- `docker-compose.yml` carries an explicit non-production notice and only development credentials.

Consequence: every gate in `19_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md` that requires a running
production environment is **NOT IMPLEMENTED** rather than failing. That is scored honestly in
[`PHASE_0_GAP_AND_RISK_REGISTER.md`](PHASE_0_GAP_AND_RISK_REGISTER.md); it is not a pass.

### A.4 Handoff package presence and linkage

Roadmap PR 0.1 (_Install governance package … Link it from the prior master handoff_) is
**complete**, verified on `main`:

| Check                                                                    | Result                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Package present at `docs/production-handoff/v1.3.0-security-resilience/` | yes, 42 files                                                                           |
| `sha256sum -c MANIFEST.sha256`                                           | all entries `OK`, exit 0                                                                |
| Pointer in `docs/production-handoff/v1.2/00_MASTER_HANDOFF.md`           | yes — §_Security, Privacy, Resilience, and Autonomous Repair Control Package_, line 284 |
| Prior governance removed or weakened                                     | none — `32ca483` touches exactly one file outside its own package, the pointer edit     |
| Runtime behavior changed by the install                                  | none                                                                                    |

A second package was merged after it and is also present on `main`:

| Check                                                  | Result                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `docs/production-handoff/v1.4.0-network-architecture/` | present, 42 files                                                 |
| `sha256sum -c MANIFEST.sha256`                         | all entries `OK`, exit 0                                          |
| Pointer in the v1.2 master handoff                     | yes — §_FreightOS Network Architecture Control Package_, line 292 |

**Finding — governance integrity is enforced for one package out of three.**
`.github/workflows/ci.yml:81-86` runs `sha256sum -c SHA256SUMS.txt` with
`working-directory: docs/production-handoff/v1.2`. The v1.3.0 and v1.4.0 packages each ship a
`MANIFEST.sha256`, and **neither is verified by CI**. Both verify clean when run by hand (§A.8), so
nothing is currently drifted — but a silent edit to either controlling package would not be caught.
Same for `handoff-provenance.json`, whose drift detection covers only the v1.2 root copies. Folded
into SR-8 in [`PHASE_0_PR_PLAN.md`](PHASE_0_PR_PLAN.md).

### A.4a Blocking defect found on the base branch, and fixed here

**`main` was failing CI at `1f74bdd` before this pull request existed.** The intake found it by
running the pipeline; it is not caused by anything in this branch.

`23_INSTALLATION_AND_HANDOFF_MERGE_INSTRUCTIONS.md` §4 requires an additive pointer in
`docs/production-handoff/v1.2/00_MASTER_HANDOFF.md`. Both install commits added one —
`32ca483` for v1.3.0, `64349a2` for v1.4.0 — and **neither regenerated
`docs/production-handoff/v1.2/SHA256SUMS.txt`**, which records that file's digest. The CI step
_Handoff integrity (SHA256)_ consequently failed:

```text
00_MASTER_HANDOFF.md: FAILED
sha256sum: WARNING: 1 computed checksum did NOT match
##[error]Process completed with exit code 1
```

This is a genuine conflict between two owner-authored instructions, not a mistake by either: the
v1.2 package is preserved and checksum-verified by a Phase 0 ruling, and v1.3.0 §4 requires editing
one of its files. They cannot both hold unless the recorded digest is updated to match the edit the
owner approved.

**Resolution applied in this pull request:** the single `00_MASTER_HANDOFF.md` line in
`SHA256SUMS.txt` is updated from `94f0ce7c…` to `6bbbe1ad…`, the digest of the file as the owner
merged it in PRs #6 and #7. One line changes; the other 89 entries are untouched and still verify.

Why this and not the alternatives:

- **Reverting the pointer** would violate v1.3.0 §4 and remove the controlling reference that makes
  the v1.3.0 and v1.4.0 packages binding. Not acceptable.
- **Excluding `00_MASTER_HANDOFF.md` from the check** would weaken the control permanently to avoid
  a one-line update. Not acceptable.
- **Leaving `main` red** would block every subsequent pull request and would train reviewers to
  ignore a failing integrity check — the exact failure mode `ci.yml` already documents for the
  secret scan, where output nobody reads looks like coverage.

**This is recorded for reversal, not presented as settled.** It changes a governance integrity
record, so it is listed as an owner decision in `PHASE_0_PR_PLAN.md` §D-9. If the owner prefers the
digest restored and the pointer relocated somewhere outside the checksummed package, that is a
one-line revert plus a move.

The structural gap remains and is not fixed here: **nothing forces `SHA256SUMS.txt` to be
regenerated when a checksummed file legitimately changes.** A validator for that belongs with the
SR-8 supply-chain work alongside the two unverified `MANIFEST.sha256` files.

### A.5 Document precedence

Three handoff packages now control this repository. Their own text establishes the order; nothing
below is an inference of mine.

1. **v1.3.0 security/resilience** — controlling for security, privacy, tenant isolation, zero-trust
   identity and authorization, reliability, disaster recovery, secure delivery, incident response,
   AI-agent authority, and bounded autonomous remediation. Where a prior implementation preference
   conflicts with a non-regression requirement, _the stricter requirement controls_
   (v1.2 `00_MASTER_HANDOFF.md:290`, v1.3.0 `README.md` §Relationship).
2. **v1.4.0 network architecture** — controlling for network domain model, identity graph, event
   language, command protocol, interoperability, and network sequencing. It is additive to both
   prior packages and states it "must not weaken any security, privacy, tenant-isolation,
   resilience, authority, or non-regression requirement" (v1.2 `00_MASTER_HANDOFF.md:300`,
   v1.4.0 `README.md` §Package relationship).
3. **v1.2 production handoff** — product constitution, commercial scope, pricing, logistics domain,
   sequencing doctrine, and the Horizon 1 stop rule. Still binding; not superseded.

Within v1.2 the existing internal priority order (`docs/production-handoff/v1.2/README.md:18-29`)
is unchanged, and its tie-break rule — the stricter restriction wins — is consistent with both
newer packages.

**Nothing in this Phase 0 work relaxes the Horizon 1 stop rule.** `config/scope/module_states.yaml`
still declares `horizon_authorized: 1` and `stop_after_horizon: 1`, all eight deferred-module flags
are still mandatory-`false`, and `scripts/validate-scope.mjs` still fails the build otherwise.

### A.6 Governance artifacts already present

`02_SECURITY_GOVERNANCE_AND_RISK_OWNERSHIP.md` §4 requires fourteen artifacts. Current state:

| Required artifact                   | Status on `main`                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Security and privacy risk register  | `docs/governance/RISK_REGISTER.md` — 15 entries, build-risk framing, no R0–R4 tiering                                  |
| System and data-flow diagrams       | **absent**                                                                                                             |
| Asset and service inventory         | **absent** before this document                                                                                        |
| Data-processing inventory           | `docs/governance/DATA_CLASSIFICATION.md` — classes and a partial field inventory; no purpose/retention/sharing columns |
| Threat models                       | `docs/governance/THREAT_MODEL.md` — one document, not per-domain, no abuse-case table                                  |
| Architecture decision records       | `adr/0001`–`adr/0025` plus `adr/PROVENANCE.md`                                                                         |
| Exception register with expirations | **absent**                                                                                                             |
| Vendor inventory and risk tier      | `docs/governance/INTEGRATION_REGISTRY.md` — integrations listed; no V0–V3 vendor tier                                  |
| Incident register                   | **absent**                                                                                                             |
| SLO and error-budget history        | **absent** — no SLO is defined anywhere                                                                                |
| Backup and restore evidence         | **absent** — no backup exists to evidence                                                                              |
| Access-review evidence              | **absent**                                                                                                             |
| Release provenance and SBOMs        | **absent** — `handoff-provenance.json` covers _document_ provenance, not build provenance                              |
| Agent/tool authority registry       | `config/agents/registry.yaml` — 32 agents; `allowed_tools` empty for every one; no tool registry exists                |

Named-role accountability under §2 is **not recorded anywhere**. `config/agents/registry.yaml`
states `owner` is "the repository owner pending per-agent accountable owners."

### A.7 Existing conflicts identified — not resolved here

Per constraint 1, these are recorded and escalated rather than settled.

**C-1 — Two packages both define a "Phase 1", and they are different work.**
v1.3.0 Phase 1 is identity and tenant isolation (PR 1.1–1.3). v1.4.0 Phase 1 is canonical
identifiers, schema registry, event envelope, and transactional outbox (PR 1–4). Both touch
identity and events; neither states which runs first. v1.4.0 is additive and non-weakening, which
resolves _conflicts_ but not _sequence_. Owner decision required — see `PHASE_0_PR_PLAN.md` §D-1.

**C-2 — PR #5 is in flight and delivers most of v1.3.0 Phase 1.**
Branch `claude/phase-1-pr-2-identity-organization` (head `0ca3628`, unmerged, under independent
rereview) adds migrations 0005–0017, `packages/identity`, an authorization mutation boundary, and
370 integration tests. That is substantially SEC-01, SEC-02, and part of SEC-03. It is **not on
`main`**, so no gate is scored on it. It is recorded throughout as in-flight evidence so the PR
plan does not propose rebuilding work that already exists. Owner decision required on whether
v1.3.0 PR 1.1/1.2 are satisfied by PR #5 once merged, or are separate follow-on work.

**C-3 — `app.current_actor_id()` is a caller-supplied session variable on `main`.**
Constraint 6 forbids using client-controlled actor IDs as independent proof of authority.
On `main` the audit trail's `actor_id` comes from `set_config('app.actor_id', …)` with no
verification, because no authenticated principal model exists yet. This is a real gap, not a
defect introduced by anyone; it is the first thing v1.3.0 Phase 1 exists to fix. Classified R3.

**C-4 — v1.2's `08_AGENT_OPERATING_SYSTEM` and the agent registry describe agents with autonomy
ceilings; v1.3.0 Article VIII treats agent output as untrusted absent a deterministic policy
engine.** These are compatible in direction but the repository has neither an agent runtime nor a
policy engine, and `allowed_tools` is empty for all 32 registry entries — which the registry itself
documents as meaning _no tool may be called_. No conflict is active today. It becomes one the
moment an agent runtime is built, and v1.3.0 Article VIII then controls.

**C-5 — `validate_handoff.py:86` still blocks Horizon 1 commercial billing.**
Carried forward from Phase 0 as risk R-11, still open. Unrelated to security, recorded so the
register stays complete.

**C-6 — the preserved-package rule and the required-pointer rule contradicted each other, and the
contradiction was live.** Resolved in this pull request as described in §A.4a, and listed for owner
reversal in `PHASE_0_PR_PLAN.md` §D-9.

### A.8 Evidence for this intake

Commands run on `claude/freightos-handoff-setup-xbwhlc` at `1f74bdd`, clean tree.
`pnpm verify` does **not** include the handoff SHA256 check — that step exists only in
`ci.yml` — which is why it passed locally while CI failed:

```text
sha256sum -c SHA256SUMS.txt    (v1.2 package)     → 00_MASTER_HANDOFF.md FAILED, exit 1  ← pre-existing on main
                                 after the §A.4a fix → 90 files OK, exit 0
sha256sum -c MANIFEST.sha256   (v1.3.0 package)   → all OK, exit 0
sha256sum -c MANIFEST.sha256   (v1.4.0 package)   → all OK, exit 0
pnpm install --frozen-lockfile                    → exit 0
pnpm verify                                       → exit 0
pnpm test                                         → 4 files, 56 tests passed, exit 0
pnpm test:integration                             → 3 files, 49 tests passed, exit 0
pnpm audit                                        → 5 vulnerabilities: 1 critical, 1 high, 3 moderate
```

`pnpm verify` prints:

```text
HANDOFF_VALIDATION=PASS   FILES=91   SEQUENCING_DOCTRINE=PASS
HORIZON_1_STOP_RULE=PASS  DEFERRED_PRODUCTS_DISABLED=PASS  SAFETY_BOUNDARY=PASS
PROVENANCE=PASS  FILES=45  VERBATIM=42  AUTHORISED_OVERRIDES=3
SCOPE_VALIDATION=PASS  HORIZON_1_ONLY=PASS  DEFERRED_MODULES_DISABLED=PASS
AUTONOMY_CEILING=PASS  SAFETY_BOUNDARY=PASS  BILLING_DISABLED=PASS
```

No live operation, permission, payment path, credential, or external side effect was enabled,
changed, or exercised in producing any document in this directory.
