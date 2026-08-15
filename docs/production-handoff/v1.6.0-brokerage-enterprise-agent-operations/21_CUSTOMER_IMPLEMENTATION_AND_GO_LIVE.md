# 21 — Customer Implementation and Go-Live

## Tiers

### Solo / Small Broker
Minimal BOT, common TMS/email/accounting/load-board integrations.

### Standard Brokerage
Multiple users/accounts/carrier network.

### Enterprise 3PL
Branches, SSO, many shipper/carrier integrations, dedicated security/compliance.

### Strategic Dedicated
Dedicated cell/data residency/custom SLO.

## Universal implementation

### 0 Legal/commercial scope
Confirm brokerage entity/authority and desired automation.

### 1 BOT discovery
Accounts, carriers, policies, SOPs, systems, branches.

### 2 Connectivity
Read-only integrations first.

### 3 Workflow mapping
RFQ -> quote -> source -> qualify -> negotiate -> tender -> execute -> invoice/pay -> record.

### 4 Agent organization
Instantiate manifests/scopes.

### 5 Shadow
Compare to human brokerage decisions.

### 6 A3
Approval-to-execute.

### 7 A4
Certified policy-bounded routine operations.

### 8 A5
Exception-supervised selected accounts/workflows.

## One-person broker fast start

1. Verify entity/legal gate state.
2. Connect TMS/email.
3. Import shipper accounts.
4. Import/verify carrier network.
5. Configure pricing/margin.
6. Configure approval limits.
7. Shadow RFQs/coverage.
8. A3 quotes/tenders.
9. A4 selected routine actions.

## Enterprise rollout

Start:
one branch/account/workflow/carrier pool
then canary outward.

No big-bang full-book automation.
