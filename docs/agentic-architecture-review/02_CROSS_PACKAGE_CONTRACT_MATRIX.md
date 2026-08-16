# 02 — Cross-Package Contract Matrix

Every machine-readable contract in the v1.5–v1.8 corpus, tested for mutual agreement and for
agreement with the repository's own schemas.

## 1. Inventory

| Contract                                | Package    | Lines | Kind          |
| --------------------------------------- | ---------- | ----- | ------------- |
| `company_operational_twin.schema.json`  | v1.5       | 145   | JSON Schema   |
| `agent_manifest.schema.json`            | v1.5       | 81    | JSON Schema   |
| `workflow_definition.schema.json`       | v1.5       | 76    | JSON Schema   |
| `autonomy_grant.schema.json`            | v1.5       | —     | JSON Schema   |
| `capability_pack.schema.json`           | v1.5       | —     | JSON Schema   |
| `enterprise_agent_graph.yaml`           | v1.5       | 82    | YAML instance |
| `facility_operational_twin.schema.json` | FacilityOS | 74    | JSON Schema   |
| `facility_agent_manifest.schema.json`   | FacilityOS | 66    | JSON Schema   |
| `vehicle_visit.schema.json`             | FacilityOS | —     | JSON Schema   |
| `transport_document.schema.json`        | FacilityOS | —     | JSON Schema   |
| `facility_graphs.yaml`                  | FacilityOS | 76    | YAML instance |
| `broker_operational_twin.schema.json`   | v1.6       | 72    | JSON Schema   |
| `broker_agent_manifest.schema.json`     | v1.6       | 67    | JSON Schema   |
| `broker_transaction_record.schema.json` | v1.6       | —     | JSON Schema   |
| `brokerage_graphs.yaml`                 | v1.6       | 75    | YAML instance |
| `participant_profile.yaml`              | v1.7       | 63    | YAML          |
| `network_artifacts.yaml`                | v1.7       | 43    | YAML          |
| `module_dependency_graph.yaml`          | v1.7       | 44    | YAML          |
| `agent_job_book.schema.json`            | v1.8       | 105   | JSON Schema   |
| `work_unit.schema.json`                 | v1.8       | 81    | JSON Schema   |
| `job_handoff.schema.json`               | v1.8       | 72    | JSON Schema   |
| `job_certification.schema.json`         | v1.8       | —     | JSON Schema   |
| `agent_job_catalog.json`                | v1.8       | —     | JSON instance |

Repository contracts the above must coexist with: `schemas/agent-manifest.schema.json` (123),
`schemas/event-envelope.schema.json`, `schemas/policy-decision.schema.json`,
`schemas/custody-event.schema.json`, `schemas/modal-adapter.schema.json`,
`schemas/facility-adapter.schema.json`, `schemas/meter-event.schema.json`,
`schemas/autonomous-vehicle-adapter.schema.json`.

## 2. The agent manifest — four schemas, zero common properties

This is the most load-bearing contract in the corpus: it is the thing actually instantiated per
agent. Four schemas define it.

|              | v1.5 `agent_manifest`            | FacilityOS `facility_agent_manifest` | v1.6 `broker_agent_manifest` | repo `schemas/agent-manifest`                  |
| ------------ | -------------------------------- | ------------------------------------ | ---------------------------- | ---------------------------------------------- |
| identity     | `agentId`                        | `agentId`                            | `agentId`                    | `id`                                           |
| version      | `manifestVersion`                | `manifestVersion`                    | `manifestVersion`            | `version`                                      |
| tenancy      | `tenantId`                       | `tenantId`                           | `tenantId`                   | `tenant_scope`                                 |
| role/purpose | `role`                           | `role`                               | `role`                       | `purpose`                                      |
| autonomy     | `autonomy`                       | `autonomy`                           | `autonomy`                   | `maximum_autonomy`                             |
| tools        | `tools`                          | `tools`                              | `tools`                      | `allowed_tools`                                |
| commands     | `commands`                       | `commands`                           | `commands`                   | —                                              |
| prohibitions | —                                | —                                    | —                            | `prohibited_actions`                           |
| legal model  | —                                | —                                    | `brokerageEntityId`          | `legal_authority_class` + `operating_contexts` |
| module       | —                                | —                                    | —                            | `module`                                       |
| kill switch  | `killSwitch`                     | `killSwitch`                         | `killSwitch`                 | —                                              |
| policy       | `policyVersion`                  | `policyVersion`                      | `policyVersion`              | —                                              |
| owner        | —                                | —                                    | —                            | `owner`                                        |
| evals        | `evaluationVersion`              | `evaluationVersion`                  | `evaluationVersion`          | `evaluation_suite`                             |
| scoping      | `scope`, `readScopes`            | `scope`, `siteIds`                   | `scope`                      | —                                              |
| validity     | `effectiveAt`, `expiresAt`       | —                                    | —                            | —                                              |
| limits       | `financialLimits`, `modelPolicy` | —                                    | `financialLimits`            | `confidence_threshold`                         |

