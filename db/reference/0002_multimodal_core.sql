CREATE TYPE transport_mode AS ENUM ('road','rail','ocean','air','inland_waterway','other');

CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_node_id uuid NOT NULL REFERENCES organization_nodes(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  authority_mode authority_mode NOT NULL,
  external_reference text,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cargo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  consignment_id uuid NOT NULL REFERENCES consignments(id),
  description text NOT NULL,
  quantity numeric,
  weight_kg numeric,
  volume_m3 numeric,
  classification jsonb NOT NULL DEFAULT '{}'::jsonb,
  handling_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transport_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  status text NOT NULL,
  planned_start timestamptz,
  planned_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transport_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  journey_id uuid NOT NULL REFERENCES transport_journeys(id),
  sequence_number integer NOT NULL,
  mode transport_mode NOT NULL,
  service_type text,
  origin_location_id uuid,
  destination_location_id uuid,
  performing_party_id uuid,
  status text NOT NULL,
  modal_extension_schema text,
  modal_extension jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journey_id, sequence_number)
);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_legs ENABLE ROW LEVEL SECURITY;
