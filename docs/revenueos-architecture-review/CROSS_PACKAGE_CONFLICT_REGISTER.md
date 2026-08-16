# Cross-Package Conflict Register

Material conflicts between v1.8.1 and the accepted architecture (v1.3–v1.8, FacilityOS, the merged
W0/W1 workforce audit) or the current repository. **Recorded, not silently reconciled.** Where two
accepted rules conflict, the stricter security / tenant / authority / privacy / legal / audit /
resilience / certification rule controls, and that is stated per row.

| Severity                                            |  Count |
| --------------------------------------------------- | -----: |
| **CRITICAL** — blocks implementation                |      6 |
| **HIGH** — must close before the affected component |      6 |
| **MEDIUM** — close before certification             |      3 |
| **Total**                                           | **15** |

---

## CRITICAL

### C-04 — Provisional Job Books cannot express ownership, handoffs, tools, or Twin membership

**Conflicts with:** accepted v1.8 `02_JOB_BOOK_STANDARD.md` and the 76 accepted Job Books, which
uniformly carry `owns`, `upstream`, `downstream`, `tools`.
**Evidence:** `schemas/provisional-job-book.schema.json` uses `additionalProperties: false` and
omits all four fields; `plane` is `enum: ["revenueos","fmi"]`; `graph_membership` is
`^(REV|FMI|XPL)-G[0-9]{2}$`.
**Consequence:** no candidate declares what it is accountable for; no typed handoff edges exist at
the job layer; **no Twin Job Book is expressible at all**, leaving all 50 Twin graph owners
unbooked. J0–J7 certification is defined against the v1.8 `component` vocabulary, which the 13 new
`proposed_class` values do not map onto.
**Controlling rule:** the stricter accepted certification standard (v1.8).
**Required change:** converge the provisional schema on the v1.8 standard; keep `status`,
`production_logistics_authority`, `certification`, `audit_required` as additive improvements.

### C-05 — The only logistics command in the package has no accountable job

**Conflicts with:** v1.8 WorkUnit ownership; v1.5 typed-graph doctrine; the invariant declared in
all 36 graphs.
**Evidence:** `XPL-G01..G06` node `XC5_COMMAND`, `side_effect_class: logistics_command`,
`owner: "Participant command executor"` — a role category with no Job Book, no certification, no
autonomy ceiling, no command contract. TWIN-G04's `operational_command` and TWIN-G05's
`external_system_write` owners are likewise unbooked.
**Consequence:** the nodes that can affect physical freight operations and write to customer systems
are the ones with no governed owner.
**Required change:** author XPL/TWIN Job Books, or bind each command node to the accepted v1.8
domain job for that participant.

### C-12 — Zero kill-switch coverage across all 36 graphs

**Conflicts with:** accepted v1.3 Security & Resilience; the implemented and tested kill-switch
control.
**Evidence:** 0 of 36 graphs reference a kill switch. The platform provides `kill_switches`
(`0004`, extended `0014`, `0015`), `app.kill_switch_mode` / `app.kill_switch_scope`,
most-restrictive-wins resolution in `packages/context/src/kill-switch.ts` with unit tests, and a
seeded standing suspension of `autonomous_mobility` (`0016`).
**Consequence:** a durable graph issuing `logistics_command`, sending a commercial offer, or writing
to a customer TMS could not be stopped by the platform emergency control.
**Controlling rule:** the stricter accepted resilience control (v1.3).
**Required change:** kill-switch check required on every node whose `side_effect_class` is not
`none`.

### C-13 — `OUTCOME_UNKNOWN` has no representation

**Conflicts with:** accepted v1.4/v1.5 resilience doctrine; §6 and §8 of the audit instruction.
**Evidence:** no graph node, state, or terminal expresses an unknown outcome. 8 nodes carry
`reconcile_before_retry`, implying reconciliation without naming its trigger.
**Consequence:** for `XC5_COMMAND` and `TWIN-G05` (`external_system_write`), "we do not know whether
the command took effect" is the decisive state — a driver may or may not be dispatched; a TMS may or
may not hold the write.
**Required change:** `OUTCOME_UNKNOWN` as a first-class owned state on every side-effecting node.

### C-14 — The Twin's conflict arbiter is an undefined state

