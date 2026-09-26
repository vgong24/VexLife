#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_COMPANION_API_PATH,
  BROWSER_COMPANION_STATUS_PATH,
  BROWSER_COMPANION_RECOVERY_PATH,
  BROWSER_COMPANION_RECOVERY_MAX_BODY_BYTES,
  BrowserCompanionBridgeError,
  browserCompanionFailurePayload,
  browserCompanionRecoveryFailurePayload,
  createBrowserCompanionBridge,
  formBrowserCompanionRecoveryRequest,
  validateBrowserCompanionRecoveryEffectContract,
  loadBrowserCompanionHomeIdentity
} from '../src/core/browser-companion-bridge.mjs';
import { compileCompanionAvailability, formCompanionReentryPlan } from '../src/core/companion-availability-reentry.mjs';
import {
  CAPABILITY_ASSIMILATION_MODES,
  createCapabilityAssimilationRuntime
} from '../src/core/capability-assimilation-runtime.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  createModelConnectionTurnComposer,
  loadModelConnectionTurnSources
} from '../src/core/model-connection-turn-composer.mjs';
import { createBrowserPromptContextRuntime } from '../src/core/browser-prompt-context-runtime.mjs';
import {
  BROWSER_LIVING_JOURNAL_ARCHIVE_API_PATH,
  BROWSER_LIVING_JOURNAL_MEMORY_API_PATH,
  BrowserLivingJournalMemoryBridgeError,
  browserLivingJournalArchiveFailurePayload,
  browserLivingJournalMemoryFailurePayload,
  createBrowserLivingJournalMemoryBridge
} from '../src/core/browser-living-journal-memory-bridge.mjs';
import {
  BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH,
  BrowserRelationshipsCdrObservationBridgeError,
  browserRelationshipsCdrObservationFailurePayload,
  createBrowserRelationshipsCdrObservationBridge
} from '../src/core/browser-relationships-cdr-observation-bridge.mjs';
import {
  BrowserRelationshipsPersistenceError,
  createBrowserRelationshipsPersistenceBridge
} from '../src/core/browser-relationships-persistence-bridge.mjs';
import {
  BROWSER_RELATIONSHIPS_RUNTIME_API_PATH,
  BROWSER_RELATIONSHIPS_RUNTIME_MAX_BODY_BYTES,
  BrowserRelationshipsRuntimeBridgeError,
  browserRelationshipsRuntimeFailurePayload,
  createBrowserRelationshipsRuntimeBridge
} from '../src/core/browser-relationships-runtime-bridge.mjs';
import {
  BrowserFamilyConversationBridgeError,
  appendBrowserFamilyMessage,
  listBrowserFamilyChannels,
  readBrowserFamilyConversation
} from '../src/core/browser-family-conversation-bridge.mjs';
import {
  BrowserFamilyLifecycleBridgeError,
  executeBrowserFamilyLifecycle
} from '../src/core/browser-family-lifecycle-bridge.mjs';
import {
  ConversationStoreError,
  listConversationChannelBindings,
  readConversationChannelBinding
} from '../src/core/conversation-store.mjs';
import {
  buildAcceptedAssignmentFingerprint,
  buildGraphSnapshotFingerprint,
  buildWorkNodeFingerprint
} from '../src/core/intent-workgraph.mjs';
import { createIntentSchedulerState } from '../src/core/state.mjs';
import { projectConcernAggregate } from '../src/core/concern-watch.mjs';
import { FAMILY_SECURITY_AWARENESS_SCHEMA } from '../src/core/family-security-projection.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.VEXLIFE_PORT ?? 18110);
const home = path.resolve(process.env.VEXLIFE_HOME ?? path.join(os.homedir(), '.vexlife'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
export const BROWSER_COMPANION_AVAILABILITY_PATH = '/api/v1/companion/availability';
export const BROWSER_COMPANION_RECOVERY_ACTION_PATH = '/api/v1/companion/recovery-action';
export const BROWSER_COMPANION_RECOVERY_ACTION_MAX_BODY_BYTES = 4 * 1024;
export const BROWSER_COMPANION_RECOVERY_ACTION_BINDING_SCHEMA = 'vexlife.browser-companion-recovery-action-binding/v1';
const BROWSER_COMPANION_RECOVERY_ACTION_TRUTH_CLASS = 'SOURCE_BOUND_COMPANION_RECOVERY_ACTION';
const BROWSER_COMPANION_RECOVERY_ACTION_KEYS = new Set(['schemaVersion','truthClass','actionRef','availabilityProjectionRef','effectAuthorityGranted']);
export const BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH = '/api/v1/relationships/persistence';
export const BROWSER_RELATIONSHIPS_PERSISTENCE_MAX_BODY_BYTES = 16 * 1024;
export const BROWSER_RELATIONSHIPS_PERSISTENCE_LIST_MAX = 256;
export const BROWSER_FAMILY_CONVERSATION_API_PATH = '/api/v1/family/conversation';
export const BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH = '/api/v1/family/bootstrap';
export const BROWSER_FAMILY_LIFECYCLE_API_PATH = '/api/v1/family/lifecycle';
export const BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA = 'vexlife.browser-family-room-bootstrap/v1';
export const BROWSER_FAMILY_FOLLOW_THROUGH_RUNTIME_SCHEMA = 'vexlife.generic-follow-through-runtime-projection/v1';
export const BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF = 'projection.vexlife.family-follow-through.001';
const FAMILY_SECURITY_AWARENESS_TRUTH_CLASS = 'SOURCE_BOUND_EFFECT_FREE_FAMILY_SECURITY_AWARENESS';
const FAMILY_SECURITY_TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion', 'truthClass', 'familyContext', 'sessionSecurity', 'perception',
  'health', 'distribution', 'incidentCoverage', 'sourceOwnerRefs', 'sourceRefs',
  'sourceReceiptRefs', 'currentnessRefs', 'missingRefs', 'unknownRefs', 'withheldRefs',
  'telemetryGapRefs', 'knownLimitationRefs', 'permittedCompanionResponseRefs',
  'authority', 'effectAuthorityRefs', 'effects', 'familySecurityProjectionRef',
  'semanticFingerprint'
]);
const FAMILY_SECURITY_AUTHORITY_KEYS = Object.freeze([
  'roleCanPerceive', 'roleCanAct', 'effectAuthorityGranted',
  'selfCertificationAllowed', 'attackAttributionAllowed'
]);
const FAMILY_SECURITY_EFFECT_KEYS = Object.freeze([
  'filesystem', 'network', 'process', 'sensor', 'model', 'Home', 'Memory',
  'membership', 'session', 'incidentContainment', 'securityObserverMutation',
  'training', 'publication'
]);
const FAMILY_SECURITY_RAW_ONLY_KEYS = new Set([
  'devicePublicKey', 'membershipHash', 'leaseHash', 'approvedBy', 'approvedAt',
  'issuedAt', 'expiresAt'
]);
export const BROWSER_FAMILY_CONVERSATION_MAX_BODY_BYTES = 16 * 1024;
export const BROWSER_FAMILY_LIFECYCLE_MAX_BODY_BYTES = 8 * 1024;
export const BROWSER_FAMILY_CONVERSATION_LIST_MAX = 1000;
const RELATIONSHIPS_PERSISTENCE_REQUEST_KEYS = new Set(['localOwnerBinding', 'input']);
const FAMILY_CONVERSATION_REQUEST_KEYS = new Set(['operation', 'intent']);
const FAMILY_CONVERSATION_OPERATIONS = new Set(['APPEND', 'READ', 'LIST']);
const FAMILY_LIFECYCLE_REQUEST_KEYS = new Set(['operation', 'intent']);
const FAMILY_LIFECYCLE_OPERATIONS = new Set(['HOST', 'JOIN', 'LEAVE']);

function readRelationshipsRuntimeSourceJson(sourceRoot, relativePath, label) {
  const file = path.resolve(sourceRoot, relativePath);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    throw new BrowserRelationshipsRuntimeBridgeError(
      'RELATIONSHIPS_RUNTIME_SOURCE_UNAVAILABLE',
      `${label} is unavailable`,
      503,
      error?.message ?? String(error)
    );
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new BrowserRelationshipsRuntimeBridgeError(
      'RELATIONSHIPS_RUNTIME_SOURCE_NOT_CURRENT',
      `${label} must be one regular non-link file`,
      503,
      null
    );
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new BrowserRelationshipsRuntimeBridgeError(
      'RELATIONSHIPS_RUNTIME_SOURCE_NOT_CURRENT',
      `${label} is not valid JSON`,
      503,
      error?.message ?? String(error)
    );
  }
}

export function loadBrowserRelationshipsRuntimeSources(sourceRoot = root) {
  const canonical = path.resolve(sourceRoot);
  return Object.freeze({
    relationshipsRegistry: readRelationshipsRuntimeSourceJson(
      canonical,
      'blueprint/relationships-browser-registry.json',
      'Relationships registry'
    ),
    cdrRegistry: readRelationshipsRuntimeSourceJson(
      canonical,
      'blueprint/cdr-s5-closed-alpha-browser-registry.json',
      'CDR S5 registry'
    )
  });
}

