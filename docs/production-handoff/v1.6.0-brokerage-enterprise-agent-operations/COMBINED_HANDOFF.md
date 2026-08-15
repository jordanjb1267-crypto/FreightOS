# FreightOS Brokerage Enterprise Agent Operations Handoff v1.6.0 — Combined

Individual package files are controlling. This convenience document does not replace earlier FreightOS handoffs. Existing files were not modified.


---

<!-- SOURCE: 00_MASTER_HANDOFF.md -->

# 00 — FreightOS Brokerage Enterprise Agent Operations Master Handoff

## 1. Executive mandate

FreightOS SHALL support a separately governed **Brokerage Plane** through which an authorized brokerage entity can automate the commercial and operational work of arranging transportation between shippers and unrelated carriers.

The brokerage plane must connect directly to:
- shipper demand and requirements;
- carrier capacity and qualification;
- carrier agent organizations;
- FacilityOS origin/destination readiness;
- shipment execution;
- documents/evidence;
- claims/exceptions;
- invoicing, carrier pay status, and settlement evidence.

## 2. Legal-plane separation

```text
Carrier-Agent Plane
  acts for one appointed carrier
  cannot allocate among unrelated carriers
  cannot earn brokerage compensation

Brokerage Plane
  acts for authorized brokerage entity
  can source/select unrelated carriers
  can negotiate both commercial sides within authority
  can tender/allocate freight
  records brokerage compensation and regulated transaction records
```

Credentials, contracts, queues, ledgers, bank/payment integrations, audit scopes, agents, and authority MUST remain distinguishable.

No prompt, tenant setting, user role, or model output may convert one plane into the other.

## 3. Broker Operational Twin

Every brokerage tenant receives a versioned, inspectable Broker Operational Twin (BOT) defining how that brokerage actually operates:
- legal brokerage entity/authority;
- branches/divisions/teams/books;
- shipper accounts/contracts;
- lanes/modes/equipment;
- routing guides;
- carrier network/approval policies;
- pricing and margin policies;
- credit/payment terms and limits;
- carrier-pay practices;
- tender/negotiation SOPs;
- exception/accessorial rules;
- claims workflows;
- documentation requirements;
- communication templates/channels;
- accounting/TMS/CRM/load-board/integration systems;
- approval hierarchy;
- segregation-of-duties;
- record retention;
- customer-specific requirements;
- data-sharing rights.

The customer can inspect, correct, approve, version and diff the BOT.

## 4. Broker Agent Organization

Canonical roles:
- Brokerage Operations Orchestrator
- Shipper Intake Agent
- Requirements Agent
- Shipper Pricing Agent
- Carrier Sourcing Agent
- Carrier Qualification Agent
- Allocation Agent
- Negotiation Agent
- Tender/Booking Agent
- Shipment Execution Agent
- Tracking/Communication Agent
- Facility Coordination Agent
- Documentation Agent
- Accessorial Agent
- Margin Risk Agent
- Claims/Evidence Agent
- Shipper Billing Agent
- Carrier Pay/Reconciliation Agent
- Compliance Supervisor Agent
- Customer/Carrier Relationship Support Agent
- Configuration Steward

Logical responsibilities stay separately governed even when small tenants use fewer runtime workers.

## 5. Canonical brokerage lifecycle

```text
Shipper Demand / RFQ
      ↓
Requirements + Legal Context
      ↓
Price / Quote
      ↓
Shipper Commitment
      ↓
Carrier Sourcing
      ↓
Carrier Qualification
      ↓
Carrier Buy Negotiation
      ↓
Allocation
      ↓
Tender / Acceptance
      ↓
Shipment / Facility Execution
      ↓
Documents / POD / Accessorials
      ↓
Shipper Invoice
      ↓
Carrier Pay Status
      ↓
Broker Transaction Record
      ↓
Reconciliation / Close
```

Every transition is a typed business artifact.

## 6. Autonomous brokerage endpoint

The mature operating model may be:

```text
Human Brokerage Leadership / Compliance
              ↓
Policy + Contract + Risk Configuration
              ↓
Brokerage Agents
              ↓
Routine quote/source/negotiate/tender/track/document/reconcile
              ↓
Human Exception / Relationship / High-Risk Supervision
```

Human labor can be dramatically reduced, but legal authority and compliance remain attached to the authorized entity.

## 7. Customer-specific, canonical product

A customer's unique shipper contracts, margin rules, carrier preferences, communication style, branches and SOPs are BOT/configuration/policy.

They do not justify a permanent software fork.

## 8. Enterprise replication

Every brokerage feature must support:
- shared SaaS;
- dedicated execution partition;
- dedicated enterprise cell;
- versioned APIs/events;
- auditable customer configuration;
- repeatable onboarding;
- contractual SLOs;
- export/retention;
- customer security/procurement review.

## 9. Existing controls remain controlling

If this package conflicts with existing FreightOS security, tenant isolation, authority, legal gating, settlement, network neutrality, or physical-safety rules, preserve the stricter rule and escalate.


---

<!-- SOURCE: 01_BROKERAGE_AGENT_CONSTITUTION.md -->

# 01 — Brokerage Agent Constitution

## Article I — Brokerage authority is structural

A brokerage action requires:
- verified brokerage legal entity;
- active authority configuration/status;
- permitted commodity/mode/jurisdiction scope;
- current policy;
- authorized workflow and agent;
- valid counterparty context.

Missing/inconsistent legal context fails closed.

## Article II — Carrier agents and broker agents are not interchangeable

Carrier agents cannot:
- allocate a shipper's traffic between unrelated carriers;
- represent the brokerage plane;
- access brokerage margin/private shipper data without authorized purpose.

Broker agents cannot impersonate carrier agents or represent themselves as a motor carrier.

## Article III — Agents do not own money/legal arithmetic

Models may:
- classify;
- rank;
- recommend;
- draft;
- negotiate within deterministic bounds;
- explain.

Models cannot be sole authority for:
- legal status;
- authority state;
- carrier eligibility;
- rate floors/ceilings;
- margin limits;
- credit limits;
- payment destination;
- invoice math;
- brokerage record contents;
- financial responsibility;
- claims settlement;
- contract amendment.

## Article IV — Every brokerage side effect is typed

Examples:
- send quote
- accept shipper commitment
- invite carrier
- send counter
- tender
- record carrier acceptance
- appointment request
- send operational status
- submit accessorial evidence
- issue invoice
- release payment instruction.

Free-form chat/email interpretation may propose a command, never itself authorize the command.

## Article V — Commercial integrity

Brokerage, SaaS, support, financing, exchange and other revenue remain separately accounted for.

Agents cannot silently:
- alter margin;
- grant discounts;
- waive charges;
- amend customer/carrier contract terms.

## Article VI — Transparent operational understanding

Customers can inspect:
- BOT;
- agent scopes;
- workflows;
- pricing/margin policies;
- approval rules;
- carrier qualification rules;
- transaction records;
- evidence;
- autonomy.

## Article VII — Progressive autonomy

`DISCOVER -> OBSERVE -> SHADOW -> PREPARE -> A3 APPROVAL_EXECUTE -> A4 POLICY_AUTONOMOUS -> A5 EXCEPTION_SUPERVISED`

Each action class earns autonomy separately.

## Article VIII — Relationship and conflict controls

Customer/carrier preferences and commercial relationships are explicit data/policy with provenance.

Agents must not engage in:
- undisclosed self-preferencing;
- bid manipulation;
- collusion;
- discriminatory prohibited ranking;
- deceptive carrier/shipper identity practices.

## Article IX — Transaction truth

