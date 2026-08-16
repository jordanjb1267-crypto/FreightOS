# Graph Failure, Retry, Reconciliation & Replay Gap Map

Failure transitions, timeouts, retry budgets, idempotency, crash windows, replay determinism,
kill-switch behaviour, and certification readiness.

## 1. Verdict

**This is the weakest area of the package.** Three of the five package-internal defects live here,
and one of them — zero kill-switch coverage — contradicts an accepted v1.3 control that already
exists and is tested in this repository.

## 2. GF-01 — Failure terminates in an undefined state (GR-12: FAIL)

| Measure                                      |               Value |
| -------------------------------------------- | ------------------: |
| Nodes declaring `failure_transition: "HOLD"` | **192 / 211 (91%)** |
| Graphs defining `HOLD` as a node             |          **0 / 36** |
| Graphs declaring `HOLD` in `terminal_states` |             36 / 36 |

`HOLD` is declared as a terminal state everywhere and defined as a state nowhere. It has no owner,
no entry precondition, no exit postcondition, no timeout, and no escalation edge. **91% of the
package's failure paths lead to a state that does not exist.**

The 19 nodes that route elsewhere show the correct pattern — REV-G01 `R4_CONTACT` fails back to
`R3_ELIGIBILITY`, re-evaluating outreach eligibility before any retry. That is precisely right, and
it is what the other 192 should look like.

## 3. GF-02 — Idempotency is absent where side effects are binding (GR-09: FAIL)

21 nodes carry a non-`none` `side_effect_class`. Ten of them have a retry policy that cannot
prevent duplication:

| Graph    | Node                     | Side effect                 | Retry policy    | Risk on retry                                     |
| -------- | ------------------------ | --------------------------- | --------------- | ------------------------------------------------- |
| FMI-G01  | `F3_INGEST`              | `external_read`             | `bounded_retry` | duplicate observation corrupts derived indicators |
| FMI-G07  | `BA5_DELIVER`            | `external_communication`    | `bounded_retry` | duplicate customer brief                          |
| FMI-G10  | `CX5_NOTIFY`             | `external_communication`    | `bounded_retry` | duplicate correction notice                       |
| REV-G01  | `R4_CONTACT`             | `external_communication`    | `bounded_retry` | **duplicate prospect outreach**                   |
| REV-G04  | `P6_SEND`                | `external_commercial_offer` | `bounded_retry` | **duplicate priced offer**                        |
| REV-G06  | `I5_TRANSFER`            | `handoff_only`              | **`none`**      | duplicate implementation handoff                  |
| TWIN-G01 | `TB6_ACTIVATE`           | `integration_configuration` | **`none`**      | **duplicate integration activation**              |
| TWIN-G08 | `NP5_SEND`               | `external_communication`    | `bounded_retry` | duplicate network disclosure                      |
| TWIN-G09 | `CP2_SEND`, `CP4_RETURN` | `external_communication`    | `bounded_retry` | duplicate counterparty message                    |

`bounded_retry` bounds the _number_ of attempts; it does not make an attempt idempotent. Only
**15 of 211 nodes** mention idempotency anywhere in their definition.

This directly contradicts the invariant all 36 graphs declare: _"duplicate delivery must not
duplicate a binding side effect."_ The adversarial requirement "crash/retry duplicates
quote/order/entitlement/commission side effects" is therefore **not met** by the design as written.

**The repository already has the answer.** `network_transport_intents` (`0030`) is an idempotent
transport intent; `0034` delivery is keyed and its journal binds an attempt to its permit (commit
`9788069`, _"bind the attempt journal to its permit"_). Every side-effecting node must adopt
`idempotent_retry` with a declared key, or `reconcile_before_retry`.

## 4. GF-03 — Zero kill-switch coverage (GR-15: FAIL) _(cross-package conflict)_

**0 of 36 graphs contain any reference to a kill switch.**

