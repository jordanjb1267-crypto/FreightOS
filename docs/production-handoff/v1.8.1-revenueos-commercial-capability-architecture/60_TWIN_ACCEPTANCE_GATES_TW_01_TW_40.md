# 60 — Operational Twin Interaction Acceptance Gates TW-01..TW-40

No gate is PASS from documentation alone.

| ID | Requirement | Minimum evidence |
|---|---|---|
| TW-01 | Every participant profile maps to common Twin interaction contract | repository/schema mapping |
| TW-02 | Systems of record are explicitly inventoried | tenant fixture + configuration evidence |
| TW-03 | Material fields/object families have authority bindings | binding registry + negative tests |
| TW-04 | External IDs map to canonical IDs with provenance | mapping tests |
| TW-05 | Customer can onboard read-only before write authority | integration test |
| TW-06 | Inbound sync is idempotent | duplicate delivery test |
| TW-07 | Ordering/version semantics are enforced | reordered-event test |
| TW-08 | Adapter echo/feedback loops are prevented | loop fault-injection test |
| TW-09 | Freshness/staleness is explicit | outage/stale-data test |
| TW-10 | Conflicting facts create explicit conflict state | conflicting-source test |
| TW-11 | Conflict resolution follows declared authority rule | deterministic resolution test |
| TW-12 | Human correction/override is versioned and auditable | workflow test |
| TW-13 | Observed behavior only proposes Twin change | learning test |
| TW-14 | No hidden learning can rewrite approved configuration | adversarial/mutation test |
| TW-15 | SOP/config changes are versioned with impact diff | version/change test |
| TW-16 | Human and agent participation uses one WorkUnit model | runtime mapping + tests |
| TW-17 | Exactly one accountable owner exists per WorkUnit state | invariant test |
| TW-18 | OBSERVE/ASSIST cannot acquire side-effect authority from mode label | negative authority test |
| TW-19 | Approval binds exact proposal/version/scope | stale approval test |
| TW-20 | Experience mode is per workflow/action and cannot exceed accepted autonomy | policy tests |
| TW-21 | External writeback requires declared binding + command authority | negative permission test |
| TW-22 | External writeback is idempotent | duplicate/crash test |
| TW-23 | Unknown write result reconciles before retry | timeout/crash test |
| TW-24 | Dependency outage has safe degraded/disconnected behavior | failure simulation |
| TW-25 | Inbound network artifacts authenticate sender/relationship/purpose | adversarial network tests |
| TW-26 | Outbound network data passes disclosure projection | field-level negative tests |
| TW-27 | Minimum-necessary disclosure is enforced | projection fixtures |
| TW-28 | Non-native counterparties can participate through supported channels | email/EDI/API/link fixture/test |
| TW-29 | Local vocabulary maps to canonical network semantics | conformance tests |
| TW-30 | Network messages never transfer sender authority | cross-party adversarial test |
| TW-31 | Cross-tenant Twin/system/network paths remain isolated | DB/API/cache/storage tests |
| TW-32 | TMS/WMS/ERP replacement is not required for supported integration mode | coexistence pilot evidence |
| TW-33 | Adapter mapping/version/conformance is explicit | conformance report |
| TW-34 | Customer can reconstruct source, decision, owner, send and acknowledgement | audit trace demo |
| TW-35 | Customer can inspect/correct approved Twin understanding | UX + authorization test |
| TW-36 | COT/BOT/FOT/SOT/SPOT preserve domain ownership differences | profile contract tests |
| TW-37 | Scale changes topology, not Twin/authority semantics | multi-size fixtures/load tests |
| TW-38 | Human workbench supports queues, approvals, exceptions and handoffs without chatbot-only operation | UX acceptance evidence |
| TW-39 | TWIN graphs pass static/adversarial/replay/shadow certification before bounded live use | graph certification evidence |
| TW-40 | Claims of seamless coexistence/network operation require customer-live integration and network evidence | production evidence, not design |
