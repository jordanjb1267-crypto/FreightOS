# Operational Twin Runtime Gap Map

Can FreightOS support the Operational Twin as a governed participant understanding and coordination
layer — shared by humans, agents, existing software, workflows, customer policy and network
relationships — **without replacing the customer's TMS/WMS/ERP**?

## 1. Verdict

**Yes in principle; no with current primitives; and the design is right not to require replacement.**

The Twin is the most valuable and least supported proposal in v1.8.1. Its _network-facing half_ has
genuine, tested substrate in this repository. Its _system-of-record-facing half_ has none. And it
has no workforce decomposition at all — 50 node owners, zero Job Books.

## 2. The 12 Twin graphs

| Graph    | Plane                | WorkUnit type                      | Side effects                |
| -------- | -------------------- | ---------------------------------- | --------------------------- |
| TWIN-G01 | `twin_integration`   | `TwinSystemBindingWorkUnit`        | `integration_configuration` |
| TWIN-G02 | `twin_integration`   | `TwinSyncWorkUnit`                 | none                        |
| TWIN-G03 | `twin_operations`    | `CollaborativeOperationalWorkUnit` | none                        |
| TWIN-G04 | `twin_operations`    | `ApprovalExecutionWorkUnit`        | `operational_command`       |
| TWIN-G05 | `twin_integration`   | `ExternalWritebackWorkUnit`        | `external_system_write`     |
| TWIN-G06 | `twin_configuration` | `TwinLearningWorkUnit`             | none                        |
| TWIN-G07 | `twin_network`       | `NetworkInboundWorkUnit`           | none                        |
| TWIN-G08 | `twin_network`       | `NetworkProjectionWorkUnit`        | `external_communication`    |
| TWIN-G09 | `twin_network`       | `CounterpartyCoordinationWorkUnit` | `external_communication` ×2 |
| TWIN-G10 | `twin_integration`   | `TwinFactConflictWorkUnit`         | none                        |
| TWIN-G11 | `twin_integration`   | `IntegrationRecoveryWorkUnit`      | none                        |
| TWIN-G12 | `twin_configuration` | `WorkflowModeChangeWorkUnit`       | none                        |

The decomposition is well chosen. Binding, sync, conflict, recovery, writeback, learning, mode
change, inbound, outbound, coordination, collaboration and approval-execution are the right twelve
concerns, and separating `TwinFactConflictWorkUnit` and `IntegrationRecoveryWorkUnit` into their own
graphs is a mark of a design that expects to fail.

## 3. Primitive availability

| Twin requirement                                 | Repository                  | Evidence                                                                                                                  |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Participant registry                             | **YES**                     | `network_participants`, `network_participant_status/type` (`0028`)                                                        |
| Participant relationships, typed                 | **YES**                     | `network_participant_relationships`, `network_relationship_types` (`0028`)                                                |
| External identifier → canonical, with provenance | **YES (participants only)** | `network_participant_aliases`: namespace, `verification_status`, effective dating, `source_system`, `revoked_at` (`0028`) |
| Inbound network artifact intake                  | **YES**                     | `network_disclosure_inbox` (`0034`)                                                                                       |
| Outbound minimum-necessary projection            | **YES**                     | `network_disclosure_projections` + `_projection_fields`, migration-authored, one schema version each (`0032`)             |
| Sensitivity ceiling                              | **YES**                     | `network_disclosure_sensitivities`, `network_schema_disclosure_sensitivity` (`0033`)                                      |
| Purpose + purpose ceiling                        | **YES**                     | `network_disclosure_purposes`, `_purpose_ceilings` (`0032`)                                                               |
| Revocation as append                             | **YES**                     | `network_disclosure_grant_revocations`, `_subscription_revocations` (`0032`)                                              |
| Append-only evidence                             | **YES**                     | `network_events` (`0029`), `audit_events` (`0003`,`0031`)                                                                 |
| Kill switch                                      | **YES (unused by Twin)**    | `kill_switches`; **0 of 12 Twin graphs reference it**                                                                     |
| Tenant isolation                                 | **YES**                     | `FORCE` RLS, 16 migrations                                                                                                |
| **WorkUnit**                                     | **NO**                      | 0 hits, 35 migrations                                                                                                     |
| **Graph/durable execution engine**               | **NO**                      | no engine, no worker, no queue consumer                                                                                   |
| **System-of-record binding (fact authority)**    | **NO**                      | `fact-authority-binding.schema.json` is design only                                                                       |
| **Adapter runtime (TMS/WMS/ERP/ELD)**            | **NO**                      | 4 adapter _schemas_, zero adapter code                                                                                    |
| **External egress**                              | **NO — CI-pinned at zero**  | `egress-allowlist.json` `expectedCount: 0`                                                                                |
| **Twin configuration store**                     | **NO**                      | —                                                                                                                         |
| **Human workbench (any UI)**                     | **NO**                      | no application, no route, no view                                                                                         |

