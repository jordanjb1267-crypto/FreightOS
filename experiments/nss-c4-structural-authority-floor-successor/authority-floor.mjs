export const AUTHORITY_FLOOR = 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';

export function structuralAuthorityFloor(preState, event) {
  const patch = event?.patch ?? {};

  if (
    patch.seal_status === 'DISCREPANCY' &&
    preState?.seal_status !== 'DISCREPANCY'
  ) return AUTHORITY_FLOOR;

  if (
    patch.receiver_identity_status === 'CONFLICT' &&
    preState?.receiver_identity_status !== 'CONFLICT'
  ) return AUTHORITY_FLOOR;

  if (
    Object.prototype.hasOwnProperty.call(patch, 'factor_assignment') &&
    preState?.factor_assignment !== null &&
    preState?.factor_assignment !== undefined &&
    patch.factor_assignment !== null &&
    patch.factor_assignment !== undefined &&
    patch.factor_assignment !== preState.factor_assignment
  ) return AUTHORITY_FLOOR;

  return null;
}
