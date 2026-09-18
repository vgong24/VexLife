import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  readFamilySpace
} from './family-space-store.mjs';
import { semanticHash } from './utils.mjs';

export const FAMILY_INVITATION_SCHEMA = 'vexlife.family-invitation/v1';
export const FAMILY_INVITATION_HEAD_SCHEMA = 'vexlife.family-invitation-head/v1';
export const FAMILY_INVITATION_RECEIPT_SCHEMA = 'vexlife.family-invitation-commit-receipt/v1';
export const FAMILY_INVITATION_WRITER_SCHEMA = 'vexlife.family-invitation-writer/v1';
export const FAMILY_INVITATION_EXPORT_SCHEMA = 'vexlife.family-invitation-export/v1';
export const FAMILY_INVITATION_STATES = Object.freeze([
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'REVOKED',
  'EXPIRED'
]);
export const FAMILY_INVITATION_FIRST_SLICE_ROLE = 'MEMBER';
export const FAMILY_INVITATION_HISTORY_POLICY = 'policy.vex-family.history.from-join';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const ISSUE_KEYS = new Set([
  'home',
  'spaceRef',
  'inviterPrincipalRef',
  'expectedFamilyRecordSha256',
  'expectedRevision',
  'expectedMembershipGeneration',
  'idempotencyKey',
  'issuedAt',
  'expiresAt',
  'sourceReceiptRefs',
  'currentnessRefs',
  'instanceRef',
  'faults'
]);
const REVOKE_KEYS = new Set([
  'home',
  'invitationRef',
  'actorPrincipalRef',
  'expectedInvitationRevision',
  'expectedFamilyRecordSha256',
  'expectedFamilyRevision',
  'expectedMembershipGeneration',
  'observedAt',
  'sourceReceiptRefs',
  'currentnessRefs',
  'instanceRef',
  'faults'
]);
const EXPIRE_KEYS = new Set([
  'home',
  'invitationRef',
  'expectedInvitationRevision',
  'observedAt',
  'instanceRef',
  'faults'
]);
const READ_KEYS = new Set(['home', 'invitationRef', 'observedAt']);
const EXPORT_KEYS = new Set(['home', 'invitationRef', 'observedAt']);
const RECOVERY_KEYS = new Set(['home', 'invitationRef', 'expectedAbandonedInstanceRef']);
const FAULT_KEYS = new Set(['failBeforeHeadRename', 'failAfterHeadRenameBeforeReceipt']);
const RECORD_KEYS = new Set([
  'schemaVersion',
  'invitationRef',
  'spaceRef',
  'inviterPrincipalRef',
  'inviterMembershipRef',
  'offeredRole',
  'expectedFamilyRecordSha256',
  'expectedFamilyRevision',
  'expectedMembershipGeneration',
  'historyVisibilityPolicyRef',
  'issuedAt',
  'expiresAt',
  'state',
  'revision',
  'priorRecordSha256',
  'transitionRef',
  'sourceReceiptRefs',
  'currentnessRefs',
  'updatedAt',
  'recordSha256'
]);
const HEAD_KEYS = new Set([
  'schemaVersion',
  'invitationRef',
  'revision',
  'state',
  'recordSha256',
  'updatedAt',
  'headSha256'
]);
const WRITER_KEYS = new Set([
  'schemaVersion',
  'invitationRef',
  'instanceRef',
  'pid',
  'lockToken',
  'formedAt',
  'leaseSha256'
]);

export class FamilyInvitationStoreError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'FamilyInvitationStoreError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details = null) => {
  throw new FamilyInvitationStoreError(code, message, details);
};

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, keys, label) {
  if (!isObject(value)) fail('FAMILY_INVITATION_INPUT_INVALID', `${label} must be one object`);
  const actual = Object.keys(value);
  const extra = actual.find((key) => !keys.has(key));
  if (extra) fail('FAMILY_INVITATION_UNTRUSTED_FIELD', `${label} contains untrusted field ${extra}`);
  if (actual.length !== keys.size) fail('FAMILY_INVITATION_INPUT_INVALID', `${label} is missing required fields`);
  return value;
}

