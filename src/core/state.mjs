import { StateCell, selectState } from './state-relay.mjs';
import { estimateTokens, semanticHash } from './utils.mjs';
import { validateBurdenRelease } from './burden-release.mjs';
import {
  CONTINUITY_AUTHORITY_EVIDENCE_CLASSES,
  acceptContinuityCandidate,
  deriveContinuityScopeTarget,
  recordContinuityRecurrence,
  validateAcceptedContinuityRecord,
  validateContinuityAcceptanceEvidence,
  validateContinuityCandidate,
  validateContinuityContextReview,
  validateContinuityObservation,
  validateContinuityRecurrenceEvidence,
  validateContinuityRecordSet,
  validateContinuityScopeTarget,
  validateContinuitySupersession,
  validateTransientContinuityContext,
  routeContinuityCandidate
} from './continuity-evolution-router.mjs';

export { StateCell, selectState };

export const CONTINUITY_CURRENT_RECORD_SET_RECEIPT_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'aggregateFingerprint', 'recordBindings', 'supersessionBindings',
  'supersessionAuthorityBindings', 'semanticSubjectBindings', 'supersessionChronologyBindings', 'state',
  'currentRecordRefs', 'supersededRecordRefs', 'conflicts', 'silentOverwriteAllowed',
  'currentRecordSetRef', 'semanticFingerprint'
]);

export const CONTINUITY_AGGREGATE_PROJECTION_RECEIPT_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'projectionKind', 'aggregateFingerprint', 'sourceRef', 'sourceFingerprint',
  'candidateRef', 'candidateFingerprint', 'routeRef', 'routeFingerprint', 'reviewRef',
  'reviewFingerprint', 'recordClass', 'scope', 'scopeTargetRef', 'scopeTargetFingerprint',
  'continuitySubjectRef', 'continuitySubjectFingerprint', 'subjectSupersessionChronology',
  'requiredAcceptanceRefs', 'acceptedByRefs', 'authorityEvidenceRefs', 'authorityEvidenceClass',
  'acceptanceDisposition', 'burdenRef', 'burdenIdentityFingerprint', 'burdenSourceFingerprint',
  'currentRecordSetRef', 'currentRecordSetFingerprint', 'currentSetDisposition',
  'currentSuccessorRef', 'projectionClockReceiptRef', 'projectionClockReceiptFingerprint',
  'clockSourceRef', 'clockSourceFingerprint', 'clockSnapshotRef', 'clockSnapshotFingerprint',
  'clockEvidenceClass', 'clockCurrentFrom', 'clockCurrentUntil', 'contextAcceptedAt', 'simulatedClock',
  'liveClockGranted', 'externalTimeServiceUsed', 'projectionObservedAt',
  'projectionCurrentness', 'projectionReceiptRef', 'semanticFingerprint'
]);

export const CONTINUITY_SIMULATED_CLOCK_SNAPSHOT_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'aggregatePriorFingerprint', 'contextRecordRef', 'contextRecordFingerprint',
  'contextBindingRef', 'contextLeaseFingerprint', 'turnRef', 'threadRef', 'channelRef',
  'clockSourceRef', 'clockSourceFingerprint', 'sourceRef', 'sourceField', 'clockEvidenceClass',
  'observedAt', 'currentFrom', 'currentUntil', 'contextAcceptedAt', 'currentness', 'simulatedClock',
  'liveClockGranted', 'externalTimeServiceUsed', 'clockSnapshotRef', 'semanticFingerprint'
]);

export const CONTINUITY_PROJECTION_CLOCK_RECEIPT_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'aggregateFingerprint', 'contextRecordRef', 'contextRecordFingerprint',
  'contextBindingRef', 'contextLeaseFingerprint', 'turnRef', 'threadRef', 'channelRef',
  'leaseObservedAt', 'leaseExpiresAt', 'contextAcceptedAt', 'clockSourceRef', 'clockSourceFingerprint',
  'clockSnapshotRef', 'clockSnapshotFingerprint', 'clockEvidenceClass', 'clockCurrentFrom',
  'clockCurrentUntil', 'projectionObservedAt', 'sourceCurrentness', 'projectionCurrentness',
  'applicable', 'sourceManaged', 'simulatedClock', 'liveClockGranted',
  'externalTimeServiceUsed', 'clockReceiptRef', 'semanticFingerprint'
]);

const CONTINUITY_SIMULATED_CLOCK_SOURCE_CORE = Object.freeze({
  schemaVersion: 'vexlife.continuity-clock-source/v1',
  clockSourceRef: 'clock-source.vexlife.continuity-simulation',
  sourceRef: 'source.blueprint.evolution-registry',
  sourceField: 'clockTrustSources',
  evidenceClass: 'SIMULATED_CURRENT',
  currentness: 'CURRENT',
  clockMode: 'DETERMINISTIC_NO_EFFECT_SIMULATION',
  simulatedClock: true,
  liveClockGranted: false,
  externalTimeServiceUsed: false
});

export const CONTINUITY_SIMULATED_CLOCK_SOURCE = Object.freeze({
  ...CONTINUITY_SIMULATED_CLOCK_SOURCE_CORE,
  semanticFingerprint: semanticHash(CONTINUITY_SIMULATED_CLOCK_SOURCE_CORE)
});

function clone(value) {
  return structuredClone(value);
}

const RECOVERY_CLAIM_EDGE_CONTRACTS = Object.freeze({
  CLAIMED_CURRENT: Object.freeze({
    schemaVersion: 'vexlife.intent-scheduler-recovery-claim-edge-evidence/v1',
    contractRef: 'contract.intent-scheduler.recovery-claim-edge.claimed-current/v1'
  }),
  RESUMED_CONSUMED: Object.freeze({
    schemaVersion: 'vexlife.intent-scheduler-recovery-resume-edge-evidence/v1',
    contractRef: 'contract.intent-scheduler.recovery-claim-edge.resumed-consumed/v1'
  }),
  TERMINAL_CONSUMED: Object.freeze({
    schemaVersion: 'vexlife.intent-scheduler-recovery-terminal-edge-evidence/v1',
    contractRef: 'contract.intent-scheduler.recovery-claim-edge.terminal-consumed/v1'
  }),
  INVALIDATED_OR_ABANDONED: Object.freeze({
    schemaVersion: 'vexlife.intent-scheduler-recovery-disposition-edge-evidence/v1',
    contractRef: 'contract.intent-scheduler.recovery-claim-edge.invalidated-or-abandoned/v1'
  })
});

function validateRecoveryClaimEdgeEvidence(value, type) {
  const contract = RECOVERY_CLAIM_EDGE_CONTRACTS[type];
  if (!contract || !value || value.schemaVersion !== contract.schemaVersion ||
      value.contractRef !== contract.contractRef || value.transitionType !== type ||
      !value.evidenceRef || !value.semanticFingerprint) {
    throw new Error('scheduler recovery claim edge evidence is missing or has the wrong contract');
  }
  const candidate = clone(value);
  delete candidate.evidenceRef;
  delete candidate.semanticFingerprint;
  const fingerprint = semanticHash(candidate);
  if (fingerprint !== value.semanticFingerprint || !value.evidenceRef.endsWith(fingerprint.slice(0, 32))) {
    throw new Error('scheduler recovery claim edge evidence content-addressed identity mismatch');
  }
  return clone(value);
}

function validateEmbeddedFinalized(value, schemaVersion, label, refField = null) {
  if (!value || value.schemaVersion !== schemaVersion || !value.semanticFingerprint) {
    throw new Error(`${label} is missing or has the wrong schema`);
  }
  const candidate = clone(value);
  delete candidate.semanticFingerprint;
  if (refField) delete candidate[refField];
  if (semanticHash(candidate) !== value.semanticFingerprint) throw new Error(`${label} fingerprint mismatch`);
  return clone(value);
}

function exactStringArray(values) {
  return Array.isArray(values) ? [...values].sort() : null;
}

function assertRecoveryClaimTransitionBindings(transition, edge, fields) {
  for (const field of fields) {
    if (JSON.stringify(transition[field]) !== JSON.stringify(edge[field])) {
      throw new Error(`scheduler recovery claim transition ${field} differs from exact edge evidence`);
    }
  }
}

function validateRecoveryClaimTransition(value, sequence, priorFingerprint) {
  if (!value || value.schemaVersion !== 'vexlife.intent-scheduler-recovery-claim-transition/v1' ||
      !['CLAIMED_CURRENT', 'RESUMED_CONSUMED', 'TERMINAL_CONSUMED', 'INVALIDATED_OR_ABANDONED'].includes(value.type) ||
      value.sequence !== sequence || value.priorTransitionFingerprint !== priorFingerprint ||
      !value.transitionRef || !value.semanticFingerprint || !value.edgeEvidence ||
      value.edgeEvidenceRef !== value.edgeEvidence.evidenceRef ||
      value.edgeEvidenceFingerprint !== value.edgeEvidence.semanticFingerprint) {
    throw new Error('scheduler recovery claim transition is malformed or out of order');
  }
  const candidate = clone(value);
  delete candidate.transitionRef;
  delete candidate.semanticFingerprint;
  const fingerprint = semanticHash(candidate);
  if (fingerprint !== value.semanticFingerprint || !value.transitionRef.endsWith(fingerprint.slice(0, 32))) {
    throw new Error('scheduler recovery claim transition content-addressed identity mismatch');
  }
  validateRecoveryClaimEdgeEvidence(value.edgeEvidence, value.type);
  return clone(value);
}

