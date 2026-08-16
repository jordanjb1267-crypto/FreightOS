# Proposed Additive PR Sequence — Design Only

**This audit is not authorized to implement any of this.** The sequence is a recommendation for the
owner's independent review. Nothing below has been built, and no PR has been opened.

## 1. Why this order differs from the package's own sequence

`49_END_TO_END_IMPLEMENTATION_SEQUENCE.md` proposes an order derived from the package's internal
structure. This sequence is derived from **repository evidence** and differs on four points:

1. **Package-artifact repairs come first.** Five defects (G-1…G-5) are provable from the shipped
   JSON and fixable by editing that JSON. They cost days, not months, and every later phase inherits
   them if deferred. The package sequence does not treat them as work.
2. **The WorkUnit layer is a shared prerequisite, not a RevenueOS deliverable.** It is equally
   required by the accepted v1.8 workforce (0 of 76 jobs implemented) and by all 36 v1.8.1 graphs.
   Building it inside RevenueOS would produce a second orchestration system — the outcome H5
   explicitly warns against.
3. **Egress is a single gated architectural event**, not a per-component detail. RevenueOS outreach,
   FMI ingestion, Twin adapters, non-native counterparty channels **and the workbench's HTTP
   server** all depend on the same allowlist decision.
4. **Horizon governance re-orders the Twin.** BOT, FOT and SOT target modules with
   `implementation_allowed: false`. Only **COT and SPOT** are inside Horizon 1, so the first Twin
   cannot be the five-sided network the package assumes.

## 2. Phase 0 — Package repair (docs/artifacts only, no runtime)

Closes GR-09, GR-12, GR-15 (the three FAILs) and materially improves GR-03/04, TW-17. **No runtime
change, no migration, no schema change to the database.** This is the highest value-per-effort work
in the entire sequence.

| PR        | Objective                                                                                                                                                                                                                                | Affects                                        | Gates closed                          | Owner decision? |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | --------------- |
| **P0-1**  | Define `HOLD` (or per-graph exception states) as a real node in all 36 graphs — owner, preconditions, exit, timeout, escalation edge. Reference accepted v1.8 `05_EXCEPTION_OWNERSHIP_STANDARD.md`.                                      | 36 graph JSON + `GRAPH_NODE_OWNERSHIP.csv`     | **GR-12**, GR-03, GR-04, TW-17        | no              |
| **P0-2**  | Define and own the other 40 undefined terminal states (`DENIED`, `REJECTED`, `STALE`, `DISPUTED`, `QUARANTINE`, `CONFLICT`, `UNVERIFIED`, `THIN_MARKET`, …).                                                                             | 36 graph JSON                                  | GR-03, GR-04, FMI-05/09/14, REV-30/40 | no              |
| **P0-3**  | `idempotent_retry` + declared key, or `reconcile_before_retry`, on all 10 exposed side-effecting nodes.                                                                                                                                  | 8 graph JSON                                   | **GR-09**, FMI-07, TW-22              | no              |
| **P0-4**  | Add a kill-switch check to the node contract; require it on all 21 side-effecting nodes.                                                                                                                                                 | `typed-workflow-graph.schema.json` + 36 graphs | **GR-15** (C-12)                      | no              |
| **P0-5**  | Add `OUTCOME_UNKNOWN` as a first-class owned state on every side-effecting node.                                                                                                                                                         | schema + 36 graphs                             | GR-10, TW-23 (C-13)                   | no              |
| **P0-6**  | Converge `provisional-job-book.schema.json` on the v1.8 standard: restore `owns`, `upstream`, `downstream`, `tools`; allow `plane: twin`; allow `TWIN-G##` in `graph_membership`; map the 13 classes to the v1.8 `component` vocabulary. | 1 schema + 37 Job Books                        | GR-31, TW-17 (C-04, C-17)             | no              |
| **P0-7**  | Author the missing Job Books — 50 Twin owners + 6 cross-plane owners, incl. the `XC5_COMMAND` executor.                                                                                                                                  | new Job Books                                  | GR-03, GR-20, TW-17 (C-05)            | **yes — D-10**  |
| **P0-8**  | Rename the commercial capability object away from `capability`.                                                                                                                                                                          | schemas + matrices                             | REV-03 (C-03)                         | **yes — D-14**  |
| **P0-9**  | Per-participant WorkUnit types for XPL-G02..G06 with domain gates encoded (brokerage legal gate, FacilityOS motion-control prohibition), **or** collapse to XPL-G01.                                                                     | 6 graph JSON                                   | GR-07, GR-21..24, FMI-22/23 (C-10)    | **yes — D-15**  |
| **P0-10** | Bind graph `owner` strings to Job Book slugs; add a resolution validator to CI.                                                                                                                                                          | validator script                               | GR-03 (GN-04)                         | no              |

