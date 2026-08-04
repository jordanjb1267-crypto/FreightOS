# Provenance

Generated from **FreightOS Production Handoff v1.2**
(`docs/production-handoff/v1.2/`), which is immutable and byte-pinned by `SHA256SUMS.txt`.

Do not hand-edit files in this directory. Run `pnpm sync:handoff` to regenerate, then review the
diff. `pnpm validate:provenance` runs in CI and fails on any unreviewed drift — in either
direction, and including changes to an authorised override.

Intentional divergence is expressed as a declared `override` in `handoff-provenance.json` naming
the ADR that authorises it. There is no other sanctioned way to differ from the handoff.

Contains the operational copy of `validate_handoff.py` PLUS scripts authored in Phase 0.

**Do not run the copy of `validate_handoff.py` in this directory.** It resolves its inputs relative to its own location (`ROOT = Path(__file__).resolve().parents[1]`), so from here it looks for `18_SOURCE_REGISTER.md` and the rest at the repository root and fails. `pnpm validate:handoff` and CI both invoke the original at `docs/production-handoff/v1.2/scripts/validate_handoff.py`. The copy exists because owner ruling 2 requires `scripts/` to be mirrored, and because the provenance check needs something to compare against.
