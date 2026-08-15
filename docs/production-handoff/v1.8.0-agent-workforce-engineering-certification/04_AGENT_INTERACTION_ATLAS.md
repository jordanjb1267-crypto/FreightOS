# 04 — Agent Interaction Atlas

Agents do not generically "talk."

Permitted interaction artifacts:
- Observation
- Request
- Proposal
- DecisionResult
- ApprovalRequest
- CommandRequest
- Exception
- Handoff
- EvidenceReference
- CompletionNotice

A handoff transfers ownership only after the receiver validates tenant/legal plane, artifact schema/version, subject identity, evidence, freshness, authority, and expected state.

If rejected, ownership remains with the sender until rerouted/escalated.

Cross-company interactions terminate at the FreightOS Network boundary. The receiving participant independently evaluates the incoming artifact under its own Operational Twin, authority, and workflow.
