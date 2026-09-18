import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';

export const RELATIONSHIP_CLASSES = Object.freeze(['FRIEND', 'FAMILY', 'COLLABORATOR', 'OTHER']);
export const RELATIONSHIP_STATUSES = Object.freeze(['ACTIVE', 'BLOCKED', 'REVOKED', 'WITHDRAWN', 'DISCONNECTED']);
export const RELATIONSHIP_TRANSITION_ACTIONS = Object.freeze([
  'BLOCK',
  'REVOKE',
  'WITHDRAW',
  'DISCONNECT',
  'RECONNECT',
  'UPDATE_CURRENTNESS',
  'TOMBSTONE'
]);

export const RELATIONSHIP_RECORD_SCHEMA = 'vexlife.relationship-record/v1';
export const RELATIONSHIP_TRANSITION_SCHEMA = 'vexlife.relationship-transition/v1';
export const RELATIONSHIP_HEAD_SCHEMA = 'vexlife.relationship-head/v1';
export const RELATIONSHIP_COMMIT_RECEIPT_SCHEMA = 'vexlife.relationship-commit-receipt/v1';
export const RELATIONSHIP_WRITER_SCHEMA = 'vexlife.relationship-writer/v1';
export const RELATIONSHIPS_STORE_SCHEMA = 'vexlife.relationships-store/v1';
export const RELATIONSHIP_EXPORT_SCHEMA = 'vexlife.relationship-export/v1';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const IPV4_CANDIDATE = /(?:^|[^0-9])(\d{1,3}(?:\.\d{1,3}){3})(?:$|[^0-9])/gu;

const CREATE_INPUT_KEYS = new Set([
  'home',
  'localParticipantRef',
  'localStateRootRef',
  'counterpartParticipantRef',
  'counterpartCurrentKeyRef',
  'localRelationshipClass',
  'invitationRef',
  'invitationCurrentnessRef',
  'observedAt',
  'instanceRef',
  'lastAcceptedPeerCurrentnessRef',
  'routeRef',
  'sessionGeneration',
  'deliveryObservationRef',
  'faults'
]);
const OWNER_INPUT_KEYS = new Set([
  'home',
  'localParticipantRef',
  'localStateRootRef',
  'counterpartParticipantRef'
]);
const TRANSITION_INPUT_KEYS = new Set([
  ...OWNER_INPUT_KEYS,
  'action',
  'expectedRevision',
  'observedAt',
  'instanceRef',
  'counterpartCurrentKeyRef',
  'invitationCurrentnessRef',
  'lastAcceptedPeerCurrentnessRef',
  'routeRef',
  'sessionGeneration',
  'deliveryObservationRef',
  'recoveryOrTombstoneRef',
  'faults'
]);
const FAULT_KEYS = new Set(['failBeforeHeadRename', 'failAfterHeadRenameBeforeReceipt']);
const RECORD_KEYS = new Set([
  'schemaVersion',
  'relationshipRef',
  'localParticipantRef',
  'localStateRootRef',
  'counterpartParticipantRef',
  'counterpartCurrentKeyRef',
  'localRelationshipClass',
  'invitationRef',
  'invitationCurrentnessRef',
  'status',
  'createdAt',
  'updatedAt',
  'revision',
  'priorRecordSha256',
  'transitionRef',
  'transitionSha256',
  'recoveryOrTombstoneRef',
  'lastAcceptedPeerCurrentnessRef',
  'routeRef',
  'sessionGeneration',
  'deliveryObservationRef',
  'tombstoned',
  'localDirectionalOnly',
  'counterpartClaimIndependent',
  'semanticAcknowledged',
  'reciprocalFriendshipAsserted',
  'recordSha256'
]);
const TRANSITION_KEYS = new Set([
  'schemaVersion',
  'relationshipRef',
  'localParticipantRef',
  'localStateRootRef',
  'counterpartParticipantRef',
  'action',
  'priorRevision',
  'nextRevision',
  'priorRecordSha256',
  'priorTransitionSha256',
  'priorStatus',
  'nextStatus',
  'localRelationshipClass',
  'observedAt',
  'instanceRef',
  'counterpartCurrentKeyRef',
  'invitationCurrentnessRef',
  'lastAcceptedPeerCurrentnessRef',
  'routeRef',
  'sessionGeneration',
  'deliveryObservationRef',
  'recoveryOrTombstoneRef',
  'tombstoned',
  'semanticAcknowledgementCreated',
  'reciprocalFriendshipCreated',
  'transitionRef',
  'transitionSha256'
]);
const HEAD_KEYS = new Set([
  'schemaVersion',
  'relationshipRef',
  'localParticipantRef',
  'localStateRootRef',
  'counterpartParticipantRef',
  'revision',
  'recordSha256',
  'transitionSha256',
  'updatedAt',
  'tombstoned',
  'headSha256'
]);
const WRITER_KEYS = new Set([
  'schemaVersion',
  'ownerFingerprint',
  'localParticipantRef',
  'localStateRootRef',
  'instanceRef',
  'pid',
  'lockToken',
  'formedAt',
  'leaseSha256'
]);

export class RelationshipsStoreError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'RelationshipsStoreError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new RelationshipsStoreError(code, message, details);
}

function requireExactObjectKeys(value, admitted, label, code = 'RELATIONSHIP_INPUT_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be one object`);
  }
  const extra = Object.keys(value).find((key) => !admitted.has(key));
  if (extra) fail(code, `${label} contains unadmitted field ${extra}`);
  return value;
}

function containsIpv4Literal(value) {
  IPV4_CANDIDATE.lastIndex = 0;
  let match;
  while ((match = IPV4_CANDIDATE.exec(value)) !== null) {
    if (match[1].split('.').every((part) => Number(part) <= 255)) return true;
  }
  return false;
}

function requireRef(value, label, code = 'RELATIONSHIP_INPUT_INVALID') {
  if (
    typeof value !== 'string' ||
    !REF.test(value) ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    containsIpv4Literal(value)
  ) {
    fail(code, `${label} must be one lowercase portable content-safe canonical ref`);
  }
  return value;
}

function optionalRef(value, label) {
  return value === undefined || value === null ? null : requireRef(value, label);
}

