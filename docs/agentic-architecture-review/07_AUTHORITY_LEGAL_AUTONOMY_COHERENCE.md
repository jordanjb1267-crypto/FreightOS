# 07 — Authority, Legal Plane and Autonomy Coherence

## 1. The accepted authority model

The repository's model is the strongest part of the whole corpus. It is designed, accepted,
implemented in TypeScript and in SQL, and fails closed.

**ADR-0015** (Accepted, owner ruling, Phase 0) splits authority into two independent dimensions,
because `authority_mode` "was doing three incompatible jobs at once: naming the legal plane, naming
the operational surface, and acting as an RLS discriminator and kill-switch scope."

```text
legal_authority_class = software_only | carrier_agent | brokerage
operating_context     = system | carrier | shipper_owned | facility_operator
                        | autonomous_mobility | brokerage
```

Permitted pairings are enumerated (rule 6) and enforced:

| `legal_authority_class` | permitted `operating_context`                                         |
| ----------------------- | --------------------------------------------------------------------- |
| `software_only`         | `system`, `shipper_owned`, `facility_operator`, `autonomous_mobility` |
| `carrier_agent`         | `carrier`                                                             |
| `brokerage`             | `brokerage`                                                           |

"`carrier_agent` + `brokerage` is the pairing that would breach the two-plane separation, and it is
unrepresentable."

Rule 5 is the governing precedence: "Operating context never widens permission. Where the two
disagree, the legal class governs."

**Enforcement points, verified:**

- `packages/context/src/legal.ts:12-23` — the two enums; `:117-121` refuses an impermissible pairing
- `packages/database/migrations/0001_platform_foundation.up.sql:21,31` — both are PostgreSQL ENUMs;
  `:44-45` `app.is_permitted_legal_pairing`
- `packages/context/src/legal.ts:147` — `brokerage` rejected unconditionally while
  `BROKERAGE_EXECUTION_ENABLED` is false, a mandatory default rather than a tunable

Status: **COMPLETE / DESIGN_COMPLETE / IMPLEMENTED.**

## 2. v1.7's six planes do not map onto it — CONFLICT

`v1.7 13_AUTHORITY_AND_LEGAL_PLANE_MATRIX.md:3-28` names six "Planes": Carrier-Agent, Brokerage,
Shipper, Facility, **Service**, **Network**.

| v1.7 plane    | ADR-0015 representation                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| Carrier-Agent | `carrier_agent` + `carrier`                                                     |
| Brokerage     | `brokerage` + `brokerage`                                                       |
| Shipper       | `software_only` + `shipper_owned`                                               |
| Facility      | `software_only` + `facility_operator`                                           |
| Network       | `software_only` + `system` — ADR-0015 rule 1 covers "internal system workflows" |
| **Service**   | **none — no `service_provider` operating context exists**                       |

**One plane, not two, is unrepresentable.** An earlier draft of this audit also scored Network as
unrepresentable; adversarial review corrected it. ADR-0015 rule 1 states that `software_only`
"covers non-brokerage shipper, facility, autonomous-mobility, and **internal system workflows**,"
and `system` is a permitted context for `software_only` under rule 6. v1.7's Network plane — "routes
artifacts and enforces network policy; does not silently inherit participant commercial authority"
— maps cleanly onto it.

The Service plane does not. `service_provider` appears **zero** times across `packages/`, `config/`,
`adr/` and `schemas/`. `app.operating_context` is a PostgreSQL ENUM; adding a value requires
`ALTER TYPE … ADD VALUE` plus an ADR amending the enumerated pairing table.

**v1.8 staffs the Service plane with 10 job books.** Those jobs have no representable legal
operating context in the accepted model, no module entry in `config/scope/module_states.yaml`, and
no registry manifest.

