import fs from 'node:fs';
import path from 'node:path';

import {
  restoreConcernAggregate,
  serializeConcernAggregate
} from './concern-watch.mjs';
import { canonicalize, semanticHash } from './utils.mjs';

export const CONCERN_WATCH_RUNTIME_SNAPSHOT_SCHEMA = 'vexlife.concern-watch-runtime-snapshot/v1';
export const CONCERN_WATCH_RUNTIME_SNAPSHOT_OWNER_REF = 'owner.vexlife.concern-watch';
export const CONCERN_WATCH_RUNTIME_SNAPSHOT_SOURCE_REF = 'source.vexlife.concern-watch.runtime-snapshot.001';

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
  if (typeof home !== 'string' || !home) fail('CONCERN_WATCH_RUNTIME_HOME_INVALID', 'Vex Home path is required');
  const requested = path.resolve(home);
  let stat;
  try { stat = fs.lstatSync(requested); } catch (error) {
    fail('CONCERN_WATCH_RUNTIME_HOME_INVALID', 'Vex Home is unavailable', { cause: error.message });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('CONCERN_WATCH_RUNTIME_HOME_INVALID', 'Vex Home must be one canonical directory');
  }
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) {
    fail('CONCERN_WATCH_RUNTIME_HOME_INVALID', 'Vex Home root is not canonical', { requested, real });
  }
  return real;
}

function under(home, target) {
  const full = path.resolve(target);
  const relative = path.relative(home, full);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('CONCERN_WATCH_RUNTIME_PATH_INVALID', 'Concern Watch runtime snapshot path escapes Vex Home');
  }
  let cursor = home;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      fail('CONCERN_WATCH_RUNTIME_PATH_INVALID', 'Concern Watch runtime snapshot path traverses symbolic alias', { path: cursor });
    }
    if (!samePath(fs.realpathSync.native(cursor), cursor)) {
      fail('CONCERN_WATCH_RUNTIME_PATH_INVALID', 'Concern Watch runtime snapshot path traverses non-canonical alias', { path: cursor });
    }
  }
  return full;
}

function roots(home) {
  const rootHome = canonicalHome(home);
  const root = under(rootHome, path.join(rootHome, 'runtime', 'concern-watch'));
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
    const existing = readCanonicalJson(home, file, 'CONCERN_WATCH_RUNTIME_SNAPSHOT_CORRUPT');
    if (canonicalBytes(existing) !== bytes) {
      fail('CONCERN_WATCH_RUNTIME_SNAPSHOT_CONFLICT', 'content-addressed Concern Watch snapshot already exists with different bytes');
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

function restoreCanonical(aggregate, registry) {
  if (!registry) fail('CONCERN_WATCH_RUNTIME_REGISTRY_INVALID', 'canonical Concern Watch registry is required');
  let serialized;
  try {
    serialized = serializeConcernAggregate(aggregate, { registry });
  } catch (error) {
    fail('CONCERN_WATCH_RUNTIME_SNAPSHOT_INVALID', 'Concern Watch aggregate is not canonical owner truth', { cause: error.message });
  }
  let restored;
  try {
    restored = restoreConcernAggregate(serialized, { registry });
  } catch (error) {
    fail('CONCERN_WATCH_RUNTIME_SNAPSHOT_INVALID', 'Concern Watch aggregate cannot restore through the accepted owner surface', { cause: error.message });
  }
  if (
    typeof restored?.aggregateRef !== 'string'
    || !restored.aggregateRef
    || typeof restored?.semanticFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/u.test(restored.semanticFingerprint)
    || semanticHash(restored) !== semanticHash(aggregate)
  ) {
    fail('CONCERN_WATCH_RUNTIME_SNAPSHOT_INVALID', 'Concern Watch restore changed canonical aggregate identity');
  }
  return restored;
}

function pointerCore(aggregate, payloadSha256, priorSemanticFingerprint = null) {
  return {
    schemaVersion: CONCERN_WATCH_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: CONCERN_WATCH_RUNTIME_SNAPSHOT_OWNER_REF,
    sourceRef: CONCERN_WATCH_RUNTIME_SNAPSHOT_SOURCE_REF,
    currentness: 'CURRENT',
    aggregateRef: aggregate.aggregateRef,
    semanticFingerprint: aggregate.semanticFingerprint,
    payloadSha256,
    priorSemanticFingerprint
  };
}

function sealPointer(core) {
  return Object.freeze({ ...core, pointerSha256: semanticHash(core) });
}

function validatePointer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('CONCERN_WATCH_RUNTIME_POINTER_CORRUPT', 'Concern Watch runtime pointer is invalid');
  }
  const { pointerSha256, ...core } = value;
  if (
    value.schemaVersion !== CONCERN_WATCH_RUNTIME_SNAPSHOT_SCHEMA
    || value.ownerRef !== CONCERN_WATCH_RUNTIME_SNAPSHOT_OWNER_REF
    || value.sourceRef !== CONCERN_WATCH_RUNTIME_SNAPSHOT_SOURCE_REF
    || value.currentness !== 'CURRENT'
    || typeof value.aggregateRef !== 'string'
    || !value.aggregateRef
    || typeof value.semanticFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.semanticFingerprint)
    || typeof value.payloadSha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.payloadSha256)
    || semanticHash(core) !== pointerSha256
  ) {
    fail('CONCERN_WATCH_RUNTIME_POINTER_CORRUPT', 'Concern Watch runtime pointer is stale, substituted, or corrupt');
  }
  return value;
}

