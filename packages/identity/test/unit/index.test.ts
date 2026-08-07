import { describe, expect, it } from 'vitest';
import * as identity from '../../src/index.ts';

/**
 * The public surface of `packages/identity`.
 *
 * ADR-0024 rule 6 prohibits duplicating a shared contract across packages, which makes this barrel
 * the single import point for everything the package owns. A dropped export is therefore a
 * breaking change to every consumer, and it would otherwise be invisible until one of them failed
 * to compile.
 */
describe('the package barrel', () => {
  const EXPECTED_EXPORTS = [
    // organization
    'MAX_ORGANIZATION_DEPTH',
    'ORGANIZATION_NODE_TYPES',
    'PERMITTED_NODE_PARENTS',
    'ancestorsOf',
    'depthOf',
    'isPermittedNodeParent',
    'isValidHierarchy',
    'validateHierarchy',
    // lifecycle
    'IDENTITY_RECORD_STATUSES',
    'IDENTITY_STATUSES',
    'ORGANIZATION_NODE_STATUSES',
    'authorizesAt',
    'isEffectiveAt',
    'isNarrowingChange',
    'isRevokedAt',
    // permissions
    'PHASE_1_PERMISSIONS',
    'hasPermission',
    'isPhase1Permission',
    'resolveEffectivePermissions',
    // policy inheritance
    'POLICY_BINDING_DIRECTIONS',
    'PROTECTED_CONTROL_CATEGORIES',
    'isPermittedBinding',
    'resolveEffectivePolicy',
    'weakeningRejection',
    // purpose
    'OUTCOMES',
    'PRIVILEGED_PURPOSES',
    'PURPOSES',
    'PURPOSE_ORIGINS',
    'PurposeError',
    'TRUSTED_PURPOSE_ORIGINS',
    'assertPrivilegedCall',
    'isOutcome',
    'isPrivilegedPurpose',
    'isPurpose',
    'privilegedRefusalReason',
    'requireOutcome',
    'requirePurpose',
    // service accounts
    'CREDENTIAL_TYPES',
    'CredentialReferenceError',
    'SERVICE_ACCOUNT_ACTOR_TYPES',
    'assertCredentialReference',
    'isServiceAccountActorType',
    'isValidCredentialReference',
    'validateCredentialReference',
  ];

  it('exports exactly the declared surface, and nothing more', () => {
    expect(Object.keys(identity).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it('exports no database client, connection, or migration helper', () => {
    // ADR-0024 rule 5 keeps migrations in packages/database. A domain package that reached for a
    // connection would make the layer boundary decorative.
    for (const name of Object.keys(identity)) {
      expect(name.toLowerCase(), name).not.toMatch(/client|pool|connect|migrat|query/);
    }
  });

  it('re-exports live values rather than copies', () => {
    expect(identity.PURPOSES).toHaveLength(10);
    expect(identity.PHASE_1_PERMISSIONS).toHaveLength(22);
    expect(identity.ORGANIZATION_NODE_TYPES).toHaveLength(8);
    expect(identity.MAX_ORGANIZATION_DEPTH).toBe(16);
  });
});
