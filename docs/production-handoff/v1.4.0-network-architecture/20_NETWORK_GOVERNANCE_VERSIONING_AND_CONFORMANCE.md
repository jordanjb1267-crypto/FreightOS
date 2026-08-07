# 20 — Network Governance, Versioning, and Conformance

## 1. Governance bodies/functions

Initially these may be roles rather than committees:

- Network Architecture Owner
- Domain Model Steward
- Security and Privacy Owner
- API/Event Contract Maintainer
- Partner Conformance Owner
- Product/Operations Representative
- Legal/Compliance Reviewer for regulated domains

## 2. Registries

Maintain:

- participant and capability registry;
- schema registry;
- event catalog;
- command catalog;
- vocabulary/code-list registry;
- external-standard mapping registry;
- deprecation registry;
- conformance status registry.

## 3. Change classes

- editorial/non-semantic;
- backward-compatible additive;
- behavioral compatible;
- breaking schema/API;
- authority/security critical;
- emergency security change.

Each class has required reviewers, tests, notice, and rollout behavior.

## 4. Conformance levels

- **L0 Documented:** contracts and declared scope exist.
- **L1 Syntactic:** payload/API validation passes.
- **L2 Semantic:** lifecycle and field meanings conform.
- **L3 Operational:** idempotency, failure, replay, and SLO tests pass.
- **L4 Trusted:** security, privacy, evidence, and authority controls pass.
- **L5 Certified:** approved independent or standards-body certification where available.

## 5. Compatibility

Consumers publish supported versions/capabilities. Producers may not assume every consumer understands newly added behavior. Feature negotiation and schema defaults are explicit.

## 6. Deprecation

Every deprecation states replacement, affected partners, final support date, migration tests, and emergency rollback. Network-critical deprecations require usage evidence and direct partner confirmation.
