import fs from 'node:fs';
import path from 'node:path';

import {
  buildGraphSnapshotFingerprint
} from './intent-workgraph.mjs';
import { canonicalize, semanticHash } from './utils.mjs';

export const INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SCHEMA = 'vexlife.intent-workgraph-runtime-snapshot/v1';
export const INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_OWNER_REF = 'owner.vexlife.intent-workgraph';
export const INTENT_WORKGRAPH_RUNTIME_SNAPSHOT_SOURCE_REF = 'source.vexlife.intent-workgraph.runtime-snapshot.001';

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

export function persistIntentWorkgraphRuntimeSnapshot({ home, graph } = {}) {
  validateGraph(graph);
  const paths = roots(home);
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
    if (priorGraph.semanticFingerprint === graph.semanticFingerprint) {
      return Object.freeze({ state: 'CURRENT', pointer: priorPointer, graph: priorGraph });
    }
    assertNonRegressive(priorGraph, graph);
  }

  const payloadSha256 = semanticHash(graph);
  const snapshotPath = under(paths.home, path.join(paths.snapshots, `${graph.semanticFingerprint}.json`));
  writeImmutable(paths.home, snapshotPath, graph);
  const pointer = sealPointer(pointerCore(graph, payloadSha256, priorPointer?.semanticFingerprint ?? null));
  writeCurrent(paths.home, currentPath, pointer);
  return Object.freeze({ state: 'CURRENT', pointer, graph: structuredClone(graph) });
}

export function readIntentWorkgraphRuntimeSnapshots({ home } = {}) {
  const paths = roots(home);
  if (!fs.existsSync(paths.current)) {
    fail('INTENT_WORKGRAPH_RUNTIME_UNAVAILABLE', 'Intent Workgraph runtime snapshot surface is unavailable');
  }
  const stat = fs.lstatSync(paths.current);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Intent Workgraph current pointer root is invalid');
  }
  const graphs = [];
  for (const entry of fs.readdirSync(paths.current, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith('.json')) {
      fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Intent Workgraph current pointer enumeration is invalid');
    }
    const pointerPath = under(paths.home, path.join(paths.current, entry.name));
    const pointer = validatePointer(readCanonicalJson(paths.home, pointerPath, 'INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT'));
    if (entry.name !== `${identityAddress(pointer.graphRef)}.json`) {
      fail('INTENT_WORKGRAPH_RUNTIME_POINTER_CORRUPT', 'Intent Workgraph current pointer is stored under the wrong owner-local address');
    }
    graphs.push(readPointedGraph(paths, pointer));
  }
  if (!graphs.length) fail('INTENT_WORKGRAPH_RUNTIME_UNAVAILABLE', 'No current Intent Workgraph runtime snapshots exist');
  graphs.sort((left, right) => left.graphRef.localeCompare(right.graphRef));
  return Object.freeze(graphs.map((graph) => Object.freeze(structuredClone(graph))));
}

// [VXG RealForever]
