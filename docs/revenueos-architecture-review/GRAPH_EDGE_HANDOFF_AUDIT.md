# Graph Edge & Handoff Audit

Typed edges, artifact contracts, sender/receiver validation, authority checks, and stale
invalidation across 185 edges in 36 graphs.

## 1. Verdict

**Edge typing is complete and authority checking is sparse.** Every edge carries a typed artifact —
a genuine strength — but 74% carry no authority check, and stale invalidation is prose in a data
field.

## 2. What passes

| Check                                                                 | Result                                        |
| --------------------------------------------------------------------- | --------------------------------------------- |
| Edges with a typed `artifact`                                         | **185 / 185**                                 |
| Edges missing a schema-required field                                 | **0**                                         |
| Edges referencing an undefined `from`/`to` node                       | **0**                                         |
| `authority_check` drawn from an enumerated vocabulary (not free text) | **25 distinct values**, all short identifiers |
| Invariant _"free-form text never grants authority"_                   | 36 / 36 graphs                                |

GR-05 (typed edges) and GR-17 (no free-form authority) both PASS on this evidence. The authority
vocabulary is a controlled enumeration — `operational_policy`, `discount_authority`,
`fact_authority_binding`, `source_rights`, `seller_send_authority`, `commission_policy`,
`participant_disclosure_approval`, `receiver_independent_authority`, and 17 others. That is the
right shape for H7.

## 3. GE-01 — 137 of 185 edges carry `authority_check: none`

| `authority_check`                 |         Edges |
| --------------------------------- | ------------: |
| `none`                            | **137 (74%)** |
| `operational_policy`              |            14 |
| `human_or_service_approval`       |             7 |
| `customer_configuration_approval` |             3 |
| `fact_authority_binding`          |             3 |
| `disclosure_policy`               |             2 |
| 19 further values                 |        1 each |

74% is not automatically wrong — an edge between two non-side-effecting analytical states needs no
authority check. The concern is that **the distribution is not justified anywhere**: no artifact
states which edge classes require a check, so "none" cannot be distinguished from "not yet decided".

Cross-check against side effects: 21 nodes carry a non-`none` `side_effect_class`, and 48 edges
carry an authority check. The gated nodes do appear to be covered — every `logistics_command`,
`external_commercial_offer`, `financial_record`, `external_system_write` and
`integration_configuration` node is entered through a checked edge. **The gating is present where it
matters.** What is missing is the rule that makes that non-accidental.

**Required change:** state the rule — _every edge entering a node whose `side_effect_class` is not
`none` must carry a non-`none` `authority_check`_ — and add a validator. That rule is satisfiable
today with no graph changes, which is the best kind of control to add.

## 4. GE-02 — No receiver-side validation field exists (GR-06)

The schema's edge shape is `from, to, artifact, guard, authority_check, stale_invalidation`. There
is no field expressing what the **receiving** node validates on arrival. v1.4/v1.7 network doctrine
and the accepted repository both require independent receiver validation — the repository
implements it: `network_disclosure_inbox` (`0034`) and the disclosure authority machinery force the
receiver to evaluate independently, and TWIN-G09 correctly names
`receiver_independent_authority` as an authority check.

But at the schema level, an edge is a sender-side declaration only. **Required change:** add
`receiver_validation` to the edge contract. GR-06 scores PARTIAL.

## 5. GE-03 — `stale_invalidation` is one identical string on 185 edges

Every edge in the package carries:

```
"stale_invalidation": "on material input/version change"
```

**One distinct value across 185 edges.** "Material" is undefined; there is no version reference, no
input list, and nothing to evaluate. This is prose occupying a data field — the exact pattern
GR-17's invariant warns against, applied to invalidation rather than authority.

Consequences: GR-11 (stale invalidation) PARTIAL; REV-21 (proposal edits invalidate stale
approvals) NOT_IMPLEMENTED; TW-19 (approval binds exact proposal/version/scope) PARTIAL.

The repository already solved this precisely. In `0032_network_disclosure_authorization.up.sql`,
a projection binds to **exactly one** `durable_schema_ref`, so a new payload version has no
projection and _"a new sensitive field fail[s] closed instead of riding in on an old grant"_.
Staleness there is a structural consequence of version binding, not a sentence. **Required change:**
bind edge artifacts to an exact artifact schema version and derive invalidation from version
mismatch.

## 6. GE-04 — Guards are mostly `true`

Guards use a small controlled vocabulary — `true`, `decision=ALLOW`,
`decision=APPROVAL_REQUIRED`, `approved=true`, and similar. The decisive guards are present exactly
where they should be (the XPL command path, discount authority, disclosure approval). Unconditional
`true` guards dominate the analytical edges, consistent with §3.

## 7. GE-05 — Typed artifact registry is unbound

`graphs/TYPED_ARTIFACT_REGISTRY.json` and `schemas/graph-handoff-envelope.schema.json` /
`graph-workunit-envelope.schema.json` define the artifact contracts. Nothing validates that an
edge's `artifact` string resolves to a registry entry, and no runtime carries the envelope.
**Required change:** validator asserting every edge `artifact` resolves to a registered typed
artifact with a version.

## 8. Handoff acceptance is not modelled

The accepted v1.8 WorkUnit model (`03_WORK_UNIT_AND_RESPONSIBILITY_MODEL.md`) defines
`UNASSIGNED → OWNED → HANDOFF_PENDING → OWNED_BY_NEXT → COMPLETE`, and W0/W1 Part E records the
requirement for _"explicit accept/reject with a required acceptance state and sender retention until
acceptance"_.

**No graph edge models handoff acceptance.** Edges transition directly from one owner's node to the
next owner's node, with no pending/accepted intermediate and no sender retention. A handoff that the
receiver never accepts is indistinguishable from one that succeeded. This is the mechanism by which
a WorkUnit becomes ownerless mid-flight, and it is why GN-02's undefined `HOLD` matters so much —
there is no other place for a rejected handoff to go. Conflict **C-11**.

## 9. Required changes

1. Rule + validator: every edge into a side-effecting node carries an authority check
   (**GE-01** — satisfiable today without graph edits).
2. Add `receiver_validation` to the edge contract (**GE-02**).
3. Replace the uniform `stale_invalidation` string with artifact-version binding, reusing the
   `network_disclosure_projections` pattern (**GE-03**, blocking).
4. Model handoff acceptance per the accepted v1.8 WorkUnit lifecycle (**C-11**, blocking).
5. Validator binding edge `artifact` to the typed artifact registry (**GE-05**).
