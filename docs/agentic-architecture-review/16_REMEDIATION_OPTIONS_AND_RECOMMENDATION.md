# 16 — Remediation Options and Recommendation

## 1. What has to be closed

From [14](14_DUPLICATION_CONTRADICTION_GAP_REGISTER.md): 86 defects — 19 critical, 49 major,
18 moderate. They fall into five groups that differ in **who can do the work**, **what blocks it**,
and **how urgent it is**. That differentiation is what decides between options A–F.

| Group                                     | Content                                                                                                                                                                                                                                                              | Blocked by                                | Owner                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| **R1 Governance wiring**                  | declare v1.5–v1.8 as layers; extend the validator to `MANIFEST.json`; state precedence; restore the acceptance-gate evidence format; accept or supersede the 10 Proposed N-series ADRs; correct ADR-0003's status                                                    | **nothing**                               | repository team                    |
| **R2 Vocabulary and enum reconciliation** | one canonical action registry with crosswalks; resolve 8 synonym pairs; fix `required_context` vs ADR-0015; resolve 3 artifact vocabularies to one; a `service_provider` operating context or an external-participant model; the command store's band                | one product decision (service provider)   | repository team + one owner ruling |
| **R3 Contract repair**                    | WorkUnit state enum + the 4 omitted fields; `JobHandoff` organization fields, required `acceptanceState`, `acceptedBy`/`acceptedAt`; `job_certification` `minItems` + approver + signature; job-book schema alignment; an Exception contract; typed-artifact schemas | nothing technical                         | repository team                    |
| **R4 Doctrine authoring**                 | the exception state machine's transitions/guards/owners; freshness and authority definitions; the approving authority; simulation format and oracle semantics; evaluation thresholds; per-action authority attributes; the Twin section mapping and diff algorithm   | **needs an author with design authority** | owner decision OD-3                |
| **R5 Workforce completion**               | the 41 design stubs; per-job commands, edges, evaluations, autonomy levels; the 2 missing simulations; the reclassification of ~69 roles                                                                                                                             | **OD-1 and OD-3, both open**              | owner decision                     |

The critical asymmetry: **R1 is unblocked, cheap, and is the root-cause fix.** R5 is expensive and
blocked on two open owner decisions that are genuinely product and priority questions, not
engineering ones.

## 2. Prior art that already exists

The merged W0/W1 audit did not stop at findings. It proposed a concrete additive PR sequence
(`docs/workforce-engineering/PROPOSED_ADDITIVE_PR_SEQUENCE.md`):

```text
AWE-0   governance wiring + README truth                      (≈ R1)
AWE-D1  Workforce Design Remediation — CONDITIONAL, trigger MET  (≈ R4 + R5)
AWE-1   W2 job contracts — schemas + CI only                  (≈ R3)
AWE-2   canonical action / tool vocabulary                    (≈ R2)
AWE-3   W3 carrier — deterministic services first, then the WorkUnit/handoff runtime, then bounded agents
AWE-4   W5 evaluation harness and evals/ registry
AWE-5   W6 shadow certification (J4; claims stay ≤ Shadow)
AWE-6/7 W7 facility / brokerage, within existing gates
AWE-8   W8+ shipper / service provider
```

AWE-D1's trigger is met and it is **jointly blocked by OD-1 and OD-3**, both still open.

This matters for the option analysis: the workforce remediation is **already scoped** on `main`. The
question this audit must answer is not "what should the remediation contain" but "does the evidence
justify a new architecture package, or does it justify executing and extending work already
specified."

## 3. Options evaluated

### A — Proceed directly to implementation contracts

**Rejected.**

41 of 76 jobs are design stubs. The WorkUnit has no state set, so there is nothing to implement
against. No canonical action vocabulary exists, so no command can be routed to a policy decision.
No idempotency key exists on any of 91 commands while duplicate financial effect is
certification-blocking. All 7 simulations are 3-line stubs, so nothing could verify an
implementation. Four contracts are internally contradicted by their own standards.

