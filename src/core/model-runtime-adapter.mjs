import crypto from 'node:crypto';
import { semanticHash } from './utils.mjs';

export const MODEL_RUNTIME_OBSERVATION_SCHEMA = 'vexlife.model-runtime-observation/v1';
export const MODEL_EMITTED_REASONING_TRACE = 'MODEL_EMITTED_REASONING_TRACE';

const HEX64 = /^[0-9a-f]{64}$/u;
const PATH_LIKE = /(?:^[A-Za-z]:[\\/]|[\\/])/u;
const KNOWN_TOP_LEVEL = new Set(['choices', 'created', 'id', 'model', 'object', 'system_fingerprint', 'timings', 'usage']);
const KNOWN_CHOICE = new Set(['finish_reason', 'index', 'message']);
const KNOWN_MESSAGE = new Set(['content', 'reasoning_content', 'refusal', 'role', 'tool_calls']);
const KNOWN_USAGE = new Set(['completion_tokens', 'prompt_tokens', 'prompt_tokens_details', 'total_tokens']);
const KNOWN_PROMPT_DETAILS = new Set(['cached_tokens']);
const KNOWN_TIMINGS = new Set([
  'cache_n', 'prompt_n', 'prompt_ms', 'prompt_per_token_ms', 'prompt_per_second',
  'predicted_n', 'predicted_ms', 'predicted_per_token_ms', 'predicted_per_second'
]);
const OBSERVATION_KEYS = new Set([
  'schemaVersion','truthClass','endpointProfileRef','modelBundleRef','operationalProfileRef','runtimeRevisionRef',
  'runtimeCapabilityEvidenceRef','observedAt','responseBodySha256','output','modelProvenance','reasoningTrace',
  'usageSummary','runtimeTimingSummary','structuredOutputState','unknownUpstreamFields','privacy','observationRef','observationSha256'
]);
const OUTPUT_KEYS = new Set(['contentSha256','contentCharacters','assistantRoleObserved','finishReasonOrNull','refusalObserved','toolCallsPresent','toolCallCount']);
const MODEL_PROVENANCE_KEYS = new Set(['compatibilityModel','reportedModelField']);
const REPORTED_MODEL_KEYS = new Set(['valueType','byteLength','valueSha256','pathClass','rawValuePersisted']);
const REASONING_KEYS = new Set(['type','present','contentSha256','characterCount','rawState','rawPersisted','humanProjection','modelProjection','trainingProjection']);
const SUMMARY_KEYS = new Set(['present','values']);
const STRUCTURED_KEYS = new Set(['requested','observedJsonValue']);
const UNKNOWN_KEYS = new Set(['jsonPointer','valueType','byteLength','valueSha256','rawValuePersisted','disposition']);
const PRIVACY_KEYS = new Set(['rawProviderResponsePersisted','rawReasoningPersisted','rawReportedModelPersisted','privateContentAddedByAdapter']);
const USAGE_VALUE_KEYS = new Set(['completion_tokens','prompt_tokens','total_tokens','cached_prompt_tokens']);

