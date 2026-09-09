import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';

export const FAMILY_SPACE_SCHEMA = 'vexlife.family-space/v1';
export const FAMILY_SPACE_HEAD_SCHEMA = 'vexlife.family-space-head/v1';
export const FAMILY_SPACE_RECEIPT_SCHEMA = 'vexlife.family-space-commit-receipt/v1';
export const FAMILY_SPACE_WRITER_SCHEMA = 'vexlife.family-space-writer/v1';
export const FAMILY_SPACE_EXPORT_SCHEMA = 'vexlife.family-space-export/v1';
export const FAMILY_ROLES = Object.freeze(['OWNER', 'ADMIN', 'MEMBER']);
export const FAMILY_MEMBER_STATUSES = Object.freeze(['ACTIVE', 'LEFT', 'REVOKED', 'REMOVED']);
export const FAMILY_COMPANION_STATES = Object.freeze(['ACTIVE', 'HELD', 'RETIRED']);

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const FROM_JOIN = 'policy.vex-family.history.from-join';

export class FamilySpaceStoreError extends Error {
  constructor(code, message, details = null) { super(message); this.name = 'FamilySpaceStoreError'; this.code = code; this.details = details; }
}
const fail = (code, message, details = null) => { throw new FamilySpaceStoreError(code, message, details); };
const ref = (value, label) => {
  if (typeof value !== 'string' || !REF.test(value) || path.isAbsolute(value) || path.win32.isAbsolute(value)) fail('FAMILY_SPACE_INPUT_INVALID', `${label} must be one portable lowercase stable ref`);
  return value;
};
const optRef = (value, label) => value == null ? null : ref(value, label);
const time = (value, label = 'observedAt') => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('FAMILY_SPACE_INPUT_INVALID', `${label} must be canonical ISO-8601 UTC`);
  return value;
};
const gen = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) fail('FAMILY_SPACE_INPUT_INVALID', `${label} must be a non-negative safe integer`);
  return value;
};
const hash = (core, field) => Object.freeze({ ...core, [field]: semanticHash(core) });
const samePath = (a, b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  : path.resolve(a) === path.resolve(b);

function canonicalHome(home) {
  if (typeof home !== 'string' || !home) fail('FAMILY_SPACE_HOME_INVALID', 'Vex Home path is required');
  const requested = path.resolve(home);
  let st;
  try { st = fs.lstatSync(requested); } catch (error) { fail('FAMILY_SPACE_HOME_INVALID', 'Vex Home is unavailable', { cause: error.message }); }
  if (st.isSymbolicLink() || !st.isDirectory()) fail('FAMILY_SPACE_HOME_INVALID', 'Vex Home must be one canonical directory');
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) fail('FAMILY_SPACE_HOME_INVALID', 'Vex Home root is not canonical', { requested, real });
  return real;
}
function under(home, target) {
  const full = path.resolve(target);
  const rel = path.relative(home, full);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail('FAMILY_SPACE_HOME_INVALID', 'Family Space path escapes Vex Home');
  let cursor = home;
  for (const segment of rel.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const st = fs.lstatSync(cursor);
    if (st.isSymbolicLink()) fail('FAMILY_SPACE_HOME_INVALID', 'Family Space path traverses symbolic alias', { path: cursor });
    if (!samePath(fs.realpathSync.native(cursor), cursor)) fail('FAMILY_SPACE_HOME_INVALID', 'Family Space path traverses non-canonical alias', { path: cursor });
  }
  return full;
}
function pathsFor(home, spaceRef) {
  const rootHome = canonicalHome(home);
  const safeSpace = ref(spaceRef, 'spaceRef');
  const key = semanticHash({ schemaVersion: 'vexlife.family-space-storage/v1', spaceRef: safeSpace });
  const root = under(rootHome, path.join(rootHome, 'family-spaces', key));
  return Object.freeze({ home: rootHome, root, records: under(rootHome, path.join(root, 'records')), receipts: under(rootHome, path.join(root, 'receipts')), head: under(rootHome, path.join(root, 'current.json')), lock: under(rootHome, path.join(root, 'writer.lock')) });
}
function readJson(file, code = 'FAMILY_SPACE_CORRUPT') {
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile()) fail(code, 'Family Space durable object must be one regular file');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof FamilySpaceStoreError) throw error;
    fail(code, 'Family Space durable object could not be read', { cause: error.message });
  }
}
function writeExclusive(home, file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); under(home, path.dirname(file));
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600); fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); return true;
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
}
function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try { process.kill(pid, 0); return 'ACTIVE'; } catch (error) { return error?.code === 'ESRCH' ? 'ABSENT' : error?.code === 'EPERM' ? 'ACTIVE' : 'UNVERIFIABLE'; }
}
function acquire(paths, instanceRef, observedAt) {
  fs.mkdirSync(paths.root, { recursive: true });
  const lease = hash({ schemaVersion: FAMILY_SPACE_WRITER_SCHEMA, instanceRef: ref(instanceRef, 'instanceRef'), pid: process.pid, lockToken: crypto.randomUUID(), formedAt: time(observedAt) }, 'leaseSha256');
  if (!writeExclusive(paths.home, paths.lock, lease)) {
    const existing = readJson(paths.lock, 'FAMILY_SPACE_WRITER_CONFLICT');
    const state = processState(existing.pid);
    fail(state === 'ABSENT' ? 'FAMILY_SPACE_WRITER_RECOVERY_REQUIRED' : 'FAMILY_SPACE_WRITER_CONFLICT', state === 'ABSENT' ? 'abandoned Family Space writer requires explicit recovery' : 'Family Space writer is active or unverifiable');
  }
  return Object.freeze({ path: paths.lock, token: lease.lockToken });
}
function release(lease) {
  if (!lease || !fs.existsSync(lease.path)) return true;
  try { const current = JSON.parse(fs.readFileSync(lease.path, 'utf8')); if (current.lockToken !== lease.token) return false; fs.unlinkSync(lease.path); return true; } catch { return false; }
}
function withWriter(paths, instanceRef, observedAt, fn) {
  const lease = acquire(paths, instanceRef, observedAt); let result; let caught = null;
  try { result = fn(); } catch (error) { caught = error; }
  const released = release(lease);
  if (!released && !caught) fail('FAMILY_SPACE_WRITER_CONFLICT', 'Family Space writer release could not be proven');
  if (caught) throw caught;
  return result;
}
function atomicHead(paths, value, faults = {}) {
  fs.mkdirSync(paths.root, { recursive: true });
  const tmp = `${paths.head}.tmp-${process.pid}-${crypto.randomUUID()}`; let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600); fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = null;
    if (faults.failBeforeHeadRename === true) { fs.rmSync(tmp, { force: true }); fail('FAMILY_SPACE_HEAD_NOT_COMMITTED', 'simulated failure before Family Space head rename'); }
    fs.renameSync(tmp, paths.head);
  } finally { if (fd !== null) { try { fs.closeSync(fd); } catch {} } if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); }
}
const membershipRefFor = (spaceRef, principalRef) => `membership.vex-family.${semanticHash({ schemaVersion: 'vexlife.family-membership-identity/v1', spaceRef, principalRef }).slice(0, 32)}`;
function normalizeMember(member) {
  if (!FAMILY_ROLES.includes(member.role) || !FAMILY_MEMBER_STATUSES.includes(member.status)) fail('FAMILY_SPACE_CORRUPT', 'member role/status is invalid');
  return Object.freeze({ membershipRef: ref(member.membershipRef, 'membershipRef'), principalRef: ref(member.principalRef, 'principalRef'), principalBindingRef: ref(member.principalBindingRef, 'principalBindingRef'), role: member.role, status: member.status, joinedAt: time(member.joinedAt, 'joinedAt'), leftOrRevokedAtOrNull: member.leftOrRevokedAtOrNull == null ? null : time(member.leftOrRevokedAtOrNull, 'leftOrRevokedAtOrNull'), historyVisibilityPolicyRef: ref(member.historyVisibilityPolicyRef, 'historyVisibilityPolicyRef') });
}
function validate(record) {
  if (!record || record.schemaVersion !== FAMILY_SPACE_SCHEMA || !SHA.test(record.recordSha256 ?? '')) fail('FAMILY_SPACE_CORRUPT', 'Family Space record identity is invalid');
  const core = structuredClone(record); delete core.recordSha256;
  if (semanticHash(core) !== record.recordSha256) fail('FAMILY_SPACE_CORRUPT', 'Family Space record hash is invalid');
  ref(record.spaceRef, 'spaceRef'); gen(record.revision, 'revision'); gen(record.membershipGeneration, 'membershipGeneration'); gen(record.familyCompanionBindingGeneration, 'familyCompanionBindingGeneration');
  if (!FAMILY_COMPANION_STATES.includes(record.familyCompanionState)) fail('FAMILY_SPACE_CORRUPT', 'Family companion state is invalid');
  if (record.familyCompanionLineageRef != null) ref(record.familyCompanionLineageRef, 'familyCompanionLineageRef');
  const members = (record.members ?? []).map(normalizeMember);
  if (!members.length || new Set(members.map((m) => m.principalRef)).size !== members.length) fail('FAMILY_SPACE_CORRUPT', 'Family Space membership set is invalid');
  if (!members.some((m) => m.role === 'OWNER' && m.status === 'ACTIVE')) fail('FAMILY_SPACE_CORRUPT', 'Family Space requires an active OWNER');
  time(record.createdAt, 'createdAt'); time(record.updatedAt, 'updatedAt');
  if (record.priorRecordSha256 != null && !SHA.test(record.priorRecordSha256)) fail('FAMILY_SPACE_CORRUPT', 'priorRecordSha256 is invalid');
  return Object.freeze({ ...record, members: Object.freeze(members) });
}
function recordPath(paths, sha) { if (!SHA.test(sha ?? '')) fail('FAMILY_SPACE_CORRUPT', 'record SHA-256 invalid'); return under(paths.home, path.join(paths.records, `${sha}.json`)); }
function head(paths) {
  if (!fs.existsSync(paths.head)) return null;
  const value = readJson(paths.head); if (value.schemaVersion !== FAMILY_SPACE_HEAD_SCHEMA || !SHA.test(value.recordSha256 ?? '') || !SHA.test(value.headSha256 ?? '')) fail('FAMILY_SPACE_CORRUPT', 'Family Space head identity is invalid');
  const core = structuredClone(value); delete core.headSha256; if (semanticHash(core) !== value.headSha256) fail('FAMILY_SPACE_CORRUPT', 'Family Space head hash is invalid'); return value;
}
function current(paths) { const h = head(paths); return h ? validate(readJson(recordPath(paths, h.recordSha256))) : null; }
function persist(paths, record, instanceRef, faults = {}) {
  const value = validate(record); fs.mkdirSync(paths.records, { recursive: true }); fs.mkdirSync(paths.receipts, { recursive: true });
  const file = recordPath(paths, value.recordSha256); if (!writeExclusive(paths.home, file, value) && semanticHash(validate(readJson(file))) !== semanticHash(value)) fail('FAMILY_SPACE_CORRUPT', 'Family Space content-address collision');
  const h = hash({ schemaVersion: FAMILY_SPACE_HEAD_SCHEMA, spaceRef: value.spaceRef, revision: value.revision, membershipGeneration: value.membershipGeneration, familyCompanionBindingGeneration: value.familyCompanionBindingGeneration, recordSha256: value.recordSha256, updatedAt: value.updatedAt }, 'headSha256');
  atomicHead(paths, h, faults); if (faults.failAfterHeadRenameBeforeReceipt === true) fail('FAMILY_SPACE_RECEIPT_NOT_EMITTED', 'simulated failure after Family Space head rename');
  const receipt = hash({ schemaVersion: FAMILY_SPACE_RECEIPT_SCHEMA, spaceRef: value.spaceRef, revision: value.revision, membershipGeneration: value.membershipGeneration, familyCompanionBindingGeneration: value.familyCompanionBindingGeneration, recordSha256: value.recordSha256, headSha256: h.headSha256, instanceRef: ref(instanceRef, 'instanceRef'), committedAt: value.updatedAt, durable: true }, 'receiptSha256');
  writeExclusive(paths.home, under(paths.home, path.join(paths.receipts, `${receipt.receiptSha256}.json`)), receipt);
  return Object.freeze({ record: value, head: h, receipt });
}
function manager(record, actorRef, targetRef = null) {
  const actor = record.members.find((m) => m.principalRef === actorRef && m.status === 'ACTIVE');
  if (!actor || !['OWNER', 'ADMIN'].includes(actor.role)) fail('FAMILY_SPACE_AUTHORITY_DENIED', 'actor is not an active Family owner/admin');
  const target = targetRef ? record.members.find((m) => m.principalRef === targetRef) : null;
  if (actor.role === 'ADMIN' && target?.role === 'OWNER') fail('FAMILY_SPACE_AUTHORITY_DENIED', 'Family ADMIN cannot mutate OWNER membership');
  return actor;
}
function mutateMember(record, member, observedAt) {
  const members = record.members.filter((m) => m.principalRef !== member.principalRef); members.push(Object.freeze(member)); members.sort((a, b) => a.principalRef.localeCompare(b.principalRef));
  return { members, membershipGeneration: record.membershipGeneration + 1, observedAt };
}
function nextRecord(record, change, observedAt) {
  return hash({ schemaVersion: FAMILY_SPACE_SCHEMA, spaceRef: record.spaceRef, revision: record.revision + 1, membershipGeneration: change.membershipGeneration ?? record.membershipGeneration, familyCompanionLineageRef: change.familyCompanionLineageRef ?? record.familyCompanionLineageRef, familyCompanionBindingGeneration: change.familyCompanionBindingGeneration ?? record.familyCompanionBindingGeneration, familyCompanionState: change.familyCompanionState ?? record.familyCompanionState, members: change.members ?? record.members, createdAt: record.createdAt, updatedAt: observedAt, priorRecordSha256: record.recordSha256, transitionRef: change.transitionRef }, 'recordSha256');
}