function readCompanionAvailabilityRegistry(sourceRoot) {
  const file = path.resolve(sourceRoot, 'blueprint/companion-availability-reentry-registry.json');
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('availability registry must be one regular non-link file');
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new BrowserCompanionBridgeError(
      'COMPANION_AVAILABILITY_SOURCE_UNAVAILABLE',
      'Companion availability source is unavailable',
      503,
      error?.message ?? String(error)
    );
  }
}

function companionAvailabilityFailurePayload(error) {
  const typed = error instanceof BrowserCompanionBridgeError
    ? error
    : new BrowserCompanionBridgeError(
      'COMPANION_AVAILABILITY_FAILED',
      'Companion availability failed safely',
      500
    );
  return Object.freeze({
    schemaVersion: 'vexlife.browser-companion-availability-failure/v1',
    state: 'HELD',
    truthClass: 'CURRENT_LOCAL_AVAILABILITY_FAILURE',
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

export function createServerOwnedCompanionAvailabilityResolver({
  sourceRoot = root,
  resolveCompanionBinding = null,
  resolveCompanionRuntimeObservation = null,
  availabilityCompiler = compileCompanionAvailability
} = {}) {
  if (resolveCompanionBinding !== null && typeof resolveCompanionBinding !== 'function') {
    throw new TypeError('Companion availability binding provider must be one function');
  }
  if (resolveCompanionRuntimeObservation !== null && typeof resolveCompanionRuntimeObservation !== 'function') {
    throw new TypeError('Companion availability runtime-observation provider must be one function');
  }
  if (typeof availabilityCompiler !== 'function') {
    throw new TypeError('Companion availability compiler must be one function');
  }
  return async function resolveCompanionAvailability() {
    if (resolveCompanionBinding === null || resolveCompanionRuntimeObservation === null) {
      throw new BrowserCompanionBridgeError(
        'COMPANION_AVAILABILITY_PROVIDER_UNAVAILABLE',
        'Companion availability providers are unavailable',
        503
      );
    }
    try {
      const binding = await resolveCompanionBinding();
      const runtimeObservation = await resolveCompanionRuntimeObservation();
      const registry = readCompanionAvailabilityRegistry(sourceRoot);
      const availability = availabilityCompiler({ registry, binding, runtimeObservation });
      if (
        !availability ||
        availability.schemaVersion !== 'vexlife.companion-availability/v1' ||
        availability.truthClass !== 'SOURCE_BOUND_COMPANION_AVAILABILITY' ||
        availability.effectAuthorityGranted !== false ||
        availability.rendererAuthorityGranted !== false ||
        availability.modelIdentityAuthorityGranted !== false ||
        availability.processAuthorityGranted !== false ||
        availability.conversationAuthorityGranted !== false
      ) {
        throw new Error('canonical Companion availability projection is incomplete');
      }
      return availability;
    } catch (error) {
      if (error instanceof BrowserCompanionBridgeError) throw error;
      throw new BrowserCompanionBridgeError(
        'COMPANION_AVAILABILITY_NOT_CURRENT',
        'Canonical Companion availability is unavailable',
        503,
        error?.message ?? String(error)
      );
    }
  };
}


function readCompanionRecoveryEffectContract(sourceRoot) {
  const file = path.resolve(sourceRoot, 'blueprint/companion-recovery-effect-contract.json');
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('recovery effect contract must be one regular non-link file');
    }
    const contract = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!validateBrowserCompanionRecoveryEffectContract(contract)) {
      throw new Error('recovery effect contract is not current');
    }
    return contract;
  } catch (error) {
    throw new BrowserCompanionBridgeError(
      'COMPANION_RECOVERY_ACTION_SOURCE_UNAVAILABLE',
      'Companion recovery action source is unavailable',
      503,
      error?.message ?? String(error)
    );
  }
}

function admitCompanionRecoveryActionBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrowserCompanionBridgeError(
      'COMPANION_RECOVERY_ACTION_NOT_ADMITTED',
      'Companion recovery action must be one source-bound binding object',
      400
    );
  }
  const keys = Object.keys(value);
  if (
    keys.length !== BROWSER_COMPANION_RECOVERY_ACTION_KEYS.size
    || keys.some((key) => !BROWSER_COMPANION_RECOVERY_ACTION_KEYS.has(key))
    || value.schemaVersion !== BROWSER_COMPANION_RECOVERY_ACTION_BINDING_SCHEMA
    || value.truthClass !== BROWSER_COMPANION_RECOVERY_ACTION_TRUTH_CLASS
    || value.actionRef !== 'action.companion.reenter-current-binding'
    || typeof value.availabilityProjectionRef !== 'string'
    || value.availabilityProjectionRef.length === 0
    || value.effectAuthorityGranted !== false
  ) {
    throw new BrowserCompanionBridgeError(
      'COMPANION_RECOVERY_ACTION_NOT_ADMITTED',
      'Companion recovery action binding is not admitted',
      400
    );
  }
  return Object.freeze(structuredClone(value));
}

export function createServerOwnedCompanionRecoveryActionResolver({
  sourceRoot = root,
  resolveCompanionBinding = null,
  resolveCompanionRuntimeObservation = null,
  availabilityCompiler = compileCompanionAvailability,
  reentryPlanFormer = formCompanionReentryPlan,
  recoveryRequestFormer = formBrowserCompanionRecoveryRequest
} = {}) {
  if (resolveCompanionBinding !== null && typeof resolveCompanionBinding !== 'function') {
    throw new TypeError('Companion recovery action binding provider must be one function');
  }
  if (resolveCompanionRuntimeObservation !== null && typeof resolveCompanionRuntimeObservation !== 'function') {
    throw new TypeError('Companion recovery action runtime-observation provider must be one function');
  }
  if (typeof availabilityCompiler !== 'function' || typeof reentryPlanFormer !== 'function' || typeof recoveryRequestFormer !== 'function') {
    throw new TypeError('Companion recovery action semantic formers must be functions');
  }

  async function resolveCurrent() {
    if (resolveCompanionBinding === null || resolveCompanionRuntimeObservation === null) {
      throw new BrowserCompanionBridgeError(
        'COMPANION_RECOVERY_ACTION_PROVIDER_UNAVAILABLE',
        'Companion recovery action providers are unavailable',
        503
      );
    }
    try {
      const binding = await resolveCompanionBinding();
      const runtimeObservation = await resolveCompanionRuntimeObservation();
      const registry = readCompanionAvailabilityRegistry(sourceRoot);
      const contract = readCompanionRecoveryEffectContract(sourceRoot);
      const availability = availabilityCompiler({ registry, binding, runtimeObservation });
      const reentryPlan = reentryPlanFormer({ registry, availability, binding, runtimeObservation });
      if (
        availability?.availabilityState !== 'RECOVERABLE'
        || availability?.recoveryClass !== 'SAFE_REENTRY_AVAILABLE'
        || !reentryPlan
        || reentryPlan.actionRef !== contract.actionRef
        || reentryPlan.effectAuthorityGranted !== false
      ) {
        throw new BrowserCompanionBridgeError(
          'COMPANION_RECOVERY_ACTION_NOT_AVAILABLE',
          'Companion recovery action is not currently available',
          409
        );
      }
      const actionBinding = Object.freeze({
        schemaVersion: BROWSER_COMPANION_RECOVERY_ACTION_BINDING_SCHEMA,
        truthClass: BROWSER_COMPANION_RECOVERY_ACTION_TRUTH_CLASS,
        actionRef: contract.actionRef,
        availabilityProjectionRef: availability.projectionRef,
        effectAuthorityGranted: false
      });
      return Object.freeze({ contract, availability, reentryPlan, actionBinding });
    } catch (error) {
      if (error instanceof BrowserCompanionBridgeError) throw error;
      throw new BrowserCompanionBridgeError(
        'COMPANION_RECOVERY_ACTION_NOT_CURRENT',
        'Companion recovery action is not current',
        503,
        error?.message ?? String(error)
      );
    }
  }

  return Object.freeze({
    async binding() {
      return (await resolveCurrent()).actionBinding;
    },
    async request(input) {
      const admitted = admitCompanionRecoveryActionBinding(input);
      const current = await resolveCurrent();
      for (const key of BROWSER_COMPANION_RECOVERY_ACTION_KEYS) {
        if (admitted[key] !== current.actionBinding[key]) {
          throw new BrowserCompanionBridgeError(
            'COMPANION_RECOVERY_ACTION_STALE',
            'Companion recovery action binding is stale',
            409
          );
        }
      }
      const request = recoveryRequestFormer(current.contract, current.availability, current.reentryPlan);
      if (!request) {
        throw new BrowserCompanionBridgeError(
          'COMPANION_RECOVERY_ACTION_NOT_CURRENT',
          'Companion recovery request could not be formed from current owner evidence',
          409
        );
      }
      return request;
    }
  });
}

