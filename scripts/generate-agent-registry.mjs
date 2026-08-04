#!/usr/bin/env node
// Regenerate config/agents/registry.yaml from the handoff registry so every entry validates
// against schemas/agent-manifest.schema.json. Authorised by ADR-0015 and ADR-0018.
//
// The transformation is mechanical and recorded here rather than hand-applied, so the divergence
// from the handoff is reproducible and reviewable.
//
// Two deliberate reductions, both recorded in the emitted header:
//
//  1. plane -> legal_authority_class + operating_contexts (ADR-0015). Because a legal class
//     constrains its contexts, an agent declared on both the carrier and brokerage planes cannot
//     be one manifest. Horizon 1 keeps the carrier manifest; the brokerage variant is authored
//     separately if and when the brokerage legal gate opens. That is the correct outcome —
//     ADR-0003 requires the two planes to keep separate credentials, queues, and ledgers, so they
//     should not share an agent identity either.
//
//  2. maximum_autonomy is preserved verbatim as a DECLARED ceiling. It is never the effective
//     ceiling; see effectiveMaximumAutonomy() in packages/config. This is why A4 values survive
//     here without shipping A4 behaviour.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { HANDOFF_ROOT, REPO_ROOT } from './handoff-sources.mjs';

const source = parse(readFileSync(join(HANDOFF_ROOT, 'config/agents/registry.yaml'), 'utf8'));

/** Agent id -> { module, purpose }. Modules are keys in config/scope/module_states.yaml. */
const PROFILE = {
  'chief-dispatch-orchestrator': [
    'carrier_copilot',
    'Coordinates carrier dispatch workflows across capacity, planning, and execution agents.',
  ],
  'capacity-agent': [
    'carrier_copilot',
    'Maintains the carrier view of available drivers, powered units, and equipment.',
  ],
  'load-discovery-agent': [
    'carrier_copilot',
    'Ingests and normalises load opportunities from approved broker and board sources.',
  ],
  'profitability-agent': [
    'carrier_copilot',
    'Applies deterministic cost profiles to score load profitability. Never calculates money itself.',
  ],
  'planning-agent': [
    'carrier_copilot',
    'Builds multi-load plans over available capacity and time windows.',
  ],
  'negotiation-agent': [
    'carrier_copilot',
    'Drafts rate negotiation and counteroffer language for human approval.',
  ],
  'feasibility-agent': [
    'carrier_copilot',
    'Checks hours, equipment, appointment, and facility feasibility for a candidate load.',
  ],
  'dispatch-agent': [
    'carrier_copilot',
    'Prepares driver dispatch instructions and assignment recommendations.',
  ],
  'tracking-agent': [
    'carrier_copilot',
    'Correlates tracking signals into shipment milestones and ETA observations.',
  ],
  'exception-agent': [
    'carrier_copilot',
    'Detects and classifies shipment exceptions and prepares resolution options.',
  ],
  'documentation-agent': [
    'carrier_copilot',
    'Extracts and validates shipment documents against expected structure.',
  ],
  'settlement-agent': [
    'carrier_copilot',
    'Prepares invoices and post-load profit reconciliation for human review.',
  ],
  'risk-agent': [
    'carrier_copilot',
    'Evaluates counterparty, cargo, and credit risk signals and raises holds.',
  ],

  'facility-operations-orchestrator': [
    'facilityos_lite',
    'Coordinates facility appointment, gate, dock, and receiving workflows.',
  ],
  'order-readiness-agent': [
    'facilityos_lite',
    'Tracks cargo readiness state ahead of a scheduled pickup appointment.',
  ],
  'appointment-agent': [
    'facilityos_lite',
    'Proposes and confirms pickup and delivery appointments against facility capacity.',
  ],
  'facility-capacity-agent': [
    'facilityos_lite',
    'Forecasts facility dock and labour capacity across appointment windows.',
  ],
  'gate-agent': [
    'facilityos_lite',
    'Manages gate credentials, arrival check-in, and departure check-out records.',
  ],
  'yard-orchestration-agent': [
    'facilityos_lite',
    'Recommends yard and staging assignments for vehicle visits.',
  ],
  'dock-agent': [
    'facilityos_lite',
    'Recommends dock door assignment and tracks loading and unloading progress.',
  ],
  'load-verification-agent': [
    'facilityos_lite',
    'Verifies loaded cargo against consignment records and seal evidence.',
  ],
  'receiving-agent': [
    'facilityos_lite',
    'Prepares goods receipt and delivery discrepancy records from receiving evidence.',
  ],
  'facility-exception-agent': [
    'facilityos_lite',
    'Detects and classifies facility service exceptions and detention risk.',
  ],
  'labor-resource-planning-agent': [
    'facilityos_lite',
    'Forecasts facility labour and resource demand across shifts.',
  ],
  'facility-customer-communication-agent': [
    'facilityos_lite',
    'Drafts facility status and exception communication for human approval.',
  ],

  'autonomous-mission-orchestrator': [
    'autonomous_vehicle_gateway',
    'Coordinates commercial autonomous mission requests. Never controls the dynamic driving task.',
  ],
  'odd-eligibility-agent': [
    'autonomous_vehicle_gateway',
    'Consumes provider-authoritative ODD decisions. It cannot grant eligibility itself.',
  ],
  'vehicle-facility-compatibility-agent': [
    'autonomous_vehicle_gateway',
    'Compares versioned facility geometry and restrictions against vehicle capability.',
  ],
  'remote-assistance-coordinator': [
    'autonomous_vehicle_gateway',
    'Coordinates provider remote-assistance cases. Remote assistance is not remote driving.',
  ],
  'autonomous-maintenance-coordinator': [
    'autonomous_vehicle_gateway',
    'Routes vehicle health summaries into RIGDESK maintenance workflows.',
  ],
  'autonomous-mission-exception-agent': [
    'autonomous_vehicle_gateway',
    'Classifies autonomous mission exceptions and minimal-risk events.',
  ],
  'mission-reconciliation-agent': [
    'autonomous_vehicle_gateway',
    'Reconciles completed autonomous missions against commercial and custody records.',
  ],
};