**The network half is real. The integration half is empty.** Eight of the twelve Twin graphs
(`twin_integration` ×5, `twin_configuration` ×2, plus TWIN-G04's `operational_command`) depend
entirely on primitives that do not exist.

## 4. Gaps

### TR-01 — No Twin workforce exists _(largest omission in the package)_

50 distinct owners across 12 graphs; **0 Job Books**. `schemas/provisional-job-book.schema.json`
constrains `plane` to `enum: ["revenueos","fmi"]` and `graph_membership` to
`^(REV|FMI|XPL)-G[0-9]{2}$` — a Twin Job Book is **inexpressible**. Every Twin owner therefore has
no certification, no autonomy ceiling, no tool list, and no command contract, including the owners
of `external_system_write` and `operational_command`. Conflict **C-04**; decision **D-10**.

### TR-02 — Three side-effecting Twin nodes are not crash-safe

`TWIN-G01 TB6_ACTIVATE` (`integration_configuration`) has `retry_policy: none`; `TWIN-G08 NP5_SEND`,
`TWIN-G09 CP2_SEND` and `CP4_RETURN` (`external_communication`) use `bounded_retry`, not
`idempotent_retry`. A retried integration activation or a duplicated counterparty message are both
customer-visible failures. See GRAPH_FAILURE_REPLAY_GAP_MAP GF-02.

TWIN-G05 (`external_system_write`) is the exception and is **correct** — it carries
`reconcile_before_retry`, the right semantics for a write whose outcome may be unknown.

### TR-03 — No `OUTCOME_UNKNOWN` state

For `ExternalWritebackWorkUnit` this is the central state: a TMS write may have landed, failed, or
be unknown. `reconcile_before_retry` implies reconciliation without naming the state that triggers
it. Conflict **C-13**.

### TR-04 — Zero kill-switch coverage across all 12 Twin graphs

A Twin that writes to a customer's TMS and messages counterparties must be stoppable. The platform
primitive exists and is tested; no Twin graph references it. Conflict **C-12**.

### TR-05 — `HOLD` is the failure sink for all 12 Twin graphs

Every Twin graph declares `HOLD` as terminal and none defines it. A failed system binding, a
conflicting fact, a rejected network artifact and a degraded integration all land in the same
ownerless state.

## 5. The central question: can a human-heavy customer get value before A3/A4?

**Yes — the design supports it, and this is one of its best properties.**

`matrices/HUMAN_AGENT_MODE_MATRIX.csv` defines five modes, of which three require no autonomy at
all: OBSERVE (_"human works normally; agent observes/normalizes/summarizes; side effect: none"_),
ASSIST (_"human decides/acts; agent drafts/recommends/retrieves"_), and COLLABORATE. TWIN-G03
(`CollaborativeOperationalWorkUnit`) has **no side effects at all** — a purely human-led WorkUnit
with agent assistance.

The fixtures make this concrete and are the strongest evidence in the Twin package:
`carrier_existing_tms_assist_mode.json`, `facility_existing_wms_human_led.json`,
`broker_existing_tms_hybrid_mode.json`, `shipper_existing_erp_connected.json`,
`service_provider_existing_shop_system.json` — five profiles, each keeping the incumbent system.

**But the value is unreachable today**, because OBSERVE mode still requires reading from the
customer's system, which requires an adapter and egress. There is no zero-integration Twin value
path in the design: even the most passive mode needs the integration layer that does not exist.
Recorded as owner decision **D-11** — whether a manual/upload-based Twin onboarding path should
exist so a customer can get value before any adapter is built.

## 6. TMS/WMS/ERP replacement is correctly _not_ required

`PARTICIPANT_TWIN_INTERACTION_MATRIX.csv` names the incumbent systems per profile
(COT: `TMS|ELD|telematics|maintenance|accounting|email`; FOT: `WMS|YMS|ERP|appointment|gate
systems`; SOT: `ERP|TMS|procurement|OMS|finance`) and states a `critical_boundary` for each —
e.g. FOT: _"no takeover of physical/safety authority"_, SOT: _"shipper commercial authority stays
local"_.

TW-32 (replacement not required) is satisfied at design level. It cannot be proven without an
adapter, so it scores PARTIAL.

## 7. Required changes

1. Make Twin Job Books expressible and author all 50 (**TR-01 / C-04**, blocking).
2. Idempotency + kill switch on every side-effecting Twin node (**TR-02, TR-04**, blocking).
3. `OUTCOME_UNKNOWN` as a first-class state, starting with `ExternalWritebackWorkUnit`
   (**TR-03 / C-13**, blocking).
4. Define and own `HOLD` (**TR-05**).
5. Decide whether a pre-adapter Twin value path exists (**D-11**).
