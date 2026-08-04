import { describe, expect, it } from 'vitest';
import {
  AUTONOMY_LEVELS,
  autonomyRank,
  effectiveMaximumAutonomy,
  horizonCeiling,
  minAutonomy,
  moduleCeiling,
  type AutonomyLevel,
} from '../../src/autonomy.ts';
import {
  loadAgentRegistry,
  loadScopeRegistry,
  resolveAgent,
  resolveModule,
} from '../../src/scope.ts';

describe('autonomy ladder', () => {
  it('orders A0 < A1 < A2 < A3 < A4 < A5', () => {
    const ranks = AUTONOMY_LEVELS.map(autonomyRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('minAutonomy returns the least permissive input', () => {
    expect(minAutonomy('A4', 'A3', 'A5')).toBe('A3');
    expect(minAutonomy('A0', 'A5')).toBe('A0');
    expect(minAutonomy('A2')).toBe('A2');
  });

  it('minAutonomy of nothing is A0, not unbounded', () => {
    expect(minAutonomy()).toBe('A0');
  });

  it('horizon 1 caps at A3', () => {
    expect(horizonCeiling(1)).toBe('A3');
  });
});

describe('moduleCeiling', () => {
  const base = { authorizedHorizon: 1, declaredAutonomyMax: undefined } as const;

  it('gives A0 to a module that is not implementable', () => {
    for (const state of [
      'PROMOTION_GATED',
      'CUSTOMER_GATED',
      'LEGAL_AND_MARKET_GATED',
      'PARTNER_AND_SAFETY_GATED',
      'LIQUIDITY_GATED',
      'INTERFACE_AND_SIMULATION_ONLY',
      'DORMANT',
    ]) {
      expect(moduleCeiling({ ...base, state, horizon: 1 })).toBe('A0');
    }
  });

  it('gives A0 to an active module whose horizon is beyond the authorized one', () => {
    expect(moduleCeiling({ ...base, state: 'ACTIVE_BUILD', horizon: 2 })).toBe('A0');
  });

  it('gives A0 when a module declares no horizon at all', () => {
    expect(moduleCeiling({ ...base, state: 'ACTIVE_BUILD', horizon: undefined })).toBe('A0');
  });

  it('honours a declared module ceiling', () => {
    expect(
      moduleCeiling({ ...base, state: 'ACTIVE_BUILD', horizon: 1, declaredAutonomyMax: 'A3' }),
    ).toBe('A3');
  });
});

describe('effectiveMaximumAutonomy — ADR-0018', () => {
  const activeCarrierModule = {
    state: 'ACTIVE_BUILD',
    horizon: 1,
    declaredAutonomyMax: 'A3' as AutonomyLevel,
    authorizedHorizon: 1,
  };

  it('clamps a declared A4 down to the module ceiling', () => {
    expect(effectiveMaximumAutonomy({ declared: 'A4', module: activeCarrierModule })).toBe('A3');
  });

  it('clamps a declared A5 down to the module ceiling', () => {
    expect(effectiveMaximumAutonomy({ declared: 'A5', module: activeCarrierModule })).toBe('A3');
  });

  it('never raises a declared level that is already lower', () => {
    expect(effectiveMaximumAutonomy({ declared: 'A1', module: activeCarrierModule })).toBe('A1');
  });

  it('holds at A3 even if a module entry is tampered to claim A5', () => {
    // The horizon backstop is what makes this safe: editing module_states.yaml is not enough.
    const tampered = { ...activeCarrierModule, declaredAutonomyMax: 'A5' as AutonomyLevel };
    expect(effectiveMaximumAutonomy({ declared: 'A5', module: tampered })).toBe('A3');
  });

  it('is never above any single input, across the whole cross-product', () => {
    const states = ['ACTIVE_BUILD', 'FOUNDATION_ONLY', 'PROMOTION_GATED', 'DORMANT'];
    for (const declared of AUTONOMY_LEVELS) {
      for (const state of states) {
        for (const horizon of [1, 2, undefined]) {
          for (const declaredAutonomyMax of [...AUTONOMY_LEVELS, undefined]) {
            const module = { state, horizon, declaredAutonomyMax, authorizedHorizon: 1 };
            const result = effectiveMaximumAutonomy({ declared, module });
            expect(autonomyRank(result)).toBeLessThanOrEqual(autonomyRank(declared));
            expect(autonomyRank(result)).toBeLessThanOrEqual(autonomyRank(moduleCeiling(module)));
            expect(autonomyRank(result)).toBeLessThanOrEqual(autonomyRank(horizonCeiling(1)));
          }
        }
      }
    }
  });
});

describe('the real registry — owner ruling 6', () => {
  const registry = loadScopeRegistry();
  const agents = loadAgentRegistry();

  it('authorizes horizon 1 and stops after it', () => {
    expect(registry.horizon_authorized).toBe(1);
    expect(registry.stop_after_horizon).toBe(1);
  });

  it('caps every carrier agent at A3 or lower', () => {
    const carrier = agents.filter((a) => a.legal_authority_class === 'carrier_agent');
    expect(carrier.length).toBeGreaterThan(0);
    for (const agent of carrier) {
      const resolved = resolveAgent(registry, agent);
      expect(
        autonomyRank(resolved.effectiveAutonomy),
        `${agent.id} resolved to ${resolved.effectiveAutonomy}`,
      ).toBeLessThanOrEqual(autonomyRank('A3'));
    }
  });

  it('actually clamps the agents the handoff declared at A4', () => {
    const declaredA4 = agents.filter((a) => a.maximum_autonomy === 'A4');
    expect(declaredA4.length).toBeGreaterThan(0);
    for (const agent of declaredA4) {
      const resolved = resolveAgent(registry, agent);
      expect(resolved.clamped).toBe(true);
      expect(autonomyRank(resolved.effectiveAutonomy)).toBeLessThan(autonomyRank('A4'));
    }
  });

  it('reduces every deferred-module agent to A0', () => {
    for (const agent of agents) {
      const module = resolveModule(registry, agent.module);
      if (module.implementable) continue;
      expect(resolveAgent(registry, agent).effectiveAutonomy, `${agent.id}`).toBe('A0');
    }
  });

  it('leaves no agent above A3 anywhere in the registry', () => {
    for (const agent of agents) {
      const resolved = resolveAgent(registry, agent);
      expect(autonomyRank(resolved.effectiveAutonomy), agent.id).toBeLessThanOrEqual(
        autonomyRank('A3'),
      );
    }
  });

  it('grants no agent any tool, because no tool registry exists yet', () => {
    for (const agent of agents) {
      expect(agent.allowed_tools, agent.id).toEqual([]);
    }
  });
});
