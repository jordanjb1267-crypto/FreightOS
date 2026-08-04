# Governance and Non-Regression Rules

## Required governance artifacts

- Constitution
- ADRs
- Product/pricing catalog
- Domain glossary
- Agent registry
- Policy registry
- Integration registry
- Threat model
- Risk register
- Data-classification register
- Decision log
- Release and incident runbooks
- Legal-gate checklists

## Owner approval required

- Company/legal structure
- New regulated activity
- Public pricing changes
- Material scope changes
- Module-state or horizon promotion
- Shared learning from private data
- Money movement
- New autonomous red-action class
- Investment/equity decisions

## Architecture review required

- Core schema changes
- Tenant hierarchy changes
- Adapter contract changes
- Event envelope changes
- Policy interface changes
- New service extraction
- New authority source

## Security review required

- New external integration
- New model provider
- New MCP transaction tool
- New privileged role
- New export
- New document path
- New cross-tenant admin capability

## Non-regression rules

Do not:

- Rewrite RIGDESK or RigReceipts without migration and tests.
- Depend on the owner laptop for production.
- Use cross-tenant admin shortcuts.
- Store credentials in prompts, code, fixtures, logs, or memory.
- Let a model generate raw production SQL.
- Let MCP bypass policy or billing.
- Put rail/ocean fields in road-specific tables.
- Hardcode one carrier per shipment.
- Hardcode one legal entity per enterprise.
- Use UI state as approval evidence.
- Accept email alone without domain transition and audit.
- Replace deterministic calculators with LLM arithmetic.
- Ship A4 before A3 canary evidence.
- Ship Brokerage Mode before legal signoff.
- Claim production ready because unit tests pass.
- Treat a future phase prompt as current implementation authorization.
- Create production workers, public routes, live credentials, or external-write connectors for deferred modules.
- Enable future product billing or customer sale before commercial activation.
- Advance beyond Horizon 1 without an owner-approved promotion ADR.

## Change process

Every material change documents problem, alternatives, legal/security impact, migration, compatibility, tests, rollback, observability, ownership, and ADR when architectural.

## Additional non-regression rules for FacilityOS and autonomous mobility

Do not:

- Add dynamic-driving-task, remote-driving, robotics, PLC, conveyor, door, dock-restraint, or safety-interlock commands.
- Treat a facility as only a road address or coordinate.
- Invent facility geometry, clearances, restrictions, ODD eligibility, or vehicle readiness.
- Permit an agent to release a provider, facility, cybersecurity, quality, or maintenance hold.
- Mix high-frequency vehicle/facility telemetry into the primary transactional query path.
- Activate live AV missions through a normal feature flag.
- Interpret remote assistance as remote driving.
- Mark custody accepted without required evidence and authorized actors.

Owner, legal, security, and safety review are required for any expansion of physical-control authority.


## Sequencing governance

`21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md` and `config/scope/module_states.yaml` are binding. The stricter restriction wins if prose and configuration disagree.

Every phase exit report must include a deferred-scope verification showing:

- No prohibited service or application was created.
- No deferred live connector or credential exists.
- No future billing entitlement is active.
- No module state was changed without the promotion gate.
- No phase beyond the authorized horizon was started.
