#!/usr/bin/env python3
from pathlib import Path
import json, sys, re
try:
    import yaml
except ImportError:
    print("PyYAML is required: python3 -m pip install pyyaml", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "README.md","00_MASTER_HANDOFF.md","01_CONSTITUTION.md",
    "02_GOVERNANCE_AND_NON_REGRESSION.md","03_PRICING_AND_BILLING.md",
    "05_MULTIMODAL_DOMAIN_AND_ADAPTERS.md","09_AUTONOMY_POLICY_AND_AUTHORITY.md",
    "10_SECURITY_COMPLIANCE_AND_LEGAL_GATES.md","16_CLAUDE_MASTER_BUILD_PROMPT.md",
    "17_CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md","18_SOURCE_REGISTER.md",
    "19_PHYSICAL_LOGISTICS_AND_AUTONOMOUS_MOBILITY.md",
    "20_FACILITYOS_AND_AUTONOMOUS_OPERATIONS_PRICING.md",
    "21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md",
    "config/scope/module_states.yaml",
    "checklists/HORIZON_PROMOTION_GATE.md",
    "adr/0013-architect-complete-build-sequentially.md",
    "prompts/HORIZON_1_KICKOFF.md",
    "checklists/BROKERAGE_LEGAL_GATE.md",
    "checklists/AUTONOMOUS_VEHICLE_ACTIVATION_GATE.md",
    "checklists/FACILITY_AUTOMATION_GATE.md",
    "schemas/agent-manifest.schema.json",
    "schemas/facility-adapter.schema.json",
    "schemas/autonomous-vehicle-adapter.schema.json",
    "schemas/custody-event.schema.json",
    "config/pricing/carrier_plans.yaml",
    "config/pricing/facilityos_plans.yaml",
    "config/pricing/autonomous_vehicle_plans.yaml",
    "config/integrations/autonomous_vehicle_gateway.yaml",
    "db/0005_facility_autonomous_mobility.sql",
]
errors=[]
for rel in REQUIRED:
    if not (ROOT/rel).is_file(): errors.append(f"missing: {rel}")
for p in ROOT.rglob("*.json"):
    try: json.loads(p.read_text(encoding="utf-8"))
    except Exception as e: errors.append(f"invalid JSON {p.relative_to(ROOT)}: {e}")
for p in ROOT.rglob("*.yaml"):
    try: yaml.safe_load(p.read_text(encoding="utf-8"))
    except Exception as e: errors.append(f"invalid YAML {p.relative_to(ROOT)}: {e}")
source=(ROOT/"18_SOURCE_REGISTER.md").read_text(encoding="utf-8")
for d in ["fmcsa.dot.gov","ecfr.gov","modelcontextprotocol.io","unece.org","dcsa.org","x12.org","gs1.org","nhtsa.gov","sae.org"]:
    if d not in source: errors.append(f"source register missing: {d}")

# Safety boundary.
for rel in ["schemas/autonomous-vehicle-adapter.schema.json","config/integrations/autonomous_vehicle_gateway.yaml"]:
    text=(ROOT/rel).read_text(encoding="utf-8")
    for forbidden in ["vehicle.steer","vehicle.accelerate","vehicle.brake","vehicle.change_lane","vehicle.reverse"]:
        if forbidden not in text: errors.append(f"prohibition missing in {rel}: {forbidden}")

# Sequencing authority.
scope=yaml.safe_load((ROOT/"config/scope/module_states.yaml").read_text(encoding="utf-8"))
if scope.get("horizon_authorized") != 1 or scope.get("stop_after_horizon") != 1:
    errors.append("v1.2 must authorize and stop after Horizon 1")
required_states={
    "freightos_shared_core":"ACTIVE_BUILD",
    "road_ftl_carrier_operations":"ACTIVE_BUILD",
    "carrier_copilot":"ACTIVE_BUILD",
    "minimum_facility_primitives":"FOUNDATION_ONLY",
    "carrier_autonomous_a4_a5":"PROMOTION_GATED",
    "digital_brokerage":"LEGAL_AND_MARKET_GATED",
    "freight_exchange":"LIQUIDITY_GATED",
    "autonomous_vehicle_gateway":"INTERFACE_AND_SIMULATION_ONLY",
    "rail_adapter":"INTERFACE_AND_SIMULATION_ONLY",
    "ocean_adapter":"INTERFACE_AND_SIMULATION_ONLY",
    "air_adapter":"DORMANT",
}
modules=scope.get("modules",{})
for mid,state in required_states.items():
    if modules.get(mid,{}).get("state") != state:
        errors.append(f"module state mismatch: {mid} expected {state}")
for flag,val in scope.get("mandatory_defaults",{}).items():
    if val is not False: errors.append(f"mandatory deferred flag must be false: {flag}")

# Future product billing must be disabled.
products=yaml.safe_load((ROOT/"config/pricing/products.yaml").read_text(encoding="utf-8"))
product_ids={p["id"] for p in products.get("products",[])}
for product_id in ["facility_connect","facility_copilot","facility_autonomous","autonomous_vehicle_link"]:
    if product_id not in product_ids: errors.append(f"product missing: {product_id}")
for p in products.get("products",[]):
    if p.get("billing_enabled") is not False:
        errors.append(f"billing must remain disabled before production release: {p.get('id')}")
    if p.get("id") not in {"carrier_core","carrier_copilot"} and p.get("customer_sale_allowed") is not False:
        errors.append(f"future product sale must be disabled: {p.get('id')}")

# Future prompts must carry closed-state banners.
for p in sorted((ROOT/"prompts").glob("PHASE_*.md")):
    m=re.match(r"PHASE_(\d+)_",p.name)
    if m and int(m.group(1)) >= 4:
        text=p.read_text(encoding="utf-8")
        if "v1.2 authorization status" not in text or "Do not" not in text:
            errors.append(f"future prompt not explicitly gated: {p.name}")

agents=yaml.safe_load((ROOT/"config/agents/registry.yaml").read_text(encoding="utf-8"))
agent_ids={a["id"] for a in agents.get("agents",[])}
for agent_id in ["facility-operations-orchestrator","autonomous-mission-orchestrator","odd-eligibility-agent"]:
    if agent_id not in agent_ids: errors.append(f"agent missing: {agent_id}")

if errors:
    print("HANDOFF_VALIDATION=FAIL")
    for e in errors: print(f"- {e}")
    sys.exit(1)
print("HANDOFF_VALIDATION=PASS")
print(f"FILES={sum(1 for p in ROOT.rglob('*') if p.is_file())}")
print("SEQUENCING_DOCTRINE=PASS")
print("HORIZON_1_STOP_RULE=PASS")
print("DEFERRED_PRODUCTS_DISABLED=PASS")
print("SAFETY_BOUNDARY=PASS")