function replayRecoveryClaimLedger(ledger = [], aggregate = null, {
  recoveryClaimReceiptValidator = null
} = {}) {
  if (!Array.isArray(ledger)) throw new Error('scheduler recovery claim ledger must be an array');
  const records = new Map();
  const consumedReleaseFingerprints = new Set();
  let prior = null;
  ledger.forEach((input, sequence) => {
    const transition = validateRecoveryClaimTransition(input, sequence, prior);
    const edge = validateRecoveryClaimEdgeEvidence(transition.edgeEvidence, transition.type);
    const existing = records.get(transition.checkpointRef);
    if (transition.type === 'CLAIMED_CURRENT') {
      if (typeof recoveryClaimReceiptValidator !== 'function') {
        throw new Error('scheduler recovery claim replay requires the source-managed claim validator');
      }
      const claim = recoveryClaimReceiptValidator(edge.recoveryClaimReceipt);
      const consumption = validateEmbeddedFinalized(
        edge.checkpointConsumptionReceipt,
        'vexlife.intent-scheduler-recovery-checkpoint-consumption/v1',
        'scheduler recovery checkpoint consumption'
      );
      const checkpoint = aggregate?.checkpoints?.find((item) => item.checkpointRef === transition.checkpointRef);
      const checkpointReleaseRefs = exactStringArray(checkpoint?.leaseReleaseReceipts?.map((item) => item.receiptRef));
      const checkpointReleaseFingerprints = exactStringArray(
        checkpoint?.leaseReleaseReceipts?.map((item) => item.semanticFingerprint)
      );
      assertRecoveryClaimTransitionBindings(transition, edge, [
        'checkpointRef', 'checkpointFingerprint', 'workNodeRef', 'sourceStateFingerprint',
        'recoveryAggregateRef', 'recoveryAggregateFingerprint', 'recoveryCycleRef',
        'recoveryCycleFingerprint', 'failureRef', 'failureFingerprint', 'claimReceiptRef',
        'claimReceiptFingerprint', 'consumptionRef', 'consumptionFingerprint',
        'onceOnlyActivationRef', 'leaseReleaseReceiptRefs', 'leaseReleaseFingerprints',
        'schedulerGeneration', 'observedAt'
      ]);
      if (existing || !transition.claimReceiptRef || !transition.claimReceiptFingerprint ||
          !transition.consumptionRef || !transition.consumptionFingerprint ||
          transition.leaseReleaseFingerprints?.length !== 6 ||
          new Set(transition.leaseReleaseFingerprints).size !== 6 ||
          transition.leaseReleaseFingerprints.some((item) => consumedReleaseFingerprints.has(item)) ||
          !checkpoint || checkpoint.semanticFingerprint !== transition.checkpointFingerprint ||
          !['PAUSED_AT_CHECKPOINT', 'RESUMED', 'RECOVERY_TERMINALLY_HELD'].includes(checkpoint.currentState) ||
          JSON.stringify(checkpointReleaseRefs) !== JSON.stringify(exactStringArray(transition.leaseReleaseReceiptRefs)) ||
          JSON.stringify(checkpointReleaseFingerprints) !== JSON.stringify(exactStringArray(transition.leaseReleaseFingerprints)) ||
          claim.claimReceiptRef !== transition.claimReceiptRef ||
          claim.semanticFingerprint !== transition.claimReceiptFingerprint ||
          claim.schedulerAggregateFingerprint !== consumption.schedulerAggregateFingerprint ||
          claim.schedulerCheckpointRef !== transition.checkpointRef ||
          claim.schedulerCheckpointFingerprint !== transition.checkpointFingerprint ||
          claim.workNodeRef !== transition.workNodeRef ||
          claim.sourceStateFingerprint !== transition.sourceStateFingerprint ||
          claim.schedulerGeneration !== transition.schedulerGeneration ||
          claim.aggregateRef !== transition.recoveryAggregateRef ||
          claim.recoveryAggregateFingerprint !== transition.recoveryAggregateFingerprint ||
          claim.recoveryCycleRef !== transition.recoveryCycleRef ||
          claim.recoveryCycleFingerprint !== transition.recoveryCycleFingerprint ||
          claim.activeFailureRef !== transition.failureRef ||
          claim.activeFailureFingerprint !== transition.failureFingerprint ||
          claim.onceOnlyActivationRef !== transition.onceOnlyActivationRef ||
          consumption.consumptionRef !== transition.consumptionRef ||
          consumption.semanticFingerprint !== transition.consumptionFingerprint ||
          consumption.schedulerPhase !== 'PAUSED' || consumption.checkpointCurrentState !== 'PAUSED_AT_CHECKPOINT' ||
          consumption.schedulerAggregateFingerprint !== edge.schedulerPriorAggregateFingerprint ||
          Date.parse(transition.observedAt) !== Date.parse(consumption.observedAt)) {
        throw new Error('scheduler recovery checkpoint/release claim is duplicate or incomplete');
      }
      transition.leaseReleaseFingerprints.forEach((item) => consumedReleaseFingerprints.add(item));
      records.set(transition.checkpointRef, {
        checkpointRef: transition.checkpointRef,
        checkpointFingerprint: transition.checkpointFingerprint,
        workNodeRef: transition.workNodeRef,
        sourceStateFingerprint: transition.sourceStateFingerprint,
        recoveryAggregateRef: transition.recoveryAggregateRef,
        recoveryAggregateFingerprint: transition.recoveryAggregateFingerprint,
        recoveryCycleRef: transition.recoveryCycleRef,
        recoveryCycleFingerprint: transition.recoveryCycleFingerprint,
        failureRef: transition.failureRef,
        failureFingerprint: transition.failureFingerprint,
        claimReceiptRef: transition.claimReceiptRef,
        claimReceiptFingerprint: transition.claimReceiptFingerprint,
        consumptionRef: transition.consumptionRef,
        consumptionFingerprint: transition.consumptionFingerprint,
        onceOnlyActivationRef: transition.onceOnlyActivationRef,
        leaseReleaseReceiptRefs: clone(transition.leaseReleaseReceiptRefs),
        leaseReleaseFingerprints: clone(transition.leaseReleaseFingerprints),
        schedulerPriorAggregateFingerprint: edge.schedulerPriorAggregateFingerprint,
        schedulerGeneration: transition.schedulerGeneration,
        state: 'CLAIMED_CURRENT',
        currentness: 'CURRENT',
        claimObservedAt: transition.observedAt,
        lastObservedAt: transition.observedAt,
        edgeEvidenceRef: edge.evidenceRef,
        edgeEvidenceFingerprint: edge.semanticFingerprint,
        lastTransitionRef: transition.transitionRef,
        lastTransitionFingerprint: transition.semanticFingerprint
      });
    } else {
      const expectedPriorStates = transition.type === 'RESUMED_CONSUMED'
        ? ['CLAIMED_CURRENT']
        : transition.type === 'INVALIDATED_OR_ABANDONED'
          ? ['CLAIMED_CURRENT', 'RESUMED_CONSUMED']
          : ['RESUMED_CONSUMED'];
      assertRecoveryClaimTransitionBindings(transition, edge, [
        'checkpointRef', 'claimReceiptRef', 'claimReceiptFingerprint', 'consumptionRef',
        'consumptionFingerprint', 'recoveryCycleRef', 'recoveryCycleFingerprint', 'observedAt'
      ]);
      if (!existing || !expectedPriorStates.includes(existing.state) ||
          transition.consumptionFingerprint !== existing.consumptionFingerprint ||
          transition.claimReceiptFingerprint !== existing.claimReceiptFingerprint ||
          transition.recoveryCycleFingerprint !== existing.recoveryCycleFingerprint ||
          Date.parse(transition.observedAt) <= Date.parse(existing.lastObservedAt)) {
        throw new Error('scheduler recovery claim lifecycle transition is stale or detached');
      }
      const checkpoint = aggregate?.checkpoints?.find((item) => item.checkpointRef === transition.checkpointRef);
      if (transition.type === 'RESUMED_CONSUMED') {
        const resume = validateEmbeddedFinalized(
          edge.schedulerResumeEvidence,
          'vexlife.intent-scheduler-recovery-resume-evidence/v1',
          'scheduler recovery resume evidence',
          'resumeEvidenceRef'
        );
        if (!checkpoint || checkpoint.currentState !== 'RESUMED' ||
            resume.claimTransitionFingerprint !== existing.lastTransitionFingerprint ||
            resume.schedulerPriorAggregateFingerprint !== edge.schedulerPriorAggregateFingerprint ||
            resume.checkpointRef !== existing.checkpointRef ||
            resume.checkpointFingerprint !== existing.checkpointFingerprint ||
            resume.actionReceiptFingerprint !== transition.actionReceiptFingerprint ||
            resume.checkpointAdmissionFingerprint !== transition.checkpointAdmissionFingerprint ||
            resume.schedulerGeneration !== transition.schedulerGeneration ||
            resume.recoveryCycleFingerprint !== existing.recoveryCycleFingerprint) {
          throw new Error('scheduler recovery resume transition lacks exact scheduler evidence');
        }
      } else if (transition.type === 'TERMINAL_CONSUMED') {
        const terminal = validateEmbeddedFinalized(
          edge.schedulerTerminalEvidence,
          'vexlife.intent-scheduler-recovery-terminal-evidence/v1',
          'scheduler recovery terminal evidence',
          'terminalEvidenceRef'
        );
        const terminalFingerprints = new Set((aggregate?.terminalReceipts ?? []).map((item) => item.semanticFingerprint));
        if (terminal.recoveryClaimTransitionFingerprint !== existing.lastTransitionFingerprint ||
            terminal.schedulerGeneration !== existing.schedulerGeneration ||
            !terminalFingerprints.has(terminal.completionVerificationFingerprint) ||
            !terminalFingerprints.has(terminal.workgraphTransitionFingerprint) ||
            !terminalFingerprints.has(terminal.completionReceiptFingerprint) ||
            !terminalFingerprints.has(terminal.returnRouteReceiptFingerprint) ||
            terminal.completionReceiptFingerprint !== transition.terminalReceiptFingerprint) {
          throw new Error('scheduler recovery terminal transition lacks exact completion evidence');
        }
      } else {
        const disposition = validateEmbeddedFinalized(
          edge.schedulerDispositionReceipt,
          'vexlife.intent-scheduler-recovery-claim-disposition/v1',
          'scheduler recovery claim disposition',
          'dispositionReceiptRef'
        );
        if (disposition.claimTransitionFingerprint !== existing.lastTransitionFingerprint ||
            disposition.checkpointRef !== existing.checkpointRef ||
            disposition.checkpointFingerprint !== existing.checkpointFingerprint ||
            disposition.recoveryCycleFingerprint !== existing.recoveryCycleFingerprint ||
            disposition.reasonRef !== transition.reasonRef ||
            disposition.postDispositionCheckpointPolicy !== transition.postDispositionCheckpointPolicy ||
            (existing.state === 'CLAIMED_CURRENT' &&
              (!checkpoint || checkpoint.currentState !== 'RECOVERY_TERMINALLY_HELD' ||
               disposition.postDispositionCheckpointPolicy !== 'TERMINALLY_HELD_WITH_EXACT_REASON'))) {
          throw new Error('scheduler recovery disposition transition lacks exact scheduler evidence');
        }
      }
      existing.state = transition.type;
      existing.currentness = transition.type === 'RESUMED_CONSUMED' ? 'CURRENT' : 'TERMINAL';
      existing.lastObservedAt = transition.observedAt;
      existing.edgeEvidenceRef = edge.evidenceRef;
      existing.edgeEvidenceFingerprint = edge.semanticFingerprint;
      existing.lastTransitionRef = transition.transitionRef;
      existing.lastTransitionFingerprint = transition.semanticFingerprint;
      if (transition.schedulerGeneration !== undefined) existing.schedulerGeneration = transition.schedulerGeneration;
      if (transition.actionReceiptFingerprint !== undefined) {
        existing.actionReceiptFingerprint = transition.actionReceiptFingerprint;
      }
      if (transition.reasonRef !== undefined) existing.reasonRef = transition.reasonRef;
      if (transition.postDispositionCheckpointPolicy !== undefined) {
        existing.postDispositionCheckpointPolicy = transition.postDispositionCheckpointPolicy;
      }
      if (transition.dispositionReceiptRef !== undefined) {
        existing.dispositionReceiptRef = transition.dispositionReceiptRef;
        existing.dispositionReceiptFingerprint = transition.dispositionReceiptFingerprint;
      }
      records.set(transition.checkpointRef, existing);
    }
    prior = transition.semanticFingerprint;
  });
  return [...records.values()].sort((left, right) => left.checkpointRef.localeCompare(right.checkpointRef));
}

function compactQueue(queue) {
  return {
    state: queue?.state ?? 'IDLE',
    lifecycle: queue?.lifecycle ?? 'IDLE',
    generation: queue?.generation ?? 0,
    logicalReadyCount: queue?.logicalReady?.length ?? 0,
    admittedReadyCount: queue?.admittedReady?.length ?? 0,
    logicalReady: (queue?.logicalReady ?? []).map((item) => ({
      workNodeRef: item.workNodeRef,
      priorityClass: item.priorityClass,
      schedulingClass: item.schedulingClass,
      readySinceGeneration: item.readySinceGeneration,
      deferralCount: item.deferralCount,
      admitted: item.admitted === true,
      reasonRefs: [...(item.reasonRefs ?? [])]
    })),
    selectedWorkNodeRef: queue?.selected?.workNodeRef ?? null,
    blocked: (queue?.blocked ?? []).map((item) => ({
      workNodeRef: item.workNodeRef,
      reasonRefs: [...(item.reasonRefs ?? [])]
    }))
  };
}

export function createInitialSchedulerAggregate() {
  const aggregate = {
    schemaVersion: 'vexlife.intent-scheduler-aggregate/v1',
    phase: 'IDLE',
    generation: 0,
    queue: {
      schemaVersion: 'vexlife.intent-scheduler-queue/v1',
      state: 'IDLE',
      lifecycle: 'IDLE',
      currentness: 'CURRENT',
      generation: 0,
      logicalReady: [],
      admittedReady: [],
      blocked: [],
      selected: null
    },
    active: null,
    resource: null,
    runtimeTrust: null,
    observedClock: null,
    checkpoints: [],
    recoveryClaimLedger: [],
    recoveryClaims: [],
    continuations: [],
    heldToolDispositions: [],
    terminalReceipts: [],
    fairnessLedger: {},
    pendingPreemption: null,
    leaseLedger: {},
    relayLedger: {
      schemaVersion: 'vexlife.intent-tool-relay-ledger/v1',
      relayRef: 'relay.intent-scheduler.mock-tools',
      entries: [],
      semanticFingerprint: semanticHash({
        schemaVersion: 'vexlife.intent-tool-relay-ledger/v1',
        relayRef: 'relay.intent-scheduler.mock-tools',
        entries: []
      })
    },
    lastTransitionRef: 'transition.intent-scheduler.initial'
  };
  aggregate.semanticFingerprint = semanticHash(aggregate);
  return aggregate;
}

