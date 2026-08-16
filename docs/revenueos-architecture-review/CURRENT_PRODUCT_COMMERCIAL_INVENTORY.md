# Current Product & Commercial Inventory

What commercial machinery exists in the repository at `54c55c5`, proven from code, config, schema,
migration, or CI gate. Handoff prose is not evidence here.

## 1. Summary

FreightOS has a **product catalog and a horizon/state governance system**. It has **no commercial
transaction system**. Nothing can be quoted, entitled, activated, billed, or paid, and CI actively
asserts that this remains true.

| Concern                          | Exists?              | Evidence                                                                                      |
| -------------------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| Product registry                 | **YES**              | `config/pricing/products.yaml` (11 products, `version: 1.2.0`)                                |
| Plan/price sheets                | **YES (declared)**   | 6 further YAMLs under `config/pricing/`                                                       |
| Build/commercial lifecycle state | **YES, CI-enforced** | `config/scope/module_states.yaml`; `scripts/validate-scope.mjs`                               |
| Sale prohibition                 | **YES, CI-enforced** | `validate-scope.mjs:407-409`                                                                  |
| Billing prohibition              | **YES, CI-enforced** | `validate-scope.mjs:402-404`                                                                  |
| Entitlement model                | **NO**               | no table, no schema, no code (`entitlement` → 0 hits in executed migrations)                  |
| Subscription / SKU / order       | **NO**               | no table; `sku` → 0 hits                                                                      |
| Quote / proposal / discount      | **NO**               | no table, no code                                                                             |
| Invoice / payment / payout       | **NO**               | `invoices`, `billing_accounts`, `meter_events` exist **only** in never-executed reference DDL |
| Commission / attribution         | **NO**               | `commission` → 0 hits in executed migrations                                                  |
| Seller / partner identity        | **NO**               | no seller, partner, or channel construct                                                      |
| CRM integration                  | **NO**               | no HTTP client; egress pinned at zero                                                         |

## 2. The product registry — what it actually says

`config/pricing/products.yaml`, 11 products. Every one carries the same two commercial locks:

| Product id                     | Revenue category | `autonomy_max` | `build_state`            | `commercial_status`   |
| ------------------------------ | ---------------- | -------------- | ------------------------ | --------------------- |
| `carrier_core`                 | saas             | A0             | ACTIVE_BUILD             | LAUNCH_CATALOG_TARGET |
| `carrier_copilot`              | saas             | A3             | ACTIVE_BUILD             | LAUNCH_CATALOG_TARGET |
| `carrier_autonomous`           | saas             | A4             | PROMOTION_GATED          | PRE_LAUNCH_TARGET     |
| `shipper_control_tower`        | saas             | A3             | PROMOTION_GATED          | PRE_LAUNCH_TARGET     |
| `digital_brokerage`            | brokerage        | —              | LEGAL_AND_MARKET_GATED   | PRE_LAUNCH_TARGET     |
| `freight_exchange`             | exchange         | —              | LIQUIDITY_GATED          | PRE_LAUNCH_TARGET     |
| `facility_connect`             | saas             | A1             | PROMOTION_GATED          | PRE_LAUNCH_TARGET     |
| `facility_copilot`             | saas             | A3             | PROMOTION_GATED          | PRE_LAUNCH_TARGET     |
| `facility_autonomous`          | saas             | A4             | CUSTOMER_GATED           | PRE_LAUNCH_TARGET     |
| `autonomous_vehicle_link`      | saas             | A4             | PARTNER_AND_SAFETY_GATED | PRE_LAUNCH_TARGET     |
| `autonomous_operations_center` | support          | —              | PARTNER_AND_SAFETY_GATED | PRE_LAUNCH_TARGET     |

**All 11: `billing_enabled: false`, `customer_sale_allowed: false`.** Two CI assertions make this
non-negotiable without an explicit, reviewed diff:

```
validate-scope.mjs:402  product ${product.id} has billing_enabled=…; must be false
validate-scope.mjs:407  product ${product.id} has customer_sale_allowed=…; must be false
```

`facility_autonomous` additionally carries `safety_critical_motion_control: prohibited`.

## 3. Horizon governance — the hard ceiling over any commercial plan

`config/scope/module_states.yaml`: `horizon_authorized: 1`, `stop_after_horizon: 1`, the latter
asserted at `validate-scope.mjs:38`. Nine lifecycle states are defined; six of them set
`implementation_allowed: false`.

