# AWE-0 — Architecture governance wiring

**Status:** remediation record, revision 2. Docs, registry and CI only.
**Base:** `main` @ `5da675aea28a0a39d198266352c4e5bc84774754`.
**Branch:** `remediation/awe-0-governance-wiring`.
**First candidate:** `8528734` — reviewed independently, returned `AWE_0_REVIEW=REMEDIATE`.
**Closes:** `W01-F-GOV-01` (`docs/workforce-engineering/PROPOSED_ADDITIVE_PR_SEQUENCE.md` card AWE-0)
and the root defect in `docs/agentic-architecture-review/01_PACKAGE_INVENTORY_AND_PRECEDENCE.md`
§3.1–§3.2.

> Registration binds a package to authority. It never confers any.

---

## 1. The root cause, reproduced

Both accepted audits name the same defect: accepted architecture packages can be substantive and
internally coherent while being bound to the repository's controlling authority by nothing. Every
count below was recomputed on this branch's base commit rather than taken from the audits.

| Binding                                                  | v1.2 | v1.3.0 | v1.4.0 | v1.5.0 | FacilityOS | v1.6.0 | v1.7.0 | v1.8.0 | v1.8.1 |
| -------------------------------------------------------- | :--: | :----: | :----: | :----: | :--------: | :----: | :----: | :----: | :----: |
| declared in `governance-layers.json`                     |  ✔   |   ✔    |   ✔    |   ✖    |     ✖      |   ✖    |   ✖    |   ✖    |   ✖    |
| integrity verified by CI                                 |  ✔   |   ✔    |   ✔    |   ✖    |     ✖      |   ✖    |   ✖    |   ✖    |   ✖    |
| cites any of the 27 accepted ADRs                        | n/a  |   0    |   0    |   0    |     0      |   0    |   0    |   0    |   0    |
| cited by any accepted ADR / decision record              | n/a  |   0    |   0    |   0    |     0      |   0    |   0    |   0    |   0    |
| names a module id from `config/scope/module_states.yaml` |  ✔   |   0    |   0    |   0    |     0      |   0    |  1\*   |   0    |   0    |
| names a Horizon                                          |  ✔   |   0    |   0    |   0    |     0      |   0    |   0    |   0    |   8    |
| named anywhere in `scripts/`, `.github/`, `turbo.json`   |  ✔   |   ✔    |   ✔    |   0    |     0      |   0    |   0    |   0    |   0    |

\* one incidental occurrence, `shipper_control_tower` inside v1.7.0's generated `COMBINED_HANDOFF.md`.

**Package size, corrected.** The six packages hold **567 tracked files** (35 + 39 + 39 + 32 + 189 +
233), of which 561 are manifest-listed once the six manifests are excluded. The first candidate said
607 in four places; that figure was wrong and is corrected throughout. The accepted audits do not
contain it and were not touched. `8528734`'s commit message still carries it — that commit is
preserved unamended by instruction, and this record is the correction.

Two facts shaped the mechanism:

1. **The gap is wider than ADRs.** The packages name almost no module id and no Horizon, so there is
   nothing in their prose for a validator to bind _to_. Any mechanism deriving the binding by
   scanning package text would have had nothing to read.
2. **The binding cannot live inside the packages.** Owner ruling 2 (`docs/security-resilience/README.md`
   §A.4a) freezes an installed versioned package after installation, and both audits verified all six
   byte-exact. A citation added to a package document would break that package's own manifest.

## 2. AWE-0 is not self-authorised

The same owner ruling that froze the packages also directed where their pointers must live:

> Future additive handoff pointers belong in a **top-level handoff registry or index maintained
> outside older checksummed packages** — not inside them.

`governance-layers.json` is that registry. The clause is quoted in
`architectureGovernance.mandate` and checked **verbatim** against the record by the validator, so the
citation cannot drift from the text it cites.

The first candidate instead wrote "ADR-0014 and SR ruling 2 make an installed package immutable".
The ADR-0014 half was wrong — its immutability clause is scoped to v1.2 (§5). The second half was
_right in substance but ambiguous in citation_: "SR ruling 2" reads naturally as `adr/0027`
(_"Accepted (engineering, SR-2)"_, verified actor binding), which contains no such ruling. It meant
owner ruling 2 in the security/resilience record above. The registry now cites the record, the
ruling and the clause text, and the validator checks the clause verbatim, so the shorthand cannot be
misread again.

## 3. Mechanism

One registry, extended. Two gates, each with one question, over one shared library.

```
governance-layers.json                        the single hand-maintained registry
  ├── scripts/lib/governance-layers.mjs       loader, manifest parsers, ANCHORED expectations
  ├── check-network-governance.mjs            INTEGRITY  — does each layer match its manifest?
  └── check-architecture-governance.mjs       BINDING    — is each package bound to authority?
```

