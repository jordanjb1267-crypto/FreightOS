# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Jev 422 Preserved Raw-Response Contract Diagnosis Result v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE ZERO-CALL DIAGNOSTIC RESULT — PASS

Subordinate to `STAGE_F_PHASE_W_TERMINAL_BLOCK_RESULT_v0.1`, `STAGE_F_PHASE_W_TERMINAL_LEDGER_FORENSIC_RESULT_v0.1`, all Stage-F receipt/evidence immutability controls, and all prior InterBraid / WorkforceOS / FreightOS / TypeSafe / Jev / authority / evidence / provenance / tenant-isolation / replay / provider-substitution boundaries.

## INPUT

The diagnostic consumed only the 160 already-persisted Jev raw HTTP 422 response bodies from `NSS1-STAGE-F-PROVIDER-SHADOW-v0.2`.

`NEW_PROVIDER_CALLS=0`

`NETWORK_CALLS=0`

`AUTHORITY_EFFECTS=NONE`

Diagnostic deployment: `d84dc0f1-9c1c-4796-b328-4b5a5deb3609`

Diagnostic result SHA-256: `98a84c74290457ab6f17f6c3b63c708cb718875c04305ba1477f392e8e152342`

## RAW-BODY CLOSURE

`RAW_BODY_COUNT=160`

`PARSE_FAILURES=0`

`RECEIPT_MISMATCHES=0`

`UNIQUE_EXACT_RAW_BODIES=1`

The single raw-body SHA-256 was:

`182ae391a702fc61da7d09532523035b0f7a200713f29c2556c711e42db2c638`

with count `160`.

`UNIQUE_VALIDATION_SCHEMA_CLASSES=1`

## EXACT VALIDATION FAILURE

Every response reported the same provider-side validation error on exactly four Noul question criteria fields:

- `questions.external_authority_required.noul.criteria`
- `questions.material_change.noul.criteria`
- `questions.need_exists.noul.criteria`
- `questions.relevance.noul.criteria`

For each, TypeSafe returned:

`type=model_attributes_type`

`msg=Input should be a valid dictionary or object to extract fields from`

The rejected inputs were the bare criterion strings supplied by the Stage-F adapter.

## FROZEN ADAPTER CAUSE

The frozen Stage-F adapter serialized Noul questions as:

`{ type: 'noul', instructions: q.instruction, criteria: q.condition }`

where `q.condition` was a string.

The current official TypeSafe OpenAPI defines `NoulQuestion.criteria`, when supplied, as a `NoulCriteria` object with optional `true` and `false` members, not as a bare string.

Therefore:

`STAGE_F_JEV_422_CAUSE=NOUL_CRITERIA_SERIALIZATION_CONTRACT_MISMATCH`

`FAILURE_SCOPE=REQUEST_VALIDATION_BEFORE_JEV_MODEL_EXECUTION`

`JEV_SEMANTIC_QUALITY_EVIDENCE_FROM_160_FAILED_REQUESTS=NONE`

The Stage-F Jev provider failure is not evidence that Jev produced incorrect semantic judgments; the provider rejected the requests before an effective model identity or semantic answer was returned.

## NON-IMPLICATED SURFACES

The preserved 422 bodies do not identify Choice or Score criteria as validation failures. This does not independently prove every non-Noul field is semantically optimal; it establishes only that the observed Stage-F provider rejection was triggered by the four Noul criteria values above.

## SUCCESSOR BOUNDARY

The frozen Stage-F candidate MUST NOT be repaired in place and MUST NOT replay its 160 failed Jev attempts.

A successor candidate may modify only the TypeSafe request-contract serialization necessary to conform to the current provider schema, while preserving the predecessor corpus, gold, QuestionSet meanings, routing matrix, provider identity, acceptance thresholds, authority boundaries, and evidence semantics unless separately frozen otherwise.

The successor must undergo a fresh zero-call contract preflight before any provider call.

`CONTROLLING_NEXT_TRANSITION=STAGE_F_JEV_REQUEST_CONTRACT_REMEDIATION_ZERO_CALL_PREFLIGHT`

`PROVIDER_REPLAY_OF_STAGE_F_LEDGER=PROHIBITED`

`SUCCESSOR_PROVIDER_EXECUTION=BLOCKED_PENDING_SEPARATE_PREFLIGHT_AND_AUTHORIZATION`

`PRODUCTION_PROMOTION=false`