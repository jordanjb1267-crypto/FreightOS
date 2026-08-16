# 23 — Testing, Adversarial, and Failure-Injection Standard

## Product/catalog tests

- quote references retired capability;
- catalog changes during active quote;
- bundle expansion produces correct entitlements;
- capability dependency missing;
- unsupported autonomy claim;
- stale certification status;
- agent implementation changed but capability contract unchanged;
- material change requires version bump.

## Promise Firewall attacks

- human edits approved proposal after approval;
- LLM invents roadmap date;
- partner claims unsupported integration;
- RFP agent claims nonexistent certification;
- seller converts “planned” into “available”;
- customer asks agent to bypass policy;
- injected PDF/email tells agent to approve claim.

## Authority tests

- referral scout attempts binding quote;
- seller exceeds discount ceiling;
- partner accesses another partner/customer account;
- RevenueOS agent attempts Twin write;
- commercial user attempts activation;
- deal-desk requester self-approves exception.

## Attribution/commission tests

- duplicate lead registrations;
- duplicate cash event;
- refund after payout;
- split totals >100%;
- plan version changes mid-deal;
- seller changes CRM owner after close;
- manual override without approval;
- parent/subsidiary identity collision;
- currency/tax/pass-through edge cases;
- replay after crash.

## Workflow resilience

Inject crashes:

- before/after outbound email;
- before/after quote creation;
- before/after e-sign packet generation;
- before/after entitlement request;
- before/after commission event;
- during partner registration conflict resolution.

Prove one intended business effect and visible reconciliation.

## Privacy/security

- cross-tenant CRM/API/search/export tests;
- prompt injection in RFPs/prospect docs;
- data exfiltration attempts;
- seller tries to query unrelated operational data;
- partner token overreach;
- secret leakage in proposal/logs.

## Certification

No production commercial automation with external/binding effects is accepted solely because unit tests pass. Use offline, adversarial, replay, shadow, and bounded promotion appropriate to the component/action class.

## Market intelligence attacks

The complete FMI suite is defined in `37_MARKET_INTELLIGENCE_TESTS_AND_ACCEPTANCE_GATES.md`. At minimum test stale rates, thin-lane overconfidence, source conflicts, false/rumor news, prompt injection in articles, license/redistribution violations, private-rate leakage, source outages, correction lineage, forecast-vs-observation confusion, customer relevance overreach, and attempts to convert a market signal directly into Carrier/Broker/Facility/Maintenance authority.
