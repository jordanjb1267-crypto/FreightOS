# 17 — Owner Decisions

An item appears here only if **all four** are true: repository evidence cannot resolve it; the
accepted handoffs cannot resolve it; strictest-rule precedence cannot resolve it; and it is
genuinely a product, legal, authority or business decision rather than engineering work.

Everything else in this audit is engineering and belongs in
[16](16_REMEDIATION_OPTIONS_AND_RECOMMENDATION.md), not here. Six items qualify. Two are inherited
from the merged W0/W1 audit and are restated because they now block more than they did.

---

## OD-A — Which roster is the canonical workforce source of truth?

_(Inherited: W0/W1 OD-1, still open. Restated because it now blocks packages 3 and 4.)_

Five rosters disagree and nothing in the corpus rules between them:

| Source                                 | Count                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| `config/agents/registry.yaml`          | 32 manifests (generated under an ADR-0015/0018 override) |
| `v1.2 08_AGENT_OPERATING_SYSTEM` prose | 53 roles                                                 |
| v1.5 canonical roles                   | 22                                                       |
| FacilityOS                             | 17 manifests                                             |
| `v1.8 agent_job_catalog.json`          | 76 jobs, self-declared non-authoritative                 |

**Why the repository cannot resolve it.** The registry is the roster of record _today_ — it is
generated, CI-validated and referenced by the autonomy clamp. But regenerating it from any other
source requires a new override ADR, because `handoff-provenance.json` declares the current
generation an authorized override. That is an owner act.

**What it blocks.** The Job Book schema alignment (package 3) needs to know which identifiers are
canonical. Package 4 cannot complete 41 job books without knowing whether it is completing 76 jobs,
32 manifests, or a reconciled set.

**Recommendation.** Declare the registry canonical for _runtime identity_ and the job catalogue
canonical for _design scope_, with an explicit reconciliation table and a CI check that neither
grows a member the other lacks. This is the smallest ruling that unblocks both packages.

---

## OD-B — Who authors the workforce design remediation, and should gated-module design be commissioned at all?

_(Inherited: W0/W1 OD-3, still open. The harder half is unchanged.)_

Two questions:

1. **Who authors it** — the external handoff author, the repository team, or a hybrid — and in which
   package?
2. **Should design work for promotion-, legal- and customer-gated modules (facility, shipper,
   service provider) be commissioned before those modules are prioritised?**

**Why nothing can resolve it.** Question 2 is a pure product and capital-allocation choice.
Designing 40 stub jobs for modules at `PROMOTION_GATED` (≥h2), `CUSTOMER_GATED` (≥h3) and
`LEGAL_AND_MARKET_GATED` (≥h3) is legitimate under `stop_after_horizon: 1` — the sequencing doctrine
explicitly permits architecting ahead — but it is expensive and its value depends on a roadmap no
document states. SR ruling 2 makes an installed package immutable absent an explicitly approved
corrective amendment, so the additive-package route is the conservative option rather than the only
conceivable one.

**Default if unanswered**, per W0/W1 and unchanged by this audit: nothing is authored, the 41 stubs
remain stubs, and facility, shipper and service provider stay blocked from any implementation path.

**What this audit adds.** The three stub departments are **not** equivalent and could be decided
separately:

| Plane                | Upstream design                                                                              | Argument                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Facility**         | FacilityOS: 24 docs, 1,957 lines, typed visit and document schemas, a 213-line BOL chapter   | The design work is **decomposition of existing material**, not invention. Cheapest and highest-confidence of the three. |
| **Shipper**          | v1.7 `10_`: 52 lines, self-labelled "architecture definition, not current module activation" | Genuine design authoring from a domain list. Moderate cost.                                                             |
| **Service provider** | v1.7 `11_`: 46 lines, self-labelled "future"                                                 | Should not proceed at all until OD-C is answered.                                                                       |

Deciding facility separately would unblock the largest tranche of decomposable work at the lowest
risk.

---

## OD-C — Is the service-provider workforce FreightOS's to own at all?

**New. This audit's most consequential escalation.**

v1.8 defines 10 service-provider job books. Against them:

- **No legal operating context exists.** `service_provider` appears zero times across `packages/`,
  `config/`, `adr/` and `schemas/`. `app.operating_context` is a PostgreSQL ENUM; adding a value
  requires `ALTER TYPE` plus an ADR amending ADR-0015's enumerated pairing table.
- **No module entry exists** in `config/scope/module_states.yaml`. Every other participant plane has
  a state and a horizon. This one has neither, so it has no gate and no promotion path.
- **Ruling C (Phase 1, adopted) forbids the work.** `docs/decisions/0002-phase-1-owner-rulings.md:90-105`
  binds RigDesk integration to `contract_and_simulation_only` and states FreightOS "may not diagnose
  a vehicle, clear a restriction, declare equipment safe, approve maintenance, **schedule
  maintenance, request roadside service**, [or] write to RIGDESK." That covers the substantive
  content of Service Intake, Appointment/Dispatch, Estimate, Work Status and Invoice/Reconciliation
  — five of the ten.
- **v1.7 agrees**: `11_:46` — "Do not duplicate detailed maintenance system-of-record ownership in
  FreightOS core."
- **v1.7 markets it anyway**: `01_:41` — "Service provider — Automate repair/roadside intake,
  capacity, estimates, scheduling, status, evidence, and billing."

**The decision.** Are those ten responsibilities:

- **(a) RigDesk's workforce**, reached through typed FreightOS network artifacts — in which case
  v1.8's ten job books should be reclassified as an _external participant profile_, not FreightOS
  components, and `01_:41` needs correcting; or
- **(b) FreightOS's**, in which case Ruling C must be amended, a `service_provider` operating context
  added by ADR and migration, and a module entry with a horizon created?

