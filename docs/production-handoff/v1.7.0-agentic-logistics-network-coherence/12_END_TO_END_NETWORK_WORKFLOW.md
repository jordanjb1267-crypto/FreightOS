# 12 — End-to-End Network Workflow

## Representative brokered road shipment

```text
1 Shipper creates demand
2 Brokerage agent receives RFQ
3 Broker quote accepted
4 Broker sources qualified carrier
5 Carrier agent evaluates tender
6 Carrier accepts
7 Carrier agent assigns driver/asset
8 FacilityOS confirms origin readiness/appointment
9 Driver arrives/checks in
10 BOL/document exchange
11 Load + custody evidence
12 Carrier journey executes
13 Destination FacilityOS receives ETA
14 Driver presents delivery docs
15 Unload + goods receipt / discrepancy
16 POD/receipt evidence
17 FreightOS propagates completion
18 Broker reconciles accessorials
19 Shipper invoice prepared
20 Carrier payable/status recorded
21 Broker transaction record closed
22 Carrier/RigReceipts economics reconcile
23 RigDesk evaluates next asset mission/readiness
```

## Communication principle

Each participant owns its internal decision.

Example:
- broker proposes/tenders;
- carrier independently accepts;
- facility independently admits/schedules;
- service provider independently accepts work.

No central model impersonates every company.

## Exception propagation

A breakdown can produce:

```text
RigDesk asset exception
→ Carrier dispatch impact
→ FreightOS shipment ETA impact
→ FacilityOS appointment impact
→ Broker customer-service impact
→ Shipper commitment impact
```

Each receives only authorized information necessary for its role.

## Evidence chain

A completed shipment can reconstruct:
shipper commitment → broker tender → carrier assignment → facility custody → transit → receipt/POD → invoice/pay records.

That shared causality is a core network asset.