function nonempty(value) { return typeof value === 'string' && value.length > 0; }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function sha256Bytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function byteLength(value) { return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8'); }
function valueType(value) { return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value; }
function frozen(value) { return Object.freeze(value); }
function exactKeys(value, allowed) {
  return plainObject(value) && Object.keys(value).length === allowed.size && Object.keys(value).every((key) => allowed.has(key));
}
function canonicalTimestamp(value) {
  if (!nonempty(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}
function nullableRef(value) { return value === null || nonempty(value); }
function safeCompatibilityModel(value) { return nonempty(value) && value.length <= 256 && !PATH_LIKE.test(value); }
function finiteNonnegative(value) { return Number.isFinite(value) && value >= 0; }
function nonnegativeInteger(value) { return Number.isSafeInteger(value) && value >= 0; }

function metadataOnly(value, disposition = 'UNCLASSIFIED_RUNTIME_FIELD') {
  return frozen({ valueType: valueType(value), byteLength: byteLength(value), valueSha256: semanticHash(value), rawValuePersisted: false, disposition });
}

function modelProvenance(rawModel, fallbackModel) {
  const rawPresent = nonempty(rawModel);
  const rawPathLike = rawPresent && PATH_LIKE.test(rawModel);
  const safeRaw = rawPresent && !rawPathLike && rawModel.length <= 256 ? rawModel : null;
  const compatibilityModel = safeRaw ?? fallbackModel;
  if (!safeCompatibilityModel(compatibilityModel)) throw new TypeError('one safe non-path compatibility model identity is required');
  return frozen({
    compatibilityModel,
    reportedModelField: rawPresent ? frozen({
      valueType: 'string', byteLength: Buffer.byteLength(rawModel, 'utf8'), valueSha256: sha256Bytes(Buffer.from(rawModel, 'utf8')),
      pathClass: rawPathLike ? 'LOCAL_PATH_LIKE' : 'OPAQUE_MODEL_ID', rawValuePersisted: false
    }) : null
  });
}

function usageSummary(usage) {
  if (!plainObject(usage)) return frozen({ present: false, values: frozen({}) });
  const values = {};
  for (const key of ['completion_tokens', 'prompt_tokens', 'total_tokens']) if (nonnegativeInteger(usage[key])) values[key] = usage[key];
  if (plainObject(usage.prompt_tokens_details) && nonnegativeInteger(usage.prompt_tokens_details.cached_tokens)) values.cached_prompt_tokens = usage.prompt_tokens_details.cached_tokens;
  return frozen({ present: true, values: frozen(values) });
}

function timingSummary(timings) {
  if (!plainObject(timings)) return frozen({ present: false, values: frozen({}) });
  const values = {};
  for (const key of KNOWN_TIMINGS) if (finiteNonnegative(timings[key])) values[key] = timings[key];
  return frozen({ present: true, values: frozen(values) });
}

function reasoningTrace(message) {
  const value = message?.reasoning_content;
  if (typeof value !== 'string' || value.length === 0) {
    return frozen({ type: MODEL_EMITTED_REASONING_TRACE, present: false, contentSha256: null, characterCount: 0, rawState: 'EPHEMERAL', rawPersisted: false, humanProjection: 'SEALED_EXPLICIT_OPEN_ONLY', modelProjection: 'NONE', trainingProjection: 'NONE' });
  }
  return frozen({ type: MODEL_EMITTED_REASONING_TRACE, present: true, contentSha256: sha256Bytes(Buffer.from(value, 'utf8')), characterCount: [...value].length, rawState: 'EPHEMERAL', rawPersisted: false, humanProjection: 'SEALED_EXPLICIT_OPEN_ONLY', modelProjection: 'NONE', trainingProjection: 'NONE' });
}

function addUnknown(output, pointer, value) { output.push(frozen({ jsonPointer: pointer, ...metadataOnly(value) })); }
function collectUnknownFields(body) {
  const unknown = [];
  if (!plainObject(body)) return frozen(unknown);
  for (const [key, value] of Object.entries(body)) {
    if (!KNOWN_TOP_LEVEL.has(key)) { addUnknown(unknown, `/${key}`, value); continue; }
    if (key === 'choices') {
      if (!Array.isArray(value)) continue;
      for (let index = 0; index < value.length; index += 1) {
        const choice = value[index];
        if (index > 0) { addUnknown(unknown, `/choices/${index}`, choice); continue; }
        if (!plainObject(choice)) continue;
        for (const [choiceKey, choiceValue] of Object.entries(choice)) {
          if (!KNOWN_CHOICE.has(choiceKey)) { addUnknown(unknown, `/choices/0/${choiceKey}`, choiceValue); continue; }
          if (choiceKey === 'message' && plainObject(choiceValue)) {
            for (const [messageKey, messageValue] of Object.entries(choiceValue)) if (!KNOWN_MESSAGE.has(messageKey)) addUnknown(unknown, `/choices/0/message/${messageKey}`, messageValue);
          }
        }
      }
      continue;
    }
    if (key === 'usage' && plainObject(value)) {
      for (const [usageKey, usageValue] of Object.entries(value)) {
        if (!KNOWN_USAGE.has(usageKey)) { addUnknown(unknown, `/usage/${usageKey}`, usageValue); continue; }
        if (usageKey === 'prompt_tokens_details' && plainObject(usageValue)) {
          for (const [detailKey, detailValue] of Object.entries(usageValue)) if (!KNOWN_PROMPT_DETAILS.has(detailKey)) addUnknown(unknown, `/usage/prompt_tokens_details/${detailKey}`, detailValue);
        }
      }
      continue;
    }
    if (key === 'timings' && plainObject(value)) {
      for (const [timingKey, timingValue] of Object.entries(value)) if (!KNOWN_TIMINGS.has(timingKey)) addUnknown(unknown, `/timings/${timingKey}`, timingValue);
    }
  }
  return frozen(unknown.sort((a, b) => a.jsonPointer.localeCompare(b.jsonPointer)));
}

function structuredOutputState(content, requested) {
  let parsedJson = false;
  if (requested && typeof content === 'string') {
    try { const parsed = JSON.parse(content); parsedJson = parsed !== null && typeof parsed === 'object'; } catch {}
  }
  return frozen({ requested: requested === true, observedJsonValue: parsedJson });
}

function validateRuntimeRefs(refs) { for (const [key, value] of Object.entries(refs)) if (!nullableRef(value)) throw new TypeError(`${key} must be null or one non-empty ref`); }
function validOutput(value) {
  return exactKeys(value, OUTPUT_KEYS) && HEX64.test(value.contentSha256 ?? '') && nonnegativeInteger(value.contentCharacters)
    && typeof value.assistantRoleObserved === 'boolean' && (value.finishReasonOrNull === null || typeof value.finishReasonOrNull === 'string')
    && typeof value.refusalObserved === 'boolean' && typeof value.toolCallsPresent === 'boolean' && nonnegativeInteger(value.toolCallCount)
    && value.toolCallsPresent === (value.toolCallCount > 0);
}
function validModelProvenance(value) {
  if (!exactKeys(value, MODEL_PROVENANCE_KEYS) || !safeCompatibilityModel(value.compatibilityModel)) return false;
  const reported = value.reportedModelField;
  return reported === null || (exactKeys(reported, REPORTED_MODEL_KEYS) && reported.valueType === 'string' && nonnegativeInteger(reported.byteLength)
    && HEX64.test(reported.valueSha256 ?? '') && ['LOCAL_PATH_LIKE','OPAQUE_MODEL_ID'].includes(reported.pathClass) && reported.rawValuePersisted === false);
}
function validReasoning(value) {
  if (!exactKeys(value, REASONING_KEYS) || value.type !== MODEL_EMITTED_REASONING_TRACE || typeof value.present !== 'boolean'
      || !nonnegativeInteger(value.characterCount) || value.rawState !== 'EPHEMERAL' || value.rawPersisted !== false
      || value.humanProjection !== 'SEALED_EXPLICIT_OPEN_ONLY' || value.modelProjection !== 'NONE' || value.trainingProjection !== 'NONE') return false;
  return value.present
    ? HEX64.test(value.contentSha256 ?? '') && value.characterCount > 0
    : value.contentSha256 === null && value.characterCount === 0;
}
function validSummary(value, allowed, integersOnly = false) {
  if (!exactKeys(value, SUMMARY_KEYS) || typeof value.present !== 'boolean' || !plainObject(value.values)) return false;
  const keys = Object.keys(value.values);
  if (keys.some((key) => !allowed.has(key))) return false;
  if (integersOnly && keys.some((key) => !nonnegativeInteger(value.values[key]))) return false;
  if (!integersOnly && keys.some((key) => !finiteNonnegative(value.values[key]))) return false;
  return value.present ? true : keys.length === 0;
}
function validUnknown(value) {
  if (!Array.isArray(value)) return false;
  const pointers = value.map((entry) => entry?.jsonPointer);
  if (pointers.some((pointer) => !nonempty(pointer) || !pointer.startsWith('/')) || new Set(pointers).size !== pointers.length) return false;
  if (JSON.stringify([...pointers].sort()) !== JSON.stringify(pointers)) return false;
  return value.every((entry) => exactKeys(entry, UNKNOWN_KEYS) && nonempty(entry.valueType) && nonnegativeInteger(entry.byteLength)
    && HEX64.test(entry.valueSha256 ?? '') && entry.rawValuePersisted === false && entry.disposition === 'UNCLASSIFIED_RUNTIME_FIELD');
}
function validPrivacy(value) { return exactKeys(value, PRIVACY_KEYS) && Object.values(value).every((entry) => entry === false); }

export function normalizeModelRuntimeResponse({ responseBody, endpointProfile, modelBundleRef = null, operationalProfileRef = null, runtimeRevisionRef = null, runtimeCapabilityEvidenceRef = null, structuredOutputRequested = false, observedAt = new Date().toISOString() }) {
  if (!plainObject(responseBody)) throw new TypeError('runtime response must be one JSON object');
  if (!endpointProfile?.admitted || !nonempty(endpointProfile.profileRef) || !nonempty(endpointProfile.endpoint)) throw new TypeError('one admitted endpoint profile is required');
  if (!canonicalTimestamp(observedAt)) throw new TypeError('observedAt must be one canonical timestamp');
  validateRuntimeRefs({ modelBundleRef, operationalProfileRef, runtimeRevisionRef, runtimeCapabilityEvidenceRef });
  const choice = responseBody.choices?.[0], message = choice?.message, content = message?.content;
  if (typeof content !== 'string' || content.length === 0) throw new TypeError('runtime response lacked non-empty choices[0].message.content');
  const provenance = modelProvenance(responseBody.model, endpointProfile.model ?? null);
  const observationCore = {
    schemaVersion: MODEL_RUNTIME_OBSERVATION_SCHEMA, truthClass: 'EXTERNAL_RUNTIME_OBSERVATION', endpointProfileRef: endpointProfile.profileRef,
    modelBundleRef, operationalProfileRef, runtimeRevisionRef, runtimeCapabilityEvidenceRef, observedAt, responseBodySha256: semanticHash(responseBody),
    output: frozen({ contentSha256: sha256Bytes(Buffer.from(content, 'utf8')), contentCharacters: [...content].length, assistantRoleObserved: message?.role === 'assistant', finishReasonOrNull: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null, refusalObserved: typeof message?.refusal === 'string' && message.refusal.length > 0, toolCallsPresent: Array.isArray(message?.tool_calls) && message.tool_calls.length > 0, toolCallCount: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0 }),
    modelProvenance: provenance, reasoningTrace: reasoningTrace(message), usageSummary: usageSummary(responseBody.usage), runtimeTimingSummary: timingSummary(responseBody.timings),
    structuredOutputState: structuredOutputState(content, structuredOutputRequested), unknownUpstreamFields: collectUnknownFields(responseBody),
    privacy: frozen({ rawProviderResponsePersisted: false, rawReasoningPersisted: false, rawReportedModelPersisted: false, privateContentAddedByAdapter: false })
  };
  const observationSha256 = semanticHash(observationCore);
  const runtimeObservation = frozen({ ...observationCore, observationRef: `observation.vexlife.model-runtime.${observationSha256.slice(0, 32)}`, observationSha256 });
  return frozen({ content, model: provenance.compatibilityModel, runtimeObservation });
}

export function verifyModelRuntimeObservation(value) {
  if (!exactKeys(value, OBSERVATION_KEYS) || value.schemaVersion !== MODEL_RUNTIME_OBSERVATION_SCHEMA || value.truthClass !== 'EXTERNAL_RUNTIME_OBSERVATION'
      || !nonempty(value.endpointProfileRef) || !nullableRef(value.modelBundleRef) || !nullableRef(value.operationalProfileRef) || !nullableRef(value.runtimeRevisionRef)
      || !nullableRef(value.runtimeCapabilityEvidenceRef) || !canonicalTimestamp(value.observedAt) || !HEX64.test(value.responseBodySha256 ?? '')
      || !validOutput(value.output) || !validModelProvenance(value.modelProvenance) || !validReasoning(value.reasoningTrace)
      || !validSummary(value.usageSummary, USAGE_VALUE_KEYS, true) || !validSummary(value.runtimeTimingSummary, KNOWN_TIMINGS, false)
      || !exactKeys(value.structuredOutputState, STRUCTURED_KEYS) || typeof value.structuredOutputState.requested !== 'boolean'
      || typeof value.structuredOutputState.observedJsonValue !== 'boolean' || (value.structuredOutputState.observedJsonValue && !value.structuredOutputState.requested)
      || !validUnknown(value.unknownUpstreamFields) || !validPrivacy(value.privacy) || !HEX64.test(value.observationSha256 ?? '')) return false;
  const { observationRef, observationSha256, ...core } = value;
  return observationRef === `observation.vexlife.model-runtime.${observationSha256.slice(0, 32)}` && semanticHash(core) === observationSha256;
}

// [VXG RealForever]
