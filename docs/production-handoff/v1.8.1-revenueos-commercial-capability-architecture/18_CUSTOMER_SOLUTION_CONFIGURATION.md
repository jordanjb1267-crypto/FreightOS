# 18 — Customer Solution Configuration

## RevenueOS output

The core commercial output is a structured `SolutionConfigurationProposal`, not merely a slide deck.

It contains:

- prospect/customer identity;
- participant/Twin(s);
- verified current workflows;
- pain/value evidence;
- proposed capabilities and versions;
- excluded/unneeded capabilities;
- required integrations;
- required data sources;
- proposed rollout mode per capability;
- requested autonomy vs supported/certified ceiling;
- implementation dependencies;
- gaps/unsupported requests;
- ROI scenarios and assumptions;
- commercial offer reference;
- approvals/evidence;
- customer Market Relevance Profile when an intelligence capability is proposed;
- required market-signal domains, source classes, freshness and consumer boundaries;
- explicit statement of which intelligence is informational versus eligible as governed workflow evidence.

## Minimalism rule

Recommend the smallest coherent configuration that solves the stated problem. Do not maximize SKU count by default.

## Gap taxonomy

- `CONFIGURABLE` — supported with customer configuration;
- `INTEGRATION_REQUIRED` — supported after approved adapter binding;
- `PILOT_ONLY` — not GA, controlled pilot possible;
- `PRODUCT_GAP` — not supported;
- `LEGAL_POLICY_BLOCK` — cannot offer until gate resolved;
- `OUT_OF_SCOPE` — not a FreightOS responsibility.

## Customer-facing explanation

Translate architecture to operating outcomes. Customers need not understand graph theory or agent manifests to adopt the system. Enterprise customers may inspect deeper architecture/security artifacts under controlled disclosure.
