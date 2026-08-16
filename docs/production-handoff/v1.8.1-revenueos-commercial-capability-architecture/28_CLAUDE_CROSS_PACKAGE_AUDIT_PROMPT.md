# 28 — Claude Master Cross-Package Audit Prompt

Copy everything below the divider into a **new Claude session** dedicated to the cross-package review.

---

You are acting as senior principal engineer, enterprise agent architect, logistics systems architect, security reviewer, product-platform architect, and adversarial production reviewer for FreightOS.

## Assignment

Audit the newly installed **FreightOS v1.8.1 RevenueOS & Commercial Capability Architecture** against the complete accepted FreightOS architecture and the real current repository **before any further v1.9 work**.

This is an AUDIT-ONLY assignment. You are not authorized to implement RevenueOS runtime code, migrations, permissions, integrations, production agents, or v1.9.

## Independence / v1.9 quarantine

There is a preserved unaccepted draft branch:

`design/v1.9.0-workforce-operational-design-completion`

Do **not** read it, checkout it, diff it for content, cherry-pick it, inspect its files, or use it as evidence. Preserve it untouched. Its existence may be disclosed only as a quarantined unaccepted draft. The audit must be independent of it.

## Preflight — fail closed

From the repository root:

1. record current branch, HEAD, origin/main, and tree state;
2. require a clean tree before creating the audit branch;
3. verify all accepted production handoff packages expected through v1.8.1 exist;
4. verify package manifests/hashes with repository-standard commands;
5. identify merged repository-local W0/W1 audit artifacts;
6. do not repair an unexpected dirty tree automatically;
7. do not delete/move untracked files to force preflight green;
8. if a precondition fails, report it and stop.

Create a new audit branch from clean, current main. Suggested name:

`audit/revenueos-commercial-capability-pre-v1.9`

Do not rebase unrelated work into it.

## Required reading precedence

Read the accepted repository and controlling packages in order sufficient to preserve stricter rules, including:

- core constitution/product/engineering/architecture/security documents;
- v1.3 Security & Resilience;
- v1.4 Network Architecture;
- v1.5 Enterprise Agent Operations;
- accepted FacilityOS package;
- v1.6 Brokerage Operations;
- v1.7 Agentic Logistics Network Coherence;
- v1.8 Agent Workforce Engineering & Certification;
- merged/accepted workforce W0/W1 audit outputs;
- v1.8.1 RevenueOS & Commercial Capability Architecture;
- current migrations/schema/runtime/tests/CI relevant to identity, authority, workflows, agents, entitlements/billing, audit, network, integrations, and commercial concepts.

Where two accepted rules conflict, apply the stricter security/authority/tenant/privacy/legal/audit/resilience/certification rule and record the conflict. Do not silently reconcile material contradictions.

## Core hypotheses to test — do not assume true

H1. FreightOS can use Capability as the commercial contract boundary while jobs/agents remain implementation details.

H2. Customers can license only needed Twins/capabilities without fragmenting the shared FreightOS foundation.

H3. Versioned commercial entitlement can remain strictly separate from runtime command authority.

H4. RevenueOS can live on a commercial plane without inheriting participant operational/legal authority.

H5. Existing WorkUnit/durable graph infrastructure can be reused for revenue workflows instead of creating a second orchestration system.

H6. The accepted v1.8 workforce can be referenced by capabilities without weakening Job Book ownership, J0-J7 certification, autonomy ceilings, or typed handoffs.

H7. Sales Promise Firewall can be enforced from authoritative product/security/policy registries rather than free text.

H8. Attribution/commission can be derived from append-only authoritative commercial/financial events without giving RevenueOS payout authority.

H9. Referral/agent/reseller/partner identities can be represented with existing identity/tenant/relationship controls or a narrowly additive model.

H10. RevenueOS can own the customer-facing Freight Market Intelligence function while a shared FMI substrate provides provenance-bearing signals to operational domains without transferring authority.

H11. Carrier, Brokerage, FacilityOS, Shipper, and Service Provider/RigDesk workforces can consume market/news/rate/capacity/disruption intelligence as evidence without allowing intelligence components to command domain actions.

H12. Source rights, provenance, freshness, confidence, correction lineage, and forecast uncertainty can be governed as first-class contracts rather than hidden inside prompts or vendor adapters.

H13. This package does not require or justify resuming v1.9 until the audit is reviewed.

