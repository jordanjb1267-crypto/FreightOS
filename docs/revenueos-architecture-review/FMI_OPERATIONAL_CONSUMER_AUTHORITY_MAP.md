# FMI Operational Consumer Authority Map

Tests **H11**: Carrier, Brokerage, FacilityOS, Shipper and Service Provider/RigDesk workforces can
consume market intelligence as **evidence** without any intelligence component acquiring authority
to command a domain action.

## 1. Verdict

**H11 holds in shape and fails in binding.** The forbidden edge _signal → command_ does not exist
anywhere in the 36 graphs. The permitted path is structurally correct. But the component that
executes the command at the end of that path has no Job Book, no certification, and no autonomy
ceiling, and all five participant domains share a single WorkUnit type — so the boundary cannot be
enforced per participant.

## 2. The required path, and what the artifacts actually contain

Section 13 requires:

```
FMI signal → participant-domain consumer → participant evaluation → proposal
           → policy/authority/autonomy/approval → registered command
```

`XPL-G01..G06` implement exactly this, in six nodes:

| Node            | State       | Owner                                            | Side effect             | Retry                    |
| --------------- | ----------- | ------------------------------------------------ | ----------------------- | ------------------------ |
| `XC1_READ`      | signal read | Carrier/Broker/Facility/Shipper/Service Consumer | none                    | none                     |
| `XC2_INTERPRET` | interpreted | Participant-domain agent/service                 | none                    | none                     |
| `XC3_POLICY`    | evaluated   | Participant authority/policy plane               | none                    | none                     |
| `XC4_APPROVAL`  | approved    | Participant approval service/human               | none                    | none                     |
| `XC5_COMMAND`   | commanded   | **Participant command executor**                 | **`logistics_command`** | `reconcile_before_retry` |
| `XC6_RECON`     | reconciled  | Participant reconciliation service               | none                    | none                     |

Guarded edges into the command:

```
XC3_POLICY --[operational_policy, guard: decision=ALLOW]--------------> XC5_COMMAND
XC3_POLICY --[operational_policy, guard: decision=APPROVAL_REQUIRED]--> XC4_APPROVAL
XC4_APPROVAL --[human_or_service_approval, guard: approved=true]------> XC5_COMMAND
```

**There is no edge from any FMI node to any command node in any graph.** The forbidden direct
effect is structurally impossible in the package as shipped. `XC5_COMMAND` is also the only node in
36 graphs carrying `reconcile_before_retry` on a logistics command — the correct retry semantics.

## 3. The consumer boundaries, as declared

`matrices/MARKET_SIGNAL_CONSUMER_MATRIX.csv` (6 rows) names a `prohibited_direct_effect` per
consumer. This is a well-formed artifact:

| Consumer     | Allowed use                                             | Prohibited direct effect                                                        |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| RevenueOS    | briefs, discovery, solution fit, expansion              | operational command; unsupported urgency; prospect use of private customer data |
| Carrier      | planning, profitability, feasibility, exception context | load acceptance; driver assignment; negotiation without domain authority        |
| Brokerage    | pricing context, sourcing, margin risk                  | quote/tender/award bypassing pricing-credit-margin authority                    |
| FacilityOS   | arrival pressure, staffing/readiness, appointment risk  | gate admission; dock assignment; custody                                        |
| _(rows 5–6)_ | shipper; service/RigDesk                                | procurement/award; repair spend and roadside dispatch                           |

These map cleanly onto the accepted v1.8 job owners they must not displace
(`carrier/profitability`, `brokerage/shipper_pricing`, `facility/appointment`, …).

## 4. Gaps

### FC-01 — The command executor has no Job Book _(highest severity in the package)_

`XC5_COMMAND`'s owner is `"Participant command executor"` — a role category. It appears in no Job
Book, has no `certification`, no autonomy ceiling, and no command contract. The
`graph_membership` pattern in `schemas/provisional-job-book.schema.json` is
`^(REV|FMI|XPL)-G[0-9]{2}$`, so an XPL Job Book **is** expressible — none was written. The single
node in the package that can affect physical freight operations is the one node with no accountable
job. Conflict **C-05**.

