CREATE TABLE agent_definitions (
  id text NOT NULL,
  version text NOT NULL,
  manifest jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE policy_definitions (
  id text NOT NULL,
  version text NOT NULL,
  definition jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE policy_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  actor_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  decision text NOT NULL,
  reasons jsonb NOT NULL,
  constraints jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  action text NOT NULL,
  material_parameters_hash text NOT NULL,
  approved_by text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  legal_entity_id uuid,
  authority_mode authority_mode,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  event_type text NOT NULL,
  resource_type text,
  resource_id text,
  correlation_id text NOT NULL,
  causation_id text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_correlation_idx ON audit_events(correlation_id);