**Recommendation: (a).** It is consistent with Ruling C, with v1.7 `11_:46`, and with the absence of
any module or enum value. Option (b) requires amending an adopted owner ruling, a Postgres ENUM, the
ADR-0015 pairing table, and the module registry — four changes to accepted artifacts to accommodate
ten job books that were transcribed from a bullet list.

**Blocks:** packages 2 and 4. **Also requires** a correction to `v1.7 01_:41` either way.

---

## OD-D — Does a `Correction` / `Dispute` recourse artifact belong in the workforce model?

**New.**

v1.7 defines `Correction` and `Dispute` as `append_only` network artifacts. v1.8's ten-artifact
vocabulary drops both. FacilityOS `12_` and v1.6 `11_` both specify correction and dispute flows.

The consequence is structural: in the layer that actually staffs the jobs, **a receiving
organization has no way to contest an assertion made about it** except by rejecting a handoff
addressed to it. A carrier that disputes a facility's detention calculation, or a shipper that
disputes a broker's accessorial, has no artifact.

**Why it is an owner decision rather than engineering.** Adding recourse artifacts creates
obligations — who must respond, in what time, with what evidence, and what happens to the underlying
commercial position while a dispute is open. Those are commercial and legal commitments, not schema
choices.

**Recommendation.** Adopt `Correction` and `Dispute` into the workforce vocabulary in package 2, and
defer the _obligation_ semantics to package 4 with an explicit owner ruling on response deadlines.

---

## OD-E — What is the approving authority for a job certification?

**New.**

`grep` for `approver`, `approved by`, `signatory` and `owner approval` across v1.8's thirteen
numbered documents returns **zero matches**. Yet:

- WF-27 requires that A3/A4/A5 claims map to **signed** JobCertification records
- `job_certification.schema.json` makes `approvedBy` optional, has no signature field, and permits
  `evidenceRefs: []` — so a J7/A5 certificate with no evidence and no approver validates
- every job book conditions its own J0 on "approval of this Job Book", and no approval record,
  mechanism or authority exists

**Why it is an owner decision.** Who may certify a job for autonomous execution — and at which level
a named human must personally sign — is an accountability allocation, not an engineering choice. It
determines who is answerable when a certified A4 agent causes a loss.

**Recommendation.** Name the authority per J-level (for example: J1–J3 engineering lead; J4 product
owner; J5–J7 a named accountable executive plus the customer). Package 3 can then add
`approvedBy` to `required`, add a signature field, and set `minItems: 1` on `evidenceRefs`.

---

## OD-F — Does the claim ceiling stated in this audit stand?

**New, and time-sensitive.**

[18](18_FINAL_AUDIT_VERDICT.md) §16 records a defensible claim ceiling of **ARCHITECTURALLY
DESIGNED** for carrier, **ARCHITECTURALLY DESIGNED AND LEGALLY BARRED** for brokerage, and
**CATEGORY VISION** for facility, shipper and service provider — with nothing in the corpus reaching
IMPLEMENTATION-READY DESIGN.

Adversarial review identified specific present-tense sentences that would overclaim if quoted, all
concentrated in `v1.7 01_PRODUCT_CATEGORY_AND_POSITIONING.md` — the one document explicitly headed
"Customer-facing language", carrying zero modal verbs across 67 lines — plus `v1.7 17_`,
`v1.7 README:9`, `v1.8 00_:7` and `v1.8 07_:15`.

In fairness, and this was an overturned finding: the v1.5, v1.6 and FacilityOS master handoffs are
**not** part of the problem. All three are written in normative-future SHALL/MUST voice with
explicit activation caveats.

**Why it is an owner decision.** Whether to correct customer-facing language is a commercial call
with go-to-market consequences. The audit can state what is true; it cannot decide what is said.

**Recommendation.** Adopt `v1.8 07_:12`'s forbidden-claims list verbatim as a review gate, and apply
the corrected claims in [18](18_FINAL_AUDIT_VERDICT.md) §16 to the named documents. This is the one
item here that is cheap, unblocked, and carries external risk while it waits.

---

## Summary

| ID   | Decision                                                 | Type               | Blocks   | Recommended                                                                            |
| ---- | -------------------------------------------------------- | ------------------ | -------- | -------------------------------------------------------------------------------------- |
| OD-A | Canonical roster                                         | authority          | pkg 3, 4 | registry = runtime identity; catalogue = design scope; reconciliation table + CI check |
| OD-B | Who authors remediation; commission gated-module design? | product / capital  | pkg 4    | decide facility separately — it is decomposition, not invention                        |
| OD-C | Is the service-provider workforce FreightOS's?           | legal / product    | pkg 2, 4 | **(a)** external participant profile; correct `v1.7 01_:41`                            |
| OD-D | Correction / Dispute recourse artifacts                  | commercial / legal | pkg 2, 4 | adopt the artifacts now; defer obligation semantics                                    |
| OD-E | Certification approving authority                        | accountability     | pkg 3    | name an authority per J-level                                                          |
| OD-F | Claim-ceiling correction                                 | commercial         | nothing  | adopt the ceiling; correct the named v1.7/v1.8 sentences                               |

**Not escalated here** — resolved by evidence or precedence, and therefore engineering work:
the plane model (ADR-0015 governs v1.7 §13); autonomy grants (ADR-0018 governs v1.5's contract);
delegation (ADR-N0003 governs v1.5's Constitution); `required_context` (ADR-0015 governs); the
duplication question (the v1.2 dual-plane registry governs); detention (ADR-0025 governs FacilityOS
§11); Network-plane representability (ADR-0015 rule 1 covers it); the AV manifests (W0/W1 OD-2
resolved them).
