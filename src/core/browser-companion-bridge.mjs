import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  LivedCompanionError,
  materializeLivedCompanionPromptContext,
  performLivedCompanionTurn
} from './lived-companion.mjs';
import { composeSemanticRelay } from './conversation.mjs';

export const BROWSER_COMPANION_API_PATH = '/api/v1/companion/turn';
export const BROWSER_COMPANION_STATUS_PATH = '/api/v1/companion/status';
export const BROWSER_COMPANION_RECOVERY_PATH = '/api/v1/companion/recovery';
export const BROWSER_COMPANION_RECOVERY_MAX_BODY_BYTES = 16 * 1024;
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
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RECOVERY_REQUEST_KEYS = new Set([
  'schemaVersion',
  'truthClass',
  'contractRef',
  'actionRef',
  'availabilityProjectionRef',
  'reentryPlanRef',
  'idempotencyKey',
  'bindingRef',
  'homeRef',
  'companionLineageRef',
  'modelRefOrNull',
  'generationRefOrNull',
  'runtimeAdapterRef',
  'runtimeObservationRef',
  'effectAuthorityGranted',
  'executionDisposition',
  'requestRef',
  'requestSha256'
]);

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


export function validateBrowserCompanionRecoveryEffectContract(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.schemaVersion === 'vexlife.companion-recovery-effect-contract/v1'
    && value.contractRef === 'contract.vexlife.companion-recovery-effect.001'
    && value.actionRef === 'action.companion.reenter-current-binding'
    && value.requiredExecutionDisposition === 'DELEGATE_TO_RIGHTFUL_RUNTIME_ADAPTER'
    && value.performedDisposition === 'PERFORMED_SAME_BINDING_REENTRY'
    && value.requiredPostRecoveryAvailability === 'READY'
    && value.syntheticProofClass === 'SYNTHETIC'
    && value.realHostProofClass === 'REAL_HOST'
    && Array.isArray(value.nonCollapseLaws)
    && value.nonCollapseLaws.includes('RECOVERY_REQUESTED != RECOVERY_PERFORMED')
    && value.nonCollapseLaws.includes('READY != REAL_COMPANION_TURN')
    && Array.isArray(value.realHostRequired)
    && value.realHostRequired.length > 0
  );
}

