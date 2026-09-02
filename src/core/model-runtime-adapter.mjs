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

function nonempty(value) { return typeof value === 'string' && value.length > 0; }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function sha256Bytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function byteLength(value) { return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8'); }
function valueType(value) { return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value; }
function frozen(value) { return Object.freeze(value); }

function metadataOnly(value, disposition = 'UNCLASSIFIED_RUNTIME_FIELD') {
  return frozen({
    valueType: valueType(value),
    byteLength: byteLength(value),
    valueSha256: semanticHash(value),
    rawValuePersisted: false,
    disposition
  });
}

function modelProvenance(rawModel, fallbackModel) {
  const rawPresent = nonempty(rawModel);
  const rawPathLike = rawPresent && PATH_LIKE.test(rawModel);
  const safeRaw = rawPresent && !rawPathLike && rawModel.length <= 256 ? rawModel : null;
  const compatibilityModel = safeRaw ?? fallbackModel;
  if (!nonempty(compatibilityModel)) throw new TypeError('one safe compatibility model identity is required');
  return frozen({
    compatibilityModel,
    reportedModelField: rawPresent ? frozen({
      valueType: 'string',
      byteLength: Buffer.byteLength(rawModel, 'utf8'),
      valueSha256: sha256Bytes(Buffer.from(rawModel, 'utf8')),
      pathClass: rawPathLike ? 'LOCAL_PATH_LIKE' : 'OPAQUE_MODEL_ID',
      rawValuePersisted: false
    }) : null
  });
}

function usageSummary(usage) {
  if (!plainObject(usage)) return frozen({ present: false, values: frozen({}) });
  const values = {};
  for (const key of ['completion_tokens', 'prompt_tokens', 'total_tokens']) {
    if (Number.isFinite(usage[key])) values[key] = usage[key];
  }
  if (plainObject(usage.prompt_tokens_details) && Number.isFinite(usage.prompt_tokens_details.cached_tokens)) {
    values.cached_prompt_tokens = usage.prompt_tokens_details.cached_tokens;
  }
  return frozen({ present: true, values: frozen(values) });
}

function timingSummary(timings) {
  if (!plainObject(timings)) return frozen({ present: false, values: frozen({}) });
  const values = {};
  for (const key of KNOWN_TIMINGS) if (Number.isFinite(timings[key])) values[key] = timings[key];
  return frozen({ present: true, values: frozen(values) });
}

function reasoningTrace(message) {
  const value = message?.reasoning_content;
  if (typeof value !== 'string' || value.length === 0) {
    return frozen({
      type: MODEL_EMITTED_REASONING_TRACE,
      present: false,
      contentSha256: null,
      characterCount: 0,
      rawState: 'EPHEMERAL',
      rawPersisted: false,
      humanProjection: 'SEALED_EXPLICIT_OPEN_ONLY',
      modelProjection: 'NONE',
      trainingProjection: 'NONE'
    });
  }
  return frozen({
    type: MODEL_EMITTED_REASONING_TRACE,
    present: true,
    contentSha256: sha256Bytes(Buffer.from(value, 'utf8')),
    characterCount: [...value].length,
    rawState: 'EPHEMERAL',
    rawPersisted: false,
    humanProjection: 'SEALED_EXPLICIT_OPEN_ONLY',
    modelProjection: 'NONE',
    trainingProjection: 'NONE'
  });
}

function addUnknown(output, pointer, value) {
  output.push(frozen({ jsonPointer: pointer, ...metadataOnly(value) }));
}

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
            for (const [messageKey, messageValue] of Object.entries(choiceValue)) {
              if (!KNOWN_MESSAGE.has(messageKey)) addUnknown(unknown, `/choices/0/message/${messageKey}`, messageValue);
            }
          }
        }
      }
      continue;
    }
    if (key === 'usage' && plainObject(value)) {
      for (const [usageKey, usageValue] of Object.entries(value)) {
        if (!KNOWN_USAGE.has(usageKey)) { addUnknown(unknown, `/usage/${usageKey}`, usageValue); continue; }
        if (usageKey === 'prompt_tokens_details' && plainObject(usageValue)) {
          for (const [detailKey, detailValue] of Object.entries(usageValue)) {
            if (!KNOWN_PROMPT_DETAILS.has(detailKey)) addUnknown(unknown, `/usage/prompt_tokens_details/${detailKey}`, detailValue);
          }
        }
      }
      continue;
    }
    if (key === 'timings' && plainObject(value)) {
      for (const [timingKey, timingValue] of Object.entries(value)) {
        if (!KNOWN_TIMINGS.has(timingKey)) addUnknown(unknown, `/timings/${timingKey}`, timingValue);
      }
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

function validateRuntimeRefs({ modelBundleRef, operationalProfileRef, runtimeRevisionRef, runtimeCapabilityEvidenceRef }) {
  for (const [key, value] of Object.entries({ modelBundleRef, operationalProfileRef, runtimeRevisionRef, runtimeCapabilityEvidenceRef })) {
    if (value !== null && value !== undefined && !nonempty(value)) throw new TypeError(`${key} must be null or one non-empty ref`);
  }
}

export function normalizeModelRuntimeResponse({
  responseBody,
  endpointProfile,
  modelBundleRef = null,
  operationalProfileRef = null,
  runtimeRevisionRef = null,
  runtimeCapabilityEvidenceRef = null,
  structuredOutputRequested = false,
  observedAt = new Date().toISOString()
}) {
  if (!plainObject(responseBody)) throw new TypeError('runtime response must be one JSON object');
  if (!endpointProfile?.admitted || !nonempty(endpointProfile.profileRef) || !nonempty(endpointProfile.endpoint)) {
    throw new TypeError('one admitted endpoint profile is required');
  }
  validateRuntimeRefs({ modelBundleRef, operationalProfileRef, runtimeRevisionRef, runtimeCapabilityEvidenceRef });
  const choice = responseBody.choices?.[0];
  const message = choice?.message;
  const content = message?.content;
  if (typeof content !== 'string' || content.length === 0) throw new TypeError('runtime response lacked non-empty choices[0].message.content');
  const provenance = modelProvenance(responseBody.model, endpointProfile.model ?? null);
  const observationCore = {
    schemaVersion: MODEL_RUNTIME_OBSERVATION_SCHEMA,
    truthClass: 'EXTERNAL_RUNTIME_OBSERVATION',
    endpointProfileRef: endpointProfile.profileRef,
    modelBundleRef,
    operationalProfileRef,
    runtimeRevisionRef,
    runtimeCapabilityEvidenceRef,
    observedAt,
    output: frozen({
      contentSha256: sha256Bytes(Buffer.from(content, 'utf8')),
      contentCharacters: [...content].length,
      assistantRoleObserved: message?.role === 'assistant',
      finishReasonOrNull: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
      refusalObserved: typeof message?.refusal === 'string' && message.refusal.length > 0,
      toolCallsPresent: Array.isArray(message?.tool_calls) && message.tool_calls.length > 0,
      toolCallCount: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0
    }),
    modelProvenance: provenance,
    reasoningTrace: reasoningTrace(message),
    usageSummary: usageSummary(responseBody.usage),
    runtimeTimingSummary: timingSummary(truntimings),
    structuredOutputState: structuredOutputState(content, structuredOutputRequested),
    unknownUpstreamFields: collectUnknownFields(responseBody),
    privacy: frozen({
      rawProviderResponsePersisted: false,
      rawReasoningPersisted: false,
      rawReportedModelPersisted: false,
      privateContentAddedByAdapter: false
    })
  };
  const observationSha256 = semanticHash(observationCore);
  const runtimeObservation = frozen({
    ...observationCore,
    observationRef: `observation.vexlife.model-runtime.${observationSha256.slice(0, 32)}`,
    observationSha256
  });
  return frozen({ content, model: provenance.compatibilityModel, runtimeObservation });
}

export function verifyModelRuntimeObservation(value) {
  if (!plainObject(value)) return false;
  const { observationRef, observationSha256, ...core } = value;
  return value.schemaVersion === MODEL_RUNTIME_OBSERVATION_SCHEMA
    && typeof observationSha256 === 'string' && HEX64.test(observationSha256)
    && observationRef === `observation.vexlife.model-runtime.${observationSha256.slice(0, 32)}`
    && semanticHash(core) === observationSha256
    && value.privacy?.rawProviderResponsePersisted === false
    && value.privacy?.rawReasoningPersisted === false
    && value.privacy?.rawReportedModelPersisted === false
    && Array.isArray(value.unknownUpstreamFields)
    && value.unknownUpstreamFields.every(entry => entry?.rawValuePersisted === false);
}

// [VXG RealForever]
