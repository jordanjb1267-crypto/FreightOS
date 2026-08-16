# RevenueOS / FMI / Operational Twin — Independent Cross-Package Architecture Review (v1.8.1)

**Status:** audit deliverable. Nothing here is an implementation, a promotion, or an acceptance.
**Date:** 2026-08-16.
**Audit branch:** `audit/v1.8.1-revenueos-twin-cross-package`.
**Audit base:** `main` @ `54c55c5becb8f6c37e520c829ec78fcdcbebded3` (== `origin/main`).
**Subject:** `docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture/` (233 files), merged into `main` by PR #33 (`3bde242` → merge `54c55c5`).
**Controlling audit specification:** package file `28_CLAUDE_CROSS_PACKAGE_AUDIT_PROMPT.md`, plus `26_CROSS_PACKAGE_AUDIT_SPEC.md`.

**Overall verdict: `V1_8_1_CROSS_PACKAGE_AUDIT=COHERENT_WITH_REQUIRED_CHANGES`.**

The architecture is internally coherent and, in its authority direction, correct. It is not
implementable as written without the changes recorded in
[`CROSS_PACKAGE_CONFLICT_REGISTER.md`](CROSS_PACKAGE_CONFLICT_REGISTER.md), because the
primitives it presumes — WorkUnit, graph runtime, agent runtime, entitlement, adapter, egress —
do not exist in this repository, and because five defects inside the package's own machine-readable
artifacts contradict invariants the package itself declares.

---

## Method, and what counts as evidence

Documentation is never evidence of implementation. Every PASS in the four gate matrices cites a
path, migration, table, script, or test that was opened at the audit base. Where a claim rests on a
package design artifact rather than on running code, the row says so and scores PARTIAL or
NOT_IMPLEMENTED, never PASS.

Three classes of evidence are used, and kept apart:

| Class                      | Meaning                                                | Example                                                                        |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Runtime**                | code, executed migration, table, CI gate, passing test | `packages/database/migrations/0032_*.up.sql`, `scripts/validate-scope.mjs:402` |
| **Package artifact**       | machine-readable JSON/CSV shipped in v1.8.1            | `graphs/revenueos/rev_g01.json`, `matrices/GRAPH_NODE_OWNERSHIP.csv`           |
| **Accepted prior finding** | a merged repository-local audit                        | `docs/workforce-engineering/CURRENT_WORKFORCE_INVENTORY.md`                    |

Where accepted rules conflict, the stricter security / tenant / authority / privacy / legal /
audit / resilience / certification rule controls, and the conflict is recorded rather than
reconciled.

## Independence

No unaccepted v1.9 material was read or used. The quarantined branch
`design/v1.9.0-workforce-operational-design-completion` @ `d5aa458` exists and was left untouched;
its contents were never opened, diffed, or cherry-picked. The working-tree path
`docs/production-handoff/v1.9.0-workforce-operational-design-completion/` contains **zero files** —
eight empty directories left by a prior branch switch — which is why it does not appear in
`git status`. Its directory names were listed as a preflight fact and nothing was read, moved, or
deleted. See [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md) §D-09.

## The three findings that govern everything else

**1 — The package is one to three layers above its substrate.** v1.8.1 proposes 37 Job Books,
36 typed durable graphs, 31 WorkUnit types, and a five-participant Operational Twin. The repository
contains no WorkUnit, no graph engine, no agent runtime, no command registry, no approval engine,
no entitlement model, no adapter, and — by CI gate — no network egress at all. This is not a
criticism of the design; it is a statement of distance. The accepted W0/W1 audit already recorded
the same distance for v1.8's 76 jobs, of which **0 are implemented**.

**2 — Five defects inside the package contradict the package's own invariants.** These are
provable from the shipped JSON alone, independently of the repository:

