import { createContextLease } from './context-lease.mjs';
import { assertCurrentLease } from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';
import {
  LivedCompanionError,
  readCurrentLivedCompanionCompletedTurn
} from './lived-companion.mjs';

const EFFECTS = Object.freeze({
  homeMutated: false,
  memoryPromoted: false,
  scoreAppended: false,
  intentTransitioned: false,
  contextLeaseCreated: false,
  continuityAcceptanceCreated: false,
  recoveryActionApplied: false,
  dailyDreamCommitted: false,
  journalRewritten: false,
  providerCalled: false,
  networkCalled: false,
  publicationPerformed: false,
  modelCalled: false,
  trainingRan: false,
  modelWeightsChanged: false,
  relationshipMutated: false,
  externalDisclosure: false
});

function fail(message, details = null) {
  throw new LivedCompanionError('CONTEXT_HASH_MISMATCH', message, details);
}

function canonicalTimestamp(value, label) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail(`${label} is not one canonical timestamp`);
  return ms;
}

function safeRef(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(value)) {
    fail(`${label} must be one portable stable ref`);
  }
  return value;
}

function exactCurrentRequestBinding(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) fail('prompt-context resolver requires server-owned lived turn context');
  return Object.freeze({
    eventRef: safeRef(context.currentRequestEventRef, 'currentRequestEventRef'),
    eventHash: /^[0-9a-f]{64}$/u.test(context.currentRequestEventHash ?? '')
      ? context.currentRequestEventHash
      : fail('currentRequestEventHash is invalid'),
    sequence: Number.isSafeInteger(context.currentRequestSequence) && context.currentRequestSequence >= 0
      ? context.currentRequestSequence
      : fail('currentRequestSequence is invalid')
  });
}

function selectionCore(prior, current) {
  return Object.freeze({
    schemaVersion: 'vexlife.browser-prompt-context-runtime-selection/v1',
    homeRef: prior.homeRef,
    deviceRef: prior.deviceRef,
    lineageRef: prior.companionLineageRef,
    threadRef: prior.threadRef,
    priorConversationHeadSha256: prior.conversationHeadSha256,
    priorHeadSequence: prior.headSequence,
    currentRequestEventBinding: current,
    selectedEventBindings: Object.freeze([
      Object.freeze({
        eventRef: prior.requestEventBinding.eventRef,
        eventHash: prior.requestEventBinding.eventHash,
        sequence: prior.requestEventBinding.sequence,
        completedHeadSha256: prior.conversationHeadSha256
      }),
      Object.freeze({
        eventRef: prior.responseEventBinding.eventRef,
        eventHash: prior.responseEventBinding.eventHash,
        sequence: prior.responseEventBinding.sequence,
        completedHeadSha256: prior.conversationHeadSha256
      })
    ]),
    wholeHistoryEventEnumerationPerformed: false,
    memorySelectionPerformed: false,
    trainingSelectionPerformed: false
  });
}

function selectionFingerprint(selection) {
  return semanticHash(selection);
}

function leaseInput(selection, observedAt, ttlMs) {
  const selectionHash = selectionFingerprint(selection);
  const observedMs = canonicalTimestamp(observedAt, 'observedAt');
  const expiresAt = new Date(observedMs + ttlMs).toISOString();
  const currentHash = selection.currentRequestEventBinding.eventHash;
  const headHash = selection.priorConversationHeadSha256;
  const policy = {
    schemaVersion: 'vexlife.browser-prompt-context-runtime-policy/v1',
    selectionFingerprint: selectionHash,
    priorConversationHeadSha256: headHash,
    currentRequestEventHash: currentHash,
    currentRequestSequence: selection.currentRequestEventBinding.sequence,
    selectedSourceRefs: selection.selectedEventBindings.map((binding) => binding.eventRef),
    effects: EFFECTS
  };
  const runtimeSnapshotFingerprint = semanticHash({ ...policy, class: 'RUNTIME_SNAPSHOT' });
  return {
    leaseRef: `lease.vexlife.browser-prompt-context.${selectionHash.slice(0, 24)}.${currentHash.slice(0, 16)}`,
    workerRef: 'worker.vexlife.browser-prompt-context-runtime',
    workNodeRef: `work-node.vexlife.browser-prompt-context.${currentHash.slice(0, 32)}`,
    graphFingerprint: semanticHash({ ...policy, class: 'GRAPH' }),
    trustSnapshotFingerprint: semanticHash({ ...policy, class: 'TRUST' }),
    runtimeSnapshotFingerprint,
    schedulerGeneration: selection.currentRequestEventBinding.sequence,
    resourceLeaseFingerprint: semanticHash({ ...policy, class: 'RESOURCE_LEASE', reads: 4 }),
    capabilityLeaseFingerprint: semanticHash({ ...policy, class: 'CAPABILITY_LEASE', capability: 'IMMEDIATE_PRIOR_COMPLETED_TURN' }),
    effectLeaseFingerprint: semanticHash({ ...policy, class: 'EFFECT_LEASE', effects: EFFECTS }),
    cancellationTokenRef: `cancellation.vexlife.browser-prompt-context.${currentHash.slice(0, 32)}`,
    foundationKernelRef: 'foundation.vexlife.browser-prompt-context-runtime',
    roleFrameRef: 'role-frame.vexlife.browser-prompt-context-runtime',
    intentFrameRef: `intent-frame.vexlife.browser-prompt-context.${currentHash.slice(0, 32)}`,
    selectedAtlasRefs: [],
    selectedSourceRefs: selection.selectedEventBindings.map((binding) => binding.eventRef),
    applicableCultureRefs: [],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 3584,
    reservedOutputTokens: 512,
    hardTokenLimit: 4096,
    formedAt: observedAt,
    expiresAt,
    observedAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE',
    checkpointReturnRef: `checkpoint.vexlife.browser-prompt-context.${headHash.slice(0, 32)}`
  };
}