function boundedKeys(value, keys, label) {
  if (!isObject(value)) fail('FAMILY_INVITATION_INPUT_INVALID', `${label} must be one object`);
  const extra = Object.keys(value).find((key) => !keys.has(key));
  if (extra) fail('FAMILY_INVITATION_UNTRUSTED_FIELD', `${label} contains untrusted field ${extra}`);
  return value;
}

function ref(value, label) {
  if (
    typeof value !== 'string'
    || !REF.test(value)
    || path.isAbsolute(value)
    || path.win32.isAbsolute(value)
  ) {
    fail('FAMILY_INVITATION_INPUT_INVALID', `${label} must be one portable lowercase stable ref`);
  }
  return value;
}

function sha(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    fail('FAMILY_INVITATION_INPUT_INVALID', `${label} must be one lowercase SHA-256`);
  }
  return value;
}

function revision(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('FAMILY_INVITATION_INPUT_INVALID', `${label} must be one non-negative safe integer`);
  }
  return value;
}

function time(value, label) {
  if (
    typeof value !== 'string'
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    fail('FAMILY_INVITATION_INPUT_INVALID', `${label} must be canonical ISO-8601 UTC`);
  }
  return value;
}

function refs(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    fail('FAMILY_INVITATION_SOURCE_EVIDENCE_REQUIRED', `${label} must be a non-empty ref array`);
  }
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('FAMILY_INVITATION_SOURCE_EVIDENCE_REQUIRED', `${label} must not contain duplicate refs`);
  }
  return Object.freeze([...normalized].sort());
}

function combineRefs(...groups) {
  return Object.freeze([...new Set(groups.flat())].sort());
}

function hash(core, field) {
  return Object.freeze({ ...core, [field]: semanticHash(core) });
}

const samePath = (left, right) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);

function canonicalHome(home) {
  if (typeof home !== 'string' || !home) {
    fail('FAMILY_INVITATION_HOME_INVALID', 'Vex Home path is required');
  }
  const requested = path.resolve(home);
  let stat;
  try {
    stat = fs.lstatSync(requested);
  } catch (error) {
    fail('FAMILY_INVITATION_HOME_INVALID', 'Vex Home is unavailable', { cause: error.message });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('FAMILY_INVITATION_HOME_INVALID', 'Vex Home must be one canonical directory');
  }
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) {
    fail('FAMILY_INVITATION_HOME_INVALID', 'Vex Home root is not canonical', { requested, real });
  }
  return real;
}

function under(home, target) {
  const full = path.resolve(target);
  const relative = path.relative(home, full);
  if (
    !relative
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    fail('FAMILY_INVITATION_HOME_INVALID', 'Family invitation path escapes Vex Home');
  }
  let cursor = home;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      fail('FAMILY_INVITATION_HOME_INVALID', 'Family invitation path traverses symbolic alias');
    }
    if (!samePath(fs.realpathSync.native(cursor), cursor)) {
      fail('FAMILY_INVITATION_HOME_INVALID', 'Family invitation path traverses non-canonical alias');
    }
  }
  return full;
}

function pathsFor(home, invitationRef) {
  const rootHome = canonicalHome(home);
  const invitation = ref(invitationRef, 'invitationRef');
  const key = semanticHash({
    schemaVersion: 'vexlife.family-invitation-storage/v1',
    invitationRef: invitation
  });
  const root = under(rootHome, path.join(rootHome, 'family-invitations', key));
  return Object.freeze({
    home: rootHome,
    root,
    records: under(rootHome, path.join(root, 'records')),
    receipts: under(rootHome, path.join(root, 'receipts')),
    head: under(rootHome, path.join(root, 'current.json')),
    lock: under(rootHome, path.join(root, 'writer.lock'))
  });
}

function readJson(file, code = 'FAMILY_INVITATION_CORRUPT') {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      fail(code, 'Family invitation durable object must be one regular file');
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof FamilyInvitationStoreError) throw error;
    fail(code, 'Family invitation durable object could not be read', { cause: error.message });
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
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    if (error?.code === 'EEXIST') return false;
    throw error;
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

