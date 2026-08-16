# Graph Node Ownership Audit

Tests the core invariant every graph declares:
**ONE WorkUnit → ONE graph version → ONE current state → ONE accountable owner.**

## 1. Verdict

**The invariant holds among defined states and fails at the boundaries.** No defined state has two
owners. But 68% of declared terminal states are not states at all, and 61% of owners are not jobs.

## 2. What passes

| Check                                                                  | Result  | Detail                                            |
| ---------------------------------------------------------------------- | ------- | ------------------------------------------------- |
| States with more than one owner                                        | **0**   | across all 211 nodes in 36 graphs                 |
| Nodes without an `owner` field                                         | **0**   | schema-required, present everywhere               |
| Orphan / unreachable nodes                                             | **0**   | every defined node reachable from its entry state |
| Cycles                                                                 | **0**   | all 36 graphs acyclic                             |
| `single_accountable_owner: true` declared                              | 36 / 36 |                                                   |
| Invariant _"one WorkUnit has exactly one accountable owner at a time"_ | 36 / 36 |                                                   |

Among nodes the graphs actually define, owner uniqueness is clean. That is a real result.

## 3. GN-01 — 55 of 90 owners have no Job Book _(blocking)_

Distinct owners across the 36 graphs: **90**. Coverage:

| Plane                      | Distinct owners | Have a v1.8.1 Job Book | Match an accepted v1.8 job name | **Unbooked** |
| -------------------------- | --------------: | ---------------------: | ------------------------------: | -----------: |
| `revenueos`                |              15 |                     15 |                               0 |            0 |
| `revenueos_financial`      |               4 |                      4 |                               0 |            0 |
| `revenueos_fmi`            |               7 |                      7 |                               0 |            0 |
| `revenueos_to_operational` |               4 |                      4 |                               0 |            0 |
| `shared_fmi`               |              16 |                     16 |                               0 |            0 |
| `twin_configuration`       |              10 |                  **0** |                               0 |       **10** |
| `twin_integration`         |              20 |                  **0** |                               0 |       **20** |
| `twin_network`             |              12 |                  **0** |                               0 |       **12** |
| `twin_operations`          |               8 |                  **0** |                               0 |        **8** |
| `cross_plane`              |               6 |                  **0** |                               0 |        **6** |
| **Total (distinct)**       |          **90** |                 **35** |                           **0** |       **55** |

Two structural causes:

1. **The provisional Job Book schema cannot express a Twin owner.**
   `schemas/provisional-job-book.schema.json` constrains `plane` to `enum: ["revenueos", "fmi"]`
   and `graph_membership` to `^(REV|FMI|XPL)-G[0-9]{2}$`. **No Job Book can reference a `TWIN-G##`
   graph.** All 50 Twin owners are therefore unbookable by construction, not by omission.
2. **No XPL Job Book was written**, though the pattern permits `XPL-G##`. All 6 cross-plane owners —
   including the only `logistics_command` executor in the package — are unbooked.

**Consequence:** for 12 Twin graphs and 6 cross-plane graphs, the accountable owner has no
certification status, no autonomy ceiling, no tool list, and no command contract. The invariant
names an owner that does not exist as a governed entity. Conflicts **C-04**, **C-05**.

## 4. GN-02 — 76 of 111 declared terminal states are not nodes _(blocking)_

Every graph declares `terminal_states`. Checked against defined node ids and states:

|                                                                   |        Count |
| ----------------------------------------------------------------- | -----------: |
| `terminal_states` declarations across 36 graphs                   |          111 |
| Matching a defined node                                           |           35 |
| **Not defined anywhere — no owner, no preconditions, no timeout** | **76 (68%)** |

Undefined terminals by name:

| Terminal                                                                                                                                                                                                                                            | Graphs declaring it |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------: |
| `HOLD`                                                                                                                                                                                                                                              |        **36 (all)** |
| `DENIED`                                                                                                                                                                                                                                            |                  14 |
| `REJECTED`                                                                                                                                                                                                                                          |                   4 |
| `QUARANTINE`, `CONFLICT`                                                                                                                                                                                                                            |              2 each |
| `STALE`, `SOURCE_SUSPENDED`, `UNVERIFIED`, `DISPUTED`, `THIN_MARKET`, `NOT_COMPUTABLE`, `NO_RELEVANCE`, `SUPPRESSED`, `RECYCLE`, `ACCEPTED`, `REVISE`, `DECLINED`, `HANDOFF_DEFECT`, `NO_FIT`, `EXCEPTION`, `IGNORED`, `COMPLETED`, `REMOTE_DENIED` |              1 each |

Only 35 terminals — chiefly the `*_PUBLISHED` states and `OPERATIONAL_RECONCILIATION` (6) — resolve
to real nodes with real owners.

**Why this breaks the invariant:** a WorkUnit that reaches `HOLD`, `DENIED`, `QUARANTINE`, `STALE`
or `DISPUTED` is in a state with **no accountable owner**. Nothing can be asked to clear it, no
timeout applies, and no exit condition is defined. The states carrying the worst outcomes —
a denied disclosure, a suspended source, a disputed commission, an unverified rumour — are exactly
the ones left unowned.

## 5. GN-03 — 192 of 211 nodes route failure into an undefined state

91% of nodes declare `failure_transition: "HOLD"`. `HOLD` is not a node in any of the 36 graphs.
The remaining 19 nodes route to a real sibling node (e.g. REV-G01 `R4_CONTACT` →
`R3_ELIGIBILITY`, which is correct).

Combined with GN-02, the failure path of the entire package terminates in one shared, ownerless,
undefined sink.

**Required change:** define `HOLD` as a real node in every graph — owner, entry preconditions, exit
postconditions, timeout, and an escalation edge — or replace it with a per-graph owned exception
state. The accepted v1.8 package already has the vocabulary for this in
`05_EXCEPTION_OWNERSHIP_STANDARD.md`, which v1.8.1 does not reference.

## 6. GN-04 — Owner strings are unbound identifiers

Owners are free-text names (`"Pricing Engine"`, `"Participant command executor"`). Nothing binds
them to a Job Book slug, a registry agent id, or a role. The 35 matches in §3 were obtained by
exact **name** comparison; a rename in either artifact silently breaks the binding, and no validator
would notice. The repository already treats this class of drift seriously —
`scripts/check-handoff-provenance.mjs` pins content by sha256, and W0/W1 devoted findings
R-07…R-11 to duplicated identity. **Required change:** owners reference a Job Book `slug`, and a
validator asserts every graph owner resolves.

## 7. GN-05 — Two Job Books own nothing

`Ocean & Port Intelligence Agent` and `Rail & Intermodal Intelligence Agent` declare
`graph_membership: ["FMI-G04"]` but own no node in FMI-G04 or any other graph. The inverse of GN-01:
jobs without states, mirroring the _"41 orphan jobs in the design graph"_ W0/W1 recorded for v1.8.
Both target modules (`ocean_adapter`, `rail_adapter`) are `INTERFACE_AND_SIMULATION_ONLY` with
`earliest_horizon: 3`, so deferral is the correct disposition.

## 8. Required changes

1. Define and own every declared terminal state, starting with `HOLD` in all 36 graphs
   (**GN-02, GN-03**, blocking).
2. Widen the provisional Job Book schema to express Twin owners; author XPL Job Books
   (**GN-01 / C-04, C-05**, blocking).
3. Bind graph `owner` to a Job Book `slug` and add a resolution validator (**GN-04**).
4. Defer or merge the two ownerless FMI components (**GN-05**).
