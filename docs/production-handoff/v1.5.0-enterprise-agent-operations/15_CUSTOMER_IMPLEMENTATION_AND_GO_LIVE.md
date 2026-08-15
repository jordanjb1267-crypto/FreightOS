# 15 — Customer Implementation and Go-Live

## 1. Productized implementation

Goal: onboarding is repeatable professional services + automated discovery, not custom engineering.

## 2. Customer tiers

### Fast Start
Owner-operator / very small fleet.

### Standard
Small/medium fleet with common integrations.

### Enterprise
Complex hierarchy, SSO, many integrations, security/procurement.

### Strategic/Dedicated
Dedicated cell, residency, custom conformance, high scale.

## 3. Universal implementation sequence

### Phase 0 — Commercial/scope
- tenant/legal entity
- desired outcomes
- target workflow(s)
- operating mode(s)
- risk class
- data/security requirements.

### Phase 1 — Company discovery
- COT sources
- systems
- SOPs
- roles
- vocabulary
- topology
- policies.

### Phase 2 — Connectivity
- read-only connectors first
- map system-of-record
- fixture/conformance tests.

### Phase 3 — Workflow mapping
- map as-is
- map FreightOS target
- identify deterministic vs judgment steps
- exception paths.

### Phase 4 — Agent organization
- instantiate manifests
- scope tools/data
- configure escalation.

### Phase 5 — Shadow
- observe
- compare
- correct COT/workflows.

### Phase 6 — Approval-to-execute
- selected side effects
- read-after-write
- customer signoff.

### Phase 7 — Bounded autonomy
- independently certified actions.

### Phase 8 — Expand
- additional fleet/terminal/workflow/mode.

## 4. Fast Start target experience

The one-truck customer should be able to:
- create company
- describe operating model
- connect email/load source/documents/accounting where supported
- validate one cost/dispatch/document workflow
- run shadow
- approve selected automation
with minimal technical vocabulary.

## 5. Enterprise implementation artifacts

- COT
- source-of-truth matrix
- integration inventory
- data map
- workflow catalog
- agent manifest inventory
- authority matrix
- security review
- conformance results
- shadow report
- go-live approval
- rollback
- support/escalation.

## 6. Rollout

Never big-bang entire mega-carrier.

Prefer:
workflow -> terminal/fleet -> shift/region -> wider scope.

## 7. Customer success handoff

Operations team receives:
- system map
- dashboards
- runbooks
- approval responsibilities
- autonomy review dates
- incident path
- change process.
