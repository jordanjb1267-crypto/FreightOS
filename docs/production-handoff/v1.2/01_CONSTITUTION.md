# RIG FreightOS Constitution

## Article I — Authority

1. Execute only within explicit tenant, legal-entity, and authority context.
2. Missing or inconsistent legal context fails closed.
3. Carrier-Agent Mode acts only for the appointed carrier.
4. Brokerage actions require the separately authorized Brokerage Plane.
5. No agent grants itself authority.

## Article II — Transaction truth

1. PostgreSQL domain records and append-only audit events are authoritative.
2. Agents do not directly modify core tables.
3. Every mutation begins as a typed command.
4. Every consequential command is policy evaluated.
5. Every external action uses an idempotency key.
6. Every material state change emits a versioned event.

## Article III — Customer data

1. Tenant-private data is isolated.
2. Customer economics cannot be exposed to another customer.
3. Shared learning is opt-in, de-identified, aggregated, and reviewed.
4. Production customer data cannot be copied to local development.
5. Model providers receive minimum necessary context.

## Article IV — Artificial intelligence

1. Agents operate only within manifests.
2. Every agent has a version, owner, allowlist, evaluation suite, and rollback.
3. Model outputs are schema validated.
4. Low-confidence results are disclosed and escalated.
5. Models do not authoritatively calculate money, permission, or legal status.
6. Provider outages cannot corrupt freight state.

## Article V — Safety and control

1. Humans retain kill-switch and override authority.
2. Policy or audit failure blocks autonomous execution.
3. Material parameter changes invalidate approval.
4. Risk holds cannot be removed solely by an agent.
5. Money movement, claims settlement, bank changes, and authority changes remain red actions.

## Article VI — Commercial integrity

1. SaaS, brokerage, exchange, financing, and support revenue are separately recorded.
2. Pricing catalogs are versioned.
3. Signed contracts retain agreed catalog and overrides.
4. Agents cannot issue discounts or amend terms.
5. Billing does not expose raw token pricing.

## Article VII — Modal neutrality

1. Shipment is not synonymous with truck load.
2. A shipment may have many consignments and legs.
3. Equipment and cargo use extensible registries.
4. Modal logic lives in adapters.
5. New modes do not change core Shipment meaning.

## Article VIII — Production discipline

1. No direct production commits.
2. Releases require reviewed PRs, migrations, tests, observability, and rollback.
3. Brokerage cannot launch through a feature flag alone.
4. No acceptance claim without evidence.
5. Clean tree and exact SHA are required.

## Article IX — Physical logistics and autonomous systems

1. FreightOS controls commercial missions and operational handoffs, not dynamic driving or industrial motion.
2. ADS providers remain authoritative for ODD, driving state, readiness, fallback, and minimal-risk operation.
3. Facility safety controllers and authorized humans remain authoritative for robotics, PLCs, conveyors, dock restraints, doors, and interlocks.
4. Facility geometry, clearances, restrictions, and autonomous compatibility require authoritative provenance and versioning.
5. Custody transfer requires structured evidence and cannot be inferred solely from communication.
6. No live autonomous mission before the autonomous-vehicle activation gate.
7. No A4 FacilityOS action before A3 evidence and the facility automation gate.


## Article X — Sequenced implementation

1. FreightOS preserves the architecture of the complete ecosystem but implements only the currently authorized horizon.
2. The machine-readable module registry defines whether a module is active, foundational, scaffold-only, promotion-gated, customer-gated, legal-gated, partner/safety-gated, liquidity-gated, or dormant.
3. Deferred modules may receive contracts, schemas, disabled configuration, fixtures, and simulation only.
4. A future phase prompt, feature flag, schema, price target, or technical feasibility does not authorize implementation or activation.
5. Claude and all engineering agents must stop after Horizon 1 unless an owner-approved ADR promotes a named module.
6. No agent may change its own module state, horizon, legal gate, safety gate, commercial status, or autonomy ceiling.
7. Future architecture must not be deleted merely because its implementation is deferred.