export function createServerOwnedBrowserCompanionBridge({
  sourceRoot = root,
  companionHome = home,
  endpoint = process.env.VEXLIFE_COMPANION_ENDPOINT ?? null,
  model = process.env.VEXLIFE_COMPANION_MODEL ?? null,
  runtimeMode = process.env.VEXLIFE_CAPABILITY_RUNTIME_MODE ??
    CAPABILITY_ASSIMILATION_MODES.DIRECT_SINGLE_TURN,
  bridgeFactory = createBrowserCompanionBridge
} = {}) {
  if (!Object.values(CAPABILITY_ASSIMILATION_MODES).includes(runtimeMode)) {
    throw new Error(`Unsupported VEXLIFE_CAPABILITY_RUNTIME_MODE: ${runtimeMode}`);
  }
  if (typeof bridgeFactory !== 'function') {
    throw new TypeError('Browser Companion bridge factory must be one function');
  }
  const capabilityRuntimeBundle = runtimeMode === CAPABILITY_ASSIMILATION_MODES.DIRECT_SINGLE_TURN
    ? null
    : loadBlueprint(sourceRoot);
  const capabilityRuntime = capabilityRuntimeBundle
    ? createCapabilityAssimilationRuntime({
        capabilityRegistry: capabilityRuntimeBundle.capabilities,
        processFactoryDefinition: capabilityRuntimeBundle.factory,
        schedulerRegistry: capabilityRuntimeBundle.schedulerRegistry,
        mode: runtimeMode
      })
    : null;
  const modelConnectionComposer = capabilityRuntime
    ? createModelConnectionTurnComposer({
        sourceBundle: loadModelConnectionTurnSources(sourceRoot)
      })
    : null;
  let promptContextBinding = null;
  const currentPromptContextRuntime = () => {
    const identity = loadBrowserCompanionHomeIdentity(companionHome);
    if (promptContextBinding === null) {
      promptContextBinding = Object.freeze({
        identity,
        runtime: createBrowserPromptContextRuntime({
          home: identity.home,
          homeRef: identity.homeRef,
          deviceRef: identity.deviceRef,
          companionLineageRef: identity.companionLineageRef
        })
      });
      return promptContextBinding.runtime;
    }
    const bound = promptContextBinding.identity;
    if (
      identity.home !== bound.home ||
      identity.homeRef !== bound.homeRef ||
      identity.deviceRef !== bound.deviceRef ||
      identity.companionLineageRef !== bound.companionLineageRef
    ) {
      throw new BrowserCompanionBridgeError(
        'COMPANION_HOME_IDENTITY_INVALID',
        'Vex Home identity changed after prompt-context runtime binding',
        409
      );
    }
    return promptContextBinding.runtime;
  };
  const promptContextResolver = (input) => currentPromptContextRuntime().promptContextResolver(input);
  const promptContextAuthorityVerifier = (query) => currentPromptContextRuntime().promptContextAuthorityVerifier(query);
  return bridgeFactory({
    home: companionHome,
    endpoint,
    model,
    capabilityRuntime,
    modelConnectionComposer,
    promptContextResolver,
    promptContextAuthorityVerifier
  });
}

const companion = createServerOwnedBrowserCompanionBridge();
const relationshipsRuntime = createBrowserRelationshipsRuntimeBridge(loadBrowserRelationshipsRuntimeSources(root));
const relationshipsCdrObservation = createBrowserRelationshipsCdrObservationBridge({
  observationPath: process.env.VEXLIFE_RELATIONSHIPS_CDR_OBSERVATION_PATH ?? null
});

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  response.end(body);
}

function companionRequestError(message, httpStatus) {
  return new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', message, httpStatus);
}
function companionRecoveryRequestError(message, httpStatus) {
  return new BrowserCompanionBridgeError('COMPANION_RECOVERY_REQUEST_NOT_ADMITTED', message, httpStatus);
}
function companionRecoveryActionRequestError(message, httpStatus) {
  return new BrowserCompanionBridgeError('COMPANION_RECOVERY_ACTION_NOT_ADMITTED', message, httpStatus);
}

function livingJournalMemoryRequestError(message, httpStatus) {
  return new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED', message, httpStatus);
}
function livingJournalArchiveRequestError(message, httpStatus) {
  return new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', message, httpStatus);
}
function relationshipsRuntimeRequestError(message, httpStatus) {
  return new BrowserRelationshipsRuntimeBridgeError('RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED', message, httpStatus, null);
}
function relationshipsPersistenceRequestError(message, httpStatus) {
  const error = new BrowserRelationshipsPersistenceError('RELATIONSHIPS_PERSISTENCE_REQUEST_NOT_ADMITTED', message);
  error.httpStatus = httpStatus;
  return error;
}

async function readBoundedJson(request, { maxBytes = 64 * 1024, formError = companionRequestError, requestLabel = 'Companion request' } = {}) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw formError(`${requestLabel} must use application/json`, 415);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw formError(`${requestLabel} exceeds the bounded body size`, 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw formError(`${requestLabel} body is not valid JSON`, 400);
  }
}

function archiveHomeFailure(error) {
  const status = error instanceof BrowserCompanionBridgeError && error.httpStatus === 409 ? 409 : 503;
  return new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_HOME_UNAVAILABLE', 'Living Journal archive Home identity is unavailable', status, null);
}

function memoryHomeFailure(error) {
  const status = error instanceof BrowserCompanionBridgeError && error.httpStatus === 409 ? 409 : 503;
  return new BrowserLivingJournalMemoryBridgeError(
    'LIVING_JOURNAL_MEMORY_HOME_UNAVAILABLE',
    'Living Journal Memory Home identity is unavailable',
    status,
    null
  );
}

function admitRelationshipsPersistenceRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw relationshipsPersistenceRequestError('Relationships persistence request must be one object', 400);
  }
  const keys = Object.keys(value);
  if (keys.length !== RELATIONSHIPS_PERSISTENCE_REQUEST_KEYS.size || keys.some((key) => !RELATIONSHIPS_PERSISTENCE_REQUEST_KEYS.has(key))) {
    throw relationshipsPersistenceRequestError('Relationships persistence request must contain only localOwnerBinding and input', 400);
  }
  if (!value.localOwnerBinding || typeof value.localOwnerBinding !== 'object' || Array.isArray(value.localOwnerBinding)) {
    throw relationshipsPersistenceRequestError('Relationships persistence request requires one explicit local owner binding', 400);
  }
  if (!value.input || typeof value.input !== 'object' || Array.isArray(value.input)) {
    throw relationshipsPersistenceRequestError('Relationships persistence request requires one save input object', 400);
  }
  return value;
}

function relationshipsPersistenceHttpStatus(error) {
  if (Number.isInteger(error?.httpStatus)) return error.httpStatus;
  if (!(error instanceof BrowserRelationshipsPersistenceError)) return 500;
  if (['RELATIONSHIPS_PERSISTENCE_INPUT_INVALID', 'RELATIONSHIPS_PERSISTENCE_IDENTITY_INVALID', 'RELATIONSHIPS_PERSISTENCE_PREPARED_INVALID'].includes(error.code)) return 400;
  if (['RELATIONSHIPS_IDENTITY_BINDING_REQUIRED', 'RELATIONSHIPS_PERSISTENCE_HOME_REQUIRED'].includes(error.code)) return 409;
  return 500;
}

function relationshipsPersistenceFailurePayload(error) {
  if (error instanceof BrowserRelationshipsPersistenceError) {
    return Object.freeze({
      schemaVersion: 'vexlife.browser-relationships-persistence-http-failure/v1',
      state: 'HELD_PERSISTENCE_FAILURE',
      failureCode: error.code,
      message: error.message
    });
  }
  return Object.freeze({
    schemaVersion: 'vexlife.browser-relationships-persistence-http-failure/v1',
    state: 'HELD_PERSISTENCE_FAILURE',
    failureCode: 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED',
    message: 'Relationships persistence save failed safely'
  });
}

class BrowserFamilyConversationServerError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.name = 'BrowserFamilyConversationServerError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function familyConversationRequestError(message, httpStatus = 400) {
  return new BrowserFamilyConversationServerError(
    'FAMILY_CONVERSATION_REQUEST_NOT_ADMITTED',
    message,
    httpStatus
  );
}

function admitFamilyConversationRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw familyConversationRequestError('Family conversation request must be one object');
  }
  const keys = Object.keys(value);
  if (
    keys.length !== FAMILY_CONVERSATION_REQUEST_KEYS.size
    || keys.some((key) => !FAMILY_CONVERSATION_REQUEST_KEYS.has(key))
  ) {
    throw familyConversationRequestError('Family conversation request must contain only operation and intent');
  }
  if (!FAMILY_CONVERSATION_OPERATIONS.has(value.operation)) {
    throw familyConversationRequestError('Family conversation operation is not admitted');
  }
  if (!value.intent || typeof value.intent !== 'object' || Array.isArray(value.intent)) {
    throw familyConversationRequestError('Family conversation intent must be one object');
  }
  return Object.freeze({ operation: value.operation, intent: value.intent });
}

