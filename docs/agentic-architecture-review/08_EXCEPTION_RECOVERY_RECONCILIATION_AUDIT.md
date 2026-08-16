# 08 — Exception, Recovery and Reconciliation Audit

## 1. The standard

`v1.8 05_EXCEPTION_OWNERSHIP_STANDARD.md` is **11 lines** in total. It is the shortest normative
document in the corpus and it is largely correct:

```text
:3  Every Job Book declares exceptions it resolves, temporarily contains, and must escalate.
:7  DETECTED → TRIAGED → CONTAINED → OWNER_ASSIGNED → RESOLVING → VERIFYING → RESOLVED
:9  Alternatives: CANCELLED | DUPLICATE | UNRESOLVED_ESCALATED
:11 The detecting agent is not automatically the resolving agent. No high-risk hold closes from
    model confidence alone. Counterparty silence is a state, not permission to assume success.
```

The seven-state lifecycle is exactly the one §12 requires, the three terminal alternatives are
right, and the three sentences at `:11` are excellent — each names a real failure mode that a naive
agent design would fall into.

That is the whole standard. What follows is what it does not do.

## 2. The §12 checklist, per exception class

§12 requires, for representative exception classes: detector, triage owner, containment owner,
resolution owner, authority, deadline, counterparty communication, evidence, escalation,
verification, closure.

| Required                   | Where specified                                                  | Status  |
| -------------------------- | ---------------------------------------------------------------- | ------- |
| detector                   | not assigned per class                                           | **GAP** |
| triage owner               | `05:11` says detector ≠ resolver, but names no triage owner      | **GAP** |
| containment owner          | `CONTAINED` is a state; no owner                                 | **GAP** |
| resolution owner           | per-department exception jobs exist (carrier, facility, shipper) | PARTIAL |
| authority                  | not specified                                                    | **GAP** |
| deadline                   | all 76 books carry the same value-free SLA paragraph             | **GAP** |
| counterparty communication | v1.7 `12_:43-56` gives a propagation chain; no rule per class    | PARTIAL |
| evidence                   | `exceptionRefs`, `evidenceRefs` in the WorkUnit contract         | PARTIAL |
| escalation                 | `UNRESOLVED_ESCALATED` state; no target, no trigger              | PARTIAL |
| verification               | `VERIFYING` state; no criteria                                   | PARTIAL |
| closure                    | `RESOLVED` state; no criteria                                    | PARTIAL |

**Zero of the eleven are specified per exception class.** The standard specifies a state machine;
the charter asks for an ownership model. `05_EXCEPTION_OWNERSHIP_STANDARD.md` — the document named
for exception _ownership_ — assigns no owner.

## 3. The standard's own instruction is followed 0 of 76 times

`05:3` requires: "Every Job Book declares exceptions it resolves, temporarily contains, and must
escalate."

No job book contains that three-way declaration. `grep` for a resolves/contains/escalates split
across all 76 `.md` files returns **0**.

What each job book has instead is an "Exception playbook" section containing one or two
job-specific lines plus **five boilerplate lines that appear exactly 76 times each**:

```text
- authoritative source unavailable or stale
- conflicting authoritative/evidence sources
- integration timeout, rejection, schema drift, or partial write
- policy or permission denial
- duplicate or out-of-order event/command
```

These five are a good list of _failure modes_. They are not exceptions the job owns, contains or
escalates, and no line says which of the three applies.

## 4. Where exception ownership actually exists

Three departments have a dedicated exception job:

| Department | Job                      | Class   | Commands        | Edges         |
| ---------- | ------------------------ | ------- | --------------- | ------------- |
| carrier    | Carrier Exception Agent  | `agent` | 5 real          | 4 up / 3 down |
| facility   | Facility Exception Agent | `agent` | **placeholder** | 0 / 0         |
| shipper    | Shipper Exception Agent  | `agent` | **placeholder** | 0 / 0         |

Brokerage has no exception job; the interaction matrix routes to a "Broker Exception workflow" that
is not a job book. Service provider has none.

So: one of five participant planes has a designed exception owner. Two have named stubs. Two have
nothing.

The carrier case is genuinely the good one — `carrier/exception` carries five real commands
(including `request_replan`, `open_exception`, `open_escalation`) and seven edges, and it is the
only job in the corpus whose exception ownership can be traced.

