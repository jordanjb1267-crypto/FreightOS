# InterBraid Persistent Semantic Nervous System — C4 Structural Authority Floor Fresh Held-Out Harness Preflight Result v0.1

**Effective:** 2026-09-23

**Status:** `PASS`

Additive and subordinate to the C4 Structural Authority Floor & Residual System-One Routing Successor Experiment Authorization v0.1 and all prior Stage-F / R1 evidence, authority, provenance, tenant-isolation, and no-replay freezes.

## Execution

- Railway deployment: `ff63bfbc-5d4f-436a-8613-718625131d31`
- Generation run: `NSS1-C4-STRUCTURAL-AUTHORITY-FLOOR-HELDOUT-GENERATION-v0.1`
- Preflight run: `NSS1-C4-STRUCTURAL-AUTHORITY-FLOOR-HELDOUT-PREFLIGHT-v0.1`
- Held-out event SHA-256: `737593c111c5fc856be0b3bc5f86312549b1d998961125b9c7fa50a38f6ead80`
- Structural-floor implementation SHA-256: `310d1718f2380312c7be99365c7bad2624370abcc6039d9ca92ead65643dd40e`
- Preflight result SHA-256: `5809882084ed875d8a2f9c8f0a1e452687a54ddfb250e86f0ccb39ccd64c9f2c`

## Frozen held-out denominator

- Total events: `96`
- Structural positive: `48`
- Structural negative/residual: `48`
- Positive fresh: `24`
- Positive stale: `24`

Positive transition classes:

- seal transition to discrepancy: `16`
- receiver transition to conflict: `16`
- factor reassignment: `16`

Negative / residual controls:

- seal noncritical control: `8`
- receiver noncritical control: `8`
- factor unchanged control: `8`
- residual temperature context: `4`
- residual appointment revision: `4`
- residual detention update: `4`
- residual location update: `4`
- residual POD status update: `4`
- residual gate status update: `4`

## Preflight result

- Issues: `[]`
- Guard conformance: `96/96`
- Positive conformance: `48/48`
- Negative conformance: `48/48`
- Identity invariance: `96/96`
- Family-label invariance: `96/96`
- State-key-order invariance: `96/96`
- Stage-F exact replay authorized: `false`
- Provider calls: `0`
- Credentials read: `false`
- Authority effects: `NONE`
- Live effects: `0`

## Frozen provider-execution authorization

The preflight gate is closed PASS. A successor provider run is now authorized with exactly the frozen 96-event held-out manifest under the following constraints:

- provider: Jev/System-One only;
- exact held-out event SHA-256 must remain `737593c111c5fc856be0b3bc5f86312549b1d998961125b9c7fa50a38f6ead80`;
- structural-floor source SHA-256 must remain `310d1718f2380312c7be99365c7bad2624370abcc6039d9ca92ead65643dd40e`;
- maximum planned fresh Jev requests: `96`;
- no Stage-F event/request replay;
- no Luna, OpenRouter, or frontier calls;
- no live freight effects;
- no production promotion;
- no authority expansion;
- terminal receipts must be persisted per attempt;
- uncertain orchestration must be reconciled before any retry;
- baseline and structural-floor arms must reuse the same fresh Jev outputs, so the floor comparison introduces no second provider denominator.

Prospective acceptance gates remain:

- structural-positive C4 false-safe events after floor: `0`;
- guard-caused false authority escalations on structural negatives: `0`;
- state binding: `100%`;
- cross-tenant contamination: `0`;
- stale current-state applications: `0`;
- Stage-F provider replay: `0`;
- authority effects: `NONE`.

`CONTROLLING_NEXT_TRANSITION=FRESH_96_EVENT_JEV_EXECUTION`
