# Twin Learning & Change Control Audit

Tests the rule: **observed behavior may create a proposal; observed behavior may never silently
rewrite approved operations.**

## 1. Verdict

**The rule is correctly stated and structurally supported by the design. It is unenforced, and one
path to silent policy change is currently open by omission rather than by design.**

## 2. The required lifecycle vs the design

| Required stage                                           | Represented in v1.8.1 | Where                                                   |
| -------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| observed behavior                                        | yes                   | TWIN-G06 entry                                          |
| → learning candidate                                     | yes                   | `schemas/twin-learning-proposal.schema.json`            |
| → evidence window                                        | partial               | implied by graph progression; no window defined         |
| → Twin change proposal                                   | yes                   | TWIN-G06 (`TwinLearningWorkUnit`)                       |
| → impact analysis                                        | partial               | TW-15 requires an impact diff; no artifact defines it   |
| → authorized human/customer review                       | yes                   | edge `authority_check: customer_configuration_approval` |
| → approved new Twin version                              | yes                   | TWIN-G06 terminal                                       |
| → affected graphs/jobs/autonomy/integrations reevaluated | **no**                | nothing propagates                                      |

The critical property holds: **TWIN-G06 has no side effects at all**
(`side_effect_class: none` on every node). A learning WorkUnit cannot itself change anything — it
can only produce a proposal that a separate, approved change applies. That is the correct
construction, and it is enforced by the graph's own shape rather than by prose.

Reinforcing: `TWIN-G12` (`WorkflowModeChangeWorkUnit`) makes **mode/autonomy change itself a
governed WorkUnit** with `customer_configuration_approval` on its edges. Learning cannot raise
autonomy without going through an approved mode change. Both graphs are on plane
`twin_configuration`, separated from `twin_operations` and `twin_integration`.

## 3. Enforceability today

| Primitive needed              | Exists              | Evidence                                                                                                     |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Twin configuration store      | **NO**              | —                                                                                                            |
| Configuration versioning      | **NO**              | —                                                                                                            |
| Approved-change record        | **PARTIAL**         | `admin.privileged_operation` with purpose gates (`0013`) is the right pattern, scoped to control-plane admin |
| Impact diff                   | **NO**              | —                                                                                                            |
| Append-only change evidence   | **YES (substrate)** | `audit_events` (`0003`, `0006`, `0031`)                                                                      |
| Non-weakening inheritance     | **YES**             | `packages/identity/src/policy-inheritance.ts`, tested                                                        |
| Human approval enforced in DB | **PARTIAL**         | exists for cluster bootstrap, authority convergence, control-plane `admin.*` — not for Twin config           |
| Model/agent memory            | **NONE**            | no LLM, no prompt, no memory store, no vector store                                                          |

## 4. Paths by which learning could become production policy without approval

This is the section the rule exists for. Each path is assessed against the repository as it is.

| #   | Path                                                       | Open today?                      | Assessment                                                                                                                                                                                 |
| --- | ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L-1 | Model memory persists across sessions and shifts behaviour | **NO**                           | no LLM, no prompt, no memory store anywhere in the repository                                                                                                                              |
| L-2 | Agent memory / scratchpad becomes de-facto configuration   | **NO**                           | no agent loop exists                                                                                                                                                                       |
| L-3 | Prompt template edited outside change control              | **NO**                           | no prompts exist                                                                                                                                                                           |
| L-4 | Telemetry-driven threshold auto-tuning                     | **NO**                           | no telemetry consumer, no tuning path                                                                                                                                                      |
| L-5 | Pattern detection writes to a shared read model            | **NO**                           | no read model, no pattern detector                                                                                                                                                         |
| L-6 | **Twin config edited directly, bypassing TWIN-G06**        | **OPEN by omission**             | no Twin config store exists yet, so no control governs its future editing path. Nothing in v1.8.1 states that Twin configuration is writable **only** through an approved TWIN-G06 outcome |
| L-7 | Learning proposal auto-approved when "low impact"          | **OPEN by omission**             | no impact threshold defined; TW-15 requires an impact diff that does not exist. A future "auto-approve low impact" is the classic erosion path                                             |
| L-8 | FMI relevance profile mutating the Twin                    | **closed by design**             | FMI-20 requires relevance cannot mutate the Twin; `customer-market-relevance-profile.schema.json` is separate from Twin config                                                             |
| L-9 | Mode change escalating autonomy without J/G/A gates        | **closed by design, unenforced** | TWIN-G12 + HUMAN_AGENT_MODE_MATRIX promotion rule; but the Twin owners have no J-certification (HA-03)                                                                                     |

