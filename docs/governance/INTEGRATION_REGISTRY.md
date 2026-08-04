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

| Integration                    | Legal plane     | Class                 | Horizon | Status                                                                                                                                                                                                                                            |
| ------------------------------ | --------------- | --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RigReceipts economics boundary | `carrier_agent` | `TENANT_ECONOMICS`    | 1       | **`contract_and_simulation_only`** for all of Phase 1 — Phase 1 ruling B. No live credential, no live call, no external write. Formulas marked `EXTERNALLY_SUPPLIED` / `UNRESOLVED` / `authoritative: false`. Contract does not yet exist (OQ-2). |
| RIGDESK maintenance hooks      | `carrier_agent` | `TENANT_CONFIDENTIAL` | 1       | **`contract_and_simulation_only`** for all of Phase 1 — Phase 1 ruling C. Fail-closed asymmetry: stale, simulated, or non-authoritative data may never make equipment available. Contract does not yet exist (OQ-3).                              |
| Load sources / broker boards   | `carrier_agent` | `TENANT_CONFIDENTIAL` | 1       | Not registered. Phase 2.                                                                                                                                                                                                                          |
| Email ingestion                | `carrier_agent` | `TENANT_CONFIDENTIAL` | 1       | Not registered. Phase 2.                                                                                                                                                                                                                          |
| EDI (X12 204/990/214/210)      | `carrier_agent` | `TENANT_CONFIDENTIAL` | ≥2      | **Not registered, and deliberately not registered in Phase 1** — ADR-0023. Named as future connector targets with `implemented: false`. Licensing remains an unresolved prerequisite (R-15, OQ-6).                                                |
| Canonical JSON load ingestion  | `carrier_agent` | `TENANT_CONFIDENTIAL` | 1       | The **first working ingestion path** (ADR-0023). Governed REST or file import. Not registered at PR 1; registration is required before the boundary accepts external traffic.                                                                     |
| Object storage (S3-compatible) | `software_only` | `TENANT_CONFIDENTIAL` | 1       | Baseline fixed (ADR-0016); local MinIO only. No production provider selected.                                                                                                                                                                     |
| Model gateway                  | `software_only` | see below             | 1       | Provider-independent. **`MODEL_GATEWAY_ENABLED=false`** — a model call fails closed rather than reaching an unconfigured provider.                                                                                                                |
| Temporal                       | `software_only` | `TENANT_CONFIDENTIAL` | 1       | Baseline fixed; local Docker only. Used from Phase 3.                                                                                                                                                                                             |
| Brokerage systems              | `brokerage`     | —                     | ≥3      | **Prohibited.** `BROKERAGE_LEGAL_GATE.md` unsigned.                                                                                                                                                                                               |
| ADS providers                  | `software_only` | —                     | ≥3      | **Prohibited.** `AUTONOMOUS_VEHICLE_ACTIVATION_GATE.md` unsigned.                                                                                                                                                                                 |
| Rail / ocean / air carriers    | `software_only` | —                     | ≥3      | **Prohibited.** Adapters are interface-and-simulation only.                                                                                                                                                                                       |
| WMS / YMS / WES                | `software_only` | —                     | ≥3      | **Prohibited.** `FACILITY_AUTOMATION_GATE.md` unsigned.                                                                                                                                                                                           |

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
