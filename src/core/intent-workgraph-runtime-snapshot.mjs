import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildGraphSnapshotFingerprint,
  recordIntentTransition
} from './intent-workgraph.mjs';
import { canonicalize, semanticHash } from './utils.mjs';

export const INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SCHEMA = 'vexlife.intent-workgraph-runtime-snapshot/v1';
export const INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_OWNER_REF = 'owner.vexlife.intent-workgraph';
export const INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SOURCE_REF = 'source.vexlife.intent-workgraph.runtime-snapshot.001';
export const INTENT_WORKGRAPH_RUNTIME_WRITER_SCHEMA = 'vexlife.intent-workgraph-runtime-writer/v1';

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
  if (typeof home !== 'string' || !home) fail('INTENT_WORKGRAPH_RUNTIME_HOME_INVALID', 'Vex Home path is required');
  const requested = path.resolve(home);
  let stat;
  try { stat = fs.lstatSync(requested); } catch (error) {
    fail('INTENT_WORKGRAPH_RUNTIME_HOME_INVALID', 'Vex Home is unavailable', { cause: error.message });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('INTENT_WORKGRAPH_RUNTIME_HOME_INVALID', 'Vex Home must be one canonical directory');
  }
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) {
    fail('INTENT_WORKGRAPH_RUNTIME_HOME_INVALID', 'Vex Home root is not canonical', { requested, real });
  }
  return real;
}

function under(home, target) {
  const full = path.resolve(target);
  const relative = path.relative(home, full);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('INTENT_WORKGRAPH_RUNTIME_PATH_INVALID', 'Intent Workgraph runtime snapshot path escapes Vex Home');
  }
  let cursor = home;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      fail('INTENT_WORKGRAPH_RUNTIME_PATH_INVALID', 'Intent Workgraph runtime snapshot path traverses symbolic alias', { path: cursor });
    }
    if (!samePath(fs.realpathSync.native(cursor), cursor)) {
      fail('INTENT_WORKGRAPH_RUNTIME_PATH_INVALID', 'Intent Workgraph runtime snapshot path traverses non-canonical alias', { path: cursor });
    }
  }
  return full;
}

function roots(home) {
  const rootHome = canonicalHome(home);
  const root = under(rootHome, path.join(rootHome, 'runtime', 'intent-workgraph'));
  return Object.freeze({
    home: rootHome,
    root,
    snapshots: under(rootHome, path.join(root, 'snapshots')),
    current: under(rootHome, path.join(root, 'current')),
    locks: under(rootHome, path.join(root, 'locks'))
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
    const existing = readCanonicalJson(home, file, 'INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_CORRUPT');
    if (canonicalBytes(existing) !== bytes) {
      fail('INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_CONFLICT', 'content-addressed Workgraph snapshot already exists with different bytes');
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

function pointerCore(graph, payloadSha256, priorSemanticFingerprint = null) {
  return {
    schemaVersion: INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_OWNER_REF,
    sourceRef: INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SOURCE_REF,
    currentness: 'CURRENT',
    graphRef: graph.graphRef,
    rootIntentRef: graph.rootIntentRef,
    semanticFingerprint: graph.semanticFingerprint,
    payloadSha256,
    priorSemanticFingerprint
  };
}

function sealPointer(core) {
  return Object.freeze({ ...core, pointerSha256: semanticHash(core) });
}

function validatePointer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Workgraph runtime pointer is invalid');
  }
  const { pointerSha256, ...core } = value;
  if (
    value.schemaVersion !== INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SCHEMA
    || value.ownerRef !== INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_OWNER_REF
    || value.sourceRef !== INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SOURCE_REF
    || value.currentness !== 'CURRENT'
    || typeof value.graphRef !== 'string'
    || !value.graphRef
    || typeof value.semanticFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.semanticFingerprint)
    || typeof value.payloadSha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.payloadSha256)
    || semanticHash(core) !== pointerSha256
  ) {
    fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Workgraph runtime pointer is stale, substituted, or corrupt');
  }
  return value;
}

