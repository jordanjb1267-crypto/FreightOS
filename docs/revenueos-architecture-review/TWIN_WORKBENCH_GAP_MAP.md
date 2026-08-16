# Twin Workbench Gap Map

Whether the proposed human control surface (package file `62_TWIN_WORKBENCH_AND_HUMAN_CONTROL_SURFACE.md`)
can be implemented coherently over current primitives.

## 1. Verdict

**Coherent as a design; entirely unbuildable today.** The repository contains **no application
layer of any kind** — no HTTP server, no route, no view, no client. The workbench is not blocked by
a missing feature; it is blocked by the absence of the tier it would live in.

This matters more than it first appears: the workbench is what makes the Twin valuable to a
human-heavy customer before any autonomy exists. Without it, "FreightOS as an added employee" has
no surface through which a human works.

## 2. The nine proposed panels

| Panel                      | Requires                                  | Exists               | Nearest existing primitive                                                         |
| -------------------------- | ----------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| **My Work**                | WorkUnit + owner + assignment             | **NO**               | none — no WorkUnit                                                                 |
| **Agent Work**             | agent identity + agent-owned WorkUnits    | **NO**               | `config/agents/registry.yaml` (declared, `allowed_tools: []`, no runtime consumer) |
| **Needs Approval**         | approval gate bound to an exact version   | **NO**               | DB-enforced approval exists for `admin.*` control-plane ops only (`0013`, `0026`)  |
| **Exceptions**             | exception model + ownership               | **NO**               | W0/W1: _"any exception/incident model"_ — absent                                   |
| **Network Inbox / Outbox** | inbound + outbound network artifacts      | **YES (data layer)** | `network_disclosure_inbox`, `_deliveries`, `_delivery_attempts` (`0034`)           |
| **Systems & Sync**         | system bindings + sync state + health     | **NO**               | no adapter, no binding table                                                       |
| **Twin Knowledge**         | Twin configuration store + versions       | **NO**               | none                                                                               |
| **Workflow Modes**         | per-workflow mode config + change control | **NO**               | `HUMAN_AGENT_MODE_MATRIX.csv` + TWIN-G12 are design only                           |
| **Evidence / Audit**       | append-only reconstruction                | **YES (data layer)** | `audit_events` (`0003`, `0006`, `0031`), `network_events` (`0029`)                 |

**Two of nine panels have a real data layer.** Both are the ones the network work already built.
The other seven have nothing to render.

## 3. The structural gap: no application tier

`packages/` contains exactly five packages — `config`, `context`, `database`, `identity`, `schemas` —
totalling ~110 TypeScript files, of which the majority under `database` are tests. There is:

- no `apps/` directory;
- no HTTP server, router, or endpoint;
- no frontend framework, component, or view;
- no session/auth surface for a human user (there is `app.session_binding` and
  `authn.operator_binding` at the database layer, but no login path);
- and, by CI gate, no network primitive at all — `config/network/egress-allowlist.json`
  `expectedCount: 0`, which also forbids `node:http` in import position.

**The zero-egress gate currently forbids the very primitive an HTTP server needs.** Building a
workbench therefore requires an allowlist entry and an owner-reviewed architectural decision — the
manifest's comment says as much: _"Adding an entry is an owner-reviewed act."_

That is a genuine and non-obvious sequencing constraint: **the first UI is gated by the same control
as the first outbound integration.** Recorded as owner decision **D-13**.

## 4. Gaps

### WB-01 — No application tier exists _(blocking)_

TW-38 NOT_IMPLEMENTED. Seven of nine panels have no backing data model; two have data but no
surface.

### WB-02 — Seven panels are blocked on WorkUnit

My Work, Agent Work, Needs Approval, Exceptions, Systems & Sync, Twin Knowledge and Workflow Modes
all require constructs that do not exist. The workbench cannot be sequenced before the WorkUnit
layer, which is also true of every graph in the package.

### WB-03 — "Not chatbot-only" is the correct requirement and has no substrate

TW-38 explicitly requires queues, approvals, exceptions and handoffs rather than chat-only
operation. This is the right requirement — a chat-only surface cannot express ownership, queue
position, or approval scope, and would quietly reintroduce the ambiguity the WorkUnit model exists
to remove. Nothing in the repository provides a queue or an approval surface.

### WB-04 — No exception model anywhere

The Exceptions panel needs one; W0/W1 recorded none exists. The accepted v1.8 package has
`05_EXCEPTION_OWNERSHIP_STANDARD.md`, which v1.8.1 does not reference — and which is also the
document that would resolve the undefined `HOLD` state (GN-02/GF-01). **The exception model is a
shared dependency of the workbench and of every graph's failure path**, which argues for building it
early.

### WB-05 — Evidence panel is the closest to feasible

`audit_events` is append-only with purpose and outcome, hardened by function ACL (`0031`), and
`network_events` is an append-only journal with an event-class enum. Reconstruction of _network and
audit_ events is genuinely supported. What is missing is WorkUnit-level provenance — who owned what,
when, and what they approved — because no WorkUnit exists. TW-34 scores PARTIAL on this split.

## 5. What a human-heavy customer can do today

**Nothing.** There is no interface. This is the concrete form of the finding in
OPERATIONAL_TWIN_RUNTIME_GAP_MAP §5: the design supports pre-autonomy value through OBSERVE/ASSIST
modes, but a human cannot reach it, because the workbench that would deliver it does not exist and
sits behind the application tier, the WorkUnit layer, and an egress decision.

Any claim that FreightOS can act as "an added employee" today is unsupportable for this reason
alone — see [`CLAIM_BOUNDARY_ASSESSMENT.md`](CLAIM_BOUNDARY_ASSESSMENT.md).

## 6. Required changes

1. Owner decision on introducing an application tier and the egress-allowlist entry it needs
   (**WB-01 / D-13**, blocking).
2. Build the exception model early — shared by the workbench and by all 36 graphs' failure paths
   (**WB-04**).
3. Sequence the workbench after WorkUnit; the Evidence and Network Inbox/Outbox panels can lead,
   since both have real data layers (**WB-02, WB-05**).
