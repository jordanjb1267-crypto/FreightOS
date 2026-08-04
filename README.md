# RIG FreightOS

A governed freight operating system. **Currently authorized scope: Horizon 1, Phase 0 complete.**

The binding source of truth is the preserved **FreightOS Production Handoff v1.2** at
[`docs/production-handoff/v1.2/`](docs/production-handoff/v1.2/). It is immutable and byte-pinned
by `SHA256SUMS.txt`. Read `01_CONSTITUTION.md`, `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md`, and
`config/scope/module_states.yaml` before changing anything.

## Scope

`config/scope/module_states.yaml` is the machine-readable authority:
`horizon_authorized: 1`, `stop_after_horizon: 1`.

Horizon 1 is **Phases 0–3 only**. Prompts numbered Phase 4 and later are preserved planning
artifacts and are closed. Advancing requires an owner-approved promotion ADR, updated module
states, predecessor exit evidence, the applicable gate, and a reviewed PR — a chat instruction, a
feature flag, or a passing simulation is not authorization.

| Phase | Scope                                                                    | Status       |
| ----- | ------------------------------------------------------------------------ | ------------ |
| 0     | Repository, governance, CI, schemas, scope control, platform tables      | **Complete** |
| 1     | Universal core, road FTL carrier foundation, minimum facility primitives | Not started  |
| 2     | AI Dispatch Copilot                                                      | Not started  |
| 3     | Selected A3 approval-to-execute, production hardening                    | Not started  |

## Getting started

Requires Node 22+, pnpm 10+, and PostgreSQL 16.

```bash
pnpm install
cp .env.example .env          # development values only; .env is gitignored

docker compose up -d postgres # or, where Docker is unavailable:
./scripts/dev-postgres.sh start

pnpm verify                   # format, lint, typecheck, tests, all validators
```

## Layout

```
docs/production-handoff/v1.2/   binding handoff — immutable
docs/decisions/                 decision log
docs/governance/                risk register, data classification, registries, threat model
docs/runbooks/                  operational runbooks (1 of 24 written — see the README there)

adr/                            ADRs 0001-0013 from the handoff, 0014-0018 from Phase 0
config/ schemas/ checklists/    generated operational copies + Phase 0 additions
db/reference/                   handoff DDL — reference only, never executed (ADR-0017)
scripts/                        validators, sync, local PostgreSQL

packages/config                 env validation, scope registry, autonomy ceilings
packages/schemas                JSON Schema validators
packages/context                legal authority, operating context, kill switches
packages/database               migrations, migration runner, RLS session helpers
```

`config/`, `schemas/`, `checklists/`, `adr/`, `scripts/` and `db/reference/` are **generated** from
the handoff. Do not hand-edit them: run `pnpm sync:handoff`, review the diff, and commit.
`pnpm validate:provenance` fails CI on any unreviewed drift. Three files are declared overrides
authorized by ADR-0015 and ADR-0018; see `handoff-provenance.json`.

## Commands

| Command                                              | What it does                                             |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `pnpm verify`                                        | Everything below, in order. Use this before pushing.     |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check` | Static checks                                            |
| `pnpm test`                                          | Unit tests — no external dependency                      |
| `pnpm test:integration`                              | Integration tests — requires PostgreSQL 16               |
| `pnpm validate:handoff`                              | Handoff package integrity                                |
| `pnpm validate:provenance`                           | Drift between the handoff and its operational copies     |
| `pnpm validate:scope`                                | Anti-overbuilding, autonomy ceilings, mandatory defaults |
| `pnpm db:up` · `pnpm db:down` · `pnpm db:status`     | Migrations                                               |

## Non-negotiables

These are constitutional, not stylistic. CI enforces each one.

- **Tenant isolation** is enforced by RLS with `FORCE`, and fails closed when context is missing.
- **Audit is append-only** — UPDATE, DELETE and TRUNCATE are all rejected.
- **Autonomy ceilings are computed, never configured.** No registry value, default, or merge can
  raise one. Horizon 1 caps every carrier agent at A3.
- **Brokerage is disabled** until `checklists/BROKERAGE_LEGAL_GATE.md` is signed.
- **No physical-control authority**, ever. No steering, braking, robotics, PLC, conveyor, dock
  restraint, door, or safety-interlock command may exist in this codebase.
- **No production credential** in source, prompts, logs, fixtures, or agent memory.
- **No acceptance claim without evidence.** "Should work" and "tests passed" without output are
  rejected.
