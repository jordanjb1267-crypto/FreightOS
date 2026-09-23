# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Pre-Receipt Execution Manifest & Provider Runner Preflight Authorization v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE EXECUTION-PREFLIGHT AUTHORIZATION — ZERO RECEIPTS / ZERO PROVIDER CALLS

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Fresh Gold-Bearing Concurrent Zero-Call Preflight Result v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Fresh Gold-Bearing Concurrent Semantic / Work-Outcome Confirmatory Authorization v0.1`, the completed Stage-E receipt-only analysis result, and all prior NSS / Semantic Computation Plane / TypeSafe-Jev / WorkforceOS / InterBraid authority / evidence / provenance / tenant-isolation / provider-substitution / security / Pass20 assurance state.

## 1. Purpose

Authorize construction and execution of exactly one zero-receipt preflight that binds the eventual Stage-F provider runner to the exact independently verified Stage-F evidence package, provider identities, provider matrix, semantic/work gold, metric definitions, acceptance gates, freshness semantics, authority boundary, and evidence-integrity rules.

This authorization does NOT authorize provider receipt #1.

## 2. Controlling verified evidence package

GitHub Actions verified artifact:

- workflow run: `35810974285`
- artifact ID: `10729029512`
- artifact name: `nss-stage-f-verified-evidence`
- archive SHA-256: `b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8`

Exact inner evidence identities:

- Artifact Index: `93ade59996340f91a2d5ca9ba4a95273b6c4b2b0bafc9ab2ab2bf82b7016c6b8`
- Stage-F verification result: `5ce0fe75671232b2be18baa63078fc0f22bd550c6dda2648b1668fe67d0e69f5`
- Stage-F Freeze Pointer: `e5c179dfb80a911225538d19f60ba71c006fb1fb61b6c8bc58711a94e6c6b1c5`
- events: `1fe85f6a8d2bb5f89597d75ad4f5861a4a839b1c04e56b56fd3d7aa27193ea24`
- state snapshots: `89ec348ea6ef1087fe905f230c6ffc069f76e1599221edde20800cc940dccff7`
- initial states: `511aae40a7e17562df0ff7fbc12404130597b6f8af9b9baae5d64970a192b0c4`
- semantic attempts: `bd878169d903942d7e0d1cc45f6ac7941303896399486ccd7d02edfb691145f9`
- QuestionSet: `0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb`
- provider matrix: `8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8`
- semantic gold: `72cadf0a6286c77630519ae505363d59cc0b78f07f5691afaba90bc11aff16ec`
- Need gold: `863451a33a17578694139c34159ce0059d005d1fa670f6a4f9c1a3c107bd81a2`
- work/disposition gold: `adf958371a3735959a305d2dcdb5ba04dac40f52197da998f1c4663ccd255cdf`
- consequence-class gold: `4ade0ab7822d4f19d07e598d53f335a534577befbbf1417a8daf2b035562b07d`
- consequence weights: `02852e77dfd19d582bbe001ed8d803616ad9640800b6e9dbefae914c9f7e62aa`
- known/novel classification: `7bc0a5665739b20cf0c240635fd2ce7eb9686f55af577336ed4e0fea213e7984`
- freshness gold: `c2c9c6b092e80c745b74493682f8934c1b6f10ba7bf90718066797f57ca11a31`
- authority expectations: `21bd90921881cc8b0082062835db997489a11585ab0655661d3b7b786591e7d5`
- reconciliation expectations: `0cef87523c54bc67e06efb68e5362ee5e8bf496e070904baf5d4930058cac57c`
- metric specification: `0363e563b8a621bcf28b487737f13bc6620ddb1ea7465f46b4f3a5dbd35a1fc4`
- acceptance gates: `aa121991d20f06c301f65e263bf3bca692142e7929ecc8c854fdfbb0bbf24efb`

A hash without the corresponding retained bytes is not sufficient.

## 3. Frozen denominator and provider schedule

Preflight must reproduce exactly:

- total events: `320`
- semantic provider-eligible events: `240`
- deterministic/code-only events: `80`
- KNOWN semantic events: `160`
- NOVEL semantic events: `80`
- fresh semantic completions: `160`
- stale/reject-at-frozen-completion semantic completions: `80`
- control Luna observations: `240`
- candidate Jev observations: `160`
- candidate Luna observations: `80`
- distinct provider attempts after shared-Luna deduplication: `400`
- planned candidate Luna suppression: `66.6666666667%`

For the 80 events where control and candidate both select Luna, exactly one canonical Luna observation is shared.

## 4. Provider identities

Freeze provider identities for this candidate:

### Luna

- provider: OpenAI Responses API
- requested model: `gpt-5.6-luna`
- required effective model: `gpt-5.6-luna`

### Jev

- provider: TypeSafe System One
- requested model: `jev-latest`
- required effective model: `jev-1.13.0`

The runner may not silently substitute a provider or effective model. Any model-identity mismatch is terminal evidence for that attempt and cannot be treated as a successful receipt.

OpenRouter and frontier providers remain outside this candidate.

## 5. Typed semantic contract

The runner must preserve the frozen QuestionSet primitive meaning:

- Noul: probabilistic yes/no proposition; typed probability is not truth.
- Choice: one option from the frozen finite option set.
- Score: graded severity judgment against the frozen ordered 0–4 scale.

Known rules, state transitions, freshness, authority, duplicate suppression, retry policy, evidence persistence, and application decisions remain deterministic code concerns. Model output may not create or expand authority.

Independent questions over the same state may be batched, but question meaning may not change after this preflight.

## 6. Preflight-only execution mode

The preflight runner MUST:

- run only with `RUN_MODE=preflight`;
- reject any execute mode;
- replace or interpose network fetch so provider calls fail closed;
- not read `OPENAI_API_KEY`;
- not read `TYPESAFE_API_KEY`;
- not read OpenRouter or frontier credentials;
- write zero provider attempts;
- write zero provider receipts;
- write zero raw provider responses;
- report `PROVIDER_CALLS=0`.

The repository may contain provider adapter and execution-source code so the exact executable surface can be content-addressed. That code must remain unreachable during this gate.

## 7. Execute-capable boundary

The execution source MUST require a separate authorization artifact before any provider call. Absence, mismatch, or malformed authorization MUST fail closed before credentials are read.

The future authorization artifact must bind at least:

- this runner execution-manifest SHA-256;
- this preflight Freeze Pointer SHA-256;
- the exact verified Stage-F evidence archive/root identities;
- provider identities;
- receipt denominator;
- execution mode;
- authority boundary.

No environment-variable-only bypass is sufficient.

## 8. Evidence semantics for future execution

The bound runner must preserve:

- attempt record persisted before provider call;
- raw response persisted before normalized receipt finalization;
- raw response SHA-256 in terminal receipt;
- terminal receipt required for every successful/failed provider attempt;
- STARTED-without-terminal => `ORCHESTRATION_UNCERTAIN`;
- automatic replay of an uncertain attempt prohibited;
- post-hoc provider replay prohibited as evidence reconstruction;
- stale semantic receipt retained as historical evidence but rejected from current-state application;
- independent reread/recomputation before any architecture verdict.

## 9. Frozen quality gates

The runner manifest must bind without modification to the already frozen Stage-F gates:

- control provider executability: `100%`
- candidate provider executability: `100%`
- state-binding integrity: `100%`
- cross-tenant contamination: `0`
- stale current-state applications: `0`
- candidate Luna suppression: `>=50%`
- work-disposition exact-accuracy delta vs control: `>= -5pp`
- false-safe-rate delta vs control: `<= +2pp`
- Need-recall delta vs control: `>= -5pp`
- C4 false-safe events: `0`
- authority effects: `NONE`

No post-receipt relaxation is authorized.

## 10. Preflight PASS requirements

This gate passes only if an independently verified preflight proves all of the following:

1. exact Stage-F verified archive digest matches;
2. all controlling inner evidence hashes match;
3. denominator and 240/80/160 provider schedule match;
4. 240 semantic attempts join one-to-one with semantic, Need, work, consequence, novelty, freshness, authority, and reconciliation evidence;
5. every provider-matrix event joins exactly one semantic attempt;
6. provider identities are exact;
7. metric and acceptance-gate hashes are exact;
8. execute-capable source identities are content-addressed;
9. provider attempts = `0`;
10. provider receipts = `0`;
11. raw provider responses = `0`;
12. provider calls = `0`;
13. authority effects = `NONE`;
14. independent Phase-V verification returns PASS.

## 11. Prohibited

This authorization does not permit:

- Luna calls;
- Jev calls;
- OpenRouter/frontier calls;
- production use;
- live customer data;
- live freight effects;
- dispatch/booking/brokerage;
- payment/value movement;
- custody/financing/credit;
- external-counterparty mutation;
- production signing or credential use;
- authority expansion.

## 12. Current state

`STAGE_F_PRE_RECEIPT_RUNNER_PREFLIGHT=AUTHORIZED`

`PROVIDER_CALLS_AUTHORIZED=0`

`PROVIDER_RECEIPTS_AUTHORIZED=0`

`AUTHORITY_EFFECTS=NONE`

`PRODUCTION_PROMOTION=false`

## 13. Controlling next transition

`CONTROLLING_NEXT_TRANSITION=STAGE_F_PRE_RECEIPT_EXECUTION_MANIFEST_AND_PROVIDER_RUNNER_PREFLIGHT_EXECUTION`

Only an independently verified PASS of that exact gate may make a separate Stage-F provider-shadow execution authorization eligible for consideration.