export function formBrowserCompanionRecoveryRequest(contract, availability, reentryPlan) {
  if (!validateBrowserCompanionRecoveryEffectContract(contract)) {
    throw new TypeError('Companion recovery effect contract is invalid');
  }
  if (
    availability?.availabilityState !== 'RECOVERABLE'
    || availability?.recoveryClass !== 'SAFE_REENTRY_AVAILABLE'
    || reentryPlan?.executionDisposition !== contract.requiredExecutionDisposition
    || reentryPlan?.effectAuthorityGranted !== false
    || reentryPlan?.automaticExecutionAuthorized !== false
    || reentryPlan?.actionRef !== contract.actionRef
    || reentryPlan?.availabilityProjectionRef !== availability?.projectionRef
  ) {
    return null;
  }
  for (const key of [
    'bindingRef',
    'homeRef',
    'companionLineageRef',
    'modelRefOrNull',
    'generationRefOrNull',
    'runtimeAdapterRef'
  ]) {
    if ((reentryPlan[key] ?? null) !== (availability[key] ?? null)) return null;
  }
  const core = {
    schemaVersion: 'vexlife.companion-recovery-request/v1',
    truthClass: 'SAME_BINDING_RECOVERY_REQUEST',
    contractRef: contract.contractRef,
    actionRef: contract.actionRef,
    availabilityProjectionRef: availability.projectionRef,
    reentryPlanRef: reentryPlan.planRef,
    idempotencyKey: reentryPlan.idempotencyKey,
    bindingRef: reentryPlan.bindingRef,
    homeRef: reentryPlan.homeRef,
    companionLineageRef: reentryPlan.companionLineageRef,
    modelRefOrNull: reentryPlan.modelRefOrNull,
    generationRefOrNull: reentryPlan.generationRefOrNull,
    runtimeAdapterRef: reentryPlan.runtimeAdapterRef,
    runtimeObservationRef: reentryPlan.runtimeObservationRef,
    effectAuthorityGranted: false,
    executionDisposition: contract.requiredExecutionDisposition
  };
  const requestSha256 = crypto.createHash('sha256')
    .update(JSON.stringify(core, Object.keys(core).sort()))
    .digest('hex');
  return Object.freeze({
    ...core,
    requestRef: `request.vexlife.companion-recovery.${requestSha256.slice(0, 32)}`,
    requestSha256
  });
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

export function validateBrowserCompanionRecoveryRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_REQUEST_NOT_ADMITTED', 'Companion recovery request must be one JSON object', 400);
  }
  const keys = Object.keys(value);
  if (keys.length !== RECOVERY_REQUEST_KEYS.size || keys.some((key) => !RECOVERY_REQUEST_KEYS.has(key))) {
    throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_REQUEST_NOT_ADMITTED', 'Companion recovery request fields do not match the accepted VR-02 contract', 400);
  }
  if (
    value.schemaVersion !== 'vexlife.companion-recovery-request/v1'
    || value.truthClass !== 'SAME_BINDING_RECOVERY_REQUEST'
    || value.contractRef !== 'contract.vexlife.companion-recovery-effect.001'
    || value.actionRef !== 'action.companion.reenter-current-binding'
    || value.effectAuthorityGranted !== false
    || value.executionDisposition !== 'DELEGATE_TO_RIGHTFUL_RUNTIME_ADAPTER'
  ) {
    throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_REQUEST_NOT_ADMITTED', 'Companion recovery request contract identity is invalid', 400);
  }
  for (const key of ['availabilityProjectionRef','reentryPlanRef','bindingRef','homeRef','companionLineageRef','runtimeAdapterRef','runtimeObservationRef','requestRef']) {
    if (!safePortableRef(value[key])) {
      throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_REQUEST_NOT_ADMITTED', `Companion recovery request ${key} is invalid`, 400);
    }
  }
  for (const key of ['modelRefOrNull','generationRefOrNull']) {
    if (!(value[key] === null || safePortableRef(value[key]))) {
      throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_REQUEST_NOT_ADMITTED', `Companion recovery request ${key} is invalid`, 400);
    }
  }
  if (!/^companion-reentry:[0-9a-f]{64}$/u.test(value.idempotencyKey) || !SHA256_PATTERN.test(value.requestSha256)) {
    throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_REQUEST_NOT_ADMITTED', 'Companion recovery request idempotency or digest is invalid', 400);
  }
  return Object.freeze(structuredClone(value));
}

function requireRecoveryResultIdentity(result, request, { requireReentryPlanRef = false } = {}) {
  const keys = ['requestRef','bindingRef','homeRef','companionLineageRef','modelRefOrNull','generationRefOrNull','runtimeAdapterRef'];
  if (requireReentryPlanRef) keys.splice(1, 0, 'reentryPlanRef');
  for (const key of keys) {
    if ((result[key] ?? null) !== (request[key] ?? null)) {
      throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_RESULT_INVALID', `Recovery owner result ${key} does not match the request`, 502);
    }
  }
}

function exactRecoveryResultFields(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_RESULT_INVALID', `${label} fields do not match the accepted contract`, 502);
  }
}

