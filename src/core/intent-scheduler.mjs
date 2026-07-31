import { createContextLease } from './context-lease.mjs';
import { checkpointActiveLease } from './intent-checkpoint.mjs';
import { createResourceLease, evaluateResourceAdmission, releaseResourceLease } from './resource-admission.mjs';
import { createIntentSchedulerState } from './state.mjs';
import { validateIntentWorkgraph } from './intent-validation.mjs';
import { semanticHash } from './utils.mjs';

const CLASS_ORDER = new Map([
  ['INTERACTIVE', 0],
  ['EXPEDITE', 1],
  ['RECOVERY', 2],
  ['NORMAL', 3],
  ['BACKGROUND', 4]
]);

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function exactLease(input, {
  schemaVersion,
  kind,
  node,
  graphFingerprint,
  trustSnapshotFingerprint,
  schedulerGeneration
}) {
  const required = [
    'leaseRef',
    'workNodeRef',
    'graphFingerprint',
    'trustSnapshotFingerprint',
    'schedulerGeneration',
    'envelopeRef',
    'formedAt',
    'expiresAt',
    'currentness'
  ];
  const missing = required.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`${kind} lease missing required fields: ${missing.join(', ')}`);
  if (input.workNodeRef !== node.workNodeRef) throw new Error(`${kind} lease work node mismatch`);
  if (input.graphFingerprint !== graphFingerprint) throw new Error(`${kind} lease graph fingerprint mismatch`);
  if (input.trustSnapshotFingerprint !== trustSnapshotFingerprint) throw new Error(`${kind} lease trust snapshot mismatch`);
  if (input.schedulerGeneration !== schedulerGeneration) throw new Error(`${kind} lease scheduler generation mismatch`);
  if (input.currentness !== 'CURRENT') throw new Error(`${kind} lease is not current`);
  const expectedEnvelope = kind === 'capability' ? node.capabilityEnvelopeRef : node.effectEnvelopeRef;
  if (input.envelopeRef !== expectedEnvelope) throw new Error(`${kind} lease envelope mismatch`);
  const lease = { schemaVersion, ...clone(input) };
  delete lease.semanticFingerprint;
  if (Array.isArray(lease.toolRefs)) lease.toolRefs = [...new Set(lease.toolRefs)].sort();
  if (Array.isArray(lease.allowedEffectRefs)) lease.allowedEffectRefs = [...new Set(lease.allowedEffectRefs)].sort();
  lease.semanticFingerprint = semanticHash(lease);
  if (input.semanticFingerprint && input.semanticFingerprint !== lease.semanticFingerprint) {
    throw new Error(`${kind} lease semantic fingerprint mismatch`);
  }
  return freeze(lease);
}

export function createCapabilityLease(input, bindings) {
  return exactLease(input, {
    schemaVersion: 'vexlife.intent-capability-lease/v0',
    kind: 'capability',
    ...bindings
  });
}

export function createEffectLease(input, bindings) {
  const lease = exactLease(input, {
    schemaVersion: 'vexlife.intent-effect-lease/v0',
    kind: 'effect',
    ...bindings
  });
  if (!['EFFECT_ENVELOPE_BOUND', 'NO_EFFECTS'].includes(lease.effectDisposition)) {
    throw new Error('effect lease has unknown effect disposition');
  }
  return lease;
}

export function createSchedulerOccupancy(input, {
  node,
  graphFingerprint,
  schedulerGeneration
}) {
  const required = [
    'occupancyRef',
    'actorRef',
    'roleRef',
    'workNodeRef',
    'graphFingerprint',
    'schedulerGeneration',
    'claimRef',
    'currentness'
  ];
  const missing = required.filter((field) => input?.[field] === undefined || input?.[field] === null || input?.[field] === '');
  if (missing.length) throw new Error(`scheduler occupancy missing required fields: ${missing.join(', ')}`);
  if (input.workNodeRef !== node.workNodeRef || input.roleRef !== node.roleRef) throw new Error('scheduler occupancy node or role mismatch');
  if (input.graphFingerprint !== graphFingerprint) throw new Error('scheduler occupancy graph mismatch');
  if (input.schedulerGeneration !== schedulerGeneration) throw new Error('scheduler occupancy generation mismatch');
  if (input.currentness !== 'CURRENT') throw new Error('scheduler occupancy is not current');
  const occupancy = { schemaVersion: 'vexlife.intent-scheduler-occupancy/v0', ...clone(input) };
  delete occupancy.semanticFingerprint;
  occupancy.semanticFingerprint = semanticHash(occupancy);
  return freeze(occupancy);
}