**Phase 0 blocks everything else.** Implementing a graph with an undefined failure sink and no kill
switch would build the defect into the runtime.

## 3. Phase 1 — Shared durable substrate (runtime; serves v1.8 _and_ v1.8.1)

| PR       | Objective                                                                                                                                                                                                  | Dependencies | Repository areas        | Security/authority effect            | Migration | Adversarial tests required                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- | ------------------------------------ | --------- | -------------------------------------------------------------------------------------- |
| **P1-1** | **WorkUnit core** — record, type, current state, single `currentOwner`, tenant + legal-plane partition, append-only ownership events to `audit_events`. To W0/W1 Part E requirements.                      | P0           | new package + migration | defines the authority-bearing object | **yes**   | two owners on one WorkUnit; orphan detection; cross-tenant read                        |
| **P1-2** | **Handoff acceptance** — `HANDOFF_PENDING`, explicit accept/reject, sender retention until acceptance, per-handoff deadline (C-11).                                                                        | P1-1         | WorkUnit package        | prevents ownerless in-flight work    | yes       | unaccepted handoff; rejected handoff; sender crash mid-handoff                         |
| **P1-3** | **Exception model** — shared by all graph failure paths _and_ the workbench Exceptions panel (WB-04).                                                                                                      | P1-1         | WorkUnit package        | gives failure an owner               | yes       | exception without owner; escalation timeout                                            |
| **P1-4** | **Graph engine** — definition store, version pinning, transition executor, timeout scheduler, retry executor, idempotency key store; side effects emitted via existing `outbox_events` rather than inline. | P1-1..3      | new package + migration | executes authority checks            | yes       | crash between state change and side effect; duplicate side effect; stale graph version |
| **P1-5** | **Command registry + policy/approval gate** — make `config/policy/base_policy.yaml` actually read (it is currently read by nothing).                                                                       | P1-4         | context/identity        | **the authority boundary itself**    | yes       | command without contract; approval for wrong version; policy bypass                    |
| **P1-6** | **Agent identity as a first-class actor** — build on `service_accounts` + verified-actor binding (`0020`, `0026`); replace `allowed_tools: []` declarations with real, bounded tool grants.                | P1-5         | identity/config         | agents become authenticable          | yes       | agent exceeding tool grant; agent impersonating human                                  |

**Certification checkpoint:** no graph may be promoted past `AUDIT_CANDIDATE` before P1-6, because
J/G/A certification presupposes an actor, a command contract, and a graph version.

## 4. Phase 2 — Egress decision (single gated event)

| PR       | Objective                                                                                                                                                                                                                                                                      | Owner decision       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| **P2-1** | Decide the first governed egress channel and add exactly one `config/network/egress-allowlist.json` entry with `expectedCount` updated in the same diff. Unblocks: RevenueOS outreach, FMI ingestion, Twin adapters, counterparty channels, **and the workbench HTTP server**. | **yes — D-03, D-13** |

The manifest's own comment governs this: _"Adding an entry is an owner-reviewed act… a widening is
two lines in the diff rather than one, and it cannot be done by accident."_ Nothing in Phase 3+ can
start without it.

## 5. Phase 3 — Twin, narrowed to Horizon 1

Ordered before RevenueOS because the Twin is what a customer actually uses, and because RevenueOS
sells Twin capabilities that must exist first.

| PR       | Objective                                                                                                                                                        | Scope note                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **P3-1** | **Fact-authority binding** — the six modes as a first-class table (SR-01).                                                                                       | the Twin's keystone               |
| **P3-2** | **Fact-level external identity map** — generalize `network_participant_aliases` (`0028`) rather than inventing a new mapping (SR-02).                            | reuse, do not rebuild             |
| **P3-3** | **Inbound sync** — ordering, versioning, idempotency, **echo suppression** (SR-03, TW-06/07/08).                                                                 | echo suppression before any write |
| **P3-4** | **First adapter, read-only**, for **COT or SPOT only** — the two profiles inside Horizon 1. Conformance test forbidding per-vendor business-logic forks (SR-05). | **D-12** if any other profile     |
| **P3-5** | **Application tier + workbench**, Evidence and Network Inbox/Outbox panels first (both have real data layers).                                                   | depends on P2-1                   |
| **P3-6** | **Twin config store**, writable **only** via approved TWIN-G06/G12 outcome; no direct or admin write path (TL-02).                                               | close before the store exists     |
| **P3-7** | **Impact diff + propagation** for approved Twin changes (TL-03, TL-04 / C-15).                                                                                   |                                   |
| **P3-8** | **External writeback**, gated on P3-1..P3-3 and `OUTCOME_UNKNOWN` from P0-5.                                                                                     | last, deliberately                |

