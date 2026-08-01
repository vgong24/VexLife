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
  'schemaVersion', 'aggregateFingerprint', 'recordBindings', 'supersessionBindings', 'state',
  'currentRecordRefs', 'supersededRecordRefs', 'conflicts', 'silentOverwriteAllowed',
  'currentRecordSetRef', 'semanticFingerprint'
]);

export const CONTINUITY_AGGREGATE_PROJECTION_RECEIPT_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'projectionKind', 'aggregateFingerprint', 'sourceRef', 'sourceFingerprint',
  'candidateRef', 'candidateFingerprint', 'routeRef', 'routeFingerprint', 'reviewRef',
  'reviewFingerprint', 'recordClass', 'scope', 'scopeTargetRef', 'scopeTargetFingerprint',
  'requiredAcceptanceRefs', 'acceptedByRefs', 'authorityEvidenceRefs', 'authorityEvidenceClass',
  'acceptanceDisposition', 'burdenRef', 'burdenIdentityFingerprint', 'burdenSourceFingerprint',
  'currentRecordSetRef', 'currentRecordSetFingerprint', 'projectionReceiptRef', 'semanticFingerprint'
]);

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
    schemaVersion: 'vexlife.continuity-evolution-aggregate/v1',
    currentness: 'CURRENT',
    observations: [],
    candidates: [],
    reviews: [],
    authorityEvidence: [],
    acceptedRecords: [],
    transientContexts: [],
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

function resolveAggregateRecord(aggregate, acceptedRecordRef, acceptedRecordFingerprint) {
  validateAggregateSnapshot(aggregate);
  const record = aggregate.acceptedRecords.find((item) => item.acceptedRecordRef === acceptedRecordRef);
  if (!record || record.semanticFingerprint !== acceptedRecordFingerprint) {
    throw new Error('continuity projection source is not the exact aggregate-owned accepted record');
  }
  const lineage = validateAggregateOwnedRecord(aggregate, record);
  return { record, lineage };
}

function projectionOwnershipReceipt(aggregate, source, lineage, projectionKind, currentSet) {
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
    requiredAcceptanceRefs: [...lineage.review.requiredAcceptanceRefs],
    acceptedByRefs: [...source.acceptedByRefs],
    authorityEvidenceRefs: [...source.acceptanceEvidenceRefs].sort(),
    authorityEvidenceClass: source.authorityEvidenceClass,
    acceptanceDisposition: source.acceptanceDisposition,
    burdenRef: burden?.burdenRef ?? null,
    burdenIdentityFingerprint: burden?.identityFingerprint ?? null,
    burdenSourceFingerprint: burden ? semanticHash(burden.sourceForm) : null,
    currentRecordSetRef: currentSet?.currentRecordSetRef ?? null,
    currentRecordSetFingerprint: currentSet?.semanticFingerprint ?? null
  }, 'projectionReceiptRef', 'continuity-aggregate-projection-receipt');
}

export function projectAggregateOwnedContinuityRecord({ aggregate, acceptedRecordRef, acceptedRecordFingerprint }) {
  const { record, lineage } = resolveAggregateRecord(aggregate, acceptedRecordRef, acceptedRecordFingerprint);
  const currentSet = createContinuityCurrentRecordSetReceipt(aggregate);
  const ownershipReceipt = projectionOwnershipReceipt(aggregate, record, lineage, 'HUMAN_RECORD', currentSet);
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
    authorityEvidenceClass: record.authorityEvidenceClass,
    simulatedAuthority: record.simulatedAuthority,
    liveAuthorityGranted: record.liveAuthorityGranted,
    externalEffectsAuthorized: record.externalEffectsAuthorized,
    acceptanceDisposition: record.acceptanceDisposition,
    liveApplicabilityGranted: record.liveApplicabilityGranted,
    currentSetDisposition: currentSet.state === 'HELD_CONFLICT'
      ? 'HELD_CONFLICT'
      : currentSet.currentRecordRefs.includes(record.acceptedRecordRef) ? 'CURRENT' : 'SUPERSEDED',
    state: record.lifecycle,
    nextSafeAction: record.acceptanceDisposition === 'SIMULATION_ONLY_INACTIVE'
      ? 'USE_ONLY_IN_EXPLICIT_SIMULATED_CURRENT_CONTEXT'
      : record.lifecycle === 'INACTIVE_PENDING_DETERMINISTIC_IMPLEMENTATION_REVIEW'
        ? 'OPEN_SEPARATE_DETERMINISTIC_IMPLEMENTATION_REVIEW'
        : record.recurrenceState === 'REOPEN_REVIEW' ? 'RETURN_TO_CONTEXT_REVIEW' : 'APPLY_BY_REF_ONLY_WHEN_SCOPE_MATCHES'
  });
}

