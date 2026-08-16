# 06 — Product Catalog and SKU Model

## Catalog layers

1. **Capability registry** — what the product can support.
2. **Offer catalog** — what may be sold now.
3. **SKU catalog** — how an offer is priced/metered commercially.
4. **Bundle catalog** — optional grouping of SKUs.
5. **Entitlement template** — rights created when contracted.
6. **Activation template** — technical prerequisites; never auto-approved from payment alone.

## Offer eligibility

A capability can appear in the sellable catalog only when:

- lifecycle status allows it;
- owner exists;
- support model exists;
- capability contract is complete;
- applicable workforce certification threshold is satisfied or offer explicitly says pilot/shadow;
- required security/legal/product approvals exist;
- known limitations are represented.

## Catalog source of truth

There shall be one canonical source consumed by:

- sales UI;
- proposal generator;
- partner portal;
- pricing engine;
- contract/order generation;
- entitlement service;
- implementation handoff;
- expansion recommendations;
- customer admin UI where applicable.

Marketing copy may render from it but cannot override it.

## SKU design doctrine

Use customer value units where possible. Avoid proliferating SKUs for every internal agent. A single capability SKU may map to multiple workforce components.

## Examples — illustrative, not launch prices

- `carrier.dispatch.core`
- `carrier.documents.core`
- `carrier.maintenance.coordination`
- `facility.appointment.core`
- `facility.gate_dock.coordination`
- `facility.documents.core`
- `shipper.execution.visibility`
- `network.integration.volume`

Prices and final names require commercial owner approval and are intentionally not set by this architecture package.
