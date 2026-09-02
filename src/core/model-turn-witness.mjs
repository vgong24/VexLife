import { semanticHash } from './utils.mjs';
import { verifyModelRuntimeObservation } from './model-runtime-adapter.mjs';

export const MODEL_TURN_WITNESS_SCHEMA = 'vexlife.model-turn-witness/v1';
export const MODEL_RUNTIME_INVOCATION_EVIDENCE_SCHEMA = 'vexlife.model-runtime-invocation-evidence/v1';

const HEX64 = /^[0-9a-f]{64}$/u;
const INVOCATION_KEYS = new Set(['schemaVersion','truthClass','endpointProfileRef','sanitizedEndpointOrigin','requestBodySha256','responseBodySha256','runtimeObservationRef','runtimeObservationSha256','httpStatus','actualHttpCall','loopbackOnly','observedEffects','formedAt','invocationRef','invocationSha256']);
const EFFECT_KEYS = new Set(['modelRuntimeObserved','providerOrNetworkObserved','nativeToolExecutionObserved','multimodalInputObserved','trainingEffectObserved','modelWeightEffectObserved']);
const WITNESS_KEYS = new Set(['schemaVersion','truthClass','turnRef','requestMessageRef','responseMessageRef','runtimeObservation','invocationEvidence','promptContext','capabilityDisposition','currentnessRefs','observedEffects','privacy','trust','formedAt','witnessRef','witnessSha256']);
const PROMPT_KEYS = new Set(['receiptRef','semanticFingerprint']);
const CAPABILITY_KEYS = new Set(['availableRefs','heldRefs','unavailableRefs','unknownRefs']);
const PRIVACY_KEYS = new Set(['rawProviderResponsePersisted','rawReasoningPersisted','rawReportedModelPersisted','visibleResponseDuplicatedInWitness','privateContentAddedByWitness']);
const TRUST_KEYS = new Set(['modelSelfReportUsedAsExternalFact','runtimeObservationExternallyFormed','invocationEvidenceExternallyFormed']);

function nonempty(value) { return typeof value === 'string' && value.length > 0; }
function uniqueStrings(value) { return Array.isArray(value) && value.every(nonempty) && new Set(value).size === value.length; }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, allowed) { return plainObject(value) && Object.keys(value).length === allowed.size && Object.keys(value).every((key) => allowed.has(key)); }
function canonicalTimestamp(value) { if (!nonempty(value)) return false; const ms = Date.parse(value); return Number.isFinite(ms) && new Date(ms).toISOString() === value; }
function freezeDeep(value) { if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep)); if (plainObject(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v]) => [k, freezeDeep(v)]))); return value; }
function sortedUniqueStrings(value) { return uniqueStrings(value) && JSON.stringify([...value].sort()) === JSON.stringify(value); }
function numericLoopbackOrigin(value) {
  if (!nonempty(value)) return false;
  try {
    const parsed = new URL(value), hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
    return parsed.protocol === 'http:' && ['127.0.0.1','::1'].includes(hostname) && parsed.origin === value && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch { return false; }
}
function validObservedEffects(value) {
  return exactKeys(value, EFFECT_KEYS)
    && value.modelRuntimeObserved === true && value.providerOrNetworkObserved === true
    && value.nativeToolExecutionObserved === false && value.multimodalInputObserved === false
    && value.trainingEffectObserved === false && value.modelWeightEffectObserved === false;
}

function promptContextBinding(receipt) {
  if (receipt === null || receipt === undefined) return Object.freeze({ receiptRef: null, semanticFingerprint: null });
  if (!nonempty(receipt.receiptRef) || !HEX64.test(receipt.semanticFingerprint ?? '')) throw new TypeError('prompt-context receipt identity is invalid');
  return Object.freeze({ receiptRef: receipt.receiptRef, semanticFingerprint: receipt.semanticFingerprint });
}
function validPromptContext(value) {
  if (!exactKeys(value, PROMPT_KEYS)) return false;
  return value.receiptRef === null && value.semanticFingerprint === null
    || nonempty(value.receiptRef) && HEX64.test(value.semanticFingerprint ?? '');
}

export function formModelRuntimeInvocationEvidence({
  endpointProfileRef,
  sanitizedEndpointOrigin,
  requestBodySha256,
  runtimeObservation,
  httpStatus,
  actualHttpCall,
  formedAt = new Date().toISOString()
}) {
  if (!verifyModelRuntimeObservation(runtimeObservation)) throw new TypeError('runtime observation is not a closed external observation');
  if (!nonempty(endpointProfileRef) || endpointProfileRef !== runtimeObservation.endpointProfileRef) throw new TypeError('invocation endpoint profile does not match runtime observation');
  if (!numericLoopbackOrigin(sanitizedEndpointOrigin)) throw new TypeError('invocation origin must be one admitted numeric loopback origin');
  if (!HEX64.test(requestBodySha256 ?? '')) throw new TypeError('request body SHA-256 is required');
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300) throw new TypeError('successful HTTP status is required');
  if (actualHttpCall !== true) throw new TypeError('actual HTTP call evidence is required');
  if (!canonicalTimestamp(formedAt)) throw new TypeError('invocation formedAt must be one canonical timestamp');
  const core = {
    schemaVersion: MODEL_RUNTIME_INVOCATION_EVIDENCE_SCHEMA,
    truthClass: 'EXTERNAL_RUNTIME_INVOCATION_EVIDENCE',
    endpointProfileRef,
    sanitizedEndpointOrigin,
    requestBodySha256,
    responseBodySha256: runtimeObservation.responseBodySha256,
    runtimeObservationRef: runtimeObservation.observationRef,
    runtimeObservationSha256: runtimeObservation.observationSha256,
    httpStatus,
    actualHttpCall: true,
    loopbackOnly: true,
    observedEffects: { modelRuntimeObserved: true, providerOrNetworkObserved: true, nativeToolExecutionObserved: false, multimodalInputObserved: false, trainingEffectObserved: false, modelWeightEffectObserved: false },
    formedAt
  };
  const invocationSha256 = semanticHash(core);
  return freezeDeep({ ...core, invocationRef: `evidence.vexlife.model-runtime-invocation.${invocationSha256.slice(0, 32)}`, invocationSha256 });
}

