# Owner Decisions Required

Decisions this audit is **not** authorized to make, and that no amount of further repository
evidence would resolve. Each names the blocked work, the options, and the audit's recommendation.

Sixteen decisions. Four are blocking for Phase 0/1 and are marked **BLOCKING**.

---

## D-01 — Capability → job binding _(BLOCKING for the capability model)_

**Question.** Ten of 13 rows in `matrices/CAPABILITY_PACK_CATALOG.csv` set `illustrative_jobs` to
"determined by audit". Which accepted jobs implement each capability?
**Why the audit cannot answer.** Binding capabilities to jobs would promote 37 `AUDIT_CANDIDATE`
Job Books toward J0, which the instruction prohibits.
**Blocks.** REV-02 (FAIL), REV-10, the entire capability model, P5-1.
**Recommendation.** Resolve only after the 37 candidates are dispositioned per
`JOB_BOOK_OVERLAP_AND_MERGE_MAP.md` (37 → 30). Bind to accepted v1.8 jobs, never to candidates.

## D-02 — Network usage metering

**Question.** Should `network.integration.volume` meter network traffic for billing?
**Trade-off.** Metering makes commercial billing a consumer of network-traffic metadata — the most
privacy-sensitive surface in the repository, deliberately confined by `0034` to an internal table.
**Blocks.** ENT-04, DP-05.
**Recommendation.** Defer. If pursued, meter through a disclosure projection with a sensitivity
ceiling, never a direct query.

## D-03 — First governed egress channel _(BLOCKING for Phases 3–5)_

**Question.** What is the first entry in `config/network/egress-allowlist.json`
(currently `expectedCount: 0, modules: []`)?
**Why it matters.** One decision unblocks RevenueOS outreach, FMI ingestion, Twin adapters,
counterparty channels **and the workbench HTTP server**. The manifest states adding an entry _"is an
owner-reviewed act"_.
**Recommendation.** Choose one, narrowly. The audit's order of preference: (1) the application-tier
HTTP server, since it unlocks human value with no third-party dependency; (2) a single read-only
`official_public` FMI source; (3) one read-only TMS adapter for COT.

## D-04 — Security/compliance claim registry

**Question.** Build a control registry before `security_rfp_agent`, or forbid the claim class?
**Blocks.** REV-23, FMI-26, PF-03.
**Recommendation.** Forbid the claim class until the registry exists. Human supervision cannot
verify a claim against a registry that does not exist.

## D-05 — Territory and account-ownership precedence

**Question.** When a partner and a direct seller both claim an account, who wins?
**Blocks.** REV-14, PC-03, PC-04.
**Recommendation.** Model on `organization_node_closure`; make precedence deterministic and
auditable. This is a commercial-policy decision, not an engineering one.

## D-06 — Commission plan incentive design

**Question.** What prevents a commission plan from incentivising unsupported selling?
**Why the audit cannot answer.** Plan design is a business decision; the repository cannot evidence
it.
**Recommendation.** Mitigate structurally via the Promise Firewall (P5-2) rather than through plan
economics alone.

## D-07 — Cross-tenant commercial aggregation

**Question.** May commercial components read across tenants for account intelligence and expansion?
**Gap.** **No REV gate covers this** — REV-44 addresses least privilege, not aggregation. FMI has an
explicit gate (FMI-11); the commercial plane has none.
**Recommendation.** Default deny; add a REV gate; if permitted, only via disclosure projection.

## D-08 — Retention/erasure vs append-only attribution

**Question.** How do GDPR/CCPA erasure rights interact with the append-only attribution ledger
REV-36 requires?
**Blocks.** DP-06, P5-7.
**Recommendation.** Resolve before building the ledger — retrofitting erasure into an append-only
financial record is materially harder than designing for it.

## D-09 — Disposition of the quarantined v1.9 draft

**Fact.** Branch `design/v1.9.0-workforce-operational-design-completion` @ `d5aa458` exists and was
left untouched; **no content was read**. The working-tree path
`docs/production-handoff/v1.9.0-workforce-operational-design-completion/` contains **zero files** —
eight empty directories left by a prior branch switch, which is why `git status` does not show it.
**Question.** Keep quarantined, review, or discard?
**Recommendation.** Keep quarantined until this audit is reviewed. Note that its empty directory
structure (`job_books/{facility,service_provider,shipper}`, `matrices`, `registries/fragments`,
`simulations`) suggests it addresses the operational Job Book gap — which overlaps Phase 0-7. Worth
reviewing **before** authoring 56 new Job Books, to avoid duplicating work already drafted.

