# 11 — Autonomous Detection, Containment, Rollback, and Repair System

## 1. Purpose

FreightOS should detect and repair operational problems quickly without allowing an automated system to make uncontrolled production changes.

## 2. Three automation levels

### Level 1 — Observe and recommend

Automation detects anomalies, correlates evidence, identifies probable cause, and proposes a runbook. No production effect.

### Level 2 — Execute bounded runbook

Automation may execute an approved, tested, reversible action within strict scope, such as:

- restart or replace an unhealthy stateless worker;
- scale a bounded worker pool;
- open a circuit breaker;
- pause a defective connector;
- disable a feature flag;
- revoke a known compromised credential;
- quarantine a message or tenant-specific job;
- roll back to a signed last-known-good artifact;
- replay a retry-safe idempotent event;
- switch read traffic to a verified replica under a tested rule.

### Level 3 — Generate a candidate code repair

Automation may reproduce the defect, generate a branch and tests, and prepare a pull request. It MUST NOT merge or deploy its own code repair without the normal evidence and approval gates.

## 3. Required runbook definition

Every autonomous runbook MUST declare:

- trigger signal and confidence threshold;
- scope and maximum blast radius;
- prerequisites;
- permitted identities/tools;
- exact actions;
- safety invariants;
- timeout;
- rollback;
- verification;
- escalation condition;
- audit fields;
- test evidence;
- owner and version.

## 4. Safety controls

- independent kill switch;
- per-action and per-time-window rate limits;
- cell/tenant/resource scoping;
- no privilege escalation;
- no modification of the policy that authorizes the runbook;
- no deletion of audit or evidence;
- two-person approval for destructive or broad actions;
- dry-run mode;
- last-known-good artifact/configuration registry;
- post-action health and reconciliation checks.

## 5. Detection sources

Use multiple signals:

- SLO burn rates;
- error and latency changes;
- authorization anomalies;
- event duplication or backlog;
- data-integrity checks;
- reconciliation mismatches;
- dependency health;
- deployment correlations;
- security alerts;
- customer-impact signals;
- synthetic transaction failures.

A single noisy metric should not trigger a broad destructive response.

## 6. Candidate repair pipeline

1. Create incident/defect record.
2. Capture relevant evidence and version state.
3. Reproduce in an isolated environment.
4. Add failing regression test.
5. Produce minimal candidate change.
6. Run full risk-appropriate test suite.
7. Generate security and migration impact analysis.
8. Create pull request with evidence.
9. Human or policy-required review.
10. Canary deployment.
11. Verify user behavior and reconciliation.
12. Promote or roll back.
13. Update runbook and threat model.

## 7. Prohibited autonomous actions

Without explicit bounded approval, automation MUST NOT:

- grant roles or permissions;
- alter bank/payment destinations;
- delete customer data;
- disable audit logging;
- modify backup retention;
- execute arbitrary shell commands in production;
- alter its own authority or kill switch;
- merge code;
- approve its own pull request;
- deploy unverified artifacts;
- make network-wide changes from a tenant-local signal.

## 8. Success measures

Track mean time to detect, contain, restore, reconcile, and permanently remediate. Do not optimize only for service restart time if the underlying state remains incorrect.