export function verifyModelRuntimeInvocationEvidence(value) {
  if (!exactKeys(value, INVOCATION_KEYS) || value.schemaVersion !== MODEL_RUNTIME_INVOCATION_EVIDENCE_SCHEMA || value.truthClass !== 'EXTERNAL_RUNTIME_INVOCATION_EVIDENCE'
      || !nonempty(value.endpointProfileRef) || !numericLoopbackOrigin(value.sanitizedEndpointOrigin) || !HEX64.test(value.requestBodySha256 ?? '')
      || !HEX64.test(value.responseBodySha256 ?? '') || !nonempty(value.runtimeObservationRef) || !HEX64.test(value.runtimeObservationSha256 ?? '')
      || !Number.isInteger(value.httpStatus) || value.httpStatus < 200 || value.httpStatus >= 300 || value.actualHttpCall !== true || value.loopbackOnly !== true
      || !validObservedEffects(value.observedEffects) || !canonicalTimestamp(value.formedAt) || !HEX64.test(value.invocationSha256 ?? '')) return false;
  const { invocationRef, invocationSha256, ...core } = value;
  return invocationRef === `evidence.vexlife.model-runtime-invocation.${invocationSha256.slice(0, 32)}` && semanticHash(core) === invocationSha256;
}

function validCapabilityDisposition(value) {
  if (!exactKeys(value, CAPABILITY_KEYS)) return false;
  for (const refs of Object.values(value)) if (!sortedUniqueStrings(refs)) return false;
  const all = [...value.availableRefs, ...value.heldRefs, ...value.unavailableRefs, ...value.unknownRefs];
  return new Set(all).size === all.length;
}
function validPrivacy(value) { return exactKeys(value, PRIVACY_KEYS) && Object.values(value).every((entry) => entry === false); }
function validTrust(value) { return exactKeys(value, TRUST_KEYS) && value.modelSelfReportUsedAsExternalFact === false && value.runtimeObservationExternallyFormed === true && value.invocationEvidenceExternallyFormed === true; }