export function reduceSchedulerAggregate(current, event, {
  recoveryClaimReceiptValidator = null
} = {}) {
  if (!event?.type) throw new Error('scheduler aggregate event type is required');
  const next = clone(current);
  switch (event.type) {
    case 'ADMITTED':
      next.phase = event.queue.state;
      next.generation = event.queue.generation;
      next.queue = clone(event.queue);
      next.resource = clone(event.resourceSnapshot);
      next.runtimeTrust = clone(event.runtimeTrustSnapshot);
      next.fairnessLedger = clone(event.fairnessLedger);
      next.pendingPreemption = null;
      if (event.observedClock) next.observedClock = clone(event.observedClock);
      break;
    case 'LEASED':
      next.phase = 'RUNNING';
      next.active = clone(event.active);
      next.queue.lifecycle = 'LEASED';
      for (const lease of Object.values(event.leases)) next.leaseLedger[lease.leaseRef] = clone(lease);
      break;
    case 'PREEMPTION_REQUESTED':
      next.pendingPreemption = clone(event.pendingPreemption);
      break;
    case 'CHECKPOINTED':
      next.phase = 'PAUSED';
      next.active = null;
      next.queue = clone(event.queue);
      next.checkpoints = [...next.checkpoints, clone(event.checkpoint)];
      for (const lease of Object.values(event.transitionedLeases)) next.leaseLedger[lease.leaseRef] = clone(lease);
      next.pendingPreemption = event.pendingPreemption ? clone(event.pendingPreemption) : null;
      if (event.pendingPreemption && !next.continuations.some((item) => item.checkpointRef === event.checkpoint.checkpointRef)) {
        next.continuations.push({
          checkpointRef: event.checkpoint.checkpointRef,
          workNodeRef: event.checkpoint.workNodeRef,
          graphFingerprint: event.checkpoint.graphFingerprint,
          priorSchedulerGeneration: event.checkpoint.priorSchedulerGeneration,
          pendingToolCallRef: event.checkpoint.pendingToolCallRef,
          state: 'PREEMPTED_PAUSED'
        });
      }
      if (event.relayLedger) next.relayLedger = clone(event.relayLedger);
      if (event.observedClock) next.observedClock = clone(event.observedClock);
      break;
    case 'RECOVERY_CLAIMED':
      next.recoveryClaimLedger = [...next.recoveryClaimLedger, clone(event.recoveryClaimTransition)];
      next.recoveryClaims = replayRecoveryClaimLedger(next.recoveryClaimLedger, next, { recoveryClaimReceiptValidator });
      break;
    case 'RECOVERY_CLAIM_DISPOSED':
      next.phase = 'BLOCKED';
      next.queue = {
        ...next.queue,
        state: 'BLOCKED',
        lifecycle: 'HELD',
        blocked: [
          ...(next.queue.blocked ?? []),
          { workNodeRef: event.workNodeRef, reasonRefs: [event.reasonRef] }
        ]
      };
      next.checkpoints = next.checkpoints.map((item) => item.checkpointRef === event.checkpointRef
        ? {
          ...item,
          currentState: 'RECOVERY_TERMINALLY_HELD',
          recoveryDispositionReceiptRef: event.recoveryDispositionReceipt.dispositionReceiptRef,
          recoveryDispositionReceiptFingerprint: event.recoveryDispositionReceipt.semanticFingerprint
        }
        : item);
      next.recoveryClaimLedger = [...next.recoveryClaimLedger, clone(event.recoveryClaimTransition)];
      next.recoveryClaims = replayRecoveryClaimLedger(next.recoveryClaimLedger, next, { recoveryClaimReceiptValidator });
      break;
    case 'RESUMED':
      next.phase = 'RUNNING';
      next.generation = event.queue.generation;
      next.queue = clone(event.queue);
      next.active = clone(event.active);
      next.resource = clone(event.resourceSnapshot);
      next.runtimeTrust = clone(event.runtimeTrustSnapshot);
      next.fairnessLedger = clone(event.fairnessLedger);
      next.checkpoints = next.checkpoints.map((item) =>
        item.checkpointRef === event.checkpointRef
          ? { ...item, currentState: 'RESUMED', resumedByWorkerLeaseRef: event.active.workerLeaseRef }
          : item
      );
      for (const lease of Object.values(event.leases)) next.leaseLedger[lease.leaseRef] = clone(lease);
      next.pendingPreemption = null;
      if (event.checkpointRef) {
        next.continuations = next.continuations.filter((item) => item.checkpointRef !== event.checkpointRef);
      }
      if (event.heldToolDisposition) next.heldToolDispositions.push(clone(event.heldToolDisposition));
      if (event.relayLedger) next.relayLedger = clone(event.relayLedger);
      if (event.observedClock) next.observedClock = clone(event.observedClock);
      if (event.recoveryClaimTransition) {
        next.recoveryClaimLedger = [...next.recoveryClaimLedger, clone(event.recoveryClaimTransition)];
        next.recoveryClaims = replayRecoveryClaimLedger(next.recoveryClaimLedger, next, { recoveryClaimReceiptValidator });
      }
      break;
    case 'COMPLETED':
      next.phase = next.continuations.length ? 'CONTINUATION_READY' : 'COMPLETED';
      next.active = null;
      next.queue = clone(event.queue);
      for (const lease of Object.values(event.transitionedLeases)) next.leaseLedger[lease.leaseRef] = clone(lease);
      next.terminalReceipts.push(
        clone(event.completionVerification),
        clone(event.workgraphTransition),
        clone(event.completionReceipt),
        clone(event.returnRouteReceipt)
      );
      if (event.relayLedger) next.relayLedger = clone(event.relayLedger);
      if (event.observedClock) next.observedClock = clone(event.observedClock);
      if (event.recoveryClaimTransition) {
        next.recoveryClaimLedger = [...next.recoveryClaimLedger, clone(event.recoveryClaimTransition)];
        next.recoveryClaims = replayRecoveryClaimLedger(next.recoveryClaimLedger, next, { recoveryClaimReceiptValidator });
      }
      break;
    case 'CANCELLED':
      next.phase = next.continuations.length ? 'CONTINUATION_READY' : 'CANCELLED';
      next.active = null;
      next.queue = clone(event.queue);
      for (const lease of Object.values(event.transitionedLeases)) next.leaseLedger[lease.leaseRef] = clone(lease);
      if (event.relayLedger) next.relayLedger = clone(event.relayLedger);
      if (event.observedClock) next.observedClock = clone(event.observedClock);
      if (event.recoveryClaimTransition) {
        next.recoveryClaimLedger = [...next.recoveryClaimLedger, clone(event.recoveryClaimTransition)];
        next.recoveryClaims = replayRecoveryClaimLedger(next.recoveryClaimLedger, next, { recoveryClaimReceiptValidator });
      }
      break;
    case 'CLOCK_ADVANCED':
      next.observedClock = clone(event.observedClock);
      break;
    case 'RELAY_SYNC':
      next.relayLedger = clone(event.relayLedger);
      break;
    default:
      throw new Error(`unknown scheduler aggregate event ${event.type}`);
  }
  next.lastTransitionRef = event.transitionRef;
  delete next.semanticFingerprint;
  next.semanticFingerprint = semanticHash(next);
  return next;
}

function runtimeHealth(aggregate) {
  const blocking = [];
  const attention = [];
  const evidence = aggregate.runtimeTrust;
  if (aggregate.phase !== 'IDLE') {
    if (!evidence?.semanticFingerprint || evidence.currentness !== 'CURRENT') blocking.push('RUNTIME_EVIDENCE_STALE_OR_MISSING');
    if (evidence?.selfCertified === true) blocking.push('RUNTIME_EVIDENCE_SELF_CERTIFIED');
    if (evidence && !['SIMULATED_CURRENT', 'LIVE_RUNTIME_CURRENT'].includes(evidence.evidenceClass)) {
      blocking.push('RUNTIME_EVIDENCE_CLASS_UNKNOWN');
    }
  }
  if (aggregate.active) {
    const expires = Date.parse(aggregate.active.expiresAt);
    const observed = Date.parse(aggregate.observedClock?.observedAt ?? aggregate.active.observedAt);
    if (!Number.isFinite(expires) || !Number.isFinite(observed) || observed >= expires) {
      blocking.push('ACTIVE_WORKER_LEASE_EXPIRED');
    }
    for (const leaseRef of aggregate.active.leaseRefs ?? []) {
      const lease = aggregate.leaseLedger[leaseRef];
      if (lease?.lifecycle !== 'ACTIVE') blocking.push(`ACTIVE_LEASE_NOT_CURRENT:${leaseRef}`);
      if (Number.isFinite(observed) && observed >= Date.parse(lease?.expiresAt)) {
        blocking.push(`ACTIVE_LEASE_EXPIRED:${leaseRef}`);
      }
    }
    if (Number.isFinite(observed) && observed >= Date.parse(aggregate.resource?.expiresAt)) blocking.push('RESOURCE_EVIDENCE_EXPIRED');
    if (Number.isFinite(observed) && observed >= Date.parse(aggregate.runtimeTrust?.expiresAt)) blocking.push('RUNTIME_EVIDENCE_EXPIRED');
  }
  const openRelayEntries = (aggregate.relayLedger?.entries ?? []).filter((item) => ['PENDING', 'HELD'].includes(item.state));
  for (const entry of openRelayEntries) {
    const heldAtCheckpoint = aggregate.phase === 'PAUSED' && entry.state === 'HELD';
    const heldForContinuation = entry.state === 'HELD' && aggregate.continuations.some((item) =>
      item.pendingToolCallRef === entry.toolCallRef
    );
    if (!aggregate.active && !heldAtCheckpoint && !heldForContinuation) {
      blocking.push(`ORPHANED_PENDING_TOOL_CALL:${entry.toolCallRef}`);
    }
  }
  const terminalLeases = Object.values(aggregate.leaseLedger ?? {}).filter((lease) =>
    ['RELEASED', 'SUPERSEDED', 'CANCELLED'].includes(lease.lifecycle)
  );
  if (terminalLeases.length && !aggregate.active) attention.push('LEASES_RELEASED');
  if (aggregate.phase === 'PAUSED') attention.push('WORK_PAUSED_AT_CHECKPOINT');
  if (aggregate.phase === 'CANCELLED') attention.push('WORK_CANCELLED_CLOSED');
  if (aggregate.phase === 'COMPLETED') attention.push('WORK_COMPLETED_CLOSED');
  if (aggregate.phase === 'CONTINUATION_READY') attention.push('PREEMPTED_WORK_CONTINUATION_READY');
  if (aggregate.queue.state === 'BLOCKED') blocking.push(...(aggregate.queue.blocked ?? [])
    .flatMap((item) => item.reasonRefs ?? [])
    .slice(0, 8));
  return {
    state: blocking.length ? 'BLOCKED' : attention.length ? 'ATTENTION' : 'CLEAR',
    reasonRefs: [...new Set([...blocking, ...attention])].sort()
  };
}

