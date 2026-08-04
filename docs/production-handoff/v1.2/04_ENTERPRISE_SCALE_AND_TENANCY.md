# Enterprise Scale and Tenancy

## Hierarchy

Node types:

- Enterprise
- Legal Entity
- Operating Authority
- Business Unit
- Region
- Terminal
- Fleet
- Cost Center

Drivers, equipment, users, policies, contracts, and reports can be scoped to any valid node.

## Policy inheritance

Policies inherit downward. A child may tighten a restriction but cannot weaken legal, safety, enterprise-minimum, security, residency, or approval controls.

Every effective policy records inherited source and local override.

## Isolation

Tenant-owned records include:

- tenant_id
- organization_node_id
- legal_entity_id
- authority_mode

Use PostgreSQL RLS, application authorization, service scopes, explicit admin workflows, negative tests, and dedicated keys for strategic deployments.

## Cell architecture

### Global control plane

Tenant routing, identity metadata, product catalog, deployment registry, agent/model registry, global policy definitions, and billing catalog.

### Regional/dedicated cells

Freight database, workflows, event partitions, integrations, read models, audit, and tenant data.

## Mega-carrier targets

- 100,000 active powered units
- 1 million equipment records
- 250,000 identities
- 100,000 concurrent shipment workflows
- 6 million location observations/hour
- 10,000-command batch operations
- Enterprise-wide policy updates
- Regional dashboards
- Full audit export

Telemetry uses a separate stream/time-series path and does not continuously update primary shipment rows.

## Enterprise capabilities

- SAML/OIDC federation
- SCIM provisioning
- Delegated administration
- Multiple authorities/currencies/accounting entities
- Regional residency
- Bulk APIs
- Cost-center chargebacks
- Custom retention
- Dedicated DR
- Contracted SLOs
- Global volume pooling
- Dedicated workers and partitions

## Scale progression

1. Shared modular monolith and Postgres
2. Read replicas and isolated workers
3. Partitioned telemetry/events
4. Regional cells
5. Dedicated strategic cells
6. Independent compliance/financial services when justified
