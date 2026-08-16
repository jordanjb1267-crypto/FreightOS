# FMI graph system

```text
FMI-G01 Source rights → normalized observations
        ├→ FMI-G02 News verification
        ├→ FMI-G03 Rate/capacity/lane state
        ├→ FMI-G04 Demand/season/disruption/regime
        ├→ FMI-G08 Maintenance market intelligence
        └→ FMI-G09 Regulatory intelligence
                  │
                  └────┬────→ FMI-G05 Forecast
                       └────→ FMI-G06 Customer relevance/impact
                                     ↓
                                FMI-G07 Brief/alert

Any source correction/error → FMI-G10 correction/recompute/retraction

FMI output → XPL-G01..G06 → receiving domain policy/authority → optional operational command
```
