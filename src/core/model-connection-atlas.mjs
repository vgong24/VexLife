export const MODEL_TURN_FORMATION_ATLAS_SCHEMA = 'vexlife.model-turn-formation-atlas/v1';
export const MODEL_TURN_FORMATION_EVIDENCE_SCHEMA = 'vexlife.model-turn-formation-evidence/v1';

const HEX64 = /^[0-9a-f]{64}$/u;
const MODEL_CONNECTION_SCHEMA = 'vexlife.model-connection-projection/v1';
const SELF_FRAME_SCHEMA = 'vexlife.vex-self-capability-frame/v1';
const WITNESS_SCHEMA = 'vexlife.model-turn-witness/v1';
const CAPABILITY_RUNTIME_SCHEMA = 'vexlife.capability-assimilation-runtime/v1';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}
function uniqueSortedRefs(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(nonempty))].sort();
}
function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])
  ));
  return value;
}
function safeSha(value) {
  return typeof value === 'string' && HEX64.test(value) ? value : null;
}
function safeWitness(value) {
  if (!object(value) ||
      value.schemaVersion !== WITNESS_SCHEMA ||
      value.truthClass !== 'EXTERNAL_MODEL_TURN_WITNESS' ||
      !nonempty(value.witnessRef) ||
      !safeSha(value.witnessSha256) ||
      !nonempty(value.turnRef) ||
      !object(value.runtimeObservation) ||
      !object(value.capabilityDisposition) ||
      !object(value.observedEffects) ||
      !object(value.privacy) ||
      !object(value.trust)) {
    throw new TypeError('one closed external ModelTurnWitness projection is required');
  }
  if (value.privacy.rawProviderResponsePersisted !== false ||
      value.privacy.rawReasoningPersisted !== false ||
      value.privacy.privateContentAddedByWitness !== false ||
      value.trust.modelSelfReportUsedAsExternalFact !== false) {
    throw new TypeError('ModelTurnWitness privacy/trust boundary is not safe for human projection');
  }
  return value;
}
function safeCapabilityDisposition(value) {
  return freezeDeep({
    availableRefs: uniqueSortedRefs(value?.availableRefs),
    heldRefs: uniqueSortedRefs(value?.heldRefs),
    unavailableRefs: uniqueSortedRefs(value?.unavailableRefs),
    unknownRefs: uniqueSortedRefs(value?.unknownRefs)
  });
}
function safeObservedEffects(value) {
  const fields = [
    'modelRuntimeObserved',
    'providerOrNetworkObserved',
    'nativeToolExecutionObserved',
    'multimodalInputObserved',
    'trainingEffectObserved',
    'modelWeightEffectObserved'
  ];
  return freezeDeep(Object.fromEntries(fields.map((key) => [key, value?.[key] === true])));
}
function safeReasoningTrace(runtimeObservation) {
  const reasoning = object(runtimeObservation?.reasoningTrace) ? runtimeObservation.reasoningTrace : null;
  if (!reasoning) return freezeDeep({
    present: false,
    contentSha256: null,
    rawState: 'ABSENT',
    rawIncluded: false
  });
  return freezeDeep({
    present: reasoning.present === true,
    contentSha256: safeSha(reasoning.contentSha256),
    rawState: nonempty(reasoning.rawState) ? reasoning.rawState : 'SEALED',
    rawIncluded: false
  });
}
function safeRuntimeProjection(runtime) {
  if (!object(runtime) || runtime.schemaVersion !== CAPABILITY_RUNTIME_SCHEMA) {
    return freezeDeep({ state: 'UNKNOWN_NOT_PROJECTED', schemaVersion: null });
  }
  return freezeDeep({
    state: 'CURRENT_BOUNDED_RUNTIME_PROJECTION',
    schemaVersion: runtime.schemaVersion,
    mode: nonempty(runtime.mode) ? runtime.mode : null,
    inferenceCount: Number.isSafeInteger(runtime.inferenceCount) ? runtime.inferenceCount : null,
    toolRequestCount: Number.isSafeInteger(runtime.toolRequestCount) ? runtime.toolRequestCount : null,
    observationRefs: uniqueSortedRefs(runtime.observationRefs),
    hiddenReasoningIncluded: runtime.hiddenReasoningIncluded === true,
    externalEffectsExecuted: runtime.externalEffectsExecuted === true
  });
}
function safePromptContext(materialization, witness) {
  const source = object(materialization) ? materialization : object(witness?.promptContext) ? witness.promptContext : null;
  return freezeDeep({
    state: nonempty(source?.receiptRef) ? 'CURRENT_REFERENCE_PRESENT' : 'ABSENT_OR_UNKNOWN',
    receiptRef: nonempty(source?.receiptRef) ? source.receiptRef : null,
    semanticFingerprint: safeSha(source?.semanticFingerprint)
  });
}
function safeModelConnection(projection, witnessRef) {
  if (!object(projection) ||
      projection.schemaVersion !== MODEL_CONNECTION_SCHEMA ||
      projection.truthClass !== 'SOURCE_BOUND_MODEL_CONNECTION' ||
      !nonempty(projection.projectionRef) ||
      !safeSha(projection.projectionSha256) ||
      projection.effectAuthorityGranted !== false ||
      projection.modelTurnWitnessRef !== witnessRef) {
    return freezeDeep({
      state: 'UNKNOWN_NOT_PROJECTED_TO_THIS_SURFACE',
      projectionRef: null,
      projectionSha256: null,
      currentnessRefs: [],
      sourceRefs: [],
      effectAuthorityGranted: false
    });
  }
  return freezeDeep({
    state: 'CURRENT_SOURCE_BOUND_REFERENCE',
    projectionRef: projection.projectionRef,
    projectionSha256: projection.projectionSha256,
    currentnessRefs: uniqueSortedRefs(projection.currentnessRefs),
    sourceRefs: uniqueSortedRefs(projection.sourceRefs),
    effectAuthorityGranted: false
  });
}
function safeSelfFrame(frame, modelConnection) {
  if (!object(frame) ||
      frame.schemaVersion !== SELF_FRAME_SCHEMA ||
      frame.truthClass !== 'BOUNDED_SOURCE_BOUND_SELF_CAPABILITY_FRAME' ||
      !nonempty(frame.selfCapabilityFrameRef) ||
      !safeSha(frame.semanticFingerprint) ||
      frame.effectAuthorityGranted !== false ||
      modelConnection.state !== 'CURRENT_SOURCE_BOUND_REFERENCE' ||
      frame.modelConnectionProjectionRef !== modelConnection.projectionRef) {
    return freezeDeep({
      state: 'UNKNOWN_NOT_PROJECTED_TO_THIS_SURFACE',
      selfCapabilityFrameRef: null,
      semanticFingerprint: null,
      availableCapabilityRefs: [],
      heldCapabilityRefs: [],
      unavailableCapabilityRefs: [],
      unknownCapabilityRefs: [],
      actuallyUsedRefs: [],
      effectAuthorityGranted: false
    });
  }
  return freezeDeep({
    state: 'CURRENT_BOUNDED_REFERENCE',
    selfCapabilityFrameRef: frame.selfCapabilityFrameRef,
    semanticFingerprint: frame.semanticFingerprint,
    availableCapabilityRefs: uniqueSortedRefs(frame.availableCapabilityRefs),
    heldCapabilityRefs: uniqueSortedRefs((frame.heldCapabilityEntries ?? []).map((entry) => entry?.capabilityRef)),
    unavailableCapabilityRefs: uniqueSortedRefs(frame.unavailableCapabilityRefs),
    unknownCapabilityRefs: uniqueSortedRefs(frame.unknownCapabilityRefs),
    actuallyUsedRefs: uniqueSortedRefs(frame.actuallyUsedRefs),
    effectAuthorityGranted: false
  });
}