function validateGraph(graph) {
  if (
    !graph
    || typeof graph !== 'object'
    || Array.isArray(graph)
    || graph.schemaVersion !== 'vexlife.intent-workgraph/v0'
    || typeof graph.graphRef !== 'string'
    || !graph.graphRef
    || typeof graph.rootIntentRef !== 'string'
    || graph.rootIntentRef !== graph.intent?.intentRef
    || typeof graph.semanticFingerprint !== 'string'
    || buildGraphSnapshotFingerprint(graph) !== graph.semanticFingerprint
  ) {
    fail('INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_INVALID', 'Intent Workgraph snapshot is not canonical current Workgraph truth');
  }
  return graph;
}

function identityAddress(graphRef) {
  return semanticHash({
    schemaVersion: INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SCHEMA,
    ownerRef: INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_OWNER_REF,
    graphRef
  });
}

function subsetByRef(prior = [], next = [], refField) {
  const nextByRef = new Map(next.map((item) => [item?.[refField], canonicalBytes(item)]));
  return prior.every((item) => nextByRef.get(item?.[refField]) === canonicalBytes(item));
}

function assertNonRegressive(prior, next) {
  if (prior.graphRef !== next.graphRef || prior.rootIntentRef !== next.rootIntentRef || prior.createdAt !== next.createdAt) {
    fail('INTENT_WORKGRAPH_RUNTIME_STALE', 'Workgraph current snapshot identity cannot be rewritten');
  }
  for (const [field, refField] of [
    ['transitions', 'transitionRef'],
    ['receipts', 'receiptRef']
  ]) {
    if (!subsetByRef(prior[field], next[field], refField)) {
      fail('INTENT_WORKGRAPH_RUNTIME_STALE', `Workgraph current snapshot regresses ${field}`);
    }
  }
  const priorAssignments = prior.acceptedAssignments ?? [];
  const nextAssignments = next.acceptedAssignments ?? [];
  const nextByRef = new Map(nextAssignments.map((item) => [item?.assignmentRef, item]));
  for (const assignment of priorAssignments) {
    const current = nextByRef.get(assignment?.assignmentRef);
    if (!current || current.semanticFingerprint !== assignment.semanticFingerprint) {
      fail('INTENT_WORKGRAPH_RUNTIME_STALE', 'Workgraph current snapshot regresses accepted assignment lineage');
    }
  }
}

function readPointedGraph(paths, pointer) {
  const snapshotPath = under(paths.home, path.join(paths.snapshots, `${pointer.semanticFingerprint}.json`));
  if (!fs.existsSync(snapshotPath)) {
    fail('INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_MISSING', 'Workgraph current pointer references a missing snapshot');
  }
  const graph = validateGraph(readCanonicalJson(paths.home, snapshotPath, 'INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_CORRUPT'));
  if (
    graph.graphRef !== pointer.graphRef
    || graph.rootIntentRef !== pointer.rootIntentRef
    || graph.semanticFingerprint !== pointer.semanticFingerprint
    || semanticHash(graph) !== pointer.payloadSha256
  ) {
    fail('INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_CORRUPT', 'Workgraph snapshot does not match its current pointer');
  }
  return graph;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') fail('INTENT_WORKGRAPH_RUNTIME_WRITER_INVALID', `${label} must be one canonical UTC timestamp`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) {
    fail('INTENT_WORKGRAPH_RUNTIME_WRITER_INVALID', `${label} must be one canonical UTC timestamp`);
  }
  return value;
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)) {
    fail('INTENT_WORKGRAPH_RUNTIME_WRITER_INVALID', `${label} must be one stable ref`);
  }
  return value;
}

