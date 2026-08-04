# Initial Threat Model

## Assets

Tenant data, freight commitments, drivers/equipment, rates/costs, documents, credentials, billing/brokerage records, agent tools, policy, and audit.

## Threats

Cross-tenant exposure, prompt injection, tool escalation, duplicate acceptance, carrier identity fraud, double brokering, credential theft, bank-change fraud, audit tampering, hallucination, stale operational data, malicious webhooks, supply-chain compromise, insider misuse, provider exfiltration, and denial of service.

## Mitigations

RLS/scoped services, untrusted-content isolation, tool schemas, idempotency, verification/risk holds, MFA/secrets, red-action control, append-only audit, evidence/freshness labels, signatures, scanning, minimization, rate limits, and degraded modes.

## Physical logistics and autonomous threats

- Prompt or tool injection attempting to reach vehicle/robot/PLC control
- Forged ODD/readiness or vehicle identity
- Replayed mission authorization or gate credential
- Tampered facility geometry/restrictions
- Fraudulent custody evidence or seal event
- Stale WMS/YMS capacity causing unsafe congestion
- Provider outage during active mission
- Unauthorized remote-assistance escalation
- Cybersecurity hold suppression
- Telemetry flood affecting transactional systems
- Cross-facility or cross-provider credential leakage

Mitigations include absent control surfaces, mutual authentication, signed messages, replay protection, provider authority, provenance, idempotency, RLS, dedicated telemetry ingestion, activation gates, kill switches, and immutable evidence.
