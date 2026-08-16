# 10 — Evaluation and Certification Coherence

## 1. The question §13 asks

Distinguish:

```text
generic certification framework exists
```

from

```text
job-specific certification design exists
```

**Answer: the first exists and is good. The second does not exist for any of the 76 jobs.**

## 2. The generic framework

`v1.8 06_JOB_CERTIFICATION_AND_EVALUATION.md` is 16 lines and is correct doctrine.

`:3` — "A generic LLM accuracy score cannot certify a logistics job." Right premise.

`:5` — **13 required evaluation case families** per Job Book: golden, ambiguous, missing/stale/
conflicting data, permission denial, policy denial, prompt-injection, duplicate/out-of-order event,
tool failure, partial-write, crash recovery, customer override, cross-tenant, high-risk escalation.

`:7-14` — **7 certification-blocking failures**, regardless of aggregate score:
unauthorized side effect; tenant/counterparty data leak; false legal/safety/compliance clearance;
duplicate financial/booking effect; fabricated authoritative status; approval bypass; missed
mandatory escalation.

`:16` — "J4 requires shadow comparison to actual operations. J6/A4 requires proven A3 history,
bounded policy, exact kill switch, customer authorization, and rollback/reconciliation evidence."

This is a genuinely good certification model. The seven blocking failures are the right seven —
each is a category where an aggregate score would hide a disqualifying event. The J4 shadow
requirement and the J6 preconditions are the right gates.

`contracts/job_certification.schema.json` supports it adequately: required `certificationId`,
`tenantId`, `jobId`, `jobVersion`, `level` (enum `J0`–`J7`), `scope`, `evaluationVersion`,
`evidenceRefs`, `approvedAt`; optional `approvedBy`, `expiresAt`, `rollbackRef`. Expiry and
rollback are both present, which is more than most contracts in the corpus manage.

### 2.1 The certification contract cannot enforce the control it exists for — CRITICAL

Adversarial review found a defect that inverts the assessment of the contract.

`WF-27` (`12_WORKFORCE_ACCEPTANCE_GATES.md:29`) requires that "A3/A4/A5 claims map to **signed**
JobCertification records." `WF-39` (`:41`) requires that the commercial claims registry "cannot
exceed certification evidence."

`job_certification.schema.json` cannot support either:

- `evidenceRefs` is required but has **no `minItems`**, so `"evidenceRefs": []` validates
- `approvedBy` is **optional**
- there is **no signature field** and **no release-SHA field** anywhere in the record
- `scope` is a bare `{"type": "object"}` — the field that decides what a certificate licenses

**A J7/A5 certification carrying zero evidence, no approver and no signature validates.** The
contract that is supposed to cap every commercial claim in the product cannot distinguish a
fully-evidenced A5 certificate from an empty one.

Related: `grep` for `approver`, `approved by`, `signatory` or `owner approval` across all thirteen
of v1.8's numbered documents returns **zero matches**. The package names no approving authority
anywhere, so every gate that depends on approval is unsatisfiable at the doctrine level rather than
the instance level.

Status: framework doctrine **DESIGN_COMPLETE**; the certification contract **DESIGN_PARTIAL with a
CRITICAL defect**; the approving authority **DESIGN_STUB**.

### 2.2 Two ladders, no crosswalk

`07_SELLABILITY_AND_CLAIM_STANDARD.md:5-10` defines six commercially-named levels (Designed,
Implemented, Shadow validated, A3 certified, A4 certified, A5 certified).
`00_MASTER_WORKFORCE_HANDOFF.md:56-63` and the `level` enum define eight J-levels (J0–J7).
**No document maps one onto the other.** "Implemented" has no J-level; J1, J2 and J3 have no
commercial level. A claims registry gated on certification records cannot be populated without an
invented crosswalk.

## 3. Job-specific certification design

`06:5` requires all 13 families in every Job Book. Measured across the 76:

