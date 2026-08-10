# ADR-N0006 — External alias model

- **ADR ID:** N0006
- **Title:** Namespaced, non-authoritative external identifiers
- **Status:** Proposed — N0 governance wiring, awaiting external rereview
- **Date:** 2026-08-10
- **Related:** v1.4.0 `03_…IDENTITY_GRAPH.md` §2, `09_INTEROPERABILITY_STANDARDS_AND_ADAPTERS.md`, `policies/network-object-governance.yaml`

## Context

Every counterparty already identifies the same carrier differently: USDOT and MC numbers, EIN, SCAC,
DUNS, GLN, LEI, IATA codes, a TMS's internal customer number, an ELD provider's fleet ID, a
terminal's account code. FreightOS must resolve across them without adopting any of them as its key.

The specific hazard is that these identifiers _look_ authoritative. A USDOT number is issued by a
regulator, so it is tempting to treat a matching USDOT as proof of who is calling. It is not: an
alias is a claim about correspondence, and anyone can assert one.

## Decision

**Canonical ID ≠ external alias.** Aliases annotate a canonical identity; they never replace or
authenticate it.

Every alias record carries:

- **namespace** — the issuing system or authority, from a controlled vocabulary (`usdot`, `mc`,
  `ein`, `scac`, `duns`, `gln`, `lei`, `iata`, `partner:<system>`). Two identical strings in
  different namespaces are unrelated.
- **value** — the identifier as issued, stored verbatim.
- **participant reference** — the canonical ID it annotates.
- **provenance** — who asserted it and how it arrived.
- **verification status** — mirroring the v1.4 vocabulary: `unverified`, `self_asserted`,
  `verified`, `suspended`.
- **temporal validity** — effective interval and revocation, so an alias can lapse without
  disturbing the canonical identity.

### Rules

1. **An alias confers no authority.** It is never authentication evidence and never an authorization
   input. This is ADR-N0003's invariant applied to aliases specifically, and it is the rule most
   likely to be violated by a convenient lookup.
2. **Uniqueness is per namespace, and it is not global.** `(namespace, value)` may legitimately map
   to more than one participant across time — carriers are reassigned authority numbers, and
   organizations merge. The uniqueness that N1 enforces is `(namespace, value, participant_id)` plus
   at most one _active_ binding per `(namespace, value)` at any instant; history is retained.
3. **Verification is a property of the alias, not the participant.** A participant with one verified
   and three unverified aliases is not "verified".
4. **Revocation is non-destructive.** Revoking an alias ends its effective interval. Historical
   events that referenced it stay attributable, which is what `03_…IDENTITY_GRAPH.md` §7 requires.
5. **Aliases are inbound.** FreightOS resolves _from_ an alias _to_ a canonical ID for correlation.
   It does not publish a partner's identifier as its own.

## Alternatives considered

**Store external identifiers as columns on the participant** (`usdot`, `scac`, …). Rejected: the
column set is unbounded and partner-specific, every new integration becomes a migration, and
provenance, verification and temporal validity have nowhere to live.

**Globally unique `(namespace, value)`.** Rejected as factually wrong. Authority numbers are
reassigned and companies merge; a global unique constraint would make a legitimate real-world event
unrepresentable, and the usual workaround is to mutate history.

**Treat a verified alias as an authentication factor.** Rejected — this is precisely the SR-2 defect
class, where naming an identity was mistaken for proving one.

## Identity/authority impact

None. Explicitly inert.

## Interoperability impact

This is the anti-corruption boundary for identity. Adapters map partner identifiers to canonical IDs
through aliases and never reach into the canonical identity.

## Migration and rollback

None in N0. N1 creates the alias table; rollback drops it.

## Acceptance evidence

N1 must prove: an alias grants no privilege; a revoked alias stops resolving for new work while
history stays attributable; the same `(namespace, value)` can move between participants over time
without rewriting history; namespace is required and validated.

## Open decisions

The controlled namespace vocabulary's initial membership, and whether it is a database enum or a
reference table — the latter if partner namespaces are expected to grow routinely.
