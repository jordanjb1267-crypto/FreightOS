# Attribution & Commission Gap Map

Tests **H8**: attribution and commission can be derived from append-only authoritative commercial
and financial events without giving RevenueOS payout authority.

## 1. Verdict

**H8 holds, and it is the cleanest authority separation in the package.** Commission is
calculate-and-record only; no component in v1.8.1 can move money, and no payment rail exists to
move it with. The gaps are about _evidence integrity_, not about authority leakage.

## 2. The separation, as designed

`job_books/revenueos/commission_calculation_service.json`:

- `proposed_class: deterministic_service` — correct; commission arithmetic must be reproducible.
- `candidate_commands: [record_commission_calculation, record_payout_reco…]` — **both are
  `record_*`**. Nothing pays.
- `production_logistics_authority: false`, `certification: NOT_J0`.

REV-G08 (`CommissionWorkUnit`, 8 nodes / 7 edges — the largest RevenueOS graph) is on plane
`revenueos_financial`, separated from `revenueos`. Its one side-effecting node is
`side_effect_class: financial_record` — a record, not a transfer — and its edges carry
`commission_policy` and `finance_authority` authority checks.

**REV-39 ("calculation cannot move money") is satisfied by design and vacuously true today.** There
is no payment integration, no ledger of funds, and no egress. `invoices` and `billing_accounts`
exist **only** in `db/reference/0004_billing.sql`, which `db/reference/PROVENANCE.md` states _"is
never executed"_ and which has _"zero `CREATE POLICY` statements"_.

## 3. What exists to build on

| Primitive                                 | Where                                                             | Role in attribution                                                 |
| ----------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `audit_events` append-only, non-forgeable | `0003`, `0006` (purpose/outcome), `0031` (function ACL hardening) | the authoritative event spine H8 requires                           |
| `network_events` append-only journal      | `0029`                                                            | ordered, immutable commercial event source                          |
| `outbox_events` + `app.outbox_status`     | `0003`                                                            | exactly-once side effects — **table only, no producer or consumer** |
| `record_version` columns                  | throughout `0028`+                                                | optimistic versioning for corrections                               |

The append-only substrate H8 depends on **genuinely exists and is tested**
(`packages/database/test/integration/network-event-journal.test.ts`,
`audit-function-acl.test.ts`). This is the strongest foundation any RevenueOS concern has.

## 4. Gaps

### AC-01 — No commission, attribution, plan, split, or clawback construct exists

Zero tables. REV-33..REV-38, REV-40 score NOT_IMPLEMENTED.

### AC-02 — "Authoritative commercial events" have no source

H8 requires commission be derived from authoritative events. The authoritative event for a
commission is _cash collected_ or _contract executed_. Neither exists: no invoice, no payment, no
executed contract record, and `contract.sign` is in the 32-item `red_actions` list in
`config/policy/base_policy.yaml:11-42` — a file the accepted W0/W1 audit records as _read by
nothing_. Commission cannot be computed from authoritative events until an authoritative commercial
event exists. This is a sequencing fact, and it places commission **late**; see
PROPOSED_ADDITIVE_PR_SEQUENCE.

### AC-03 — Attribution rewrite-after-collection is not preventable yet

The adversarial list requires that _attribution cannot be rewritten after cash collection_. The
append-only substrate makes the _event_ immutable, but nothing binds an attribution record to a
collection event, and there is no collection event. The correct construction — attribution rows
reference an immutable `audit_events` id and corrections append a linked reversal rather than
mutate — is available today via `audit_events` and `record_version`, and is not yet specified.
**Required change:** specify correction-by-append with a mandatory link to the original, mirroring
`network_disclosure_grant_revocations` (`0032`), which already models revocation as a separate
append rather than a mutation.

### AC-04 — Duplicate collection / double-pay has no idempotency key

REV-35 requires that duplicate collection cannot double-pay. REV-G08's nodes carry
`retry_policy: none` except where noted, and no idempotency key is defined for a commission event.
The accepted W0/W1 audit recorded the identical defect in v1.8 simulations: _"'duplicate dispatch'
is an idempotency oracle with no key defined"_. **The same defect is being reproduced in the
financial plane, where its consequence is money.** Recorded as conflict **C-07**.

The repository already has the answer: `network_transport_intents` (`0030`) is an _idempotent_
transport intent, and `0034` delivery is keyed. Commission must adopt the same shape.

### AC-05 — Clawback/correction terminal states are unowned

REV-G08 declares terminal states including `DISPUTED`, which is **not defined as a node**. A
disputed commission therefore has no accountable owner, no timeout, and no exit criteria — in the
one graph where the subject is money. See GRAPH_NODE_OWNERSHIP_AUDIT.

### AC-06 — Commission incentive review is out of scope for this repository, but must be recorded

The adversarial list requires testing that _commission incentive encourages unsupported selling_.
This is a plan-design question, not a code question. The mitigating control is the Promise Firewall
(PF-02) plus `customer_sale_allowed: false`. Recorded as owner decision **D-06**.

## 5. Adversarial cases

| Attack                                 | Outcome today                                           | Outcome if built as designed            |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| Commission calculation moves money     | **blocked** — `record_*` commands only; no payment rail | blocked by design                       |
| Attribution rewritten after collection | **not expressible** — no collection                     | **at risk** — AC-03 unspecified         |
| Duplicate collection double-pays       | **not expressible**                                     | **at risk** — AC-04, no idempotency key |
| Clawback loses link to original        | n/a                                                     | **at risk** — AC-03                     |
| Dispute destroys evidence              | n/a                                                     | **at risk** — AC-05, `DISPUTED` unowned |
| RevenueOS gains payout authority       | **blocked** — schema `const false`; no rail             | blocked                                 |

## 6. Required changes

1. Define a commission idempotency key modelled on `network_transport_intents` (**AC-04 / C-07**,
   blocking).
2. Correction-by-append with a mandatory link to the original, modelled on
   `network_disclosure_grant_revocations` (**AC-03**).
3. Define and own `DISPUTED` and every other declared terminal in REV-G08 (**AC-05**).
4. Sequence commission **after** an authoritative commercial event exists (**AC-02**).
