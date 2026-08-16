# 09 — Network, Handoff and Evidence Coherence

## 1. The doctrine is correct

Before the defects, the rule the whole section turns on, stated correctly in three places:

**`v1.8 04_AGENT_INTERACTION_ATLAS.md:17`**

> "A handoff transfers ownership only after the receiver validates tenant/legal plane, artifact
> schema/version, subject identity, evidence, freshness, authority, and expected state."

**`v1.8 04:21`**

> "Cross-company interactions terminate at the FreightOS Network boundary. The receiving participant
> independently evaluates the incoming artifact under its own Operational Twin, authority, and
> workflow."

**`v1.7 12_END_TO_END_NETWORK_WORKFLOW.md:31-41`**

> "Each participant owns its internal decision… broker proposes/tenders; carrier independently
> accepts; facility independently admits/schedules; service provider independently accepts work.
> **No central model impersonates every company.**"

These satisfy the §9 cross-company requirement at the doctrine level. Reinforced by the accepted
lower layer: v1.4 `15_:41` "A match is not a contract"; v1.4 `06_:12` "No proposal becomes a
command without deterministic policy evaluation"; ADR-N0011:62 "Participant relationships may cross
tenant boundaries. **They convey no data authority.**"

**Lens D passes on doctrine.** What follows is where the artifacts fail to carry it.

## 2. The sixteen required edge attributes

§9 requires every intended interaction to answer sixteen questions. Measured against
`matrices/interaction_matrix.csv`, the corpus's only edge registry:

Header, verbatim: `department,from_job,to_job,contract` — **four columns, 73 data rows.**

The `contract` column has **exactly one distinct value across all 73 rows**:

> `typed Handoff/Request/Proposal; receiver validates before ownership transfer`

| #   | Required attribute         | Carried?                                                      |
| --- | -------------------------- | ------------------------------------------------------------- |
| 1   | sender                     | **yes** — `from_job`                                          |
| 2   | receiver                   | **yes** — `to_job`                                            |
| 3   | artifact                   | no — the constant names three possible types without choosing |
| 4   | schema                     | no                                                            |
| 5   | trigger                    | no                                                            |
| 6   | correlation / causation    | no                                                            |
| 7   | subject                    | no                                                            |
| 8   | freshness                  | no                                                            |
| 9   | expiry                     | no                                                            |
| 10  | authority implications     | no                                                            |
| 11  | ownership before           | no                                                            |
| 12  | acceptance rule            | asserted generically by the constant                          |
| 13  | ownership after            | no                                                            |
| 14  | failure path               | no                                                            |
| 15  | evidence                   | no                                                            |
| 16  | cross-participant boundary | **no** — see §3                                               |

**Two of sixteen, plus one generic assertion.** This is an edge list, not an interaction registry.

## 3. The edge model conflates six kinds of endpoint — the material §9 failure

Of 38 distinct `to_job` values in the matrix, **10 are not v1.8 jobs at all**. Across the job books'
`upstream`/`downstream` arrays, 13 non-job endpoints appear:

| Endpoint                                                             | What it actually is                          |
| -------------------------------------------------------------------- | -------------------------------------------- |
| `Shipper`                                                            | **another company**                          |
| `Carrier Agent Organization`                                         | **another company**                          |
| `Carrier Documentation Agent`                                        | a job in **another participant's** workforce |
| `FacilityOS Document/BOL Agent`                                      | a job in **another participant's** workforce |
| `FacilityOS`                                                         | another participant's **product/system**     |
| `RigDesk`, `RigReceipts`                                             | **separate products**                        |
| `Finance/Payment System`, `Accounting`                               | **external systems**                         |
| `Human Claims/Legal`, `Human Compliance`, `Human Admin/Architecture` | **human roles**, not jobs                    |
| `Broker Exception workflow`                                          | a **workflow**, not a job                    |

All of these carry the same edge type and the same constant contract string as an ordinary
job-to-job handoff inside one company.

**This is the failure Lens D exists to catch.** The design has no way to mark which edges cross an
organizational boundary. A cross-company tender to `Carrier Agent Organization` and an internal
handoff from `Planning Agent` to `Dispatch Agent` are represented identically. The correct rule
stated at `04:21` — that cross-company interactions terminate at the network boundary and the
receiver independently evaluates under its own Twin and authority — cannot be expressed, enforced
or tested against this model.

