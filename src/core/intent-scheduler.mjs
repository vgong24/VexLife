import { createContextLease } from './context-lease.mjs';
import {
  canonicalSourceBindings,
  createIntentCheckpoint,
  validateCheckpointResume
} from './intent-checkpoint.mjs';
import {
  createResourceLease,
  evaluateResourceAdmission,
  releaseResourceLease
} from './resource-admission.mjs';
import {
  assertActiveInterval,
  assertCurrentLease,
  assertSourceHash,
  resolveMockToolContract,
  transitionLease,
  WorkerLeaseAuthority
} from './scheduler-runtime-trust.mjs';
import {
  createIntentSchedulerState,
  reduceSchedulerAggregate
} from './state.mjs';
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

function missingFields(value, fields) {
  return fields.filter((field) => value?.[field] === undefined || value?.[field] === null || value?.[field] === '');
}

function finalized(value) {
  const candidate = clone(value);
  delete candidate.semanticFingerprint;
  candidate.semanticFingerprint = semanticHash(candidate);
  return freeze(candidate);
}

function exactRuntimeLease(input, {
  schemaVersion,
  kind,
  node,
  graphFingerprint,
  trustSnapshotFingerprint,
  schedulerGeneration,
  runtimeTrustSnapshot,
  schedulerRegistry,
  observedAt
}) {
  const required = [
    'leaseRef',
    'workNodeRef',
    'graphFingerprint',
    'trustSnapshotFingerprint',
    'runtimeSnapshotRef',
    'runtimeSnapshotFingerprint',
    'schedulerGeneration',
    'envelopeRef',
    'authorityRef',
    'formationRef',
    'sourceRef',
    'sourceHash',
    'formedAt',
    'expiresAt',
    'observedAt',
    'currentness',
    'lifecycle'
  ];
  const missing = missingFields(input, required);
  if (missing.length) throw new Error(`${kind} lease missing required fields: ${missing.join(', ')}`);
  if (input.workNodeRef !== node.workNodeRef) throw new Error(`${kind} lease work node mismatch`);
  if (input.graphFingerprint !== graphFingerprint) throw new Error(`${kind} lease graph fingerprint mismatch`);
  if (input.trustSnapshotFingerprint !== trustSnapshotFingerprint) throw new Error(`${kind} lease trust snapshot mismatch`);
  if (input.runtimeSnapshotRef !== runtimeTrustSnapshot.snapshotRef ||
      input.runtimeSnapshotFingerprint !== runtimeTrustSnapshot.semanticFingerprint) {
    throw new Error(`${kind} lease runtime snapshot mismatch`);
  }
  if (input.schedulerGeneration !== schedulerGeneration) throw new Error(`${kind} lease scheduler generation mismatch`);
  if (input.currentness !== 'CURRENT' || input.lifecycle !== 'ACTIVE') {
    throw new Error(`${kind} lease must be current and ACTIVE`);
  }
  if (input.authorityRef !== runtimeTrustSnapshot.leaseAuthorityRef ||
      input.sourceRef !== runtimeTrustSnapshot.sourceRef ||
      input.sourceHash !== runtimeTrustSnapshot.sourceHash) {
    throw new Error(`${kind} lease external authority/source mismatch`);
  }
  assertSourceHash(input.sourceHash, `${kind} lease sourceHash`);
  assertActiveInterval({
    formedAt: input.formedAt,
    observedAt: observedAt ?? input.observedAt,
    expiresAt: input.expiresAt
  }, `${kind} lease`);
  const expectedEnvelope = kind === 'capability' ? node.capabilityEnvelopeRef : node.effectEnvelopeRef;
  if (input.envelopeRef !== expectedEnvelope) throw new Error(`${kind} lease envelope mismatch`);
  const lease = {
    schemaVersion,
    ...clone(input)
  };
  delete lease.semanticFingerprint;
  if (Array.isArray(lease.toolRefs)) lease.toolRefs = [...new Set(lease.toolRefs)].sort();
  if (Array.isArray(lease.allowedEffectRefs)) lease.allowedEffectRefs = [...new Set(lease.allowedEffectRefs)].sort();
  if (kind === 'capability') {
    for (const toolRef of lease.toolRefs ?? []) resolveMockToolContract(schedulerRegistry, { toolRef });
  } else {
    for (const effectRef of lease.allowedEffectRefs ?? []) {
      if (!(schedulerRegistry.mockToolContracts ?? []).some((item) => item.effectRef === effectRef)) {
        throw new Error(`effect lease contains unknown effect identity ${effectRef}`);
      }
    }
  }
  lease.semanticFingerprint = semanticHash(lease);
  if (input.semanticFingerprint && input.semanticFingerprint !== lease.semanticFingerprint) {
    throw new Error(`${kind} lease semantic fingerprint mismatch`);
  }
  return freeze(lease);
}

export function createCapabilityLease(input, bindings) {
  return exactRuntimeLease(input, {
    schemaVersion: 'vexlife.intent-capability-lease/v1',
    kind: 'capability',
    ...bindings
  });
}

