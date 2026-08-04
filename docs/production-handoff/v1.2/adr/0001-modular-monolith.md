# ADR 0001 — Begin as a modular monolith

**Status:** Accepted

Use one modular backend plus specialized workers during initial phases. Enforce package boundaries, commands, events, and private module access. Extract services only for scale, compliance, availability, credentials, or ownership.