Nor can the human edges. `Human Claims/Legal` and `Human Compliance` are the escalation targets for
the highest-risk decisions in the brokerage plane. Modelling them as ordinary handoff receivers
gives them the same acceptance semantics as an agent, with no notion of an approval, an approver
identity, or a human-authority record.

## 4. The handoff contract cannot express a boundary either

`contracts/job_handoff.schema.json` (72 lines). Required: `handoffId`, `tenantId`, `fromJob`,
`toJob`, `workUnitId`, `artifactRef`, `artifactVersion`, `expectedNextState`, `deadline`,
`createdAt`. Optional: `legalPlane`, `evidenceRefs`, `acceptanceState`, `rejectionReason`.

**What is genuinely good here** — and it is the best-formed contract in v1.8:

- `acceptanceState` enum `PENDING | ACCEPTED | REJECTED | EXPIRED` is a real acceptance state machine
- `rejectionReason` exists
- `artifactVersion` is required, which correctly forces version-exact handoffs
- `expectedNextState` is required, which is the right way to make the receiver's obligation explicit

**What is missing:**

- `fromJob` and `toJob` are bare strings. No `senderOrganization`, no `receiverOrganization`, no
  participant identity. The schema **cannot distinguish an intra-company handoff from a
  cross-company one.**
- `tenantId` is single-valued — there is no representation of two tenants in one interaction, which
  is exactly what a cross-company handoff is.
- `legalPlane` is an unconstrained string, not the ADR-0015 pair.
- No `receiverAuthorization` or acceptance-evidence reference, so "the receiver independently
  authorized this" is unrecordable.
- `acceptanceState` is **optional**, not required — so a handoff may exist with no acceptance state
  at all. The merged W0/W1 audit noted the same and ruled that the stricter gate text governs.
- No expiry timestamp, though `EXPIRED` is a terminal state.

Status: **GAP.** The doctrine at `04:17` names seven validation dimensions; the contract carries
enough to check two of them (schema/version via `artifactVersion`, expected state via
`expectedNextState`) and cannot express tenant/legal-plane, subject identity, evidence, freshness or
authority.

## 5. Atlas diagrams

| Diagram                                  | Lines | Nodes | Edges  |
| ---------------------------------------- | ----- | ----- | ------ |
| `brokerage_interaction_atlas.mmd`        | 55    | 22    | **32** |
| `carrier_interaction_atlas.mmd`          | 44    | 14    | **29** |
| `facility_interaction_atlas.mmd`         | 19    | 18    | **0**  |
| `shipper_interaction_atlas.mmd`          | 13    | 12    | **0**  |
| `service_provider_interaction_atlas.mmd` | 11    | 10    | **0**  |
| `cross_participant_workforce.mmd`        | 6     | 6     | 5      |

Three of the five participant atlases are `flowchart LR` declarations containing only node names
and no arrows at all. Total atlas edges: 61, all of them carrier or brokerage.

`cross_participant_workforce.mmd` — the only diagram of the network itself — is five bidirectional
arrows, each `X <--> N[FreightOS Network]`. It carries no artifact, no direction of authority, and
no boundary semantics.

## 6. Three disagreeing edge sources

| Source                                  | Edge count                 |
| --------------------------------------- | -------------------------- |
| job-book `upstream`/`downstream` arrays | 89 distinct directed edges |
| `matrices/interaction_matrix.csv`       | 73 rows                    |
| `diagrams/*_interaction_atlas.mmd`      | 61 arrows                  |

No document declares which is authoritative. 41 jobs have zero edges in all three
(18 facility + 12 shipper + 10 service_provider + `brokerage/relationship_support`). The merged
W0/W1 audit reports identical figures from an independent derivation.

## 7. v1.7's artifact model

`contracts/network_artifacts.yaml` (43 lines) defines 12 artifact kinds. Each has one
`authoritative:` property; `Command` adds `requires_idempotency: true`; `NetworkEvent`,
`Correction` and `Dispute` are `append_only`; `EvidenceEnvelope` is `immutable_reference`.

Its `common_fields` (13) are genuinely well chosen and align with the repository envelope:
`artifact_id, schema_version, sender_identity, represented_organization, tenant, legal_plane,
logistics_object_refs, correlation_id, causation_id, created_at, expires_at, evidence_refs,
policy_ref`.

