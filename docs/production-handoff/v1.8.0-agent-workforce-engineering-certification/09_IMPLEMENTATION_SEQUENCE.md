# 09 — v1.8 Implementation Sequence

## W0 Repository job inventory
Map every existing agent, worker, service, workflow node, policy function and human approval role to the v1.8 catalog.

## W1 Classification
For each current "agent": KEEP_AGENT, HYBRID_AGENT, DETERMINISTIC_SERVICE, WORKFLOW_SERVICE, MERGE, HUMAN_ONLY, or MISSING_IMPLEMENTATION.

## W2 Job contracts
Implement Job Book / WorkUnit / Handoff / Certification contracts.

## W3 Carrier workforce
Current primary commercial wedge: carrier jobs and simulations first.

## W4 Shared handoff/ownership runtime
Unique ownership, typed handoff, expiry, rejection and orphan-work detection.

## W5 Job-specific evaluation harness
Registry and fixtures by job/version.

## W6 Shadow certification
Carrier current-scope jobs first.

## W7 Facility/Brokerage
Only within existing promotion/legal gates.

## W8 Shipper/Service
Implement as their module scopes are promoted.

## W9 Commercial claims registry
Expose exact Designed / Implemented / Shadow / A3 / A4 / A5 status.

This sequence does not override module-state governance.