function familyLifecycleRequestError(message, httpStatus = 400) {
  return new BrowserFamilyLifecycleBridgeError(
    'FAMILY_LIFECYCLE_REQUEST_NOT_ADMITTED',
    message,
    httpStatus
  );
}

function admitFamilyLifecycleRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw familyLifecycleRequestError('Family lifecycle request must be one object');
  }
  const keys = Object.keys(value);
  if (
    keys.length !== FAMILY_LIFECYCLE_REQUEST_KEYS.size
    || keys.some((key) => !FAMILY_LIFECYCLE_REQUEST_KEYS.has(key))
  ) {
    throw familyLifecycleRequestError('Family lifecycle request must contain only operation and intent');
  }
  if (!FAMILY_LIFECYCLE_OPERATIONS.has(value.operation)) {
    throw familyLifecycleRequestError('Family lifecycle operation is not admitted');
  }
  if (!value.intent || typeof value.intent !== 'object' || Array.isArray(value.intent)) {
    throw familyLifecycleRequestError('Family lifecycle intent must be one object');
  }
  return Object.freeze({ operation: value.operation, intent: value.intent });
}

function familyLifecycleHttpStatus(error) {
  if (Number.isInteger(error?.httpStatus)) return error.httpStatus;
  if (error instanceof BrowserFamilyLifecycleBridgeError) return 409;
  return 500;
}

function familyLifecycleFailurePayload(error) {
  if (error instanceof BrowserFamilyLifecycleBridgeError) {
    return Object.freeze({
      schemaVersion: 'vexlife.browser-family-lifecycle-http-failure/v1',
      state: 'HELD_FAMILY_LIFECYCLE_FAILURE',
      failureCode: error.code,
      message: error.message
    });
  }
  return Object.freeze({
    schemaVersion: 'vexlife.browser-family-lifecycle-http-failure/v1',
    state: 'HELD_FAMILY_LIFECYCLE_FAILURE',
    failureCode: 'FAMILY_LIFECYCLE_SERVER_FAILED',
    message: 'Family lifecycle request failed safely'
  });
}

async function currentFamilyLifecycleAuthority(resolveAuthority, request, admitted) {
  if (typeof resolveAuthority !== 'function') {
    throw new BrowserFamilyLifecycleBridgeError(
      'FAMILY_LIFECYCLE_AUTHORITY_UNAVAILABLE',
      'Family lifecycle requires a server-owned authenticated authority resolver',
      503
    );
  }
  let authority;
  try {
    authority = await resolveAuthority(Object.freeze({
      request,
      operation: admitted.operation,
      intent: admitted.intent
    }));
  } catch {
    throw new BrowserFamilyLifecycleBridgeError(
      'FAMILY_LIFECYCLE_AUTHORITY_UNAVAILABLE',
      'Family lifecycle authenticated authority is unavailable',
      503
    );
  }
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    throw new BrowserFamilyLifecycleBridgeError(
      'FAMILY_LIFECYCLE_AUTHORITY_UNAVAILABLE',
      'Family lifecycle authenticated authority is unavailable',
      503
    );
  }
  return authority;
}

async function performFamilyLifecycleHttpRequest({
  request,
  familyHome,
  resolveAuthority,
  nowProvider,
  instanceRef
}) {
  const admitted = admitFamilyLifecycleRequest(await readBoundedJson(request, {
    maxBytes: BROWSER_FAMILY_LIFECYCLE_MAX_BODY_BYTES,
    formError: familyLifecycleRequestError,
    requestLabel: 'Family lifecycle request'
  }));
  const authority = await currentFamilyLifecycleAuthority(resolveAuthority, request, admitted);
  const now = currentFamilyConversationTime(nowProvider);
  if (typeof instanceRef !== 'string' || instanceRef.length === 0) {
    throw new BrowserFamilyLifecycleBridgeError(
      'FAMILY_LIFECYCLE_SERVER_INSTANCE_UNAVAILABLE',
      'Family lifecycle server writer identity is unavailable',
      503
    );
  }
  return executeBrowserFamilyLifecycle({
    home: familyHome,
    operation: admitted.operation,
    intent: admitted.intent,
    currentAuthorityProjection: authority,
    observedAt: now,
    instanceRef
  });
}

function familyConversationHttpStatus(error) {
  if (Number.isInteger(error?.httpStatus)) return error.httpStatus;
  if (error instanceof BrowserFamilyConversationBridgeError) {
    if (['BROWSER_FAMILY_BRIDGE_INPUT_INVALID', 'BROWSER_FAMILY_BRIDGE_UNTRUSTED_FIELD'].includes(error.code)) return 400;
    if (error.code === 'BROWSER_FAMILY_BRIDGE_DENIED') return 403;
    if (error.code === 'BROWSER_FAMILY_BRIDGE_NOT_FOUND') return 404;
    if (['BROWSER_FAMILY_BRIDGE_STALE', 'BROWSER_FAMILY_BRIDGE_IDEMPOTENCY_CONFLICT'].includes(error.code)) return 409;
    if (['BROWSER_FAMILY_BRIDGE_FAMILY_SPACE_UNAVAILABLE', 'BROWSER_FAMILY_BRIDGE_STORE_UNAVAILABLE'].includes(error.code)) return 503;
  }
  if (error instanceof ConversationStoreError) return 503;
  return 500;
}

function familyConversationFailurePayload(error) {
  if (error instanceof BrowserFamilyConversationServerError || error instanceof BrowserFamilyConversationBridgeError) {
    return Object.freeze({
      schemaVersion: 'vexlife.browser-family-conversation-http-failure/v1',
      state: 'HELD_FAMILY_CONVERSATION_FAILURE',
      failureCode: error.code,
      message: error.message
    });
  }
  if (error instanceof ConversationStoreError) {
    return Object.freeze({
      schemaVersion: 'vexlife.browser-family-conversation-http-failure/v1',
      state: 'HELD_FAMILY_CONVERSATION_FAILURE',
      failureCode: 'FAMILY_CONVERSATION_CHANNEL_UNAVAILABLE',
      message: 'Family conversation durable channel binding is unavailable'
    });
  }
  return Object.freeze({
    schemaVersion: 'vexlife.browser-family-conversation-http-failure/v1',
    state: 'HELD_FAMILY_CONVERSATION_FAILURE',
    failureCode: 'FAMILY_CONVERSATION_SERVER_FAILED',
    message: 'Family conversation request failed safely'
  });
}


function normalizedFamilyWorkStatus(value) {
  if (value == null) {
    return Object.freeze({
      state: 'HELD_UNAVAILABLE',
      pendingCount: null,
      activeCount: null,
      dueCount: null,
      attentionCount: null,
      sourceRef: null
    });
  }
  if (
    typeof value !== 'object'
    || Array.isArray(value)
    || value.state !== 'CURRENT'
    || !Number.isSafeInteger(value.pendingCount)
    || value.pendingCount < 0
    || !Number.isSafeInteger(value.activeCount)
    || value.activeCount < 0
    || !Number.isSafeInteger(value.dueCount)
    || value.dueCount < 0
    || !Number.isSafeInteger(value.attentionCount)
    || value.attentionCount < 0
    || value.sourceRef !== BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF
  ) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_WORK_PROJECTION_UNAVAILABLE',
      'Family work projection is not current source-bound generic follow-through truth',
      503
    );
  }
  return Object.freeze({
    state: 'CURRENT',
    pendingCount: value.pendingCount,
    activeCount: value.activeCount,
    dueCount: value.dueCount,
    attentionCount: value.attentionCount,
    sourceRef: value.sourceRef
  });
}

function currentFamilyRoomScope(principalRef, rooms) {
  if (typeof principalRef !== 'string' || principalRef.length === 0 || !Array.isArray(rooms) || rooms.length === 0) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_WORK_SCOPE_UNAVAILABLE',
      'Family follow-through projection requires one current principal and visible Family room',
      503
    );
  }
  const roomByChannelRef = new Map();
  for (const room of rooms) {
    if (
      room?.kind !== 'GROUP'
      || typeof room.channelRef !== 'string'
      || typeof room.threadRef !== 'string'
      || typeof room.familyCompanionLineageRef !== 'string'
      || !Array.isArray(room.audience)
      || !room.audience.some((member) => member?.principalRef === principalRef)
      || roomByChannelRef.has(room.channelRef)
    ) {
      throw new BrowserFamilyConversationServerError(
        'FAMILY_WORK_SCOPE_UNAVAILABLE',
        'Family follow-through projection requires exact current visible Family audience truth',
        503
      );
    }
    roomByChannelRef.set(room.channelRef, room);
  }
  return roomByChannelRef;
}

