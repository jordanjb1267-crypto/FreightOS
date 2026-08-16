# AWE-0 — Architecture governance wiring

**Status:** remediation record. Docs, registry and CI only.
**Base:** `main` @ `5da675aea28a0a39d198266352c4e5bc84774754`.
**Branch:** `remediation/awe-0-governance-wiring`.
**Closes:** `W01-F-GOV-01` (`docs/workforce-engineering/PROPOSED_ADDITIVE_PR_SEQUENCE.md` card AWE-0)
and the root defect in `docs/agentic-architecture-review/01_PACKAGE_INVENTORY_AND_PRECEDENCE.md`
§3.1–§3.2.

> Registration binds a package to authority. It never confers any.

---

## 1. The root cause, reproduced

Both accepted audits name the same defect: accepted architecture packages can be substantive and
internally coherent while being bound to the repository's controlling authority by nothing. The
audits were not taken on trust. Every count below was recomputed on this branch's base commit.

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

Two findings go beyond what the audits recorded, and both strengthen the case:

1. **The gap is wider than ADRs.** The packages do not merely fail to cite ADRs — they name almost
   no module id from the scope registry and no Horizon. There is nothing in their prose for a
   validator to bind _to_. Any mechanism that tried to derive the binding by scanning package text
   would have had nothing to read.
2. **The binding cannot live inside the packages.** ADR-0014 and SR ruling 2 make an installed
   package immutable, and both audits verified all six byte-exact against their manifests. Adding a
   citation to a package document would break that package's own manifest. The relation therefore
   has to be recorded outside the packages and enforced against them.

`governance-layers.json` declared three layers and `scripts/check-network-governance.mjs` verified
105 artifacts. Six accepted packages — 607 files — sat outside both.

The mechanical reason the five post-v1.4.0 packages escaped is narrower than "nobody added them":
they ship `MANIFEST.json`, and the validator parsed only `sha256sum` lines. Declaring them without
teaching it the second format would have produced a passing gate that verified nothing.

## 2. Mechanism chosen

One registry, extended. Two gates, each with one question.

```
governance-layers.json                     the single hand-maintained registry (extended)
  └── scripts/lib/governance-layers.mjs    shared loader + both manifest parsers
       ├── check-network-governance.mjs    INTEGRITY  — does each layer match its manifest?
       └── check-architecture-governance.mjs  BINDING — is each package bound to ADR, module
                                                        state and Horizon authority?
```

No second registry was created. `governance-layers.json` already exists for exactly this act — its
own `$comment` records why it is deliberately separate from `handoff-provenance.json`, which
`pnpm sync:handoff` regenerates wholesale and would silently drop any layer declaration added
there. The split into two gates follows the repository's own precedent: `check-network-egress.mjs`
and `check-egress-allowlist.mjs` read one inventory through one shared library and differ only in
policy.

## 3. Package identity

Each governed package carries a deterministic identity in the registry:

| Field              | Meaning                                                   | Enforced by                                       |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------- |
| `id`               | canonical lower-kebab identifier, unique                  | pattern + duplicate check                         |
| `version`          | `vMAJOR.MINOR[.PATCH]`, must appear in the directory name | pattern + path/version cross-check                |
| `root`             | repo path under `docs/production-handoff/`, unique        | existence + duplicate-path check                  |
| `role`             | `base` \| `controlling` \| `additive-subordinate`         | enum                                              |
| `precedence`       | unique, dense `1..N`                                      | uniqueness + density + subordination rule         |
| `integrityFile`    | the manifest filename                                     | existence                                         |
| `integrityFormat`  | `sha256sums` \| `manifest-json`                           | enum; an unknown format fails closed, never skips |
| `governanceStatus` | `accepted`                                                | equality                                          |
| `authorizes`       | `design-only` \| `implementation`                         | enum + the module and Horizon rules below         |

