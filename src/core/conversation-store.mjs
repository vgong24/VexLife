import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';

export const CONVERSATION_STORE_EVENT_SCHEMA = 'vexlife.conversation-event/v1';
export const CONVERSATION_STORE_HEAD_SCHEMA = 'vexlife.conversation-head/v1';
export const CONVERSATION_STORE_RECEIPT_SCHEMA = 'vexlife.conversation-append-receipt/v1';
export const CONVERSATION_STORE_WRITER_SCHEMA = 'vexlife.conversation-writer/v1';
export const CONVERSATION_STORE_EXPORT_SCHEMA = 'vexlife.conversation-export/v1';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,220}[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;

export class ConversationStoreError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ConversationStoreError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details = null) => { throw new ConversationStoreError(code, message, details); };
const ref = (value, label) => {
  if (typeof value !== 'string' || !REF.test(value) || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    fail('CONVERSATION_INPUT_INVALID', `${label} must be one portable lowercase stable ref`);
  }
  return value;
};
const optRef = (value, label) => value == null ? null : ref(value, label);
const refs = (values, label, { allowEmpty = false } = {}) => {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) fail('CONVERSATION_INPUT_INVALID', `${label} must be an array of stable refs`);
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail('CONVERSATION_INPUT_INVALID', `${label} must not contain duplicates`);
  return Object.freeze(normalized);
};
const time = (value, label = 'createdAt') => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('CONVERSATION_INPUT_INVALID', `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
};
const sequence = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail('CONVERSATION_INPUT_INVALID', 'sequence must be a non-negative safe integer');
  return value;
};
const hash = (core, field) => Object.freeze({ ...core, [field]: semanticHash(core) });
const samePath = (a, b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  : path.resolve(a) === path.resolve(b);

function canonicalHome(home) {
  if (typeof home !== 'string' || !home) fail('CONVERSATION_HOME_INVALID', 'Vex Home path is required');
  const requested = path.resolve(home);
  let st;
  try { st = fs.lstatSync(requested); } catch (error) { fail('CONVERSATION_HOME_INVALID', 'Vex Home is unavailable', { cause: error.message }); }
  if (st.isSymbolicLink() || !st.isDirectory()) fail('CONVERSATION_HOME_INVALID', 'Vex Home must be one canonical directory');
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) fail('CONVERSATION_HOME_INVALID', 'Vex Home root is not canonical', { requested, real });
  return real;
}

function under(home, target) {
  const full = path.resolve(target);
  const rel = path.relative(home, full);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail('CONVERSATION_HOME_INVALID', 'conversation path escapes Vex Home');
  let cursor = home;
  for (const segment of rel.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const st = fs.lstatSync(cursor);
    if (st.isSymbolicLink()) fail('CONVERSATION_HOME_INVALID', 'conversation path traverses symbolic alias', { path: cursor });
    if (!samePath(fs.realpathSync.native(cursor), cursor)) fail('CONVERSATION_HOME_INVALID', 'conversation path traverses non-canonical alias', { path: cursor });
  }
  return full;
}

function pathsFor(home, channelRef) {
  const rootHome = canonicalHome(home);
  const channel = ref(channelRef, 'channelRef');
  const key = semanticHash({ schemaVersion: 'vexlife.conversation-storage/v1', channelRef: channel });
  const root = under(rootHome, path.join(rootHome, 'conversations', 'channels', key));
  return Object.freeze({
    home: rootHome,
    root,
    messages: under(rootHome, path.join(root, 'messages')),
    receipts: under(rootHome, path.join(root, 'receipts')),
    head: under(rootHome, path.join(root, 'current.json')),
    lock: under(rootHome, path.join(root, 'writer.lock'))
  });
}

function readJson(file, code = 'CONVERSATION_CORRUPT') {
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile()) fail(code, 'conversation durable object must be one regular file');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof ConversationStoreError) throw error;
    fail(code, 'conversation durable object could not be read', { cause: error.message });
  }
}

function writeExclusive(home, file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  under(home, path.dirname(file));
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try { process.kill(pid, 0); return 'ACTIVE'; } catch (error) {
    return error?.code === 'ESRCH' ? 'ABSENT' : error?.code === 'EPERM' ? 'ACTIVE' : 'UNVERIFIABLE';
  }
}

function acquire(paths, instanceRef, observedAt) {
  fs.mkdirSync(paths.root, { recursive: true });
  const lease = hash({
    schemaVersion: CONVERSATION_STORE_WRITER_SCHEMA,
    instanceRef: ref(instanceRef, 'instanceRef'),
    pid: process.pid,
    lockToken: crypto.randomUUID(),
    formedAt: time(observedAt, 'observedAt')
  }, 'leaseSha256');
  if (!writeExclusive(paths.home, paths.lock, lease)) {
    const existing = readJson(paths.lock, 'CONVERSATION_WRITER_CONFLICT');
    const state = processState(existing.pid);
    fail(
      state === 'ABSENT' ? 'CONVERSATION_WRITER_RECOVERY_REQUIRED' : 'CONVERSATION_WRITER_CONFLICT',
      state === 'ABSENT' ? 'abandoned conversation writer requires explicit recovery' : 'conversation writer is active or unverifiable'
    );
  }
  return Object.freeze({ path: paths.lock, token: lease.lockToken });
}

function release(lease) {
  if (!lease || !fs.existsSync(lease.path)) return true;
  try {
    const current = JSON.parse(fs.readFileSync(lease.path, 'utf8'));
    if (current.lockToken !== lease.token) return false;
    fs.unlinkSync(lease.path);
    return true;
  } catch {
    return false;
  }
}

function withWriter(paths, instanceRef, observedAt, fn) {
  const lease = acquire(paths, instanceRef, observedAt);
  let result;
  let caught = null;
  try { result = fn(); } catch (error) { caught = error; }
  const released = release(lease);
  if (!released && !caught) fail('CONVERSATION_WRITER_CONFLICT', 'conversation writer release could not be proven');
  if (caught) throw caught;
  return result;
}

function atomicHead(paths, value, faults = {}) {
  fs.mkdirSync(paths.root, { recursive: true });
  const tmp = `${paths.head}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (faults.failBeforeHeadRename === true) {
      fs.rmSync(tmp, { force: true });
      fail('CONVERSATION_HEAD_NOT_COMMITTED', 'simulated failure before conversation head rename');
    }
    fs.renameSync(tmp, paths.head);
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  }
}