function validateGenericFamilyWorkgraph(graph, roomByChannelRef) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)
      || graph.semanticFingerprint !== buildGraphSnapshotFingerprint(graph)) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_WORK_SOURCE_INVALID',
      'Generic follow-through Workgraph is stale or forged',
      503
    );
  }
  const room = roomByChannelRef.get(graph.intent?.channelRef) ?? null;
  if (!room || graph.intent?.threadRef !== room.threadRef) return null;
  const visibleActorRefs = new Set([
    ...room.audience.map((member) => member.principalRef),
    room.familyCompanionLineageRef
  ]);
  if (!visibleActorRefs.has(graph.intent?.originSpeakerRef)) return null;

  const nodesByRef = new Map((graph.nodes ?? []).map((node) => [node.workNodeRef, node]));
  for (const node of nodesByRef.values()) {
    if (node.semanticFingerprint !== buildWorkNodeFingerprint(node)) {
      throw new BrowserFamilyConversationServerError(
        'FAMILY_WORK_SOURCE_INVALID',
        'Generic follow-through Workgraph node fingerprint is invalid',
        503
      );
    }
  }
  const currentAssignments = new Map();
  for (const assignment of graph.acceptedAssignments ?? []) {
    if (assignment.semanticFingerprint !== buildAcceptedAssignmentFingerprint(assignment)) {
      throw new BrowserFamilyConversationServerError(
        'FAMILY_WORK_SOURCE_INVALID',
        'Generic follow-through accepted assignment fingerprint is invalid',
        503
      );
    }
    if (assignment.assignmentState !== 'CURRENT') continue;
    if (
      assignment.sourceIntentRef !== graph.rootIntentRef
      || !nodesByRef.has(assignment.workNodeRef)
      || currentAssignments.has(assignment.workNodeRef)
    ) {
      throw new BrowserFamilyConversationServerError(
        'FAMILY_WORK_SOURCE_INVALID',
        'Generic follow-through current assignment lineage is invalid or ambiguous',
        503
      );
    }
    currentAssignments.set(assignment.workNodeRef, assignment);
  }
  return Object.freeze({ graph, room, nodesByRef, currentAssignments });
}

function concernFamilyWorkNodeRef(aggregate, projection, eligibleGraphFingerprints) {
  const admission = aggregate.schedulerAdmissions?.at(-1) ?? null;
  if (
    projection.meaning?.workNodeRef
    && admission?.workgraphFingerprint
    && eligibleGraphFingerprints.has(admission.workgraphFingerprint)
  ) return projection.meaning.workNodeRef;

  for (const observation of [...(aggregate.observations ?? [])].reverse()) {
    const due = observation?.schedulerDueEvidence;
    if (
      due?.workNodeRef
      && due?.graphFingerprint
      && eligibleGraphFingerprints.has(due.graphFingerprint)
    ) return due.workNodeRef;
  }
  return null;
}

export function projectFamilyFollowThroughStatus({
  genericRuntimeSnapshot,
  principalRef,
  rooms,
  sourceBundle = loadBlueprint(root)
} = {}) {
  if (
    !genericRuntimeSnapshot
    || typeof genericRuntimeSnapshot !== 'object'
    || Array.isArray(genericRuntimeSnapshot)
    || genericRuntimeSnapshot.schemaVersion !== BROWSER_FAMILY_FOLLOW_THROUGH_RUNTIME_SCHEMA
    || genericRuntimeSnapshot.state !== 'CURRENT'
    || genericRuntimeSnapshot.currentness !== 'CURRENT'
    || typeof genericRuntimeSnapshot.sourceRef !== 'string'
    || genericRuntimeSnapshot.sourceRef.length === 0
    || !Array.isArray(genericRuntimeSnapshot.workgraphs)
    || !Array.isArray(genericRuntimeSnapshot.schedulerAggregates)
    || !Array.isArray(genericRuntimeSnapshot.concernAggregates)
  ) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_WORK_SOURCE_UNAVAILABLE',
      'Generic follow-through runtime projection is unavailable or not current',
      503
    );
  }

  const roomByChannelRef = currentFamilyRoomScope(principalRef, rooms);
  const eligibleByFingerprint = new Map();
  const eligibleNodeRefs = new Set();
  for (const graph of genericRuntimeSnapshot.workgraphs) {
    const eligible = validateGenericFamilyWorkgraph(graph, roomByChannelRef);
    if (!eligible) continue;
    if (eligibleByFingerprint.has(graph.semanticFingerprint)) {
      throw new BrowserFamilyConversationServerError(
        'FAMILY_WORK_SOURCE_INVALID',
        'Generic follow-through Workgraph projection is duplicated',
        503
      );
    }
    eligibleByFingerprint.set(graph.semanticFingerprint, eligible);
    for (const workNodeRef of eligible.currentAssignments.keys()) eligibleNodeRefs.add(workNodeRef);
  }

  const activeRefs = new Set();
  const pendingRefs = new Set();
  const dueRefs = new Set();
  const suppliedGraphFingerprints = new Set(
    genericRuntimeSnapshot.workgraphs.map((graph) => graph?.semanticFingerprint).filter(Boolean)
  );
  for (const aggregate of genericRuntimeSnapshot.schedulerAggregates) {
    createIntentSchedulerState({ aggregate, schedulerRegistry: sourceBundle.schedulerRegistry });
    if (aggregate.queue?.currentness !== 'CURRENT') {
      throw new BrowserFamilyConversationServerError(
        'FAMILY_WORK_SOURCE_INVALID',
        'Generic Scheduler aggregate is not current',
        503
      );
    }

    const queueGraph = aggregate.queue?.graphFingerprint
      ? eligibleByFingerprint.get(aggregate.queue.graphFingerprint) ?? null
      : null;
    if (aggregate.queue?.graphFingerprint && !suppliedGraphFingerprints.has(aggregate.queue.graphFingerprint)) {
      throw new BrowserFamilyConversationServerError(
        'FAMILY_WORK_SOURCE_INVALID',
        'Generic Scheduler queue is detached from its exact Workgraph',
        503
      );
    }
    if (queueGraph) {
      for (const entry of aggregate.queue.admittedReady ?? []) {
        const node = queueGraph.nodesByRef.get(entry.workNodeRef);
        if (!node || entry.nodeFingerprint !== node.semanticFingerprint) {
          throw new BrowserFamilyConversationServerError(
            'FAMILY_WORK_SOURCE_INVALID',
            'Generic Scheduler admitted queue entry is stale or substituted',
            503
          );
        }
        if (queueGraph.currentAssignments.has(entry.workNodeRef)) pendingRefs.add(entry.workNodeRef);
      }
    }

    if (aggregate.active) {
      const activeGraph = eligibleByFingerprint.get(aggregate.active.graphFingerprint) ?? null;
      if (activeGraph?.currentAssignments.has(aggregate.active.workNodeRef)) {
        activeRefs.add(aggregate.active.workNodeRef);
        pendingRefs.delete(aggregate.active.workNodeRef);
      }
    }

    for (const due of aggregate.dueRecords ?? []) {
      if (due.currentness !== 'CURRENT' || due.lifecycle !== 'DUE') continue;
      const dueGraph = eligibleByFingerprint.get(due.graphFingerprint) ?? null;
      const assignment = dueGraph?.currentAssignments.get(due.workNodeRef) ?? null;
      if (
        assignment
        && due.assignmentRef === assignment.assignmentRef
        && due.assignmentFingerprint === assignment.semanticFingerprint
      ) dueRefs.add(due.workNodeRef);
    }
  }

  const attentionRefs = new Set();
  const concernRegistry = sourceBundle.blueprint?.concernWatch;
  if (!concernRegistry) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_WORK_SOURCE_INVALID',
      'Canonical Concern Watch registry is unavailable',
      503
    );
  }
  const eligibleGraphFingerprints = new Set(eligibleByFingerprint.keys());
  for (const aggregate of genericRuntimeSnapshot.concernAggregates) {
    const projection = projectConcernAggregate(aggregate, { registry: concernRegistry });
    if (!projection.views?.HUMAN_ATTENTION_INBOX) continue;
    const workNodeRef = concernFamilyWorkNodeRef(aggregate, projection, eligibleGraphFingerprints);
    if (workNodeRef && eligibleNodeRefs.has(workNodeRef)) attentionRefs.add(workNodeRef);
  }

  return normalizedFamilyWorkStatus({
    state: 'CURRENT',
    pendingCount: pendingRefs.size,
    activeCount: activeRefs.size,
    dueCount: dueRefs.size,
    attentionCount: attentionRefs.size,
    sourceRef: BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF
  });
}

function heldFamilySecurityStatus() {
  return Object.freeze({
    state: 'HELD_UNAVAILABLE',
    projectionRefOrNull: null,
    projectionFingerprintOrNull: null,
    sessionCurrent: 'UNKNOWN',
    missingCount: null,
    unknownCount: null,
    withheldCount: null,
    telemetryGapCount: null,
    incidentCoverageStateOrNull: null,
    attackEstablished: 'UNKNOWN',
    roleCanAct: false,
    effectAuthorityGranted: false
  });
}

