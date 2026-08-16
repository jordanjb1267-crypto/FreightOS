# Market Intelligence Publish / Consume Boundary

```text
 SOURCES
   │
   ▼
Rights + Source Registry
   │
   ▼
Ingest / Normalize / Validate
   │
   ▼
┌───────────────────────────────────────────────┐
│ FREIGHT MARKET INTELLIGENCE SUBSTRATE         │
│ observations · indicators · forecasts · news │
│ provenance · freshness · confidence · rights │
└───────────────────────────────────────────────┘
   │             │             │             │
   ▼             ▼             ▼             ▼
RevenueOS      Carrier       Broker        Facility ...
briefing       planning      pricing       readiness
   │             │             │             │
   │             ▼             ▼             ▼
   │        DOMAIN WORKFLOW / AUTHORITY / POLICY
   │             │             │             │
   │             └────── commands only here ─┘
   │
   └── commercial explanation only
```

**Invariant:** publication/consumption of an FMI signal never transfers permissions across planes.
