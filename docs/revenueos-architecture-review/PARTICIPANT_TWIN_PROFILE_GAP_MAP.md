# Participant Twin Profile Gap Map — COT / BOT / FOT / SOT / SPOT

Whether each participant profile can support human-led operation, agent assistance, collaborative
work, approval-to-execute and bounded autonomy — configured **per workflow and per action** — while
preserving that participant's own domain ownership and legal plane.

## 1. Verdict

**All five profiles are coherently specified against one shared contract, and none can be operated
today.** The profiles correctly preserve domain differences (TW-36) and correctly avoid requiring
system replacement (TW-32). Every one is blocked on the same four primitives.

## 2. The five profiles

From `matrices/PARTICIPANT_TWIN_INTERACTION_MATRIX.csv`:

| Profile                  | Existing systems kept                                  | Human augmentation                                                   | Critical boundary                                                 |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **COT** Carrier          | TMS, ELD, telematics, maintenance, accounting, email   | dispatch, documents, exceptions, maintenance coordination            | _carrier authority and private economics remain governed_         |
| **BOT** Broker           | broker TMS, CRM, email, carrier network, accounting    | RFQ, pricing, sourcing, coverage, tracking, reconciliation           | _Brokerage Plane / legal controls remain independent_             |
| **FOT** Facility         | WMS, YMS, ERP, appointment, gate systems               | appointment desk, driver comms, document intake, yard/dock exception | _no takeover of physical/safety authority_                        |
| **SOT** Shipper          | ERP, TMS, procurement, OMS, finance                    | transport intake, routing, visibility, exception/invoice review      | _shipper commercial authority stays local_                        |
| **SPOT** Service/RigDesk | shop/DMS, field service, scheduling, parts, accounting | intake, triage, estimate, scheduling, status                         | _diagnosis/intelligence does not authorize spend/physical action_ |

The `critical_boundary` column is the important one, and each entry is materially correct against
the accepted architecture:

- **FOT** — matches the accepted FacilityOS physical-authority prohibition and
  `safety_critical_motion_control: prohibited` on `facility_autonomous` in `config/pricing/products.yaml`.
- **BOT** — matches the v1.6 brokerage legal separation; `digital_brokerage` is
  `LEGAL_AND_MARKET_GATED` with `BROKERAGE_EXECUTION_ENABLED: false` CI-asserted.
- **SPOT** — matches Section 7's requirement that repair spend stay human-led.
- **COT / SOT** — preserve private economics and local commercial authority respectively.

**TW-36 (profiles preserve domain ownership differences) is satisfied at design level.**

## 3. Per-profile readiness

| Profile | Existing-system dependency                                    | Blocking primitives                                                                | Can operate today?                  |
| ------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| COT     | TMS + ELD + telematics — three authoritative external sources | fact-authority binding, adapters, egress, WorkUnit                                 | **no**                              |
| BOT     | broker TMS + CRM                                              | as COT, **plus** the brokerage legal gate (module `implementation_allowed: false`) | **no** — also horizon-blocked       |
| FOT     | WMS/YMS/ERP + gate systems                                    | as COT; `facilityos_lite` is PROMOTION_GATED                                       | **no** — also horizon-blocked       |
| SOT     | ERP + procurement + OMS                                       | as COT; `shipper_control_tower` is PROMOTION_GATED                                 | **no** — also horizon-blocked       |
| SPOT    | shop/DMS + parts                                              | as COT; `rigdesk_maintenance_hooks` is ACTIVE_BUILD                                | **no**, but **not horizon-blocked** |

**Only COT and SPOT sit inside Horizon 1.** BOT, FOT and SOT target modules whose state is
`implementation_allowed: false`, so those three profiles cannot be built at all without a promotion
decision. This is a sequencing fact the package does not state, and it substantially narrows what
the Twin can be next: a Carrier and Service-Provider Twin, not a five-sided network.

## 4. Per-workflow / per-action mode configuration

Section 7 requires modes be configurable per workflow and per action, never as one company-wide
flag. The design supports this:

- `matrices/HUMAN_AGENT_MODE_MATRIX.csv` defines the five modes with per-mode side-effect and
  promotion rules.
- `TWIN-G12` (`WorkflowModeChangeWorkUnit`) makes a mode change a governed, approved WorkUnit —
  i.e. mode is a **per-workflow** setting with its own change control.
- The five Twin fixtures instantiate different modes per participant:
  `carrier_existing_tms_assist_mode.json`, `facility_existing_wms_human_led.json`,
  `broker_existing_tms_hybrid_mode.json`, `shipper_existing_erp_connected.json`,
  `service_provider_existing_shop_system.json`.

The Section 7 target profile — documents = bounded autonomy, status = bounded autonomy, dispatch =
approval-execute, pricing = assist, exceptions = collaborate, repair spend = human-led — is fully
expressible. **No architectural change is required.** TW-20 scores PARTIAL only because nothing
enforces it.

**Commercial entitlement cannot silently raise operational autonomy**, on three independent
grounds: the mode matrix's _"no authority from mode"_; the capability catalog's conjunctive
`activation_rule`; and the CI autonomy clamp at A3 (`validate-scope.mjs:453`). This is the
Section 7 requirement most convincingly satisfied.

## 5. Gaps

### PT-01 — No Twin Job Book for any profile

50 owners across 12 Twin graphs, zero Job Books, and the provisional schema cannot express one
(`plane` enum excludes twin; `graph_membership` pattern excludes `TWIN-G##`). No profile has a
certified workforce. Conflict **C-04**; decision **D-10**.

### PT-02 — Profiles are not bound to graphs

The 12 Twin graphs are **profile-agnostic** — no graph declares which of COT/BOT/FOT/SOT/SPOT it
serves, and `PARTICIPANT_TWIN_INTERACTION_MATRIX.csv` names no graph. So the FOT boundary _"no
takeover of physical/safety authority"_ has no expression in TWIN-G04, the graph carrying
`operational_command`. The boundary lives only in a CSV.

This is the same defect as FC-02 in the cross-plane graphs: **domain differentiation asserted in a
matrix, absent from the state machines.** Conflict **C-10**.

### PT-03 — Three of five profiles are horizon-blocked

BOT, FOT, SOT target `implementation_allowed: false` modules. Building their Twins would require a
promotion decision under `module_states.yaml` `promotion_requires` (owner-approved ADR, predecessor
exit evidence, applicable gate, machine-readable state update, reviewed PR). Recorded as owner
decision **D-12**.

### PT-04 — Each profile needs 3–6 external adapters and none exists

COT alone requires TMS, ELD and telematics adapters. Zero adapter code exists; egress is zero. Every
profile's inbound path is blocked identically.

### PT-05 — No profile has a defined minimum viable scope

Nothing states the smallest useful Twin for any profile — which workflows, which systems, which
mode. Combined with D-11 (whether pre-adapter value is possible), this leaves the first
implementable increment undefined. This is a prerequisite for the proposed sequence, not a defect
in the architecture.

## 6. Required changes

1. Author Twin Job Books per profile (**PT-01 / C-04**, blocking).
2. Bind graphs to profiles and encode each `critical_boundary` in the relevant graph — especially
   FOT physical authority in TWIN-G04 (**PT-02 / C-10**, blocking).
3. Scope the first Twin to **COT or SPOT only** — the two profiles inside Horizon 1 (**PT-03**).
4. Define a minimum viable Twin scope for that profile (**PT-05 / D-11**).