function continuityProjection(selection, lease) {
  const core = {
    schemaVersion: 'vexlife.continuity-stream-adapter-projection/v1',
    currentness: 'CURRENT',
    currentnessReasonRefs: [
      `head.vexlife.${selection.priorConversationHeadSha256.slice(0, 32)}`
    ],
    portableFrame: { sourceRefs: [] },
    owners: {
      context: {
        leaseRef: lease.leaseRef,
        semanticFingerprint: lease.semanticFingerprint,
        currentness: 'CURRENT',
        lifecycle: 'ACTIVE'
      }
    },
    current: {
      lineageRef: selection.lineageRef,
      threadRef: selection.threadRef,
      cursorEventRef: selection.currentRequestEventBinding.eventRef,
      frameRef: `frame.vexlife.browser-prompt-context.${selection.currentRequestEventBinding.eventHash.slice(0, 32)}`,
      frameFingerprint: `sha256:${semanticHash(selection)}`,
      activeWorkNodeRefs: [],
      currentIntentReceiptRefs: [],
      openLoopRefs: [],
      currentStatementRefs: [],
      currentContinuityRecordRefs: [],
      currentDailyStratumRefOrNull: null,
      recoveryPhaseOrNull: null
    },
    sourceRefs: [],
    effects: { ...EFFECTS },
    projectionTruth: {
      readOnly: true,
      ownerMutationPerformed: false,
      rawTranscriptIncluded: false,
      hiddenReasoningIncluded: false,
      rawPrivatePayloadIncluded: false,
      semanticAcceptanceCreated: false,
      memoryPromotionPerformed: false,
      recoveryActionPerformed: false,
      externalEffectPerformed: false
    }
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    adapterProjectionRef: `projection.vexlife.continuity-stream-adapter.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function stateKey(context) {
  return safeRef(context.currentRequestEventRef, 'currentRequestEventRef');
}

export function createBrowserPromptContextRuntime({
  home,
  homeRef = null,
  deviceRef = null,
  companionLineageRef,
  authorityRef = 'authority.vexlife.browser-prompt-context-runtime',
  leaseTtlMs = 60_000,
  now = () => new Date().toISOString()
}) {
  safeRef(companionLineageRef, 'companionLineageRef');
  safeRef(authorityRef, 'authorityRef');
  if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 1_000 || leaseTtlMs > 600_000) {
    fail('leaseTtlMs must be between 1000 and 600000 milliseconds');
  }
  if (typeof now !== 'function') fail('now must be one source-managed clock function');
  const active = new Map();

  const promptContextResolver = async ({ context }) => {
    const current = exactCurrentRequestBinding(context);
    const threadRef = safeRef(context.threadRef, 'threadRef');
    const priorHeadSha256 = context.priorConversationHeadSha256 ?? null;
    if (priorHeadSha256 === null) {
      active.delete(stateKey(context));
      return null;
    }
    if (!/^[0-9a-f]{64}$/u.test(priorHeadSha256)) fail('priorConversationHeadSha256 is invalid');
    const prior = readCurrentLivedCompanionCompletedTurn({
      home,
      homeRef,
      deviceRef,
      companionLineageRef,
      threadRef,
      expectedConversationHeadSha256: priorHeadSha256
    });
    if (prior.state !== 'COMPLETED' || prior.currentness !== 'CURRENT' ||
        prior.wholeHistoryEventEnumerationPerformed !== false ||
        prior.rawConversationContentIncluded !== false ||
        prior.exactEventFileReadCount !== 2) {
      fail('bounded prior-turn owner did not return one exact current completed turn');
    }
    if (current.sequence !== prior.headSequence + 1) {
      fail('current request does not immediately follow the selected completed turn');
    }
    const selection = selectionCore(prior, current);
    const observedAt = now();
    canonicalTimestamp(observedAt, 'resolver observedAt');
    const lease = createContextLease(leaseInput(selection, observedAt, leaseTtlMs)).lease;
    const projection = continuityProjection(selection, lease);
    const key = stateKey(context);
    active.set(key, Object.freeze({
      selection,
      selectionFingerprint: selectionFingerprint(selection),
      lease,
      projection
    }));
    return Object.freeze({
      contextLease: lease,
      continuityProjection: projection,
      selectedConversationEventRefs: Object.freeze(
        selection.selectedEventBindings.map((binding) => binding.eventRef)
      )
    });
  };

  const promptContextAuthorityVerifier = async (query) => {
    if (!query || typeof query !== 'object' || Array.isArray(query)) fail('prompt-context authority query is invalid');
    if (!['MATERIALIZE', 'PRE_PROVIDER'].includes(query.phase)) fail('prompt-context authority query phase is invalid');
    const key = safeRef(query.currentRequestEventRef, 'authority currentRequestEventRef');
    const formed = active.get(key);
    if (!formed) fail('prompt-context authority query has no exact active resolver state');
    if (query.lineageRef !== companionLineageRef ||
        query.threadRef !== formed.selection.threadRef ||
        query.priorConversationHeadSha256 !== formed.selection.priorConversationHeadSha256 ||
        JSON.stringify(query.selectedConversationEventRefs) !== JSON.stringify(
          formed.selection.selectedEventBindings.map((binding) => binding.eventRef)
        )) {
      fail('prompt-context authority query does not match the exact resolver selection');
    }
    const current = Object.freeze({
      eventRef: safeRef(query.currentRequestEventRef, 'authority currentRequestEventRef'),
      eventHash: /^[0-9a-f]{64}$/u.test(query.currentRequestEventHash ?? '')
        ? query.currentRequestEventHash
        : fail('authority currentRequestEventHash is invalid'),
      sequence: Number.isSafeInteger(query.currentRequestSequence) && query.currentRequestSequence >= 0
        ? query.currentRequestSequence
        : fail('authority currentRequestSequence is invalid')
    });
    if (JSON.stringify(current) !== JSON.stringify(formed.selection.currentRequestEventBinding)) {
      fail('prompt-context authority query current request binding changed after selection');
    }

    const prior = readCurrentLivedCompanionCompletedTurn({
      home,
      homeRef,
      deviceRef,
      companionLineageRef,
      threadRef: query.threadRef,
      expectedConversationHeadSha256: query.priorConversationHeadSha256
    });
    const reboundSelection = selectionCore(prior, current);
    if (selectionFingerprint(reboundSelection) !== formed.selectionFingerprint) {
      fail('prompt-context prior-turn selection is no longer current');
    }
    const observedAt = now();
    canonicalTimestamp(observedAt, 'authority observedAt');
    try {
      assertCurrentLease(formed.lease, {
        label: 'browser prompt context',
        observedAt,
        schedulerGeneration: formed.lease.schedulerGeneration,
        runtimeSnapshotFingerprint: formed.lease.runtimeSnapshotFingerprint
      });
    } catch (error) {
      fail('prompt-context lease is no longer current', { cause: error.message });
    }
    const materializationReceiptRefOrNull = query.materializationReceiptRefOrNull ?? null;
    const materializationReceiptFingerprintOrNull = query.materializationReceiptFingerprintOrNull ?? null;
    const witness = Object.freeze({
      schemaVersion: 'vexlife.prompt-context-owner-currentness-witness/v2',
      phase: query.phase,
      authorityRef,
      observedAt,
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE',
      lineageRef: companionLineageRef,
      threadRef: query.threadRef,
      priorConversationHeadSha256: query.priorConversationHeadSha256,
      contextLeaseRef: formed.lease.leaseRef,
      contextLeaseFingerprint: formed.lease.semanticFingerprint,
      continuityProjectionRef: formed.projection.adapterProjectionRef,
      continuityProjectionFingerprint: formed.projection.semanticFingerprint,
      schedulerGeneration: formed.lease.schedulerGeneration,
      runtimeSnapshotFingerprint: formed.lease.runtimeSnapshotFingerprint,
      currentRequestEventBinding: current,
      selectedEventBindings: formed.selection.selectedEventBindings,
      materializationReceiptRefOrNull,
      materializationReceiptFingerprintOrNull
    });
    if (query.phase === 'PRE_PROVIDER') active.delete(key);
    return witness;
  };

  return Object.freeze({
    authorityRef,
    promptContextResolver,
    promptContextAuthorityVerifier,
    activeSelectionCount: () => active.size
  });
}

// [VXG RealForever]