/** ADR-0015 rule 6. Carrier class wins over brokerage for Horizon 1; brokerage is disabled. */
function deriveLegalModel(planes) {
  if (planes.includes('carrier_agent')) {
    return { legal_authority_class: 'carrier_agent', operating_contexts: ['carrier'] };
  }
  if (planes.includes('brokerage')) {
    return { legal_authority_class: 'brokerage', operating_contexts: ['brokerage'] };
  }
  const contexts = planes.filter((p) =>
    ['shipper_owned', 'facility_operator', 'autonomous_mobility', 'system'].includes(p),
  );
  return { legal_authority_class: 'software_only', operating_contexts: contexts.sort() };
}

const agents = source.agents.map((a) => {
  const profile = PROFILE[a.id];
  if (!profile) throw new Error(`no profile mapping for agent "${a.id}"`);
  const [module, purpose] = profile;
  const { legal_authority_class, operating_contexts } = deriveLegalModel(a.planes);

  // Facility and AV agents keep software_only even though the handoff also lists them on the
  // carrier plane, because their owning module is deferred and their effective ceiling is A0.
  const corrected =
    module === 'carrier_copilot'
      ? { legal_authority_class, operating_contexts }
      : deriveLegalModel(a.planes.filter((p) => p !== 'carrier_agent'));

  return {
    id: a.id,
    version: '0.1.0',
    purpose,
    owner: 'rig-freightos-owner',
    module,
    legal_authority_class: corrected.legal_authority_class,
    operating_contexts: corrected.operating_contexts,
    tenant_scope: 'isolated',
    maximum_autonomy: a.max_autonomy,
    allowed_tools: [],
    prohibited_actions: [...a.prohibited].sort(),
    evaluation_suite: `evals/${a.id}.eval.yaml`,
  };
});

const header = `# FreightOS agent registry — operational copy.
#
# GENERATED by scripts/generate-agent-registry.mjs from
# docs/production-handoff/v1.2/config/agents/registry.yaml.
# Do not hand-edit. Declared as an authorised override in handoff-provenance.json.
#
# Why this file differs from the handoff (ADR-0015, ADR-0018):
#   - Every handoff entry carried 4 keys; agent-manifest.schema.json requires 12. All 32 entries
#     now validate against that schema.
#   - \`max_autonomy\` -> \`maximum_autonomy\`; \`prohibited\` -> \`prohibited_actions\`.
#   - \`planes\` -> \`legal_authority_class\` + \`operating_contexts\`.
#   - Agents the handoff declared on both the carrier and brokerage planes keep only the carrier
#     manifest. Brokerage is LEGAL_AND_MARKET_GATED and disabled in Horizon 1; its variant is
#     authored separately when the brokerage legal gate is signed.
#
# READ THIS BEFORE TRUSTING maximum_autonomy:
#   \`maximum_autonomy\` is a DECLARED ceiling, not a grant. The effective ceiling is
#   min(declared, module ceiling, horizon ceiling) — see effectiveMaximumAutonomy() in
#   packages/config and ADR-0018. In Horizon 1 every carrier agent resolves to A3 or lower and
#   every deferred-module agent resolves to A0, whatever this file says.
#
#   \`allowed_tools\` is empty for every agent. Empty means NO tool may be called. The tool
#   registry and per-tool schemas are Phase 2 deliverables.
#
#   \`evaluation_suite\` names the file each agent's evaluations will occupy. Those files do not
#   exist yet; they are Phase 2 deliverables.
#
#   \`owner\` is the repository owner pending per-agent accountable owners, assigned in Phase 2.
`;

const body = agents
  .map((a) => {
    const lines = [
      `  - id: ${a.id}`,
      `    version: '${a.version}'`,
      `    purpose: ${JSON.stringify(a.purpose)}`,
      `    owner: ${a.owner}`,
      `    module: ${a.module}`,
      `    legal_authority_class: ${a.legal_authority_class}`,
      `    operating_contexts:`,
      ...a.operating_contexts.map((c) => `      - ${c}`),
      `    tenant_scope: ${a.tenant_scope}`,
      `    maximum_autonomy: ${a.maximum_autonomy}`,
      `    allowed_tools: []`,
      `    prohibited_actions:`,
      ...a.prohibited_actions.map((p) => `      - ${p}`),
      `    evaluation_suite: ${a.evaluation_suite}`,
    ];
    return lines.join('\n');
  })
  .join('\n');

const out = `${header}
version: ${source.version}
generated_from: docs/production-handoff/v1.2/config/agents/registry.yaml
schema: schemas/agent-manifest.schema.json

agents:
${body}
`;

writeFileSync(join(REPO_ROOT, 'config/agents/registry.yaml'), out);
console.log(`agent registry regenerated: ${agents.length} agents`);
