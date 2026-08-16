# 25 — Repository Integration Boundaries

## Audit first

Do not assume the repository should create new services/tables merely because this package names them conceptually. Claude must inventory existing primitives and reuse them where they satisfy the contract.

## Reuse candidates to inspect

- tenant/organization/participant identity;
- role/permission/authority framework;
- capability registry or agent registry;
- workflow/WorkUnit infrastructure;
- event/outbox/inbox/idempotency;
- policy engine;
- audit/evidence ledger;
- integration/adaptor registry;
- billing/plan/entitlement structures;
- existing CRM/integration hooks if any;
- workforce manifests and Job Books;
- deployment/cell boundaries;
- security/control registry.

## Do not create parallel truths

Prohibited without explicit architectural justification:

- second organization hierarchy;
- second authority engine;
- second audit ledger;
- separate customer identity model for sales;
- duplicate capability registry;
- duplicate workflow runtime;
- ungoverned “sales feature” database;
- spreadsheet as authoritative commission ledger;
- partner-specific code forks;
- customer-specific agent code forks.

## Expected additive surfaces after audit

Potential implementation surfaces may include:

- capability/offer schema additions;
- entitlement separation/extension;
- commercial authority profiles;
- PromiseSet/promise policy;
- opportunity/work-unit contracts;
- attribution/commission ledger projection;
- partner/deal-registration contracts;
- RevenueOS workforce manifests/jobs;
- tests/fixtures/CI gates.

These are hypotheses, not authorization.

## Migration doctrine

Any runtime schema change must use repository-standard safe migration practices, preserve existing behavior, and have rollback/forward-fix evidence. Installation of this handoff itself is documentation only.
