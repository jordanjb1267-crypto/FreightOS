import { describe, expect, it } from 'vitest';
import {
  CROSS_TENANT_KILL_SWITCH_SCOPES,
  KILL_SWITCH_MODES,
  KILL_SWITCH_SCOPES,
  capabilitiesFor,
  modeRestrictiveness,
  resolveKillSwitch,
  type KillSwitchRecord,
} from '../../src/kill-switch.ts';

describe('kill-switch vocabulary', () => {
  it('carries the seven scopes 09_AUTONOMY_POLICY names plus the two OQ-19 added, in order', () => {
    expect(KILL_SWITCH_SCOPES).toEqual([
      'system',
      'legal_plane',
      // ADR-0019 requirement 7 names legal entity and operating context as kill-switch targets and
      // neither existed. OQ-19 added them; migration 0014 does the same to the database enum.
      'legal_entity',
      'operating_context',
      'tenant',
      'workflow',
      'agent',
      'tool',
      'integration',
    ]);
  });

  it('keeps the seven Phase 0 scopes present and unmoved relative to each other', () => {
    const phase0 = ['system', 'legal_plane', 'tenant', 'workflow', 'agent', 'tool', 'integration'];
    expect(KILL_SWITCH_SCOPES.filter((s) => phase0.includes(s))).toEqual(phase0);
  });

  it('carries seven modes ordered most to least permissive', () => {
    expect(KILL_SWITCH_MODES).toHaveLength(7);
    expect(KILL_SWITCH_MODES[0]).toBe('enabled');
    expect(KILL_SWITCH_MODES.at(-1)).toBe('suspended');
    const ranks = KILL_SWITCH_MODES.map(modeRestrictiveness);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('never grants a capability that a more restrictive mode also grants', () => {
    // Monotonicity: capabilities may only be withdrawn as restrictiveness increases.
    const keys = [
      'reads',
      'mutations',
      'autonomousExecution',
      'communications',
      'financial',
      'humanApproval',
    ] as const;
    for (let i = 1; i < KILL_SWITCH_MODES.length; i += 1) {
      const looser = capabilitiesFor(KILL_SWITCH_MODES[i - 1]!);
      const tighter = capabilitiesFor(KILL_SWITCH_MODES[i]!);
      for (const key of keys) {
        if (tighter[key]) {
          expect(looser[key], `${KILL_SWITCH_MODES[i]}.${key}`).toBe(true);
        }
      }
    }
  });

  it('suspends everything under `suspended`', () => {
    const caps = capabilitiesFor('suspended');
    expect(Object.values(caps).every((v) => v === false)).toBe(true);
  });

  it('blocks autonomous execution but keeps human approval under read-only... except reads', () => {
    expect(capabilitiesFor('read_only').reads).toBe(true);
    expect(capabilitiesFor('read_only').mutations).toBe(false);
    expect(capabilitiesFor('read_only').humanApproval).toBe(false);
  });
});

describe('resolution precedence — most restrictive wins', () => {
  const tenantId = 'tenant-a';

  it('is enabled when nothing applies', () => {
    expect(resolveKillSwitch([], { tenantId }).mode).toBe('enabled');
  });

  it('lets a system switch override a narrower enabled switch', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'system', scopeRef: null, mode: 'suspended' },
      { scope: 'tenant', scopeRef: tenantId, mode: 'enabled' },
      { scope: 'tool', scopeRef: 'tool-1', mode: 'enabled' },
    ];
    const resolved = resolveKillSwitch(records, { tenantId, toolId: 'tool-1' });
    expect(resolved.mode).toBe('suspended');
    expect(resolved.capabilities.reads).toBe(false);
  });

  it('lets a narrow switch tighten a broad enabled switch', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'system', scopeRef: null, mode: 'enabled' },
      { scope: 'agent', scopeRef: 'dispatch-agent', mode: 'autonomous_disabled' },
    ];
    const resolved = resolveKillSwitch(records, { tenantId, agentId: 'dispatch-agent' });
    expect(resolved.mode).toBe('autonomous_disabled');
    expect(resolved.capabilities.autonomousExecution).toBe(false);
    expect(resolved.capabilities.mutations).toBe(true);
  });

  it('ignores switches scoped to a different subject', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'tenant', scopeRef: 'tenant-b', mode: 'suspended' },
    ];
    expect(resolveKillSwitch(records, { tenantId: 'tenant-a' }).mode).toBe('enabled');
  });

  it('reports every contributing switch, most restrictive first', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'tenant', scopeRef: tenantId, mode: 'communications_disabled' },
      { scope: 'system', scopeRef: null, mode: 'read_only' },
      { scope: 'agent', scopeRef: 'a1', mode: 'approval_only' },
    ];
    const resolved = resolveKillSwitch(records, { tenantId, agentId: 'a1' });
    expect(resolved.mode).toBe('read_only');
    expect(resolved.appliedBy.map((r) => r.mode)).toEqual([
      'read_only',
      'communications_disabled',
      'approval_only',
    ]);
  });

  it('resolves to the maximum restrictiveness across any combination', () => {
    for (const a of KILL_SWITCH_MODES) {
      for (const b of KILL_SWITCH_MODES) {
        const resolved = resolveKillSwitch(
          [
            { scope: 'system', scopeRef: null, mode: a },
            { scope: 'tenant', scopeRef: tenantId, mode: b },
          ],
          { tenantId },
        );
        const expected = modeRestrictiveness(a) >= modeRestrictiveness(b) ? a : b;
        expect(resolved.mode).toBe(expected);
      }
    }
  });
});