## 5. Exception propagation across participants

`v1.7 12_END_TO_END_NETWORK_WORKFLOW.md:43-56` gives the propagation chain:

```text
RigDesk asset exception
→ Carrier dispatch impact
→ FreightOS shipment ETA impact
→ FacilityOS appointment impact
→ Broker customer-service impact
→ Shipper commitment impact
```

with the correct constraint at `:56`: "Each receives only authorized information necessary for its
role."

This is the right model and it is the corpus's clearest statement of cross-participant exception
behaviour. It is also five arrows of prose. It does not say who owns the exception at each hop,
whether ownership transfers or forks, what artifact carries the propagation, what happens if a hop
rejects, or how the N5-A/N5-B disclosure decision is made for each recipient.

Simulation `05_breakdown_network_exception.yaml` is the scenario for this chain. It is three lines,
has no `faults` key at all, and six of the eight jobs it names are stubs.

## 6. Crash, duplicate, partial write, silence, outage

§12 requires the architecture to specify behaviour for each. Measured:

| Failure mode                | Specified where                                                                                                                                          | Status                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| crash / restart             | job-book boilerplate: "restart before and after side effect where applicable" (76×); v1.5 `04_:6` durable execution                                      | **DESIGN_STUB** — named, no procedure, no recovery contract                                                                     |
| duplicate side effect       | boilerplate: "Duplicate delivery cannot create duplicate business effect" (76×); `network_artifacts.yaml` `Command: requires_idempotency: true`          | **DESIGN_STUB** — asserted, no key, no scope, 0 of 91 commands defines one                                                      |
| partial write               | boilerplate: "integration timeout, rejection, schema drift, or partial write" (76×); "Uncertain external-write outcome is reconciled before retry" (76×) | **DESIGN_STUB** — the reconciliation procedure does not exist anywhere                                                          |
| counterparty silence        | `05:11` "Counterparty silence is a state, not permission to assume success"                                                                              | **DESIGN_PARTIAL** — the rule is correct and important; no timeout value, no state name, no escalation target                   |
| model / intelligence outage | boilerplate: "Model/intelligence outage preserves authoritative state and deterministic operations" (76×)                                                | **DESIGN_PARTIAL** — correct principle, no degraded-mode specification per job                                                  |
| integration outage          | boilerplate + `05:` failure list                                                                                                                         | DESIGN_STUB                                                                                                                     |
| stale data                  | boilerplate: "Missing required authoritative data becomes `UNKNOWN/STALE/HOLD`, never fabricated" (76×)                                                  | **DESIGN_PARTIAL** — the three-value convention is good; no freshness bound per input (only 4 of 36 authored books specify any) |
| unknown authority           | boilerplate: "Unknown authority fails closed" (76×); `v1.7 13_:50-52` "Missing context: Fail closed"                                                     | **DESIGN_COMPLETE** as a rule                                                                                                   |

The degraded-mode boilerplate is the strongest of the templated sections — its four lines are
correct, non-trivial and would prevent real failure modes. They are also identical across all 76
jobs, so no job has degraded-mode behaviour specific to what it actually does.

## 7. Reconciliation

Every job book asserts external writes are reconciled. `v1.5 04_:7` makes "exactly-once business
effect" a section. `enterprise_agent_graph.yaml` carries
`every_external_write_is_reconciled` as an invariant.

**No reconciliation procedure, sweeper, drift detector or periodic process is specified anywhere,
in any package.** Twelve settlement, pay, billing and audit jobs presuppose one.

The repository's own reconciliation surface is narrow and internal: N3 event fingerprint dedupe,
N4 conflict-safe intent insertion, admin ledger idempotent replay, N7 permit uniqueness. All are
internal-write idempotency, not external side-effect reconciliation. `grep 'reconcil'` across
`packages/*/src` returns one hit — a comment at `packages/database/src/network-events.ts:24` that
explicitly disclaims the broader meaning.

Status: **GAP / DESIGN_STUB.**

## 8. Interaction with the WorkUnit lifecycle

The exception lifecycle and the WorkUnit lifecycle do not interlock.

- Exception terminals: `RESOLVED | CANCELLED | DUPLICATE | UNRESOLVED_ESCALATED`
- WorkUnit terminal: `COMPLETE` only

