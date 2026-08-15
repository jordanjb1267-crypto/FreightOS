# 11 — Appointments, Capacity, and Detention

## Appointment

Versioned commitment:
- parties
- facility
- shipment/work
- window
- service type
- equipment
- requirements
- status
- source
- revision history.

## Capacity

FacilityOS can model:
- dock capability/availability
- operating calendar
- yard/staging capacity
- service duration distributions
- receiving/shipping capacity signals
- external labor/resource availability summaries.

Forecasts are not authoritative capacity unless policy says how they are used.

## Appointment automation

Policy-bounded:
- suggest
- accept
- reschedule
- reject
depending autonomy certification.

Always propagate downstream impact to FreightOS.

## Detention

Clock inputs:
- appointment terms
- qualifying arrival
- check-in
- service start
- service complete
- release/departure
- holds/exclusions
- contract/policy.

Detention result must preserve:
- formula/policy version
- timestamps/evidence
- disputed periods.

AI cannot invent contractual free time.

## Driver visibility

Driver can see:
- qualifying recorded timestamps
- current visit state
- detention evidence status where authorized
without receiving unrelated commercial data.
