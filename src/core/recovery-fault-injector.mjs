import { semanticHash } from './utils.mjs';

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

export function createDeterministicFaultInjector({ failures = [], successValue = { state: 'PASS' } } = {}) {
  let callCount = 0;
  const plan = failures.map((item, index) => ({
    attempt: item.attempt ?? index + 1,
    failureClass: item.failureClass,
    message: item.message ?? item.failureClass,
    partialEffectState: item.partialEffectState ?? 'NONE',
    humanAttentionClass: item.humanAttentionClass ?? null,
    evidenceRefs: item.evidenceRefs ?? []
  }));
  const executor = () => {
    callCount += 1;
    const fault = plan.find((item) => item.attempt === callCount);
    if (fault) {
      throw new SimulatedRuntimeFailure(fault.failureClass, fault.message, fault);
    }
    return clone(successValue);
  };
  Object.defineProperty(executor, 'callCount', { get: () => callCount });
  return executor;
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
  const read = () => freeze({ value: clone(current), fingerprint: semanticHash(current) });
  return Object.freeze({
    adapterRef,
    effectClass: 'DETERMINISTIC_NO_EFFECT',
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
      schemaVersion: 'vexlife.runtime-transactional-recovery-receipt/v0',
      rollbackReceiptRef,
      operationRef,
      adapterRef: adapter.adapterRef,
      state: 'BLOCKED',
      reason: 'EXPECTED_BEFORE_FINGERPRINT_MISMATCH',
      expectedBeforeFingerprint,
      observedBeforeFingerprint: before.fingerprint,
      partialResultFingerprint: null,
      rollbackVerified: false,
      lastKnownGoodRef,
      lastKnownGoodRestored: false,
      quarantined: false,
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
  let lastKnownGoodRestored = false;
  let quarantined = false;
  let state = 'ROLLED_BACK';
  let reason = failure.failureClass;
  try {
    const rolledBack = adapter.rollback();
    rollbackVerified = rolledBack.fingerprint === before.fingerprint;
    if (!rollbackVerified) throw new Error('rollback read-back fingerprint mismatch');
  } catch (rollbackError) {
    reason = rollbackError.failureClass ?? 'ROLLBACK_READBACK_FAILED';
    try {
      const restored = adapter.restoreLastKnownGood();
      lastKnownGoodRestored = restored.fingerprint === adapter.fingerprints.lastKnownGood;
      state = lastKnownGoodRestored ? 'LAST_KNOWN_GOOD_RESTORED' : 'QUARANTINED';
      quarantined = !lastKnownGoodRestored;
    } catch {
      state = 'QUARANTINED';
      quarantined = true;
    }
  }
  const receipt = {
    schemaVersion: 'vexlife.runtime-transactional-recovery-receipt/v0',
    rollbackReceiptRef,
    operationRef,
    adapterRef: adapter.adapterRef,
    state,
    reason,
    expectedBeforeFingerprint,
    observedBeforeFingerprint: before.fingerprint,
    partialResultFingerprint: partial?.fingerprint ?? null,
    rollbackVerified,
    lastKnownGoodRef,
    lastKnownGoodRestored,
    quarantined,
    externalEffectsExecuted: false,
    observedAt
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  return freeze(receipt);
}

// [VXG RealForever]
