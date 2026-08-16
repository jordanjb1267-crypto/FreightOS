# 18 — Final Audit Verdict

The twenty questions of §22, answered from repository evidence, after five adversarial lenses with
authority to overturn any finding — and which overturned three.

---

## 1. Is the overall v1.5–v1.8 architecture coherent?

**Partially. Coherent in domain design and in doctrine; incoherent in vocabulary, contract and
governance binding.**

Coherent: each of v1.5, FacilityOS, v1.6 and v1.7 is internally consistent and substantive
(2,415 / 1,957 / 1,899 / 1,460 lines). The cross-company rule is stated correctly in six
independent documents and instantiated in the carrier and brokerage job books. The three domain
packages agree with each other on the agent-manifest shape, the Twin core, the graph invariant
philosophy, and the shadow → approval-to-execute → bounded-autonomy progression.

Incoherent: **three action vocabularies with an empty intersection; three artifact vocabularies of
which v1.8 followed the non-normative one; four agent-manifest schemas with no property in common;
three workflow-graph invariant sets whose three-way intersection is empty; three names for one Twin
section; four progressive-autonomy ladders; two certification ladders with no crosswalk; three
data-classification vocabularies.** Twenty-seven contradictions, five of them critical.

The root cause is single and structural: **zero of the five packages cite any of the 27 accepted
ADRs, zero accepted ADRs cite any package, none is declared in `governance-layers.json`, none is
CI-verified, and none references `module_states`, `horizon_authorized` or `Horizon 1`.** The
packages were authored as a parallel document stream that never joined the repository's decision
graph.

## 2. Is it complete enough to begin implementation contracts?

**No.**

41 of 76 jobs are design stubs. The WorkUnit has no state set. No canonical action vocabulary
exists. No command carries an idempotency key while duplicate financial effect is
certification-blocking. All seven simulations are 3–4 line stubs and two required workflows have
none. Four v1.8 contracts are contradicted by their own standards.

**Partial exception:** the carrier plane is close. Its 14 jobs carry real commands, 29 atlas edges
and job-specific evaluation scenarios in 14 of 14 books, against a substantive upstream package and
an ACTIVE_BUILD module. It is the only plane where implementation contracts could begin after
packages 1–3 of [16](16_REMEDIATION_OPTIONS_AND_RECOMMENDATION.md), without waiting for package 4.

## 3. Which participant planes are DESIGN_COMPLETE?

**None.**

## 4. Which are DESIGN_PARTIAL?

**Carrier** and **brokerage**. Both have real command vocabularies, populated handoff edges and
substantive upstream packages. Brokerage is additionally and correctly barred by the legal gate.

## 5. Which contain DESIGN_STUBS?

**All five.** Facility, shipper and service provider are stubs throughout. Carrier and brokerage
contain stubs at the WorkUnit, per-action-attribute, evaluation, simulation and
interaction-registry layers.

## 6. Are the 76 responsibilities the correct decomposition?

**No — and v1.8 says so itself.** `11_WORKFORCE_CLASSIFICATION_REPORT.md:17`: "This classification is
a design recommendation subject to W0/W1 repository decomposition review; the runtime must not
create an agent solely because this package names one."

W0/W1 performed exactly that review across 99 rows under three adversarial refuter lenses and
concluded **69 of 78 agent-shaped roles should not remain full agents**, leaving 4 KEEP_AGENT and
8 HYBRID_AGENT. This audit's independent adversarial pass agreed with 17 of 20 spot-checked
reclassifications.

Three specific corrections to that verdict, from Lens C:

- `brokerage/shipment_execution` is HYBRID at most, not KEEP_AGENT — reducing the genuine agent set
  to **three**: `carrier/negotiation`, `brokerage/negotiation`, `carrier/exception`.
- `facility/facility_exception` and `shipper/exception` should be recorded **UNDETERMINED** rather
  than WORKFLOW_SERVICE. W1 downgraded them because their books are stubs while keeping the
  structurally identical `carrier/exception` as an agent — that is a burden-of-proof default, not a
  finding about the work.
