# ADR-0023 — X12 licensing and the connector boundary

**Status:** Accepted (owner ruling E, Phase 1)
**Date:** 2026-08-04
**Closes for Phase 1:** risk R-15 in `docs/governance/RISK_REGISTER.md`

## Context

`05_MULTIMODAL_DOMAIN_AND_ADAPTERS.md:51` and `11_INTEGRATIONS_API_EDI_AND_MCP.md:53` both name
X12 204, 990, 214, and 210 as the initial road targets, and the road adapter is Horizon 1 scope.

X12 transaction sets are published under licence, and implementation guides are separately
licensed documents. The handoff never mentions this. R-15 records the consequence:

> X12 transaction sets are licensed documents and are Horizon 1 scope (204/990/214/210). Never
> called out as a cost or prerequisite anywhere in the package.

`docs/governance/INTEGRATION_REGISTRY.md:26` marks EDI as not registered, with licensing an
unresolved prerequisite.

The handoff also already prescribes the correct architecture independently of licensing.
`11_…:51`: **"Translate at the boundary. Never make X12 segments the internal model."** Building
the canonical model first and attaching maps later is therefore the right order regardless of what
is licensed and when.

## Decision

Phase 1 implements the boundary, not the standard.

**Approved.**

- Abstract interfaces
- Canonical internal contracts
- Canonical JSON fixtures
- Non-X12 ingestion first
- Licensed mappings deferred

The repository may name X12 204, 990, 214, and 210 as **future connector targets**. Each must
remain:

```yaml
implemented: false
```

**Prohibited.**

- Copying licensed X12 content
- Inventing segment mappings
- Inferring required loops or qualifiers
- Representing an abstract interface as X12 conformance
- Blocking the canonical road adapter on X12 procurement

### What this permits, concretely

- The canonical road-leg model and its versioned extension schema. It owes nothing to X12.
- Abstract boundary types — an inbound message and an outbound message carrying `standard`,
  `transaction_set` as an **opaque string**, `version`, trading-partner identity, a raw-payload
  reference, parse status, and a normalized payload.
- A translator **interface**, with no X12 implementation behind it.
- Per-trading-partner map versioning metadata (`11_…:56`) with **zero maps populated**.
- Synthetic fixtures in FreightOS's own canonical JSON.
- The complete non-X12 ingestion path.

### What is deferred until licensing is obtained

- Segment, element, and qualifier layouts for 204, 990, 214, and 210
- Any fixture containing X12 envelope or segment syntax
- Code-list values drawn from X12 data elements
- Partner implementation guides, in any form, including paraphrase
- Conformance tests asserting correct X12 output
- The EDI row in `docs/governance/INTEGRATION_REGISTRY.md`

### First working ingestion path

Canonical JSON over a governed REST or file-import boundary. This is the path Phase 2 load
ingestion will exercise, and it is consistent with `00_MASTER_HANDOFF.md:136` ("Manual, email,
document, and approved integration ingestion") and `21_…:87`.

### Enforcement

A CI check fails the build when X12 interchange syntax appears in tracked files — matching
`^ISA*`, `^GS*`, or `^ST*` at line start outside prose directories. The check is deliberately
crude, because it targets the realistic failure mode: someone pasting a sample transaction into a
fixture to make a test concrete.

Naming a transaction set by number is not licensed content. The numbers already appear in the
preserved handoff at `05_…:51` and `11_…:53`; they are identifiers, not specifications.

## Consequences

**Good.** The road adapter ships complete and testable in Phase 1 with zero licensing exposure,
and the seam where maps will attach is defined and versioned. Licensing leaves the Phase 1 critical
path entirely — it constrains only eventual EDI enablement, which is Phase 2 at the earliest.
Because the canonical model was going to be built first anyway, the decision costs nothing in
design quality.

**Cost.** No trading partner can exchange EDI with FreightOS until licensing is procured and maps
are written. For a carrier-facing product whose brokers commonly tender by 204, that is a real
commercial gap, and it is now explicit rather than discovered during an integration.

**Owner deliverable, unblocked but outstanding.** Whether and when to procure X12 licences,
and at what cost, remains open — recorded as OQ-6 in `docs/governance/OPEN_QUESTIONS.md`. R-15
moves from *"blocks the road adapter's EDI boundary in Phase 1"* to *"does not block Phase 1;
blocks EDI enablement"*.

**Nothing in this ADR reproduces or invents licensed X12 content.**