export function createFamilySpace(input = {}) {
  const { home, spaceRef, ownerPrincipalRef, ownerPrincipalBindingRef, familyCompanionLineageRef, familyCompanionState = 'ACTIVE', historyVisibilityPolicyRef = FROM_JOIN, observedAt, instanceRef, faults = {} } = input;
  const paths = pathsFor(home, spaceRef), ownerRef = ref(ownerPrincipalRef, 'ownerPrincipalRef'), bindingRef = ref(ownerPrincipalBindingRef, 'ownerPrincipalBindingRef'), companionRef = optRef(familyCompanionLineageRef, 'familyCompanionLineageRef'), policyRef = ref(historyVisibilityPolicyRef, 'historyVisibilityPolicyRef'), at = time(observedAt);
  if (!FAMILY_COMPANION_STATES.includes(familyCompanionState)) fail('FAMILY_SPACE_INPUT_INVALID', 'familyCompanionState invalid');
  return withWriter(paths, instanceRef, at, () => {
    const existing = current(paths);
    if (existing) {
      const owner = existing.members.find((m) => m.principalRef === ownerRef);
      if (owner?.role === 'OWNER' && owner.status === 'ACTIVE' && owner.principalBindingRef === bindingRef && owner.historyVisibilityPolicyRef === policyRef && existing.familyCompanionLineageRef === companionRef && existing.familyCompanionState === familyCompanionState) return Object.freeze({ state: 'EXISTING_CURRENT', record: existing });
      fail('FAMILY_SPACE_ALREADY_EXISTS', 'Family Space already exists with different canonical state');
    }
    const owner = Object.freeze({ membershipRef: membershipRefFor(spaceRef, ownerRef), principalRef: ownerRef, principalBindingRef: bindingRef, role: 'OWNER', status: 'ACTIVE', joinedAt: at, leftOrRevokedAtOrNull: null, historyVisibilityPolicyRef: policyRef });
    const record = hash({ schemaVersion: FAMILY_SPACE_SCHEMA, spaceRef: ref(spaceRef, 'spaceRef'), revision: 0, membershipGeneration: 1, familyCompanionLineageRef: companionRef, familyCompanionBindingGeneration: 1, familyCompanionState, members: [owner], createdAt: at, updatedAt: at, priorRecordSha256: null, transitionRef: 'transition.vex-family.space.create' }, 'recordSha256');
    return Object.freeze({ state: 'CREATED', ...persist(paths, record, instanceRef, faults) });
  });
}
export function readFamilySpace({ home, spaceRef } = {}) { const record = current(pathsFor(home, spaceRef)); return Object.freeze({ state: record ? 'CURRENT' : 'NOT_FOUND', record }); }
export function addFamilyMember(input = {}) {
  const { home, spaceRef, actorPrincipalRef, principalRef, principalBindingRef, role = 'MEMBER', historyVisibilityPolicyRef = FROM_JOIN, expectedRevision, expectedMembershipGeneration, observedAt, instanceRef, faults = {} } = input;
  if (!FAMILY_ROLES.includes(role)) fail('FAMILY_SPACE_INPUT_INVALID', 'role invalid');
  const paths = pathsFor(home, spaceRef), actor = ref(actorPrincipalRef, 'actorPrincipalRef'), principal = ref(principalRef, 'principalRef'), binding = ref(principalBindingRef, 'principalBindingRef'), policy = ref(historyVisibilityPolicyRef, 'historyVisibilityPolicyRef'), at = time(observedAt);
  return withWriter(paths, instanceRef, at, () => {
    const record = current(paths); if (!record) fail('FAMILY_SPACE_NOT_FOUND', 'Family Space does not exist');
    if (record.revision !== gen(expectedRevision, 'expectedRevision') || record.membershipGeneration !== gen(expectedMembershipGeneration, 'expectedMembershipGeneration')) fail('FAMILY_SPACE_STALE', 'Family Space revision or membership generation stale');
    manager(record, actor, principal); const existing = record.members.find((m) => m.principalRef === principal);
    if (existing?.status === 'ACTIVE') { if (existing.principalBindingRef === binding && existing.role === role && existing.historyVisibilityPolicyRef === policy) return Object.freeze({ state: 'IDEMPOTENT_CURRENT', record }); fail('FAMILY_SPACE_CONFLICT', 'principal already has conflicting active membership'); }
    const member = { membershipRef: membershipRefFor(record.spaceRef, principal), principalRef: principal, principalBindingRef: binding, role, status: 'ACTIVE', joinedAt: at, leftOrRevokedAtOrNull: null, historyVisibilityPolicyRef: policy };
    const change = mutateMember(record, member, at); const next = nextRecord(record, { ...change, transitionRef: `transition.vex-family.member.add.${member.membershipRef}` }, at);
    return Object.freeze({ state: 'MEMBER_ADDED', ...persist(paths, next, instanceRef, faults) });
  });
}
export function transitionFamilyMember(input = {}) {
  const { home, spaceRef, actorPrincipalRef, principalRef, action, role = null, principalBindingRef = null, expectedRevision, expectedMembershipGeneration, observedAt, instanceRef, faults = {} } = input;
  if (!['LEAVE', 'REVOKE', 'REMOVE', 'CHANGE_ROLE', 'REBIND'].includes(action)) fail('FAMILY_SPACE_INPUT_INVALID', 'member transition action invalid');
  const paths = pathsFor(home, spaceRef), actor = ref(actorPrincipalRef, 'actorPrincipalRef'), principal = ref(principalRef, 'principalRef'), at = time(observedAt);
  return withWriter(paths, instanceRef, at, () => {
    const record = current(paths); if (!record) fail('FAMILY_SPACE_NOT_FOUND', 'Family Space does not exist');
    if (record.revision !== gen(expectedRevision, 'expectedRevision') || record.membershipGeneration !== gen(expectedMembershipGeneration, 'expectedMembershipGeneration')) fail('FAMILY_SPACE_STALE', 'Family Space revision or membership generation stale');
    const member = record.members.find((m) => m.principalRef === principal); if (!member) fail('FAMILY_SPACE_MEMBER_NOT_FOUND', 'Family member does not exist');
    if (action === 'LEAVE') { if (actor !== principal) fail('FAMILY_SPACE_AUTHORITY_DENIED', 'only principal may leave own membership'); } else manager(record, actor, principal);
    const activeOwners = record.members.filter((m) => m.role === 'OWNER' && m.status === 'ACTIVE').length; let nextMember = { ...member };
    if (['LEAVE', 'REVOKE', 'REMOVE'].includes(action)) {
      if (member.status !== 'ACTIVE') return Object.freeze({ state: 'IDEMPOTENT_CURRENT', record });
      if (member.role === 'OWNER' && activeOwners === 1) fail('FAMILY_SPACE_AUTHORITY_DENIED', 'last active OWNER cannot be removed');
      nextMember.status = action === 'LEAVE' ? 'LEFT' : action === 'REVOKE' ? 'REVOKED' : 'REMOVED'; nextMember.leftOrRevokedAtOrNull = at;
    } else if (action === 'CHANGE_ROLE') {
      if (!FAMILY_ROLES.includes(role)) fail('FAMILY_SPACE_INPUT_INVALID', 'new role invalid'); if (member.role === role) return Object.freeze({ state: 'IDEMPOTENT_CURRENT', record }); if (member.role === 'OWNER' && role !== 'OWNER' && activeOwners === 1) fail('FAMILY_SPACE_AUTHORITY_DENIED', 'last active OWNER cannot be demoted'); nextMember.role = role;
    } else { const binding = ref(principalBindingRef, 'principalBindingRef'); if (member.principalBindingRef === binding) return Object.freeze({ state: 'IDEMPOTENT_CURRENT', record }); nextMember.principalBindingRef = binding; }
    const change = mutateMember(record, nextMember, at); const next = nextRecord(record, { ...change, transitionRef: `transition.vex-family.member.${action.toLowerCase()}.${member.membershipRef}` }, at);
    return Object.freeze({ state: `MEMBER_${action}`, ...persist(paths, next, instanceRef, faults) });
  });
}
export function updateFamilyCompanionBinding(input = {}) {
  const { home, spaceRef, actorPrincipalRef, familyCompanionLineageRef, familyCompanionState = 'ACTIVE', expectedRevision, expectedBindingGeneration, observedAt, instanceRef, faults = {} } = input;
  if (!FAMILY_COMPANION_STATES.includes(familyCompanionState)) fail('FAMILY_SPACE_INPUT_INVALID', 'familyCompanionState invalid');
  const paths = pathsFor(home, spaceRef), actor = ref(actorPrincipalRef, 'actorPrincipalRef'), lineage = optRef(familyCompanionLineageRef, 'familyCompanionLineageRef'), at = time(observedAt);
  return withWriter(paths, instanceRef, at, () => {
    const record = current(paths); if (!record) fail('FAMILY_SPACE_NOT_FOUND', 'Family Space does not exist'); manager(record, actor);
    if (record.revision !== gen(expectedRevision, 'expectedRevision') || record.familyCompanionBindingGeneration !== gen(expectedBindingGeneration, 'expectedBindingGeneration')) fail('FAMILY_SPACE_STALE', 'Family companion binding generation stale');
    if (record.familyCompanionLineageRef === lineage && record.familyCompanionState === familyCompanionState) return Object.freeze({ state: 'IDEMPOTENT_CURRENT', record });
    const next = nextRecord(record, { familyCompanionLineageRef: lineage, familyCompanionState, familyCompanionBindingGeneration: record.familyCompanionBindingGeneration + 1, transitionRef: 'transition.vex-family.companion.rebind' }, at);
    return Object.freeze({ state: 'FAMILY_COMPANION_UPDATED', ...persist(paths, next, instanceRef, faults) });
  });
}
export function exportFamilySpace({ home, spaceRef } = {}) {
  const { record } = readFamilySpace({ home, spaceRef }); if (!record) return Object.freeze({ schemaVersion: FAMILY_SPACE_EXPORT_SCHEMA, spaceRef: ref(spaceRef, 'spaceRef'), state: 'NOT_FOUND', members: [] });
  return Object.freeze({ schemaVersion: FAMILY_SPACE_EXPORT_SCHEMA, spaceRef: record.spaceRef, revision: record.revision, membershipGeneration: record.membershipGeneration, familyCompanionLineageRef: record.familyCompanionLineageRef, familyCompanionBindingGeneration: record.familyCompanionBindingGeneration, familyCompanionState: record.familyCompanionState, members: Object.freeze(record.members.map((m) => Object.freeze({ ...m }))), recordSha256: record.recordSha256, contentSafe: true });
}
export function recoverAbandonedFamilySpaceWriter({ home, spaceRef, expectedInstanceRef } = {}) {
  const paths = pathsFor(home, spaceRef); if (!fs.existsSync(paths.lock)) return Object.freeze({ state: 'NO_WRITER' }); const lease = readJson(paths.lock, 'FAMILY_SPACE_WRITER_CONFLICT');
  if (ref(lease.instanceRef, 'writer instanceRef') !== ref(expectedInstanceRef, 'expectedInstanceRef')) fail('FAMILY_SPACE_WRITER_CONFLICT', 'writer recovery identity mismatch'); if (processState(lease.pid) !== 'ABSENT') fail('FAMILY_SPACE_WRITER_CONFLICT', 'writer is active or unverifiable'); fs.unlinkSync(paths.lock); return Object.freeze({ state: 'WRITER_RECOVERED', instanceRef: lease.instanceRef });
}
