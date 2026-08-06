# Legacy EDI Adapter Profile

## Purpose

Support X12/EDIFACT and partner-specific files without allowing legacy positional/message assumptions to define the canonical model.

## Requirements

- partner, transaction set/message, version, and implementation guide;
- interchange/control-number dedupe;
- acknowledgement handling;
- code/qualifier mappings;
- timezone, unit, and decimal rules;
- rejected-segment visibility;
- replay and reconciliation;
- secure transport and credential rotation;
- test fixtures stripped of sensitive production data.
