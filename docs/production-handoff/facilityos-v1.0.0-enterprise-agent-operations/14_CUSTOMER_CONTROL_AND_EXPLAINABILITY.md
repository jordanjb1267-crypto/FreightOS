# 14 — Customer Control and Explainability

## Facility Operations Console

### What FacilityOS Understands
FOT assertions + evidence + confidence + status.

### Facility Map
Logical facility topology, systems and operational zones.

### Workflow Map
Each graph with steps, approvals, agents, side effects, exceptions.

### Agent Directory
Role, scope, tools, autonomy, evaluation, kill switch.

### Document/BOL Queue
Expected/received/matched/review/correction/accepted/superseded.

### Visit Board
Pre-arrival -> arrived -> gate -> staging -> dock -> service -> release -> departed.

### Shipping Office
Outbound work/doc/release queue.

### Receiving Office
Inbound BOL/receipt/discrepancy queue.

### Exception Center
Issues, owners, SLA, evidence, network impact.

## Explanation

For a consequential action show:
- current state
- FOT rules used
- authoritative sources
- hard constraints
- recommendation/action
- approval/autonomy
- side effect
- result/reconciliation.

Do not expose hidden chain-of-thought.

## Corrections

Customer corrections create versioned FOT/workflow changes and impact analysis.
Historical audit remains immutable.
