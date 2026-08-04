# Security, Compliance, and Legal Gates

## Security foundation

Use resource-focused zero trust: authenticate users, services, devices, and agents; authorize every request; least privilege; short-lived credentials; audit privileged actions.

## Controls

MFA, federation, secrets manager, encryption, RLS, signed webhooks, rotation, device/session controls, scanning, backup/restore, break-glass, environment isolation, DLP, and protected audit.

## Agent security

Tool allowlists, prompt-injection defense, untrusted-document isolation, output validation, no secrets in prompts, no direct shell/DB in production, egress controls, budgets, provider controls, redaction.

## Data classes

Public, Internal, Confidential, Restricted, Regulated.

Restricted includes credentials, bank data, government IDs, sensitive cargo/security information, and protected personal data.

## Brokerage gate

Before launch:

- Brokerage entity
- FMCSA registration
- BMC filing
- $75,000 qualifying security
- Process agent
- Authority monitoring
- Counsel-approved contracts
- Record retention
- Separate bank/ledger
- Claims and insolvency procedures
- Approved automation boundary
- Trained operations
- Audit export
- Kill-switch test

## Recordkeeping

Model parties, carrier registration, shipment number, broker receipts, compensation, service compensation, freight charges, carrier payment date, support, and access. Retention is configurable and never shorter than law.

## AI governance

Model, prompt, tool, evaluation, deployment, incident, drift, override, and risk registers. Use NIST AI RMF as a baseline.

## Disclaimer

This package is architecture and risk reduction, not legal advice. Transportation counsel approves operating model, agreements, disclosures, and classification.

## Autonomous mobility gate

Before live missions:

- Provider contract and legal review
- Insurance and responsibility mapping
- Provider-authoritative ODD/readiness
- Facility and corridor approval
- Cargo/equipment eligibility
- Mutual authentication, signed messages, replay defense, idempotency, and audit
- Remote-assistance, recovery, incident, and cybersecurity procedures
- Shadow and approval-only evidence
- Tested kill switches and human holds

## Facility safety

FreightOS may integrate with WMS, YMS, WES, robotics, and industrial systems, but its general agents and MCP layer cannot command physical motion or override safety controls. Any future expansion requires a separate safety case and legal/engineering program.
