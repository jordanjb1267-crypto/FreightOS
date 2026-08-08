# SR-2 — follow-on authority requirements

Capabilities the handoff or an accepted ADR requires, that SR-2 does **not** implement and must not.

Each section states the marker, the basis, the constraint in the current schema, the executable
evidence produced by the migrated test suite, and the positive acceptance criteria a future change
has to satisfy. None of them designs an implementation.

**Nothing in this file is a licence to widen SR-2.** Every one of these is recorded precisely so
that the pressure to close it inside PR #9 — by allowing enterprise/root human membership, by
weakening `assert_governing_legal_entity`, by widening membership semantics, or by adding an
authority term to a policy to turn an old test green — is refused with the requirement intact rather
than with the requirement lost.

---

## Section A — Tenant-wide human READ

```
NO_CONFIRMED_TEST_DERIVED_REQUIREMENT_YET
```

No current test independently confirms a requirement for a human principal to read across every
legal entity of a tenant.

This is a statement about **test-derived evidence**, not about the product. It does not mean the
product can never require tenant-wide read; it means nothing in the migrated suite establishes it,
and SR-2 will not manufacture the requirement from a fixture that merely looked like one.

**Two candidates were suspected and both were disproven by measurement.** They are recorded here so
they are not re-raised as evidence:

