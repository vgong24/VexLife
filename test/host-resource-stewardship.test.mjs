import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticHash } from '../src/core/utils.mjs';
import { projectResourceContextPressure } from '../src/core/resource-context-pressure.mjs';
import {
  HOST_RESOURCE_LEASE_OBSERVATION_SCHEMA,
  HOST_RESOURCE_OBSERVATION_SCHEMA,
  projectHostResourceStewardship,
  verifyHostResourceStewardshipDecision
} from '../src/core/host-resource-stewardship.mjs';

function address(core, refField, prefix) {
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({ ...core, [refField]: `${prefix}.${semanticFingerprint.slice(0, 32)}`, semanticFingerprint });
}

function resource({
  ownershipState = 'EXACT_VEX_OWNED',
  lifecycleState = 'CURRENT',
  currentness = 'CURRENT',
  pidMatchOnly = false,
  exactOwnedProcessInstance = true
} = {}) {
  const core = {
    schemaVersion: HOST_RESOURCE_OBSERVATION_SCHEMA,
    truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
    resourceRef: 'resource.vexlife.heretic.runtime.test',
    resourceClass: 'HERETIC_PERSISTENT_RUNTIME',
    ownershipState,
    lifecycleState,
    lifecycleEvidenceRefOrNull: ['STALE', 'ABANDONED'].includes(lifecycleState) ? `evidence.lifecycle.${lifecycleState.toLowerCase()}` : null,
    currentness,
    ownershipProof: ownershipState === 'EXACT_VEX_OWNED' ? {
      currentness: 'CURRENT',
      ownerReceiptRef: 'receipt.vexlife.heretic.test',
      runtimeIdentityRef: 'runtime.vexlife.heretic.test',
      executableIdentityRef: 'executable.mlx-lm.test',
      processGroupIdentityRef: 'process-group.heretic.test',
      pidMatchOnly,
      exactOwnedProcessInstance
    } : null,
    sourceRefs: ['source.vexlife.heretic-owner.test']
  };
  return address(core, 'resourceObservationRef', 'observation.vexlife.host-resource');
}

function lease({ state = 'NONE', currentness = 'CURRENT' } = {}) {
  const core = {
    schemaVersion: HOST_RESOURCE_LEASE_OBSERVATION_SCHEMA,
    truthClass: 'SOURCE_BOUND_HOST_RESOURCE_LEASE_OBSERVATION',
    resourceRef: 'resource.vexlife.heretic.runtime.test',
    state,
    currentness,
    leaseRefOrNull: state === 'ACTIVE' ? 'lease.vexlife.resource.test' : state === 'NONE' ? null : 'lease.vexlife.resource.historical',
    sourceRefs: ['source.vexlife.context-lease.test']
  };
  return address(core, 'leaseObservationRef', 'observation.vexlife.host-resource-lease');
}


function pressureReceipt(used = 176_000) {
  const core = {
    schemaVersion: 'vexlife.prompt-context-materialization-receipt/v2',
    authorityRef: 'authority.vexlife.browser-prompt-context-runtime',
    authorityObservedAt: '2026-10-27T06:00:20.000Z',
    providerAuthorityRef: 'authority.vexlife.browser-prompt-context-runtime',
    providerAuthorityObservedAt: '2026-10-27T06:00:30.000Z',
    providerBoundaryCurrentnessVerified: true,
    providerBoundarySourceBindingsVerified: true,
    providerExactEventFileReadCount: 3,
    providerHeadMetadataReadCount: 1,
    contextLeaseRef: 'lease.vexlife.browser-prompt-context.v5-test',
    contextLeaseFingerprint: 'a'.repeat(64),
    contextLeaseFormedAt: '2026-10-27T06:00:00.000Z',
    contextLeaseExpiresAt: '2026-10-27T06:01:00.000Z',
    contextLeaseCurrentness: 'CURRENT',
    contextLeaseLifecycle: 'ACTIVE',
    continuityProjectionRef: 'projection.vexlife.continuity-stream-adapter.v5-test',
    continuityProjectionFingerprint: 'b'.repeat(64),
    lineageRef: 'companion-lineage.vexlife.v5-test',
    threadRef: 'thread.vexlife.v5-test',
    priorConversationHeadSha256: 'c'.repeat(64),
    turnRef: 'turn.vexlife.v5-test',
    currentRequestEventRef: 'event.vexlife.request.v5-test',
    currentRequestContentHash: 'd'.repeat(64),
    selectedConversationEventRefs: ['event.vexlife.request.prior','event.vexlife.response.prior'],
    memoryContextRefOrNull: null,
    memoryContextFingerprintOrNull: null,
    memoryContextIncluded: false,
    memorySourceRefs: [],
    memoryTokenCap: 1,
    memoryEstimatedSystemMessageTokens: 0,
    memoryTokenBoundedOutPageCount: 0,
    memoryBoundedOutStatementCount: 0,
    memoryHeldOrDeferredStatementCount: 0,
    includedSourceRefs: ['event.vexlife.request.prior','event.vexlife.response.prior','event.vexlife.request.v5-test'],
    orderedMaterializationEntries: [],
    exactMessagesSha256: 'e'.repeat(64),
    messageCount: 3,
    materializedInputTokenEstimate: used,
    contextLeaseInputTokenEstimate: 192_000,
    reservedOutputTokens: 16_000,
    hardTokenLimit: 208_000,
    exactEventFileReadCount: 3,
    headMetadataReadCount: 1,
    wholeHistoryEventEnumerationPerformed: false,
    currentRequestIncludedExactlyOnce: true,
    priorHumanMessagesUnmodified: true,
    priorAssistantMessagesUnmodified: true,
    tokenBudgetSatisfied: true,
    sourceCurrentnessVerified: true,
    crossLineageLeakage: false,
    crossThreadLeakage: false,
    memoryEffectPerformed: false,
    trainingSelectionPerformed: false,
    modelWeightEffectPerformed: false,
    hiddenReasoningIncluded: false
  };
  const semanticFingerprint = semanticHash(core);
  return { ...core, receiptRef: `receipt.vexlife.prompt-context-materialization.${semanticFingerprint.slice(0, 32)}`, semanticFingerprint };
}

