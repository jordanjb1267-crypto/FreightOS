# ADR-0015 — Legal authority class and operating context

**Status:** Accepted (owner ruling, Phase 0)
**Supersedes in practice:** the single `authority_mode` dimension used by ADR-0003 and `db/0001`
**Closes:** audit findings G6, G7, G15 — and the Phase 0 exit condition "legal-plane ambiguity resolved"

## Context

`authority_mode` was doing three incompatible jobs at once: naming the legal plane, naming the
operational surface, and acting as an RLS discriminator and kill-switch scope.

Evidence of the collapse:

- ADR-0003 is titled *two legal planes*; the enum has five values.
- `db/0001_identity_authority.sql:3` creates `('carrier_agent','brokerage','shipper_owned')`;
  `db/0005:1-2` adds `facility_operator` and `autonomous_mobility`.
- `09_AUTONOMY_POLICY_AND_AUTHORITY.md:41-47` defines boundary rules for exactly two of the five.
  `shipper_owned`, `facility_operator`, and `autonomous_mobility` have no legal semantics at all.
- `schemas/event-envelope.schema.json` accepts only three values with `additionalProperties: false`,
  so custody events recorded by a facility operator — a Horizon 1 primitive — cannot be enveloped.

"Operating a facility" is not a legal authority. Conflating them means a facility workflow appears
to carry a regulatory posture it does not have, and the brokerage boundary becomes one enum value
away from an operational one.

## Decision

Split the concept into two independent dimensions.

### `legal_authority_class` — the regulatory posture FreightOS acts under

| Value | Meaning | Requirement |
|---|---|---|
| `software_only` | No transportation authority is exercised. Covers non-brokerage shipper, facility, autonomous-mobility, and internal system workflows. | None beyond tenant context. |
| `carrier_agent` | Acting for one appointed motor carrier. | A specific carrier **and** a valid written appointment. Cross-carrier allocation is impossible by construction. |
| `brokerage` | Acting as a licensed broker. | The complete brokerage legal gate, signed. **Fail-closed and disabled throughout Horizon 1.** |

### `operating_context` — the operational surface the work happens on

`system` · `carrier` · `shipper_owned` · `facility_operator` · `autonomous_mobility` · `brokerage`

### Rules

1. `software_only` covers non-brokerage shipper, facility, autonomous-mobility, and internal system
   workflows.
2. `carrier_agent` requires a specific carrier and a valid written appointment.
3. `brokerage` requires the complete brokerage legal gate. It is rejected unconditionally while
   `BROKERAGE_EXECUTION_ENABLED` is false — which is a mandatory default, not a tunable.
4. System-scoped audit and kill-switch events may omit `legal_entity_id` **only** when an explicit
   system scope and an authorized actor are both present. This is enforced by a JSON Schema
   conditional and a database `CHECK`, not by convention.
5. **RLS and policy evaluation must not treat operating context as a substitute for legal
   authority.** Operating context never widens permission. Where the two disagree, the legal class
   governs.
6. Not every pairing is legal. The permitted combinations are enumerated and enforced:

   | `legal_authority_class` | permitted `operating_context` |
   |---|---|
   | `software_only` | `system`, `shipper_owned`, `facility_operator`, `autonomous_mobility` |
   | `carrier_agent` | `carrier` |
   | `brokerage` | `brokerage` |

   `carrier_agent` + `brokerage` is the pairing that would breach the two-plane separation, and it
   is unrepresentable.

### Migration from `authority_mode`

| Old single value | `legal_authority_class` | `operating_context` |
|---|---|---|
| `carrier_agent` | `carrier_agent` | `carrier` |
| `brokerage` | `brokerage` | `brokerage` |
| `shipper_owned` | `software_only` | `shipper_owned` |
| `facility_operator` | `software_only` | `facility_operator` |
| `autonomous_mobility` | `software_only` | `autonomous_mobility` |

The mapping is total and lossless in both directions for existing values, so the reference DDL in
`db/reference/` remains readable against this model.

## Consequences

**Good.** The brokerage boundary is now a legal dimension that cannot be crossed by adding an
operational surface. Facility and AV events become expressible without weakening the legal model.
`legal_entity_id` optionality is bounded to a single, checkable case instead of being generally
nullable. Article I.2 ("missing or inconsistent legal context fails closed") becomes enforceable,
because "inconsistent" is now a defined predicate over the pair.

**Cost.** Two columns instead of one on every tenant-owned record, and two generated root artifacts
diverge from the handoff — `schemas/event-envelope.schema.json` and `config/agents/registry.yaml`.
Both are declared overrides in `handoff-provenance.json` citing this ADR, so the divergence is
reviewed rather than silent.

**Deferred.** The reference DDL under `db/reference/` is unchanged and still uses `authority_mode`;
it is never executed (ADR-0017). Phase 1 domain tables adopt the two-column model directly.
