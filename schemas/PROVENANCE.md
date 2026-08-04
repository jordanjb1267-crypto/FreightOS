# Provenance

Generated from **FreightOS Production Handoff v1.2**
(`docs/production-handoff/v1.2/`), which is immutable and byte-pinned by `SHA256SUMS.txt`.

Do not hand-edit files in this directory. Run `pnpm sync:handoff` to regenerate, then review the
diff. `pnpm validate:provenance` runs in CI and fails on any unreviewed drift — in either
direction, and including changes to an authorised override.

Intentional divergence is expressed as a declared `override` in `handoff-provenance.json` naming
the ADR that authorises it. There is no other sanctioned way to differ from the handoff.

Operational copy of the handoff `schemas/` tree. `event-envelope.schema.json` and `agent-manifest.schema.json` are AUTHORISED OVERRIDES (ADR-0015, ADR-0018) and deliberately differ from the handoff.