- The two Configuration Stewards should stay `human_supervised_agent`, not be remapped up to
  HYBRID_AGENT. That enum value is the only place a human authority gate can be expressed.

## 7. Which should be agents, hybrid, deterministic, workflow, merged or human-only?

| Class                                   | Count           | Examples                                                                                                                                                                                                                                                               |
| --------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent** (genuine contextual judgment) | ~3              | `carrier/negotiation`, `brokerage/negotiation`, `carrier/exception`                                                                                                                                                                                                    |
| **Hybrid agent**                        | ~8              | `carrier/documentation` (has an OCR sandbox), `brokerage/shipper_intake`, `facility/document_bol`, `brokerage/shipment_execution`                                                                                                                                      |
| **Deterministic service**               | ~41             | the 5 already classed, plus Feasibility Engine, Service Eligibility Engine, Invoice Audit Engine (its own book prohibits "LLM arithmetic"), both capacity jobs, Detention Clock, Routing Guide                                                                         |
| **Workflow service**                    | ~20–22          | all three orchestrators (they own only work ownership, priority and escalation routing, and simulation 02 forbids them overriding feasibility or policy), dispatch, both tender jobs, receiving/shipping office, driver coordination, both customer-communication jobs |
| **Merged**                              | ~7              | `routing_guide` + `quote_analysis` → `provider_selection`; `discrepancy` → `facility_exception`; `tracking_communication` + `relationship_support` → `shipment_execution`; the two Configuration Stewards → one parameterised by twin type                             |
| **Human-only**                          | ~2 + carve-outs | `brokerage/compliance_supervisor`; control-plane admin; plus safety/legal hold release, claims liability and discrepancy disposition carved out everywhere                                                                                                             |
| **External participant**                | 10              | the entire service-provider plane — see [17](17_OWNER_DECISIONS.md) OD-C                                                                                                                                                                                               |

**`workflow_service` is in the schema enum and used zero times.** That unused value is the single
largest source of misclassification and the proximate cause of the roster inflation.

The structural reason the enum fails: **`componentClass` is not a partition on one axis.**
`agent`/`hybrid_agent`/`deterministic_service` are cognition statements, `workflow_service` is
topology, `human_supervised_agent` is authority. A job can be all three at once and the schema
forces one token.

## 8. Are Operational Twins coherent?

**Partially.** A genuine shared core exists — `tenantId`, `version`, `status`, `systems`,
`assertions` required in all three — and the twin-level `status` enum is identical.

But: three names for organizational topology (`organization` / `topology` / `businessTopology`);
the typed assertion model exists only in COT, and FOT and BOT **regressed** it to
`{"type":"array","items":{"type":"object"}}`, so v1.7's mandatory fact lifecycle is representable in
one of three Twins; sections 9 (approvals), 10 (integrations) and 12 (data classification) are
absent from all three **and structurally forbidden** because all three set
`additionalProperties: false`; no Twin carries a legal-authority dimension; the COT permits an
APPROVED assertion with no approver and empty `sourceRefs`; and the universal diff and its
re-certification link are unimplementable.

SOT and SPOT do not exist — deferred by design and honestly labelled by v1.7.

## 9. Are network handoffs coherent?

**Doctrine yes; contract no; and the gap is directional.**

The doctrine passes everywhere and adversarial review actively hunted for a sender-binds-receiver
design and found none. v1.7 `04_:64-72` is the sharpest formulation: "Agent A never directly
acquires Agent B's permissions."

At the contract level:

- **v1.8 affirmatively models cross-organization edges as ordinary `JobHandoff`s** — four matrix
  edges target another organization and carry the byte-identical contract sentence as the 61
  internal ones; no `Request` or `Proposal` schema exists, so `JobHandoff` is the only option.
- **`expectedNextState` is a required, sender-authored field naming a state in the receiver's
  workflow** — on a cross-organization edge that is a sender prescribing another company's internal
  transition, with no receiver-side field to accept, reinterpret or reject it.
- **`acceptanceState` is optional, undefaulted and unattributed** — no `acceptedBy`, no
  `acceptedAt`, no evidence — so it is self-assertable by the sender.
