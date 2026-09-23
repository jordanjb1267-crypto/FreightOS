# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Phase-W Terminal-Ledger Zero-Call Forensic Reconciliation Authorization v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE FORENSIC AUTHORIZATION — ACTIVE

Subordinate to `STAGE_F_PHASE_W_TERMINAL_BLOCK_RESULT_v0.1`, all prior Stage-F execution/receipt immutability controls, and all existing authority/evidence/provenance/tenant-isolation/replay/freshness/provider-substitution boundaries.

## AUTHORIZED OPERATION

`CONTROLLING_OPERATION=READ_ONLY_FORENSIC_RECONCILIATION_OF_EXACT_STAGE_F_400_RECEIPT_LEDGER`

Authorized inputs are only the already-persisted Stage-F Phase-W evidence under the exact terminal run and frozen predecessor artifacts.

Authorized outputs are derived forensic artifacts written separately from the original attempts/receipts/raw-response ledger.

## ZERO-PROVIDER BOUNDARY

`NEW_LUNA_CALLS=0`

`NEW_JEV_CALLS=0`

`NEW_OPENROUTER_CALLS=0`

`NEW_FRONTIER_CALLS=0`

`PROVIDER_REPLAY=PROHIBITED`

`MANUAL_PROVIDER_CALLS=PROHIBITED`

Any forensic executable must contain no reachable provider-call path and must fail closed if network/provider execution is attempted.

## ORIGINAL LEDGER IMMUTABILITY

The following are immutable forensic inputs:

- all 400 terminal receipts;
- all attempt records;
- all raw provider responses that were persisted;
- `RECEIPT_INDEX.json` with frozen SHA-256 `2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7`;
- Phase-W result;
- Stage-F corpus/gold/QuestionSet/provider-matrix/state bindings;
- provider identities and frozen runner manifests.

`ORIGINAL_LEDGER_MUTATION=PROHIBITED`

`RECEIPT_DELETION=PROHIBITED`

`RECEIPT_RECLASSIFICATION=PROHIBITED`

`DENOMINATOR_REPAIR=PROHIBITED`

## REQUIRED FORENSIC OUTPUTS

The analyzer must report, from frozen bytes only:

1. receipt count and status histogram by provider;
2. exact error histogram by provider;
3. requested/effective model identity distribution;
4. raw-response presence and raw-response hash verification;
5. receipt-file hash verification against the frozen receipt index;
6. bound-state SHA verification;
7. QuestionSet SHA verification;
8. attempt-to-receipt closure;
9. freshness/current-state-application fields;
10. latency/usage/cost fields where actually persisted;
11. whether the 160 non-OK receipts share one failure class or multiple classes;
12. whether the failure is attributable to transport, provider API contract, model identity, response parsing/normalization, or another evidence-supported category.

If any requested metric cannot be reconstructed from frozen evidence it must be emitted as `NOT_RECONSTRUCTABLE_FROM_FROZEN_EVIDENCE`.

## EXECUTION RULE

The forensic reader may run only after the terminal BLOCK above; that condition is satisfied.

It may replace the now-terminal execution service entrypoint only with a zero-provider reader after its source has been inspected to confirm no provider-call path.

It must not present any derived forensic result as a semantic PASS, architecture PASS, or production promotion.

## CLOSURE

The forensic gate closes only after a derived result is independently reproducible from the same frozen ledger and records explicit input/output hashes.

Until then:

`STAGE_F_PHASE_W_FORENSIC_RESULT=UNRESOLVED`

`PRODUCTION_PROMOTION=false`

`AUTHORITY_EFFECTS=NONE`