Authoritative:
- domain state;
- contracts;
- approved BOT;
- deterministic rate/margin records;
- transaction ledger;
- audited external confirmations.

Never authoritative:
- chat;
- model memory;
- vector similarity;
- unsupported CRM note;
- model-generated rate conclusion.

## Article X — Compliance supervision

Compliance holds, authority holds and financial-responsibility holds cannot be released solely by an agent.


---

<!-- SOURCE: 02_BROKER_OPERATIONAL_TWIN.md -->

# 02 — Broker Operational Twin (BOT)

## Purpose

The BOT is the brokerage customer's inspectable configuration of how the business operates.

## Domains

### Legal/business topology
- brokerage legal entity
- authority IDs/status sources
- branches
- divisions
- teams
- agent offices
- books of business
- modes/commodities
- geographic scope.

### Shipper accounts
- account identity
- contracts
- lane/equipment requirements
- routing guide
- tender rules
- service commitments
- pricing model
- accessorial rules
- credit/payment terms
- communication/escalation.

### Carrier network
- carrier identity/authority
- approved/prohibited status
- onboarding/evidence
- equipment/capability
- lanes/regions
- historical service
- insurance/credential metadata where applicable
- payment terms
- relationship status.

### Brokerage policy
- quote approval thresholds
- margin floors/targets
- carrier buy bounds
- max exposure
- credit rules
- carrier qualification
- high-value/hazmat/special cargo controls
- exception escalation
- claims rules.

### Systems
- TMS
- CRM
- load boards
- email/SMS/voice
- carrier onboarding
- public authority sources
- accounting
- factoring/payments
- document systems
- BI/analytics.

For each, define system-of-record ownership and read/write authority.

### SOPs
- RFQ intake
- quote
- coverage
- negotiation
- tender
- tracking
- check calls
- appointment
- accessorial
- claims
- billing
- carrier pay
- close.

## BOT assertion state

`PROPOSED | VERIFIED | APPROVED | DISPUTED | DEPRECATED`

A proposed shipper rate rule, carrier eligibility rule, or authority fact cannot authorize execution.

## Customer-visible diff

A BOT change must expose impact on:
- quotes;
- carrier pool;
- margins;
- active workflows;
- autonomy grants;
- contracts;
- integrations;
- records/retention.

## Drift

Drift examples:
- human brokers continually override agent buy rate;
- shipper requirements changed;
- carrier approval process changed;
- branch ownership changed;
- contract amended;
- integration schema changed.

Drift creates review; it does not silently mutate policy.


---

<!-- SOURCE: 03_BROKER_AGENT_ORGANIZATION_FACTORY.md -->

# 03 — Broker Agent Organization Factory

## Inputs

- tenant/brokerage legal entity
- BOT version
- enabled brokerage capabilities
- shipper account bindings
- carrier network bindings
- authority/compliance state
- workflow definitions
- autonomy grants
- integration bindings
- SLO tier
- model/data policy.

## Output

Each agent instance receives:
- tenant/legal plane
- role
- branch/team/book scope
- shipper scope
- carrier-data scope
- tools
- proposals
- commands
- financial limits
- approval rules
- model policy
- evaluation
- kill switch.

## Small brokerage

One-person broker may experience one "Broker Operations Agent", while logical policy roles remain separately modeled:
- intake
- quote
- sourcing
- qualification
- negotiation
- tender
- tracking
- documents
- settlement/compliance.

## Large brokerage / 3PL

```text
Brokerage Chief Orchestrator
├── Enterprise Accounts
│   ├── Account A Pod
│   └── Account B Pod
├── Regional Spot Operations
├── Carrier Sourcing / Capacity
├── Compliance / Qualification
├── Claims / Exceptions
└── Finance / Reconciliation
```

Global orchestration does not imply global command authority.

## Context

Per workflow, assemble minimum:
- BOT scope
- shipper requirement
- current shipment/RFQ
- eligible carriers
- contract/policy
- relevant market/relationship data
- authority
- evidence.

Never inject unrelated customers' rates or confidential data.

## Agent-to-agent protocol

Typed:
- observation
- request
- quote proposal
- carrier candidate
- negotiation proposal
- approval request
- command request
- result
- escalation.

No agent message is itself authority.


---

<!-- SOURCE: 04_BROKERAGE_WORKFLOW_GRAPH_STANDARD.md -->

# 04 — Brokerage Workflow Graph Standard

## Mandatory graph families

- brokerage customer onboarding / BOT
- shipper RFQ/intake
- shipper quoting
- shipper commitment
- carrier sourcing
- carrier qualification
- carrier negotiation
- allocation
- tender/booking
- shipment execution
- tracking/communication
- facility/appointment coordination
- document/POD
- accessorial
- exception
- claims evidence
- shipper invoicing
- carrier payment/reconciliation
- transaction-record close
- authority/financial-responsibility incident.

## Canonical pattern

```text
Trigger
 ↓
Load authoritative legal/tenant state
 ↓
Load BOT + contract/policy
 ↓
Interpret/rank/plan
 ↓
Deterministic commercial + eligibility gates
 ↓
Approval/autonomy
 ↓
Idempotency
 ↓
External side effect
 ↓
External acknowledgement
 ↓
Event/evidence
 ↓
Reconciliation
 ↓
Next node/terminal
```

## Node classes

- deterministic
- intelligence
- human interrupt
- external side effect
- verification/reconciliation.

## Graph requirements

Every graph declares:
- state schema;
- terminal states;
- deadlines;
- retries;
- approval expiry;
- compensation;
- degraded mode;
- evidence;
- evaluation.

## Mutation tests

CI must fail if:
- carrier assignment bypasses brokerage authority;
- unqualified carrier can be tendered;
- margin policy can be bypassed by model;
- shipper quote can be sent outside limits;
- side effect lacks idempotency;
- transaction close omits required record fields;
- carrier-agent plane can allocate unrelated carriers;
- broker agent can represent itself as carrier;
- financial-responsibility hold can be ignored.


---

<!-- SOURCE: 05_SHIPPER_INTAKE_RFQ_AND_QUOTING.md -->

# 05 — Shipper Intake, RFQ, and Quoting

## Intake channels

- portal
- email
- API
- EDI
- TMS/CRM
- phone/manual entry
- FreightOS network request.

## Normalize

Capture:
- shipper
- origin/destination
- dates/windows
- mode/equipment
- commodity
- quantity/weight
- special requirements
- facility requirements
- insurance/security constraints
- accessorial terms
- contract/routing guide
- requested quote/commitment deadline.

## Quote graph

```text
RFQ
 ↓
Validate shipper/account/credit
 ↓
Requirements normalization
 ↓
Determine contract/spot context
 ↓
Estimate carrier buy / market exposure
 ↓
Apply deterministic pricing/margin policy
 ↓
Agent recommendation/draft
 ↓
Approval if required
 ↓
Send quote
 ↓
Capture shipper response
 ↓
Version quote / expire / accept
```

## Shipper price

Must record:
- deterministic inputs
- rate components
- assumptions
- policy version
- approver/autonomy
- expiration.

Model may recommend a price but cannot be sole pricing authority.

## Commitment

A quote is not a shipment commitment until exact acceptance and terms are recorded.

Material change to:
- lane
- equipment
- dates
- commodity
- accessorials
- rate
requires version/re-evaluation.

## Routing guide

Contracted shipper rules can prioritize:
- primary carrier sequence;
- private network;
- brokerage pool;
- mode;
- service requirements.

Routing guides are BOT/configuration, not prompts.


---

<!-- SOURCE: 06_CARRIER_NETWORK_SOURCING_AND_QUALIFICATION.md -->

