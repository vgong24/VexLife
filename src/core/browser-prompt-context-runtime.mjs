import { createContextLease } from './context-lease.mjs';
import { assertCurrentLease } from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';
import { projectLivingJournalMemory } from './living-journal-memory-projection.mjs';
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

const MEMORY_MAX_PAGES = 8;
const MEMORY_TOKEN_CAP = 768;
const CONTEXT_INPUT_TOKEN_BUDGET = 3584;
const MEMORY_PACKET_SCHEMA = 'vexlife.prompt-context-memory-packet/v1';
const MEMORY_TRUTH_CLASS = 'CURRENT_ATTRIBUTED_MEMORY_CONTEXT';

function estimatedMessageTokens(content) {
  return Math.max(1, Math.ceil(Buffer.byteLength(content, 'utf8') / 4)) + 4;
}

function memorySystemContent(core) {
  return [
    'VEXLIFE_CURRENT_MEMORY_CONTEXT/v1',
    'These are current source-attributed Memory references, not proof of subjective recall or original wording by this model.',
    'Use them as bounded continuity context. If they conflict with current source or the human, preserve the conflict rather than inventing reconciliation.',
    JSON.stringify(core)
  ].join('\n');
}

function memoryContextFor({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  threadRef,
  memoryTokenCap = MEMORY_TOKEN_CAP
}) {
  if (!Number.isSafeInteger(memoryTokenCap) || memoryTokenCap < 0 || memoryTokenCap > MEMORY_TOKEN_CAP) {
    fail('memoryTokenCap is outside the admitted bounded range');
  }
  const projection = projectLivingJournalMemory({
    home,
    homeRef,
    deviceRef,
    companionLineageRef,
    threadRef,
    maxPages: MEMORY_MAX_PAGES
  });
  if (projection.effects?.homeMutated !== false ||
      projection.effects?.memoryMutated !== false ||
      projection.effects?.modelCalled !== false ||
      projection.effects?.trainingRan !== false ||
      projection.effects?.modelWeightsChanged !== false ||
      projection.rawConversationContentIncluded !== false) {
    fail('Living Journal Memory projection violated the read-only prompt-context boundary');
  }

  const selectedPages = [];
  const tokenBoundedOutPageRefs = [];
  let usedTokens = 0;
  if (projection.state === 'CURRENT' && projection.currentness === 'CURRENT') {
    for (const page of projection.pages) {
      const selected = Object.freeze({
        pageRef: page.pageRef,
        statementRef: page.statementRef,
        summary: page.summary,
        summaryHash: page.summaryHash,
        memoryRelation: page.memoryRelation,
        recordedStatementState: page.recordedStatementState,
        effectiveState: page.effectiveState,
        consentState: page.consentState,
        semanticAcceptanceRef: page.semanticAcceptanceRef,
        semanticAcceptanceSha256: page.semanticAcceptanceSha256,
        semanticAuthorityHeadSha256: page.semanticAuthorityHeadSha256
      });
      const candidateCore = {
        schemaVersion: MEMORY_PACKET_SCHEMA,
        truthClass: MEMORY_TRUTH_CLASS,
        sourceOwnerRefs: [...projection.sourceOwnerRefs],
        currentDailyStratumRef: projection.daily.currentDailyStratumRef,
        currentDailyStratumSha256: projection.daily.currentDailyStratumSha256,
        sourceConversationHeadSha256: projection.daily.sourceConversationHeadSha256,
        sourceScoreHeadSha256: projection.daily.sourceScoreHeadSha256,
        sourceSemanticAuthorityHeadSha256: projection.daily.sourceSemanticAuthorityHeadSha256,
        pages: [...selectedPages, selected],
        heldOrDeferredStatementRefs: [...projection.heldOrDeferredStatementRefs],
        boundedOutStatementRefs: [...projection.boundedOutStatementRefs],
        tokenBoundedOutPageRefs: []
      };
      const estimate = estimatedMessageTokens(memorySystemContent(candidateCore));
      if (estimate > memoryTokenCap) {
        tokenBoundedOutPageRefs.push(page.pageRef);
        continue;
      }
      selectedPages.push(selected);
      usedTokens = estimate;
    }
  }

  const packet = Object.freeze({
    schemaVersion: MEMORY_PACKET_SCHEMA,
    truthClass: MEMORY_TRUTH_CLASS,
    projectionState: projection.state,
    projectionCurrentness: projection.currentness,
    sourceOwnerRefs: Object.freeze([...(projection.sourceOwnerRefs ?? [])]),
    currentDailyStratumRef: projection.daily?.currentDailyStratumRef ?? null,
    currentDailyStratumSha256: projection.daily?.currentDailyStratumSha256 ?? null,
    sourceConversationHeadSha256: projection.daily?.sourceConversationHeadSha256 ?? null,
    sourceScoreHeadSha256: projection.daily?.sourceScoreHeadSha256 ?? null,
    sourceSemanticAuthorityHeadSha256: projection.daily?.sourceSemanticAuthorityHeadSha256 ?? null,
    pages: Object.freeze(selectedPages),
    heldOrDeferredStatementRefs: Object.freeze([...(projection.heldOrDeferredStatementRefs ?? [])]),
    boundedOutStatementRefs: Object.freeze([...(projection.boundedOutStatementRefs ?? [])]),
    tokenBoundedOutPageRefs: Object.freeze(tokenBoundedOutPageRefs),
    reasons: Object.freeze([...(projection.reasons ?? [])]),
    memoryTokenCap
  });
  const included = packet.projectionState === 'CURRENT' &&
    packet.projectionCurrentness === 'CURRENT' &&
    packet.pages.length > 0;
  const systemContent = included ? memorySystemContent(packet) : null;
  const core = Object.freeze({
    ...packet,
    systemMessageSha256: systemContent === null ? null : semanticHash(systemContent),
    estimatedSystemMessageTokens: systemContent === null ? 0 : estimatedMessageTokens(systemContent)
  });
  if (core.estimatedSystemMessageTokens > MEMORY_TOKEN_CAP) {
    fail('selected Memory packet exceeds its exact token cap');
  }
  const semanticFingerprint = semanticHash(core);
  const sourceRefs = [
    ...(core.sourceOwnerRefs ?? []),
    ...(core.currentDailyStratumRef ? [core.currentDailyStratumRef] : []),
    ...core.pages.flatMap((page) => [page.pageRef, page.statementRef, page.semanticAcceptanceRef])
  ].filter(Boolean).sort();
  return Object.freeze({
    ...core,
    memoryContextRef: `memory-context.vexlife.prompt.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint,
    sourceRefs: Object.freeze([...new Set(sourceRefs)]),
    systemMessage: included
      ? Object.freeze({ role: 'system', content: systemContent })
      : null,
    included
  });
}

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

function selectionCore(prior, current, memoryContext, currentRequestInputTokenEstimate) {
  if (!Number.isSafeInteger(currentRequestInputTokenEstimate) || currentRequestInputTokenEstimate <= 0) {
    fail('current request input token estimate is invalid');
  }
  const priorInputTokenEstimate = prior.requestInputTokenEstimate + prior.responseInputTokenEstimate;
  if (!Number.isSafeInteger(priorInputTokenEstimate) || priorInputTokenEstimate <= 0) {
    fail('prior completed-turn input token estimate is invalid');
  }
  return Object.freeze({
    schemaVersion: 'vexlife.browser-prompt-context-runtime-selection/v2',
    homeRef: prior.homeRef,
    deviceRef: prior.deviceRef,
    lineageRef: prior.companionLineageRef,
    threadRef: prior.threadRef,
    priorConversationHeadSha256: prior.conversationHeadSha256,
    priorHeadSequence: prior.headSequence,
    priorInputTokenEstimate,
    currentRequestInputTokenEstimate,
    currentRequestEventBinding: current,
    memoryContextRef: memoryContext.memoryContextRef,
    memoryContextFingerprint: memoryContext.semanticFingerprint,
    memorySourceRefs: memoryContext.sourceRefs,
    memoryIncluded: memoryContext.included,
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
    memorySelectionPerformed: memoryContext.included,
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
    selectedSourceRefs: [
      ...selection.selectedEventBindings.map((binding) => binding.eventRef),
      ...selection.memorySourceRefs
    ].sort(),
    memoryContextRef: selection.memoryContextRef,
    memoryContextFingerprint: selection.memoryContextFingerprint,
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
    capabilityLeaseFingerprint: semanticHash({ ...policy, class: 'CAPABILITY_LEASE', capability: 'IMMEDIATE_PRIOR_PLUS_CURRENT_MEMORY' }),
    effectLeaseFingerprint: semanticHash({ ...policy, class: 'EFFECT_LEASE', effects: EFFECTS }),
    cancellationTokenRef: `cancellation.vexlife.browser-prompt-context.${currentHash.slice(0, 32)}`,
    foundationKernelRef: 'foundation.vexlife.browser-prompt-context-runtime',
    roleFrameRef: 'role-frame.vexlife.browser-prompt-context-runtime',
    intentFrameRef: `intent-frame.vexlife.browser-prompt-context.${currentHash.slice(0, 32)}`,
    selectedAtlasRefs: [],
    selectedSourceRefs: [
      ...selection.selectedEventBindings.map((binding) => binding.eventRef),
      ...selection.memorySourceRefs
    ].sort(),
    applicableCultureRefs: [],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: CONTEXT_INPUT_TOKEN_BUDGET,
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
      currentStatementRefs: selection.memoryIncluded
        ? selection.memorySourceRefs.filter((ref) => ref.startsWith('statement.'))
        : [],
      currentContinuityRecordRefs: [],
      currentDailyStratumRefOrNull: selection.memoryIncluded
        ? selection.memorySourceRefs.find((ref) => ref.startsWith('daily-stratum.')) ?? null
        : null,
      recoveryPhaseOrNull: null
    },
    sourceRefs: [...selection.memorySourceRefs],
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

  const releaseSelection = (key, expected = null) => {
    const current = active.get(key);
    if (!current || (expected !== null && current !== expected)) return false;
    active.delete(key);
    if (current.expiryTimer) clearTimeout(current.expiryTimer);
    return true;
  };

  const retainSelection = (key, selection, lease, projection) => {
    releaseSelection(key);
    let formed = null;
    const expiryTimer = setTimeout(() => {
      if (formed && active.get(key) === formed) active.delete(key);
    }, leaseTtlMs);
    if (typeof expiryTimer.unref === 'function') expiryTimer.unref();
    formed = Object.freeze({
      selection,
      selectionFingerprint: selectionFingerprint(selection),
      lease,
      projection,
      expiryTimer
    });
    active.set(key, formed);
    return formed;
  };

  const promptContextResolver = async ({ context, taskIntent }) => {
    if (typeof taskIntent !== 'string' || taskIntent.length === 0) {
      fail('prompt-context resolver requires the exact current request content for token budgeting');
    }
    const current = exactCurrentRequestBinding(context);
    const threadRef = safeRef(context.threadRef, 'threadRef');
    const priorHeadSha256 = context.priorConversationHeadSha256 ?? null;
    if (priorHeadSha256 === null) {
      releaseSelection(stateKey(context));
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
    const currentRequestInputTokenEstimate = estimatedMessageTokens(taskIntent);
    const priorInputTokenEstimate = prior.requestInputTokenEstimate + prior.responseInputTokenEstimate;
    const remainingInputTokens = Math.max(
      0,
      CONTEXT_INPUT_TOKEN_BUDGET - priorInputTokenEstimate - currentRequestInputTokenEstimate
    );
    const memoryContext = memoryContextFor({
      home,
      homeRef,
      deviceRef,
      companionLineageRef,
      threadRef,
      memoryTokenCap: Math.min(MEMORY_TOKEN_CAP, remainingInputTokens)
    });
    const selection = selectionCore(prior, current, memoryContext, currentRequestInputTokenEstimate);
    const observedAt = now();
    canonicalTimestamp(observedAt, 'resolver observedAt');
    const lease = createContextLease(leaseInput(selection, observedAt, leaseTtlMs)).lease;
    const projection = continuityProjection(selection, lease);
    const key = stateKey(context);
    retainSelection(key, selection, lease, projection);
    return Object.freeze({
      contextLease: lease,
      continuityProjection: projection,
      selectedConversationEventRefs: Object.freeze(
        selection.selectedEventBindings.map((binding) => binding.eventRef)
      ),
      memoryContext
    });
  };

  const promptContextAuthorityVerifier = async (query) => {
    if (!query || typeof query !== 'object' || Array.isArray(query)) fail('prompt-context authority query is invalid');
    if (!['MATERIALIZE', 'PRE_PROVIDER'].includes(query.phase)) fail('prompt-context authority query phase is invalid');
    const key = safeRef(query.currentRequestEventRef, 'authority currentRequestEventRef');
    const formed = active.get(key);
    if (!formed) fail('prompt-context authority query has no exact active resolver state');
    try {
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
      const reboundRemainingInputTokens = Math.max(
        0,
        CONTEXT_INPUT_TOKEN_BUDGET -
          (prior.requestInputTokenEstimate + prior.responseInputTokenEstimate) -
          formed.selection.currentRequestInputTokenEstimate
      );
      const reboundMemoryContext = memoryContextFor({
        home,
        homeRef,
        deviceRef,
        companionLineageRef,
        threadRef: query.threadRef,
        memoryTokenCap: Math.min(MEMORY_TOKEN_CAP, reboundRemainingInputTokens)
      });
      const reboundSelection = selectionCore(
        prior,
        current,
        reboundMemoryContext,
        formed.selection.currentRequestInputTokenEstimate
      );
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
      if (query.phase === 'PRE_PROVIDER') releaseSelection(key, formed);
      return witness;
    } catch (error) {
      releaseSelection(key, formed);
      throw error;
    }
  };

  return Object.freeze({
    authorityRef,
    promptContextResolver,
    promptContextAuthorityVerifier,
    activeSelectionCount: () => active.size
  });
}

// [VXG RealForever]