## Repository investigation

Inspect at minimum:

1. organization/tenant/legal-entity/participant hierarchy;
2. role/permission/authority model;
3. agent registry/manifests;
4. v1.8 Job Books, workforce matrices, certification and command mappings;
5. workflow/WorkUnit/durable execution primitives;
6. command/policy/approval/autonomy gates;
7. event/outbox/inbox/idempotency/reconciliation;
8. audit/evidence/provenance;
9. existing products/plans/SKUs/subscriptions/billing/entitlements/features/flags;
10. integration/partner identity and API structures;
11. product/capability registries if any;
12. customer onboarding/configuration/Twin schemas;
13. security/trust/compliance claim sources;
14. CRM/revenue/customer-success integrations if present;
15. financial/payment boundaries;
16. tests/CI/validators that could enforce drift controls;
17. docs/audit artifact conventions;
18. existing freight-market/rate/capacity/news/fuel/weather/disruption/commodity/port/rail/ocean/maintenance intelligence code, agents, services, schemas, integrations, or datasets;
19. existing market-data source rights/licensing registries or vendor controls;
20. existing customer/Twin fields that can safely drive customer-specific market relevance without creating hidden inferred authority.

## Required decomposition of proposed RevenueOS workforce

For every proposed role in v1.8.1 file `16_REVENUEOS_AGENT_WORKFORCE.md`, classify it as one of:

- existing agent;
- existing hybrid agent;
- existing deterministic service;
- existing workflow/orchestrator;
- existing human role;
- merge with existing role;
- genuinely missing agent;
- genuinely missing hybrid;
- genuinely missing deterministic service;
- genuinely missing workflow;
- not appropriate to implement.

For each, cite evidence and identify required Job Book/certification implications. Do not create implementation yet.

## Required decomposition of proposed FMI workforce

For every proposed role in `35_MARKET_INTELLIGENCE_AGENT_WORKFORCE.md`, classify it as one of:

- existing participant-domain agent;
- existing RevenueOS/commercial agent;
- existing hybrid agent;
- existing deterministic/model service;
- existing workflow/orchestrator;
- existing human role;
- merge with existing role;
- genuinely missing shared-FMI component;
- genuinely missing RevenueOS-FMI component;
- not appropriate to implement.

For each, identify the authoritative source inputs, permitted signal outputs, consumers, prohibited commands, job/certification implications, and whether it belongs to a shared substrate versus a participant legal/operational plane. Do not create implementation yet.

## REV gate scoring

Score REV-01..REV-48 using only:

- PASS
- PARTIAL
- FAIL
- NOT IMPLEMENTED
- NOT APPLICABLE (with rationale)

Documentation presence alone is not PASS. An unmerged branch is not PASS. A mock is not PASS.

For every PASS/PARTIAL/FAIL, cite exact repository evidence: paths, migrations, functions, tests, CI checks, schemas, or commands.

## FMI gate scoring

Score FMI-01..FMI-28 from `37_MARKET_INTELLIGENCE_TESTS_AND_ACCEPTANCE_GATES.md` with the same status vocabulary and evidence rule.

Specifically prove or reject:

- market/source rights before ingestion;
- source provenance and correction lineage;
- raw observation vs derived indicator vs forecast separation;
- freshness/staleness behavior;
- customer-private/network-aggregate privacy;
- news/prompt-injection resistance;
- rate/capacity methodology and uncertainty;
- forecast calibration;
- customer relevance explainability;
- strict Carrier/Brokerage/Facility/Maintenance authority separation.

## Cross-package conflict review

Explicitly test for conflicts with:

- v1.3 zero-trust/security/AI controls;
- v1.4 participant equality, data sovereignty, authority, versioning and conformance;
- v1.5 Twin + tenant agent organization + typed graph doctrine;
- FacilityOS physical authority/operational ownership boundaries;
- v1.6 brokerage legal/authority separation;
- v1.7 participant coherence, commercial packaging, entitlements and network adoption model;
- v1.8 76-job workforce, WorkUnit ownership, role/tool/command boundaries and J0-J7 certification;
- current repository implementation and W0/W1 findings;
- any accepted market/rate/profitability/load-discovery/pricing/feasibility/maintenance intelligence responsibilities so v1.8.1 does not duplicate or steal their ownership.

## Audit deliverables

Create only documentation under:

