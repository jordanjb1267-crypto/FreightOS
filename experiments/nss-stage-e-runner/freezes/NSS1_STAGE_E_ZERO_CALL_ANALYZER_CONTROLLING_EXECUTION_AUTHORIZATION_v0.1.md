# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Zero-Call Analyzer Controlling Execution Authorization v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE EXECUTION AUTHORIZATION — ACTIVE

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Receipt-Only Semantic / Work-Outcome Analysis Authorization v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Receipt-Only Analysis Ledger-Immutability & No-Replay Rule v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E 400-Receipt Provider Shadow Execution Result v0.1`, and all prior Stage-E / NSS / Semantic Computation Plane / TypeSafe-Jev / authority / evidence / provenance / provider-substitution / security / Pass20 assurance state.

## 1. Controlling executable operation

`CONTROLLING_EXECUTABLE_OPERATION=STAGE_E_ZERO_CALL_ANALYZER_OVER_VERIFIED_400_RECEIPT_CORPUS`

No other execution path may supersede this operation while Stage-E receipt-only reconciliation remains open.

The analyzer consumes only the already-verified Stage-E provider-shadow ledger.

## 2. Frozen input evidence

The exact immutable input ledger is bound by:

- Runner execution manifest SHA-256: `9b477dbb495d6aa3c890a4177efcbe35b18aa0e87691b1801aac135bebdea38b`
- Receipt Index SHA-256: `1e154c444c756171de34a705e63ad688d75a8f880da82abdba96c94a3022ebe3`
- Phase-W Result SHA-256: `4397c87037a5508ae6dc0eed12b1b29a4d66ed396b4ff2c1cd08163fefe8cbde`
- Phase-V Verification Result SHA-256: `dd0c40ff9d9ea622bf73671c4066d1816cab10d47ddb20ad45a64e9fff0641cc`
- Phase-V Freeze Pointer SHA-256: `761a91c8c6f1d3c6bd9acd9327ba2b96ba667caeda976d1b5ae25c02040b4d05`

Frozen receipt denominator:

- `TOTAL_RECEIPTS=400`
- `LUNA_RECEIPTS=240`
- `JEV_RECEIPTS=160`
- `OK_RECEIPTS=400`
- `FRESH_RECEIPTS=320`
- `STALE_RECEIPTS=80`

## 3. Zero-call rule

The analyzer MUST satisfy:

- `NEW_LUNA_CALLS=0`
- `NEW_JEV_CALLS=0`
- `NEW_OPENROUTER_CALLS=0`
- `NEW_FRONTIER_CALLS=0`
- `PROVIDER_REPLAY=PROHIBITED`
- `NETWORK_PROVIDER_EXECUTION=PROHIBITED`

The analyzer must fail closed if any code path attempts provider inference.

## 4. Ledger immutability

The analyzer MUST NOT modify:

- original provider attempts;
- normalized receipts;
- raw provider responses;
- receipt hashes;
- receipt index;
- provider identities;
- bound state hashes;
- QuestionSet bindings;
- freshness classifications;
- Phase-W write state;
- Phase-V verification result;
- Phase-V Freeze Pointer.

Derived analysis outputs must be written under a separate analysis namespace.

## 5. Required analytical joins

The analyzer may deterministically join each receipt to frozen:

- event identity;
- tenant / load / WorkObject identity;
- authoritative state hash;
- provider identity;
- QuestionSet;
- primitive/subtype;
- routing arm;
- consequence class;
- semantic gold where available;
- work/disposition gold where available;
- Need gold where available;
- freshness status;
- latency / usage / measured cost fields.

Any absent field must remain absent and be reported as not reconstructable rather than inferred.

## 6. Required primary outputs

Where supported by frozen evidence, the analyzer must compute:

1. semantic accuracy by provider;
2. semantic accuracy by primitive/subtype;
3. Luna-vs-Jev disagreement matrix;
4. fresh-vs-stale semantic quality;
5. control work/disposition accuracy;
6. routed-candidate work/disposition accuracy;
7. Need precision and recall;
8. false-safe rate;
9. false-escalation rate;
10. consequence-weighted error;
11. known-vs-novel family/subtype performance;
12. realized Luna suppression;
13. latency distribution by provider;
14. token usage by provider;
15. measured provider cost;
16. useful accepted work per Luna call;
17. useful accepted work per inference dollar;
18. explicit non-reconstructable metrics list.

## 7. Layer separation

The analyzer must preserve:

`RAW_PROVIDER_OUTPUT`

!=

`NORMALIZED_SEMANTIC_JUDGMENT`

!=

`DETERMINISTIC_COMPILATION`

!=

`WORK_OUTCOME`

!=

`AUTHORITY`.

No provider judgment may be treated as authoritative truth merely because its receipt passed integrity verification.

## 8. Freshness semantics

The 80 stale receipts remain valid historical provider observations but are not current-state applications.

Required invariant:

`MODEL_COMPLETION != CURRENT_TRUTH`.

The analyzer must report semantic quality separately from state applicability.

## 9. No policy repair

The analyzer may diagnose alternative routing, thresholds, compiler behavior, or safety rules, but any such alternative remains:

`DIAGNOSTIC_ONLY`.

The analyzer may not rewrite Stage-E routing or acceptance policy in place.

## 10. Analyzer closure condition

The executable gate closes only when the zero-call analyzer produces a complete, hash-bound derived result set over the frozen input ledger and confirms:

- zero provider calls;
- original ledger unchanged;
- denominators explicit;
- exclusions explicit;
- derived artifact hashes recorded;
- analysis result independently reproducible from frozen inputs.

Then:

`CONTROLLING_NEXT_TRANSITION=STAGE_E_ANALYSIS_RESULT_FREEZE`.

Until then:

`NEW_PROVIDER_EXECUTION=BLOCKED`.

## 11. Authority boundary

`AUTHORITY_EFFECTS=NONE`

`LIVE_EFFECTS=0`

`PRODUCTION_PROMOTION=false`

No live freight action, dispatch/booking, payment/value movement, production signing, or external-counterparty mutation is authorized.

## 12. Current state

`STAGE_E_EXECUTION_INTEGRITY=CLOSED_PASS`

`STAGE_E_ZERO_CALL_ANALYZER=AUTHORIZED`

`STAGE_E_ZERO_CALL_ANALYZER=CONTROLLING_EXECUTABLE_OPERATION`

`STAGE_E_ANALYSIS_RESULT=UNRESOLVED`

`NEW_PROVIDER_CALLS=0`

`PROVIDER_REPLAY=PROHIBITED`

`ORIGINAL_LEDGER_MUTATION=PROHIBITED`

`AUTHORITY_EFFECTS=NONE`