Note what this list contains that the v1.8 handoff contract lacks: `represented_organization`,
`legal_plane`, `correlation_id`, `causation_id`, `expires_at`, `policy_ref`. **v1.7's envelope
model is strictly better than v1.8's handoff contract on exactly the attributes §9 requires** — and
nothing binds the two together.

What `network_artifacts.yaml` does not supply: a schema per artifact, sender, receiver, trigger,
acceptance rule, ownership transition, or failure path. It is an artifact taxonomy plus an envelope
field list. `DESIGN_PARTIAL`, not `DESIGN_STUB`.

## 8. The artifact vocabulary conflict

v1.7 defines 12 artifacts; v1.8 defines 10; **three names match** (Observation, Request, Proposal).
Full table in [02](02_CROSS_PACKAGE_CONTRACT_MATRIX.md) §7.

The material pair is `Approval` (v1.7: "authoritative for exact bound action/version/scope") versus
`ApprovalRequest` (v1.8). These are opposite ends of one interaction. A design that treats them as
the same artifact lets a request carry the authority of a grant. The same applies to
`Command`/`CommandRequest` and `EvidenceEnvelope`/`EvidenceReference` — an envelope carries content,
a reference does not.

Five v1.7 artifacts have no v1.8 counterpart, and their absence is consequential:
`Assertion` (the Twin fact type), `CommercialOffer` (the priced commitment), `NetworkEvent`
(the append-only journal record), `Correction` and `Dispute`. A workforce interaction model with no
Correction or Dispute artifact cannot express the correction and dispute flows that v1.6 `11_` and
FacilityOS `12_` specify.

Status: **CONFLICT.**

## 9. Evidence chain

`v1.7 12_:58-61`:

> "A completed shipment can reconstruct: shipper commitment → broker tender → carrier assignment →
> facility custody → transit → receipt/POD → invoice/pay records. That shared causality is a core
> network asset."

The intent is right and the chain is the correct one. The mechanism exists only in the repository
layer, not in v1.5–v1.8: `correlation_id` and `causation_id` in v1.7's `common_fields`; the N3
append-only event journal with `event_id` as global dedupe key and a mandatory `event_fingerprint`;
`EvidenceEnvelope` as `immutable_reference`.

What is missing at the workforce layer: no job book states what evidence it must emit (all 76 carry
the same one-line boilerplate), no handoff carries a correlation identifier, and no simulation
specifies expected evidence. `08_END_TO_END_WORKFORCE_SIMULATION_STANDARD.md:15` requires "final
evidence reconstruction" of every simulation; none of the seven specifies any.

## 10. Cross-company flows walked

| Flow                                                                            | Sender-controls-receiver risk                                                                                                                                                                                      | Verdict                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Broker tenders carrier (v1.6 `08_`)                                             | v1.6 invariant `unqualified_carrier_cannot_receive_binding_tender`; `08_BROKERAGE_OPERATIONS_ROUTE.md:12` chain has tender → execution with acceptance between                                                     | **Doctrine PASS.** Contract cannot express the carrier-side authorization.                          |
| Facility appointment requested by broker/carrier (v1.6 `10_`, FacilityOS `11_`) | FacilityOS `11_:29-38` makes appointment automation policy-bounded with suggest/accept/reschedule/reject "depending autonomy certification"                                                                        | **Doctrine PASS** — facility decides. Contract: the request is an ordinary handoff to `FacilityOS`. |
| Shipper tenders carrier direct (v1.7 `10_:41-48`)                               | "FreightOS must preserve the governing legal/contractual role"                                                                                                                                                     | Doctrine PASS; both sides are stubs.                                                                |
| Carrier requests provider service (v1.7 `11_`)                                  | v1.7 `12_:39` "service provider independently accepts work"                                                                                                                                                        | Doctrine PASS; provider side is 10 stubs.                                                           |
| Facility custody transfer (FacilityOS `10_`)                                    | invariants `no_document_implies_custody`, `no_bol_implies_goods_receipt`; `custody_evidence` job is `human_supervised_agent` and prepares "only when exact parties, objects, evidence and authority are satisfied" | **Doctrine PASS, and the strongest example in the corpus.** Job is a stub.                          |
| Exception propagation across five participants (v1.7 `12_:43-56`)               | "Each receives only authorized information necessary for its role"                                                                                                                                                 | Doctrine PASS; no disclosure decision specified per hop.                                            |
| Cross-tenant data access                                                        | N5-A default-deny named grant + JSON-Pointer allowlist; N5-B ceiling a grantor cannot override; ADR-N0011 relationships convey no authority                                                                        | **PASS and IMPLEMENTED** — the strongest control in the repository                                  |

