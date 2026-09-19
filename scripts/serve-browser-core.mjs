#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_COMPANION_API_PATH,
  BROWSER_COMPANION_STATUS_PATH,
  BrowserCompanionBridgeError,
  browserCompanionFailurePayload,
  createBrowserCompanionBridge,
  loadBrowserCompanionHomeIdentity
} from '../src/core/browser-companion-bridge.mjs';
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.VEXLIFE_PORT ?? 18110);
const home = path.resolve(process.env.VEXLIFE_HOME ?? path.join(os.homedir(), '.vexlife'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
export const BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH = '/api/v1/relationships/persistence';
export const BROWSER_RELATIONSHIPS_PERSISTENCE_MAX_BODY_BYTES = 16 * 1024;
export const BROWSER_RELATIONSHIPS_PERSISTENCE_LIST_MAX = 256;
export const BROWSER_FAMILY_CONVERSATION_API_PATH = '/api/v1/family/conversation';
export const BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH = '/api/v1/family/bootstrap';
export const BROWSER_FAMILY_LIFECYCLE_API_PATH = '/api/v1/family/lifecycle';
export const BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA = 'vexlife.browser-family-room-bootstrap/v1';
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
    || typeof value.sourceRef !== 'string'
    || value.sourceRef.length === 0
  ) {
    throw new BrowserFamilyConversationServerError(
      'FAMILY_WORK_PROJECTION_UNAVAILABLE',
      'Family work projection is not current canonical scheduler truth',
      503
    );
  }
  return Object.freeze({
    state: 'CURRENT',
    pendingCount: value.pendingCount,
    activeCount: value.activeCount,
    sourceRef: value.sourceRef
  });
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
    failureCode
  });
}

export async function resolveCurrentFamilyRoomBootstrap({
  request,
  familyHome,
  resolveAuthority,
  nowProvider,
  resolveFamilyWorkProjection = null
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
  }
  rooms.sort((left, right) =>
    left.spaceRef < right.spaceRef ? -1
      : left.spaceRef > right.spaceRef ? 1
        : left.channelRef < right.channelRef ? -1
          : left.channelRef > right.channelRef ? 1 : 0
  );
  let workStatus = normalizedFamilyWorkStatus(null);
  if (typeof resolveFamilyWorkProjection === 'function') {
    workStatus = normalizedFamilyWorkStatus(await resolveFamilyWorkProjection(Object.freeze({
      request,
      principalRef: authority.membership.principalRef,
      rooms: Object.freeze([...rooms])
    })));
  }
  return Object.freeze({
    schemaVersion: BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA,
    state: rooms.length > 0 ? 'CURRENT' : 'EMPTY',
    truthClass: 'CURRENT_LIVE_FAMILY',
    currentPrincipalRef: authority.membership.principalRef,
    rooms: Object.freeze(rooms),
    workStatus
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
  createLivingJournalMemoryBridge = (identity) => createBrowserLivingJournalMemoryBridge({ identity }),
  familyConversationHome = home,
  resolveFamilyConversationAuthority = null,
  familyConversationNow = () => new Date().toISOString(),
  familyConversationInstanceRef = 'instance.vexlife.browser-family-server',
  familyLifecycleHome = home,
  resolveFamilyLifecycleAuthority = null,
  familyLifecycleNow = () => new Date().toISOString(),
  familyLifecycleInstanceRef = 'instance.vexlife.browser-family-lifecycle',
  resolveFamilyWorkProjection = null
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);

      if (url.pathname === BROWSER_COMPANION_STATUS_PATH) {
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        sendJson(response, 200, companionBridge.status());
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

–b‡W&ÂçF†æÖRÓÓÒ%$õu4U%ôdÔ”Å•õ$ôôÕô$ôõE5E$ô•õD‚’°        if (request.method !== 'GET') {
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
            resolveFamilyWorkProjection
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
