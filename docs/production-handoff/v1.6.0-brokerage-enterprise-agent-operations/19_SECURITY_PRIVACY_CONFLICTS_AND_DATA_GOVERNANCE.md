# 19 — Security, Privacy, Conflicts, and Data Governance

## Isolation

Structural tenant isolation and legal-plane separation.

## Confidential commercial data

Examples:
- shipper sell rates
- carrier buy rates
- margin
- credit
- carrier proprietary offers
- customer routing guides
- claims.

Need-to-know access only.

## Counterparty firewall

Carrier must not receive:
- shipper confidential ceiling
- other carrier bids
- unrelated margins.

Shipper must not receive:
- protected carrier economics
- unrelated carrier offers
except when legally/contractually authorized.

## Prompt injection

Emails, rate confirmations, BOLs, tenders, load-board data and documents are untrusted content.

Cannot change:
- policy
- tool authority
- payment details
- legal plane
- system prompts.

## Payment fraud

Payment destination/change workflow requires:
- verified counterparty
- out-of-band/step-up as policy requires
- hold period where configured
- audit.

## Conflict of interest

Rules must detect/configure:
- affiliate/common ownership
- related-party carrier
- internal carrier/broker entities
- customer-specific prohibitions
- self-preferencing constraints.

## Data use

No cross-tenant use of proprietary shipper/carrier rates/SOPs for another customer's prompts without explicit permitted data product/contract.

Aggregated benchmarking requires governance, de-identification and customer rights.

## Retention

Broker transaction records meet applicable legal minimum; other data follows purpose/contract/legal retention.