No rule maps an exception terminal onto a WorkUnit state. A WorkUnit whose exception reaches
`UNRESOLVED_ESCALATED` has no defined state; a WorkUnit whose exception is `CANCELLED` has no
cancellation terminal to move to. See [05](05_WORKFLOW_AND_OWNERSHIP_COHERENCE.md) §1.3.

`05:11`'s rule that "the detecting agent is not automatically the resolving agent" implies an
ownership transfer at `OWNER_ASSIGNED`. Nothing specifies whether that transfer uses the
`JobHandoff` mechanism, whether the receiving job may reject it, or what happens to the underlying
WorkUnit's `currentOwner` while an exception is open.

## 9. Upstream exception models

Each domain package carries its own, and they are not reconciled with `05_`:

| Package                                                                 | Exception content                                                                   | Reconciled with v1.8 `05_`? |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------- |
| v1.5 `05_:7` "Exception graph"; `04_` durable execution                 | a graph stage list                                                                  | no                          |
| FacilityOS `12_DISCREPANCY_EXCEPTION_AND_CLAIMS_EVIDENCE.md` (62 lines) | facility discrepancy semantics — shortage, overage, damage, seal, document, quality | no                          |
| v1.6 `11_ACCESSORIAL_EXCEPTION_AND_CLAIMS_EVIDENCE.md` (73 lines)       | accessorial and claims evidence                                                     | no                          |
| v1.7 `12_:43-56`                                                        | cross-participant propagation                                                       | no                          |
| COT schema                                                              | `exceptions` property (COT only; FOT and BOT lack it)                               | no                          |

FacilityOS `12_` is the most substantive exception design in the corpus — it distinguishes
discrepancy classes with real domain meaning. Its downstream owner, `facility/discrepancy`, is a
stub with a placeholder command.

## 10. Status

| Area                                          | Architecture status | Design status                                            |
| --------------------------------------------- | ------------------- | -------------------------------------------------------- |
| Exception lifecycle (7 states + 3 terminals)  | COMPLETE            | **DESIGN_COMPLETE**                                      |
| The three rules at `05:11`                    | COMPLETE            | **DESIGN_COMPLETE**                                      |
| Exception ownership per class                 | **GAP**             | **DESIGN_STUB** — 0 of 11 attributes assigned            |
| Job-book resolve/contain/escalate declaration | **GAP**             | **DESIGN_STUB** — 0 of 76                                |
| Detector / triage / containment owners        | **GAP**             | DESIGN_STUB                                              |
| Exception deadlines                           | **GAP**             | DESIGN_STUB — no value anywhere                          |
| Exception resolution owners                   | PARTIAL             | 1 of 5 planes designed, 2 stubs, 2 absent                |
| Cross-participant propagation                 | PARTIAL             | DESIGN_PARTIAL — correct chain, no ownership or artifact |
| Crash / restart recovery                      | **GAP**             | DESIGN_STUB                                              |
| Duplicate suppression                         | **GAP**             | DESIGN_STUB — asserted 76×, no key                       |
| Partial write                                 | **GAP**             | DESIGN_STUB                                              |
| Counterparty silence                          | PARTIAL             | DESIGN_PARTIAL — rule correct, no timeout                |
| Model outage                                  | PARTIAL             | DESIGN_PARTIAL                                           |
| Stale data                                    | PARTIAL             | DESIGN_PARTIAL — `UNKNOWN/STALE/HOLD` convention is good |
| Unknown authority                             | COMPLETE            | DESIGN_COMPLETE — fail closed                            |
| Reconciliation                                | **GAP**             | **DESIGN_STUB**                                          |
| Exception ↔ WorkUnit lifecycle interlock      | **GAP**             | DESIGN_STUB                                              |
| Upstream exception models reconciled          | **GAP**             | DESIGN_PARTIAL                                           |

Implementation status throughout: `IMPLEMENTATION_ABSENT`. No exception model, reconciliation
process or recovery mechanism exists in code.

**Summary.** The exception _lifecycle_ is one of the better-designed things in v1.8 — eleven lines
that get the state machine and three subtle rules right. Exception _ownership_, which is what the
document is named for and what §12 asks about, is unassigned. The eleven-line standard is asked to
carry the weight of five participant planes, and it does not.