export function createEffectLease(input, bindings) {
  const lease = exactRuntimeLease(input, {
    schemaVersion: 'vexlife.intent-effect-lease/v1',
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
  schedulerGeneration,
  runtimeTrustSnapshot,
  observedAt
}) {
  const required = [
    'occupancyRef',
    'actorRef',
    'roleRef',
    'workNodeRef',
    'graphFingerprint',
    'runtimeSnapshotRef',
    'runtimeSnapshotFingerprint',
    'schedulerGeneration',
    'claimRef',
    'sourceRef',
    'sourceHash',
    'formationRef',
    'formedAt',
    'expiresAt',
    'observedAt',
    'currentness',
    'lifecycle'
  ];
  const missing = missingFields(input, required);
  if (missing.length) throw new Error(`scheduler occupancy missing required fields: ${missing.join(', ')}`);
  if (input.workNodeRef !== node.workNodeRef || input.roleRef !== node.roleRef) {
    throw new Error('scheduler occupancy node or role mismatch');
  }
  if (input.graphFingerprint !== graphFingerprint) throw new Error('scheduler occupancy graph mismatch');
  if (input.schedulerGeneration !== schedulerGeneration) throw new Error('scheduler occupancy generation mismatch');
  if (input.currentness !== 'CURRENT' || input.lifecycle !== 'ACTIVE') {
    throw new Error('scheduler occupancy must be current and ACTIVE');
  }
  if (input.runtimeSnapshotRef !== runtimeTrustSnapshot.snapshotRef ||
      input.runtimeSnapshotFingerprint !== runtimeTrustSnapshot.semanticFingerprint ||
      input.occupancyRef !== runtimeTrustSnapshot.occupancyRef ||
      input.actorRef !== runtimeTrustSnapshot.actorRef ||
      input.claimRef !== runtimeTrustSnapshot.claimRef ||
      input.roleRef !== runtimeTrustSnapshot.roleRef ||
      input.sourceRef !== runtimeTrustSnapshot.sourceRef ||
      input.sourceHash !== runtimeTrustSnapshot.sourceHash) {
    throw new Error('scheduler occupancy does not match external runtime trust evidence');
  }
  assertSourceHash(input.sourceHash, 'scheduler occupancy sourceHash');
  assertActiveInterval({
    formedAt: input.formedAt,
    observedAt: observedAt ?? input.observedAt,
    expiresAt: input.expiresAt
  }, 'scheduler occupancy');
  return finalized({
    schemaVersion: 'vexlife.intent-scheduler-occupancy/v1',
    leaseRef: input.occupancyRef,
    ...clone(input)
  });
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
    Number.isInteger(item.readySinceGeneration) &&
    item.readySinceGeneration >= 0 &&
    Number.isInteger(item.deferralCount) &&
    item.deferralCount >= 0 &&
    !(item.schedulingClass === 'BACKGROUND' && interactiveWaitState === 'WAITING')
  );
  if (!candidates.length) return null;
  const interactive = candidates.filter((item) => item.schedulingClass === 'INTERACTIVE');
  const pool = interactive.length ? interactive : candidates;
  const starved = pool.filter((item) =>
    item.deferralCount >= fairnessMaxDeferrals ||
    generation - item.readySinceGeneration >= fairnessMaxDeferrals
  );
  const ranked = starved.length ? starved : pool;
  return [...ranked].sort((left, right) => starved.length
    ? right.deferralCount - left.deferralCount ||
      left.readySinceGeneration - right.readySinceGeneration ||
      (CLASS_ORDER.get(left.schedulingClass) ?? 99) - (CLASS_ORDER.get(right.schedulingClass) ?? 99) ||
      left.workNodeRef.localeCompare(right.workNodeRef)
    : (CLASS_ORDER.get(left.schedulingClass) ?? 99) - (CLASS_ORDER.get(right.schedulingClass) ?? 99) ||
      left.readySinceGeneration - right.readySinceGeneration ||
      left.workNodeRef.localeCompare(right.workNodeRef)
  )[0];
}

function fairnessForNode(node, priorLedger, generation, graphFingerprint) {
  const prior = priorLedger?.[node.workNodeRef];
  const sourceBinding = {
    graphFingerprint,
    nodeFingerprint: node.semanticFingerprint
  };
  if (prior &&
      prior.sourceBinding?.graphFingerprint === sourceBinding.graphFingerprint &&
      prior.sourceBinding?.nodeFingerprint === sourceBinding.nodeFingerprint &&
      Number.isInteger(prior.readySinceGeneration) &&
      prior.readySinceGeneration >= 0 &&
      Number.isInteger(prior.deferralCount) &&
      prior.deferralCount >= 0) {
    return { ...clone(prior), sourceBinding };
  }
  return {
    workNodeRef: node.workNodeRef,
    readySinceGeneration: generation,
    deferralCount: 0,
    sourceBinding
  };
}

function candidateEntry(node, fairness, reasonRefs = []) {
  return {
    workNodeRef: node.workNodeRef,
    nodeFingerprint: node.semanticFingerprint,
    purpose: node.purpose,
    priorityClass: node.priorityClass,
    schedulingClass: schedulingClass(node),
    readySinceGeneration: fairness.readySinceGeneration,
    deferralCount: fairness.deferralCount,
    fairnessSourceBinding: clone(fairness.sourceBinding),
    admitted: reasonRefs.length === 0,
    reasonRefs: [...reasonRefs].sort()
  };
}