**Properties common to all four: none.**

Two distinct facts sit inside that table, and they point in opposite directions.

**The three domain packages agree with each other.** v1.5 and FacilityOS declare an identical
required set — `agentId, tenantId, role, manifestVersion, scope, tools, commands, policyVersion,
autonomy, killSwitch` — and v1.6 adds exactly one field, `brokerageEntityId`. That is real,
deliberate coherence across three independently authored packages. Credit where due.

**All three are jointly incoherent with the repository.** `schemas/agent-manifest.schema.json`
shares not one property name with them. It is snake_case, ADR-0015-aligned
(`legal_authority_class` × `operating_contexts`), module-aware (`module`), and carries
`prohibited_actions`, `owner` and `evaluation_suite`. The packages are camelCase, carry
`killSwitch` and `policyVersion` which the repository schema lacks, and carry no legal-authority
dimension at all except v1.6's single `brokerageEntityId`.

The consequence is concrete: the 32 real agent manifests in `config/agents/registry.yaml` validate
against the **repository** schema. The three package agent-manifest schemas therefore have **zero
instances anywhere**, and the 32 real manifests have no package-level contract. An implementation
team building the 33rd agent has two incompatible contracts and no rule for choosing.

Status: **CONFLICT**. Design status DESIGN_PARTIAL (three coherent, one divergent, no mapping).

## 3. Operational Twin schemas

Covered in full in [03_PARTICIPANT_AND_TWIN_COHERENCE.md](03_PARTICIPANT_AND_TWIN_COHERENCE.md).
Summary for this matrix:

|                     | COT (v1.5)                                                                                      | FOT (FacilityOS)              | BOT (v1.6)                                          |
| ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------- |
| lines               | 145                                                                                             | 74                            | 72                                                  |
| `$id` scheme        | `freightos://`                                                                                  | `facilityos://`               | `freightos://`                                      |
| common core         | `tenantId`, `version`, `status`, `systems`, `assertions` (required in all three)                |                               |                                                     |
| topology property   | `organization`                                                                                  | `topology`                    | `businessTopology`                                  |
| `assertions` typing | **fully typed**: `id, state, subject, predicate, sourceRefs, effectiveAt`, `state` enum of five | `{"type":"object"}` — untyped | `{"type":"object"}` — untyped                       |
| `roles`             | yes                                                                                             | yes                           | **absent**                                          |
| `vocabulary`        | yes                                                                                             | yes                           | **absent**                                          |
| `policies`          | optional                                                                                        | **required**                  | absent (`pricingPolicies`, `carrierPolicy` instead) |
| `assets`            | yes                                                                                             | absent                        | absent                                              |
| `exceptions`        | yes                                                                                             | absent                        | absent                                              |
| `approvals`         | **absent**                                                                                      | **absent**                    | **absent**                                          |

Status: **PARTIAL / DUPLICATED**. A genuine shared core exists and the twin-level `status` enum
(`PROPOSED | APPROVED | DEPRECATED`) is identical across all three — that is real coherence. But
the same concept carries three different property names, the provenance/uncertainty model exists
only in COT, and no Twin carries the approvals section its own governing standard mandates.

## 4. Workflow graph contracts

`v1.5 contracts/workflow_definition.schema.json` is a real contract. Required:
`workflowId, version, stateSchemaRef, nodes, edges, terminalStates, sideEffectNodes`. Optional:
`approvalNodes, capabilityPack, deadlinePolicy, degradedMode, evaluationSuite, retryPolicy`. That
is a well-formed durable-workflow definition — nodes and edges, explicit terminal states, explicit
marking of which nodes have side effects, retry and deadline policy, degraded mode.

