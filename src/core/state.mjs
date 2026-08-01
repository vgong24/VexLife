import { StateCell, selectState } from './state-relay.mjs';
import { semanticHash } from './utils.mjs';

export { StateCell, selectState };

function clone(value) {
  return structuredClone(value);
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

export function reduceSchedulerAggregate(current, event) {
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
      break;
    case 'CANCELLED':
      next.phase = next.continuations.length ? 'CONTINUATION_READY' : 'CANCELLED';
      next.active = null;
      next.queue = clone(event.queue);
      for (const lease of Object.values(event.transitionedLeases)) next.leaseLedger[lease.leaseRef] = clone(lease);
      if (event.relayLedger) next.relayLedger = clone(event.relayLedger);
      if (event.observedClock) next.observedClock = clone(event.observedClock);
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

export function createIntentSchedulerState({ aggregate = createInitialSchedulerAggregate() } = {}) {
  const aggregateState = new StateCell(aggregate, { name: 'intent-scheduler.aggregate' });

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
    schemaVersion: 'vexlife.continuity-evolution-aggregate/v0',
    currentness: 'CURRENT',
    observations: [],
    candidates: [],
    reviews: [],
    acceptedRecords: [],
    recurrenceEvidence: [],
    rejectedCandidateRefs: [],
    lastTransitionRef: 'transition.continuity-evolution.initial'
  };
  aggregate.semanticFingerprint = semanticHash(aggregate);
  return aggregate;
}

function appendUnique(items, value, refField) {
  if (items.some((item) => item[refField] === value[refField] || item.semanticFingerprint === value.semanticFingerprint)) {
    return items;
  }
  return [...items, clone(value)];
}

export function reduceContinuityEvolutionAggregate(current, event) {
  if (!event?.type || !event.transitionRef) throw new Error('continuity evolution event type and transitionRef are required');
  const next = clone(current);
  switch (event.type) {
    case 'OBSERVATION_SEALED':
      if (next.observations.some((item) => item.observationRef === event.observation.observationRef || item.semanticFingerprint === event.observation.semanticFingerprint)) return current;
      next.observations = appendUnique(next.observations, event.observation, 'observationRef');
      break;
    case 'CANDIDATE_FORMED':
      if (next.candidates.some((item) => item.candidateRef === event.candidate.candidateRef || item.semanticFingerprint === event.candidate.semanticFingerprint)) return current;
      next.candidates = appendUnique(next.candidates, event.candidate, 'candidateRef');
      break;
    case 'REVIEW_RECORDED':
      if (next.reviews.some((item) => item.reviewRef === event.review.reviewRef || item.semanticFingerprint === event.review.semanticFingerprint)) return current;
      next.reviews = appendUnique(next.reviews, event.review, 'reviewRef');
      if (event.review.reviewDisposition === 'REJECTED' && !next.rejectedCandidateRefs.includes(event.review.candidateRef)) {
        next.rejectedCandidateRefs.push(event.review.candidateRef);
      }
      break;
    case 'RECORD_ACCEPTED':
      if (next.acceptedRecords.some((item) => item.acceptedRecordRef === event.record.acceptedRecordRef || item.semanticFingerprint === event.record.semanticFingerprint)) return current;
      next.acceptedRecords = appendUnique(next.acceptedRecords, event.record, 'acceptedRecordRef');
      break;
    case 'RECURRENCE_RECORDED':
      if (event.evidence.changed === false || next.recurrenceEvidence.some((item) => item.semanticFingerprint === event.evidence.semanticFingerprint)) return current;
      if (event.evidence.changed !== false) {
        const withoutPrior = next.recurrenceEvidence.filter((item) => item.acceptedRecordRef !== event.evidence.acceptedRecordRef);
        next.recurrenceEvidence = [...withoutPrior, clone(event.evidence)];
      }
      break;
    case 'RECORD_SUPERSEDED':
      next.acceptedRecords = next.acceptedRecords
        .filter((item) => ![event.prior.acceptedRecordRef, event.successor.acceptedRecordRef].includes(item.acceptedRecordRef));
      next.acceptedRecords.push(clone(event.prior), clone(event.successor));
      break;
    default:
      throw new Error(`unknown continuity evolution event ${event.type}`);
  }
  next.observations.sort((left, right) => left.observationRef.localeCompare(right.observationRef));
  next.candidates.sort((left, right) => left.candidateRef.localeCompare(right.candidateRef));
  next.reviews.sort((left, right) => left.reviewRef.localeCompare(right.reviewRef));
  next.acceptedRecords.sort((left, right) => left.acceptedRecordRef.localeCompare(right.acceptedRecordRef));
  next.recurrenceEvidence.sort((left, right) => left.acceptedRecordRef.localeCompare(right.acceptedRecordRef));
  next.rejectedCandidateRefs.sort();
  next.lastTransitionRef = event.transitionRef;
  delete next.semanticFingerprint;
  next.semanticFingerprint = semanticHash(next);
  return next.semanticFingerprint === current.semanticFingerprint ? current : next;
}

export function createContinuityEvolutionState({ aggregate = createInitialContinuityEvolutionAggregate() } = {}) {
  const aggregateState = new StateCell(aggregate, { name: 'continuity-evolution.aggregate' });
  const evolution = selectState(aggregateState, (current) => ({
    schemaVersion: 'vexlife.continuity-evolution-projection/v0',
    currentness: current.currentness,
    observationCount: current.observations.length,
    candidateCount: current.candidates.length,
    reviewCount: current.reviews.length,
    acceptedRecordCount: current.acceptedRecords.filter((item) => item.currentness === 'CURRENT').length,
    heldCandidateRefs: current.candidates
      .filter((candidate) => !current.reviews.some((review) => review.candidateRef === candidate.candidateRef && ['ACCEPTED', 'REJECTED'].includes(review.reviewDisposition)))
      .map((item) => item.candidateRef),
    acceptedRecordRefs: current.acceptedRecords
      .filter((item) => item.currentness === 'CURRENT')
      .map((item) => item.acceptedRecordRef),
    recurrence: current.recurrenceEvidence.map((item) => ({
      acceptedRecordRef: item.acceptedRecordRef,
      recurrenceState: item.recurrenceState,
      recurrenceCount: item.recurrenceCount
    })),
    aggregateFingerprint: current.semanticFingerprint,
    rawSourceContentIncluded: false
  }), { name: 'continuity-evolution.current' });

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
    const blocking = current.acceptedRecords.filter((record) =>
      record.currentness === 'CURRENT' &&
      (record.requiredAcceptanceRefs?.length !== record.acceptedByRefs?.length || record.weightActivationState !== 'INACTIVE')
    );
    const attention = current.candidates.filter((candidate) =>
      !current.reviews.some((review) => review.candidateRef === candidate.candidateRef && ['ACCEPTED', 'REJECTED'].includes(review.reviewDisposition))
    );
    return {
      schemaVersion: 'vexlife.continuity-evolution-health-projection/v0',
      state: blocking.length ? 'BLOCKED' : attention.length ? 'ATTENTION' : 'CLEAR',
      blockingRecordRefs: blocking.map((item) => item.acceptedRecordRef),
      reviewRequiredCandidateRefs: attention.map((item) => item.candidateRef),
      acceptedWeightActivations: current.acceptedRecords.filter((item) => item.weightActivationState !== 'INACTIVE').length,
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
