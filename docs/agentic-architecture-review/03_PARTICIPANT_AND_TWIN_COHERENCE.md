# 03 — Participant and Operational Twin Coherence

## 1. The Twin family

| Twin                                             | Defined in                                              | Schema                                            | Lines | Status                         |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------- | ----- | ------------------------------ |
| **COT** — Company Operational Twin (carrier)     | v1.5 `02_COMPANY_OPERATIONAL_TWIN.md` (208)             | `contracts/company_operational_twin.schema.json`  | 145   | DESIGN_COMPLETE                |
| **FOT** — Facility Operational Twin              | FacilityOS `02_FACILITY_OPERATIONAL_TWIN.md` (112)      | `contracts/facility_operational_twin.schema.json` | 74    | DESIGN_PARTIAL                 |
| **BOT** — Broker Operational Twin                | v1.6 `02_BROKER_OPERATIONAL_TWIN.md` (111)              | `contracts/broker_operational_twin.schema.json`   | 72    | DESIGN_PARTIAL                 |
| **SOT** — Shipper Operational Twin               | v1.7 `10_SHIPPER_OPERATIONS_ROUTE.md` (52)              | **none**                                          | 0     | **DESIGN_STUB**                |
| **SPOT** — Service Provider Operational Twin     | v1.7 `11_SERVICE_PROVIDER_OPERATIONS_ROUTE.md` (46)     | **none**                                          | 0     | **DESIGN_STUB**                |
| **ParticipantOperationalTwin** — the abstraction | v1.7 `03_PARTICIPANT_OPERATIONAL_TWIN_STANDARD.md` (69) | **none**                                          | 0     | DESIGN_PARTIAL (standard only) |

`grep` for `ShipperOperationalTwin|ServiceProviderOperationalTwin|shipper-operational-twin|
service-provider-operational-twin` across the whole corpus returns exactly one file:
`v1.7 contracts/participant_profile.yaml`, where both appear as bare `twin:` values alongside
`status: architecture_only`. No SOT or SPOT schema exists anywhere.

## 2. The governing standard

`v1.7 03_PARTICIPANT_OPERATIONAL_TWIN_STANDARD.md` is 69 lines and is conceptually excellent. It
declares:

- the abstraction and its five specializations, with Shipper and Service Provider explicitly under
  a **"Planned:"** heading (`:12-14`)
- **15 mandatory sections** every twin type must declare (`:18-33`)
- a fact lifecycle `PROPOSED → VERIFIED → APPROVED`, alternates `DISPUTED / DEPRECATED`, and the
  rule "Only approved facts may serve as authoritative customer configuration" (`:37-42`)
- a **customer contract** of seven answerable questions (`:46-53`) — what does FreightOS believe,
  where did the belief come from, who approved it, which workflows depend on it, what happens if I
  change it, which agents can use it, which counterparties can see any part of it
- a **universal diff** producing semantic diff, impacted workflow graphs, impacted agent manifests,
  impacted autonomy grants, integration impact, network disclosure impact, and required
  re-certification (`:55-64`)
- **no hidden learning**: "Observed behavior may produce a proposal. It cannot silently rewrite
  approved operations." (`:66-69`)

This is the right doctrine. The diff → re-certification linkage in particular is exactly the
architectural idea a certifying agent platform needs. The audit records it as a genuine strength.

## 3. Conformance against the 15 mandatory sections

The test §7 of the charter requires: are the Twins compatible, and are the semantics common?

