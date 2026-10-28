import {
  projectHostResourceStewardship,
  validateHostResourceLeaseObservation,
  validateHostResourceObservation,
  verifyHostResourceStewardshipDecision
} from './host-resource-stewardship.mjs';
import {
  HERETIC_HOST_RESOURCE_CLASS,
  HERETIC_HOST_RESOURCE_REF,
  HERETIC_PERSISTENT_RUNTIME_OWNER_REF,
  HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF,
  observeHereticPersistentRuntimeResource,
  stopHereticPersistentRuntimeFromReceipt
} from './heretic-persistent-runtime-owner.mjs';
import { BROWSER_PROMPT_CONTEXT_RUNTIME_AUTHORITY_REF } from './browser-prompt-context-runtime.mjs';
import { semanticHash } from './utils.mjs';

export const HERETIC_STEWARDSHIP_DELEGATION_SCHEMA =
  'vexlife.host-resource-stewardship-heretic-delegation-receipt/v1';
export const HERETIC_STEWARDSHIP_DELEGATION_OWNER_REF =
  'owner.vexlife.host-resource-stewardship-heretic-delegation.001';

const EFFECTS_NONE = Object.freeze({
  hostMutated: false,
  processSignalled: false,
  processTerminated: false,
  runtimeMutated: false,
  homeMutated: false,
  memoryMutated: false,
  semanticAcceptanceCreated: false,
  trainingRan: false,
  modelWeightsChanged: false,
  publicationPerformed: false
});

function fail(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !value || /[\0\r\n]/u.test(value)) {
    fail('HERETIC_STEWARDSHIP_DELEGATION_INPUT_INVALID', `${label} must be one stable ref`);
  }
  return value;
}