export function schedulingClass(node) {
  if (node.interactiveHumanTurn === true || node.schedulingClass === 'INTERACTIVE') return 'INTERACTIVE';
  if (node.priorityClass === 'IMMEDIATE' || node.priorityClass === 'HIGH' || node.schedulingClass === 'EXPEDITE') return 'EXPEDITE';
  if (node.schedulingClass === 'RECOVERY' || ['FAILED_RECOVERABLE', 'BLOCKED'].includes(node.state)) return 'RECOVERY';
  if (node.background === true || node.priorityClass === 'LOW' || node.schedulingClass === 'BACKGROUND') return 'BACKGROUND';
  return 'NORMAL';
}

export function selectNextAdmittedNode(entries, {
  generation,
  fairnessMaxDeferrals = 3,
  interactiveWaitState = 'IDLE'
}) {
  const candidates = entries.filter((item) =>
    item.admitted === true &&
    !(item.schedulingClass === 'BACKGROUND' && interactiveWaitState === 'WAITING')
  );
  if (!candidates.length) return null;
  const interactive = candidates.filter((item) => item.schedulingClass === 'INTERACTIVE');
  const pool = interactive.length ? interactive : candidates;
  const starved = pool.filter((item) =>
    generation - (item.readySinceGeneration ?? generation) >= fairnessMaxDeferrals
  );
  const ranked = starved.length ? starved : pool;
  return [...ranked].sort((left, right) =>
    (left.readySinceGeneration ?? generation) - (right.readySinceGeneration ?? generation) ||
    (CLASS_ORDER.get(left.schedulingClass) ?? 99) - (CLASS_ORDER.get(right.schedulingClass) ?? 99) ||
    left.workNodeRef.localeCompare(right.workNodeRef)
  )[0];
}

function candidateEntry(node, reasonRefs = []) {
  return {
    workNodeRef: node.workNodeRef,
    nodeFingerprint: node.semanticFingerprint,
    purpose: node.purpose,
    priorityClass: node.priorityClass,
    schedulingClass: schedulingClass(node),
    readySinceGeneration: Number.isInteger(node.readySinceGeneration) ? node.readySinceGeneration : 0,
    admitted: reasonRefs.length === 0,
    reasonRefs: [...reasonRefs].sort()
  };
}

