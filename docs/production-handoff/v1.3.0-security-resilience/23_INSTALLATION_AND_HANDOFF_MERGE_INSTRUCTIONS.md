# 23 — Installation and Existing-Handoff Merge Instructions

## 1. Objective

Install this package without overwriting or weakening the existing FreightOS production handoff. The package is an additive security, privacy, resilience, production-operations, and agent-authority layer.

## 2. Recommended repository destination

From the FreightOS repository root:

```bash
mkdir -p docs/production-handoff
cp -R /path/to/FreightOS_Security_Resilience_Handoff_v1.3.0 \
  docs/production-handoff/v1.3.0-security-resilience
```

Do not copy a downloaded ZIP directly into the repository. Extract it first and verify that `README.md`, `00_MASTER_HANDOFF.md`, and `MANIFEST.sha256` are present.

## 3. Verify package integrity

From inside the copied directory:

```bash
cd docs/production-handoff/v1.3.0-security-resilience
shasum -a 256 -c MANIFEST.sha256
```

All entries must report `OK`. If any file fails, stop and replace the package with an intact copy.

## 4. Add the controlling pointer to the existing master handoff

Add the following section to the current production master handoff. Do not remove or rewrite existing sections merely to add it.

```markdown
## Security, Privacy, Resilience, and Autonomous Repair Control Package

The controlling requirements for FreightOS security, privacy, tenant isolation, zero-trust identity and authorization, reliability, disaster recovery, secure software delivery, incident response, AI-agent authority, and bounded autonomous remediation are located at:

`docs/production-handoff/v1.3.0-security-resilience/`

This package is additive. Where a prior implementation preference conflicts with a non-regression requirement in that package, the stricter security, privacy, reliability, resilience, or authority requirement controls. Major architecture or product-scope conflicts must be escalated and documented rather than resolved silently.
```

## 5. Create a dedicated installation branch

```bash
git checkout -b setup/install-security-resilience-handoff-v1.3.0
git add docs/production-handoff/v1.3.0-security-resilience
# Also add the existing master handoff after inserting the pointer.
git status --short
```

Review the staged file list. The installation commit should contain documentation, examples, schemas, and policy definitions only. It should not change runtime code, database state, production configuration, user permissions, or live integrations.

## 6. Commit the package

```bash
git commit -m "docs: install FreightOS security and resilience handoff v1.3.0"
```

Push and open a documentation-only pull request according to the repository's existing process.

## 7. Initial Claude handoff

Use `20_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md` in the existing Claude session responsible for FreightOS. The first assignment is Phase 0 inventory and gap analysis only. Claude must not jump directly into broad production implementation.

## 8. Required first response from Claude

Claude's first completion report must contain:

- repository branch, HEAD, remote, and working-tree state;
- files changed;
- current architecture and production-capable environment inventory;
- authority and tenant-isolation findings;
- backup/restore evidence status;
- integrations and external side-effect inventory;
- agent/tool authority inventory;
- every acceptance gate marked PASS, PARTIAL, FAIL, or NOT IMPLEMENTED;
- prioritized repository-specific PR sequence;
- decisions requiring owner approval;
- explicit confirmation that no live operation or permission was changed.

## 9. Do not do these during installation

- Do not merge runtime security changes into the documentation installation PR.
- Do not rotate or paste secrets into Claude unless a separate secure operational procedure requires it.
- Do not enable agents, payments, dispatch, roadside calls, webhooks, or production integrations.
- Do not change database ownership or run migrations before the current-state inventory is complete.
- Do not represent the package as implemented merely because the documents are committed.

## 10. Acceptance of the installation PR

The installation PR is accepted when:

- package checksums pass;
- internal links and JSON schemas validate;
- the prior master handoff contains the additive pointer;
- no prior governance file was deleted or weakened;
- runtime behavior is unchanged;
- the branch is clean after commit;
- the Phase 0 Claude prompt is ready for use.
