# ADR 0013 — Architect the Complete Ecosystem, Build Sequentially

## Status

Accepted in FreightOS Production Handoff v1.2.

## Context

FreightOS has a validated long-term architecture spanning carrier dispatch, facilities, brokerage, exchange, autonomous vehicles, rail, ocean, and future air. Implementing all of these products simultaneously would multiply integration, regulatory, safety, market, and operational risk before the road-carrier product proves value.

## Decision

Preserve the universal domain, adapter boundaries, pricing hypotheses, safety rules, and activation gates for the complete ecosystem. Authorize only Horizon 1 production implementation. Deferred products receive contracts, schemas, disabled configuration, fixtures, and simulation only.

Claude and all engineering agents must stop after Horizon 1 unless an owner-approved ADR promotes a named module and updates the machine-readable module registry.

## Consequences

- The road-carrier Dispatch Copilot can ship sooner.
- Future modes are not designed into a dead end.
- Deferred products cannot consume engineering capacity through accidental phase progression.
- Commercial, legal, customer, partner, safety, and liquidity gates remain explicit.
- Some future-facing packages will exist without production implementations.