function validateWriter(value) {
  exactKeys(value, WRITER_KEYS, 'writer lease');
  if (value.schemaVersion !== FAMILY_INVITATION_WRITER_SCHEMA) {
    fail('FAMILY_INVITATION_WRITER_CONFLICT', 'writer lease schema is invalid');
  }
  const core = structuredClone(value);
  delete core.leaseSha256;
  if (!SHA.test(value.leaseSha256 ?? '') || semanticHash(core) !== value.leaseSha256) {
    fail('FAMILY_INVITATION_WRITER_CONFLICT', 'writer lease hash is invalid');
  }
  ref(value.invitationRef, 'writer invitationRef');
  ref(value.instanceRef, 'writer instanceRef');
  time(value.formedAt, 'writer formedAt');
  if (!Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.lockToken !== 'string' || value.lockToken.length < 16) {
    fail('FAMILY_INVITATION_WRITER_CONFLICT', 'writer lease fields are invalid');
  }
  return value;
}

function acquire(paths, invitationRef, instanceRef, observedAt) {
  fs.mkdirSync(paths.root, { recursive: true });
  const lease = hash({
    schemaVersion: FAMILY_INVITATION_WRITER_SCHEMA,
    invitationRef: ref(invitationRef, 'invitationRef'),
    instanceRef: ref(instanceRef, 'instanceRef'),
    pid: process.pid,
    lockToken: crypto.randomUUID(),
    formedAt: time(observedAt, 'observedAt')
  }, 'leaseSha256');
  if (!writeExclusive(paths.home, paths.lock, lease)) {
    const existing = validateWriter(readJson(paths.lock, 'FAMILY_INVITATION_WRITER_CONFLICT'));
    const ownerState = processState(existing.pid);
    fail(
      ownerState === 'ABSENT'
        ? 'FAMILY_INVITATION_WRITER_RECOVERY_REQUIRED'
        : 'FAMILY_INVITATION_WRITER_CONFLICT',
      ownerState === 'ABSENT'
        ? 'abandoned Family invitation writer requires explicit recovery'
        : 'Family invitation writer is active or unverifiable'
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

function withWriter(paths, invitationRef, instanceRef, observedAt, fn) {
  const lease = acquire(paths, invitationRef, instanceRef, observedAt);
  let result;
  let caught = null;
  try {
    result = fn();
  } catch (error) {
    caught = error;
  }
  const released = release(lease);
  if (!released && !caught) {
    fail('FAMILY_INVITATION_WRITER_CONFLICT', 'Family invitation writer release could not be proven');
  }
  if (caught) throw caught;
  return result;
}

function validateRecord(value) {
  exactKeys(value, RECORD_KEYS, 'invitation record');
  if (value.schemaVersion !== FAMILY_INVITATION_SCHEMA || !FAMILY_INVITATION_STATES.includes(value.state)) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation record schema/state is invalid');
  }
  const core = structuredClone(value);
  delete core.recordSha256;
  if (!SHA.test(value.recordSha256 ?? '') || semanticHash(core) !== value.recordSha256) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation record hash is invalid');
  }
  ref(value.invitationRef, 'record invitationRef');
  ref(value.spaceRef, 'record spaceRef');
  ref(value.inviterPrincipalRef, 'record inviterPrincipalRef');
  ref(value.inviterMembershipRef, 'record inviterMembershipRef');
  if (value.offeredRole !== FAMILY_INVITATION_FIRST_SLICE_ROLE) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation offered role is invalid');
  }
  sha(value.expectedFamilyRecordSha256, 'record expectedFamilyRecordSha256');
  revision(value.expectedFamilyRevision, 'record expectedFamilyRevision');
  revision(value.expectedMembershipGeneration, 'record expectedMembershipGeneration');
  if (value.historyVisibilityPolicyRef !== FAMILY_INVITATION_HISTORY_POLICY) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation history policy is invalid');
  }
  const issuedAt = time(value.issuedAt, 'record issuedAt');
  const expiresAt = time(value.expiresAt, 'record expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation expiry is not after issue time');
  }
  revision(value.revision, 'record revision');
  if (value.priorRecordSha256 !== null) sha(value.priorRecordSha256, 'record priorRecordSha256');
  ref(value.transitionRef, 'record transitionRef');
  refs(value.sourceReceiptRefs, 'record sourceReceiptRefs');
  refs(value.currentnessRefs, 'record currentnessRefs');
  time(value.updatedAt, 'record updatedAt');
  return Object.freeze(value);
}

