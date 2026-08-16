# 45 — Graph Certification, Simulation and Replay Standard

A Job Book certification is insufficient if the graph containing that job is not certified. Certification therefore occurs at both **component** and **graph** levels.

## Candidate-to-production path

`AUDIT_CANDIDATE → G0 ACCEPTED SPEC → G1 STATIC CONTRACT → G2 ADVERSARIAL → G3 REPLAY/CRASH → G4 SHADOW → G5 BOUNDED LIVE`

Graph certification never raises a component above its own J-level or A-level; the effective permission is the strictest conjunction of graph, component, command, policy, entitlement, and autonomy controls.

## Required graph simulations

Every graph must test: happy path; duplicate trigger; duplicate edge delivery; stale source/config/catalog/policy version; wrong tenant; wrong participant/legal plane; invalid sender; receiver precondition failure; authority denial; approval expiry; kill switch at every consequential node; dependency outage; model outage; timeout; crash before side effect; crash after side effect; reconciliation mismatch; malformed typed artifact; prompt injection in untrusted text; and replay after correction.

## Cross-plane simulations

`XPL-G01..G06` additionally must prove that an FMI signal cannot directly call a logistics command, a RevenueOS entitlement cannot bypass operational activation, and a broker/carrier/facility/service agent never inherits the market-intelligence producer's permissions.

## Evidence

Graph certification produces graph/version, repository SHA, fixture IDs, node/edge coverage, injected failure matrix, observed transitions, audit/event trace, duplicate-effect oracle, stale-invalidation proof, and reviewer/owner acceptance.