function messagePath(paths, messageRef) {
  const identity = semanticHash({ schemaVersion: 'vexlife.conversation-message-address/v1', messageRef: ref(messageRef, 'messageRef') });
  return under(paths.home, path.join(paths.messages, `${identity}.json`));
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) fail('CONVERSATION_INPUT_INVALID', 'message envelope is required');
  const content = String(message.content ?? '');
  if (!content) fail('CONVERSATION_INPUT_INVALID', 'message content is required');
  const expectedContentHash = semanticHash(content);
  if (message.contentHash !== expectedContentHash) fail('CONVERSATION_INPUT_INVALID', 'message contentHash does not match exact content');
  const membershipGeneration = message.membershipGeneration == null ? null : sequence(message.membershipGeneration);
  return Object.freeze({
    messageRef: ref(message.messageRef, 'messageRef'),
    spaceRef: optRef(message.spaceRef, 'spaceRef'),
    threadRef: ref(message.threadRef, 'threadRef'),
    channelRef: ref(message.channelRef, 'channelRef'),
    speakerRef: ref(message.speakerRef, 'speakerRef'),
    recipientRefs: refs(message.recipientRefs, 'recipientRefs'),
    witnessRefs: refs(message.witnessRefs, 'witnessRefs'),
    membershipSnapshotRef: optRef(message.membershipSnapshotRef, 'membershipSnapshotRef'),
    membershipGeneration,
    sequence: sequence(message.sequence),
    content,
    contentHash: expectedContentHash,
    createdAt: time(message.createdAt)
  });
}

