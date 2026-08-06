import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash, writeJson } from './utils.mjs';

export const LIVED_COMPANION_FAILURE_CODES = Object.freeze([
  'HOME_NOT_INITIALIZED',
  'EXISTING_HOME_REQUIRES_MIGRATION_PLAN',
  'HOME_IDENTITY_MISMATCH',
  'ENDPOINT_PROFILE_NOT_ADMITTED',
  'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED',
  'ENDPOINT_UNREACHABLE',
  'ENDPOINT_TIMEOUT',
  'ENDPOINT_HTTP_ERROR',
  'ENDPOINT_RESPONSE_INVALID',
  'PERSISTENCE_WRITE_FAILED',
  'CONVERSATION_HEAD_MISMATCH',
  'EVENT_CHAIN_CORRUPT',
  'CONTEXT_HASH_MISMATCH',
  'DUPLICATE_TURN_SUPPRESSED',
  'PRIVACY_POLICY_BLOCKED'
]);

export class LivedCompanionError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'LivedCompanionError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new LivedCompanionError(code, message, details);
}

function ensureString(value, name, code = 'HOME_IDENTITY_MISMATCH') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${name} is required`);
  return value;
}

function readJson(file, code, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(code, `${label} could not be read`, { file, cause: error.message });
  }
}

function stableNow(value) {
  return value ?? new Date().toISOString();
}

function fileSha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function contentHash(value) {
  return semanticHash(value);
}

function ensureSafeRef(value, name, code = 'HOME_IDENTITY_MISMATCH') {
  const ref = ensureString(value, name, code);
  if (
    ref === '.' ||
    ref === '..' ||
    ref.includes('/') ||
    ref.includes('\\') ||
    ref.includes('\0') ||
    path.isAbsolute(ref) ||
    path.win32.isAbsolute(ref) ||
    path.posix.isAbsolute(ref)
  ) {
    fail(code, `${name} must be one safe path segment`);
  }
  return ref;
}

function canonicalHomeRoot(home, { create = false } = {}) {
  const requested = path.resolve(ensureString(home, 'home'));
  if (create) fs.mkdirSync(requested, { recursive: true });
  if (!fs.existsSync(requested)) fail('HOME_NOT_INITIALIZED', 'Vex Home is not initialized', { home: requested });
  if (fs.lstatSync(requested).isSymbolicLink()) fail('HOME_IDENTITY_MISMATCH', 'Vex Home root must not be a symbolic link');
  return fs.realpathSync.native(requested);
}

function resolveHomePath(home, ...segments) {
  const root = canonicalHomeRoot(home);
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('HOME_IDENTITY_MISMATCH', 'resolved path escapes the admitted Vex Home', { target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
      fail('HOME_IDENTITY_MISMATCH', 'resolved path traverses a symbolic link', { path: cursor });
    }
  }
  return target;
}

function resolveHomeRelativePath(home, relativePath, code = 'CONTEXT_HASH_MISMATCH') {
  const value = ensureString(relativePath, 'relativePath', code);
  const segments = value.split(/[\\/]/u);
  if (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail(code, 'stored relative path escapes the admitted Vex Home', { relativePath: value });
  }
  try {
    return resolveHomePath(home, ...segments);
  } catch (error) {
    if (error instanceof LivedCompanionError) fail(code, error.message, error.details);
    throw error;
  }
}

function safeFailureSegment(value, prefix) {
  try {
    return ensureSafeRef(value, prefix);
  } catch {
    return `${prefix}.invalid.${contentHash(String(value)).slice(0, 16)}`;
  }
}

function verifyHead(head) {
  if (!head || typeof head !== 'object' || Array.isArray(head)) fail('CONVERSATION_HEAD_MISMATCH', 'conversation head is invalid');
  const { conversationHeadSha256, ...core } = head;
  if (!/^[0-9a-f]{64}$/u.test(conversationHeadSha256 ?? '') || contentHash(core) !== conversationHeadSha256) {
    fail('CONVERSATION_HEAD_MISMATCH', 'conversation head content hash does not match');
  }
  return head;
}

function verifyContentAddressedReceipt(receipt, hashField, code, label) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail(code, `${label} is invalid`);
  const { [hashField]: observed, ...core } = receipt;
  if (!/^[0-9a-f]{64}$/u.test(observed ?? '') || contentHash(core) !== observed) {
    fail(code, `${label} content hash does not match`);
  }
  return receipt;
}

function isLoopbackHost(hostname) {
  const normalized = String(hostname).toLowerCase().replace(/^\[|\]$/gu, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function sanitizeEndpointOrigin(endpoint) {
  const parsed = new URL(endpoint);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.origin;
}

function endpointRequestUrl(endpoint) {
  const base = new URL(endpoint);
  const prefix = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  base.pathname = `${prefix}v1/chat/completions`.replace(/\/{2,}/gu, '/');
  base.search = '';
  base.hash = '';
  return base;
}

function homePaths(home, companionLineageRef, threadRef) {
  const lineage = ensureSafeRef(companionLineageRef, 'companionLineageRef');
  const thread = ensureSafeRef(threadRef, 'threadRef');
  const threadRoot = resolveHomePath(home, 'conversations', lineage, thread);
  return {
    homeManifest: resolveHomePath(home, 'config', 'home.json'),
    events: path.join(threadRoot, 'events'),
    head: path.join(threadRoot, 'head.json'),
    context: resolveHomePath(home, 'context', lineage, thread),
    runtime: resolveHomePath(home, 'runtime'),
    recovery: resolveHomePath(home, 'recovery')
  };
}

function loadHome(home) {
  const root = canonicalHomeRoot(home);
  const manifestPath = resolveHomePath(root, 'config', 'home.json');
  if (!fs.existsSync(manifestPath)) fail('HOME_NOT_INITIALIZED', 'Vex Home is not initialized', { home });
  const manifest = readJson(manifestPath, 'HOME_IDENTITY_MISMATCH', 'home manifest');
  ensureString(manifest.homeRef, 'homeRef');
  ensureString(manifest.familyRef, 'familyRef');
  const deviceRef = ensureSafeRef(manifest.currentDeviceRef, 'currentDeviceRef');
  const companionLineageRef = ensureSafeRef(manifest.currentCompanionLineageRef, 'currentCompanionLineageRef');
  const devicePath = resolveHomePath(root, 'devices', `${deviceRef}.json`);
  if (!fs.existsSync(devicePath)) fail('HOME_IDENTITY_MISMATCH', 'current device record is missing', { deviceRef });
  const device = readJson(devicePath, 'HOME_IDENTITY_MISMATCH', 'device record');
  if (device.deviceRef !== deviceRef || device.companionLineageRef !== companionLineageRef) {
    fail('HOME_IDENTITY_MISMATCH', 'home and device lineage identities disagree');
  }
  return { manifest, device, manifestPath, homeRoot: root };
}

function assertHomeIdentity(identity, expected = {}) {
  const checks = {
    homeRef: identity.manifest.homeRef,
    deviceRef: identity.manifest.currentDeviceRef,
    companionLineageRef: identity.manifest.currentCompanionLineageRef
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined && expectedValue !== null && checks[key] !== expectedValue) {
      fail('HOME_IDENTITY_MISMATCH', `${key} does not match the admitted identity`, { expected: expectedValue, observed: checks[key] });
    }
  }
  return checks;
}

export function initializeLivedCompanionHome({
  home,
  homeRef,
  familyRef,
  deviceRef,
  companionLineageRef,
  createdAt = new Date().toISOString()
}) {
  ensureString(homeRef, 'homeRef');
  ensureString(familyRef, 'familyRef');
  const safeDeviceRef = ensureSafeRef(deviceRef, 'deviceRef');
  const safeLineageRef = ensureSafeRef(companionLineageRef, 'companionLineageRef');
  const requestedRoot = path.resolve(ensureString(home, 'home'));
  const preexistingManifest = path.join(requestedRoot, 'config', 'home.json');
  if (fs.existsSync(preexistingManifest)) {
    fail('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', 'existing Vex Home was preserved', { manifestPath: preexistingManifest });
  }
  const root = canonicalHomeRoot(requestedRoot, { create: true });
  const manifestPath = resolveHomePath(root, 'config', 'home.json');
  for (const directory of ['config', 'devices', 'conversations', 'context', 'runtime', 'recovery']) {
    fs.mkdirSync(resolveHomePath(root, directory), { recursive: true });
  }
  const device = {
    schemaVersion: 'vexlife.device-installation/v0',
    personRef: 'person.proof-user',
    familyRef,
    deviceRef: safeDeviceRef,
    deviceName: 'G01 bounded proof device',
    platform: process.platform,
    architecture: process.arch,
    companionLineageRef: safeLineageRef,
    currentInstanceRef: null,
    createdAt,
    identityStatement: 'Distinct device companion lineage; shared state does not collapse identity.'
  };
  const manifest = {
    schemaVersion: 'vexlife.home/v0',
    homeRef,
    familyRef,
    createdAt,
    currentDeviceRef: safeDeviceRef,
    currentCompanionLineageRef: safeLineageRef,
    modelConfigurationRef: 'config/model.json'
  };
  writeJson(manifestPath, manifest);
  writeJson(resolveHomePath(root, 'devices', `${safeDeviceRef}.json`), device);
  writeJson(resolveHomePath(root, 'config', 'model.json'), {
    schemaVersion: 'vexlife.model-configuration/v0',
    state: 'UNCONFIGURED',
    endpoint: null,
    activeArtifactRef: null,
    automaticDownload: false,
    automaticActivation: false
  });
  return { home: root, manifest, device };
}

function eventPath(eventsDirectory, sequence, eventHash) {
  return path.join(eventsDirectory, `${String(sequence).padStart(8, '0')}-${eventHash}.json`);
}

function formEvent(core) {
  const eventHash = contentHash(core);
  return { ...core, eventHash };
}

function formContext(core) {
  const serializedContextSha256 = contentHash(core);
  return { ...core, serializedContextSha256 };
}

function formHead(core) {
  const conversationHeadSha256 = contentHash(core);
  return { ...core, conversationHeadSha256 };
}

function atomicWriteJson(file, value, { failBeforeRename = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    if (failBeforeRename) fail('PERSISTENCE_WRITE_FAILED', 'simulated persistence failure before atomic head advance');
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    if (error instanceof LivedCompanionError) throw error;
    fail('PERSISTENCE_WRITE_FAILED', 'atomic JSON write failed', { file, cause: error.message });
  }
}

function existingEvents(eventsDirectory) {
  if (!fs.existsSync(eventsDirectory)) return [];
  return fs.readdirSync(eventsDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join(eventsDirectory, name), 'EVENT_CHAIN_CORRUPT', 'conversation event'));
}

function assertNoDuplicateTurn(eventsDirectory, turnRef) {
  const duplicate = existingEvents(eventsDirectory).find((event) => event.turnRef === turnRef);
  if (duplicate) fail('DUPLICATE_TURN_SUPPRESSED', 'turnRef has already been recorded', { turnRef, eventHash: duplicate.eventHash });
}

function previousHead(headPath) {
  if (!fs.existsSync(headPath)) return null;
  return verifyHead(readJson(headPath, 'CONVERSATION_HEAD_MISMATCH', 'conversation head'));
}

function writeFailureReceipt({ home, threadRef, turnRef, error, requestDurablyRecorded, responseDurablyRecorded, lastValidHead }) {
  if (!home || !fs.existsSync(home)) return null;
  const safeThread = safeFailureSegment(threadRef || 'thread.unknown', 'thread.failure');
  const safeTurn = safeFailureSegment(turnRef || `turn.failure.${crypto.randomUUID()}`, 'turn.failure');
  let receiptPath;
  try {
    receiptPath = resolveHomePath(home, 'recovery', safeThread, safeTurn, 'failure-receipt.json');
  } catch {
    return null;
  }
  const receipt = {
    schemaVersion: 'vexlife.lived-companion-failure-receipt/v1',
    failureCode: error.code || 'PERSISTENCE_WRITE_FAILED',
    failureMessage: String(error.message || error).replace(/[?&](?:token|key|secret|authorization)=[^&\s]*/giu, '?redacted=true'),
    threadRef: safeThread,
    turnRef: safeTurn,
    requestDurablyRecorded,
    responseDurablyRecorded,
    lastValidHead: lastValidHead ? {
      conversationHeadSha256: lastValidHead.conversationHeadSha256,
      eventHash: lastValidHead.eventHash,
      sequence: lastValidHead.sequence
    } : null,
    resumePossible: Boolean(lastValidHead),
    exactNextSafeRoute: lastValidHead ? 'RESUME_FROM_LAST_VALID_HEAD' : 'INITIALIZE_OR_RETRY_WITH_ADMITTED_INPUTS',
    formedAt: new Date().toISOString()
  };
  try {
    atomicWriteJson(receiptPath, receipt);
    return receiptPath;
  } catch {
    return null;
  }
}

async function callEndpoint({ endpointProfile, requestContent, inMemoryAuthorization = null, timeoutMs = 5000 }) {
  if (!endpointProfile?.admitted || !endpointProfile.profileRef || !endpointProfile.endpoint) {
    fail('ENDPOINT_PROFILE_NOT_ADMITTED', 'an admitted endpoint profile is required');
  }
  let parsed;
  try {
    parsed = new URL(endpointProfile.endpoint);
  } catch {
    fail('ENDPOINT_PROFILE_NOT_ADMITTED', 'endpoint profile URL is invalid');
  }
  if (!isLoopbackHost(parsed.hostname)) {
    fail('ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED', 'G01 accepts loopback endpoints only; non-loopback use requires a separately admitted adapter');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json' };
    if (inMemoryAuthorization) headers.authorization = inMemoryAuthorization;
    const response = await fetch(endpointRequestUrl(endpointProfile.endpoint), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: endpointProfile.model || 'bounded-loopback-proof',
        messages: [{ role: 'user', content: requestContent }]
      }),
      signal: controller.signal
    });
    if (!response.ok) fail('ENDPOINT_HTTP_ERROR', `endpoint returned HTTP ${response.status}`, { status: response.status });
    let body;
    try {
      body = await response.json();
    } catch {
      fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response was not valid JSON');
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response lacked choices[0].message.content');
    }
    return { content, model: body.model || endpointProfile.model || 'bounded-loopback-proof' };
  } catch (error) {
    if (error instanceof LivedCompanionError) throw error;
    if (error?.name === 'AbortError') fail('ENDPOINT_TIMEOUT', 'endpoint request timed out');
    fail('ENDPOINT_UNREACHABLE', 'endpoint could not be reached', { cause: error.message });
  } finally {
    clearTimeout(timeout);
  }
}

export async function performLivedCompanionTurn({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  instanceRef,
  threadRef,
  channelRef,
  turnRef,
  requestMessageRef,
  responseMessageRef,
  speakerRef,
  recipientRefs,
  content,
  endpointProfile,
  contextSourceRefs = [],
  inMemoryAuthorization = null,
  timeoutMs = 5000,
  formedAt = new Date().toISOString(),
  faults = {}
}) {
  let requestDurablyRecorded = false;
  let responseDurablyRecorded = false;
  let lastValidHead = null;
  try {
    const identity = loadHome(home);
    const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
    ensureSafeRef(instanceRef, 'instanceRef');
    ensureSafeRef(threadRef, 'threadRef');
    ensureSafeRef(turnRef, 'turnRef');
    for (const [name, value] of Object.entries({ channelRef, requestMessageRef, responseMessageRef, speakerRef, content })) ensureString(value, name);
    if (!Array.isArray(recipientRefs) || recipientRefs.length === 0 || recipientRefs.some((value) => typeof value !== 'string' || value.length === 0)) {
      fail('HOME_IDENTITY_MISMATCH', 'recipientRefs must contain at least one non-empty ref');
    }
    if (!Array.isArray(contextSourceRefs) || contextSourceRefs.some((value) => typeof value !== 'string' || value.length === 0)) {
      fail('HOME_IDENTITY_MISMATCH', 'contextSourceRefs must be an array of non-empty refs');
    }
    const paths = homePaths(home, admitted.companionLineageRef, threadRef);
    fs.mkdirSync(paths.events, { recursive: true });
    fs.mkdirSync(paths.context, { recursive: true });
    assertNoDuplicateTurn(paths.events, turnRef);
    lastValidHead = previousHead(paths.head);
    const startingSequence = lastValidHead ? Number(lastValidHead.sequence) + 1 : 0;
    const requestCore = {
      schemaVersion: 'vexlife.lived-companion-event/v1',
      eventRef: `event.vexlife.request.${crypto.randomUUID()}`,
      eventKind: 'REQUEST',
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      instanceRef,
      threadRef,
      channelRef,
      turnRef,
      messageRef: requestMessageRef,
      speakerRef,
      recipientRefs: [...recipientRefs],
      sequence: startingSequence,
      priorEventHash: lastValidHead?.eventHash ?? null,
      content,
      contentHash: contentHash(content),
      privacyClass: 'DEVICE_PRIVATE',
      formedAt: stableNow(formedAt)
    };
    const requestEvent = formEvent(requestCore);
    atomicWriteJson(eventPath(paths.events, requestEvent.sequence, requestEvent.eventHash), requestEvent);
    requestDurablyRecorded = true;

    const response = await callEndpoint({ endpointProfile, requestContent: content, inMemoryAuthorization, timeoutMs });
    const responseCore = {
      schemaVersion: 'vexlife.lived-companion-event/v1',
      eventRef: `event.vexlife.response.${crypto.randomUUID()}`,
      eventKind: 'RESPONSE',
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      instanceRef,
      threadRef,
      channelRef,
      turnRef,
      messageRef: responseMessageRef,
      speakerRef: recipientRefs[0],
      recipientRefs: [speakerRef],
      sequence: startingSequence + 1,
      priorEventHash: requestEvent.eventHash,
      content: response.content,
      contentHash: contentHash(response.content),
      endpointProfileRef: endpointProfile.profileRef,
      sanitizedEndpointOrigin: sanitizeEndpointOrigin(endpointProfile.endpoint),
      modelNameOrBoundedTestProfileRef: response.model,
      privacyClass: 'DEVICE_PRIVATE',
      formedAt: new Date().toISOString()
    };
    const responseEvent = formEvent(responseCore);
    atomicWriteJson(eventPath(paths.events, responseEvent.sequence, responseEvent.eventHash), responseEvent);
    responseDurablyRecorded = true;

    const contextCore = {
      schemaVersion: 'vexlife.lived-companion-context/v1',
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      instanceRef,
      threadRef,
      turnRef,
      contextSourceRefs: [...contextSourceRefs, requestEvent.eventRef, responseEvent.eventRef],
      requestEventHash: requestEvent.eventHash,
      responseEventHash: responseEvent.eventHash,
      privacyClass: 'DEVICE_PRIVATE',
      formedAt: new Date().toISOString()
    };
    const contextRecord = formContext(contextCore);
    const contextPath = resolveHomePath(home, 'context', admitted.companionLineageRef, threadRef, `${turnRef}.json`);
    atomicWriteJson(contextPath, contextRecord);

    const headCore = {
      schemaVersion: 'vexlife.lived-companion-head/v1',
      homeRef: admitted.homeRef,
      deviceRef: admitted.deviceRef,
      companionLineageRef: admitted.companionLineageRef,
      instanceRef,
      threadRef,
      turnRef,
      requestMessageRef,
      responseMessageRef,
      eventHash: responseEvent.eventHash,
      contextSha256: contextRecord.serializedContextSha256,
      contextPath: path.relative(home, contextPath).replaceAll('\\', '/'),
      sequence: responseEvent.sequence,
      priorConversationHeadSha256: lastValidHead?.conversationHeadSha256 ?? null,
      formedAt: new Date().toISOString()
    };
    const head = formHead(headCore);
    atomicWriteJson(paths.head, head, { failBeforeRename: faults.persistenceFailureBeforeHead === true });
    return {
      state: 'TURN_COMPLETED',
      actualHttpCall: true,
      loopbackOnly: isLoopbackHost(new URL(endpointProfile.endpoint).hostname),
      requestDurablyRecorded,
      responseDurablyRecorded,
      requestEvent,
      responseEvent,
      contextRecord,
      head,
      headPath: paths.head
    };
  } catch (error) {
    const typed = error instanceof LivedCompanionError
      ? error
      : new LivedCompanionError('PERSISTENCE_WRITE_FAILED', error.message || String(error));
    const failureReceiptPath = writeFailureReceipt({ home, threadRef, turnRef, error: typed, requestDurablyRecorded, responseDurablyRecorded, lastValidHead });
    typed.details = { ...(typed.details || {}), failureReceiptPath, requestDurablyRecorded, responseDurablyRecorded, lastValidHeadSha256: lastValidHead?.conversationHeadSha256 ?? null };
    throw typed;
  }
}

function recomputeEventHash(event) {
  const { eventHash, ...core } = event;
  return contentHash(core);
}

function validateEventChain(eventsDirectory, headEventHash) {
  const events = existingEvents(eventsDirectory);
  const byHash = new Map(events.map((event) => [event.eventHash, event]));
  const chain = [];
  let cursor = headEventHash;
  const visited = new Set();
  while (cursor) {
    if (visited.has(cursor)) fail('EVENT_CHAIN_CORRUPT', 'event chain contains a cycle');
    visited.add(cursor);
    const event = byHash.get(cursor);
    if (!event) fail('EVENT_CHAIN_CORRUPT', 'event chain references a missing event', { eventHash: cursor });
    if (recomputeEventHash(event) !== event.eventHash) fail('EVENT_CHAIN_CORRUPT', 'event content hash does not match');
    chain.push(event);
    cursor = event.priorEventHash;
  }
  const chronological = chain.reverse();
  for (let index = 1; index < chronological.length; index += 1) {
    if (chronological[index].sequence <= chronological[index - 1].sequence) fail('EVENT_CHAIN_CORRUPT', 'event sequence is not strictly increasing');
  }
  return chronological;
}

export function writeLivedCompanionShutdownReceipt({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  instanceRef,
  threadRef,
  expectedConversationHeadSha256
}) {
  ensureSafeRef(instanceRef, 'instanceRef');
  ensureSafeRef(threadRef, 'threadRef');
  const identity = loadHome(home);
  const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
  const paths = homePaths(identity.homeRoot, admitted.companionLineageRef, threadRef);
  if (!fs.existsSync(paths.head)) fail('CONVERSATION_HEAD_MISMATCH', 'conversation head is missing');
  const head = verifyHead(readJson(paths.head, 'CONVERSATION_HEAD_MISMATCH', 'conversation head'));
  if (
    head.homeRef !== admitted.homeRef ||
    head.deviceRef !== admitted.deviceRef ||
    head.companionLineageRef !== admitted.companionLineageRef ||
    head.threadRef !== threadRef ||
    head.instanceRef !== instanceRef ||
    head.conversationHeadSha256 !== expectedConversationHeadSha256
  ) {
    fail('CONVERSATION_HEAD_MISMATCH', 'shutdown identity/head does not match the completing instance');
  }
  validateEventChain(paths.events, head.eventHash);
  const contextPath = resolveHomeRelativePath(identity.homeRoot, head.contextPath);
  if (!fs.existsSync(contextPath)) fail('CONTEXT_HASH_MISMATCH', 'bounded context record is missing');
  const contextRecord = readJson(contextPath, 'CONTEXT_HASH_MISMATCH', 'bounded context record');
  const { serializedContextSha256, ...contextCore } = contextRecord;
  if (contentHash(contextCore) !== serializedContextSha256 || serializedContextSha256 !== head.contextSha256) {
    fail('CONTEXT_HASH_MISMATCH', 'bounded context hash does not match the conversation head');
  }
  const receiptCore = {
    schemaVersion: 'vexlife.lived-companion-shutdown-receipt/v1',
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    instanceRef,
    threadRef,
    conversationHeadSha256: head.conversationHeadSha256,
    eventHash: head.eventHash,
    contextSha256: head.contextSha256,
    clean: true,
    formedAt: new Date().toISOString()
  };
  const receipt = { ...receiptCore, shutdownReceiptSha256: contentHash(receiptCore) };
  const receiptPath = resolveHomePath(identity.homeRoot, 'runtime', instanceRef, 'shutdown-receipt.json');
  atomicWriteJson(receiptPath, receipt);
  return { receipt, receiptPath };
}

export function resumeLivedCompanionConversation({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  priorInstanceRef,
  instanceRef,
  threadRef,
  expectedConversationHeadSha256,
  expectedShutdownReceiptSha256
}) {
  ensureSafeRef(priorInstanceRef, 'priorInstanceRef');
  ensureSafeRef(instanceRef, 'instanceRef');
  ensureSafeRef(threadRef, 'threadRef');
  if (instanceRef === priorInstanceRef) fail('CONVERSATION_HEAD_MISMATCH', 'fresh resume must use a new instanceRef');
  if (!/^[0-9a-f]{64}$/u.test(expectedShutdownReceiptSha256 ?? '')) {
    fail('CONVERSATION_HEAD_MISMATCH', 'exact shutdown receipt SHA-256 is required');
  }
  const identity = loadHome(home);
  const admitted = assertHomeIdentity(identity, { homeRef, deviceRef, companionLineageRef });
  const paths = homePaths(identity.homeRoot, admitted.companionLineageRef, threadRef);
  if (!fs.existsSync(paths.head)) fail('CONVERSATION_HEAD_MISMATCH', 'conversation head is missing');
  const head = verifyHead(readJson(paths.head, 'CONVERSATION_HEAD_MISMATCH', 'conversation head'));
  if (
    head.homeRef !== admitted.homeRef ||
    head.deviceRef !== admitted.deviceRef ||
    head.companionLineageRef !== admitted.companionLineageRef ||
    head.threadRef !== threadRef ||
    head.instanceRef !== priorInstanceRef ||
    head.conversationHeadSha256 !== expectedConversationHeadSha256
  ) {
    fail('CONVERSATION_HEAD_MISMATCH', 'resume identity does not match the admitted completing instance/head');
  }
  const shutdownPath = resolveHomePath(identity.homeRoot, 'runtime', priorInstanceRef, 'shutdown-receipt.json');
  if (!fs.existsSync(shutdownPath)) fail('CONVERSATION_HEAD_MISMATCH', 'matching clean shutdown receipt is missing');
  const shutdown = verifyContentAddressedReceipt(
    readJson(shutdownPath, 'CONVERSATION_HEAD_MISMATCH', 'shutdown receipt'),
    'shutdownReceiptSha256',
    'CONVERSATION_HEAD_MISMATCH',
    'shutdown receipt'
  );
  if (
    shutdown.shutdownReceiptSha256 !== expectedShutdownReceiptSha256 ||
    shutdown.clean !== true ||
    shutdown.homeRef !== admitted.homeRef ||
    shutdown.deviceRef !== admitted.deviceRef ||
    shutdown.companionLineageRef !== admitted.companionLineageRef ||
    shutdown.instanceRef !== priorInstanceRef ||
    shutdown.threadRef !== threadRef ||
    shutdown.conversationHeadSha256 !== head.conversationHeadSha256 ||
    shutdown.eventHash !== head.eventHash ||
    shutdown.contextSha256 !== head.contextSha256
  ) {
    fail('CONVERSATION_HEAD_MISMATCH', 'shutdown receipt does not bind the exact completed head and prior instance');
  }
  const chain = validateEventChain(paths.events, head.eventHash);
  const contextPath = resolveHomeRelativePath(identity.homeRoot, head.contextPath);
  if (!fs.existsSync(contextPath)) fail('CONTEXT_HASH_MISMATCH', 'bounded context record is missing');
  const contextRecord = readJson(contextPath, 'CONTEXT_HASH_MISMATCH', 'bounded context record');
  const { serializedContextSha256, ...contextCore } = contextRecord;
  if (contentHash(contextCore) !== serializedContextSha256 || serializedContextSha256 !== head.contextSha256) {
    fail('CONTEXT_HASH_MISMATCH', 'bounded context hash does not match the conversation head');
  }
  const receiptCore = {
    schemaVersion: 'vexlife.lived-companion-resume-receipt/v1',
    homeRef: admitted.homeRef,
    deviceRef: admitted.deviceRef,
    companionLineageRef: admitted.companionLineageRef,
    priorInstanceRef,
    instanceRef,
    threadRef,
    conversationHeadSha256: head.conversationHeadSha256,
    eventHash: head.eventHash,
    contextSha256: head.contextSha256,
    shutdownReceiptSha256: shutdown.shutdownReceiptSha256,
    replayedEventCount: chain.length,
    exactPriorHeadSelected: true,
    formedAt: new Date().toISOString()
  };
  const receipt = { ...receiptCore, resumeReceiptSha256: contentHash(receiptCore) };
  const receiptPath = resolveHomePath(identity.homeRoot, 'recovery', threadRef, 'resume-receipt.json');
  atomicWriteJson(receiptPath, receipt);
  return { state: 'RESUMED', head, chain, contextRecord, shutdownReceipt: shutdown, receipt, receiptPath };
}

export function assertNoSensitivePersistence(root, secretValues = []) {
  const secrets = secretValues.filter((value) => typeof value === 'string' && value.length > 0);
  if (!secrets.length) return { secretLeakCount: 0, checkedFiles: 0 };
  let checkedFiles = 0;
  let secretLeakCount = 0;
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        checkedFiles += 1;
        const text = fs.readFileSync(full, 'utf8');
        for (const secret of secrets) if (text.includes(secret)) secretLeakCount += 1;
      }
    }
  };
  walk(root);
  if (secretLeakCount) fail('PRIVACY_POLICY_BLOCKED', 'a secret was found in persisted runtime evidence', { secretLeakCount });
  return { secretLeakCount, checkedFiles };
}

export function livedCompanionReceiptSha256(file) {
  return fileSha256(file);
}

// [VXG RealForever]