# 06 — Carrier Network Sourcing and Qualification

## Sourcing

Potential sources:
- contracted/preferred carriers
- existing broker carrier network
- FreightOS network capacity advertisements
- approved load-board/integration results
- direct carrier invitations
- carrier agent responses.

## Candidate record

- carrier identity
- authority/registration references
- equipment/capability
- geographic fit
- availability
- relationship
- service evidence
- risk/qualification
- quote/bid
- freshness.

## Qualification

Deterministic gate before tender.

Configurable evidence may include:
- verified carrier authority;
- identity/registration;
- operating status;
- insurance/credential evidence where customer policy requires;
- equipment/cargo capability;
- sanctions/fraud controls where applicable;
- internal approved/prohibited list;
- high-value/hazmat/special-cargo requirements;
- contract/onboarding status.

AI cannot declare legal eligibility by itself.

## Fraud/identity

High-risk signals:
- identity mismatch;
- contact/payment change;
- authority anomalies;
- unexpected domain/phone change;
- suspicious document inconsistency;
- double-brokering indicators;
- account takeover indicators.

A risk hold blocks tender until authorized resolution.

## Network neutrality

Ranking can consider:
- suitability
- service
- price
- relationship
- response time
- risk
- preferences.

Do not secretly privilege FreightOS-native carriers merely for being native.


---

<!-- SOURCE: 07_PRICING_MARGIN_AND_NEGOTIATION.md -->

# 07 — Pricing, Margin, and Negotiation

## Separation

Track separately:
- shipper sell rate
- carrier buy rate
- accessorial assumptions
- brokerage gross margin
- non-brokerage service compensation
- currency/tax where applicable.

## Deterministic money

Use integer minor units + ISO currency.
Every result records:
- inputs
- formula/policy
- rounding
- output
- timestamp
- actor/agent.

## Negotiation envelope

Broker agent may negotiate carrier buy only within:
- floor/ceiling
- target
- maximum exposure
- permitted counterparties
- validity
- terms
- shipper commitment constraints.

Shipper-side negotiation has its own envelope.

## Margin

`brokerage_margin = shipper_brokerage_revenue - carrier_transport_cost - explicitly allocated brokerage transaction costs` as configured.

Do not label cash timing as margin/profit.

## Approval

Examples requiring approval:
- margin below floor
- carrier buy above cap
- new accessorial waiver
- unapproved carrier
- credit exposure
- contract deviation.

## Agent behavior

Agent can:
- generate counter
- choose strategy
- explain alternatives
- recommend concession.

Agent cannot:
- invent market fact;
- disclose shipper confidential ceiling to carrier;
- disclose carrier confidential floor to shipper;
- collude across counterparties;
- exceed policy.

## Audit

Preserve negotiation proposals, commands and final terms according to policy/retention without storing unnecessary free-form sensitive reasoning.


---

<!-- SOURCE: 08_ALLOCATION_TENDER_AND_BOOKING.md -->

# 08 — Allocation, Tender, and Booking

## Allocation

Selection among unrelated carriers is explicitly Brokerage Plane behavior.

Graph:

```text
Covered Shipper Commitment
 ↓
Eligible Carrier Candidates
 ↓
Feasibility
 ↓
Price/Service/Risk Scoring
 ↓
Broker Policy
 ↓
Candidate Allocation
 ↓
Approval / Certified Autonomy
 ↓
Tender
 ↓
Carrier Accept / Reject / Counter / Timeout
 ↓
Binding Assignment
 ↓
Shipment Execution
```

## Tender

Tender contains:
- broker legal identity
- shipper/shipment references
- carrier
- rate/terms
- equipment
- pickup/delivery
- cargo requirements
- accessorial terms
- document requirements
- expiration
- version.

## Acceptance

Carrier acceptance must bind exact tender/version.

A model summary of an email is not acceptance until workflow policy maps and verifies it.

## Double booking prevention

Transactional lock/versioning prevents conflicting carrier assignments.

## Re-tender

Carrier rejection/cancel/timeout creates explicit recoverage state; prior commitment remains auditable.

## Carrier-agent integration

If a carrier is FreightOS-native:
Broker Tender Agent → network tender → Carrier Agent Organization.

Carrier agent independently evaluates under that carrier's policy.

One side cannot inspect the other's private economics.


---

<!-- SOURCE: 09_SHIPMENT_EXECUTION_AND_COMMUNICATION.md -->

# 09 — Shipment Execution and Communication

## Post-booking

Brokerage plane coordinates:
- dispatch confirmation
- pickup readiness
- appointment
- driver/carrier status
- facility communication
- milestone tracking
- exceptions
- documents
- customer updates.

## Communication

Agent may send authorized:
- pickup confirmation
- status
- ETA
- delay
- appointment update
- document request
- exception notice.

Communication must identify brokerage role where required and must not misrepresent broker as carrier.

## System of truth

Carrier/Facility events are evidence/assertions with provenance.

Broker read model derives shipment status from:
- carrier
- facility
- shipper
- documents
- verified integrations.

Conflicts create exception, not silent overwrite.

## No fake check calls

If no authoritative status is available:
state = UNKNOWN/STALE.
Agent cannot invent driver location or ETA.

## Degraded mode

Model outage:
- deterministic shipment/status workflows continue.
Integration outage:
- mark stale, use alternate/manual procedure, reconcile later.


---

<!-- SOURCE: 10_FACILITY_APPOINTMENT_AND_DOCUMENT_COORDINATION.md -->

# 10 — Facility, Appointment, and Document Coordination

## Network integration

Brokerage agents use FreightOS/FacilityOS rather than duplicate facility state.

## Origin

Broker may coordinate:
- appointment
- cargo readiness
- driver instructions
- BOL/document requirements
- check-in exception
- detention/accessorial evidence.

## Destination

Broker may coordinate:
- receiving appointment
- ETA
- BOL/POD status
- receiving discrepancy
- delivery completion.

## BOL

Brokerage transaction record may reference bill-of-lading/freight-bill number as required by applicable recordkeeping.

The broker document agent does not own facility custody/receipt state.

## Appointment change

A facility appointment change propagates:
FacilityOS → FreightOS → Brokerage Shipment Execution → Carrier Agent + Shipper.

## Access controls

Broker sees cross-party data only to the extent authorized for the transaction.
Private carrier cost structure and unrelated facility data remain isolated.


---

<!-- SOURCE: 11_ACCESSORIAL_EXCEPTION_AND_CLAIMS_EVIDENCE.md -->

# 11 — Accessorial, Exception, and Claims Evidence

## Accessorial families

- detention
- layover
- TONU
- lumper
- additional stop
- reconsignment
- redelivery
- storage
- toll/permit
- special handling
- other contracted items.

## Graph

```text
Potential Accessorial
 ↓
Contract/rate confirmation terms
 ↓
Evidence
 ↓
Eligibility/math
 ↓
Counterparty notice/approval as required
 ↓
Record charge
 ↓
Shipper/carrier reconciliation
```

AI does not invent entitlement to an accessorial.

## Exceptions

- late pickup/delivery
- capacity failure
- carrier cancellation
- facility delay
- breakdown
- cargo/document problem
- refusal
- fraud/identity
- payment/credit
- force majeure/route.

## Claims

FreightOS can:
- open case
- preserve evidence
- collect documents
- track deadlines/status
- prepare communications
- reconcile outcome.

Legal liability/claims settlement remains a red action unless separately governed and authorized.

## Evidence chain

Link:
- shipment
- tender
- BOL/POD
- FacilityOS
- carrier events
- photos/sensors where authorized
- contract
- communication
- adjustment.


---

