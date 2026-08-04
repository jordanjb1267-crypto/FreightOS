# FacilityOS and Autonomous Operations Pricing

**Catalog status:** Launch-target pricing; commercial approval and market validation required before publication  
**Currency:** USD  
**Billing separation:** SaaS, autonomous orchestration, brokerage, exchange, financing, and physical service charges remain separate revenue categories

## 1. Pricing principles

- Charge for active facilities, operational throughput, connected autonomous capacity, and completed orchestration—not seats or AI tokens.
- Standard users, drivers, dock workers, guards, and external status viewers are not mandatory paid seats.
- Basic facility records, docks, gates, and archived assets are included.
- Safety-critical controller or robotics vendor charges are third-party pass-throughs or separately contracted.
- The same movement cannot be charged twice for the same orchestration function without an explicit contract distinction.
- Enterprise prices use committed volume, pooled networks, support obligations, data residency, and dedicated infrastructure.

## 2. Billable units

### Active Facility

A facility is active when it receives appointments, vehicle visits, custody events, operational optimization, or integration traffic during the billing period.

### Completed Vehicle Visit

One authorized vehicle check-in through check-out at a facility. A canceled appointment without arrival is not a completed visit, but optional appointment-network pricing may apply.

### Managed Handling Unit Event

A verified pallet, container, package aggregation, seal, sensor, custody, shipping, or receiving event when the contract uses item-level throughput.

### Connected Autonomous Power Unit

An autonomous-capable powered unit whose identity, readiness, mission, or health status is actively connected to the Autonomous Vehicle Gateway.

### Autonomous Mission

One authorized transport mission from provider acceptance through mission reconciliation. Failed provider validation before authorization is not billable as a completed mission.

### Remote Assistance Coordination Case

One FreightOS operational case coordinating a provider, facility, carrier, customer, or recovery party. FreightOS remote driving is excluded.

## 3. FacilityOS plans

| Plan | Monthly fee per facility | Included completed visits | Overage per visit | Maximum autonomy |
|---|---:|---:|---:|---|
| Facility Connect | $499 | 500 | $0.75 | A1 |
| Facility Copilot | $1,999 | 2,500 | $0.35 | A3 |
| Facility Autonomous | $4,999 | 10,000 | $0.15 | A4 non-safety-critical |

### Facility Connect

Includes appointment intake, facility profile, gate/dock registry, vehicle visits, ETA visibility, digital credentials, custody events, documents, detention clocks, standard API/webhooks, and basic reports.

### Facility Copilot

Adds readiness prediction, capacity forecasts, appointment recommendations, yard/dock recommendations, labor forecasts, exception preparation, receiving forecasts, and advanced analytics.

### Facility Autonomous

Adds policy-bounded appointment approval/rescheduling, credential issuance, non-safety-critical staging/dock reassignment, routine notifications, detention evidence, receiving advice, discrepancy workflows, and autonomous-vehicle readiness interfaces.

It does not authorize physical-motion control.

## 4. Enterprise facility networks

| Network band | Monthly account platform | Active facility fee | Visit fee after pooled commitment |
|---:|---:|---:|---:|
| 10–49 facilities | $10,000 | $1,250 | $0.12 |
| 50–249 facilities | $25,000 | $750 | $0.08 |
| 250–999 facilities | $75,000 | $400 | $0.05 |
| 1,000+ facilities | $200,000 | $200 | $0.02–$0.04 contracted |

Enterprise contracts may pool visits across sites. Contract minimums, implementation, support, integrations, and dedicated cells remain separate.

## 5. Optional FacilityOS packs

| Pack | List price |
|---|---:|
| Cold-chain facility operations | $500 per active facility/month plus sensor pass-through |
| Hazmat and restricted-cargo workflow | $750 per active facility/month |
| Yard optimization and trailer pool | $750 per active facility/month |
| Labor and resource forecasting | $500 per active facility/month |
| Item/handling-unit EPCIS visibility | $0.005–$0.03 per managed event by volume |
| Facility digital twin onboarding | $2,500–$25,000 one-time per site |
| Autonomous-vehicle facility certification workflow | $5,000–$50,000 one-time per site/provider combination |