| #   | v1.7 §03 mandatory section        | COT                                  | FOT                       | BOT                                          |
| --- | --------------------------------- | ------------------------------------ | ------------------------- | -------------------------------------------- |
| 1   | participant / legal identity      | `tenantId`                           | `tenantId` + `siteId`     | `tenantId` + `brokerageEntityId`             |
| 2   | organizational topology           | `organization`                       | `topology`                | `businessTopology`                           |
| 3   | roles / responsibilities          | `roles`                              | `roles`                   | **absent**                                   |
| 4   | systems of record                 | `systems`                            | `systems`                 | `systems`                                    |
| 5   | vocabulary mappings               | `vocabulary`                         | `vocabulary`              | **absent**                                   |
| 6   | assets / resources / capabilities | `assets`                             | **absent**                | **absent**                                   |
| 7   | workflows / SOPs                  | `workflows`                          | `workflows`               | `workflows`                                  |
| 8   | policies / thresholds             | `policies` (optional)                | `policies` (**required**) | partial — `pricingPolicies`, `carrierPolicy` |
| 9   | approvals / escalations           | **absent**                           | **absent**                | **absent**                                   |
| 10  | integrations                      | via `systems`                        | via `systems`             | via `systems`                                |
| 11  | exception taxonomy                | `exceptions`                         | **absent**                | **absent**                                   |
| 12  | data classification               | **absent**                           | **absent**                | **absent**                                   |
| 13  | evidence / provenance             | `assertions.sourceRefs`              | untyped                   | untyped                                      |
| 14  | uncertainty                       | `assertions.confidence`              | untyped                   | untyped                                      |
| 15  | version / effective dates         | `version` + `assertions.effectiveAt` | `version` only            | `version` only                               |

Approximate satisfaction: **COT 12/15, FOT 8/15, BOT 6/15.**

Two sections are absent from **all three**: §9 approvals/escalations and §12 data classification.
§12's absence is the more serious: `docs/governance/DATA_CLASSIFICATION.md` and v1.3
`05_DATA_CLASSIFICATION_PRIVACY_RETENTION.md` both make classification mandatory per element, and
the N5-B sensitivity ceiling is evaluated against it. A Twin that cannot carry a classification
cannot participate in the disclosure decision that governs whether any of its content may leave
the tenant.

## 4. The assertion model — complete in COT, absent elsewhere

This is the sharpest single divergence in the Twin family.

**COT** (`company_operational_twin.schema.json`) types `assertions` fully:

```json
{"type":"array","items":{"type":"object",
  "required":["id","state","subject","predicate","sourceRefs","effectiveAt"],
  "properties":{
    "state":{"enum":["PROPOSED","VERIFIED","APPROVED","DISPUTED","DEPRECATED"]},
    "subject":{...},"predicate":{...},"value":{},"sourceRefs":{...},"confidence":{...}}}}
```

That is the exact five-state lifecycle v1.7 §03 mandates, plus provenance (`sourceRefs`),
uncertainty (`confidence`) and effective dating (`effectiveAt`).

**FOT and BOT** both declare:

```json
"assertions": {"type": "array", "items": {"type": "object"}}
```

Untyped. No state lifecycle, no provenance, no uncertainty, no effective date.

So of the §7 semantics the charter asks about — provenance, uncertainty, versions/effective dates,
and `PROPOSED/VERIFIED/APPROVED/DISPUTED/DEPRECATED` — all four are **DESIGN_COMPLETE in COT and
DESIGN_STUB in FOT and BOT**. The fact lifecycle that v1.7 §03 declares universal is implemented in
one of three Twins.

Counter-note for fairness: the Twin-level `status` enum (`PROPOSED | APPROVED | DEPRECATED`) _is_
identical across all three schemas. The document-level lifecycle is coherent; the fact-level one is
not.

## 5. Three names for one concept

Section 2 of the standard — organizational topology — is `organization` in COT, `topology` in FOT
and `businessTopology` in BOT. v1.7 §03 declares the section and never maps the names.

`v1.7 19_GOVERNANCE_AND_NON_REGRESSION.md:25-34` addresses this deliberately:

> "The new `ParticipantOperationalTwin` abstraction is conceptual/contractual. Do not destructively
> rename: Company Operational Twin; Broker Operational Twin; Facility Operational Twin. Implement
> compatibility/mapping if a shared type becomes useful."

That is a defensible governance choice — it protects three accepted packages from a cosmetic
rewrite. But it converts the mapping into required downstream work that no document performs. An
engineer building the `ParticipantOperationalTwin` type must invent the crosswalk for at least
`organization`/`topology`/`businessTopology`, decide whether `assets` (COT-only) and `exceptions`
(COT-only) are universal or carrier-specific, and decide whether BOT's absent `roles`, `vocabulary`
and `policies` are genuine omissions or deliberate.

