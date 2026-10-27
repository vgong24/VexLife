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
    const eligible = fresh.decision.disposition === 'AUTO_CLEANUP_ELIGIBLE' &&
      fresh.decision.cleanupEligibility === 'ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION' &&
      fresh.decision.rightfulCleanupOwnerRefOrNull === HERETIC_PERSISTENT_RUNTIME_OWNER_REF &&
      fresh.decision.rightfulCleanupActionRefOrNull === HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF &&
      fresh.decision.executionAuthorityGranted === false &&
      fresh.decision.automaticCleanupAuthorized === false;
    if (!eligible) {
      return receiptFor({
        ...fresh,
        disposition: 'HELD_NO_EFFECT'
      });
    }

    const stop = await stopRuntime({ receiptPath });
    const postResourceObservation = validateHostResourceObservation(
      observeResource({ receiptPath, observedAt: now() })
    );
    if (postResourceObservation.resourceRef !== HERETIC_HOST_RESOURCE_REF ||
        postResourceObservation.resourceClass !== HERETIC_HOST_RESOURCE_CLASS) {
      fail('HERETIC_STEWARDSHIP_POST_EFFECT_RESOURCE_MISMATCH', 'post-effect resource observation changed identity');
    }

    if (stop?.disposition === 'STOPPED_EXACT_OWNED_MLX_RUNTIME' && stop.processTerminationPerformed === true) {
      if (postResourceObservation.ownershipState === 'EXACT_VEX_OWNED') {
        fail('HERETIC_STEWARDSHIP_POST_EFFECT_STILL_OWNED', 'owner reported stop but fresh post-effect observation still sees an exact-owned live runtime');
      }
      return receiptFor({
        ...fresh,
        stop,
        postResourceObservation,
        disposition: 'DELEGATED_AND_STOPPED_EXACT_OWNED_HERETIC_RUNTIME'
      });
    }

    if (['ALREADY_NOT_LIVE', 'NO_HERETIC_RUNTIME_RECEIPT'].includes(stop?.disposition) &&
        stop.processTerminationPerformed === false &&
        postResourceObservation.ownershipState !== 'EXACT_VEX_OWNED') {
      return receiptFor({
        ...fresh,
        stop,
        postResourceObservation,
        disposition: 'NO_EFFECT_RESOURCE_ALREADY_ABSENT'
      });
    }

    fail('HERETIC_STEWARDSHIP_STOP_RESULT_UNEXPECTED', 'rightful Heretic owner did not return an accepted bounded stop result', stop);
  };

  return Object.freeze({
    ownerRef: HERETIC_STEWARDSHIP_DELEGATION_OWNER_REF,
    inspect,
    delegate
  });
}

export function verifyHereticStewardshipDelegationReceipt(value) {
  if (!value || value.schemaVersion !== HERETIC_STEWARDSHIP_DELEGATION_SCHEMA ||
      value.delegationOwnerRef !== HERETIC_STEWARDSHIP_DELEGATION_OWNER_REF ||
      value.resourceRef !== HERETIC_HOST_RESOURCE_REF ||
      value.resourceClass !== HERETIC_HOST_RESOURCE_CLASS ||
      value.rightfulCleanupOwnerRef !== HERETIC_PERSISTENT_RUNTIME_OWNER_REF ||
      value.rightfulCleanupActionRef !== HERETIC_PERSISTENT_RUNTIME_STOP_ACTION_REF ||
      typeof value.semanticFingerprint !== 'string' || typeof value.delegationReceiptRef !== 'string') return false;
  const core = structuredClone(value);
  delete core.semanticFingerprint;
  delete core.delegationReceiptRef;
  const expected = semanticHash(core);
  return value.semanticFingerprint === expected &&
    value.delegationReceiptRef === `receipt.vexlife.host-resource-stewardship-heretic.${expected.slice(0, 32)}`;
}

// [VXG RealForever]
