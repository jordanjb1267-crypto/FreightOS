# 49 — End-to-End Owner Implementation Sequence

## Purpose

This sequence is the controlling owner workflow for installing, auditing, and only then advancing FreightOS beyond this v1.8.1 architecture package.

The word **implementation** is deliberately split into three distinct acts:

1. **Install the immutable handoff package** into the FreightOS repository.
2. **Audit the package against accepted architecture and current repository reality** without changing runtime behavior.
3. **Authorize a later implementation plan** only after the owner reviews the audit result.

No runtime RevenueOS/FMI implementation, market-data ingestion, seller activation, commission payout, operational-command activation, or v1.9 continuation is authorized by steps 1 or 2.

---

## Phase A — Preserve current repository state

From the real FreightOS repository root:

```bash
cd /Users/jordanburwell/Developer/FreightOS

git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse main
git rev-parse origin/main
```

### Required gate A1

Proceed only when the working tree state is understood and intentionally preserved.

If the tree is dirty, do not delete, stash, reset, checkout, or move work merely to force a clean state. Record the state and resolve it under normal repository governance first.

### Required gate A2

The preserved unaccepted v1.9 draft remains quarantined. Do not inspect it for design evidence during this sequence.

---

## Phase B — Install v1.8.1 as documentation-only architecture

### B1 — Update accepted main

Only from a clean/authorized state:

```bash
git switch main
git pull --ff-only origin main
git status --short
```

Expected: clean working tree.

### B2 — Create an installation branch

```bash
git switch -c setup/install-revenueos-commercial-capability-v1.8.1
```

### B3 — Extract/copy the package

If the ZIP is in Downloads:

```bash
cd "$HOME/Downloads"
unzip -q FreightOS_v1.8.1_RevenueOS_Commercial_Capability_Architecture.zip
```

Then:

```bash
cd /Users/jordanburwell/Developer/FreightOS
mkdir -p docs/production-handoff
cp -R \
  "$HOME/Downloads/FreightOS_v1.8.1_RevenueOS_Commercial_Capability_Architecture" \
  "docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture"
```

If the destination already exists unexpectedly, stop and inspect. Do not merge two package copies by hand.

### B4 — Verify package integrity

```bash
cd docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture
shasum -a 256 -c MANIFEST.sha256
cd "$(git rev-parse --show-toplevel)"
```

Every manifest entry must report `OK`.

### B5 — Verify documentation-only scope

```bash
git status --short
git diff --stat
git diff --name-only
```

Expected changes are confined to:

```text
docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture/
```

Forbidden installation changes include runtime source, migrations, permissions, RLS, dependencies, credentials, `.env`, pricing configuration, live integrations, existing accepted handoff rewrites, or production agent activation.

### B6 — Stage and inspect

```bash
git add docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture

git diff --cached --stat
git diff --cached --name-only
```

### B7 — Commit

```bash
git commit -m "docs: install FreightOS RevenueOS capability architecture v1.8.1"
```

### B8 — Run current repository governance/CI checks

Use the exact checks defined by the current FreightOS repository. At minimum, where present, run:

- handoff package hash/integrity validation;
- handoff provenance/drift validation;
- formatting/docs/schema validation;
- network/governance validation;
- security/secret scan;
- any CI step required for documentation-only handoff PRs.

Do not weaken, skip, rename, or substitute a failing gate merely to obtain green status.

### B9 — Push

```bash
git push -u origin setup/install-revenueos-commercial-capability-v1.8.1
```

Open a documentation-only PR using `PR_BODY.md` as the basis for the PR description.

### B10 — Review and merge under normal governance

Do not self-declare the architecture implemented. This merge establishes the package as accepted documentation only.

---

## Phase C — Refresh accepted main after package merge

After the installation PR is accepted/merged:

```bash
cd /Users/jordanburwell/Developer/FreightOS
git switch main
git pull --ff-only origin main
git status --short
```

Record:

```bash
git rev-parse HEAD
git rev-parse origin/main
```

Expected: local `main == origin/main`, clean tree.

---

## Phase D — Launch an independent Claude cross-package audit

### D1 — Start a new Claude Code session

Use a new session rooted at:

```text
/Users/jordanburwell/Developer/FreightOS
```

