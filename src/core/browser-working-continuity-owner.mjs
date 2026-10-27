import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  verifyContinuityRolloverPlan,
  verifyWorkingContinuityCheckpoint,
  verifyWorkingContinuityCheckpointSupersessionPlan
} from './continuity-rollover.mjs';
import { semanticHash } from './utils.mjs';

export const BROWSER_WORKING_CONTINUITY_OWNER_SCHEMA =
  'vexlife.browser-working-continuity-owner/v1';
export const BROWSER_WORKING_CONTINUITY_COMMIT_RECEIPT_SCHEMA =
  'vexlife.browser-working-continuity-commit-receipt/v1';
export const BROWSER_WORKING_CONTINUITY_HEAD_SCHEMA =
  'vexlife.browser-working-continuity-head/v1';
export const BROWSER_WORKING_CONTINUITY_OWNER_REF =
  'owner.vexlife.browser-working-continuity.001';

const SHA256 = /^[0-9a-f]{64}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:#-]*$/u;
const COMMITTABLE_PLAN_STATES = new Set(['CHECKPOINT_READY', 'ROLLOVER_READY']);

const RECEIPT_EFFECTS = Object.freeze({
  checkpointPersisted: true,
  priorCheckpointSuperseded: false,
  successorContextLeaseIssued: false,
  semanticAcceptanceCreated: false,
  memoryPromotionPerformed: false,
  sourceHistoryDeleted: false,
  homeMutated: true,
  providerCalled: false,
  modelCalled: false,
  trainingRan: false,
  modelWeightsChanged: false
});

export class BrowserWorkingContinuityOwnerError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'BrowserWorkingContinuityOwnerError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new BrowserWorkingContinuityOwnerError(code, message, details);
}

function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('WORKING_CONTINUITY_INPUT_INVALID', `${label} must be one portable stable ref`);
  }
  return value;
}

function timestamp(value, label) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) {
    fail('WORKING_CONTINUITY_INPUT_INVALID', `${label} must be one canonical timestamp`);
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function pathKey(lineageRef, threadRef) {
  return semanticHash({ lineageRef, threadRef }).slice(0, 32);
}

function ownerPaths(home, lineageRef, threadRef) {
  const key = pathKey(lineageRef, threadRef);
  const root = path.join(home, 'working-continuity', key);
  return Object.freeze({
    root,
    checkpoints: path.join(root, 'checkpoints'),
    receipts: path.join(root, 'receipts'),
    head: path.join(root, 'head.json'),
    lock: path.join(home, 'runtime', 'working-continuity-writer-locks', `${key}.lock`)
  });
}

function readJsonRegular(file, code, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    fail(code, `${label} is unavailable`, { cause: error.message, file });
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(code, `${label} must be one regular non-link file`, { file });
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(code, `${label} is not valid JSON`, { cause: error.message, file });
  }
}

function validateAddressed(value, {
  schemaVersion,
  refField = null,
  refPrefix = null,
  label,
  code
}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== schemaVersion) {
    fail(code, `${label} schema is invalid`);
  }
  const fingerprint = value.semanticFingerprint;
  if (typeof fingerprint !== 'string' || !SHA256.test(fingerprint)) {
    fail(code, `${label} semantic fingerprint is invalid`);
  }
  const core = structuredClone(value);
  delete core.semanticFingerprint;
  if (refField !== null) delete core[refField];
  const expectedFingerprint = semanticHash(core);
  if (expectedFingerprint !== fingerprint) {
    fail(code, `${label} semantic fingerprint does not match content`);
  }
  if (refField !== null) {
    const expectedRef = `${refPrefix}.${fingerprint.slice(0, 32)}`;
    if (value[refField] !== expectedRef) fail(code, `${label} content address is invalid`);
  }
  return value;
}