function sameSortedRefs(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || new Set(left).size !== left.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function familySecurityContainsRawAuthority(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(familySecurityContainsRawAuthority);
  for (const [key, nested] of Object.entries(value)) {
    if (FAMILY_SECURITY_RAW_ONLY_KEYS.has(key)) return true;
    if ((key === 'membership' || key === 'lease') && nested && typeof nested === 'object') return true;
    if (familySecurityContainsRawAuthority(nested)) return true;
  }
  return false;
}

function currentFamilySecurityStatus(value, current) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).length !== FAMILY_SECURITY_TOP_LEVEL_KEYS.length
    || Object.keys(value).some((key) => !FAMILY_SECURITY_TOP_LEVEL_KEYS.includes(key))
    || value.schemaVersion !== FAMILY_SECURITY_AWARENESS_SCHEMA
    || value.truthClass !== FAMILY_SECURITY_AWARENESS_TRUTH_CLASS
    || !/^[0-9a-f]{64}$/u.test(value.semanticFingerprint ?? '')
  ) throw new Error('Family security projection identity is invalid');

  const core = structuredClone(value);
  const fingerprint = core.semanticFingerprint;
  const projectionRef = core.familySecurityProjectionRef;
  delete core.semanticFingerprint;
  delete core.familySecurityProjectionRef;
  if (
    semanticHash(core) !== fingerprint
    || projectionRef !== `projection.vex-family-security.${fingerprint.slice(0, 32)}`
  ) throw new Error('Family security projection fingerprint is invalid');

  const family = value.familyContext;
  if (
    !family
    || typeof family !== 'object'
    || Array.isArray(family)
    || family.spaceRef !== current.spaceRef
    || family.channelRef !== current.channelRef
    || family.membershipGeneration !== current.membershipGeneration
    || family.membershipSnapshotRef !== current.membershipSnapshotRef
    || family.historyVisibilityPolicyRef !== current.historyVisibilityPolicyRef
    || family.requestingPrincipalRef !== current.requestingPrincipalRef
    || family.familyCompanionLineageRef !== current.familyCompanionLineageRef
    || !sameSortedRefs(family.audiencePrincipalRefs, current.audiencePrincipalRefs)
  ) throw new Error('Family security projection is not bound to the exact current Family context');

  const authority = value.authority;
  if (
    !authority
    || typeof authority !== 'object'
    || Array.isArray(authority)
    || Object.keys(authority).length !== FAMILY_SECURITY_AUTHORITY_KEYS.length
    || Object.keys(authority).some((key) => !FAMILY_SECURITY_AUTHORITY_KEYS.includes(key))
    || authority.roleCanPerceive !== true
    || authority.roleCanAct !== false
    || authority.effectAuthorityGranted !== false
    || authority.selfCertificationAllowed !== false
    || authority.attackAttributionAllowed !== false
  ) throw new Error('Family security projection authority boundary is invalid');

  if (
    !value.effects
    || typeof value.effects !== 'object'
    || Array.isArray(value.effects)
    || Object.keys(value.effects).length !== FAMILY_SECURITY_EFFECT_KEYS.length
    || Object.keys(value.effects).some((key) => !FAMILY_SECURITY_EFFECT_KEYS.includes(key))
    || Object.values(value.effects).some((effect) => effect !== false)
    || !Array.isArray(value.effectAuthorityRefs)
    || value.effectAuthorityRefs.length !== 0
  ) throw new Error('Family security projection must remain effect-free');

  if (
    value.sessionSecurity?.principalRef !== current.requestingPrincipalRef
    || value.incidentCoverage?.attackEstablished !== false
  ) throw new Error('Family security projection currentness or incident boundary is invalid');

  for (const key of ['missingRefs', 'unknownRefs', 'withheldRefs', 'telemetryGapRefs']) {
    if (
      !Array.isArray(value[key])
      || new Set(value[key]).size !== value[key].length
      || value[key].some((entry) => typeof entry !== 'string' || entry.length === 0)
    ) throw new Error(`Family security projection ${key} are invalid`);
  }
  if (familySecurityContainsRawAuthority(value)) {
    throw new Error('Family security projection contains raw authority material');
  }

  return Object.freeze({
    state: 'CURRENT',
    projectionRefOrNull: projectionRef,
    projectionFingerprintOrNull: fingerprint,
    sessionCurrent: true,
    missingCount: value.missingRefs.length,
    unknownCount: value.unknownRefs.length,
    withheldCount: value.withheldRefs.length,
    telemetryGapCount: value.telemetryGapRefs.length,
    incidentCoverageStateOrNull: typeof value.incidentCoverage?.state === 'string'
      ? value.incidentCoverage.state
      : null,
    attackEstablished: false,
    roleCanAct: false,
    effectAuthorityGranted: false
  });
}

async function resolveFamilySecurityStatus({
  resolveProjection,
  request,
  room,
  binding,
  principalRef
} = {}) {
  if (!room || !binding || typeof resolveProjection !== 'function') return heldFamilySecurityStatus();
  const current = Object.freeze({
    spaceRef: binding.spaceRef,
    channelRef: room.channelRef,
    membershipGeneration: binding.membershipGeneration,
    membershipSnapshotRef: binding.membershipSnapshotRef,
    historyVisibilityPolicyRef: binding.historyVisibilityPolicyRef,
    requestingPrincipalRef: principalRef,
    audiencePrincipalRefs: Object.freeze(
      binding.audienceMemberBindings.map((member) => member.principalRef).sort()
    ),
    familyCompanionLineageRef: binding.familyCompanionLineageRef
  });
  try {
    const projection = await resolveProjection(Object.freeze({ request, current }));
    return currentFamilySecurityStatus(projection, current);
  } catch {
    return heldFamilySecurityStatus();
  }
}

function familyRoomAudienceProjection(binding) {
  return Object.freeze(binding.audienceMemberBindings.map((member) => Object.freeze({
    principalRef: member.principalRef,
    role: member.role
  })));
}

function heldFamilyRoomBootstrap(failureCode = 'FAMILY_SESSION_AUTHORITY_UNAVAILABLE') {
  return Object.freeze({
    schemaVersion: BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA,
    state: 'HELD_UNAVAILABLE',
    truthClass: 'HELD_UNAVAILABLE',
    currentPrincipalRef: null,
    rooms: Object.freeze([]),
    workStatus: normalizedFamilyWorkStatus(null),
    securityStatus: heldFamilySecurityStatus(),
    failureCode
  });
}

export async function resolveCurrentFamilyRoomBootstrap({
  request,
  familyHome,
  resolveAuthority,
  nowProvider,
  resolveFamilyWorkProjection = null,
  resolveFamilySecurityProjection = null
} = {}) {
  let authority;
  try {
    authority = await currentFamilyConversationAuthority(
      resolveAuthority,
      request,
      { operation: 'LIST', intent: Object.freeze({}) }
    );
  } catch (error) {
    if (
      error instanceof BrowserFamilyConversationServerError
      && error.code === 'FAMILY_SESSION_AUTHORITY_UNAVAILABLE'
    ) {
      return heldFamilyRoomBootstrap(error.code);
    }
    throw error;
  }
  const now = currentFamilyConversationTime(nowProvider);
  const durable = listConversationChannelBindings({
    home: familyHome,
    limit: BROWSER_FAMILY_CONVERSATION_LIST_MAX
  });
  const rooms = [];
  const securityBindingByChannel = new Map();
  for (const channel of durable.channels ?? []) {
    const binding = channel?.familySpaceBinding;
    if (!binding || binding.audienceKind !== 'GROUP') continue;
    let visible;
    try {
      visible = listBrowserFamilyChannels({
        home: familyHome,
        intent: {
          spaceRef: binding.spaceRef,
          expectedMembershipGeneration: binding.membershipGeneration
        },
        channels: [channel],
        membership: authority.membership,
        lease: authority.lease,
        currentRevocationGeneration: authority.currentRevocationGeneration,
        now
      });
    } catch (error) {
      if (
        error instanceof BrowserFamilyConversationBridgeError
        && ['BROWSER_FAMILY_BRIDGE_STALE', 'BROWSER_FAMILY_BRIDGE_DENIED'].includes(error.code)
      ) continue;
      throw error;
    }
    if (
      visible?.state !== 'CURRENT'
      || !Array.isArray(visible.channels)
      || visible.channels.length !== 1
      || visible.channels[0].channelRef !== channel.channelRef
    ) continue;
    rooms.push(Object.freeze({
      spaceRef: binding.spaceRef,
      channelRef: channel.channelRef,
      threadRef: channel.threadRef,
      kind: channel.kind,
      membershipGeneration: binding.membershipGeneration,
      audience: familyRoomAudienceProjection(binding),
      familyCompanionLineageRef: binding.familyCompanionLineageRef,
      familyCompanionIncluded: binding.familyCompanionIncluded === true
    }));
    securityBindingByChannel.set(channel.channelRef, binding);
  }
  rooms.sort((left, right) =>
    left.spaceRef < right.spaceRef ? -1
      : left.spaceRef > right.spaceRef ? 1
        : left.channelRef < right.channelRef ? -1
          : left.channelRef > right.channelRef ? 1 : 0
  );
  let workStatus = normalizedFamilyWorkStatus(null);
  if (typeof resolveFamilyWorkProjection === 'function' && rooms.length > 0) {
    try {
      const genericRuntimeSnapshot = await resolveFamilyWorkProjection(Object.freeze({
        request,
        principalRef: authority.membership.principalRef,
        rooms: Object.freeze([...rooms])
      }));
      workStatus = projectFamilyFollowThroughStatus({
        genericRuntimeSnapshot,
        principalRef: authority.membership.principalRef,
        rooms
      });
    } catch {
      workStatus = normalizedFamilyWorkStatus(null);
    }
  }
  const primaryRoom = rooms[0] ?? null;
  const securityStatus = await resolveFamilySecurityStatus({
    resolveProjection: resolveFamilySecurityProjection,
    request,
    room: primaryRoom,
    binding: primaryRoom ? securityBindingByChannel.get(primaryRoom.channelRef) : null,
    principalRef: authority.membership.principalRef
  });
  return Object.freeze({
    schemaVersion: BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA,
    state: rooms.length > 0 ? 'CURRENT' : 'EMPTY',
    truthClass: 'CURRENT_LIVE_FAMILY',
    currentPrincipalRef: authority.membership.principalRef,
    rooms: Object.freeze(rooms),
    workStatus,
    securityStatus
  });
}