- **The atlas diagrams are provably the matrix with every boundary-crossing edge deleted** — set
  equality in both departments, all 12 external targets absent, no node drawn for any of them.
- **v1.8 never mentions `grant`, `purpose code`, `projection`, `field allowlist` or `sensitivity
ceiling`** anywhere, while routing cross-organization reads through network tools.
- **No acceptance gate covers the cross-company rule** — none of WF-01…WF-40.
- **The interaction registry carries 2 of 16 required attributes** and one constant contract string.
- **The two-speed split falls exactly on the sender/receiver axis**: the two planes that originate
  every cross-organization edge are fully specified; the three that receive them are empty.

## 10. Is WorkUnit ownership complete?

**No.** `state` is an unconstrained string with no enum, so orphan-state analysis is vacuous — the
design defines no state set. Doc `03:5` names 18 required fields; the contract requires 8, makes 6
optional and omits 4 (`priority`, authoritative context, idempotency scope, completion criteria).
The lifecycle has no failure or cancellation terminal, and a handoff reaching `EXPIRED` leaves its
WorkUnit in `HANDOFF_PENDING` with no transition. Duplicate ownership is prohibited in prose and
unpreventable in contract. And `OWNED_BY_NEXT` plus a single `workUnitId` and single `tenantId`
requires one tenant-scoped WorkUnit to transfer ownership across an organization boundary — which
the accepted tenant/organization separation forbids.

## 11. Is the action/command vocabulary complete?

**No.** Three vocabularies, empty intersection between v1.8's 91 commands and the policy pack's 32
red actions. Only 2 of 12 required per-action attributes specified. Zero idempotency keys. Three
placeholder identifiers covering 40 jobs. Eight synonym pairs with divergent semantics.
`required_context` still names the superseded `authority_mode`.

Worse than "unowned": red actions **are** owned and **unlabelled** — `traffic.allocate_cross_carrier`
is `brokerage/allocation`'s `record_allocation_proposal`, a `hybrid_agent`, with no red-action
marking anywhere.

## 12. Is exception ownership complete?

**No.** The seven-state lifecycle and the three rules at `05:11` are correct. Everything the
document is named for is absent: zero of eleven required ownership attributes are assigned per
class, `05:3`'s resolve/contain/escalate declaration is present in 0 of 76 job books, there is no
Exception contract among the five schemas, no transition relation, no guards, no deadlines. One of
five planes has a designed exception owner. No reconciliation procedure exists anywhere.

## 13. Is autonomy/legal/authority architecture coherent?

**The accepted model is excellent; the packages contradict it in three critical places.**

Sound and implemented: `legal_authority_class` × `operating_context` with an enumerated pairing
table enforced in TypeScript and SQL; tenant/organization separation; the four-layer identity model;
the physical-control prohibition; the legal activation gates; the autonomy-ceiling computation
(as a configuration control — it has no non-test caller).

Contradicted: v1.5's Constitution authorizes delegation grants that ADR-N0003 says do not exist and
are not authorized; v1.5 ships an `autonomy_grant` contract that **grants** an A-level against
ADR-0018's "computed, never configured"; v1.6 declares eight A4-candidate actions in a module whose
computed ceiling is A0.

Plus: no job declares an autonomy level (0 of 76), so the §11 reconciliation cannot be performed;
the J-ladder is applied to deterministic services for which it is meaningless; J6 and J7 are
unreachable by every job today and no document says so; and two J6/A4 preconditions — a policy
engine and an enforced kill switch — are recorded OPEN in the threat model.

One correction to an earlier draft: the **Network** plane _is_ representable (`software_only` +
`system`). Only **Service** is not.

## 14. Are simulations implementation-ready?

**No. None of the seven.** Twenty-two lines total. Best case 3 of 20 required elements. No initial
state, no participants, no Twins, no WorkUnits, no ownership transitions, no commands, no policy
decisions, no approvals, no timeouts, no crash points, no expected evidence, no oracle. Crash
recovery is mandatory in the standard and absent from all seven. Two of nine required workflows —
facility outbound and the brokered shipper-to-carrier path — have no simulation at all, and the
gate set is department-shaped so adding files would not fix it.