export function projectTurnFormationEvidence({
  modelTurnWitness,
  capabilityRuntime = null,
  promptContextMaterialization = null,
  modelConnectionProjection = null,
  selfCapabilityFrame = null
} = {}) {
  const witness = safeWitness(modelTurnWitness);
  const runtimeObservation = witness.runtimeObservation;
  const modelConnection = safeModelConnection(modelConnectionProjection, witness.witnessRef);
  const selfCapability = safeSelfFrame(selfCapabilityFrame, modelConnection);
  return freezeDeep({
    schemaVersion: MODEL_TURN_FORMATION_EVIDENCE_SCHEMA,
    truthClass: 'BOUNDED_CURRENT_TURN_FORMATION_EVIDENCE',
    turnRef: witness.turnRef,
    modelTurnWitnessRef: witness.witnessRef,
    modelTurnWitnessSha256: witness.witnessSha256,
    model: {
      modelBundleRef: nonempty(runtimeObservation.modelBundleRef) ? runtimeObservation.modelBundleRef : null,
      operationalProfileRef: nonempty(runtimeObservation.operationalProfileRef) ? runtimeObservation.operationalProfileRef : null,
      runtimeRevisionRef: nonempty(runtimeObservation.runtimeRevisionRef) ? runtimeObservation.runtimeRevisionRef : null,
      runtimeCapabilityEvidenceRef: nonempty(runtimeObservation.runtimeCapabilityEvidenceRef) ? runtimeObservation.runtimeCapabilityEvidenceRef : null
    },
    capabilityDisposition: safeCapabilityDisposition(witness.capabilityDisposition),
    capabilityRuntime: safeRuntimeProjection(capabilityRuntime),
    promptContext: safePromptContext(promptContextMaterialization, witness),
    modelConnection,
    selfCapability,
    currentnessRefs: uniqueSortedRefs(witness.currentnessRefs),
    observedEffects: safeObservedEffects(witness.observedEffects),
    reasoningTrace: safeReasoningTrace(runtimeObservation),
    privacy: {
      rawReasoningIncluded: false,
      rawProviderResponseIncluded: false,
      rawReportedModelIncluded: false,
      privateHomeMemoryIncluded: false,
      unboundedTranscriptIncluded: false
    },
    effectAuthorityGranted: false
  });
}

