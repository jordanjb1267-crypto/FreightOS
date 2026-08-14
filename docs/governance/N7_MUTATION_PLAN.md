# N7 External Transport — Test Strategy and Mutation Plan

This is the verification design, frozen before the code, so that detectors are written against
threats rather than against whatever the implementation happened to do.

Companion to ADR-N0018 and `N7_THREAT_MODEL.md`.

> **Status:** the non-egress half is implemented and its mutations executed — see §7. The SSRF and
> adapter mutations (`N7-S-*`) remain unimplementable until N7-B introduces something that can open
> a socket, which is the point of §5's eighth hazard: with no network in CI, an SSRF test written
> today would pass for the wrong reason.

---

## 1. Why this comes first

N6 produced eleven product regressions. Four of them (T-01…T-04) were _detector_ defects — tests that
passed for the wrong reason:

- **T-01** optional parameters escaped the source gate, so four mutations walked straight through.
- **T-03** the duplicate-delivery oracle credited the wrong uniqueness barrier; removing the
  constraint under test left the test green.
- **T-04** the cross-tenant subscription test passed on participant-registry RLS, not on the clause
  it named.

The pattern in every case: **a test that names one guard while a different guard does the refusing.**
The countermeasure is not more tests, it is pinning _which_ rule fires — by constraint name, by
SQLSTATE, by refusal reason — and proving the named rule is load-bearing by removing it and watching
the test fail.

Every negative below therefore carries three obligations: a **positive control** on the same axis, a
**named** expected refusal, and a **mutation** that makes the test fail when the named guard is
removed.

## 2. Test strategy

### 2.1 Fake receiver

A local HTTP receiver, in-process or on loopback, that can be scripted to: accept; return each
4xx/5xx of interest; return `429` with and without `Retry-After`; redirect; hang past the deadline;
trickle bytes; return an oversized body; return a body containing a token-shaped string; echo request
headers so the test can assert what was _not_ sent.

**No test sends real customer data anywhere.** Fixtures are synthetic artifacts built through the
governed N3→N6 path, exactly as N6's integration fixtures are.

### 2.2 Adversarial DNS and address tests

The SSRF control set is tested against a controllable resolver rather than the real one — a resolver
stub is the only way to test rebinding deterministically. Cases enumerated in §4.

### 2.3 Layers

| Layer                                | Proves                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Unit (pure)                          | URL normalization, address classification, taxonomy mapping, retry/backoff, idempotency derivation, envelope construction |
| Source/type gate                     | no caller-supplied endpoint; adapter surface shape; egress allowlist                                                      |
| Integration (database)               | obligation creation, bindings, RLS, state machine, revocation races, least-privilege reads                                |
| Integration (network, loopback only) | adapter behaviour against the fake receiver                                                                               |
| Migration lifecycle                  | up/down, exact restoration, cross-database role teardown                                                                  |
| CI gate                              | egress allowlist, named step                                                                                              |

### 2.4 Isolation

Network tests bind loopback only and are marked so they cannot reach a real address; the SSRF suite
asserts that its own attempts to reach non-loopback addresses are _refused by our filter_, not merely
unreachable in CI. A test that passes because the runner has no network is a false green — the same
class as R-05's inert grants.

## 3. Mutation matrix — `N7-M-01` … `N7-M-24`

Each: the mutation, the detector that must fail, and the class of defect it models.

