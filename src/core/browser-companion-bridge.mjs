import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  LivedCompanionError,
  performLivedCompanionTurn
} from './lived-companion.mjs';
import { composeSemanticRelay } from './conversation.mjs';

export const BROWSER_COMPANION_API_PATH = '/api/v1/companion/turn';
export const BROWSER_COMPANION_STATUS_PATH = '/api/v1/companion/status';
export const BROWSER_COMPANION_PROFILE_REF = 'model-profile.vexlife.browser-companion.local';
export const BROWSER_COMPANION_MAX_CONTENT_CHARS = 32 * 1024;

const REQUEST_KEYS = new Set([
  'projectRef',
  'threadRef',
  'channelRef',
  'content',
  'selectedNodeRef',
  'screenRef',
  'semanticRelayInput',
  'semanticRelayAction'
]);
const PORTABLE_REF_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;

function ref(prefix) {
  return `${prefix}.${crypto.randomUUID()}`;
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function safePortableRef(value) {
  return nonempty(value) && PORTABLE_REF_PATTERN.test(value);
}

function sameCanonicalPath(left, right) {
  const a = path.normalize(path.resolve(left));
  const b = path.normalize(path.resolve(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function requireRegularFile(file, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_UNAVAILABLE', `${label} is unavailable`, 503, error.message);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_IDENTITY_INVALID', `${label} must be one regular non-link file`, 409);
  }
}

function readJson(file, label) {
  requireRegularFile(file, label);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_IDENTITY_INVALID', `${label} is not valid JSON`, 409, error.message);
  }
}

export class BrowserCompanionBridgeError extends Error {
  constructor(code, message, httpStatus = 500, internalCause = null) {
    super(message);
    this.name = 'BrowserCompanionBridgeError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.internalCause = internalCause;
  }
}

export function resolveBrowserCompanionRuntimeBinding({ endpoint = null, model = null } = {}) {
  if ((endpoint === null || endpoint === '') && (model === null || model === '')) {
    return Object.freeze({ state: 'UNBOUND', profileRef: BROWSER_COMPANION_PROFILE_REF, endpoint: null, model: null });
  }
  if (!nonempty(endpoint) || !nonempty(model)) {
    return Object.freeze({ state: 'MISCONFIGURED', profileRef: BROWSER_COMPANION_PROFILE_REF, endpoint: null, model: null });
  }
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    return Object.freeze({ state: 'MISCONFIGURED', profileRef: BROWSER_COMPANION_PROFILE_REF, endpoint: null, model: null });
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  const numericLoopback = hostname === '127.0.0.1' || hostname === '::1';
  if (
    parsed.protocol !== 'http:' ||
    !numericLoopback ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !['', '/'].includes(parsed.pathname) ||
    model.length > 256
  ) {
    return Object.freeze({ state: 'MISCONFIGURED', profileRef: BROWSER_COMPANION_PROFILE_REF, endpoint: null, model: null });
  }
  return Object.freeze({
    state: 'BOUND',
    profileRef: BROWSER_COMPANION_PROFILE_REF,
    endpoint: parsed.origin,
    model
  });
}

export function loadBrowserCompanionHomeIdentity(home) {
  if (!nonempty(home)) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_UNAVAILABLE', 'Vex Home is unavailable', 503);
  }
  const requested = path.resolve(home);
  let rootStat;
  try {
    rootStat = fs.lstatSync(requested);
  } catch (error) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_UNAVAILABLE', 'Vex Home is unavailable', 503, error.message);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_IDENTITY_INVALID', 'Vex Home must be one canonical directory', 409);
  }
  const canonical = fs.realpathSync.native(requested);
  if (!sameCanonicalPath(canonical, requested)) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_IDENTITY_INVALID', 'Vex Home is not its canonical filesystem identity', 409);
  }

  const homeManifest = readJson(path.join(canonical, 'config', 'home.json'), 'Vex Home identity');
  if (
    homeManifest.schemaVersion !== 'vexlife.home/v0' ||
    !nonempty(homeManifest.homeRef) ||
    !safePortableRef(homeManifest.currentDeviceRef) ||
    !safePortableRef(homeManifest.currentCompanionLineageRef)
  ) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_IDENTITY_INVALID', 'Vex Home identity is incomplete', 409);
  }
  const device = readJson(
    path.join(canonical, 'devices', `${homeManifest.currentDeviceRef}.json`),
    'Vex device identity'
  );
  if (
    device.deviceRef !== homeManifest.currentDeviceRef ||
    device.companionLineageRef !== homeManifest.currentCompanionLineageRef
  ) {
    throw new BrowserCompanionBridgeError('COMPANION_HOME_IDENTITY_INVALID', 'Vex Home and device lineage disagree', 409);
  }
  return Object.freeze({
    home: canonical,
    homeRef: homeManifest.homeRef,
    deviceRef: homeManifest.currentDeviceRef,
    companionLineageRef: homeManifest.currentCompanionLineageRef
  });
}

