# 57 — Twin Interaction Typed Graph Catalog

All graphs below are `AUDIT_CANDIDATE`. Claude must reconcile them against existing v1.5–v1.8 WorkUnit/workflow infrastructure and merge duplicates rather than creating a second runtime.

| ID | Purpose | Core boundary |
|---|---|---|
| TWIN-G01 | system discovery and binding | no integration becomes authoritative without approved binding |
| TWIN-G02 | inbound external-system synchronization | map/dedupe/order/conflict before Twin projection |
| TWIN-G03 | human-led WorkUnit with agent assistance | assistance cannot silently become action |
| TWIN-G04 | collaborative draft/review/approval | exact-version approval before controlled execution |
| TWIN-G05 | authorized external-system writeback | idempotent command + reconcile-before-retry |
| TWIN-G06 | Twin learning/configuration change | observed behavior becomes proposal, never hidden rule |
| TWIN-G07 | inbound network communication | sender authority never transfers to receiver |
| TWIN-G08 | outbound network projection | minimum-necessary purpose-limited disclosure |
| TWIN-G09 | cross-party request/response coordination | each participant independently decides/executes |
| TWIN-G10 | fact conflict and reconciliation | conflicts visible; no accidental last-writer-wins |
| TWIN-G11 | integration degraded/disconnected recovery | stale status explicit; recovery reconciles |
| TWIN-G12 | workflow experience-mode/autonomy change | mode change cannot raise effective authority by itself |

Machine-readable definitions live under `graphs/twin/`.