export function admitIntentSchedulerQueue(graph, {
  intentRegistry,
  registeredProcessRefs = intentRegistry?.processRefs ?? [],
  registeredRoleRefs = [],
  trustSnapshot,
  resourceSnapshot,
  resourceRequestByNodeRef = {},
  occupancyByNodeRef = {},
  capabilityLeaseByNodeRef = {},
  effectLeaseByNodeRef = {},
  resourceLeaseRefByNodeRef = {},
  workerRef,
  schedulerGeneration,
  fairnessMaxDeferrals = 3,
  formedAt,
  expiresAt
}) {
  const validation = validateIntentWorkgraph(graph, {
    registry: intentRegistry,
    registeredProcessRefs,
    registeredRoleRefs,
    trustSnapshot
  });
  const readyNodes = (graph.nodes ?? []).filter((node) => validation.sets.ready.includes(node.workNodeRef));
  const logicalReady = [];
  const admittedReady = [];
  const blocked = [];
  const exactBindings = new Map();

  if (validation.state !== 'PLAN_VALIDATED') {
    const reason = `WORKGRAPH_NOT_ADMITTED:${validation.state}`;
    for (const node of readyNodes) {
      const entry = candidateEntry(node, [reason]);
      logicalReady.push(entry);
      blocked.push(entry);
    }
    return freeze({
      schemaVersion: 'vexlife.intent-scheduler-queue/v0',
      state: 'BLOCKED',
      currentness: validation.currentness,
      generation: schedulerGeneration,
      graphRef: graph.graphRef,
      graphFingerprint: graph.semanticFingerprint,
      trustSnapshotFingerprint: trustSnapshot?.semanticFingerprint ?? null,
      logicalReady,
      admittedReady,
      blocked,
      selected: null,
      admissionReceipt: null,
      resourceLease: null,
      validation: { state: validation.state, errors: validation.errors, attentions: validation.attentions },
      physicalWorkerPolicy: { modelInferenceConcurrency: 1, backgroundModelConcurrencyWhileInteractiveWaits: 0 }
    });
  }

  for (const node of readyNodes) {
    const reasons = [];
    let occupancy;
    let capabilityLease;
    let effectLease;
    let resourceAdmission;
    try {
      occupancy = createSchedulerOccupancy(occupancyByNodeRef[node.workNodeRef], {
        node,
        graphFingerprint: graph.semanticFingerprint,
        schedulerGeneration
      });
    } catch (error) {
      reasons.push(`OCCUPANCY:${error.message}`);
    }
    try {
      capabilityLease = createCapabilityLease(capabilityLeaseByNodeRef[node.workNodeRef], {
        node,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        schedulerGeneration
      });
    } catch (error) {
      reasons.push(`CAPABILITY:${error.message}`);
    }
    try {
      effectLease = createEffectLease(effectLeaseByNodeRef[node.workNodeRef], {
        node,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        schedulerGeneration
      });
    } catch (error) {
      reasons.push(`EFFECT:${error.message}`);
    }
    resourceAdmission = evaluateResourceAdmission(resourceSnapshot, resourceRequestByNodeRef[node.workNodeRef] ?? {});
    if (!resourceAdmission.admitted) reasons.push(...resourceAdmission.reasons.map((item) => `RESOURCE:${item}`));
    const entry = candidateEntry(node, reasons);
    logicalReady.push(entry);
    if (entry.admitted) {
      admittedReady.push(entry);
      exactBindings.set(node.workNodeRef, { occupancy, capabilityLease, effectLease, resourceAdmission });
    } else {
      blocked.push(entry);
    }
  }

  const selected = selectNextAdmittedNode(admittedReady, {
    generation: schedulerGeneration,
    fairnessMaxDeferrals,
    interactiveWaitState: resourceSnapshot?.interactiveWaitState
  });
  if (!selected) {
    return freeze({
      schemaVersion: 'vexlife.intent-scheduler-queue/v0',
      state: readyNodes.length ? 'BLOCKED' : 'IDLE',
      currentness: 'CURRENT',
      generation: schedulerGeneration,
      graphRef: graph.graphRef,
      graphFingerprint: graph.semanticFingerprint,
      trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
      logicalReady,
      admittedReady,
      blocked,
      selected: null,
      admissionReceipt: null,
      resourceLease: null,
      validation: { state: validation.state, errors: [], attentions: [] },
      physicalWorkerPolicy: { modelInferenceConcurrency: 1, backgroundModelConcurrencyWhileInteractiveWaits: 0 }
    });
  }

  const node = readyNodes.find((item) => item.workNodeRef === selected.workNodeRef);
  const bindings = exactBindings.get(node.workNodeRef);
  const resourceLease = createResourceLease({
    leaseRef: resourceLeaseRefByNodeRef[node.workNodeRef],
    workerRef,
    workNodeRef: node.workNodeRef,
    graphFingerprint: graph.semanticFingerprint,
    schedulerGeneration,
    resourceSnapshot,
    request: resourceRequestByNodeRef[node.workNodeRef] ?? {},
    formedAt,
    expiresAt
  });
  const admissionReceipt = {
    schemaVersion: 'vexlife.intent-scheduler-admission-receipt/v0',
    admissionReceiptRef: `admission.intent-scheduler.${schedulerGeneration}.${node.workNodeRef}`,
    schedulerGeneration,
    workerRef,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    trustSnapshotRef: trustSnapshot.snapshotRef,
    trustSnapshotSourceRef: trustSnapshot.sourceRef,
    trustSnapshotSourceHash: trustSnapshot.sourceHash,
    trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
    trustSnapshotFormationRef: trustSnapshot.formationRef,
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    resourceLeaseRef: resourceLease.leaseRef,
    resourceLeaseFingerprint: resourceLease.semanticFingerprint,
    workNodeRef: node.workNodeRef,
    nodeFingerprint: node.semanticFingerprint,
    occupancyRef: bindings.occupancy.occupancyRef,
    occupancyFingerprint: bindings.occupancy.semanticFingerprint,
    capabilityEnvelopeRef: node.capabilityEnvelopeRef,
    capabilityLeaseRef: bindings.capabilityLease.leaseRef,
    capabilityLeaseFingerprint: bindings.capabilityLease.semanticFingerprint,
    effectEnvelopeRef: node.effectEnvelopeRef,
    effectLeaseRef: bindings.effectLease.leaseRef,
    effectLeaseFingerprint: bindings.effectLease.semanticFingerprint,
    expectedTransitionRef: node.expectedTransitionRef,
    completionGateRefs: [...node.completionGateRefs].sort(),
    returnRouteRef: node.returnRouteRef,
    formedAt,
    currentness: 'CURRENT'
  };
  admissionReceipt.semanticFingerprint = semanticHash(admissionReceipt);
  return freeze({
    schemaVersion: 'vexlife.intent-scheduler-queue/v0',
    state: 'ADMITTED',
    currentness: 'CURRENT',
    generation: schedulerGeneration,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
    logicalReady,
    admittedReady,
    blocked,
    selected,
    selectedBindings: bindings,
    admissionReceipt,
    resourceLease,
    validation: { state: validation.state, errors: [], attentions: [] },
    physicalWorkerPolicy: { modelInferenceConcurrency: 1, backgroundModelConcurrencyWhileInteractiveWaits: 0 }
  });
}

