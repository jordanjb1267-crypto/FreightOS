# 12 — Documents, Evidence, and Chain of Custody

## 1. Evidence model

An evidence envelope references content without treating every file as universally shareable. It includes:

- evidence ID and type;
- content hash;
- capture time and uploader/capture device;
- subject and related event;
- media/document metadata;
- storage location and encryption domain;
- classification and access policy;
- authenticity/verification state;
- transformations and redactions;
- retention and legal-hold status.

## 2. Document versions

Documents are immutable versions. Amendments and corrections create new versions with lineage. OCR output and extracted fields are derived artifacts, not replacements for source documents.

## 3. Custody events

Chain-of-custody events should capture:

- transferor and transferee;
- cargo/handling-unit references;
- location and time;
- seal/condition identifiers;
- authority and role;
- acceptance/rejection;
- evidence;
- exceptions;
- signatures or confirmations.

## 4. Proof strength

FreightOS assigns proof level based on source and corroboration, for example:

- self-asserted;
- device-attested;
- document-supported;
- counterparty-confirmed;
- independently verified;
- legally signed/title-controlled.

Proof level is contextual and does not imply universal legal validity.

## 5. Sensitive documents

Identity, banking, contracts, manifests, hazardous-goods, medical, customs, and title-related documents require narrower storage and access profiles. Documents are never inserted into model prompts unless explicitly permitted and minimized.

## 6. Disputes

Dispute workflows link claims to events, documents, policies, deadlines, participants, and resolution. Evidence is preserved even when a commercial resolution changes the amount owed.