function advanceFairnessLedger(entries, selected, priorLedger, generation, graphFingerprint, nodesByRef) {
  const next = {};
  for (const entry of entries) {
    const prior = fairnessForNode(nodesByRef.get(entry.workNodeRef), priorLedger, generation, graphFingerprint);
    next[entry.workNodeRef] = {
      ...prior,
      deferralCount: entry.admitted && entry.workNodeRef !== selected?.workNodeRef
        ? prior.deferralCount + 1
        : entry.workNodeRef === selected?.workNodeRef
          ? 0
          : prior.deferralCount,
      lastConsideredGeneration: generation,
      lastDisposition: entry.workNodeRef === selected?.workNodeRef
        ? 'SELECTED'
        : entry.admitted
          ? 'DEFERRED'
          : 'BLOCKED'
    };
  }
  return next;
}

function blockedQueue({
  state,
  currentness,
  generation,
  graph,
  trustSnapshot,
  runtimeTrustSnapshot,
  logicalReady,
  admittedReady,
  blocked,
  validation,
  fairnessLedger
}) {
  return finalized({
    schemaVersion: 'vexlife.intent-scheduler-queue/v1',
    state,
    lifecycle: state,
    currentness,
    generation,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    trustSnapshotFingerprint: trustSnapshot?.semanticFingerprint ?? null,
    runtimeSnapshotRef: runtimeTrustSnapshot?.snapshotRef ?? null,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot?.semanticFingerprint ?? null,
    logicalReady,
    admittedReady,
    blocked,
    selected: null,
    selectedBindings: null,
    admissionReceipt: null,
    resourceLease: null,
    validation,
    fairnessLedger,
    physicalWorkerPolicy: {
      modelInferenceConcurrency: 1,
      backgroundModelConcurrencyWhileInteractiveWaits: 0
    }
  });
}

export function admitIntentSchedulerQueue(graph, {
  intentRegistry,
  schedulerRegistry,
  registeredProcessRefs = intentRegistry?.processRefs ?? [],
  registeredRoleRefs = [],
  trustSnapshot,
  runtimeTrustSnapshot,
  resourceSnapshot,
  resourceRequestByNodeRef = {},
  occupancyByNodeRef = {},
  capabilityLeaseByNodeRef = {},
  effectLeaseByNodeRef = {},
  resourceLeaseRefByNodeRef = {},
  workerRef,
  schedulerGeneration,
  fairnessMaxDeferrals = schedulerRegistry?.fairnessPolicy?.maxDeferrals ?? 3,
  fairnessLedger = {},
  formedAt,
  expiresAt,
  observedAt
}) {
  if (!schedulerRegistry?.registryRef) throw new Error('canonical scheduler registry is required');
  if (!runtimeTrustSnapshot?.semanticFingerprint ||
      runtimeTrustSnapshot.schedulerGeneration !== schedulerGeneration ||
      runtimeTrustSnapshot.workerRef !== workerRef ||
      runtimeTrustSnapshot.resourceSnapshotRef !== resourceSnapshot?.snapshotRef ||
      runtimeTrustSnapshot.resourceSnapshotFingerprint !== resourceSnapshot?.semanticFingerprint) {
    throw new Error('scheduler admission requires exact external runtime trust/resource bindings');
  }
  assertActiveInterval({
    formedAt: runtimeTrustSnapshot.formedAt,
    observedAt,
    expiresAt: runtimeTrustSnapshot.expiresAt
  }, 'scheduler runtime admission');
  const validation = validateIntentWorkgraph(graph, {
    registry: intentRegistry,
    registeredProcessRefs,
    registeredRoleRefs,
    trustSnapshot
  });
  const readyNodes = (graph.nodes ?? []).filter((node) => validation.sets.ready.includes(node.workNodeRef));
  const nodesByRef = new Map(readyNodes.map((node) => [node.workNodeRef, node]));
  const logicalReady = [];
  const admittedReady = [];
  const blocked = [];
  const exactBindings = new Map();

  if (validation.state !== 'PLAN_VALIDATED') {
    const reason = `WORKGRAPH_NOT_ADMITTED:${validation.state}`;
    for (const node of readyNodes) {
      const entry = candidateEntry(node, fairnessForNode(node, fairnessLedger, schedulerGeneration, graph.semanticFingerprint), [reason]);
      logicalReady.push(entry);
      blocked.push(entry);
    }
    const nextFairness = advanceFairnessLedger(logicalReady, null, fairnessLedger, schedulerGeneration, graph.semanticFingerprint, nodesByRef);
    return blockedQueue({
      state: 'BLOCKED',
      currentness: validation.currentness,
      generation: schedulerGeneration,
      graph,
      trustSnapshot,
      runtimeTrustSnapshot,
      logicalReady,
      admittedReady,
      blocked,
      validation: { state: validation.state, errors: validation.errors, attentions: validation.attentions },
      fairnessLedger: nextFairness
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
        schedulerGeneration,
        runtimeTrustSnapshot,
        observedAt
      });
    } catch (error) {
      reasons.push(`OCCUPANCY:${error.message}`);
    }
    try {
      capabilityLease = createCapabilityLease(capabilityLeaseByNodeRef[node.workNodeRef], {
        node,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        schedulerGeneration,
        runtimeTrustSnapshot,
        schedulerRegistry,
        observedAt
      });
    } catch (error) {
      reasons.push(`CAPABILITY:${error.message}`);
    }
    try {
      effectLease = createEffectLease(effectLeaseByNodeRef[node.workNodeRef], {
        node,
        graphFingerprint: graph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        schedulerGeneration,
        runtimeTrustSnapshot,
        schedulerRegistry,
        observedAt
      });
    } catch (error) {
      reasons.push(`EFFECT:${error.message}`);
    }
    resourceAdmission = evaluateResourceAdmission(resourceSnapshot, resourceRequestByNodeRef[node.workNodeRef] ?? {});
    if (!resourceAdmission.admitted) reasons.push(...resourceAdmission.reasons.map((item) => `RESOURCE:${item}`));
    const entry = candidateEntry(
      node,
      fairnessForNode(node, fairnessLedger, schedulerGeneration, graph.semanticFingerprint),
      reasons
    );
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
  const nextFairness = advanceFairnessLedger(
    logicalReady,
    selected,
    fairnessLedger,
    schedulerGeneration,
    graph.semanticFingerprint,
    nodesByRef
  );
  if (!selected) {
    return blockedQueue({
      state: readyNodes.length ? 'BLOCKED' : 'IDLE',
      currentness: 'CURRENT',
      generation: schedulerGeneration,
      graph,
      trustSnapshot,
      runtimeTrustSnapshot,
      logicalReady,
      admittedReady,
      blocked,
      validation: { state: validation.state, errors: [], attentions: [] },
      fairnessLedger: nextFairness
    });
  }

  const node = nodesByRef.get(selected.workNodeRef);
  const bindings = exactBindings.get(node.workNodeRef);
  const resourceLease = createResourceLease({
    leaseRef: resourceLeaseRefByNodeRef[node.workNodeRef],
    workerRef,
    workNodeRef: node.workNodeRef,
    graphFingerprint: graph.semanticFingerprint,
    schedulerGeneration,
    runtimeTrustSnapshot,
    resourceSnapshot,
    request: resourceRequestByNodeRef[node.workNodeRef] ?? {},
    formedAt,
    expiresAt,
    observedAt
  });
  const admissionReceipt = finalized({
    schemaVersion: 'vexlife.intent-scheduler-admission-receipt/v1',
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
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    runtimeEvidenceClass: runtimeTrustSnapshot.evidenceClass,
    observedAt,
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
    expiresAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  });
  return finalized({
    schemaVersion: 'vexlife.intent-scheduler-queue/v1',
    state: 'ADMITTED',
    lifecycle: 'ADMITTED',
    currentness: 'CURRENT',
    generation: schedulerGeneration,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    logicalReady,
    admittedReady,
    blocked,
    selected,
    selectedBindings: {
      occupancy: bindings.occupancy,
      capabilityLease: bindings.capabilityLease,
      effectLease: bindings.effectLease
    },
    admissionReceipt,
    resourceLease,
    validation: { state: validation.state, errors: [], attentions: [] },
    fairnessLedger: nextFairness,
    physicalWorkerPolicy: {
      modelInferenceConcurrency: 1,
      backgroundModelConcurrencyWhileInteractiveWaits: 0
    }
  });
}

