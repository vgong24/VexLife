import { semanticHash } from './utils.mjs';
import { createDeterministicClassifiedExecutor, issueClassifierPlan } from './runtime-failure.mjs';

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

export class SimulatedRuntimeFailure extends Error {
  constructor(failureClass, message, {
    partialEffectState = 'NONE',
    humanAttentionClass = null,
    evidenceRefs = []
  } = {}) {
    super(message);
    this.name = 'SimulatedRuntimeFailure';
    this.code = failureClass;
    this.failureClass = failureClass;
    this.partialEffectState = partialEffectState;
    this.humanAttentionClass = humanAttentionClass;
    this.evidenceRefs = [...evidenceRefs];
  }
}

export function createDeterministicFaultInjector({
  failures = [],
  successValue = { state: 'PASS' },
  planRef = 'classifier-plan.runtime-recovery.deterministic-fixture',
  registry
} = {}) {
  const plan = failures.map((item, index) => ({
    attempt: item.attempt ?? index + 1,
    failureClass: item.failureClass,
    message: item.message ?? item.failureClass,
    partialEffectState: item.partialEffectState ?? 'NONE',
    humanAttentionClass: item.humanAttentionClass ?? null,
    evidenceRefs: item.evidenceRefs ?? []
  }));
  const classifierPlanReceipt = issueClassifierPlan(planRef, { registry });
  const issuedPlan = classifierPlanReceipt.classifierPlan;
  if (issuedPlan.length !== plan.length || issuedPlan.some((item, index) =>
    item.attempt !== plan[index].attempt || item.failureClass !== plan[index].failureClass)) {
    throw new Error('deterministic fixture differs from the exact source-issued classifier plan');
  }
  return createDeterministicClassifiedExecutor({
    classifierPlanReceipt,
    registry,
    invoke(attempt) {
      const fault = plan.find((item) => item.attempt === attempt);
      if (fault) throw new SimulatedRuntimeFailure(fault.failureClass, fault.message, fault);
      return clone(successValue);
    }
  });
}

export function createNoEffectTransactionalAdapter({
  adapterRef = 'adapter.runtime-recovery.no-effect',
  initialState,
  attemptedState,
  partialWrite = true,
  rollbackFails = false,
  restoreFails = false,
  lastKnownGoodState = initialState
}) {
  let current = clone(initialState);
  const before = clone(initialState);
  const lastKnownGood = clone(lastKnownGoodState);
  const faultPlanRef = rollbackFails
    ? (restoreFails
      ? 'fault-plan.runtime-recovery.partial-write.rollback-and-lkg-fail'
      : 'fault-plan.runtime-recovery.partial-write.rollback-fails-lkg-restores')
    : 'fault-plan.runtime-recovery.partial-write.rollback-restores';
  const recoveryContract = {
    schemaVersion: 'vexlife.runtime-transactional-adapter-contract/v1',
    adapterRef,
    effectClass: 'DETERMINISTIC_NO_EFFECT',
    faultPlanRef,
    partialWrite,
    rollbackFails,
    restoreFails,
    beforeFingerprint: semanticHash(before),
    attemptedFingerprint: semanticHash(attemptedState),
    lastKnownGoodFingerprint: semanticHash(lastKnownGood)
  };
  recoveryContract.semanticFingerprint = semanticHash(recoveryContract);
  const read = () => freeze({ value: clone(current), fingerprint: semanticHash(current) });
  return Object.freeze({
    adapterRef,
    effectClass: 'DETERMINISTIC_NO_EFFECT',
    recoveryContract: freeze(recoveryContract),
    read,
    attemptTransition() {
      current = partialWrite ? clone(attemptedState) : clone(before);
      if (partialWrite) {
        throw new SimulatedRuntimeFailure('PARTIAL_WRITE_SIMULATED', 'deterministic partial write', {
          partialEffectState: 'CONFIRMED_REVERSIBLE'
        });
      }
      return read();
    },
    rollback() {
      if (rollbackFails) {
        throw new SimulatedRuntimeFailure('ROLLBACK_FAILED_SIMULATED', 'deterministic rollback failed', {
          partialEffectState: 'UNKNOWN',
          humanAttentionClass: 'IMMEDIATE'
        });
      }
      current = clone(before);
      return read();
    },
    restoreLastKnownGood() {
      if (restoreFails) {
        throw new SimulatedRuntimeFailure('ROLLBACK_FAILED_SIMULATED', 'deterministic last-known-good restore failed', {
          partialEffectState: 'UNKNOWN',
          humanAttentionClass: 'IMMEDIATE'
        });
      }
      current = clone(lastKnownGood);
      return read();
    },
    fingerprints: freeze({
      before: semanticHash(before),
      attempted: semanticHash(attemptedState),
      lastKnownGood: semanticHash(lastKnownGood)
    })
  });
}

