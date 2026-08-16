# 50 — Package Release and Integrity Checklist

## Release identity

- Package: `FreightOS_v1.8.1_RevenueOS_Commercial_Capability_Architecture`
- Architecture version: `v1.8.1`
- Status: documentation/contracts/fixtures only
- Runtime activation: none
- Required first executable action after merge: independent cross-package audit

## Required content families

A release is incomplete unless it contains all of the following:

- master handoff and constitution;
- capability/product/Twin/commercial architecture;
- RevenueOS authority, sales, channel, pricing, attribution and commission design;
- Sales Promise Firewall;
- FMI substrate, provenance, signal taxonomy, relevance engine and source strategy;
- 17 RevenueOS provisional Job Books in Markdown and JSON;
- 20 FMI provisional Job Books in Markdown and JSON;
- machine-readable graph registry;
- 8 RevenueOS graphs;
- 10 FMI graphs;
- 6 cross-plane graphs;
- typed artifact registry;
- graph node ownership and edge-handoff matrices;
- schemas for commercial and FMI objects;
- schemas for typed graphs, graph WorkUnits and graph handoffs;
- provisional Job Book descriptor schema;
- REV-01..REV-48 gates;
- FMI-01..FMI-28 gates;
- GR-01..GR-32 gates;
- adversarial/failure/replay guidance;
- cross-package audit specification;
- Claude audit prompt;
- installation/owner runbook;
- end-to-end implementation sequence;
- README, PR body, combined handoff, and manifest.

## Static integrity checks

Before distribution:

1. Every JSON file parses.
2. Every typed graph validates against `schemas/typed-workflow-graph.schema.json`.
3. Every provisional Job Book JSON validates against `schemas/provisional-job-book.schema.json`.
4. Every graph edge references nodes in the same graph.
5. Every graph has at least one entry and terminal state and all non-entry nodes are reachable from an entry path unless explicitly documented otherwise.
6. Every Job Book graph membership resolves to a graph in `graphs/GRAPH_REGISTRY.json`.
7. Every typed graph edge artifact resolves to the typed artifact registry where required.
8. Graph node ownership and edge-handoff matrices correspond to machine-readable graph definitions.
9. `COMBINED_HANDOFF.md` includes all numbered handoff files.
10. `MANIFEST.sha256` validates every distributed package file except the manifest itself.
11. The ZIP is rebuilt only after all checks above pass.

## Audit non-regression checks

Before package acceptance, verify that the handoff does not itself:

- change runtime code;
- change a migration;
- change privileges/RLS;
- activate A3/A4/A5;
- register/enable an audit-candidate job as production;
- mark an audit-candidate graph production-valid;
- connect a market/news source;
- create pricing or commission payout side effects;
- create seller/partner identities;
- change an Operational Twin;
- authorize v1.9.

## Completion condition

A release may be called **package-integrity complete** when all static checks pass and the manifest validates exactly. This does not mean the architecture is repository-implemented or production-certified.

## Twin refinement release checks

- [ ] Files 51–62 present
- [ ] TWIN-G01..TWIN-G12 validate against typed graph schema
- [ ] Twin graph registry/matrices match graph files
- [ ] Twin schemas parse
- [ ] Twin fixtures parse
- [ ] TW-01..TW-40 present
- [ ] Claude audit prompt requires TWIN audit and stops before implementation/v1.9
- [ ] Combined handoff includes 51–62
- [ ] Manifest regenerated after all changes
- [ ] Final ZIP verified from fresh extraction
