# Sales Promise Firewall Gap Map

Tests **H7**: the Promise Firewall can be enforced from authoritative product/security/policy
registries rather than from free text.

## 1. Verdict

**H7 is achievable and partly pre-built — but the firewall itself does not exist, and the
registries it would read are incomplete in exactly the areas where a false claim is most damaging.**

## 2. What a deterministic firewall would need, and what exists

| Claim class                       | Authoritative source required | Exists today? | Evidence                                                                                               |
| --------------------------------- | ----------------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| Product exists / is sellable      | product registry              | **YES**       | `config/pricing/products.yaml` — `build_state`, `commercial_status`, `customer_sale_allowed` on all 11 |
| Roadmap / horizon timing          | module state registry         | **YES**       | `config/scope/module_states.yaml` — 9 states, `earliest_horizon` per module                            |
| Autonomy level offered            | computed ceiling              | **YES**       | `packages/config/src/scope.ts:149`; clamp tested `autonomy.test.ts:115-168`                            |
| Capability included in a pack     | capability registry           | **PARTIAL**   | `CAPABILITY_PACK_CATALOG.csv` — but `illustrative_jobs` is "determined by audit" on 10 of 13 rows      |
| Job/agent certified to perform it | certification registry        | **NO**        | no certification table; `certification: NOT_J0` is a JSON literal, not a queryable registry            |
| Security / compliance posture     | security claim registry       | **NO**        | no SOC2/pen-test/control registry of any kind                                                          |
| Scale / performance               | benchmark evidence store      | **NO**        | none                                                                                                   |
| SLA                               | SLA registry                  | **NO**        | none                                                                                                   |
| Integration supported             | adapter conformance registry  | **NO**        | 4 adapter _schemas_ exist, zero adapter code                                                           |

**Four of the nine claim classes have no authoritative source at all** — and they are the four with
the worst failure modes: security posture, scale, SLA, and integration support. A firewall built
today could deterministically refuse a roadmap or autonomy claim, and would have nothing to consult
for a security questionnaire.

## 3. The strongest existing precedent

`scripts/validate-scope.mjs:546` already refuses a _deferred-capability credential_ in
`.env.example`:

```
.env.example references a deferred-capability credential: ${hint}
```

and `:521` enforces a forbidden-control-verb list. This is a working example of "a claim about a
capability is checked against a registry, in CI, and fails the build". The Promise Firewall is the
same mechanism aimed at outbound commercial text rather than at configuration. **The pattern is
proven in this repository**; it is the registries, not the technique, that are missing.

## 4. Gaps

### PF-01 — No firewall component exists; `commercial_compliance_guard` is a Job Book, not code

The guard spans 10 graphs (REV-G01..G08, FMI-G06, FMI-G07) — correct placement — but it is an
`AUDIT_CANDIDATE` JSON descriptor. REV-20 scores NOT_IMPLEMENTED.

### PF-02 — The guard is classed `hybrid`, which is the wrong class for a firewall

A firewall that a model can talk around is not a firewall. H7's whole claim is "registries, not
free text". Its own Job Book declares `proposed_class: hybrid`. **Required change:** reclassify to
`deterministic_service` (see REVENUE_WORKFORCE_DECOMPOSITION #12). A model may _draft_; only
deterministic registry lookup may _clear_.

### PF-03 — No security/compliance claim registry, while `security_rfp_agent` is proposed

`security_rfp_agent` (REV-G04, correctly `human_supervised_agent`) would answer security
questionnaires with no authoritative control inventory to read. Human supervision is the right
mitigation and is insufficient alone — a reviewer cannot verify a claim against a registry that
does not exist. Recorded as owner decision **D-04**.

### PF-04 — "Free-form text never grants authority" is asserted 36 times and tested zero times

The invariant appears in all 36 graphs. No test, validator, or CI gate exercises it. It is
currently an assertion about a system that does not run.

### PF-05 — The firewall has no defined behaviour on stale approval

REV-21 requires that proposal edits invalidate stale approvals.
`matrices/HUMAN_AGENT_MODE_MATRIX.csv` states it correctly for APPROVAL_EXECUTE
(_"stale edits invalidate approval"_), and 185 of 185 graph edges carry
`stale_invalidation: "on material input/version change"`. But that string is **identical on every
edge** — it is prose in a data field, with no definition of "material" and nothing to evaluate it.
Scored REV-21 NOT_IMPLEMENTED; see GRAPH_EDGE_HANDOFF_AUDIT GE-03.

## 5. Adversarial cases

| Attack                                    | Outcome today                                                                                   | Outcome if built as designed                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Seller promises a design-only capability  | **blocked by accident** — no seller, no sale, `customer_sale_allowed: false` on all 11 products | blocked, _if_ the capability registry carries module state (CAP-04) |
| Seller claims A4 autonomy                 | **blocked** — ceiling clamps to A3 (`validate-scope.mjs:453`)                                   | blocked, same mechanism                                             |
| Seller claims a compliance certification  | **not blocked** — no registry to contradict it                                                  | **not blocked** — PF-03                                             |
| Seller invents an SLA                     | **not blocked**                                                                                 | **not blocked** — no SLA registry                                   |
| Seller claims an integration is supported | **not blocked**                                                                                 | **not blocked** — no adapter conformance registry                   |
| Proposal edited after approval            | n/a                                                                                             | **not blocked** — PF-05                                             |

Three of six attacks remain open even under the design as written. That is the measure of the gap.

## 6. Required changes

1. `commercial_compliance_guard` → `deterministic_service` (**PF-02**, blocking for H7).
2. Build the security/compliance claim registry **before** `security_rfp_agent` (**PF-03 / D-04**).
3. Add SLA and adapter-conformance registries, or forbid those claim classes entirely.
4. Replace the uniform `stale_invalidation` string with a machine-evaluable predicate (**PF-05**).
5. Add an adversarial test for "free-form text never grants authority" (**PF-04**).
