import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  formContinuityRolloverPlan,
  verifyContinuityRolloverPlan,
  verifyWorkingContinuityCheckpoint,
  verifyWorkingContinuityCheckpointSupersessionPlan
} from './continuity-rollover.mjs';
import { createContextLease } from './context-lease.mjs';
import { semanticHash } from './utils.mjs';

export const BROWSER_WORKING_CONTINUITY_OWNER_SCHEMA =
  'vexlife.browser-working-continuity-owner/v1';
export const BROWSER_WORKING_CONTINUITY_COMMIT_RECEIPT_SCHEMA =
  'vexlife.browser-working-continuity-commit-receipt/v1';
export const BROWSER_WORKING_CONTINUITY_HEAD_SCHEMA =
  'vexlife.browser-working-continuity-head/v1';
export const BROWSER_WORKING_CONTINUITY_SUCCESSOR_CLAIM_SCHEMA =
  'vexlife.browser-working-continuity-successor-claim/v1';
export const BROWSER_WORKING_CONTINUITY_SUCCESSOR_RECEIPT_SCHEMA =
  'vexlife.browser-working-continuity-successor-receipt/v1';
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

function canonicalRequestBinding(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('WORKING_CONTINUITY_INPUT_INVALID', `${label} must be one request binding`);
  }
  const eventRef = ref(value.eventRef, `${label}.eventRef`);
  if (!SHA256.test(value.eventHash ?? '') || !Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    fail('WORKING_CONTINUITY_INPUT_INVALID', `${label} event hash or sequence is invalid`);
  }
  return Object.freeze({ eventRef, eventHash: value.eventHash, sequence: value.sequence });
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
    successorClaims: path.join(root, 'successor-context-claims'),
    successorReceipts: path.join(root, 'successor-context-receipts'),
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

function successorClaimFile(paths, checkpointFingerprint) {
  return path.join(paths.successorClaims, `${checkpointFingerprint}.json`);
}