These fees activate only when the pack is enabled.

## 6. Autonomous Vehicle Link add-on

This pricing is additive to the applicable FreightOS carrier, shipper, or network plan.

| Connected autonomous units | Platform fee/month | Per active unit/month | Per completed mission |
|---:|---:|---:|---:|
| 1–49 | $1,000 | $75 | $15.00 |
| 50–249 | $5,000 | $45 | $8.00 |
| 250–999 | $15,000 | $25 | $4.00 |
| 1,000–4,999 | $50,000 | $14 | $2.00 |
| 5,000–24,999 | $125,000 | $8 | $1.00 |
| 25,000+ | $250,000 | $4 | $0.25–$0.75 contracted |

Included capabilities:

- Provider-independent mission and vehicle registry
- ODD and mission-eligibility exchange
- Facility compatibility and credentialing
- Mission state, ETA, exception, and customer orchestration
- Vehicle-health summaries and maintenance handoff
- Provider audit and reconciliation

Provider/OEM connectivity fees are passed through or separately contracted.

## 7. Autonomous Operations Center

| Service | Commercial basis |
|---|---|
| Standard autonomous operations console | Included in Autonomous Vehicle Link platform fee |
| Priority 24/7 operational coordination | 10% of annual recurring autonomous software revenue; $50,000 annual minimum |
| Mission-critical operations coordination | 18% of annual recurring autonomous software revenue; $250,000 annual minimum |
| Dedicated autonomous operations cell | Greater of $500,000/year or 20% of related ARR, plus attributable cloud/integration cost |
| Private deployment | Starting at $1 million/year plus implementation |

FreightOS operations personnel coordinate shipment and operational exceptions. They do not perform remote driving unless a future separately regulated and certified product is approved.

## 8. Remote assistance and recovery coordination

| Volume | FreightOS coordination fee per case |
|---:|---:|
| First 1,000 cases/month | $20 |
| 1,001–10,000 | $10 |
| 10,001–100,000 | $4 |
| 100,001+ | $1–$3 contracted |

Third-party remote operator, roadside, towing, technician, parts, charging, fuel, and repair charges are passed through or directly contracted.

## 9. Implementation

| Scope | Target implementation fee |
|---|---:|
| Single Facility Connect using standard templates | $0–$2,500 |
| Single Facility Copilot | $10,000–$35,000 |
| Single Facility Autonomous | $35,000–$100,000 |
| 10–49 facility network | $100,000–$500,000 |
| 50–249 facility network | $500,000–$2 million |
| 250+ facility network | $2 million+ statement of work |
| One autonomous vehicle provider adapter | $250,000–$1 million |
| Multi-provider enterprise AV deployment | $1 million–$10 million+ |

Implementation may include WMS/YMS/WES/ERP mapping, facility digital twin, data migration, credentials, EDI, provider certification, historical replay, shadow operations, security review, training, and cutover.

## 10. Billing controls

Required new products and meters:

- `facility_connect`
- `facility_copilot`
- `facility_autonomous`
- `facility_network`
- `autonomous_vehicle_link`
- `autonomous_operations_center`
- `completed_vehicle_visit`
- `managed_handling_unit_event`
- `connected_autonomous_power_unit`
- `completed_autonomous_mission`
- `remote_assistance_coordination_case`

All meter events require tenant, legal entity, product, source, unique event ID, occurred time, quantity, unit, and authoritative business reference. Corrections append adjustments.

## 11. Pricing governance

- Catalog versioning is mandatory.
- Public launch pricing requires owner approval.
- Autonomous pricing requires provider-cost and risk validation.
- No agent may offer discounts, modify contracts, or waive usage.
- Signed contracts retain their catalog and override versions.
- Brokerage or exchange activity remains billed through the corresponding legal entity and ledger.