function validateHead(value, invitationRef) {
  exactKeys(value, HEAD_KEYS, 'invitation head');
  if (value.schemaVersion !== FAMILY_INVITATION_HEAD_SCHEMA) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation head schema is invalid');
  }
  const core = structuredClone(value);
  delete core.headSha256;
  if (!SHA.test(value.headSha256 ?? '') || semanticHash(core) !== value.headSha256) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation head hash is invalid');
  }
  if (ref(value.invitationRef, 'head invitationRef') !== invitationRef) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation head identity is inconsistent');
  }
  revision(value.revision, 'head revision');
  if (!FAMILY_INVITATION_STATES.includes(value.state)) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation head state is invalid');
  }
  sha(value.recordSha256, 'head recordSha256');
  time(value.updatedAt, 'head updatedAt');
  return Object.freeze(value);
}

function recordPath(paths, recordSha256) {
  return under(paths.home, path.join(paths.records, `${sha(recordSha256, 'recordSha256')}.json`));
}

function current(paths, invitationRef) {
  if (!fs.existsSync(paths.head)) return null;
  const head = validateHead(readJson(paths.head), invitationRef);
  const record = validateRecord(readJson(recordPath(paths, head.recordSha256)));
  if (
    record.invitationRef !== invitationRef
    || record.revision !== head.revision
    || record.state !== head.state
    || record.recordSha256 !== head.recordSha256
  ) {
    fail('FAMILY_INVITATION_CORRUPT', 'Family invitation head does not resolve to exact current record');
  }
  return record;
}