export function createIntentSchedulerState({
  aggregate = createInitialSchedulerAggregate(),
  recoveryClaimReceiptValidator = null
} = {}) {
  const supplied = clone(aggregate);
  const suppliedFingerprint = supplied.semanticFingerprint;
  delete supplied.semanticFingerprint;
  if (semanticHash(supplied) !== suppliedFingerprint) throw new Error('scheduler aggregate fingerprint mismatch');
  const replayedClaims = replayRecoveryClaimLedger(aggregate.recoveryClaimLedger ?? [], aggregate, {
    recoveryClaimReceiptValidator
  });
  if (JSON.stringify(replayedClaims) !== JSON.stringify(aggregate.recoveryClaims ?? [])) {
    throw new Error('scheduler recovery claim current pointers differ from replayed truth');
  }
  const aggregateState = new StateCell(clone(aggregate), { name: 'intent-scheduler.aggregate' });

  const runtime = selectState(aggregateState, (current) => ({
    schemaVersion: 'vexlife.intent-scheduler-runtime-projection/v1',
    currentness: current.queue?.currentness ?? 'HELD_UNKNOWN',
    phase: current.phase,
    queue: compactQueue(current.queue),
    active: current.active ? {
      workerRef: current.active.workerRef,
      workNodeRef: current.active.workNodeRef,
      generation: current.active.schedulerGeneration,
      state: current.active.lifecycle,
      workerLeaseRef: current.active.workerLeaseRef,
      contextLeaseRef: current.active.contextLeaseRef,
      resourceLeaseRef: current.active.resourceLeaseRef,
      runtimeSnapshotFingerprint: current.active.runtimeSnapshotFingerprint
    } : null,
    resource: current.resource ? {
      snapshotRef: current.resource.snapshotRef,
      generation: current.resource.generation,
      evidenceClass: current.resource.evidenceClass,
      currentness: current.resource.currentness,
      interactiveWaitState: current.resource.interactiveWaitState,
      backgroundWorkAdmission: current.resource.backgroundWorkAdmission,
      activeModelTurn: current.resource.activeModelTurn,
      activeHeavyTool: current.resource.activeHeavyTool
    } : null,
    checkpoints: current.checkpoints.map((item) => ({
      checkpointRef: item.checkpointRef,
      workNodeRef: item.workNodeRef,
      currentState: item.currentState,
      nextSafeAction: item.nextSafeAction
    })),
    observedClock: current.observedClock ? clone(current.observedClock) : null,
    continuations: current.continuations.map((item) => clone(item)),
    pendingPreemption: current.pendingPreemption ? {
      incomingWorkNodeRef: current.pendingPreemption.incomingWorkNodeRef,
      admissionReceiptRef: current.pendingPreemption.admissionReceiptRef,
      graphFingerprint: current.pendingPreemption.graphFingerprint
    } : null,
    relay: {
      pending: (current.relayLedger?.entries ?? []).filter((item) => item.state === 'PENDING').length,
      held: (current.relayLedger?.entries ?? []).filter((item) => item.state === 'HELD').length,
      accepted: (current.relayLedger?.entries ?? []).filter((item) => item.state === 'ACCEPTED').length,
      reinjected: (current.relayLedger?.entries ?? []).filter((item) => item.state === 'REINJECTED').length,
      closed: (current.relayLedger?.entries ?? []).filter((item) => item.state === 'CLOSED').length
    },
    aggregateFingerprint: current.semanticFingerprint,
    rawMachineDumpIncluded: false
  }), { name: 'intent-scheduler.runtime' });

  const terrain = selectState(runtime, (value) => ({
    schemaVersion: 'vexlife.intent-scheduler-terrain-projection/v1',
    state: value.phase,
    activeWorkNodeRef: value.active?.workNodeRef ?? null,
    logicalReadyRefs: value.queue.logicalReady.map((item) => item.workNodeRef),
    blockedRefs: value.queue.blocked.map((item) => item.workNodeRef),
    sourceProjectionRef: 'projection.intent-scheduler.runtime'
  }), { name: 'intent-scheduler.terrain' });

  const health = selectState(aggregateState, (value) => {
    const status = runtimeHealth(value);
    return {
      schemaVersion: 'vexlife.intent-scheduler-health-projection/v1',
      state: status.state,
      phase: value.phase,
      activeWorkerCount: value.active ? 1 : 0,
      admittedReadyCount: value.queue?.admittedReady?.length ?? 0,
      blockedCount: value.queue?.blocked?.length ?? 0,
      reasonRefs: status.reasonRefs,
      runtimeEvidenceClass: value.runtimeTrust?.evidenceClass ?? null,
      rawMachineDumpIncluded: false
    };
  }, { name: 'intent-scheduler.health' });

  const guide = selectState(runtime, (value) => ({
    schemaVersion: 'vexlife.intent-scheduler-guide-projection/v1',
    whatIsHappeningNow: value.active
      ? `ACTIVE:${value.active.workNodeRef}`
      : value.phase === 'PAUSED'
        ? `PAUSED:${value.checkpoints.at(-1)?.workNodeRef ?? 'UNKNOWN'}`
        : value.phase === 'CANCELLED'
          ? 'CANCELLED:CLOSED'
          : value.phase === 'COMPLETED'
            ? 'COMPLETED:CLOSED'
            : value.phase === 'CONTINUATION_READY'
              ? `CONTINUATION_READY:${value.continuations.at(-1)?.workNodeRef ?? 'UNKNOWN'}`
          : value.queue.selectedWorkNodeRef
            ? `READY:${value.queue.selectedWorkNodeRef}`
            : 'NO_ADMITTED_WORK',
    whyWaiting: value.queue.blocked.slice(0, 3),
    nextSafeAction: value.active
      ? 'CONTINUE_OR_CHECKPOINT_ACTIVE_NODE'
      : value.phase === 'PAUSED'
        ? 'FORM_FRESH_RUNTIME_AND_RESUME'
        : value.phase === 'CANCELLED'
          ? 'NO_ACTION_CLOSED'
          : value.phase === 'COMPLETED'
            ? 'NO_ACTION_CLOSED'
            : value.phase === 'CONTINUATION_READY'
              ? 'FORM_FRESH_RUNTIME_AND_RESUME_PREEMPTED_WORK'
          : value.queue.selectedWorkNodeRef
            ? 'LEASE_SELECTED_NODE'
            : 'REPAIR_OR_WAIT',
    sourceDescentRef: 'projection.intent-scheduler.runtime'
  }), { name: 'intent-scheduler.guide' });

  const dispose = () => {
    guide.dispose();
    health.dispose();
    terrain.dispose();
    runtime.dispose();
  };

  return {
    aggregate: aggregateState,
    runtime,
    terrain,
    health,
    guide,
    dispose
  };
}