The three graph YAMLs are structurally consistent with one another:

|                | v1.5 `enterprise_agent_graph.yaml` | FacilityOS `facility_graphs.yaml` | v1.6 `brokerage_graphs.yaml` |
| -------------- | ---------------------------------- | --------------------------------- | ---------------------------- |
| `version`      | 1.0.0                              | 1.0.0                             | 1.0.0                        |
| collection key | `graph_families`                   | `graphs`                          | `graphs`                     |
| invariants     | 9                                  | 8                                 | 10                           |
| graph body     | `stages:` name list                | `stages:` name list               | `stages:` name list          |

The invariants are the strongest content here, and the domain-specific ones are correct and sharp —
FacilityOS's `no_document_implies_custody`, `no_bol_implies_goods_receipt` and
`no_physical_control_surface`; v1.6's `carrier_agent_plane_cannot_allocate_unrelated_carriers` and
`unqualified_carrier_cannot_receive_binding_tender`.

**But the three invariant sets share nothing.** Computed intersections:

```text
all three                = ∅
v1.5 ∩ FacilityOS        = { no_side_effect_bypasses_policy,
                             customer_specific_behavior_is_configuration_first }
v1.5 ∩ v1.6              = { customer_specific_behavior_configuration_first }  (spelling differs)
```

The empty three-way intersection is caused by near-miss naming, not by disagreement: v1.5 splits
idempotency and reconciliation into two invariants (`every_external_write_is_idempotent`,
`every_external_write_is_reconciled`) while FacilityOS and v1.6 combine them
(`all_external_writes_idempotent_and_reconciled`), and v1.5/FacilityOS write
`customer_specific_behavior_is_configuration_first` while v1.6 drops the `is_`. The _intent_ agrees
across all three; the _tokens_ agree nowhere, so no validator could check a common invariant set.

**But no graph instance conforms to the schema.** All three YAMLs express a graph as a named list
of stage names. None carries `workflowId`, `stateSchemaRef`, `nodes`, `edges`, `terminalStates` or
`sideEffectNodes`. v1.5's own `enterprise_agent_graph.yaml` does not conform to v1.5's own
`workflow_definition.schema.json`.

Status: **PARTIAL**. The contract is DESIGN_COMPLETE; the instances are DESIGN_PARTIAL. An engineer
receives a correct workflow meta-model and a set of stage names, and must invent every node type,
every edge, every terminal state and — most consequentially — which nodes have external side
effects, which is the field the whole idempotency and reconciliation doctrine hangs on.

## 5. v1.8 workforce contracts

| Contract                        | Required fields | Instances              | Conformance                               |
| ------------------------------- | --------------- | ---------------------- | ----------------------------------------- |
| `agent_job_book.schema.json`    | 14              | 76 job-book JSONs      | **0/76 validate**                         |
| `work_unit.schema.json`         | 9               | none                   | n/a — no instance exists                  |
| `job_handoff.schema.json`       | 10              | none                   | n/a                                       |
| `job_certification.schema.json` | 9               | none                   | n/a                                       |
| `agent_job_catalog.json`        | —               | is itself the instance | consistent with `role_classification.csv` |

### 5.1 The Job Book schema is violated by all 76 of its own instances

`agent_job_book.schema.json` requires: `jobId, department, name, componentClass, mission,
ownedOutcomes, nonScope, inputs, outputs, decisionRights, commands, normalGraph, exceptionPolicy,
evaluationSuite`.

The 76 job-book JSONs share exactly **one** key-set, of 11 keys: `commands, component, department,
downstream, mission, name, non_scope, owns, slug, tools, upstream`.

- Required but absent from every instance (10): `componentClass, decisionRights, evaluationSuite,
exceptionPolicy, inputs, jobId, nonScope, normalGraph, outputs, ownedOutcomes`
- Present in every instance but undeclared in the schema (6): `component, downstream, non_scope,
owns, slug, upstream`

Four of the ten absences are a naming-convention split the schema could absorb
(`jobId`/`slug`, `componentClass`/`component`, `nonScope`/`non_scope`, `ownedOutcomes`/`owns`).
Six have **no counterpart at all** in the JSON: `decisionRights, evaluationSuite, exceptionPolicy,
inputs, normalGraph, outputs`. Those six are the substantive operational-design fields. They exist
only as prose in the `.md` twin, and in roughly half the corpus that prose is templated
(see [04](04_WORKFORCE_RESPONSIBILITY_COVERAGE.md) §4).

