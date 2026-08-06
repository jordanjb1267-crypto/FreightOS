# 04 — Tenant Isolation and Data Protection Standard

## 1. Isolation model

FreightOS SHALL enforce tenant isolation in depth. No single layer is sufficient.

Required layers:

1. trusted server-side tenancy assignment;
2. database row-level or equivalent policy enforcement;
3. service-layer authorization;
4. tenant-aware object storage;
5. tenant-aware cache keys and namespaces;
6. tenant-aware search and analytics filters;
7. export and reporting controls;
8. scoped encryption and key access for highly sensitive domains;
9. automated isolation testing in CI and production-like environments.

## 2. Data ownership and sharing

Every protected object MUST declare:

- owning organization;
- originating principal/system;
- permitted counterparties or network scopes;
- purpose of sharing;
- retention class;
- classification;
- policy version.

Cross-party logistics workflows require selective sharing. A load's operational status may be shared while internal carrier economics remain private. Data contracts must define field-level or view-level disclosure rather than exposing the complete underlying object.

## 3. Database controls

- Application roles must not own schemas, tables, functions, or migrations.
- Use separate migration/admin identities from runtime identities.
- Security-definer functions must pin `search_path`, minimize privileges, validate caller authority, and avoid dynamic SQL where possible.
- Runtime queries must not bypass tenant policy by using owner or elevated roles.
- Tenant keys and ownership fields must be immutable to ordinary users once established, except through controlled transfer workflows.
- Foreign keys and constraints should prevent cross-tenant references where the data model permits.
- Database policy tests are release-blocking.

## 4. Storage, cache, search, and analytics

- Object paths must include non-guessable identifiers and enforce authorization independent of URL secrecy.
- Signed URLs must be short-lived, audience-bound where possible, and revocable through object or policy state.
- Cache entries must include tenant, policy scope, and user-relevant authorization dimensions.
- Search indexing must carry authoritative tenant and visibility metadata.
- Analytics datasets must be isolated or transformed according to classification and customer agreements.
- Embeddings and vector indexes must not allow cross-tenant semantic retrieval unless explicitly permitted.

## 5. Encryption and secrets

- Encrypt data in transit and at rest.
- Use managed key systems with access logging and rotation.
- Separate production from nonproduction keys and secrets.
- Use envelope or field-level encryption for high-risk identity, banking, credential, and security data where justified.
- Do not store raw card or bank credentials when tokenized providers can perform the function.
- Never place secrets in logs, prompts, analytics, traces, crash reports, or support exports.
- Secret scanning is mandatory in source and build pipelines.

## 6. Nonproduction data

Production data MUST NOT be copied into lower environments without an approved process that:

- identifies the purpose;
- minimizes fields;
- irreversibly masks or synthesizes sensitive values;
- removes active credentials and tokens;
- changes contact endpoints;
- prevents messages or transactions from reaching real users/providers;
- records the copy and expiration;
- deletes the dataset after use.

## 7. Isolation incident rule

Any credible cross-tenant access path is at least an R3 incident and release blocker. Preserve evidence, disable or contain the affected path, determine whether access was possible and whether it occurred, and follow the incident standard.
