# 09 — Partner, Channel, and Deal Registration Architecture

## Goals

- scale distribution through industry relationships;
- prevent duplicate claims and channel conflict;
- preserve customer choice;
- make attribution evidence-based;
- prevent partners from creating unsupported commitments.

## Partner lifecycle

```text
APPLIED
 → DUE_DILIGENCE
 → CONTRACTED
 → TRAINING
 → CERTIFIED
 → ACTIVE
 → SUSPENDED / EXPIRED / TERMINATED
```

## Deal registration

A partner may register an account/opportunity with:

- prospect legal/business identity;
- source/evidence;
- contact consent/lawful basis where required;
- target product family;
- date/time;
- conflict check;
- expiry window.

Registration creates a claim for review, not permanent ownership of a customer.

## Conflict rules

Deterministic precedence should consider:

1. existing customer relationship;
2. active protected opportunity;
3. first qualified registration with sufficient evidence;
4. customer-requested seller/partner;
5. strategic account restrictions;
6. anti-gaming rules.

Manual override requires reason, approver, evidence, and append-only correction—not history deletion.

## Partner commercial models

Supported concepts may include:

- referral fee;
- first-year revenue share;
- recurring/residual share;
- reseller margin;
- implementation/services revenue;
- strategic co-sell.

The architecture does not set final percentages. Finance/legal/commercial approval controls program terms.

## Partner safety

Partners receive only the data needed for their role. They do not gain access to all customer/twin/network data because they sourced the account.