There is a further constraint that makes this more than a schema gap. `docs/decisions/
0002-phase-1-owner-rulings.md:90-105` (Ruling C, adopted) binds RigDesk integration to
`contract_and_simulation_only` and states FreightOS "may not diagnose a vehicle, clear a
restriction, declare equipment safe, approve maintenance, schedule maintenance, request roadside
service, [or] write to RIGDESK." That prohibition covers the substantive content of Service Intake,
Appointment/Dispatch, Estimate, Work Status and Invoice/Reconciliation — five of the ten
service-provider job books. Combined with v1.7 `11_:46` ("Do not duplicate detailed maintenance
system-of-record ownership in FreightOS core"), the correct disposition of those ten
responsibilities is arguably **external participant** — RigDesk's workforce, reached through typed
network artifacts — rather than any FreightOS component class. That is a product decision, recorded
in [17](17_OWNER_DECISIONS.md).

Conversely, `autonomous_mobility` — a context that _does_ exist, with 7 registry agents — has zero
v1.8 jobs.

### 2.1 The deeper problem: v1.7 re-collapses the two dimensions

ADR-0015 exists to separate legal authority from operational surface. v1.7 §13's single "Planes"
list merges them back into one axis, mixing legal postures (Carrier-Agent, Brokerage) with
operational surfaces (Shipper, Facility, Service) and an infrastructure role (Network).

`v1.7 19_GOVERNANCE_AND_NON_REGRESSION.md:5` concedes precedence — "Existing Constitution,
security/resilience, legal/safety gates, sequencing doctrine and signed ADRs remain controlling" —
so strictest-rule precedence resolves this in ADR-0015's favour. But an engineer reading v1.7 §13
alone builds the wrong model, and v1.7 §13 is the document titled "Authority and Legal Plane
Matrix."

Status: **CONFLICT.** ADR-0015 governs. v1.7 §13 requires an erratum.

### 2.2 What v1.7 §13 gets right

Recorded for balance. `:30-38` (cross-plane rule) is correct and important: an organization may
participate in multiple planes "only through distinct legal context, credentials/scopes, ledgers
where required, policies, commands, audit." `:26-28` on the Network plane is exactly right —
"Routes artifacts and enforces network policy. Does not silently inherit participant commercial
authority." `:50-52` — "Missing context: Fail closed." All three align with the accepted model.

## 3. Tenant, organization and principal

The controlling rules, from the v1.3/v1.4 layer:

- **ADR-N0011:30** — "`tenant_id` ≠ `organization_id`. Never define them as equal, and never derive
  one from the other."
- **ADR-N0011:62** — "Participant relationships may cross tenant boundaries. **They convey no data
  authority.**"
- **ADR-N0003:29-44** — four non-collapsible identity layers: (A) authenticated PostgreSQL
  principal, "the only source of authority"; (B) network participant, which "authenticates
  nothing"; (C) acting authority / delegation; (D) beneficial party, a field not an actor.
- **ADR-N0003:80** — "**Layer C does not exist yet and is not authorized by this ADR.**"
  `:107` — "Layer C's grant model is deliberately unspecified here."

### 3.1 Layer C is the single most load-bearing absence for this corpus

Every cross-company workflow in v1.5–v1.8 — broker tenders carrier, shipper tenders broker, carrier
requests facility appointment, carrier requests provider service — is a design in which one
organization's agent acts in a transaction involving another organization. The accepted model says
the delegation layer that would authorize such acting **does not exist and is not authorized**.

This does not make the designs wrong. v1.8 `04:21` and v1.7 `12_:31-41` both take the correct
position: each participant independently evaluates and accepts, so no delegation is needed for the
_message_ path. But it does mean that any design step which assumes an agent can act _on behalf of_
a counterparty is unimplementable, and no package flags the constraint.

Status: **GAP**, upstream of v1.5–v1.8, correctly recorded by the accepted ADR.

### 3.2 Twins carry no legal identity

No Operational Twin schema carries `legal_authority_class` or `operating_context`. BOT's
`brokerageEntityId` is the only legal identity anywhere in the Twin family. A Twin therefore cannot
express which legal posture its participant operates under — the dimension the whole authority
model turns on. See [03](03_PARTICIPANT_AND_TWIN_COHERENCE.md) §8.

## 4. Autonomy — A0–A5

### 4.0 Three package-level contradictions of the accepted autonomy model

Found by adversarial review and verified. All three are CRITICAL because each would, if
implemented as written, defeat a control the repository enforces.

**(a) v1.5 ships a contract that GRANTS autonomy.** `contracts/autonomy_grant.schema.json:6-16`
requires `tenantId, workflowId, actionClass, scope, level, policyVersion, evidenceRef, approvedBy,
effectiveAt`, with `level` an enum over A0–A5. `contracts/enterprise_agent_graph.yaml:11` states the
same as an invariant: `autonomy_is_granted_per_workflow_action_scope`.

`adr/0018-autonomy-ceiling-enforcement.md:31-33` says autonomy is **computed, never configured**,
and `packages/config/src/autonomy.ts:68-71` says "Never read `maximum_autonomy` from the registry
directly." An AutonomyGrant carrying a `level` is a configured autonomy value, and it has no join
key to the clamp — no `module`, no `agentId`, nothing `effectiveMaximumAutonomy` could consume.
**CONFLICT.** ADR-0018 governs; a grant may narrow the computed ceiling but must never set it.

**(b) v1.5's Constitution authorizes delegation that does not exist.**
`01_ENTERPRISE_AGENT_CONSTITUTION.md:29` — "Only deterministic authorization and **valid delegation
grants** can authorize consequential commands."
`docs/decisions/0003-network-identity-separation.md:80` — "Layer C does not exist yet and is not
authorized by this ADR"; `:107` — "Layer C's grant model is deliberately unspecified here."
**CONFLICT.** The stricter rule governs: today the only authorization source is deterministic
authorization, and any design step relying on a delegation grant is unimplementable.

**(c) v1.6 declares A4 candidates in a module whose computed ceiling is A0.**
`16_AUTONOMY_SHADOW_AND_CERTIFICATION.md:32-41` lists routine quoting, inviting approved carriers,
negotiating inside a buy-rate envelope and tendering to a qualified carrier as "Candidate A4 actions
after proof"; `:65` states "Routine brokerage can operate autonomously inside certified scope."
`digital_brokerage` is `LEGAL_AND_MARKET_GATED` with `BROKERAGE_EXECUTION_ENABLED: false` as a
mandatory default, so its computed ceiling is **A0**. **CONFLICT** at the level of framing rather
than authorization — v1.6 elsewhere states the legal gate correctly — but the A4 language is not
qualified by the ceiling anywhere in the document.

A fourth, systemic observation supports all three: `grep` across all five packages for
`BROKERAGE_EXECUTION_ENABLED`, `module_states`, `horizon_authorized`, `effectiveMaximumAutonomy` or
`Horizon 1` returns **zero hits**. None of the five packages references the machine-readable scope
authority that governs them.

### 4.1 The ceiling is genuinely excellent — as a configuration control

`packages/config/src/autonomy.ts`:

```ts
effectiveMaximumAutonomy = min(declared, moduleCeiling(module), horizonCeiling(authorizedHorizon));
```

- `:25-32` `minAutonomy([])` returns `A0`, "never unbounded"
- `:39-41` `horizonCeiling(1) = A3`
- `:47` implementable states are exactly `{ACTIVE_BUILD, FOUNDATION_ONLY}`
- `:57-61` `moduleCeiling` returns `A0` for any other state, and for any module whose horizon
  exceeds the authorized horizon
- `:68-71` "The only function any consumer may use to decide what an agent is allowed to do. Never
  read `maximum_autonomy` from the registry directly."

Tested at `packages/config/test/unit/autonomy.test.ts`. The arithmetic is airtight: an unknown state
falls to A0 (`:58`), a missing or over-horizon horizon falls to A0 (`:59`), an absent module throws
rather than defaulting (`scope.ts:83`, `:156`), and empty input is A0 (`:27`).

**Three qualifications, from adversarial review:**

1. **It is a configuration control, not a runtime control.** `effectiveMaximumAutonomy` has **no
   non-test caller**. What it enforces today is that no registry entry resolves above A3, checked by
   a blocking CI step (`scripts/validate-scope.mjs:421-475`, `ci.yml:101`). Where the ceiling is
   consulted in a command path, and the behaviour on violation, are unspecified — because no command
   path exists. The correct claim is "the ceiling is computed and enforced against the agent registry
   in CI", never "FreightOS enforces autonomy ceilings on running agents."
2. **A malformed `autonomy_max` silently raises a module ceiling.** `scope.ts:50` types it
   `z.string().optional()` rather than an enum; `scope.ts:86-89` discards an unrecognised value and
   passes `undefined`; `moduleCeiling:60` then substitutes `horizonCeiling(authorizedHorizon)`. So
   `autonomy_max: a3` (lowercase) on `carrier_copilot` yields A3 by luck at Horizon 1 and **A5** at
   Horizon 2 — falsifying the module's own header claim that no configuration value can raise a
   ceiling. A one-line enum fix.
3. **Two implementations diverge and CI runs the weaker one.** `scripts/validate-scope.mjs:421-433`
   reimplements the rule without the `isAutonomyLevel` guard, so a malformed value is used
   literally: `rank('a3')` is `-1`, the reduce selects it as the minimum, and the
   `rank(effective) > rank('A3')` test at `:456` passes because `-1` is not greater than `3` — a
   garbage effective level reported as compliant. The `:456` threshold is also hardcoded and
   horizon-independent.

None of these breaks the design. All three are recorded because IF-11 originally read as an
unqualified endorsement, and Lens A and Lens E were both right to downgrade it.

Applied to the 32 registry manifests in Horizon 1:

| module                       | state                            | agents | effective ceiling |
| ---------------------------- | -------------------------------- | ------ | ----------------- |
| `carrier_copilot`            | ACTIVE_BUILD, `autonomy_max: A3` | 13     | **A3**            |
| `facilityos_lite`            | PROMOTION_GATED                  | 12     | **A0**            |
| `autonomous_vehicle_gateway` | INTERFACE_AND_SIMULATION_ONLY    | 7      | **A0**            |

Nineteen of the 32 declared agents resolve to A0 today, regardless of the `maximum_autonomy: A4`
values several of them carry.

Status: **COMPLETE / DESIGN_COMPLETE / IMPLEMENTED.**

### 4.2 A-level semantics are thin

`v1.2 09_AUTONOMY_POLICY_AND_AUTHORITY.md:5` defines A0–A5 in six words each: "A0 Observe;
A1 Recommend; A2 Prepare; A3 Approval-to-Execute; A4 Policy-Bounded Autonomy; A5
Exception-Supervised Operation." `config/policy/base_policy.yaml:3-9` carries them as a bare list.
`docs/governance/POLICY_REGISTRY.md:28-29` states the consequence: "It contains vocabularies, not
rules."

What each level authorizes **for a given action** is unspecified. That is the missing join between
the autonomy ladder and the action vocabulary of [06](06_ACTION_COMMAND_POLICY_VOCABULARY_AUDIT.md).

### 4.3 No job book declares an autonomy level — the §11 reconciliation is impossible

`grep 'autonomy'` across the 76 job-book JSONs: **0 matches.**

All 76 `.md` files carry the identical sentence:

> `Promotion path: J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`,
> only where the component/action class permits it.

The permission mapping that hedge depends on is never supplied. The A0–A5 prose appears as three
boilerplate variants (37 / 28 / 5 occurrences), none job-specific.

§11 of the charter asks the audit to identify conflicts between job-declared autonomy, registry
autonomy, module ceiling, global/Horizon ceiling, certification state and legal/module state. **The
reconciliation cannot be performed**, because the job-declared term does not exist anywhere in the
design. That is the finding.

What _can_ be said:

| Source                      | Value                                            |
| --------------------------- | ------------------------------------------------ |
| job-declared autonomy       | **does not exist**                               |
| registry `maximum_autonomy` | A1–A4 across 32 manifests                        |
| module ceiling              | A3 (`carrier_copilot`), A0 (all other modules)   |
| horizon ceiling             | A3 (`horizon_authorized: 1`)                     |
| certification state         | J0 SPECIFIED for all 76 (no J1+ evidence exists) |
| legal / module state        | brokerage, shipper, facility, service all gated  |

**Effective result, strictest value: A3 for 13 carrier agents, A0 for everything else.**

### 4.4 The J-ladder is applied to components for which it is meaningless

All 76 job books — including the five `deterministic_service` components (Margin Risk Service,
Broker Transaction Record Service, Detention Clock Service, Profitability Engine, Routing Guide
Engine) — carry the same J0→J7 promotion path terminating at A5.

`01_ROLE_DECOMPOSITION_AND_AGENT_MINIMIZATION.md:8` designates deterministic services for
arithmetic and exact clocks. An autonomy ladder over a deterministic clock has no meaning. Five of
the 76 books also carry the line "No model discretion. A0-A5 cannot change deterministic behavior,"
which is correct — but the same books still carry the J5 A3 → J6 A4 → J7 A5 promotion path.

Status: **CONFLICT** within v1.8, self-mitigated by the "only where the component/action class
permits it" hedge, which is itself unspecified.

### 4.5 J0–J7 vs the accepted certification model

The J-ladder terminates at A5. In Horizon 1 the effective ceiling is A3 and, for four of the five
participant planes, A0. No document reconciles a J7/A5 certification path with a module that cannot
exceed A0 until an owner-signed promotion ADR.

`v1.8 06_JOB_CERTIFICATION_AND_EVALUATION.md:16` states the strongest gate correctly: "J6/A4
requires proven A3 history, bounded policy, exact kill switch, customer authorization, and
rollback/reconciliation evidence." Two of those five preconditions do not exist:

- **exact kill switch** — kill switches exist in migrations 0004/0014/0015 with scope values, but
  `docs/governance/THREAT_MODEL.md:55` records T-15 **OPEN**: "Kill switch recorded but not
  enforced… Engaging a switch today is queryable but does not halt work."
- **bounded policy** — `THREAT_MODEL.md:57` records T-17 **OPEN**: "No policy engine exists.
  `base_policy.yaml` supplies vocabularies, not rules."

## 5. Prerequisites the lower layers record as absent

Three named OPEN threats are load-bearing for every v1.5–v1.8 design that assumes deterministic
authorization:

| Threat   | Statement                                                                                          | Bearing                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-15** | kill switch recorded but not enforced; wiring it into the command path is "a Phase 3 precondition" | J6/A4 certification, every job book's kill-switch prose                                                                                       |
| **T-17** | no policy engine exists                                                                            | every "deterministic policy gate" in all five packages; v1.4 `06_:12` "No proposal becomes a command without deterministic policy evaluation" |
| **T-18** | pre-ingestion prompt-injection model absent                                                        | all 76 job books' prompt-injection certification scenario                                                                                     |

Also: `v1.3 01_:65` (Art. VIII.1) — "Models and agents are untrusted decision-support components
unless a deterministic policy engine authorizes execution." With T-17 open, **no agent in the
corpus can currently be authorized to execute anything**. That is the correct and intended state
for Horizon 1, and it bounds every autonomy claim.

## 6. Legal activation gates

| Gate                | Mechanism                                                                                                           | State                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Brokerage           | `checklists/BROKERAGE_LEGAL_GATE.md` + `BROKERAGE_EXECUTION_ENABLED=false` + `legal.ts:147` unconditional rejection | **CLOSED**, enforced in three places |
| Facility automation | `checklists/FACILITY_AUTOMATION_GATE.md`; `facilityos_lite` PROMOTION_GATED, `facilityos_full` CUSTOMER_GATED       | **CLOSED**                           |
| Horizon promotion   | `checklists/HORIZON_PROMOTION_GATE.md`; six conditions at `module_states.yaml:4-9`                                  | **CLOSED** at Horizon 1              |
| AV activation       | `checklists/AUTONOMOUS_VEHICLE_ACTIVATION_GATE.md`; `INTERFACE_AND_SIMULATION_ONLY`                                 | **CLOSED**                           |

v1.6 treats brokerage correctly as legally gated throughout — `brokerage_graphs.yaml` carries
`authority_before_brokerage_execution` and
`proposed_transparency_rule_not_activated_as_current_law` as invariants, and `18_:34` states
"Autonomous broker labor does not remove the need for legally required brokerage
entity/authority/compliance." The audit finds no place where v1.6 reads as if brokerage were active.

One residual: **six terminal gated states are machine-indistinguishable.** `module_states.yaml:27-38`
gives `PROMOTION_GATED`, `CUSTOMER_GATED`, `LEGAL_AND_MARKET_GATED`, `PARTNER_AND_SAFETY_GATED`,
`LIQUIDITY_GATED` and `DORMANT` one identical key — `implementation_allowed: false` — while the
doctrine table in `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md` gives each a _different_ permitted
output ("research/contracts only", "dormant architecture only", "interface, shadow and simulation
only"). The stricter reading governs (`implementation_allowed: false`), but the machine-readable
authority cannot express the distinction the doctrine draws.

## 7. Status

| Area                                          | Architecture status | Design status             | Implementation status                                       |
| --------------------------------------------- | ------------------- | ------------------------- | ----------------------------------------------------------- |
| `legal_authority_class` × `operating_context` | COMPLETE            | DESIGN_COMPLETE           | **IMPLEMENTED** (TS + SQL)                                  |
| Permitted pairing enforcement                 | COMPLETE            | DESIGN_COMPLETE           | **IMPLEMENTED**                                             |
| v1.7 six-plane model                          | **CONFLICT**        | DESIGN_PARTIAL            | —                                                           |
| Service plane legal representation            | **GAP**             | **DESIGN_STUB**           | IMPLEMENTATION_ABSENT                                       |
| Network plane legal representation            | **GAP**             | DESIGN_STUB               | IMPLEMENTATION_ABSENT                                       |
| Tenant / organization separation              | COMPLETE            | DESIGN_COMPLETE           | **IMPLEMENTED**                                             |
| Principal identity (layers A, B, D)           | COMPLETE            | DESIGN_COMPLETE           | **IMPLEMENTED**                                             |
| Acting authority / delegation (layer C)       | **GAP**             | **DESIGN_STUB**           | IMPLEMENTATION_ABSENT — explicitly not authorized           |
| Twin ↔ legal model binding                    | **GAP**             | DESIGN_STUB               | —                                                           |
| Autonomy ceiling computation                  | COMPLETE            | DESIGN_COMPLETE           | **IMPLEMENTED** + tested                                    |
| A0–A5 per-action semantics                    | **GAP**             | DESIGN_PARTIAL            | IMPLEMENTATION_ABSENT                                       |
| Job-declared autonomy                         | **GAP**             | **DESIGN_STUB** — 0 of 76 | —                                                           |
| J0–J7 ladder                                  | PARTIAL             | DESIGN_PARTIAL            | IMPLEMENTATION_ABSENT                                       |
| J-ladder applied to deterministic services    | **CONFLICT**        | DESIGN_PARTIAL            | —                                                           |
| Kill switch → command path                    | **GAP**             | DESIGN_STUB               | IMPLEMENTATION_PARTIAL (recorded, not enforced — T-15 OPEN) |
| Deterministic policy engine                   | **GAP**             | **DESIGN_STUB**           | IMPLEMENTATION_ABSENT (T-17 OPEN)                           |
| Legal activation gates                        | COMPLETE            | DESIGN_COMPLETE           | **IMPLEMENTED**                                             |
| Module-state granularity                      | PARTIAL             | DESIGN_PARTIAL            | IMPLEMENTED (strictest reading)                             |

**The effective authority result is always the strictest allowed value, and today that is: A3 for
13 carrier agents in one ACTIVE_BUILD module, A0 for the other 19 declared agents, and no
authorization to execute anything at all until a deterministic policy engine exists.**