/**
 * OQ-19. ADR-0019 requirement 7 names legal entity and operating context as kill-switch targets;
 * neither existed. The binding requirement alongside adding them is backward compatibility: a
 * caller written before OQ-19 must resolve exactly as it did.
 */
describe('OQ-19 — legal_entity and operating_context scopes', () => {
  const LEGAL_ENTITY = '33333333-3333-4333-8333-333333333333';

  it('lists operating_context as cross-tenant and legal_entity as tenant-scoped', () => {
    expect(CROSS_TENANT_KILL_SWITCH_SCOPES).toContain('operating_context');
    expect(CROSS_TENANT_KILL_SWITCH_SCOPES).not.toContain('legal_entity');
    expect(CROSS_TENANT_KILL_SWITCH_SCOPES).toEqual(['system', 'legal_plane', 'operating_context']);
  });

  it('resolves a legal_entity switch when the request names that entity', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'legal_entity', scopeRef: LEGAL_ENTITY, mode: 'read_only' },
    ];
    expect(resolveKillSwitch(records, { legalEntityId: LEGAL_ENTITY }).mode).toBe('read_only');
  });

  it('does not apply a legal_entity switch to a different entity', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'legal_entity', scopeRef: LEGAL_ENTITY, mode: 'suspended' },
    ];
    expect(resolveKillSwitch(records, { legalEntityId: 'other' }).mode).toBe('enabled');
  });

  it('resolves an operating_context switch', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'operating_context', scopeRef: 'autonomous_mobility', mode: 'suspended' },
    ];
    expect(resolveKillSwitch(records, { operatingContext: 'autonomous_mobility' }).mode).toBe(
      'suspended',
    );
    expect(resolveKillSwitch(records, { operatingContext: 'carrier' }).mode).toBe('enabled');
  });

  it('lets a broader scope override a narrower, more permissive one', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'legal_entity', scopeRef: LEGAL_ENTITY, mode: 'enabled' },
      { scope: 'operating_context', scopeRef: 'carrier', mode: 'read_only' },
    ];
    const resolution = resolveKillSwitch(records, {
      legalEntityId: LEGAL_ENTITY,
      operatingContext: 'carrier',
    });
    expect(resolution.mode).toBe('read_only');
  });

  it('never lets a narrower scope loosen a broader one', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'system', scopeRef: null, mode: 'suspended' },
      { scope: 'operating_context', scopeRef: 'carrier', mode: 'enabled' },
      { scope: 'legal_entity', scopeRef: LEGAL_ENTITY, mode: 'enabled' },
      { scope: 'tenant', scopeRef: 'tenant-a', mode: 'enabled' },
    ];
    const resolution = resolveKillSwitch(records, {
      tenantId: 'tenant-a',
      legalEntityId: LEGAL_ENTITY,
      operatingContext: 'carrier',
    });
    expect(resolution.mode).toBe('suspended');
  });

  it('takes the most restrictive across old and new scopes together', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'tenant', scopeRef: 'tenant-a', mode: 'approval_only' },
      { scope: 'legal_entity', scopeRef: LEGAL_ENTITY, mode: 'financial_disabled' },
      { scope: 'operating_context', scopeRef: 'carrier', mode: 'communications_disabled' },
    ];
    const resolution = resolveKillSwitch(records, {
      tenantId: 'tenant-a',
      legalEntityId: LEGAL_ENTITY,
      operatingContext: 'carrier',
    });
    expect(resolution.mode).toBe('financial_disabled');
    expect(resolution.appliedBy[0]!.mode).toBe('financial_disabled');
    expect(resolution.appliedBy).toHaveLength(3);
  });

  it('leaves a pre-OQ-19 request resolving exactly as it did', () => {
    // A caller that supplies neither new field cannot match a new-scope record: scopeRef is a
    // string and the unsupplied request field is undefined, so the comparison is always false.
    const records: KillSwitchRecord[] = [
      { scope: 'tenant', scopeRef: 'tenant-a', mode: 'approval_only' },
      { scope: 'legal_entity', scopeRef: LEGAL_ENTITY, mode: 'suspended' },
      { scope: 'operating_context', scopeRef: 'carrier', mode: 'suspended' },
    ];
    expect(resolveKillSwitch(records, { tenantId: 'tenant-a' }).mode).toBe('approval_only');
  });

  it('does not match a new-scope record against an empty request', () => {
    const records: KillSwitchRecord[] = [
      { scope: 'legal_entity', scopeRef: LEGAL_ENTITY, mode: 'suspended' },
      { scope: 'operating_context', scopeRef: 'carrier', mode: 'suspended' },
    ];
    expect(resolveKillSwitch(records, {}).mode).toBe('enabled');
    expect(resolveKillSwitch(records, {}).appliedBy).toEqual([]);
  });

  it('still lets a system switch reach a request that names nothing', () => {
    const records: KillSwitchRecord[] = [{ scope: 'system', scopeRef: null, mode: 'read_only' }];
    expect(resolveKillSwitch(records, {}).mode).toBe('read_only');
  });
});
