# ADR-0016 — Infrastructure baseline

**Status:** Accepted (owner ruling, Phase 0)
**Closes:** audit finding G16

## Context

The handoff states the stack twice, with different force and no ADR resolving them:

- `00_MASTER_HANDOFF.md:167-182` — "**Use:**" followed by a concrete list.
- `16_CLAUDE_MASTER_BUILD_PROMPT.md:120-124` — "**Preferred stack** … any material deviation
  requires an ADR."

The eight architecture documents and all thirteen shipped ADRs name only PostgreSQL and
"Temporal **or equivalent**" (`adr/0005:5`, `06_…:87`). No PostgreSQL version, migration tool, ORM,
test runner, CI platform, cloud provider, or API style is fixed anywhere. `16_…:124` requires an
ADR for material deviation, so the baseline needs to be an ADR to be binding at all.

## Decision

The owner has fixed the baseline. It is binding; material deviation requires a superseding ADR.

| Concern | Choice |
|---|---|
| Package manager / build | pnpm workspaces, Turborepo |
| Language | TypeScript, strict mode |
| Backend | Fastify, strict modular monolith (ADR-0001) |
| API | REST with generated OpenAPI contracts |
| Database | **PostgreSQL 16** baseline |
| Data access | Thin typed SQL query layer — no ORM |
| Migrations | Reviewed raw SQL, up and down (ADR-0017) |
| Durable workflows | Temporal TypeScript SDK, local Docker for development |
| Events | CloudEvents-compatible envelopes; transactional outbox |
| Object storage | S3-compatible abstraction, local MinIO |
| CI | GitHub Actions |
| Tests | Vitest; PostgreSQL integration tests; Playwright only once web applications exist |
| Telemetry | OpenTelemetry |
| Models | Internal provider-independent model gateway |
| MCP | Adapter over governed FreightOS capabilities only — never a bypass of policy or billing |

**Resolved ambiguities.** "Temporal or equivalent" is settled as Temporal. PostgreSQL is pinned at
16, which the reference DDL requires anyway: `db/0005:1-2` uses `ALTER TYPE … ADD VALUE IF NOT
EXISTS`, and `db/0001:1` declares `pgcrypto` for `gen_random_uuid()`. "No ORM" follows from
`02_…`'s prohibition on letting a model generate raw production SQL — a thin typed layer over
reviewed SQL keeps the SQL reviewable.

**Explicitly not selected in Phase 0:** production credentials, a production AI provider, and a
final production cloud provider. `MODEL_GATEWAY_ENABLED` defaults to `false`, so a model call
fails closed rather than reaching an unconfigured provider.

**Local development without Docker.** Docker Compose is the documented local path, but sandboxes
and some CI runners cannot run it. `scripts/dev-postgres.sh` brings up an equivalent PostgreSQL 16
cluster from local binaries. Both paths produce the same database, so integration tests are never
blocked on container availability — which matters, because RLS and append-only audit cannot be
evidenced without a live database.

## Consequences

**Good.** The workflow-engine hedge is closed, so Phase 3 has no design fork. Pinning PostgreSQL 16
makes RLS syntax, `FORCE ROW LEVEL SECURITY`, and enum handling deterministic.

**Cost.** Rejecting an ORM means more hand-written SQL and more tests to keep it honest. That is the
intended trade: the Constitution makes the database authoritative, and hidden query generation is
exactly what makes tenant isolation hard to prove.