function writeExclusive(home, file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  under(home, path.dirname(file));
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
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

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'UNVERIFIABLE';
  if (pid === process.pid) return 'ACTIVE';
  try {
    process.kill(pid, 0);
    return 'ACTIVE';
  } catch (error) {
    return error?.code === 'ESRCH' ? 'ABSENT' : error?.code === 'EPERM' ? 'ACTIVE' : 'UNVERIFIABLE';
  }
}

function writerPath(paths, graphRef) {
  return under(paths.home, path.join(paths.locks, `${identityAddress(graphRef)}.lock`));
}

function acquireWriter(paths, graphRef, instanceRef, observedAt) {
  fs.mkdirSync(paths.locks, { recursive: true });
  const lock = writerPath(paths, graphRef);
  const core = {
    schemaVersion: INTENT_WORKGRAPH_RUNTIME_WRITER_SCHEMA,
    graphRef: stableRef(graphRef, 'graphRef'),
    instanceRef: stableRef(instanceRef, 'instanceRef'),
    pid: process.pid,
    lockToken: crypto.randomUUID(),
    formedAt: canonicalTimestamp(observedAt, 'observedAt')
  };
  const lease = Object.freeze({ ...core, leaseSha256: semanticHash(core) });
  if (!writeExclusive(paths.home, lock, lease)) {
    let existing;
    try {
      existing = readCanonicalJson(paths.home, lock, 'INTENT_WORKGRAPH_RUNTIME_WRITER_CONFLICT');
    } catch {
      fail('INTENT_WORKGRAPH_RUNTIME_WRITER_CONFLICT', 'Workgraph writer lease is unverifiable');
    }
    const state = processState(existing.pid);
    fail(
      state === 'ABSENT' ? 'INTENT_WORKGRAPH_RUNTIME_WRITER_RECOVERY_REQUIRED' : 'INTENT_WORKGRAPH_RUNTIME_WRITER_CONFLICT',
      state === 'ABSENT'
        ? 'abandoned Workgraph writer requires explicit recovery'
        : 'Workgraph writer is active or unverifiable'
    );
  }
  return Object.freeze({ path: lock, token: lease.lockToken });
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

function withWriter(paths, graphRef, instanceRef, observedAt, fn) {
  const lease = acquireWriter(paths, graphRef, instanceRef, observedAt);
  let result;
  let caught = null;
  try {
    result = fn();
  } catch (error) {
    caught = error;
  }
  const released = releaseWriter(lease);
  if (!released && !caught) {
    fail('INTENT_WORKGRAPH_RUNTIME_WRITER_CONFLICT', 'Workgraph writer release could not be proven');
  }
  if (caught) throw caught;
  return result;
}

function assertExpectedPointer(priorPointer, expectedPointerSha256) {
  if (expectedPointerSha256 === undefined) return;
  if (expectedPointerSha256 === null) {
    if (priorPointer !== null) {
      fail('INTENT_WORKGRAPH_RUNTIME_STALE', 'Workgraph current pointer exists but transaction expected an absent pointer');
    }
    return;
  }
  if (typeof expectedPointerSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedPointerSha256)) {
    fail('INTENT_WORKGRAPH_RUNTIME_STALE', 'expectedPointerSha256 must be null or lowercase SHA-256');
  }
  if (priorPointer?.pointerSha256 !== expectedPointerSha256) {
    fail('INTENT_WORKGRAPH_RUNTIME_STALE', 'Workgraph current pointer changed before transaction admission', {
      expectedPointerSha256,
      observedPointerSha256: priorPointer?.pointerSha256 ?? null
    });
  }
}