export function validateBrowserCompanionRecoveryResult(value, request) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_RESULT_INVALID', 'Recovery owner result must be one typed object', 502);
  }
  if (value.schemaVersion === 'vexlife.companion-recovery-owner-receipt/v1') {
    requireRecoveryResultIdentity(value, request, { requireReentryPlanRef: true });
    if (
      value.truthClass !== 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_RECEIPT'
      || !safePortableRef(value.effectOwnerRef)
      || !safePortableRef(value.effectReceiptRef)
      || !Array.isArray(value.sourceRefs)
      || value.sourceRefs.length === 0
      || value.sourceRefs.some((ref) => !safePortableRef(ref))
      || new Set(value.sourceRefs).size !== value.sourceRefs.length
      || value.disposition !== 'PERFORMED_SAME_BINDING_REENTRY'
      || value.postRecoveryObservationRequired !== true
      || !['SYNTHETIC','REAL_HOST'].includes(value.proofClass)
    ) {
      throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_RESULT_INVALID', 'Recovery owner receipt is incomplete or untrusted', 502);
    }
    return Object.freeze(structuredClone(value));
  }
  if (value.schemaVersion === 'vexlife.companion-recovery-acceptance/v1') {
    exactRecoveryResultFields(value, [
      'schemaVersion','truthClass','requestRef','effectOwnerRef','ownerEffectReceiptRef','ownerEffectProofClass',
      'postRecoveryAvailabilityRef','postRecoveryRuntimeObservationRef','bindingRef','homeRef','companionLineageRef',
      'modelRefOrNull','generationRefOrNull','runtimeAdapterRef','availabilityState','livedEndToEndAccepted',
      'recoveryAcceptanceRef','semanticFingerprint'
    ], 'Recovery acceptance');
    requireRecoveryResultIdentity(value, request);
    if (
      value.truthClass !== 'SAME_BINDING_RECOVERY_ACCEPTED_READY'
      || !safePortableRef(value.effectOwnerRef)
      || !safePortableRef(value.ownerEffectReceiptRef)
      || !['SYNTHETIC','REAL_HOST'].includes(value.ownerEffectProofClass)
      || !safePortableRef(value.postRecoveryAvailabilityRef)
      || !safePortableRef(value.postRecoveryRuntimeObservationRef)
      || !safePortableRef(value.recoveryAcceptanceRef)
      || !SHA256_PATTERN.test(value.semanticFingerprint)
      || value.availabilityState !== 'READY'
      || value.livedEndToEndAccepted !== false
    ) {
      throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_RESULT_INVALID', 'Recovery acceptance is incomplete or untrusted', 502);
    }
    return Object.freeze(structuredClone(value));
  }
  throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_RESULT_INVALID', 'Recovery owner returned an unsupported schema', 502);
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
  capabilityRuntime = null,
  modelConnectionComposer = null,
  promptContextResolver = null,
  promptContextAuthorityVerifier = null,
  recoveryOwner = null,
  instanceRef = ref('instance.vexlife.browser-companion')
}) {
  if (!safePortableRef(instanceRef)) {
    throw new BrowserCompanionBridgeError('COMPANION_BRIDGE_IDENTITY_INVALID', 'Browser companion instanceRef is invalid', 500);
  }
  const binding = resolveBrowserCompanionRuntimeBinding({ endpoint, model });
  if (capabilityRuntime !== null && typeof capabilityRuntime?.resolveTurn !== 'function') {
    throw new BrowserCompanionBridgeError('COMPANION_CAPABILITY_RUNTIME_INVALID', 'Capability runtime must expose one server-owned resolveTurn function', 500);
  }
  if (modelConnectionComposer !== null && typeof modelConnectionComposer?.composeTurn !== 'function') {
    throw new BrowserCompanionBridgeError('COMPANION_MODEL_CONNECTION_COMPOSER_INVALID', 'Model connection composer must expose one server-owned composeTurn function', 500);
  }
  if (promptContextResolver !== null && typeof promptContextResolver !== 'function') {
    throw new BrowserCompanionBridgeError('COMPANION_PROMPT_CONTEXT_RESOLVER_INVALID', 'Prompt context resolver must be one server-owned function', 500);
  }
  if ((promptContextResolver !== null || promptContextAuthorityVerifier !== null) && typeof promptContextAuthorityVerifier !== 'function') {
    throw new BrowserCompanionBridgeError('COMPANION_PROMPT_CONTEXT_AUTHORITY_INVALID', 'Prompt context requires one independently server-owned authority verifier', 500);
  }
  if (recoveryOwner !== null && typeof recoveryOwner?.recover !== 'function') {
    throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_INVALID', 'Companion recovery owner must expose recover(request)', 500);
  }

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

  async function performRecovery(input) {
    const request = validateBrowserCompanionRecoveryRequest(input);
    if (recoveryOwner === null) {
      throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_UNAVAILABLE', 'Companion recovery owner is unavailable', 503);
    }
    try {
      const result = await recoveryOwner.recover(request);
      return validateBrowserCompanionRecoveryResult(result, request);
    } catch (error) {
      if (error instanceof BrowserCompanionBridgeError) throw error;
      throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_FAILED', 'Companion recovery failed safely', 500, error?.message ?? String(error));
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
        responseResolver: capabilityRuntime || promptContextResolver
          ? async (resolverInput) => {
              const livedInference = resolverInput?.inference;
              const captureInferenceEvidence = resolverInput?.captureInferenceEvidence;
              if (typeof livedInference !== 'function' || typeof captureInferenceEvidence !== 'function') {
                throw new LivedCompanionError('ENDPOINT_RESPONSE_INVALID', 'browser resolver requires one Lived-owned current-turn inference/evidence boundary');
              }
              const { inference: _inference, captureInferenceEvidence: _capture, ...resolverPublicInput } = resolverInput;
              const runtimeContext = {
                ...(resolverInput.context ?? {}),
                projectRef: request.projectRef,
                screenRef: request.screenRef,
                selectedNodeRef: request.selectedNodeRef,
                sourceRefs: contextSourceRefs
              };
              const evidenceTokens = [];
              const evidenceTokenByResponse = new WeakMap();
              const invokeLivedInference = async (input) => {
                const value = await livedInference(input);
                const token = captureInferenceEvidence(value);
                if (!token) throw new LivedCompanionError('ENDPOINT_RESPONSE_INVALID', 'browser resolver could not bind Lived-owned current-turn runtime evidence');
                evidenceTokens.push(Object.freeze({ token, content: value.content, model: value.model }));
                if (value && typeof value === 'object') evidenceTokenByResponse.set(value, token);
                return value;
              };
              const bindVisibleResponseEvidence = (visibleResponse, { acceptedSynthesisLast = false } = {}) => {
                if (evidenceTokens.length === 0) return null;
                if (!visibleResponse || typeof visibleResponse.content !== 'string' || typeof visibleResponse.model !== 'string') {
                  throw new LivedCompanionError('ENDPOINT_RESPONSE_INVALID', 'browser resolver with runtime evidence must select a visible {content,model} response');
                }
                if (typeof visibleResponse === 'object') {
                  const exactToken = evidenceTokenByResponse.get(visibleResponse) ?? null;
                  if (exactToken) return exactToken;
                }
                if (acceptedSynthesisLast) {
                  const selected = evidenceTokens.at(-1);
                  if (!selected || selected.content !== visibleResponse.content || selected.model !== visibleResponse.model) {
                    throw new LivedCompanionError('ENDPOINT_RESPONSE_INVALID', 'accepted capability runtime synthesis evidence does not bind the selected visible response');
                  }
                  return selected.token;
                }
                const matches = evidenceTokens.filter((entry) =>
                  entry.content === visibleResponse.content && entry.model === visibleResponse.model);
                if (matches.length !== 1) {
                  throw new LivedCompanionError('ENDPOINT_RESPONSE_INVALID', `arbitrary browser resolver visible response matched ${matches.length} current-turn runtime evidence tokens`);
                }
                return matches[0].token;
              };
              let materialization = null;
              let materializationConsumed = false;
              let consumedMaterializationReceipt = null;
              let contextualInference = invokeLivedInference;
              if (promptContextResolver) {
                const selected = await promptContextResolver({ ...resolverPublicInput, taskIntent: request.content, context: runtimeContext });
                if (selected !== null && selected !== undefined) {
                  materialization = await materializeLivedCompanionPromptContext({
                    ...identity,
                    threadRef: request.threadRef,
                    currentRequestEventRef: resolverInput.context?.currentRequestEventRef,
                    currentRequestEventHash: resolverInput.context?.currentRequestEventHash,
                    currentRequestSequence: resolverInput.context?.currentRequestSequence,
                    priorConversationHeadSha256: resolverInput.context?.priorConversationHeadSha256 ?? null,
                    currentRequestContent: resolverInput.requestContent,
                    contextLease: selected.contextLease,
                    continuityProjection: selected.continuityProjection,
                    selectedConversationEventRefs: selected.selectedConversationEventRefs ?? [],
                    authorityVerifier: promptContextAuthorityVerifier
                  });
                  contextualInference = async (input) => {
                    if (input?.requestContent === resolverInput.requestContent) {
                      const contextualResponse = await invokeLivedInference({ ...input, promptContextMaterialization: materialization });
                      consumedMaterializationReceipt = contextualResponse.promptContextMaterializationReceipt ?? null;
                      materializationConsumed = consumedMaterializationReceipt !== null;
                      return contextualResponse;
                    }
                    return invokeLivedInference(input);
                  };
                }
              }
              if (capabilityRuntime) {
                const resolved = await capabilityRuntime.resolveTurn({ ...resolverPublicInput, taskIntent: request.content, inference: contextualInference, context: runtimeContext });
                const acceptedSynthesisLast = resolved?.runtimeProjection?.schemaVersion === 'vexlife.capability-assimilation-runtime/v1';
                if (acceptedSynthesisLast) {
                  const expectedInferenceCount = resolved.runtimeProjection.inferenceCount;
                  if (!Number.isSafeInteger(expectedInferenceCount) || expectedInferenceCount !== evidenceTokens.length) {
                    throw new LivedCompanionError('ENDPOINT_RESPONSE_INVALID', 'capability runtime inference count does not match Lived-owned runtime evidence');
                  }
                }
                const visibleResponse = resolved?.response ?? resolved;
                const evidenceToken = bindVisibleResponseEvidence(visibleResponse, { acceptedSynthesisLast });
                const receipt = materializationConsumed ? consumedMaterializationReceipt : null;
                const forwarded = resolved && typeof resolved === 'object' && !Array.isArray(resolved) ? { ...resolved } : { response: resolved };
                delete forwarded.actualHttpCall;
                return {
                  ...forwarded,
                  contextSourceRefs: [...new Set([...(resolved?.contextSourceRefs ?? []), ...(receipt?.includedSourceRefs ?? [])])].sort(),
                  promptContextMaterializationReceipt: receipt,
                  modelRuntimeEvidenceToken: evidenceToken
                };
              }
              const response = await contextualInference(resolverPublicInput);
              const evidenceToken = bindVisibleResponseEvidence(response);
              const receipt = materializationConsumed ? consumedMaterializationReceipt : null;
              return {
                response,
                contextSourceRefs: receipt?.includedSourceRefs ?? [],
                promptContextMaterializationReceipt: receipt,
                modelRuntimeEvidenceToken: evidenceToken
              };
            }
          : null,
        contextSourceRefs,
        timeoutMs: 120000
      });
      const modelConnectionComposition = modelConnectionComposer && completed.modelTurnWitness
        ? modelConnectionComposer.composeTurn({
            modelTurnWitness: completed.modelTurnWitness,
            capabilityRuntime: completed.runtimeProjection,
            currentContext: {
              homeRef: identity.homeRef,
              deviceRef: identity.deviceRef,
              companionLineageRef: identity.companionLineageRef,
              projectRef: request.projectRef ?? null,
              threadRef: request.threadRef,
              channelRef: request.channelRef,
              screenRef: request.screenRef ?? null,
              selectedNodeRef: request.selectedNodeRef ?? null
            }
          })
        : null;
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
        loopbackOnly: completed.loopbackOnly === true,
        capabilityRuntime: completed.runtimeProjection ?? null,
        promptContextMaterialization: completed.promptContextMaterializationReceipt ?? null,
        modelTurnWitness: completed.modelTurnWitness ?? null,
        modelConnectionProjection: modelConnectionComposition?.modelConnectionProjection ?? null,
        selfCapabilityFrame: modelConnectionComposition?.selfCapabilityFrame ?? null
      });
    } catch (error) {
      throw publicFailureFor(error);
    }
  }

  return Object.freeze({ binding, instanceRef, status, performRecovery, performTurn });
}

export function browserCompanionRecoveryFailurePayload(error) {
  const typed = error instanceof BrowserCompanionBridgeError
    ? error
    : new BrowserCompanionBridgeError('COMPANION_RECOVERY_FAILED', 'Companion recovery failed safely', 500);
  return Object.freeze({
    schemaVersion: 'vexlife.browser-companion-recovery-failure/v1',
    state: 'HELD',
    truthClass: 'CURRENT_LOCAL_RECOVERY_FAILURE',
    failureCode: typed.code,
    message: typed.message,
    effects: Object.freeze({
      runtimeEffectPerformed: false,
      processStartStopPerformed: false,
      modelIdentityMutationPerformed: false,
      homeMutationPerformed: false,
      memoryMutationPerformed: false
    })
  });
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
