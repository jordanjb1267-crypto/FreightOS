CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE authority_mode AS ENUM ('carrier_agent', 'brokerage', 'shipper_owned');
CREATE TYPE organization_node_type AS ENUM (
  'enterprise','legal_entity','operating_authority','business_unit',
  'region','terminal','fleet','cost_center'
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  parent_id uuid REFERENCES organization_nodes(id),
  node_type organization_node_type NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_node_id uuid NOT NULL REFERENCES organization_nodes(id),
  legal_name text NOT NULL,
  jurisdiction text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operating_authorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  mode authority_mode NOT NULL,
  authority_type text NOT NULL,
  authority_number text,
  status text NOT NULL,
  effective_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_authorities ENABLE ROW LEVEL SECURITY;
-- Implement transaction-scoped tenant RLS policies and negative tests.
