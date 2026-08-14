# N7 External Transport — Egress CI Model

Architecture phase. **The existing validator is unchanged by this document.** Nothing here is
implemented; `NETWORK_EGRESS=PASS` still means what it has always meant.

Companion to ADR-N0018. Closes, by design, the standing finding
`NETWORK_EGRESS_CI_OBSERVABILITY=OPEN`.

---

## 1. What exists today, and why it cannot simply continue

`scripts/check-network-egress.mjs` proves a strong property: **the runtime surface of this repository
contains no primitive capable of talking to anything outside the PostgreSQL database.** It scans
`packages/*/src/**/*.ts`, `packages/database/migrations/*.sql` and every package manifest; it strips
comments and string literals so prose cannot trip it; it matches imports only in import position;
and it distinguishes database-local signalling (`pg_notify`, `LISTEN`) from egress rather than
conflating the two.

N7 ends that property. There is no version of external transport that preserves "zero egress
capability".

**The failure mode to avoid is deleting the gate.** A validator removed in the commit that introduces
egress replaces a proof with an absence, and the next reviewer has no way to tell an approved socket
from an unapproved one.

## 2. The replacement property

```
BEFORE N7:  egress primitives exist nowhere.
AFTER  N7:  egress primitives exist ONLY at an enumerated adapter boundary,
            the enumeration is asserted, and widening it is a visible diff.
```

This is genuinely weaker, and saying so is part of the design. What it buys is that the question
"can this repository talk to the internet, and from exactly where?" still has a mechanical answer.

## 3. Gate design

### 3.1 Allowlist, not exemption

A single declared list — checked into the repository, reviewed like code:

```
EGRESS_ALLOWLIST = [
  'packages/<transport-pkg>/src/adapters/<adapter>/client.ts',
]
```

Properties the gate must have:

- **Exact paths, no globs, no directory prefixes.** `adapters/**` would let a second adapter arrive
  unreviewed. One line per file that may open a socket.
- **The allowlist's own contents are asserted** by a test, so adding an entry fails until the
  assertion is updated in the same change — the diff shows both.
- **Allowlist size is bounded** and asserted (`≤ 1` while a single adapter is approved). A growing
  list is exactly the drift this gate exists to make visible.
- **Non-allowlisted files keep the current rule**: any egress primitive anywhere else fails, with
  file and line.
- **An allowlisted file that contains no egress primitive also fails.** A stale entry is a standing
  permission nobody is using, and it will eventually be inherited by whatever moves into that path.

### 3.2 Manifests

Broker, queue and HTTP-client dependencies are currently prohibited in every manifest. Under N7 the
package that owns the adapter may declare exactly the client it needs — and only that package.

The manifest arm therefore gains a per-package allowlist, keyed by package **and** dependency name,
with the same properties: exact, asserted, bounded. A dependency approved for the transport package
is still prohibited in `@freightos/context`, `@freightos/database` and everywhere else.

### 3.3 What stays prohibited everywhere, without exception

- Egress primitives in `packages/database/migrations/*.sql` — `dblink`, `postgres_fdw`,
  `COPY … FROM/TO PROGRAM`, HTTP extensions. The database itself never talks to the network. N7's
  egress lives in an application process, and no migration may change that.
- Egress in `@freightos/context` — the disclosure evaluators are pure and must stay pure. The N6
  source gate already asserts this for `disclosure-delivery.ts`; N7 does not relax it.
- Egress in any test tree (already excluded from scanning; tests use a local fake receiver).

### 3.4 Adapter boundary must be mechanically identifiable

The allowlisted file is the adapter's **only** egress surface. The transport engine — obligation
selection, state machine, retry scheduling, attempt recording — must contain none, so that the
reviewable surface is one file rather than a package.

A structural gate should assert the shape, in the spirit of the N6 routing source gate: the
allowlisted module exports the adapter contract and nothing else, and imports no database handle.

## 4. Named CI step — closing `NETWORK_EGRESS_CI_OBSERVABILITY`

Today `pnpm validate:egress` runs inside the aggregate `Anti-overbuilding and autonomy ceiling` step.
It passes, and it has always passed — but a reader of the checks list cannot see it, which is why the
finding has stayed open through N5-B, N6 and this phase.

**Requirement:** a distinctly named CI step whose name states the property, e.g.

```
- name: External egress boundary
  run: pnpm validate:egress
```

so that the check appears by name on every PR, and a change to the egress posture is visible in the
checks list rather than only in a log. The finding closes when that step exists and is required —
**not** when the allowlist is introduced.

## 5. Failure output

A gate whose failure does not say what to do gets worked around. Required output:

```
EGRESS_VIOLATION  packages/foo/src/bar.ts:42  fetch(
  This file is not in EGRESS_ALLOWLIST. External network access is permitted only from
  the approved N7 adapter boundary. If this is intentional, it needs an owner ruling and
  an allowlist entry — not a local exemption.

EGRESS_ALLOWLIST_STALE  packages/.../client.ts
  Allowlisted but contains no egress primitive. Remove the entry.
```

## 6. Relationship to the mutation plan

Three mutations in `N7_MUTATION_PLAN.md` target this gate directly:

- `N7-M-20` — an egress primitive outside the allowlist must fail CI.
- `N7-M-22` — silently widening the allowlist must fail the allowlist-contents assertion.
- `N7-M-23` — a stale allowlist entry with no primitive must fail.

A gate that has never been observed to fail is a gate nobody has tested.

## 7. What this model does not claim

Carried forward verbatim from the existing validator's own statement of limits, because they are
unchanged: obfuscated or dynamically-constructed capability acquisition, capability reached
transitively through a dependency's own code, anything a superuser could do interactively, and
anything outside the scanned surfaces. **This raises the cost of adding egress and makes it
reviewable. It is not a sandbox.**

The SSRF controls in `N7_THREAT_MODEL.md` §5 are what constrain where an _approved_ socket may
connect. This gate constrains only where a socket may exist at all. Both are needed and neither
substitutes for the other.
