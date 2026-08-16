# Cross-plane authority bridge

```text
FMI Observation / Forecast / Impact
              │ read-only typed artifact
              ▼
Participant-domain Job Book
              │ produces proposal/recommendation
              ▼
Participant authority + policy plane
        ┌─────┴──────┐
      DENY      APPROVAL/ALLOW
        │             │
        ▼             ▼
      HOLD       exact approval if needed
                      │
                      ▼
             registered command executor
                      │
                      ▼
                 reconciliation
```

The intelligence producer never appears on the command-authority path.