| #         | Mutation                                                                   | Must be detected by                          | Models                            |
| --------- | -------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| `N7-M-01` | Add a `url` / `endpoint` / `host` parameter to the transport surface       | source gate forbidden-parameter list         | T-04, caller-supplied destination |
| `N7-M-02` | Allow the obligation to carry recipient independently of the artifact      | composite FK 1 absent → mismatch accepted    | T-05, R-08 shape                  |
| `N7-M-03` | Allow the obligation's destination to belong to another recipient          | composite FK 2 absent → mismatch accepted    | T-05, R-11 shape                  |
| `N7-M-04` | Re-project the payload in the adapter instead of sending artifact bytes    | digest re-verification before send           | T-06                              |
| `N7-M-05` | Recompute the payload on retry                                             | retry byte-identity test                     | T-07                              |
| `N7-M-06` | Select a different destination on retry                                    | obligation identity test                     | T-07                              |
| `N7-M-07` | Skip the destination-eligibility check before send                         | revocation-race test                         | T-08                              |
| `N7-M-08` | Check the kill switch at obligation selection instead of before the socket | kill-switch ordering test                    | T-09                              |
| `N7-M-09` | Consume an attempt when egress is disabled                                 | suppression test (`attempt_count` unchanged) | T-09                              |
| `N7-M-10` | Persist the `Authorization` header on the attempt row                      | attempt-column prohibition test              | T-10                              |
| `N7-M-11` | Log the resolved credential                                                | redaction test                               | T-10                              |
| `N7-M-12` | Persist the raw remote response body                                       | body-policy test                             | T-11                              |
| `N7-M-13` | Regenerate the idempotency identity per attempt                            | idempotency stability test                   | T-07                              |
| `N7-M-14` | Recreate a terminated obligation for the same (artifact, destination)      | `UNIQUE (artifact_id, destination_id)`       | replay by accident                |
| `N7-M-15` | Accept a durable schema version by prefix match                            | destination compatibility test               | D-Q lesson                        |
| `N7-M-16` | Classify a 4xx as retryable                                                | taxonomy mapping test                        | T-12                              |
| `N7-M-17` | Classify a 5xx as terminal                                                 | taxonomy mapping test                        | T-12                              |
| `N7-M-18` | Enforce only a per-request timeout, no whole-attempt deadline              | slow-trickle deadline test                   | T-13                              |
| `N7-M-19` | Send without a persisted obligation                                        | adapter-input construction test              | T-16                              |
| `N7-M-20` | Add `fetch(` outside the allowlist                                         | egress CI gate                               | T-15                              |
| `N7-M-21` | Broaden the artifact read policy to all artifacts                          | least-privilege read test                    | T-17                              |
| `N7-M-22` | Silently add an allowlist entry                                            | allowlist-contents assertion                 | T-15                              |
| `N7-M-23` | Leave a stale allowlist entry with no primitive                            | allowlist-staleness assertion                | T-15                              |
| `N7-M-24` | Overload N6 `delivered` to mean externally delivered                       | N6/N7 state-separation test                  | ADR-N0018 §"N7 has its own state" |

### SSRF mutations — a required sub-matrix

Each is a _filter bypass_, and each must be refused with `address_rejected` specifically, not with a
connection error. A test that passes because the address happened to be unreachable proves nothing.

| #         | Bypass attempt                                                                       |
| --------- | ------------------------------------------------------------------------------------ |
| `N7-S-01` | `https://127.0.0.1/`                                                                 |
| `N7-S-02` | `https://localhost/`                                                                 |
| `N7-S-03` | `https://10.0.0.1/`, `172.16.0.1`, `192.168.0.1`                                     |
| `N7-S-04` | `https://169.254.169.254/` (link-local + metadata)                                   |
| `N7-S-05` | `https://[::1]/`, `https://[fe80::1]/`, `https://[fc00::1]/`                         |
| `N7-S-06` | `https://[::ffff:127.0.0.1]/` (v4-mapped v6)                                         |
| `N7-S-07` | `https://2130706433/` (decimal integer)                                              |
| `N7-S-08` | `https://0x7f000001/` (hex), `https://0177.0.0.1/` (octal), `https://127.1/` (short) |
| `N7-S-09` | DNS rebinding: public at validation, private at connect                              |
| `N7-S-10` | Multi-record DNS: one public address, one private — **must reject, not filter**      |
| `N7-S-11` | `302` redirect to a private address                                                  |
| `N7-S-12` | `https://user:pass@evil.example@internal/` (userinfo confusion)                      |
| `N7-S-13` | Trailing-dot host `https://internal./`                                               |
| `N7-S-14` | IDN/punycode homograph resolving to a private address                                |
| `N7-S-15` | `http://` (non-TLS scheme)                                                           |
| `N7-S-16` | Non-443 port outside the allowlist                                                   |
| `N7-S-17` | `100.64.0.1` (CGNAT), `192.0.0.1`, `198.18.0.1`                                      |
| `N7-S-18` | `2002::`/`2001::`/`64:ff9b::` tunnelled and NAT64 forms                              |