### FC-02 — All five domains share one WorkUnit type and one node set

XPL-G02..G06 differ from each other only in `graph_id`, `name`, a `consumers` label, and one
appended prose invariant. Their `nodes`, `edges`, `terminal_states`, `trigger`, and `workunit_type`
are **byte-identical**, and all six use `workunit_type: OperationalDecisionWorkUnit`.

Consequences:

- A carrier dispatch decision, a broker pricing decision, a facility capacity decision, a shipper
  procurement decision and a maintenance spend decision are **the same WorkUnit type in the same
  state machine**. The invariant _"one WorkUnit has exactly one accountable owner"_ cannot select
  an owner, because the owner is a category shared by five legal planes.
- GR-21..GR-24 (carrier/broker/facility/service consumption) cannot be scored independently — there
  is only one graph, replicated. All four score PARTIAL.
- The `prohibited_direct_effect` column in the consumer matrix has **no counterpart in the graphs**.
  Nothing in XPL-G03 prevents the broker path from reaching a tender command; the prohibition lives
  only in a CSV.

**Required change:** either give each participant its own WorkUnit type and bind `XC5_COMMAND` to
that domain's accepted v1.8 job, or collapse XPL-G02..G06 into XPL-G01 and stop implying five
domain-specific controls exist. Conflict **C-10**.

### FC-03 — Facility physical authority needs the stricter FacilityOS rule

The accepted FacilityOS package and `config/pricing/products.yaml` set
`safety_critical_motion_control: prohibited` on `facility_autonomous`. XPL-G04's generic
`logistics_command` does not carry that prohibition. The stricter accepted rule controls; the graph
must inherit it explicitly rather than rely on the CSV.

### FC-04 — Brokerage consumption crosses a legal gate the graph does not mention

`digital_brokerage` is `LEGAL_AND_MARKET_GATED`, `implementation_allowed: false`,
`BROKERAGE_EXECUTION_ENABLED: false` (CI-asserted). XPL-G03 contains no legal-gate check. The
capability catalog does carry it (`brokerage legal activation gates + …`), so the package knows the
rule — the graph does not encode it.

### FC-05 — `HOLD` is the failure sink for the command path

All six XPL graphs route node failure to undefined `HOLD`. A denied policy evaluation, a refused
approval, and a failed command reconciliation all land in the same ownerless state — in the only
graphs that touch physical operations.

## 5. Adversarial cases

| Attack                                                                  | Outcome                  | Basis                                                                                       |
| ----------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| Market-rate signal bypasses carrier profitability/acceptance            | **blocked structurally** | no FMI→command edge; `XC3_POLICY` mandatory                                                 |
| Capacity/rate signal bypasses broker pricing/credit/margin/tender/award | **partly open**          | no edge exists, but FC-02: no broker-specific authority in the graph; FC-04: no legal gate  |
| Facility-impact forecast controls gate/dock/custody                     | **partly open**          | FC-03: motion-control prohibition not inherited                                             |
| Maintenance-market alert triggers repair spend / roadside dispatch      | **partly open**          | FC-01: executor unowned                                                                     |
| RevenueOS market agent gains operational command authority              | **blocked**              | `may_execute_logistics_command: false` 20/20; `production_logistics_authority: false` 37/37 |
| FMI signal directly commands                                            | **blocked**              | no such edge in 36 graphs                                                                   |
| Duplicate command on retry                                              | **mitigated**            | `XC5_COMMAND` is `reconcile_before_retry` — correct                                         |

## 6. Required changes

1. Author an XPL Job Book for the command executor, or bind `XC5_COMMAND` per participant to that
   domain's accepted v1.8 job (**FC-01 / C-05**, blocking).
2. Per-participant WorkUnit types, or collapse the five duplicate graphs (**FC-02 / C-10**,
   blocking).
3. Encode the FacilityOS motion-control prohibition and the brokerage legal gate in the graphs
   (**FC-03, FC-04**).
4. Define and own `HOLD` (**FC-05**).