function persistUnderWriter(paths, graph, expectedPointerSha256 = undefined) {
  validateGraph(graph);
  const address = identityAddress(graph.graphRef);
  const currentPath = under(paths.home, path.join(paths.current, `${address}.json`));
  let priorPointer = null;
  let priorGraph = null;
  if (fs.existsSync(currentPath)) {
    priorPointer = validatePointer(readCanonicalJson(paths.home, currentPath, 'INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT'));
    if (priorPointer.graphRef !== graph.graphRef) {
      fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Workgraph current pointer is stored under the wrong owner-local address');
    }
    priorGraph = readPointedGraph(paths, priorPointer);
  }
  assertExpectedPointer(priorPointer, expectedPointerSha256);
  if (priorGraph?.semanticFingerprint === graph.semanticFingerprint) {
    return Object.freeze({ state: 'CURRENT', changed: false, pointer: priorPointer, graph: priorGraph });
  }
  if (priorGraph) assertNonRegressive(priorGraph, graph);

  const payloadSha256 = semanticHash(graph);
  const snapshotPath = under(paths.home, path.join(paths.snapshots, `${graph.semanticFingerprint}.json`));
  writeImmutable(paths.home, snapshotPath, graph);
  const pointer = sealPointer(pointerCore(graph, payloadSha256, priorPointer?.semanticFingerprint ?? null));
  writeCurrent(paths.home, currentPath, pointer);
  return Object.freeze({ state: 'CURRENT', changed: true, pointer, graph: structuredClone(graph) });
}

export function recoverIntentWorkgraphRuntimeWriter({
  home,
  graphRef,
  expectedLeaseSha256,
} = {}) {
  stableRef(graphRef, 'graphRef');
  const paths = roots(home);
  const lock = writerPath(paths, graphRef);
  if (!fs.existsSync(lock)) {
    return Object.freeze({
      state: 'RECOVERY_NOT_REQUIRED',
      graphRef,
      recovered: false,
      effects: Object.freeze({
        homeMutationPerformed: false,
        writerLeaseDeletionPerformed: false,
        providerMutationPerformed: false,
      }),
    });
  }
  const existing = readCanonicalJson(paths.home, lock, 'INTENT_WORKGRAPH_RUNTIME_WRITER_CONFLICT');
  const { leaseSha256, ...core } = existing;
  if (
    existing.schemaVersion !== INTENT_WORKGRAPH_RUNTIME_WRITER_SCHEMA
    || existing.graphRef !== graphRef
    || typeof existing.instanceRef !== 'string'
    || !Number.isSafeInteger(existing.pid)
    || typeof existing.lockToken !== 'string'
    || typeof leaseSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(leaseSha256)
    || semanticHash(core) !== leaseSha256
  ) {
    fail('INTENT_WORKGRAPH_RUNTIME_WRITER_CONFLICT', 'Workgraph writer lease is corrupt or substituted');
  }
  if (typeof expectedLeaseSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedLeaseSha256) ||
      expectedLeaseSha256 !== leaseSha256) {
    fail('INTENT_WORKGRAPH_RUNTIME_RECOVERY_STALE', 'Workgraph recovery lease identity is stale');
  }
  const state = processState(existing.pid);
  if (state !== 'ABSENT') {
    fail('INTENT_WORKGRAPH_RUNTIME_WRITER_CONFLICT', 'Workgraph writer is active or unverifiable');
  }
  const currentPath = under(paths.home, path.join(paths.current, `${identityAddress(graphRef)}.json`));
  if (fs.existsSync(currentPath)) {
    const pointer = validatePointer(readCanonicalJson(paths.home, currentPath, 'INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT'));
    if (pointer.graphRef !== graphRef) {
      fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Workgraph current pointer identity does not match recovery graphRef');
    }
    readPointedGraph(paths, pointer);
  }
  fs.unlinkSync(lock);
  return Object.freeze({
    state: 'RECOVERED',
    graphRef,
    recovered: true,
    recoveredLeaseSha256: leaseSha256,
    effects: Object.freeze({
      homeMutationPerformed: true,
      writerLeaseDeletionPerformed: true,
      providerMutationPerformed: false,
    }),
  });
}

