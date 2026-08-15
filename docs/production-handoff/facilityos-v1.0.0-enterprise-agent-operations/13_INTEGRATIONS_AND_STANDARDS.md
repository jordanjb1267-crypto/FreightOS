# 13 — Facility Integrations and Standards

## Existing systems

FacilityOS should connect rather than initially replace:
- ERP
- WMS
- YMS
- WES
- TMS
- dock/appointment software
- access control
- document management
- email/SMS
- carrier portals
- EDI gateways
- label/barcode/RFID systems.

## Adapter contract

Every adapter declares:
- tenant/site
- external system
- auth
- authoritative fields
- canonical mappings
- read/write commands
- idempotency
- retries
- reconciliation
- outage behavior
- version support
- semantic loss
- conformance suite.

## Transportation documents

Support canonical mapping for:
- X12 211 Motor Carrier Bill of Lading where trading partners use it;
- X12 204/990/214/210 as relevant to surrounding carrier workflow;
- customer/vendor proprietary APIs.

## Facility/warehouse

Potential mappings:
- X12 163 appointment
- X12 940 warehouse shipping order
- X12 943 stock transfer shipment advice
- X12 944 stock transfer receipt advice
- X12 945 warehouse shipping advice
- X12 322 terminal/intermodal activity where relevant.

## Traceability

GS1 EPCIS/CBV is a preferred interoperability profile where item/handling-unit shipping/receiving/custody visibility is required.

## Legal-document caution

UCC Article 7 includes bills of lading/documents of title in U.S. commercial law and supports electronic-document concepts, but FacilityOS must not infer a document's legal status solely from file format or system label.

Jurisdiction/contract/legal configuration remains explicit.

## Mapping

AI may propose mapping.
Production mapping requires:
- schema validation
- deterministic transformation tests
- round trip where applicable
- customer/system-owner confirmation
- error/dead-letter handling.
