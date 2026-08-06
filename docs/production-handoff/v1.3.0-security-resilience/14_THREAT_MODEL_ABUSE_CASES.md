# 14 — FreightOS Threat Model and Abuse-Case Catalog

## 1. Protected assets

- tenant and counterparty confidential data;
- identity and authority state;
- active shipment and dispatch state;
- vehicle, driver, facility, and service records;
- chain-of-custody evidence;
- documents and signatures;
- payment and settlement instructions;
- provider dispatch and emergency service commands;
- audit and historical truth;
- secrets, keys, and release artifacts;
- agent tools and policy.

## 2. Threat actors

- external attackers;
- cargo thieves and identity-fraud networks;
- malicious or compromised users;
- dishonest counterparties;
- compromised vendors/integrations;
- malicious insiders;
- compromised developer/build systems;
- prompt-injection content authors;
- faulty automation and defective releases;
- opportunistic scrapers and data harvesters.

## 3. Priority abuse cases

### Identity and tenancy

- fabricated actor or organization ID obtains authority;
- user changes membership/role tables directly;
- cached object returned to the wrong tenant;
- search or vector retrieval crosses tenant boundary;
- signed URL remains usable after authorization revocation;
- support or administrator access is abused.

### Freight and chain of custody

- false carrier/driver/equipment identity at pickup;
- seal, POD, or rate document is substituted;
- event time/location is manipulated;
- unauthorized party redirects a load or changes appointment;
- duplicate or conflicting shipment events conceal theft.

### Payments and settlement

- bank destination is changed after email or credential compromise;
- duplicate payment due to retry;
- invoice or accessorial evidence is altered;
- agent approves its own payment proposal;
- compromised connector reports false settlement state.

### Vehicle/service operations

- false diagnostic or location data triggers tow/repair;
- duplicate roadside dispatch;
- provider accesses unrelated fleet records;
- compromised technician account changes repair status or estimate;
- stale telemetry is represented as live.

### AI and agent systems

- malicious document instructs agent to reveal data or use a tool;
- agent retrieves another tenant's context;
- model fabricates authorization or evidence;
- tool arguments cause SSRF or arbitrary endpoint access;
- agent increases its own limit or disables logging;
- autonomous repair modifies production without review.

### Software and infrastructure

- dependency or build pipeline is compromised;
- unsigned artifact is deployed;
- migration corrupts tenancy or authority;
- global shared service creates network-wide outage;
- ransomware deletes production and online backups;
- observability leak exposes sensitive payloads.

## 4. Required threat-model process

For each domain:

1. draw trust boundaries and data flows;
2. identify assets and actors;
3. enumerate misuse/abuse and failure scenarios;
4. assess likelihood and maximum impact;
5. map preventive, detective, containment, and recovery controls;
6. create required tests and alerts;
7. document accepted residual risk;
8. update after architecture change or incident.

Use `templates/THREAT_MODEL_TEMPLATE.md`.

## 5. Mandatory pre-GA attack simulations

- cross-tenant ID enumeration;
- fabricated authorization context;
- stolen user and service credentials;
- payment-destination takeover;
- replay and duplicate event attacks;
- malicious document prompt injection;
- compromised webhook/provider;
- build artifact substitution;
- backup deletion and restore;
- cell or regional outage;
- audit-log tampering attempt.