export function simulateTransactionalRecovery({
  adapter,
  operationRef,
  expectedBeforeFingerprint,
  rollbackReceiptRef,
  lastKnownGoodRef,
  observedAt
}) {
  if (adapter?.effectClass !== 'DETERMINISTIC_NO_EFFECT') {
    throw new Error('transactional recovery simulation accepts no real-effect adapter');
  }
  const before = adapter.read();
  if (before.fingerprint !== expectedBeforeFingerprint) {
    const blocked = {
      schemaVersion: 'vexlife.runtime-transactional-recovery-receipt/v1',
      rollbackReceiptRef,
      operationRef,
      adapterRef: adapter.adapterRef,
      adapterContract: adapter.recoveryContract,
      state: 'BLOCKED',
      reason: 'EXPECTED_BEFORE_FINGERPRINT_MISMATCH',
      expectedBeforeFingerprint,
      observedBeforeFingerprint: before.fingerprint,
      partialResultFingerprint: null,
      rollbackReadBackFingerprint: null,
      rollbackVerified: false,
      lastKnownGoodRef,
      lastKnownGoodExpectedFingerprint: adapter.fingerprints.lastKnownGood,
      lastKnownGoodReadBackFingerprint: null,
      lastKnownGoodRestored: false,
      quarantined: false,
      quarantineRef: null,
      quarantineReason: null,
      externalEffectsExecuted: false,
      observedAt
    };
    blocked.semanticFingerprint = semanticHash(blocked);
    return freeze(blocked);
  }
  let partial = null;
  let failure = null;
  try {
    adapter.attemptTransition();
  } catch (error) {
    failure = error;
    partial = adapter.read();
  }
  if (!failure) throw new Error('transactional fault fixture did not produce the required partial result');
  let rollbackVerified = false;
  let rollbackReadBackFingerprint = null;
  let lastKnownGoodRestored = false;
  let lastKnownGoodReadBackFingerprint = null;
  let quarantined = false;
  let state = 'ROLLED_BACK';
  let reason = failure.failureClass;
  try {
    const rolledBack = adapter.rollback();
    rollbackReadBackFingerprint = rolledBack.fingerprint;
    rollbackVerified = rolledBack.fingerprint === before.fingerprint;
    if (!rollbackVerified) throw new Error('rollback read-back fingerprint mismatch');
  } catch (rollbackError) {
    reason = rollbackError.failureClass ?? 'ROLLBACK_READBACK_FAILED';
    try {
      const restored = adapter.restoreLastKnownGood();
      lastKnownGoodReadBackFingerprint = restored.fingerprint;
      lastKnownGoodRestored = restored.fingerprint === adapter.fingerprints.lastKnownGood;
      state = lastKnownGoodRestored ? 'LAST_KNOWN_GOOD_RESTORED' : 'QUARANTINED';
      quarantined = !lastKnownGoodRestored;
    } catch {
      state = 'QUARANTINED';
      quarantined = true;
    }
  }
  const receipt = {
    schemaVersion: 'vexlife.runtime-transactional-recovery-receipt/v1',
    rollbackReceiptRef,
    operationRef,
    adapterRef: adapter.adapterRef,
    adapterContract: adapter.recoveryContract,
    state,
    reason,
    expectedBeforeFingerprint,
    observedBeforeFingerprint: before.fingerprint,
    partialResultFingerprint: partial?.fingerprint ?? null,
    rollbackReadBackFingerprint,
    rollbackVerified,
    lastKnownGoodRef,
    lastKnownGoodExpectedFingerprint: adapter.fingerprints.lastKnownGood,
    lastKnownGoodReadBackFingerprint,
    lastKnownGoodRestored,
    quarantined,
    quarantineRef: quarantined ? `quarantine.runtime-recovery.${adapter.adapterRef}` : null,
    quarantineReason: quarantined ? reason : null,
    externalEffectsExecuted: false,
    observedAt
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  return freeze(receipt);
}

// [VXG RealForever]
