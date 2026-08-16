# FMI Architecture & Source Gap Map

Tests **H10** (RevenueOS owns the customer-facing intelligence function while a shared substrate
supplies provenance-bearing signals without transferring authority) and **H12** (source rights,
provenance, freshness, confidence, correction lineage and forecast uncertainty are first-class
contracts, not hidden in prompts or vendor adapters).

## 1. Verdict

**H10 holds — the two-plane split is real and correctly drawn.** **H12 holds in design and is
entirely unbuilt**; every contract it names exists as a JSON Schema with no runtime, no registry
table, and no source.

## 2. The two-plane split (H10)

The package separates the shared substrate from the commercial product at the graph level, not
merely in prose:

| Plane           | Graphs                | Meaning                                                                  |
| --------------- | --------------------- | ------------------------------------------------------------------------ |
| `shared_fmi`    | FMI-G01–G05, G08, G10 | ingestion, lane/rate/capacity, regime, forecast, maintenance, correction |
| `revenueos_fmi` | FMI-G06, G07, G09     | customer relevance, briefing/alerting, regulatory — the _sold_ surface   |

`Commercial Compliance Guard` (a RevenueOS Job Book) owns nodes only in FMI-G06/G07 — i.e. on the
`revenueos_fmi` plane. A commercial guard therefore governs the customer-facing brief without
reaching into shared ingestion. **This is the correct construction and it is implemented in the
artifacts, not just asserted.**

Corroborating: `matrices/MARKET_INTELLIGENCE_WORKFORCE_MATRIX.csv` sets, for all 20 components:

- `may_execute_logistics_command: false` (20/20)
- `requires_source_rights: true` (20/20)
- `requires_job_certification: true` (20/20)

## 3. Zero ingestion is possible today — and that is load-bearing

`config/network/egress-allowlist.json`: `expectedCount: 0`, `modules: []`. Two CI gates
(`check-network-egress.mjs`, `check-egress-allowlist.mjs`) fail the build on any outbound primitive,
including `undici`, `axios`, `got`, `node:http`, and — relevant here — broker/queue clients and
PostgreSQL `dblink` / `postgres_fdw` / `COPY … FROM PROGRAM`.

**No market data, news, rate, or fuel source can be reached.** Every FMI ingestion gate is therefore
_vacuously safe_, not enforced. The matrix preserves this distinction: FMI-02 (rights before
ingestion) is NOT_IMPLEMENTED, not PASS.

## 4. The H12 contracts — design present, runtime absent

| Contract                         | Package artifact                                               | Runtime  |
| -------------------------------- | -------------------------------------------------------------- | -------- |
| Source registry & classification | `matrices/MARKET_SOURCE_CLASSIFICATION_MATRIX.csv` (8 classes) | **none** |
| Signal shape                     | `schemas/market-signal.schema.json`                            | **none** |
| Forecast + uncertainty           | `schemas/market-forecast-envelope.schema.json`                 | **none** |
| Customer brief                   | `schemas/market-intelligence-brief.schema.json`                | **none** |
| Customer relevance profile       | `schemas/customer-market-relevance-profile.schema.json`        | **none** |
| Raw/derived/forecast separation  | FMI-G01→G03→G05 state progression                              | **none** |
| Correction lineage               | FMI-G10 (`MarketCorrectionWorkUnit`)                           | **none** |

The 8 source classes are well drawn — `official_public`, `industry_public`,
`licensed_market_data`, `licensed_news` and four others, each with a stated
`production_requirement` such as _"executed license + API/derived/display rights"_. This is the
right shape for H12.

## 5. Gaps

### FA-01 — No source registry exists, so rights cannot gate anything

`MARKET_SOURCE_CLASSIFICATION_MATRIX.csv` classifies source _classes_, not sources. There is no
registry of actual sources, no license record, no rights field, and no table. FMI-01, FMI-02,
FMI-12 score NOT_IMPLEMENTED. **Do not ingest anything before this exists** — the package agrees
(`source_registry_steward` is `human_supervised_deterministic` with `propose_source_status_change`,
a propose-only command, which is correct).