export function projectAggregateOwnedTransientContinuityContext({ aggregate, contextRecordRef, contextRecordFingerprint }) {
  validateAggregateSnapshot(aggregate);
  const context = aggregate.transientContexts.find((item) => item.contextRecordRef === contextRecordRef);
  if (!context || context.semanticFingerprint !== contextRecordFingerprint) {
    throw new Error('continuity projection source is not the exact aggregate-owned transient context');
  }
  const lineage = validateAggregateOwnedContext(aggregate, context);
  const ownershipReceipt = projectionOwnershipReceipt(aggregate, context, lineage, 'TRANSIENT_CONTEXT', null);
  return freeze({
    schemaVersion: 'vexlife.transient-continuity-projection/v1',
    contextRecordRef: context.contextRecordRef,
    contextRecordFingerprint: context.semanticFingerprint,
    aggregateProjectionReceipt: ownershipReceipt,
    summaryRef: context.summaryRef,
    scope: context.scope,
    scopeTargetRef: context.scopeTargetRef,
    scopeTargetFingerprint: context.scopeTargetFingerprint,
    contextBindingRef: context.contextLease.contextBindingRef,
    expiresAt: context.expiresAt,
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
  const ownershipReceipt = projectionOwnershipReceipt(aggregate, record, lineage, 'BURDEN_RELEASE', currentSet);
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
    state: release.state,
    recurrenceState: release.recurrenceState,
    transitionReceiptRefs: release.transitionReceipts.map((item) => item.transitionRef),
    authoritySnapshotRefs: [...release.authoritySnapshotRefs],
    authorityEvidenceClass: record.authorityEvidenceClass,
    simulatedAuthority: record.simulatedAuthority,
    liveAuthorityGranted: record.liveAuthorityGranted,
    externalEffectsAuthorized: record.externalEffectsAuthorized,
    acceptanceDisposition: record.acceptanceDisposition,
    claimsParameterDeletion: false,
    rawSourceContentIncluded: false,
    nextSafeAction: record.acceptanceDisposition === 'SIMULATION_ONLY_INACTIVE'
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
    const receipt = projectionOwnershipReceipt(aggregate, item, resolved.lineage, 'APPLICABLE_RECORD', currentSet);
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
      validateAggregateOwnedRecord(next, event.record);
      const result = appendCanonical(next.acceptedRecords, event.record, 'acceptedRecordRef', 'accepted record');
      if (!result.changed) return current;
      next.acceptedRecords = result.items;
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
      if (next.supersessions.some((item) => item.priorRecordRef === prior.acceptedRecordRef)) throw new Error('supersession prior is already superseded');
      validateAggregateOwnedRecord(next, event.successor);
      validateContinuitySupersession(event.transaction, [prior, event.successor]);
      const result = appendCanonical(next.acceptedRecords, event.successor, 'acceptedRecordRef', 'supersession successor');
      if (!result.changed) throw new Error('supersession successor must be a new exact record');
      next.acceptedRecords = result.items;
      next.supersessions.push(clone(event.transaction));
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