function validateEvent(event) {
  if (!event || event.schemaVersion !== CONVERSATION_STORE_EVENT_SCHEMA || !SHA.test(event.eventSha256 ?? '')) fail('CONVERSATION_CORRUPT', 'conversation event identity is invalid');
  const core = structuredClone(event);
  delete core.eventSha256;
  if (semanticHash(core) !== event.eventSha256) fail('CONVERSATION_CORRUPT', 'conversation event hash is invalid');
  const message = normalizeMessage(event);
  if (event.priorMessageRef != null) ref(event.priorMessageRef, 'priorMessageRef');
  if (event.priorEventSha256 != null && !SHA.test(event.priorEventSha256)) fail('CONVERSATION_CORRUPT', 'priorEventSha256 is invalid');
  return Object.freeze({ ...event, ...message });
}

function validateHead(head) {
  if (!head || head.schemaVersion !== CONVERSATION_STORE_HEAD_SCHEMA || !SHA.test(head.eventSha256 ?? '') || !SHA.test(head.headSha256 ?? '')) fail('CONVERSATION_CORRUPT', 'conversation head identity is invalid');
  const core = structuredClone(head);
  delete core.headSha256;
  if (semanticHash(core) !== head.headSha256) fail('CONVERSATION_CORRUPT', 'conversation head hash is invalid');
  ref(head.channelRef, 'channelRef');
  ref(head.messageRef, 'messageRef');
  sequence(head.sequence);
  time(head.updatedAt, 'updatedAt');
  return Object.freeze(head);
}

function currentHead(paths) {
  if (!fs.existsSync(paths.head)) return null;
  return validateHead(readJson(paths.head));
}

function readEvent(paths, messageRef) {
  const file = messagePath(paths, messageRef);
  if (!fs.existsSync(file)) return null;
  return validateEvent(readJson(file));
}

function resolveHeadEvent(paths, head) {
  const event = readEvent(paths, head.messageRef);
  if (
    !event
    || event.channelRef !== head.channelRef
    || event.sequence !== head.sequence
    || event.eventSha256 !== head.eventSha256
  ) fail('CONVERSATION_CORRUPT', 'conversation head does not resolve to the exact current event');
  return event;
}

function readPriorEvent(paths, cursor, channelRef) {
  if (cursor.priorMessageRef == null) {
    if (cursor.priorEventSha256 != null) fail('CONVERSATION_CORRUPT', 'root conversation event carries an impossible prior hash');
    return null;
  }
  const prior = readEvent(paths, cursor.priorMessageRef);
  if (!prior) fail('CONVERSATION_CORRUPT', 'conversation lineage references a missing prior event');
  if (prior.channelRef !== channelRef) fail('CONVERSATION_CORRUPT', 'conversation lineage crossed channel identity');
  if (prior.sequence !== cursor.sequence - 1) fail('CONVERSATION_CORRUPT', 'conversation lineage sequence is not contiguous');
  if (prior.eventSha256 !== cursor.priorEventSha256) fail('CONVERSATION_CORRUPT', 'conversation prior event hash does not match lineage');
  return prior;
}

function currentLineageContains(paths, head, expected) {
  let cursor = resolveHeadEvent(paths, head);
  while (cursor) {
    if (cursor.sequence === expected.sequence) {
      return cursor.messageRef === expected.messageRef && cursor.eventSha256 === expected.eventSha256;
    }
    if (cursor.sequence < expected.sequence) return false;
    cursor = readPriorEvent(paths, cursor, head.channelRef);
  }
  return false;
}