**No flow in the corpus lets a sender implicitly authorize a receiver at the doctrine level**, and
adversarial review actively hunted for one and found none. v1.7 `04_:64-72` is the sharpest
statement in the corpus: "Agent A never directly acquires Agent B's permissions. Each side
independently: authenticates; evaluates policy; decides; executes within its own authority." The
carrier and brokerage job books instantiate it in their prohibited-actions sections — "impersonate
carrier/facility", "alter their internal state", "infer ambiguous acceptance", "accept/tender
freight".

The failure is one level down, and it is worse than "cannot represent".

## 10a. Where the boundary actually breaks — six findings from adversarial review

**(a) The design is complete on the sending side of every cross-company boundary and empty on the
receiving side.** The two-speed split of [04](04_WORKFORCE_RESPONSIBILITY_COVERAGE.md) is not a
random completeness gap — it falls exactly on the sender/receiver axis. Carrier and brokerage, the
only two planes that _originate_ cross-organization edges, carry 88 real commands and all 73
registered edges. Facility, shipper and service provider, the three planes that _receive_ them,
carry three placeholder identifiers between 40 jobs and zero edges of any kind. Every cross-company
interaction in the corpus is specified from the sender's end only.

**(b) v1.8 affirmatively routes cross-organization edges through `JobHandoff`.** This is stronger
than "the schema cannot distinguish them." Four matrix edges target another organization
(`FacilityOS`, `Carrier Agent Organization`, `Shipper`, `RigReceipts`) and carry the byte-identical
contract sentence as the 61 intra-department edges; the job books file them under the same
`## Downstream handoffs` heading as internal jobs; and `contracts/` ships no `Request` or `Proposal`
schema, so `JobHandoff` is the only implementable option. The package does not omit the boundary —
it models across it.

**(c) `expectedNextState` is a required, sender-authored field naming a state in the receiver's
workflow.** On an internal edge that is unobjectionable. On the cross-organization edges v1.8
declares, it is a sender prescribing the receiving organization's internal state transition — the
precise shape the cross-company rule forbids. The schema provides no receiver-side field to accept,
reinterpret or reject the prescription; only free-text `rejectionReason`. Compounded by
`work_unit.schema.json:39-41`, where `state` has no enum, so there is no vocabulary in which the
prescribed state could even be validated.

**(d) The acceptance mechanism is self-assertable by the sender.** `acceptanceState` is absent from
`required` and has no default, so a conforming handoff may carry none at all. There is no
`acceptedBy`, no `acceptedAt` and no acceptance-evidence reference. The contract cannot evidence
that a receiver — let alone an independent receiving organization — did the accepting.

**(e) The atlas diagrams are the matrix with every boundary-crossing edge deleted.** Reconstructing
each diagram's edge set from its node labels and comparing against the matrix gives set equality in
both cases: the brokerage atlas is exactly the 32 matrix edges whose target is one of the 76 jobs
(from 41 rows), the carrier atlas exactly the 29 such edges (from 32 rows). All 12 edges targeting
another organization, an external system or a human escalation are absent, and **no node is drawn
for any of them.** The document these diagrams belong to is the one that states the cross-company
rule.

**(f) v1.8 never references the disclosure model at all.** The words `grant`, `purpose code`,
`projection`, `field allowlist` and `sensitivity ceiling` appear **nowhere** in v1.8's 13 numbered
documents, 76 job books, 5 contracts, 3 matrices or 7 simulations. Yet cross-organization data reads
are routed through tools named `network subscriptions`, `FreightOS network`, `FacilityOS adapter`,
`FacilityOS events`, `RigDesk API/events`. The N5-A grant and N5-B ceiling are the controls that
decide whether any of that data may cross, and the workforce layer does not know they exist.