export function validateBrowserCompanionRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'Companion request must be one JSON object', 400);
  }
  const extras = Object.keys(value).filter((key) => !REQUEST_KEYS.has(key));
  if (extras.length) {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'Companion request contains unadmitted fields', 400);
  }
  if (!safePortableRef(value.threadRef)) {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'threadRef must be one portable canonical ref', 400);
  }
  if (!nonempty(value.channelRef) || value.channelRef.length > 256) {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'channelRef is invalid', 400);
  }
  if (!nonempty(value.content) || !value.content.trim() || value.content.length > BROWSER_COMPANION_MAX_CONTENT_CHARS) {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'message content is empty or exceeds the bounded size', 400);
  }
  for (const key of ['projectRef', 'selectedNodeRef', 'screenRef']) {
    if (value[key] !== undefined && value[key] !== null && (!nonempty(value[key]) || value[key].length > 256)) {
      throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', `${key} is invalid`, 400);
    }
  }
  const semanticRelayAction = value.semanticRelayAction ?? null;
  if (semanticRelayAction !== null && !['CONFIRM', 'CORRECT'].includes(semanticRelayAction)) {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'semanticRelayAction is not admitted', 400);
  }
  if (value.semanticRelayInput !== undefined && value.semanticRelayInput !== null) {
    if (typeof value.semanticRelayInput !== 'object' || Array.isArray(value.semanticRelayInput)) {
      throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'semanticRelayInput must be one reference-only object', 400);
    }
    for (const callerOwnedField of ['sourceMessageRef', 'confirmedByRef', 'confirmationReceiptRef']) {
      if (Object.hasOwn(value.semanticRelayInput, callerOwnedField)) {
        throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', `semanticRelayInput cannot supply ${callerOwnedField}`, 400);
      }
    }
  } else if (semanticRelayAction !== null) {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'semanticRelayAction requires semanticRelayInput', 400);
  }
  return Object.freeze({
    projectRef: value.projectRef ?? null,
    threadRef: value.threadRef,
    channelRef: value.channelRef,
    content: value.content,
    selectedNodeRef: value.selectedNodeRef ?? null,
    screenRef: value.screenRef ?? null,
    semanticRelayInput: value.semanticRelayInput ? structuredClone(value.semanticRelayInput) : null,
    semanticRelayAction
  });
}

const SEMANTIC_RELAY_ATTENTION_SCHEMA = 'vexlife.browser-semantic-relay-attention/v1';

function semanticRelayAttentionPayload(input, composed) {
  const targets = Array.isArray(input.targets) ? input.targets.map((target) => ({
    recipientRef: target?.recipientRef ?? null,
    targetLanguageRef: target?.targetLanguageRef ?? null,
    targetAudienceRef: target?.targetAudienceRef ?? null,
    runtimeCapability: target?.runtimeCapability && typeof target.runtimeCapability === 'object' ? {
      capabilityRef: target.runtimeCapability.capabilityRef ?? null,
      currentnessState: target.runtimeCapability.currentnessState ?? 'UNKNOWN',
      multilingualOutput: target.runtimeCapability.multilingualOutput === true,
      supportedLanguageRefs: Array.isArray(target.runtimeCapability.supportedLanguageRefs) ? [...target.runtimeCapability.supportedLanguageRefs] : [],
      evidenceRefs: Array.isArray(target.runtimeCapability.evidenceRefs) ? [...target.runtimeCapability.evidenceRefs] : []
    } : { capabilityRef: null, currentnessState: 'UNKNOWN', multilingualOutput: false, supportedLanguageRefs: [], evidenceRefs: [] }
  })) : [];
  return Object.freeze({
    schemaVersion: SEMANTIC_RELAY_ATTENTION_SCHEMA,
    state: composed.status === 'HELD_BY_ORIGINATOR' ? 'HELD' : 'CONFIRMATION_REQUIRED',
    truthClass: 'CURRENT_SEMANTIC_RELAY_ATTENTION',
    relayRef: input.relayRef ?? null,
    sourceLanguageRef: input.sourceLanguageRef ?? null,
    requestedResponseLanguageRef: input.requestedResponseLanguageRef ?? null,
    uiLocaleRef: input.uiLocaleRef ?? null,
    interpretationProjectionRef: input.interpretationProjectionRef ?? null,
    ambiguityState: input.ambiguityState ?? 'UNKNOWN',
    materiality: input.materiality ?? 'ORDINARY',
    requiredActions: Object.freeze(['CONFIRM', 'CORRECT', 'HOLD']),
    reasonCode: composed.status === 'HOLD_CONFIRMATION_REQUIRED' ? 'ORIGINATOR_CONFIRMATION_REQUIRED' : 'ORIGINATOR_HELD',
    evidenceRefs: Object.freeze(Array.isArray(input.evidenceRefs) ? [...input.evidenceRefs] : []),
    targets: Object.freeze(targets.map((target) => Object.freeze(target))),
    rawTextIncluded: false
  });
}