| Required family                          | Job books containing it                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| permission denial                        | 76/76 — via the boilerplate line "policy or permission denial"                        |
| prompt injection                         | 76/76 — boilerplate                                                                   |
| duplicate / out-of-order                 | 76/76 — boilerplate                                                                   |
| cross-tenant                             | 76/76 — as "wrong-tenant/counterparty access attempt"                                 |
| crash recovery                           | 76/76 — as "restart before and after side effect where applicable"                    |
| missing / stale / conflicting data       | 76/76 — boilerplate                                                                   |
| golden                                   | ~40/76 — as "normal case" (22) or "normal visit" (18); the word "golden" appears in 1 |
| ambiguous                                | 13/76                                                                                 |
| policy denial (distinct from permission) | 18/76 explicit                                                                        |
| tool failure                             | 0/76 — nearest is "integration outage" in 28/76                                       |
| partial write                            | 0/76 as a certification scenario                                                      |
| **customer override**                    | **0/76**                                                                              |
| **high-risk escalation**                 | **0/76**                                                                              |

Six families are present in all 76 as **identical boilerplate lines**. Two are present in none.
The rest are patchy.

Every job book's "Job-specific certification scenarios" section is five universal boilerplate lines
plus one or two job-specific ones. `facility/gate.md:112-122` is representative: "normal visit" is
the only line that mentions a gate.

The section is titled _job-specific_. Across 76 job books it contains, on average, **1.3
job-specific scenarios.**

Two of the seven certification-blocking failures also have no scenario anywhere:

- _false legal/safety/compliance clearance_ — 0 mentions in any job book
- _approval bypass_ — only the generic template line

## 4. The gap between framework and jobs

| Element                       | Framework                                                  | Per job                                 |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| 13 case families named        | yes (`06:5`)                                               | 6 as boilerplate, 2 absent, rest patchy |
| what a "golden case" is       | not defined                                                | —                                       |
| how many cases suffice        | not defined                                                | —                                       |
| pass threshold per family     | **not defined** (OQ-15 open)                               | —                                       |
| oracle per family             | **not defined**                                            | —                                       |
| 7 blocking failures named     | yes (`06:7-14`)                                            | 2 have no scenario at all               |
| J-level promotion path        | yes (`06:16`)                                              | identical sentence in all 76            |
| certification scope semantics | `scope: {}` unconstrained                                  | —                                       |
| evaluation suite artifact     | `evaluationSuite` required by `agent_job_book.schema.json` | **absent from all 76 job-book JSONs**   |

`evaluationSuite` is required by v1.8's own Job Book schema and present in **zero** of its 76
instances — one of the ten required fields missing from every job book
(see [02](02_CROSS_PACKAGE_CONTRACT_MATRIX.md) §5.1).

## 5. Can v1.8 certification certify the jobs the earlier packages define?

**No, for three independent reasons.**

**(a) There is no job-specific input.** Certification needs job-specific golden cases, thresholds
and oracles. The job books supply 1.3 job-specific scenarios each and no threshold or oracle
anywhere.

**(b) Two J6/A4 preconditions do not exist.** `06:16` requires "bounded policy" and "exact kill
switch". `docs/governance/THREAT_MODEL.md:57` records T-17 **OPEN** — "No policy engine exists.
`base_policy.yaml` supplies vocabularies, not rules." `:55` records T-15 **OPEN** — "Kill switch
recorded but not enforced… Engaging a switch today is queryable but does not halt work." No job can
reach J6 until both close.

**(c) 40 of 76 jobs have no certifiable behaviour.** A job whose only command is
`facility_typed_command` and whose handoff edges are empty has nothing to write an evaluation
against.

## 6. Certification and autonomy do not reconcile

All 76 job books carry `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 →
J7 A5`, hedged with "only where the component/action class permits it" — a permission mapping that
is never supplied.

Against the effective ceiling computed in
[07](07_AUTHORITY_LEGAL_AUTONOMY_COHERENCE.md) §4.1:

| Plane            | Module state                     | Effective ceiling | Highest reachable J             |
| ---------------- | -------------------------------- | ----------------- | ------------------------------- |
| carrier          | ACTIVE_BUILD, `autonomy_max: A3` | **A3**            | J5                              |
| facility         | PROMOTION_GATED                  | **A0**            | J4 (shadow), no execution level |
| brokerage        | LEGAL_AND_MARKET_GATED           | **A0**            | J4                              |
| shipper          | PROMOTION_GATED                  | **A0**            | J4                              |
| service provider | no module; no operating context  | **A0**            | J4                              |

**J6 and J7 are unreachable by every job in the corpus today**, and J5 is reachable only by the 13
carrier agents. No document states this. A reader of the job books sees a promotion path to A5 with
no indication that six of its seven rungs are currently closed.