| #   | Defect                                                                   | Measure                                                        |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| G-1 | Declared terminal states that are not nodes — no owner, no preconditions | **76 of 111** (68%), incl. `HOLD` in all 36 graphs             |
| G-2 | Nodes whose failure path targets undefined `HOLD`                        | **192 of 211** (91%)                                           |
| G-3 | Graphs referencing the kill switch                                       | **0 of 36**, while `kill_switches` exists and v1.3 mandates it |
| G-4 | Side-effecting nodes without idempotent/reconcile retry                  | **10 of 21**                                                   |
| G-5 | Graph node owners with no Job Book of any kind                           | **55 of 90**, incl. every Twin and cross-plane owner           |

Each contradicts the invariant _"one WorkUnit has exactly one accountable owner at a time"_, which
all 36 graphs declare.

**3 — The commercial plane is CI-prohibited today, and that is a feature.** All 11 products in
`config/pricing/products.yaml` carry `billing_enabled: false` and `customer_sale_allowed: false`,
asserted by `scripts/validate-scope.mjs:402-409`; `stop_after_horizon` must be `1` (`:38`); egress
is pinned at zero by two gates. RevenueOS cannot mis-sell because nothing can be sold. The audit
treats this as the correct posture and does not recommend relaxing it — but it means most REV gates
are vacuously safe rather than actually enforced, and that distinction is preserved in the matrix.

## What the design gets right

This is not a package that needs redirection. Its authority direction is correct and is worth
stating plainly:

- Every one of the 37 provisional Job Books carries `production_logistics_authority: false`,
  `certification: NOT_J0`, `status: AUDIT_CANDIDATE` — enforced by
  `schemas/provisional-job-book.schema.json` (`const` constraints, `additionalProperties: false`).
- `matrices/HUMAN_AGENT_MODE_MATRIX.csv` states _"no authority from mode"_ for OBSERVE and ASSIST,
  and requires _"existing J/G/A/policy/command gates"_ for BOUNDED_AUTONOMY. This is exactly the
  property Section 7 asks for: entitlement and mode never raise autonomy.
- The FMI→operational bridge (`XPL-G01..G06`) structurally interposes `XC3_POLICY` and
  `XC4_APPROVAL` between an intelligence signal and `XC5_COMMAND`. The forbidden edge
  _signal → command_ does not exist in any graph.
- Customer-facing intelligence is placed on a `revenueos_fmi` plane, distinct from `shared_fmi`,
  so the shared substrate does not inherit commercial identity.
- Graph hygiene is genuinely good: 36/36 registry reconciliation, 211 nodes / 185 edges matching
  the matrices exactly, 0 missing schema-required fields, 0 orphan nodes, 0 cycles, 0 duplicate
  owners among defined states, 185/185 edges typed.

## Document index

Section 15 of the audit instruction and §28 of the package name overlapping deliverable sets. This
directory uses the Section 15 names; the crosswalk column shows which §28 deliverable each
satisfies, so no document is duplicated merely to satisfy two lists.

### Commercial plane

| Document                                                                             | Covers                                    | §28 crosswalk |
| ------------------------------------------------------------------------------------ | ----------------------------------------- | ------------- |
| [`CURRENT_PRODUCT_COMMERCIAL_INVENTORY.md`](CURRENT_PRODUCT_COMMERCIAL_INVENTORY.md) | what commercial machinery actually exists | §28.2         |
| [`CAPABILITY_GRAPH_GAP_MAP.md`](CAPABILITY_GRAPH_GAP_MAP.md)                         | capability as contract boundary; H1/H2    | §28.3         |
| [`ENTITLEMENT_ACTIVATION_GAP_MAP.md`](ENTITLEMENT_ACTIVATION_GAP_MAP.md)             | entitlement ≠ authority; H3               | §28.4         |
| [`REVENUE_PLANE_AUTHORITY_MAP.md`](REVENUE_PLANE_AUTHORITY_MAP.md)                   | RevenueOS authority boundary; H4          | §28.5         |
| [`REVENUE_WORKFORCE_DECOMPOSITION.md`](REVENUE_WORKFORCE_DECOMPOSITION.md)           | 17 RevenueOS candidates classified        | §28.6         |
| [`PROMISE_FIREWALL_GAP_MAP.md`](PROMISE_FIREWALL_GAP_MAP.md)                         | claim control; H7                         | §28.7         |
| [`PARTNER_CHANNEL_GAP_MAP.md`](PARTNER_CHANNEL_GAP_MAP.md)                           | partner identity/isolation; H9            | §28.8         |
| [`ATTRIBUTION_COMMISSION_GAP_MAP.md`](ATTRIBUTION_COMMISSION_GAP_MAP.md)             | commission without payout authority; H8   | §28.9         |
| [`DATA_PRIVACY_BOUNDARY_MAP.md`](DATA_PRIVACY_BOUNDARY_MAP.md)                       | commercial data least-privilege           | §28.10        |