function companionAvailability() {
  const core = {
    schemaVersion: 'vexlife.companion-availability/v1',
    truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
    registryRef: 'registry.vexlife.companion-availability-reentry.001',
    bindingRef: 'binding.vexlife.heretic-v5-test',
    homeRef: 'vex-home.v5-test',
    companionLineageRef: 'companion-lineage.vexlife.v5-test',
    modelRefOrNull: 'model.devex.heretic.qwen3.8-27b.mlx4.329658ee8f27',
    generationRefOrNull: null,
    runtimeAdapterRef: 'adapter.runtime.mlx.macos-victor.001',
    runtimeObservationRef: 'observation.vexlife.heretic-v5-test',
    availabilityState: 'READY',
    recoveryClass: 'NONE_REQUIRED',
    reasonCode: 'EXACT_RUNTIME_READY',
    bindingState: 'BOUND',
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: 'HEALTHY',
    qualificationState: 'CURRENT',
    sourceRefs: ['receipt.vexlife.heretic-v5-test'],
    effectAuthorityGranted: false,
    rendererAuthorityGranted: false,
    modelIdentityAuthorityGranted: false,
    processAuthorityGranted: false,
    conversationAuthorityGranted: false
  };
  const projectionSha256 = semanticHash(core);
  return { ...core, projectionRef: `projection.vexlife.companion-availability.${projectionSha256.slice(0, 32)}`, projectionSha256 };
}

function severePressure() {
  const pressure = projectResourceContextPressure({
    promptContextMaterialization: pressureReceipt(),
    companionAvailability: companionAvailability()
  });
  assert.equal(pressure.state, 'ROLLOVER_REQUIRED');
  return pressure;
}

const cleanup = {
  rightfulCleanupOwnerRef: 'owner.vexlife.heretic-persistent-runtime',
  rightfulCleanupActionRef: 'action.vexlife.heretic.stop-exact-owned-runtime'
};

function decide(resourceObservation, leaseObservation, extra = {}) {
  return projectHostResourceStewardship({ resourceObservation, leaseObservation, ...cleanup, ...extra });
}

function verify(decision, resourceObservation, leaseObservation, extra = {}) {
  return verifyHostResourceStewardshipDecision(decision, {
    resourceObservation,
    leaseObservation,
    ...cleanup,
    ...extra
  });
}

test('exact-owned current resource stays KEEP under valid severe pressure', () => {
  const resourceObservation = resource({ lifecycleState: 'CURRENT' });
  const leaseObservation = lease();
  const resourceContextPressure = severePressure();
  const result = decide(resourceObservation, leaseObservation, { resourceContextPressure });
  assert.equal(result.disposition, 'KEEP');
  assert.equal(result.cleanupEligibility, 'NOT_ELIGIBLE');
  assert.equal(result.pressureStateOrNull, 'ROLLOVER_REQUIRED');
  assert.equal(result.executionAuthorityGranted, false);
  assert.equal(result.automaticCleanupAuthorized, false);
  assert.equal(verify(result, resourceObservation, leaseObservation, { resourceContextPressure }), true);
});