Status: **CONFLICT**, and the most mechanically provable defect in the audit.

### 5.2 `workflow_service` is declared and never used

`componentClass` enum: `agent, hybrid_agent, deterministic_service, workflow_service,
human_supervised_agent`. Actual usage across 76: `hybrid_agent` 37, `agent` 28,
`human_supervised_agent` 6, `deterministic_service` 5, **`workflow_service` 0**.

### 5.3 WorkUnit and JobHandoff

Detailed in [05](05_WORKFLOW_AND_OWNERSHIP_COHERENCE.md). For this matrix:

- `work_unit.schema.json` — `state` is `{"type": "string"}` with **no enum**, while
  `03_WORK_UNIT_AND_RESPONSIBILITY_MODEL.md:9` specifies a five-state lifecycle. The doc's `:5`
  field list also names `priority`, `authoritative context`, `idempotency scope` and `completion
criteria` as required; the schema has none of the four. **CONFLICT** between a v1.8 standard and
  a v1.8 contract.
- `job_handoff.schema.json` — carries a genuine acceptance state machine
  (`PENDING | ACCEPTED | REJECTED | EXPIRED`) plus `rejectionReason`. That part is sound and is the
  best-formed contract in v1.8. But `fromJob`/`toJob` are bare strings with no organization or
  participant field, so the schema cannot distinguish an intra-company handoff from a cross-company
  one. See [09](09_NETWORK_HANDOFF_AND_EVIDENCE_COHERENCE.md) §4.

## 6. v1.7 network contracts

