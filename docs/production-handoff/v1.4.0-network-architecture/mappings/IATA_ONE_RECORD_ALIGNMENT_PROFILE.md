# IATA ONE Record Alignment Profile

## Scope

ONE Record provides an air-cargo data model, secured API, and federated sharing concepts. FreightOS should map canonical shipment, party, piece, ULD, event, and document concepts rather than create an incompatible air-cargo silo.

## Rules

- Preserve ONE Record logistics-object URIs as external aliases/references.
- Respect data-at-source and owner-controlled access principles.
- Map JSON-LD/ontology semantics through a dedicated adapter.
- Do not flatten unknown ontology relationships into lossy generic fields.
- Use ONE Record security and conformance requirements for claimed interoperability.
