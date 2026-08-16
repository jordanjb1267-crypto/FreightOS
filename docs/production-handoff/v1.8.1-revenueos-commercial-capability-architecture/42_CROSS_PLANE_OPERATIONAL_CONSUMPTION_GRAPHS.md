# 42 — Cross-Plane Operational Consumption Graphs

These graphs make the critical boundary explicit: FMI can inform an operational domain, but only the receiving participant workforce can propose/authorize/execute its logistics command under its accepted authority model.

| Graph | Name | WorkUnit | Nodes | Edges | Machine-readable file |
|---|---|---|---:|---:|---|
| `XPL-G01` | FMI-to-operational consumption authority bridge | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g01.json` |
| `XPL-G02` | Carrier dispatch intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g02.json` |
| `XPL-G03` | Broker pricing/sourcing intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g03.json` |
| `XPL-G04` | Facility capacity/arrival intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g04.json` |
| `XPL-G05` | Shipper procurement/execution intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g05.json` |
| `XPL-G06` | Maintenance/service intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g06.json` |

All graphs are `AUDIT_CANDIDATE`. They are not runtime implementation claims.
