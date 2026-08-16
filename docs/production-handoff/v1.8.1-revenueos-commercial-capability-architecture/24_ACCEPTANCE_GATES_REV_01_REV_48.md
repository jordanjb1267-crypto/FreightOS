# 24 — RevenueOS Acceptance Gates (REV-01..REV-48)

Use the strict status vocabulary already controlling in the repository audit context: `PASS`, `PARTIAL`, `FAIL`, `NOT IMPLEMENTED`, `NOT APPLICABLE` with rationale. Documentation alone cannot make a runtime gate PASS.

| ID | Gate | Minimum evidence |
|---|---|---|
| REV-01 | Canonical product registry exists | versioned registry + ownership + CI validation |
| REV-02 | Product/Twin/capability hierarchy explicit | schema + fixtures + repository mapping |
| REV-03 | Capability is contract boundary, not agent identity | mappings show many-to-many implementation support |
| REV-04 | Sellable lifecycle status governed | transition policy + approvals + tests |
| REV-05 | Catalog is single commercial source | consumers identified; shadow catalog blocked/detected |
| REV-06 | Entitlement is versioned | schema + lifecycle tests |
| REV-07 | Entitlement cannot authorize commands | negative authorization tests |
| REV-08 | Activation state separate | independent state/gate tests |
| REV-09 | Bundle expands to atomic entitlements | deterministic expansion tests |
| REV-10 | Capability dependencies enforced | invalid activation/quote denied |
| REV-11 | Seller authority profile explicit | schema + policy tests |
| REV-12 | Absence of seller grant fails closed | negative tests |
| REV-13 | Partner isolation enforced | cross-partner/customer negative tests |
| REV-14 | Deal registration deterministic/audited | conflict/replay tests |
| REV-15 | Account identity/deduplication controlled | duplicate/entity tests |
| REV-16 | Opportunity stage evidence defined | workflow/state tests |
| REV-17 | Revenue WorkUnits durable where required | restart/recovery evidence |
| REV-18 | Commercial orchestrator has no super-authority | negative tests |
| REV-19 | Revenue agents have no logistics operating authority | command/Twin-write denial tests |
| REV-20 | Promise Firewall covers protected claims | policy + adversarial suite |
| REV-21 | Proposal edits invalidate stale approvals | tamper/version tests |
| REV-22 | Roadmap claims controlled | unsupported-date tests |
| REV-23 | Security/compliance claims sourced | trust-registry linkage + negative tests |
| REV-24 | Scale/performance claims evidence-backed | evidence reference required |
| REV-25 | Pricing arithmetic deterministic | golden tests/property tests |
| REV-26 | Discount limits deterministic | boundary/override tests |
| REV-27 | Quote versions immutable/reconstructable | history/replay tests |
| REV-28 | ROI assumptions distinguish fact vs estimate | schema + rendering tests |
| REV-29 | Closed-won handoff is structured | contract/fixture + validation |
| REV-30 | Implementation may reject unsupported handoff | state/exception tests |
| REV-31 | Sales cannot activate production capability | negative tests |
| REV-32 | Expansion uses same controls as initial sale | workflow tests |
| REV-33 | Commission plan versioned | schema + effective-date tests |
| REV-34 | Commission based on authoritative events | source/reconciliation proof |
| REV-35 | Duplicate collection cannot double-pay | idempotency tests |
| REV-36 | Attribution history append-only/correctable | mutation/correction tests |
| REV-37 | Split rules deterministic | property tests |
| REV-38 | Clawback/correction linked to original | ledger tests |
| REV-39 | Calculation cannot move money | authorization separation proof |
| REV-40 | Commission disputes preserve evidence | dispute workflow tests |
| REV-41 | Seller certification gates authority | promotion/expiry tests |
| REV-42 | Partner certification gates rights | negative + expiry tests |
| REV-43 | Prospecting/outreach obeys legal/policy controls | policy tests + audit |
| REV-44 | Commercial data least-privilege | tenant/purpose/export tests |
| REV-45 | External AI messages bounded | approval/promise/injection tests |
| REV-46 | Commercial observability measures revenue quality | dashboards/definitions/evidence |
| REV-47 | Network expansion does not misuse confidential data | data-use negative tests |
| REV-48 | No implementation claim relies on docs alone | repo SHA + executable evidence |

## Blocking rules

Any `FAIL` in REV-07, 12, 13, 19, 20, 23, 25, 26, 31, 34, 35, 39, 43, 44, 45, or 47 blocks production RevenueOS activation for the affected surface.

The cross-package audit may identify stricter inherited blockers; those also block.

## FMI gate family

REV-01..REV-48 remain the commercial-plane gate family. Market-intelligence architecture has a separate additive gate family, **FMI-01..FMI-28**, defined in `37_MARKET_INTELLIGENCE_TESTS_AND_ACCEPTANCE_GATES.md`. Neither family weakens the other.