function composeBrowserRequestSemanticRelay({ relayInput, relayAction, requestMessageRef }) {
  if (!relayInput) return Object.freeze({ relay: null, attention: null });
  if (relayAction !== null && relayInput.originatorRef !== 'person.local-user') {
    throw new BrowserCompanionBridgeError('COMPANION_SEMANTIC_RELAY_INVALID', 'Only the originating local human may confirm or correct this browser relay', 422);
  }
  const input = { ...structuredClone(relayInput), sourceMessageRef: requestMessageRef };
  if (relayAction === 'CONFIRM') {
    input.interpretationState = 'CONFIRMED';
    input.confirmedByRef = input.originatorRef;
    input.confirmationReceiptRef = ref('receipt.semantic-relay.browser-confirmation');
    delete input.supersedesInterpretationProjectionRef;
  } else if (relayAction === 'CORRECT') {
    const priorInterpretationProjectionRef = input.interpretationProjectionRef;
    input.interpretationState = 'CORRECTED';
    input.interpretationProjectionRef = ref('projection.interpretation.browser-correction');
    input.supersedesInterpretationProjectionRef = priorInterpretationProjectionRef;
    input.confirmedByRef = input.originatorRef;
    input.confirmationReceiptRef = ref('receipt.semantic-relay.browser-correction');
  }
  const composed = composeSemanticRelay(input);
  if (composed.status === 'COMPOSED') return Object.freeze({ relay: composed.relay, attention: null });
  if (['HOLD_CONFIRMATION_REQUIRED', 'HELD_BY_ORIGINATOR'].includes(composed.status)) {
    return Object.freeze({ relay: null, attention: semanticRelayAttentionPayload(input, composed) });
  }
  throw new BrowserCompanionBridgeError(
    'COMPANION_SEMANTIC_RELAY_INVALID',
    'Semantic relay was rejected safely: ' + ((composed.errors ?? []).join('; ') || composed.status),
    422
  );
}

function publicFailureFor(error) {
  if (error instanceof BrowserCompanionBridgeError) return error;
  if (!(error instanceof LivedCompanionError)) {
    return new BrowserCompanionBridgeError('COMPANION_TURN_FAILED', 'Local companion turn failed safely', 500, error?.message ?? String(error));
  }
  const conflictCodes = new Set([
    'CONVERSATION_HEAD_MISMATCH',
    'EVENT_CHAIN_CORRUPT',
    'CONTEXT_HASH_MISMATCH',
    'DUPLICATE_TURN_SUPPRESSED',
    'THREAD_WRITER_CONFLICT',
    'THREAD_WRITER_RECOVERY_REQUIRED'
  ]);
  const requestCodes = new Set(['ENDPOINT_PROFILE_NOT_ADMITTED', 'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED', 'PRIVACY_POLICY_BLOCKED', 'SEMANTIC_RELAY_INVALID', 'COMPANION_SEMANTIC_RELAY_INVALID']);
  const httpStatus = conflictCodes.has(error.code) ? 409 : requestCodes.has(error.code) ? 422 : 503;
  return new BrowserCompanionBridgeError(
    error.code,
    'Local companion is unavailable for this turn; no synthetic reply was substituted',
    httpStatus,
    error.message
  );
}