function persist(paths, record, instanceRef, faults = {}) {
  const value = validateRecord(record);
  fs.mkdirSync(paths.records, { recursive: true });
  fs.mkdirSync(paths.receipts, { recursive: true });
  const file = recordPath(paths, value.recordSha256);
  if (!writeExclusive(paths.home, file, value)) {
    const existing = validateRecord(readJson(file));
    if (existing.recordSha256 !== value.recordSha256 || semanticHash(existing) !== semanticHash(value)) {
      fail('FAMILY_INVITATION_CORRUPT', 'Family invitation content-address collision');
    }
  }

  const head = hash({
    schemaVersion: FAMILY_INVITATION_HEAD_SCHEMA,
    invitationRef: value.invitationRef,
    revision: value.revision,
    state: value.state,
    recordSha256: value.recordSha256,
    updatedAt: value.updatedAt
  }, 'headSha256');

  const temporary = `${paths.head}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let fd = null;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(head, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (faults.failBeforeHeadRename === true) {
      fs.rmSync(temporary, { force: true });
      fail('FAMILY_INVITATION_HEAD_NOT_COMMITTED', 'simulated failure before invitation head rename');
    }
    fs.renameSync(temporary, paths.head);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }

  if (faults.failAfterHeadRenameBeforeReceipt === true) {
    fail('FAMILY_INVITATION_RECEIPT_NOT_EMITTED', 'simulated failure after invitation head rename');
  }

  const receipt = hash({
    schemaVersion: FAMILY_INVITATION_RECEIPT_SCHEMA,
    invitationRef: value.invitationRef,
    revision: value.revision,
    state: value.state,
    recordSha256: value.recordSha256,
    headSha256: head.headSha256,
    instanceRef: ref(instanceRef, 'instanceRef'),
    committedAt: value.updatedAt,
    durable: true
  }, 'receiptSha256');
  writeExclusive(
    paths.home,
    under(paths.home, path.join(paths.receipts, `${receipt.receiptSha256}.json`)),
    receipt
  );
  return Object.freeze({ record: value, head, receipt });
}

function familyManager({
  home,
  spaceRef,
  actorPrincipalRef,
  expectedFamilyRecordSha256,
  expectedRevision,
  expectedMembershipGeneration
}) {
  const snapshot = readFamilySpace({ home, spaceRef });
  if (snapshot.state !== 'CURRENT' || !snapshot.record) {
    fail('FAMILY_INVITATION_FAMILY_NOT_FOUND', 'Family Space is unavailable');
  }
  const record = snapshot.record;
  if (
    record.recordSha256 !== sha(expectedFamilyRecordSha256, 'expectedFamilyRecordSha256')
    || record.revision !== revision(expectedRevision, 'expectedRevision')
    || record.membershipGeneration !== revision(expectedMembershipGeneration, 'expectedMembershipGeneration')
  ) {
    fail('FAMILY_INVITATION_FAMILY_STALE', 'Family Space currentness does not match the expected source record');
  }
  const actor = record.members.find(
    (member) => member.principalRef === ref(actorPrincipalRef, 'actorPrincipalRef') && member.status === 'ACTIVE'
  );
  if (!actor || !['OWNER', 'ADMIN'].includes(actor.role)) {
    fail('FAMILY_INVITATION_AUTHORITY_DENIED', 'Family invitation authority requires one current OWNER or ADMIN');
  }
  return Object.freeze({ record, actor });
}

function invitationRefFor({
  spaceRef,
  inviterMembershipRef,
  expectedFamilyRecordSha256,
  expectedMembershipGeneration,
  idempotencyKey
}) {
  return `invitation.vex-family.${semanticHash({
    schemaVersion: 'vexlife.family-invitation-identity/v1',
    spaceRef,
    inviterMembershipRef,
    expectedFamilyRecordSha256,
    expectedMembershipGeneration,
    idempotencyKey
  }).slice(0, 32)}`;
}

function sameIssueSemantics(record, expected) {
  return (
    record.spaceRef === expected.spaceRef
    && record.inviterPrincipalRef === expected.inviterPrincipalRef
    && record.inviterMembershipRef === expected.inviterMembershipRef
    && record.offeredRole === FAMILY_INVITATION_FIRST_SLICE_ROLE
    && record.expectedFamilyRecordSha256 === expected.expectedFamilyRecordSha256
    && record.expectedFamilyRevision === expected.expectedFamilyRevision
    && record.expectedMembershipGeneration === expected.expectedMembershipGeneration
    && record.historyVisibilityPolicyRef === FAMILY_INVITATION_HISTORY_POLICY
    && record.issuedAt === expected.issuedAt
    && record.expiresAt === expected.expiresAt
  );
}

function nextRecord(record, state, transitionRef, observedAt, sourceReceiptRefs, currentnessRefs) {
  return hash({
    schemaVersion: FAMILY_INVITATION_SCHEMA,
    invitationRef: record.invitationRef,
    spaceRef: record.spaceRef,
    inviterPrincipalRef: record.inviterPrincipalRef,
    inviterMembershipRef: record.inviterMembershipRef,
    offeredRole: record.offeredRole,
    expectedFamilyRecordSha256: record.expectedFamilyRecordSha256,
    expectedFamilyRevision: record.expectedFamilyRevision,
    expectedMembershipGeneration: record.expectedMembershipGeneration,
    historyVisibilityPolicyRef: record.historyVisibilityPolicyRef,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    state,
    revision: record.revision + 1,
    priorRecordSha256: record.recordSha256,
    transitionRef,
    sourceReceiptRefs: combineRefs(record.sourceReceiptRefs, sourceReceiptRefs),
    currentnessRefs: combineRefs(record.currentnessRefs, currentnessRefs),
    updatedAt: observedAt
  }, 'recordSha256');
}

export function issueFamilyInvitation(input = {}) {
  exactKeys(input, ISSUE_KEYS, 'issue invitation input');
  boundedKeys(input.faults, FAULT_KEYS, 'issue invitation faults');

  const issuedAt = time(input.issuedAt, 'issuedAt');
  const expiresAt = time(input.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    fail('FAMILY_INVITATION_INPUT_INVALID', 'expiresAt must be after issuedAt');
  }

  const manager = familyManager({
    home: input.home,
    spaceRef: input.spaceRef,
    actorPrincipalRef: input.inviterPrincipalRef,
    expectedFamilyRecordSha256: input.expectedFamilyRecordSha256,
    expectedRevision: input.expectedRevision,
    expectedMembershipGeneration: input.expectedMembershipGeneration
  });

  const idempotencyKey = ref(input.idempotencyKey, 'idempotencyKey');
  const invitationRef = invitationRefFor({
    spaceRef: manager.record.spaceRef,
    inviterMembershipRef: manager.actor.membershipRef,
    expectedFamilyRecordSha256: manager.record.recordSha256,
    expectedMembershipGeneration: manager.record.membershipGeneration,
    idempotencyKey
  });
  const paths = pathsFor(input.home, invitationRef);
  const instanceRef = ref(input.instanceRef, 'instanceRef');
  const sourceReceiptRefs = refs(input.sourceReceiptRefs, 'sourceReceiptRefs');
  const currentnessRefs = refs(input.currentnessRefs, 'currentnessRefs');

  return withWriter(paths, invitationRef, instanceRef, issuedAt, () => {
    const existing = current(paths, invitationRef);
    const semantics = {
      spaceRef: manager.record.spaceRef,
      inviterPrincipalRef: manager.actor.principalRef,
      inviterMembershipRef: manager.actor.membershipRef,
      expectedFamilyRecordSha256: manager.record.recordSha256,
      expectedFamilyRevision: manager.record.revision,
      expectedMembershipGeneration: manager.record.membershipGeneration,
      issuedAt,
      expiresAt
    };
    if (existing) {
      if (!sameIssueSemantics(existing, semantics)) {
        fail('FAMILY_INVITATION_CONFLICT', 'idempotent invitation identity already has different canonical issue semantics');
      }
      return Object.freeze({
        state: existing.state === 'PENDING' ? 'IDEMPOTENT_CURRENT' : 'EXISTING_TERMINAL',
        record: existing,
        effects: Object.freeze({
          invitationStateMutation: false,
          familyMembershipMutation: false,
          conversationMutation: false,
          networkDelivery: false,
          relationshipsMutation: false,
          modelInvocation: false,
          memoryMutation: false,
          publicationMutation: false
        })
      });
    }

    const record = hash({
      schemaVersion: FAMILY_INVITATION_SCHEMA,
      invitationRef,
      spaceRef: manager.record.spaceRef,
      inviterPrincipalRef: manager.actor.principalRef,
      inviterMembershipRef: manager.actor.membershipRef,
      offeredRole: FAMILY_INVITATION_FIRST_SLICE_ROLE,
      expectedFamilyRecordSha256: manager.record.recordSha256,
      expectedFamilyRevision: manager.record.revision,
      expectedMembershipGeneration: manager.record.membershipGeneration,
      historyVisibilityPolicyRef: FAMILY_INVITATION_HISTORY_POLICY,
      issuedAt,
      expiresAt,
      state: 'PENDING',
      revision: 0,
      priorRecordSha256: null,
      transitionRef: 'transition.vex-family.invitation.issue',
      sourceReceiptRefs,
      currentnessRefs,
      updatedAt: issuedAt
    }, 'recordSha256');
    const committed = persist(paths, record, instanceRef, input.faults);
    return Object.freeze({
      state: 'INVITATION_ISSUED',
      ...committed,
      effects: Object.freeze({
        invitationStateMutation: true,
        familyMembershipMutation: false,
        conversationMutation: false,
        networkDelivery: false,
        relationshipsMutation: false,
        modelInvocation: false,
        memoryMutation: false,
        publicationMutation: false
      })
    });
  });
}

export function readFamilyInvitation(input = {}) {
  exactKeys(input, READ_KEYS, 'read invitation input');
  const invitationRef = ref(input.invitationRef, 'invitationRef');
  const observedAt = time(input.observedAt, 'observedAt');
  const paths = pathsFor(input.home, invitationRef);
  const record = current(paths, invitationRef);
  if (!record) {
    return Object.freeze({ state: 'NOT_FOUND', record: null, effectiveState: null, expiryTransitionRequired: false });
  }
  const expiryTransitionRequired =
    record.state === 'PENDING' && Date.parse(observedAt) >= Date.parse(record.expiresAt);
  return Object.freeze({
    state: expiryTransitionRequired ? 'EXPIRY_COMMIT_REQUIRED' : 'CURRENT',
    record,
    effectiveState: expiryTransitionRequired ? 'EXPIRED' : record.state,
    expiryTransitionRequired
  });
}

export function revokeFamilyInvitation(input = {}) {
  exactKeys(input, REVOKE_KEYS, 'revoke invitation input');
  boundedKeys(input.faults, FAULT_KEYS, 'revoke invitation faults');
  const invitationRef = ref(input.invitationRef, 'invitationRef');
  const observedAt = time(input.observedAt, 'observedAt');
  const paths = pathsFor(input.home, invitationRef);
  const instanceRef = ref(input.instanceRef, 'instanceRef');
  const sourceReceiptRefs = refs(input.sourceReceiptRefs, 'sourceReceiptRefs');
  const currentnessRefs = refs(input.currentnessRefs, 'currentnessRefs');

  return withWriter(paths, invitationRef, instanceRef, observedAt, () => {
    const record = current(paths, invitationRef);
    if (!record) fail('FAMILY_INVITATION_NOT_FOUND', 'Family invitation is unavailable');
    const expectedInvitationRevision = revision(
      input.expectedInvitationRevision,
      'expectedInvitationRevision'
    );
    if (
      record.state === 'REVOKED'
      && record.revision === expectedInvitationRevision + 1
      && record.transitionRef === 'transition.vex-family.invitation.revoke'
    ) {
      return Object.freeze({
        state: 'IDEMPOTENT_CURRENT',
        record,
        effects: Object.freeze({ invitationStateMutation: false })
      });
    }
    if (record.revision !== expectedInvitationRevision) {
      fail('FAMILY_INVITATION_STALE', 'Family invitation revision is stale');
    }
    if (record.state !== 'PENDING') {
      fail('FAMILY_INVITATION_TERMINAL', 'only a PENDING invitation may be revoked');
    }
    if (Date.parse(observedAt) >= Date.parse(record.expiresAt)) {
      fail('FAMILY_INVITATION_EXPIRY_REQUIRED', 'expired PENDING invitation must be expired, not revoked');
    }

    familyManager({
      home: input.home,
      spaceRef: record.spaceRef,
      actorPrincipalRef: input.actorPrincipalRef,
      expectedFamilyRecordSha256: input.expectedFamilyRecordSha256,
      expectedRevision: input.expectedFamilyRevision,
      expectedMembershipGeneration: input.expectedMembershipGeneration
    });

    const next = nextRecord(
      record,
      'REVOKED',
      'transition.vex-family.invitation.revoke',
      observedAt,
      sourceReceiptRefs,
      currentnessRefs
    );
    const committed = persist(paths, next, instanceRef, input.faults);
    return Object.freeze({
      state: 'INVITATION_REVOKED',
      ...committed,
      effects: Object.freeze({
        invitationStateMutation: true,
        familyMembershipMutation: false,
        conversationMutation: false,
        networkDelivery: false,
        relationshipsMutation: false,
        modelInvocation: false,
        memoryMutation: false,
        publicationMutation: false
      })
    });
  });
}

export function expireFamilyInvitation(input = {}) {
  exactKeys(input, EXPIRE_KEYS, 'expire invitation input');
  boundedKeys(input.faults, FAULT_KEYS, 'expire invitation faults');
  const invitationRef = ref(input.invitationRef, 'invitationRef');
  const observedAt = time(input.observedAt, 'observedAt');
  const paths = pathsFor(input.home, invitationRef);
  const instanceRef = ref(input.instanceRef, 'instanceRef');

  return withWriter(paths, invitationRef, instanceRef, observedAt, () => {
    const record = current(paths, invitationRef);
    if (!record) fail('FAMILY_INVITATION_NOT_FOUND', 'Family invitation is unavailable');
    const expectedInvitationRevision = revision(
      input.expectedInvitationRevision,
      'expectedInvitationRevision'
    );
    if (
      record.state === 'EXPIRED'
      && record.revision === expectedInvitationRevision + 1
      && record.transitionRef === 'transition.vex-family.invitation.expire'
    ) {
      return Object.freeze({
        state: 'IDEMPOTENT_CURRENT',
        record,
        effects: Object.freeze({ invitationStateMutation: false })
      });
    }
    if (record.revision !== expectedInvitationRevision) {
      fail('FAMILY_INVITATION_STALE', 'Family invitation revision is stale');
    }
    if (record.state !== 'PENDING') {
      fail('FAMILY_INVITATION_TERMINAL', 'only a PENDING invitation may expire');
    }
    if (Date.parse(observedAt) < Date.parse(record.expiresAt)) {
      fail('FAMILY_INVITATION_NOT_EXPIRED', 'Family invitation is still inside its accepted lifetime');
    }
    const expiryRef = `currentness.vex-family.invitation-expiry.${semanticHash({
      invitationRef,
      expiresAt: record.expiresAt,
      observedAt
    }).slice(0, 32)}`;
    const next = nextRecord(
      record,
      'EXPIRED',
      'transition.vex-family.invitation.expire',
      observedAt,
      [],
      [expiryRef]
    );
    const committed = persist(paths, next, instanceRef, input.faults);
    return Object.freeze({
      state: 'INVITATION_EXPIRED',
      ...committed,
      effects: Object.freeze({
        invitationStateMutation: true,
        familyMembershipMutation: false,
        conversationMutation: false,
        networkDelivery: false,
        relationshipsMutation: false,
        modelInvocation: false,
        memoryMutation: false,
        publicationMutation: false
      })
    });
  });
}

export function exportFamilyInvitation(input = {}) {
  exactKeys(input, EXPORT_KEYS, 'export invitation input');
  const projection = readFamilyInvitation(input);
  if (!projection.record) {
    return Object.freeze({
      schemaVersion: FAMILY_INVITATION_EXPORT_SCHEMA,
      invitationRef: ref(input.invitationRef, 'invitationRef'),
      state: 'NOT_FOUND',
      invitation: null,
      contentSafe: true
    });
  }
  const record = projection.record;
  return Object.freeze({
    schemaVersion: FAMILY_INVITATION_EXPORT_SCHEMA,
    invitationRef: record.invitationRef,
    state: projection.state,
    effectiveState: projection.effectiveState,
    invitation: Object.freeze({
      invitationRef: record.invitationRef,
      spaceRef: record.spaceRef,
      inviterPrincipalRef: record.inviterPrincipalRef,
      inviterMembershipRef: record.inviterMembershipRef,
      offeredRole: record.offeredRole,
      expectedFamilyRecordSha256: record.expectedFamilyRecordSha256,
      expectedFamilyRevision: record.expectedFamilyRevision,
      expectedMembershipGeneration: record.expectedMembershipGeneration,
      historyVisibilityPolicyRef: record.historyVisibilityPolicyRef,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      state: record.state,
      revision: record.revision,
      recordSha256: record.recordSha256
    }),
    contentSafe: true
  });
}

export function recoverAbandonedFamilyInvitationWriter(input = {}) {
  exactKeys(input, RECOVERY_KEYS, 'invitation writer recovery input');
  const invitationRef = ref(input.invitationRef, 'invitationRef');
  const expected = ref(input.expectedAbandonedInstanceRef, 'expectedAbandonedInstanceRef');
  const paths = pathsFor(input.home, invitationRef);
  if (!fs.existsSync(paths.lock)) {
    return Object.freeze({ state: 'NO_WRITER', recovered: false });
  }
  const lease = validateWriter(readJson(paths.lock, 'FAMILY_INVITATION_WRITER_CONFLICT'));
  if (lease.invitationRef !== invitationRef || lease.instanceRef !== expected) {
    fail('FAMILY_INVITATION_WRITER_CONFLICT', 'writer recovery identity does not match exact abandoned writer');
  }
  if (processState(lease.pid) !== 'ABSENT') {
    fail('FAMILY_INVITATION_WRITER_CONFLICT', 'writer may still be active or unverifiable');
  }
  fs.unlinkSync(paths.lock);
  return Object.freeze({
    state: 'WRITER_RECOVERED',
    recovered: true,
    invitationRef,
    recoveredInstanceRef: lease.instanceRef,
    networkDelivery: false,
    familyMembershipMutation: false,
    modelInvocation: false
  });
}

// ACCEPTED and DECLINED remain schema states reserved for a later Join orchestration
// owner that can consume invitee-authenticated authority and prove cross-writer recovery.
// This persistence owner intentionally exposes no public transition into those states.

// [VXG RealForever]
