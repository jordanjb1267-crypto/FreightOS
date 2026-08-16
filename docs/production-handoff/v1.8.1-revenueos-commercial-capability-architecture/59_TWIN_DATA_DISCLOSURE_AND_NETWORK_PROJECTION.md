# 59 — Twin Data Disclosure and Network Projection

## Principle

The Twin may know far more than any counterparty is allowed to know. Network participation therefore requires explicit projection, never raw-Twin sharing.

## Projection decision

Every outbound network artifact is evaluated against:

- sender identity/represented organization;
- receiver or permitted audience;
- relationship;
- business purpose;
- object/workflow context;
- data classification;
- consent/contract;
- legal plane;
- field-level disclosure policy;
- retention/usage constraints;
- version/effective time.

## Examples

A carrier may share `available_capacity` without sharing driver payroll or private cost structure.

A facility may share `appointment_confirmed` without sharing its full internal production schedule.

A broker may tender agreed commercial terms without exposing other carriers' bids.

A shipper may communicate requirements without exposing internal procurement strategy.

A service provider may share service completion/readiness without exposing unrelated customer records.

## Network-derived data returning to Twin

Network observations remain provenance-bearing. A counterparty assertion is not automatically local authoritative truth. It may update local state only under the relevant relationship, verification, and authority binding.

## Aggregate intelligence

Cross-customer/network learning remains subject to the existing FMI privacy, aggregation, re-identification, purpose, and rights controls.
