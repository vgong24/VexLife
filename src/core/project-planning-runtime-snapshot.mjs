import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  PROJECT_PLANNING_SNAPSHOT_SCHEMA,
  applyProjectPlanningTransaction,
} from './project-planning.mjs';
import { canonicalize, semanticHash } from './utils.mjs';

export const PROJECT_PLANNING_RUNTIME_SNAPSHOT_SCHEMA = 'vexlife.project-planning-runtime-snapshot/v1';
export const PROJECT_PLANNING_RUNTIME_OWNER_REF = 'owner.vexlife.project-planning';
export const PROJECT_PLANNING_RUNTIME_SOURCE_REF = 'source.vexlife.project-planning.runtime-snapshot.001';
export const PROJECT_PLANNING_RUNTIME_WRITER_SCHEMA = 'vexlife.project-planning-runtime-writer/v1';

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

const samePath = (left, right) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);

function canonicalHome(home) {
  if (typeof home !== 'string' || !home) fail('PROJECT_PLANNING_RUNTIME_HOME_INVALID', 'Vex Home path is required');
  const requested = path.resolve(home);
  let stat;
  try { stat = fs.lstatSync(requested); } catch (error) {
    fail('PROJECT_PLANNING_RUNTIME_HOME_INVALID', 'Vex Home is unavailable', { cause: error.message });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('PROJECT_PLANNING_RUNTIME_HOME_INVALID', 'Vex Home must be one canonical directory');
  }
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) {
    fail('PROJECT_PLANNING_RUNTIME_HOME_INVALID', 'Vex Home root is not canonical', { requested, real });
  }
  return real;
}

function under(home, target) {
  const full = path.resolve(target);
  const relative = path.relative(home, full);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('PROJECT_PLANNING_RUNTIME_PATH_INVALID', 'Project Planning runtime path escapes Vex Home');
  }
  let cursor = home;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('PROJECT_PLANNING_RUNTIME_PATH_INVALID', 'Project Planning runtime path traverses symbolic alias');
    if (!samePath(fs.realpathSync.native(cursor), cursor)) {
      fail('PROJECT_PLANNING_RUNTIME_PATH_INVALID', 'Project Planning runtime path traverses non-canonical alias');
    }
  }
  return full;
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)) {
    fail('PROJECT_PLANNING_RUNTIME_INPUT_INVALID', `${label} must be one stable ref`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') fail('PROJECT_PLANNING_RUNTIME_INPUT_INVALID', `${label} must be one canonical UTC timestamp`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) {
    fail('PROJECT_PLANNING_RUNTIME_INPUT_INVALID', `${label} must be one canonical UTC timestamp`);
  }
  return value;
}

function address(projectRef) {
  return semanticHash({
    schemaVersion: PROJECT_PLANNING_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: PROJECT_PLANNING_RUNTIME_OWNER_REF,
    projectRef: stableRef(projectRef, 'projectRef')
  });
}

function roots(home, projectRef) {
  const rootHome = canonicalHome(home);
  const root = under(rootHome, path.join(rootHome, 'runtime', 'project-planning', address(projectRef)));
  return Object.freeze({
    home: rootHome,
    root,
    events: under(rootHome, path.join(root, 'events')),
    snapshots: under(rootHome, path.join(root, 'snapshots')),
    current: under(rootHome, path.join(root, 'current.json')),
    lock: under(rootHome, path.join(root, 'writer.lock'))
  });
}

function canonicalBytes(value) {
  return JSON.stringify(canonicalize(value));
}

function readCanonicalJson(home, file, code) {
  let raw;
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail(code, 'Project Planning durable object must be one regular file');
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === code) throw error;
    fail(code, 'Project Planning durable object could not be read', { cause: error.message });
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch {
    fail(code, 'Project Planning durable object is malformed JSON');
  }
  if (raw !== canonicalBytes(parsed)) fail(code, 'Project Planning durable object bytes are not canonical');
  under(home, file);
  return parsed;
}