function addressed(core, refField, refPrefix) {
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    [refField]: `${refPrefix}.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function writeExclusiveExact(file, value, { validator, code, label }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const serialized = stableJson(value);
  let fd = null;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, serialized, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    return 'CREATED';
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    if (error?.code !== 'EEXIST') throw error;
    const existing = validator(readJsonRegular(file, code, label));
    if (stableJson(existing) !== serialized) {
      fail(code, `${label} already exists with different canonical content`, { file });
    }
    return 'EXISTS_IDENTICAL';
  }
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, stableJson(value), { encoding: 'utf8', mode: 0o600 });
    const fd = fs.openSync(temporary, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function checkpointFile(paths, checkpoint) {
  return path.join(paths.checkpoints, `${checkpoint.semanticFingerprint}.json`);
}

function receiptFile(paths, receipt) {
  return path.join(paths.receipts, `${receipt.semanticFingerprint}.json`);
}

function validateStoredCheckpoint(value) {
  if (!verifyWorkingContinuityCheckpoint(value)) {
    fail('WORKING_CONTINUITY_CHECKPOINT_CORRUPT', 'stored working checkpoint is not canonical');
  }
  return value;
}

function validateCommitReceipt(value) {
  validateAddressed(value, {
    schemaVersion: BROWSER_WORKING_CONTINUITY_COMMIT_RECEIPT_SCHEMA,
    refField: 'commitReceiptRef',
    refPrefix: 'receipt.vexlife.browser-working-continuity',
    label: 'working continuity commit receipt',
    code: 'WORKING_CONTINUITY_RECEIPT_CORRUPT'
  });
  for (const [field, observed] of [
    ['homeRef', value.homeRef],
    ['deviceRef', value.deviceRef],
    ['companionLineageRef', value.companionLineageRef],
    ['threadRef', value.threadRef],
    ['planRef', value.planRef],
    ['checkpointRef', value.checkpointRef]
  ]) ref(observed, `working continuity commit receipt ${field}`);
  for (const [field, observed] of [
    ['planFingerprint', value.planFingerprint],
    ['checkpointFingerprint', value.checkpointFingerprint]
  ]) {
    if (typeof observed !== 'string' || !SHA256.test(observed)) {
      fail('WORKING_CONTINUITY_RECEIPT_CORRUPT', `working continuity commit receipt ${field} is invalid`);
    }
  }
  if (value.priorCheckpointRefOrNull !== null) ref(value.priorCheckpointRefOrNull, 'working continuity prior checkpoint ref');
  if (value.priorCheckpointFingerprintOrNull !== null && !SHA256.test(value.priorCheckpointFingerprintOrNull ?? '')) {
    fail('WORKING_CONTINUITY_RECEIPT_CORRUPT', 'working continuity prior checkpoint fingerprint is invalid');
  }
  if (value.supersessionPlanRefOrNull !== null) ref(value.supersessionPlanRefOrNull, 'working continuity supersession plan ref');
  if (value.supersessionPlanFingerprintOrNull !== null && !SHA256.test(value.supersessionPlanFingerprintOrNull ?? '')) {
    fail('WORKING_CONTINUITY_RECEIPT_CORRUPT', 'working continuity supersession plan fingerprint is invalid');
  }
  if (
    value.truthClass !== 'NON_SEMANTIC_WORKING_CONTINUITY_COMMIT' ||
    value.effectOwnerRef !== BROWSER_WORKING_CONTINUITY_OWNER_REF ||
    !['CHECKPOINT_COMMITTED', 'ROLLOVER_COMMITTED'].includes(value.disposition) ||
    value.effects?.checkpointPersisted !== true ||
    typeof value.effects?.priorCheckpointSuperseded !== 'boolean' ||
    value.effects?.successorContextLeaseIssued !== false ||
    value.effects?.semanticAcceptanceCreated !== false ||
    value.effects?.memoryPromotionPerformed !== false ||
    value.effects?.sourceHistoryDeleted !== false ||
    value.effects?.homeMutated !== true ||
    value.effects?.providerCalled !== false ||
    value.effects?.modelCalled !== false ||
    value.effects?.trainingRan !== false ||
    value.effects?.modelWeightsChanged !== false
  ) {
    fail('WORKING_CONTINUITY_RECEIPT_CORRUPT', 'working continuity commit receipt crossed its effect boundary');
  }
  timestamp(value.committedAt, 'working continuity commit receipt committedAt');
  return value;
}

function validateHead(value) {
  validateAddressed(value, {
    schemaVersion: BROWSER_WORKING_CONTINUITY_HEAD_SCHEMA,
    label: 'working continuity head',
    code: 'WORKING_CONTINUITY_HEAD_CORRUPT'
  });
  if (value.currentness !== 'CURRENT') {
    fail('WORKING_CONTINUITY_HEAD_CORRUPT', 'working continuity head is not CURRENT');
  }
  for (const [field, observed] of [
    ['homeRef', value.homeRef],
    ['deviceRef', value.deviceRef],
    ['companionLineageRef', value.companionLineageRef],
    ['threadRef', value.threadRef],
    ['checkpointRef', value.checkpointRef],
    ['commitReceiptRef', value.commitReceiptRef]
  ]) ref(observed, `working continuity head ${field}`);
  for (const [field, observed] of [
    ['checkpointFingerprint', value.checkpointFingerprint],
    ['commitReceiptFingerprint', value.commitReceiptFingerprint]
  ]) {
    if (typeof observed !== 'string' || !SHA256.test(observed)) {
      fail('WORKING_CONTINUITY_HEAD_CORRUPT', `working continuity head ${field} is invalid`);
    }
  }
  timestamp(value.updatedAt, 'working continuity head updatedAt');
  return value;
}

function readCurrentAt(paths, identity, threadRef) {
  if (!fs.existsSync(paths.head)) {
    return Object.freeze({
      schemaVersion: BROWSER_WORKING_CONTINUITY_OWNER_SCHEMA,
      state: 'ABSENT',
      currentness: 'ABSENT',
      homeRef: identity.homeRef,
      deviceRef: identity.deviceRef,
      companionLineageRef: identity.companionLineageRef,
      threadRef,
      checkpoint: null,
      commitReceipt: null,
      effects: Object.freeze({ homeMutated: false, memoryMutated: false, modelCalled: false })
    });
  }
  const head = validateHead(readJsonRegular(
    paths.head,
    'WORKING_CONTINUITY_HEAD_CORRUPT',
    'working continuity head'
  ));
  for (const [field, expected] of [
    ['homeRef', identity.homeRef],
    ['deviceRef', identity.deviceRef],
    ['companionLineageRef', identity.companionLineageRef],
    ['threadRef', threadRef]
  ]) {
    if (head[field] !== expected) {
      fail('WORKING_CONTINUITY_IDENTITY_MISMATCH', `working continuity head ${field} changed`, {
        expected,
        observed: head[field]
      });
    }
  }
  const checkpoint = validateStoredCheckpoint(readJsonRegular(
    path.join(paths.checkpoints, `${head.checkpointFingerprint}.json`),
    'WORKING_CONTINUITY_CHECKPOINT_CORRUPT',
    'working continuity checkpoint'
  ));
  const receipt = validateCommitReceipt(readJsonRegular(
    path.join(paths.receipts, `${head.commitReceiptFingerprint}.json`),
    'WORKING_CONTINUITY_RECEIPT_CORRUPT',
    'working continuity commit receipt'
  ));
  if (
    checkpoint.lineageRef !== identity.companionLineageRef ||
    checkpoint.threadRef !== threadRef ||
    receipt.homeRef !== identity.homeRef ||
    receipt.deviceRef !== identity.deviceRef ||
    receipt.companionLineageRef !== identity.companionLineageRef ||
    receipt.threadRef !== threadRef ||
    checkpoint.checkpointRef !== head.checkpointRef ||
    checkpoint.semanticFingerprint !== head.checkpointFingerprint ||
    receipt.commitReceiptRef !== head.commitReceiptRef ||
    receipt.semanticFingerprint !== head.commitReceiptFingerprint ||
    receipt.checkpointRef !== checkpoint.checkpointRef ||
    receipt.checkpointFingerprint !== checkpoint.semanticFingerprint
  ) {
    fail('WORKING_CONTINUITY_HEAD_CORRUPT', 'working continuity head does not resolve exact checkpoint/receipt identity');
  }
  return Object.freeze({
    schemaVersion: BROWSER_WORKING_CONTINUITY_OWNER_SCHEMA,
    state: 'CURRENT',
    currentness: 'CURRENT',
    homeRef: identity.homeRef,
    deviceRef: identity.deviceRef,
    companionLineageRef: identity.companionLineageRef,
    threadRef,
    checkpoint: Object.freeze(structuredClone(checkpoint)),
    commitReceipt: Object.freeze(structuredClone(receipt)),
    head: Object.freeze(structuredClone(head)),
    effects: Object.freeze({ homeMutated: false, memoryMutated: false, modelCalled: false })
  });
}

function acquireWriter(paths, identity, threadRef, now) {
  fs.mkdirSync(path.dirname(paths.lock), { recursive: true });
  const lock = Object.freeze({
    schemaVersion: 'vexlife.browser-working-continuity-writer-lock/v1',
    effectOwnerRef: BROWSER_WORKING_CONTINUITY_OWNER_REF,
    homeRef: identity.homeRef,
    deviceRef: identity.deviceRef,
    companionLineageRef: identity.companionLineageRef,
    threadRef,
    instanceRef: identity.instanceRef,
    pid: process.pid,
    lockToken: crypto.randomUUID(),
    formedAt: timestamp(now(), 'working continuity writer formedAt')
  });
  try {
    const fd = fs.openSync(paths.lock, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, stableJson(lock), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return lock;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    fail(
      'WORKING_CONTINUITY_WRITER_CONFLICT',
      'working continuity already has an active or abandoned writer lock; cleanup authority is held',
      { lockPath: paths.lock }
    );
  }
}

function releaseWriter(paths, lock) {
  if (!lock || !fs.existsSync(paths.lock)) return true;
  try {
    const current = JSON.parse(fs.readFileSync(paths.lock, 'utf8'));
    if (current.lockToken !== lock.lockToken) return false;
    fs.unlinkSync(paths.lock);
    return true;
  } catch {
    return false;
  }
}

function validatePlanForOwner(plan, identity, threadRef, current) {
  if (!verifyContinuityRolloverPlan(plan) || !COMMITTABLE_PLAN_STATES.has(plan.state) || !plan.checkpoint) {
    fail('WORKING_CONTINUITY_PLAN_NOT_COMMITTABLE', 'working continuity owner requires one canonical CHECKPOINT_READY or ROLLOVER_READY plan');
  }
  if (plan.lineageRef !== identity.companionLineageRef || plan.threadRef !== threadRef) {
    fail('WORKING_CONTINUITY_IDENTITY_MISMATCH', 'working continuity plan belongs to another lineage or thread');
  }
  const checkpoint = plan.checkpoint;
  if (current.state === 'ABSENT') {
    if (
      checkpoint.priorCheckpointRefOrNull !== null ||
      checkpoint.priorCheckpointFingerprintOrNull !== null ||
      plan.supersessionPlan !== null
    ) {
      fail('WORKING_CONTINUITY_PRIOR_MISMATCH', 'first working checkpoint cannot claim an existing prior checkpoint');
    }
    return;
  }
  if (
    checkpoint.checkpointRef === current.checkpoint.checkpointRef &&
    checkpoint.semanticFingerprint === current.checkpoint.semanticFingerprint
  ) return;
  if (
    checkpoint.priorCheckpointRefOrNull !== current.checkpoint.checkpointRef ||
    checkpoint.priorCheckpointFingerprintOrNull !== current.checkpoint.semanticFingerprint ||
    !plan.supersessionPlan ||
    !verifyWorkingContinuityCheckpointSupersessionPlan(plan.supersessionPlan) ||
    plan.supersessionPlan.priorCheckpointRef !== current.checkpoint.checkpointRef ||
    plan.supersessionPlan.priorCheckpointFingerprint !== current.checkpoint.semanticFingerprint ||
    plan.supersessionPlan.successorCheckpointRef !== checkpoint.checkpointRef ||
    plan.supersessionPlan.successorCheckpointFingerprint !== checkpoint.semanticFingerprint
  ) {
    fail('WORKING_CONTINUITY_PRIOR_MISMATCH', 'working continuity successor does not bind the exact current checkpoint');
  }
}

function commitReceipt(plan, current, identity, committedAt) {
  const checkpoint = plan.checkpoint;
  const prior = current.state === 'CURRENT' ? current.checkpoint : null;
  const supersession = plan.supersessionPlan;
  const core = {
    schemaVersion: BROWSER_WORKING_CONTINUITY_COMMIT_RECEIPT_SCHEMA,
    truthClass: 'NON_SEMANTIC_WORKING_CONTINUITY_COMMIT',
    effectOwnerRef: BROWSER_WORKING_CONTINUITY_OWNER_REF,
    homeRef: identity.homeRef,
    deviceRef: identity.deviceRef,
    companionLineageRef: identity.companionLineageRef,
    threadRef: checkpoint.threadRef,
    planRef: plan.planRef,
    planFingerprint: plan.semanticFingerprint,
    checkpointRef: checkpoint.checkpointRef,
    checkpointFingerprint: checkpoint.semanticFingerprint,
    priorCheckpointRefOrNull: prior?.checkpointRef ?? null,
    priorCheckpointFingerprintOrNull: prior?.semanticFingerprint ?? null,
    supersessionPlanRefOrNull: supersession?.supersessionPlanRef ?? null,
    supersessionPlanFingerprintOrNull: supersession?.semanticFingerprint ?? null,
    disposition: plan.state === 'ROLLOVER_READY' ? 'ROLLOVER_COMMITTED' : 'CHECKPOINT_COMMITTED',
    successorContextRequired: plan.state === 'ROLLOVER_READY',
    committedAt,
    effects: {
      ...RECEIPT_EFFECTS,
      priorCheckpointSuperseded: prior !== null && prior.checkpointRef !== checkpoint.checkpointRef
    }
  };
  return addressed(core, 'commitReceiptRef', 'receipt.vexlife.browser-working-continuity');
}

function headFor(receipt, identity) {
  const core = {
    schemaVersion: BROWSER_WORKING_CONTINUITY_HEAD_SCHEMA,
    currentness: 'CURRENT',
    homeRef: identity.homeRef,
    deviceRef: identity.deviceRef,
    companionLineageRef: identity.companionLineageRef,
    threadRef: receipt.threadRef,
    checkpointRef: receipt.checkpointRef,
    checkpointFingerprint: receipt.checkpointFingerprint,
    commitReceiptRef: receipt.commitReceiptRef,
    commitReceiptFingerprint: receipt.semanticFingerprint,
    updatedAt: receipt.committedAt
  };
  return Object.freeze({ ...core, semanticFingerprint: semanticHash(core) });
}

export function createBrowserWorkingContinuityOwner({
  home,
  homeRef,
  deviceRef,
  companionLineageRef,
  instanceRef = 'instance.vexlife.browser-working-continuity-owner',
  now = () => new Date().toISOString()
} = {}) {
  if (typeof home !== 'string' || home.length === 0) {
    fail('WORKING_CONTINUITY_INPUT_INVALID', 'working continuity owner requires one Vex Home path');
  }
  const identity = Object.freeze({
    home: path.resolve(home),
    homeRef: ref(homeRef, 'homeRef'),
    deviceRef: ref(deviceRef, 'deviceRef'),
    companionLineageRef: ref(companionLineageRef, 'companionLineageRef'),
    instanceRef: ref(instanceRef, 'instanceRef')
  });
  if (typeof now !== 'function') fail('WORKING_CONTINUITY_INPUT_INVALID', 'working continuity owner requires one source-managed clock');

  const pathsForThread = (threadRef) => ownerPaths(
    identity.home,
    identity.companionLineageRef,
    ref(threadRef, 'threadRef')
  );

  return Object.freeze({
    schemaVersion: BROWSER_WORKING_CONTINUITY_OWNER_SCHEMA,
    effectOwnerRef: BROWSER_WORKING_CONTINUITY_OWNER_REF,
    readCurrent({ threadRef } = {}) {
      const safeThreadRef = ref(threadRef, 'threadRef');
      return readCurrentAt(pathsForThread(safeThreadRef), identity, safeThreadRef);
    },
    commitPlan({ plan } = {}) {
      const safeThreadRef = ref(plan?.threadRef, 'plan.threadRef');
      const paths = pathsForThread(safeThreadRef);
      const lock = acquireWriter(paths, identity, safeThreadRef, now);
      try {
        const current = readCurrentAt(paths, identity, safeThreadRef);
        validatePlanForOwner(plan, identity, safeThreadRef, current);
        if (
          current.state === 'CURRENT' &&
          current.checkpoint.checkpointRef === plan.checkpoint.checkpointRef &&
          current.checkpoint.semanticFingerprint === plan.checkpoint.semanticFingerprint
        ) {
          return Object.freeze({
            state: 'IDEMPOTENT_CURRENT',
            checkpoint: current.checkpoint,
            commitReceipt: current.commitReceipt,
            head: current.head
          });
        }

        const checkpoint = Object.freeze(structuredClone(plan.checkpoint));
        writeExclusiveExact(checkpointFile(paths, checkpoint), checkpoint, {
          validator: validateStoredCheckpoint,
          code: 'WORKING_CONTINUITY_CHECKPOINT_CORRUPT',
          label: 'working continuity checkpoint'
        });

        const committedAt = timestamp(now(), 'working continuity commit time');
        const receipt = commitReceipt(plan, current, identity, committedAt);
        writeExclusiveExact(receiptFile(paths, receipt), receipt, {
          validator: validateCommitReceipt,
          code: 'WORKING_CONTINUITY_RECEIPT_CORRUPT',
          label: 'working continuity commit receipt'
        });

        const head = headFor(receipt, identity);
        atomicWrite(paths.head, head);
        const rebound = readCurrentAt(paths, identity, safeThreadRef);
        if (
          rebound.checkpoint.checkpointRef !== checkpoint.checkpointRef ||
          rebound.checkpoint.semanticFingerprint !== checkpoint.semanticFingerprint ||
          rebound.commitReceipt.commitReceiptRef !== receipt.commitReceiptRef
        ) {
          fail('WORKING_CONTINUITY_COMMIT_NOT_CURRENT', 'working continuity commit did not become the exact current head');
        }
        return Object.freeze({
          state: 'COMMITTED',
          checkpoint: rebound.checkpoint,
          commitReceipt: rebound.commitReceipt,
          head: rebound.head
        });
      } finally {
        releaseWriter(paths, lock);
      }
    }
  });
}

// [VXG RealForever]