Do not continue the v1.9 design session for this audit.

### D2 — Copy the controlling audit prompt

```bash
pbcopy < \
docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture/28_CLAUDE_CROSS_PACKAGE_AUDIT_PROMPT.md
```

Paste it into the new Claude session.

### D3 — Audit-only branch

Claude is instructed to create/use:

```text
audit/revenueos-commercial-capability-pre-v1.9
```

It must inspect accepted v1.3–v1.8 packages, current main implementation, migrations, tests, CI, WorkUnit/durable-graph infrastructure, authority, network, existing Job Books and workforce artifacts.

It must not inspect the quarantined unaccepted v1.9 draft for design evidence.

### D4 — Required audit surfaces

Claude must separately audit:

1. canonical Product → Twin → Capability → Job/Component → Graph hierarchy;
2. commercial entitlement versus operational activation/authority;
3. RevenueOS commercial-plane isolation;
4. seller/partner classes and authority;
5. Sales Promise Firewall;
6. pricing/discount/quote/deal-desk boundaries;
7. attribution/commission/payout separation;
8. implementation handoff;
9. shared Freight Market Intelligence substrate;
10. source rights/provenance/freshness/conflict/correction rules;
11. participant-specific market relevance;
12. FMI-to-Carrier operational consumption;
13. FMI-to-Broker operational consumption;
14. FMI-to-Facility/Shipper/RigDesk consumption;
15. all 37 provisional Job Books against the accepted 76-job workforce;
16. all 36 typed durable graphs, including TWIN-G01..TWIN-G12, against existing workflow/runtime architecture;
17. all typed edge artifacts, WorkUnit envelopes, ownership and cross-plane handoffs;
18. failure/retry/idempotency/reconciliation/stale-version behavior;
19. graph and job certification interaction;
20. cross-package conflicts and stricter-rule precedence.

### D5 — Required acceptance-gate scoring

Claude must score all four families using only reproducible repository evidence:

```text
REV-01..REV-48   (48)
FMI-01..FMI-28   (28)
GR-01..GR-32     (32)
TW-01..TW-40     (40)
---------------------
TOTAL            148
```

