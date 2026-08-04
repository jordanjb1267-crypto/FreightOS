# Policy Registry

Required by `02_GOVERNANCE_AND_NON_REGRESSION.md:5-17`. Did not exist before Phase 0.

`config/policy/base_policy.yaml` is one policy pack, not a registry. This is the registry.

## Registered packs

| Pack          | Version | Source                                                       | Status |
| ------------- | ------- | ------------------------------------------------------------ | ------ |
| `base_policy` | 1.2.0   | `config/policy/base_policy.yaml` (verbatim from the handoff) | Active |

## What `base_policy` actually contains

- `default_decision: deny` — fail-closed, implementing Constitution Art. I.2.
- `autonomy_levels` — the A0–A5 ladder as a flat list.
- `red_actions` — 32 entries in three clusters: commercial/legal, physical-safety, and governance
  self-promotion.
- `required_context` — `tenant_id`, `organization_node_id`, `legal_entity_id`, `authority_mode`,
  `actor_id`, `action`.
- `absolute_prohibitions` — 7 entries that no policy, approval, or flag may grant.

## Known gaps, carried forward

These are recorded rather than quietly worked around. None blocks Phase 0, and each blocks a
later phase.

1. **It contains vocabularies, not rules.** Nothing maps action → required autonomy → approver →
   exposure threshold. A policy engine cannot be built from this alone. _Blocks Phase 2._
2. **`required_context` omits half of what `09_…:26` requires** in a policy request: exposure,
   risk, freshness, confidence, and requested autonomy are all absent. _Blocks Phase 2._
3. **It still uses `authority_mode`**, the single dimension ADR-0015 replaced. A Phase 2 policy
   pack must adopt `legal_authority_class` + `operating_context`. Until then, the mapping in
   `packages/context/src/legal.ts` (`fromAuthorityMode`) is the bridge.
4. **Only the Red risk class is encoded.** `09_…:11-17` defines Green and Yellow too, and Phase 3
   authorizes A3 over exactly the Yellow set — which does not exist in configuration.
5. **Two red actions from `09_…:21` have no entry**: "accept exceptional high-value cargo" and
   "override compliance".
6. **No kill-switch action exists in `red_actions`**, although Art. V.1 reserves kill-switch
   authority to humans. Phase 0 enforces this in the database instead
   (`kill_switches.engaged_by_type` rejects an agent), which is stronger, but the policy layer
   should agree.
7. **Action vocabulary collision.** `config/agents/registry.yaml` uses roughly 27 action strings
   that do not appear in `base_policy.yaml`, and two that collide under different names
   (`contract.amend` vs `contract.materially_amend`; `policy.change` vs `autonomy_policy.change`).
   **No canonical action registry exists.** _Blocks Phase 2._

## Change control

`02_…:31-39` requires architecture review for any policy-interface change. A new or amended pack
requires: a version bump, an ADR if the interface changes, tests proving no previously denied
action becomes permitted, and a reviewed PR. Policy version is recorded on every decision and
carried on the event envelope as `policyversion`.
