# Pre-Release Security Checklist

## Change classification

- [ ] Risk level assigned R0–R4
- [ ] Security/data/authority/financial/operational impact identified
- [ ] Required independent reviewers assigned

## Identity and tenancy

- [ ] No client-controlled identity or tenant field grants authority
- [ ] Cross-tenant tests added or updated
- [ ] Privileges are least-privilege and revocable
- [ ] Audit records include policy and principal context

## Data

- [ ] New fields/events classified and inventoried
- [ ] Logs/traces/prompts do not expose sensitive values
- [ ] Retention/deletion behavior defined
- [ ] Nonproduction fixtures are synthetic or safely masked

## External effects

- [ ] Idempotency and reconciliation defined
- [ ] Retry-safe/unsafe operations identified
- [ ] Connector timeout, circuit breaker, and kill switch present
- [ ] No unapproved live side effect used in tests

## Release and migration

- [ ] Tests pass with exact exit status
- [ ] SBOM/provenance/signature generated as applicable
- [ ] Migration is backward compatible
- [ ] Canary and rollback/forward-fix plan tested
- [ ] Last-known-good artifact/configuration identified

## Reliability and recovery

- [ ] SLO/degraded behavior updated
- [ ] Alerts/runbooks updated
- [ ] Backup/recovery impact reviewed
- [ ] Reconciliation verification included

## AI/agents

- [ ] Agent/tool scope unchanged or explicitly reviewed
- [ ] Structured output validated
- [ ] Prompt-injection and authority tests updated
- [ ] Kill switch and approval behavior verified