export function createInitialContinuityEvolutionAggregate() {
  const aggregate = {
    schemaVersion: 'vexlife.continuity-evolution-aggregate/v1',
    currentness: 'CURRENT',
    observations: [],
    candidates: [],
    reviews: [],
    authorityEvidence: [],
    acceptedRecords: [],
    transientContexts: [],
    clockSnapshots: [],
    currentClockSnapshotRef: null,
    supersessions: [],
    recurrenceEvidence: [],
    rejectedCandidateRefs: [],
    lastTransitionRef: 'transition.continuity-evolution.initial'
  };
  aggregate.semanticFingerprint = semanticHash(aggregate);
  return aggregate;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

export function createContinuityEvolutionEvent(input) {
  if (!input?.type || !input.transitionRef) throw new Error('continuity evolution event type and transitionRef are required');
  const core = clone(input);
  delete core.semanticFingerprint;
  return freeze({ ...core, semanticFingerprint: semanticHash(core) });
}

function validateEvent(event) {
  if (!event?.type || !event.transitionRef || !event.semanticFingerprint) throw new Error('continuity evolution event must be typed and canonical');
  const core = clone(event);
  const fingerprint = core.semanticFingerprint;
  delete core.semanticFingerprint;
  if (semanticHash(core) !== fingerprint) throw new Error('continuity evolution event semantic fingerprint mismatch');
}

function appendCanonical(items, value, refField, label) {
  const sameRef = items.find((item) => item[refField] === value[refField]);
  if (sameRef) {
    if (sameRef.semanticFingerprint !== value.semanticFingerprint) throw new Error(`${label} same-ref/different-content conflict`);
    return { items, changed: false };
  }
  if (items.some((item) => item.semanticFingerprint === value.semanticFingerprint)) return { items, changed: false };
  return { items: [...items, clone(value)], changed: true };
}

function exactSemanticValue(left, right) {
  return semanticHash(left) === semanticHash(right);
}

function exactStoredCandidateSources(aggregate, candidate) {
  const observations = candidate.sourceObservationRefs.map((ref) => {
    const observation = aggregate.observations.find((item) => item.observationRef === ref);
    if (!observation) throw new Error(`candidate references unsealed observation ${ref}`);
    return observation;
  });
  const expectedRefs = observations.map((item) => item.observationRef).sort();
  const expectedObservationBindings = observations.map((item) => ({
    observationRef: item.observationRef,
    observationFingerprint: item.semanticFingerprint
  })).sort((left, right) => left.observationRef.localeCompare(right.observationRef));
  const expectedFingerprints = expectedObservationBindings.map((item) => item.observationFingerprint);
  const expectedLineages = [...new Set(observations.map((item) => item.sourceLineageRef))].sort();
  const expectedBindings = observations.flatMap((observation) => observation.sourceBindings.map((binding) => ({
    observationRef: observation.observationRef,
    sourceLineageRef: binding.sourceLineageRef,
    rangeRef: binding.rangeRef,
    sourceHash: binding.sourceHash
  }))).sort((left, right) => `${left.observationRef}\0${left.sourceLineageRef}\0${left.rangeRef}`
    .localeCompare(`${right.observationRef}\0${right.sourceLineageRef}\0${right.rangeRef}`));
  const expectedScopeTarget = deriveContinuityScopeTarget({
    observations,
    scopeClass: candidate.candidateScope,
    aboutSelfRefs: candidate.aboutSelfRefs,
    affectedPartyRefs: candidate.affectedPartyRefs,
    institutionalAuthorityRefs: candidate.institutionalAuthorityRefs,
    admittedTargetLineageRefs: candidate.admittedTargetLineageRefs
  });
  if (!exactSemanticValue(candidate.observationBindings, expectedObservationBindings) ||
      !exactSemanticValue(candidate.sourceObservationRefs, expectedRefs) ||
      !exactSemanticValue(candidate.sourceObservationFingerprints, expectedFingerprints) ||
      !exactSemanticValue(candidate.sourceLineageRefs, expectedLineages) ||
      !exactSemanticValue(candidate.sourceBindings, expectedBindings) ||
      candidate.scopeTargetRef !== expectedScopeTarget.scopeTargetRef ||
      candidate.scopeTargetFingerprint !== expectedScopeTarget.semanticFingerprint ||
      !exactSemanticValue(candidate.scopeTarget, expectedScopeTarget)) {
    throw new Error('candidate does not bind the exact stored observation fingerprints and source tuples');
  }
  return observations;
}

function aggregateCandidateRouteReview(aggregate, { candidateRef, candidateFingerprint, routeRef, routeFingerprint, reviewRef, reviewFingerprint }) {
  const candidate = aggregate.candidates.find((item) => item.candidateRef === candidateRef);
  if (!candidate || candidate.semanticFingerprint !== candidateFingerprint) throw new Error('payload candidate is not the exact aggregate-owned candidate');
  exactStoredCandidateSources(aggregate, candidate);
  const route = routeContinuityCandidate(candidate);
  if (route.routeRef !== routeRef || route.semanticFingerprint !== routeFingerprint) throw new Error('payload route is not the recomputed aggregate-owned route');
  const review = aggregate.reviews.find((item) => item.reviewRef === reviewRef);
  if (!review || review.semanticFingerprint !== reviewFingerprint) throw new Error('payload review is not the exact aggregate-owned review');
  validateContinuityContextReview(candidate, route, review);
  return { candidate, route, review };
}

function exactStoredAuthorityEvidence(aggregate, supplied, lineage, acceptedAt) {
  const evidence = supplied.map((item) => {
    const stored = aggregate.authorityEvidence.find((candidate) => candidate.acceptanceEvidenceRef === item.acceptanceEvidenceRef);
    if (!stored || stored.semanticFingerprint !== item.semanticFingerprint || !exactSemanticValue(stored, item)) {
      throw new Error('payload authority evidence is not exact current aggregate-owned evidence');
    }
    return validateContinuityAcceptanceEvidence(stored, { ...lineage, acceptedAt });
  });
  if (new Set(evidence.map((item) => item.acceptanceEvidenceRef)).size !== evidence.length) throw new Error('payload authority evidence is duplicated');
  return evidence;
}

function validateAggregateOwnedRecord(aggregate, record) {
  validateAcceptedContinuityRecord(record);
  const lineage = aggregateCandidateRouteReview(aggregate, record);
  const evidence = exactStoredAuthorityEvidence(aggregate, record.acceptanceEvidence, lineage, record.acceptedAt);
  const recomputed = acceptContinuityCandidate(lineage.candidate, lineage.review, {
    acceptedAt: record.acceptedAt,
    acceptedByRefs: record.acceptedByRefs,
    authorityEvidence: evidence,
    rollbackRef: record.rollbackRef,
    aggregate
  });
  if (recomputed.acceptedRecordRef !== record.acceptedRecordRef || recomputed.semanticFingerprint !== record.semanticFingerprint) {
    throw new Error('accepted record is internally canonical but not derived from aggregate-owned lineage');
  }
  return { ...lineage, evidence };
}

function validateAggregateSnapshot(aggregate) {
  if (!aggregate || aggregate.schemaVersion !== 'vexlife.continuity-evolution-aggregate/v1' ||
      aggregate.currentness !== 'CURRENT' || !aggregate.semanticFingerprint) {
    throw new Error('continuity projection requires an exact current state.evolution aggregate');
  }
  const core = clone(aggregate);
  const fingerprint = core.semanticFingerprint;
  delete core.semanticFingerprint;
  if (semanticHash(core) !== fingerprint) throw new Error('continuity projection aggregate fingerprint mismatch');
  if (!Array.isArray(aggregate.clockSnapshots) ||
      (aggregate.currentClockSnapshotRef !== null &&
        !aggregate.clockSnapshots.some((item) => item.clockSnapshotRef === aggregate.currentClockSnapshotRef))) {
    throw new Error('continuity aggregate clock snapshot/current pointer is malformed');
  }
  return aggregate;
}

function stateFingerprinted(core, refField, prefix) {
  const semanticFingerprint = semanticHash(core);
  return freeze({ ...core, [refField]: `${prefix}.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint });
}

function stableStringRefs(value, label, { required = false } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0) ||
      value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must be ${required ? 'a non-empty' : 'an'} stable-ref array`);
  }
  return [...new Set(value)].sort();
}

function validateAggregateOwnedContext(aggregate, context) {
  validateTransientContinuityContext(context);
  const lineage = aggregateCandidateRouteReview(aggregate, context);
  const evidence = exactStoredAuthorityEvidence(aggregate, context.acceptanceEvidence, lineage, context.acceptedAt);
  const recomputed = acceptContinuityCandidate(lineage.candidate, lineage.review, {
    acceptedAt: context.acceptedAt,
    acceptedByRefs: context.acceptedByRefs,
    authorityEvidence: evidence,
    currentContextLease: context.contextLease,
    aggregate
  });
  if (recomputed.contextRecordRef !== context.contextRecordRef || recomputed.semanticFingerprint !== context.semanticFingerprint) {
    throw new Error('transient context is internally canonical but not derived from aggregate-owned lineage');
  }
  return { ...lineage, evidence };
}

export function createContinuityCurrentRecordSetReceipt(aggregate) {
  validateAggregateSnapshot(aggregate);
  for (const record of aggregate.acceptedRecords) validateAggregateOwnedRecord(aggregate, record);
  const validation = validateContinuityRecordSet(aggregate.acceptedRecords, aggregate.supersessions);
  return stateFingerprinted({
    schemaVersion: 'vexlife.continuity-current-record-set-receipt/v1',
    aggregateFingerprint: aggregate.semanticFingerprint,
    recordBindings: validation.recordBindings,
    supersessionBindings: validation.supersessionBindings,
    supersessionAuthorityBindings: validation.supersessionAuthorityBindings,
    semanticSubjectBindings: validation.semanticSubjectBindings,
    supersessionChronologyBindings: validation.supersessionChronologyBindings,
    state: validation.state,
    currentRecordRefs: validation.currentRecordRefs,
    supersededRecordRefs: validation.supersededRecordRefs,
    conflicts: validation.conflicts,
    silentOverwriteAllowed: false
  }, 'currentRecordSetRef', 'continuity-current-record-set-receipt');
}

function exactCurrentRecordSetReceipt(aggregate, supplied) {
  const expected = createContinuityCurrentRecordSetReceipt(aggregate);
  if (!supplied || supplied.currentRecordSetRef !== expected.currentRecordSetRef ||
      supplied.semanticFingerprint !== expected.semanticFingerprint || semanticHash(supplied) !== semanticHash(expected)) {
    throw new Error('applicable continuity current-record-set receipt is missing, stale or substituted');
  }
  return expected;
}

function currentSetProjectionMeaning(aggregate, currentSet, record) {
  if (currentSet.supersededRecordRefs.includes(record.acceptedRecordRef)) {
    const successorByPrior = new Map(aggregate.supersessions.map((item) => [item.priorRecordRef, item.successorRecordRef]));
    const visited = new Set([record.acceptedRecordRef]);
    let currentSuccessorRef = successorByPrior.get(record.acceptedRecordRef);
    while (successorByPrior.has(currentSuccessorRef)) {
      if (visited.has(currentSuccessorRef)) throw new Error('continuity projection encountered a cyclic successor chain');
      visited.add(currentSuccessorRef);
      currentSuccessorRef = successorByPrior.get(currentSuccessorRef);
    }
    if (!currentSuccessorRef || !currentSet.currentRecordRefs.includes(currentSuccessorRef)) {
      throw new Error('continuity projection cannot resolve the exact sole current successor');
    }
    return freeze({ currentSetDisposition: 'SUPERSEDED', currentSuccessorRef });
  }
  if (currentSet.conflicts.some((conflict) => conflict.includes(record.acceptedRecordRef))) {
    return freeze({ currentSetDisposition: 'HELD_CONFLICT', currentSuccessorRef: null });
  }
  if (!currentSet.currentRecordRefs.includes(record.acceptedRecordRef)) {
    throw new Error('continuity projection source is absent from exact current-set disposition');
  }
  return freeze({ currentSetDisposition: 'CURRENT', currentSuccessorRef: null });
}

function resolveAggregateRecord(aggregate, acceptedRecordRef, acceptedRecordFingerprint) {
  validateAggregateSnapshot(aggregate);
  const record = aggregate.acceptedRecords.find((item) => item.acceptedRecordRef === acceptedRecordRef);
  if (!record || record.semanticFingerprint !== acceptedRecordFingerprint) {
    throw new Error('continuity projection source is not the exact aggregate-owned accepted record');
  }
  const lineage = validateAggregateOwnedRecord(aggregate, record);
  return { record, lineage };
}

function projectionOwnershipReceipt(aggregate, source, lineage, projectionKind, currentSet, {
  currentSetDisposition = null,
  currentSuccessorRef = null,
  projectionClockReceipt = null,
  projectionCurrentness = null
} = {}) {
  const burden = source.burdenRelease ?? null;
  return stateFingerprinted({
    schemaVersion: 'vexlife.continuity-aggregate-projection-receipt/v1',
    projectionKind,
    aggregateFingerprint: aggregate.semanticFingerprint,
    sourceRef: source.acceptedRecordRef ?? source.contextRecordRef,
    sourceFingerprint: source.semanticFingerprint,
    candidateRef: lineage.candidate.candidateRef,
    candidateFingerprint: lineage.candidate.semanticFingerprint,
    routeRef: lineage.route.routeRef,
    routeFingerprint: lineage.route.semanticFingerprint,
    reviewRef: lineage.review.reviewRef,
    reviewFingerprint: lineage.review.semanticFingerprint,
    recordClass: source.recordClass ?? lineage.route.proposedPrimaryDestination,
    scope: source.scope,
    scopeTargetRef: source.scopeTargetRef,
    scopeTargetFingerprint: source.scopeTargetFingerprint,
    continuitySubjectRef: source.continuitySubjectRef,
    continuitySubjectFingerprint: source.continuitySubjectFingerprint,
    subjectSupersessionChronology: currentSet?.supersessionChronologyBindings
      ?.filter((binding) => binding.continuitySubjectRef === source.continuitySubjectRef &&
        binding.continuitySubjectFingerprint === source.continuitySubjectFingerprint) ?? [],
    requiredAcceptanceRefs: [...lineage.review.requiredAcceptanceRefs],
    acceptedByRefs: [...source.acceptedByRefs],
    authorityEvidenceRefs: [...source.acceptanceEvidenceRefs].sort(),
    authorityEvidenceClass: source.authorityEvidenceClass,
    acceptanceDisposition: source.acceptanceDisposition,
    burdenRef: burden?.burdenRef ?? null,
    burdenIdentityFingerprint: burden?.identityFingerprint ?? null,
    burdenSourceFingerprint: burden ? semanticHash(burden.sourceForm) : null,
    currentRecordSetRef: currentSet?.currentRecordSetRef ?? null,
    currentRecordSetFingerprint: currentSet?.semanticFingerprint ?? null,
    currentSetDisposition,
    currentSuccessorRef,
    projectionClockReceiptRef: projectionClockReceipt?.clockReceiptRef ?? null,
    projectionClockReceiptFingerprint: projectionClockReceipt?.semanticFingerprint ?? null,
    clockSourceRef: projectionClockReceipt?.clockSourceRef ?? null,
    clockSourceFingerprint: projectionClockReceipt?.clockSourceFingerprint ?? null,
    clockSnapshotRef: projectionClockReceipt?.clockSnapshotRef ?? null,
    clockSnapshotFingerprint: projectionClockReceipt?.clockSnapshotFingerprint ?? null,
    clockEvidenceClass: projectionClockReceipt?.clockEvidenceClass ?? null,
    clockCurrentFrom: projectionClockReceipt?.clockCurrentFrom ?? null,
    clockCurrentUntil: projectionClockReceipt?.clockCurrentUntil ?? null,
    contextAcceptedAt: projectionClockReceipt?.contextAcceptedAt ?? null,
    simulatedClock: projectionClockReceipt?.simulatedClock ?? null,
    liveClockGranted: projectionClockReceipt?.liveClockGranted ?? null,
    externalTimeServiceUsed: projectionClockReceipt?.externalTimeServiceUsed ?? null,
    projectionObservedAt: projectionClockReceipt?.projectionObservedAt ?? null,
    projectionCurrentness
  }, 'projectionReceiptRef', 'continuity-aggregate-projection-receipt');
}

export function projectAggregateOwnedContinuityRecord({ aggregate, acceptedRecordRef, acceptedRecordFingerprint }) {
  const { record, lineage } = resolveAggregateRecord(aggregate, acceptedRecordRef, acceptedRecordFingerprint);
  const currentSet = createContinuityCurrentRecordSetReceipt(aggregate);
  const currentMeaning = currentSetProjectionMeaning(aggregate, currentSet, record);
  const ownershipReceipt = projectionOwnershipReceipt(aggregate, record, lineage, 'HUMAN_RECORD', currentSet, currentMeaning);
  return freeze({
    schemaVersion: 'vexlife.continuity-human-projection/v2',
    acceptedRecordRef: record.acceptedRecordRef,
    acceptedRecordFingerprint: record.semanticFingerprint,
    aggregateProjectionReceipt: ownershipReceipt,
    observedPatternOrPreferenceRef: record.summaryRef,
    experienceOrPreferenceOwnerRefs: stableStringRefs([...record.aboutSelfRefs, ...record.affectedPartyRefs], 'projection owner refs'),
    sourceSupport: { observationRefs: [...record.sourceObservationRefs], sourceBindingCount: record.sourceBindings.length, rawContentIncluded: false },
    privacyEvidenceRef: record.privacyEvidenceRef,
    redactionEvidenceRef: record.redactionEvidenceRef,
    changed: record.recordClass,
    authorityTransition: record.burdenRelease?.authorityTransition ?? 'ACCEPTED_SCOPED_RECORD',
    protectedCapabilities: [...record.protectedCapabilities],
    prohibitedOvercorrections: [...record.prohibitedOvercorrections],
    scope: record.scope,
    scopeTargetRef: record.scopeTargetRef,
    scopeTargetFingerprint: record.scopeTargetFingerprint,
    continuitySubjectRef: record.continuitySubjectRef,
    continuitySubjectFingerprint: record.continuitySubjectFingerprint,
    subjectSupersessionChronology: ownershipReceipt.subjectSupersessionChronology,
    authorityEvidenceClass: record.authorityEvidenceClass,
    simulatedAuthority: record.simulatedAuthority,
    liveAuthorityGranted: record.liveAuthorityGranted,
    externalEffectsAuthorized: record.externalEffectsAuthorized,
    acceptanceDisposition: record.acceptanceDisposition,
    liveApplicabilityGranted: record.liveApplicabilityGranted,
    currentSetDisposition: currentMeaning.currentSetDisposition,
    currentSuccessorRef: currentMeaning.currentSuccessorRef,
    state: record.lifecycle,
    nextSafeAction: currentMeaning.currentSetDisposition === 'HELD_CONFLICT'
      ? 'RETURN_TO_CURRENT_RECORD_CONFLICT_REVIEW'
      : currentMeaning.currentSetDisposition === 'SUPERSEDED'
        ? 'FOLLOW_CURRENT_SUCCESSOR_BY_REF_ONLY'
        : record.acceptanceDisposition === 'SIMULATION_ONLY_INACTIVE'
      ? 'USE_ONLY_IN_EXPLICIT_SIMULATED_CURRENT_CONTEXT'
      : record.lifecycle === 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW'
        ? 'OPEN_SEPARATE_DETERMINISTIC_IMPLEMENTATION_REVIEW'
        : record.recurrenceState === 'REOPEN_REVIEW' ? 'RETURN_TO_CONTEXT_REVIEW' : 'APPLY_BY_REF_ONLY_WHEN_SCOPE_MATCHES'
  });
}

function canonicalProjectionTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error('continuity projection observed time must be canonical UTC');
  }
  return value;
}

