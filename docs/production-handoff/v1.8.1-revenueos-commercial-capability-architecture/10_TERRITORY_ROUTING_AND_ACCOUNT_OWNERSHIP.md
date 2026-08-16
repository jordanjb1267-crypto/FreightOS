# 10 — Territory, Routing, and Account Ownership

## Principle

Territories are routing and compensation constructs, not property rights over customers.

## Supported dimensions

- participant type;
- vertical/operating segment;
- company size;
- geography;
- named account;
- partner source;
- product family;
- strategic-account flag.

## Preferred early model

Use vertical/segment specialization where it improves domain credibility, with named-account protection for complex enterprise pursuits. Do not rely only on geography.

## Account identity

Account matching must normalize subsidiaries, DBAs, domains, parent groups, DOT/MC or facility identifiers where lawfully appropriate, and other business identities to prevent duplicates.

## Ownership state

```text
UNASSIGNED
 → ROUTED
 → ACCEPTED
 → ACTIVE_PURSUIT
 → PROTECTED
 → WON / LOST / RECYCLE
```

Protection requires activity/evidence and expires. Dormant accounts return to routing under policy.

## Anti-gaming

- bulk placeholder registrations do not create ownership;
- fake activity is auditable misconduct;
- seller-created duplicate accounts are merged through governed identity resolution;
- attribution cannot depend solely on mutable CRM owner field.