## 6. Phase 4 — FMI

| PR       | Objective                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P4-1** | **Source registry** with all six rights fields (API, derived, display, redistribution, retention, attribution). **No ingestion before this.** (MS-01) |
| **P4-2** | Provenance, freshness bounds, correction lineage bound to derived signals (MS-02/03/04)                                                               |
| **P4-3** | First ingestion — one `official_public` source only; idempotent, with the P0-3 key                                                                    |
| **P4-4** | Derived indicators; raw/derived/forecast separation enforced at runtime                                                                               |
| **P4-5** | Consumer boundary enforcement — the P0-9 per-participant graphs with domain gates                                                                     |
| **P4-6** | Customer relevance + briefing, behind the Promise Firewall (P5-2)                                                                                     |

Licensed sources and any news source come **after** P4-3, and news requires an adversarial
injection test as an entry condition (MS-08).

## 7. Phase 5 — RevenueOS

Deliberately last: it sells capabilities that must exist, and its safety today comes from a global
prohibition that should not be lifted until there is something real to sell.

| PR       | Objective                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P5-1** | Capability registry with `target_module`, inherited gate state, and `depends_on` (CAP-04/05, C-16)                                                         |
| **P5-2** | **Promise Firewall as a deterministic service**, plus the security/compliance claim registry it must read (PF-02, PF-03)                                   |
| **P5-3** | Entitlement — versioned, bound to an exact capability version, **widening requires a reviewed migration** (copy `network_disclosure_projections`) (ENT-02) |
| **P5-4** | Commercial account identity resolving to `organization_node` / `network_participant`; CRM ids as aliases (C-08)                                            |
| **P5-5** | Quote/proposal/pricing — deterministic, versioned, immutable                                                                                               |
| **P5-6** | Partner identity as `network_participant` + `organization_node`; **visibility via disclosure projection** (C-06)                                           |
| **P5-7** | Attribution ledger — append-only, correction-by-append linked to original (AC-03)                                                                          |
| **P5-8** | Commission calculation with the idempotency key from P0-3 (C-07). **Record-only; no payment rail.**                                                        |

`billing_enabled` and `customer_sale_allowed` remain `false` throughout Phase 5. Flipping either is
a separate owner decision requiring a horizon promotion — **D-16**.

## 8. Dependency summary

```
P0 (package repair, no runtime)
 └─> P1 (WorkUnit → handoff → exception → graph engine → command/policy → agent identity)
      ├─> P2 (egress decision)  ─────────────┐
      │                                       │
      ├─> P3 (Twin: authority binding → identity map → sync → adapter → workbench → config → writeback)
      ├─> P4 (FMI: source registry → provenance → ingestion → indicators → consumers → briefs)
      └─> P5 (RevenueOS: capability → firewall → entitlement → identity → quote → partner → attribution → commission)
```

P3, P4 and P5 can proceed in parallel after P2. **P0 and P1 cannot be parallelised or skipped.**

## 9. Work that blocks later work

| Item                    | Blocks                                                      |
| ----------------------- | ----------------------------------------------------------- |
| P0-1 (`HOLD`)           | every graph implementation                                  |
| P0-6 (Job Book schema)  | all certification                                           |
| P1-1 (WorkUnit)         | all 36 graphs, all 76 accepted v1.8 jobs                    |
| P1-5 (command registry) | every side-effecting node                                   |
| P2-1 (egress)           | FMI ingestion, Twin adapters, RevenueOS outreach, workbench |
| P3-1 (fact authority)   | all Twin sync and writeback                                 |
| P4-1 (source registry)  | all FMI ingestion                                           |

## 10. Explicitly out of scope for this sequence

Ocean and rail intelligence (`earliest_horizon: 3`); BOT/FOT/SOT Twins (modules
`implementation_allowed: false`); freight exchange (`LIQUIDITY_GATED`); autonomous vehicle link
(`PARTNER_AND_SAFETY_GATED`); any autonomy above A3; any billing activation; and v1.9.
