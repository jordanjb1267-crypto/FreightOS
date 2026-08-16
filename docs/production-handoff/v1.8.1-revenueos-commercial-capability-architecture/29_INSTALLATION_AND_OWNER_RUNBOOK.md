# 29 — Installation and Owner Runbook

## Goal

Install this package as immutable additive design documentation, then have Claude independently audit it against accepted FreightOS before any implementation or v1.9 continuation.

## A. Local preflight

From the real FreightOS repository root:

```bash
cd /Users/jordanburwell/Developer/FreightOS

git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
```

Do not proceed from a dirty tree unless you intentionally understand and preserve the existing work. Do not delete or move files merely to satisfy the preflight.

## B. Update main

Only if clean and normal repository governance permits:

```bash
git switch main
git pull --ff-only origin main
git status --short
```

## C. Create installation branch

```bash
git switch -c setup/install-revenueos-commercial-capability-v1.8.1
```

## D. Copy package

Assuming this generated folder is in Downloads, adjust source path if necessary:

```bash
mkdir -p docs/production-handoff
cp -R "/path/to/FreightOS_v1.8.1_RevenueOS_Commercial_Capability_Architecture" \
  "docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture"
```

## E. Verify manifest before commit

```bash
cd docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture
shasum -a 256 -c MANIFEST.sha256
cd "$(git rev-parse --show-toplevel)"
```

Every entry must report `OK`.

## F. Inspect scope

```bash
git status --short
git diff --stat
git diff --name-only
```

Expected change: new documentation package only. No runtime, migration, dependency, config, credential, or existing accepted handoff modification.

## G. Stage and commit

```bash
git add docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture

git diff --cached --stat
git diff --cached --name-only

git commit -m "docs: install FreightOS RevenueOS capability architecture v1.8.1"
```

## H. Run repository checks

Run the checks your current FreightOS repository requires for documentation/handoff packages. At minimum include package hash validation, formatting/docs checks, provenance/drift checks, and secret scan if present. Do not guess around a failure; capture it.

## I. Push installation branch

After local checks are green:

```bash
git push -u origin setup/install-revenueos-commercial-capability-v1.8.1
```

Open a documentation-only PR. Do not merge automatically unless your normal governance authorizes it.

## J. After accepted installation

Start a **new Claude session**, not the prior design session.

Copy:

```bash
pbcopy < docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture/28_CLAUDE_CROSS_PACKAGE_AUDIT_PROMPT.md
```

Paste it into Claude from the real FreightOS repository context.

## K. What Claude must do

Claude performs a docs-only cross-package audit and creates `docs/revenueos-architecture-review/`.

It must not read the preserved unaccepted v1.9 draft, implement RevenueOS/FMI, connect or ingest market/news sources, or continue v1.9. The audit must separately score REV-01..REV-48 and FMI-01..FMI-28 and decompose both the RevenueOS workforce and the proposed FMI workforce against what already exists.

## L. What you send back for review

Send the full Claude completion report plus, preferably, the generated audit package or repository diff. Review the verdict and blockers before authorizing the next design/implementation step.

## M. Decision gate

Only after review choose among:

- accept v1.8.1 as coherent and define an additive implementation sequence;
- revise v1.8.1 design conflicts first;
- fold required commercial/capability corrections into the eventual v1.9 scope;
- keep v1.9 paused if architectural blockers remain.

No option is pre-authorized by this package.

## N. Typed-graph / Job Book audit completion

The audit is incomplete unless Claude also:

- reads all 37 provisional Job Books and machine-readable descriptors;
- audits all 36 typed durable graphs, including TWIN-G01..TWIN-G12;
- validates ownership, typed artifacts, authority boundaries, retry/reconciliation and stale-version behavior;
- reconciles candidate responsibilities against the accepted v1.8 workforce instead of assuming they are new jobs;
- scores `GR-01..GR-32` and `TW-01..TW-40` in addition to `REV-01..REV-48` and `FMI-01..FMI-28`.

See `49_END_TO_END_IMPLEMENTATION_SEQUENCE.md` for the complete owner sequence from package installation through post-audit implementation authorization.
