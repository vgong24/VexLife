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
    checkpoints: [],
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
      if (event.relayLedger) next.relayLedger = clone(event.relayLedger);
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
      break;
    case 'CANCELLED':
      next.phase = 'CANCELLED';
      next.active = null;
      next.queue = clone(event.queue);
      for (const lease of Object.values(event.transitionedLeases)) next.leaseLedger[lease.leaseRef] = clone(lease);
      if (event.relayLedger) next.relayLedger = clone(event.relayLedger);
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
    const observed = Date.parse(aggregate.active.observedAt);
    if (!Number.isFinite(expires) || !Number.isFinite(observed) || observed >= expires) {
      blocking.push('ACTIVE_WORKER_LEASE_EXPIRED');
    }
    for (const leaseRef of aggregate.active.leaseRefs ?? []) {
      if (aggregate.leaseLedger[leaseRef]?.lifecycle !== 'ACTIVE') blocking.push(`ACTIVE_LEASE_NOT_CURRENT:${leaseRef}`);
    }
  }
  const openRelayEntries = (aggregate.relayLedger?.entries ?? []).filter((item) => ['PENDING', 'HELD'].includes(item.state));
  for (const entry of openRelayEntries) {
    const heldAtCheckpoint = aggregate.phase === 'PAUSED' && entry.state === 'HELD';
    if (!aggregate.active && !heldAtCheckpoint) blocking.push(`ORPHANED_PENDING_TOOL_CALL:${entry.toolCallRef}`);
  }
  const terminalLeases = Object.values(aggregate.leaseLedger ?? {}).filter((lease) =>
    ['RELEASED', 'SUPERSEDED', 'CANCELLED'].includes(lease.lifecycle)
  );
  if (terminalLeases.length && !aggregate.active) attention.push('LEASES_RELEASED');
  if (aggregate.phase === 'PAUSED') attention.push('WORK_PAUSED_AT_CHECKPOINT');
  if (aggregate.phase === 'CANCELLED') attention.push('WORK_CANCELLED_CLOSED');
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

// [VXG RealForever]