<!-- SOURCE: 12_INVOICING_CARRIER_PAY_AND_RECONCILIATION.md -->

# 12 — Invoicing, Carrier Pay, and Reconciliation

## Separate ledgers

Maintain:
- brokerage transaction ledger
- shipper accounts receivable
- carrier payable/status
- SaaS billing
- other non-brokerage services.

Do not commingle merely for convenience.

## Shipper invoice

Inputs:
- agreed shipper rate
- completed service
- accessorials
- required documents
- adjustments
- taxes/fees where applicable.

Invoice arithmetic deterministic.

## Carrier pay

Record:
- agreed carrier rate
- approved accessorials
- required documents
- payment status/date/reference
- adjustments.

Payment destination changes require enhanced verification.

## Financial responsibility awareness

Broker financial-responsibility health is a compliance input, not a bank balance prediction by an agent.

## Reconciliation

Three-way or multi-way comparison:
- shipper commercial commitment
- carrier tender/acceptance
- execution/evidence
- invoice
- carrier payable
- broker transaction record.

## Money movement

Agents may prepare.
Actual money movement requires separately authorized financial/payment controls.

No model directly edits bank instructions.


---

<!-- SOURCE: 13_BROKER_TRANSACTION_RECORD_AND_TRANSPARENCY.md -->

# 13 — Broker Transaction Record and Transparency

## Current federal baseline — property brokers

The architecture must support the transaction record required by 49 CFR 371.3.

For each applicable transaction, preserve at minimum:
- consignor name/address;
- originating motor carrier name/address/registration number;
- bill of lading or freight bill number;
- broker compensation for brokerage service and payer;
- non-brokerage service description/compensation/payer;
- freight charges collected by broker and carrier payment date.

Retention baseline: three years, subject to stricter contract/state/legal requirements.

Each party to the brokered transaction has the current regulatory right to review the required transaction record.

## Product design

Create a canonical `BrokerTransactionRecord` linked to:
- shipment
- shipper
- carrier
- commercial terms
- BOL/freight bill
- compensation records
- payment status
- audit/evidence.

## Access

Transaction-record access:
- authenticated party relationship
- field-level disclosure policy
- immutable audit
- export receipt.

Do not expose unrelated transactions.

## Proposed-rule readiness

As of 2026-08-14, FMCSA's "Transparency in Property Broker Transactions" changes remain proposed, not final.

Design feature capability for:
- automated electronic record delivery after transaction completion;
- timing policy;
- non-waiver policy controls;
- expanded record fields if finalized.

Keep disabled unless/when final law and counsel-approved implementation require it.

## Record correction

Corrections append/version; do not silently rewrite historical compensation/payment evidence.

## Customer export

Brokerage tenant can export compliant transaction records and audit evidence in standard machine/human-readable forms.


---

<!-- SOURCE: 14_AUTHORITY_FINANCIAL_RESPONSIBILITY_AND_COMPLIANCE.md -->

# 14 — Authority, Financial Responsibility, and Compliance

## Activation gate

Before live U.S. property brokerage:
- authorized brokerage entity;
- FMCSA broker authority;
- qualifying financial responsibility filing;
- process-agent filing;
- counsel-approved operating contracts/disclosures;
- recordkeeping;
- separate brokerage accounts/ledger;
- compliance ownership;
- authority/financial-responsibility monitoring;
- kill switches;
- incident/wind-down procedure.

## Financial responsibility

Current federal registration baseline requires $75,000 of financial security via BMC-84 surety bond or qualifying BMC-85 trust fund.

Effective January 16, 2026, FMCSA's updated financial-responsibility rules include tightened BMC-85 asset/trustee requirements and authority suspension where available financial security falls below $75,000 and is not replenished within seven calendar days.

## Authority-health state

```text
ACTIVE
WARNING
REPLENISHMENT_REQUIRED
SUSPENSION_PENDING
SUSPENDED
UNKNOWN
```

Only authoritative sources/verified filings can set legal status.

## Execution behavior

For new brokerage transactions:
- ACTIVE → eligible subject to all other policy.
- UNKNOWN / SUSPENDED → fail closed.
- WARNING / REPLENISHMENT_REQUIRED / SUSPENSION_PENDING → follow counsel-approved compliance policy; do not silently originate new exposure.

Active shipments during a compliance incident follow an explicit legal/operations runbook.

## Misrepresentation

Brokerage UI, emails, quotes and agents must represent the registered brokerage identity and cannot hold brokerage operations out as a carrier operation.

## Accounting separation

Brokerage revenues/expenses are distinguishable from other businesses.

## Household-goods warning

Household-goods brokerage has additional specific rules. It is a separate capability/legal pack and is disabled unless explicitly implemented and approved.

## Counsel gate

This document is architecture, not legal advice. Counsel approves:
- contracts
- authority model
- state/jurisdiction rules
- disclosure
- claims/payment practices
- record access
- automation boundaries.


---

<!-- SOURCE: 15_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md -->

# 15 — Customer Control and Explainability

## Brokerage Operations Console

### What FreightOS Understands
BOT assertions, evidence, approval, drift.

### Account Map
Shippers, contracts, routing guides, teams, service requirements.

### Carrier Network
Approved/candidate/held carriers, qualification and evidence.

### Quote Board
RFQs, rate basis, approval, expiry, response.

### Coverage Board
Shipment coverage status, candidate carriers, tenders, counters.

### Execution Board
Booked shipments, milestones, exceptions, facilities, documents.

### Margin/Risk
Authorized view of sell/buy/margin, exposure and exceptions.

### Transaction Records
371.3 record/export/access workflow.

### Agent Directory
Scope, tools, commands, autonomy, evaluation, kill switch.

## Explanation contract

For carrier allocation or quote:
- objective
- hard requirements
- eligible candidates
- company policy
- commercial bounds
- reason for recommendation
- uncertainty/freshness
- approval/autonomy
- resulting side effect.

Do not expose hidden chain-of-thought or one counterparty's confidential data to the other.

## Corrections

Customer corrections create BOT/policy proposals and impact analysis.
Historical executed transaction state remains immutable/versioned.


---

<!-- SOURCE: 16_AUTONOMY_SHADOW_AND_CERTIFICATION.md -->

# 16 — Brokerage Autonomy, Shadow, and Certification

## Levels

A0 Observe
A1 Recommend
A2 Prepare
A3 Approval-to-Execute
A4 Policy-Bounded Autonomy
A5 Exception-Supervised Operation

## Shadow dimensions

- RFQ extraction
- shipper quote recommendation
- carrier candidate quality
- carrier qualification
- buy-rate negotiation
- allocation
- tender correctness
- tracking/exception
- document chase
- accessorial detection
- invoice/pay reconciliation
- escalation.

## Promotion

Per:
tenant + legal entity + shipper/account + workflow + action class + exposure.

## Candidate A4 actions after proof

- routine quote within contract/policy band
- invite approved carriers
- negotiate inside bounded buy-rate envelope
- tender to qualified carrier
- routine status communication
- document requests
- standard accessorial workflow
- reconciliation preparation.

## Actions remaining high-control

- authority/compliance changes
- payment destination
- carrier qualification override
- margin exception outside limits
- shipper contract amendment
- claims settlement
- financial security handling
- legal representation.

## A5 endpoint

Humans can primarily supervise:
- exceptions
- strategic accounts
- relationship management
- compliance
- fraud
- unusually high exposure
- policy updates.

Routine brokerage can operate autonomously inside certified scope.

## Downgrade

Automatic scope reduction on:
- authority anomaly
- BOT drift
- carrier fraud spike
- override rate
- integration change
- reconciliation mismatch
- margin anomaly
- model/eval regression
- customer request.


