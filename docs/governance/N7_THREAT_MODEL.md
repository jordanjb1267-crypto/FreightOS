# N7 External Transport — Threat Model

Frozen _before_ any adapter is written, because a filter designed alongside its own threat model
tends to enumerate the attacks its author already thought of.

> **Status after N7-A: still no executable egress.** N7-A built the control plane and the security
> boundary and added no network primitive — `NETWORK_EGRESS=PASS` holds, with zero approved modules.
> The attacker capabilities and controls below therefore describe the surface N7-B will introduce,
> not one that exists today. The two rows already realised are §5's role separation (the transport
> worker holds no N5 read and cannot mint its own permit) and the egress CI gate, which shipped
> before the thing it governs.

Companion to ADR-N0018. Scope: the boundary between a committed N6 inbox row and a byte leaving the
process.

---

## 1. Assets

| Asset                                  | Class                                            | Why an attacker wants it                                                 |
| -------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| N6 artifact `payload_canonical`        | `TENANT_CONFIDENTIAL` (per artifact sensitivity) | It is authorized disclosure content — real counterparty data.            |
| The set of artifacts a worker can read | `TENANT_CONFIDENTIAL`                            | Bulk access is worth far more than one artifact.                         |
| Destination endpoints                  | `INTERNAL`                                       | Knowing where a tenant's data goes is intelligence about the tenant.     |
| Destination credentials                | `SECRET`                                         | Impersonate FreightOS to a counterparty.                                 |
| Signing keys                           | `SECRET`                                         | Forge disclosures that appear FreightOS-authenticated.                   |
| Egress capability itself               | —                                                | A socket from inside the trust boundary is the asset. SSRF targets this. |
| N5-A/N5-B governed state               | `TENANT_CONFIDENTIAL`                            | Reveals commercial relationships, not just data.                         |
| Transport audit record                 | `AUDIT`                                          | Deleting it hides that a disclosure happened.                            |

## 2. Trust boundaries

```
  ┌─ FreightOS database ─────────────────────────────────────┐
  │  N3 journal · N4 intents · N5-A grants · N5-B ceilings    │
  │  N6 artifacts · N6 inbox            [authority lives here]│
  └───────────────┬──────────────────────────────────────────┘
                  │ B1: artifact read (least privilege)
  ┌───────────────▼─────────────┐
  │ N7 transport worker process │   B2: secret fetch ──► secret manager
  │  [no authority, only bytes] │
  └───────────────┬─────────────┘
                  │ B3: THE EGRESS BOUNDARY  ← irreversible
  ┌───────────────▼─────────────┐
  │ external counterparty       │   [outside all FreightOS control]
  └─────────────────────────────┘
```

**B3 is the only boundary in the network band that cannot be un-crossed.** N3–N6 failures are
recoverable by migration or correction; a byte past B3 is gone.

## 3. Adversaries

| #   | Adversary                                    | Capability assumed                                                  |
| --- | -------------------------------------------- | ------------------------------------------------------------------- |
| A1  | External network attacker                    | Can respond to our requests; can control DNS for a domain they own. |
| A2  | Malicious/compromised counterparty           | Legitimately registered as a destination; controls their endpoint.  |
| A3  | Tenant insider with destination-admin rights | Can create/modify destinations within their tenant.                 |
| A4  | Compromised transport worker process         | Full capability of the worker's DB role, secrets and sockets.       |
| A5  | Malicious contributor                        | Can propose code and tests; subject to CI and review.               |
| A6  | Compromised counterparty DNS                 | Can rebind a hostname between resolution and connection.            |

## 4. Threats and architectural disposition

### T-01 — SSRF: an endpoint aimed at internal infrastructure

**A3 or A5.** A destination endpoint is set to a loopback, private, link-local or cloud-metadata
address; the transport worker — inside the trust boundary — fetches it, and either exfiltrates the
response or performs an internal action.

**Disposition:** full control set in §5. Non-negotiable prerequisite for any HTTP adapter.

### T-02 — DNS rebinding (TOCTOU on the address)

**A6.** The hostname resolves to a public address at validation time and to `169.254.169.254` at
connect time. Validating the _name_ or validating then re-resolving both lose.

