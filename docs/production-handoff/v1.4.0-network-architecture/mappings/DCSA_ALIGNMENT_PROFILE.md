# DCSA Alignment Profile

## Scope

Ocean booking, shipment, transport-document, track-and-trace, and eBL interoperability require explicit DCSA version profiles.

## FreightOS approach

- map DCSA parties, shipment/equipment references, events, and document identifiers to canonical objects;
- preserve carrier/shipper authority and document-control semantics;
- treat PINT/CTR or equivalent control registries as external authoritative services where used;
- do not claim title control merely because a PDF or document hash is stored;
- run DCSA conformance tests before production claims.

## Pilot rule

Ocean functionality starts with read/observe integration and known counterparties before any document issuance, surrender, or control-transfer capability.
