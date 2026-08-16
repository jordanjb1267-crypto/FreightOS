# Network Ingress / Egress Audit

Outbound projection (internal Twin → minimum-necessary network artifact) and inbound handling
(network artifact → authenticated, purpose-checked, locally-evaluated WorkUnit), plus the rule that
**authority never transfers with a message**.

## 1. Verdict

**This is the strongest alignment between v1.8.1 and the accepted repository.** The disclosure
machinery the Twin needs for outbound projection is built, tested, and fails closed. The gaps are on
the inbound-vocabulary side and, decisively, on non-native counterparty reach — which is zero,
by CI gate.

## 2. Outbound — design and substrate agree

### The design

`matrices/NETWORK_PROJECTION_MATRIX.csv` names, per participant profile, what stays private and what
may be projected:

| Profile | Internal-private                                                      | Candidate network artifacts                              | Projection rule                                            |
| ------- | --------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| COT     | private cost/payroll/internal dispatch notes                          | capacity, ETA, milestone, tender response, readiness     | purpose / relationship / minimum fields                    |
| BOT     | **other carrier bids, margin strategy**, internal qualification notes | quote, tender, shipment execution request, status        | commercial/relationship policy; **no competitive leakage** |
| FOT     | **full production schedule**, internal staffing, unrelated inventory  | readiness, appointment, arrival, dock/detention evidence | facility-purpose projection only                           |
| SOT     | procurement strategy, supplier/internal order data                    | shipment intent, requirements, tender, exception request | shipment-purpose projection only                           |
| SPOT    | other customers, private parts/labor economics                        | capacity, estimate, service status, completion evidence  | case/relationship projection only                          |

This matches the Section 11 examples exactly: carrier exposes capacity without payroll, cost or
margin floors; facility exposes appointment status without its production schedule; broker transmits
a tender without competing bids or internal margin.

### The substrate — already built

| Requirement                          | Implementation                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Purpose                              | `network_disclosure_purposes`, `network_disclosure_purpose_ceilings` (`0032`)                    |
| Relationship                         | `network_participant_relationships`, `network_relationship_types` (`0028`)                       |
| Classification / sensitivity         | `network_disclosure_sensitivities`, `network_schema_disclosure_sensitivity` (`0033`)             |
| **Minimum-necessary projection**     | `network_disclosure_projections` + `network_disclosure_projection_fields` (`0032`)               |
| Authority basis                      | `network_disclosure_authority_bases` (`0032`)                                                    |
| Grant + revocation                   | `network_disclosure_grants`, `_grant_revocations`, `_subscriptions`, `_subscription_revocations` |
| Routing                              | `network_disclosure_routing_resolutions`                                                         |
| Delivery                             | `network_disclosure_deliveries`, `network_delivery_attempts` (`0034`)                            |
| Canonical artifact schema versioning | `network_schema_versions` (`0028`)                                                               |

Two properties make this genuinely strong:

- A projection binds to **exactly one** `durable_schema_ref`. The table comment states: _"A new
  payload schema version has NO projection until one is authored, which is what makes a new
  sensitive field fail closed instead of riding in on an old grant."_
- Projections are **migration-authored only**: _"there is no runtime projection administration path,
  so every projection is reviewed before it can authorize anything."_

**TWIN-G08 (`NetworkProjectionWorkUnit`) can be implemented on existing primitives** — the only Twin
graph for which that is true. TW-26 and TW-27 score PARTIAL on this substrate.

## 3. Inbound — the authority rule is correct

`TWIN-G07` (`NetworkInboundWorkUnit`) has **no side effects** — inbound artifacts cannot act.
`TWIN-G09` (`CounterpartyCoordinationWorkUnit`) carries the authority check
`receiver_independent_authority`, and `TWIN-G08` carries `origin_participant_authority`.

The substrate agrees: `network_disclosure_inbox` (`0034`) is a **table**, and migration `0034`'s
header states _"ZERO EXTERNAL EGRESS. The only destination … is `freightos_inbox`, a table"_ and
_"No publisher, no webhook, no broker, no queue adapter, no delivery worker daemon, no retry job, no
subscriber API"_. An inbound artifact lands as data and is evaluated locally.

