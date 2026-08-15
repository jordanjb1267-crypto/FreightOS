# 03 — Broker Agent Organization Factory

## Inputs

- tenant/brokerage legal entity
- BOT version
- enabled brokerage capabilities
- shipper account bindings
- carrier network bindings
- authority/compliance state
- workflow definitions
- autonomy grants
- integration bindings
- SLO tier
- model/data policy.

## Output

Each agent instance receives:
- tenant/legal plane
- role
- branch/team/book scope
- shipper scope
- carrier-data scope
- tools
- proposals
- commands
- financial limits
- approval rules
- model policy
- evaluation
- kill switch.

## Small brokerage

One-person broker may experience one "Broker Operations Agent", while logical policy roles remain separately modeled:
- intake
- quote
- sourcing
- qualification
- negotiation
- tender
- tracking
- documents
- settlement/compliance.

## Large brokerage / 3PL

```text
Brokerage Chief Orchestrator
├── Enterprise Accounts
│   ├── Account A Pod
│   └── Account B Pod
├── Regional Spot Operations
├── Carrier Sourcing / Capacity
├── Compliance / Qualification
├── Claims / Exceptions
└── Finance / Reconciliation
```

Global orchestration does not imply global command authority.

## Context

Per workflow, assemble minimum:
- BOT scope
- shipper requirement
- current shipment/RFQ
- eligible carriers
- contract/policy
- relevant market/relationship data
- authority
- evidence.

Never inject unrelated customers' rates or confidential data.

## Agent-to-agent protocol

Typed:
- observation
- request
- quote proposal
- carrier candidate
- negotiation proposal
- approval request
- command request
- result
- escalation.

No agent message is itself authority.