An implementation team starting today would invent material business, authority, ownership and legal
semantics on the first day of every one of the five planes. That is precisely what `COMPLETE` is
defined to exclude.

### B — Small additive errata / addendum

**Necessary but grossly insufficient alone.**

An errata could fix real things cheaply: `required_context` vs ADR-0015, ADR-0003's superseded
status, the `autonomy_max` enum, the divergent CI implementation, the `job_certification`
`minItems`, v1.7 §13's plane list, the missing acceptance-gate evidence column.

It cannot close 41 design stubs, author an exception state machine, define freshness and authority,
or produce two missing simulations. Errata is a component of the answer, not the answer.

### C — Workforce-design completion package

**Necessary, already scoped, currently blocked — and insufficient alone.**

This is AWE-D1. It addresses R4 and R5, which is where the largest single mass of defects sits.

But it does not touch R1 (the governance disconnection that _caused_ the drift), R2 (three action
vocabularies, three artifact vocabularies), or the parts of R3 outside v1.8. Completing the
workforce against a corpus that still has no canonical vocabulary and no governance binding would
reproduce the same drift one layer down — the new job books would name commands that still resolve
to nothing.

It is also **blocked on OD-1 and OD-3**, and OD-3 contains a genuine product question: whether
design work for promotion-, legal- and customer-gated modules should be commissioned _at all_
before those modules are prioritised.

### D — Unified v1.9-style architecture reconciliation

**Rejected, and this is the load-bearing judgement of the audit.**

Bundling R1–R5 into one omnibus package is attractive because the defects are related. Four reasons
it is wrong:

1. **It holds the unblocked root-cause fix hostage to an open product decision.** R1 is cheap,
   fully specified by AWE-0, and is the single change that would have prevented most of this
   register. R5 is blocked on OD-1 and OD-3. Bundling means R1 ships when the owner answers a
   question about shipper and service-provider priority — which may be quarters away, or never.
2. **The groups have different owners and different competencies.** R1 and R3 are repository
   engineering. R4 is architecture authoring. R5 is domain design at scale. One package forces one
   review, one acceptance and one integrity manifest across three kinds of work.
3. **The corpus's own governance forbids the shape.** `v1.7 19_:23` — this package may not "rewrite
   prior accepted handoffs merely for consistency." SR ruling 2 makes an installed package immutable
   absent an explicitly approved corrective amendment. An omnibus reconciliation that restates v1.5,
   FacilityOS, v1.6 and v1.7 content would be doing exactly that.
4. **The failure mode is already demonstrated.** v1.8 _was_ the omnibus layer — one package asked to
   decompose four upstream packages into 76 jobs, five contracts, three matrices and seven
   simulations. It produced 343 normative lines and 41 stubs. Repeating the shape at larger scope
   is not obviously safer.

There is one real argument for D that the audit takes seriously: the vocabulary reconciliation (R2)
genuinely spans all five packages plus the repository, and doing it in pieces risks a partial
crosswalk. That argues for R2 being **one** scoped package — not for merging R2 with R1, R4 and R5.

### E — Multiple separately scoped additive packages

**Recommended.**

Each group ships when it is ready, reviewed by the people competent to review it, blocked only by
its own blockers.

### F — Foundational redesign

**Rejected, clearly.**

The foundations are the strongest part of the repository and are demonstrably sound: the
`legal_authority_class` × `operating_context` model with an enumerated pairing table enforced in
TypeScript and SQL; structural tenant isolation; the N5-A/N5-B disclosure stack with default-deny
grants and a grantor-uncrossable ceiling; the physical-control prohibition enforced in CI; the
module-state scope authority as a blocking gate; the autonomy-ceiling computation.

v1.5, FacilityOS, v1.6 and v1.7 are substantive, internally coherent domain architecture. Their
defects are drift, omission and unbound doctrine — not incompatible assumptions. Nothing found in
this audit requires discarding a foundational decision. Redesign would destroy working controls to
fix documentation coherence.