test('exact-owned stale resource with active lease cannot auto-clean', () => {
  const result = decide(resource({ lifecycleState: 'STALE' }), lease({ state: 'ACTIVE' }));
  assert.equal(result.disposition, 'KEEP');
  assert.ok(result.reasonCodes.includes('ACTIVE_LEASE_BLOCKS_CLEANUP'));
  assert.equal(result.cleanupEligibility, 'NOT_ELIGIBLE');
});

test('exact-owned stale resource with no active current lease becomes delegation-eligible, never self-authorized', () => {
  const result = decide(resource({ lifecycleState: 'STALE' }), lease());
  assert.equal(result.disposition, 'AUTO_CLEANUP_ELIGIBLE');
  assert.equal(result.cleanupEligibility, 'ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION');
  assert.equal(result.rightfulCleanupOwnerRefOrNull, cleanup.rightfulCleanupOwnerRef);
  assert.equal(result.rightfulCleanupActionRefOrNull, cleanup.rightfulCleanupActionRef);
  assert.equal(result.executionAuthorityGranted, false);
  assert.equal(result.automaticCleanupAuthorized, false);
  assert.ok(Object.values(result.effects).every((value) => value === false));
});

test('exact-owned abandoned resource with no active current lease is delegation-eligible', () => {
  const result = decide(resource({ lifecycleState: 'ABANDONED' }), lease());
  assert.equal(result.disposition, 'AUTO_CLEANUP_ELIGIBLE');
  assert.equal(result.cleanupEligibility, 'ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION');
});

test('cleanup eligibility requires one rightful cleanup owner/action even when resource predicates pass', () => {
  const result = projectHostResourceStewardship({
    resourceObservation: resource({ lifecycleState: 'STALE' }),
    leaseObservation: lease()
  });
  assert.equal(result.disposition, 'HELD');
  assert.ok(result.reasonCodes.includes('RIGHTFUL_CLEANUP_OWNER_REQUIRED'));
  assert.equal(result.cleanupEligibility, 'NOT_ELIGIBLE');
});

test('unowned, unknown, ambiguous and user workload resources never auto-clean', () => {
  for (const ownershipState of ['UNOWNED', 'UNKNOWN', 'AMBIGUOUS', 'USER_WORKLOAD']) {
    const result = decide(resource({ ownershipState, lifecycleState: 'ABANDONED' }), lease());
    assert.notEqual(result.disposition, 'AUTO_CLEANUP_ELIGIBLE');
    assert.equal(result.cleanupEligibility, 'NOT_ELIGIBLE');
    assert.equal(result.humanProposalRequired, true);
    assert.equal(result.executionAuthorityGranted, false);
  }
});

test('PID equality alone is insufficient exact-ownership evidence', () => {
  assert.throws(
    () => decide(resource({ lifecycleState: 'STALE', pidMatchOnly: true, exactOwnedProcessInstance: false }), lease()),
    (error) => error.code === 'HOST_RESOURCE_STEWARDSHIP_INPUT_INVALID'
  );
});

test('expired, stale or unknown lease evidence fails closed for stale exact-owned resource', () => {
  for (const [state, currentness] of [['EXPIRED', 'CURRENT'], ['STALE', 'STALE'], ['UNKNOWN', 'UNKNOWN']]) {
    const result = decide(resource({ lifecycleState: 'STALE' }), lease({ state, currentness }));
    assert.equal(result.disposition, 'HELD');
    assert.equal(result.cleanupEligibility, 'NOT_ELIGIBLE');
  }
});

test('severe or malformed pressure cannot turn a current resource into cleanup authority', () => {
  const malformedPressure = { schemaVersion: 'vexlife.resource-context-pressure/v1', state: 'ROLLOVER_REQUIRED' };
  const result = decide(resource({ lifecycleState: 'CURRENT' }), lease(), { resourceContextPressure: malformedPressure });
  assert.equal(result.disposition, 'KEEP');
  assert.ok(result.reasonCodes.includes('PRESSURE_INVALID'));
  assert.equal(result.cleanupEligibility, 'NOT_ELIGIBLE');
  assert.equal(result.executionAuthorityGranted, false);
});

test('stale resource observation currentness fails closed even with exact ownership and no active lease', () => {
  const result = decide(resource({ lifecycleState: 'STALE', currentness: 'STALE' }), lease());
  assert.equal(result.disposition, 'HELD');
  assert.ok(result.reasonCodes.includes('RESOURCE_CURRENTNESS_REQUIRED'));
  assert.equal(result.cleanupEligibility, 'NOT_ELIGIBLE');
});

