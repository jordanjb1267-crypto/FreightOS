# Claim Boundary Assessment

Would the architecture, **if correctly implemented and certified**, support the intended category
claim — and what may be truthfully claimed **today**?

> "FreightOS is a logistics-native agent operating and communications network that can augment or
> automate participant operations while interoperating with existing systems and coordinating
> counterparties through governed workflows."

## 1. Verdict

**The claim is architecturally supportable and is not supportable today.** Nothing in v1.8.1
overstates the current position — the package marks every artifact `AUDIT_CANDIDATE` / `NOT_J0` and
states repeatedly that documentation cannot make a component implemented. The risk is not in the
package; it is in the claim being made _from_ the package.

## 2. Claim decomposed by evidence tier

| Claim component                      | DESIGNED | IMPLEMENTED | TESTED | ADVERSARIAL_TESTED | REPLAY_PROVEN | SHADOW_PROVEN | CUSTOMER_LIVE | AUTONOMOUS_SCOPE |
| ------------------------------------ | :------: | :---------: | :----: | :----------------: | :-----------: | :-----------: | :-----------: | :--------------: |
| "logistics-native"                   |    ✅    |     ❌      |   ❌   |         ❌         |      ❌       |      ❌       |      ❌       |        —         |
| "agent operating … network"          |    ✅    |     ❌      |   ❌   |         ❌         |      ❌       |      ❌       |      ❌       |      **A0**      |
| "communications network"             |    ✅    | **partial** |   ✅   |    **partial**     |      ❌       |      ❌       |      ❌       |        —         |
| "augment participant operations"     |    ✅    |     ❌      |   ❌   |         ❌         |      ❌       |      ❌       |      ❌       |        —         |
| "automate participant operations"    |    ✅    |     ❌      |   ❌   |         ❌         |      ❌       |      ❌       |      ❌       |      **A0**      |
| "interoperate with existing systems" |    ✅    |     ❌      |   ❌   |         ❌         |      ❌       |      ❌       |      ❌       |        —         |
| "coordinate counterparties"          |    ✅    | **partial** |   ✅   |    **partial**     |      ❌       |      ❌       |      ❌       |        —         |
| "governed workflows"                 |    ✅    |     ❌      |   ❌   |         ❌         |      ❌       |      ❌       |      ❌       |        —         |

**One component is partially implemented and genuinely tested: the communications substrate.**
Everything else is design only.

## 3. What may be claimed today, precisely

### Defensible

- FreightOS has a **governed platform substrate** with tenant isolation (`FORCE` RLS across 16
  migrations), a fail-closed legal-class × operating-context capability matrix, an append-only
  non-forgeable audit ledger, most-restrictive-wins kill switches, and database-enforced human
  approval points for privileged control-plane operations.
- FreightOS has a **network disclosure architecture** with authenticated participants, typed
  relationships, purpose ceilings, sensitivity ceilings, **minimum-necessary field projections that
  fail closed on a new schema version**, revocation-by-append, and a brokered external-transport
  permit model — implemented across migrations `0028`–`0035` and covered by integration tests.
- FreightOS has **zero external egress**, enforced by two CI gates with non-vacuous negative
  controls (`scripts/test/network-egress.test.ts` plants real primitives and requires the gate to
  fail).
- FreightOS has a **computed autonomy ceiling** that clamps declared agent autonomy to A3 at
  Horizon 1, overriding three products that declare `autonomy_max: A4`.
- FreightOS has a **complete architectural design** for a commercial plane, a market-intelligence
  substrate, and a five-participant Operational Twin, expressed in 36 schema-valid typed graphs and
  37 provisional Job Books, all marked audit candidates.

### Not defensible today

