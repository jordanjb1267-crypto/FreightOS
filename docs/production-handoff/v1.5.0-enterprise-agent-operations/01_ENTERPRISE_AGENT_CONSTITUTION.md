# 01 — Enterprise Agent Constitution

## Article I — Agents are governed workloads

An agent is a versioned workload identity with:
- tenant;
- represented organization;
- purpose;
- domain role;
- tool allowlist;
- read scope;
- command scope;
- financial limits;
- geographic/mode scope;
- policy version;
- autonomy level;
- data-use policy;
- model/runtime version;
- evaluation version;
- effective/expiration times;
- kill switch.

An "agent persona" without these fields is not production-capable.

## Article II — No hidden authority

Prompts, retrieved documents, model confidence, customer urgency, prior conversation, or another agent cannot increase authority.

Only deterministic authorization and valid delegation grants can authorize consequential commands.

## Article III — Explainable company adaptation

A customer SHALL be able to answer:
- What does FreightOS believe our structure is?
- What systems does it believe are authoritative?
- What workflows is it automating?
- Which steps are AI vs deterministic?
- Which actions can each agent execute?
- When will it escalate?
- What evidence caused a decision?
- What changed since yesterday/version N?
- How do we correct its understanding?
- How do we stop it?

## Article IV — Progressive autonomy

Autonomy is earned by evidence.

Each workflow/action progresses independently:
`DISCOVER -> OBSERVE -> SHADOW -> PREPARE -> APPROVAL_EXECUTE -> POLICY_AUTONOMOUS -> EXCEPTION_SUPERVISED`

Regression, drift, policy changes, integration changes, incidents, or material workflow changes can automatically lower autonomy.

## Article V — Operational truth

System of record:
- transactional state;
- immutable/auditable events;
- signed/verified source records;
- approved company configuration.

Never authoritative:
- LLM memory;
- chat history;
- vector retrieval;
- model summary;
- unsupported inferred SOP;
- one person's undocumented assertion when company governance requires approval.

## Article VI — No customer forks

Customer differences live in versioned configuration and capability composition.

A code fork is allowed only for a separately governed product/regulated deployment decision, never as the default implementation shortcut.

## Article VII — Side-effect isolation

All consequential external writes pass through typed side-effect gateways:
- dispatch/assignment;
- communications;
- maintenance/service;
- booking/appointment;
- financial/settlement;
- document submission;
- external-system mutation.

Gateways enforce:
identity, tenancy, policy, current state, idempotency, approvals, retry classification, audit, reconciliation.

## Article VIII — Human command

Humans can:
- inspect;
- approve/reject;
- correct;
- constrain;
- pause;
- revoke;
- lower autonomy;
- roll back configuration;
- request explanation.

No UI control may silently bypass policy.

## Article IX — Multimodal neutrality

An agent role such as `MissionPlanner` is core.
Mode packs may specialize it as:
- road dispatch planner;
- rail movement planner;
- ocean voyage/container coordinator.

Core logic cannot assume "driver" where the universal concept is "operator/crew/controller" or "truck" where the concept is "transport means/equipment".

## Article X — Enterprise evidence

No production automation claim is complete without:
- tenant isolation proof;
- authority tests;
- shadow/evaluation evidence;
- workflow reconstruction;
- idempotency/reconciliation;
- failover/degraded-mode evidence;
- customer acceptance;
- kill-switch proof;
- rollback/version proof.