## 4. Recommendation

**Outcome E — multiple separately scoped additive packages**, sequenced by blocker rather than by
topic, and reusing the AWE sequence already on `main` rather than inventing a parallel one.

| Seq    | Package                                                             | Group   | Blocked by                          | Why first/later                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------- | ------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Governance wiring** (= AWE-0)                                     | R1      | **nothing**                         | The root-cause fix. Declares the five packages as layers, extends `check-network-governance.mjs` to `MANIFEST.json`, states precedence, restores the acceptance-gate evidence format, resolves the 10 Proposed-but-implemented N-series ADRs, corrects ADR-0003's status. Every subsequent package becomes verifiable the moment this lands.                                                  |
| **2**  | **Canonical vocabulary and enum reconciliation** (= AWE-2, widened) | R2      | one owner ruling (service provider) | One action registry with crosswalks from all three current vocabularies; 8 synonym-pair resolutions; `required_context` corrected; one artifact vocabulary with v1.7's two lists and v1.8's reconciled; the command-store band. This must be **one** package — a partial crosswalk is worse than none.                                                                                        |
| **3**  | **Contract repair** (= AWE-1, widened)                              | R3      | nothing technical; benefits from 2  | WorkUnit state enum and the 4 omitted fields; `JobHandoff` organization fields, required and attributed `acceptanceState`, and a receiver-side response to `expectedNextState`; `job_certification` `minItems`/approver/signature; job-book schema alignment; an Exception contract; typed-artifact schemas; a plane parameter on the Job Book so duplication can collapse to one definition. |
| **4**  | **Workforce design completion** (= AWE-D1)                          | R4 + R5 | **OD-1 and OD-3**                   | The 41 stubs, the reclassification, the 2 missing simulations, the doctrine authoring. Largest, most valuable, and the only one that must wait for a product decision.                                                                                                                                                                                                                        |
| **5+** | Implementation sequence                                             | —       | 1–4                                 | AWE-3 onward, unchanged.                                                                                                                                                                                                                                                                                                                                                                      |

### 4.1 Scope guidance for package 4

Three findings should shape it before it is written:

- **Do not re-expand the dual-plane model.** The v1.2 base registry models 20 of 32 manifests as
  multi-plane. v1.8's duplicate job definitions are a regression from it. The Job Book schema should
  gain a plane parameter and the duplicates should collapse to one definition each.
- **Do not staff the service-provider plane as FreightOS components** until OD-2b (below) is
  answered. Ruling C forbids FreightOS from performing the work five of those ten job books
  describe.
- **Score the standards, not only the instances.** W0/W1's own residual gap: `06_`, `08_` and `09_`
  fix no thresholds, oracles or sample sizes, so an author asked to satisfy them has no target.

### 4.2 What is deliberately _not_ recommended

- **No v1.9 omnibus architecture package.** The evidence does not support one, and the corpus's
  governance discourages it. The audit reached this conclusion from the defect distribution and
  blocker analysis, independently of any prior discussion.
- **No rewrite of v1.5, FacilityOS, v1.6 or v1.7.** Their defects are addressable by errata and by
  the vocabulary package. They are substantive architecture and should be preserved.
- **No new classification scheme invented here.** W0/W1 already performed the decomposition review
  v1.8 itself asked for, and adversarial review agreed with 17 of 20 spot-checked reclassifications.
  Package 4 should adopt and correct that work, not restart it.

## 5. The smallest change that closes the proven gaps

If only one thing ships: **package 1**. It is the smallest correct change with the largest causal
effect. Zero of the five packages cite any accepted ADR; zero accepted ADRs cite any package; none
is declared or CI-verified. Almost every vocabulary, enum and semantic drift in this register is
downstream of that. It is fully specified by AWE-0, blocked by nothing, and costs a few files.

It does not make the architecture implementation-ready. Nothing short of package 4 does. But it is
the change that stops the corpus drifting further while the owner decides packages 2–4.