**(g) No acceptance gate covers the cross-company rule.** Of the forty gates WF-01…WF-40, none
requires that a cross-organization handoff not transfer authority, that a receiving organization
independently authenticate and authorize, or that a cross-company edge be distinguishable from an
internal one. The two nearest (WF-34, WF-35) discharge to simulations `05` and `07` — both 3-line
stubs.

**(h) The doctrine presupposes a receiver that v1.7's own strategy says will usually not exist.**
`04:21` requires the receiving participant to evaluate "under its own Operational Twin, authority,
and workflow." v1.7 `15_:5-7` defines Level 1 — External as "Email/link/EDI/API interaction. No
native FreightOS product required," and `15_:29-31` actively promotes that asymmetry. In the Level 1
configuration the entire receiver-side half of the controlling rule is performed by no software.
That is not necessarily wrong — a human at the receiving company may perform it — but no document
says so, and no design covers the case.

## 10b. A correction to this audit's own framing

An earlier draft referred to v1.3/v1.4 and the network decision records collectively as "the
accepted lower layer." That is inaccurate for the N-series. `docs/decisions/0003, 0011, 0015, 0016,
0017` all carry Status "Proposed — awaiting external rereview" while being implemented in migrations
0032–0034. Only `0012`, `0013`, `0014` and `0018` are Accepted. The correct description is
**"proposed-but-implemented network decision records."** The Accepted decision record is the `adr/`
series (27 documents). Recorded as C-20 in
[14](14_DUPLICATION_CONTRADICTION_GAP_REGISTER.md).

## 10c. A gap in v1.7's own protocol contract

`v1.7 05_FREIGHTOS_NETWORK_PROTOCOL.md:46-61` declares fourteen core protocol fields.
`contracts/network_artifacts.yaml` `common_fields` carries thirteen — and the three it drops are
**recipient/capability, idempotency key, and signature/auth proof**: precisely the addressing,
replay-safety and sender-authentication primitives a receiving organization needs to independently
authenticate an inbound artifact. The contract silently omits the three fields the cross-company
rule most depends on.

## 11. Status

| Area                                                        | Architecture status | Design status                       |
| ----------------------------------------------------------- | ------------------- | ----------------------------------- |
| Cross-company doctrine (`04:17`, `04:21`, v1.7 `12_:31-41`) | COMPLETE            | **DESIGN_COMPLETE**                 |
| Handoff validation predicate (7 dimensions)                 | PARTIAL             | DESIGN_PARTIAL — named, not defined |
| Handoff acceptance state machine                            | COMPLETE            | **DESIGN_COMPLETE**                 |
| Handoff cross-company representation                        | **GAP**             | **DESIGN_STUB**                     |
| Interaction registry (16 attributes)                        | **GAP**             | **DESIGN_STUB** — 2 of 16           |
| Endpoint typing (6 kinds conflated)                         | **GAP**             | **DESIGN_STUB**                     |
| Human escalation edges                                      | **GAP**             | DESIGN_STUB                         |
| Atlas diagrams                                              | PARTIAL             | 2 of 5 populated, 3 edge-free       |
| Edge source agreement                                       | **CONFLICT**        | 89 / 73 / 61, no authority declared |
| v1.7 artifact taxonomy                                      | PARTIAL             | DESIGN_PARTIAL                      |
| v1.7 envelope `common_fields`                               | COMPLETE            | **DESIGN_COMPLETE**                 |
| v1.7 ↔ v1.8 artifact vocabulary                             | **CONFLICT**        | DESIGN_STUB                         |
| Correction / Dispute artifacts in the workforce model       | **GAP**             | DESIGN_STUB                         |
| Evidence chain doctrine                                     | PARTIAL             | DESIGN_PARTIAL                      |
| Per-job evidence specification                              | **GAP**             | DESIGN_STUB — 0 of 76               |
| Disclosure authorization (N5-A / N5-B)                      | COMPLETE            | DESIGN_COMPLETE / **IMPLEMENTED**   |

**The single highest-value remediation in this section is not more edges — it is typing the
endpoints.** Until an edge can declare whether its receiver is a job in the same workforce, a job in
another participant's workforce, another organization, an external system, or a human, the
cross-company rule that all three packages state correctly cannot be enforced anywhere.