async function currentFamilyConversationAuthority(resolveAuthority, request, admitted) {
  if (typeof resolveAuthority !== 'function') {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_SESSION_AUTHORITY_UNAVAILABLE',
      'Family conversation requires a server-owned authenticated session resolver',
      503
    );
  }
  let authority;
  try {
    authority = await resolveAuthority(Object.freeze({
      request,
      operation: admitted.operation,
      target: Object.freeze({
        spaceRef: admitted.intent.spaceRef ?? null,
        channelRef: admitted.intent.channelRef ?? null
      })
    }));
  } catch {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_SESSION_AUTHORITY_UNAVAILABLE',
      'Family conversation authenticated session authority is unavailable',
      503
    );
  }
  if (
    !authority
    || typeof authority !== 'object'
    || Array.isArray(authority)
    || !authority.membership
    || typeof authority.membership !== 'object'
    || Array.isArray(authority.membership)
    || !authority.lease
    || typeof authority.lease !== 'object'
    || Array.isArray(authority.lease)
    || !Number.isSafeInteger(authority.currentRevocationGeneration)
    || authority.currentRevocationGeneration < 0
  ) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_SESSION_AUTHORITY_UNAVAILABLE',
      'Family conversation authenticated session authority is unavailable',
      503
    );
  }
  return Object.freeze({
    membership: authority.membership,
    lease: authority.lease,
    currentRevocationGeneration: authority.currentRevocationGeneration
  });
}

function currentFamilyConversationTime(nowProvider) {
  if (typeof nowProvider !== 'function') {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_SERVER_TIME_UNAVAILABLE',
      'Family conversation server time is unavailable',
      503
    );
  }
  const now = nowProvider();
  if (
    typeof now !== 'string'
    || !Number.isFinite(Date.parse(now))
    || new Date(now).toISOString() !== now
  ) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_SERVER_TIME_UNAVAILABLE',
      'Family conversation server time is unavailable',
      503
    );
  }
  return now;
}

function currentFamilyConversationChannel(familyHome, intent) {
  const binding = readConversationChannelBinding({
    home: familyHome,
    channelRef: intent.channelRef
  });
  if (binding.state !== 'CURRENT' || !binding.channel) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_CONVERSATION_CHANNEL_NOT_FOUND',
      'Family conversation channel is unavailable',
      404
    );
  }
  return binding.channel;
}

async function performFamilyConversationHttpRequest({
  request,
  familyHome,
  resolveAuthority,
  nowProvider,
  instanceRef
}) {
  const admitted = admitFamilyConversationRequest(await readBoundedJson(request, {
    maxBytes: BROWSER_FAMILY_CONVERSATION_MAX_BODY_BYTES,
    formError: familyConversationRequestError,
    requestLabel: 'Family conversation request'
  }));
  const authority = await currentFamilyConversationAuthority(resolveAuthority, request, admitted);
  const now = currentFamilyConversationTime(nowProvider);
  const common = {
    home: familyHome,
    intent: admitted.intent,
    membership: authority.membership,
    lease: authority.lease,
    currentRevocationGeneration: authority.currentRevocationGeneration,
    now
  };

  if (admitted.operation === 'APPEND') {
    if (typeof instanceRef !== 'string' || instanceRef.length === 0) {
      throw new BrowserFamilyConversationServerError(
        'FAMILY_SERVER_INSTANCE_UNAVAILABLE',
        'Family conversation server writer identity is unavailable',
        503
      );
    }
    return appendBrowserFamilyMessage({
      ...common,
      channel: currentFamilyConversationChannel(familyHome, admitted.intent),
      instanceRef
    });
  }
  if (admitted.operation === 'READ') {
    return readBrowserFamilyConversation({
      ...common,
      channel: currentFamilyConversationChannel(familyHome, admitted.intent)
    });
  }

  const bindings = listConversationChannelBindings({
    home: familyHome,
    limit: BROWSER_FAMILY_CONVERSATION_LIST_MAX
  });
  return listBrowserFamilyChannels({
    ...common,
    channels: bindings.channels
  });
}