### FA-02 — Two FMI components own no graph node

`Ocean & Port Intelligence Agent` and `Rail & Intermodal Intelligence Agent` both declare
`graph_membership: ["FMI-G04"]` in their Job Books, but neither appears as an owner of any node in
FMI-G04 or anywhere else. They are **orphan jobs with no accountable state** — the same defect the
accepted W0/W1 audit recorded for v1.8 (_"41 orphan jobs in the design graph"_). Recorded as
conflict **C-09**.

### FA-03 — Plane inconsistency for the highest-risk component

`Freight News Intelligence Agent` is `revenueos_fmi` in `MARKET_INTELLIGENCE_WORKFORCE_MATRIX.csv`
but owns nodes only in FMI-G02, which is `plane: shared_fmi`. The distinction is not cosmetic: a
news agent on the **shared** plane feeds every participant domain; on the **revenueos_fmi** plane it
feeds customer briefs only. News is also the primary prompt-injection surface (FMI-13). The blast
radius of a poisoned article differs by plane, and the package states both. **Required change:**
resolve to one plane and make the matrix generated from the graphs rather than maintained beside
them.

### FA-04 — Ingestion is not idempotent in the design

FMI-G01 `F3_INGEST` carries `side_effect_class: external_read` with `retry_policy: bounded_retry` —
not `idempotent_retry`. FMI-07 requires duplicate ingestion to be idempotent. A retried fetch that
re-appends an observation corrupts every derived indicator downstream. **Required change:**
`idempotent_retry` with a declared ingestion key.

### FA-05 — Safe-fail states for source outage exist as labels with no owner

FMI graphs declare terminal states `STALE`, `SOURCE_SUSPENDED`, `THIN_MARKET`, `UNVERIFIED`,
`DISPUTED`, `NOT_COMPUTABLE`, `NO_RELEVANCE` — **none of which is defined as a node**. FMI-09
(source outage fails safely) and FMI-14 (rumor labeling) therefore have a named destination and no
component accountable for putting a signal there or taking it out. See
GRAPH_NODE_OWNERSHIP_AUDIT GN-02.

### FA-06 — `HOLD` is the failure sink for the entire FMI plane

All 10 FMI graphs route node failure to `HOLD`, which no graph defines. A licensed-source rights
failure, a thin-lane sample, and a prompt-injected article all land in the same undefined,
ownerless state.

## 6. Adversarial cases

| Attack                                          | Today                               | Under the design as written                                                        |
| ----------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| Source rights don't permit intended use         | **blocked** — no ingestion possible | **at risk** — FA-01, no registry                                                   |
| Stale licensed rate stays CURRENT               | **blocked** — no data               | **at risk** — FA-05, `STALE` unowned                                               |
| Thin-lane sample presented as high confidence   | **blocked**                         | **at risk** — `THIN_MARKET` unowned                                                |
| Prompt-injected article alters tools/policy     | **blocked** — no LLM, no egress     | mitigated by invariant _"free-form text never grants authority"_ (36/36), untested |
| Rumor becomes confirmed fact                    | **blocked**                         | **at risk** — `UNVERIFIED`/`DISPUTED` unowned                                      |
| Forecast presented as observed rate             | **blocked**                         | mitigated — separate schemas + separate graph states                               |
| Correction fails to invalidate a derived signal | **blocked**                         | **partly designed** — FMI-G10 exists; propagation untested                         |
| Duplicate ingestion double-counts               | **blocked**                         | **at risk** — FA-04                                                                |

## 7. Required changes

1. Build the source registry with executed-rights fields **before any ingestion** (**FA-01**,
   blocking).
2. Define and own every declared FMI terminal state (**FA-05, FA-06**, blocking).
3. `F3_INGEST` → `idempotent_retry` with a declared key (**FA-04**).
4. Resolve the news-agent plane; generate matrices from graphs (**FA-03**).
5. Give the ocean/port and rail/intermodal components nodes, or merge them (**FA-02 / C-09**).