**Conflicts with:** the invariant declared in all 36 graphs; v1.5 typed-graph doctrine.
**Evidence:** `SYSTEM_AUTHORITY_AND_SYNC_MATRIX.csv` resolves ambiguity to **HOLD** for
`EXTERNAL_AUTHORITATIVE` and `NETWORK_ASSERTED`. `HOLD` is declared terminal in all 36 graphs and
defined as a node in **none**; 192 of 211 nodes route failure there.
**Consequence:** a split-brain fact between a customer's TMS and FreightOS would rest in a state
with no owner, no timeout, and no exit condition.
**Required change:** define and own `HOLD` — or per-graph exception states — before any Twin
implementation. The accepted v1.8 `05_EXCEPTION_OWNERSHIP_STANDARD.md` supplies the vocabulary and
is not referenced by v1.8.1.

### C-11 — Handoff acceptance is absent from every graph

**Conflicts with:** accepted v1.8 `03_WORK_UNIT_AND_RESPONSIBILITY_MODEL.md`
(`UNASSIGNED → OWNED → HANDOFF_PENDING → OWNED_BY_NEXT → COMPLETE`) and W0/W1 Part E, which requires
_"explicit accept/reject with a required acceptance state and sender retention until acceptance"_.
**Evidence:** all 185 edges transition directly between owners' nodes; no pending/accepted
intermediate, no sender retention, no rejection destination other than undefined `HOLD`.
**Consequence:** a WorkUnit can leave one owner without being accepted by the next, and an
unaccepted handoff is indistinguishable from a successful one.
**Required change:** model handoff acceptance per the accepted v1.8 lifecycle.

---

## HIGH

### C-03 — Polarity collision on the word `capability`

**Conflicts with:** ADR-0019 and `packages/context/src/capabilities.ts`, where `Capability` is a
runtime authority _restriction_ keyed on `legal_authority_class × operating_context`, fail-closed by
construction. v1.8.1 uses `capability` for a commercial _grant_
(`schemas/product-capability.schema.json`, `CAPABILITY_PACK_CATALOG.csv`).
**Consequence:** a future resolver reading the wrong registry converts a purchase into a permission —
the exact failure REV-07 exists to prevent.
**Required change:** rename the commercial object (`entitled_capability` / `capability_pack`); never
share a table, resolver, or helper name.

### C-06 — Partner visibility is a scoped cross-tenant grant with no mechanism

**Conflicts with:** v1.4 data sovereignty; tenant isolation doctrine.
**Evidence:** `FORCE` RLS isolates tenants; a partner legitimately needs scoped visibility into
several customers' registered deals. No such construct exists.
**Required change:** partner visibility must be a `network_disclosure_projection` (`0032`), never a
role grant or an RLS exception.

### C-07 — Financial idempotency defect reproduced from v1.8

**Conflicts with:** the accepted W0/W1 finding that _"'duplicate dispatch' is an idempotency oracle
with no key defined"_.
**Evidence:** REV-G08 (`CommissionWorkUnit`) defines no idempotency key; REV-35 requires duplicate
collection cannot double-pay.
**Consequence:** the same defect is being carried into the plane where its consequence is money.
**Required change:** adopt the `network_transport_intents` (`0030`) idempotent-intent pattern.

### C-08 — RevenueOS risks becoming a second identity source of truth

**Conflicts with:** accepted canonical identity — `tenants`, `organization_nodes`, `legal_entities`,
`network_participants`, `network_participant_aliases`.
**Evidence:** `crm_opportunity_steward` owns identity resolution across 5 graphs (REV-G01
`R2_DEDUPE`, exit _"canonical account or duplicate link resolved"_).
**Required change:** commercial accounts resolve to an existing `organization_node` /
`network_participant`; CRM ids stored as `network_participant_aliases`.

### C-10 — Domain differentiation asserted in matrices, absent from state machines