---

<!-- SOURCE: 17_ENTERPRISE_SCALE_BRANCH_AND_BOOK_ARCHITECTURE.md -->

# 17 — Enterprise Scale, Branch, and Book Architecture

## Same product

One broker:
```text
Brokerage Entity
└── one book
```

Large 3PL:
```text
Brokerage Enterprise
├── Legal Entity
│   ├── Division
│   │   ├── Branch
│   │   │   ├── Team
│   │   │   └── Book / Account Pod
```

## Scope

Policy/authority can inherit:
enterprise -> entity -> branch -> team -> account/workflow.

Overrides explicit/versioned.

## Partitioning

Use:
tenant + legal plane + branch/account/workflow.

Do not place the entire brokerage's carrier/shipper context in one model prompt.

## Dedicated cells

Large customers may require:
- dedicated DB/queues/workers
- encryption keys
- data residency
- network egress controls
- custom SLO.

Canonical contracts remain unchanged.

## Load

Test:
- RFQs/min
- quote concurrency
- carrier invitations
- tenders
- tracking events
- documents
- invoice/pay records
- transaction-record exports
- agent workflows
- branch isolation.

## Noisy neighbor

Per tenant:
- queue
- model budget
- integration concurrency
- storage
- rate limit
- carrier invitation policy.


---

<!-- SOURCE: 18_FREIGHTOS_NETWORK_COMMUNICATION.md -->

# 18 — FreightOS Network Communication

## The closed operating loop

```text
SHIPPER
   ↓ demand / RFQ
BROKERAGE AGENTS
   ↓ tender / allocation
CARRIER AGENTS
   ↓ dispatch / execution
DRIVER / ASSET
   ↓ arrival / documents
FACILITYOS
   ↓ readiness / gate / dock / custody / receipt
FREIGHTOS NETWORK
   ↓ events / evidence / exceptions
BROKERAGE AGENTS
   ↓ shipper communication / invoicing / carrier pay record
SHIPPER + CARRIER
```

## Shipper → Broker

- RFQ
- contract/routing guide
- requirements
- commitment
- changes
- invoice/payment status.

## Broker → Carrier

- capacity inquiry
- tender
- negotiation
- assignment
- shipment requirements
- appointment/facility instructions.

## Carrier → Broker

- quote/counter
- accept/reject
- dispatch
- ETA/milestones
- exception
- documents.

## Facility → Broker

Through authorized FreightOS events:
- readiness
- appointment
- visit
- BOL/document status
- detention evidence
- discrepancy
- receipt/POD status.

## Network advantages

When all three sides use canonical network artifacts:
- fewer calls/emails/manual re-entry;
- less status ambiguity;
- faster exception propagation;
- stronger evidence;
- easier reconciliation.

Do not turn network advantage into forced data sharing or self-preferencing.


---

<!-- SOURCE: 19_SECURITY_PRIVACY_CONFLICTS_AND_DATA_GOVERNANCE.md -->

# 19 — Security, Privacy, Conflicts, and Data Governance

## Isolation

Structural tenant isolation and legal-plane separation.

## Confidential commercial data

Examples:
- shipper sell rates
- carrier buy rates
- margin
- credit
- carrier proprietary offers
- customer routing guides
- claims.

Need-to-know access only.

## Counterparty firewall

Carrier must not receive:
- shipper confidential ceiling
- other carrier bids
- unrelated margins.

Shipper must not receive:
- protected carrier economics
- unrelated carrier offers
except when legally/contractually authorized.

## Prompt injection

Emails, rate confirmations, BOLs, tenders, load-board data and documents are untrusted content.

Cannot change:
- policy
- tool authority
- payment details
- legal plane
- system prompts.

## Payment fraud

Payment destination/change workflow requires:
- verified counterparty
- out-of-band/step-up as policy requires
- hold period where configured
- audit.

## Conflict of interest

Rules must detect/configure:
- affiliate/common ownership
- related-party carrier
- internal carrier/broker entities
- customer-specific prohibitions
- self-preferencing constraints.

## Data use

No cross-tenant use of proprietary shipper/carrier rates/SOPs for another customer's prompts without explicit permitted data product/contract.

Aggregated benchmarking requires governance, de-identification and customer rights.

## Retention

Broker transaction records meet applicable legal minimum; other data follows purpose/contract/legal retention.


---

<!-- SOURCE: 20_OBSERVABILITY_AND_BROKERAGE_OUTCOMES.md -->

# 20 — Observability and Brokerage Outcomes

## RFQ/quote

- RFQ-to-quote latency
- quote acceptance
- quote correction
- approval latency.

## Coverage

- time to first qualified carrier
- time to cover
- tender acceptance
- counter cycles
- uncovered aging
- qualification failure reasons.

## Execution

- pickup/delivery service
- stale status
- exception detection
- facility delay
- communication latency
- document completion.

## Commercial

- sell rate
- buy rate
- gross brokerage margin
- margin exception
- accessorial reconciliation
- invoice cycle
- carrier-pay cycle/status.

Access controls apply to metrics.

## Agents

- recommendation acceptance
- override
- policy denial
- unsupported assertion
- tool error
- autonomous action
- autonomy downgrade
- cost/workflow.

## Compliance

- authority health
- financial-responsibility health
- transaction-record completeness
- record-access requests
- retention
- identity/fraud holds.

## Customer outcomes

Measure:
- loads/brokerage ops FTE supervisor
- manual touches/load
- time to quote
- time to cover
- exception resolution
- billing/document cycle.

Do not market labor replacement or savings without measured methodology.


---

<!-- SOURCE: 21_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md -->

# 21 — Customer Implementation and Go-Live

## Tiers

### Solo / Small Broker
Minimal BOT, common TMS/email/accounting/load-board integrations.

### Standard Brokerage
Multiple users/accounts/carrier network.

### Enterprise 3PL
Branches, SSO, many shipper/carrier integrations, dedicated security/compliance.

### Strategic Dedicated
Dedicated cell/data residency/custom SLO.

## Universal implementation

### 0 Legal/commercial scope
Confirm brokerage entity/authority and desired automation.

### 1 BOT discovery
Accounts, carriers, policies, SOPs, systems, branches.

### 2 Connectivity
Read-only integrations first.

### 3 Workflow mapping
RFQ -> quote -> source -> qualify -> negotiate -> tender -> execute -> invoice/pay -> record.

### 4 Agent organization
Instantiate manifests/scopes.

### 5 Shadow
Compare to human brokerage decisions.

### 6 A3
Approval-to-execute.

### 7 A4
Certified policy-bounded routine operations.

### 8 A5
Exception-supervised selected accounts/workflows.

## One-person broker fast start

1. Verify entity/legal gate state.
2. Connect TMS/email.
3. Import shipper accounts.
4. Import/verify carrier network.
5. Configure pricing/margin.
6. Configure approval limits.
7. Shadow RFQs/coverage.
8. A3 quotes/tenders.
9. A4 selected routine actions.

## Enterprise rollout

Start:
one branch/account/workflow/carrier pool
then canary outward.

No big-bang full-book automation.


---

<!-- SOURCE: 22_ACCEPTANCE_GATES.md -->

# 22 — Brokerage Enterprise Agent Acceptance Gates