export function createVexLifeBrowserServer({
  staticRoot = root,
  companionBridge = companion,
  relationshipsRuntimeBridge = relationshipsRuntime,
  relationshipsCdrObservationBridge = relationshipsCdrObservation,
  relationshipsPersistenceHome = home,
  relationshipsPersistenceBridgeFactory = (localOwnerBinding) => createBrowserRelationshipsPersistenceBridge({
    home: relationshipsPersistenceHome,
    localOwnerBinding
  }),
  resolveHomeIdentity = () => loadBrowserCompanionHomeIdentity(home),
  companionAvailabilitySourceRoot = staticRoot,
  resolveCompanionBinding = null,
  resolveCompanionRuntimeObservation = null,
  companionAvailabilityCompiler = compileCompanionAvailability,
  createLivingJournalMemoryBridge = (identity) => createBrowserLivingJournalMemoryBridge({ identity }),
  familyConversationHome = home,
  resolveFamilyConversationAuthority = null,
  familyConversationNow = () => new Date().toISOString(),
  familyConversationInstanceRef = 'instance.vexlife.browser-family-server',
  familyLifecycleHome = home,
  resolveFamilyLifecycleAuthority = null,
  familyLifecycleNow = () => new Date().toISOString(),
  familyLifecycleInstanceRef = 'instance.vexlife.browser-family-lifecycle',
  resolveFamilyWorkProjection = null,
  resolveFamilySecurityProjection = null
} = {}) {
  const resolveCompanionAvailability = createServerOwnedCompanionAvailabilityResolver({
    sourceRoot: companionAvailabilitySourceRoot,
    resolveCompanionBinding,
    resolveCompanionRuntimeObservation,
    availabilityCompiler: companionAvailabilityCompiler
  });
  const companionRecoveryAction = createServerOwnedCompanionRecoveryActionResolver({
    sourceRoot: companionAvailabilitySourceRoot,
    resolveCompanionBinding,
    resolveCompanionRuntimeObservation,
    availabilityCompiler: companionAvailabilityCompiler
  });
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);

      if (url.pathname === BROWSER_COMPANION_AVAILABILITY_PATH) {
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          sendJson(response, 200, await resolveCompanionAvailability());
        } catch (error) {
          const typed = error instanceof BrowserCompanionBridgeError
            ? error
            : new BrowserCompanionBridgeError(
              'COMPANION_AVAILABILITY_FAILED',
              'Companion availability failed safely',
              500
            );
          sendJson(response, typed.httpStatus, companionAvailabilityFailurePayload(typed));
        }
        return;
      }

      if (url.pathname === BROWSER_COMPANION_RECOVERY_ACTION_PATH) {
        if (!['GET', 'POST'].includes(request.method)) {
          response.writeHead(405, { Allow: 'GET, POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          if (request.method === 'GET') {
            sendJson(response, 200, await companionRecoveryAction.binding());
            return;
          }
          if (typeof companionBridge?.performRecovery !== 'function') {
            throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_UNAVAILABLE', 'Companion recovery owner is unavailable', 503);
          }
          const input = await readBoundedJson(request, {
            maxBytes: BROWSER_COMPANION_RECOVERY_ACTION_MAX_BODY_BYTES,
            formError: companionRecoveryActionRequestError,
            requestLabel: 'Companion recovery action'
          });
          const exactRequest = await companionRecoveryAction.request(input);
          sendJson(response, 200, await companionBridge.performRecovery(exactRequest));
        } catch (error) {
          const typed = error instanceof BrowserCompanionBridgeError
            ? error
            : new BrowserCompanionBridgeError('COMPANION_RECOVERY_ACTION_FAILED', 'Companion recovery action failed safely', 500);
          sendJson(response, typed.httpStatus, browserCompanionRecoveryFailurePayload(typed));
        }
        return;
      }

      if (url.pathname === BROWSER_COMPANION_STATUS_PATH) {
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        sendJson(response, 200, companionBridge.status());
        return;
      }

      if (url.pathname === BROWSER_COMPANION_RECOVERY_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          if (typeof companionBridge?.performRecovery !== 'function') {
            throw new BrowserCompanionBridgeError('COMPANION_RECOVERY_OWNER_UNAVAILABLE', 'Companion recovery owner is unavailable', 503);
          }
          const input = await readBoundedJson(request, {
            maxBytes: BROWSER_COMPANION_RECOVERY_MAX_BODY_BYTES,
            formError: companionRecoveryRequestError,
            requestLabel: 'Companion recovery request'
          });
          const result = await companionBridge.performRecovery(input);
          sendJson(response, 200, result);
        } catch (error) {
          const typed = error instanceof BrowserCompanionBridgeError
            ? error
            : new BrowserCompanionBridgeError('COMPANION_RECOVERY_FAILED', 'Companion recovery failed safely', 500);
          sendJson(response, typed.httpStatus, browserCompanionRecoveryFailurePayload(typed));
        }
        return;
      }

      if (url.pathname === BROWSER_COMPANION_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        const input = await readBoundedJson(request);
        const result = await companionBridge.performTurn(input);
        sendJson(response, 200, result);
        return;
      }

      if (url.pathname === BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_API_PATH) {
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const result = relationshipsCdrObservationBridge.read();
          sendJson(response, 200, result);
        } catch (error) {
          const typed = error instanceof BrowserRelationshipsCdrObservationBridgeError
            ? error
            : new BrowserRelationshipsCdrObservationBridgeError(
              'RELATIONSHIPS_CDR_OBSERVATION_BINDING_FAILED',
              'Relationships CDR persistence binding failed safely',
              500
            );
          sendJson(response, typed.httpStatus, browserRelationshipsCdrObservationFailurePayload(typed));
        }
        return;
      }

      if (url.pathname === BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH) {
        if (request.method === 'GET') {
          try {
            const bindingResult = relationshipsCdrObservationBridge.read();
            const binding = bindingResult?.binding;
            if (bindingResult?.state !== 'BOUND_CURRENT' || !binding) {
              throw new BrowserRelationshipsCdrObservationBridgeError(
                'RELATIONSHIPS_CDR_OBSERVATION_HELD',
                'Relationships CDR observation is not currently admissible',
                409
              );
            }
            const persistenceBridge = relationshipsPersistenceBridgeFactory(Object.freeze({
              localParticipantRef: binding.localParticipantRef,
              localStateRootRef: binding.localStateRootRef
            }));
            const result = persistenceBridge.list({
              maxRelationships: BROWSER_RELATIONSHIPS_PERSISTENCE_LIST_MAX,
              includeTombstoned: false
            });
            sendJson(response, 200, result);
          } catch (error) {
            if (error instanceof BrowserRelationshipsCdrObservationBridgeError) {
              sendJson(response, error.httpStatus, browserRelationshipsCdrObservationFailurePayload(error));
            } else {
              sendJson(response, relationshipsPersistenceHttpStatus(error), relationshipsPersistenceFailurePayload(error));
            }
          }
          return;
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'GET, POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const requestValue = admitRelationshipsPersistenceRequest(await readBoundedJson(request, {
            maxBytes: BROWSER_RELATIONSHIPS_PERSISTENCE_MAX_BODY_BYTES,
            formError: relationshipsPersistenceRequestError,
            requestLabel: 'Relationships persistence request'
          }));
          const persistenceBridge = relationshipsPersistenceBridgeFactory(requestValue.localOwnerBinding);
          const prepared = persistenceBridge.prepare(requestValue.input);
          const result = persistenceBridge.commit(prepared);
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, relationshipsPersistenceHttpStatus(error), relationshipsPersistenceFailurePayload(error));
        }
        return;
      }

      if (url.pathname === BROWSER_RELATIONSHIPS_RUNTIME_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const input = await readBoundedJson(request, {
            maxBytes: BROWSER_RELATIONSHIPS_RUNTIME_MAX_BODY_BYTES,
            formError: relationshipsRuntimeRequestError,
            requestLabel: 'Relationships runtime request'
          });
          const result = relationshipsRuntimeBridge.prepare(input);
          sendJson(response, 200, result);
        } catch (error) {
          const typed = error instanceof BrowserRelationshipsRuntimeBridgeError
            ? error
            : new BrowserRelationshipsRuntimeBridgeError(
              'RELATIONSHIPS_RUNTIME_PLAN_FAILED',
              'Relationships runtime plan failed safely',
              500,
              null
            );
          sendJson(response, typed.httpStatus, browserRelationshipsRuntimeFailurePayload(typed));
        }
        return;
      }

      if (url.pathname === BROWSER_FAMILY_LIFECYCLE_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const result = await performFamilyLifecycleHttpRequest({
            request,
            familyHome: familyLifecycleHome,
            resolveAuthority: resolveFamilyLifecycleAuthority,
            nowProvider: familyLifecycleNow,
            instanceRef: familyLifecycleInstanceRef
          });
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, familyLifecycleHttpStatus(error), familyLifecycleFailurePayload(error));
        }
        return;
      }

      if (url.pathname === BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH) {
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const result = await resolveCurrentFamilyRoomBootstrap({
            request,
            familyHome: familyConversationHome,
            resolveAuthority: resolveFamilyConversationAuthority,
            nowProvider: familyConversationNow,
            resolveFamilyWorkProjection,
            resolveFamilySecurityProjection
          });
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, familyConversationHttpStatus(error), familyConversationFailurePayload(error));
        }
        return;
      }

      if (url.pathname === BROWSER_FAMILY_CONVERSATION_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const result = await performFamilyConversationHttpRequest({
            request,
            familyHome: familyConversationHome,
            resolveAuthority: resolveFamilyConversationAuthority,
            nowProvider: familyConversationNow,
            instanceRef: familyConversationInstanceRef
          });
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, familyConversationHttpStatus(error), familyConversationFailurePayload(error));
        }
        return;
      }

      if (url.pathname === BROWSER_LIVING_JOURNAL_MEMORY_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const input = await readBoundedJson(request, { maxBytes: 8 * 1024, formError: livingJournalMemoryRequestError, requestLabel: 'Living Journal Memory request' });
          let identity;
          try {
            identity = resolveHomeIdentity();
          } catch (error) {
            throw memoryHomeFailure(error);
          }
          const result = createLivingJournalMemoryBridge(identity).read(input);
          sendJson(response, 200, result);
        } catch (error) {
          const typed = error instanceof BrowserLivingJournalMemoryBridgeError
            ? error
            : new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_MEMORY_READ_FAILED', 'Living Journal Memory read failed safely', 500, null);
          sendJson(response, typed.httpStatus, browserLivingJournalMemoryFailurePayload(typed));
        }
        return;
      }

      if (url.pathname === BROWSER_LIVING_JOURNAL_ARCHIVE_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const input = await readBoundedJson(request, { maxBytes: 8 * 1024, formError: livingJournalArchiveRequestError, requestLabel: 'Living Journal archive request' });
          let identity;
          try { identity = resolveHomeIdentity(); } catch (error) { throw archiveHomeFailure(error); }
          const result = createLivingJournalMemoryBridge(identity).readArchive(input);
          sendJson(response, 200, result);
        } catch (error) {
          const typed = error instanceof BrowserLivingJournalMemoryBridgeError
            ? error
            : new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_READ_FAILED', 'Living Journal archive read failed safely', 500, null);
          sendJson(response, typed.httpStatus, browserLivingJournalArchiveFailurePayload(typed));
        }
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }

      let relative = decodeURIComponent(url.pathname);
      if (relative === '/') {
        response.writeHead(302, { Location: '/reference/browser/' });
        response.end();
        return;
      }
      if (relative === '/reference/browser/') relative = '/reference/browser/index.html';
      const filePath = path.resolve(staticRoot, `.${relative}`);
      if (!filePath.startsWith(staticRoot + path.sep) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404); response.end('Not found'); return;
      }
      response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      const typed = error instanceof BrowserCompanionBridgeError
        ? error
        : new BrowserCompanionBridgeError('COMPANION_TURN_FAILED', 'Local companion turn failed safely', 500, error?.message ?? String(error));
      sendJson(response, typed.httpStatus, browserCompanionFailurePayload(typed));
    }
  });
}

const server = createVexLifeBrowserServer();

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(`VexLife browser reference: http://127.0.0.1:${address.port}`);
    console.log(`VexLife browser companion binding: ${companion.status().state}`);
  });
}

// [VXG RealForever]
