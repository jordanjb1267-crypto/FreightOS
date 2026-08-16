# Graph Runtime Compatibility Map

Can the current runtime execute the 36 typed durable graphs? Registry reconciliation, primitive
requirements, and the distance between artifact and execution.

## 1. Verdict

**No. Not one of the 36 graphs can be executed, and the gap is not incremental — it is the entire
durable-execution layer.** The graphs are, however, unusually well-formed artifacts, and the
reconciliation below is clean.

## 2. Registry reconciliation (GR-01) — PASS

Verified by parsing every file at the audit base:

| Check                                      | Result                      |
| ------------------------------------------ | --------------------------- |
| `graphs/GRAPH_REGISTRY.json` entries       | 36                          |
| Graph files on disk under `graphs/**`      | 36                          |
| In registry, missing on disk               | **0**                       |
| On disk, missing from registry             | **0**                       |
| Registry node/edge counts vs actual        | **0 mismatches**            |
| `matrices/GRAPH_REGISTRY.csv` rows         | 36                          |
| `matrices/GRAPH_NODE_OWNERSHIP.csv` rows   | **211** = actual node total |
| `matrices/GRAPH_EDGE_HANDOFFS.csv` rows    | **185** = actual edge total |
| Graphs with `status: AUDIT_CANDIDATE`      | **36 / 36**                 |
| Graphs with `version: 0.1-audit-candidate` | 36 / 36                     |

Registry, files, and all three matrices agree exactly. This is better registry hygiene than the
accepted v1.8 package achieved, where W0/W1 found 7 registry manifests mapping to no job.

## 3. Schema validity (GR-02) — PASS

`schemas/typed-workflow-graph.schema.json` requires 13 graph-level fields, 9 node fields, and 6 edge
fields. Checked across all 36 graphs / 211 nodes / 185 edges: **0 missing required fields.**

## 4. Composition

| Plane                                           | Graphs |   Nodes | WorkUnit types                               |
| ----------------------------------------------- | -----: | ------: | -------------------------------------------- |
| `revenueos` (+ `_financial`, `_to_operational`) |      8 |      50 | 8 distinct                                   |
| `shared_fmi` + `revenueos_fmi`                  |     10 |      60 | 10 distinct                                  |
| `cross_plane`                                   |      6 |      36 | **1 shared** (`OperationalDecisionWorkUnit`) |
| `twin_*` (4 planes)                             |     12 |      65 | 12 distinct                                  |
| **Total**                                       | **36** | **211** | **31 distinct**                              |

Graphs are small — 5 to 8 nodes each — which is appropriate for durable state machines.

## 5. Required runtime primitives vs what exists

| Primitive the graphs require             | Exists in repository               | Evidence                                                                                               |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| WorkUnit record with a current state     | **NO**                             | `work_unit` / `workunit` → 0 hits across 35 executed migrations; W0/W1 §2 confirms 0 hits and no table |
| 31 WorkUnit **types**                    | **NO**                             | —                                                                                                      |
| Graph definition store + version pinning | **NO**                             | no graph table; no loader                                                                              |
| State transition executor                | **NO**                             | no workflow engine, no queue consumer, no worker daemon (W0/W1)                                        |
| Typed artifact store (edge payloads)     | **NO**                             | `graphs/TYPED_ARTIFACT_REGISTRY.json` is a design artifact                                             |
| Owner assignment / handoff acceptance    | **NO**                             | W0/W1: _"no WorkUnit, ownership record, handoff, or acceptance state exists"_                          |
| Timeout / deadline scheduler             | **NO**                             | every node declares a timeout (`PT15M`/`PT30M`); nothing evaluates it                                  |
| Retry executor                           | **NO**                             | 4 retry policies declared; no executor                                                                 |
| Idempotency key store                    | **NO**                             | `network_transport_intents` (`0030`) is idempotent but network-specific                                |
| Approval gate                            | **NO**                             | DB-enforced human approval exists for `admin.*` bootstrap only, not for WorkUnits                      |
| Policy evaluation                        | **NO**                             | `config/policy/base_policy.yaml` read by nothing (W0/W1)                                               |
| Kill switch binding                      | **table exists, unused by graphs** | `kill_switches` (`0004`,`0014`,`0015`); **0 of 36 graphs reference it**                                |
| Append-only audit for transitions        | **substrate exists**               | `audit_events` (`0003`,`0006`,`0031`); no graph binding                                                |
| Tenant isolation                         | **substrate exists**               | `FORCE` RLS across 16 migrations                                                                       |
| External egress (7 nodes need it)        | **CI-pinned at zero**              | `egress-allowlist.json` `expectedCount: 0`                                                             |

**Two of fifteen required primitives exist, and both are substrate rather than binding.**

## 6. Runtime compatibility per plane

| Plane           | Executable today | Blocking dependency                                                         |
| --------------- | ---------------- | --------------------------------------------------------------------------- |
| `revenueos`     | **NO**           | WorkUnit + graph engine + entitlement; 2 nodes need egress                  |
| `shared_fmi`    | **NO**           | WorkUnit + graph engine + **source registry** + egress for ingestion        |
| `revenueos_fmi` | **NO**           | as above + customer relevance store                                         |
| `cross_plane`   | **NO**           | WorkUnit + graph engine + **command registry** + per-domain owner (FC-01)   |
| `twin_*`        | **NO**           | WorkUnit + graph engine + **adapters** + egress + system-of-record bindings |

## 7. Graph-theoretic results (full detail in the three sibling documents)

| Property                                                    | Result               |
| ----------------------------------------------------------- | -------------------- |
| Orphan / unreachable nodes                                  | **0** of 211         |
| Cycles                                                      | **0**                |
| Duplicate owner on a defined state                          | **0**                |
| Edges with a typed artifact                                 | **185 / 185**        |
| Entry states resolvable                                     | 36 / 36              |
| **Declared terminal states with no node**                   | **76 of 111 (68%)**  |
| **Nodes routing failure to undefined `HOLD`**               | **192 of 211 (91%)** |
| **Graphs referencing the kill switch**                      | **0 of 36**          |
| **Side-effecting nodes without idempotent/reconcile retry** | **10 of 21**         |
| **Owners with no Job Book**                                 | **55 of 90**         |

The first five rows are genuinely good. The last five are the defects that must close before any
graph is implemented, and all five are provable from the shipped JSON without reference to the
repository.

## 8. Conclusion

The graphs are **design-complete and runtime-incompatible**. Their internal consistency means the
work needed is construction, not redesign — but the construction is the whole durable-execution
layer, which the accepted v1.8 package also requires and which W0/W1 already scoped
(`WORK_UNIT_OWNERSHIP_MAP.md` Part E). **v1.8.1 must not be sequenced ahead of that layer**, and no
graph should be authored as `J0` until GR-03, GR-09, GR-12, GR-15 close. See
[`PROPOSED_ADDITIVE_PR_SEQUENCE.md`](PROPOSED_ADDITIVE_PR_SEQUENCE.md).
