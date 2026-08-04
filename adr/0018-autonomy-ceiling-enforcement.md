# ADR-0018 — Autonomy ceilings are computed, never configured

**Status:** Accepted (owner ruling, Phase 0)
**Closes:** audit findings G4, G5

## Context

Two machine-readable files disagree about how autonomous a carrier agent may be.

`config/agents/registry.yaml` grants `max_autonomy: A4` to 13 of 32 agents, 7 of them on the
carrier plane: `chief-dispatch-orchestrator`, `negotiation-agent`, `dispatch-agent`,
`tracking-agent`, `exception-agent`, `documentation-agent`, `autonomous-mission-orchestrator`.

Against that:

- `config/scope/module_states.yaml:52` — `carrier_copilot.autonomy_max: A3`
- `config/scope/module_states.yaml:97` — `AUTONOMOUS_DISPATCH_A4_ENABLED: false`
- `21_…:36` — "A0–A2 and selected A3 workflows"
- `13_…:31` — "Autonomy: selected A3 only."

`02_GOVERNANCE_AND_NON_REGRESSION.md:97` resolves prose-versus-configuration conflicts by taking
the stricter reading — but here **both sides are configuration**, so that rule does not apply. A
loader that trusts the agent registry ships A4 dispatch inside Horizon 1.

Separately, the registry cannot validate against its own schema: entries carry four keys
(`id`, `max_autonomy`, `planes`, `prohibited`) where `agent-manifest.schema.json` requires ten, two
of them under different names.

## Decision

**An agent's effective ceiling is computed, and the registry value is only ever an input to a
minimum.** There is no code path — registry value, default, fallback, configuration merge, or model
output — that raises it.

```
effectiveMaximumAutonomy(agent) =
    min( agent.maximum_autonomy,
         moduleCeiling(agent),
         horizonCeiling() )
```

- `moduleCeiling` — from `module_states.yaml`. A module that is not `ACTIVE_BUILD` or
  `FOUNDATION_ONLY` in the authorized horizon yields **A0**: an agent belonging to a deferred
  module is observe-only, because the module itself is not built.
- `horizonCeiling` — **A3** while `horizon_authorized: 1`. This is the backstop that holds even if
  a module entry is edited.
- `min` is over the ordered ladder A0 < A1 < A2 < A3 < A4 < A5.

Three properties follow, and all three are tested:

1. Every carrier agent resolves to **A3 or lower**, whatever the registry says.
2. Every deferred-module agent resolves to **A0**.
3. The function is monotonic — no input combination produces a result above any single ceiling.

`scripts/validate-scope.mjs` asserts all three in CI and fails the build otherwise. The check reads
the registry as data; it does not trust it.

### Registry / schema reconciliation

The root `config/agents/registry.yaml` is regenerated to satisfy the manifest schema, and the root
`schemas/agent-manifest.schema.json` is corrected to ADR-0015's legal model. Both are declared
overrides in `handoff-provenance.json` citing this ADR and ADR-0015.

| Handoff field | Root field |
|---|---|
| `max_autonomy` | `maximum_autonomy` |
| `prohibited` | `prohibited_actions` |
| `planes` | `legal_authority_class` + `operating_context` (ADR-0015 mapping) |

`allowed_tools` is present and empty for every agent. Empty is the honest value: no tool registry
exists yet, and `14_…:31` requires that agents cannot call unlisted tools. An empty allowlist means
**no tool may be called**, which is the correct Phase 0 posture — tools arrive in Phase 2 with
their parameter and return schemas. `evaluation_suite` names the file each agent's evaluations will
occupy; those files are Phase 2 deliverables and their absence is asserted, not hidden.

## Consequences

**Good.** The A4 conflict cannot ship, and it cannot be reintroduced by editing configuration —
raising the ceiling requires editing the ceiling function itself, which is reviewed code covered by
tests. Constitution Art. X.6 ("no agent may change its own autonomy ceiling") becomes structurally
true rather than aspirational.

**Cost.** The registry's `maximum_autonomy` values are now aspirational future ceilings rather than
live grants, which is mildly counter-intuitive when reading the file alone. Each entry therefore
carries a comment pointing at this ADR, and the computed value is what every consumer sees.