function addressedReceipt(core) {
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    delegationReceiptRef: `receipt.vexlife.host-resource-stewardship-heretic.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function receiptFor({ decision, resourceObservation, leaseObservation, disposition, stop = null, postResourceObservation = null }) {
  const processTerminationPerformed = stop?.processTerminationPerformed === true;
  const effects = processTerminationPerformed
    ? {
        ...EFFECTS_NONE,
        hostMutated: true,
        processSignalled: true,
        processTerminated: true,
        runtimeMutated: true
      }
    : { ...EFFECTS_NONE };
  const sourceRefs = [...new Set([
    decision.decisionRef,
    resourceObservation.resourceObservationRef,
    leaseObservation.leaseObservationRef,
    ...(decision.sourceRefs ?? []),
    ...(postResourceObservation ? [postResourceObservation.resourceObservationRef, ...(postResourceObservation.sourceRefs ?? [])] : [])
  ])].sort();
  const core = {
    schemaVersion: HERETIC_STEWARDSHIP_DELEGATION_SCHEMA,
    truthClass: 'BOUNDED_RIGHTFUL_OWNER_DELEGATION_RECEIPT',
    delegationOwnerRef: HERETIC_STEWARDSHIP_DELEGATION_OWNER_REF,
    resourceRef: HERETIC_HOST_RESOURCE_REF,
    resourceClass: HERETIC_HOST_RESOURCE_CLASS,
    rightfulCleanupOwnerRef: HERETIC_PERSISTENT_RUNTIME_OWNER_REF,
    rightfulCleanupActionRef: HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF,
    preEffectResourceObservationRef: resourceObservation.resourceObservationRef,
    preEffectLeaseObservationRef: leaseObservation.leaseObservationRef,
    preEffectDecisionRef: decision.decisionRef,
    preEffectDecisionFingerprint: decision.semanticFingerprint,
    stopDispositionOrNull: stop?.disposition ?? null,
    stopPidOrNull: Number.isInteger(stop?.pid) ? stop.pid : null,
    stopResultFingerprintOrNull: stop ? semanticHash(stop) : null,
    postEffectResourceObservationRefOrNull: postResourceObservation?.resourceObservationRef ?? null,
    disposition,
    processTerminationPerformed,
    sourceRefs,
    effects
  };
  return addressedReceipt(core);
}

function requireLeaseOwner(owner) {
  if (!owner || owner.authorityRef !== BROWSER_PROMPT_CONTEXT_RUNTIME_AUTHORITY_REF ||
      typeof owner.hostResourceLeaseObservation !== 'function') {
    fail(
      'HERETIC_STEWARDSHIP_LEASE_OWNER_REQUIRED',
      'delegation requires the exact Browser prompt-context lease owner surface'
    );
  }
  return owner;
}


function eligibleDecision(decision) {
  return decision.disposition === 'AUTO_CLEANUP_ELIGIBLE' &&
    decision.cleanupEligibility === 'ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION' &&
    decision.rightfulCleanupOwnerRefOrNull === HERETIC_PERSISTENT_RUNTIME_OWNER_REF &&
    decision.rightfulCleanupActionRefOrNull === HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF &&
    decision.executionAuthorityGranted === false &&
    decision.automaticCleanupAuthorized === false;
}

function deriveDelegationReceiptFromEvidence({
  resourceObservation,
  leaseObservation,
  resourceContextPressure = null,
  stopResult = null,
  postResourceObservation = null
} = {}) {
  const resource = validateHostResourceObservation(resourceObservation);
  const lease = validateHostResourceLeaseObservation(leaseObservation);
  if (resource.resourceRef !== HERETIC_HOST_RESOURCE_REF ||
      resource.resourceClass !== HERETIC_HOST_RESOURCE_CLASS ||
      lease.resourceRef !== HERETIC_HOST_RESOURCE_REF) {
    fail('HERETIC_STEWARDSHIP_RESOURCE_MISMATCH', 'delegation evidence is not the exact Heretic persistent runtime');
  }

  const decision = projectHostResourceStewardship({
    resourceObservation: resource,
    leaseObservation: lease,
    resourceContextPressure,
    rightfulCleanupOwnerRef: HERETIC_PERSISTENT_RUNTIME_OWNER_REF,
    rightfulCleanupActionRef: HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF
  });
  if (!verifyHostResourceStewardshipDecision(decision, {
    resourceObservation: resource,
    leaseObservation: lease,
    resourceContextPressure,
    rightfulCleanupOwnerRef: HERETIC_PERSISTENT_RUNTIME_OWNER_REF,
    rightfulCleanupActionRef: HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF
  })) {
    fail('HERETIC_STEWARDSHIP_FRESH_DECISION_INVALID', 'delegation evidence did not re-derive one canonical stewardship decision');
  }

  if (!eligibleDecision(decision)) {
    if (stopResult !== null || postResourceObservation !== null) {
      fail(
        'HERETIC_STEWARDSHIP_UNEXPECTED_EFFECT_EVIDENCE',
        'ineligible stewardship evidence cannot carry stop or post-effect evidence'
      );
    }
    return receiptFor({
      decision,
      resourceObservation: resource,
      leaseObservation: lease,
      disposition: 'HELD_NO_EFFECT'
    });
  }

  if (!stopResult || typeof stopResult !== 'object' || Array.isArray(stopResult) || !postResourceObservation) {
    fail(
      'HERETIC_STEWARDSHIP_EFFECT_EVIDENCE_REQUIRED',
      'eligible delegation verification requires the rightful-owner stop result and post-effect resource observation'
    );
  }
  const post = validateHostResourceObservation(postResourceObservation);
  if (post.resourceRef !== HERETIC_HOST_RESOURCE_REF || post.resourceClass !== HERETIC_HOST_RESOURCE_CLASS) {
    fail('HERETIC_STEWARDSHIP_POST_EFFECT_RESOURCE_MISMATCH', 'post-effect resource observation changed identity');
  }

  if (stopResult.disposition === 'STOPPED_EXACT_OWNED_MLX_RUNTIME' &&
      stopResult.processTerminationPerformed === true) {
    if (post.ownershipState === 'EXACT_VEX_OWNED') {
      fail('HERETIC_STEWARDSHIP_POST_EFFECT_STILL_OWNED', 'owner reported stop but post-effect observation still sees an exact-owned live runtime');
    }
    return receiptFor({
      decision,
      resourceObservation: resource,
      leaseObservation: lease,
      stop: stopResult,
      postResourceObservation: post,
      disposition: 'DELEGATED_AND_STOPPED_EXACT_OWNED_HERETIC_RUNTIME'
    });
  }

  if (['ALREADY_NOT_LIVE', 'NO_HERETIC_RUNTIME_RECEIPT'].includes(stopResult.disposition) &&
      stopResult.processTerminationPerformed === false &&
      post.ownershipState !== 'EXACT_VEX_OWNED') {
    return receiptFor({
      decision,
      resourceObservation: resource,
      leaseObservation: lease,
      stop: stopResult,
      postResourceObservation: post,
      disposition: 'NO_EFFECT_RESOURCE_ALREADY_ABSENT'
    });
  }

  fail(
    'HERETIC_STEWARDSHIP_STOP_RESULT_UNEXPECTED',
    'rightful Heretic owner did not return an accepted bounded stop result',
    stopResult
  );
}

export function createHereticStaleResourceDelegator({
  promptContextRuntime,
  observeResource = observeHereticPersistentRuntimeResource,
  stopRuntime = stopHereticPersistentRuntimeFromReceipt,
  now = () => new Date().toISOString()
} = {}) {
  const leaseOwner = requireLeaseOwner(promptContextRuntime);
  if (typeof observeResource !== 'function' || typeof stopRuntime !== 'function' || typeof now !== 'function') {
    fail('HERETIC_STEWARDSHIP_DELEGATION_INPUT_INVALID', 'delegation dependencies are invalid');
  }

  const inspect = ({ receiptPath, resourceContextPressure = null } = {}) => {
    stableRef(String(receiptPath ?? ''), 'receiptPath');
    const observedAt = now();
    const resourceObservation = validateHostResourceObservation(observeResource({ receiptPath, observedAt }));
    if (resourceObservation.resourceRef !== HERETIC_HOST_RESOURCE_REF ||
        resourceObservation.resourceClass !== HERETIC_HOST_RESOURCE_CLASS) {
      fail('HERETIC_STEWARDSHIP_RESOURCE_MISMATCH', 'fresh resource observation is not the exact Heretic persistent runtime');
    }
    const leaseObservation = validateHostResourceLeaseObservation(
      leaseOwner.hostResourceLeaseObservation({
        resourceRef: HERETIC_HOST_RESOURCE_REF,
        observedAt
      })
    );
    const decision = projectHostResourceStewardship({
      resourceObservation,
      leaseObservation,
      resourceContextPressure,
      rightfulCleanupOwnerRef: HERETIC_PERSISTENT_RUNTIME_OWNER_REF,
      rightfulCleanupActionRef: HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF
    });
    if (!verifyHostResourceStewardshipDecision(decision, {
      resourceObservation,
      leaseObservation,
      resourceContextPressure,
      rightfulCleanupOwnerRef: HERETIC_PERSISTENT_RUNTIME_OWNER_REF,
      rightfulCleanupActionRef: HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF
    })) {
      fail('HERETIC_STEWARDSHIP_FRESH_DECISION_INVALID', 'fresh stewardship decision did not verify from its source observations');
    }
    return Object.freeze({ resourceObservation, leaseObservation, decision });
  };

  const delegate = async ({ receiptPath, resourceContextPressure = null } = {}) => {
    const fresh = inspect({ receiptPath, resourceContextPressure });
    if (!eligibleDecision(fresh.decision)) {
      return deriveDelegationReceiptFromEvidence({
        resourceObservation: fresh.resourceObservation,
        leaseObservation: fresh.leaseObservation,
        resourceContextPressure
      });
    }

    const stopResult = await stopRuntime({ receiptPath });
    const postResourceObservation = validateHostResourceObservation(
      observeResource({ receiptPath, observedAt: now() })
    );
    return deriveDelegationReceiptFromEvidence({
      resourceObservation: fresh.resourceObservation,
      leaseObservation: fresh.leaseObservation,
      resourceContextPressure,
      stopResult,
      postResourceObservation
    });
  };

  return Object.freeze({
    ownerRef: HERETIC_STEWARDSHIP_DELEGATION_OWNER_REF,
    inspect,
    delegate
  });
}

export function verifyHereticStewardshipDelegationReceipt(value, {
  resourceObservation,
  leaseObservation,
  resourceContextPressure = null,
  stopResult = null,
  postResourceObservation = null
} = {}) {
  try {
    const expected = deriveDelegationReceiptFromEvidence({
      resourceObservation,
      leaseObservation,
      resourceContextPressure,
      stopResult,
      postResourceObservation
    });
    return value?.delegationReceiptRef === expected.delegationReceiptRef &&
      value?.semanticFingerprint === expected.semanticFingerprint &&
      semanticHash(value) === semanticHash(expected);
  } catch {
    return false;
  }
}

// [VXG RealForever]