### Freight Market Intelligence

| Document                                                                                 | Covers                        | §28 crosswalk  |
| ---------------------------------------------------------------------------------------- | ----------------------------- | -------------- |
| [`FMI_ARCHITECTURE_AND_SOURCE_GAP_MAP.md`](FMI_ARCHITECTURE_AND_SOURCE_GAP_MAP.md)       | FMI substrate; H10/H12        | §28.12         |
| [`FMI_WORKFORCE_DECOMPOSITION.md`](FMI_WORKFORCE_DECOMPOSITION.md)                       | 20 FMI candidates classified  | §28.13         |
| [`FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.md`](FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.md) | evidence≠command; H11         | §28.14         |
| [`MARKET_SOURCE_AND_PROVENANCE_GAP_MAP.md`](MARKET_SOURCE_AND_PROVENANCE_GAP_MAP.md)     | rights, provenance, freshness | §28 FMI proofs |

### Operational Twin

| Document                                                                                 | Covers                                        | §28 crosswalk                      |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------- |
| [`OPERATIONAL_TWIN_RUNTIME_GAP_MAP.md`](OPERATIONAL_TWIN_RUNTIME_GAP_MAP.md)             | Twin runtime feasibility; H14–H22             | `TWIN_RUNTIME_COEXISTENCE_GAP_MAP` |
| [`SYSTEM_OF_RECORD_BINDING_MAP.md`](SYSTEM_OF_RECORD_BINDING_MAP.md)                     | authority per fact; split-brain               | `SYSTEM_OF_RECORD_BINDING_MAP`     |
| [`HUMAN_AGENT_COEXISTENCE_AUDIT.md`](HUMAN_AGENT_COEXISTENCE_AUDIT.md)                   | one WorkUnit, human+agent                     | `HUMAN_AGENT_WORKUNIT_COEXISTENCE` |
| [`TWIN_LEARNING_AND_CHANGE_CONTROL_AUDIT.md`](TWIN_LEARNING_AND_CHANGE_CONTROL_AUDIT.md) | learning proposes, never rewrites             | `TWIN_LEARNING_CHANGE_CONTROL_GAP` |
| [`NETWORK_INGRESS_EGRESS_AUDIT.md`](NETWORK_INGRESS_EGRESS_AUDIT.md)                     | disclosure, projection, no authority transfer | `TWIN_NETWORK_INGRESS_EGRESS_MAP`  |
| [`PARTICIPANT_TWIN_PROFILE_GAP_MAP.md`](PARTICIPANT_TWIN_PROFILE_GAP_MAP.md)             | COT/BOT/FOT/SOT/SPOT                          | §28 Twin profiles                  |
| [`TWIN_WORKBENCH_GAP_MAP.md`](TWIN_WORKBENCH_GAP_MAP.md)                                 | human control surface                         | §28 workbench                      |

### Typed durable graphs

