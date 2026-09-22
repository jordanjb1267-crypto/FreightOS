# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Provider Execution Complete & Evidence-Closure Interruption Result v0.1

**Effective:** 2026-09-22  
**Status:** CANONICAL ADDITIVE EXECUTION-EVIDENCE STATE — BLOCKED ON FINAL EVIDENCE CLOSURE  
**Candidate:** `NSS1-STAGE-C-v0.1`  
**Deployment:** `504cb233-c17e-407f-9a54-15c528f8087e`

This freeze is subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Zero-Call Preflight & Execution-Manifest Result v0.1` and all prior InterBraid / WorkforceOS / FreightOS / Persistent Semantic Nervous System / Semantic Computation Plane / TypeSafe / Jev / OpenAI / authority / evidence / provenance / tenant-isolation / provider-substitution / Pass20 / Owner-controlled assurance state.

## 1. Controlling state

`NSS1_STAGE_C_EXECUTION_MANIFEST_SHA256=15a62008591e458748376e1b6edc21d6594b3dea5974fdf2e3b1300faa22e032`

`STAGE_C_PROVIDER_EXECUTION_CONTROL_FLOW=COMPLETE`

`STAGE_C_FINAL_EVIDENCE_TREE_CLOSURE=FAILED`

`STAGE_C_TERMINAL_RESULT=BLOCKED_EVIDENCE_CLOSURE`

`PROVIDER_REPLAY=PROHIBITED`

`AUTHORITY_EFFECTS=NONE`

`OPENROUTER_CALLS=0`

`FRONTIER_CALLS=0`

The exact frozen execution deployment entered `RUN_MODE=execute`, re-emitted the frozen preflight manifest with `provider_receipts=0`, executed under the immutable Stage-C contract, and later terminated with an application exception in the final evidence-tree hashing step.

## 2. Terminal application exception

The terminal application error was:

`ReferenceError: readdir is not defined`

The exception occurred inside `xHashTree(root)` while recursively enumerating the completed Stage-C evidence directory.

The missing symbol was an implementation/import defect in the evidence-tree closure function. It is not a semantic-provider judgment, routing outcome, identity-classification result, safety-floor result, or provider transport result.

## 3. Why provider execution is classified complete by control flow

The frozen runner performs operations in this order:

1. reconstruct and verify the frozen Stage-C corpus/identity/replay preflight;
2. write `PRE_RECEIPT_FREEZE.json`;
3. execute the complete Luna control-provider loop;
4. execute the complete Jev candidate-provider subset;
5. compile control and candidate rows;
6. compute control/candidate metrics and acceptance gates;
7. write `CONTROL_RESULT.json`;
8. write `CANDIDATE_RESULT.json`;
9. write `RESULT.json`;
10. call `xHashTree(EXEC_ROOT)`;
11. write final `FREEZE_POINTER.json` and emit `NSS1_STAGE_C_COMPLETE`.

The observed exception occurred at step 10. Therefore the provider loops and pre-pointer result writes were reached and completed in program control flow before the crash.

This establishes **execution-complete by control-flow position**, but it does not substitute for independent persisted-byte verification of receipt counts, hashes, model identities, or result contents.

## 4. Evidence interpretation boundary

The following claims are authorized now:

- the frozen execution manifest was used;
- provider execution progressed through both provider loops before the closure crash;
- pre-pointer result artifacts were written before `xHashTree()` was invoked;
- final evidence-tree hash and final Freeze Pointer were not produced;
- `NSS1_STAGE_C_COMPLETE` was not emitted;
- Railway deployment success/failure is not the semantic result;
- no provider replay is authorized to repair the missing evidence closure.

The following remain **UNVERIFIED_PENDING_FORENSIC_READBACK**:

- exact persisted Luna receipt count;
- exact persisted Jev receipt count;
- exact count of OK/provider-error/model-identity-error receipts;
- exact control metrics;
- exact candidate metrics;
- exact acceptance-gate result;
- exact `RESULT.json` SHA-256;
- exact persisted raw-response coverage;
- exact effective provider/model identity distribution;
- final evidence-tree SHA-256.

## 5. Failure classification

`FAILURE_CLASS=POST_PROVIDER_EVIDENCE_CLOSURE_IMPLEMENTATION_DEFECT`

`SEMANTIC_EVIDENCE_INVALIDATED=false`

`SEMANTIC_EVIDENCE_PROMOTED=false`

`FINAL_CANONICAL_RESULT_AVAILABLE=false`

The provider observations already made are potentially valid immutable experimental evidence, but they are not promoted to a final Stage-C result until the existing persisted bytes are independently enumerated, hashed, parsed, and reconciled.

## 6. Mandatory recovery rule

Recovery must be **read-only with respect to provider execution**.

Permitted:

- enumerate the existing persistent Stage-C evidence directory;
- count and hash existing receipt/result/raw-response files;
- parse persisted JSON artifacts;
- reconstruct metrics from persisted terminal receipts;
- verify model identities and provider closure from persisted bytes;
- construct a new forensic artifact index and successor Freeze Pointer without changing the original receipt/result preimages.

Prohibited:

- retry any provider request whose attempt marker or receipt already exists;
- replace or overwrite raw provider responses;
- regenerate semantic judgments from providers;
- mutate corpus, gold, routing, QuestionSets, identity detector, safety floor, compiler, provider schedule, thresholds, or acceptance gates;
- treat a repaired evidence-tree implementation as if it were the original execution.

## 7. Controlling next transition

`CONTROLLING_NEXT_TRANSITION=NSS1_STAGE_C_EXISTING_BYTES_FORENSIC_RECOVERY_ONLY`

`PROVIDER_CALLS_DURING_RECOVERY=0`

`RECEIPT_REPLAY=PROHIBITED`

A successor result may be promoted only if the persisted Stage-C bytes independently establish receipt completeness, parse/hash integrity, provider/model identity closure, metric reproducibility, and the pre-registered acceptance-gate outcome.
