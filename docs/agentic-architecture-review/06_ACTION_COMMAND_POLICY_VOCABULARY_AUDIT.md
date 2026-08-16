# 06 — Action, Command and Policy Vocabulary Audit

## 1. The question

§10 asks whether **one canonical action vocabulary exists**. It does not. Three incompatible
naming schemes coexist with no mapping and no arbiter.

## 2. The three vocabularies

### 2.1 Policy pack — `config/policy/base_policy.yaml`

Dotted `noun.verb`. `default_decision: deny`.

**32 `red_actions`:** `contract.sign`, `contract.materially_amend`, `money.move`, `bank.change`,
`traffic.allocate_cross_carrier`, `risk_hold.release`, `claim.settle`, `authority.change`,
`autonomy_policy.change`, `audit.disable`, `vehicle.steer`, `vehicle.accelerate`, `vehicle.brake`,
`vehicle.change_lane`, `vehicle.reverse`, `vehicle.override_perception`,
`vehicle.disable_safety_system`, `vehicle.execute_fallback`, `robot.move`, `forklift.move`,
`yard_tractor.move`, `conveyor.control`, `crane.control`, `dock_restraint.control`, `door.control`,
`plc.write`, `safety_interlock.override`, `odd.override`, `remote_drive`, `module_state.change`,
`horizon.promote`, `commercial_status.activate`.

**7 `absolute_prohibitions`:** `dynamic_driving_task.control`, `warehouse_robotics.control`,
`industrial_plc.control`, `safety_interlock.override`, `remote_driving`, `agent_self_promotion`,
`deferred_module.live_external_write`.

**6 `required_context`:** `tenant_id`, `organization_node_id`, `legal_entity_id`, `authority_mode`,
`actor_id`, `action`.

### 2.2 Agent registry — `config/agents/registry.yaml`

Also dotted `noun.verb`, but a **different set**: 43 distinct `prohibited_actions` across 32
manifests.

### 2.3 v1.8 Job Books

Snake_case `verb_noun`: 91 distinct command identifiers across 76 job books, e.g.
`open_accessorial`, `record_allocation_proposal`, `create_carrier_payable`,
`record_carrier_payment_status`, `place_carrier_hold`, `assign_driver_equipment`,
`send_dispatch_instruction`, `cancel_dispatch_instruction`, `request_qualification_review`.

Three of the 91 are placeholders covering 40 jobs: `facility_typed_command` (×18),
`shipper_typed_command` (×12), `service_provider_typed_command` (×10).

## 3. Overlap analysis

### 3.1 v1.8 commands ↔ policy vocabulary

**Intersection: empty.** Zero of the 91 v1.8 command identifiers appear in
`config/policy/base_policy.yaml`. Zero appear in `packages/identity/src/permissions.ts`.
Independently reproduced by the merged W0/W1 audit
(`docs/workforce-engineering/TOOL_COMMAND_DRIFT.md`), which reports the same figure.

The two vocabularies are not merely differently named — they describe different things. v1.8
commands are workflow verbs ("record an allocation proposal"). Policy actions are authority
predicates ("move money"). Nothing maps one onto the other, so no v1.8 command can be routed to a
policy decision, and no `red_action` has a workforce owner.

Concretely: `brokerage/carrier_pay` declares `create_carrier_payable` and
`record_carrier_payment_status`. The policy pack's `money.move` and `bank.change` are red actions
requiring the highest control. Nothing connects them. An implementer wiring
`create_carrier_payable` has no rule telling them it is a `money.move`.

### 3.2 Registry ↔ policy pack

Of the 43 distinct `prohibited_actions` in the agent registry, **27 do not appear in the policy
pack's `red_actions`**:

`assignment.commit`, `billing.change`, `capacity.fabricate`, `contract.amend`,
`credential.security_override`, `custody.fabricate`, `document.forge`, `eligibility.override`,
`employment.commit`, `facility_restriction.override`, `inspection.override`,
`inventory.acceptance.fabricate`, `inventory.release_override`, `load.accept`,
`milestone.fabricate`, `minimal_risk.override`, `mission.authorize_without_provider`,
`mission_event.fabricate`, `physical_motion.command`, `policy.change`, `rate.change`,
`return_to_service.fabricate`, `robot.control`, `safety_hold.override`, `safety_hold.release`,
`vehicle.control`, `yard_tractor.control`.

Conversely, 16 policy `red_actions` are prohibited by no registry agent.

### 3.3 Synonyms with different semantics

