import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CCEP_POLICY_FILE = 'docs/governance/ccep-policy.json';
export const CCEP_TEST_FILE = 'scripts/test/ccep-governance.test.ts';

const EXPECTED_ROLES = Object.freeze([
  'OWNER',
  'ORCHESTRATOR',
  'IMPLEMENTER',
  'INDEPENDENT_REVIEWER',
  'TAKEOVER_AGENT',
  'RELEASE_VERIFIER',
  'MERGE_EXECUTOR',
]);

const EXPECTED_PERMISSION_CLASSES = Object.freeze([
  'P0_READ_ONLY',
  'P1_LOCAL_EXECUTION',
  'P2_DISPOSABLE_MUTATION',
  'P3_REPOSITORY_WRITE',
  'P4_EXTERNAL_MUTATION',
]);

const EXPECTED_EXTERNAL_AUTHORITIES = Object.freeze([
  'NETWORK',
  'DEPENDENCY_INSTALL',
  'PUSH',
  'MERGE',
  'DEPLOY',
  'INFRASTRUCTURE_MUTATION',
]);

const EXPECTED_PHASES = Object.freeze([
  'TAKEOVER',
  'REVIEW',
  'REMEDIATION_REQUIRED',
  'REMEDIATION',
  'READY_FOR_INDEPENDENT_REREVIEW',
  'INDEPENDENT_REREVIEW',
  'READY_FOR_OWNER_MERGE_DECISION',
  'REMOTE_INTEGRATION_VERIFICATION',
  'READY_FOR_OWNER_FINAL_MERGE_DECISION',
  'OWNER_AUTHORIZED_MERGE',
  'POST_MERGE_VERIFICATION',
  'COMPLETE',
]);

const EXPECTED_REPORT_FIELDS = Object.freeze([
  'CHAIN_OF_CUSTODY',
  'ROLE',
  'REVIEW_CLASS',
  'PHASE',
  'PERMISSIONS',
  'SCOPE',
  'FINDING_LEDGER',
  'EVIDENCE',
  'COMMAND_LEDGER',
  'KNOWN_LIMITATIONS',
  'REMAINING_WORK',
  'FINAL_GIT_STATE',
  'NEXT_PERMITTED_PHASE',
  'VERDICT',
]);

const REQUIRED_CASES = Object.freeze([
  'CCEP-T01',
  'CCEP-T02',
  'CCEP-T03',
  'CCEP-T04',
  'CCEP-T05',
  'CCEP-T06',
  'CCEP-T07',
  'CCEP-T08',
  'CCEP-T09',
  'CCEP-T10',
  'CCEP-T11',
  'CCEP-T12',
  'CCEP-T13',
  'CCEP-T14',
]);

function sameStringArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function includesAll(values, expected) {
  return Array.isArray(values) && expected.every((value) => values.includes(value));
}

function transition(policy, from, to) {
  return (policy.permittedTransitions ?? []).find((edge) => edge?.from === from && edge?.to === to);
}

function activeCasePattern(id) {
  return new RegExp(`\\b(?:it|test)\\(\\s*['"\`]${id}:`);
}

function skippedCasePattern(id) {
  return new RegExp(`\\b(?:it|test)\\.skip\\(\\s*['"\`]${id}:`);
}

export function loadCcepPolicy(root, errors) {
  const path = join(root, CCEP_POLICY_FILE);
  if (!existsSync(path)) {
    errors.push(`${CCEP_POLICY_FILE} is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${CCEP_POLICY_FILE} is not valid JSON: ${error.message}`);
    return null;
  }
}

