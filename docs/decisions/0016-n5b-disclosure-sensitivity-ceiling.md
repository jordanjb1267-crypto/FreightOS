# ADR-N0016 — N5-B disclosure sensitivity ceiling

- **ADR ID:** N0016
- **Title:** Whether content may cross an organization boundary at all — the ceiling above every grant
- **Status:** Proposed — N5-B implementation, awaiting external rereview
- **Date:** 2026-08-14
- **Migration:** `0033_network_disclosure_sensitivity_ceiling`
- **Related:** ADR-N0015 (N5-A disclosure authorization core), ADR-N0013 (N3 journal), ADR-N0014 (N4
  transport intent), `docs/governance/DATA_CLASSIFICATION.md`, v1.4.0
  `08_DATA_SOVEREIGNTY_CONSENT_AND_DISCLOSURE.md`

## Context

N5-A answers whether a named recipient is authorized, for a named purpose, over a named field set.
It cannot answer whether that kind of content is allowed to leave at all, and the gap matters
because of who writes a grant: the grantor. With N5-A alone, the only thing between a sensitive
contract and the network is the party that benefits from disclosing it, and "the beneficiary
decides" is not a control.

N5-B is the second, independent, fail-closed condition. The invariant it exists to enforce is
one-directional:

> An N5-A grant may narrow what can leave. It must never widen what N5-B allows to leave.

Both conditions are required and neither substitutes for the other. A grant without eligible
content discloses nothing; eligible content without a grant discloses nothing.

## Decisions

### Network disclosure sensitivity is a separate axis from internal handling

`docs/governance/DATA_CLASSIFICATION.md` already classifies stores for FreightOS's own custody:
what may be copied to a development environment, what may reach a model provider, what may be
logged. That axis answers a question about obligations FreightOS owes over data it holds. N5-B
answers whether a canonical contract version may cross an organization boundary.

The two share no vocabulary, deliberately. `PUBLIC`, `INTERNAL`, `TENANT_CONFIDENTIAL`,
`TENANT_ECONOMICS`, `PERSONAL`, `SECRET` and `AUDIT` appear nowhere in N5-B, and none of
`execution_operational`, `counterparty_identifying`, `commercial_terms` or `never_external` appears
in the internal register. Reusing the labels would make the axes indistinguishable at exactly the
point a reviewer must tell them apart, and would let a store-level `INTERNAL` be misread as
permission to disclose. The register already states the negative form of this — `PUBLIC` there has
never meant "any network participant may receive it" — and this ADR states the positive form.

### Contract-level granularity, with the cost stated

Sensitivity attaches to `durable_schema_ref` and to nothing finer. Field-level sensitivity was
rejected: it would create a **second** security-critical field enumeration beside
`network_disclosure_projection_fields`, free to disagree with it, with no mechanism forcing
agreement — and the repository has already paid once for an invariant that held by absence rather
than by design (P-01).

The cost is real and is not hidden. A contract takes the highest sensitivity of anything inside it,
so `evidence-envelope` is `never_external` in its entirety although `content_hash` alone is
harmless, and `capability-advertisement` is `commercial_terms` although `capability_type` is not.
Eight of the nine registered contracts have no projection today, so nothing in use is lost. Field
overrides remain reachable later as a purely **narrowing** change — an override may only lower a
field below its contract ceiling, never raise it — which is the safe direction to extend in.

### Four ordered levels, and the order has machine meaning

`execution_operational` (10) < `counterparty_identifying` (20) < `commercial_terms` (30) <
`never_external` (99). `rank` is `UNIQUE`, so no two levels compare equal and the ceiling test is a
plain `<=`.

The ordering is derived from the registered contracts rather than from a generic information-security
framework. `commercial_terms` sits strictly above `counterparty_identifying` because Art. III.2 names
customer economics as the one category whose cross-customer leakage is prohibited by name — that is
what makes it higher rather than merely different.

