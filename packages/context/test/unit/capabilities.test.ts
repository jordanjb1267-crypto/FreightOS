import { describe, expect, it } from 'vitest';
import {
  RESOURCE_GROUPS,
  CapabilityError,
  assertCapability,
  capabilityFor,
  contextCapabilities,
  isPermittedAction,
  type ResourceGroup,
} from '../../src/capabilities.ts';
import {
  LEGAL_AUTHORITY_CLASSES,
  OPERATING_CONTEXTS,
  PERMITTED_CONTEXTS,
  type LegalAuthorityClass,
  type OperatingContext,
} from '../../src/legal.ts';

/**
 * ADR-0019 §RLS consequences requires the full 3 x 6 pairing cross-product to be tested, and the
 * matrix to agree with `app.is_permitted_legal_pairing`. This file covers the application half;
 * packages/database/test/integration/identity-rls.test.ts covers the database half and asserts the
 * two agree.
 */

const PAIRS: readonly (readonly [LegalAuthorityClass, OperatingContext])[] =
  LEGAL_AUTHORITY_CLASSES.flatMap((c) => OPERATING_CONTEXTS.map((o) => [c, o] as const));

describe('the 3 x 6 legal-pairing cross-product', () => {
  it('covers all eighteen pairs', () => {
    expect(PAIRS).toHaveLength(18);
  });

  it('grants something only where ADR-0015 rule 6 permits the pairing', () => {
    for (const [legalClass, context] of PAIRS) {
      const permitted = PERMITTED_CONTEXTS[legalClass].includes(context);
      const set = contextCapabilities(legalClass, context);
      const grantsSomething = RESOURCE_GROUPS.some((g) => set[g].read || set[g].write);

      if (!permitted) {
        expect(grantsSomething, `${legalClass}/${context}`).toBe(false);
      }
    }
  });

  it('denies every resource group for an impermissible pairing', () => {
    for (const [legalClass, context] of PAIRS) {
      if (PERMITTED_CONTEXTS[legalClass].includes(context)) continue;
      const set = contextCapabilities(legalClass, context);
      for (const group of RESOURCE_GROUPS) {
        expect(set[group].denied, `${legalClass}/${context} ${group}`).toBe(true);
      }
    }
  });

  it('denies every resource group under brokerage, which is the permitted brokerage pairing', () => {
    const set = contextCapabilities('brokerage', 'brokerage');
    for (const group of RESOURCE_GROUPS) {
      expect(set[group].denied, group).toBe(true);
      expect(set[group].read, group).toBe(false);
      expect(set[group].write, group).toBe(false);
    }
  });

  it('never lets an operating context widen what its legal class permits', () => {
    // ADR-0015 rule 5. software_only holds no carrier-and-fleet or economics write under any of
    // its four contexts; only carrier_agent does.
    for (const context of PERMITTED_CONTEXTS.software_only) {
      const set = contextCapabilities('software_only', context);
      expect(set.carrier_and_fleet.write, context).toBe(false);
      expect(set.cost_profiles_and_profitability.write, context).toBe(false);
      expect(set.load_opportunities.write, context).toBe(false);
      expect(set.assignments_and_dispatch.write, context).toBe(false);
    }
    expect(contextCapabilities('carrier_agent', 'carrier').carrier_and_fleet.write).toBe(true);
  });
});

describe('software_only / system — tenant administration', () => {
  it('reads and writes identity and organization', () => {
    expect(isPermittedAction('software_only', 'system', 'identity_and_organization', 'read')).toBe(
      true,
    );
    expect(isPermittedAction('software_only', 'system', 'identity_and_organization', 'write')).toBe(
      true,
    );
  });

  it('reads but does not write the domain surfaces it oversees', () => {
    for (const group of ['freight_core', 'facility_primitives', 'carrier_and_fleet'] as const) {
      expect(isPermittedAction('software_only', 'system', group, 'read'), group).toBe(true);
      expect(isPermittedAction('software_only', 'system', group, 'write'), group).toBe(false);
    }
  });

  it('has no access at all to economics', () => {
    const capability = capabilityFor('software_only', 'system', 'cost_profiles_and_profitability');
    expect(capability.read).toBe(false);
    expect(capability.write).toBe(false);
    expect(capability.denied).toBe(false);
  });
});

describe('software_only / shipper_owned', () => {
  it('writes planning records but never awards, brokers, dispatches or executes', () => {
    const capability = capabilityFor('software_only', 'shipper_owned', 'freight_core');
    expect(capability.write).toBe(true);
    expect(capability.qualifier).toContain('no award, broker, dispatch or execute');
  });

  it('may not act for a carrier', () => {
    for (const group of [
      'carrier_and_fleet',
      'assignments_and_dispatch',
      'load_opportunities',
    ] as const) {
      expect(isPermittedAction('software_only', 'shipper_owned', group, 'read'), group).toBe(false);
      expect(isPermittedAction('software_only', 'shipper_owned', group, 'write'), group).toBe(
        false,
      );
    }
  });

  it('writes custody only on the release side', () => {
    const capability = capabilityFor('software_only', 'shipper_owned', 'custody_events');
    expect(capability.write).toBe(true);
    expect(capability.qualifier).toBe('release side');
  });
});

