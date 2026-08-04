ALTER TYPE authority_mode ADD VALUE IF NOT EXISTS 'facility_operator';
ALTER TYPE authority_mode ADD VALUE IF NOT EXISTS 'autonomous_mobility';

CREATE TYPE appointment_status AS ENUM (
  'requested','capacity_checking','proposed','confirmed','vehicle_assigned',
  'arrival_tracking','checked_in','yard_assigned','dock_assigned','service_started',
  'service_complete','checked_out','closed','rejected','cancelled','rescheduled',
  'missed','facility_hold','carrier_hold'
);

CREATE TYPE custody_event_type AS ENUM (
  'release_authorized','loading_verified','carrier_custody_accepted',
  'delivery_presented','receiver_inspection_started','receiver_accepted',
  'partially_accepted','rejected','seal_exception','damage_exception'
);

CREATE TYPE autonomous_mission_status AS ENUM (
  'draft','cargo_eligible','vehicle_requested','provider_validating','odd_eligible',
  'vehicle_assigned','vehicle_ready','origin_ready','mission_authorized',
  'en_route_to_origin','origin_service','linehaul','destination_service',
  'delivery_complete','post_mission_inspection','available','odd_ineligible',
  'weather_hold','facility_hold','remote_assistance','minimal_risk_condition',
  'vehicle_fault','cargo_exception','cybersecurity_hold','mission_aborted',
  'human_recovery_required'
);

CREATE TABLE facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_node_id uuid NOT NULL REFERENCES organization_nodes(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  authority_mode authority_mode NOT NULL,
  name text NOT NULL,
  facility_type text NOT NULL,
  location_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE facility_operational_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  parent_id uuid REFERENCES facility_operational_locations(id),
  location_type text NOT NULL,
  name text NOT NULL,
  geometry_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  status text NOT NULL,
  readiness_probability numeric CHECK (readiness_probability IS NULL OR (readiness_probability >= 0 AND readiness_probability <= 1)),
  authoritative_source text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  authority_mode authority_mode NOT NULL,
  shipment_id uuid REFERENCES shipments(id),
  transport_leg_id uuid REFERENCES transport_legs(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  status appointment_status NOT NULL,
  requested_start timestamptz,
  requested_end timestamptz,
  committed_start timestamptz,
  committed_end timestamptz,
  appointment_type text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  appointment_id uuid REFERENCES appointments(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  powered_unit_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  nonpowered_equipment_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  operator_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_in_at timestamptz,
  service_started_at timestamptz,
  service_completed_at timestamptz,
  checked_out_at timestamptz,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gate_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  vehicle_visit_id uuid REFERENCES vehicle_visits(id),
  credential_type text NOT NULL,
  credential_reference text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  revoked_at timestamptz,
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE facility_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  vehicle_visit_id uuid REFERENCES vehicle_visits(id),
  task_type text NOT NULL,
  target_location_id uuid REFERENCES facility_operational_locations(id),
  status text NOT NULL,
  safety_control_authority text NOT NULL DEFAULT 'external_certified_or_human_controller',
  instructions jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE custody_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  authority_mode authority_mode NOT NULL,
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  consignment_id uuid REFERENCES consignments(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  event_type custody_event_type NOT NULL,
  releasing_party_reference jsonb NOT NULL,
  accepting_party_reference jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity jsonb NOT NULL DEFAULT '{}'::jsonb,
  seal jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  status text NOT NULL,
  receipt_reference text,
  accepted_quantity jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejected_quantity jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE facility_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  discrepancy_type text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE autonomous_vehicle_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id uuid REFERENCES legal_entities(id),
  name text NOT NULL,
  adapter_version text NOT NULL,
  status text NOT NULL,
  provider_authority text NOT NULL DEFAULT 'dynamic_driving_task_and_odd',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE autonomous_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider_id uuid NOT NULL REFERENCES autonomous_vehicle_providers(id),
  external_vehicle_reference text NOT NULL,
  powered_unit_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  capability jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, external_vehicle_reference)
);

CREATE TABLE odd_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider_id uuid NOT NULL REFERENCES autonomous_vehicle_providers(id),
  external_profile_reference text,
  version_label text NOT NULL,
  restrictions jsonb NOT NULL,
  authoritative_source text NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE autonomous_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
  authority_mode authority_mode NOT NULL,
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  transport_leg_id uuid NOT NULL REFERENCES transport_legs(id),
  provider_id uuid NOT NULL REFERENCES autonomous_vehicle_providers(id),
  vehicle_id uuid REFERENCES autonomous_vehicles(id),
  odd_profile_id uuid REFERENCES odd_profiles(id),
  origin_facility_id uuid REFERENCES facilities(id),
  destination_facility_id uuid REFERENCES facilities(id),
  status autonomous_mission_status NOT NULL,
  provider_mission_reference text,
  eligibility_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  authorization_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE remote_assistance_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  mission_id uuid NOT NULL REFERENCES autonomous_missions(id),
  assistance_type text NOT NULL CHECK (assistance_type IN ('monitoring','confirmation','guidance','authorization','field_recovery')),
  status text NOT NULL,
  provider_case_reference text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_health_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  vehicle_id uuid NOT NULL REFERENCES autonomous_vehicles(id),
  observed_at timestamptz NOT NULL,
  readiness_status text NOT NULL,
  provider_authoritative boolean NOT NULL DEFAULT true,
  summary jsonb NOT NULL,
  telemetry_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_operational_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_vehicle_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE odd_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE remote_assistance_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_health_summaries ENABLE ROW LEVEL SECURITY;

-- Implement transaction-scoped tenant RLS policies, legal-context checks,
-- state-transition guards, append-only custody/audit protections, and negative tests.