No second registry was created. The split into two gates follows the repository's own precedent:
`check-network-egress.mjs` and `check-egress-allowlist.mjs` read one inventory through one shared
library and differ only in policy.

**Why so much lives in the library rather than the registry.** Every break the independent review
found had one shape: a rule whose expectations lived inside the document it validated. A security
layer demoted itself out of the anti-inversion rule; an unresolved-authority inventory deleted
itself; a seventh package declared itself out of the binding obligation. Anchored expectations now
live in `scripts/lib/governance-layers.mjs`, following `scripts/validate-scope.mjs`, whose
`MODULE_EXPECTATIONS` hard-codes the module states CI must still see for exactly this reason.

## 4. What the gates prove — and what they do not

This section exists because the first candidate implied stronger claims than it delivered.

| Tier                                                 | Status                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| Relation is syntactically valid, kind in vocabulary  | **PROVEN**                                 |
| Authority exists, is source-qualified, is Accepted   | **PROVEN**                                 |
| Module ids resolve; Horizon agrees with module state | **PROVEN**                                 |
| The binding still matches what a reviewer accepted   | **PROVEN** (digest)                        |
| Required gates actually run in CI                    | **PROVEN** (parsed workflow)               |
| Manifest entries stay inside their own package       | **PROVEN** (containment)                   |
| **Semantic truth of an `evidence` string**           | **NOT PROVEN — human-reviewed rationale**  |
| **That a `moduleScope` is the _right_ scope**        | **NOT PROVEN — a reviewed governance act** |
| **Tamper resistance of the packages themselves**     | **NOT PROVEN — see F-07, §8**              |

The registry says so in its own `evidenceRule`, and each gate carries a "what this does not claim"
note in the repository's existing idiom (`check-egress-allowlist.mjs`: _"This raises the cost … and
makes it reviewable. It is not a sandbox."_).

## 5. Authority: identity, sources, relations

**Two namespaces, and the repository already disambiguated them.** `adr/` and `docs/decisions/`
reuse all eighteen numbers 0001–0018, so `ADR-0018` was resolving to the autonomy ceiling when a
network decision on the N7 transport boundary was meant. The fix is the repository's own convention,
not an invention — `docs/decisions/` records title themselves `ADR-N0018` and declare
`**ADR ID:** N0018`, a form already used in runtime source, four migrations, a CI gate, nine
governance documents and six tests:

| Source             | Ids         | Directory         | Indexed |
| ------------------ | ----------- | ----------------- | ------: |
| `adr`              | `ADR-NNNN`  | `adr/`            |      27 |
| `network-decision` | `ADR-NNNNN` | `docs/decisions/` |      16 |

Every relation declares both the id and its source; the two must agree with each other and with
where the id resolves. An unqualified reference is refused, not guessed. The two Phase decision
_records_ (`0001`, `0002`) declare no ADR ID and are deliberately not citable. Twelve network
decisions are `Proposed`; the gate refuses them as controlling authority, which leaves the accepted
audit's Proposed-but-implemented CONFLICT visibly open rather than laundering it.

**Relation accuracy (F-11).** The first candidate declared `governed-by ADR-0014` on all six
packages. ADR-0014's decision text is about the repository name, the location of the **v1.2**
preserved package, and provenance for v1.2-derived root copies; `handoff-provenance.json` covers that
root only. Generalising its immutability clause to "an installed package" was broadening by
interpretation. Corrections applied:

| Package    | Relation                    | Change                                                                                                        |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| all six    | `ADR-0014` `governed-by`    | → `constrained-by`; evidence narrowed to location, byte-pinning attributed to each package's own manifest     |
| FacilityOS | `ADR-0025` `constrained-by` | → `governed-by` — ADR-0025 decides detention exhaustively                                                     |
| v1.6.0     | `ADR-0015` `constrained-by` | → `governed-by` — ADR-0015 decides the brokerage plane outright                                               |
| v1.6.0     | `ADR-0023` evidence         | struck "and distribution", which ADR-0023 does not decide                                                     |
| v1.8.1     | `ADR-0007` evidence         | rewritten to ADR-0007's own text; the billing-disabled claim comes from the sequencing doctrine, not ADR-0007 |
| FacilityOS | `ADR-0012` evidence         | restated in `governed-by` terms                                                                               |

Final split: **governed-by 12, constrained-by 13, additive-beneath 1**. The split is declared in the
registry and tallied by the gate, so silently downgrading a relation is a two-line diff.

## 6. The authority model — precedence removed

The first candidate carried a dense 1..N total ordering. The review found it over-strong and inert,
and both are true:

- **Inert.** A repository-wide grep found no consumer. The only reader was the validator asserting
  properties of the field itself.
