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