Nothing already authoritative elsewhere is duplicated. Module states, Horizon authorization and ADR
status are **read** from `config/scope/module_states.yaml` and `adr/`, never restated. The one
genuinely new datum is `moduleScope`: the packages name no module ids, so the mapping is a reviewed
governance act recorded here, with its basis in each layer's `note`.

The six governed ids are also named as constants in `scripts/lib/governance-layers.mjs`, so deleting
an entry to make the gate pass fails the gate instead — the anti-vacuity device
`check-network-governance.mjs` already used for its three founding layers.

## 4. ADR traceability

Three relations, and one deliberate non-relation.

| Relation           | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `governed-by`      | the ADR rules the matter; where they differ, the ADR wins             |
| `constrained-by`   | the ADR bounds the package without deciding its content               |
| `additive-beneath` | the package adds detail under the ADR and does not touch its decision |

**`unresolved` is not a relation.** An architecture claim with no accepted ADR behind it goes in a
separate `unresolvedAuthority` array, and the validator rejects any entry there that carries an
`adr` field. This is the rule that keeps registration honest: a package proposal unsupported by
accepted authority stays visibly unresolved instead of becoming authoritative by being registered.

26 relations are declared across the six packages. Every one must name an ADR that exists in `adr/`,
whose status parses, and which reads `Accepted`; every one must carry an evidence string. No ADR
authority was invented — each relation cites either the ADR's own decision text or the accepted
audit finding that established it (for example ADR-0015 governing v1.7's plane model, and ADR-0025
governing FacilityOS detention, both recorded in
`docs/agentic-architecture-review/01_PACKAGE_INVENTORY_AND_PRECEDENCE.md` §3.2 and §4).

12 unresolved items are recorded. They are listed in §10.

`adr/` uses two header shapes — `**Status:**` for 0001–0010 and 0014–0027, `## Status` for
0011–0013. Both are parsed. Reading only the first would have treated three accepted ADRs as
statusless; reading neither would have let any string through.

## 5. Governance-layer registration

The six packages join as `additive-subordinate` at precedence 4–9, behind the base handoff (1), the
controlling security layer (2) and network architecture (3). The role is not assigned by preference
— every one of the six self-declares it:

| Package    | Self-declaration                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| v1.5.0     | "additive to all existing FreightOS production handoffs … does not replace or weaken any existing requirement"           |
| FacilityOS | "does not override the existing FreightOS sequencing doctrine … remains promotion/customer-gated"                        |
| v1.6.0     | "brokerage execution remains legal/promotion-gated … does not authorize … unlicensed brokerage"                          |
| v1.7.0     | "Existing Constitution, security/resilience, legal/safety gates, sequencing doctrine and signed ADRs remain controlling" |
| v1.8.0     | "the runtime must not create an agent solely because this package names one"                                             |
| v1.8.1     | "additive design / governance handoff only", under "Existing controls remain controlling"                                |

v1.3.0's `controlling` role, v1.4.0's semantics and the `subordination` clause are unchanged. The
three founding layers gained `precedence` and `integrityFormat` and nothing else; they carry no
`architecture` block, and the validator fails if one is added — reclassifying the controlling
security layer as an architecture package is how the stricter rules would otherwise be dodged.

Coverage is enforced in both directions. Any directory under `docs/production-handoff/` that holds
at least one file and is declared in no layer fails the gate. An empty directory is not a package:
Git cannot track one, so it can only be a local working-tree residue — both accepted audits record
exactly such a residue — and failing on it would fail CI for a condition CI can never observe. The
moment a file lands in one, it becomes a package and must be declared.

## 6. Module-state binding

`config/scope/module_states.yaml` remains the sole authority. The validator reads it and computes
implementability from the registry's own `states` table rather than restating the answer:
`implementation_allowed: false` closes the door, and so does `production_code_allowed: false`.

The rule:

> A package whose `moduleScope` includes any module that forbids implementation, or any module above
> `horizon_authorized`, may not declare `authorizes: "implementation"`.

All six are `design-only` today and all six scope at least one gated module, so the rule is
satisfied and would fail closed on the first attempt to change that. 51 module bindings are
verified; every id must resolve in the scope registry.

