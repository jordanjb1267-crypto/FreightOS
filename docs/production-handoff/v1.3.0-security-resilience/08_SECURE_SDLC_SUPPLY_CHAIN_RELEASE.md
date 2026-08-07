# 08 — Secure SDLC, Software Supply Chain, and Production Release Standard

## 1. Development lifecycle

Security work begins with design and continues through implementation, deployment, operation, incident response, and retirement. The process is aligned to NIST SSDF, OWASP verification standards, and SLSA provenance principles. See `REFERENCES.md`.

## 2. Source control

- Protected primary and release branches.
- Pull-request review required.
- Signed commits or verified identities for sensitive repositories where feasible.
- No force-push to protected branches.
- CODEOWNERS or equivalent for identity, authorization, migrations, payments, agent tools, infrastructure, and security controls.
- Secret scanning before commit and in CI.
- Dependency update automation with risk review.

## 3. Build controls

- Builds run in isolated, ephemeral environments.
- Build definitions are version-controlled.
- Artifacts are immutable and content-addressed where possible.
- Generate SBOMs for release artifacts.
- Generate provenance linking source, workflow, builder, dependencies, and artifact digest.
- Sign artifacts and verify signatures before deployment.
- Production deployment promotes the exact tested artifact; it does not rebuild from mutable state.
- Limit and audit who can alter build and deployment workflows.

## 4. Required verification

Depending on component risk:

- type checking and linting;
- unit, integration, contract, and end-to-end tests;
- static application security testing;
- dependency and license scanning;
- infrastructure-as-code scanning;
- container and artifact scanning;
- dynamic testing for exposed services;
- authorization and tenant-isolation suites;
- migration compatibility and rollback tests;
- fuzz/property testing for parsers and policy boundaries;
- agent prompt-injection and tool-abuse tests;
- performance and capacity tests;
- manual security review for R3/R4 changes.

## 5. Release rings

Recommended promotion:

1. developer/local with synthetic data;
2. CI and ephemeral integration environment;
3. persistent staging with production-like policy;
4. internal or test tenant;
5. canary cell/tenant cohort;
6. limited percentage rollout;
7. general rollout;
8. post-deployment verification and reconciliation.

Feature flags MUST be server-controlled, audited, fail to a safe default, and have an owner and removal date.

## 6. Automated rollback

Rollback may trigger on:

- elevated error rate or latency;
- authorization anomaly;
- cross-tenant canary failure;
- event-processing backlog or duplication;
- data-integrity check failure;
- resource saturation;
- SLO burn-rate threshold;
- security signal tied to the release.

Rollback must not be automatic when it would reverse an incompatible schema migration or create data loss. Such releases require forward-fix or pretested dual-version compatibility.

## 7. Database migration standard

Use expand-and-contract:

1. add backward-compatible structure;
2. deploy readers/writers compatible with old and new forms;
3. backfill in bounded batches;
4. reconcile counts, hashes, constraints, and tenancy;
5. switch behavior gradually;
6. observe through at least one safe release window;
7. remove old structures in a later change.

Prohibit combined destructive schema change plus code dependency in one irreversible step.

## 8. Emergency changes

Emergency access does not eliminate controls. The minimum is:

- incident reference;
- named approver;
- smallest possible change;
- preserved diff and artifact;
- validation and rollback;
- post-change review within one business day;
- permanent PR and regression coverage.

## 9. Release evidence bundle

Each production release should retain:

- source commit;
- artifact digest and signature;
- SBOM;
- provenance attestation;
- test results;
- migration plan and result;
- approvals;
- canary metrics;
- deployment and rollback timestamps;
- post-deployment verification.
