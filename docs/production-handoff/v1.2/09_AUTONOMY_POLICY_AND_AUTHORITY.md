# Autonomy, Policy, and Authority

## Levels

A0 Observe; A1 Recommend; A2 Prepare; A3 Approval-to-Execute; A4 Policy-Bounded Autonomy; A5 Exception-Supervised Operation.

A5 is not unrestricted.

## Risk classes

### Green

Read, calculate, rank, summarize, classify, draft internally.

### Yellow

Send communication, counter, confirm appointment, assign driver, accept ordinary load, submit invoice, request detention.

### Red

Sign/amend contract, move money, change bank data, allocate freight among unrelated carriers, accept exceptional high-value cargo, release risk hold, settle claim, override compliance, change authority, change autonomy policy, disable audit.

## Policy request

Actor, tenant, organization scope, legal entity, authority mode, resource, action, parameters, exposure, risk, freshness, confidence, requested autonomy.

## Policy result

allow, deny, or require_approval, with policy version, reasons, constraints, approvers, expiration, and evidence.

## Approval binding

Approval binds tenant, action, resource, counterparty, rate, equipment, driver, appointment, exposure, and expiration. Material change invalidates it.

## Kill switches

System → legal plane → tenant → workflow → agent → tool → integration.

Modes: enabled, read-only, approval-only, autonomous disabled, communications disabled, financial disabled, suspended.

## Carrier-Agent boundary

Requires written carrier relationship, carrier policy, specified carrier, no cross-carrier allocation, no opposite-side compensation, no freight-payment handling, and no acceptance without carrier context.

## Brokerage boundary

Required for direct shipper freight acceptance, open-market carrier sourcing, selection among unrelated carriers, both-side negotiation, brokerage compensation, brokerage records, and network allocation.

## Absolute physical-control prohibitions

No tenant policy, approval, agent manifest, MCP client, administrator, or feature flag may authorize FreightOS to perform the dynamic driving task, remote driving, warehouse robotics control, industrial PLC writes, or safety-interlock overrides.

Permitted A4 facility actions are limited to non-safety-critical scheduling, credentials, commercial holds, operational targets, notifications, evidence, and workflow transitions. Provider/facility systems may reject every target.

Live autonomous missions require the separate Autonomous Vehicle Activation Gate and remain scoped by provider, vehicle, ODD, corridor, facility, cargo, equipment, customer, time, and policy version.
