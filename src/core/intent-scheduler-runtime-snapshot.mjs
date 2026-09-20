import fs from 'node:fs';
import path from 'node:path';

import { SingleWorkerIntentScheduler } from './intent-scheduler.mjs';
import { createIntentSchedulerState } from './state.mjs';
import { canonicalize, semanticHash } from './utils.mjs';

export const INTENT_SCHEDULER_RUNTIME_SNAPSHOT_SCHEMA = 'vexlife.intent-scheduler-runtime-snapshot/v1';
export const INTENT_SCHEDULER_RUNTIME_SNAPSHOT_OWNER_REF = 'owner.vexlife.intent-scheduler';
export const INTENT_SCHEDULER_RUNTIME_SNAPSHOT_SOURCE_REF = 'source.vexlife.intent-scheduler.runtime-snapshot.001';

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
  if (typeof home !== 'string' || !home) fail('INTENT_SCHEDULER_RUNTIME_HOME_INVALID', 'Vex Home path is required');
  const requested = path.resolve(home);
  let stat;
  try { stat = fs.lstatSync(requested); } catch (error) {
    fail('INTENT_SCHEDULER_RUNTIME_HOME_INVALID', 'Vex Home is unavailable', { cause: error.message });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('INTENT_SCHEDULER_RUNTIME_HOME_INVALID', 'Vex Home must be one canonical directory');
  }
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) {
    fail('INTENT_SCHEDULER_RUNTIME_HOME_INVALID', 'Vex Home root is not canonical', { requested, real });
  }
  return real;
}

function under(home, target) {
  const full = path.resolve(target);
  const relative = path.relative(home, full);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('INTENT_SCHEDULER_RUNTIME_PATH_INVALID', 'Intent Scheduler runtime snapshot path escapes Vex Home');
  }
  let cursor = home;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      fail('INTENT_SCHEDULER_RUNTIME_PATH_INVALID', 'Intent Scheduler runtime snapshot path traverses symbolic alias', { path: cursor });
    }
    if (!samePath(fs.realpathSync.native(cursor), cursor)) {
      fail('INTENT_SCHEDULER_RUNTIME_PATH_INVALID', 'Intent Scheduler runtime snapshot path traverses non-canonical alias', { path: cursor });
    }
  }
  return full;
}

function roots(home) {
  const rootHome = canonicalHome(home);
  const root = under(rootHome, path.join(rootHome, 'runtime', 'intent-scheduler'));
  return Object.freeze({
    home: rootHome,
    root,
    snapshots: under(rootHome, path.join(root, 'snapshots')),
    current: under(rootHome, path.join(root, 'current'))
  });
}

function canonicalBytes(value) {
  return JSON.stringify(canonicalize(value));
}

function readCanonicalJson(home, file, code) {
  let raw;
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail(code, 'runtime snapshot object must be one regular file');
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === code) throw error;
    fail(code, 'runtime snapshot object could not be read', { cause: error.message });
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch {
    fail(code, 'runtime snapshot object is malformed JSON');
  }
  if (raw !== canonicalBytes(parsed)) fail(code, 'runtime snapshot object bytes are not canonical');
  under(home, file);
  return parsed;
}