| Document                                                                   | Covers                            | §28 crosswalk                                                       |
| -------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| [`GRAPH_RUNTIME_COMPATIBILITY_MAP.md`](GRAPH_RUNTIME_COMPATIBILITY_MAP.md) | can the runtime execute these?    | `GRAPH_REGISTRY_RECONCILIATION`, `TWIN_GRAPH_RUNTIME_COMPATIBILITY` |
| [`GRAPH_NODE_OWNERSHIP_AUDIT.md`](GRAPH_NODE_OWNERSHIP_AUDIT.md)           | owner uniqueness, 90 owners       | `GRAPH_NODE_OWNERSHIP_GAP_MAP`, `GRAPH_AUTHORITY_CONFLICT_MAP`      |
| [`GRAPH_EDGE_HANDOFF_AUDIT.md`](GRAPH_EDGE_HANDOFF_AUDIT.md)               | typed edges, authority checks     | `GRAPH_EDGE_AND_HANDOFF_GAP_MAP`                                    |
| [`GRAPH_FAILURE_REPLAY_GAP_MAP.md`](GRAPH_FAILURE_REPLAY_GAP_MAP.md)       | failure, retry, replay, crash     | `GRAPH_FAILURE_RETRY_RECONCILIATION_GAP`, `GRAPH_CERTIFICATION_GAP` |
| [`JOB_BOOK_OVERLAP_AND_MERGE_MAP.md`](JOB_BOOK_OVERLAP_AND_MERGE_MAP.md)   | 37 candidates vs 76 accepted jobs | `PROVISIONAL_JOB_BOOK_RECONCILIATION`                               |

### Scoring, conflicts, sequence

| Document                                                                   | Covers                                |
| -------------------------------------------------------------------------- | ------------------------------------- |
| [`REV_01_REV_48_MATRIX.md`](REV_01_REV_48_MATRIX.md)                       | 48 RevenueOS gates                    |
| [`FMI_01_FMI_28_MATRIX.md`](FMI_01_FMI_28_MATRIX.md)                       | 28 FMI gates                          |
| [`GR_01_GR_32_MATRIX.md`](GR_01_GR_32_MATRIX.md)                           | 32 graph gates                        |
| [`TW_01_TW_40_MATRIX.md`](TW_01_TW_40_MATRIX.md)                           | 40 Twin gates                         |
| [`CROSS_PACKAGE_CONFLICT_REGISTER.md`](CROSS_PACKAGE_CONFLICT_REGISTER.md) | conflicts vs v1.3–v1.8 and W0/W1      |
| [`PROPOSED_ADDITIVE_PR_SEQUENCE.md`](PROPOSED_ADDITIVE_PR_SEQUENCE.md)     | design-only implementation order      |
| [`CLAIM_BOUNDARY_ASSESSMENT.md`](CLAIM_BOUNDARY_ASSESSMENT.md)             | what may and may not be claimed today |
| [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md)                                 | decisions only the owner can make     |

## Gate totals

| Family     |   PASS | PARTIAL |  FAIL | NOT_IMPLEMENTED |   N/A |   Total |
| ---------- | -----: | ------: | ----: | --------------: | ----: | ------: |
| REV-01..48 |      2 |      10 |     1 |              35 |     0 |      48 |
| FMI-01..28 |      1 |      13 |     0 |              14 |     0 |      28 |
| GR-01..32  |      7 |      18 |     3 |               4 |     0 |      32 |
| TW-01..40  |      1 |      19 |     1 |              19 |     0 |      40 |
| **Total**  | **11** |  **60** | **5** |          **72** | **0** | **148** |

## Scope of this audit

Created: documentation under `docs/revenueos-architecture-review/` only. Changed: nothing else.
No runtime code, migration, schema, permission, RLS policy, entitlement, integration, agent,
graph, or accepted handoff file was modified. No candidate was promoted from `AUDIT_CANDIDATE`
to J0. No market or news source was contacted, connected, or ingested. Nothing was merged or
deployed.