function identityAddress(aggregateRef) {
  return semanticHash({
    schemaVersion: CONCERN_WATCH_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: CONCERN_WATCH_RUNTIME_SNAPSHOT_OWNER_REF,
    aggregateRef
  });
}

function assertNonRegressive(prior, next) {
  if (prior.aggregateRef !== next.aggregateRef) {
    fail('CONCERN_WATCH_RUNTIME_STALE', 'Concern Watch aggregate identity cannot be rewritten');
  }
  const left = prior.events ?? [];
  const right = next.events ?? [];
  if (left.length > right.length) {
    fail('CONCERN_WATCH_RUNTIME_STALE', 'Concern Watch current snapshot cannot discard owner event history');
  }
  for (let index = 0; index < left.length; index += 1) {
    if (canonicalBytes(left[index]) !== canonicalBytes(right[index])) {
      fail('CONCERN_WATCH_RUNTIME_STALE', 'Concern Watch current snapshot cannot rewrite owner event history');
    }
  }
}

function readPointedAggregate(paths, pointer, registry) {
  const snapshotPath = under(paths.home, path.join(paths.snapshots, `${pointer.semanticFingerprint}.json`));
  if (!fs.existsSync(snapshotPath)) {
    fail('CONCERN_WATCH_RUNTIME_SNAPSHOT_MISSING', 'Concern Watch current pointer references a missing snapshot');
  }
  const aggregate = restoreCanonical(
    readCanonicalJson(paths.home, snapshotPath, 'CONCERN_WATCH_RUNTIME_SNAPSHOT_CORRUPT'),
    registry
  );
  if (
    aggregate.aggregateRef !== pointer.aggregateRef
    || aggregate.semanticFingerprint !== pointer.semanticFingerprint
    || semanticHash(aggregate) !== pointer.payloadSha256
  ) {
    fail('CONCERN_WATCH_RUNTIME_SNAPSHOT_CORRUPT', 'Concern Watch snapshot does not match its current pointer');
  }
  return aggregate;
}

export function persistConcernWatchRuntimeSnapshot({ home, aggregate, registry } = {}) {
  const canonical = restoreCanonical(aggregate, registry);
  const paths = roots(home);
  const address = identityAddress(canonical.aggregateRef);
  const currentPath = under(paths.home, path.join(paths.current, `${address}.json`));
  let priorPointer = null;
  if (fs.existsSync(currentPath)) {
    priorPointer = validatePointer(readCanonicalJson(paths.home, currentPath, 'CONCERN_WATCH_RUNTIME_POINTER_CORRUPT'));
    if (priorPointer.aggregateRef !== canonical.aggregateRef) {
      fail('CONCERN_WATCH_RUNTIME_POINTER_CORRUPT', 'Concern Watch current pointer is stored under the wrong owner-local identity');
    }
    const prior = readPointedAggregate(paths, priorPointer, registry);
    if (prior.semanticFingerprint === canonical.semanticFingerprint) {
      return Object.freeze({ state: 'CURRENT', pointer: priorPointer, aggregate: prior });
    }
    assertNonRegressive(prior, canonical);
  }

  const payloadSha256 = semanticHash(canonical);
  const snapshotPath = under(paths.home, path.join(paths.snapshots, `${canonical.semanticFingerprint}.json`));
  writeImmutable(paths.home, snapshotPath, canonical);
  const pointer = sealPointer(pointerCore(canonical, payloadSha256, priorPointer?.semanticFingerprint ?? null));
  writeCurrent(paths.home, currentPath, pointer);
  return Object.freeze({ state: 'CURRENT', pointer, aggregate: Object.freeze(structuredClone(canonical)) });
}

export function readConcernWatchRuntimeSnapshots({ home, registry } = {}) {
  const paths = roots(home);
  if (!fs.existsSync(paths.current)) {
    fail('CONCERN_WATCH_RUNTIME_UNAVAILABLE', 'Concern Watch runtime snapshot surface is unavailable');
  }
  const stat = fs.lstatSync(paths.current);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('CONCERN_WATCH_RUNTIME_POINTER_CORRUPT', 'Concern Watch current pointer root is invalid');
  }
  const aggregates = [];
  for (const entry of fs.readdirSync(paths.current, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith('.json')) {
      fail('CONCERN_WATCH_RUNTIME_POINTER_CORRUPT', 'Concern Watch current pointer enumeration is invalid');
    }
    const pointerPath = under(paths.home, path.join(paths.current, entry.name));
    const pointer = validatePointer(readCanonicalJson(paths.home, pointerPath, 'CONCERN_WATCH_RUNTIME_POINTER_CORRUPT'));
    if (entry.name !== `${identityAddress(pointer.aggregateRef)}.json`) {
      fail('CONCERN_WATCH_RUNTIME_POINTER_CORRUPT', 'Concern Watch current pointer is stored under the wrong owner-local address');
    }
    aggregates.push(readPointedAggregate(paths, pointer, registry));
  }
  if (!aggregates.length) fail('CONCERN_WATCH_RUNTIME_UNAVAILABLE', 'No current Concern Watch runtime snapshots exist');
  aggregates.sort((left, right) => left.aggregateRef.localeCompare(right.aggregateRef));
  return Object.freeze(aggregates.map((aggregate) => Object.freeze(structuredClone(aggregate))));
}

// [VXG RealForever]