BO-01 prior FreightOS handoffs unchanged
BO-02 Brokerage Plane structurally separate from Carrier-Agent Plane
BO-03 Broker Operational Twin version/provenance/diff
BO-04 proposed BOT facts cannot authorize commands
BO-05 broker agent manifests complete
BO-06 typed durable brokerage graphs
BO-07 policy choke point
BO-08 every external write idempotent
BO-09 every external write reconciled
BO-10 broker authority active gate
BO-11 financial-responsibility health gate
BO-12 suspended/unknown authority blocks new brokerage execution
BO-13 registered brokerage identity/misrepresentation controls
BO-14 shipper/account isolation
BO-15 carrier confidential-data isolation
BO-16 no cross-tenant rate leakage
BO-17 carrier qualification deterministic gate
BO-18 fraud/identity hold
BO-19 quote money math deterministic
BO-20 margin/buy/sell limits deterministic
BO-21 allocation among unrelated carriers only in Brokerage Plane
BO-22 tender exact-version acceptance
BO-23 double-booking prevention
BO-24 carrier-agent network tender independent authorization
BO-25 FacilityOS event integration
BO-26 BOL/POD/document correlation
BO-27 accessorial evidence/math
BO-28 claims evidence without autonomous liability adjudication
BO-29 invoice arithmetic deterministic
BO-30 payment-destination change high-control
BO-31 broker transaction record contains current required fields
BO-32 transaction record retained at least required baseline
BO-33 authorized transaction-party review/export
BO-34 proposed transparency automation disabled unless legally activated
BO-35 brokerage/non-brokerage/SaaS accounting separation
BO-36 shadow certification before A3+
BO-37 autonomy promotion scoped
BO-38 autonomy downgrade
BO-39 customer explainability/correction
BO-40 model outage degraded mode
BO-41 integration outage/reconciliation
BO-42 kill switches legal-plane/tenant/workflow/agent/tool/integration
BO-43 crash before/after tender safe recovery
BO-44 one-person brokerage fixture
BO-45 enterprise branch fixture
BO-46 security/adversarial/prompt-injection suite
BO-47 load test for declared tier
BO-48 backup/restore/rollback
BO-49 counsel/legal gate evidence
BO-50 exact release SHA/evidence report

FAIL BO-01..BO-43 blocks affected production brokerage scope.


---

<!-- SOURCE: 23_IMPLEMENTATION_ROADMAP.md -->

# 23 — Brokerage Implementation Roadmap

This is architecture sequencing, not automatic legal/commercial activation.

## Phase 0 — Repository Gap Analysis
No runtime changes.

## Phase 1 — Brokerage Contracts
- BOT
- BrokerAgentManifest
- BrokerTransactionRecord
- Quote
- CarrierCandidate/Qualification
- Tender
- BrokerageCommercialTerms
- AutonomyGrant.

## Phase 2 — BOT + Legal Plane
Persistence, version/diff, branch/account scope, authority health.

## Phase 3 — RFQ + Quote Copilot
Read/prepare only.

## Phase 4 — Carrier Sourcing + Qualification
Carrier pool + conformance + fraud holds.

## Phase 5 — Negotiation + Allocation
Shadow/A2.

## Phase 6 — A3 Tender
Approval-to-execute, idempotent tender/acceptance.

## Phase 7 — Shipment Execution
Carrier/FreightOS/FacilityOS communication.

## Phase 8 — Documents/Accessorials/Claims Evidence
No autonomous liability settlement.

## Phase 9 — Invoice/Carrier Pay/Reconciliation
Deterministic money, controlled payment integration.

## Phase 10 — Transaction Record/Compliance
371.3 records, access/export, retention, authority incidents.

## Phase 11 — A4 Policy-Bounded Brokerage
Selected routine actions after certification/legal approval.

## Phase 12 — A5 Exception-Supervised Brokerage
Selected accounts/branches.

## Phase 13 — Enterprise / Multimodal
Scale/cells and mode packs subject to separate legal scopes.

## Phase 14 — Future Exchange
Do not conflate autonomous brokerage with public exchange. Exchange retains its own legal/liquidity/fraud/settlement gates.


---

<!-- SOURCE: 24_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md -->

# 24 — Claude Master Implementation Prompt

You are the senior principal engineer, brokerage systems architect, enterprise agent architect, security/reliability engineer, and logistics network architect responsible for integrating the FreightOS Brokerage Enterprise Agent Operations Handoff v1.6.0 into the existing FreightOS repository.

## Controlling relationship

Read:
- current FreightOS complete production handoffs/sequencing doctrine;
- v1.3 security/resilience;
- v1.4 network architecture;
- v1.5 enterprise agent operations;
- FacilityOS enterprise agent package;
- this entire v1.6 package.

This package is additive.

Do not edit/delete/rename/weaken prior accepted handoff files.

Do not interpret this package as permission to activate the existing legal-gated Digital Brokerage module.

## Strategic objective

Make FreightOS capable of being sold/deployed to a licensed brokerage customer as its agentic operations layer, and eventually capable of running routine brokerage operations with humans supervising exceptions/compliance/relationships.

Keep carrier automation, broker automation and facility automation interoperable but legally and data-wise separated.

## Immediate assignment — Phase 0 only

Create a new branch.

Inspect:
1. branch/HEAD/tree
2. module-state/legal gates
3. current Brokerage Plane/domain objects
4. broker agent manifests
5. shipper control tower
6. carrier qualification
7. RFQ/quote
8. negotiation
9. allocation/tender
10. shipment execution
11. FacilityOS integration
12. documents/BOL/POD
13. accessorial/claims
14. brokerage ledger
15. invoicing/carrier pay
16. broker transaction records/retention
17. authority/financial-responsibility monitoring
18. identity/tenant/legal-plane isolation
19. workflow engine/idempotency/reconciliation
20. integration/EDI/API/MCP
21. audit/observability
22. tests/CI/deployment.

Produce repository-local Phase 0 artifacts:
- current brokerage architecture inventory
- Broker Operational Twin gap
- broker agent organization gap
- brokerage graph inventory
- Carrier-Agent vs Brokerage Plane separation map
- RFQ/quote gap
- carrier sourcing/qualification gap
- negotiation/allocation/tender gap
- FacilityOS network gap
- invoice/pay/reconciliation gap
- 49 CFR 371.3 transaction-record gap
- authority/financial-responsibility control gap
- BO-01..BO-50 matrix
- repository-specific PR sequence
- owner/counsel decisions.

## Prohibitions

Do not:
- activate Digital Brokerage;
- create live broker authority representation;
- source/tender live freight;
- negotiate live counterparty rates;
- move money;
- change production permissions;
- run production migrations;
- expose secrets/data;
- weaken carrier/broker plane separation;
- treat proposed broker-transparency rule as current final law;
- adopt a new framework merely to match this architecture;
- merge/deploy;
- claim implementation from documents.

## Completion report

Return:
1. branch/HEAD/tree
2. files created/changed
3. proof earlier handoffs unchanged
4. architecture inventory
5. BO gate matrix
6. gaps
7. PR plan
8. owner/counsel decisions
9. exact commands/results
10. explicit confirmation of zero live brokerage/production side effects.

Stop after Phase 0.


---

<!-- SOURCE: README.md -->

# FreightOS Brokerage Enterprise Agent Operations Handoff v1.6.0

**Status:** additive production architecture and implementation-control package  
**Date:** 2026-08-14  
**Legal activation:** brokerage execution remains legal/promotion-gated. Installing this package does not authorize FreightOS, RIG, a customer, or any agent to perform unlicensed brokerage.

## Purpose

This package completes the principal operational communication triangle:

```text
Shipper / Customer
        ↓
Brokerage Agent Organization
        ↓
FreightOS Network
   ↙              ↘
Carrier Agents   FacilityOS Agents
        \          /
         Shipment Execution
              ↓
      Documents / Settlement
```

