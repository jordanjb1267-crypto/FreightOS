# 10 — API Gateway, Partner Integration, and Developer Platform

## 1. API styles

- Resource APIs for canonical objects and queries
- Command APIs for bounded actions
- Event APIs for publication and subscription
- Bulk and file exchange for legacy/high-volume workflows
- Webhook delivery for simple partner consumption
- Streaming channels where justified by latency and scale

## 2. API gateway responsibilities

- authentication and delegated authorization;
- organization and tenant context binding;
- schema validation;
- request size and rate limits;
- idempotency enforcement;
- replay protection;
- correlation and trace IDs;
- partner version routing;
- audit emission;
- abuse and anomaly detection;
- safe error normalization.

The gateway does not replace domain authorization inside services.

## 3. Partner environments

- documentation and sample payloads;
- sandbox identities and synthetic data;
- deterministic conformance suite;
- webhook/event replay tools;
- rate-limit and failure simulation;
- compatibility report;
- production credential issuance only after approval.

## 4. Versioning

Use explicit API versions and compatibility policy. Breaking changes require parallel support, migration guidance, and partner communication. Emergency security removals follow a documented exception process.

## 5. Webhooks

Require:

- HTTPS;
- signed payloads;
- timestamp and replay window;
- event ID and idempotency;
- acknowledgement rules;
- retry schedule;
- dead-letter handling;
- endpoint verification;
- subscription-scoped secrets or asymmetric keys;
- payload minimization.

## 6. Developer portal

The portal should eventually expose:

- API/AsyncAPI contracts;
- schema registry;
- event catalog;
- capability registry;
- changelog and deprecations;
- conformance status;
- integration health;
- key/credential management;
- support and incident notices.