### Anti-vacuity for the SSRF suite

The suite needs a **positive control**: a permitted public address must be _accepted_ by the filter.
Without it, a filter that rejects everything passes all eighteen cases and ships — the exact shape of
R-05's inert grants, where the failure was silent and every downstream assertion passed by finding
nothing to do.

## 4. Additional required tests

| Area                      | Test                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Concurrency               | Two workers claim the same obligation; exactly one sends                                               |
| Multi-destination         | One artifact, N destinations → N obligations, independent outcomes                                     |
| Revocation race           | Revoked between selection and send → `destination_disabled`, no bytes                                  |
| Fresh N5 (if `OR-05` B/C) | Grant revoked between inbox commit and attempt → refused before egress                                 |
| Ordering                  | Provenance/eligibility refusals precede transport refusals and are distinguishable — R-11's lesson     |
| Least privilege           | Transport worker cannot read an artifact with no obligation                                            |
| Policy pairing            | Every transport-worker GRANT has an admitting policy (assertion (m) extended, recomputed not listed)   |
| Migration lifecycle       | Fresh install, populated upgrade, live-history refusal, acknowledged bounded revert, round trip        |
| Cross-database roles      | Retain-with-NOTICE, last-holder drop, owned-relation refusal — disposable cluster                      |
| Trigger inventory         | Every N7 trigger pinned by timing, event, level, function, enabled state, WHEN presence — F-2's lesson |
| F-20                      | Schema-wide: composite FK without supporting index = 0                                                 |
| Dead tests                | 0 skip/todo/only                                                                                       |

## 5. Oracle hazards to guard from the start

Carried forward from N6, where each was met in practice:

1. **FORCE-RLS zero rows despite a GRANT** — R-05. Every new GRANT paired with a policy, recomputed.
2. **A guard blind to the rows it inspects** — R-06, U-10. Any N7 migration guard reading an RLS
   table needs a scoped temporary policy, and its sightedness must be measured (blind count vs. true
   count), not assumed.
3. **The wrong barrier refusing** — T-03. Pin the constraint name, not just the SQLSTATE.
4. **Defence in depth masking the clause under test** — T-04. If an outer layer refuses first, pin
   the inner clause structurally as well.
5. **An unrelated refusal masking a provenance mismatch** — R-11. Order the checks and give each its
   own outcome.
6. **Count-only inventories** — U-08. Exact names, both directions.
7. **A gate narrowed to one relation kind** — U-16. Scope a gate by its purpose.
8. **A test passing because the environment cannot do the thing** — new for N7, and the most likely
   N7-specific false green: no network in CI makes every SSRF test pass.

## 6. Sequencing

1. SSRF control set + `N7-S-01…18` + positive control — **merged and reviewed before any adapter**.
2. Schema + bindings + RLS + lifecycle (no network).
3. Transport engine: obligation, state machine, retry, idempotency (no network).
4. Egress CI model: allowlist + named step, with `N7-M-20/22/23` — **before** the first primitive.
5. First adapter, against the fake receiver only.
6. Full mutation matrix, three consecutive integration runs, remote CI.

Step 4 precedes step 5 deliberately: the gate that governs egress should exist before the thing it
governs, or its first exercise is a change that already needs it.

---

## 7. Executed — N7-A

Thirteen mutations were applied one at a time to migration 0035 or to
`packages/context/src/external-transport.ts`, the named test re-run, and the source restored and
verified byte-identical by SHA-256. **All thirteen were detected.** A mutation that is not detected
is a control that does not exist, so the result is reported as a count of detections rather than as
a statement that the tests pass.

Each row names the test that failed, because §1's whole argument is that "some test failed" is not
evidence — T-01 through T-04 were all cases where a test failed or passed for a reason other than
the one it claimed.