| Suspected case                                                                           | Why it looked tenant-wide                      | What measurement showed                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity-rls > cross-tenant isolation > shows a tenant only its own organization nodes` | expects the whole four-node tree of the tenant | Passes under the verified administrator scoped at the legal-entity node. The tree below a legal entity IS the tenant's tree in this fixture. Legitimate visibility, not tenant-wide read. |
| most of `organization-hierarchy`                                                         | 24 call sites naming the enterprise node       | The enterprise-node claim was not the cause. Correcting the scope alone moved 39 failures to 39; adding real verified sessions moved 39 to 14. The suite is legal-entity-local behaviour. |

Do not add `TENANT_WIDE_RUNTIME_READ_VISIBILITY`. Both suspicions dissolved on contact with a real
session, and they stay disproven.

**Executable R2 count: 0.**

---

## Section B — Tenant-wide human ADMINISTRATION and mutation

```
TENANT_WIDE_RUNTIME_ADMIN_AUTHORITY=REQUIRED_BY_HANDOFF_AND_UNIMPLEMENTED
```

### Handoff basis

`docs/production-handoff/v1.2/04_ENTERPRISE_SCALE_AND_TENANCY.md` describes an enterprise tier whose
administration spans legal entities — mega-carrier targets including enterprise-wide operations, and
an Enterprise → Legal Entity → … hierarchy in which the Enterprise level is a level of the
organization and not merely a container.

### The constraint in the current schema

`assert_governing_legal_entity` requires every membership to name an organization node that a legal
entity governs. The enterprise root sits **above** that boundary — nothing governs it — so no human
membership can be anchored there, and consequently no verified human principal can hold node scope
over more than one legal entity. `app.organization_node_scope_ok` resolves through the closure from
the node the membership names, so cross-legal-entity reach is not representable, not merely absent.

This is the schema as PR #5 and 0018 left it, and SR-2 treats it as governing SR-2's executable
semantics. The handoff governs the product requirement. The two are recorded separately and neither
overrides the other.

### Executable H2 evidence from the migrated suite

**0.**

Twenty-six failing cases were classified individually (see `SR2_DATABASE_GATE_EVIDENCE.md` §9). Not
one of them requires a human principal to administer across legal entities. Every case that looked
like it needed enterprise-wide human reach turned out to need either enterprise-wide **policy
application scope** (Section C, a different question) or **privileged topology setup** (Section D).

### Future positive acceptance criteria

When the capability is implemented, it must be provable that:

1. A principal holding the tenant-wide administrative capability can administer identity in **two
   different legal entities of one tenant** in one verified session, and the same principal cannot
   reach a third tenant.
2. A principal **without** it, holding an ordinary legal-entity membership, is refused the
   cross-entity operation — with the refusal attributable to the missing capability and not to
   tenant isolation. The negative must be same-tenant.
3. The capability is carried by data — a membership, role or grant that is itself administered
   through the governed boundary and appears in the audit ledger — and not by a session claim, a
   legal authority class, or an operating context.
4. Granting it is itself a governed authority mutation, subject to the 0010 self-elevation guards:
   an administrator cannot grant it to itself.
5. Every existing legal-entity-local denial in `identity-rls.test.ts` continues to hold for
   principals that do not carry it. The scope predicates must narrow, never widen.

---

## Section C — Enterprise / root POLICY declaration authority

```
TENANT_ROOT_POLICY_AUTHORITY=REQUIRED_BY_HANDOFF_AND_UNIMPLEMENTED
```

This is a different capability from Section B and must stay separate. Section B asks **who may act
across legal entities** — a question about a human's membership scope. This asks **where a control
may apply** — a question about policy scope. A control bound at the enterprise root could
legitimately be created through a control-plane or command path with no human holding
enterprise-wide membership at all. They may eventually share an authority architecture. SR-2 does
not assume it.

### Handoff basis, cited

`docs/production-handoff/v1.2/04_ENTERPRISE_SCALE_AND_TENANCY.md`:

- **line 20** — "Policies inherit downward. A child may tighten a restriction but cannot weaken
  legal, safety, **enterprise-minimum**, security, residency, or approval controls."
- **line 22** — "Every effective policy records inherited source and local override."
- **line 53** — mega-carrier targets, including **"Enterprise-wide policy updates"**.

An _enterprise-minimum_ control that inherits downward has to be declared somewhere above the legal
entities it constrains. "Every effective policy records inherited source" is exactly what the
dependent test asserts — that the terminal names the root as its source, at depth 3.

### The constraint in the current schema

`policy_bindings_insert` requires `app.organization_node_scope_ok(organization_node_id)`. A
legal-entity-scoped administrator does not hold the enterprise root, so the write is refused:

```
new row violates row-level security policy for table "policy_bindings"
```

That refusal is now asserted directly, by name, in
`organization-hierarchy.test.ts > policy inheritance > refuses an enterprise-root binding from a
legal-entity administrator, and takes it from the control plane`.

### What SR-2 covers today, and what it does not

Root bindings are created by **privileged control-plane fixture** — `bindPrivileged` in the policy
inheritance block, `bindAtPrivileged` in F-08. Every assertion that depends on one then runs under
the verified runtime administrator. This is acceptable current SR-2 coverage and it proves:

- inheritance downward to the terminal, with the root named as source at the right depth;
- the non-weakening rule across all six protected categories;
- that a descendant cannot escape a protected control by omitting or relabelling the category;
- that an unprotected control stays weakenable, and a tightening descendant is permitted.

It does **not** prove product root-policy declaration authority, and the fixture is not an answer to
it. A privileged connection writing the row proves nothing about who may legitimately declare an
enterprise-wide control; it only puts the world into the state the enforcement test needs.

### Future positive acceptance criteria

1. The principal or command path holding root-policy declaration authority can create and update a
   binding at the enterprise root with `legal_entity_id IS NULL`, in a verified session, without any
   privileged fixture.
2. A legal-entity-scoped principal without that authority is still refused the same write — the
   assertion named above must invert rather than disappear, so the boundary stays evidenced.
3. Provenance is recorded: the binding names who declared it, and the audit ledger carries the
   declaration as a governed mutation.
4. Enterprise-wide **update** and **revocation** are covered, not only creation. Line 53 says
   updates.
5. Every enforcement property listed above continues to hold unchanged once the fixture is replaced
   by the real path. That is the regression test for the change.

---

## Section D — PROVISIONING

```
PROVISIONING_TRUST_BOUNDARY=UNRESOLVED
```

### The circularity

A verified binding can only be minted for a principal that already exists with an active membership.
The first user of a tenant, the first membership, and the tenant's first enterprise root are
precisely the rows that would justify one. A verified runtime session therefore cannot create them,
and the gap is structural rather than an oversight.

Two further rows sit on the same boundary and were confirmed during this migration:

- **A tenant's first enterprise root.** `organization_nodes_insert` gates on tenant alone, so the
  statement is reachable — but the node has no parent and nothing governs it, so no membership can
  ever name it. `organization-hierarchy > F-03 > does not let two tenants block each other` needed
  a root created for a tenant with no identity at all, and models that explicitly as provisioning.
- **A tenant's second legal entity.** Its node is a sibling branch under the enterprise root, and no
  runtime principal holds a node above both. `identity-rls` provisions it through
  `seedSecondLegalEntity`.

### How SR-2 handles it, without resolving it

All provisioning runs over the **migrator** connection through the same governed boundaries a real
provisioning path would meet — `withLegalContext` for the legal context, `admin.grant_membership`
for the authorization graph, the platform bootstrap actor `system:tenant-provisioning` for the
operations no human can yet be authorised for. The connection remains fully RLS-subject: every table
involved carries `FORCE ROW LEVEL SECURITY`, so the seed is refused by exactly the policies
production would apply. What changed is which role performs it, not whether the rules apply.

`identity-harness.ts` (provisioning) and `verified-test-auth.ts` (authentication) are separate
modules on purpose, so the fixture path cannot quietly become the application's way in.

### Future positive acceptance criteria

1. A named, auditable trust boundary for tenant creation, distinct from both the runtime path and
   the migration path, with its own authority model.
2. Its authority is not a database superuser and not the migrator.
3. The first administrator of a tenant is created by it and is then reachable by an ordinary mint —
   proving the handover point, which is the part the circularity currently hides.
4. Every runtime refusal that exists today survives: a runtime principal must still be unable to
   create a tenant root, a sibling legal entity, or a membership outside its own scope.

---

## Addendum — a requirement confirmed by measurement, and then CLOSED

```
CONTEXT_CAPABILITY_MATRIX_RLS=ENFORCED_FOR_EVERY_RESOURCE_GROUP_WITH_TABLES
```

Recorded here as a follow-on requirement when it was found, and moved out of that status when it was
implemented. It never belonged with the three above: those are unresolved future design, whereas
this was an accepted ADR the runtime did not enforce — an implementation contradiction.

**Basis.** `adr/0019-software-only-operating-context-boundaries.md`, "The complete matrix", row
_Identity and organization_: `R/W` for `software_only`/`system`, `R (own)` for
`software_only`/`shipper_owned` and `software_only`/`facility_operator`, `R` for
`carrier_agent`/`carrier`, nothing for `software_only`/`autonomous_mobility`, `DENIED` for
`brokerage`/`brokerage`.

**Measured open.** A real verified `software_only`/`facility_operator` principal writing
`service_accounts` inside its own node scope succeeded. No identity policy carried a
legal-authority-class or operating-context term.

**Closed by migration 0021**, for every resource group that has tables. Audit, kill switches and the
nine unbuilt groups are accounted for in `SR2_DATABASE_GATE_EVIDENCE.md` §13.3 — audit and kill
switches are already compliant or stricter, and the nine stay with the migrations that will create
their tables, which is where ADR-0019 already assigned them.

**This addendum is retained rather than deleted** because the way the gap survived is the reusable
lesson: the test that claimed the cell passed for four migrations, on a row written outside the node
its context named. A denial is only evidence when it is the right denial.

---

## Section E — CONTROL-PLANE ACTOR AUTHENTICITY (finding F-A)

```
CONTROL_PLANE_ACTOR_AUTHENTICITY=UNRESOLVED
```

### What was measured

Two paths were probed for whether a holder of a legitimate connection role can name somebody else
as the authoritative actor. Measured on a fresh cluster at migration 23:

| Path                                                                                   | Result                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freightos_app` + `set_config('app.actor_id', 'user:<real admin>')`                    | **CLOSED by SR-2.** Every accessor returns NULL — `human`, `tenant`, `actor` — and the session reads zero rows. A raw GUC establishes nothing for the runtime role. |
| `freightos_admin` + `p_actor => 'user:<real admin>'` on `admin.move_organization_node` | **OPEN.** Returns `succeeded`, mutates the real `organization_node_closure`, and writes an audit row attributing the change to the borrowed human.                  |