function requireCanonicalTimestamp(value, label = 'observedAt', code = 'RELATIONSHIP_INPUT_INVALID') {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail(code, `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
}

function optionalSessionGeneration(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('RELATIONSHIP_INPUT_INVALID', 'sessionGeneration must be a non-negative safe integer');
  }
  return value;
}

function validateFaults(value) {
  if (value === undefined || value === null) return Object.freeze({});
  requireExactObjectKeys(value, FAULT_KEYS, 'faults');
  for (const [key, enabled] of Object.entries(value)) {
    if (typeof enabled !== 'boolean') fail('RELATIONSHIP_INPUT_INVALID', `faults.${key} must be boolean`);
  }
  return Object.freeze({ ...value });
}

function samePath(left, right) {
  const a = path.normalize(path.resolve(left));
  const b = path.normalize(path.resolve(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function canonicalHomeRoot(home) {
  if (typeof home !== 'string' || home.length === 0) {
    fail('RELATIONSHIP_HOME_IDENTITY_MISMATCH', 'Vex Home path is required');
  }
  const requested = path.resolve(home);
  let stat;
  try {
    stat = fs.lstatSync(requested);
  } catch (error) {
    fail('RELATIONSHIP_HOME_IDENTITY_MISMATCH', 'Vex Home is unavailable', { cause: error.message });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('RELATIONSHIP_HOME_IDENTITY_MISMATCH', 'Vex Home must be one canonical directory');
  }
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) {
    fail('RELATIONSHIP_HOME_IDENTITY_MISMATCH', 'Vex Home root is not canonical', { requested, real });
  }
  return real;
}

function requirePathUnderHome(home, target) {
  const resolved = path.resolve(target);
  const relative = path.relative(home, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('RELATIONSHIP_HOME_IDENTITY_MISMATCH', 'Relationships path escapes Vex Home', { target: resolved });
  }

  let cursor = home;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      fail('RELATIONSHIP_HOME_IDENTITY_MISMATCH', 'Relationships path traverses a symbolic alias', { path: cursor });
    }
    const real = fs.realpathSync.native(cursor);
    if (!samePath(real, cursor)) {
      fail('RELATIONSHIP_HOME_IDENTITY_MISMATCH', 'Relationships path traverses a non-canonical alias', {
        path: cursor,
        real
      });
    }
  }
  return resolved;
}

function ownerFingerprint(localParticipantRef, localStateRootRef) {
  return semanticHash({
    schemaVersion: 'vexlife.relationship-owner/v1',
    localParticipantRef,
    localStateRootRef
  });
}

export function relationshipRefFor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('RELATIONSHIP_INPUT_INVALID', 'relationship identity input must be one object');
  }
  const localParticipantRef = requireRef(value.localParticipantRef, 'localParticipantRef');
  const counterpartParticipantRef = requireRef(value.counterpartParticipantRef, 'counterpartParticipantRef');
  if (localParticipantRef === counterpartParticipantRef) {
    fail('RELATIONSHIP_SELF_REFERENCE', 'local and counterpart participants must differ');
  }
  const identity = {
    schemaVersion: 'vexlife.relationship-identity/v1',
    direction: 'LOCAL_TO_COUNTERPART',
    localParticipantRef,
    counterpartParticipantRef
  };
  return `relationship.vexlife.local.${semanticHash(identity).slice(0, 32)}`;
}

function storePaths(owner) {
  const home = canonicalHomeRoot(owner.home);
  const ownerSha256 = ownerFingerprint(owner.localParticipantRef, owner.localStateRootRef);
  const root = requirePathUnderHome(home, path.join(home, 'relationships', ownerSha256));
  return Object.freeze({
    home,
    root,
    records: requirePathUnderHome(home, path.join(root, 'records')),
    transitions: requirePathUnderHome(home, path.join(root, 'transitions')),
    receipts: requirePathUnderHome(home, path.join(root, 'receipts')),
    heads: requirePathUnderHome(home, path.join(root, 'heads')),
    lock: requirePathUnderHome(home, path.join(root, 'writer.lock'))
  });
}

function headPath(paths, relationshipRef) {
  return requirePathUnderHome(paths.home, path.join(paths.heads, `${requireRef(relationshipRef, 'relationshipRef')}.json`));
}

function addressedPath(paths, directory, sha256) {
  if (!SHA256.test(sha256 ?? '')) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'addressed SHA-256 is invalid');
  }
  return requirePathUnderHome(paths.home, path.join(directory, `${sha256}.json`));
}

function withSemanticHash(core, field) {
  return Object.freeze({ ...core, [field]: semanticHash(core) });
}

function validateSemanticHash(value, schemaVersion, hashField, exactKeys, label) {
  requireExactObjectKeys(value, exactKeys, label, 'RELATIONSHIP_RECEIPT_CORRUPT');
  if (value.schemaVersion !== schemaVersion || !SHA256.test(value[hashField] ?? '')) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', `${label} identity is invalid`);
  }
  const core = structuredClone(value);
  delete core[hashField];
  if (semanticHash(core) !== value[hashField]) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', `${label} content hash is invalid`);
  }
  return value;
}

function readJson(file, code = 'RELATIONSHIP_RECEIPT_CORRUPT', label = 'relationship durable file') {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail(code, `${label} must be one regular file`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof RelationshipsStoreError) throw error;
    fail(code, `${label} could not be read`, { cause: error.message });
  }
}

function writeExclusive(paths, file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  requirePathUnderHome(paths.home, path.dirname(file));
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    return 'CREATED';
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    if (error?.code === 'EEXIST') return 'EXISTS';
    throw error;
  }
}

function writeAddressed(paths, directory, value, hashField, validator, label) {
  const file = addressedPath(paths, directory, value[hashField]);
  const state = writeExclusive(paths, file, value);
  if (state === 'EXISTS') {
    const existing = validator(readJson(file, 'RELATIONSHIP_RECEIPT_CORRUPT', label));
    if (semanticHash(existing) !== semanticHash(value)) {
      fail('RELATIONSHIP_RECEIPT_CORRUPT', `${label} content-address collision`);
    }
  }
  return file;
}

function atomicWriteHead(paths, file, value, faults = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  requirePathUnderHome(paths.home, path.dirname(file));
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let fd = null;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (faults.failBeforeHeadRename === true) {
      fs.rmSync(temporary, { force: true });
      fail('RELATIONSHIP_HEAD_NOT_COMMITTED', 'simulated failure before atomic relationship head rename');
    }
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try {
    process.kill(pid, 0);
    return 'ACTIVE';
  } catch (error) {
    if (error?.code === 'ESRCH') return 'ABSENT';
    if (error?.code === 'EPERM') return 'ACTIVE';
    return 'UNVERIFIABLE';
  }
}

function validateWriterLease(value) {
  validateSemanticHash(value, RELATIONSHIP_WRITER_SCHEMA, 'leaseSha256', WRITER_KEYS, 'relationship writer lease');
  requireRef(value.localParticipantRef, 'writer localParticipantRef', 'RELATIONSHIP_RECEIPT_CORRUPT');
  requireRef(value.localStateRootRef, 'writer localStateRootRef', 'RELATIONSHIP_RECEIPT_CORRUPT');
  requireRef(value.instanceRef, 'writer instanceRef', 'RELATIONSHIP_RECEIPT_CORRUPT');
  requireCanonicalTimestamp(value.formedAt, 'writer formedAt', 'RELATIONSHIP_RECEIPT_CORRUPT');
  if (!SHA256.test(value.ownerFingerprint ?? '') || typeof value.lockToken !== 'string' || value.lockToken.length < 16) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship writer lease fields are invalid');
  }
  return value;
}

function acquireWriter(paths, input) {
  fs.mkdirSync(paths.root, { recursive: true });
  const core = {
    schemaVersion: RELATIONSHIP_WRITER_SCHEMA,
    ownerFingerprint: ownerFingerprint(input.localParticipantRef, input.localStateRootRef),
    localParticipantRef: input.localParticipantRef,
    localStateRootRef: input.localStateRootRef,
    instanceRef: requireRef(input.instanceRef, 'instanceRef'),
    pid: process.pid,
    lockToken: crypto.randomUUID(),
    formedAt: requireCanonicalTimestamp(input.observedAt)
  };
  const lease = withSemanticHash(core, 'leaseSha256');
  const state = writeExclusive(paths, paths.lock, lease);
  if (state === 'EXISTS') {
    let existing;
    try {
      existing = validateWriterLease(readJson(paths.lock, 'RELATIONSHIP_WRITER_CONFLICT', 'relationship writer lease'));
    } catch {
      fail('RELATIONSHIP_WRITER_CONFLICT', 'relationship writer lease is unverifiable');
    }
    const ownerState = processState(existing.pid);
    fail(
      ownerState === 'ABSENT' ? 'RELATIONSHIP_WRITER_RECOVERY_REQUIRED' : 'RELATIONSHIP_WRITER_CONFLICT',
      ownerState === 'ABSENT'
        ? 'abandoned relationship writer requires explicit recovery'
        : 'relationship writer is active or unverifiable'
    );
  }
  return Object.freeze({ path: paths.lock, token: lease.lockToken });
}

function releaseWriter(lease) {
  if (!lease || !fs.existsSync(lease.path)) return true;
  try {
    const value = JSON.parse(fs.readFileSync(lease.path, 'utf8'));
    if (value.lockToken !== lease.token) return false;
    fs.unlinkSync(lease.path);
    return true;
  } catch {
    return false;
  }
}

function normalizeOwnerInput(value, admittedKeys = OWNER_INPUT_KEYS) {
  requireExactObjectKeys(value, admittedKeys, 'relationship owner input');
  const owner = Object.freeze({
    home: canonicalHomeRoot(value.home),
    localParticipantRef: requireRef(value.localParticipantRef, 'localParticipantRef'),
    localStateRootRef: requireRef(value.localStateRootRef, 'localStateRootRef'),
    counterpartParticipantRef: requireRef(value.counterpartParticipantRef, 'counterpartParticipantRef')
  });
  relationshipRefFor(owner);
  return owner;
}

function normalizeCreateInput(value) {
  requireExactObjectKeys(value, CREATE_INPUT_KEYS, 'create input');
  const owner = normalizeOwnerInput(value, CREATE_INPUT_KEYS);
  if (!RELATIONSHIP_CLASSES.includes(value.localRelationshipClass)) {
    fail('RELATIONSHIP_INPUT_INVALID', 'localRelationshipClass is not admitted');
  }
  return Object.freeze({
    ...owner,
    counterpartCurrentKeyRef: requireRef(value.counterpartCurrentKeyRef, 'counterpartCurrentKeyRef'),
    localRelationshipClass: value.localRelationshipClass,
    invitationRef: requireRef(value.invitationRef, 'invitationRef'),
    invitationCurrentnessRef: requireRef(value.invitationCurrentnessRef, 'invitationCurrentnessRef'),
    observedAt: requireCanonicalTimestamp(value.observedAt),
    instanceRef: requireRef(value.instanceRef, 'instanceRef'),
    lastAcceptedPeerCurrentnessRef: optionalRef(value.lastAcceptedPeerCurrentnessRef, 'lastAcceptedPeerCurrentnessRef'),
    routeRef: optionalRef(value.routeRef, 'routeRef'),
    sessionGeneration: optionalSessionGeneration(value.sessionGeneration),
    deliveryObservationRef: optionalRef(value.deliveryObservationRef, 'deliveryObservationRef'),
    faults: validateFaults(value.faults)
  });
}

function normalizeTransitionInput(value) {
  requireExactObjectKeys(value, TRANSITION_INPUT_KEYS, 'transition input');
  const owner = normalizeOwnerInput(value, TRANSITION_INPUT_KEYS);
  if (!RELATIONSHIP_TRANSITION_ACTIONS.includes(value.action)) {
    fail('RELATIONSHIP_INPUT_INVALID', 'transition action is not admitted');
  }
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) {
    fail('RELATIONSHIP_INPUT_INVALID', 'expectedRevision must be a non-negative safe integer');
  }
  return Object.freeze({
    ...owner,
    action: value.action,
    expectedRevision: value.expectedRevision,
    observedAt: requireCanonicalTimestamp(value.observedAt),
    instanceRef: requireRef(value.instanceRef, 'instanceRef'),
    counterpartCurrentKeyRef: optionalRef(value.counterpartCurrentKeyRef, 'counterpartCurrentKeyRef'),
    invitationCurrentnessRef: optionalRef(value.invitationCurrentnessRef, 'invitationCurrentnessRef'),
    lastAcceptedPeerCurrentnessRef: optionalRef(value.lastAcceptedPeerCurrentnessRef, 'lastAcceptedPeerCurrentnessRef'),
    routeRef: optionalRef(value.routeRef, 'routeRef'),
    sessionGeneration: optionalSessionGeneration(value.sessionGeneration),
    deliveryObservationRef: optionalRef(value.deliveryObservationRef, 'deliveryObservationRef'),
    recoveryOrTombstoneRef: optionalRef(value.recoveryOrTombstoneRef, 'recoveryOrTombstoneRef'),
    faults: validateFaults(value.faults)
  });
}

function persistedEffects(mutated) {
  return Object.freeze({
    relationshipMutationPerformed: mutated,
    canonicalRelationshipPersisted: true,
    networkEffectPerformed: false,
    providerEffectPerformed: false,
    participantEffectPerformed: false,
    HomeLayoutEffectPerformed: false,
    MemoryEffectPerformed: false,
    modelRuntimePerformed: false,
    publicationPerformed: false,
    publicSearchPerformed: false,
    semanticAcknowledgementCreated: false,
    reciprocalFriendshipCreated: false
  });
}

function formTransition(core) {
  const transitionRef = `transition.relationship.vexlife.${semanticHash(core).slice(0, 32)}`;
  return withSemanticHash({ ...core, transitionRef }, 'transitionSha256');
}

function expectedStatusForAction(action, priorStatus) {
  switch (action) {
    case 'BLOCK': return 'BLOCKED';
    case 'REVOKE': return 'REVOKED';
    case 'WITHDRAW': return 'WITHDRAWN';
    case 'DISCONNECT': return 'DISCONNECTED';
    case 'RECONNECT': return 'ACTIVE';
    case 'UPDATE_CURRENTNESS': return priorStatus;
    case 'TOMBSTONE': return priorStatus;
    default: return null;
  }
}

function validateTransition(value, relationshipRef) {
  validateSemanticHash(
    value,
    RELATIONSHIP_TRANSITION_SCHEMA,
    'transitionSha256',
    TRANSITION_KEYS,
    'relationship transition'
  );
  const core = structuredClone(value);
  delete core.transitionRef;
  delete core.transitionSha256;
  const expectedRef = `transition.relationship.vexlife.${semanticHash(core).slice(0, 32)}`;
  if (value.transitionRef !== expectedRef || value.relationshipRef !== relationshipRef) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship transition identity is invalid');
  }
  for (const [field, label] of [
    ['localParticipantRef', 'transition localParticipantRef'],
    ['localStateRootRef', 'transition localStateRootRef'],
    ['counterpartParticipantRef', 'transition counterpartParticipantRef'],
    ['instanceRef', 'transition instanceRef'],
    ['counterpartCurrentKeyRef', 'transition counterpartCurrentKeyRef'],
    ['invitationCurrentnessRef', 'transition invitationCurrentnessRef']
  ]) requireRef(value[field], label, 'RELATIONSHIP_RECEIPT_CORRUPT');
  for (const [field, label] of [
    ['lastAcceptedPeerCurrentnessRef', 'transition lastAcceptedPeerCurrentnessRef'],
    ['routeRef', 'transition routeRef'],
    ['deliveryObservationRef', 'transition deliveryObservationRef'],
    ['recoveryOrTombstoneRef', 'transition recoveryOrTombstoneRef']
  ]) {
    if (value[field] !== null) requireRef(value[field], label, 'RELATIONSHIP_RECEIPT_CORRUPT');
  }
  if (value.sessionGeneration !== null && (!Number.isSafeInteger(value.sessionGeneration) || value.sessionGeneration < 0)) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'transition sessionGeneration is invalid');
  }
  requireCanonicalTimestamp(value.observedAt, 'transition observedAt', 'RELATIONSHIP_RECEIPT_CORRUPT');
  if (!RELATIONSHIP_CLASSES.includes(value.localRelationshipClass)) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'transition relationship class is invalid');
  }
  if (value.semanticAcknowledgementCreated !== false || value.reciprocalFriendshipCreated !== false) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'transition manufactures forbidden semantic truth');
  }

  if (value.action === 'CREATE') {
    if (
      value.priorRevision !== null || value.nextRevision !== 0 ||
      value.priorRecordSha256 !== null || value.priorTransitionSha256 !== null ||
      value.priorStatus !== null || value.nextStatus !== 'ACTIVE' || value.tombstoned !== false
    ) {
      fail('RELATIONSHIP_RECEIPT_CORRUPT', 'create transition chronology is invalid');
    }
    return value;
  }

  if (!RELATIONSHIP_TRANSITION_ACTIONS.includes(value.action)) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'transition action is invalid');
  }
  if (
    !Number.isSafeInteger(value.priorRevision) || value.priorRevision < 0 ||
    value.nextRevision !== value.priorRevision + 1 ||
    !SHA256.test(value.priorRecordSha256 ?? '') ||
    !SHA256.test(value.priorTransitionSha256 ?? '') ||
    !RELATIONSHIP_STATUSES.includes(value.priorStatus) ||
    !RELATIONSHIP_STATUSES.includes(value.nextStatus)
  ) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'transition chronology is invalid');
  }
  const expectedStatus = expectedStatusForAction(value.action, value.priorStatus);
  if (value.nextStatus !== expectedStatus) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'transition action/status binding is invalid');
  }
  if (value.action === 'DISCONNECT' && value.priorStatus !== 'ACTIVE') {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'DISCONNECT transition must descend from ACTIVE');
  }
  if (value.action === 'RECONNECT' && value.priorStatus !== 'DISCONNECTED') {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'RECONNECT transition must descend from DISCONNECTED');
  }
  if (value.action === 'TOMBSTONE' ? value.tombstoned !== true : value.tombstoned !== false) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'transition tombstone binding is invalid');
  }
  return value;
}

function validateRecord(value, relationshipRef) {
  validateSemanticHash(value, RELATIONSHIP_RECORD_SCHEMA, 'recordSha256', RECORD_KEYS, 'relationship record');
  if (value.relationshipRef !== relationshipRef) fail('RELATIONSHIP_RECEIPT_CORRUPT', 'record relationship identity is invalid');
  for (const [field, label] of [
    ['localParticipantRef', 'record localParticipantRef'],
    ['localStateRootRef', 'record localStateRootRef'],
    ['counterpartParticipantRef', 'record counterpartParticipantRef'],
    ['counterpartCurrentKeyRef', 'record counterpartCurrentKeyRef'],
    ['invitationRef', 'record invitationRef'],
    ['invitationCurrentnessRef', 'record invitationCurrentnessRef'],
    ['transitionRef', 'record transitionRef']
  ]) requireRef(value[field], label, 'RELATIONSHIP_RECEIPT_CORRUPT');
  for (const [field, label] of [
    ['recoveryOrTombstoneRef', 'record recoveryOrTombstoneRef'],
    ['lastAcceptedPeerCurrentnessRef', 'record lastAcceptedPeerCurrentnessRef'],
    ['routeRef', 'record routeRef'],
    ['deliveryObservationRef', 'record deliveryObservationRef']
  ]) {
    if (value[field] !== null) requireRef(value[field], label, 'RELATIONSHIP_RECEIPT_CORRUPT');
  }
  if (!RELATIONSHIP_CLASSES.includes(value.localRelationshipClass) || !RELATIONSHIP_STATUSES.includes(value.status)) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship record class/status is invalid');
  }
  requireCanonicalTimestamp(value.createdAt, 'record createdAt', 'RELATIONSHIP_RECEIPT_CORRUPT');
  requireCanonicalTimestamp(value.updatedAt, 'record updatedAt', 'RELATIONSHIP_RECEIPT_CORRUPT');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !SHA256.test(value.transitionSha256 ?? '')) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship record revision/transition is invalid');
  }
  if (value.priorRecordSha256 !== null && !SHA256.test(value.priorRecordSha256)) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship record priorRecordSha256 is invalid');
  }
  if (value.sessionGeneration !== null && (!Number.isSafeInteger(value.sessionGeneration) || value.sessionGeneration < 0)) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship record sessionGeneration is invalid');
  }
  if (
    typeof value.tombstoned !== 'boolean' ||
    value.localDirectionalOnly !== true ||
    value.counterpartClaimIndependent !== true ||
    value.semanticAcknowledged !== false ||
    value.reciprocalFriendshipAsserted !== false
  ) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship record non-collapse truth is invalid');
  }
  return value;
}

function validateHead(value, relationshipRef) {
  validateSemanticHash(value, RELATIONSHIP_HEAD_SCHEMA, 'headSha256', HEAD_KEYS, 'relationship head');
  if (
    value.relationshipRef !== relationshipRef ||
    !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !SHA256.test(value.recordSha256 ?? '') || !SHA256.test(value.transitionSha256 ?? '') ||
    typeof value.tombstoned !== 'boolean'
  ) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship head fields are invalid');
  }
  requireRef(value.localParticipantRef, 'head localParticipantRef', 'RELATIONSHIP_RECEIPT_CORRUPT');
  requireRef(value.localStateRootRef, 'head localStateRootRef', 'RELATIONSHIP_RECEIPT_CORRUPT');
  requireRef(value.counterpartParticipantRef, 'head counterpartParticipantRef', 'RELATIONSHIP_RECEIPT_CORRUPT');
  requireCanonicalTimestamp(value.updatedAt, 'head updatedAt', 'RELATIONSHIP_RECEIPT_CORRUPT');
  return value;
}

function currentRelationship(paths, owner) {
  const relationshipRef = relationshipRefFor(owner);
  const file = headPath(paths, relationshipRef);
  if (!fs.existsSync(file)) fail('RELATIONSHIP_NOT_FOUND', 'relationship not found');
  const head = validateHead(readJson(file, 'RELATIONSHIP_RECEIPT_CORRUPT', 'relationship head'), relationshipRef);
  if (
    head.localParticipantRef !== owner.localParticipantRef ||
    head.localStateRootRef !== owner.localStateRootRef ||
    head.counterpartParticipantRef !== owner.counterpartParticipantRef
  ) {
    fail('RELATIONSHIP_OWNER_MISMATCH', 'relationship head does not belong to the requested local owner');
  }

  const record = validateRecord(
    readJson(addressedPath(paths, paths.records, head.recordSha256), 'RELATIONSHIP_RECEIPT_CORRUPT', 'relationship record'),
    relationshipRef
  );
  if (
    record.localParticipantRef !== owner.localParticipantRef ||
    record.localStateRootRef !== owner.localStateRootRef ||
    record.counterpartParticipantRef !== owner.counterpartParticipantRef ||
    record.recordSha256 !== head.recordSha256 ||
    record.revision !== head.revision ||
    record.transitionSha256 !== head.transitionSha256 ||
    record.tombstoned !== head.tombstoned
  ) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship head/record binding is invalid');
  }

  const transition = validateTransition(
    readJson(addressedPath(paths, paths.transitions, record.transitionSha256), 'RELATIONSHIP_RECEIPT_CORRUPT', 'relationship transition'),
    relationshipRef
  );
  if (
    transition.localParticipantRef !== owner.localParticipantRef ||
    transition.localStateRootRef !== owner.localStateRootRef ||
    transition.counterpartParticipantRef !== owner.counterpartParticipantRef ||
    transition.transitionSha256 !== record.transitionSha256 ||
    transition.nextRevision !== record.revision ||
    transition.nextStatus !== record.status ||
    transition.localRelationshipClass !== record.localRelationshipClass ||
    transition.transitionRef !== record.transitionRef ||
    transition.priorRecordSha256 !== record.priorRecordSha256 ||
    transition.counterpartCurrentKeyRef !== record.counterpartCurrentKeyRef ||
    transition.invitationCurrentnessRef !== record.invitationCurrentnessRef ||
    transition.lastAcceptedPeerCurrentnessRef !== record.lastAcceptedPeerCurrentnessRef ||
    transition.routeRef !== record.routeRef ||
    transition.sessionGeneration !== record.sessionGeneration ||
    transition.deliveryObservationRef !== record.deliveryObservationRef ||
    (record.tombstoned
      ? record.recoveryOrTombstoneRef !== transition.transitionRef
      : record.recoveryOrTombstoneRef !== transition.recoveryOrTombstoneRef) ||
    transition.tombstoned !== record.tombstoned
  ) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship transition does not bind the current record');
  }

  return Object.freeze({ relationshipRef, head, record, transition });
}

function formHead(record) {
  return withSemanticHash({
    schemaVersion: RELATIONSHIP_HEAD_SCHEMA,
    relationshipRef: record.relationshipRef,
    localParticipantRef: record.localParticipantRef,
    localStateRootRef: record.localStateRootRef,
    counterpartParticipantRef: record.counterpartParticipantRef,
    revision: record.revision,
    recordSha256: record.recordSha256,
    transitionSha256: record.transitionSha256,
    updatedAt: record.updatedAt,
    tombstoned: record.tombstoned
  }, 'headSha256');
}

function writeTransition(paths, transition) {
  return writeAddressed(
    paths,
    paths.transitions,
    transition,
    'transitionSha256',
    (value) => validateTransition(value, transition.relationshipRef),
    'relationship transition'
  );
}

function writeRecord(paths, record) {
  return writeAddressed(
    paths,
    paths.records,
    record,
    'recordSha256',
    (value) => validateRecord(value, record.relationshipRef),
    'relationship record'
  );
}

function formCommitReceipt(current, operation, idempotent, observedAt) {
  const core = {
    schemaVersion: RELATIONSHIP_COMMIT_RECEIPT_SCHEMA,
    state: 'COMMITTED',
    truthClass: 'DURABLE_LOCAL_DIRECTIONAL_RELATIONSHIP',
    operation,
    idempotent,
    relationshipRef: current.relationshipRef,
    localParticipantRef: current.record.localParticipantRef,
    localStateRootRef: current.record.localStateRootRef,
    counterpartParticipantRef: current.record.counterpartParticipantRef,
    revision: current.record.revision,
    status: current.record.status,
    recordSha256: current.record.recordSha256,
    transitionRef: current.record.transitionRef,
    transitionSha256: current.record.transitionSha256,
    headSha256: current.head.headSha256,
    observedAt,
    relationshipPersisted: true,
    localDirectionalOnly: true,
    counterpartClaimIndependent: true,
    effects: persistedEffects(!idempotent)
  };
  const receiptRef = `receipt.relationship.vexlife.${semanticHash(core).slice(0, 32)}`;
  return withSemanticHash({ ...core, receiptRef }, 'receiptSha256');
}

function writeCommitReceipt(paths, current, operation, idempotent, observedAt) {
  const receipt = formCommitReceipt(current, operation, idempotent, observedAt);
  writeAddressed(
    paths,
    paths.receipts,
    receipt,
    'receiptSha256',
    (value) => {
      if (!value || value.schemaVersion !== RELATIONSHIP_COMMIT_RECEIPT_SCHEMA || !SHA256.test(value.receiptSha256 ?? '')) {
        fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship commit receipt is invalid');
      }
      const core = structuredClone(value);
      delete core.receiptSha256;
      if (semanticHash(core) !== value.receiptSha256) {
        fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship commit receipt hash is invalid');
      }
      return value;
    },
    'relationship commit receipt'
  );
  return receipt;
}

function createSemanticsMatch(record, input) {
  return (
    record.revision === 0 &&
    record.status === 'ACTIVE' &&
    record.tombstoned === false &&
    record.localRelationshipClass === input.localRelationshipClass &&
    record.counterpartCurrentKeyRef === input.counterpartCurrentKeyRef &&
    record.invitationRef === input.invitationRef &&
    record.invitationCurrentnessRef === input.invitationCurrentnessRef &&
    record.lastAcceptedPeerCurrentnessRef === input.lastAcceptedPeerCurrentnessRef &&
    record.routeRef === input.routeRef &&
    record.sessionGeneration === input.sessionGeneration &&
    record.deliveryObservationRef === input.deliveryObservationRef
  );
}

export function createRelationship(value) {
  const input = normalizeCreateInput(value);
  const paths = storePaths(input);
  const relationshipRef = relationshipRefFor(input);
  const lease = acquireWriter(paths, input);
  try {
    if (fs.existsSync(headPath(paths, relationshipRef))) {
      const current = currentRelationship(paths, input);
      if (!createSemanticsMatch(current.record, input)) {
        fail('RELATIONSHIP_ALREADY_EXISTS', 'relationship already exists with different create semantics');
      }
      return writeCommitReceipt(paths, current, 'CREATE', true, input.observedAt);
    }

    const transition = formTransition({
      schemaVersion: RELATIONSHIP_TRANSITION_SCHEMA,
      relationshipRef,
      localParticipantRef: input.localParticipantRef,
      localStateRootRef: input.localStateRootRef,
      counterpartParticipantRef: input.counterpartParticipantRef,
      action: 'CREATE',
      priorRevision: null,
      nextRevision: 0,
      priorRecordSha256: null,
      priorTransitionSha256: null,
      priorStatus: null,
      nextStatus: 'ACTIVE',
      localRelationshipClass: input.localRelationshipClass,
      observedAt: input.observedAt,
      instanceRef: input.instanceRef,
      counterpartCurrentKeyRef: input.counterpartCurrentKeyRef,
      invitationCurrentnessRef: input.invitationCurrentnessRef,
      lastAcceptedPeerCurrentnessRef: input.lastAcceptedPeerCurrentnessRef,
      routeRef: input.routeRef,
      sessionGeneration: input.sessionGeneration,
      deliveryObservationRef: input.deliveryObservationRef,
      recoveryOrTombstoneRef: null,
      tombstoned: false,
      semanticAcknowledgementCreated: false,
      reciprocalFriendshipCreated: false
    });
    writeTransition(paths, transition);

    const record = withSemanticHash({
      schemaVersion: RELATIONSHIP_RECORD_SCHEMA,
      relationshipRef,
      localParticipantRef: input.localParticipantRef,
      localStateRootRef: input.localStateRootRef,
      counterpartParticipantRef: input.counterpartParticipantRef,
      counterpartCurrentKeyRef: input.counterpartCurrentKeyRef,
      localRelationshipClass: input.localRelationshipClass,
      invitationRef: input.invitationRef,
      invitationCurrentnessRef: input.invitationCurrentnessRef,
      status: 'ACTIVE',
      createdAt: input.observedAt,
      updatedAt: input.observedAt,
      revision: 0,
      priorRecordSha256: null,
      transitionRef: transition.transitionRef,
      transitionSha256: transition.transitionSha256,
      recoveryOrTombstoneRef: null,
      lastAcceptedPeerCurrentnessRef: input.lastAcceptedPeerCurrentnessRef,
      routeRef: input.routeRef,
      sessionGeneration: input.sessionGeneration,
      deliveryObservationRef: input.deliveryObservationRef,
      tombstoned: false,
      localDirectionalOnly: true,
      counterpartClaimIndependent: true,
      semanticAcknowledged: false,
      reciprocalFriendshipAsserted: false
    }, 'recordSha256');
    writeRecord(paths, record);

    const head = formHead(record);
    atomicWriteHead(paths, headPath(paths, relationshipRef), head, input.faults);
    const current = Object.freeze({ relationshipRef, head, record, transition });
    if (input.faults.failAfterHeadRenameBeforeReceipt === true) {
      fail('RELATIONSHIP_RECEIPT_NOT_DURABLE', 'simulated failure after relationship head commit and before durable receipt');
    }
    return writeCommitReceipt(paths, current, 'CREATE', false, input.observedAt);
  } finally {
    if (!releaseWriter(lease)) fail('RELATIONSHIP_WRITER_CONFLICT', 'relationship writer lease could not be released safely');
  }
}

export function readRelationship(value) {
  const owner = normalizeOwnerInput(value);
  const current = currentRelationship(storePaths(owner), owner);
  return Object.freeze({
    schemaVersion: RELATIONSHIPS_STORE_SCHEMA,
    state: 'CURRENT',
    truthClass: 'DURABLE_LOCAL_DIRECTIONAL_RELATIONSHIP',
    relationshipRef: current.relationshipRef,
    record: structuredClone(current.record),
    head: structuredClone(current.head),
    effects: persistedEffects(false)
  });
}

function transitionStatus(action, record) {
  if (record.tombstoned) fail('RELATIONSHIP_TERMINAL', 'tombstoned relationship cannot transition');
  if (action === 'DISCONNECT' && record.status !== 'ACTIVE') {
    fail('RELATIONSHIP_TRANSITION_INVALID', 'DISCONNECT requires ACTIVE');
  }
  if (action === 'RECONNECT' && record.status !== 'DISCONNECTED') {
    fail('RELATIONSHIP_TRANSITION_INVALID', 'RECONNECT requires DISCONNECTED');
  }
  return expectedStatusForAction(action, record.status);
}

export function listRelationships(value) {
  const admitted = new Set(['home', 'localParticipantRef', 'localStateRootRef', 'maxRelationships', 'includeTombstoned']);
  requireExactObjectKeys(value, admitted, 'list input');
  const home = canonicalHomeRoot(value.home);
  const localParticipantRef = requireRef(value.localParticipantRef, 'localParticipantRef');
  const localStateRootRef = requireRef(value.localStateRootRef, 'localStateRootRef');
  const maxRelationships = value.maxRelationships ?? 100;
  const includeTombstoned = value.includeTombstoned ?? false;
  if (!Number.isSafeInteger(maxRelationships) || maxRelationships < 1 || maxRelationships > 256) {
    fail('RELATIONSHIP_LIST_BOUNDED', 'maxRelationships must be between 1 and 256');
  }
  if (typeof includeTombstoned !== 'boolean') {
    fail('RELATIONSHIP_INPUT_INVALID', 'includeTombstoned must be boolean');
  }
  const paths = storePaths({ home, localParticipantRef, localStateRootRef });
  if (!fs.existsSync(paths.heads)) {
    return Object.freeze({
      schemaVersion: RELATIONSHIPS_STORE_SCHEMA,
      state: 'CURRENT_LIST',
      localParticipantRef,
      localStateRootRef,
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      relationships: Object.freeze([])
    });
  }
  const headsStat = fs.lstatSync(paths.heads);
  if (headsStat.isSymbolicLink() || !headsStat.isDirectory() || !samePath(fs.realpathSync.native(paths.heads), paths.heads)) {
    fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship heads directory is not canonical');
  }
  const entries = fs.readdirSync(paths.heads, { withFileTypes: true });
  if (entries.length > 4096) fail('RELATIONSHIP_LIST_BOUNDED', 'relationship head inventory exceeds the bounded scan ceiling');
  const relationships = [];
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship head inventory contains a non-file entry');
    const relationshipRef = requireRef(entry.name.slice(0, -5), 'relationshipRef', 'RELATIONSHIP_RECEIPT_CORRUPT');
    const head = validateHead(readJson(headPath(paths, relationshipRef), 'RELATIONSHIP_RECEIPT_CORRUPT', 'relationship head'), relationshipRef);
    if (head.localParticipantRef !== localParticipantRef || head.localStateRootRef !== localStateRootRef) {
      fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship head owner binding is invalid');
    }
    const current = currentRelationship(paths, {
      home,
      localParticipantRef,
      localStateRootRef,
      counterpartParticipantRef: head.counterpartParticipantRef
    });
    if (!includeTombstoned && current.record.tombstoned) continue;
    relationships.push(Object.freeze({
      relationshipRef: current.relationshipRef,
      counterpartParticipantRef: current.record.counterpartParticipantRef,
      localRelationshipClass: current.record.localRelationshipClass,
      status: current.record.status,
      revision: current.record.revision,
      updatedAt: current.record.updatedAt,
      tombstoned: current.record.tombstoned
    }));
  }
  relationships.sort((left, right) => left.relationshipRef < right.relationshipRef ? -1 : left.relationshipRef > right.relationshipRef ? 1 : 0);
  const selected = relationships.slice(0, maxRelationships);
  return Object.freeze({
    schemaVersion: RELATIONSHIPS_STORE_SCHEMA,
    state: 'CURRENT_LIST',
    localParticipantRef,
    localStateRootRef,
    totalCount: relationships.length,
    returnedCount: selected.length,
    truncated: selected.length < relationships.length,
    relationships: Object.freeze(selected)
  });
}

export function transitionRelationship(value) {
  const input = normalizeTransitionInput(value);
  const paths = storePaths(input);
  const lease = acquireWriter(paths, input);
  try {
    const current = currentRelationship(paths, input);
    const prior = current.record;
    if (prior.revision !== input.expectedRevision) {
      fail('RELATIONSHIP_STALE_REVISION', 'expected relationship revision is stale');
    }

    const nextStatus = transitionStatus(input.action, prior);
    const tombstoned = input.action === 'TOMBSTONE';
    const transition = formTransition({
      schemaVersion: RELATIONSHIP_TRANSITION_SCHEMA,
      relationshipRef: current.relationshipRef,
      localParticipantRef: input.localParticipantRef,
      localStateRootRef: input.localStateRootRef,
      counterpartParticipantRef: input.counterpartParticipantRef,
      action: input.action,
      priorRevision: prior.revision,
      nextRevision: prior.revision + 1,
      priorRecordSha256: prior.recordSha256,
      priorTransitionSha256: prior.transitionSha256,
      priorStatus: prior.status,
      nextStatus,
      localRelationshipClass: prior.localRelationshipClass,
      observedAt: input.observedAt,
      instanceRef: input.instanceRef,
      counterpartCurrentKeyRef: input.counterpartCurrentKeyRef ?? prior.counterpartCurrentKeyRef,
      invitationCurrentnessRef: input.invitationCurrentnessRef ?? prior.invitationCurrentnessRef,
      lastAcceptedPeerCurrentnessRef: input.lastAcceptedPeerCurrentnessRef ?? prior.lastAcceptedPeerCurrentnessRef,
      routeRef: input.routeRef ?? prior.routeRef,
      sessionGeneration: input.sessionGeneration ?? prior.sessionGeneration,
      deliveryObservationRef: input.deliveryObservationRef ?? prior.deliveryObservationRef,
      recoveryOrTombstoneRef: input.recoveryOrTombstoneRef ?? prior.recoveryOrTombstoneRef,
      tombstoned,
      semanticAcknowledgementCreated: false,
      reciprocalFriendshipCreated: false
    });
    writeTransition(paths, transition);

    const nextCore = {
      ...structuredClone(prior),
      counterpartCurrentKeyRef: transition.counterpartCurrentKeyRef,
      invitationCurrentnessRef: transition.invitationCurrentnessRef,
      status: nextStatus,
      updatedAt: input.observedAt,
      revision: prior.revision + 1,
      priorRecordSha256: prior.recordSha256,
      transitionRef: transition.transitionRef,
      transitionSha256: transition.transitionSha256,
      recoveryOrTombstoneRef: tombstoned ? transition.transitionRef : transition.recoveryOrTombstoneRef,
      lastAcceptedPeerCurrentnessRef: transition.lastAcceptedPeerCurrentnessRef,
      routeRef: transition.routeRef,
      sessionGeneration: transition.sessionGeneration,
      deliveryObservationRef: transition.deliveryObservationRef,
      tombstoned
    };
    delete nextCore.recordSha256;
    const record = withSemanticHash(nextCore, 'recordSha256');
    writeRecord(paths, record);

    const head = formHead(record);
    atomicWriteHead(paths, headPath(paths, current.relationshipRef), head, input.faults);
    const next = Object.freeze({ relationshipRef: current.relationshipRef, head, record, transition });
    if (input.faults.failAfterHeadRenameBeforeReceipt === true) {
      fail('RELATIONSHIP_RECEIPT_NOT_DURABLE', 'simulated failure after relationship head commit and before durable receipt');
    }
    return writeCommitReceipt(paths, next, input.action, false, input.observedAt);
  } finally {
    if (!releaseWriter(lease)) fail('RELATIONSHIP_WRITER_CONFLICT', 'relationship writer lease could not be released safely');
  }
}

export function exportRelationship(value) {
  const admitted = new Set([...OWNER_INPUT_KEYS, 'maxTransitions']);
  requireExactObjectKeys(value, admitted, 'export input');
  const owner = normalizeOwnerInput(value, admitted);
  const maxTransitions = value.maxTransitions ?? 64;
  if (!Number.isSafeInteger(maxTransitions) || maxTransitions < 1 || maxTransitions > 256) {
    fail('RELATIONSHIP_INPUT_INVALID', 'maxTransitions must be an integer from 1 through 256');
  }

  const paths = storePaths(owner);
  const current = currentRelationship(paths, owner);
  const transitions = [];
  let transitionSha256 = current.record.transitionSha256;
  while (transitionSha256 && transitions.length < maxTransitions) {
    const transition = validateTransition(
      readJson(addressedPath(paths, paths.transitions, transitionSha256), 'RELATIONSHIP_RECEIPT_CORRUPT', 'relationship transition'),
      current.relationshipRef
    );
    if (transition.transitionSha256 !== transitionSha256) {
      fail('RELATIONSHIP_RECEIPT_CORRUPT', 'relationship transition addressed identity does not match its lineage pointer');
    }
    transitions.push(Object.freeze({
      transitionRef: transition.transitionRef,
      transitionSha256: transition.transitionSha256,
      action: transition.action,
      priorRevision: transition.priorRevision,
      nextRevision: transition.nextRevision,
      priorStatus: transition.priorStatus,
      nextStatus: transition.nextStatus,
      observedAt: transition.observedAt,
      tombstoned: transition.tombstoned
    }));
    transitionSha256 = transition.priorTransitionSha256;
  }
  if (transitionSha256) {
    fail('RELATIONSHIP_EXPORT_BOUNDED', 'relationship transition history exceeds the requested export bound');
  }

  return Object.freeze({
    schemaVersion: RELATIONSHIP_EXPORT_SCHEMA,
    truthClass: 'BOUNDED_CONTENT_SAFE_LOCAL_RELATIONSHIP_EXPORT',
    relationshipRef: current.relationshipRef,
    localParticipantRef: current.record.localParticipantRef,
    localStateRootRef: current.record.localStateRootRef,
    counterpartParticipantRef: current.record.counterpartParticipantRef,
    localRelationshipClass: current.record.localRelationshipClass,
    status: current.record.status,
    revision: current.record.revision,
    tombstoned: current.record.tombstoned,
    transitionCount: transitions.length,
    transitions: Object.freeze(transitions.reverse()),
    rawEndpointIncluded: false,
    providerCredentialIncluded: false,
    privateMemoryIncluded: false,
    reciprocalFriendshipAsserted: false,
    semanticAcknowledgementCreated: false,
    effects: persistedEffects(false)
  });
}

export function recoverAbandonedRelationshipWriter(value) {
  const admitted = new Set(['home', 'localParticipantRef', 'localStateRootRef', 'expectedAbandonedInstanceRef']);
  requireExactObjectKeys(value, admitted, 'writer recovery input');
  const home = canonicalHomeRoot(value.home);
  const localParticipantRef = requireRef(value.localParticipantRef, 'localParticipantRef');
  const localStateRootRef = requireRef(value.localStateRootRef, 'localStateRootRef');
  const expectedAbandonedInstanceRef = requireRef(value.expectedAbandonedInstanceRef, 'expectedAbandonedInstanceRef');
  const paths = storePaths({ home, localParticipantRef, localStateRootRef });

  if (!fs.existsSync(paths.lock)) {
    return Object.freeze({ state: 'NO_WRITER_LEASE', recovered: false });
  }

  let lease;
  try {
    lease = validateWriterLease(readJson(paths.lock, 'RELATIONSHIP_WRITER_CONFLICT', 'relationship writer lease'));
  } catch {
    fail('RELATIONSHIP_WRITER_CONFLICT', 'relationship writer lease is unverifiable');
  }
  if (
    lease.ownerFingerprint !== ownerFingerprint(localParticipantRef, localStateRootRef) ||
    lease.localParticipantRef !== localParticipantRef ||
    lease.localStateRootRef !== localStateRootRef ||
    lease.instanceRef !== expectedAbandonedInstanceRef
  ) {
    fail('RELATIONSHIP_WRITER_CONFLICT', 'relationship writer recovery identity does not match the exact abandoned owner');
  }
  if (processState(lease.pid) !== 'ABSENT') {
    fail('RELATIONSHIP_WRITER_CONFLICT', 'relationship writer may still be active or unverifiable');
  }

  fs.unlinkSync(paths.lock);
  return Object.freeze({
    state: 'RECOVERED_ABANDONED_WRITER',
    recovered: true,
    localParticipantRef,
    localStateRootRef,
    recoveredInstanceRef: lease.instanceRef,
    networkEffectPerformed: false,
    providerEffectPerformed: false,
    MemoryEffectPerformed: false,
    HomeLayoutEffectPerformed: false
  });
}

// [VXG RealForever]