Only **six** modules are `ACTIVE_BUILD`: `freightos_shared_core`,
`road_ftl_carrier_operations`, `carrier_core`, `carrier_copilot`,
`rigreceipts_economics_boundary`, `rigdesk_maintenance_hooks`. Everything a RevenueOS capability
pack would sell into — `facilityos_lite` (PROMOTION_GATED), `shipper_control_tower`
(PROMOTION_GATED), `digital_brokerage` (LEGAL_AND_MARKET_GATED), `freight_exchange`
(LIQUIDITY_GATED) — is `implementation_allowed: false`.

Eight `mandatory_defaults` flags must be `false` in both `module_states.yaml` and `.env.example`
(`validate-scope.mjs:88,95,97`), including `BROKERAGE_EXECUTION_ENABLED` and
`FREIGHT_EXCHANGE_ENABLED`.

**Consequence for v1.8.1:** of the 13 capability packs in `matrices/CAPABILITY_PACK_CATALOG.csv`,
**9 target gated products** (3 facility, 1 shipper, 1 broker, plus the 4 market-intelligence packs
bound to those same participants). They cannot be sold, entitled, or activated at Horizon 1. This
is not a defect in v1.8.1 — the package correctly marks everything AUDIT_CANDIDATE — but it does
mean the capability catalog cannot be validated against the product registry today, and any
sequencing that assumes otherwise is wrong. See
[`CAPABILITY_GRAPH_GAP_MAP.md`](CAPABILITY_GRAPH_GAP_MAP.md).

## 4. Autonomy ceiling — already enforced, and already stricter than the catalog

`validate-scope.mjs:453` rejects any agent resolving above **A3** at Horizon 1, regardless of the
product's declared `autonomy_max`. `:473` rejects any agent granted a self-promotion capability.
`packages/config/src/scope.ts:149 resolveAgent` returns `effectiveAutonomy` and `clamped`;
`packages/config/test/unit/autonomy.test.ts:115-168` proves the clamp against the real registry.

Three products declare `autonomy_max: A4`. **The computed ceiling overrides them.** This is the
single strongest existing guarantee that a commercial artifact cannot raise operational autonomy —
and it is the mechanism v1.8.1's REV-07 / TW-20 depend on. It works today, for agents. It has no
equivalent for entitlements, because entitlements do not exist.

## 5. What exists that a commercial plane could later build on

Genuine, tested substrate — this is not a bare repository:

| Primitive                              | Where                                     | Why it matters commercially                                     |
| -------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Tenancy + `FORCE` RLS                  | `0002_tenants`, 16 migrations             | cross-customer isolation for any commercial record              |
| Organization hierarchy + closure       | `0007_organization_hierarchy`             | account/legal-entity structure                                  |
| Roles, permissions, policy inheritance | `0008`–`0012`                             | seller authority could be expressed here, not invented          |
| Service accounts + credentials         | `0011_service_accounts`                   | integration identity                                            |
| Append-only audit ledger               | `audit_events` (`0003`, `0006`, `0031`)   | attribution/commission evidence base                            |
| Transactional outbox **table**         | `outbox_events` (`0003`)                  | side-effect exactly-once — table only, **no producer/consumer** |
| Kill switches, most-restrictive-wins   | `kill_switches` (`0004`, `0014`, `0015`)  | commercial emergency stop                                       |
| Legal-entity + operating authority     | `legal_entities`, `operating_authorities` | the brokerage legal gate                                        |
| Network disclosure + projection        | `0032`–`0034`                             | minimum-necessary counterparty disclosure                       |

## 6. The naming collision that must be resolved before implementation

The repository already uses the word **capability** for a runtime authority primitive:
`packages/context/src/capabilities.ts` implements the ADR-0019 matrix of
`legal_authority_class × operating_context → {read, write, denied, suspended, qualifier}` over 12
resource groups, with its database half at `app.is_permitted_legal_pairing` (`0022_context_capability_matrix`).

v1.8.1 uses **capability** for the _commercial contract boundary_ (`schemas/product-capability.schema.json`,
`matrices/CAPABILITY_PACK_CATALOG.csv`). These are different objects with opposite directions: the
runtime one _restricts_, the commercial one _grants_. Shipping both under one word is how a
commercial grant eventually gets read as a runtime permission — precisely the failure REV-07 exists
to prevent. Recorded as conflict **C-03**.

## 7. Verdict

**The commercial inventory is a governed catalog, not a revenue system.** The catalog half is real,
CI-defended, and stricter than v1.8.1 assumes. The transaction half — entitlement, activation,
quote, order, invoice, commission, seller, partner — is entirely absent, so 35 of 48 REV gates score
NOT_IMPLEMENTED. The correct reading is that RevenueOS is a **greenfield plane** whose safety today
comes from a global prohibition on selling, not from any RevenueOS-specific control.