Bounded by measurement, so the severity is not overstated: the permission check genuinely bites — a
real user who does **not** hold the required permission is refused — and no cross-tenant read was
achieved. The exposure is impersonation of an **already-privileged** human within a tenant, and the
forging of that human's provenance on a consequential command.

### Why this is not closable inside SR-2

It is the documented trust anchor, not an oversight. Migration 0020 §7 says of the mint:

> This does NOT authenticate anybody. It records that something already holding control-plane
> credentials asserted an authentication result — **the same trust anchor `admin.*` already rests
> on**, and the only one available until a production adapter exists.

ADR-0027 §7 records the matching decision: no authentication provider ships, and SR-2 deliberately
does not fabricate one. So the chain bottoms out at _whoever holds the control-plane credential_.
Making `admin.*` verify `p_actor` against a binding does not help, because minting a binding
requires exactly that credential — the caller would simply mint one naming the principal it wants.
Any "fix" inside SR-2 would be inventing the identity provider ADR-0027 forbids inventing.

### Positive acceptance criteria for a future change

A change closes this when the actor of a privileged `admin.*` call is derived from something the
calling connection cannot choose. The two candidates, neither of which is SR-2 scope:

1. **Per-operator login roles.** Each human control-plane operator authenticates as their own
   database role; `admin.*` requires `p_actor` to match `session_user`'s mapped principal, so
   naming another human is refused by the database rather than trusted. Changes the deployment
   model ADR-0020 describes, and needs a role-provisioning story.
2. **A real authentication provider** behind `packages/context/src/authentication-boundary.ts`,
   with `admin.*` consuming its assertion rather than a text parameter.

Until then the honest statement is the one this section makes: a control-plane credential _is_ the
authority, and the audit ledger records the actor that credential claimed. Do not describe the
admin boundary as proving who the human was.