**Five of nine paths are closed simply because no model or agent runtime exists.** They will open
the moment one does. L-6 and L-7 are open now in the sense that nothing forbids them, and both are
cheap to close before implementation.

## 5. Gaps

### TL-01 — No Twin configuration store, so nothing is version-controlled

TW-15 NOT_IMPLEMENTED. Without a versioned config, "approved new Twin version" has no referent and
"stale edits invalidate approval" has nothing to compare.

### TL-02 — Twin config write path is unconstrained _(close before building)_

**Required change:** state and enforce that Twin configuration is writable **only** as the outcome
of an approved TWIN-G06 / TWIN-G12 WorkUnit — no direct write, no admin bypass, no runtime
administration path. The repository has an exact precedent worth copying:
`network_disclosure_projections` (`0032`) is **migration-authored only** precisely so that
_"every projection is reviewed before it can authorize anything"_. Twin configuration deserves the
same treatment or a comparably strong gate.

### TL-03 — No impact analysis artifact

TW-15 requires a versioned change with an impact diff. Nothing defines what a Twin change affects.
Without it, a reviewer approves a proposal without knowing which graphs, jobs, autonomy settings and
integrations it touches — which is also why the final lifecycle stage (re-evaluation) is absent.
**Required change:** an impact-diff artifact enumerating affected graphs, jobs, autonomy modes and
integration bindings, produced before review, not after.

### TL-04 — Nothing propagates an approved change

The required lifecycle ends with _"affected graphs/jobs/autonomy/integrations reevaluated"_. No
artifact, edge, or node does this. An approved Twin change would leave downstream graphs running
against a superseded configuration — the same class of defect as GR-11 stale invalidation. Conflict
**C-15**.

### TL-05 — Learning has no evidence-window definition

"Evidence window" appears in the required lifecycle; no artifact defines a minimum observation
period, sample size, or confidence threshold before a candidate becomes a proposal. Without it, a
single observation can become a proposal, and a human reviewer becomes the only filter.

### TL-06 — `HOLD` again

TWIN-G06 and TWIN-G12 declare `HOLD` as terminal without defining it. A rejected or ambiguous Twin
change lands in an ownerless state.

## 6. Adversarial cases

| Attack                                         | Outcome today                                    | Outcome if built as designed              |
| ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| Model memory becomes policy                    | **blocked** — no model                           | must be re-tested once a model exists     |
| Learning silently rewrites approved SOP        | **blocked** — no config to rewrite               | blocked _if_ TL-02 is enforced            |
| Low-impact auto-approval erodes control        | n/a                                              | **at risk** — TL-03, no impact definition |
| Learning raises autonomy                       | **blocked** — A3 CI clamp; TWIN-G12 governs mode | blocked, provided HA-03 closes            |
| Approved change leaves stale downstream graphs | n/a                                              | **at risk** — TL-04                       |
| Single observation becomes policy              | n/a                                              | **at risk** — TL-05                       |

## 7. Required changes

1. Twin config writable **only** via approved TWIN-G06/G12 outcome; no direct or admin write path
   (**TL-02**, blocking — cheapest to fix before the store exists).
2. Impact-diff artifact required before review (**TL-03**, blocking).
3. Propagation/re-evaluation of affected graphs, jobs, autonomy and integrations (**TL-04 / C-15**).
4. Define the evidence window — minimum observations, period, confidence (**TL-05**).
5. Re-run the L-1…L-5 assessment the moment any model or agent runtime is introduced.