Their acceptance criteria are, however, genuinely good and should be preserved as seeds.

## 15. Are Shipper and Service Provider sufficiently designed?

**No, and v1.7 says so.** `10_:5-7` — "a **future** Shipper Operational Twin… This is architecture
definition, not current module activation." `11_:7` — "**Future** Service Provider Operational
Twin." `participant_profile.yaml` marks both `status: architecture_only`.

v1.8's 22 job books for these planes are a verified **1:1 transcription** of two bullet lists —
12 names in `10_:26-39` and 10 in `11_:22-33`, set-identical to the slugs. Only those two route
documents contain an "Agent roles" list, and those are exactly the two departments whose books are
pure stubs. There was no decomposition step because there was nothing to decompose.

Service provider is the more serious case: no legal operating context, no module entry, and Ruling C
forbids FreightOS from performing the work five of its ten job books describe.

## 16. Is multimodal architecture sufficient for its declared horizon?

**Yes.** The declared horizon is 1, road-only, with rail and ocean `INTERFACE_AND_SIMULATION_ONLY`
at ≥h3 and air DORMANT. The mode-neutral principle, the TransportJourney/leg model and the
capability-pack contract are all DESIGN_COMPLETE, and nothing blocks Horizon 1.

The gap — **zero capability-pack instances exist, not even road** — becomes material at the first
promotion, not now. Rail and ocean are entity and workflow name lists: architecture only, correctly
gated, and not to be counted as present design completeness.

## 17. What material contradictions exist?

Twenty-seven, catalogued in [14](14_DUPLICATION_CONTRADICTION_GAP_REGISTER.md) §A. The five
critical:

1. v1.5's Constitution authorizes delegation that ADR-N0003 says does not exist and is not
   authorized.
2. v1.5's `autonomy_grant` contract grants autonomy against ADR-0018's "computed, never configured".
3. The JobCertification contract validates an unsigned, unapproved, zero-evidence A5 certificate —
   the control that is supposed to cap every commercial claim cannot.
4. v1.6 declares eight A4-candidate actions in a module whose computed ceiling is A0.
5. All 76 job books fail v1.8's own Job Book schema — 16 violations each, 1,216 total, with
   `additionalProperties: false` making six of them forbidden extras rather than a naming mismatch.

Two more deserve naming here: **v1.8 re-expanded a dual-plane model into duplicate job definitions**,
reversing a decision the v1.2 base registry had already made (20 of 32 manifests are multi-plane);
and **the five packages abandoned the acceptance-gate evidence format** that both controlling layers
mandate — 186 gates across five packages, not one naming a minimum acceptance evidence artifact.

## 18. What is the smallest correct remediation?

**Governance wiring** (= AWE-0, already specified on `main`): declare v1.5–v1.8 as governance layers,
extend the validator to `MANIFEST.json`, state precedence, restore the acceptance-gate evidence
format, resolve the ten Proposed-but-implemented N-series ADRs, correct ADR-0003's status.

It is blocked by nothing, costs a few files, and is the root-cause fix — almost every drift in the
register is downstream of the disconnection it closes. It does not make the architecture
implementation-ready; nothing short of the full sequence does. It is the change that stops the
corpus drifting further while the owner decides the rest.

## 19. Which of outcomes A–F is supported?

# **E — multiple separately scoped additive packages.**

Sequenced by blocker, not by topic, reusing the AWE sequence already merged on `main`:

```text
1  Governance wiring                    unblocked        ← ship first
2  Canonical vocabulary reconciliation  one owner ruling (OD-C)
3  Contract repair                      unblocked technically
4  Workforce design completion          OD-A + OD-B      ← the large one
5+ Implementation sequence              packages 1-4
```

