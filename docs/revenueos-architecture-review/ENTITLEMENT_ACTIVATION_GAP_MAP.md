# Entitlement & Activation Gap Map

Tests **H3**: versioned commercial entitlement can remain strictly separate from runtime command
authority.

## 1. Verdict

**H3 is architecturally sound and today vacuously true.** Entitlement cannot grant command
authority because neither entitlement nor command authority exists as a runtime construct. The
design direction is right, and the repository already contains the _shape_ of the answer in a
different domain — but nothing enforces the separation yet, and one structural precedent must be
copied deliberately rather than reinvented.

## 2. Current state

| Construct                             | Exists  | Evidence                                                     |
| ------------------------------------- | ------- | ------------------------------------------------------------ |
| Entitlement record                    | **NO**  | `entitlement` → 0 hits across 35 executed migrations         |
| Entitlement version                   | **NO**  | —                                                            |
| Activation state (per customer)       | **NO**  | —                                                            |
| Activation state (per module, global) | **YES** | `config/scope/module_states.yaml`, CI-asserted               |
| Command registry                      | **NO**  | no command table, no dispatcher                              |
| Command authority check               | **NO**  | no runtime consumer of `config/policy/base_policy.yaml`      |
| Autonomy ceiling                      | **YES** | `packages/config/src/scope.ts:149`; `validate-scope.mjs:453` |
| Bundle → atomic expansion             | **NO**  | —                                                            |

`schemas/commercial-entitlement.schema.json` in the package defines the intended shape. It is a
design artifact; no code reads it.

## 3. The separation, as designed

v1.8.1 states the rule in three places, consistently:

- `matrices/CAPABILITY_PACK_CATALOG.csv` — `activation_rule` is always a **conjunction**:
  `entitlement + certification + authority + policy`. Entitlement is one conjunct, never the whole.
- `graphs/**` — the invariant _"commercial entitlement never grants operational authority"_ appears
  in 6 graphs.
- `matrices/HUMAN_AGENT_MODE_MATRIX.csv` — `promotion_rule` for BOUNDED_AUTONOMY is
  _"requires existing J/G/A/policy/command gates"_.

This is the correct construction. An entitlement that is one term in an AND can never widen
authority on its own.

## 4. Gaps

### ENT-01 — No entitlement object, so REV-06..REV-10 cannot be scored above NOT_IMPLEMENTED

Versioning, bundle expansion, dependency enforcement, and the entitlement↛command rule are all
unbuilt. Five REV gates score NOT_IMPLEMENTED on this single fact.

### ENT-02 — The precedent to copy is `network_disclosure_projections`, and the package does not cite it

The repository already solved "a grant must never widen with a schema change". In
`0032_network_disclosure_authorization.up.sql`, projections are:

- **migration-authored only** — the table comment states _"there is no runtime projection
  administration path, so every projection is reviewed before it can authorize anything"_;
- bound to **exactly one** `durable_schema_ref`, so _"a new payload schema version has NO projection
  until one is authored, which is what makes a new sensitive field fail closed instead of riding in
  on an old grant"_.

Entitlement has the identical hazard: a capability gaining new commands must not be authorized by
an entitlement issued before those commands existed. **Required change:** bind an entitlement
version to an exact capability version, and make widening require a reviewed migration — not a
runtime write. Without this, ENT-01 is rebuilt with a weaker control than one already shipped
next door.

### ENT-03 — Activation is global, not per-customer, and the two must not be confused

`module_states.yaml` governs _whether FreightOS may build/run a module at all_. A customer
activation record governs _whether one tenant may use an activated module_. These are different
gates and the stricter (global) must dominate. Nothing in v1.8.1 states that a per-customer
activation can never activate a module that is `implementation_allowed: false`. **Required
change:** state and test the precedence — global module state ∧ customer activation ∧ certification
∧ authority ∧ policy.

### ENT-04 — `network.integration.volume` is a metered capability with no meter

The pack meters "governed integration/network usage". `schemas/meter-event.schema.json` exists;
`meter_events` exists **only** in never-executed reference DDL (`db/reference/0004_billing.sql`,
whose provenance file records it has _zero_ `CREATE POLICY` statements and no `tenant_id` on
`invoice_lines`). Metering a network capability would be the first commercial construct to touch
network data, which is the most privacy-sensitive surface in the repository. Recorded as owner
decision **D-02**.

### ENT-05 — No fail-closed default is proven for absence of entitlement

REV-12 requires absence of a grant to fail closed. `config/policy/base_policy.yaml:2` sets
`default_decision: deny` — but the accepted W0/W1 audit records that this file is **read by
nothing** (`BASE_POLICY_PATH` exported at `packages/config/src/paths.ts:21`, zero importers). The
fail-closed default exists as a value in a YAML file that no code loads. `capabilities.ts` _does_
fail closed by construction for the runtime matrix, and is tested — that is the pattern to reuse.

## 5. Adversarial cases tested

| Case                                         | Result today                                                                               | Result if built as designed                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Entitlement grants a command                 | **impossible** — neither exists                                                            | prevented by conjunction, _if_ ENT-02 is enforced |
| Bundle silently expands scope                | **impossible** — no bundles                                                                | unproven; no expansion logic or test exists       |
| Entitlement survives capability version bump | n/a                                                                                        | **would occur** without ENT-02                    |
| Customer activation exceeds module state     | n/a                                                                                        | **would occur** without ENT-03                    |
| Commercial tier raises autonomy A3→A4        | **prevented** — `validate-scope.mjs:453` clamps at A3 regardless of product `autonomy_max` | prevented, same mechanism                         |

The last row is the one genuine enforcement that exists today, and it is strong: three products
declare `autonomy_max: A4` and the computed ceiling overrides all three.

## 6. Required changes

1. Entitlement version binds to an exact capability version; widening requires a reviewed migration
   (**ENT-02**, blocking — copy `network_disclosure_projections`).
2. Precedence rule: global module state dominates customer activation (**ENT-03**).
3. Fail-closed on absent entitlement, tested the way `capabilities.ts` is tested (**ENT-05**).
4. Do not implement metering until D-02 is answered (**ENT-04**).