The most dangerous class, because a naive implementation would treat them as unrelated:

| Registry                  | Policy pack                                           | Divergence                                                                 |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `contract.amend`          | `contract.materially_amend`                           | policy restricts to _material_ amendment; registry prohibits all amendment |
| `robot.control`           | `robot.move`                                          | control ⊃ move                                                             |
| `yard_tractor.control`    | `yard_tractor.move`                                   | control ⊃ move                                                             |
| `vehicle.control`         | `vehicle.steer/accelerate/brake/change_lane/reverse`  | one coarse term vs five fine ones                                          |
| `safety_hold.release`     | `risk_hold.release`                                   | two names for a hold release; unclear whether the same hold                |
| `safety_hold.override`    | `safety_interlock.override`                           | different objects, overlapping intent                                      |
| `policy.change`           | `autonomy_policy.change`                              | registry term is broader                                                   |
| `physical_motion.command` | `dynamic_driving_task.control` (absolute prohibition) | different taxonomies for the same boundary                                 |

A prohibition expressed in one vocabulary and absent from the other is not enforced by the other.
The strictest reading — and the one this audit records as governing — is that the **union** of both
lists is prohibited, but no document says so.

### 3.4 `required_context` contradicts ADR-0015

`config/policy/base_policy.yaml:46` lists `authority_mode` as a mandatory policy-request field.

`adr/0015-legal-authority-class-and-operating-context.md:26-64` splits `authority_mode` into
`legal_authority_class` + `operating_context` precisely because it "was doing three incompatible
jobs at once," and rule 5 states the two must never be recollapsed:

> "RLS and policy evaluation must not treat operating context as a substitute for legal authority.
> Operating context never widens permission. Where the two disagree, the legal class governs."

The policy pack still asks for the superseded single field. A policy engine built from it would
reintroduce exactly the collapse ADR-0015 exists to prevent.

Status: **CONFLICT.** ADR-0015 governs — it is Accepted, later, and enforced in
`packages/context/src/legal.ts:12-23` and in SQL (`app.is_permitted_legal_pairing`, migration 0001).

## 4. Side-effect action specification (§10 checklist)

For every side-effect-capable action the architecture must specify twelve things. Measured across
the 91 v1.8 commands:

| Required                        | Specified?                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| action identifier               | **yes** for 88; placeholder for 3 covering 40 jobs                                                                              |
| owning component                | **yes** — the declaring job book                                                                                                |
| legal plane                     | **no** — no command carries one; the job's department is not a legal plane (see [07](07_AUTHORITY_LEGAL_AUTONOMY_COHERENCE.md)) |
| required authority / permission | **no** — no command maps to a permission                                                                                        |
| policy gate                     | **no** — no command maps to a policy action                                                                                     |
| approval requirement            | **no** — generic prose only                                                                                                     |
| maximum autonomy                | **no** — no job declares a level                                                                                                |
| idempotency key / scope         | **no** — 0 of 91                                                                                                                |
| verification                    | **no**                                                                                                                          |
| reconciliation                  | **no** — generic prose only                                                                                                     |
| audit / evidence                | generic prose in all 76 job books                                                                                               |
| kill-switch scope               | **no** — kill switches exist in the repository (migrations 0004/0014/0015) with scope values, but no command references one     |

**Two of twelve are specified.** An engineer implementing any consequential command must invent the
legal plane, the permission, the policy gate, the approval rule, the autonomy ceiling, the
idempotency key and the reconciliation procedure.

## 5. Placeholder commands

Forty of 76 jobs — every facility, shipper and service-provider job — declare exactly one command,
and it is a department-level placeholder. Two of those 40 are `deterministic_service` components
whose entire purpose is a precise side effect:

- **Detention Clock Service** (`facility/detention`) → `facility_typed_command`
- **Routing Guide Engine** (`shipper/routing_guide`) → `shipper_typed_command`

These are the two flagship examples from `01_ROLE_DECOMPOSITION_AND_AGENT_MINIMIZATION.md:8`
("exact clocks", "fixed routing"). Both are unbuildable as specified.

## 6. Tools

All 32 registry manifests carry `allowed_tools: []`. The file states plainly: "`allowed_tools` is
empty for every agent. Empty means NO tool may be called. The tool registry and per-tool schemas
are Phase 2 deliverables."