The repository implements kill switches properly and tests them: `kill_switches` table
(`0004_kill_switches`, extended by `0014`, `0015`), `app.kill_switch_mode` / `app.kill_switch_scope`
enums, most-restrictive-wins resolution in `packages/context/src/kill-switch.ts` with unit tests,
and a **seeded standing suspension of `autonomous_mobility`**
(`0016_autonomous_mobility_standing_suspension`).

A durable graph that can issue a `logistics_command`, send an external commercial offer, or activate
an integration, and that cannot be stopped by the platform kill switch, is a control regression
against accepted v1.3 — the stricter accepted rule controls. Conflict **C-12**.

**Required change:** add a kill-switch check to the graph node contract and require it on every
node whose `side_effect_class` is not `none`.

## 5. GF-04 — Retry budgets are undeclared (GR-14: PARTIAL)

| `retry_policy`           | Nodes |
| ------------------------ | ----: |
| `none`                   |   192 |
| `reconcile_before_retry` |     8 |
| `bounded_retry`          |     8 |
| `idempotent_retry`       |     3 |

`retry_policy: none` on 190 non-side-effecting nodes is defensible. The defect is that
`bounded_retry` declares no bound — no maximum attempts, no backoff, no budget — so "bounded" is a
label. Every node does carry a `timeout` (`PT15M` / `PT30M`), which is why GR-13 passes; but a
timeout with `retry_policy: none` and `failure_transition: HOLD` means **timeout → undefined state**
for 192 nodes.

## 6. GF-05 — Crash windows and replay are not addressed (GR-29, GR-30: NOT_IMPLEMENTED)

No graph declares a crash-safe boundary, a commit point, or a replay contract. Nothing states which
node transitions are atomic with their side effect. `45_GRAPH_CERTIFICATION_SIMULATION_AND_REPLAY.md`
describes the intent; no artifact implements it, and there is no runtime to replay against.

The repository's own precedent — the outbox pattern (`outbox_events`, `app.outbox_status`, `0003`) —
is the standard answer for atomic state-change-plus-side-effect. W0/W1 records the table exists with
**no producer or consumer**. Graph side effects should be emitted through it rather than performed
inline.

## 7. GF-06 — `OUTCOME_UNKNOWN` has no representation

Section 6 and Section 8 both require explicit `OUTCOME_UNKNOWN` handling. No graph node, state, or
terminal expresses an unknown outcome. The closest is `reconcile_before_retry` on 8 nodes, which
implies it without naming it. For `XC5_COMMAND` (`logistics_command`) and `TWIN-G07`
(`external_system_write`), "we do not know whether the command took effect" is the single most
important state to model — a driver may or may not have been dispatched; a TMS may or may not hold
the write. **Required change:** add `OUTCOME_UNKNOWN` as a first-class node state on every
side-effecting node, owned, with a reconciliation edge. Conflict **C-13**.

## 8. GF-07 — Certification posture is correct (GR-31: PARTIAL)

Every graph is `status: AUDIT_CANDIDATE`, `version: 0.1-audit-candidate`, and 24 of 36 carry the
audit rule _"No graph is J0/production merely because this definition exists."_ The remaining 12
carry a stronger variant requiring reconciliation with accepted v1.3–v1.8 runtime and stating
_"documentation cannot make this graph implemented or certified."_

This is the right posture and it is why GR-32 PASSes. It also means **no graph may be certified
until GF-01, GF-02, GF-03 and GF-06 close** — a conjunction this audit endorses.

## 9. Required changes

1. Define and own `HOLD` (or per-graph exception states) in all 36 graphs (**GF-01**, blocking).
2. `idempotent_retry` + declared key, or `reconcile_before_retry`, on all 21 side-effecting nodes
   (**GF-02**, blocking).
3. Kill-switch check required on every side-effecting node (**GF-03 / C-12**, blocking).
4. Numeric retry budgets and backoff for `bounded_retry` (**GF-04**).
5. `OUTCOME_UNKNOWN` as a first-class owned state (**GF-06 / C-13**, blocking).
6. Route side effects through the existing outbox rather than inline (**GF-05**).