`docs/revenueos-architecture-review/`

Create:

1. `README.md`
2. `CURRENT_PRODUCT_COMMERCIAL_INVENTORY.md`
3. `CAPABILITY_GRAPH_GAP_MAP.md`
4. `ENTITLEMENT_ACTIVATION_GAP_MAP.md`
5. `REVENUE_PLANE_AUTHORITY_MAP.md`
6. `REVENUE_WORKFORCE_DECOMPOSITION.md`
7. `PROMISE_FIREWALL_GAP_MAP.md`
8. `PARTNER_CHANNEL_GAP_MAP.md`
9. `ATTRIBUTION_COMMISSION_GAP_MAP.md`
10. `DATA_PRIVACY_BOUNDARY_MAP.md`
11. `REV_01_REV_48_MATRIX.md`
12. `FMI_ARCHITECTURE_AND_SOURCE_GAP_MAP.md`
13. `FMI_WORKFORCE_DECOMPOSITION.md`
14. `FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.md`
15. `FMI_01_FMI_28_MATRIX.md`
16. `CROSS_PACKAGE_CONFLICT_REGISTER.md`
17. `PROPOSED_ADDITIVE_PR_SEQUENCE.md`
18. `OWNER_DECISIONS.md` only if genuine unresolved owner decisions remain.

Do not modify accepted production-handoff files during audit.

## Required adversarial review

Attempt to falsify the design with at least these cases:

- commercial entitlement accidentally grants runtime command authority;
- RevenueOS agent obtains Carrier/Facility/Broker operational permissions;
- capability SKU implies an uncertified v1.8 job can execute;
- seller promises a design-only/deferred capability;
- seller/partner overrides security or legal gate;
- a bundle recreates a monolithic forced-purchase model;
- a partner gains cross-customer data;
- commission incentive encourages unsupported selling;
- attribution can be rewritten after cash collection;
- RevenueOS becomes a second source of truth for customer identity, audit, workflows, or product status;
- rollout label bypasses J/A certification ceilings;
- network expansion leaks confidential counterparty data;
- crash/retry duplicates quote/order/entitlement/commission side effects;
- v1.8.1 contradicts accepted W0/W1 findings;
- RevenueOS market agent gains Carrier/Broker/Facility/Maintenance command authority;
- market-rate signal bypasses Carrier profitability/acceptance controls;
- capacity/rate signal bypasses Brokerage pricing, credit, margin, tender, or award authority;
- facility-impact forecast attempts gate/dock/custody control;
- maintenance-market alert causes repair spend/roadside dispatch;
- stale licensed rate remains CURRENT;
- thin-lane sample is presented as high-confidence market truth;
- source rights do not permit the intended ingestion/display/derived use;
- prompt-injected news article alters tools/policy;
- rumor becomes confirmed operational fact;
- customer-private rate/capacity information leaks into another participant's market brief;
- network aggregate permits re-identification;
- a forecast is presented as an observed rate;
- a correction does not invalidate/recompute a consequential derived signal.

## No implementation

Do not:

- create runtime tables/migrations;
- change permissions/RLS;
- enable agents;
- activate external writes;
- create real seller/partner accounts;
- connect a CRM;
- change prices;
- create payout logic;
- connect/ingest/licence/scrape market or news data;
- create market-data vendor accounts;
- activate market-driven operational actions;
- merge;
- deploy;
- resume v1.9;
- read the quarantined v1.9 draft.

## Verification before commit

1. prove diff is confined to `docs/revenueos-architecture-review/`;
2. prove accepted handoff package hashes are unchanged;
3. run applicable docs/format/secret/provenance checks;
4. show no runtime/migration/config/dependency changes;
5. commit the audit as a discrete docs-only commit;
6. push only if repository governance permits and report exact branch/HEAD.

## Completion report

Return:

1. branch / HEAD / origin-main / tree;
2. preflight evidence;
3. accepted packages read and hash/provenance status;
4. explicit statement that quarantined v1.9 content was not read or used;
5. files created;
6. architecture verdict: COHERENT / COHERENT WITH REQUIRED CHANGES / BLOCKED;
7. top conflicts/gaps by severity;
8. capability/entitlement verdict;
9. RevenueOS authority verdict;
10. workforce decomposition summary;
11. Promise Firewall verdict;
12. partner/channel verdict;
13. attribution/commission verdict;
14. REV-01..REV-48 summary counts and blockers;
15. FMI architecture/source-rights verdict;
16. FMI workforce decomposition summary;
17. FMI operational-consumer authority verdict;
18. FMI-01..FMI-28 summary counts and blockers;
19. proposed additive PR sequence — design only;
20. owner decisions genuinely required;
21. exact commands/tests run;
22. explicit confirmation: no runtime implementation, no market/news ingestion, no live effects, no v1.9 continuation.