function readdressDecision(value, overrides) {
  const core = { ...structuredClone(value), ...overrides };
  delete core.decisionRef;
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    decisionRef: `decision.vexlife.host-resource-stewardship.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

test('source-bound verifier rejects coherent re-addressing of upstream ownership and lease facts', () => {
  const resourceObservation = resource({ ownershipState: 'UNOWNED', lifecycleState: 'ABANDONED' });
  const leaseObservation = lease();
  const original = decide(resourceObservation, leaseObservation);
  assert.equal(original.disposition, 'HUMAN_PROPOSAL_REQUIRED');

  const forged = readdressDecision(original, {
    ownershipState: 'EXACT_VEX_OWNED',
    resourceLifecycleState: 'STALE',
    resourceCurrentness: 'CURRENT',
    leaseState: 'NONE',
    leaseCurrentness: 'CURRENT',
    disposition: 'AUTO_CLEANUP_ELIGIBLE',
    reasonCodes: ['EXACT_OWNED_STALE_NO_ACTIVE_LEASE', 'PRESSURE_NOT_SUPPLIED'],
    cleanupEligibility: 'ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION',
    rightfulCleanupOwnerRefOrNull: cleanup.rightfulCleanupOwnerRef,
    rightfulCleanupActionRefOrNull: cleanup.rightfulCleanupActionRef,
    humanProposalRequired: false
  });
  assert.equal(verify(forged, resourceObservation, leaseObservation), false);
});

test('source-bound verifier rejects re-addressed cleanup eligibility against an active lease', () => {
  const resourceObservation = resource({ lifecycleState: 'STALE' });
  const leaseObservation = lease({ state: 'ACTIVE' });
  const original = decide(resourceObservation, leaseObservation);
  const forged = readdressDecision(original, {
    disposition: 'AUTO_CLEANUP_ELIGIBLE',
    reasonCodes: ['EXACT_OWNED_STALE_NO_ACTIVE_LEASE', 'PRESSURE_NOT_SUPPLIED'],
    cleanupEligibility: 'ELIGIBLE_FOR_RIGHTFUL_OWNER_DELEGATION',
    rightfulCleanupOwnerRefOrNull: cleanup.rightfulCleanupOwnerRef,
    rightfulCleanupActionRefOrNull: cleanup.rightfulCleanupActionRef
  });
  assert.equal(verify(forged, resourceObservation, leaseObservation), false);
});

test('source-bound verifier rejects pressure, reason and source-ref re-addressing', () => {
  const resourceObservation = resource({ lifecycleState: 'CURRENT' });
  const leaseObservation = lease();
  const resourceContextPressure = severePressure();
  const current = decide(resourceObservation, leaseObservation, { resourceContextPressure });

  assert.equal(verify(
    readdressDecision(current, { pressureStateOrNull: 'WATCH' }),
    resourceObservation,
    leaseObservation,
    { resourceContextPressure }
  ), false);

  assert.equal(verify(
    readdressDecision(current, { reasonCodes: ['FAKE_STEWARDSHIP_REASON', ...current.reasonCodes].sort() }),
    resourceObservation,
    leaseObservation,
    { resourceContextPressure }
  ), false);

  assert.equal(verify(
    readdressDecision(current, { sourceRefs: [...current.sourceRefs, current.sourceRefs[0]] }),
    resourceObservation,
    leaseObservation,
    { resourceContextPressure }
  ), false);
});

test('source-bound verifier fails closed without the source observations', () => {
  const resourceObservation = resource({ lifecycleState: 'CURRENT' });
  const leaseObservation = lease();
  const decision = decide(resourceObservation, leaseObservation);
  assert.equal(verifyHostResourceStewardshipDecision(decision), false);
});

test('decisions are deterministic, content-addressed and source-bound with no effects', () => {
  const resourceObservation = resource({ lifecycleState: 'STALE' });
  const leaseObservation = lease();
  const input = { resourceObservation, leaseObservation, ...cleanup };
  const first = projectHostResourceStewardship(input);
  const second = projectHostResourceStewardship(input);
  assert.deepEqual(first, second);
  assert.match(first.decisionRef, /^decision\.vexlife\.host-resource-stewardship\.[0-9a-f]{32}$/u);
  assert.match(first.semanticFingerprint, /^[0-9a-f]{64}$/u);
  assert.equal(verify(first, resourceObservation, leaseObservation), true);
  assert.ok(Object.values(first.effects).every((value) => value === false));
});

// [VXG RealForever]
