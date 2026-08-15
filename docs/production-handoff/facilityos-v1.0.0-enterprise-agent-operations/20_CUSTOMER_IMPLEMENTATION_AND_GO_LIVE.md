# 20 — Customer Implementation and Go-Live

## Productized implementation

### Phase 0 Scope
Site(s), workflows, outcomes, systems, security.

### Phase 1 Facility discovery
Build candidate FOT.

### Phase 2 Systems
Connect read-only ERP/WMS/YMS/TMS/docs/appointment sources.

### Phase 3 Workflow mapping
Shipping, receiving, appointment, visit, BOL, dock, custody, discrepancy.

### Phase 4 Agent organization
Instantiate canonical manifests.

### Phase 5 Shadow
Observe facility decisions and document flows.

### Phase 6 A3
Approval-to-execute selected actions.

### Phase 7 A4
Certified bounded actions.

### Phase 8 Network expansion
Connect carrier/shipper flows and more sites.

## Fast single-site onboarding

1. Create facility.
2. Define shipping/receiving offices.
3. Import gates/docks/hours.
4. Define appointment/driver rules.
5. Define BOL/document requirements.
6. Connect email/WMS/YMS/TMS if supported.
7. Test driver QR visit.
8. Test BOL submission.
9. Test office review.
10. Shadow visits.
11. Go live narrow scope.

## Enterprise

- SSO/security
- multi-site import
- data/system ownership
- regional policy inheritance
- EDI/API
- sandbox
- canary site/shift/carrier
- rollout waves.

## No big-bang

Start:
one site + one workflow + selected carriers/shift
then expand.