STOP after the audit. Await owner review.

## Mandatory typed-graph and Job Book audit extension

Before recommending any implementation or v1.9 continuation, read all of:
- `39_TYPED_GRAPH_ENGINEERING_STANDARD.md` through `46_GRAPH_ACCEPTANCE_GATES_GR_01_GR_32.md`;
- `graphs/GRAPH_REGISTRY.json` and every machine-readable graph under `graphs/`;
- every provisional Job Book under `job_books/revenueos/` and `job_books/fmi/`;
- `matrices/GRAPH_REGISTRY.csv`, `GRAPH_NODE_OWNERSHIP.csv`, and `GRAPH_EDGE_HANDOFFS.csv`.

For every proposed job/component, classify it against the accepted v1.8 workforce as `EXISTING`, `MERGE`, `DUPLICATE`, `AGENT`, `HYBRID`, `DETERMINISTIC_SERVICE`, `WORKFLOW`, `HUMAN_SUPERVISED`, `GENUINELY_MISSING`, or `REJECT`. Do not promote an `AUDIT_CANDIDATE` Job Book to J0 yourself.

For every graph, perform a graph-theoretic and authority audit: entry/terminal reachability; unreachable/orphan states; cycles; owner uniqueness; typed-edge completeness; sender/receiver authority isolation; side-effect inventory; idempotency/reconciliation; stale-version invalidation; kill-switch behavior; failure/timeout/retry completeness; and overlap with existing repository workflow graphs.

Score `GR-01..GR-32` in addition to `REV-01..REV-48` and `FMI-01..FMI-28`. Add these repository-local audit outputs:
- `GRAPH_REGISTRY_RECONCILIATION.md`
- `GRAPH_NODE_OWNERSHIP_GAP_MAP.md`
- `GRAPH_EDGE_AND_HANDOFF_GAP_MAP.md`
- `GRAPH_AUTHORITY_CONFLICT_MAP.md`
- `GRAPH_FAILURE_RETRY_RECONCILIATION_GAP.md`
- `GRAPH_CERTIFICATION_GAP.md`
- `GR_01_GR_32_MATRIX.md`
- `PROVISIONAL_JOB_BOOK_RECONCILIATION.md`

**Stop after audit.** Do not implement graphs, create runtime tables, add migrations, register/enable jobs, change permissions, activate agents, create operational commands, or continue v1.9.

## Additional mandatory Operational Twin interaction audit

The final package includes an Operational Twin interaction fabric. Read `51`–`62`, `graphs/twin/`, Twin schemas/fixtures/matrices, and audit them against v1.4/v1.5/v1.7/v1.8 plus current repository integration/runtime evidence.

Do not assume FreightOS should replace a customer's TMS/WMS/ERP. Determine, by domain/object/field where possible, what is currently authoritative and whether the repository can represent explicit external/FreightOS/config/network/derived/human authority bindings without split-brain truth.

You must test H14–H22 from `26_CROSS_PACKAGE_AUDIT_SPEC.md`, audit TWIN-G01..TWIN-G12, and score TW-01..TW-40.

Required additional outputs under `docs/revenueos-architecture-review/`:

- `TWIN_RUNTIME_COEXISTENCE_GAP_MAP.md`
- `SYSTEM_OF_RECORD_BINDING_MAP.md`
- `HUMAN_AGENT_WORKUNIT_COEXISTENCE.md`
- `TWIN_NETWORK_INGRESS_EGRESS_MAP.md`
- `TWIN_LEARNING_CHANGE_CONTROL_GAP.md`
- `TWIN_GRAPH_RUNTIME_COMPATIBILITY.md`
- `TW_01_TW_40_MATRIX.md`

Explicitly test whether a human-heavy customer can get material value from the Twin before A3/A4 automation, whether existing systems can remain in place, and whether external/connected counterparties can communicate through the network. Stop before implementation, migration, adapter activation, autonomy promotion, or v1.9.
