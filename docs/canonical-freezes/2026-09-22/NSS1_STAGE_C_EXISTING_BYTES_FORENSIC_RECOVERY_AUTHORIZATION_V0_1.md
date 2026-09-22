# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Existing-Bytes Forensic Recovery Authorization v0.1

**Effective:** 2026-09-22  
**Status:** CANONICAL ADDITIVE FORENSIC EXECUTION AUTHORIZATION  
**Provider calls authorized:** `0`

Subordinate to:

- `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Zero-Call Preflight & Execution-Manifest Result v0.1`
- `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Provider Execution Complete & Evidence-Closure Interruption Result v0.1`
- all prior InterBraid / WorkforceOS / FreightOS / NSS / Semantic Computation Plane / authority / evidence / provenance / tenant-isolation / runtime-substitution / Pass20 / Owner-controlled assurance boundaries.

## 1. Authorization

Authorize one read-only forensic recovery pass against the existing persisted Stage-C execution bytes from deployment `504cb233-c17e-407f-9a54-15c528f8087e`.

`FORENSIC_MODE=EXISTING_BYTES_ONLY`

`PROVIDER_CALLS=0`

`PROVIDER_REPLAY=PROHIBITED`

`RAW_RESPONSE_REPLACEMENT=PROHIBITED`

`ORIGINAL_RECEIPT_MUTATION=PROHIBITED`

`ORIGINAL_RESULT_MUTATION=PROHIBITED`

`EXPERIMENT_CONTRACT_MUTATION=PROHIBITED`

## 2. Required forensic checks

The forensic pass must independently:

1. enumerate the persisted Stage-C execution directory;
2. hash every persisted file and record byte length;
3. count Luna and Jev attempt markers, raw responses, and terminal receipts;
4. verify receipt uniqueness by provider/event;
5. verify every available raw response hash against its receipt;
6. verify requested/effective model identity from persisted receipts;
7. verify receipt state-snapshot hashes and question IDs against the persisted pre-receipt execution plan;
8. independently reconstruct control and candidate dispositions from persisted normalized judgments using the frozen compiler and safety-floor rule;
9. recompute control/candidate metrics and all pre-registered gates;
10. compare recomputed metrics/gates against persisted `CONTROL_RESULT.json`, `CANDIDATE_RESULT.json`, and `RESULT.json`;
11. compute a hash root over the original crash-state evidence tree without modifying that tree;
12. write forensic outputs only to a separate successor forensic namespace;
13. reread and hash-verify the forensic outputs before declaring closure.

## 3. Required fail-closed conditions

Forensic recovery must BLOCK if any of the following occurs:

- expected terminal receipt missing;
- duplicate receipt for one provider/event;
- raw-response hash mismatch;
- persisted JSON parse failure;
- state-snapshot mismatch;
- question-set mismatch;
- requested/effective model identity mismatch;
- persisted result metrics cannot be reproduced from existing receipts;
- candidate/control acceptance-gate result cannot be reproduced;
- forensic output readback/hash verification fails.

No failed check may be repaired by issuing another provider request.

## 4. Original evidence immutability

The original Stage-C execution tree is evidence and must not be rewritten merely because its final tree-hash routine crashed.

`ORIGINAL_CRASH_STATE_TREE=IMMUTABLE_EVIDENCE`

A new forensic index/pointer may reference the original tree, but it must not masquerade as the original missing `FREEZE_POINTER.json`.

## 5. Success semantics

A PASS means only:

- the pre-existing provider observations are complete and internally consistent;
- their raw/receipt/result bytes are recoverable and hash-verifiable;
- the pre-registered Stage-C metrics and gates can be reproduced without provider replay;
- a successor forensic evidence pointer can close the experimental truth chain.

A forensic PASS does not create production authority, expand runtime authority, authorize OpenRouter/frontier calls, or promote Stage C beyond its pre-registered experimental scope.

## 6. Controlling next transition

`CONTROLLING_NEXT_TRANSITION=EXECUTE_ZERO_PROVIDER_FORENSIC_READBACK_AND_RECONCILIATION`