Status: **DUPLICATED** — one concept, three source-of-truth names, no reconciliation.

## 6. The universal diff is unimplementable as specified

`v1.7 03:55-64` requires a Twin change to produce seven outputs, terminating in "required
re-certification." Nothing in the corpus supplies:

- a semantic-diff representation or algorithm
- a link from a Twin field to the workflow graphs that depend on it (the graph YAMLs are stage-name
  lists with no field references — see [02](02_CROSS_PACKAGE_CONTRACT_MATRIX.md) §4)
- a link from a Twin field to agent manifests (four incompatible manifest schemas, none of which
  references a Twin field)
- a link from a Twin field to autonomy grants (`autonomy_grant.schema.json` exists in v1.5; no
  document binds it to Twin fields)
- a link to network disclosure impact (the N5-A grant model is per-field via JSON Pointer, so this
  link is _constructible_ — but nothing constructs it)
- a rule mapping a diff class to a re-certification requirement

The "certification impact" the charter asks about in §7 is therefore **DESIGN_STUB**: declared in
eight lines of prose, with no representation anywhere.

## 7. SOT and SPOT — are they sufficiently designed, or placeholders?

**Answer: placeholders, and v1.7 says so itself.**

`10_SHIPPER_OPERATIONS_ROUTE.md:5-7`:

> "Complete the participant model with a **future** Shipper Operational Twin (SOT). **This is
> architecture definition, not current module activation.**"

`11_SERVICE_PROVIDER_OPERATIONS_ROUTE.md:7`: "**Future** Service Provider Operational Twin (SPOT)".

`contracts/participant_profile.yaml` marks both `status: architecture_only`; carrier, broker and
facility carry no such marker.

What each route actually supplies is a domain list and an agent-role list:

- SOT: 14 domains (`:11-24`) + 12 agent role names (`:28-39`) + a three-line legal-routing rule
- SPOT: 12 domains (`:9-20`) + 10 agent role names (`:24-33`) + the RigDesk boundary

No schema, no state, no workflow, no ownership rule, no authority rule, no artifact.

### 7.1 The 22 downstream job books are a 1:1 expansion of those two lists

This is the causal finding of the audit's workforce section.

| v1.7 route           | agent roles listed | v1.8 job books created | match                  |
| -------------------- | ------------------ | ---------------------- | ---------------------- |
| §10 Shipper          | 12                 | 12                     | **12/12 semantic 1:1** |
| §11 Service Provider | 10                 | 10                     | **10/10 semantic 1:1** |

Shipper: Shipment Intake → Shipment Intake Agent; Requirements → Shipper Requirements Agent;
Routing Guide → Routing Guide Engine; Quote Analysis → Quote Analysis Agent; Tender → Shipper
Tender Agent; Provider/Carrier Selection → Provider/Carrier Selection Agent; Tracking → Shipper
Tracking Agent; Exception → Shipper Exception Agent; Facility Coordination → Shipper Facility
Coordination Agent; Documentation → Shipper Documentation Agent; Invoice Audit → Invoice Audit
Engine; Service Analytics → Service Analytics Agent.

Service Provider: Service Intake → Service Intake Agent; Eligibility → Service Eligibility Engine;
Capacity → Service Capacity Agent; Estimate → Estimate Agent; Appointment/Dispatch → Service
Appointment/Dispatch Agent; Customer Communication → Service Customer Communication Agent; Work
Status → Work Status Agent; Evidence → Service Evidence Agent; Parts/Dependency → Parts &
Dependency Agent; Invoice/Reconciliation → Service Invoice/Reconciliation Agent.

This fully explains why those 22 job books carry placeholder commands, zero handoff edges, zero
interaction-matrix rows and edge-free atlas diagrams: **there was no upstream operational design to
decompose.** v1.8 expanded 22 role names into 22 template-filled documents.