**Not A** — 41 stubs and no WorkUnit state set. **Not B alone** — errata cannot author an exception
state machine. **Not C alone** — completing the workforce over three unreconciled vocabularies
reproduces the drift one layer down. **Not D** — an omnibus holds the unblocked root-cause fix
hostage to an open product decision, spans three different owner competencies, and repeats the shape
that produced v1.8. **Not F** — the foundations are the strongest part of the repository and nothing
found requires discarding a foundational decision.

## 20. Is another architecture version actually required?

**A scoped workforce design-completion package is required. A v1.9 omnibus architecture package is
not.**

The distinction is the audit's conclusion, reached from the defect distribution and blocker
analysis:

- The workforce completion work **is already scoped on `main`** as AWE-D1, with its trigger met and
  two named blocking owner decisions. It does not need a new architecture package; it needs those
  decisions answered and the already-specified work authorised.
- The remaining defects are **governance wiring, vocabulary reconciliation and contract repair** —
  engineering against accepted decisions, not new architecture.
- No finding in this audit requires re-architecting anything. v1.5, FacilityOS, v1.6 and v1.7 should
  be **preserved and bound**, not rewritten. `v1.7 19_:23` forbids rewriting accepted handoffs
  "merely for consistency," and consistency is what an omnibus would be for.

---

## Claim ceiling (§18)

What FreightOS can truthfully say today, per the six-level ladder:

| Plane                | Defensible ceiling                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Carrier**          | ARCHITECTURALLY DESIGNED                                                                                                             |
| **Brokerage**        | ARCHITECTURALLY DESIGNED AND LEGALLY BARRED                                                                                          |
| **Facility**         | CATEGORY VISION (gated module, promotion path exists)                                                                                |
| **Shipper**          | CATEGORY VISION (gated module, promotion path exists)                                                                                |
| **Service provider** | CATEGORY VISION (no module, no legal context, Ruling C prohibition)                                                                  |
| **Platform**         | IMPLEMENTED — for identity, tenant isolation, authority, kill-switch records, audit, and the N1–N7 network and disclosure stack only |

**Nothing in the corpus reaches IMPLEMENTATION-READY DESIGN.** No job has attained even J0, which is
conditioned on a Job Book approval that has no record or mechanism. The Phase 1 artifact ceiling is
A2 — below the lowest certified rung on v1.8's own ladder.

`v1.8 07_:15`'s claim — "we deploy certified digital logistics workforces whose jobs, authority,
handoffs, and outcomes are explicitly engineered" — **is not currently truthful.** Corrected:

> FreightOS has _specified_ — not yet built — certified digital logistics workforces. Seventy-six
> job definitions exist across five participant planes; 36 of them carry real command vocabularies.
> None is implemented, none is certified, no work-unit, handoff or certification record exists in
> running code, and every agent in the registry is configured so that no tool may be called.

In fairness: the v1.5, v1.6 and FacilityOS master handoffs are **not** overclaim vehicles — all three
are written in normative-future voice with explicit activation caveats. The overclaim is
concentrated in `v1.7 01_`, the one document headed "Customer-facing language", which carries zero
modal verbs across 67 lines.

---

## Closing assessment

FreightOS has a stronger foundation than this register's length suggests. The authority model, the
disclosure stack, the tenant isolation, the physical-control prohibition and the scope authority are
designed, implemented, tested and fail-closed — and several are better than what most production
systems carry. The four domain packages are real architecture by people who understand freight.

What went wrong is narrower and fixable: **five substantial architecture packages were authored
outside the repository's governance graph, and the layer meant to bind them to buildable work was
given 343 lines to do it.** v1.8 is not a bad package so much as an under-resourced one — its
doctrine is frequently right and its instances almost never conform to it, including to its own
schemas.

The audit's central caution for whoever plans the remediation: the organizing thesis "the doctrine
is right, only the binding is missing" is **half true**. For about half the doctrine artifacts
tested, the standard itself omits a material decision — a state machine, a freshness rule, an
approving authority, a representable section. A plan that assumes a conformance layer over sound
doctrine will under-scope by roughly half. That is why
[16](16_REMEDIATION_OPTIONS_AND_RECOMMENDATION.md) separates schema-and-CI work from
design-authoring work, and why only the latter is blocked on owner decisions.