export function formModelTurnWitness({
  turnRef, requestMessageRef, responseMessageRef, runtimeObservation, invocationEvidence,
  promptContextMaterializationReceipt = null, currentnessRefs = [], availableCapabilityRefs = [], heldCapabilityRefs = [], unavailableCapabilityRefs = [], unknownCapabilityRefs = [],
  formedAt = new Date().toISOString()
}) {
  for (const [key, value] of Object.entries({ turnRef, requestMessageRef, responseMessageRef })) if (!nonempty(value)) throw new TypeError(`${key} is required`);
  if (!verifyModelRuntimeObservation(runtimeObservation)) throw new TypeError('runtime observation is not a closed external observation');
  if (!verifyModelRuntimeInvocationEvidence(invocationEvidence)) throw new TypeError('closed invocation-owner evidence is required');
  if (invocationEvidence.runtimeObservationRef !== runtimeObservation.observationRef || invocationEvidence.runtimeObservationSha256 !== runtimeObservation.observationSha256
      || invocationEvidence.responseBodySha256 !== runtimeObservation.responseBodySha256 || invocationEvidence.endpointProfileRef !== runtimeObservation.endpointProfileRef) {
    throw new TypeError('invocation evidence does not bind the exact runtime observation');
  }
  for (const [key, value] of Object.entries({ currentnessRefs, availableCapabilityRefs, heldCapabilityRefs, unavailableCapabilityRefs, unknownCapabilityRefs })) if (!uniqueStrings(value)) throw new TypeError(`${key} must contain unique non-empty refs`);
  const overlap = new Set([...availableCapabilityRefs, ...heldCapabilityRefs, ...unavailableCapabilityRefs, ...unknownCapabilityRefs]);
  const count = availableCapabilityRefs.length + heldCapabilityRefs.length + unavailableCapabilityRefs.length + unknownCapabilityRefs.length;
  if (overlap.size !== count) throw new TypeError('capability dispositions must be mutually exclusive');
  if (!canonicalTimestamp(formedAt)) throw new TypeError('witness formedAt must be one canonical timestamp');
  const core = {
    schemaVersion: MODEL_TURN_WITNESS_SCHEMA,
    truthClass: 'EXTERNAL_MODEL_TURN_WITNESS',
    turnRef, requestMessageRef, responseMessageRef,
    runtimeObservation,
    invocationEvidence,
    promptContext: promptContextBinding(promptContextMaterializationReceipt),
    capabilityDisposition: { availableRefs: [...availableCapabilityRefs].sort(), heldRefs: [...heldCapabilityRefs].sort(), unavailableRefs: [...unavailableCapabilityRefs].sort(), unknownRefs: [...unknownCapabilityRefs].sort() },
    currentnessRefs: [...currentnessRefs].sort(),
    observedEffects: invocationEvidence.observedEffects,
    privacy: { rawProviderResponsePersisted: false, rawReasoningPersisted: false, rawReportedModelPersisted: false, visibleResponseDuplicatedInWitness: false, privateContentAddedByWitness: false },
    trust: { modelSelfReportUsedAsExternalFact: false, runtimeObservationExternallyFormed: true, invocationEvidenceExternallyFormed: true },
    formedAt
  };
  const witnessSha256 = semanticHash(core);
  return freezeDeep({ ...core, witnessRef: `witness.vexlife.model-turn.${witnessSha256.slice(0, 32)}`, witnessSha256 });
}

export function verifyModelTurnWitness(value) {
  if (!exactKeys(value, WITNESS_KEYS) || value.schemaVersion !== MODEL_TURN_WITNESS_SCHEMA || value.truthClass !== 'EXTERNAL_MODEL_TURN_WITNESS'
      || !nonempty(value.turnRef) || !nonempty(value.requestMessageRef) || !nonempty(value.responseMessageRef)
      || !verifyModelRuntimeObservation(value.runtimeObservation) || !verifyModelRuntimeInvocationEvidence(value.invocationEvidence)
      || value.invocationEvidence.runtimeObservationRef !== value.runtimeObservation.observationRef || value.invocationEvidence.runtimeObservationSha256 !== value.runtimeObservation.observationSha256
      || value.invocationEvidence.responseBodySha256 !== value.runtimeObservation.responseBodySha256 || value.invocationEvidence.endpointProfileRef !== value.runtimeObservation.endpointProfileRef
      || !validPromptContext(value.promptContext) || !validCapabilityDisposition(value.capabilityDisposition) || !sortedUniqueStrings(value.currentnessRefs)
      || !validObservedEffects(value.observedEffects) || semanticHash(value.observedEffects) !== semanticHash(value.invocationEvidence.observedEffects)
      || !validPrivacy(value.privacy) || !validTrust(value.trust) || !canonicalTimestamp(value.formedAt) || !HEX64.test(value.witnessSha256 ?? '')) return false;
  const { witnessRef, witnessSha256, ...core } = value;
  return witnessRef === `witness.vexlife.model-turn.${witnessSha256.slice(0, 32)}` && semanticHash(core) === witnessSha256;
}

// [VXG RealForever]