**No module state was modified.** Changing `implementation_allowed` to satisfy an architecture
document is precisely the inversion this gate exists to prevent.

## 7. Horizon binding

`horizon_authorized: 1`. Every governed package declares a `maxHorizon`, checked two ways:

- it may not be **lower** than the highest horizon its `moduleScope` reaches — otherwise a package
  could design for a Horizon 4 module while declaring Horizon 1, and every other check would agree;
- if it is **above** `horizon_authorized` it must be `design-only`.

v1.8.1 reaches Horizon 4 (`freight_exchange`, `LIQUIDITY_GATED`), the furthest out any accepted
package designs for. Later-horizon architecture may exist as design; it is not current
implementation authority.

## 8. Precedence

`precedence` orders the layers, lowest first, and is unique and dense. It is a tie-break between two
texts that both apply — not a licence. Two rules keep it that way:

1. An `additive-subordinate` layer may never carry a precedence at or below a `base` or
   `controlling` layer.
2. Regardless of precedence, the stricter accepted restriction wins. Security, tenant isolation,
   authority, privacy, legal, resilience and certification constraints remain fail-closed. This is
   the existing `subordination` clause, unchanged.

`architectureGovernance.authorityAboveArchitecture` records what sits above every architecture layer
and is enforced in code rather than by ordering: `adr/`, `docs/decisions/`, and
`config/scope/module_states.yaml`.

Repository tooling can now answer, from the registry alone: which ADR governs, which package applies
to a module, which module-state gate applies, which Horizon applies, and which rule is stricter.

## 9. The separation that matters

```
ARCHITECTURE EXISTS          files on disk
ARCHITECTURE IS ACCEPTED     declared here, manifest verifies          ← this is all AWE-0 certifies
IMPLEMENTATION IS AUTHORIZED config/scope/module_states.yaml
CAPABILITY IS IMPLEMENTED    code, migrations, tests
CAPABILITY IS CERTIFIED/LIVE acceptance gate signed, module activated
```

A documentation package must never make a runtime gate pass because it was registered. That would be
worthless as a promise, so it is structural: the validator scans every file under `packages/*/src/`
and fails if any of them references `governance-layers.json`. 33 runtime source files are scanned;
zero read the registry, and none may start.

## 10. Deliberately left unresolved

AWE-0 closes the wiring defect and nothing else. These are recorded in the registry so they stay
visible, and are **not** closed here:

| Topic                                                                    | Where it belongs            |
| ------------------------------------------------------------------------ | --------------------------- |
| canonical action / command vocabulary (two disjoint vocabularies)        | AWE-2                       |
| canonical artifact vocabulary (v1.7 vs v1.8)                             | AWE-1 / AWE-2               |
| canonical workforce roster of record                                     | owner decision OD-A         |
| approving authority for a job certification                              | owner decision OD-E         |
| WorkUnit / graph / agent runtime, entitlement, adapter, egress substrate | not commissioned by any ADR |
| first governed egress channel                                            | owner decision D-03         |
| lifting `billing_enabled` / `customer_sale_allowed`                      | owner decision D-16         |
| 37 provisional job books and 36 typed durable graphs                     | owner decisions D-01, D-10  |

Three further downstream findings are untouched and remain open exactly as the audits recorded them:

- **Ten network ADRs in `docs/decisions/` remain "Proposed" while their content ships in migrations
  0028–0035.** Accepting an ADR is an owner act. The validator's response is to fail closed — only
  an `Accepted` ADR may govern or constrain a package — so the conflict cannot be laundered through
  registration.
- **ADR-0003's status.** ADR-0015 records that it "supersedes in practice" ADR-0003's single
  `authority_mode` dimension, while ADR-0003 still reads `Accepted`. No package here claims
  authority from ADR-0003.
- **The five defects inside v1.8.1's own machine-readable artifacts** (undefined `HOLD`, 192 failure
  paths to an undefined state, zero kill-switch references, non-idempotent side-effecting nodes,
  55 node owners with no Job Book). Registration verifies the package's integrity; it does not
  repair its contents.