export function createContinuitySimulatedClockSnapshot({ aggregate, contextRecordRef, contextRecordFingerprint, observedAt }) {
  validateAggregateSnapshot(aggregate);
  const context = aggregate.transientContexts.find((item) => item.contextRecordRef === contextRecordRef);
  if (!context || context.semanticFingerprint !== contextRecordFingerprint) {
    throw new Error('continuity simulated clock source is not the exact aggregate-owned transient context');
  }
  validateAggregateOwnedContext(aggregate, context);
  const observed = canonicalProjectionTimestamp(observedAt);
  if (Date.parse(observed) < Date.parse(context.contextLease.observedAt)) {
    throw new Error('continuity simulated clock cannot precede lease observation');
  }
  if (Date.parse(observed) < Date.parse(context.acceptedAt)) {
    throw new Error('continuity simulated clock cannot precede context acceptance');
  }
  if (Date.parse(observed) >= Date.parse(context.contextLease.expiresAt)) {
    throw new Error('continuity simulated clock is at or after lease expiry');
  }
  return stateFingerprinted({
    schemaVersion: 'vexlife.continuity-simulated-clock-snapshot/v1',
    aggregatePriorFingerprint: aggregate.semanticFingerprint,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    contextBindingRef: context.contextLease.contextBindingRef,
    contextLeaseFingerprint: context.contextLease.semanticFingerprint,
    turnRef: context.contextLease.turnRef,
    threadRef: context.contextLease.threadRef,
    channelRef: context.contextLease.channelRef,
    clockSourceRef: CONTINUITY_SIMULATED_CLOCK_SOURCE.clockSourceRef,
    clockSourceFingerprint: CONTINUITY_SIMULATED_CLOCK_SOURCE.semanticFingerprint,
    sourceRef: CONTINUITY_SIMULATED_CLOCK_SOURCE.sourceRef,
    sourceField: CONTINUITY_SIMULATED_CLOCK_SOURCE.sourceField,
    clockEvidenceClass: 'SIMULATED_CURRENT',
    observedAt: observed,
    currentFrom: observed,
    currentUntil: context.contextLease.expiresAt,
    contextAcceptedAt: context.acceptedAt,
    currentness: 'SIMULATED_CURRENT',
    simulatedClock: true,
    liveClockGranted: false,
    externalTimeServiceUsed: false
  }, 'clockSnapshotRef', 'continuity-simulated-clock-snapshot');
}

function validateContinuitySimulatedClockSnapshot(snapshot, { aggregate, context, requireCurrent = false } = {}) {
  if (!snapshot?.clockSnapshotRef || !snapshot.semanticFingerprint) throw new Error('continuity simulated clock snapshot is missing canonical identity');
  const core = clone(snapshot);
  const ref = core.clockSnapshotRef;
  const fingerprint = core.semanticFingerprint;
  delete core.clockSnapshotRef;
  delete core.semanticFingerprint;
  const expected = semanticHash(core);
  if (fingerprint !== expected || ref !== `continuity-simulated-clock-snapshot.${expected.slice(0, 24)}`) {
    throw new Error('continuity simulated clock snapshot fingerprint or ref mismatch');
  }
  if (snapshot.schemaVersion !== 'vexlife.continuity-simulated-clock-snapshot/v1' ||
      snapshot.clockSourceRef !== CONTINUITY_SIMULATED_CLOCK_SOURCE.clockSourceRef ||
      snapshot.clockSourceFingerprint !== CONTINUITY_SIMULATED_CLOCK_SOURCE.semanticFingerprint ||
      snapshot.sourceRef !== CONTINUITY_SIMULATED_CLOCK_SOURCE.sourceRef ||
      snapshot.sourceField !== CONTINUITY_SIMULATED_CLOCK_SOURCE.sourceField ||
      snapshot.clockEvidenceClass !== 'SIMULATED_CURRENT' || snapshot.currentness !== 'SIMULATED_CURRENT' ||
      snapshot.simulatedClock !== true || snapshot.liveClockGranted !== false ||
      snapshot.externalTimeServiceUsed !== false) {
    throw new Error('continuity clock snapshot is not the exact registered deterministic simulated source');
  }
  canonicalProjectionTimestamp(snapshot.observedAt);
  canonicalProjectionTimestamp(snapshot.currentFrom);
  canonicalProjectionTimestamp(snapshot.currentUntil);
  canonicalProjectionTimestamp(snapshot.contextAcceptedAt);
  if (snapshot.currentFrom !== snapshot.observedAt || Date.parse(snapshot.currentUntil) <= Date.parse(snapshot.currentFrom)) {
    throw new Error('continuity simulated clock currentness interval is invalid');
  }
  if (Date.parse(snapshot.observedAt) < Date.parse(snapshot.contextAcceptedAt)) {
    throw new Error('continuity simulated clock precedes bound context acceptance');
  }
  if (context && (snapshot.contextRecordRef !== context.contextRecordRef ||
      snapshot.contextRecordFingerprint !== context.semanticFingerprint ||
      snapshot.contextBindingRef !== context.contextLease.contextBindingRef ||
      snapshot.contextLeaseFingerprint !== context.contextLease.semanticFingerprint ||
      snapshot.turnRef !== context.contextLease.turnRef || snapshot.threadRef !== context.contextLease.threadRef ||
      snapshot.channelRef !== context.contextLease.channelRef ||
      snapshot.currentUntil !== context.contextLease.expiresAt ||
      snapshot.contextAcceptedAt !== context.acceptedAt ||
      Date.parse(snapshot.observedAt) < Date.parse(context.contextLease.observedAt) ||
      Date.parse(snapshot.observedAt) < Date.parse(context.acceptedAt) ||
      Date.parse(snapshot.observedAt) >= Date.parse(context.contextLease.expiresAt))) {
    throw new Error('continuity simulated clock snapshot is detached from its exact context and lease');
  }
  if (aggregate) {
    if (!requireCurrent && snapshot.aggregatePriorFingerprint !== aggregate.semanticFingerprint) {
      throw new Error('continuity simulated clock snapshot does not advance the exact aggregate prior');
    }
    if (requireCurrent) {
      const stored = aggregate.clockSnapshots.find((item) => item.clockSnapshotRef === snapshot.clockSnapshotRef);
      if (!stored || stored.semanticFingerprint !== snapshot.semanticFingerprint ||
          aggregate.currentClockSnapshotRef !== snapshot.clockSnapshotRef) {
        throw new Error('continuity simulated clock snapshot is stale, superseded or not aggregate current');
      }
    }
  }
  return snapshot;
}

export function createContinuityProjectionClockReceipt({ aggregate, contextRecordRef, contextRecordFingerprint, clockSnapshotRef, clockSnapshotFingerprint }) {
  validateAggregateSnapshot(aggregate);
  const context = aggregate.transientContexts.find((item) => item.contextRecordRef === contextRecordRef);
  if (!context || context.semanticFingerprint !== contextRecordFingerprint) {
    throw new Error('continuity projection clock source is not the exact aggregate-owned transient context');
  }
  validateAggregateOwnedContext(aggregate, context);
  const snapshot = aggregate.clockSnapshots.find((item) => item.clockSnapshotRef === clockSnapshotRef);
  if (!snapshot || snapshot.semanticFingerprint !== clockSnapshotFingerprint) {
    throw new Error('continuity projection requires an exact aggregate-owned simulated clock snapshot');
  }
  validateContinuitySimulatedClockSnapshot(snapshot, { aggregate, context, requireCurrent: true });
  return stateFingerprinted({
    schemaVersion: 'vexlife.continuity-projection-clock-receipt/v2',
    aggregateFingerprint: aggregate.semanticFingerprint,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    contextBindingRef: context.contextLease.contextBindingRef,
    contextLeaseFingerprint: context.contextLease.semanticFingerprint,
    turnRef: context.contextLease.turnRef,
    threadRef: context.contextLease.threadRef,
    channelRef: context.contextLease.channelRef,
    leaseObservedAt: context.contextLease.observedAt,
    leaseExpiresAt: context.contextLease.expiresAt,
    contextAcceptedAt: context.acceptedAt,
    clockSourceRef: snapshot.clockSourceRef,
    clockSourceFingerprint: snapshot.clockSourceFingerprint,
    clockSnapshotRef: snapshot.clockSnapshotRef,
    clockSnapshotFingerprint: snapshot.semanticFingerprint,
    clockEvidenceClass: snapshot.clockEvidenceClass,
    clockCurrentFrom: snapshot.currentFrom,
    clockCurrentUntil: snapshot.currentUntil,
    projectionObservedAt: snapshot.observedAt,
    sourceCurrentness: context.currentness,
    projectionCurrentness: 'TRANSIENT_SIMULATED_CURRENT',
    applicable: true,
    sourceManaged: true,
    simulatedClock: true,
    liveClockGranted: false,
    externalTimeServiceUsed: false
  }, 'clockReceiptRef', 'continuity-projection-clock-receipt');
}

function exactProjectionClockReceipt(aggregate, context, supplied) {
  if (!supplied) throw new Error('current transient projection requires an exact source-managed clock receipt');
  const expected = createContinuityProjectionClockReceipt({
    aggregate,
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    clockSnapshotRef: supplied.clockSnapshotRef,
    clockSnapshotFingerprint: supplied.clockSnapshotFingerprint
  });
  if (supplied.clockReceiptRef !== expected.clockReceiptRef ||
      supplied.semanticFingerprint !== expected.semanticFingerprint ||
      semanticHash(supplied) !== semanticHash(expected)) {
    throw new Error('continuity projection clock receipt is stale, cross-lease or substituted');
  }
  return expected;
}

export function projectAggregateOwnedTransientContinuityContext({ aggregate, contextRecordRef, contextRecordFingerprint, projectionClockReceipt }) {
  validateAggregateSnapshot(aggregate);
  const context = aggregate.transientContexts.find((item) => item.contextRecordRef === contextRecordRef);
  if (!context || context.semanticFingerprint !== contextRecordFingerprint) {
    throw new Error('continuity projection source is not the exact aggregate-owned transient context');
  }
  const lineage = validateAggregateOwnedContext(aggregate, context);
  const clockReceipt = exactProjectionClockReceipt(aggregate, context, projectionClockReceipt);
  const ownershipReceipt = projectionOwnershipReceipt(aggregate, context, lineage, 'TRANSIENT_CONTEXT', null, {
    projectionClockReceipt: clockReceipt,
    projectionCurrentness: clockReceipt.projectionCurrentness
  });
  return freeze({
    schemaVersion: 'vexlife.transient-continuity-projection/v2',
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    aggregateProjectionReceipt: ownershipReceipt,
    summaryRef: context.summaryRef,
    scope: context.scope,
    scopeTargetRef: context.scopeTargetRef,
    scopeTargetFingerprint: context.scopeTargetFingerprint,
    continuitySubjectRef: context.continuitySubjectRef,
    continuitySubjectFingerprint: context.continuitySubjectFingerprint,
    contextBindingRef: context.contextLease.contextBindingRef,
    projectionClockReceipt: clockReceipt,
    projectionObservedAt: clockReceipt.projectionObservedAt,
    contextAcceptedAt: clockReceipt.contextAcceptedAt,
    expiresAt: context.expiresAt,
    currentness: clockReceipt.projectionCurrentness,
    applicableWithinLease: true,
    clockEvidenceClass: clockReceipt.clockEvidenceClass,
    simulatedClock: clockReceipt.simulatedClock,
    liveClockGranted: clockReceipt.liveClockGranted,
    externalTimeServiceUsed: clockReceipt.externalTimeServiceUsed,
    authorityEvidenceClass: context.authorityEvidenceClass,
    simulatedAuthority: context.simulatedAuthority,
    liveAuthorityGranted: context.liveAuthorityGranted,
    externalEffectsAuthorized: context.externalEffectsAuthorized,
    acceptanceDisposition: context.acceptanceDisposition,
    liveApplicabilityGranted: context.liveApplicabilityGranted,
    rawSourceContentIncluded: false
  });
}