**A remote agent cannot acquire local tool or command authority**, because there is no path from an
inbox row to a command — no dispatcher, no tool registry, and no command executor. TW-30 scores
PARTIAL: correct by design and by current absence, untested.

## 4. Gaps

### NE-01 — Non-native counterparties cannot be reached at all _(blocking for TW-28)_

Section 11 requires support for email, links, portal, API, EDI, partner adapters and legacy systems,
so FreightOS does not require simultaneous multi-sided adoption. Current state:

| Channel          | Status                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Email            | **none** — W0/W1: `grep -rniE "email\|sms\|smtp\|twilio\|sendgrid\|notification" packages/*/src` → **0** |
| Portal / links   | **none** — no application, no route, no UI                                                               |
| API (outbound)   | **none** — egress `expectedCount: 0`                                                                     |
| EDI              | **none**                                                                                                 |
| Partner adapters | **schemas only**, zero code                                                                              |

`config/network/egress-allowlist.json` has zero approved modules and its own comment records that
adding one _"is an owner-reviewed act"_. The N7-A foundation (`0035`, brokered transport permits)
is the correct control plane and ships with **no primitive at all**.

**Consequence:** the "does not require simultaneous multi-sided adoption" property — arguably the
network's central commercial claim — is **entirely unimplemented**. TW-28 NOT_IMPLEMENTED. This is
the single largest gap between the Twin's promise and the repository.

### NE-02 — No vocabulary mapping

TW-29 requires local vocabulary to map to canonical network semantics. `network_schema_versions`
provides canonical _schemas_; nothing maps a customer's local terms (their status codes, stop types,
accessorial names) onto them. Without it, either every customer's vocabulary leaks into canonical
artifacts, or adapters fork per vendor — the failure mode SR-05 warns about.

### NE-03 — Inbound purpose verification is not modelled in the graph

TW-25 requires inbound artifacts to authenticate sender, relationship **and purpose**. The substrate
supports all three (`network_disclosure_purposes`, `_participant_relationships`, alias
`verification_status`). TWIN-G07's edges do not enumerate a purpose check. PARTIAL.

### NE-04 — Two Twin network sends are not idempotent

`TWIN-G08 NP5_SEND`, `TWIN-G09 CP2_SEND` and `CP4_RETURN` are `external_communication` with
`bounded_retry`. A duplicated tender response or counterparty reply is a real-world commercial
event. The repository already models idempotent transport intent
(`network_transport_intents`, `0030`) — adopt it. See GF-02.

### NE-05 — No kill switch on any network graph

Zero of 12 Twin graphs reference the kill switch, including the three that communicate externally.
Conflict **C-12**.

## 5. Adversarial cases

| Attack                                                     | Outcome               | Basis                                                                    |
| ---------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| Remote agent gains local tool/command authority            | **blocked**           | inbox is a table; no dispatcher; `receiver_independent_authority`        |
| Authority transfers with a message                         | **blocked**           | independent local evaluation; no path from artifact to command           |
| Network expansion leaks confidential counterparty data     | **blocked**           | projection bound to one schema version, migration-authored, fails closed |
| New sensitive field rides an old grant                     | **blocked**           | explicit design property of `network_disclosure_projections`             |
| Broker's competing bids leak in a tender                   | **blocked by design** | NETWORK_PROJECTION_MATRIX BOT row; projection fields enumerated          |
| Facility production schedule leaks with appointment status | **blocked by design** | FOT row; facility-purpose projection only                                |
| Duplicate counterparty message on retry                    | **at risk**           | NE-04                                                                    |
| Cross-tenant network path                                  | **blocked**           | `FORCE` RLS + disclosure grants                                          |
| Non-native counterparty participates                       | **impossible**        | NE-01 — no channel exists                                                |

Eight of nine attacks are blocked. The ninth is not an attack but an absence: nobody outside the
system can be reached at all.

## 6. Required changes

1. Decide the first governed egress channel and its allowlist entry — an explicit architectural
   event (**NE-01**, blocking for the network claim; owner decision **D-03**).
2. Vocabulary mapping layer, so adapters do not fork (**NE-02**).
3. Enumerate the purpose check on inbound edges (**NE-03**).
4. Idempotent network sends using the existing transport-intent pattern (**NE-04**).
5. Kill-switch check on every externally-communicating node (**NE-05 / C-12**).