- **Over-strong.** The accepted audit places v1.5 / FacilityOS / v1.6 at a **single** rank — an
  equivalence class it declines to order. The dense-unique rule structurally forbade expressing that.
  Four of the fifteen package pairs are genuinely incomparable on module scope, yet the number line
  asserted authority across unrelated modules and legal planes for all fifteen.

`precedence` is **removed**. Authority is a small lattice over classes plus strictest-wins:

```
base                  the preserved v1.2 handoff
controlling           security, privacy, tenant isolation, authority, resilience — never yields
additive-subordinate  additive design; yields to both; MUTUALLY INCOMPARABLE
```

Being installed later confers nothing. Where two additive-subordinate packages overlap on a module
and genuinely disagree, that is a conflict to record in `unresolvedAuthority`, not a tie to break by
version order. Class is anchored to the layer's **root path** in the shared library, so a layer
cannot demote its own authority out of the rules that bind it (F-09).

Repository tooling can answer: which packages apply to module X (a **set**, computed and printed —
11 modules are claimed by more than one package today), which class outranks which, which
module-state gate applies, which Horizon applies, and which authority governs a subject.

## 7. The binding obligation — derived, not enumerated

A layer must carry an `architecture` block when it is `additive-subordinate`, rooted under
`docs/production-handoff/`, and claims no **verified** exemption. There is no package count and no id
list, so a package acquires the obligation by existing.

Three exemptions exist and each is proved against a repository fact, never accepted on the registry's
word:

| Anchor                      | Proof                                                            | True for |
| --------------------------- | ---------------------------------------------------------------- | -------- |
| `base-provenance`           | `handoff-provenance.json.handoffSource` equals this root         | v1.2     |
| `controlling-security`      | the shared library anchors this root as `controlling`            | v1.3.0   |
| `accepted-network-decision` | an **Accepted** `docs/decisions/` record cites this root by path | v1.4.0   |

Measured across all nine layers, no other root scores above zero on the third, and a new package can
satisfy none of the three. Registering a seventh package **unbound fails**; registering it
**correctly passes** — both are tested.

## 8. F-07 — the limitation deliberately left open

Every manifest except v1.2's is **package-local**: it lives inside the package it describes.

**What that proves.** Every listed file is present; its bytes hash to the recorded value (and for
JSON manifests its size matches); and no unlisted file exists inside the package root. Because the
manifest and artifacts are version-controlled together, any change to a listed artifact requires a
corresponding visible change to the manifest in the same commit — an invisible in-place edit becomes
a reviewable two-file diff. That is genuinely worth having: it is what closed the state where 567
files were cited as binding and verified by nothing.

**What it does not prove.** It is **not tamper resistance against a coordinated edit** that updates
both the artifact and the manifest. Nothing outside the package pins the manifest, so such an edit
passes both gates with the artifact count unchanged. This was reproduced.

**No repository-native anchor exists that AWE-0 merely failed to connect to.** This was searched:
`handoff-provenance.json` and `check-handoff-provenance.mjs` anchor **v1.2 only** (`handoffSource` is
hard-coded to that root, and AWE-0 does already cross-check against it); the CI `sha256sum -c` step
runs against v1.2 only and its `SHA256SUMS.txt` is itself package-local; there is no CODEOWNERS, no
branch-protection configuration, no signing or attestation machinery in the repository.

**F-07 remains OPEN.** A real trust root — external provenance, signed artifacts, branch protection,
or a repository policy decision — is a separate architecture decision. Inventing a weak one here
would be worse than naming the limit. A characterisation test asserts the limitation stays recorded.

## 9. Findings and disposition

### Second remediation provenance

The first remediation candidate (`b686b782c3aaf998ab028380fc0ac0112a97ce0d`) was independently
rereviewed and was not accepted. The rereview confirmed six acceptance blockers (`AWE-RR-01` through
`AWE-RR-06`) and three additional defects (`AWE-RR-07` through `AWE-RR-09`). This follow-up
remediation closes those rereview findings without rewriting that preserved candidate.

