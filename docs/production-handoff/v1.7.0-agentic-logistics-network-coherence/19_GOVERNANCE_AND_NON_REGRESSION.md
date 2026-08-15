# 19 — Governance and Non-Regression

## Precedence

Existing Constitution, security/resilience, legal/safety gates, sequencing doctrine and signed ADRs remain controlling.

## This package may

- add common abstractions;
- clarify product hierarchy;
- define long-term participant profiles;
- define dependency order;
- create design contracts/fixtures.

## This package may not

- activate deferred modules;
- weaken legal-plane separation;
- permit cross-tenant data leakage;
- authorize physical motion;
- change brokerage authority requirements;
- replace deterministic money/policy with AI;
- rewrite prior accepted handoffs merely for consistency.

## Common-parent rule

The new `ParticipantOperationalTwin` abstraction is conceptual/contractual.

Do not destructively rename:
- Company Operational Twin;
- Broker Operational Twin;
- Facility Operational Twin.

Implement compatibility/mapping if a shared type becomes useful.

## Architecture decision requirement

Any move to collapse previously separate domain ownership requires ADR with:
- data ownership
- legal/security impact
- migration
- API compatibility
- rollback
- tests.

## No marketing overclaim

Do not claim FreightOS already operates the full network merely because architecture exists.

Differentiate:
- designed;
- implemented;
- shadow-tested;
- customer-live;
- autonomous scope.