describe('software_only / facility_operator', () => {
  it('reads and writes facility primitives', () => {
    expect(
      isPermittedAction('software_only', 'facility_operator', 'facility_primitives', 'write'),
    ).toBe(true);
  });

  it('may not dispatch, reassign, or touch carrier and fleet', () => {
    for (const group of ['carrier_and_fleet', 'assignments_and_dispatch'] as const) {
      expect(isPermittedAction('software_only', 'facility_operator', group, 'write'), group).toBe(
        false,
      );
    }
  });

  it('sees freight core only for in-scope shipments', () => {
    const capability = capabilityFor('software_only', 'facility_operator', 'freight_core');
    expect(capability.read).toBe(true);
    expect(capability.write).toBe(false);
    expect(capability.qualifier).toBe('in-scope shipments');
  });
});

describe('software_only / autonomous_mobility — standing suspension', () => {
  it('marks its own resource group suspended, not merely absent', () => {
    const capability = capabilityFor('software_only', 'autonomous_mobility', 'autonomous_mobility');
    expect(capability.suspended).toBe(true);
    expect(capability.read).toBe(false);
    expect(capability.write).toBe(false);
  });

  it('grants no operational write anywhere', () => {
    const set = contextCapabilities('software_only', 'autonomous_mobility');
    for (const group of RESOURCE_GROUPS) {
      expect(set[group].write, group).toBe(false);
    }
  });

  it('can still read kill switches and its own audit trail', () => {
    expect(isPermittedAction('software_only', 'autonomous_mobility', 'kill_switches', 'read')).toBe(
      true,
    );
    expect(isPermittedAction('software_only', 'autonomous_mobility', 'audit', 'read')).toBe(true);
  });
});

describe('carrier_agent / carrier', () => {
  it('holds the operational write surface the other contexts do not', () => {
    for (const group of [
      'carrier_and_fleet',
      'cost_profiles_and_profitability',
      'load_opportunities',
      'assignments_and_dispatch',
    ] as const) {
      expect(isPermittedAction('carrier_agent', 'carrier', group, 'write'), group).toBe(true);
    }
  });

  it('reads identity and organization without writing it', () => {
    expect(isPermittedAction('carrier_agent', 'carrier', 'identity_and_organization', 'read')).toBe(
      true,
    );
    expect(
      isPermittedAction('carrier_agent', 'carrier', 'identity_and_organization', 'write'),
    ).toBe(false);
  });

  it('writes kill switches only at tenant scope', () => {
    expect(capabilityFor('carrier_agent', 'carrier', 'kill_switches').qualifier).toBe(
      'tenant scope only',
    );
  });

  it('has no access to autonomous mobility', () => {
    const capability = capabilityFor('carrier_agent', 'carrier', 'autonomous_mobility');
    expect(capability.read).toBe(false);
    expect(capability.write).toBe(false);
    expect(capability.suspended).toBe(false);
  });
});

describe('fail-closed behaviour', () => {
  it('denies an unknown legal class rather than returning an empty set', () => {
    const set = contextCapabilities('not_a_class' as LegalAuthorityClass, 'carrier');
    for (const group of RESOURCE_GROUPS) {
      expect(set[group].denied, group).toBe(true);
    }
  });

  it('denies an unknown operating context', () => {
    const set = contextCapabilities('software_only', 'not_a_context' as OperatingContext);
    for (const group of RESOURCE_GROUPS) {
      expect(set[group].denied, group).toBe(true);
    }
  });

  it('treats denied and suspended as refusals, not merely as absent grants', () => {
    expect(isPermittedAction('brokerage', 'brokerage', 'audit', 'read')).toBe(false);
    expect(
      isPermittedAction('software_only', 'autonomous_mobility', 'autonomous_mobility', 'read'),
    ).toBe(false);
  });

  it('covers every resource group for every permitted pair with a defined capability', () => {
    for (const [legalClass, context] of PAIRS) {
      const set = contextCapabilities(legalClass, context);
      for (const group of RESOURCE_GROUPS) {
        expect(set[group], `${legalClass}/${context} ${group}`).toBeDefined();
      }
    }
  });
});

describe('assertCapability', () => {
  it('is silent for a permitted action', () => {
    expect(() =>
      assertCapability('carrier_agent', 'carrier', 'carrier_and_fleet', 'write'),
    ).not.toThrow();
  });

  it('throws CapabilityError naming the pair, group and action', () => {
    try {
      assertCapability('software_only', 'facility_operator', 'carrier_and_fleet', 'write');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityError);
      const capabilityError = error as CapabilityError;
      expect(capabilityError.legalAuthorityClass).toBe('software_only');
      expect(capabilityError.operatingContext).toBe('facility_operator');
      expect(capabilityError.group).toBe('carrier_and_fleet');
      expect(capabilityError.action).toBe('write');
      expect(capabilityError.message).toContain('capability refused');
    }
  });

  it('throws for every brokerage resource group', () => {
    for (const group of RESOURCE_GROUPS) {
      expect(() => assertCapability('brokerage', 'brokerage', group, 'read'), group).toThrow(
        CapabilityError,
      );
    }
  });
});

describe('the matrix is complete', () => {
  it('names the twelve ADR-0019 resource groups', () => {
    expect(RESOURCE_GROUPS).toHaveLength(12);
  });

  it('returns frozen capability objects so a caller cannot widen one in place', () => {
    const capability = capabilityFor('carrier_agent', 'carrier', 'freight_core');
    expect(Object.isFrozen(capability)).toBe(true);
    const group: ResourceGroup = 'freight_core';
    expect(capabilityFor('carrier_agent', 'carrier', group)).toBe(capability);
  });
});
