# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Jev Request-Contract Remediation Zero-Call Preflight Authorization v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE SUCCESSOR PREFLIGHT AUTHORIZATION — ZERO PROVIDER CALLS

Subordinate to `STAGE_F_JEV_422_PRESERVED_RAW_RESPONSE_CONTRACT_DIAGNOSIS_RESULT_v0.1`, the immutable Stage-F Phase-W BLOCK ledger and all prior TypeSafe/Jev, authority, evidence, provenance, tenant-isolation, replay, provider-substitution and experimental-truth boundaries.

## PURPOSE

Authorize a fresh successor candidate whose sole material integration change is correction of the TypeSafe System One Noul request serialization demonstrated invalid by the frozen 422 evidence and confirmed by the current TypeSafe OpenAPI.

This authorization does NOT amend, replay, repair, or promote the original Stage-F candidate.

## FROZEN PREDECESSOR FACTS

- predecessor Stage-F provider ledger: terminal BLOCK
- Jev attempts in predecessor: 160
- Jev provider errors: 160
- error class: `JEV_422`
- raw-body class count: 1
- diagnosed cause: `NOUL_CRITERIA_SERIALIZATION_CONTRACT_MISMATCH`
- provider/model semantic answers from those 160 attempts: none

## SUCCESSOR CONTRACT RULE

The successor Noul serialization must comply with the current TypeSafe System One schema:

- `type='noul'`
- `instructions` preserves the frozen question instruction
- if `criteria` is supplied, it MUST be an object conforming to `NoulCriteria`
- the existing frozen positive condition MUST NOT be discarded merely to obtain syntactic validity

The authorized mapping is therefore:

`{ type: 'noul', instructions: q.instruction, criteria: { true: q.condition } }`

unless the frozen question itself provides an explicit false criterion, in which case that separately frozen value may be represented as `false` without changing its meaning.

Choice and Score serialization remain unchanged unless zero-call validation independently demonstrates another contract defect before receipt #1.

## ZERO-CALL PREFLIGHT REQUIREMENTS

Before any successor provider call, the preflight must:

1. bind to the exact predecessor Stage-F QuestionSet SHA-256;
2. bind to the exact predecessor provider matrix/corpus/gold roots;
3. construct every successor Jev request body without network access;
4. verify all 160 Jev bodies share the intended provider-contract schema;
5. assert every Noul `criteria` is absent/null or an object, never a string;
6. assert Choice `criteria` remains an object;
7. assert Score `criteria` remains a non-empty ordered array;
8. verify `state`, `model`, and `questions` are present for every request;
9. verify the requested model remains `jev-latest`;
10. content-address the successor adapter and request-manifest bytes;
11. preserve `provider_calls=0`, `attempts=0`, `receipts=0` for the successor candidate;
12. independently verify the preflight output before any execution authorization.

## PROHIBITED

`STAGE_F_LEDGER_REPLAY=PROHIBITED`

`STAGE_F_LEDGER_MUTATION=PROHIBITED`

`CORPUS_MUTATION=PROHIBITED`

`GOLD_MUTATION=PROHIBITED`

`ROUTING_MATRIX_MUTATION=PROHIBITED`

`ACCEPTANCE_THRESHOLD_MUTATION=PROHIBITED`

`PROVIDER_IDENTITY_SUBSTITUTION=PROHIBITED`

`AUTHORITY_EXPANSION=PROHIBITED`

`PRODUCTION_PROMOTION=PROHIBITED`

## CONTROLLING TRANSITION

`CONTROLLING_NEXT_TRANSITION=JEV_REQUEST_CONTRACT_REMEDIATION_ZERO_CALL_PREFLIGHT_ONLY`

Provider execution for the successor remains blocked until a separately frozen zero-call PASS and execution authorization exist.