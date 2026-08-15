# 06 — Bill of Lading, Document, and Shipping/Receiving Office Exchange

## 1. Principle

A Bill of Lading is a first-class `TransportDocument`, with its own identity, versions, provenance, associations, acknowledgements and policy.

The architecture supports paper and electronic records.

FacilityOS does not make a universal legal determination about a BOL's title/negotiability/e-signature effect. Tenant policy and jurisdictional/legal review control legal treatment.

## 2. Channels

BOL may arrive via:
- driver mobile upload/photo/PDF;
- driver QR/scoped-link;
- shipping-office generation;
- shipping-office scan of paper;
- receiving-office scan;
- carrier API;
- shipper API;
- EDI X12 211 where applicable;
- secure email ingestion;
- FreightOS document reference;
- approved external document platform.

## 3. Document record

Required:
- document ID
- tenant/site
- document type
- shipment/consignment/leg refs
- appointment/visit refs
- source channel
- submitted-by identity/party
- captured-by identity where different
- received timestamp
- original object reference
- cryptographic hash
- MIME/media metadata
- extraction version
- validation state
- office disposition
- signature/acknowledgement refs
- supersedes/superseded-by
- retention/data classification.

## 4. States

```text
EXPECTED
RECEIVED
MALWARE_SCAN_PASSED
PARSED
MATCH_CANDIDATE
MATCHED
VALIDATION_REQUIRED
ACCEPTED_FOR_OPERATIONAL_USE
CORRECTION_REQUESTED
REJECTED
SUPERSEDED
VOIDED
ARCHIVED
```

`ACCEPTED_FOR_OPERATIONAL_USE` does not itself transfer custody/title or create goods receipt.

## 5. Driver → shipping office origin graph

```text
Appointment/visit exists
 ↓
BOL required
 ↓
Driver presents/uploads BOL
 ↓
Server receipt + immutable original hash
 ↓
Security/media validation
 ↓
Document type/extraction
 ↓
Match to shipment/visit
 ↓
Required-field/policy validation
 ↓
Shipping Office queue
 ↓
Accept / correction request / reject
 ↓
Driver receives digital receipt/status
 ↓
Accepted document reference becomes available to authorized FreightOS/carrier parties
```

If the facility itself issues the BOL, graph can begin with facility-generated draft → authorized office issuance → driver acknowledgement/copy.

## 6. Driver → receiving office destination graph

```text
Arrival/visit
 ↓
Driver presents BOL / delivery documents
 ↓
Receipt/hash/match
 ↓
Receiving-office validation
 ↓
Unload/inspection workflow
 ↓
Goods receipt / discrepancy decision
 ↓
POD / receiving acknowledgement where applicable
 ↓
Authorized digital copy/status to driver/carrier/shipper
```

BOL presentation is separate from receiving acceptance.

## 7. Extraction

OCR/AI may extract:
- BOL number
- shipper
- consignee
- carrier
- pickup/delivery refs
- PO numbers
- seal
- commodity descriptions
- pieces/handling units
- weight
- special instructions.

Extraction is untrusted until validated by deterministic checks and/or authorized review.

Never silently overwrite the original.

## 8. Matching

Candidate match may use:
- BOL number
- shipment/load number
- appointment
- PO
- carrier
- trailer
- seal
- shipper/consignee
- facility
- date/time.

Ambiguous match = HOLD/REVIEW.

Do not attach a BOL to the "closest" load when identity is uncertain.

## 9. Signatures/acknowledgements

Capture:
- signer identity/role where verified
- timestamp
- exact document version
- context/action
- signature/evidence method
- device/session assurance
- policy version.

A captured scribble alone is not authority.

## 10. Physical paper

Office can scan/capture:
- who received paper
- time
- document hash/image
- paper returned/retained/copy given
- any handwritten exceptions.

## 11. Duplicate/supersession

Duplicate hash:
- link to existing record, do not create conflicting truth.

New version:
- preserve prior;
- create explicit supersession;
- require re-review if material fields changed.

## 12. Security

- malware scan
- file type/size limits
- no active document content execution
- OCR sandbox
- PII/data classification
- authorization on download
- watermark/share policy where configured
- immutable audit.

## 13. Events

Examples:
- `transport_document.expected`
- `transport_document.received`
- `transport_document.matched`
- `transport_document.correction_requested`
- `transport_document.accepted_for_operational_use`
- `transport_document.rejected`
- `transport_document.superseded`
- `bol.presented`
- `bol.office_acknowledged`

These events never imply custody/goods receipt unless a separate corresponding governed event exists.