function sameCanonicalMessage(event, message) {
  const fields = ['messageRef','spaceRef','threadRef','channelRef','speakerRef','membershipSnapshotRef','membershipGeneration','sequence','content','contentHash','createdAt'];
  return fields.every((field) => event[field] === message[field])
    && JSON.stringify(event.recipientRefs) === JSON.stringify(message.recipientRefs)
    && JSON.stringify(event.witnessRefs) === JSON.stringify(message.witnessRefs);
}

function commitEventHead({ paths, event, instanceRef, committedAt, faults = {} }) {
  const nextHead = hash({
    schemaVersion: CONVERSATION_STORE_HEAD_SCHEMA,
    channelRef: event.channelRef,
    messageRef: event.messageRef,
    sequence: event.sequence,
    eventSha256: event.eventSha256,
    updatedAt: committedAt
  }, 'headSha256');

  atomicHead(paths, nextHead, faults);
  if (faults.failAfterHeadRenameBeforeReceipt === true) fail('CONVERSATION_RECEIPT_NOT_EMITTED', 'simulated failure after conversation head rename');

  const receipt = hash({
    schemaVersion: CONVERSATION_STORE_RECEIPT_SCHEMA,
    channelRef: event.channelRef,
    messageRef: event.messageRef,
    sequence: event.sequence,
    eventSha256: event.eventSha256,
    headSha256: nextHead.headSha256,
    instanceRef: ref(instanceRef, 'instanceRef'),
    committedAt,
    durable: true
  }, 'receiptSha256');
  writeExclusive(paths.home, under(paths.home, path.join(paths.receipts, `${receipt.receiptSha256}.json`)), receipt);

  return Object.freeze({ state: 'APPENDED', event, head: nextHead, receipt });
}

function reconcileExistingEvent({ paths, existing, canonical, instanceRef, committedAt, faults }) {
  if (!sameCanonicalMessage(existing, canonical)) fail('CONVERSATION_MESSAGE_CONFLICT', 'messageRef already exists with different canonical content');
  const head = currentHead(paths);
  if (!head) {
    if (existing.sequence !== 0 || existing.priorMessageRef != null || existing.priorEventSha256 != null) {
      fail('CONVERSATION_CORRUPT', 'orphan conversation event cannot establish a root head');
    }
    return commitEventHead({ paths, event: existing, instanceRef, committedAt, faults });
  }

  resolveHeadEvent(paths, head);
  if (head.messageRef === existing.messageRef) {
    if (head.eventSha256 !== existing.eventSha256 || head.sequence !== existing.sequence || head.channelRef !== existing.channelRef) {
      fail('CONVERSATION_CORRUPT', 'current head conflicts with the existing message event');
    }
    return Object.freeze({ state: 'IDEMPOTENT_CURRENT', event: existing, head });
  }

  if (existing.sequence === head.sequence + 1) {
    if (
      existing.channelRef !== head.channelRef
      || existing.priorMessageRef !== head.messageRef
      || existing.priorEventSha256 !== head.eventSha256
    ) fail('CONVERSATION_CORRUPT', 'orphan conversation event does not extend the exact current head');
    return commitEventHead({ paths, event: existing, instanceRef, committedAt, faults });
  }

  if (existing.sequence <= head.sequence && currentLineageContains(paths, head, existing)) {
    return Object.freeze({ state: 'IDEMPOTENT_CURRENT', event: existing, head });
  }
  fail('CONVERSATION_CORRUPT', 'existing message event is not reachable from the exact current lineage');
}