v1.8 job books declare tools freely — six per stub job, all department-generic ("tenant-scoped read
model", "FOT retrieval", "policy query", "FacilityOS domain services", "evidence retrieval",
"approved communications gateway"), naming no adapter, engine or system. Carrier and brokerage
books name some real ones (`TMS assignment adapter`, `driver communications`, `money engine`,
`detention calculator`).

No tool registry exists. No tool has a parameter schema, a return schema, an owner or a failure
contract. `evaluation_suite` in all 32 manifests points at `evals/<id>.eval.yaml`; the `evals/`
directory does not exist.

## 7. The typed command has no type

`docs/production-handoff/v1.2/01_CONSTITUTION.md:15` (Art. II.3): "Every mutation begins as a typed
command."

There is no command type, command handler, command schema or command registry anywhere in
`packages/`. The constitutional requirement is unimplemented, and — more relevant to this audit —
**unspecified**: no package in v1.5–v1.8 defines what a typed command _is_ as a contract.
`v1.7 network_artifacts.yaml` gets closest, declaring `Command: {authoritative: "execution intent
after authorization", requires_idempotency: true}` — two lines, no schema, no key definition.

There is also a band collision underneath: `docs/decisions/0008:34` and `0009:65` both assign the
command store to band "N7", while ADR-N0018 and migration 0035 spent N7 on external transport.
Scoped command idempotency therefore has no band and no store. Recorded in
[14](14_DUPLICATION_CONTRADICTION_GAP_REGISTER.md).

## 8. What remediation requires

Per §10 the audit specifies the requirement, not the corrected vocabulary.

1. **One canonical action registry** with a single naming convention, listing every side-effecting
   action, superseding all three current vocabularies, with an explicit crosswalk from each
   existing identifier.
2. **Per-action attributes**: owning component, legal plane (as `legal_authority_class` ×
   `operating_context`, not a new dimension), required permission, policy gate, approval
   requirement, maximum autonomy, idempotency key and scope, verification, reconciliation, audit
   record shape, kill-switch scope.
3. **Union-of-prohibitions rule**, stated normatively: an action prohibited in either the registry
   or the policy pack is prohibited, and the strictest formulation of a synonym pair governs.
4. **Resolution of the eight synonym pairs** in §3.3 — each is a decision, not a rename.
5. **`required_context` corrected** to ADR-0015's two dimensions.
6. **Replacement of the three placeholder commands** with real identifiers for all 40 jobs.
7. **A typed-command contract** that satisfies Constitution Art. II.3, and a home for the command
   store and its scoped idempotency key.

Items 1–5 are repository-side and unblocked. Item 6 depends on the workforce design decision
(see [17](17_OWNER_DECISIONS.md)). Item 7 needs a band assignment.

## 9. Status

| Item                            | Architecture status | Design status                                             | Implementation status                                                                                         |
| ------------------------------- | ------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Canonical action vocabulary     | **GAP**             | **DESIGN_STUB**                                           | IMPLEMENTATION_ABSENT                                                                                         |
| Policy pack red actions         | PARTIAL             | DESIGN_PARTIAL                                            | IMPLEMENTATION_ABSENT — read by no runtime code                                                               |
| Registry prohibited actions     | PARTIAL             | DESIGN_PARTIAL                                            | IMPLEMENTATION_ABSENT                                                                                         |
| v1.8 command identifiers        | PARTIAL             | DESIGN_PARTIAL (88 real, 3 placeholders covering 40 jobs) | IMPLEMENTATION_ABSENT                                                                                         |
| Vocabulary reconciliation       | **GAP**             | **DESIGN_STUB**                                           | —                                                                                                             |
| Synonym semantics               | **CONFLICT**        | DESIGN_STUB                                               | —                                                                                                             |
| `required_context` vs ADR-0015  | **CONFLICT**        | —                                                         | —                                                                                                             |
| Per-action authority attributes | **GAP**             | **DESIGN_STUB** (2 of 12)                                 | —                                                                                                             |
| Idempotency key per command     | **GAP**             | **DESIGN_STUB** (0 of 91)                                 | —                                                                                                             |
| Typed-command contract          | **GAP**             | **DESIGN_STUB**                                           | IMPLEMENTATION_ABSENT                                                                                         |
| Tool registry                   | **GAP**             | DESIGN_STUB                                               | IMPLEMENTATION_ABSENT                                                                                         |
| Kill-switch ↔ command binding   | **GAP**             | DESIGN_STUB                                               | IMPLEMENTATION_ABSENT (THREAT_MODEL T-15 OPEN: "Engaging a switch today is queryable but does not halt work") |
