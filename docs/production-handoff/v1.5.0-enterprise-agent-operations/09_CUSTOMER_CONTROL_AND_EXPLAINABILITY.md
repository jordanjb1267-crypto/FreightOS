# 09 — Customer Control and Explainability

## 1. Product requirement

Enterprise adoption depends on trust. The customer must be able to understand and govern its FreightOS agent organization without reading source code.

## 2. Customer Operations Console

Required surfaces:

### Company Map
- org structure
- terminals/fleets
- systems
- assets/capability summary
- role/escalation map

### "What FreightOS Understands"
- COT facts
- evidence/source
- confidence
- status
- last verified
- corrections
- pending disputes

### Workflow Map
For every automated workflow:
- trigger
- steps
- agent nodes
- deterministic nodes
- approvals
- external actions
- exception routes
- system of record
- SLA
- autonomy level.

### Agent Directory
- role
- scope
- tools
- authority
- autonomy
- current version
- latest evaluation
- kill switch
- responsible human owner.

### Approval Center
- action
- why
- evidence
- impact
- exact side effects
- expiry
- alternatives.

### Operations Timeline
- event
- decision
- command
- result
- correction
- escalation
- human action.

## 3. Explanation contract

For consequential recommendations/actions, FreightOS should provide:
- objective
- input facts
- hard constraints
- company policies
- alternatives considered
- reason for selection
- uncertainty
- authorization path
- external side effect
- verification outcome.

Do not expose hidden chain-of-thought. Provide concise evidence-based decision rationale.

## 4. Customer corrections

Corrections create:
- proposed COT change
- impacted workflows
- impacted agent manifests
- re-evaluation requirements
- effective date.

Do not rewrite historical audit.

## 5. Setup simplicity

### One-truck
Wizard:
1. Who are you?
2. What equipment do you operate?
3. Where does work arrive?
4. How do you dispatch/accept work?
5. Where do documents go?
6. How do you handle maintenance/roadside?
7. What may FreightOS do automatically?
8. Connect accounts / test.
9. Run shadow day.
10. approve go-live.

### Enterprise
Workspace with:
- importers
- workshops
- API/EDI mapping
- SSO/SCIM where applicable
- role/authority workshops
- sandbox
- staged rollout by region/terminal/workflow.

Same conceptual artifacts; different implementation depth.
