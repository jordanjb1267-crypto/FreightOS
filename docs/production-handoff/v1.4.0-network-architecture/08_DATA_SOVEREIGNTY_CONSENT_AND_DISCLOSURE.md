# 08 — Data Sovereignty, Consent, and Selective Disclosure

## 1. Policy goal

FreightOS must maximize network utility while minimizing unnecessary data concentration and disclosure.

## 2. Data control model

Every data element has:

- originator;
- controller/owner designation;
- custodian;
- subject where applicable;
- purpose;
- classification;
- permitted recipients;
- retention and deletion rule;
- derivation lineage;
- legal/contractual basis;
- geographic restrictions.

## 3. Consent grants

Consent is represented as a versioned grant specifying:

- grantor and represented organization;
- recipient or recipient class;
- resources/fields;
- permitted purposes/actions;
- effective and expiry time;
- revocation behavior;
- downstream-sharing restrictions;
- audit and notification terms.

Consent does not replace other legal or contractual requirements.

## 4. Selective disclosure

Prefer assertions over raw data:

- `authority_verified=true` rather than full credential files;
- `mission_ready=true` with expiry and constraints rather than full repair history;
- `payment_destination_verified=true` rather than bank details;
- facility performance band rather than identifiable driver narratives.

## 5. Data residency and federation

Architecture must support storing sensitive source data in participant-controlled or regional stores while exposing governed APIs, events, or proofs. Replication requires an explicit purpose and retention policy.

## 6. Analytics

Network analytics must define:

- minimum cohorts;
- suppression rules;
- outlier handling;
- re-identification risk review;
- allowed joins;
- model training permission;
- customer opt-out where contractually applicable;
- lineage to source classifications.

## 7. Revocation

Revocation stops future access and subscriptions. It does not erase immutable records that FreightOS must retain for security, transaction evidence, legal obligation, or dispute resolution; those exceptions must be documented and access-restricted.