function successorReceiptFile(paths, checkpointFingerprint) {
  return path.join(paths.successorReceipts, `${checkpointFingerprint}.json`);
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
    value.successorContextRequired !== (value.disposition === 'ROLLOVER_COMMITTED') ||
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

function validateSuccessorClaim(value) {
  validateAddressed(value, {
    schemaVersion: BROWSER_WORKING_CONTINUITY_SUCCESSOR_CLAIM_SCHEMA,
    refField: 'successorClaimRef',
    refPrefix: 'claim.vexlife.browser-working-continuity-successor',
    label: 'working continuity successor claim',
    code: 'WORKING_CONTINUITY_SUCCESSOR_CORRUPT'
  });
  for (const [field, observed] of [
    ['homeRef', value.homeRef],
    ['deviceRef', value.deviceRef],
    ['companionLineageRef', value.companionLineageRef],
    ['threadRef', value.threadRef],
    ['checkpointRef', value.checkpointRef],
    ['commitReceiptRef', value.commitReceiptRef],
    ['priorRequestEventRef', value.priorRequestEventRef]
  ]) ref(observed, `working continuity successor claim ${field}`);
  for (const [field, observed] of [
    ['checkpointFingerprint', value.checkpointFingerprint],
    ['commitReceiptFingerprint', value.commitReceiptFingerprint],
    ['priorConversationHeadSha256', value.priorConversationHeadSha256]
  ]) {
    if (!SHA256.test(observed ?? '')) fail('WORKING_CONTINUITY_SUCCESSOR_CORRUPT', `working continuity successor claim ${field} is invalid`);
  }
  const currentRequestEventBinding = canonicalRequestBinding(
    value.currentRequestEventBinding,
    'working continuity successor claim currentRequestEventBinding'
  );
  if (
    value.truthClass !== 'NON_SEMANTIC_WORKING_CONTINUITY_SUCCESSOR_CLAIM' ||
    value.effectOwnerRef !== BROWSER_WORKING_CONTINUITY_OWNER_REF ||
    value.effects?.homeMutated !== true ||
    value.effects?.checkpointMutated !== false ||
    value.effects?.currentHeadMutated !== false ||
    value.effects?.successorContextLeaseIssued !== false ||
    value.effects?.semanticAcceptanceCreated !== false ||
    value.effects?.memoryPromotionPerformed !== false ||
    value.effects?.providerCalled !== false ||
    value.effects?.modelCalled !== false ||
    value.effects?.trainingRan !== false ||
    value.effects?.modelWeightsChanged !== false
  ) fail('WORKING_CONTINUITY_SUCCESSOR_CORRUPT', 'working continuity successor claim crossed its effect boundary');
  timestamp(value.claimedAt, 'working continuity successor claim claimedAt');
  return Object.freeze({ ...structuredClone(value), currentRequestEventBinding });
}

function validateSuccessorReceipt(value) {
  validateAddressed(value, {
    schemaVersion: BROWSER_WORKING_CONTINUITY_SUCCESSOR_RECEIPT_SCHEMA,
    refField: 'successorReceiptRef',
    refPrefix: 'receipt.vexlife.browser-working-continuity-successor',
    label: 'working continuity successor receipt',
    code: 'WORKING_CONTINUITY_SUCCESSOR_CORRUPT'
  });
  for (const [field, observed] of [
    ['homeRef', value.homeRef],
    ['deviceRef', value.deviceRef],
    ['companionLineageRef', value.companionLineageRef],
    ['threadRef', value.threadRef],
    ['checkpointRef', value.checkpointRef],
    ['commitReceiptRef', value.commitReceiptRef],
    ['successorClaimRef', value.successorClaimRef],
    ['contextLeaseRef', value.contextLeaseRef],
    ['checkpointReturnRef', value.checkpointReturnRef],
    ['workNodeRef', value.workNodeRef]
  ]) ref(observed, `working continuity successor receipt ${field}`);
  for (const [field, observed] of [
    ['checkpointFingerprint', value.checkpointFingerprint],
    ['commitReceiptFingerprint', value.commitReceiptFingerprint],
    ['successorClaimFingerprint', value.successorClaimFingerprint],
    ['contextLeaseFingerprint', value.contextLeaseFingerprint]
  ]) {
    if (!SHA256.test(observed ?? '')) fail('WORKING_CONTINUITY_SUCCESSOR_CORRUPT', `working continuity successor receipt ${field} is invalid`);
  }
  if (!Number.isSafeInteger(value.schedulerGeneration) || value.schedulerGeneration < 0 ||
      !Array.isArray(value.selectedSourceRefs) ||
      value.selectedSourceRefs.some((item) => typeof item !== 'string' || !item) ||
      JSON.stringify([...new Set(value.selectedSourceRefs)].sort()) !== JSON.stringify(value.selectedSourceRefs)) {
    fail('WORKING_CONTINUITY_SUCCESSOR_CORRUPT', 'working continuity successor receipt source/generation binding is invalid');
  }
  if (
    value.truthClass !== 'NON_SEMANTIC_WORKING_CONTINUITY_SUCCESSOR_CONTEXT_RECEIPT' ||
    value.effectOwnerRef !== BROWSER_WORKING_CONTINUITY_OWNER_REF ||
    value.effects?.homeMutated !== true ||
    value.effects?.checkpointMutated !== false ||
    value.effects?.currentHeadMutated !== false ||
    value.effects?.successorContextLeaseIssued !== true ||
    value.effects?.semanticAcceptanceCreated !== false ||
    value.effects?.memoryPromotionPerformed !== false ||
    value.effects?.providerCalled !== false ||
    value.effects?.modelCalled !== false ||
    value.effects?.trainingRan !== false ||
    value.effects?.modelWeightsChanged !== false
  ) fail('WORKING_CONTINUITY_SUCCESSOR_CORRUPT', 'working continuity successor receipt crossed its effect boundary');
  timestamp(value.recordedAt, 'working continuity successor receipt recordedAt');
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

function readSuccessorContextAt(paths, identity, threadRef, current = null) {
  const bound = current ?? readCurrentAt(paths, identity, threadRef);
  const base = {
    schemaVersion: 'vexlife.browser-working-continuity-successor-state/v1',
    companionLineageRef: identity.companionLineageRef,
    threadRef,
    effects: Object.freeze({ homeMutated: false, memoryMutated: false, modelCalled: false })
  };
  if (bound.state !== 'CURRENT') return Object.freeze({ ...base, state: 'ABSENT', successorClaim: null, issuanceReceipt: null });
  if (
    bound.commitReceipt.disposition !== 'ROLLOVER_COMMITTED' ||
    bound.commitReceipt.successorContextRequired !== true ||
    bound.commitReceipt.effects?.successorContextLeaseIssued !== false
  ) return Object.freeze({ ...base, state: 'NOT_REQUIRED', successorClaim: null, issuanceReceipt: null });

  const claimPath = successorClaimFile(paths, bound.checkpoint.semanticFingerprint);
  if (!fs.existsSync(claimPath)) return Object.freeze({ ...base, state: 'READY', successorClaim: null, issuanceReceipt: null });
  const claim = validateSuccessorClaim(readJsonRegular(
    claimPath,
    'WORKING_CONTINUITY_SUCCESSOR_CORRUPT',
    'working continuity successor claim'
  ));
  if (
    claim.homeRef !== identity.homeRef || claim.deviceRef !== identity.deviceRef ||
    claim.companionLineageRef !== identity.companionLineageRef || claim.threadRef !== threadRef ||
    claim.checkpointRef !== bound.checkpoint.checkpointRef ||
    claim.checkpointFingerprint !== bound.checkpoint.semanticFingerprint ||
    claim.commitReceiptRef !== bound.commitReceipt.commitReceiptRef ||
    claim.commitReceiptFingerprint !== bound.commitReceipt.semanticFingerprint
  ) fail('WORKING_CONTINUITY_SUCCESSOR_CORRUPT', 'working continuity successor claim does not bind the exact current rollover');

  const receiptPath = successorReceiptFile(paths, bound.checkpoint.semanticFingerprint);
  if (!fs.existsSync(receiptPath)) return Object.freeze({ ...base, state: 'CLAIMED', successorClaim: claim, issuanceReceipt: null });
  const issuanceReceipt = validateSuccessorReceipt(readJsonRegular(
    receiptPath,
    'WORKING_CONTINUITY_SUCCESSOR_CORRUPT',
    'working continuity successor receipt'
  ));
  if (
    issuanceReceipt.homeRef !== identity.homeRef || issuanceReceipt.deviceRef !== identity.deviceRef ||
    issuanceReceipt.companionLineageRef !== identity.companionLineageRef || issuanceReceipt.threadRef !== threadRef ||
    issuanceReceipt.checkpointRef !== bound.checkpoint.checkpointRef ||
    issuanceReceipt.checkpointFingerprint !== bound.checkpoint.semanticFingerprint ||
    issuanceReceipt.commitReceiptRef !== bound.commitReceipt.commitReceiptRef ||
    issuanceReceipt.commitReceiptFingerprint !== bound.commitReceipt.semanticFingerprint ||
    issuanceReceipt.successorClaimRef !== claim.successorClaimRef ||
    issuanceReceipt.successorClaimFingerprint !== claim.semanticFingerprint
  ) fail('WORKING_CONTINUITY_SUCCESSOR_CORRUPT', 'working continuity successor receipt does not bind the exact current claim');
  return Object.freeze({ ...base, state: 'ISSUED', successorClaim: claim, issuanceReceipt });
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

function validateWriterLock(value, identity, threadRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schemaVersion !== 'vexlife.browser-working-continuity-writer-lock/v1' ||
      value.effectOwnerRef !== BROWSER_WORKING_CONTINUITY_OWNER_REF ||
      value.homeRef !== identity.homeRef ||
      value.deviceRef !== identity.deviceRef ||
      value.companionLineageRef !== identity.companionLineageRef ||
      value.threadRef !== threadRef ||
      value.instanceRef === undefined ||
      !Number.isSafeInteger(value.pid) || value.pid <= 0 ||
      typeof value.lockToken !== 'string' || value.lockToken.length === 0) {
    fail('WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock identity is invalid');
  }
  ref(value.instanceRef, 'working continuity writer instanceRef');
  timestamp(value.formedAt, 'working continuity writer formedAt');
  const fingerprint = value.semanticFingerprint;
  if (typeof fingerprint !== 'string' || !SHA256.test(fingerprint)) {
    fail('WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock fingerprint is invalid');
  }
  const core = structuredClone(value);
  delete core.semanticFingerprint;
  if (semanticHash(core) !== fingerprint) {
    fail('WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock fingerprint does not match content');
  }
  return value;
}

function acquireWriter(paths, identity, threadRef, now) {
  fs.mkdirSync(path.dirname(paths.lock), { recursive: true });
  const core = {
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
  };
  const lock = Object.freeze({ ...core, semanticFingerprint: semanticHash(core) });
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
    let existing;
    try {
      existing = validateWriterLock(
        readJsonRegular(paths.lock, 'WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock'),
        identity,
        threadRef
      );
    } catch (validationError) {
      if (validationError instanceof BrowserWorkingContinuityOwnerError) throw validationError;
      fail('WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock is not safely classifiable');
    }
    const ownerState = processState(existing.pid);
    fail(
      ownerState === 'ABSENT'
        ? 'WORKING_CONTINUITY_WRITER_RECOVERY_REQUIRED'
        : 'WORKING_CONTINUITY_WRITER_CONFLICT',
      ownerState === 'ABSENT'
        ? 'abandoned working continuity writer lock requires exact recovery'
        : 'working continuity already has an active or unverifiable writer lock',
      {
        lockPath: paths.lock,
        ownerState,
        ownerInstanceRef: existing.instanceRef,
        ownerPid: existing.pid,
        writerLockFingerprint: existing.semanticFingerprint
      }
    );
  }
}

function releaseWriter(paths, lock, identity, threadRef) {
  if (!lock || !fs.existsSync(paths.lock)) return true;
  try {
    const current = validateWriterLock(
      readJsonRegular(paths.lock, 'WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock'),
      identity,
      threadRef
    );
    if (
      current.lockToken !== lock.lockToken ||
      current.semanticFingerprint !== lock.semanticFingerprint
    ) return false;
    fs.unlinkSync(paths.lock);
    return true;
  } catch {
    return false;
  }
}

function recoverAbandonedWriter(paths, identity, threadRef, expectedAbandonedInstanceRef = null) {
  if (!fs.existsSync(paths.lock)) {
    return Object.freeze({
      schemaVersion: 'vexlife.browser-working-continuity-writer-recovery/v1',
      state: 'NO_WRITER_LOCK',
      recovered: false,
      companionLineageRef: identity.companionLineageRef,
      threadRef,
      effects: Object.freeze({
        writerLockRemoved: false,
        checkpointMutated: false,
        currentHeadMutated: false,
        memoryMutated: false,
        modelCalled: false
      })
    });
  }
  const lock = validateWriterLock(
    readJsonRegular(paths.lock, 'WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock'),
    identity,
    threadRef
  );
  if (
    expectedAbandonedInstanceRef !== null &&
    ref(expectedAbandonedInstanceRef, 'expectedAbandonedInstanceRef') !== lock.instanceRef
  ) {
    fail('WORKING_CONTINUITY_WRITER_CONFLICT', 'abandoned writer instance does not match exact recovery request', {
      expectedAbandonedInstanceRef,
      observedAbandonedInstanceRef: lock.instanceRef
    });
  }
  const ownerState = processState(lock.pid);
  if (ownerState !== 'ABSENT') {
    fail(
      ownerState === 'ACTIVE'
        ? 'WORKING_CONTINUITY_WRITER_CONFLICT'
        : 'WORKING_CONTINUITY_WRITER_RECOVERY_REQUIRED',
      'working continuity writer lock cannot be recovered unless the recorded writer is provably absent',
      { ownerState, ownerPid: lock.pid, ownerInstanceRef: lock.instanceRef }
    );
  }
  fs.unlinkSync(paths.lock);
  return Object.freeze({
    schemaVersion: 'vexlife.browser-working-continuity-writer-recovery/v1',
    state: 'ABANDONED_WRITER_RECOVERED',
    recovered: true,
    companionLineageRef: identity.companionLineageRef,
    threadRef,
    abandonedInstanceRef: lock.instanceRef,
    writerLockFingerprint: lock.semanticFingerprint,
    effects: Object.freeze({
      writerLockRemoved: true,
      checkpointMutated: false,
      currentHeadMutated: false,
      memoryMutated: false,
      modelCalled: false
    })
  });
}

function claimSuccessorContextAt(paths, identity, threadRef, input, now) {
  const current = readCurrentAt(paths, identity, threadRef);
  const successor = readSuccessorContextAt(paths, identity, threadRef, current);
  if (!['READY', 'CLAIMED', 'ISSUED'].includes(successor.state)) {
    fail('WORKING_CONTINUITY_SUCCESSOR_NOT_REQUIRED', 'current working continuity does not require a successor Context Lease');
  }
  const currentRequestEventBinding = canonicalRequestBinding(
    input?.currentRequestEventBinding,
    'successor currentRequestEventBinding'
  );
  const priorRequestEventRef = ref(input?.priorRequestEventRef, 'successor priorRequestEventRef');
  if (!SHA256.test(input?.priorConversationHeadSha256 ?? '')) {
    fail('WORKING_CONTINUITY_INPUT_INVALID', 'successor priorConversationHeadSha256 is invalid');
  }
  if (current.checkpoint.workingSet?.cursorEventRef !== priorRequestEventRef) {
    fail('WORKING_CONTINUITY_SUCCESSOR_PRIOR_MISMATCH', 'successor claim does not immediately follow the checkpointed request');
  }
  if (successor.successorClaim) {
    const claim = successor.successorClaim;
    if (
      claim.priorConversationHeadSha256 !== input.priorConversationHeadSha256 ||
      claim.priorRequestEventRef !== priorRequestEventRef ||
      JSON.stringify(claim.currentRequestEventBinding) !== JSON.stringify(currentRequestEventBinding)
    ) fail('WORKING_CONTINUITY_SUCCESSOR_ALREADY_CLAIMED', 'working rollover is already claimed by another request');
    return Object.freeze({
      state: 'IDEMPOTENT_CURRENT',
      successorClaim: claim,
      issuanceReceipt: successor.issuanceReceipt
    });
  }
  const core = {
    schemaVersion: BROWSER_WORKING_CONTINUITY_SUCCESSOR_CLAIM_SCHEMA,
    truthClass: 'NON_SEMANTIC_WORKING_CONTINUITY_SUCCESSOR_CLAIM',
    effectOwnerRef: BROWSER_WORKING_CONTINUITY_OWNER_REF,
    homeRef: identity.homeRef,
    deviceRef: identity.deviceRef,
    companionLineageRef: identity.companionLineageRef,
    threadRef,
    checkpointRef: current.checkpoint.checkpointRef,
    checkpointFingerprint: current.checkpoint.semanticFingerprint,
    commitReceiptRef: current.commitReceipt.commitReceiptRef,
    commitReceiptFingerprint: current.commitReceipt.semanticFingerprint,
    priorConversationHeadSha256: input.priorConversationHeadSha256,
    priorRequestEventRef,
    currentRequestEventBinding,
    claimedAt: timestamp(now(), 'working continuity successor claim time'),
    effects: {
      homeMutated: true,
      checkpointMutated: false,
      currentHeadMutated: false,
      successorContextLeaseIssued: false,
      semanticAcceptanceCreated: false,
      memoryPromotionPerformed: false,
      providerCalled: false,
      modelCalled: false,
      trainingRan: false,
      modelWeightsChanged: false
    }
  };
  const claim = addressed(core, 'successorClaimRef', 'claim.vexlife.browser-working-continuity-successor');
  writeExclusiveExact(successorClaimFile(paths, current.checkpoint.semanticFingerprint), claim, {
    validator: validateSuccessorClaim,
    code: 'WORKING_CONTINUITY_SUCCESSOR_CORRUPT',
    label: 'working continuity successor claim'
  });
  const rebound = readSuccessorContextAt(paths, identity, threadRef, current);
  if (rebound.state !== 'CLAIMED' || rebound.successorClaim.successorClaimRef !== claim.successorClaimRef) {
    fail('WORKING_CONTINUITY_SUCCESSOR_NOT_CURRENT', 'successor claim did not become the exact current claim');
  }
  return Object.freeze({ state: 'CLAIMED', successorClaim: rebound.successorClaim, issuanceReceipt: null });
}

function recordSuccessorContextLeaseAt(paths, identity, threadRef, input, now) {
  const current = readCurrentAt(paths, identity, threadRef);
  const successor = readSuccessorContextAt(paths, identity, threadRef, current);
  if (!['CLAIMED', 'ISSUED'].includes(successor.state) || !successor.successorClaim) {
    fail('WORKING_CONTINUITY_SUCCESSOR_NOT_CLAIMED', 'successor Context Lease requires one exact current rollover claim');
  }
  if (
    input?.successorClaimRef !== successor.successorClaim.successorClaimRef ||
    input?.successorClaimFingerprint !== successor.successorClaim.semanticFingerprint
  ) fail('WORKING_CONTINUITY_SUCCESSOR_CLAIM_MISMATCH', 'successor Context Lease does not bind the exact current claim');
  let contextLease;
  try { contextLease = createContextLease(input?.contextLease).lease; }
  catch (error) { fail('WORKING_CONTINUITY_SUCCESSOR_LEASE_INVALID', 'successor Context Lease is not canonical', { cause: error.message }); }
  const requiredSources = [
    current.checkpoint.checkpointRef,
    current.commitReceipt.commitReceiptRef,
    successor.successorClaim.successorClaimRef
  ];
  if (
    contextLease.checkpointReturnRef !== current.checkpoint.checkpointRef ||
    contextLease.schedulerGeneration !== successor.successorClaim.currentRequestEventBinding.sequence ||
    requiredSources.some((sourceRef) => !contextLease.selectedSourceRefs.includes(sourceRef))
  ) fail('WORKING_CONTINUITY_SUCCESSOR_LEASE_INVALID', 'successor Context Lease does not bind the exact checkpoint/claim source set');
  if (successor.issuanceReceipt) {
    if (
      successor.issuanceReceipt.contextLeaseRef !== contextLease.leaseRef ||
      successor.issuanceReceipt.contextLeaseFingerprint !== contextLease.semanticFingerprint
    ) fail('WORKING_CONTINUITY_SUCCESSOR_ALREADY_ISSUED', 'working rollover already names a different successor Context Lease');
    return Object.freeze({
      state: 'IDEMPOTENT_CURRENT',
      successorClaim: successor.successorClaim,
      issuanceReceipt: successor.issuanceReceipt
    });
  }
  const core = {
    schemaVersion: BROWSER_WORKING_CONTINUITY_SUCCESSOR_RECEIPT_SCHEMA,
    truthClass: 'NON_SEMANTIC_WORKING_CONTINUITY_SUCCESSOR_CONTEXT_RECEIPT',
    effectOwnerRef: BROWSER_WORKING_CONTINUITY_OWNER_REF,
    homeRef: identity.homeRef,
    deviceRef: identity.deviceRef,
    companionLineageRef: identity.companionLineageRef,
    threadRef,
    checkpointRef: current.checkpoint.checkpointRef,
    checkpointFingerprint: current.checkpoint.semanticFingerprint,
    commitReceiptRef: current.commitReceipt.commitReceiptRef,
    commitReceiptFingerprint: current.commitReceipt.semanticFingerprint,
    successorClaimRef: successor.successorClaim.successorClaimRef,
    successorClaimFingerprint: successor.successorClaim.semanticFingerprint,
    contextLeaseRef: contextLease.leaseRef,
    contextLeaseFingerprint: contextLease.semanticFingerprint,
    checkpointReturnRef: contextLease.checkpointReturnRef,
    schedulerGeneration: contextLease.schedulerGeneration,
    workNodeRef: contextLease.workNodeRef,
    selectedSourceRefs: [...new Set(contextLease.selectedSourceRefs)].sort(),
    recordedAt: timestamp(now(), 'working continuity successor receipt time'),
    effects: {
      homeMutated: true,
      checkpointMutated: false,
      currentHeadMutated: false,
      successorContextLeaseIssued: true,
      semanticAcceptanceCreated: false,
      memoryPromotionPerformed: false,
      providerCalled: false,
      modelCalled: false,
      trainingRan: false,
      modelWeightsChanged: false
    }
  };
  const issuanceReceipt = addressed(core, 'successorReceiptRef', 'receipt.vexlife.browser-working-continuity-successor');
  writeExclusiveExact(successorReceiptFile(paths, current.checkpoint.semanticFingerprint), issuanceReceipt, {
    validator: validateSuccessorReceipt,
    code: 'WORKING_CONTINUITY_SUCCESSOR_CORRUPT',
    label: 'working continuity successor receipt'
  });
  const rebound = readSuccessorContextAt(paths, identity, threadRef, current);
  if (rebound.state !== 'ISSUED' || rebound.issuanceReceipt.successorReceiptRef !== issuanceReceipt.successorReceiptRef) {
    fail('WORKING_CONTINUITY_SUCCESSOR_NOT_CURRENT', 'successor Context Lease receipt did not become current');
  }
  return Object.freeze({
    state: 'RECORDED',
    successorClaim: rebound.successorClaim,
    issuanceReceipt: rebound.issuanceReceipt
  });
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

function validateRolloverSourceAuthority(plan, current, {
  resourceContextPressure = null,
  continuityStream = null
} = {}) {
  if (plan.state !== 'ROLLOVER_READY') return;
  let derived;
  try {
    derived = formContinuityRolloverPlan({
      resourceContextPressure,
      continuityStream,
      priorWorkingCheckpoint: current.state === 'CURRENT' ? current.checkpoint : null
    });
  } catch {
    fail(
      'WORKING_CONTINUITY_ROLLOVER_SOURCE_MISMATCH',
      'rollover commit requires source-owned pressure and continuity that re-derive the exact plan'
    );
  }
  if (
    derived.state !== 'ROLLOVER_READY' ||
    derived.planRef !== plan.planRef ||
    derived.semanticFingerprint !== plan.semanticFingerprint
  ) {
    fail(
      'WORKING_CONTINUITY_ROLLOVER_SOURCE_MISMATCH',
      'rollover commit source truth does not re-derive the exact rollover plan'
    );
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
    readSuccessorContext({ threadRef } = {}) {
      const safeThreadRef = ref(threadRef, 'threadRef');
      return readSuccessorContextAt(pathsForThread(safeThreadRef), identity, safeThreadRef);
    },
    claimSuccessorContext({
      threadRef,
      priorConversationHeadSha256,
      priorRequestEventRef,
      currentRequestEventBinding
    } = {}) {
      const safeThreadRef = ref(threadRef, 'threadRef');
      const paths = pathsForThread(safeThreadRef);
      const lock = acquireWriter(paths, identity, safeThreadRef, now);
      try {
        return claimSuccessorContextAt(paths, identity, safeThreadRef, {
          priorConversationHeadSha256,
          priorRequestEventRef,
          currentRequestEventBinding
        }, now);
      } finally {
        if (!releaseWriter(paths, lock, identity, safeThreadRef)) {
          fail('WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock could not be released safely');
        }
      }
    },
    recordSuccessorContextLease({
      threadRef,
      successorClaimRef,
      successorClaimFingerprint,
      contextLease
    } = {}) {
      const safeThreadRef = ref(threadRef, 'threadRef');
      const paths = pathsForThread(safeThreadRef);
      const lock = acquireWriter(paths, identity, safeThreadRef, now);
      try {
        return recordSuccessorContextLeaseAt(paths, identity, safeThreadRef, {
          successorClaimRef,
          successorClaimFingerprint,
          contextLease
        }, now);
      } finally {
        if (!releaseWriter(paths, lock, identity, safeThreadRef)) {
          fail('WORKING_CONTINUITY_WRITER_CONFLICT', 'working continuity writer lock could not be released safely');
        }
      }
    },
    recoverAbandonedWriter({ threadRef, expectedAbandonedInstanceRef = null } = {}) {
      const safeThreadRef = ref(threadRef, 'threadRef');
      return recoverAbandonedWriter(
        pathsForThread(safeThreadRef),
        identity,
        safeThreadRef,
        expectedAbandonedInstanceRef
      );
    },
    commitPlan({ plan, resourceContextPressure = null, continuityStream = null } = {}) {
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

        validateRolloverSourceAuthority(plan, current, {
          resourceContextPressure,
          continuityStream
        });

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
        if (!releaseWriter(paths, lock, identity, safeThreadRef)) {
          fail(
            'WORKING_CONTINUITY_WRITER_CONFLICT',
            'working continuity writer lock could not be released safely'
          );
        }
      }
    }
  });
}

// [VXG RealForever]