function writeImmutable(home, file, value, code) {
  const bytes = canonicalBytes(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  under(home, path.dirname(file));
  if (fs.existsSync(file)) {
    const existing = readCanonicalJson(home, file, code);
    if (canonicalBytes(existing) !== bytes) fail(code, 'content-addressed Project Planning object conflicts with existing bytes');
    return;
  }
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, bytes, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
}

function writeCurrent(paths, value) {
  fs.mkdirSync(paths.root, { recursive: true });
  const tmp = `${paths.current}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, canonicalBytes(value), 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, paths.current);
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  }
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try { process.kill(pid, 0); return 'ACTIVE'; } catch (error) {
    return error?.code === 'ESRCH' ? 'ABSENT' : error?.code === 'EPERM' ? 'ACTIVE' : 'UNVERIFIABLE';
  }
}

function writeExclusive(paths, value) {
  fs.mkdirSync(paths.root, { recursive: true });
  let fd = null;
  try {
    fd = fs.openSync(paths.lock, 'wx', 0o600);
    fs.writeFileSync(fd, canonicalBytes(value), 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    return true;
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
}

function acquireWriter(paths, projectRef, instanceRef, observedAt) {
  const core = {
    schemaVersion: PROJECT_PLANNING_RUNTIME_WRITER_SCHEMA,
    projectRef: stableRef(projectRef, 'projectRef'),
    instanceRef: stableRef(instanceRef, 'instanceRef'),
    pid: process.pid,
    lockToken: crypto.randomUUID(),
    formedAt: canonicalTimestamp(observedAt, 'observedAt')
  };
  const lease = Object.freeze({ ...core, leaseSha256: semanticHash(core) });
  if (!writeExclusive(paths, lease)) {
    let existing;
    try { existing = readCanonicalJson(paths.home, paths.lock, 'PROJECT_PLANNING_RUNTIME_WRITER_CONFLICT'); }
    catch { fail('PROJECT_PLANNING_RUNTIME_WRITER_CONFLICT', 'Project Planning writer lease is unverifiable'); }
    const state = processState(existing.pid);
    fail(
      state === 'ABSENT' ? 'PROJECT_PLANNING_RUNTIME_WRITER_RECOVERY_REQUIRED' : 'PROJECT_PLANNING_RUNTIME_WRITER_CONFLICT',
      state === 'ABSENT'
        ? 'abandoned Project Planning writer requires explicit recovery'
        : 'Project Planning writer is active or unverifiable'
    );
  }
  return Object.freeze({ path: paths.lock, token: lease.lockToken });
}

function releaseWriter(lease) {
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

function withWriter(paths, projectRef, instanceRef, observedAt, fn) {
  const lease = acquireWriter(paths, projectRef, instanceRef, observedAt);
  let result;
  let caught = null;
  try { result = fn(); } catch (error) { caught = error; }
  const released = releaseWriter(lease);
  if (!released && !caught) fail('PROJECT_PLANNING_RUNTIME_WRITER_CONFLICT', 'Project Planning writer release could not be proven');
  if (caught) throw caught;
  return result;
}

function pointerCore(snapshot, priorSnapshotFingerprintOrNull = null) {
  return {
    schemaVersion: PROJECT_PLANNING_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: PROJECT_PLANNING_RUNTIME_OWNER_REF,
    sourceRef: PROJECT_PLANNING_RUNTIME_SOURCE_REF,
    currentness: 'CURRENT',
    projectRef: snapshot.projectRef,
    snapshotFingerprint: snapshot.semanticFingerprint,
    payloadSha256: semanticHash(snapshot),
    eventCount: snapshot.eventCount,
    lastEventRefOrNull: snapshot.lastEventRefOrNull,
    priorSnapshotFingerprintOrNull
  };
}

function sealPointer(core) {
  return Object.freeze({ ...core, pointerSha256: semanticHash(core) });
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== PROJECT_PLANNING_SNAPSHOT_SCHEMA ||
      snapshot.currentness !== 'CURRENT' || typeof snapshot.semanticFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(snapshot.semanticFingerprint)) {
    fail('PROJECT_PLANNING_RUNTIME_SNAPSHOT_CORRUPT', 'Project Planning snapshot is invalid');
  }
  const { semanticFingerprint, ...core } = snapshot;
  if (semanticHash(core) !== semanticFingerprint) {
    fail('PROJECT_PLANNING_RUNTIME_SNAPSHOT_CORRUPT', 'Project Planning snapshot fingerprint mismatch');
  }
  return snapshot;
}

function validatePointer(pointer) {
  if (!pointer || pointer.schemaVersion !== PROJECT_PLANNING_RUNTIME_SNAPSHOT_SCHEMA ||
      pointer.ownerRef !== PROJECT_PLANNING_RUNTIME_OWNER_REF ||
      pointer.sourceRef !== PROJECT_PLANNING_RUNTIME_SOURCE_REF ||
      pointer.currentness !== 'CURRENT' ||
      typeof pointer.pointerSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(pointer.pointerSha256)) {
    fail('PROJECT_PLANNING_RUNTIME_POINTER_CORRUPT', 'Project Planning current pointer is invalid');
  }
  const { pointerSha256, ...core } = pointer;
  if (semanticHash(core) !== pointerSha256) fail('PROJECT_PLANNING_RUNTIME_POINTER_CORRUPT', 'Project Planning current pointer fingerprint mismatch');
  return pointer;
}

function readCurrent(paths) {
  if (!fs.existsSync(paths.current)) return Object.freeze({ pointer: null, snapshot: null });
  const pointer = validatePointer(readCanonicalJson(paths.home, paths.current, 'PROJECT_PLANNING_RUNTIME_POINTER_CORRUPT'));
  const snapshotPath = under(paths.home, path.join(paths.snapshots, `${pointer.snapshotFingerprint}.json`));
  if (!fs.existsSync(snapshotPath)) fail('PROJECT_PLANNING_RUNTIME_SNAPSHOT_MISSING', 'Project Planning pointer references missing snapshot');
  const snapshot = validateSnapshot(readCanonicalJson(paths.home, snapshotPath, 'PROJECT_PLANNING_RUNTIME_SNAPSHOT_CORRUPT'));
  if (snapshot.projectRef !== pointer.projectRef || snapshot.semanticFingerprint !== pointer.snapshotFingerprint ||
      semanticHash(snapshot) !== pointer.payloadSha256 || snapshot.eventCount !== pointer.eventCount ||
      snapshot.lastEventRefOrNull !== pointer.lastEventRefOrNull) {
    fail('PROJECT_PLANNING_RUNTIME_POINTER_CORRUPT', 'Project Planning snapshot does not match current pointer');
  }
  return Object.freeze({ pointer, snapshot });
}

function assertExpectedPointer(pointer, expected) {
  if (expected === null) {
    if (pointer !== null) fail('PROJECT_PLANNING_RUNTIME_STALE', 'planning pointer exists but transaction expected absent current planning');
    return;
  }
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected)) {
    fail('PROJECT_PLANNING_RUNTIME_STALE', 'expected planning pointer must be null or lowercase SHA-256');
  }
  if (pointer?.pointerSha256 !== expected) {
    fail('PROJECT_PLANNING_RUNTIME_STALE', 'planning current pointer changed before transaction admission', {
      expectedPointerSha256: expected,
      observedPointerSha256: pointer?.pointerSha256 ?? null
    });
  }
}

export function recoverProjectPlanningRuntimeWriter({
  home,
  projectRef,
  expectedLeaseSha256,
} = {}) {
  const paths = roots(home, projectRef);
  if (!fs.existsSync(paths.lock)) {
    return Object.freeze({
      state: 'RECOVERY_NOT_REQUIRED',
      projectRef,
      recovered: false,
      effects: Object.freeze({
        homeMutationPerformed: false,
        writerLeaseDeletionPerformed: false,
        providerMutationPerformed: false,
      }),
    });
  }
  const existing = readCanonicalJson(paths.home, paths.lock, 'PROJECT_PLANNING_RUNTIME_WRITER_CONFLICT');
  const { leaseSha256, ...core } = existing;
  if (
    existing.schemaVersion !== PROJECT_PLANNING_RUNTIME_WRITER_SCHEMA
    || existing.projectRef !== projectRef
    || typeof existing.instanceRef !== 'string'
    || !Number.isSafeInteger(existing.pid)
    || typeof existing.lockToken !== 'string'
    || typeof leaseSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(leaseSha256)
    || semanticHash(core) !== leaseSha256
  ) {
    fail('PROJECT_PLANNING_RUNTIME_WRITER_CONFLICT', 'Project Planning writer lease is corrupt or substituted');
  }
  if (typeof expectedLeaseSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedLeaseSha256) ||
      expectedLeaseSha256 !== leaseSha256) {
    fail('PROJECT_PLANNING_RUNTIME_RECOVERY_STALE', 'Project Planning recovery lease identity is stale');
  }
  const state = processState(existing.pid);
  if (state !== 'ABSENT') {
    fail('PROJECT_PLANNING_RUNTIME_WRITER_CONFLICT', 'Project Planning writer is active or unverifiable');
  }
  readCurrent(paths);
  fs.unlinkSync(paths.lock);
  return Object.freeze({
    state: 'RECOVERED',
    projectRef,
    recovered: true,
    recoveredLeaseSha256: leaseSha256,
    effects: Object.freeze({
      homeMutationPerformed: true,
      writerLeaseDeletionPerformed: true,
      providerMutationPerformed: false,
    }),
  });
}

export function readProjectPlanningRuntimeSnapshot({ home, projectRef } = {}) {
  const paths = roots(home, projectRef);
  return readCurrent(paths);
}

export function applyProjectPlanningRuntimeTransaction({
  home,
  transaction,
  projectSnapshot,
  knownLaneRefs = [],
  knownViewRefs = [],
  registry
} = {}) {
  if (!transaction || typeof transaction !== 'object') fail('PROJECT_PLANNING_RUNTIME_INPUT_INVALID', 'planning transaction is required');
  const projectRef = stableRef(transaction.projectRef, 'projectRef');
  const instanceRef = stableRef(transaction.instanceRef, 'instanceRef');
  const observedAt = canonicalTimestamp(transaction.formedAt, 'formedAt');
  const paths = roots(home, projectRef);
  return withWriter(paths, projectRef, instanceRef, observedAt, () => {
    const current = readCurrent(paths);
    assertExpectedPointer(current.pointer, transaction.expectedPlanningPointerSha256OrNull);
    const applied = applyProjectPlanningTransaction({
      snapshot: current.snapshot,
      transaction,
      projectSnapshot,
      knownLaneRefs,
      knownViewRefs,
      registry
    });
    if (!applied.changed) {
      return Object.freeze({
        state: 'CURRENT',
        changed: false,
        reason: applied.reason,
        pointer: current.pointer,
        snapshot: current.snapshot,
        event: null
      });
    }

    const eventFile = under(
      paths.home,
      path.join(paths.events, `${String(applied.event.sequence).padStart(12, '0')}-${applied.event.semanticFingerprint}.json`)
    );
    writeImmutable(paths.home, eventFile, applied.event, 'PROJECT_PLANNING_RUNTIME_EVENT_CONFLICT');
    const snapshotFile = under(paths.home, path.join(paths.snapshots, `${applied.snapshot.semanticFingerprint}.json`));
    writeImmutable(paths.home, snapshotFile, applied.snapshot, 'PROJECT_PLANNING_RUNTIME_SNAPSHOT_CONFLICT');
    const pointer = sealPointer(pointerCore(applied.snapshot, current.snapshot?.semanticFingerprint ?? null));
    writeCurrent(paths, pointer);
    return Object.freeze({
      state: 'CURRENT',
      changed: true,
      reason: null,
      pointer,
      snapshot: applied.snapshot,
      event: applied.event
    });
  });
}

// [VXG RealForever]
