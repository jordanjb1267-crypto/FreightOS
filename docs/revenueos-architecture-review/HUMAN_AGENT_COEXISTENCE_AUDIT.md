# Human / Agent Coexistence Audit

Can one durable WorkUnit carry human ownership, agent contribution, deterministic-service
contribution, human edit, review, agent proposal, exact approval, command execution, reassignment,
escalation, interruption, resume, provenance and full audit reconstruction — while preserving
exactly one accountable owner at each graph state?

## 1. Verdict

**The design is correct and unusually careful. The runtime does not exist, so none of it is
enforced.** The mode/authority separation is the best-specified property in the entire v1.8.1
package and should be preserved verbatim into implementation.

## 2. The five modes — and why the design is right

`matrices/HUMAN_AGENT_MODE_MATRIX.csv`:

| Mode             | Human                                                   | Agent                                   | Side-effect rule                                          | Promotion rule                                   |
| ---------------- | ------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| OBSERVE          | works normally                                          | observe / normalize / summarize         | **none**                                                  | **no authority from mode**                       |
| ASSIST           | decides / acts                                          | draft / recommend / retrieve            | none unless separately authorized deterministic operation | **no authority from recommendation**             |
| COLLABORATE      | shares typed WorkUnit through explicit ownership/review | performs bounded subwork                | only independently authorized sub-actions                 | **single accountable owner at each state**       |
| APPROVAL_EXECUTE | approves exact version/scope                            | prepares and executes after gate        | **only approved command**                                 | **stale edits invalidate approval**              |
| BOUNDED_AUTONOMY | supervises exceptions/controls                          | executes certified graph/action classes | within independent authority ceiling                      | **requires existing J/G/A/policy/command gates** |

Four properties are exactly what Section 7 and Section 9 require:

1. **Mode never grants authority.** Stated explicitly for OBSERVE and ASSIST. An agent moved to a
   more capable mode gains _scope of participation_, not _permission_.
2. **Autonomy is a conjunction, not a label.** BOUNDED_AUTONOMY _"requires existing J/G/A/policy/
   command gates"_ — the mode is necessary and never sufficient.
3. **Approval binds an exact version.** _"stale edits invalidate approval"_ is the correct rule for
   TW-19 and REV-21.
4. **Single accountable owner survives collaboration.** COLLABORATE explicitly preserves it.

This directly satisfies the Section 7 requirement that modes be configurable **per workflow / per
action**, not as one company-wide autonomous flag. TWIN-G12 (`WorkflowModeChangeWorkUnit`) makes
mode change itself a governed, approved WorkUnit — the right construction, since otherwise mode
change becomes an unaudited autonomy escalation path.

The Section 7 target profile (documents = bounded autonomy, status = bounded autonomy, dispatch =
approval-execute, pricing = assist, exceptions = collaborate, repair spend = human-led) is fully
expressible in this matrix. **No architectural change is needed to support it.**

## 3. What the repository can enforce today

| Requirement                                    | Status                          | Evidence                                                                                                         |
| ---------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| One WorkUnit model for humans and agents       | **NO**                          | no WorkUnit exists (0 hits, 35 migrations)                                                                       |
| Exactly one accountable owner per state        | **NO runtime** / design PARTIAL | invariant declared 36/36; 55 of 90 owners unbooked; 76 terminals unowned                                         |
| Human identity, roles, memberships             | **YES**                         | `users`, `memberships`, `membership_roles`, `roles`, `permissions` (`0008`, `0009`)                              |
| Agent identity                                 | **PARTIAL (declared)**          | `config/agents/registry.yaml` — 32 manifests, every one `allowed_tools: []`, no production consumer              |
| Service-account identity                       | **YES**                         | `service_accounts` + credentials + permissions (`0011`)                                                          |
| Autonomy ceiling, computed and clamped         | **YES**                         | `packages/config/src/scope.ts:149`; `validate-scope.mjs:453` (A3 max); tested                                    |
| Approval gate                                  | **PARTIAL**                     | DB-enforced human approval exists for `admin.*` control-plane operations (`0013`, `0026`), **not** for WorkUnits |
| Provenance / audit reconstruction              | **YES (substrate)**             | `audit_events` append-only with purpose + outcome (`0003`, `0006`, `0031`); `network_events` (`0029`)            |
| Non-weakening policy inheritance               | **YES**                         | `packages/identity/src/policy-inheritance.ts`, unit tested                                                       |
| Reassignment / escalation / interrupt / resume | **NO**                          | no WorkUnit lifecycle                                                                                            |