export function projectModelTurnFormationAtlas({
  atlas,
  modelTurnWitness,
  capabilityRuntime = null,
  promptContextMaterialization = null,
  modelConnectionProjection = null,
  selfCapabilityFrame = null,
  tokenBudget = 700
} = {}) {
  if (!atlas || typeof atlas.query !== 'function') {
    throw new TypeError('canonical Atlas query owner is required');
  }
  if (!Number.isInteger(tokenBudget) || tokenBudget < 128 || tokenBudget > 2400) {
    throw new TypeError('tokenBudget must be an integer between 128 and 2400');
  }
  const evidence = projectTurnFormationEvidence({
    modelTurnWitness,
    capabilityRuntime,
    promptContextMaterialization,
    modelConnectionProjection,
    selfCapabilityFrame
  });
  const atlasQuery = atlas.query({
    intent: 'model connection capability runtime witness currentness',
    startRefs: [],
    depthLimit: 1,
    resultLimit: 6,
    tokenBudget,
    externalMeaningEnvelopes: []
  });
  return freezeDeep({
    schemaVersion: MODEL_TURN_FORMATION_ATLAS_SCHEMA,
    truthClass: 'BOUNDED_ATLAS_COMPOSITION_OVER_ACCEPTED_TURN_EVIDENCE',
    evidence,
    atlas: {
      results: Array.isArray(atlasQuery?.results) ? atlasQuery.results.map((entry) => ({
        ref: entry?.ref ?? null,
        kind: entry?.kind ?? null,
        brief: entry?.brief ?? null,
        stateHash: safeSha(entry?.stateHash),
        currentness: entry?.currentness ?? 'UNKNOWN',
        via: entry?.via ?? null,
        depth: Number.isSafeInteger(entry?.depth) ? entry.depth : null
      })) : [],
      coverage: object(atlasQuery?.coverage) ? {
        depthLimit: atlasQuery.coverage.depthLimit ?? null,
        resultLimit: atlasQuery.coverage.resultLimit ?? null,
        tokenBudget: atlasQuery.coverage.tokenBudget ?? null,
        usedTokens: atlasQuery.coverage.usedTokens ?? null,
        visitedCount: atlasQuery.coverage.visitedCount ?? null,
        truncated: atlasQuery.coverage.truncated === true,
        truncatedBy: atlasQuery.coverage.truncatedBy ?? null
      } : null
    },
    canonicalAtlasConsumed: true,
    newGraphCreated: false,
    effectAuthorityGranted: false
  });
}

// [VXG RealForever]