### Structural binding

| ID        | Mutation                                                | Detected by                                                      |
| --------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `N7-A-B1` | destination binding decomposed to a single-column FK    | _makes "artifact for A, destination owned by B" UNREPRESENTABLE_ |
| `N7-A-B2` | permit's `(artifact_id, artifact_digest)` FK removed    | _binds a permit to its transport as ONE referential fact_        |
| `N7-A-B3` | obligation uniqueness made partial-on-non-terminal      | _refuses a SECOND obligation … terminal or not_                  |
| `N7-A-B4` | `inbox_id` downgraded from a foreign key to a bare uuid | _refuses an obligation for an artifact with no inbox row_        |

`B1` is the R-08 shape reintroduced deliberately: decomposing the composite key makes the artifact's
recipient and the destination's recipient independent again, which is exactly the defect N6's
final re-review found end-to-end. `B3` is the one an optimising reader is most likely to introduce
by accident — a partial index looks like a refinement and is a replay channel.

### Role separation

| ID        | Mutation                                                              | Detected by                                                       |
| --------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `N7-A-R1` | transport worker granted INSERT on permits, with a policy             | _REFUSES the transport worker minting its own permit_             |
| `N7-A-R2` | transport worker granted SELECT on `network_disclosure_grants`        | _holds NO privilege on any N5 authorization input_                |
| `N7-A-R3` | `GRANT freightos_delivery_worker TO freightos_transport_worker`       | _gives the transport worker no membership of the delivery worker_ |
| `N7-A-R4` | artifact read policy widened from obligation-scoped to `USING (true)` | _reads an artifact ONLY where an obligation for it exists_        |

**`N7-A-R3` was detected twice, and the second detection was not planned.** A role grant is a
CLUSTER object: restoring the migration file did not undo it, so the edge survived into the next
test run — where migration **0034's own deploy-time assertion** refused to apply at all, naming the
offending edge and its `inherit=t` option. That is the same lesson as regression #4 (a role is not
a database-scoped thing), arriving from the opposite direction, and it is independent evidence that
0034's §2c guard is load-bearing rather than decorative. The cluster edge was revoked by its
grantor and the suite returned to green.

### Authority

| ID        | Mutation                                                         | Detected by                                                                                |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `N7-A-A1` | permit `no_update` trigger removed — deadlines become extensible | _is immutable authority — no widening, no re-pointing_                                     |
| `N7-A-A2` | terminal-state check removed from the transition guard           | _keeps the obligation identity immutable and refuses a transition out of a terminal state_ |
| `N7-A-A3` | delivery worker granted INSERT on the attempt journal            | _gives the delivery worker no attempt write_                                               |
| `N7-A-A4` | destination INSERT policy stops deriving recipient tenancy       | _refuses a destination for an organization in ANOTHER tenant_                              |

`A4` is T-04's hazard checked directly: the cross-tenant destination test could plausibly have been
passing on participant-registry RLS rather than on the tenancy clause it names. Removing only that
clause fails only that test, which is what makes the naming honest.

### Duplicated identity

| ID        | Mutation                                                                | Detected by                                              |
| --------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `N7-A-T1` | an outcome removed from the TypeScript taxonomy that the enum still has | _defines three closed enums and no open text vocabulary_ |

The enum and the TypeScript union are the same identity in two places — `R-07`'s shape at the
type layer. Unclassified, a real outcome reaches `outcomeSemantics()` as `undefined` and reads as
"not terminal, not retryable": the most dangerous available default for a transport decision, and
reached without an error. The parity assertion compares both directions against the live catalog.

### Gate mutations

`N7-M-20`, `N7-M-22` and `N7-M-23` are implemented as standing negative controls inside
`scripts/test/egress-allowlist-gate.test.ts` rather than as one-off mutations — each writes a real
violation into a temporary file, runs the actual gate as a subprocess, asserts the specific failure
line, and restores. They run on every CI pass, so the gate is observed to fail continuously rather
than once.