| #    | Finding                                       | Disposition                                                                                                                            |
| ---- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | obligation pinned to a frozen six-id list     | **Fixed, rereview-hardened** — derived from role + position; accepted-decision exemptions require exact canonical package identity     |
| F-02 | unresolved-authority inventory deletable      | **Fixed, rereview-hardened** — anchored to stable package roots, `declared ⊇ known − resolved`, governed resolution path               |
| F-03 | ADR identifier namespace collision            | **Fixed** — two source-qualified namespaces, Proposed refused, counts declared                                                         |
| F-04 | CI self-check was a substring match           | **Fixed, rereview-hardened** — required gates must be direct, reachable, blocking commands; path filters and self-removal are refused  |
| F-05 | runtime-authority guard partial               | **Rereview-hardened** — whole package tree, all executable extensions, concatenation/join-normalised for reviewed representative forms |
| F-06 | binding form checked, content not             | **Made honest, rereview-hardened** — content pinned by digest and AUTHORITY_MODEL=PASS requires an executable authority-model contract |
| F-07 | no external integrity anchor                  | **OPEN by instruction** — described precisely, not papered over                                                                        |
| F-08 | manifest path traversal                       | **Fixed, rereview-hardened** — manifest identity is canonical package-relative path; aliases cannot count as distinct artifacts        |
| F-09 | controlling layer could self-demote           | **Fixed** — roles anchored to root paths in the shared library                                                                         |
| F-10 | anti-vacuity was one global sum               | **Fixed** — per-layer `expectedArtifacts`; global total kept as a coarse signal                                                        |
| F-11 | ADR-0014 relations overbroad                  | **Fixed** — see §5; three further relations corrected in both directions                                                               |
| F-12 | 607 files claimed                             | **Fixed** — 567 tracked, corrected in all four places                                                                                  |
| F-13 | schema allowed self-declared `implementation` | **Fixed, rereview-hardened** — `implementationAuthority` is `"none"` and unknown architecture authority metadata fails closed          |

**Low severity.** Version matching now requires a whole segment (`v1.7.0` no longer matches
`v1.7.01`); `walk()` uses `lstat`, so a symlink loop fails cleanly instead of throwing ELOOP with no
banner; the dead `contradicts` flag and its no-op `continue` are gone; a duplicate module id is
refused rather than counted twice.

**Tests that mutate real artifacts.** The pre-existing `network-governance.test.ts` cases tamper with
the real v1.4.0 package; that pattern predates AWE-0 on the accepted base and is left as it was. Every
case AWE-0 adds runs against a **disposable fixture package** instead, and the not-Accepted path is
now tested against `ADR-N0015`, which is genuinely Proposed — so no accepted ADR is edited at all.

## 10. Deliberately left unresolved

Twelve items are recorded in the registry with stable ids and cannot be deleted without a governed
resolution: both vocabulary gaps, owner decisions OD-A, OD-E, D-01, D-03, D-10, D-16, and the absent
WorkUnit / graph / agent runtime substrate. Also untouched:

- **Ten network ADRs remain "Proposed" while their content ships in migrations 0028–0035.** Accepting
  an ADR is an owner act. The gate fails closed on Proposed authority so the conflict cannot be
  laundered through registration.
- **ADR-0003's status.** ADR-0015 records that it "supersedes in practice" ADR-0003's single
  `authority_mode` dimension while ADR-0003 still reads `Accepted`. No package claims authority from
  ADR-0003.
- **The five defects inside v1.8.1's own machine-readable artifacts.** Registration verifies a
  package's integrity; it does not repair its contents.
- **F-07**, above.

## 11. What was not done

No workforce or runtime architecture was repaired. The 76-job workforce was not redesigned; AWE-D1
was not started; no Twin Job Book, WorkUnit, durable-graph, agent or Operational Twin runtime was
created; RevenueOS and FMI were not implemented; none of the 37 RevenueOS/FMI candidates was
registered as a production job or promoted to J0; no autonomy ceiling was raised; no market source or
external egress was introduced; no adapter was built; billing was not changed; no disabled module was
activated; no `implementation_allowed` was modified; no accepted handoff package was edited; no
accepted audit finding was altered; and no unaccepted v1.9 material was read or used.

## 12. Files

| File                                           | Change                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `governance-layers.json`                       | `precedence` removed; exemptions, source-qualified relations, stable unresolved ids, per-layer `expectedArtifacts`, mandate, authority model, CI wiring, declared counts |
| `scripts/lib/governance-layers.mjs`            | anchored roles, exemption anchors, unresolved inventory, resolution ledger, reviewed digests, containment, safe walk, two-namespace index, workflow tokenizer            |
| `scripts/lib/network-primitives.mjs`           | `SOURCE_FILE_PATTERN` exported and widened to `.cjs`/`.tsx` — one definition, now three gates                                                                            |
| `scripts/check-network-governance.mjs`         | containment, per-layer completeness, coverage, honest F-07 note                                                                                                          |
| `scripts/check-architecture-governance.mjs`    | derived obligation, source-qualified authority, reviewed digest, structural CI parse, widened runtime scan                                                               |
| `scripts/test/architecture-governance.test.ts` | 50 tests, one per finding, fixtures instead of accepted artifacts                                                                                                        |
| `scripts/test/network-governance.test.ts`      | 25 tests; new cases on a disposable fixture package                                                                                                                      |
| `.github/workflows/ci.yml`                     | blocking step (unchanged since `8528734`)                                                                                                                                |
| `package.json`                                 | `validate:architecture` (unchanged since `8528734`)                                                                                                                      |

Manifest-verified artifacts: **105 → 666**, across 8 layers with per-layer expectations.