Read correctly, this is **not an incoherence between v1.7 and v1.8** — the two packages agree, and
v1.7 is honest about the maturity level. The defect is narrower and different: v1.8 presents 76
uniformly formatted job books without marking 22 of them as derived from explicitly-future
architecture, so a reader cannot tell which halves of the workforce rest on designed foundations.

### 7.2 Facility is the different case

FacilityOS supplies 24 substantive documents (1,957 lines) including a 213-line BOL and document
chapter, a 112-line Twin chapter, and a typed `vehicle_visit.schema.json` and
`transport_document.schema.json`. It contains no "Agent roles" bullet list.

Yet all 18 facility job books carry the placeholder command `facility_typed_command`, zero handoff
edges and zero interaction-matrix rows. Here the upstream design **does** exist and v1.8 did not
decompose it. This is a v1.8 defect, not an upstream deferral, and it should be scoped differently
in remediation.

## 8. Sources of truth — incompatible or duplicated?

| Concept               | Sources                                                                                                                                                        | Verdict                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant                | `tenantId` in all three Twins; `tenant_id` as the RLS boundary in the repository; ADR-N0011 forbids equating tenant and organization                           | **Coherent**, provided Twins never treat `tenantId` as an organization identity. No Twin carries an organization identity, so the risk is latent rather than realized. |
| Legal entity          | `brokerageEntityId` (BOT only); `legal_entity_id` in the repository envelope; `legal_authority_class` × `operating_context` (ADR-0015)                         | **Incoherent.** No Twin carries `legal_authority_class` or `operating_context`. BOT's single `brokerageEntityId` is the only legal identity in the Twin family.        |
| Organization topology | `organization` / `topology` / `businessTopology`                                                                                                               | **Duplicated**, three names                                                                                                                                            |
| Systems of record     | `systems` in all three                                                                                                                                         | **Coherent**                                                                                                                                                           |
| Facts and provenance  | COT typed; FOT/BOT untyped                                                                                                                                     | **Duplicated with divergent fidelity**                                                                                                                                 |
| Approvals             | absent everywhere                                                                                                                                              | **GAP**                                                                                                                                                                |
| Data classification   | absent from Twins; three live vocabularies elsewhere (v1.3 D0–D5, `docs/governance/DATA_CLASSIFICATION.md` seven classes, N5-B ceiling axis) with no crosswalk | **GAP in Twins, CONFLICT upstream**                                                                                                                                    |

## 9. Status

| Area                                                            | Architecture status | Design status                                           |
| --------------------------------------------------------------- | ------------------- | ------------------------------------------------------- |
| ParticipantOperationalTwin standard (doctrine)                  | COMPLETE            | DESIGN_COMPLETE                                         |
| ParticipantOperationalTwin conformance (mapping to COT/FOT/BOT) | **GAP**             | DESIGN_STUB                                             |
| COT                                                             | COMPLETE            | DESIGN_COMPLETE                                         |
| FOT                                                             | PARTIAL             | DESIGN_PARTIAL                                          |
| BOT                                                             | PARTIAL             | DESIGN_PARTIAL                                          |
| SOT                                                             | **GAP**             | **DESIGN_STUB** (deferred by design, honestly labelled) |
| SPOT                                                            | **GAP**             | **DESIGN_STUB** (deferred by design, honestly labelled) |
| Fact lifecycle (PROPOSED…DEPRECATED)                            | PARTIAL             | DESIGN_COMPLETE in COT, DESIGN_STUB in FOT/BOT          |
| Semantic diff                                                   | **GAP**             | DESIGN_STUB                                             |
| Certification impact of a Twin change                           | **GAP**             | DESIGN_STUB                                             |
| Approvals section                                               | **GAP**             | DESIGN_STUB (absent from all three)                     |
| Data classification in Twins                                    | **GAP**             | DESIGN_STUB                                             |
| Twin ↔ legal-authority model binding                            | **CONFLICT**        | DESIGN_STUB                                             |

Implementation status for every row: `IMPLEMENTATION_ABSENT`. No Twin table, type or instance
exists in `packages/`, `schemas/` or any migration. Per §3 that is expected and is not scored as a
failure.