`externally_disclosable` is carried **independently of rank** and the evaluator requires both. A
level could be given a low rank and still be non-disclosable, so an evaluator testing only
`rank !== 99` would be relying on a numbering convention instead of on the governed flag. A unit
test pins exactly that case: a `never_external` mis-ranked at 1 is still absolute.

### `never_external` is absolute, and that is the point of having it

Without an absolute class, "hard ceiling" is a misnomer: every level would be reachable by some
purpose ceiling a later ruling could raise, and the ceiling would be a policy dial rather than a
structural prohibition. Rank 99 is reserved for `never_external` by two CHECK constraints that
together make it biconditional, so the absolute class cannot be renamed, re-ranked, or switched on
by editing one column.

Four registered contracts hold it: `consent-grant` (the authorization graph itself — disclosing it
reveals who trusts whom), `command-envelope` (`approval_refs` and `policy_decision_ref` are
authority material, and disclosing an authority reference invites its reuse as authority),
`evidence-envelope` (`storage_ref` is a pointer into evidence storage), and `event-envelope` (a
container, not content — what may leave is a projection of the inner contract under its own
assignment).

### Purposes carry ceilings; there is no global maximum

Every governed purpose declares a maximum, and `shipment_execution` is capped at
`counterparty_identifying`: executing an agreed shipment requires operational state and knowing who
is involved, not rates and margins.

A single global maximum was rejected because the **second** purpose would silently inherit it —
the identical implicit-inheritance failure this migration refuses for schema versions. Refusing it
in one place while permitting it in the other would be incoherent. A purpose with no ceiling
discloses nothing; absence denies rather than defaulting to the most permissive level.

### No authority-basis ceiling yet, and the deferral is provably safe

Only `bilateral_grant` exists. A table anticipating statutory or regulatory bases that do not exist
would be speculative machinery, and inventing legal bases would be authoring law — the same
reasoning that left N5-A with one basis.

The deferral is safe because of the direction of composition. The effective ceiling is a `min()`
over its terms, so adding a basis term later can only **narrow**. Nothing decided today becomes
wrong when a second basis arrives.

### New schema versions inherit nothing, structurally

The assignment table's primary key **is** `durable_schema_ref`. `workflow-state.v2.json` is a
different key with no row, so it is unassigned, so it is denied. There is no lookup of a previous
version, a semantic predecessor or a shared base name, and a v2 that adds a sensitive field cannot
ride in on v1's ceiling because there is nothing to inherit through.

This is the difference between an invariant and a rule: it is not enforced by code anybody could
forget to write.

### `workflow-state` is `counterparty_identifying`, not `execution_operational`

Its authorized projection includes `/participants`, a roster of network participant ids, and a
roster identifies counterparties beyond the immediate transaction. Under a contract-level model the
contract takes the highest sensitivity it carries, so the roster decides this and `/state` does not.
Classified from the actual schema and the actual pointer set — see the known deviation below for why
that distinction is load-bearing here specifically.

### N5-B runs first, and the ordering is load-bearing

The evaluation order is N5-B, then N5-A, with the final ALLOW requiring both in one condition.

Ordering first is not an optimisation. Under contract-level granularity `N5B_PERMITS` is a pure
function of `(durable_schema_ref, purpose)` and needs nothing from grants, so it can run before any
grant is examined — and when it refuses, **the N5-A permitted-pointer union is never constructed**.
Running authorization first would build that union and discard it, and a field set that exists in
memory is a field set a later bug can log, return, or fold into a digest. The union is not narrowed
after the fact; it never exists. The composite result reports `authorization: null` in that case
rather than fabricating an empty decision to fill the type.

### The N5-A digest is unchanged; a composite digest is added

Extending the N5-A digest input was rejected: it would change every digest N5-A has ever produced
and destroy comparability with N5-A-era decisions. A separate, unrelated N5-B digest was also
rejected: it would lose the binding between the two halves.