| Contract                                  | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network_artifacts.yaml` (43 lines)       | **DESIGN_PARTIAL.** Defines 12 artifact kinds with a one-line `authoritative:` property each; `Command` adds `requires_idempotency: true`; `NetworkEvent`/`Correction`/`Dispute` are `append_only`; `EvidenceEnvelope` is `immutable_reference`. Its `common_fields` list of 13 is genuinely good and aligns with the repository envelope: `artifact_id, schema_version, sender_identity, represented_organization, tenant, legal_plane, logistics_object_refs, correlation_id, causation_id, created_at, expires_at, evidence_refs, policy_ref`. But no artifact has a schema, sender, receiver, trigger, acceptance rule, ownership transition or failure path. It is an artifact taxonomy plus an envelope field list, not an interaction contract registry. |
| `participant_profile.yaml` (63 lines)     | **DESIGN_PARTIAL, honestly labelled.** Five profiles with `twin`, `legal_planes`, `native_surfaces`, `primary_workflows`. Shipper and service_provider carry `status: architecture_only`; carrier, broker and facility do not. v1.7 is explicit about its own maturity here, which is to its credit.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `module_dependency_graph.yaml` (44 lines) | **DESIGN_COMPLETE for its purpose.** Eight foundation components plus seven modules with `depends_on` and `activation` gates that align with `config/scope/module_states.yaml`. The cleanest contract in v1.7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 7. Artifact vocabulary conflict — three vocabularies, not two

There are **three** artifact lists in the corpus, and v1.7 ships two of them:

| Source                                                          | Count |
| --------------------------------------------------------------- | ----- |
| `v1.7 contracts/network_artifacts.yaml:4-28` (machine-readable) | 12    |
| `v1.7 04_UNIFIED_AGENT_ORGANIZATION_STANDARD.md:49-60` (prose)  | 11    |
| `v1.8 04_AGENT_INTERACTION_ATLAS.md:5-15` (prose)               | 10    |

v1.7's own two lists share only **four** names. v1.8 shares **seven** with v1.7's prose list but
only **three** with v1.7's machine-readable contract.

That asymmetry identifies the mechanism: **v1.8 conformed to v1.7's prose and orphaned v1.7's
contract** — the same contract v1.7's own COH-08 coherence gate depends on. The defect is not that
two packages chose different words; it is that v1.7 published two vocabularies and the downstream
package followed the non-normative one.

The v1.7-contract ↔ v1.8 comparison below is therefore the comparison that matters for
implementation, since the contract is the machine-readable artifact.

| v1.7             | v1.8              | relationship                                                     |
| ---------------- | ----------------- | ---------------------------------------------------------------- |
| Observation      | Observation       | match                                                            |
| Request          | Request           | match                                                            |
| Proposal         | Proposal          | match                                                            |
| Approval         | ApprovalRequest   | near-synonym, different semantics (a request is not an approval) |
| Command          | CommandRequest    | near-synonym, different semantics                                |
| Result           | DecisionResult    | near-synonym, narrower in v1.8                                   |
| EvidenceEnvelope | EvidenceReference | near-synonym, an envelope is not a reference                     |
| Assertion        | —                 | v1.7 only                                                        |
| CommercialOffer  | —                 | v1.7 only                                                        |
| NetworkEvent     | —                 | v1.7 only                                                        |
| Correction       | —                 | v1.7 only                                                        |
| Dispute          | —                 | v1.7 only                                                        |
| —                | Exception         | v1.8 only                                                        |
| —                | Handoff           | v1.8 only                                                        |
| —                | CompletionNotice  | v1.8 only                                                        |

Five v1.7 artifacts have no v1.8 counterpart, three v1.8 artifacts have no v1.7 counterpart, and
four pairs are near-synonyms under different names with unreconciled semantics. This is precisely
the "synonyms with different semantics" case §10 of the audit charter asks about.

The distinction is material, not cosmetic. `Approval` (v1.7: "authoritative for exact bound
action/version/scope") and `ApprovalRequest` (v1.8) are opposite ends of the same interaction; a
design that treats them as the same artifact would let a request confer the authority of a grant.

Status: **CONFLICT**.

## 8. Repository schemas the packages must not break

Recorded from the v1.3/v1.4 controlling reading. Two are already in conflict with accepted ADRs,
independently of v1.5–v1.8:

- `schemas/policy-decision.schema.json` cannot express the authorization decision record that
  v1.3 `03_ZERO_TRUST_IDENTITY_AUTHORIZATION.md:76` and Art. II.7 mandate (principal, organization,
  action, resource, contextual attributes, approval reference, correlation and trace identifiers,
  timestamp). An implementer must violate either the schema or the standard. **CONFLICT**,
  pre-existing.
- `schemas/custody-event.schema.json:100` still carries the pre-ADR-0015 overloaded
  `authority_mode` with five values, while `schemas/event-envelope.schema.json:118` and
  `schemas/agent-manifest.schema.json:90` carry the replacement two-dimension pairing. Recorded as
  OQ-21. **CONFLICT**, pre-existing, with a specified fix.

Neither is caused by v1.5–v1.8, but both sit directly under FacilityOS's custody model and any
policy-gated workforce action, so both are load-bearing for this corpus.

## 9. Matrix summary

| Contract family         | Mutually coherent?                            | Coherent with repository?       | Instances conform?                     | Status               |
| ----------------------- | --------------------------------------------- | ------------------------------- | -------------------------------------- | -------------------- |
| Agent manifest          | Yes (3 packages)                              | **No**                          | 32 repo manifests, 0 package instances | CONFLICT             |
| Operational Twin        | Partially (shared core, 3 names for topology) | n/a — no repo Twin schema       | no instances                           | PARTIAL / DUPLICATED |
| Workflow graph          | Yes (shape and invariants)                    | n/a                             | **No** — 0 of 3 conform to the schema  | PARTIAL              |
| Job Book                | n/a — single schema                           | No (command vocabulary)         | **No** — 0 of 76                       | CONFLICT             |
| WorkUnit / handoff      | Internally contradicted by v1.8 doc 03        | No (no legal-plane enum)        | no instances                           | CONFLICT             |
| Network artifacts       | **No** — v1.7 vs v1.8                         | Partially (common_fields align) | no instances                           | CONFLICT             |
| Participant profile     | Yes                                           | Partially                       | n/a                                    | PARTIAL              |
| Module dependency graph | Yes                                           | **Yes**                         | n/a                                    | COMPLETE             |
| Capability pack         | n/a                                           | n/a                             | **0 instances exist**                  | PARTIAL              |

One pattern runs through every row: **where a standard and its instances both exist, the instances
do not conform.** Job books against the Job Book schema (0/76), graph YAMLs against the workflow
schema (0/3), Twins against v1.7's 15 mandatory sections (0/3 complete), WorkUnit contract against
the WorkUnit standard. The corpus is not short of contracts. It is short of conformance.