**Conflicts with:** v1.6 brokerage legal separation; FacilityOS physical authority; v1.7 participant
coherence.
**Evidence:** XPL-G02..G06 have **identical** `nodes`, `edges`, `terminal_states`, `trigger` and
`workunit_type`, differing only in `graph_id`, `name`, a `consumers` label and one prose invariant.
All five use `OperationalDecisionWorkUnit`. The 12 Twin graphs declare no participant profile.
**Consequence:** carrier, broker, facility, shipper and maintenance decisions are one WorkUnit type
in one state machine; `MARKET_SIGNAL_CONSUMER_MATRIX.csv`'s `prohibited_direct_effect` column has no
counterpart in any graph.
**Controlling rule:** the stricter accepted legal/physical separation (v1.6, FacilityOS).
**Required change:** per-participant WorkUnit types with domain gates encoded in the graphs, or
collapse the five duplicates and stop implying five controls exist.

### C-09 — Two FMI components own no graph node

**Conflicts with:** the accepted W0/W1 finding of _"41 orphan jobs in the design graph"_ — the same
defect recurring.
**Evidence:** `Ocean & Port Intelligence Agent` and `Rail & Intermodal Intelligence Agent` declare
`graph_membership: ["FMI-G04"]` and own no node anywhere.
**Compounding:** `ocean_adapter` and `rail_adapter` are `INTERFACE_AND_SIMULATION_ONLY`,
`earliest_horizon: 3` — out of Horizon 1 entirely.
**Required change:** defer both; do not carry ownerless jobs forward.

---

## MEDIUM

### C-15 — Approved Twin changes do not propagate

**Conflicts with:** the required learning lifecycle's final stage
(_"affected graphs/jobs/autonomy/integrations reevaluated"_).
**Evidence:** no artifact, node, or edge propagates an approved Twin change.
**Required change:** impact-diff artifact plus a propagation step.

### C-16 — Capability packs cross horizon boundaries

**Conflicts with:** `config/scope/module_states.yaml` (`stop_after_horizon: 1`, CI-asserted
`validate-scope.mjs:38`) and `products.yaml` (`customer_sale_allowed: false` 11/11, asserted
`:407`).
**Evidence:** 9 of 13 capability packs target modules with `implementation_allowed: false`
(facility ×3, shipper ×1, broker ×1, plus 4 market-intelligence packs bound to the same
participants).
**Controlling rule:** the stricter accepted horizon governance.
**Required change:** capability rows carry `target_module` and inherit its gate state.

### C-17 — Class taxonomy drift

**Conflicts with:** the v1.8 `component` vocabulary against which J0–J7 certification is defined.
**Evidence:** 13 `proposed_class` values including six overlapping determinism labels
(`deterministic_service`, `deterministic_hybrid`, `deterministic_model_service`,
`deterministic_workflow`, `model_deterministic_wrapper`, `human_supervised_deterministic`) and both
`hybrid` and `hybrid_agent`.
**Required change:** map onto the accepted `component` vocabulary before any certification attempt.

---

## Conflicts explicitly tested and **not** found

Recorded so the negative results are as durable as the positive ones:

| Tested                                                            | Result                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| v1.8.1 duplicates or steals an accepted v1.8 job's responsibility | **no** — 0 of 90 graph owners match any of the 76 accepted job names; the planes do not overlap                                       |
| A RevenueOS component claims logistics authority                  | **no** — `production_logistics_authority: {"const": false}`, 37/37 conform                                                            |
| An FMI component may command a domain                             | **no** — `may_execute_logistics_command: false`, 20/20; no FMI→command edge in any graph                                              |
| Commercial entitlement raises autonomy                            | **no** — conjunctive `activation_rule`; _"no authority from mode"_; A3 CI clamp overrides three products declaring `autonomy_max: A4` |
| A commercial calculation can move money                           | **no** — commission commands are `record_*` only; no payment rail exists                                                              |
| RevenueOS reaches into the shared FMI substrate                   | **no** — `Commercial Compliance Guard` owns nodes only on the `revenueos_fmi` plane                                                   |
| A remote agent acquires local tool/command authority              | **no** — inbox is a table; no dispatcher; `receiver_independent_authority`                                                            |
| Network projection leaks a new sensitive field on an old grant    | **no** — projections bind to exactly one `durable_schema_ref`, migration-authored (`0032`)                                            |
| v1.8.1 contradicts the accepted W0/W1 findings                    | **no** — it is consistent with them; C-07 and C-09 _reproduce_ W0/W1 defects rather than contradicting them                           |
