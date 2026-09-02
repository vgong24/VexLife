import { semanticHash } from './utils.mjs';
import { verifyModelRuntimeObservation } from './model-runtime-adapter.mjs';

export const MODEL_TURN_WITNESS_SCHEMA = 'vexlife.model-turn-witness/v1';

const HEX64 = /^[0-9a-f]{64}$/u;
function nonempty(value) { return typeof value === 'string' && value.length > 0; }
function uniqueStrings(value) { return Array.isArray(value) && value.every(nonempty) && new Set(value).size === value.length; }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (plainObject(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v]) => [k, freezeDeep(v)])));
  return value;
}

function promptContextBinding(receipt) {
  if (receipt === null || receipt === undefined) return Object.freeze({ receiptRef: null, semanticFingerprint: null });
  if (!nonempty(receipt.receiptRef) || !HEX64.test(receipt.semanticFingerprint ?? '')) {
    throw new TypeError('prompt-context receipt identity is invalid');
  }
  return Object.freeze({ receiptRef: receipt.receiptRef, semanticFingerprint: receipt.semanticFingerprint });
}

export function formModelTurnWitness({
  turnRef,
  requestMessageRef,
  responseMessageRef,
  runtimeObservation,
  promptContextMaterializationReceipt = null,
  currentnessRefs = [],
  availableCapabilityRefs = [],
  heldCapabilityRefs = [],
  unavailableCapabilityRefs = [],
  unknownCapabilityRefs = [],
  formedAt = new Date().toISOString()
}) {
  for (const [key, value] of Object.entries({ turnRef, requestMessageRef, responseMessageRef })) {
    if (!nonempty(value)) throw new TypeError(`${key} is required`);
  }
  if (!verifyModelRuntimeObservation(runtimeObservation)) throw new TypeError('runtime observation is not content-addressed and privacy-safe');
  for (const [key, value] of Object.entries({ currentnessRefs, availableCapabilityRefs, heldCapabilityRefs, unavailableCapabilityRefs, unknownCapabilityRefs })) {
    if (!uniqueStrings(value)) throw new TypeError(`${key} must contain unique non-empty refs`);
  }
  const overlap = new Set([...availableCapabilityRefs, ...heldCapabilityRefs, ...unavailableCapabilityRefs, ...unknownCapabilityRefs]);
  const count = availableCapabilityRefs.length + heldCapabilityRefs.length + unavailableCapabilityRefs.length + unknownCapabilityRefs.length;
  if (overlap.size !== count) throw new TypeError('capability dispositions must be mutually exclusive');
  const runtime = runtimeObservation;
  const core = {
    schemaVersion: MODEL_TURN_WITNESS_SCHEMA,
    truthClass: 'EXTERNAL_MODEL_TURN_WITNESS',
    turnRef,
    requestMessageRef,
    responseMessageRef,
    runtimeObservationRef: runtime.observationRef,
    runtimeObservationSha256: runtime.observationSha256,
    modelBundleRef: runtime.modelBundleRef,
    operationalProfileRef: runtime.operationalProfileRef,
    runtimeRevisionRef: runtime.runtimeRevisionRef,
    runtimeCapabilityEvidenceRef: runtime.runtimeCapabilityEvidenceRef,
    endpointProfileRef: runtime.endpointProfileRef,
    promptContext: promptContextBinding(promptContextMaterializationReceipt),
    output: runtime.output,
    modelProvenance: runtime.modelProvenance,
    reasoningTrace: runtime.reasoningTrace,
    usageSummary: runtime.usageSummary,
    runtimeTimingSummary: runtime.runtimeTimingSummary,
    structuredOutputState: runtime.structuredOutputState,
    unknownUpstreamFields: runtime.unknownUpstreamFields,
    capabilityDisposition: {
      availableRefs: [...availableCapabilityRefs].sort(),
      heldRefs: [...heldCapabilityRefs].sort(),
      unavailableRefs: [...unavailableCapabilityRefs].sort(),
      unknownRefs: [...unknownCapabilityRefs].sort()
    },
    currentnessRefs: [...currentnessRefs].sort(),
    observedEffects: {
      modelRuntimeObserved: true,
      providerOrNetworkObserved: true,
      nativeToolExecutionObserved: false,
      multimodalInputObserved: false,
      trainingEffectObserved: false,
      modelWeightEffectObserved: false
    },
    privacy: {
      rawProviderResponsePersisted: false,
      rawReasoningPersisted: false,
      rawReportedModelPersisted: false,
      visibleResponseDuplicatedInWitness: false,
      privateContentAddedByWitness: false
    },
    trust: {
      modelSelfReportUsedAsExternalFact: false,
      runtimeObservationExternallyFormed: true
    },
    formedAt
  };
  const witnessSha256 = semanticHash(core);
  return freezeDeep({
    ...core,
    witnessRef: `witness.vexlife.model-turn.${witnessSha256.slice(0, 32)}`,
    witnessSha256
  });
}

export function verifyModelTurnWitness(value) {
  if (!plainObject(value)) return false;
  const { witnessRef, witnessSha256, ...core } = value;
  return value.schemaVersion === MODEL_TURN_WITNESS_SCHEMA
    && HEX64.test(witnessSha256 ?? '')
    && witnessRef === `witness.vexlife.model-turn.${witnessSha256.slice(0, 32)}`
    && semanticHash(core) === witnessSha256
    && value.privacy?.rawProviderResponsePersisted === false
    && value.privacy?.rawReasoningPersisted === false
    && value.privacy?.rawReportedModelPersisted === false
    && value.privacy?.visibleResponseDuplicatedInWitness === false
    && value.trust?.modelSelfReportUsedAsExternalFact === false;
}

// [VXG RealForever]
