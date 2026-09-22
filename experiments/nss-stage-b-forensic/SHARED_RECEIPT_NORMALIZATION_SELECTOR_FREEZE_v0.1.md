# NSS-1 Stage-B Shared-Receipt Normalization Selector Freeze v0.1

Effective 2026-09-22. Zero-provider-call read-only successor analysis.

For every `(event_id, provider)` pair, select the earliest successful terminal receipt ordered by `started_at`; ties are broken by arm name and then filename. If no successful terminal receipt exists, mark that provider/event observation unavailable. The selector is correctness-blind and was fixed before normalization output was observed.

Reuse the deterministic compiler output bound to the selected receipt. Do not re-infer, relabel, retry uncertain calls, modify the Stage-B corpus/policies/thresholds, or invoke Luna, Jev, OpenRouter, or frontier models.

Controlling predecessor identities:
- corpus: `e715fc2bba0390f230c26cd27667b8d224e9b5edf6daee60e7efa9875a143bcd`
- manifest: `52540690dab33fcc4bf170ccf57cad0b0e72da01dc45a94cdcff3d19ef79eb96`
- policies: `95a34517dd4e0ba879503aed049485df283b3fae9829a2b919356e08ecda28f5`
- Stage-B result: `ef30d31aa3d279613e406a39d574588d04289a3cac1d613cc1ee3d8d8f83f658`
