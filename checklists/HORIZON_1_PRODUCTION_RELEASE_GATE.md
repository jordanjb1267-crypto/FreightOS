# Horizon 1 Production Release Gate

**Status:** Created in Phase 0 to close audit finding G13.

`config/pricing/products.yaml:10` and `:19` gate both Horizon 1 products on
`billing_activation_gate: horizon_1_production_release`, and `config/pricing/carrier_plans.yaml:56`
repeats it. No artifact by that name existed anywhere in the handoff package, so billing for the
only two buildable products was gated on nothing. This is that artifact.

Nothing here may be checked before Phase 3 is complete. Billing stays disabled until every
applicable item is evidenced and signed.

## Preconditions

- [ ] Phases 0, 1, 2 and 3 have each passed `checklists/PHASE_EXIT_GATE.md`.
- [ ] `checklists/PRODUCTION_READINESS.md` is complete and signed.
- [ ] The exact release commit is clean and tagged (Constitution Art. VIII.5).

## Metering correctness

- [ ] Every meter consumed by `carrier_core` and `carrier_copilot` is named, defined, and
      versioned. **At Phase 0 no meter is defined anywhere in the package — this is a real gap,
      not a formality.**
- [ ] The `active_powered_unit` computation that `carrier_plans.yaml:53` presumes is specified and
      tested against the `billing_quantity_rule`
      `max(contracted_minimum, monthly_average_daily_active_powered_units)`.
- [ ] Meter events are idempotent under replay (`03_PRICING_AND_BILLING:158-166`).
- [ ] Corrections append adjustment events. **Note the structural obstacle:** `meter_events` has
      `CHECK (quantity > 0)` and `meter-event.schema.json` sets `exclusiveMinimum: 0`, so a
      negative correction at the meter layer is impossible. Either the adjustment path is at the
      invoice layer only, or the constraint changes. Decide and record it.
- [ ] Money arithmetic is deterministic integer minor units, with formula version, rounding mode,
      currency, and actor recorded (`07_DATA_MODEL:65`).
- [ ] SaaS revenue is recorded separately from brokerage, exchange, financing and support
      (Constitution Art. VI.1).

## Catalog integrity

- [ ] The activated catalog version is immutable and pinned by contract.
- [ ] Signed contracts retain the agreed catalog and overrides (Art. VI.3).
- [ ] Agents cannot issue discounts or amend terms (Art. VI.4).
- [ ] Billing does not expose raw token pricing (Art. VI.5).
- [ ] Launch-catalog entries exist for standard implementation, approved integrations/API/MCP
      tiers, and support plans. **None exist at Phase 0**, though `03_PRICING_AND_BILLING:15-19`
      lists all three as launch catalog.
- [ ] Every product other than `carrier_core` and `carrier_copilot` still carries
      `COMMERCIAL_STATUS = PRE_LAUNCH_TARGET`, `BILLING_ENABLED = FALSE`,
      `CUSTOMER_SALE_ALLOWED = FALSE`.

## Validator reconciliation

- [ ] `scripts/validate_handoff.py:86` is updated before billing is enabled. **It currently fails
      if any product has `billing_enabled != false`, including the two products this gate exists
      to release.** Line 88 has a carve-out for `customer_sale_allowed`; line 86 has none for
      `billing_enabled`. Enabling billing without fixing this turns the release into a red build.
- [ ] `scripts/validate-scope.mjs` is updated in the same change, for the same reason.
- [ ] Both changes land in the reviewed PR that flips the flag, never before it.

## Customer-facing correctness

- [ ] Customers can see metered usage before invoice close (`03_PRICING_AND_BILLING:166`).
- [ ] Invoice generation, entitlement activation, and checkout are exercised end to end in a
      non-production environment with real catalog data.
- [ ] No deferred product appears in checkout, invoice generation, entitlement activation, sales
      proposals presented as generally available, or public pricing pages (`21_…:155`).

## Operational readiness

- [ ] Billing-correction runbook exists and has been exercised (`12_…:43`).
- [ ] Billing SLIs and SLOs are defined and measured. No SLA is promised before evidence
      (`12_…:21`).
- [ ] Kill switches covering financial actions are tested — `financial_disabled` and `suspended`
      both verified to stop money movement.
- [ ] Rollback from an enabled billing state to disabled is documented and tested.

## Signatures

- [ ] Owner
- [ ] Finance
- [ ] Engineering

A passing test suite, a feature flag, or a successful simulation does not satisfy this gate by
itself.