## 11. What was not done

No workforce or runtime architecture was repaired. Specifically: the 76-job workforce was not
redesigned; AWE-D1 was not started; no Twin Job Book, WorkUnit, durable-graph, agent or Operational
Twin runtime was created; RevenueOS and FMI were not implemented; none of the 37 RevenueOS/FMI
candidates was registered as a production job or promoted to J0; no autonomy ceiling was raised; no
market source or external egress was introduced; no adapter was built; billing was not changed; no
disabled module was activated; no `implementation_allowed` was modified; no accepted handoff package
was edited; no accepted audit finding was altered; and no unaccepted v1.9 material was read or used.

## 12. Files

| File                                                      | Change                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `governance-layers.json`                                  | +6 layers, `architectureGovernance` policy block, `precedence` and `integrityFormat` on all 9  |
| `scripts/lib/governance-layers.mjs`                       | new — shared loader and both manifest parsers                                                  |
| `scripts/check-network-governance.mjs`                    | reads the shared lib; parses JSON manifests; verifies `bytes`; required-layer set widened to 9 |
| `scripts/check-architecture-governance.mjs`               | new — the binding gate                                                                         |
| `scripts/test/architecture-governance.test.ts`            | new — 24 tests, one per failure mode                                                           |
| `scripts/test/network-governance.test.ts`                 | +6 JSON-manifest tamper tests; anti-vacuity floor 100 → 650                                    |
| `.github/workflows/ci.yml`                                | new blocking step; existing step renamed to its true scope                                     |
| `package.json`                                            | `validate:architecture`, wired into `validate`                                                 |
| `docs/governance/AWE_0_ARCHITECTURE_GOVERNANCE_WIRING.md` | this record                                                                                    |

Manifest-verified artifacts: **105 → 666**.

## 13. Adversarial tests

Each of the ten failure modes has at least one test, and each pins the specific failure message
rather than "the validator exited non-zero" — a gate that fails generically on every mutation proves
only that it dislikes change.

| #   | Failure mode                                               | Test                                                                                                        |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | accepted package missing registration                      | drop v1.8.0 → `unregistered governance package`                                                             |
| 2   | duplicate package identity                                 | duplicate id → `duplicate package identity`; duplicate root → `duplicate package path`                      |
| 3   | nonexistent / unaccepted ADR                               | `ADR-9999` → `no such decision record`; ADR-0011 → `not Accepted`                                           |
| 4   | malformed ADR relation                                     | unknown relation, empty evidence, `adr` on an unresolved item, package bound to nothing                     |
| 5   | package path / version / status drift                      | `v9.9.9`, missing root, `governanceStatus: proposed`, unknown manifest format                               |
| 6   | package integrity / tampering                              | edit, delete, unlisted extra, edited `bytes`, unparseable JSON manifest                                     |
| 7   | executable capability in an implementation-disabled module | `authorizes: implementation` on `digital_brokerage` → `forbids implementation`                              |
| 8   | architecture exceeding the authorized Horizon              | v1.8.1 → `above horizon_authorized=1`; under-declared `maxHorizon`                                          |
| 9   | ambiguous precedence                                       | duplicate rank; subordinate above the controlling layer                                                     |
| 10  | documentation registration read as runtime authority       | planted `packages/context/src/` reader → `would then make a runtime gate pass`; founding layer reclassified |

Every mutation is restored in `afterEach`, so a failing assertion cannot leave a modified registry,
ADR or planted source file behind. The unit project runs in a single fork, so no concurrent reader
can land inside a mutation window.

**Validator mutation proof.** Two rules were individually disabled in
`check-architecture-governance.mjs` and the suite re-run. Neutralising the module-state
contradiction rule failed exactly one test; neutralising the runtime-authority rule failed exactly
one, and a different one. The validator was restored byte-identical after each. The tests detect the
specific rule, not change in general.