## D-10 — Authoring 56 missing Job Books _(BLOCKING for Phase 0)_

**Question.** Who authors the 50 Twin and 6 cross-plane Job Books, and to which standard?
**Fact.** `schemas/provisional-job-book.schema.json` makes Twin Job Books **inexpressible**
(`plane` enum excludes twin; `graph_membership` excludes `TWIN-G##`). 55 of 90 graph owners are
unbooked.
**Blocks.** GR-03, GR-31, TW-17, all Twin certification.
**Recommendation.** Fix the schema first (P0-6), check D-09 for existing drafts, then author. This
is the largest single piece of Phase 0 work.

## D-11 — Pre-adapter Twin value path

**Question.** Should a manual/upload-based Twin onboarding exist so a human-heavy customer gets
value before any adapter?
**Why it matters.** The design supports pre-autonomy value through OBSERVE/ASSIST, but even OBSERVE
requires reading the customer's system — so today there is **no path to any Twin value** without
adapters and egress.
**Recommendation.** Yes. A manual-entry or file-upload Twin is the shortest route to a demonstrable
customer outcome and does not require D-03.

## D-12 — Twin profile scope vs horizon _(BLOCKING for Phase 3)_

**Question.** BOT, FOT and SOT target modules with `implementation_allowed: false`
(`digital_brokerage` LEGAL_AND_MARKET_GATED; `facilityos_lite`, `shipper_control_tower`
PROMOTION_GATED). Promote, or scope the first Twin to COT/SPOT?
**Recommendation.** Scope to **COT or SPOT**. Promotion requires the full
`module_states.yaml` `promotion_requires` set (owner-approved ADR, predecessor exit evidence,
applicable gate, machine-readable state update, reviewed PR) and should not be spent on a Twin that
has not yet proven itself on one profile.

## D-13 — Introducing an application tier

**Question.** Add an application tier (HTTP server, routes, UI)?
**Constraint.** The zero-egress gate currently forbids `node:http` in import position, so the first
UI is gated by the **same** control as the first outbound integration.
**Blocks.** TW-38, the entire workbench, all human-facing value.
**Recommendation.** Yes, and treat it as the first egress-allowlist entry (D-03). Without it,
FreightOS has no surface a customer can use.

## D-14 — Renaming the commercial capability object

**Question.** What replaces `capability` on the commercial side?
**Why.** The repository already uses `Capability` for a fail-closed runtime _restriction_
(`packages/context/src/capabilities.ts`, ADR-0019); v1.8.1 uses it for a commercial _grant_.
Opposite polarity, one word.
**Recommendation.** `capability_pack` (matches the existing catalog filename) or
`entitled_capability`. Decide before any code is written — renaming later touches schemas, matrices,
and every entitlement path.

## D-15 — Per-participant graphs vs one shared consumption graph

**Question.** Give XPL-G02..G06 distinct WorkUnit types and domain gates, or collapse them into
XPL-G01?
**Fact.** All six currently share identical `nodes`, `edges`, `terminal_states`, `trigger` and
`workunit_type` (`OperationalDecisionWorkUnit`), so five "domain-specific" controls are one control
with five names.
**Recommendation.** Split. Carrier, broker, facility, shipper and maintenance decisions sit in
different legal planes with different prohibitions (brokerage legal gate; FacilityOS
motion-control), and those differences must live in the state machines, not in a CSV.

## D-16 — Lifting `billing_enabled` / `customer_sale_allowed`

**Question.** When may `products.yaml` set either to `true`?
**Fact.** Both are `false` on all 11 products and CI-asserted (`validate-scope.mjs:402-409`);
`stop_after_horizon: 1` is asserted at `:38`.
**Recommendation.** Not before Phase 5 completes **and** a horizon promotion is approved. This is
currently the strongest single protection against every commercial-plane failure mode in the
adversarial list, and it should be the last thing relaxed.

---

## Decisions blocking each phase

| Phase                          | Blocking decisions                       |
| ------------------------------ | ---------------------------------------- |
| **Phase 0** — package repair   | D-10, D-14, D-15                         |
| **Phase 1** — shared substrate | none                                     |
| **Phase 2** — egress           | D-03, D-13                               |
| **Phase 3** — Twin             | D-11, D-12                               |
| **Phase 4** — FMI              | D-02 (only if metering)                  |
| **Phase 5** — RevenueOS        | D-01, D-04, D-05, D-06, D-07, D-08, D-16 |
