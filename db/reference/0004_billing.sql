CREATE TYPE revenue_category AS ENUM (
  'saas','autonomy','brokerage','exchange','financing','support','implementation'
);

CREATE TABLE price_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  status text NOT NULL,
  effective_at timestamptz NOT NULL,
  retired_at timestamptz,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  revenue_category revenue_category NOT NULL,
  external_account_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  meter_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  idempotency_key text NOT NULL UNIQUE,
  revenue_category revenue_category NOT NULL,
  source_resource_type text,
  source_resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  currency char(3) NOT NULL,
  status text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  description text NOT NULL,
  quantity numeric NOT NULL,
  unit_amount_minor bigint NOT NULL,
  amount_minor bigint NOT NULL,
  revenue_category revenue_category NOT NULL,
  source_meter_id text,
  adjustment_of_line_id uuid REFERENCES invoice_lines(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
