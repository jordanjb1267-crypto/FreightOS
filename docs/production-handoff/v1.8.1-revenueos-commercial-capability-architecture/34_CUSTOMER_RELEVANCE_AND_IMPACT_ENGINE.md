# 34 — Customer Relevance and Impact Engine

## 1. Objective

Market intelligence becomes useful when it answers:

> What changed, why does it matter to this participant, which parts of its operation are exposed, and what governed workflow should consider the information?

The Customer Relevance and Impact Engine (CRIE) performs that mapping without creating operational authority.

## 2. Inputs

CRIE may consume:

- approved participant/Twin facts;
- enabled capability set;
- current/authorized market exposure profile;
- lane/corridor/equipment/commodity scopes;
- facilities/ports/rail ramps/service geographies;
- customer notification preferences;
- active workflow references where policy allows;
- canonical FMI signals.

## 3. Outputs

Typed outputs:

- `CustomerMarketRelevanceAssessment`;
- `CustomerImpactBrief`;
- `MarketAlert`;
- `WorkflowEvidenceReference`;
- `MarketOpportunityObservation`;
- `MarketRiskObservation`.

## 4. Relevance dimensions

Each assessment may score:

- direct geographic overlap;
- lane/corridor overlap;
- equipment compatibility;
- commodity/customer-industry exposure;
- current WorkUnit exposure;
- service network exposure;
- financial sensitivity;
- time-to-impact;
- confidence;
- materiality.

## 5. Persona-specific translation

### Carrier operations

Translate market signals into questions such as:

- Are current lanes tightening or loosening?
- Has the expected market rate changed materially?
- Is outbound demand shifting toward another nearby market?
- Does a disruption threaten pickup/delivery feasibility?
- Has fuel changed enough to alter profitability assumptions?

### Broker operations

- Is carrier buy capacity tightening?
- Is the sell/buy spread assumption stale?
- Is sourcing difficulty increasing by equipment/lane?
- Does a disruption require wider carrier search or customer repricing review?
- Is margin risk rising?

### Facility operations

- Is an inbound freight surge likely?
- Are port/border/rail delays likely to create arrival bunching?
- Is carrier scarcity likely to create appointment misses?

### Shipper operations

- Which lanes are exposed to procurement/routing-guide failure?
- Where are spot/contract economics diverging?
- Which disruptions warrant modal or routing review?

### Maintenance / RigDesk

- Are parts/service/wrecker capacities constrained in operating regions?
- Are weather/road conditions likely to increase breakdown/service demand?
- Are fuel/maintenance input changes materially affecting operating cost?

## 6. No automatic policy rewrite

A strong market signal may generate a **proposal** to review:

- a rate floor;
- a dispatch preference;
- a sourcing radius;
- a facility staffing plan;
- a maintenance stocking policy.

It cannot change those policies itself unless a separate controlling workflow explicitly grants that bounded authority and all existing gates pass.

## 7. Explainability

Every material customer alert must support:

- why this customer received it;
- what source signals contributed;
- freshness/confidence;
- what customer facts created relevance;
- what operational surfaces may be affected;
- whether action is informational, recommended, approval-required, or handled by another certified workflow.
