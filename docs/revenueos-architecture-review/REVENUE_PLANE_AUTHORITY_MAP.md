# Revenue Plane Authority Map

Tests **H4**: RevenueOS can live on a commercial plane without inheriting participant operational
or legal authority.

## 1. Verdict

**H4 holds in the design and is enforced by schema, not merely asserted in prose.** This is the
strongest single result in the audit. Two defects qualify it, neither fatal.

## 2. The enforcement that actually exists in the package

`schemas/provisional-job-book.schema.json` is not advisory. It uses `additionalProperties: false`
and three `const` constraints:

```json
"production_logistics_authority": { "const": false },
"certification":                   { "const": "NOT_J0" },
"status":                          { "const": "AUDIT_CANDIDATE" }
```

All **37** provisional Job Books validate against it — verified by reading every
`job_books/*/*.json`. A RevenueOS component therefore _cannot_ declare logistics authority without
a schema change that appears in a diff. That is a real control, and it is the correct one.

Reinforcing evidence: **28 of 37** books set `candidate_commands` to the single value
`none_without_separate_command_contract`. The 9 that name commands name only commercial or
publication verbs:

| Job Book                           | Commands                                               | Assessment                                     |
| ---------------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `prospecting_agent`                | `send_approved_outreach`                               | commercial, external — needs egress governance |
| `proposal_agent`                   | `send_approved_proposal`                               | commercial, external — needs egress governance |
| `partner_operations_agent`         | `record_deal_registration`                             | record-only                                    |
| `crm_opportunity_steward`          | `record_commercial_state`                              | record-only                                    |
| `implementation_handoff_agent`     | `emit_implementation_handoff`                          | handoff-only                                   |
| `commission_calculation_service`   | `record_commission_calculation`, `record_payout_reco…` | **record-only — cannot move money**            |
| `market_briefing_agent`            | `deliver_market_brief`, `deliver_market_correction`    | publication                                    |
| `market_intelligence_orchestrator` | `publish_fmi_artifact`                                 | publication                                    |
| `source_registry_steward`          | `propose_source_status_change`                         | **propose-only**                               |

No RevenueOS or FMI component names a dispatch, tender, gate, dock, custody, repair-spend, or
payment command. The prohibition list in Section 12 is respected by construction.

## 3. Plane separation in the graphs

| Plane                      | Graphs                 | Distinct owners | Owners with a Job Book |
| -------------------------- | ---------------------- | --------------: | ---------------------: |
| `revenueos`                | REV-G01..G03, G06, G07 |              15 |                     15 |
| `revenueos_financial`      | REV-G08                |               4 |                      4 |
| `revenueos_fmi`            | FMI-G06, G07, G09      |               7 |                      7 |
| `revenueos_to_operational` | REV-G04, G05           |               4 |                      4 |
| `shared_fmi`               | FMI-G01..G05, G08, G10 |              16 |                     16 |
| `twin_*` (4 planes)        | TWIN-G01..G12          |              50 |                  **0** |
| `cross_plane`              | XPL-G01..G06           |               6 |                  **0** |

Two observations:

- The commercial/intelligence split is **deliberate and correct**. Customer-facing intelligence
  sits on `revenueos_fmi`; the shared substrate sits on `shared_fmi`. `Commercial Compliance Guard`
  (a RevenueOS book) appears in FMI-G06/G07 — but those are `revenueos_fmi` graphs, so a commercial
  guard governing a customer-facing brief is in its own plane, not reaching into shared FMI. H10 is
  supported.
- **Every Twin and cross-plane owner is unbooked.** 56 of the 90 owners sit outside any Job Book,
  including `Participant command executor`, which owns the only `logistics_command` in the package.
  See defect RPA-02.

## 4. Defects

### RPA-01 — `Revenue Operations Orchestrator` spans five graphs with no super-authority test

It owns nodes in REV-G01, G02, G03, G06, G07. REV-18 requires that a commercial orchestrator hold
no super-authority. Its Job Book sets `candidate_commands: [none_without_separate_command_contract]`
and `production_logistics_authority: false`, which is the right posture — but breadth of ownership
across five WorkUnit types is exactly the shape that accumulates de-facto authority once a runtime
exists. The accepted W0/W1 audit flagged the same pattern for v1.8 orchestrators (§"Verdict:
ABSENT — the four registry ids containing 'orchestrat' are YAML strings"). **Required change:** an
explicit adversarial test that the orchestrator cannot execute any command owned by a node it routes
to. Scored REV-18 PARTIAL.

### RPA-02 — The one logistics command in the package is owned by nobody

`XPL-G01..G06` node `XC5_COMMAND` carries `side_effect_class: logistics_command` and
`owner: "Participant command executor"` — a role category, not a job. It has no Job Book, no
certification, no autonomy ceiling, and no command contract. The `graph_membership` pattern in
`schemas/provisional-job-book.schema.json` is `^(REV|FMI|XPL)-G[0-9]{2}$`, so an XPL book _is_
expressible — none was written. **This is the highest-severity authority gap in the package**, and
it sits precisely at the FMI→operations boundary. Recorded as conflict **C-05**.

Mitigating: the edge into `XC5_COMMAND` is guarded — `XC3_POLICY --[operational_policy,
decision=ALLOW]--> XC5_COMMAND` and `XC4_APPROVAL --[human_or_service_approval, approved=true]-->
XC5_COMMAND`. The gate is present; the _owner_ of the gated action is not.

### RPA-03 — Outbound commercial communication has no governed path

`send_approved_outreach` and `send_approved_proposal` require external egress. Egress is pinned at
zero: `config/network/egress-allowlist.json` has `expectedCount: 0, modules: []`, enforced by
`scripts/check-network-egress.mjs` and `scripts/check-egress-allowlist.mjs`. Any RevenueOS
implementation that sends a message is an **architectural event** requiring an allowlist entry and
owner review — as the manifest's own comment states. Recorded as owner decision **D-03**.

## 5. Adversarial cases

| Attack                                                                 | Outcome             | Basis                                                                   |
| ---------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| RevenueOS agent obtains carrier/facility/broker operational permission | **blocked**         | `production_logistics_authority: const false` in schema; 37/37 conform  |
| Capability SKU implies an uncertified job may execute                  | **blocked**         | `certification: const NOT_J0` on all 37; `activation_rule` conjunction  |
| Rollout label bypasses J/A certification ceiling                       | **blocked**         | `validate-scope.mjs:453` clamps A3 regardless of product `autonomy_max` |
| Seller overrides a security/legal gate                                 | **not expressible** | no seller identity exists                                               |
| RevenueOS becomes second source of truth for customer identity         | **not yet**         | no commercial identity store; but see DATA_PRIVACY_BOUNDARY_MAP DP-02   |
| Commercial calculation moves money                                     | **blocked**         | commission commands are `record_*` only; no payment rail exists         |
| Commercial plane reaches a logistics command                           | **partially open**  | `XC5_COMMAND` gated but unowned — **RPA-02**                            |

## 6. Required changes

1. Author an XPL-plane Job Book for `Participant command executor`, or bind `XC5_COMMAND` to an
   already-accepted v1.8 domain job per consuming participant (**RPA-02 / C-05**, blocking).
2. Adversarial test: orchestrator cannot execute a routed node's command (**RPA-01**).
3. Do not implement outbound commercial send until the egress decision is taken (**RPA-03 / D-03**).