export function projectAggregateOwnedBurdenRelease({ aggregate, acceptedRecordRef, acceptedRecordFingerprint }) {
  const { record, lineage } = resolveAggregateRecord(aggregate, acceptedRecordRef, acceptedRecordFingerprint);
  if (record.recordClass !== 'BURDEN_RELEASE' || !record.burdenRelease) {
    throw new Error('aggregate-owned Burden projection requires an accepted Burden record');
  }
  validateBurdenRelease(record.burdenRelease);
  const currentSet = createContinuityCurrentRecordSetReceipt(aggregate);
  const currentMeaning = currentSetProjectionMeaning(aggregate, currentSet, record);
  const ownershipReceipt = projectionOwnershipReceipt(aggregate, record, lineage, 'BURDEN_RELEASE', currentSet, currentMeaning);
  const release = record.burdenRelease;
  return freeze({
    schemaVersion: 'vexlife.burden-release-projection/v2',
    burdenRef: release.burdenRef,
    patternRef: `pattern.${release.identityFingerprint.slice(0, 24)}`,
    aggregateProjectionReceipt: ownershipReceipt,
    change: release.authorityTransition,
    formerAuthority: release.formerAuthority,
    currentAuthority: release.currentAuthority,
    protectedCapabilities: [...release.protectedCapabilities],
    prohibitedOvercorrections: [...release.prohibitedOvercorrections],
    scope: release.scope,
    scopeTargetRef: release.scopeTargetRef,
    scopeTargetFingerprint: release.scopeTargetFingerprint,
    continuitySubjectRef: release.continuitySubjectRef,
    continuitySubjectFingerprint: release.continuitySubjectFingerprint,
    subjectSupersessionChronology: ownershipReceipt.subjectSupersessionChronology,
    state: release.state,
    recurrenceState: release.recurrenceState,
    transitionReceiptRefs: release.transitionReceipts.map((item) => item.transitionRef),
    authoritySnapshotRefs: [...release.authoritySnapshotRefs],
    authorityEvidenceClass: record.authorityEvidenceClass,
    simulatedAuthority: record.simulatedAuthority,
    liveAuthorityGranted: record.liveAuthorityGranted,
    externalEffectsAuthorized: record.externalEffectsAuthorized,
    acceptanceDisposition: record.acceptanceDisposition,
    currentSetDisposition: currentMeaning.currentSetDisposition,
    currentSuccessorRef: currentMeaning.currentSuccessorRef,
    claimsParameterDeletion: false,
    rawSourceContentIncluded: false,
    nextSafeAction: currentMeaning.currentSetDisposition === 'HELD_CONFLICT'
      ? 'RETURN_TO_CURRENT_RECORD_CONFLICT_REVIEW'
      : currentMeaning.currentSetDisposition === 'SUPERSEDED'
        ? 'FOLLOW_CURRENT_SUCCESSOR_BY_REF_ONLY'
        : record.acceptanceDisposition === 'SIMULATION_ONLY_INACTIVE'
      ? 'USE_ONLY_IN_EXPLICIT_SIMULATED_CURRENT_CONTEXT'
      : ['ACCEPTED_DEAUTHORIZED', 'MONITORED_FOR_RECURRENCE'].includes(release.state)
        ? 'MONITOR_EXACT_PATTERN_WITHOUT_SCOPE_BROADENING'
        : release.state === 'REOPENED' ? 'RETURN_TO_CONTEXT_REVIEW' : 'COMPLETE_EXACT_ACCEPTANCE_REVIEW'
  });
}

export function projectAggregateApplicableContinuity({
  aggregate,
  currentRecordSetReceipt,
  requestedRecordRefs = null,
  applicableScopeTargets,
  allowedAuthorityEvidenceClasses = [],
  tokenBudget = 256
}) {
  const currentSet = exactCurrentRecordSetReceipt(aggregate, currentRecordSetReceipt);
  if (currentSet.state !== 'CURRENT') throw new Error('HELD_CONFLICT continuity current set cannot produce applicable projection');
  if (!Array.isArray(applicableScopeTargets) || applicableScopeTargets.length === 0) {
    throw new Error('applicable continuity requires exact canonical scope targets, not scope classes alone');
  }
  const targetBindings = applicableScopeTargets.map((target) => {
    validateContinuityScopeTarget(target);
    return `${target.scopeClass}\0${target.scopeTargetRef}\0${target.semanticFingerprint}`;
  });
  if (new Set(targetBindings).size !== targetBindings.length) throw new Error('applicable continuity scope targets are duplicated');
  const targetSet = new Set(targetBindings);
  const allowedClasses = stableStringRefs(allowedAuthorityEvidenceClasses, 'allowed authority evidence classes');
  if (allowedClasses.some((item) => !CONTINUITY_AUTHORITY_EVIDENCE_CLASSES.includes(item))) {
    throw new Error('applicable continuity authority evidence class is unknown');
  }
  const requested = requestedRecordRefs === null
    ? [...currentSet.currentRecordRefs]
    : stableStringRefs(requestedRecordRefs, 'requested current record refs');
  if (requested.some((ref) => !currentSet.currentRecordRefs.includes(ref))) {
    throw new Error('applicable continuity requested record is absent from the exact current set');
  }
  const allowedClassSet = new Set(allowedClasses);
  const selected = [];
  const ownershipReceiptRefs = [];
  let usedTokens = 0;
  for (const ref of requested.sort()) {
    const record = aggregate.acceptedRecords.find((item) => item.acceptedRecordRef === ref);
    const resolved = resolveAggregateRecord(aggregate, ref, record?.semanticFingerprint);
    const item = resolved.record;
    if (!targetSet.has(`${item.scope}\0${item.scopeTargetRef}\0${item.scopeTargetFingerprint}`) ||
        !allowedClassSet.has(item.authorityEvidenceClass)) continue;
    const candidate = {
      acceptedRecordRef: item.acceptedRecordRef,
      acceptedRecordFingerprint: item.semanticFingerprint,
      recordClass: item.recordClass,
      scope: item.scope,
      scopeTargetRef: item.scopeTargetRef,
      scopeTargetFingerprint: item.scopeTargetFingerprint,
      continuitySubjectRef: item.continuitySubjectRef,
      continuitySubjectFingerprint: item.continuitySubjectFingerprint,
      authorityEvidenceClass: item.authorityEvidenceClass,
      simulatedAuthority: item.simulatedAuthority,
      liveAuthorityGranted: item.liveAuthorityGranted,
      externalEffectsAuthorized: item.externalEffectsAuthorized,
      acceptanceDisposition: item.acceptanceDisposition,
      burdenReleaseRef: item.burdenReleaseRef,
      protectedCapabilityCount: item.protectedCapabilities.length,
      prohibitedOvercorrectionCount: item.prohibitedOvercorrections.length
    };
    const cost = estimateTokens(candidate);
    if (usedTokens + cost > tokenBudget) continue;
    const currentMeaning = currentSetProjectionMeaning(aggregate, currentSet, item);
    const receipt = projectionOwnershipReceipt(aggregate, item, resolved.lineage, 'APPLICABLE_RECORD', currentSet, currentMeaning);
    selected.push(candidate);
    ownershipReceiptRefs.push(receipt.projectionReceiptRef);
    usedTokens += cost;
  }
  const core = {
    schemaVersion: 'vexlife.applicable-continuity-projection/v2',
    aggregateFingerprint: aggregate.semanticFingerprint,
    currentRecordSetRef: currentSet.currentRecordSetRef,
    currentRecordSetFingerprint: currentSet.semanticFingerprint,
    selected,
    selectedRecordRefs: selected.map((item) => item.acceptedRecordRef),
    ownershipReceiptRefs,
    applicableScopeTargetRefs: applicableScopeTargets.map((item) => item.scopeTargetRef).sort(),
    allowedAuthorityEvidenceClasses: allowedClasses,
    simulationAuthorityExplicitlyAllowed: allowedClassSet.has('SIMULATED_CURRENT'),
    tokenBudget,
    usedTokens,
    rawSourceContentIncluded: false,
    allHistoricalRecordsLoaded: false,
    weightArtifactsLoaded: false
  };
  return freeze({ ...core, semanticFingerprint: semanticHash(core) });
}

function simulatedAuthorityPromotion(record) {
  return record.authorityEvidenceClass === 'SIMULATED_CURRENT' &&
    (record.simulatedAuthority !== true || record.liveAuthorityGranted !== false ||
      record.externalEffectsAuthorized !== false || record.acceptanceDisposition !== 'SIMULATION_ONLY_INACTIVE' ||
      record.liveApplicabilityGranted !== false || record.synchronizationAuthorityActive !== false ||
      record.familyDeliveryAuthorized !== false || record.publicationAuthorityActive !== false ||
      record.effectAuthorityActive !== false || record.weightActivationState !== 'INACTIVE');
}

function projectedRecordSet(current) {
  const promoted = current.acceptedRecords.filter(simulatedAuthorityPromotion);
  if (!promoted.length) return validateContinuityRecordSet(current.acceptedRecords, current.supersessions);
  return stateFingerprinted({
    schemaVersion: 'vexlife.continuity-record-set-validation/v1',
    recordBindings: current.acceptedRecords.map((item) => ({
      acceptedRecordRef: item.acceptedRecordRef,
      acceptedRecordFingerprint: item.semanticFingerprint
    })).sort((left, right) => left.acceptedRecordRef.localeCompare(right.acceptedRecordRef)),
    supersessionBindings: current.supersessions.map((item) => ({
      supersessionRef: item.supersessionRef,
      supersessionFingerprint: item.semanticFingerprint
    })).sort((left, right) => left.supersessionRef.localeCompare(right.supersessionRef)),
    state: 'HELD_CONFLICT',
    currentRecordRefs: current.acceptedRecords.map((item) => item.acceptedRecordRef).sort(),
    supersededRecordRefs: current.supersessions.map((item) => item.priorRecordRef).sort(),
    conflicts: promoted.map((item) => [item.acceptedRecordRef]),
    invalidAuthorityRecordRefs: promoted.map((item) => item.acceptedRecordRef).sort(),
    silentOverwriteAllowed: false
  }, 'currentRecordSetRef', 'continuity-current-record-set');
}