function writeImmutable(home, file, value) {
  const bytes = canonicalBytes(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  under(home, path.dirname(file));
  if (fs.existsSync(file)) {
    const existing = readCanonicalJson(home, file, 'INTENT_SCHEDULER_RUNTIME_SNAPSHOT_CORRUPT');
    if (canonicalBytes(existing) !== bytes) {
      fail('INTENT_SCHEDULER_RUNTIME_SNAPSHOT_CONFLICT', 'content-addressed Scheduler snapshot already exists with different bytes');
    }
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

function writeCurrent(home, file, pointer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  under(home, path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${semanticHash({ file, pointer, at: Date.now() }).slice(0, 16)}`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, canonicalBytes(pointer), 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  }
}

function validateAggregate(aggregate, schedulerRegistry) {
  if (!schedulerRegistry?.registryRef) {
    fail('INTENT_SCHEDULER_RUNTIME_REGISTRY_INVALID', 'canonical Intent Scheduler registry is required');
  }
  try {
    createIntentSchedulerState({ aggregate, schedulerRegistry });
  } catch (error) {
    fail('INTENT_SCHEDULER_RUNTIME_SNAPSHOT_INVALID', 'Intent Scheduler aggregate is not canonical replay-valid truth', { cause: error.message });
  }
  if (typeof aggregate?.semanticFingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(aggregate.semanticFingerprint)) {
    fail('INTENT_SCHEDULER_RUNTIME_SNAPSHOT_INVALID', 'Intent Scheduler aggregate semantic fingerprint is invalid');
  }
  return aggregate;
}

function pointerCore({ workerRef, schedulerInstanceRef, aggregate, payloadSha256, priorSemanticFingerprint = null }) {
  return {
    schemaVersion: INTENT_SCHEDULER_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: INTENT_SCHEDULER_RUNTIME_SNAPSHOT_OWNER_REF,
    sourceRef: INTENT_SCHEDULER_RUNTIME_SNAPSHOT_SOURCE_REF,
    currentness: 'CURRENT',
    workerRef,
    schedulerInstanceRef,
    semanticFingerprint: aggregate.semanticFingerprint,
    generation: aggregate.generation,
    observedAt: aggregate.observedClock?.observedAt ?? null,
    payloadSha256,
    priorSemanticFingerprint
  };
}

function sealPointer(core) {
  return Object.freeze({ ...core, pointerSha256: semanticHash(core) });
}

function validatePointer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INTENT_SCHEDULER_RUNTIME_POINTER_CORRUPT', 'Scheduler runtime pointer is invalid');
  }
  const { pointerSha256, ...core } = value;
  if (
    value.schemaVersion !== INTENT_SCHEDULER_RUNTIME_SNAPSHOT_SCHEMA
    || value.ownerRef !== INTENT_SCHEDULER_RUNTIME_SNAPSHOT_OWNER_REF
    || value.sourceRef !== INTENT_SCHEDULER_RUNTIME_SNAPSHOT_SOURCE_REF
    || value.currentness !== 'CURRENT'
    || typeof value.workerRef !== 'string'
    || !value.workerRef
    || typeof value.schedulerInstanceRef !== 'string'
    || !value.schedulerInstanceRef
    || typeof value.semanticFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.semanticFingerprint)
    || typeof value.payloadSha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.payloadSha256)
    || !Number.isSafeInteger(value.generation)
    || value.generation < 0
    || (value.observedAt !== null && (typeof value.observedAt !== 'string' || Number.isNaN(Date.parse(value.observedAt))))
    || semanticHash(core) !== pointerSha256
  ) {
    fail('INTENT_SCHEDULER_RUNTIME_POINTER_CORRUPT', 'Scheduler runtime pointer is stale, substituted, or corrupt');
  }
  return value;
}

function identityAddress(schedulerInstanceRef) {
  return semanticHash({
    schemaVersion: INTENT_SCHEDULER_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: INTENT_SCHEDULER_RUNTIME_SNAPSHOT_OWNER_REF,
    schedulerInstanceRef
  });
}

function observedEpoch(value) {
  if (value === null || value === undefined) return -Infinity;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : -Infinity;
}

function assertLedgerPrefix(prior, next, field) {
  const left = prior[field] ?? [];
  const right = next[field] ?? [];
  if (left.length > right.length) {
    fail('INTENT_SCHEDULER_RUNTIME_STALE', `Scheduler current snapshot regresses ${field}`);
  }
  for (let index = 0; index < left.length; index += 1) {
    if (canonicalBytes(left[index]) !== canonicalBytes(right[index])) {
      fail('INTENT_SCHEDULER_RUNTIME_STALE', `Scheduler current snapshot rewrites ${field}`);
    }
  }
}

function assertNonRegressive(prior, next) {
  if (next.generation < prior.generation) {
    fail('INTENT_SCHEDULER_RUNTIME_STALE', 'Scheduler generation cannot move backward');
  }
  if (observedEpoch(next.observedClock?.observedAt) < observedEpoch(prior.observedClock?.observedAt)) {
    fail('INTENT_SCHEDULER_RUNTIME_STALE', 'Scheduler observed clock cannot move backward');
  }
  if (
    next.generation === prior.generation
    && observedEpoch(next.observedClock?.observedAt) === observedEpoch(prior.observedClock?.observedAt)
    && next.semanticFingerprint !== prior.semanticFingerprint
  ) {
    fail('INTENT_SCHEDULER_RUNTIME_STALE', 'Scheduler current snapshot conflicts at the same generation and observed clock');
  }
  for (const field of [
    'dueTransitionLedger',
    'recoveryClaimLedger',
    'checkpointPointerLedger',
    'missedHostReconciliationLedger'
  ]) assertLedgerPrefix(prior, next, field);
}

function readPointedScheduler(paths, pointer, schedulerRegistry) {
  const snapshotPath = under(paths.home, path.join(paths.snapshots, `${pointer.semanticFingerprint}.json`));
  if (!fs.existsSync(snapshotPath)) {
    fail('INTENT_SCHEDULER_RUNTIME_SNAPSHOT_MISSING', 'Scheduler current pointer references a missing snapshot');
  }
  const aggregate = validateAggregate(
    readCanonicalJson(paths.home, snapshotPath, 'INTENT_SCHEDULER_RUNTIME_SNAPSHOT_CORRUPT'),
    schedulerRegistry
  );
  if (
    aggregate.semanticFingerprint !== pointer.semanticFingerprint
    || aggregate.generation !== pointer.generation
    || (aggregate.observedClock?.observedAt ?? null) !== pointer.observedAt
    || semanticHash(aggregate) !== pointer.payloadSha256
  ) {
    fail('INTENT_SCHEDULER_RUNTIME_SNAPSHOT_CORRUPT', 'Scheduler snapshot does not match its current pointer');
  }
  let scheduler;
  try {
    scheduler = new SingleWorkerIntentScheduler({
      workerRef: pointer.workerRef,
      schedulerInstanceRef: pointer.schedulerInstanceRef,
      schedulerRegistry,
      schedulerAggregate: aggregate
    });
  } catch (error) {
    fail('INTENT_SCHEDULER_RUNTIME_SNAPSHOT_INVALID', 'Scheduler snapshot cannot restore through the accepted Scheduler surface', { cause: error.message });
  }
  if (scheduler.aggregate.semanticFingerprint !== aggregate.semanticFingerprint) {
    fail('INTENT_SCHEDULER_RUNTIME_SNAPSHOT_INVALID', 'Scheduler restore changed aggregate identity');
  }
  return Object.freeze({
    workerRef: pointer.workerRef,
    schedulerInstanceRef: pointer.schedulerInstanceRef,
    aggregate: Object.freeze(structuredClone(scheduler.aggregate))
  });
}

export function persistIntentSchedulerRuntimeSnapshot({ home, scheduler, schedulerRegistry } = {}) {
  const workerRef = scheduler?.workerRef;
  const schedulerInstanceRef = scheduler?.schedulerInstanceRef;
  const aggregate = validateAggregate(scheduler?.aggregate, schedulerRegistry);
  if (typeof workerRef !== 'string' || !workerRef || typeof schedulerInstanceRef !== 'string' || !schedulerInstanceRef) {
    fail('INTENT_SCHEDULER_RUNTIME_OWNER_INVALID', 'Snapshot persistence requires one actual SingleWorkerIntentScheduler identity');
  }
  const paths = roots(home);
  const address = identityAddress(schedulerInstanceRef);
  const currentPath = under(paths.home, path.join(paths.current, `${address}.json`));
  let priorPointer = null;
  if (fs.existsSync(currentPath)) {
    priorPointer = validatePointer(readCanonicalJson(paths.home, currentPath, 'INTENT_SCHEDULER_RUNTIME_POINTER_CORRUPT'));
    if (priorPointer.schedulerInstanceRef !== schedulerInstanceRef || priorPointer.workerRef !== workerRef) {
      fail('INTENT_SCHEDULER_RUNTIME_POINTER_CORRUPT', 'Scheduler current pointer is stored under the wrong owner-local identity');
    }
    const prior = readPointedScheduler(paths, priorPointer, schedulerRegistry).aggregate;
    if (prior.semanticFingerprint === aggregate.semanticFingerprint) {
      return Object.freeze({
        state: 'CURRENT',
        pointer: priorPointer,
        workerRef,
        schedulerInstanceRef,
        aggregate: prior
      });
    }
    assertNonRegressive(prior, aggregate);
  }

  const payloadSha256 = semanticHash(aggregate);
  const snapshotPath = under(paths.home, path.join(paths.snapshots, `${aggregate.semanticFingerprint}.json`));
  writeImmutable(paths.home, snapshotPath, aggregate);
  const pointer = sealPointer(pointerCore({
    workerRef,
    schedulerInstanceRef,
    aggregate,
    payloadSha256,
    priorSemanticFingerprint: priorPointer?.semanticFingerprint ?? null
  }));
  writeCurrent(paths.home, currentPath, pointer);
  return Object.freeze({
    state: 'CURRENT',
    pointer,
    workerRef,
    schedulerInstanceRef,
    aggregate: Object.freeze(structuredClone(aggregate))
  });
}

export function readIntentSchedulerRuntimeSnapshots({ home, schedulerRegistry } = {}) {
  const paths = roots(home);
  if (!fs.existsSync(paths.current)) {
    fail('INTENT_SCHEDULER_RUNTIME_UNAVAILABLE', 'Intent Scheduler runtime snapshot surface is unavailable');
  }
  const stat = fs.lstatSync(paths.current);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('INTENT_SCHEDULER_RUNTIME_POINTER_CORRUPT', 'Intent Scheduler current pointer root is invalid');
  }
  const schedulers = [];
  for (const entry of fs.readdirSync(paths.current, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith('.json')) {
      fail('INTENT_SCHEDULER_RUNTIME_POINTER_CORRUPT', 'Intent Scheduler current pointer enumeration is invalid');
    }
    const pointerPath = under(paths.home, path.join(paths.current, entry.name));
    const pointer = validatePointer(readCanonicalJson(paths.home, pointerPath, 'INTENT_SCHEDULER_RUNTIME_POINTER_CORRUPT'));
    if (entry.name !== `${identityAddress(pointer.schedulerInstanceRef)}.json`) {
      fail('INTENT_SCHEDULER_RUNTIME_POINTER_CORRUPT', 'Intent Scheduler current pointer is stored under the wrong owner-local address');
    }
    schedulers.push(readPointedScheduler(paths, pointer, schedulerRegistry));
  }
  if (!schedulers.length) fail('INTENT_SCHEDULER_RUNTIME_UNAVAILABLE', 'No current Intent Scheduler runtime snapshots exist');
  schedulers.sort((left, right) => left.schedulerInstanceRef.localeCompare(right.schedulerInstanceRef));
  return Object.freeze(schedulers);
}

// [VXG RealForever]
