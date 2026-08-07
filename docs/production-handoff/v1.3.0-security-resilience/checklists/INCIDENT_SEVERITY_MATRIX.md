# Incident Severity Matrix

| Dimension | SEV-0 | SEV-1 | SEV-2 | SEV-3 |
|---|---|---|---|---|
| Confidentiality | Systemic/network-wide or trust in isolation lost | Confirmed/credible cross-tenant or privileged exposure | Limited sensitive exposure | No confirmed sensitive exposure |
| Integrity | History/authority cannot be trusted broadly | Widespread incorrect critical state/action | Limited incorrect state requiring reconciliation | Local defect with simple correction |
| Availability | Network-wide critical operation unavailable | Material Class A outage or large tenant cohort | Significant Class B or limited Class A impact | Degraded noncritical workflow |
| Financial | Systemic fraudulent or duplicate execution | Material unauthorized/incorrect transactions | Limited recoverable discrepancy | No material financial effect |
| Safety/operations | Broad unsafe dispatch/service coordination | Material active-operation risk | Limited operational delay/recovery | Minimal user inconvenience |
| Response | Executive incident command and external specialists | Immediate incident command, owner/legal engagement | Urgent coordinated response | Normal expedited engineering |

## Automatic severity floors

- Any credible cross-tenant access path: SEV-1 until scoped down.
- Privileged credential compromise: SEV-1.
- Unauthorized payment-destination change: SEV-1.
- Audit tampering or inability to trust authority history: SEV-0/1.
- Duplicate roadside dispatch with real operational effect: at least SEV-2; higher by impact.
- Severe vulnerability without observed exploitation may be SEV-2/3 but remains release-blocking by risk.