| Claim                                            | Why not                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| "FreightOS operates the network"                 | no workflow engine, no worker, no queue consumer, no dispatcher                          |
| "FreightOS automates participant operations"     | **0 of 76 accepted v1.8 jobs implemented**; no agent loop, no LLM, no tool registry      |
| "FreightOS augments a human workforce"           | **no application tier at all** — no HTTP server, route, or view; a human cannot reach it |
| "FreightOS interoperates with your TMS/WMS/ERP"  | zero adapter code; zero egress; no fact-authority binding                                |
| "FreightOS coordinates your counterparties"      | **no channel exists** — no email, portal, API, or EDI                                    |
| "FreightOS is an added employee"                 | requires the workbench (TW-38, NOT_IMPLEMENTED)                                          |
| "governed workflows"                             | no WorkUnit exists; ownership, handoff, and acceptance are absent                        |
| any autonomy claim above **A0**                  | no agent executes anything; CI clamps declarations at A3                                 |
| any security/compliance certification claim      | **no control registry exists to source it from** (PF-03)                                 |
| any SLA, scale, or "integration supported" claim | no registry, no benchmark, no conformance suite                                          |

## 4. Evidence required before each stronger claim

| To claim               | Required evidence                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IMPLEMENTED**        | the component exists in `packages/**` or a migration, is reachable from a production path, and has a caller that is not a test                                                                     |
| **TESTED**             | unit + integration coverage of the component's stated invariants, run in CI                                                                                                                        |
| **ADVERSARIAL_TESTED** | the attack list in §5 executed against the running component, each failing closed and named in the test output                                                                                     |
| **REPLAY_PROVEN**      | deterministic replay of a recorded WorkUnit history reproducing identical state and identical side-effect decisions; crash injected between state change and side effect, with no duplicate        |
| **SHADOW_PROVEN**      | the component run against real customer data with side effects suppressed, its decisions compared to the human/incumbent outcome, and the divergence reviewed                                      |
| **CUSTOMER_LIVE**      | a named customer, a signed integration, a live adapter, and reconstructable evidence of source → decision → owner → send → acknowledgement (TW-34)                                                 |
| **AUTONOMOUS_SCOPE**   | per workflow and per action: J-certified job, certified graph version, command contract, policy gate, approval gate, autonomy ceiling — **all six**, plus a kill switch that demonstrably stops it |

TW-40 already states the last of these correctly: claims of seamless coexistence or network
operation require customer-live integration and network evidence. This audit endorses that gate as
written.

## 5. Adversarial tests that must pass before any operational claim

Drawn from the audit instruction's list and the defects found. Each is currently unrunnable — there
is nothing to run them against.

1. Commercial entitlement grants runtime command authority
2. A RevenueOS agent obtains carrier/facility/broker operational permission
3. A capability SKU implies an uncertified job may execute
4. A seller promises a design-only capability
5. A partner gains cross-customer data
6. Attribution is rewritten after cash collection
7. Crash/retry duplicates a quote, order, entitlement, or commission side effect
8. A rollout label bypasses a J/A certification ceiling
9. An FMI signal reaches a command without policy and approval
10. A stale licensed rate remains CURRENT
11. A thin-lane sample is presented as high-confidence truth
12. A prompt-injected article alters tools or policy
13. A rumour becomes a confirmed operational fact
14. A correction fails to invalidate a consequential derived signal
15. Customer-private rate data appears in another participant's brief
16. A network aggregate permits re-identification
17. A remote agent acquires local tool or command authority
18. A duplicate external write lands twice in a customer's TMS
19. Learning silently rewrites approved operations
20. Two owners simultaneously believe they own one WorkUnit

Tests **7, 18 and 20** target the three defects this audit found in the shipped artifacts (GR-09,
GR-12, TW-17) and would fail today at the design level, before any code exists.

## 6. The honest position

The architecture is **coherent, unusually well-governed, and approximately three phases from its
first defensible operational claim**. What exists is a substrate and a design. What does not exist
is every layer between them: WorkUnit, graph engine, command registry, agent runtime, adapters,
channels, and any interface a human could use.

The correct claim today is about **architecture and governance**, not operation:

> FreightOS has an implemented, tested, zero-egress platform substrate with tenant isolation,
> fail-closed authority, append-only audit, kill switches, and a governed network-disclosure
> architecture — and a complete, independently audited architecture for agent operations, commercial
> capability, market intelligence, and an Operational Twin, none of which is yet implemented.

That claim is fully supported by the evidence in this review.
