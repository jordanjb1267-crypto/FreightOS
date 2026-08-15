# 07 — Pricing, Margin, and Negotiation

## Separation

Track separately:
- shipper sell rate
- carrier buy rate
- accessorial assumptions
- brokerage gross margin
- non-brokerage service compensation
- currency/tax where applicable.

## Deterministic money

Use integer minor units + ISO currency.
Every result records:
- inputs
- formula/policy
- rounding
- output
- timestamp
- actor/agent.

## Negotiation envelope

Broker agent may negotiate carrier buy only within:
- floor/ceiling
- target
- maximum exposure
- permitted counterparties
- validity
- terms
- shipper commitment constraints.

Shipper-side negotiation has its own envelope.

## Margin

`brokerage_margin = shipper_brokerage_revenue - carrier_transport_cost - explicitly allocated brokerage transaction costs` as configured.

Do not label cash timing as margin/profit.

## Approval

Examples requiring approval:
- margin below floor
- carrier buy above cap
- new accessorial waiver
- unapproved carrier
- credit exposure
- contract deviation.

## Agent behavior

Agent can:
- generate counter
- choose strategy
- explain alternatives
- recommend concession.

Agent cannot:
- invent market fact;
- disclose shipper confidential ceiling to carrier;
- disclose carrier confidential floor to shipper;
- collude across counterparties;
- exceed policy.

## Audit

Preserve negotiation proposals, commands and final terms according to policy/retention without storing unnecessary free-form sensitive reasoning.