Allowed statuses:

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT IMPLEMENTED`
- `NOT APPLICABLE` with rationale

Documentation presence alone cannot produce `PASS` for runtime implementation.

### D6 — Required audit outputs

Claude must produce a repository-local audit package under:

```text
docs/revenueos-architecture-review/
```

At minimum:

```text
README.md
CURRENT_PRODUCT_COMMERCIAL_INVENTORY.md
CAPABILITY_GRAPH_GAP_MAP.md
ENTITLEMENT_ACTIVATION_GAP_MAP.md
REVENUE_PLANE_AUTHORITY_MAP.md
REVENUE_WORKFORCE_DECOMPOSITION.md
PROMISE_FIREWALL_GAP_MAP.md
PARTNER_CHANNEL_GAP_MAP.md
ATTRIBUTION_COMMISSION_GAP_MAP.md
FMI_ARCHITECTURE_GAP_MAP.md
FMI_WORKFORCE_DECOMPOSITION.md
MARKET_SOURCE_AND_PROVENANCE_GAP_MAP.md
OPERATIONAL_CONSUMPTION_BOUNDARY_MAP.md
GRAPH_RUNTIME_COMPATIBILITY_MAP.md
GRAPH_NODE_OWNERSHIP_AUDIT.md
GRAPH_EDGE_HANDOFF_AUDIT.md
GRAPH_FAILURE_REPLAY_GAP_MAP.md
JOB_BOOK_OVERLAP_AND_MERGE_MAP.md
REV_01_REV_48_MATRIX.md
FMI_01_FMI_28_MATRIX.md
GR_01_GR_32_MATRIX.md
CROSS_PACKAGE_CONFLICT_REGISTER.md
PROPOSED_ADDITIVE_PR_SEQUENCE.md
OWNER_DECISIONS.md        # only when genuinely unresolved
```

### D7 — Mandatory stop

Claude must stop after the audit. It is not authorized to:

- implement runtime RevenueOS/FMI;
- create migrations/tables;
- change production permissions;
- register or enable candidate jobs;
- ingest live market/news data;
- connect CRM/data vendors;
- activate sellers/partners;
- create commission payouts;
- change pricing;
- activate operational commands;
- read/use the quarantined v1.9 draft as evidence;
- continue v1.9.

---

## Phase E — Owner review gate

Bring back the complete Claude audit report and preferably the audit branch diff/package.

The owner review must answer:

1. Which v1.8.1 candidates are already implemented under different names?
2. Which candidate jobs duplicate or overlap accepted v1.8 Job Books?
3. Which responsibilities should be deterministic services rather than agents?
4. Which graph definitions fit existing durable execution unchanged?
5. Which graphs need translation into current repository-native workflow primitives?
6. Which cross-plane handoffs conflict with accepted authority/data rules?
7. Which proposed capabilities require new product/catalog primitives?
8. Which REV/FMI/GR gates are already satisfied by accepted runtime evidence?
9. Which failures are architectural blockers versus expected NOT IMPLEMENTED items?
10. What is the minimum additive implementation sequence that preserves main and existing production behavior?

### Audit verdict vocabulary

Use one of:

- `COHERENT`
- `COHERENT_WITH_REQUIRED_CHANGES`
- `BLOCKED`

No runtime implementation proceeds on `BLOCKED`.

---

## Phase F — Build the repository-specific implementation plan

Only after owner acceptance of the audit should the next package/branch convert surviving architecture candidates into implementation PRs.

The implementation sequence should be additive and dependency-ordered. A typical order is:

1. canonical catalog/capability contracts;
2. entitlement model and non-authoritative activation intent;
3. RevenueOS authority plane and Promise Firewall primitives;
4. repository-native WorkUnit/typed graph contracts or adapters;
5. surviving RevenueOS deterministic services/jobs at J0/J1 only;
6. FMI source registry/provenance contracts without live ingestion;
7. FMI deterministic normalization/quality services;
8. surviving FMI intelligence jobs in offline/replay environments;
9. customer relevance/impact calculation in non-operational mode;
10. cross-plane read-only operational consumption adapters;
11. shadow certification;
12. bounded commercial workflows;
13. seller/partner/attribution/commission accounting controls;
14. production capability activation only when technical certification and legal/commercial approvals both permit it.

Each PR must have its own tests, rollback/failure proof, exact authority change inventory, and no broader autonomy than required.

---

## Phase G — Relationship to v1.9

v1.9 remains paused during installation and audit.

After the audit, choose explicitly among:

1. v1.8.1 requires corrections before v1.9;
2. RevenueOS/FMI foundations become explicit prerequisites incorporated into the final v1.9 architecture;
3. RevenueOS/FMI can proceed as a parallel additive implementation stream without changing v1.9's core workforce scope;
4. material conflict requires redesign before either stream proceeds.

Do not merge the quarantined v1.9 draft merely because v1.8.1 exists.

---

## Final owner rule

The sequence is:

```text
INSTALL DESIGN
      ↓
VERIFY PACKAGE + CI
      ↓
MERGE DOCUMENTATION ONLY
      ↓
INDEPENDENT CROSS-PACKAGE AUDIT
      ↓
OWNER REVIEW
      ↓
REPOSITORY-SPECIFIC IMPLEMENTATION PLAN
      ↓
IMPLEMENT IN SMALL ADDITIVE PRs
      ↓
CERTIFY JOBS + GRAPHS
      ↓
SHADOW / REPLAY / FAILURE PROOF
      ↓
BOUNDED ACTIVATION
      ↓
ONLY THEN RESOLVE v1.9 CONTINUATION
```

No skipped arrow is authorized by this handoff.

## Operational Twin coexistence dependency gate

Before any later runtime implementation sequence is approved, the audit must resolve:

1. repository-native Twin representation and customer correction surface;
2. system/fact authority binding model;
3. adapter mapping/synchronization/conformance model;
4. human+agent shared WorkUnit ownership;
5. governed external writeback/reconciliation;
6. Twin learning/change proposal path;
7. network inbound/outbound projection path;
8. non-native counterparty bridge;
9. Twin experience-mode configuration versus actual authority;
10. TW-01..TW-40 evidence gaps.

A likely dependency order after audit is: read-only system binding → Twin projection/reconciliation → human assist/workbench → network ingress/egress → controlled writeback → learning/change control → workflow-specific approval execution → bounded autonomy. The audit may change this order.
