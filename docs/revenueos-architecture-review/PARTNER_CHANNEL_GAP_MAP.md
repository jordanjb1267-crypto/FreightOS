# Partner & Channel Gap Map

Tests **H9**: referral / agent / reseller / partner identities can be represented with existing
identity, tenant, and relationship controls, or with a narrowly additive model.

## 1. Verdict

**H9 holds, and the additive surface is genuinely narrow — but only if partners are built on the
existing identity and network-relationship primitives rather than on a new commercial identity
store.** The main risk is not missing machinery; it is building a second identity system.

## 2. What exists that a partner model can reuse

| Primitive                                                                                        | Migration          | Reusable for                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------ |
| `tenants` + `FORCE` RLS (16 migrations)                                                          | `0002`             | hard cross-partner isolation                                 |
| `organization_nodes` + `organization_node_closure`                                               | `0007`             | partner org hierarchy, sub-agents                            |
| `legal_entities`, `operating_authorities`                                                        | `0001`-era, `0010` | partner legal identity, brokerage authority                  |
| `roles`, `permissions`, `role_permissions`, `membership_roles`                                   | `0008`             | partner role grants                                          |
| `policy_bindings` + non-weakening inheritance                                                    | `0012`             | a partner policy can never widen a parent's                  |
| `service_accounts` (+ credentials, permissions)                                                  | `0011`             | partner system access                                        |
| `network_participants` + `network_participant_relationships` + `network_relationship_types`      | `0028`             | **partner-as-counterparty, with a typed relationship**       |
| `network_participant_aliases` (namespace, `verification_status`, effective dating, `revoked_at`) | `0028`             | partner external identifiers (MC/DOT/CRM id) with provenance |
| `audit_events` append-only                                                                       | `0003`, `0031`     | deal-registration evidence                                   |

`packages/identity/src/policy-inheritance.ts` implements non-weakening inheritance and is unit
tested — the exact property a reseller hierarchy needs.

**Assessment:** a partner is a `network_participant` with a typed relationship to FreightOS and an
`organization_node` for its internal hierarchy. This is a narrow addition, and H9 is supported.

## 3. Gaps

### PC-01 — No partner, seller, channel, deal-registration, or territory construct exists

Zero tables. `matrices/SELLER_AUTHORITY_MATRIX.csv` and package files `08`–`10` are design only.
REV-11..REV-14 and REV-42 score NOT_IMPLEMENTED.

### PC-02 — Partner isolation is asserted but the sharpest hazard is unaddressed

REV-13 requires partner isolation; the adversarial list requires that _a partner gains cross-customer
data_ be prevented. Tenant RLS isolates **tenants**. A partner is structurally different: it
legitimately needs _some_ visibility into _several_ customers (its own registered deals) and none
into the rest. That is not tenant isolation — it is a scoped cross-tenant grant, which is the single
most dangerous object in a multi-tenant system.

The repository already has the correct primitive for exactly this, and v1.8.1 does not cite it:
**`network_disclosure_grants` / `network_disclosure_projections` / `network_disclosure_projection_fields`**
(`0032`), where a projection is bound to exactly one `durable_schema_ref` and is _migration-authored
only_, so a new field cannot ride in on an old grant. **Required change:** partner visibility must be
a disclosure projection, not a role or an RLS exception. Recorded as conflict **C-06**.

### PC-03 — Deal registration has an unowned financial consequence

`partner_operations_agent` owns REV-G05 with `candidate_commands: record_deal_registration`.
Registration determines commission attribution, so a duplicate or back-dated registration is a
money event. REV-G05 has 5 nodes, one terminal, and its declared terminals `DENIED` and `REJECTED`
are **not defined as nodes** — so a rejected registration lands in a state with no owner. Combined
with `retry_policy: none` on most nodes, a contested registration has no defined resolution path.
See GRAPH_FAILURE_REPLAY_GAP_MAP.

### PC-04 — No territory or routing model

Package file `10_TERRITORY_ROUTING_AND_ACCOUNT_OWNERSHIP.md` describes territory routing; no
artifact, schema, or matrix expresses it, and `organization_node_closure` — the obvious substrate —
is not referenced. Ownership conflicts between a partner and a direct seller are therefore
undefined. Recorded as owner decision **D-05**.

### PC-05 — Partner certification has no registry

REV-42 requires partner certification to gate rights. There is no certification table for jobs, and
none for partners. `15_SELLER_PARTNER_CERTIFICATION.md` is design only.

## 4. Adversarial cases

| Attack                                               | Outcome today                                                     | Outcome if built as designed                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Partner reads another customer's data                | **blocked** — no partner exists; RLS `FORCE` on all tenant tables | **at risk** unless PC-02 is built as a disclosure projection                    |
| Partner self-registers a deal on an existing account | n/a                                                               | undefined — no dedup rule, REV-15 NOT_IMPLEMENTED                               |
| Partner escalates its own commission rate            | n/a                                                               | blocked _if_ policy inheritance is used (`policy-inheritance.ts` non-weakening) |
| Two partners claim the same deal                     | n/a                                                               | **undefined** — PC-03, `DENIED`/`REJECTED` unowned                              |
| Partner gains operational (dispatch) authority       | **blocked**                                                       | blocked — `production_logistics_authority: const false`                         |
| Sub-partner inherits more than parent                | n/a                                                               | blocked by `policy_bindings` non-weakening inheritance                          |

## 5. Required changes

1. Partner cross-customer visibility must be a **disclosure projection**, never a role or RLS
   exception (**PC-02 / C-06**, blocking).
2. Model partner as `network_participant` + `organization_node`; do not create a second identity
   store (**H9 conditional**).
3. Define deal-registration conflict resolution with owned terminal states (**PC-03**).
4. Answer territory/ownership precedence before building routing (**PC-04 / D-05**).