export function persistIntentWorkgraphRuntimeSnapshot({
  home,
  graph,
  instanceRef = 'instance.vexlife.intent-workgraph-runtime.persist',
  observedAt = new Date().toISOString()
} = {}) {
  validateGraph(graph);
  const paths = roots(home);
  return withWriter(paths, graph.graphRef, instanceRef, observedAt, () =>
    persistUnderWriter(paths, graph)
  );
}

export function recordIntentWorkgraphRuntimeTransition({
  home,
  graphRef,
  expectedPointerSha256,
  transition,
  registry,
  instanceRef,
  observedAt
} = {}) {
  stableRef(graphRef, 'graphRef');
  stableRef(instanceRef, 'instanceRef');
  canonicalTimestamp(observedAt, 'observedAt');
  if (!registry || typeof registry !== 'object') {
    fail('INTENT_WORKGRAPH_RUNTIME_TRANSITION_INVALID', 'intent registry is required');
  }
  const paths = roots(home);
  return withWriter(paths, graphRef, instanceRef, observedAt, () => {
    const currentPath = under(paths.home, path.join(paths.current, `${identityAddress(graphRef)}.json`));
    if (!fs.existsSync(currentPath)) {
      fail('INTENT_WORKGRAPH_RUNTIME_UNAVAILABLE', 'Workgraph current pointer is unavailable for transition');
    }
    const priorPointer = validatePointer(readCanonicalJson(
      paths.home,
      currentPath,
      'INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT'
    ));
    if (priorPointer.graphRef !== graphRef) {
      fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Workgraph current pointer identity does not match transition graphRef');
    }
    assertExpectedPointer(priorPointer, expectedPointerSha256);
    const priorGraph = readPointedGraph(paths, priorPointer);
    const applied = recordIntentTransition(priorGraph, transition, registry);
    if (!applied.changed) {
      return Object.freeze({
        state: 'CURRENT',
        changed: false,
        reason: applied.reason,
        transition: null,
        pointer: priorPointer,
        graph: priorGraph
      });
    }
    const persisted = persistUnderWriter(paths, applied.graph, priorPointer.pointerSha256);
    return Object.freeze({
      state: persisted.state,
      changed: persisted.changed,
      reason: null,
      transition: applied.transition,
      pointer: persisted.pointer,
      graph: persisted.graph
    });
  });
}

export function readIntentWorkgraphRuntimeSnapshotEntries({ home } = {}) {
  const paths = roots(home);
  if (!fs.existsSync(paths.current)) {
    fail('INTENT_WORKGRAPH_RUNTIME_UNAVAILABLE', 'Intent Workgraph runtime snapshot surface is unavailable');
  }
  const stat = fs.lstatSync(paths.current);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Intent Workgraph current pointer root is invalid');
  }
  const entries = [];
  for (const entry of fs.readdirSync(paths.current, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith('.json')) {
      fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Intent Workgraph current pointer enumeration is invalid');
    }
    const pointerPath = under(paths.home, path.join(paths.current, entry.name));
    const pointer = validatePointer(readCanonicalJson(paths.home, pointerPath, 'INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT'));
    if (entry.name !== `${identityAddress(pointer.graphRef)}.json`) {
      fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Intent Workgraph current pointer is stored under the wrong owner-local address');
    }
    const graph = readPointedGraph(paths, pointer);
    entries.push(Object.freeze({
      pointer: Object.freeze(structuredClone(pointer)),
      graph: Object.freeze(structuredClone(graph))
    }));
  }
  if (!entries.length) fail('INTENT_WORKGRAPH_RUNTIME_UNAVAILABLE', 'No current Intent Workgraph runtime snapshots exist');
  entries.sort((left, right) => left.graph.graphRef.localeCompare(right.graph.graphRef));
  return Object.freeze(entries);
}

export function readIntentWorkgraphRuntimeSnapshots({ home } = {}) {
  return Object.freeze(readIntentWorkgraphRuntimeSnapshotEntries({ home }).map((entry) => entry.graph));
}

// [VXG RealForever]