export function validateCcepPolicyContract(root, errors) {
  const policy = loadCcepPolicy(root, errors);
  if (!policy) return null;

  if (policy.protocolVersion !== '1.0') {
    errors.push(`${CCEP_POLICY_FILE} protocolVersion must be "1.0"`);
  }
  if (!sameStringArray(policy.roles, EXPECTED_ROLES)) {
    errors.push(`${CCEP_POLICY_FILE} roles must match the anchored CCEP role set`);
  }
  if (!sameStringArray(policy.permissionClasses, EXPECTED_PERMISSION_CLASSES)) {
    errors.push(`${CCEP_POLICY_FILE} permissionClasses must preserve P0 through P4 separation`);
  }
  if (!sameStringArray(policy.externalAuthorities, EXPECTED_EXTERNAL_AUTHORITIES)) {
    errors.push(`${CCEP_POLICY_FILE} externalAuthorities must remain separately enumerated`);
  }
  if (!Array.isArray(policy.permissionImplications) || policy.permissionImplications.length !== 0) {
    errors.push(`${CCEP_POLICY_FILE} permissionImplications must remain empty`);
  }
  if (!sameStringArray(policy.phaseStates, EXPECTED_PHASES)) {
    errors.push(`${CCEP_POLICY_FILE} phaseStates must match the anchored CCEP state machine`);
  }
  if (!sameStringArray(policy.requiredPhaseReportFields, EXPECTED_REPORT_FIELDS)) {
    errors.push(`${CCEP_POLICY_FILE} requiredPhaseReportFields changed or lost required fields`);
  }

  const levelA = policy.reviewClasses?.LEVEL_A_ISOLATED_SESSION_REVIEW;
  if (
    levelA?.nonAuthoringContextRequired !== true ||
    levelA?.candidateImmutable !== true ||
    levelA?.reviewerTargetAccess !== 'READ_ONLY' ||
    levelA?.crossAgentRequired !== false ||
    levelA?.mayClaimCrossModelReview !== false
  ) {
    errors.push(
      `${CCEP_POLICY_FILE} LEVEL_A must remain isolated, non-authoring, immutable, read-only, ` +
        'and not a cross-model claim',
    );
  }
  const levelB = policy.reviewClasses?.LEVEL_B_CROSS_AGENT_REVIEW;
  if (
    levelB?.nonAuthoringContextRequired !== true ||
    levelB?.candidateImmutable !== true ||
    levelB?.reviewerTargetAccess !== 'READ_ONLY' ||
    levelB?.crossAgentRequired !== true
  ) {
    errors.push(`${CCEP_POLICY_FILE} LEVEL_B must remain distinct cross-agent review`);
  }

  const toIndependent = transition(
    policy,
    'READY_FOR_INDEPENDENT_REREVIEW',
    'INDEPENDENT_REREVIEW',
  );
  if (
    !toIndependent ||
    toIndependent.requiredRole !== 'INDEPENDENT_REVIEWER' ||
    toIndependent.requiresNonAuthoringContext !== true
  ) {
    errors.push(
      `${CCEP_POLICY_FILE} READY_FOR_INDEPENDENT_REREVIEW must flow through an independent reviewer`,
    );
  }
  if (transition(policy, 'READY_FOR_INDEPENDENT_REREVIEW', 'READY_FOR_OWNER_MERGE_DECISION')) {
    errors.push(
      `${CCEP_POLICY_FILE} implementer review-readiness cannot transition directly to owner merge readiness`,
    );
  }
  const toOwnerReady = transition(policy, 'INDEPENDENT_REREVIEW', 'READY_FOR_OWNER_MERGE_DECISION');
  if (!toOwnerReady || toOwnerReady.requiredRole !== 'INDEPENDENT_REVIEWER') {
    errors.push(`${CCEP_POLICY_FILE} owner merge readiness must come from independent rereview`);
  }
  const ownerMerge = transition(
    policy,
    'READY_FOR_OWNER_FINAL_MERGE_DECISION',
    'OWNER_AUTHORIZED_MERGE',
  );
  if (
    !ownerMerge ||
    ownerMerge.requiredRole !== 'OWNER' ||
    ownerMerge.requiresOwnerAuthorization !== true
  ) {
    errors.push(`${CCEP_POLICY_FILE} OWNER_AUTHORIZED_MERGE must require owner authorization`);
  }
  if (transition(policy, 'OWNER_AUTHORIZED_MERGE', 'DEPLOY')) {
    errors.push(`${CCEP_POLICY_FILE} MERGE must not imply DEPLOY`);
  }

  const noSelfClearance = policy.noSelfClearance;
  if (
    !includesAll(noSelfClearance?.implementerMayDeclare, [
      'IMPLEMENTED',
      'READY_FOR_INDEPENDENT_REREVIEW',
    ]) ||
    !includesAll(noSelfClearance?.implementerMayNotDeclare, [
      'CLOSED',
      'READY_FOR_OWNER_MERGE_DECISION',
      'READY_FOR_OWNER_FINAL_MERGE_DECISION',
      'OWNER_AUTHORIZED_MERGE',
      'COMPLETE',
    ]) ||
    noSelfClearance?.reviewReadinessRequiresIndependentReviewBeforeOwnerMergeReadiness !== true ||
    noSelfClearance?.ownerDecisionDistinctFromReviewVerdict !== true
  ) {
    errors.push(`${CCEP_POLICY_FILE} noSelfClearance contract is weakened`);
  }

  if (
    policy.candidateFreeze?.requiredBeforeIndependentReview !== true ||
    policy.candidateFreeze?.recordHead !== true ||
    policy.candidateFreeze?.recordTree !== true ||
    policy.candidateFreeze?.recordWorktreePath !== true
  ) {
    errors.push(`${CCEP_POLICY_FILE} candidateFreeze contract is incomplete`);
  }
  if (
    policy.reviewTargetImmutability?.reviewerMayMutateTarget !== false ||
    policy.reviewTargetImmutability?.negativeFixturesMustBeDisposable !== true
  ) {
    errors.push(`${CCEP_POLICY_FILE} reviewTargetImmutability contract is weakened`);
  }
  if (!includesAll(policy.ownerReservedCheckpoints, ['PUSH', 'MERGE', 'DEPLOY'])) {
    errors.push(`${CCEP_POLICY_FILE} ownerReservedCheckpoints must include PUSH, MERGE and DEPLOY`);
  }
  if (!sameStringArray(policy.requiredTestCases, REQUIRED_CASES)) {
    errors.push(
      `${CCEP_POLICY_FILE} requiredTestCases must match the anchored regression inventory`,
    );
  }

  return policy;
}

export function validateCcepTestInventory(root, policy, errors) {
  const testPath = join(root, CCEP_TEST_FILE);
  if (!existsSync(testPath)) {
    errors.push(`${CCEP_TEST_FILE} is missing`);
    return;
  }
  const source = readFileSync(testPath, 'utf8');
  for (const id of policy?.requiredTestCases ?? REQUIRED_CASES) {
    if (!activeCasePattern(id).test(source)) {
      errors.push(`${CCEP_TEST_FILE} is missing active regression case ${id}`);
    }
    if (skippedCasePattern(id).test(source)) {
      errors.push(`${CCEP_TEST_FILE} disables required regression case ${id}`);
    }
  }
}