## 4. Gaps

### HA-01 — No WorkUnit, so the coexistence claim is untestable

TW-16 NOT_IMPLEMENTED. The accepted W0/W1 audit already recorded the requirement set in
`WORK_UNIT_OWNERSHIP_MAP.md` Part E: one `currentOwner` per active WorkUnit, orphan detection beyond
a routing SLA, **explicit accept/reject with a required acceptance state and sender retention until
acceptance**, deadline per WorkUnit and per handoff, tenant + legal-plane partitioning,
per-participant twins with independent authority, and an ownership event on the append-only journal.
**v1.8.1 adds no new requirement to this list** — it consumes it. That is a point in v1.8.1's
favour and a sequencing constraint: the WorkUnit layer is shared, and must be built once.

### HA-02 — Handoff acceptance is absent from every graph

No Twin (or other) graph models `HANDOFF_PENDING` / accept / reject, and no edge carries a
retention-until-acceptance rule. Between two owners' nodes there is a window in which a WorkUnit has
left one owner and not been accepted by the next. With `HOLD` undefined, a rejected handoff has
nowhere to go. Conflict **C-11**.

### HA-03 — TWIN-G04's `operational_command` executor is unbooked and unbounded

`ApprovalExecutionWorkUnit` carries `side_effect_class: operational_command`. Its owner is one of
the 50 Twin owners with **no Job Book**, therefore no J-certification and no autonomy ceiling.
BOUNDED_AUTONOMY's promotion rule _"requires existing J/G/A/policy/command gates"_ cannot be
satisfied for a component that has no J, no G binding, and no command contract. This is the Twin
counterpart of FC-01. Conflict **C-05**.

### HA-04 — "Stale edits invalidate approval" is unimplementable as specified

The rule is correct; the mechanism is one identical free-text string on 185 edges
(`stale_invalidation: "on material input/version change"`). "Material" is undefined. See
GRAPH_EDGE_HANDOFF_AUDIT GE-03. TW-19 PARTIAL.

### HA-05 — No interruption / resume semantics

Section 9 requires interruption and resume. No graph models a paused state, and `HOLD` — the only
non-progress destination — is undefined. A human taking over from an agent mid-WorkUnit has no
represented state.

### HA-06 — Agent identity is declared, not real

All 32 registry manifests carry `allowed_tools: []`, which the registry header states means
_"NO tool may be called"_, and every entry names an eval file that does not exist. The only
consumer is a unit test. An agent contributing to a WorkUnit cannot currently be authenticated as a
distinct actor with its own permissions — though `service_accounts` and the verified-actor binding
machinery (`0020`, `0026`) provide the right substrate to do so.

## 5. Maturity progression — assistant → autonomous workforce

Section 9 requires that FreightOS support assistant, added employee, employee base, partial
autonomous and increasingly autonomous workforce **without a separate architecture at each level**.

**The design satisfies this.** The five modes are points on one axis over one WorkUnit model, with
one authority mechanism (the J/G/A/policy/command conjunction) throughout. Moving a workflow from
ASSIST to BOUNDED_AUTONOMY changes a configuration value and triggers TWIN-G12, not a re-architecture.

Two caveats:

- The progression is only safe if HA-03 closes — otherwise "certified graph/action classes" refers
  to graphs and jobs that have no certification.
- The autonomy ceiling is hard-clamped at **A3** for Horizon 1 (`validate-scope.mjs:453`), so
  BOUNDED_AUTONOMY above A3 is CI-prohibited today regardless of Twin configuration. This is correct
  and should not be relaxed for the Twin.

## 6. Required changes

1. Build the shared WorkUnit layer once, to the W0/W1 Part E requirements (**HA-01**, blocking).
2. Model handoff acceptance with retention and a defined rejection state (**HA-02 / C-11**, blocking).
3. Author Twin Job Books so BOUNDED_AUTONOMY's gate conjunction is satisfiable (**HA-03 / C-05**,
   blocking).
4. Make "material change" machine-evaluable via artifact-version binding (**HA-04**).
5. Model interruption/resume explicitly (**HA-05**).