What ships is a composite that takes the N5-A digest in whole, as an opaque value, alongside the
schema ref, the sensitivity code and rank, the purpose, the effective ceiling, the permit state and
the denial classification. Both forensic questions stay independently answerable — _which grants
authorized these fields_ by replaying N5-A, and _which ceiling permitted them_ from the remaining
inputs. `null` where N5-A was never consulted, which is a distinct fingerprint from any real digest.

N5-A's source diff for this change is **zero lines**. Composition happens in a new module,
`@freightos/context/disclosure-sensitivity`, which imports `disclosure.ts` and never edits it.

### Producer-supplied classification is authority-inert, and this is not hypothetical

Sensitivity resolves from one path: `durable_schema_ref` → governed assignment → governed
vocabulary. It never reads `network_events.classification`, a payload `classification` field, or any
caller-supplied sensitivity, visibility or shareability.

That matters more here than anywhere else in the system, because **two registered contracts already
carry a producer-controlled payload property named exactly `classification`** —
`evidence-envelope.v1` and `event-envelope.v1`. An implementation resolving sensitivity by field
name would compile and pass every behavioural test written against honest fixtures. A dedicated
source-level gate, `scripts/test/n5b-producer-classification.test.ts`, asserts the evaluator names
no producer-controlled field at all, with synthetic controls proving the detector fires.

### No runtime mutation, no new roles, no SECURITY DEFINER

All three tables are migration-authored and immutable: `SELECT` policies only, no `INSERT`, `UPDATE`
or `DELETE` policy for any role, nine `reject_mutation` triggers, and `FORCE` row-level security so
the owner is subject to policy too. `freightos_app` holds `SELECT` and nothing else;
`freightos_control_plane` and `freightos_event_writer` hold nothing. Administrative database
capability is not network disclosure authority.

There is deliberately **no reclassification machinery** — no `superseded_by`, no `revision`, no
effective dating, no correction path. Changing a classification or raising a purpose ceiling is a
security-widening governance decision that must arrive as its own reviewed migration, and
prebuilding a convenient path for it would be prebuilding the bypass.

**Zero new PostgreSQL roles. Zero new SECURITY DEFINER.** N5-B adds no database function at all; the
evaluator is deterministic TypeScript over ordinary governed reads.

## Alternatives considered

**Reusing the internal handling vocabulary.** Rejected: the two axes answer different questions, and
sharing labels would make a custody classification readable as a disclosure permission. The register
already had to state that `PUBLIC` is not network publication; sharing the tokens would have made
that sentence load-bearing rather than explanatory.

**Field-level sensitivity in the first version.** Rejected: a second field enumeration beside the
projection allowlist, both security-critical, free to diverge, with nothing forcing agreement. The
current data does not justify it — one projection exists across nine contracts — and the extension
remains available in the narrowing direction.

**A global maximum instead of purpose ceilings.** Rejected: it makes the second purpose inherit
silently, which is the exact failure mode refused for schema versions.

**Effective-dated assignments.** Rejected: re-judging a fixed contract version retroactively makes
historical decisions ambiguous. A contract version's content is immutable, so a changed judgement
means a changed opinion, and that belongs in a reviewed migration rather than in a date range.

**A supersession chain for corrections.** Rejected for this version, and the cost is stated: a
mis-classification cannot be edited in place and must arrive as a new reviewed migration. That is
the intended friction for a security-widening change, not an oversight.

**Extending the N5-A decision digest.** Rejected: it invalidates every historical digest to add a
field, and N5-A must stay independently replayable.

**A SECURITY DEFINER resolver to simplify RLS.** Rejected: the tables are world-readable governed
vocabulary with an unconditional SELECT policy, so there is nothing for a definer to make
convenient, and a definer added for convenience is a definer nobody reviews later.

## Consequences