export function reduceContinuityEvolutionAggregate(current, event) {
  validateEvent(event);
  const next = clone(current);
  switch (event.type) {
    case 'OBSERVATION_SEALED': {
      validateContinuityObservation(event.observation);
      const result = appendCanonical(next.observations, event.observation, 'observationRef', 'observation');
      if (!result.changed) return current;
      next.observations = result.items;
      break;
    }
    case 'CANDIDATE_FORMED': {
      validateContinuityCandidate(event.candidate);
      exactStoredCandidateSources(next, event.candidate);
      const result = appendCanonical(next.candidates, event.candidate, 'candidateRef', 'candidate');
      if (!result.changed) return current;
      next.candidates = result.items;
      break;
    }
    case 'REVIEW_RECORDED': {
      const candidate = next.candidates.find((item) => item.candidateRef === event.review.candidateRef);
      if (!candidate) throw new Error('review references unknown candidate');
      validateContinuityContextReview(candidate, routeContinuityCandidate(candidate), event.review);
      const result = appendCanonical(next.reviews, event.review, 'reviewRef', 'review');
      if (!result.changed) return current;
      next.reviews = result.items;
      if (event.review.reviewDisposition === 'REJECTED' && !next.rejectedCandidateRefs.includes(event.review.candidateRef)) {
        next.rejectedCandidateRefs.push(event.review.candidateRef);
      }
      break;
    }
    case 'AUTHORITY_EVIDENCE_RECORDED': {
      const lineage = aggregateCandidateRouteReview(next, event.evidence);
      validateContinuityAcceptanceEvidence(event.evidence, lineage);
      const result = appendCanonical(next.authorityEvidence, event.evidence, 'acceptanceEvidenceRef', 'authority evidence');
      if (!result.changed) return current;
      next.authorityEvidence = result.items;
      break;
    }
    case 'RECORD_ACCEPTED': {
      if (event.record?.supersedesRef !== null) {
        throw new Error('ordinary RECORD_ACCEPTED cannot admit a superseding successor without its atomic transaction');
      }
      validateAggregateOwnedRecord(next, event.record);
      const result = appendCanonical(next.acceptedRecords, event.record, 'acceptedRecordRef', 'accepted record');
      if (!result.changed) return current;
      next.acceptedRecords = result.items;
      break;
    }
    case 'CLOCK_SNAPSHOT_RECORDED': {
      const context = next.transientContexts.find((item) => item.contextRecordRef === event.snapshot?.contextRecordRef);
      if (!context || context.semanticFingerprint !== event.snapshot.contextRecordFingerprint) {
        throw new Error('clock snapshot context is not the exact aggregate-owned transient context');
      }
      validateAggregateOwnedContext(next, context);
      validateContinuitySimulatedClockSnapshot(event.snapshot, { aggregate: current, context });
      const prior = next.clockSnapshots.find((item) => item.clockSnapshotRef === next.currentClockSnapshotRef);
      if (prior && Date.parse(event.snapshot.observedAt) <= Date.parse(prior.observedAt)) {
        throw new Error('continuity simulated clock must advance strictly beyond the current snapshot');
      }
      const result = appendCanonical(next.clockSnapshots, event.snapshot, 'clockSnapshotRef', 'simulated clock snapshot');
      if (!result.changed) throw new Error('continuity simulated clock snapshot replay is stale');
      next.clockSnapshots = result.items;
      next.currentClockSnapshotRef = event.snapshot.clockSnapshotRef;
      break;
    }
    case 'CONTEXT_APPLIED': {
      validateAggregateOwnedContext(next, event.context);
      const result = appendCanonical(next.transientContexts, event.context, 'contextRecordRef', 'transient context');
      if (!result.changed) return current;
      next.transientContexts = result.items;
      break;
    }
    case 'RECURRENCE_RECORDED': {
      if (event.evidence.changed === false) {
        const prior = next.recurrenceEvidence.find((item) => item.acceptedRecordRef === event.evidence.acceptedRecordRef);
        const expectedDuplicate = prior ? {
          ...clone(prior),
          changed: false,
          duplicateSuppressed: true,
          semanticModelTurnRequired: false,
          scopeBroadened: false,
          weightRouteState: 'NOT_ADMITTED'
        } : null;
        if (!prior || prior.recurrenceRef !== event.evidence.recurrenceRef || prior.semanticFingerprint !== event.evidence.semanticFingerprint ||
            event.evidence.duplicateSuppressed !== true || event.evidence.semanticModelTurnRequired !== false ||
            !exactSemanticValue(event.evidence, expectedDuplicate)) {
          throw new Error('duplicate recurrence no-op does not bind exact current evidence');
        }
        return current;
      }
      if (next.recurrenceEvidence.some((item) => item.semanticFingerprint === event.evidence.semanticFingerprint)) return current;
      validateContinuityRecurrenceEvidence(event.evidence);
      const record = next.acceptedRecords.find((item) => item.acceptedRecordRef === event.evidence.acceptedRecordRef);
      if (!record || record.semanticFingerprint !== event.evidence.acceptedRecordFingerprint) throw new Error('recurrence does not bind an exact aggregate-owned accepted record');
      validateAggregateOwnedRecord(next, record);
      const sameRef = next.recurrenceEvidence.find((item) => item.recurrenceRef === event.evidence.recurrenceRef);
      if (sameRef && sameRef.semanticFingerprint !== event.evidence.semanticFingerprint) throw new Error('recurrence same-ref/different-content conflict');
      const prior = next.recurrenceEvidence.find((item) => item.acceptedRecordRef === event.evidence.acceptedRecordRef);
      if (prior && (event.evidence.priorRecurrenceRef !== prior.recurrenceRef || event.evidence.priorRecurrenceFingerprint !== prior.semanticFingerprint)) throw new Error('recurrence event does not advance exact prior chain');
      const priorRefs = new Set(prior?.observationBindings.map((item) => item.observationRef) ?? []);
      const newBindings = event.evidence.observationBindings.filter((item) => !priorRefs.has(item.observationRef));
      if (newBindings.length !== 1 || event.evidence.observationBindings.length !== (prior?.observationBindings.length ?? 0) + 1) {
        throw new Error('recurrence event must add exactly one aggregate-owned sealed observation');
      }
      for (const binding of event.evidence.observationBindings) {
        const observation = next.observations.find((item) => item.observationRef === binding.observationRef);
        if (!observation || observation.semanticFingerprint !== binding.observationFingerprint) throw new Error('recurrence references unknown or conflicting sealed observation');
      }
      const observation = next.observations.find((item) => item.observationRef === newBindings[0].observationRef);
      const recomputed = recordContinuityRecurrence({
        acceptedRecord: record,
        observation,
        priorEvidence: prior ?? null,
        scope: event.evidence.scope,
        reopenThreshold: event.evidence.reopenThreshold,
        observedAt: event.evidence.observedAt
      });
      if (recomputed.recurrenceRef !== event.evidence.recurrenceRef || recomputed.semanticFingerprint !== event.evidence.semanticFingerprint) {
        throw new Error('recurrence is internally canonical but not derived from aggregate-owned record/observation lineage');
      }
      next.recurrenceEvidence = [...next.recurrenceEvidence.filter((item) => item.acceptedRecordRef !== event.evidence.acceptedRecordRef), clone(event.evidence)];
      break;
    }
    case 'RECORD_SUPERSEDED': {
      const prior = next.acceptedRecords.find((item) => item.acceptedRecordRef === event.transaction?.priorRecordRef);
      if (!prior || prior.semanticFingerprint !== event.transaction.priorRecordFingerprint) throw new Error('supersession prior is not the exact current aggregate record');
      const currentSetBefore = validateContinuityRecordSet(next.acceptedRecords, next.supersessions);
      if (!currentSetBefore.currentRecordRefs.includes(prior.acceptedRecordRef) ||
          next.supersessions.some((item) => item.priorRecordRef === prior.acceptedRecordRef)) {
        throw new Error('supersession prior is already superseded or absent from exact current truth');
      }
      if (next.supersessions.some((item) => item.supersessionRef === event.transaction.supersessionRef ||
          item.semanticFingerprint === event.transaction.semanticFingerprint)) {
        throw new Error('supersession transaction identity is duplicated');
      }
      validateAggregateOwnedRecord(next, event.successor);
      validateContinuitySupersession(event.transaction, [prior, event.successor]);
      const result = appendCanonical(next.acceptedRecords, event.successor, 'acceptedRecordRef', 'supersession successor');
      if (!result.changed) throw new Error('supersession successor must be a new exact record');
      next.acceptedRecords = result.items;
      next.supersessions.push(clone(event.transaction));
      validateContinuityRecordSet(next.acceptedRecords, next.supersessions);
      break;
    }
    default:
      throw new Error(`unknown continuity evolution event ${event.type}`);
  }
  next.observations.sort((left, right) => left.observationRef.localeCompare(right.observationRef));
  next.candidates.sort((left, right) => left.candidateRef.localeCompare(right.candidateRef));
  next.reviews.sort((left, right) => left.reviewRef.localeCompare(right.reviewRef));
  next.authorityEvidence.sort((left, right) => left.acceptanceEvidenceRef.localeCompare(right.acceptanceEvidenceRef));
  next.acceptedRecords.sort((left, right) => left.acceptedRecordRef.localeCompare(right.acceptedRecordRef));
  next.transientContexts.sort((left, right) => left.contextRecordRef.localeCompare(right.contextRecordRef));
  next.clockSnapshots.sort((left, right) => left.clockSnapshotRef.localeCompare(right.clockSnapshotRef));
  next.supersessions.sort((left, right) => left.supersessionRef.localeCompare(right.supersessionRef));
  next.recurrenceEvidence.sort((left, right) => left.acceptedRecordRef.localeCompare(right.acceptedRecordRef));
  next.rejectedCandidateRefs.sort();
  next.lastTransitionRef = event.transitionRef;
  delete next.semanticFingerprint;
  next.semanticFingerprint = semanticHash(next);
  return next.semanticFingerprint === current.semanticFingerprint ? current : next;
}

export function createContinuityEvolutionState({ aggregate = createInitialContinuityEvolutionAggregate() } = {}) {
  const aggregateState = new StateCell(aggregate, { name: 'continuity-evolution.aggregate' });
  const evolution = selectState(aggregateState, (current) => {
    const recordSet = projectedRecordSet(current);
    return {
      schemaVersion: 'vexlife.continuity-evolution-projection/v1',
      currentness: current.currentness,
      observationCount: current.observations.length,
      candidateCount: current.candidates.length,
      reviewCount: current.reviews.length,
      acceptedRecordCount: recordSet.currentRecordRefs.length,
      transientContextCount: current.transientContexts.length,
      currentClockSnapshotRef: current.currentClockSnapshotRef,
      heldCandidateRefs: current.candidates
        .filter((candidate) => !current.reviews.some((review) => review.candidateRef === candidate.candidateRef && ['ACCEPTED', 'REJECTED'].includes(review.reviewDisposition)))
        .map((item) => item.candidateRef),
      acceptedRecordRefs: recordSet.currentRecordRefs,
      supersededRecordRefs: recordSet.supersededRecordRefs,
      recordConflicts: recordSet.conflicts,
      recurrence: current.recurrenceEvidence.map((item) => ({
        acceptedRecordRef: item.acceptedRecordRef,
        scopeTargetRef: item.scopeTargetRef,
        recurrenceState: item.recurrenceState,
        recurrenceCount: item.recurrenceCount
      })),
      aggregateFingerprint: current.semanticFingerprint,
      rawSourceContentIncluded: false
    };
  }, { name: 'continuity-evolution.current' });

  const queue = selectState(evolution, (current) => ({
    schemaVersion: 'vexlife.continuity-evolution-queue-projection/v0',
    state: current.heldCandidateRefs.length ? 'CONTEXT_REVIEW_REQUIRED' : 'NO_PENDING_REVIEW',
    candidateRefs: current.heldCandidateRefs,
    sourceProjectionRef: 'projection.continuity-evolution.current'
  }), { name: 'continuity-evolution.queue' });

  const terrain = selectState(evolution, (current) => ({
    schemaVersion: 'vexlife.continuity-evolution-terrain-projection/v0',
    state: current.heldCandidateRefs.length ? 'ATTENTION' : 'CURRENT',
    activeRecordRefs: current.acceptedRecordRefs,
    heldCandidateRefs: current.heldCandidateRefs,
    recurrence: current.recurrence,
    sourceProjectionRef: 'projection.continuity-evolution.current'
  }), { name: 'continuity-evolution.terrain' });

  const health = selectState(aggregateState, (current) => {
    const recordSet = projectedRecordSet(current);
    const blocking = current.acceptedRecords.filter((record) =>
      JSON.stringify(record.requiredAcceptanceRefs) !== JSON.stringify(record.acceptedByRefs) ||
      JSON.stringify(record.acceptanceEvidenceRefs) !== JSON.stringify((record.acceptanceEvidence ?? []).map((item) => item.acceptanceEvidenceRef).sort()) ||
      record.weightActivationState !== 'INACTIVE' || record.effectAuthorityActive !== false ||
      record.authorityEvidenceClass !== 'SIMULATED_CURRENT' || record.simulatedAuthority !== true ||
      record.liveAuthorityGranted !== false || record.externalEffectsAuthorized !== false ||
      record.acceptanceDisposition !== 'SIMULATION_ONLY_INACTIVE' || record.liveApplicabilityGranted !== false ||
      record.synchronizationAuthorityActive !== false || record.familyDeliveryAuthorized !== false ||
      record.publicationAuthorityActive !== false || simulatedAuthorityPromotion(record)
    );
    const attention = current.candidates.filter((candidate) =>
      !current.reviews.some((review) => review.candidateRef === candidate.candidateRef && ['ACCEPTED', 'REJECTED'].includes(review.reviewDisposition))
    );
    return {
      schemaVersion: 'vexlife.continuity-evolution-health-projection/v1',
      state: blocking.length || recordSet.conflicts.length ? 'BLOCKED' : attention.length ? 'ATTENTION' : 'CLEAR',
      blockingRecordRefs: blocking.map((item) => item.acceptedRecordRef),
      recordConflicts: recordSet.conflicts,
      reviewRequiredCandidateRefs: attention.map((item) => item.candidateRef),
      acceptedWeightActivations: current.acceptedRecords.filter((item) => item.weightActivationState !== 'INACTIVE').length,
      simulatedAuthorityPromotions: current.acceptedRecords.filter((record) =>
        record.authorityEvidenceClass === 'SIMULATED_CURRENT' &&
        (record.liveAuthorityGranted !== false || record.externalEffectsAuthorized !== false ||
          record.liveApplicabilityGranted !== false || record.synchronizationAuthorityActive !== false ||
          record.familyDeliveryAuthorized !== false || record.publicationAuthorityActive !== false ||
          record.effectAuthorityActive !== false || record.weightActivationState !== 'INACTIVE')
      ).length,
      rawMachineDumpIncluded: false
    };
  }, { name: 'continuity-evolution.health' });

  const guide = selectState(evolution, (current) => ({
    schemaVersion: 'vexlife.continuity-evolution-guide-projection/v0',
    whatIsHappeningNow: current.heldCandidateRefs.length
      ? `CONTEXT_REVIEW:${current.heldCandidateRefs[0]}`
      : current.recurrence.some((item) => item.recurrenceState === 'REOPEN_REVIEW')
        ? 'RECURRENCE_REVIEW_REQUIRED'
        : 'CONTINUITY_CURRENT',
    nextSafeAction: current.heldCandidateRefs.length
      ? 'REVIEW_EXACT_SOURCE_SCOPE_AND_ACCEPTANCE_AUTHORITY'
      : current.recurrence.some((item) => item.recurrenceState === 'REOPEN_REVIEW')
        ? 'REOPEN_EXACT_ACCEPTED_RECORD'
        : 'LOAD_APPLICABLE_RECORD_REFS_ONLY',
    sourceDescentRef: 'projection.continuity-evolution.current'
  }), { name: 'continuity-evolution.guide' });

  const record = (event) => aggregateState.update((current) => reduceContinuityEvolutionAggregate(current, event), {
    transitionRef: event.transitionRef
  });
  const dispose = () => {
    guide.dispose();
    health.dispose();
    terrain.dispose();
    queue.dispose();
    evolution.dispose();
  };

  return { aggregate: aggregateState, evolution, queue, terrain, health, guide, record, dispose };
}

// [VXG RealForever]
