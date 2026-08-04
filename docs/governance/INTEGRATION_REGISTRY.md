# Integration Registry

Required by `02_GOVERNANCE_AND_NON_REGRESSION.md:5-17`. Did not exist before Phase 0.

`11_INTEGRATIONS_API_EDI_AND_MCP.md:15` specifies seventeen fields every integration must record:
provider, purpose, data classification, legal plane, tenants, authentication, credential owner,
webhook verification, rate limits, retry, idempotency, health, kill switch, retention, contract,
and cost.

## Phase 0 status: no integrations exist

**Phase 0 configures zero external integrations and zero credentials.** This is the correct state,
not an omission — `21_…:105` forbids scaffold code from opening network connections to real
providers, and the infrastructure baseline explicitly defers provider selection.

Every row below is a placeholder recording what must be registered before the integration is
built. An integration may not be implemented until its row is complete and has passed the security
review `02_…:41-49` requires for every new external integration.

| Integration                    | Legal plane     | Class                 | Horizon | Status                                                                                                                             |
| ------------------------------ | --------------- | --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| RigReceipts economics boundary | `software_only` | `TENANT_ECONOMICS`    | 1       | **Contract + simulation only** (owner ruling 3). No live credential, no external write. Contract does not yet exist.               |
| RIGDESK maintenance hooks      | `software_only` | `TENANT_CONFIDENTIAL` | 1       | **Contract + simulation only.** Contract does not yet exist.                                                                       |
| Load sources / broker boards   | `carrier_agent` | `TENANT_CONFIDENTIAL` | 1       | Not registered. Phase 2.                                                                                                           |
| Email ingestion                | `carrier_agent` | `TENANT_CONFIDENTIAL` | 1       | Not registered. Phase 2.                                                                                                           |
| EDI (X12 204/990/214/210)      | `carrier_agent` | `TENANT_CONFIDENTIAL` | 1       | Not registered. Phase 1. **X12 sets are licensed documents; licensing is an unresolved prerequisite (R-15).**                      |
| Object storage (S3-compatible) | `software_only` | `TENANT_CONFIDENTIAL` | 1       | Baseline fixed (ADR-0016); local MinIO only. No production provider selected.                                                      |
| Model gateway                  | `software_only` | see below             | 1       | Provider-independent. **`MODEL_GATEWAY_ENABLED=false`** — a model call fails closed rather than reaching an unconfigured provider. |
| Temporal                       | `software_only` | `TENANT_CONFIDENTIAL` | 1       | Baseline fixed; local Docker only. Used from Phase 3.                                                                              |
| Brokerage systems              | `brokerage`     | —                     | ≥3      | **Prohibited.** `BROKERAGE_LEGAL_GATE.md` unsigned.                                                                                |
| ADS providers                  | `software_only` | —                     | ≥3      | **Prohibited.** `AUTONOMOUS_VEHICLE_ACTIVATION_GATE.md` unsigned.                                                                  |
| Rail / ocean / air carriers    | `software_only` | —                     | ≥3      | **Prohibited.** Adapters are interface-and-simulation only.                                                                        |
| WMS / YMS / WES                | `software_only` | —                     | ≥3      | **Prohibited.** `FACILITY_AUTOMATION_GATE.md` unsigned.                                                                            |

## Model-provider constraint

Whatever provider is eventually selected receives **minimum necessary context** (Art. III.5) and
never `TENANT_ECONOMICS` or `SECRET` data (see `DATA_CLASSIFICATION.md`). Art. IV.5 forbids a model
being the authority for money, permission, or legal status regardless of what it is sent.

## Adding an integration

1. Complete all seventeen fields from `11_…:15`.
2. Pass security review (`02_…:41-49`).
3. Register a kill switch at `integration` scope before first use — the kill-switch table already
   supports it.
4. Record the credential owner. Credentials never enter source, prompts, logs, fixtures, or agent
   memory.