Four registered contracts become permanently undisclosable through N6, and one more
(`capability-advertisement`) is unreachable under the only purpose that exists. That is four of nine
contracts blocked by decision rather than by omission, which is the visible form of the trade
contract-level granularity makes. Eight of nine had no projection anyway, so no disclosure that
works today stops working.

`workflow-state` — the one contract with a projection — remains disclosable under
`shipment_execution`, so the disclosure path N5-A built is still exercisable end to end. The
positive control that proves it is the load-bearing test in both suites: an evaluator that denied
everything would pass every negative case in this change.

Adding a network contract now requires a governance decision about its sensitivity, enforced
relationally by the migration and by an integration gate rather than by a count. Adding a disclosure
purpose requires an explicit ceiling. Both fail closed until the decision is made.

## Known deviation

The existing `workflow_state_minimal.v1` projection's stored description states that it _"Excludes
participants roster, deadlines, open exceptions and alias values"_, while `/participants` is one of
its six authored pointers. The pointer is legitimately permitted — `participants` is an array of
strings, and the closure rule allows a whole scalar array because it has no child fields a later
schema version could add — so this is an inaccurate description, not a leak.

It is left unmodified. The N5-A projection rows are immutable governance data, and rewriting one
opportunistically inside an unrelated migration is exactly the habit these tables exist to prevent.
Recorded as `N5A_PROJECTION_DESCRIPTION_ACCURACY=OPEN_NON_AUTHORITY_METADATA_DEFECT`.

It has one direct consequence worth naming: N5-B classified `workflow-state` from the actual pointer
set, not from that description. Had the description been trusted, the contract would have been read
as carrying no roster and might have been classified `execution_operational` — one level too low.
Flagged for owner confirmation.

## Migration and rollback

`0033` creates three tables, seeds four levels, nine assignments and one purpose ceiling, and proves
its own resulting catalog state by exact name and by relational completeness — a `LEFT JOIN` for
unassigned contracts and another for uncapped purposes, because a count of nine is still nine when
one contract is assigned twice and another not at all.

Assignments are resolved from `network_schema_versions` by joining on `artifact_class` rather than
by writing durable refs out by hand: a typo in a copied URL would produce no row and a silently
unassigned contract, and joining makes that failure loud.

Rollback is an exact one-step revert and needs no exception. N5-B has no runtime write path, so
unlike the N5-A permission rows there is no authority history to weigh, and no temporary policy is
needed to remove anything. The down migration captures the pre-revert state, drops the three tables
child-before-parent with no `CASCADE`, and then proves the revert was complete **and bounded** —
grants, projection pointers, the schema registry, the role set, the SECURITY DEFINER count and the
N5-A table inventory all byte-identical to what it captured. The round trip
`0032 → 0033 → 0032 → 0033` reproduces both states exactly.

## N6 prerequisites

N6 may not be accepted unless it calls the combined N5-B → N5-A path and nothing else; never reads
`network_events` directly to publish; never treats an owed N4 transport intent as permission;
accepts no caller-provided sensitivity, classification or ceiling parameter; persists the composite
digest together with grant ids, projection refs, sensitivity code and effective ceiling, so both
halves are provable after the fact; fails closed on missing, unknown or unreadable N5-B metadata with
no partial emission; emits only fields in the N5-A permitted-pointer union after the ceiling has
passed; and treats `never_external` as unreachable code, asserted rather than assumed.

> **NETWORK_N5B_COMPLETE DOES NOT AUTHORIZE NETWORK_N6_PUBLICATION.**

## Open decisions

Whether field-level overrides are ever needed, and for which contracts · whether
`capability-advertisement` should become reachable under a future commercial purpose rather than
under `shipment_execution` · what a second authority basis would imply for ceilings, once one exists
· whether the `event-envelope` container should be classified at all rather than excluded from
assignment · the correction procedure for a mis-classification, which today is a new migration ·
whether N6 may surface any N5-B denial reason externally, which this ADR deliberately does not
decide.
