# Data & Privacy Boundary Map

Commercial-plane data boundaries: least privilege, cross-tenant exposure, and the risk of RevenueOS
becoming a second source of truth.

## 1. Verdict

**The privacy substrate is the strongest part of this repository, and RevenueOS is the concern most
likely to erode it** — not through a designed violation, but because a commercial plane naturally
wants a cross-customer view, and that is precisely what the network layers were built to prevent.

## 2. What exists

| Control                                                                         | Where                                                                            | Strength                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `FORCE` RLS across 16 migrations                                                | `0002`+                                                                          | tenant isolation, forced even for table owners                               |
| Legal-class × operating-context capability matrix, fail-closed                  | `packages/context/src/capabilities.ts`; `0022`; `app.is_permitted_legal_pairing` | unknown pair ⇒ **fully denied**, not empty                                   |
| Disclosure authorization (grants, purposes, purpose ceilings, authority bases)  | `0032`                                                                           | who may receive what, and why                                                |
| Disclosure **projections** bound to one schema version, migration-authored only | `0032`                                                                           | new sensitive field **fails closed** rather than riding an old grant         |
| Disclosure **sensitivity ceiling**                                              | `0033`                                                                           | a projection cannot exceed a sensitivity bound                               |
| Grant + subscription **revocations** as separate appends                        | `0032`                                                                           | revocation is evidence, not mutation                                         |
| Authorized disclosure delivery, internal inbox only                             | `0034`                                                                           | _"ZERO EXTERNAL EGRESS… the only destination is `freightos_inbox`, a table"_ |
| External transport **permits** (brokered), zero approved modules                | `0035`; `config/network/egress-allowlist.json`                                   | egress is an owner-reviewed act                                              |
| Append-only audit + network event journal                                       | `0003`, `0029`, `0031`                                                           | reconstruction                                                               |
| Purpose gates on privileged operations                                          | `0013`, `admin.privileged_operation`                                             | why, not just who                                                            |

`packages/context/src/capabilities.ts` documents the property that matters most: _"Absence fails
closed. An unknown pair, an impermissible pair, and `brokerage` all resolve to a fully denied set
rather than to an empty one that a caller might read as 'no restriction'."_

## 3. Gaps and risks

### DP-01 — No commercial data exists, so REV-44 is unscoreable above NOT_IMPLEMENTED

There is no account, contact, opportunity, quote, or commission record to apply least privilege to.

### DP-02 — RevenueOS as a second source of truth for customer identity (the primary risk)

The adversarial list names it directly. `crm_opportunity_steward` owns identity resolution
(REV-G01 `R2_DEDUPE`, exit condition _"canonical account or duplicate link resolved"_) across five
graphs. FreightOS already has canonical identity: `tenants`, `organization_nodes`,
`legal_entities`, `network_participants`, and `network_participant_aliases` — the last being a
proper external-id→canonical-id map with namespace, `verification_status`, effective dating,
`source_system`, and revocation.

A commercial "canonical account" resolved independently of those tables **is** a second identity
system. **Required change:** commercial account identity must resolve to an existing
`organization_node` / `network_participant`, with CRM ids stored as
`network_participant_aliases` rows — never as a parallel canonical key. Recorded as conflict
**C-08**.

### DP-03 — Cross-tenant aggregation for commercial intelligence is unbounded

`account_intelligence_agent` and `expansion_agent` operate over accounts. Nothing states whether
they may read across tenants. The FMI plane has the same hazard with an explicit gate
(FMI-11 network aggregate privacy); the commercial plane has **no equivalent gate** — there is no
REV gate for cross-tenant commercial aggregation. **Required change:** add one, or bind commercial
reads to the disclosure-projection machinery. Recorded as owner decision **D-07**.

### DP-04 — Partner access is a scoped cross-tenant grant with no mechanism

See PARTNER_CHANNEL_GAP_MAP PC-02 / conflict C-06. Restated here because it is a privacy boundary,
not only a channel concern.

### DP-05 — `network.integration.volume` metering reads network data for billing

Metering the network capability makes commercial billing a **consumer of network traffic
metadata** — the most sensitive surface. `0034`'s design deliberately confines disclosure delivery
to an internal table. A meter that counts disclosures must not become a path by which one
participant's counterparty volume becomes visible commercially. Recorded as owner decision **D-02**
(shared with ENT-04).

### DP-06 — No commercial data retention, residency, or deletion position

Package file `21_SECURITY_PRIVACY_LEGAL_AND_COMPLIANCE.md` covers policy; no artifact expresses
retention or erasure for commercial records, and the repository has no retention mechanism. GDPR/CCPA
erasure interacts badly with the append-only attribution ledger required by REV-36. Recorded as
owner decision **D-08**.

## 4. Adversarial cases

| Attack                                           | Outcome today                                                 | Outcome if built as designed                          |
| ------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------- |
| Partner gains cross-customer data                | **blocked** — no partner; `FORCE` RLS                         | **at risk** — DP-04                                   |
| RevenueOS becomes second identity truth          | **blocked** — no commercial store                             | **at risk** — DP-02                                   |
| Commercial aggregation re-identifies a customer  | **blocked** — no data                                         | **at risk** — DP-03                                   |
| Network expansion leaks counterparty data        | **blocked** — disclosure projection fails closed; zero egress | blocked, _if_ commercial reads go through projections |
| Customer-private rate leaks into another's brief | **blocked** — no FMI data                                     | see FMI-10/FMI-11                                     |
| Metering exposes counterparty volume             | **blocked** — no meter                                        | **at risk** — DP-05                                   |

## 5. Required changes

1. Commercial account identity resolves to `organization_node` / `network_participant`; CRM ids
   become `network_participant_aliases` (**DP-02 / C-08**, blocking).
2. Partner and cross-tenant commercial reads go through disclosure projections (**DP-03, DP-04**).
3. Add a REV gate for cross-tenant commercial aggregation — none of REV-01..48 covers it
   (**DP-03**).
4. Answer retention/erasure vs append-only attribution before building the ledger (**DP-06 / D-08**).
