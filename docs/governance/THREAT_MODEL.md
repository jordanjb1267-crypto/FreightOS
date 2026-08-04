# Threat Model

Required by `PHASE_0_FOUNDATION.md` and `02_GOVERNANCE_AND_NON_REGRESSION.md:5-17`.

Extends `docs/production-handoff/v1.2/docs/THREAT_MODEL.md`, which is 29 lines of prose. This
records what Phase 0 actually built against, and what remains open.

## Assets

| Asset                           | Why it matters                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant-private operational data | Art. III.1. Isolation is constitutional, not a feature.                                                                                                        |
| **Customer economics**          | Art. III.2 names this specifically: cost profiles, rates and margins must never reach another customer. It is the one data class the Constitution singles out. |
| The audit ledger                | Art. II.1 makes it authoritative. If it can be edited, nothing else can be proven.                                                                             |
| Legal authority context         | Determines whether an action is lawful. Art. I.2 requires it to fail closed.                                                                                   |
| Autonomy ceilings               | An agent operating above its ceiling is the failure mode the whole sequencing doctrine exists to prevent.                                                      |
| Credentials                     | Art. VIII, `02_GOVERNANCE`: never in source, prompts, logs, fixtures, or agent memory.                                                                         |
| Physical-control authority      | Art. IX. FreightOS must never possess it, under any configuration.                                                                                             |

## Trust boundaries

```
human / API caller
   ↓  authentication, tenant + legal context established
application (role: freightos_app, RLS-subject)
   ↓  policy, approval, autonomy ceiling
domain command handlers
   ↓  transaction + outbox
PostgreSQL (RLS enforced, audit append-only)
   ↓
external systems ── none configured in Phase 0
```

The control plane (`freightos_control_plane`) sits deliberately outside tenant isolation and is
the only role that crosses it.

## Threats and Phase 0 disposition

| #    | Threat                                                                  | Disposition                                                                                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-01 | Cross-tenant read or write                                              | **Mitigated.** RLS with `FORCE`, `USING` **and** `WITH CHECK`, fail-closed on missing context. Proven by negative tests running as a non-superuser — a superuser bypasses RLS entirely, so a test that connects as `postgres` proves nothing.                                                                |
| T-02 | Session context leaking between pooled connections                      | **Mitigated.** Context is transaction-scoped (`SET LOCAL` via `set_config(..., true)`). Tested: after a transaction, and after a failed transaction, context reads back as null.                                                                                                                             |
| T-03 | A tenant escalating to control-plane authority                          | **Mitigated.** The policy branch checks _role membership_, not a session variable. A test sets `app.is_control_plane = true` and confirms it changes nothing.                                                                                                                                                |
| T-04 | Audit tampering                                                         | **Mitigated.** Triggers reject UPDATE, DELETE **and TRUNCATE** — a row-level trigger alone leaves TRUNCATE open — plus revoked privileges. Tested against the application role and the table owner.                                                                                                          |
| T-05 | An agent exceeding its autonomy ceiling                                 | **Mitigated.** Ceilings computed, never read from configuration. Proven over the full cross-product of declared level × module state × horizon.                                                                                                                                                              |
| T-06 | An agent promoting itself                                               | **Mitigated.** Art. X.6. No self-promotion capability is grantable; the kill-switch table rejects an agent as the engaging authority outright.                                                                                                                                                               |
| T-07 | Brokerage acting without its legal gate                                 | **Mitigated.** Fail-closed in three independent places: the legal-context validator, a database CHECK, and a mandatory-false flag. `carrier_agent` + `brokerage` is unrepresentable.                                                                                                                         |
| T-08 | Physical-control surface entering the codebase                          | **Mitigated.** CI scans all application source for twelve forbidden control verbs.                                                                                                                                                                                                                           |
| T-09 | Overbuilding past the authorized horizon                                | **Mitigated.** `validate-scope.mjs`, with six negative tests proving it fails when it should.                                                                                                                                                                                                                |
| T-10 | Silent divergence between the handoff and its operational copies        | **Mitigated.** Provenance check fails on drift in either direction; overrides must cite an ADR.                                                                                                                                                                                                              |
| T-11 | Event published for a change that rolled back                           | **Mitigated.** Transactional outbox, tested.                                                                                                                                                                                                                                                                 |
| T-12 | Duplicate external effect on redelivery                                 | **Partially mitigated.** `outbox_events.event_id` is UNIQUE. Full idempotency across command handlers is Phase 3.                                                                                                                                                                                            |
| T-13 | Credential leakage                                                      | **Mitigated.** `.env` gitignored, only `.env.example` committed with development values, secret scan in CI, no production provider selected.                                                                                                                                                                 |
| T-14 | Migration applied then silently edited                                  | **Mitigated.** Checksums verified on every run; a mismatch fails loudly.                                                                                                                                                                                                                                     |
| T-15 | **Kill switch recorded but not enforced**                               | **OPEN.** Phase 0 delivers the record, semantics and precedence. No command handler consults it, because no consequential command exists before Phase 3. Engaging a switch today is queryable but does not halt work. **Wiring this into the command path is a Phase 3 precondition of the Horizon 1 gate.** |
| T-16 | Model output treated as authority for money, permission or legal status | **Not applicable yet.** No model is configured; `MODEL_GATEWAY_ENABLED=false` fails closed. Art. IV.5 must be enforced when the gateway is built in Phase 2.                                                                                                                                                 |
| T-17 | Policy bypass                                                           | **OPEN.** No policy engine exists. `base_policy.yaml` supplies vocabularies, not rules. Phase 2.                                                                                                                                                                                                             |
| T-18 | Prompt injection through ingested documents or email                    | **OPEN.** No ingestion exists. Phase 2, and it must be modelled before ingestion is built, not after.                                                                                                                                                                                                        |

## Residual risk

The three open items above (T-15, T-17, T-18) are the honest state of Phase 0. Each is scoped to a
later phase, and none can be closed by Phase 0 work because the surface they protect does not
exist yet. They are tracked in `RISK_REGISTER.md` and must be re-reviewed at every phase exit gate.
