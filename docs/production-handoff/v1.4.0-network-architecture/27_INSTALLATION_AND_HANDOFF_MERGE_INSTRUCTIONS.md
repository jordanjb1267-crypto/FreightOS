# 27 — Installation and Existing-Handoff Merge Instructions

## 1. Destination

From the FreightOS repository root, install this package at:

```text
docs/production-handoff/v1.4.0-network-architecture/
```

## 2. Branch

```bash
git switch main
git pull --ff-only origin main
git switch -c setup/install-network-architecture-handoff-v1.4.0
```

Do not begin from the prior documentation branch unless it has been merged and local `main` has been updated.

## 3. Copy

```bash
mkdir -p docs/production-handoff
cp -R /path/to/FreightOS_Network_Architecture_Handoff_v1.4.0 \
  docs/production-handoff/v1.4.0-network-architecture
```

## 4. Verify

```bash
cd docs/production-handoff/v1.4.0-network-architecture
shasum -a 256 -c MANIFEST.sha256
cd "$(git rev-parse --show-toplevel)"
```

All entries must report `OK`.

## 5. Additive pointer

Append this section to the existing controlling master handoff, without removing prior content:

```markdown
## FreightOS Network Architecture Control Package

The controlling requirements for FreightOS network identity, canonical logistics objects, event and command protocols, cross-party workflow coordination, interoperability, data sovereignty, partner APIs, agent communication, network governance, and conformance are located at:

`docs/production-handoff/v1.4.0-network-architecture/`

This package is additive to the v1.3.0 security and resilience package. No network feature may weaken tenant isolation, privacy, zero-trust authorization, auditability, release safety, or operational continuity. Material conflicts must be escalated and documented rather than resolved silently.
```

If the repository maintains a handoff index, add the package there as well.

## 6. Stage and inspect

```bash
git add docs/production-handoff/v1.4.0-network-architecture
# Stage only the existing master/index files you intentionally edited.
git status --short
git diff --cached --stat
git diff --cached --name-only
```

Every staged file must be documentation/policy/schema/contract material under `docs/production-handoff/`.

## 7. Commit and push

```bash
git commit -m "docs: install FreightOS network architecture handoff v1.4.0"
git push -u origin setup/install-network-architecture-handoff-v1.4.0
```

## 8. Pull request

The installation PR is documentation-only. It must not contain runtime code, migrations, dependency upgrades, credentials, configuration changes, or live integration activation.

## 9. After merge

```bash
git switch main
git pull --ff-only origin main
pbcopy < docs/production-handoff/v1.4.0-network-architecture/26_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md
```

Paste the prompt into the existing FreightOS Claude session. Phase 0 inventory only.
