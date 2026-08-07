# Runbook — Kill switch

**Required by** `12_OBSERVABILITY_RELIABILITY_AND_RUNBOOKS.md:43`.
**Mechanism:** `kill_switches` table (migration 0004, extended by 0015),
`app.resolve_kill_switch_mode()`, and `resolveKillSwitch()` in
`packages/context/src/kill-switch.ts`.

## When to use this

- Suspected cross-tenant data exposure.
- An agent taking an action outside its authority.
- A policy or audit subsystem failure — Constitution Art. V.2 blocks autonomous execution on
  either, so engaging the switch makes the required posture explicit rather than implicit.
- An integration or provider causing repeated incorrect external effects.
- Any situation where a human needs to stop the system faster than a deploy.

## Authority

**Humans only.** Constitution Art. V.1 reserves kill-switch and override authority to humans, and
Art. X.6 forbids an agent changing its own autonomy ceiling. The database enforces this:
`kill_switches.engaged_by_type` accepts only `human` or `system`, so an insert naming an agent is
rejected outright. **From OQ-19 onward the same holds for release**: `released_by_type` carries the
same constraint, because an agent that cannot engage a switch but can release one has defeated the
control.

Scope determines who may engage:

| Scope                                                                | Who may engage                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `system`, `legal_plane`, `operating_context`                         | Control plane only — cross-tenant, so a tenant cannot set or clear it |
| `legal_entity`, `tenant`, `workflow`, `agent`, `tool`, `integration` | The owning tenant, or the control plane                               |

## Scopes

`legal_entity` and `operating_context` were added by OQ-19 (migrations 0014 and 0015). ADR-0019
requirement 7 names both as kill-switch targets, and neither existed before Phase 1 PR 2.

| Scope               | `scope_ref` holds                                    | Tenant-scoped? |
| ------------------- | ---------------------------------------------------- | -------------- |
| `system`            | nothing — `NULL`                                     | No             |
| `legal_plane`       | a `class:context` pair, e.g. `software_only:carrier` | No             |
| `operating_context` | one `app.operating_context` value                    | No             |
| `legal_entity`      | a legal-entity uuid                                  | Yes            |
| `tenant`            | a tenant uuid                                        | Yes            |
| `workflow`          | a workflow id                                        | Yes            |
| `agent`             | an agent id                                          | Yes            |
| `tool`              | a tool id                                            | Yes            |
| `integration`       | an integration id                                    | Yes            |

`operating_context` is cross-tenant because an operating context is a platform-wide surface:
suspending one suspends it everywhere. `legal_entity` is tenant-scoped because a legal entity
belongs to exactly one tenant. The shapes are enforced by `kill_switches_tenant_shape` and
`kill_switches_scope_ref_type`.

## The standing autonomous_mobility suspension

`0016_autonomous_mobility_standing_suspension` ships one switch **engaged**:
`operating_context` / `autonomous_mobility` / `suspended`, id
`f0000000-0000-4000-8000-00000000a119`.

ADR-0019 holds `autonomous_mobility` at a standing fail-closed suspension for all of Phase 1. The
enum value already exists in `app.operating_context`, so a code path can reach it; a standing switch
makes an accidental path fail closed rather than merely fail review.

**Do not release it.** Doing so requires a signed
`checklists/AUTONOMOUS_VEHICLE_ACTIVATION_GATE.md`, which is unsigned and Horizon 3 at the earliest.

## Modes, least to most restrictive

| Mode                      | Reads | Mutations | Autonomous execution | Communications | Financial | Human approval |
| ------------------------- | ----- | --------- | -------------------- | -------------- | --------- | -------------- |
| `enabled`                 | ✓     | ✓         | ✓                    | ✓              | ✓         | ✓              |
| `approval_only`           | ✓     | ✓         | ✗                    | ✓              | ✓         | ✓              |
| `autonomous_disabled`     | ✓     | ✓         | ✗                    | ✓              | ✓         | ✓              |
| `communications_disabled` | ✓     | ✓         | ✗                    | ✗              | ✓         | ✓              |
| `financial_disabled`      | ✓     | ✓         | ✗                    | ✗              | ✗         | ✓              |
| `read_only`               | ✓     | ✗         | ✗                    | ✗              | ✗         | ✗              |
| `suspended`               | ✗     | ✗         | ✗                    | ✗              | ✗         | ✗              |

## Precedence — read this before engaging

**The most restrictive mode across every applicable scope wins, regardless of how narrow the scope
that set it is.** A narrower switch can only ever tighten, never loosen.

This means a per-tool `enabled` cannot override a system-wide `suspended`. That direction is
deliberate: the opposite would make the system switch useless in exactly the incident it exists
for.

Consequence for responders: **to restore service you must release every switch that is
contributing**, not merely the narrowest one. `resolveKillSwitch()` returns `appliedBy`, ordered
most restrictive first — use it rather than guessing.

## Engage

Choose the narrowest scope that contains the problem. Reaching for `system` `suspended` when a
single agent is misbehaving stops every tenant.

```sql
INSERT INTO kill_switches
  (scope, scope_ref, tenant_id, mode, reason, engaged_by_type, engaged_by, created_by)
VALUES
  ('agent', 'dispatch-agent', '<tenant-uuid>', 'autonomous_disabled',
   'INC-1234: dispatch agent proposing assignments outside carrier appointment',
   'human', 'user:jordan', 'user:jordan');
```

`reason` is mandatory and non-empty. It is the incident record.

At most one active switch may exist per subject — a partial unique index enforces it. A second
insert for the same subject fails rather than creating two rows that disagree about what is in
force. To change mode, release the existing switch and engage a new one.

## Verify

```sql
SELECT app.resolve_kill_switch_mode(
  p_tenant_id => '<tenant-uuid>',
  p_agent_id  => 'dispatch-agent'
);
```

Confirm the returned mode is the one you intended, and confirm the affected behaviour has actually
stopped. A mode in the table is not evidence; observed cessation is.

## Release

Switches are **released, never deleted** — `DELETE` is rejected by trigger so the incident record
survives.

```sql
UPDATE kill_switches
SET released_at = now(), released_by = 'user:jordan', released_by_type = 'human'
WHERE scope = 'agent' AND scope_ref = 'dispatch-agent' AND released_at IS NULL;
```

All three release columns move together — `kill_switches_release_consistency` rejects any subset —
and `released_by_type` accepts only `human` or `system`.

Re-run the resolution query afterwards. If the mode has not returned to `enabled`, another switch
is still contributing — check `appliedBy`.

## Evidence to capture

- Incident identifier, and the `reason` recorded on each switch.
- Time engaged, time released, and who did each.
- The resolved mode before, during, and after.
- What stopped, and what confirmed it stopped.
- Whether any in-flight work was interrupted, and how it was reconciled.

## Known gap

Phase 0 delivers the durable record, the semantics, and the precedence rule. Phase 1 PR 2 adds two
scopes and symmetric release authority. **What neither delivers is enforcement at the point of
action** — no command handler consults `resolve_kill_switch_mode()`, because no consequential
command exists until Phase 3. Engaging a switch today records intent and is queryable; it does not
by itself halt a workflow.

That is unchanged by OQ-19, and saying so is the point: PR 2 widened what a switch can _target_, not
what a switch _does_. Wiring the check into the command path, and testing that it halts in-flight
Temporal workflows, is Phase 3 scope and a precondition of the Horizon 1 stop gate — Phase 0
carry-forward item 1, OQ-14, P-17.