It defines a customer-deployable brokerage operating system that can serve:
- a one-person licensed broker;
- a small brokerage;
- a freight agency operating under a lawful brokerage arrangement;
- a regional 3PL;
- a large enterprise brokerage with many branches/teams;
- future multimodal brokerage/forwarding capabilities subject to separate legal-plane rules.

## Core architecture

```text
Canonical FreightOS Brokerage Plane
        +
Broker Operational Twin
        +
Broker Agent Organization Factory
        +
Typed Durable Brokerage Workflow Graphs
        +
Legal / Authority / Financial Responsibility Gate
        +
Customer Policies / Contracts / Routing Guides
        +
Integration Adapters
        ↓
Customer-specific brokerage automation
without customer-specific product forks
```

## Strategic endpoint

The long-term target is not merely "AI assists brokers."

The target is:

> **A properly authorized brokerage entity whose routine operational brokerage work is executed by policy-bounded FreightOS agents, with humans supervising exceptions, compliance, relationships, strategy, and high-risk actions.**

This can reduce or replace much of the human broker workflow, but the software/agents do not erase the legal brokerage entity, authority, financial responsibility, recordkeeping, contract, and compliance obligations that apply to brokerage activity.

## Relationship to existing FreightOS packages

Additive to:
- FreightOS complete production handoffs;
- v1.3.0 Security/Privacy/Resilience;
- v1.4.0 Network Architecture;
- v1.5.0 Enterprise Agent Operations;
- FacilityOS Enterprise Agent Operations v1.0.0.

Do not modify earlier handoff files merely to install this package.

## Repository destination

```text
docs/production-handoff/v1.6.0-brokerage-enterprise-agent-operations/
```

## Read order

1. `00_MASTER_HANDOFF.md`
2. `01_BROKERAGE_AGENT_CONSTITUTION.md`
3. `02_BROKER_OPERATIONAL_TWIN.md`
4. `03_BROKER_AGENT_ORGANIZATION_FACTORY.md`
5. `04_BROKERAGE_WORKFLOW_GRAPH_STANDARD.md`
6. `05_SHIPPER_INTAKE_RFQ_AND_QUOTING.md`
7. `06_CARRIER_NETWORK_SOURCING_AND_QUALIFICATION.md`
8. `07_PRICING_MARGIN_AND_NEGOTIATION.md`
9. `08_ALLOCATION_TENDER_AND_BOOKING.md`
10. `09_SHIPMENT_EXECUTION_AND_COMMUNICATION.md`
11. `10_FACILITY_APPOINTMENT_AND_DOCUMENT_COORDINATION.md`
12. `11_ACCESSORIAL_EXCEPTION_AND_CLAIMS_EVIDENCE.md`
13. `12_INVOICING_CARRIER_PAY_AND_RECONCILIATION.md`
14. `13_BROKER_TRANSACTION_RECORD_AND_TRANSPARENCY.md`
15. `14_AUTHORITY_FINANCIAL_RESPONSIBILITY_AND_COMPLIANCE.md`
16. `15_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md`
17. `16_AUTONOMY_SHADOW_AND_CERTIFICATION.md`
18. `17_ENTERPRISE_SCALE_BRANCH_AND_BOOK_ARCHITECTURE.md`
19. `18_FREIGHTOS_NETWORK_COMMUNICATION.md`
20. `19_SECURITY_PRIVACY_CONFLICTS_AND_DATA_GOVERNANCE.md`
21. `20_OBSERVABILITY_AND_BROKERAGE_OUTCOMES.md`
22. `21_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md`
23. `22_ACCEPTANCE_GATES.md`
24. `23_IMPLEMENTATION_ROADMAP.md`
25. `24_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`
26. contracts/diagrams/templates/source registry.

## Current-law design note

The source registry is dated 2026-08-14 and must be revalidated before live brokerage activation. Transportation counsel remains required for the specific operating model and customer contracts.


---

<!-- SOURCE: SOURCE_REGISTRY.md -->

# Brokerage Source Registry

Revalidated: 2026-08-14.

## FMCSA / federal regulatory

### Broker registration
https://www.fmcsa.dot.gov/registration/broker-registration

Current FMCSA page states property brokers require broker authority, $75,000 BMC-84 or BMC-85 financial security, BOC-3, and application process requirements.

### Broker financial responsibility — effective 2026 rules
https://www.fmcsa.dot.gov/registration/broker-and-freight-forwarder-financial-responsibility-rule-overview-and-compliance

Effective January 16, 2026 changes include:
- BMC-85 readily available asset rules;
- authority suspension if available security falls below $75,000 and is not replenished within 7 calendar days;
- surety/trust duties;
- provider enforcement;
- BMC-85 trustee eligibility changes.

### Broker financial responsibility FAQs
https://www.fmcsa.dot.gov/registration/broker-and-freight-forwarder-financial-responsibility-rule-faqs

### 49 CFR Part 371
https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-371

Key current general property-broker provisions include:
- broker/bona-fide-agent definitions;
- §371.3 transaction records and 3-year retention / party review right;
- §371.7 misrepresentation;
- §371.9 compensation restrictions;
- §371.10 duties;
- §371.13 accounting separation.

### Transparency in Property Broker Transactions — proposed, not final as of this registry date
https://www.federalregister.gov/documents/2024/11/20/2024-27115/transparency-in-property-broker-transactions
https://www.federalregister.gov/documents/2025/02/18/2025-02707/transparency-in-property-broker-transactions

Do not treat proposed changes as current legal obligations until finalized/effective and revalidated.

## Standards

X12 transaction sets:
https://x12.org/products/transaction-sets

Relevant boundary candidates may include:
- 204 load tender
- 990 response
- 214 status
- 210 freight details/invoice
- 211 motor carrier BOL
plus customer-specific EDI profiles.

## Revalidation

Before production brokerage activation:
- counsel review
- current eCFR
- FMCSA registration/financial-responsibility guidance
- final status of transparency docket
- state/commodity/mode-specific requirements
- household-goods separate rules if applicable.


---

