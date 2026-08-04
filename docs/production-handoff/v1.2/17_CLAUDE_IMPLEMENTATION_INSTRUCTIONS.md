# How to Implement This Package in Claude Code

## 1. Repository

Create a new private GitHub repository:

```text
rig-freightos
```

Do not insert it into RIGDESK or RigReceipts.

## 2. Copy the handoff

Place the preserved package under:

```text
docs/handoff/v1.2/
```

Copy implementation inputs (`schemas`, `config`, `db`, `prompts`, `checklists`, `adr`, `scripts`) to the repository root as well.

## 3. First commit

```bash
git add .
git commit -m "docs: add FreightOS production handoff v1.2"
git push -u origin main
```

## 4. Start Claude

Open Claude Code in the repository and provide `16_CLAUDE_MASTER_BUILD_PROMPT.md`.

Then provide `prompts/HORIZON_1_KICKOFF.md` and say:

```text
Perform the required repository audit and Horizon 1 implementation plan. Do not write application code until the audit and plan are complete.
```

## 5. Sequential execution

After reviewing the plan, provide `prompts/PHASE_0_FOUNDATION.md`.

Do not provide every phase prompt simultaneously.

Execute only Phase 0 through Phase 3 under the default v1.2 authorization. Advance only when tests, validation, evidence, clean branch, reviewed PR, and exit gate pass. After Phase 3, stop and require `checklists/HORIZON_PROMOTION_GATE.md` plus owner approval before any later phase.

## 6. Existing products

FreightOS initially consumes defined contracts from RigReceipts and RIGDESK. No copying or rewriting without integration contract, data ownership, migration, tests, and approval.

## 7. Brokerage

Dormant architecture may exist. No production flag, credential, worker, API, or UI can execute Brokerage Mode until `checklists/BROKERAGE_LEGAL_GATE.md` is signed.

## 8. Deployment

Development may run locally. Production runs on redundant always-on cloud infrastructure. The laptop is an operator/development surface.

## 9. Evidence

Reject “should work,” “looks complete,” “tests passed” without output, and “secure” without controls/findings.

## 10. Deferred ecosystem modules

Preserve FacilityOS, autonomous mobility, brokerage, exchange, rail, ocean, and air architecture under `docs/handoff/v1.2/`.

During Horizon 1, implement only minimum facility primitives and future contracts/simulations described in the sequencing doctrine. Do not execute Phase 4 or later prompts.

Any proposal to control vehicle motion, remote driving, robotics, PLCs, conveyors, dock restraints, doors, or safety interlocks must be rejected and escalated as a separate safety program.

## 11. Promotion

A later horizon requires:

- Owner-approved ADR
- Completed predecessor evidence
- Applicable legal/customer/partner/safety/liquidity gate
- Updated `config/scope/module_states.yaml`
- Updated pricing status and tests
- Reviewed PR and exact SHA

A chat instruction to “continue,” an existing future prompt, or a feature flag is not sufficient unless it explicitly authorizes the named promotion and the repository artifacts are updated.