**Disposition:** **resolve once, validate every returned address, connect to the pinned IP** with
Host header and TLS SNI preserved. Validation and connection must use the _same_ address. Any adapter
that cannot pin the connection address is not eligible.

### T-03 — Redirect to a forbidden address

**A2.** The registered endpoint is legitimate; it replies `302` to `http://169.254.169.254/…`.

**Disposition:** **redirects are not followed.** A redirect is a terminal protocol outcome
(`protocol_invalid`), not a hop. If a destination legitimately moves, that is a destination change
through governed administration.

### T-04 — Caller-supplied destination

**A5.** A URL, host or endpoint override reaches the transport path as an argument.

**Disposition:** structurally impossible by ADR-N0018 — the endpoint is derived from
`destination_id`. Enforced by the egress source gate (no `url`, `endpoint`, `host`, `address`,
`target` parameter names in the adapter's exported surface) and by mutation `N7-M-01`.

### T-05 — Artifact sent to the wrong recipient's destination

**A3 or A5.** Artifact authorized for organization A is transported to a destination owned by B.

**Disposition:** `DATABASE-BOUND`. The obligation row carries `recipient_participant_id` once and
both composite foreign keys resolve against it, so the mismatch is unrepresentable. This is R-08 and
R-11 applied to N7. Mutations `N7-M-02`, `N7-M-03`.

### T-06 — Payload widened or regenerated in transport

**A5.** The adapter re-projects from the event, or an envelope field leaks unauthorized content.

**Disposition:** N7 transmits `payload_canonical` verbatim; the digest is verified against the
artifact immediately before send. Envelope fields are an allowlist and none may be derived from
payload content. Mutation `N7-M-04`.

### T-07 — Retry changes something

**A5.** A retry recomputes fields, picks another destination, or mints a new idempotency key.

**Disposition:** the obligation is the identity; the attempt is not. Same artifact, same destination,
same bytes, same key. Mutations `N7-M-05`, `N7-M-06`, `N7-M-13`.

### T-08 — Send after revocation

**A2.** A destination is revoked while an attempt is pending or a retry is scheduled.

**Disposition:** eligibility is re-checked **immediately before** the network call, fail-closed, and
again as a database predicate at obligation selection. Revocation stops the future; it does not
rewrite history. Mutation `N7-M-07`.

### T-09 — Kill switch ignored or checked too early

**A4/A5.** Egress is disabled but a worker already past the check still sends.

**Disposition:** the check is the **last thing before the socket**, not part of obligation selection.
Suppression is recorded and does not consume an attempt. Mutation `N7-M-08`.

### T-10 — Secret disclosed through logs, metrics or attempt records

**A4/A5.** An `Authorization` header, signing key or credential lands in a log line, an attempt row
or an error message.

**Disposition:** attempt records carry an allowlist of metadata; headers and secrets are never
persisted or logged; redaction is asserted by test. Mutation `N7-M-11`.

### T-11 — Remote response body persisted or logged

**A2.** A counterparty returns a body containing their own PII, our secrets echoed back, or a payload
designed to poison logs.

**Disposition:** arbitrary bodies are **not** persisted. Where an adapter needs acknowledgement data,
it declares an allowlisted parsed acknowledgement schema and stores only those fields, with a size
bound. Mutation `N7-M-12`.

### T-12 — Misclassified remote outcome

**A2.** A permanent rejection is retried forever, or a transient failure is terminated permanently
and a legitimate disclosure is silently dropped.

**Disposition:** closed failure taxonomy (§7), no generic `failed`, per-adapter mapping asserted by
test. Mutations `N7-M-16`, `N7-M-17`.

### T-13 — Slow-loris / unbounded attempt

**A2.** The endpoint accepts the connection and trickles bytes indefinitely, pinning a worker slot.

**Disposition:** connect timeout, response timeout **and a whole-attempt deadline** — the deadline is
the control, because per-request timeouts do not bound a request that keeps making progress. Mutation
`N7-M-18`.

### T-14 — One destination starves every other

**A2.** A counterparty is slow; obligations for everyone else queue behind it.

**Disposition:** per-destination concurrency caps, per-adapter caps, global cap, and `Retry-After`
honoured with a bounded ceiling.

### T-15 — Egress from an unapproved module

**A5.** `fetch()` appears somewhere outside the adapter boundary.

**Disposition:** allowlist egress gate, named CI step, allowlist contents asserted. See
`N7_EGRESS_CI_MODEL.md`. Mutation `N7-M-20`.

### T-16 — External attempt with no valid obligation

**A4/A5.** A code path sends bytes without a persisted, currently-valid N7 obligation.

**Disposition:** the adapter accepts only an immutable transport request constructed from a persisted
obligation, and the worker's DB path cannot reach artifacts otherwise. Mutations `N7-M-19`,
`N7-M-21`.

### T-17 — Compromised worker reads every artifact

**A4.** The egress process is compromised and enumerates authorized artifacts.

**Disposition:** least-privilege artifact read — reachable only through a valid obligation, never a
broad browse. Coupled to the worker-separation ruling (`OR-02`) and the fresh-N5 ruling (`OR-05`);
see ADR-N0018 "The coupling the owner must see".

### T-18 — Authorization revoked between inbox commit and egress

**A3 legitimately.** A grantor revokes; the artifact is already committed internally and an external
send is pending.

**Disposition:** **undecided by design.** This is owner ruling `OR-05`, with three options and an
explicit trade-off table. Not silently chosen.

---

## 5. SSRF control set — frozen, prerequisite to any HTTP adapter

**No filter is being written now.** This is the specification the eventual filter must satisfy, and
each line is a test case in `N7_MUTATION_PLAN.md`.

### 5.1 Scheme and URL surface

- `https` only. `http`, `file`, `gopher`, `ftp`, `data`, `blob` and every other scheme rejected.
- **No userinfo.** `https://user:pass@evil.example@internal/` is rejected outright rather than parsed.
- Port: explicit allowlist (443 by default). Not "block 22, 25, 6379" — allow, don't deny.
- Hostname normalization before any check: lowercase, IDN → punycode, strip trailing dot
  (`internal.` and `internal` are the same host), reject embedded whitespace/control characters and
  encoded separators.
- Maximum URL length; reject fragments and reject credentials in any position.

### 5.2 Address validation — applied to every resolved address

Both families, and the encodings that hide them:

| Family           | Denied                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPv4             | `0.0.0.0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16` (link-local **and metadata**), `172.16/12`, `192.0.0/24`, `192.168/16`, `198.18/15`, `224/4`, `240/4`, broadcast |
| IPv6             | `::`, `::1`, `fc00::/7` (ULA), `fe80::/10` (link-local), `ff00::/8` (multicast), `2001:db8::/32`                                                                                 |
| Mapped/tunnelled | `::ffff:0:0/96` (v4-mapped — **validate the embedded v4**), `2002::/16` (6to4), `2001::/32` (Teredo), NAT64 `64:ff9b::/96`                                                       |
| Cloud metadata   | `169.254.169.254`, `fd00:ec2::254`, and any provider-specific metadata address for the deployment                                                                                |

**Numeric encodings must be normalized before matching**, or the table is decorative: decimal integer
(`2130706433`), octal (`0177.0.0.1`), hex (`0x7f000001`), short forms (`127.1`), mixed forms. The rule
is _parse to a canonical address, then match_ — never string-match the input.

### 5.3 Resolution and connection — the rebinding control

```
1. normalize URL, reject on scheme/userinfo/port/host shape
2. resolve hostname → set of addresses
3. reject if the set is empty, or if ANY address is denied   ← any, not all
4. pin ONE permitted address
5. connect to the pinned address, preserving Host header and TLS SNI
6. verify TLS certificate against the HOSTNAME, not the pinned IP
```

Rejecting when **any** returned address is denied — rather than filtering to the permitted ones — is
deliberate: a name that resolves to both a public and a private address is not a name we want to talk
to. Step 4→5 is what defeats T-02, and any adapter that cannot pin the connection address is
ineligible regardless of its other properties.

### 5.4 Redirects, proxies, and time

- Redirects: **not followed** (T-03).
- Proxy: if the deployment routes egress through a proxy, address validation happens at the proxy or
  the proxy itself is the pinned destination — a proxy that resolves the name itself silently
  reintroduces every control above. This must be stated per deployment, not assumed.
- DNS TTL and resolution timing count against the whole-attempt deadline.

### 5.5 What SSRF controls do _not_ cover

Stated so the control set is not mistaken for more than it is: a **legitimately registered**
destination that is itself hostile (A2). Nothing here stops a counterparty who is entitled to receive
a disclosure from doing something unwelcome with it. That is the disclosure-authority question, and
it was answered by N5 before N7 ever saw the artifact.

---

## 6. Endpoint authority

```
authenticated destination administration  →  governed persisted destination  →  worker derives endpoint
```

- Destination creation and modification require an authenticated principal with an explicit
  permission, tenant-scoped to the recipient organization — the same shape as N6's
  `network.disclosure_subscription.create`.
- **Endpoint identity is immutable.** Changing where data goes is creating a new destination and
  revoking the old one, not an `UPDATE`. This keeps "where did this artifact actually go" answerable
  from the audit record alone.
- Who may administer a destination — recipient-side, grantor-side, or platform operator — is owner
  ruling `OR-06`.

## 7. Failure taxonomy — closed, candidate

Refine before freezing. `failed` alone is prohibited: it collapses "we are misconfigured" with "they
are down", and the two have different operators and different urgency.

| Code                        | Retryable       | Meaning                                                          |
| --------------------------- | --------------- | ---------------------------------------------------------------- |
| `configuration_invalid`     | no              | Destination or adapter config cannot produce a valid request.    |
| `destination_disabled`      | no              | Revoked or deactivated before the attempt.                       |
| `egress_disabled`           | no (suppressed) | Kill switch active. Should not consume an attempt.               |
| `authorization_withdrawn`   | no              | Fresh N5 refused at egress (only under `OR-05` Option B/C).      |
| `authentication_failed`     | no              | Credential rejected. Retrying re-sends a bad credential.         |
| `address_rejected`          | no              | SSRF control refused the resolved address.                       |
| `connection_failed`         | yes             | TCP/TLS failure.                                                 |
| `timeout`                   | yes             | Deadline exceeded.                                               |
| `rate_limited`              | yes             | 429 / adapter equivalent; honour `Retry-After` within a ceiling. |
| `remote_rejected_retryable` | yes             | 5xx or adapter-declared transient rejection.                     |
| `remote_rejected_terminal`  | no              | 4xx or adapter-declared permanent rejection.                     |
| `protocol_invalid`          | no              | Redirect, malformed response, unparseable acknowledgement.       |
| `internal_error`            | yes, bounded    | Our defect. Bounded so a bug cannot retry forever.               |

`egress_disabled` and `authorization_withdrawn` are **not transport failures** and are separated
deliberately: an operator reading a dashboard must be able to tell "we chose not to send" from "we
tried and could not".

## 8. Residual risk — accepted and stated

| #    | Residual                                                              | Why it is accepted                                                              |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| RR-1 | A legitimately registered destination misuses received data.          | N5's question, answered before N7.                                              |
| RR-2 | Remote duplicate processing when a receiver ignores idempotency keys. | Cannot be fixed unilaterally; modelled honestly in §9 rather than papered over. |
| RR-3 | The egress guarantee weakens from _zero_ to _bounded_.                | Unavoidable for any external transport. Mitigated by allowlist + named CI.      |
| RR-4 | Obfuscated capability acquisition (`globalThis['fet'+'ch']`).         | Already out of scope for the existing gate. Raises cost; not a sandbox.         |
| RR-5 | Compromised secret manager.                                           | Outside FreightOS's boundary; bounded by rotation and per-destination scoping.  |

## 9. Delivery guarantee — stated honestly

FreightOS can guarantee, on its own side:

```
at-most-one successful FreightOS transport obligation per (artifact, destination)
at-least-once transport attempts under retry
```

It **cannot** guarantee exactly-once external delivery. That requires the receiver to participate —
by honouring an idempotency key or by being idempotent in its own domain. Where a receiver does
neither, remote duplicate processing is a real risk (RR-2) and must be stated in that adapter's
documentation rather than implied away by the word "delivered".
