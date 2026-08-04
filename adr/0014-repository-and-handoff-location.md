# ADR-0014 — Repository name and handoff location

**Status:** Accepted (owner ruling, Phase 0)
**Closes:** audit findings C1, C2, C3

## Context

Three instructions in the handoff describe a repository layout that differs from the installed one:

| Instruction | Source | Installed reality |
|---|---|---|
| "Use a new `rig-freightos` repository." | `16_…:95`, `17_…:5-9` | `jordanjb1267-crypto/FreightOS` |
| "Place the preserved package under `docs/handoff/v1.2/`." | `17_…:18`, `17_…:67` | `docs/production-handoff/v1.2/` |
| "Copy implementation inputs … to the repository root as well." | `17_…:21` | Not done at install time |

The first two are naming, not architecture. The intent behind the repository rule — a repository
separate from RIGDESK and RigReceipts, per `17_…:11` — is satisfied. The third is a real gap.

## Decision

1. **Keep `jordanjb1267-crypto/FreightOS`.** Do not rename. Recorded as an accepted deviation from
   the `rig-freightos` reference.
2. **Keep `docs/production-handoff/v1.2/`.** Do not relocate. Recorded as an accepted deviation from
   the `docs/handoff/v1.2/` reference. This path is the binding handoff location for all
   downstream tooling.
3. **The preserved package is immutable.** It is modified only through a separately reviewed
   handoff-version change. Operational implementations and clarifications belong in root
   specifications, ADRs, implementation packages, tests, and governance records — never by editing
   the handoff.
4. **Generated operational copies at the root, no symlinks:** `config/`, `schemas/`,
   `db/reference/`, `checklists/`, `adr/`, `scripts/`.
5. **Provenance and drift detection.** `handoff-provenance.json` records, for every generated file,
   its handoff source and that source's SHA256. `scripts/check-handoff-provenance.mjs` runs in CI
   and fails on: the handoff source changing, a copy diverging from its source, an authorised
   override changing without review, or a file going missing. Intentional divergence is expressed
   as a declared `override` naming the ADR that authorises it — currently two, both from ADR-0015
   and ADR-0018.

Copies rather than symlinks means the two can diverge; the provenance check is what makes that
divergence loud instead of silent. A symlink would have made drift impossible but would also have
made the authorised corrections impossible, and those corrections are required to close G4, G5,
and G6.

## Consequences

**Good.** Tooling gets root-relative paths without weakening the immutability of the binding
source. Every deviation from the handoff is enumerated in one machine-checked file.

**Cost.** Forty-five files exist twice in the repository. `pnpm sync:handoff` regenerates the copies
and is the only sanctioned way to update them.