export function createBrowserCompanionBridge({
  home,
  endpoint = null,
  model = null,
  instanceRef = ref('instance.vexlife.browser-companion')
}) {
  if (!safePortableRef(instanceRef)) {
    throw new BrowserCompanionBridgeError('COMPANION_BRIDGE_IDENTITY_INVALID', 'Browser companion instanceRef is invalid', 500);
  }
  const binding = resolveBrowserCompanionRuntimeBinding({ endpoint, model });

  function status() {
    if (binding.state !== 'BOUND') {
      return Object.freeze({
        schemaVersion: 'vexlife.browser-companion-status/v1',
        state: binding.state,
        truthClass: 'CURRENT_LOCAL_RUNTIME_BINDING',
        profileRef: binding.profileRef
      });
    }
    try {
      loadBrowserCompanionHomeIdentity(home);
      return Object.freeze({
        schemaVersion: 'vexlife.browser-companion-status/v1',
        state: 'BOUND',
        truthClass: 'CURRENT_LOCAL_RUNTIME_BINDING',
        profileRef: binding.profileRef
      });
    } catch (error) {
      const typed = publicFailureFor(error);
      return Object.freeze({
        schemaVersion: 'vexlife.browser-companion-status/v1',
        state: 'HOME_UNAVAILABLE',
        truthClass: 'CURRENT_LOCAL_RUNTIME_BINDING',
        profileRef: binding.profileRef,
        failureCode: typed.code
      });
    }
  }

  async function performTurn(input) {
    if (binding.state !== 'BOUND') {
      throw new BrowserCompanionBridgeError(
        binding.state === 'MISCONFIGURED' ? 'COMPANION_RUNTIME_BINDING_INVALID' : 'COMPANION_RUNTIME_UNBOUND',
        'Local companion runtime binding is not available',
        503
      );
    }
    const request = validateBrowserCompanionRequest(input);
    const turnRef = ref('turn.vexlife.browser-companion');
    const requestMessageRef = ref('message.vexlife.browser-companion.request');
    const responseMessageRef = ref('message.vexlife.browser-companion.response');
    const relayProjection = composeBrowserRequestSemanticRelay({
      relayInput: request.semanticRelayInput,
      relayAction: request.semanticRelayAction,
      requestMessageRef
    });
    if (relayProjection.attention) return relayProjection.attention;
    const identity = loadBrowserCompanionHomeIdentity(home);
    const contextSourceRefs = [
      'source.vexlife.browser-companion',
      ...(request.projectRef ? [request.projectRef] : []),
      ...(request.screenRef ? [request.screenRef] : []),
      ...(request.selectedNodeRef ? [request.selectedNodeRef] : [])
    ];
    try {
      const completed = await performLivedCompanionTurn({
        ...identity,
        instanceRef,
        threadRef: request.threadRef,
        channelRef: request.channelRef,
        turnRef,
        requestMessageRef,
        responseMessageRef,
        speakerRef: 'person.local-user',
        recipientRefs: ['role.vex.companion'],
        content: request.content,
        requestSemanticRelay: relayProjection.relay,
        endpointProfile: {
          profileRef: binding.profileRef,
          admitted: true,
          endpoint: binding.endpoint,
          model: binding.model
        },
        contextSourceRefs,
        timeoutMs: 120000
      });
      return Object.freeze({
        schemaVersion: 'vexlife.browser-companion-turn/v1',
        state: 'TURN_COMPLETED',
        truthClass: 'CURRENT_LOCAL_MODEL',
        content: completed.responseEvent.content,
        modelNameOrBoundedTestProfileRef: completed.responseEvent.modelNameOrBoundedTestProfileRef,
        turnRef,
        responseMessageRef,
        requestSemanticRelay: completed.requestEvent.semanticRelay ?? null,
        responseSemanticRelay: completed.responseEvent.semanticRelay ?? null,
        conversationHeadSha256: completed.head.conversationHeadSha256,
        writerLeaseReleased: completed.writerLeaseReleased === true,
        actualHttpCall: completed.actualHttpCall === true,
        loopbackOnly: completed.loopbackOnly === true
      });
    } catch (error) {
      throw publicFailureFor(error);
    }
  }

  return Object.freeze({ binding, instanceRef, status, performTurn });
}

export function browserCompanionFailurePayload(error) {
  const typed = publicFailureFor(error);
  return Object.freeze({
    schemaVersion: 'vexlife.browser-companion-turn/v1',
    state: 'FAILED',
    truthClass: 'CURRENT_LOCAL_RUNTIME_FAILURE',
    failureCode: typed.code,
    message: typed.message
  });
}

// [VXG RealForever]
