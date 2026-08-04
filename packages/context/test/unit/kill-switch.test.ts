import { describe, expect, it } from 'vitest';
import {
  KILL_SWITCH_MODES,
  KILL_SWITCH_SCOPES,
  capabilitiesFor,
  modeRestrictiveness,
  resolveKillSwitch,
  type KillSwitchRecord,
} from '../../src/kill-switch.ts';

describe('kill-switch vocabulary', () => {
  it('carries the seven scopes 09_AUTONOMY_POLICY names, in order', () => {
    expect(KILL_SWITCH_SCOPES).toEqual([
      'system',
      'legal_plane',
      'tenant',
      'workflow',
      'agent',
      'tool',
      'integration',
    ]);
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
