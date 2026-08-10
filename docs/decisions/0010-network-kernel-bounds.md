# ADR-N0010 — Network kernel bounds

- **ADR ID:** N0010
- **Title:** The six-element kernel, and what is deliberately outside it
- **Status:** Proposed — N0 governance wiring, awaiting external rereview
- **Date:** 2026-08-10
- **Related:** v1.4.0 `00_MASTER_HANDOFF.md` §7, `23_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md`

## Context

The audit derived a minimum kernel from the v1.4.0 contracts and the current repository. This ADR
confirms it, assigns each element to a PR band, and — more importantly — records what is _excluded_,
because kernels grow by accretion when nobody writes the exclusions down.

## Decision

### The kernel is six elements

| #   | Element                                         | Band                                | Why it is kernel                                                                           |
| --- | ----------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Canonical network identifier + external aliases | **N1**                              | Every other artifact is keyed by it (ADR-N0004, ADR-N0006)                                 |
| 2   | Participant identity registry                   | **N1**                              | 7 of 8 v1.4 schemas carry a participant reference (ADR-N0005)                              |
| 3   | Logistics object reference                      | **N2**                              | The indirection that lets events and commands name subjects without duplicating aggregates |
| 4   | Universal event envelope + classification       | **N3**                              | The contract all transport depends on (ADR-N0007)                                          |
| 5   | Network idempotency + correlation/causation     | **N3** (semantics frozen in **N0**) | Required by both event and command paths (ADR-N0009)                                       |
| 6   | Versioned schema registry                       | **N2**                              | Makes 3–5 enforceable rather than advisory                                                 |

Elements 1 and 2 are together because a participant without an identifier is not addressable and an
identifier with nothing to identify is not testable; splitting them would produce a PR whose central
security claim could not be exercised.

Element 3 sits in N2 rather than N1 because it is a _reference format_, and no domain aggregate yet
exists to reference — the contract can be fixed before there is anything to point at, but it cannot
be usefully tested in N1.

### Explicitly outside the kernel

Dispatch · marketplace matching · settlement · agent execution · workflow engine · approval service ·
consent enforcement · API gateway · delivery workers.

Each is _dependent_, not foundational: each consumes kernel primitives and none is required to build
another kernel element. Two deserve their reasoning stated because both are tempting:

- **Consent enforcement** is not kernel despite appearing in `08_DATA_SOVEREIGNTY…`. A consent grant
  names a grantor, a recipient and resources — participants and object references — so it _depends_
  on elements 1–3. Building it first would mean inventing placeholder identities to consent between.
- **API gateway** is not kernel despite being the only externally visible artifact. It exposes the
  kernel; it is not part of it. Building it first would fix an external contract before the internal
  one it publishes exists.

### Rule

A capability enters the kernel only on evidence that another kernel element cannot be built without
it. Usefulness is not the test — every excluded item above is useful.

## Alternatives considered

**The 19-candidate list from `26_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md` as-is.** Rejected: it
enumerates the network's primitives, not its _foundational_ ones. Intent, command, workflow,
approval, evidence, consent, client identity, subscription and delivery all reference participants
and object references, so they are strictly downstream.

**A three-element kernel (identifier, participant, envelope).** Rejected: it omits the schema
registry, which is what makes the envelope enforceable rather than advisory, and omits idempotency
semantics, which two later bands both assume.

## Migration and rollback

None in N0. Band assignment governs sequencing only.

## Open decisions

Whether element 6 is a build or a buy (v1.4.0 decision 8). Whether element 3 needs storage at all in
N2 or remains a validated contract until a domain aggregate exists.