export class SingleWorkerIntentScheduler {
  #workerRef;
  #generation = 0;
  #active = null;
  #queue = null;
  #state;

  constructor({ workerRef }) {
    if (!workerRef) throw new Error('single-worker scheduler requires workerRef');
    this.#workerRef = workerRef;
    this.#state = createIntentSchedulerState();
  }

  get workerRef() { return this.#workerRef; }
  get generation() { return this.#generation; }
  get active() { return this.#active ? clone(this.#active) : null; }
  get projections() { return this.#state; }

  admit(graph, options) {
    const generation = options.schedulerGeneration ?? this.#generation + 1;
    if (generation <= this.#generation) throw new Error('scheduler generation must advance');
    const queue = admitIntentSchedulerQueue(graph, {
      ...options,
      workerRef: this.#workerRef,
      schedulerGeneration: generation
    });
    this.#generation = generation;
    this.#queue = queue;
    this.#state.queue.set(queue, { source: 'scheduler.admission' });
    this.#state.resource.set(options.resourceSnapshot, { source: 'resource.snapshot' });
    return queue;
  }

  leaseSelected(contextInput) {
    if (this.#active) return { admitted: false, state: 'BLOCKED', reason: 'PHYSICAL_WORKER_ALREADY_LEASED', active: this.active };
    if (this.#queue?.state !== 'ADMITTED' || !this.#queue.selected) {
      return { admitted: false, state: 'BLOCKED', reason: 'NO_ADMITTED_SELECTED_NODE' };
    }
    const nodeRef = this.#queue.selected.workNodeRef;
    const context = createContextLease({
      ...contextInput,
      workerRef: this.#workerRef,
      workNodeRef: nodeRef,
      graphFingerprint: this.#queue.graphFingerprint,
      trustSnapshotFingerprint: this.#queue.trustSnapshotFingerprint,
      currentness: 'CURRENT'
    });
    const active = {
      schemaVersion: 'vexlife.intent-worker-lease/v0',
      workerLeaseRef: `worker-lease.${this.#workerRef}.${this.#generation}`,
      workerRef: this.#workerRef,
      workNodeRef: nodeRef,
      graphFingerprint: this.#queue.graphFingerprint,
      generation: this.#generation,
      contextLeaseRef: context.lease.leaseRef,
      contextLeaseFingerprint: context.lease.semanticFingerprint,
      resourceLeaseRef: this.#queue.resourceLease.leaseRef,
      resourceLeaseFingerprint: this.#queue.resourceLease.semanticFingerprint,
      state: 'RUNNING',
      sourceRefs: [...new Set(context.lease.selectedSourceRefs ?? [])].sort(),
      artifactRefs: [],
      receiptRefs: [this.#queue.admissionReceipt.admissionReceiptRef]
    };
    active.semanticFingerprint = semanticHash(active);
    this.#active = freeze(active);
    this.#state.active.set(this.#active, { source: 'worker.lease' });
    return { admitted: true, state: 'RUNNING', active: this.active, contextLease: context.lease, resourceLease: this.#queue.resourceLease };
  }

  requestPreemption(incomingEntry) {
    if (!this.#active) return { state: 'NO_ACTIVE_WORK', safeToStart: true };
    if (schedulingClass(incomingEntry) !== 'INTERACTIVE') {
      return { state: 'CONTINUE_ACTIVE', safeToStart: false, reason: 'INCOMING_NOT_INTERACTIVE' };
    }
    return {
      state: 'CHECKPOINT_REQUIRED',
      safeToStart: false,
      activeWorkNodeRef: this.#active.workNodeRef,
      incomingWorkNodeRef: incomingEntry.workNodeRef,
      sourceDiscarded: false
    };
  }

  checkpoint(checkpointInput, { releaseReceiptRef, releasedAt }) {
    if (!this.#active) throw new Error('no active worker lease to checkpoint');
    const result = checkpointActiveLease({
      checkpointInput,
      activeLease: this.#active,
      resourceLease: this.#queue.resourceLease,
      releaseReceiptRef,
      releasedAt
    });
    this.#state.checkpoints.update((items) => [...items, result.checkpoint], { source: 'worker.checkpoint' });
    this.#active = null;
    this.#state.active.set(null, { source: 'worker.checkpoint-release' });
    return result;
  }

  cancelActive({ releaseReceiptRef, releasedAt, reason = 'CANCELLED_BY_CALLER' }) {
    if (!this.#active) return { changed: false, reason: 'NO_ACTIVE_WORK' };
    const active = this.#active;
    const resourceReleaseReceipt = releaseResourceLease(this.#queue.resourceLease, {
      releaseReceiptRef,
      releasedAt,
      reason
    });
    const cancellationReceipt = {
      schemaVersion: 'vexlife.intent-scheduler-cancellation/v0',
      cancellationReceiptRef: `${releaseReceiptRef}.cancellation`,
      workerLeaseRef: active.workerLeaseRef,
      workerRef: active.workerRef,
      workNodeRef: active.workNodeRef,
      graphFingerprint: active.graphFingerprint,
      schedulerGeneration: active.generation,
      sourceRefs: [...active.sourceRefs],
      artifactRefs: [...active.artifactRefs],
      receiptRefs: [...active.receiptRefs],
      resourceReleaseReceiptRef: resourceReleaseReceipt.releaseReceiptRef,
      reason,
      state: 'CANCELLED',
      sourceDiscarded: false,
      releasedAt
    };
    cancellationReceipt.semanticFingerprint = semanticHash(cancellationReceipt);
    this.#active = null;
    this.#state.active.set(null, { source: 'worker.cancel' });
    return { changed: true, cancellationReceipt: freeze(cancellationReceipt), resourceReleaseReceipt };
  }
}

// [VXG RealForever]
