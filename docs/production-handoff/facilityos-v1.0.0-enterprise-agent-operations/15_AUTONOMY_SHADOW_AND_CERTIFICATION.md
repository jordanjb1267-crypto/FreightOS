# 15 — Autonomy, Shadow, and Certification

## Levels

A0 Observe
A1 Recommend
A2 Prepare
A3 Approval-to-Execute
A4 Policy-Bounded Autonomy
A5 Exception-Supervised

## Facility examples

A1:
- dock recommendation
- readiness forecast.

A2:
- prepare appointment change
- draft driver instruction
- prepare BOL correction request.

A3:
- human approves exact appointment reschedule
- human approves document operational acceptance
- human approves credential issuance.

A4 candidate after proof:
- routine appointment acceptance
- routine notifications
- low-risk credential issuance
- non-safety-critical staging/dock target update
- standard document receipt acknowledgement.

Never A4 through this general agent plane:
- physical safety interlock
- industrial motion
- unauthorized custody/legal acceptance
- high-risk facility/safety hold release.

## Shadow

Compare to real facility decisions.

Measure:
- appointment decision agreement
- BOL matching/validation
- dock recommendation
- exception detection
- document correction accuracy
- receipt/discrepancy preparation
- escalation correctness.

## Promotion

Per:
tenant + site + workflow + action + scope.

## Downgrade

On:
- FOT drift
- system schema change
- unexplained overrides
- security incident
- reconciliation mismatch
- safety hold
- evaluation regression
- customer request.