export function appendConversationMessage({ home, message, instanceRef, observedAt = message?.createdAt, faults = {} } = {}) {
  const canonical = normalizeMessage(message);
  const paths = pathsFor(home, canonical.channelRef);
  const at = time(observedAt, 'observedAt');
  return withWriter(paths, instanceRef, at, () => {
    const existing = readEvent(paths, canonical.messageRef);
    if (existing) return reconcileExistingEvent({ paths, existing, canonical, instanceRef, committedAt: at, faults });

    const head = currentHead(paths);
    if (head) resolveHeadEvent(paths, head);
    const expectedSequence = head ? head.sequence + 1 : 0;
    if (canonical.sequence !== expectedSequence) fail('CONVERSATION_STALE', `message sequence ${canonical.sequence} does not equal expected ${expectedSequence}`);

    const event = hash({
      schemaVersion: CONVERSATION_STORE_EVENT_SCHEMA,
      ...canonical,
      priorMessageRef: head?.messageRef ?? null,
      priorEventSha256: head?.eventSha256 ?? null
    }, 'eventSha256');

    fs.mkdirSync(paths.messages, { recursive: true });
    fs.mkdirSync(paths.receipts, { recursive: true });
    const file = messagePath(paths, canonical.messageRef);
    if (!writeExclusive(paths.home, file, event)) {
      const stored = readEvent(paths, canonical.messageRef);
      if (!stored || stored.eventSha256 !== event.eventSha256) fail('CONVERSATION_CORRUPT', 'message address collision');
    }

    return commitEventHead({ paths, event, instanceRef, committedAt: at, faults });
  });
}

export function readConversationMessage({ home, channelRef, messageRef } = {}) {
  const paths = pathsFor(home, channelRef);
  const event = readEvent(paths, messageRef);
  return Object.freeze({ state: event ? 'CURRENT' : 'NOT_FOUND', event });
}

export function readConversationChannel({ home, channelRef, limit = 100 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) fail('CONVERSATION_INPUT_INVALID', 'limit must be 1..1000');
  const paths = pathsFor(home, channelRef);
  const head = currentHead(paths);
  if (!head) return Object.freeze({ state: 'EMPTY', head: null, messages: Object.freeze([]), truncated: false });

  const reversed = [];
  let cursor = resolveHeadEvent(paths, head);
  while (cursor && reversed.length < limit) {
    reversed.push(cursor);
    cursor = readPriorEvent(paths, cursor, head.channelRef);
  }
  const truncated = cursor != null;
  const messages = Object.freeze(reversed.reverse());
  return Object.freeze({ state: 'CURRENT', head, messages, truncated });
}

export function exportConversationChannel({ home, channelRef, limit = 100 } = {}) {
  const projection = readConversationChannel({ home, channelRef, limit });
  return Object.freeze({
    schemaVersion: CONVERSATION_STORE_EXPORT_SCHEMA,
    channelRef: ref(channelRef, 'channelRef'),
    state: projection.state,
    head: projection.head,
    messages: projection.messages.map((event) => Object.freeze({
      messageRef: event.messageRef,
      spaceRef: event.spaceRef,
      threadRef: event.threadRef,
      channelRef: event.channelRef,
      speakerRef: event.speakerRef,
      recipientRefs: event.recipientRefs,
      witnessRefs: event.witnessRefs,
      membershipSnapshotRef: event.membershipSnapshotRef,
      membershipGeneration: event.membershipGeneration,
      sequence: event.sequence,
      content: event.content,
      contentHash: event.contentHash,
      createdAt: event.createdAt,
      eventSha256: event.eventSha256
    })),
    truncated: projection.truncated,
    contentSafe: true
  });
}

export function recoverAbandonedConversationWriter({ home, channelRef, expectedInstanceRef } = {}) {
  const paths = pathsFor(home, channelRef);
  if (!fs.existsSync(paths.lock)) return Object.freeze({ state: 'NO_WRITER' });
  const lease = readJson(paths.lock, 'CONVERSATION_WRITER_CONFLICT');
  if (ref(lease.instanceRef, 'writer instanceRef') !== ref(expectedInstanceRef, 'expectedInstanceRef')) fail('CONVERSATION_WRITER_CONFLICT', 'writer recovery identity mismatch');
  if (processState(lease.pid) !== 'ABSENT') fail('CONVERSATION_WRITER_CONFLICT', 'writer is active or unverifiable');
  fs.unlinkSync(paths.lock);
  return Object.freeze({ state: 'WRITER_RECOVERED', instanceRef: lease.instanceRef });
}

// [VXG RealForever]
