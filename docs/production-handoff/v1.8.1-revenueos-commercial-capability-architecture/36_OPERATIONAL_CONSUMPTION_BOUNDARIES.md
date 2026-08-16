# 36 — Operational Consumption Boundaries

## 1. Principle

FMI supplies evidence. Operational domains retain decisions and commands.

```text
FMI SIGNAL
   ↓
DOMAIN-SPECIFIC CONSUMER
   ↓
DETERMINISTIC POLICY / AUTHORITY / WORKFLOW STATE
   ↓
PROPOSAL OR COMMAND REQUEST
   ↓
EXISTING FREIGHTOS EXECUTION GATES
```

## 2. Carrier consumption

Approved consumers may include:

- Load Discovery;
- Profitability Engine;
- Feasibility Engine;
- Planning/Dispatch components;
- ETA/exception workflows;
- maintenance/roadside planning.

Market rates/capacity may affect recommendations or scoring, but cannot alone authorize acceptance, assignment, negotiation, or external write.

## 3. Brokerage consumption

Approved consumers may include:

- Shipper Pricing;
- Carrier Sourcing;
- Margin Risk;
- procurement/tender planning;
- exception/customer communication.

Broker pricing must still pass deterministic pricing, credit, margin, legal, and quote-authority controls. Market intelligence does not become a license to quote any amount.

## 4. Facility consumption

FMI may support:

- expected arrival pressure;
- staffing/readiness forecasts;
- appointment-risk alerts;
- inbound/outbound surge planning.

It cannot exercise gate admission, dock assignment, custody, or physical facility authority unless a separately certified FacilityOS workflow does so.

## 5. Shipper consumption

FMI may support:

- procurement benchmarking;
- routing-guide risk;
- sourcing strategy recommendations;
- mode/corridor risk assessments.

It cannot bind a tender, carrier award, contract, or rate outside shipper authority workflows.

## 6. Service/RigDesk/Maintenance consumption

FMI may support:

- service-capacity awareness;
- parts risk;
- weather/disruption preparation;
- maintenance-demand forecasting;
- cost context.

It cannot diagnose a vehicle solely from market news, authorize repairs, spend customer funds, or dispatch roadside service without the controlling diagnostic/service workflow and authority.

## 7. RevenueOS consumption

RevenueOS may use FMI to:

- create customer-relevant market briefs;
- demonstrate applicable market conditions;
- identify capability fit;
- support renewal/expansion discussion;
- explain why an operational capability matters.

RevenueOS may not use FMI to manipulate urgency, fabricate scarcity, promise future rates, or misrepresent forecasts as guarantees.

## 8. Anti-circularity

A FreightOS operational action may itself become a customer-private or network-aggregate observation only through explicit telemetry/data policy. A recommendation cannot cite its own prior recommendation as independent market evidence.