function consumeAdmission(queue, {
  state,
  lifecycle,
  transitionedAt,
  reason,
  transitionedLeases
}) {
  return finalized({
    ...clone(queue),
    state,
    lifecycle,
    selected: null,
    admittedReady: [],
    logicalReady: (queue.logicalReady ?? []).map((entry) => ({
      ...entry,
      admitted: false,
      reasonRefs: [...new Set([...(entry.reasonRefs ?? []), `ADMISSION_${lifecycle}`])].sort()
    })),
    resourceLease: transitionedLeases.resource,
    selectedBindings: {
      occupancy: transitionedLeases.occupancy,
      capabilityLease: transitionedLeases.capability,
      effectLease: transitionedLeases.effect
    },
    admissionReceipt: finalized({
      ...clone(queue.admissionReceipt),
      currentness: 'SUPERSEDED',
      lifecycle,
      transitionedAt,
      transitionReason: reason
    })
  });
}

export class SingleWorkerIntentScheduler {
  #workerRef;
  #instanceRef;
  #schedulerRegistry;
  #authority;
  #relay;
  #state;

  constructor({
    workerRef,
    schedulerInstanceRef,
    schedulerRegistry,
    runtimeAuthority = null,
    toolRelay = null
  }) {
    if (!workerRef) throw new Error('single-worker scheduler requires workerRef');
    if (!schedulerInstanceRef) throw new Error('single-worker scheduler requires schedulerInstanceRef');
    if (!schedulerRegistry?.registryRef) throw new Error('single-worker scheduler requires canonical schedulerRegistry');
    this.#workerRef = workerRef;
    this.#instanceRef = schedulerInstanceRef;
    this.#schedulerRegistry = schedulerRegistry;
    this.#authority = runtimeAuthority ?? new WorkerLeaseAuthority({
      sourceRef: schedulerRegistry.runtimeSourceIdentities[0].sourceRef
    });
    this.#relay = toolRelay;
    this.#state = createIntentSchedulerState();
  }

  get workerRef() { return this.#workerRef; }
  get schedulerInstanceRef() { return this.#instanceRef; }
  get generation() { return this.#state.aggregate.value.generation; }
  get active() { return this.#state.aggregate.value.active; }
  get queue() { return this.#state.aggregate.value.queue; }
  get aggregate() { return this.#state.aggregate.value; }
  get projections() { return this.#state; }

  #commit(event) {
    const next = reduceSchedulerAggregate(this.#state.aggregate.value, event);
    this.#state.aggregate.set(next, { source: event.type });
    return next;
  }

  admit(graph, options) {
    const current = this.#state.aggregate.value;
    if (current.active) throw new Error('cannot replace scheduler admission while a worker lease is active');
    if (current.phase === 'PAUSED') throw new Error('paused work must use the explicit resume transition');
    const generation = options.schedulerGeneration ?? current.generation + 1;
    if (generation <= current.generation) throw new Error('scheduler generation must advance');
    const queue = admitIntentSchedulerQueue(graph, {
      ...options,
      schedulerRegistry: this.#schedulerRegistry,
      workerRef: this.#workerRef,
      schedulerInstanceRef: this.#instanceRef,
      schedulerGeneration: generation,
      fairnessLedger: current.fairnessLedger
    });
    this.#commit({
      type: 'ADMITTED',
      transitionRef: `transition.intent-scheduler.admit.${generation}`,
      queue,
      resourceSnapshot: options.resourceSnapshot,
      runtimeTrustSnapshot: options.runtimeTrustSnapshot,
      fairnessLedger: queue.fairnessLedger
    });
    return queue;
  }

  #formActive(queue, contextInput) {
    if (queue?.state !== 'ADMITTED' || !queue.selected) {
      return { admitted: false, state: 'BLOCKED', reason: 'NO_ADMITTED_SELECTED_NODE' };
    }
    const aggregate = this.#state.aggregate.value;
    const runtimeTrustSnapshot = aggregate.runtimeTrust?.semanticFingerprint === queue.runtimeSnapshotFingerprint
      ? aggregate.runtimeTrust
      : contextInput.runtimeTrustSnapshot;
    const observedAt = contextInput.observedAt ?? runtimeTrustSnapshot?.observedAt;
    const context = createContextLease({
      ...contextInput,
      workerRef: this.#workerRef,
      workNodeRef: queue.selected.workNodeRef,
      graphFingerprint: queue.graphFingerprint,
      trustSnapshotFingerprint: queue.trustSnapshotFingerprint,
      runtimeSnapshotFingerprint: queue.runtimeSnapshotFingerprint,
      schedulerGeneration: queue.generation,
      resourceLeaseFingerprint: queue.resourceLease.semanticFingerprint,
      capabilityLeaseFingerprint: queue.selectedBindings.capabilityLease.semanticFingerprint,
      effectLeaseFingerprint: queue.selectedBindings.effectLease.semanticFingerprint,
      cancellationTokenRef: contextInput.cancellationTokenRef,
      observedAt,
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE'
    });
    const workerLease = finalized({
      schemaVersion: 'vexlife.intent-worker-lease/v1',
      leaseRef: `worker-lease.${this.#workerRef}.${queue.generation}`,
      workerLeaseRef: `worker-lease.${this.#workerRef}.${queue.generation}`,
      workerRef: this.#workerRef,
      schedulerInstanceRef: this.#instanceRef,
      workNodeRef: queue.selected.workNodeRef,
      graphFingerprint: queue.graphFingerprint,
      trustSnapshotFingerprint: queue.trustSnapshotFingerprint,
      runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
      runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
      schedulerGeneration: queue.generation,
      formedAt: context.lease.formedAt,
      expiresAt: context.lease.expiresAt,
      observedAt,
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE'
    });
    const claim = this.#authority.claim(workerLease, runtimeTrustSnapshot);
    if (!claim.admitted) return claim;
    const active = finalized({
      ...clone(workerLease),
      contextLeaseRef: context.lease.leaseRef,
      contextLeaseFingerprint: context.lease.semanticFingerprint,
      resourceLeaseRef: queue.resourceLease.leaseRef,
      resourceLeaseFingerprint: queue.resourceLease.semanticFingerprint,
      capabilityLeaseRef: queue.selectedBindings.capabilityLease.leaseRef,
      capabilityLeaseFingerprint: queue.selectedBindings.capabilityLease.semanticFingerprint,
      effectLeaseRef: queue.selectedBindings.effectLease.leaseRef,
      effectLeaseFingerprint: queue.selectedBindings.effectLease.semanticFingerprint,
      occupancyRef: queue.selectedBindings.occupancy.occupancyRef,
      occupancyFingerprint: queue.selectedBindings.occupancy.semanticFingerprint,
      cancellationTokenRef: context.lease.cancellationTokenRef,
      sourceRefs: [...new Set(context.lease.selectedSourceRefs ?? [])].sort(),
      artifactRefs: [],
      receiptRefs: [queue.admissionReceipt.admissionReceiptRef],
      leaseRefs: [
        workerLease.leaseRef,
        context.lease.leaseRef,
        queue.resourceLease.leaseRef,
        queue.selectedBindings.capabilityLease.leaseRef,
        queue.selectedBindings.effectLease.leaseRef,
        queue.selectedBindings.occupancy.leaseRef
      ].sort()
    });
    return {
      admitted: true,
      state: 'RUNNING',
      active,
      leases: {
        worker: workerLease,
        context: context.lease,
        resource: queue.resourceLease,
        capability: queue.selectedBindings.capabilityLease,
        effect: queue.selectedBindings.effectLease,
        occupancy: queue.selectedBindings.occupancy
      },
      runtimeTrustSnapshot
    };
  }

  leaseSelected(contextInput) {
    const aggregate = this.#state.aggregate.value;
    if (aggregate.active) {
      return { admitted: false, state: 'BLOCKED', reason: 'PHYSICAL_WORKER_ALREADY_LEASED', active: aggregate.active };
    }
    const formed = this.#formActive(aggregate.queue, contextInput);
    if (!formed.admitted) return formed;
    this.#commit({
      type: 'LEASED',
      transitionRef: `transition.intent-scheduler.lease.${aggregate.queue.generation}`,
      active: formed.active,
      leases: formed.leases
    });
    return {
      admitted: true,
      state: 'RUNNING',
      active: clone(formed.active),
      contextLease: clone(formed.leases.context),
      resourceLease: clone(formed.leases.resource),
      capabilityLease: clone(formed.leases.capability),
      effectLease: clone(formed.leases.effect),
      occupancy: clone(formed.leases.occupancy),
      workerLease: clone(formed.leases.worker),
      runtimeTrustSnapshot: clone(formed.runtimeTrustSnapshot)
    };
  }

  requestPreemption(incomingQueue) {
    const aggregate = this.#state.aggregate.value;
    if (!aggregate.active) return { state: 'NO_ACTIVE_WORK', safeToStart: true };
    if (incomingQueue?.state !== 'ADMITTED' || !incomingQueue.selected ||
        incomingQueue.selected.schedulingClass !== 'INTERACTIVE') {
      return { state: 'CONTINUE_ACTIVE', safeToStart: false, reason: 'INCOMING_NOT_EXACT_ADMITTED_INTERACTIVE' };
    }
    if (incomingQueue.generation <= aggregate.generation) {
      return { state: 'CONTINUE_ACTIVE', safeToStart: false, reason: 'INCOMING_GENERATION_NOT_FRESH' };
    }
    const pendingPreemption = finalized({
      schemaVersion: 'vexlife.intent-scheduler-pending-preemption/v1',
      pendingPreemptionRef: `preemption.${aggregate.generation}.${incomingQueue.selected.workNodeRef}`,
      activeWorkNodeRef: aggregate.active.workNodeRef,
      incomingWorkNodeRef: incomingQueue.selected.workNodeRef,
      incomingNodeFingerprint: incomingQueue.selected.nodeFingerprint,
      graphRef: incomingQueue.graphRef,
      graphFingerprint: incomingQueue.graphFingerprint,
      admissionReceiptRef: incomingQueue.admissionReceipt.admissionReceiptRef,
      admissionFingerprint: incomingQueue.admissionReceipt.semanticFingerprint,
      requestedGeneration: incomingQueue.generation,
      state: 'CHECKPOINT_REQUIRED',
      sourceDiscarded: false
    });
    this.#commit({
      type: 'PREEMPTION_REQUESTED',
      transitionRef: `transition.intent-scheduler.preemption-request.${aggregate.generation}`,
      pendingPreemption
    });
    return {
      state: 'CHECKPOINT_REQUIRED',
      safeToStart: false,
      activeWorkNodeRef: aggregate.active.workNodeRef,
      incomingWorkNodeRef: pendingPreemption.incomingWorkNodeRef,
      pendingPreemptionRef: pendingPreemption.pendingPreemptionRef,
      admissionFingerprint: pendingPreemption.admissionFingerprint,
      sourceDiscarded: false
    };
  }

  #transitionActiveLeases({ releaseReceiptRef, transitionedAt, reason, lifecycle }) {
    const aggregate = this.#state.aggregate.value;
    const active = aggregate.active;
    const ledger = aggregate.leaseLedger;
    const current = {
      worker: ledger[active.workerLeaseRef],
      context: ledger[active.contextLeaseRef],
      resource: ledger[active.resourceLeaseRef],
      capability: ledger[active.capabilityLeaseRef],
      effect: ledger[active.effectLeaseRef],
      occupancy: ledger[active.occupancyRef]
    };
    for (const [label, lease] of Object.entries(current)) {
      assertCurrentLease(lease, {
        label,
        observedAt: transitionedAt,
        schedulerGeneration: active.schedulerGeneration,
        runtimeSnapshotFingerprint: active.runtimeSnapshotFingerprint
      });
    }
    const worker = this.#authority.release(current.worker, {
      lifecycle,
      receiptRef: `${releaseReceiptRef}.worker`,
      transitionedAt,
      reason
    });
    const resource = releaseResourceLease(current.resource, {
      releaseReceiptRef: `${releaseReceiptRef}.resource`,
      releasedAt: transitionedAt,
      reason
    });
    const context = transitionLease(current.context, {
      lifecycle,
      receiptRef: `${releaseReceiptRef}.context`,
      transitionedAt,
      reason
    });
    const capability = transitionLease(current.capability, {
      lifecycle,
      receiptRef: `${releaseReceiptRef}.capability`,
      transitionedAt,
      reason
    });
    const effect = transitionLease(current.effect, {
      lifecycle,
      receiptRef: `${releaseReceiptRef}.effect`,
      transitionedAt,
      reason
    });
    const occupancy = transitionLease(current.occupancy, {
      lifecycle,
      receiptRef: `${releaseReceiptRef}.occupancy`,
      transitionedAt,
      reason
    });
    return {
      transitionedLeases: {
        worker: worker.lease,
        resource: resource.releasedLease,
        context: context.lease,
        capability: capability.lease,
        effect: effect.lease,
        occupancy: occupancy.lease
      },
      receipts: [
        worker.receipt,
        resource.releaseReceipt,
        context.receipt,
        capability.receipt,
        effect.receipt,
        occupancy.receipt
      ]
    };
  }

  checkpoint(checkpointInput, { releaseReceiptRef, releasedAt }) {
    const aggregate = this.#state.aggregate.value;
    if (!aggregate.active) throw new Error('no active worker lease to checkpoint');
    if (checkpointInput.workNodeRef !== aggregate.active.workNodeRef) {
      throw new Error('active worker lease does not match checkpoint work node');
    }
    const pendingEntry = checkpointInput.pendingToolCallRef && checkpointInput.pendingToolCallRef !== 'NONE'
      ? this.#relay?.snapshot.entries.find((item) => item.toolCallRef === checkpointInput.pendingToolCallRef)
      : null;
    if (checkpointInput.pendingToolCallRef !== 'NONE' && !pendingEntry) {
      throw new Error('checkpoint pending tool call is not present in the canonical relay ledger');
    }
    if (pendingEntry) {
      this.#relay.hold(pendingEntry.toolCallRef, {
        receiptRef: `${releaseReceiptRef}.tool-hold`,
        heldAt: releasedAt,
        checkpointRef: checkpointInput.checkpointRef
      });
    }
    const transitions = this.#transitionActiveLeases({
      releaseReceiptRef,
      transitionedAt: releasedAt,
      reason: 'CHECKPOINT',
      lifecycle: 'RELEASED'
    });
    const active = aggregate.active;
    const checkpoint = createIntentCheckpoint({
      ...checkpointInput,
      graphFingerprint: active.graphFingerprint,
      trustSnapshotFingerprint: active.trustSnapshotFingerprint,
      runtimeSnapshotFingerprint: active.runtimeSnapshotFingerprint,
      priorSchedulerGeneration: active.schedulerGeneration,
      currentState: 'PAUSED_AT_CHECKPOINT',
      priorOccupancyRef: active.occupancyRef,
      priorCapabilityLeaseRef: active.capabilityLeaseRef,
      priorEffectLeaseRef: active.effectLeaseRef,
      priorResourceLeaseRef: active.resourceLeaseRef,
      priorContextLeaseRef: active.contextLeaseRef,
      priorWorkerLeaseRef: active.workerLeaseRef,
      resourceSnapshotFingerprint: aggregate.resource.semanticFingerprint,
      sourceBindings: canonicalSourceBindings(checkpointInput.sourceBindings),
      leaseReleaseReceipts: transitions.receipts,
      formedAt: checkpointInput.formedAt
    });
    const queue = consumeAdmission(aggregate.queue, {
      state: 'PAUSED',
      lifecycle: 'RELEASED',
      transitionedAt: releasedAt,
      reason: 'CHECKPOINT',
      transitionedLeases: transitions.transitionedLeases
    });
    this.#commit({
      type: 'CHECKPOINTED',
      transitionRef: `transition.intent-scheduler.checkpoint.${aggregate.generation}`,
      checkpoint,
      queue,
      transitionedLeases: transitions.transitionedLeases,
      pendingPreemption: aggregate.pendingPreemption,
      relayLedger: this.#relay?.snapshot ?? aggregate.relayLedger
    });
    return {
      checkpoint,
      leaseReleaseReceipts: transitions.receipts,
      transitionedLeases: transitions.transitionedLeases,
      relayLedger: this.#relay?.snapshot ?? null
    };
  }

  resume(checkpointRef, {
    graph,
    options,
    contextInput,
    sourceBindings,
    completePreemption = false
  }) {
    const aggregate = this.#state.aggregate.value;
    if (aggregate.active || aggregate.phase !== 'PAUSED') throw new Error('resume requires exactly one paused scheduler aggregate');
    const checkpoint = aggregate.checkpoints.find((item) => item.checkpointRef === checkpointRef);
    if (!checkpoint || checkpoint.currentState !== 'PAUSED_AT_CHECKPOINT') {
      throw new Error('resume requires a current paused checkpoint');
    }
    const generation = options.schedulerGeneration ?? aggregate.generation + 1;
    if (generation <= aggregate.generation) throw new Error('resume scheduler generation must advance');
    const queue = admitIntentSchedulerQueue(graph, {
      ...options,
      schedulerRegistry: this.#schedulerRegistry,
      workerRef: this.#workerRef,
      schedulerGeneration: generation,
      fairnessLedger: aggregate.fairnessLedger
    });
    if (queue.state !== 'ADMITTED') throw new Error('fresh resume admission did not select a current node');
    if (completePreemption) {
      const pending = aggregate.pendingPreemption;
      if (!pending ||
          queue.selected.workNodeRef !== pending.incomingWorkNodeRef ||
          queue.selected.nodeFingerprint !== pending.incomingNodeFingerprint ||
          queue.graphFingerprint !== pending.graphFingerprint ||
          queue.admissionReceipt.admissionReceiptRef !== pending.admissionReceiptRef ||
          queue.generation !== pending.requestedGeneration) {
        throw new Error('fresh preemption admission does not match retained incoming candidate identity');
      }
    } else {
      if (queue.selected.workNodeRef !== checkpoint.workNodeRef) {
        throw new Error('fresh resume admission selected a different work node');
      }
      const validation = validateCheckpointResume(checkpoint, {
        graphFingerprint: queue.graphFingerprint,
        trustSnapshotFingerprint: queue.trustSnapshotFingerprint,
        runtimeTrustSnapshot: options.runtimeTrustSnapshot,
        occupancy: queue.selectedBindings.occupancy,
        capabilityLease: queue.selectedBindings.capabilityLease,
        effectLease: queue.selectedBindings.effectLease,
        resourceSnapshot: options.resourceSnapshot,
        resourceRequest: options.resourceRequestByNodeRef[checkpoint.workNodeRef],
        resourceLease: queue.resourceLease,
        sourceBindings,
        schedulerGeneration: generation,
        observedAt: options.observedAt
      });
      if (!validation.admitted) throw new Error(`checkpoint resume validation failed: ${validation.reasons.join(', ')}`);
    }
    const formed = this.#formActive(queue, {
      ...contextInput,
      runtimeTrustSnapshot: options.runtimeTrustSnapshot
    });
    if (!formed.admitted) throw new Error(`fresh resume worker lease failed: ${formed.reason}`);
    this.#commit({
      type: 'RESUMED',
      transitionRef: `transition.intent-scheduler.resume.${generation}`,
      checkpointRef: completePreemption ? null : checkpointRef,
      queue,
      active: formed.active,
      resourceSnapshot: options.resourceSnapshot,
      runtimeTrustSnapshot: options.runtimeTrustSnapshot,
      fairnessLedger: queue.fairnessLedger,
      leases: formed.leases
    });
    return {
      admitted: true,
      state: completePreemption ? 'PREEMPTION_COMPLETED' : 'RESUMED',
      checkpointRef,
      queue,
      active: clone(formed.active),
      contextLease: clone(formed.leases.context),
      resourceLease: clone(formed.leases.resource),
      capabilityLease: clone(formed.leases.capability),
      effectLease: clone(formed.leases.effect),
      occupancy: clone(formed.leases.occupancy),
      workerLease: clone(formed.leases.worker)
    };
  }

  cancelActive({ releaseReceiptRef, releasedAt, reason = 'CANCELLED_BY_CALLER' }) {
    const aggregate = this.#state.aggregate.value;
    if (!aggregate.active) return { changed: false, reason: 'NO_ACTIVE_WORK' };
    for (const entry of this.#relay?.snapshot.entries ?? []) {
      if (['PENDING', 'HELD', 'ACCEPTED'].includes(entry.state) &&
          entry.call?.cancellationTokenRef === aggregate.active.cancellationTokenRef) {
        this.#relay.cancel(entry.toolCallRef, {
          receiptRef: `${releaseReceiptRef}.tool.${entry.toolCallRef}`,
          closedAt: releasedAt,
          reason
        });
      }
    }
    const transitions = this.#transitionActiveLeases({
      releaseReceiptRef,
      transitionedAt: releasedAt,
      reason,
      lifecycle: 'CANCELLED'
    });
    const active = aggregate.active;
    const cancellationReceipt = finalized({
      schemaVersion: 'vexlife.intent-scheduler-cancellation/v1',
      cancellationReceiptRef: `${releaseReceiptRef}.cancellation`,
      workerLeaseRef: active.workerLeaseRef,
      workerRef: active.workerRef,
      workNodeRef: active.workNodeRef,
      graphFingerprint: active.graphFingerprint,
      runtimeSnapshotFingerprint: active.runtimeSnapshotFingerprint,
      schedulerGeneration: active.schedulerGeneration,
      cancellationTokenRef: active.cancellationTokenRef,
      sourceRefs: [...active.sourceRefs],
      artifactRefs: [...active.artifactRefs],
      receiptRefs: [...active.receiptRefs],
      leaseTransitionReceiptRefs: transitions.receipts.map((item) => item.receiptRef).sort(),
      reason,
      state: 'CANCELLED',
      sourceDiscarded: false,
      releasedAt
    });
    const queue = consumeAdmission(aggregate.queue, {
      state: 'CANCELLED',
      lifecycle: 'CANCELLED',
      transitionedAt: releasedAt,
      reason,
      transitionedLeases: transitions.transitionedLeases
    });
    this.#commit({
      type: 'CANCELLED',
      transitionRef: `transition.intent-scheduler.cancel.${aggregate.generation}`,
      queue,
      transitionedLeases: transitions.transitionedLeases,
      relayLedger: this.#relay?.snapshot ?? aggregate.relayLedger
    });
    return {
      changed: true,
      cancellationReceipt,
      leaseTransitionReceipts: transitions.receipts,
      transitionedLeases: transitions.transitionedLeases,
      relayLedger: this.#relay?.snapshot ?? null
    };
  }

  syncRelayState() {
    if (!this.#relay) return { changed: false, reason: 'NO_TOOL_RELAY' };
    const prior = this.#state.aggregate.hash;
    this.#commit({
      type: 'RELAY_SYNC',
      transitionRef: `transition.intent-scheduler.relay.${this.generation}`,
      relayLedger: this.#relay.snapshot
    });
    return { changed: prior !== this.#state.aggregate.hash, relayLedger: this.#relay.snapshot };
  }
}

export { WorkerLeaseAuthority };

// [VXG RealForever]
