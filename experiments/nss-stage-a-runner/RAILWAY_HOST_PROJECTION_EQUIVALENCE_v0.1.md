# InterBraid NSS-1 Stage-A — Railway Host-Projection Equivalence v0.1

**Effective:** 2026-09-22  
**Status:** additive execution-substrate projection freeze; no provider receipts exist.

This artifact does **not** replace the previously frozen NSS-1 Stage-A source-plan hashes. It records the deterministic serialization produced by the Railway Node host adapter after proving that the canonical C001 corpus and every state transition are unchanged.

## Source-plan anchors preserved

- C001 Freeze Pointer: `771ca973ea559c8c3ddcbad0496cbe7e979a5a27df56fb22340576065df86d6c`
- C001 corpus: `5213178f40142b6673ebe0438b8e7a7651ab12639e399a8af97deb3ddff54b63`
- Source-plan state materialization: `ed020ff686ec96a304b45fffdae09ba8284f99dc25a276f02de12df83cc9a9a5`
- Source-plan semantic gold: `00fa3c4514f95c00c81ae3aefb1dd8fdcc42e56acc4b931edc9190350a08ec21`
- Source-plan routing overlay: `d5656fb63712913848ef455a368f06be130d3ce449d47ac65a52e7576316290f`
- Source-plan execution manifest: `3e06aff7c0347ea505b668b19e01407d00777773d1ef5e602c64ce6260dba1c1`
- Source-plan materialized overlay: `143c9caac499dc7d3fbbe5437eb7a7d7a3c4cdaa6337457f0e7ea64240ea18f3`

The exact byte preimages for the five additive NSS-1 overlay hashes above were not separately retained. They remain historical identity anchors and are not rewritten.

## Railway projection preflight

Deployment `79d1a929-ed5a-493b-811a-dea3a6d50337` executed with no provider secrets and `provider_receipts=0`.

It established:

- `event_count=320`
- `gold_count=320`
- `semantic_event_count=208`
- `deterministic_event_count=112`
- `pre_event_state_snapshot_match=320/320`
- `successor_state_match=320/320`
- `state_mismatches=0`
- canonical C001 corpus digest matched exactly.

The independently serialized Railway projection produced:

- Railway state materialization: `3154bcd6c8d690b6cb02206d13e5067a447587a569fef5cc6b503d0451557a19`
- Railway semantic gold: `7213edc1a5b043663f8a14ccd0bb9479199007462c4ed850b52c8607449ba79d`
- Railway routing overlay: `93047beb520fd8d500f021efe92188f7eec8d66db0ff4a0967aaa1f368b0d244`
- Railway execution manifest: `d0c9436d02bf121d378d241276ce8cdc2c56b38ca9bcdbefa77084c4d3404fbd`
- Railway materialized overlay: `0b3296bdf670124b9442c75fcfebb4c982d7f7c564d44dd64e440462979dfe43`

## Equivalence invariants

The Railway projection is eligible only while all of the following remain unchanged from the source plan:

1. C001 corpus SHA-256 and 320-event denominator.
2. 320/320 pre-state and successor-state reconstruction.
3. 208 semantic events and 112 deterministic/code-only events.
4. The thirteen semantic event families and their frozen gold values.
5. The complete Noul/Choice/Score QuestionSet plus `work_response_class`.
6. Score acceptance ranges.
7. Authority override and semantic-conflict escalation rules.
8. Arm A = 208 Luna full-QuestionSet calls.
9. Arm B = 208 Jev full-QuestionSet calls.
10. Arm C = 208 Jev calls and 144 Luna calls under the pre-registered primitive/consequence split.
11. Frontier calls = 0; OpenRouter calls = 0.
12. Requested provider identities remain `gpt-5.6-luna` and `jev-latest`; Jev effective-model gate remains `jev-1.13.0`.
13. No live freight/economic effect and no authority expansion.

If any semantic invariant changes, this equivalence freeze is void and a new NSS-1 candidate is required.

## Receipt-1 rule

At the time of this freeze, `PROVIDER_RECEIPTS=0`. After the first provider attempt, neither source-plan semantics nor Railway host-projection serialization may change in-place.