The five `deterministic_service` components carry the same ladder, for which it is meaningless
(see [07](07_AUTHORITY_LEGAL_AUTONOMY_COHERENCE.md) §4.4).

## 7. Certification of a Twin change

`v1.7 03_PARTICIPANT_OPERATIONAL_TWIN_STANDARD.md:55-64` requires a Twin change to produce, among
seven outputs, "required re-certification." This is the right architectural idea — configuration
drift should invalidate a certificate.

Nothing implements the link. No diff representation exists, no mapping from a Twin field to the
jobs that depend on it, and `job_certification.schema.json` has no field referencing a Twin version.
`expiresAt` and `rollbackRef` exist but nothing triggers them.

Status: **DESIGN_STUB.**

## 8. Evaluation infrastructure

All 32 registry manifests carry `evaluation_suite: evals/<id>.eval.yaml`. The `evals/` directory
**does not exist**. `validate-scope.mjs` fails on the condition, so this is a known, tracked gap
rather than an unnoticed one.

No scenario runner, fault injector, fixture corpus, acceptance-oracle engine or certification store
exists in `packages/` or `scripts/`. Per §3 that absence is expected under Horizon 1 and is not an
architecture failure. What _is_ an architecture failure is that
`09_IMPLEMENTATION_SEQUENCE.md:18-19` specifies the harness in nine words — "W5 Job-specific
evaluation harness / Registry and fixtures by job/version" — with no interface, fixture format,
oracle contract or registry schema. `DESIGN_STUB`, not merely deferred.

## 9. Corroboration

The merged W0/W1 audit reached the same conclusion independently
(`docs/workforce-engineering/EVALUATION_GAP_MATRIX.md`), reporting family coverage dominated by
template lines — "Ambiguous 1 SPEC / 75 NONE, High-risk escalation 2 SPEC / 74 NONE, Tool failure 47
NONE" — and WF-20 through WF-28 all FAIL. Two independent derivations agree.

W0/W1 also flags something this audit confirms and considers important: it scored the 76 job books
against v1.8's standards without ever scoring **those standards themselves**. `06_` (16 lines),
`08_` (17) and `09_` (33) fix no thresholds, oracles, sample sizes or per-phase deliverables. An
author asked to produce "job-specific evaluation suites covering the 13 families" has no
specification of what a suite must contain.

## 10. Status

| Area                                    | Architecture status | Design status                                          | Implementation status           |
| --------------------------------------- | ------------------- | ------------------------------------------------------ | ------------------------------- |
| Generic certification framework         | COMPLETE            | **DESIGN_COMPLETE**                                    | IMPLEMENTATION_ABSENT           |
| 7 certification-blocking failures       | COMPLETE            | **DESIGN_COMPLETE**                                    | IMPLEMENTATION_ABSENT           |
| `job_certification.schema.json`         | PARTIAL             | DESIGN_PARTIAL (`scope` unconstrained)                 | IMPLEMENTATION_ABSENT           |
| J0–J7 ladder                            | PARTIAL             | DESIGN_PARTIAL                                         | IMPLEMENTATION_ABSENT           |
| 13 evaluation families per job          | **GAP**             | **DESIGN_STUB** — 6 boilerplate, 2 absent, rest patchy |
| Job-specific golden cases               | **GAP**             | **DESIGN_STUB** — ~1.3 per job                         |
| Pass thresholds                         | **GAP**             | **DESIGN_STUB** — OQ-15 open                           |
| Oracles                                 | **GAP**             | **DESIGN_STUB**                                        |
| `evaluationSuite` in job books          | **GAP**             | DESIGN_STUB — 0 of 76                                  |
| Certification ↔ autonomy reconciliation | **CONFLICT**        | DESIGN_PARTIAL — J6/J7 unreachable, unstated           |
| Certification of a Twin change          | **GAP**             | DESIGN_STUB                                            |
| Evaluation harness design               | **GAP**             | DESIGN_STUB — 9 words                                  |
| `evals/` registry                       | —                   | —                                                      | IMPLEMENTATION_ABSENT (tracked) |

**The framework is sound and the inputs it needs do not exist.** That is a narrower and more
tractable finding than "certification is broken": the doctrine at `06_` can be kept as written, and
what is required is per-job content plus threshold, oracle and scope definitions.
