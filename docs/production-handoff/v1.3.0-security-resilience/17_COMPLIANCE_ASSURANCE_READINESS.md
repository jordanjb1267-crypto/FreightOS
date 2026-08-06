# 17 — Compliance and Assurance Readiness

## 1. Purpose

FreightOS should build controls that can later support customer due diligence and independent assurance. Certification should document a functioning security program, not create one after the fact.

## 2. Baseline frameworks

Use the following as design references:

- NIST Cybersecurity Framework 2.0 for governance and risk outcomes;
- NIST SP 800-207/207A for zero trust;
- NIST SP 800-160 Vol. 2 Rev. 1 for cyber resilience;
- NIST SP 800-218 SSDF and related AI profile for secure development;
- NIST SP 800-61 Rev. 3 for incident response;
- OWASP ASVS for application verification;
- OWASP LLMSVS/AISVS for AI/LLM systems;
- SLSA for build provenance and supply-chain integrity.

See `REFERENCES.md`.

## 3. Future assurance targets

Potential business-driven targets may include SOC 2 Type II and ISO/IEC 27001 readiness. Do not claim compliance or certification until formally achieved. Legal/privacy requirements depend on jurisdiction, customer, data, and operation; qualified counsel must determine applicability.

## 4. Evidence-first design

Controls should generate evidence automatically:

- access grants and reviews;
- MFA and privileged elevation;
- code review and test results;
- artifact signatures, SBOM, and provenance;
- deployment approvals and canary results;
- vulnerability remediation;
- vendor reviews;
- backup and restore tests;
- incident exercises and postmortems;
- SLO/error-budget records;
- data inventory, deletion, and retention jobs;
- agent evaluations and authority changes.

## 5. Control mapping

Maintain an internal control catalog where one implemented control may map to multiple frameworks. Avoid separate, duplicative compliance-only processes.

Each control record should contain:

- control ID and objective;
- owner;
- systems in scope;
- implementation;
- evidence source and cadence;
- test procedure;
- exceptions;
- mapped framework references.

## 6. Customer trust package

When mature, prepare a controlled trust package containing:

- security architecture summary;
- data handling and subprocessor summary;
- business continuity overview;
- vulnerability disclosure/contact process;
- independent assessment reports under NDA as appropriate;
- penetration-test executive summary;
- incident communication commitments;
- availability history and SLO methodology;
- AI/agent control summary.

Do not disclose diagrams, secrets, exploit details, or controls in a manner that increases risk.