<!-- SOURCE: contracts/broker_agent_manifest.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "freightos://schemas/broker-agent-manifest/v1",
  "title": "BrokerAgentManifest",
  "type": "object",
  "required": [
    "agentId",
    "tenantId",
    "brokerageEntityId",
    "role",
    "manifestVersion",
    "scope",
    "tools",
    "commands",
    "policyVersion",
    "autonomy",
    "killSwitch"
  ],
  "properties": {
    "agentId": {
      "type": "string"
    },
    "tenantId": {
      "type": "string"
    },
    "brokerageEntityId": {
      "type": "string"
    },
    "role": {
      "type": "string"
    },
    "manifestVersion": {
      "type": "string"
    },
    "scope": {
      "type": "object"
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "commands": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "financialLimits": {
      "type": "object"
    },
    "policyVersion": {
      "type": "string"
    },
    "autonomy": {
      "type": "object"
    },
    "evaluationVersion": {
      "type": "string"
    },
    "killSwitch": {
      "type": "object"
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/broker_operational_twin.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "freightos://schemas/broker-operational-twin/v1",
  "title": "BrokerOperationalTwin",
  "type": "object",
  "required": [
    "tenantId",
    "brokerageEntityId",
    "version",
    "status",
    "businessTopology",
    "shipperAccounts",
    "carrierPolicy",
    "systems",
    "assertions"
  ],
  "properties": {
    "tenantId": {
      "type": "string"
    },
    "brokerageEntityId": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "status": {
      "enum": [
        "PROPOSED",
        "APPROVED",
        "DEPRECATED"
      ]
    },
    "businessTopology": {
      "type": "object"
    },
    "shipperAccounts": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "carrierPolicy": {
      "type": "object"
    },
    "pricingPolicies": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "systems": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "workflows": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "assertions": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/broker_transaction_record.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "freightos://schemas/broker-transaction-record/v1",
  "title": "BrokerTransactionRecord",
  "type": "object",
  "required": [
    "recordId",
    "tenantId",
    "brokerageEntityId",
    "shipmentId",
    "consignor",
    "originatingCarrier",
    "bolOrFreightBillNumber",
    "brokerCompensation",
    "createdAt"
  ],
  "properties": {
    "recordId": {
      "type": "string"
    },
    "tenantId": {
      "type": "string"
    },
    "brokerageEntityId": {
      "type": "string"
    },
    "shipmentId": {
      "type": "string"
    },
    "consignor": {
      "type": "object"
    },
    "originatingCarrier": {
      "type": "object"
    },
    "bolOrFreightBillNumber": {
      "type": "string"
    },
    "brokerCompensation": {
      "type": "object"
    },
    "nonBrokerageServices": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "freightChargesCollected": {
      "type": [
        "object",
        "null"
      ]
    },
    "carrierPaymentDate": {
      "type": [
        "string",
        "null"
      ]
    },
    "evidenceRefs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "createdAt": {
      "type": "string"
    },
    "closedAt": {
      "type": [
        "string",
        "null"
      ]
    },
    "retentionUntil": {
      "type": "string"
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/brokerage_graphs.yaml -->

version: 1.0.0
name: freightos-brokerage-enterprise-operations

invariants:
  - brokerage_plane_required_for_cross_carrier_allocation
  - carrier_agent_plane_cannot_allocate_unrelated_carriers
  - authority_before_brokerage_execution
  - unqualified_carrier_cannot_receive_binding_tender
  - model_cannot_override_rate_margin_credit_or_payment_policy
  - every_external_write_idempotent_and_reconciled
  - broker_must_not_misrepresent_as_carrier
  - transaction_record_required_before_close
  - proposed_transparency_rule_not_activated_as_current_law
  - customer_specific_behavior_configuration_first

graphs:
  rfq_quote:
    stages:
      - intake
      - normalize
      - account_credit
      - requirements
      - deterministic_pricing
      - recommendation
      - approval_or_autonomy
      - send_quote
      - response
      - commit_or_expire

  carrier_coverage:
    stages:
      - source_candidates
      - qualification
      - fraud_risk
      - negotiate
      - score
      - allocate
      - approval_or_autonomy
      - tender
      - accept_reject_counter
      - bind_assignment

  execution:
    stages:
      - dispatch_confirm
      - facility_coordinate
      - milestone_track
      - exception
      - documents
      - delivery
      - pod
      - close_execution

  settlement:
    stages:
      - commercial_terms
      - accessorials
      - shipper_invoice
      - carrier_payable
      - payment_status
      - transaction_record
      - reconcile
      - close

  compliance_incident:
    stages:
      - authority_or_financial_alert
      - classify
      - block_new_exposure_if_required
      - preserve_active_operations
      - notify
      - evidence
      - remediation
      - verification
      - resume_gate


---

<!-- SOURCE: diagrams/01_closed_network.mmd -->

flowchart TB
  S[Shipper] --> B[Brokerage Agent Organization]
  B --> N[FreightOS Network]
  N --> C[Carrier Agent Organization]
  C --> D[Driver / Asset / RigDesk]
  D --> F[FacilityOS]
  F --> N
  C --> N
  N --> B
  B --> S
  B --> L[Broker Transaction / Settlement Ledger]


---

<!-- SOURCE: diagrams/02_brokerage_lifecycle.mmd -->

flowchart TD
  A[Shipper RFQ] --> B[Requirements]
  B --> C[Quote]
  C --> D[Shipper Commitment]
  D --> E[Carrier Sourcing]
  E --> F[Qualification]
  F --> G[Negotiation]
  G --> H[Allocation]
  H --> I[Tender]
  I --> J[Carrier Acceptance]
  J --> K[Shipment Execution]
  K --> L[Facility + Documents]
  L --> M[Delivery / POD]
  M --> N[Accessorial Reconciliation]
  N --> O[Shipper Invoice]
  O --> P[Carrier Pay Status]
  P --> Q[Broker Transaction Record]
  Q --> R[Close]


---

<!-- SOURCE: diagrams/03_autonomous_brokerage.mmd -->

flowchart LR
  H[Human Leadership / Compliance] --> P[Policy / Contracts / BOT]
  P --> A[Brokerage Agents]
  A --> G[Typed Durable Workflow Graphs]
  G --> X[Deterministic Authority / Commercial Gates]
  X --> E[External Side Effects]
  E --> V[Verification + Reconciliation]
  V --> O[Outcomes / Audit]
  O --> A
  X -->|Exception / high risk| H


---

<!-- SOURCE: templates/brokerage_go_live_checklist.md -->

# Brokerage Go-Live Checklist

- [ ] Brokerage entity/authority verified
- [ ] Financial responsibility verified
- [ ] BOC-3/process-agent requirement verified
- [ ] Counsel/legal operating gate signed
- [ ] BOT approved
- [ ] Carrier-Agent/Brokerage Plane separation tested
- [ ] Shipper account/contract map approved
- [ ] Carrier qualification policy approved
- [ ] Quote/margin policy approved
- [ ] TMS/CRM/accounting integrations conformed
- [ ] Fraud/payment-change controls tested
- [ ] RFQ/quote shadow passed
- [ ] Carrier qualification shadow passed
- [ ] Tender exact-version acceptance tested
- [ ] Idempotency/reconciliation tested
- [ ] FacilityOS integration tested
- [ ] Broker transaction record completeness tested
- [ ] 3-year minimum retention configured
- [ ] Authorized record review/export tested
- [ ] Proposed transparency automation disabled unless legally activated
- [ ] Kill switches tested
- [ ] Authority/financial-responsibility incident runbook tested
- [ ] Rollback/restore tested
- [ ] Customer/compliance signoff


---

<!-- SOURCE: templates/brokerage_intake.yaml -->

tenant:
brokerage_entity:
authority:
  mc_number:
  financial_responsibility_type:
  boc3_status:
  legal_review_owner:

organization:
  branches: []
  teams: []
  books: []

shipper_accounts: []
carrier_network:
  onboarding_system:
  qualification_policy:
  preferred_carriers: []
  prohibited_carriers: []

systems:
  tms: []
  crm: []
  load_boards: []
  authority_sources: []
  accounting: []
  payments: []
  communications: []
  documents: []

commercial_policy:
  margin_floor:
  margin_target:
  quote_approval_threshold:
  carrier_buy_limits:
  credit_limits:

workflow_priorities:
  first_account:
  first_workflow:
  biggest_manual_burden:
  biggest_exception:

autonomy:
  always_human: []
  candidate_a4: []


---

<!-- SOURCE: templates/brokerage_workflow_discovery.md -->

# Brokerage Workflow Discovery

## Workflow / business owner

## Legal plane / brokerage entity

## Trigger

## Shipper/customer

## Current systems

## Current steps

For each:
- actor/team
- input
- authoritative source
- rule
- judgment
- commercial limit
- approval
- external side effect
- evidence
- deadline
- exception.

## Carrier sourcing/qualification policy

## Pricing / margin policy

## Communication rules

## Financial/payment boundary

## Recordkeeping requirement

## Desired FreightOS graph
Mark:
- deterministic
- intelligence
- human
- side effect
- reconciliation.

## Target autonomy
A0/A1/A2/A3/A4/A5

## Shadow success criteria

## Kill switch / rollback
