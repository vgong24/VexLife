import {
  createContextLease,
  createSuccessorContextAuthorization
} from './context-lease.mjs';
import {
  canonicalSourceBindings,
  createIntentCheckpoint,
  validateCheckpointResume
} from './intent-checkpoint.mjs';
import {
  createResourceLease,
  evaluateCurrentResourceAdmission,
  evaluateResourceAdmission,
  releaseResourceLease
} from './resource-admission.mjs';
import {
  assertActiveInterval,
  assertCurrentLease,
  assertSourceHash,
  parseCanonicalTimestamp,
  resolveMockToolContract,
  transitionLease,
  WorkerLeaseAuthority
} from './scheduler-runtime-trust.mjs';
import {
  createIntentSchedulerState,
  reduceSchedulerAggregate
} from './state.mjs';
import { validateIntentWorkgraph } from './intent-validation.mjs';
import {
  DeterministicFakeCompletionVerifier,
  reduceVerifiedWorkCompletion
} from './intent-completion-verifier.mjs';
import { createToolCall } from './tool-result-relay.mjs';
import { semanticHash } from './utils.mjs';
import { validateSchedulerRecoveryClaimReceipt } from './runtime-recovery.mjs';

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

function canonicalRefs(values = []) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) {
    throw new Error('lineage refs must be stable non-empty strings');
  }
  return [...new Set(values)].sort();
}

function requireExactRefs(provided, expected, label) {
  if (JSON.stringify(canonicalRefs(provided)) !== JSON.stringify(canonicalRefs(expected))) {
    throw new Error(`${label} must match canonical scheduler lineage exactly`);
  }
}

function finalized(value) {
  const candidate = clone(value);
  delete candidate.semanticFingerprint;
  candidate.semanticFingerprint = semanticHash(candidate);
  return freeze(candidate);
}

const RECOVERY_CLAIM_EDGE_CONTRACTS = Object.freeze({
  CLAIMED_CURRENT: Object.freeze({
    schemaVersion: 'vexlife.intent-scheduler-recovery-claim-edge-evidence/v1',
    contractRef: 'contract.intent-scheduler.recovery-claim-edge.claimed-current/v1',
    prefix: 'evidence.intent-scheduler.recovery-claim.claimed-current.'
  }),
  RESUMED_CONSUMED: Object.freeze({
    schemaVersion: 'vexlife.intent-scheduler-recovery-resume-edge-evidence/v1',
    contractRef: 'contract.intent-scheduler.recovery-claim-edge.resumed-consumed/v1',
    prefix: 'evidence.intent-scheduler.recovery-claim.resumed-consumed.'
  }),
  TERMINAL_CONSUMED: Object.freeze({
    schemaVersion: 'vexlife.intent-scheduler-recovery-terminal-edge-evidence/v1',
    contractRef: 'contract.intent-scheduler.recovery-claim-edge.terminal-consumed/v1',
    prefix: 'evidence.intent-scheduler.recovery-claim.terminal-consumed.'
  }),
  INVALIDATED_OR_ABANDONED: Object.freeze({
    schemaVersion: 'vexlife.intent-scheduler-recovery-disposition-edge-evidence/v1',
    contractRef: 'contract.intent-scheduler.recovery-claim-edge.invalidated-or-abandoned/v1',
    prefix: 'evidence.intent-scheduler.recovery-claim.invalidated-or-abandoned.'
  })
});

function recoveryClaimEdgeEvidence(type, input) {
  const contract = RECOVERY_CLAIM_EDGE_CONTRACTS[type];
  if (!contract) throw new Error(`unknown scheduler recovery claim edge ${type}`);
  const evidence = {
    schemaVersion: contract.schemaVersion,
    contractRef: contract.contractRef,
    transitionType: type,
    ...clone(input)
  };
  evidence.semanticFingerprint = semanticHash(evidence);
  evidence.evidenceRef = `${contract.prefix}${evidence.semanticFingerprint.slice(0, 32)}`;
  return freeze(evidence);
}

function contentAddressedSchedulerEvidence(input, {
  schemaVersion,
  refField,
  prefix
}) {
  const evidence = { schemaVersion, ...clone(input) };
  evidence.semanticFingerprint = semanticHash(evidence);
  evidence[refField] = `${prefix}${evidence.semanticFingerprint.slice(0, 32)}`;
  return freeze(evidence);
}

function recoveryClaimTransition(aggregate, type, input) {
  const prior = aggregate.recoveryClaimLedger?.at(-1) ?? null;
  if (!input?.edgeEvidence) throw new Error('scheduler recovery claim transition requires exact edge evidence');
  const transition = {
    schemaVersion: 'vexlife.intent-scheduler-recovery-claim-transition/v1',
    type,
    sequence: aggregate.recoveryClaimLedger?.length ?? 0,
    priorTransitionFingerprint: prior?.semanticFingerprint ?? null,
    ...clone(input),
    edgeEvidenceRef: input.edgeEvidence.evidenceRef,
    edgeEvidenceFingerprint: input.edgeEvidence.semanticFingerprint
  };
  transition.semanticFingerprint = semanticHash(transition);
  transition.transitionRef = `transition.intent-scheduler.recovery-claim.${type.toLowerCase().replaceAll('_', '-')}.${transition.semanticFingerprint.slice(0, 32)}`;
  return freeze(transition);
}

function observedClockReceipt(observedAt, eventRef) {
  parseCanonicalTimestamp(observedAt, 'scheduler observed clock');
  if (!eventRef) throw new Error('scheduler observed clock requires eventRef');
  return finalized({
    schemaVersion: 'vexlife.intent-scheduler-observed-clock/v1',
    clockRef: 'clock.intent-scheduler.canonical-utc',
    eventRef,
    observedAt,
    currentness: 'CURRENT'
  });
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
  recoveryResourceBindingByNodeRef = {},
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
    resourceAdmission = evaluateCurrentResourceAdmission(
      resourceSnapshot,
      resourceRequestByNodeRef[node.workNodeRef] ?? {},
      { observedAt }
    );
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
    recoveryBinding: recoveryResourceBindingByNodeRef[node.workNodeRef] ?? null,
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
  #relayCapability;
  #completionVerifier;
  #state;
  #runtimeRecoveryRegistry;

  constructor({
    workerRef,
    schedulerInstanceRef,
    schedulerRegistry,
    runtimeAuthority = null,
    toolRelay = null,
    completionVerifier = null,
    runtimeRecoveryRegistry = null,
    schedulerAggregate = null
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
    this.#relayCapability = {};
    if (this.#relay) this.#relay.bindSchedulerOwnership(this.#instanceRef, this.#relayCapability);
    this.#completionVerifier = completionVerifier ?? new DeterministicFakeCompletionVerifier({ schedulerRegistry });
    this.#runtimeRecoveryRegistry = runtimeRecoveryRegistry;
    const recoveryClaimReceiptValidator = runtimeRecoveryRegistry
      ? (value) => validateSchedulerRecoveryClaimReceipt(value, { registry: runtimeRecoveryRegistry })
      : null;
    this.#state = schedulerAggregate
      ? createIntentSchedulerState({ aggregate: schedulerAggregate, recoveryClaimReceiptValidator })
      : createIntentSchedulerState({ recoveryClaimReceiptValidator });
  }

  get workerRef() { return this.#workerRef; }
  get schedulerInstanceRef() { return this.#instanceRef; }
  get generation() { return this.#state.aggregate.value.generation; }
  get active() { return this.#state.aggregate.value.active; }
  get queue() { return this.#state.aggregate.value.queue; }
  get aggregate() { return this.#state.aggregate.value; }
  get continuations() { return clone(this.#state.aggregate.value.continuations); }
  get projections() { return this.#state; }

  #commit(event) {
    const next = reduceSchedulerAggregate(this.#state.aggregate.value, event, {
      recoveryClaimReceiptValidator: this.#runtimeRecoveryRegistry
        ? (value) => validateSchedulerRecoveryClaimReceipt(value, { registry: this.#runtimeRecoveryRegistry })
        : null
    });
    this.#state.aggregate.set(next, { source: event.type });
    return next;
  }

  advanceObservedClock({ observedAt, eventRef = `clock.intent-scheduler.advance.${this.generation}` }) {
    const current = this.#state.aggregate.value.observedClock?.observedAt;
    const nextEpoch = parseCanonicalTimestamp(observedAt, 'scheduler observed clock');
    if (current && nextEpoch < parseCanonicalTimestamp(current, 'current scheduler observed clock')) {
      throw new Error('scheduler observed clock must advance monotonically');
    }
    const receipt = observedClockReceipt(observedAt, eventRef);
    this.#commit({
      type: 'CLOCK_ADVANCED',
      transitionRef: `transition.intent-scheduler.clock.${this.generation}.${receipt.semanticFingerprint.slice(0, 12)}`,
      observedClock: receipt
    });
    return {
      changed: current !== observedAt,
      observedClock: clone(receipt),
      health: clone(this.#state.health.value)
    };
  }

  admit(graph, options) {
    const current = this.#state.aggregate.value;
    if (current.active) throw new Error('cannot replace scheduler admission while a worker lease is active');
    if (current.phase === 'PAUSED') throw new Error('paused work must use the explicit resume transition');
    if (current.observedClock &&
        parseCanonicalTimestamp(options.observedAt, 'admission observedAt') <
          parseCanonicalTimestamp(current.observedClock.observedAt, 'scheduler observed clock')) {
      throw new Error('admission observed clock must be monotonic');
    }
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
      fairnessLedger: queue.fairnessLedger,
      observedClock: observedClockReceipt(options.observedAt, `clock.intent-scheduler.admit.${generation}`)
    });
    return queue;
  }

  #formActive(queue, contextInput, {
    priorContextLease = null,
    priorContextLeaseFingerprint = null,
    successorContextAuthorization = null
  } = {}) {
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
      lifecycle: 'ACTIVE',
      ...(successorContextAuthorization ? { successorContextAuthorization } : {})
    }, {
      priorLease: priorContextLease,
      priorLeaseFingerprint: priorContextLeaseFingerprint,
      expectedSchedulerIssuerRef: successorContextAuthorization ? this.#instanceRef : null
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
      incomingWorkerRef: incomingQueue.admissionReceipt.workerRef,
      incomingRuntimeSnapshotRef: incomingQueue.runtimeSnapshotRef,
      incomingRuntimeSnapshotFingerprint: incomingQueue.runtimeSnapshotFingerprint,
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
    if (aggregate.observedClock &&
        parseCanonicalTimestamp(transitionedAt, 'lease transitionedAt') <
          parseCanonicalTimestamp(aggregate.observedClock.observedAt, 'scheduler observed clock')) {
      throw new Error('lease transition time must be monotonic with the scheduler clock');
    }
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
      reason,
      lifecycle
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
      priorLeases: current,
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
    const active = aggregate.active;
    requireExactRefs(checkpointInput.selectedContextRefs ?? [], [active.contextLeaseRef], 'checkpoint selected context refs');
    requireExactRefs(checkpointInput.selectedSourceRefs ?? [], active.sourceRefs, 'checkpoint selected source refs');
    const relayArtifacts = (this.#relay?.snapshot.entries ?? [])
      .filter((item) => item.call?.workNodeRef === active.workNodeRef && item.observation)
      .flatMap((item) => item.observation.artifactRefs ?? []);
    const canonicalArtifacts = canonicalRefs([...(active.artifactRefs ?? []), ...relayArtifacts]);
    const canonicalReceipts = canonicalRefs(active.receiptRefs ?? []);
    requireExactRefs(checkpointInput.producedArtifactRefs ?? [], canonicalArtifacts, 'checkpoint produced artifact refs');
    requireExactRefs(checkpointInput.producedReceiptRefs ?? [], canonicalReceipts, 'checkpoint produced receipt refs');
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
    const checkpoint = createIntentCheckpoint({
      ...checkpointInput,
      selectedSourceRefs: canonicalRefs(active.sourceRefs),
      selectedContextRefs: [active.contextLeaseRef],
      producedArtifactRefs: canonicalArtifacts,
      producedReceiptRefs: canonicalReceipts,
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
      leaseReleaseLifecycle: 'RELEASED',
      priorLeaseFingerprints: Object.fromEntries(Object.entries(transitions.priorLeases)
        .map(([kind, lease]) => [kind, lease.semanticFingerprint])),
      transitionedLeaseFingerprints: Object.fromEntries(Object.entries(transitions.transitionedLeases)
        .map(([kind, lease]) => [kind, lease.semanticFingerprint])),
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
      relayLedger: this.#relay?.snapshot ?? aggregate.relayLedger,
      observedClock: observedClockReceipt(releasedAt, `clock.intent-scheduler.checkpoint.${aggregate.generation}`)
    });
    return {
      checkpoint,
      leaseReleaseReceipts: transitions.receipts,
      transitionedLeases: transitions.transitionedLeases,
      relayLedger: this.#relay?.snapshot ?? null
    };
  }

  claimRecoveryCheckpoint(checkpointRef, {
    recoveryClaimReceipt,
    observedAt
  }) {
    const aggregate = this.#state.aggregate.value;
    const checkpoint = aggregate.checkpoints.find((item) => item.checkpointRef === checkpointRef);
    parseCanonicalTimestamp(observedAt, 'recovery checkpoint claim observedAt');
    if (aggregate.phase !== 'PAUSED' || aggregate.active || !checkpoint ||
        checkpoint.currentState !== 'PAUSED_AT_CHECKPOINT') {
      throw new Error('recovery checkpoint claim requires the scheduler current paused pointer');
    }
    const claim = validateSchedulerRecoveryClaimReceipt(recoveryClaimReceipt, {
      registry: this.#runtimeRecoveryRegistry
    });
    if (claim.schedulerAggregateFingerprint !== aggregate.semanticFingerprint ||
        claim.schedulerCheckpointRef !== checkpoint.checkpointRef ||
        claim.schedulerCheckpointFingerprint !== checkpoint.semanticFingerprint ||
        claim.workNodeRef !== checkpoint.workNodeRef ||
        claim.schedulerGeneration !== checkpoint.priorSchedulerGeneration ||
        JSON.stringify(claim.leaseReleaseReceiptRefs) !== JSON.stringify(
          checkpoint.leaseReleaseReceipts.map((item) => item.receiptRef).sort()
        ) || JSON.stringify(claim.leaseReleaseFingerprints) !== JSON.stringify(
          checkpoint.leaseReleaseReceipts.map((item) => item.semanticFingerprint).sort()
        )) {
      throw new Error('recovery claimant evidence is forged or detached from scheduler truth');
    }
    if (aggregate.recoveryClaims.some((item) => item.checkpointRef === checkpointRef)) {
      throw new Error('scheduler checkpoint already has a recovery owner');
    }
    const releaseFingerprints = checkpoint.leaseReleaseReceipts.map((item) => item.semanticFingerprint).sort();
    if (releaseFingerprints.length !== 6 || new Set(releaseFingerprints).size !== 6 ||
        releaseFingerprints.some((fingerprint) => aggregate.recoveryClaims.some((item) =>
          item.leaseReleaseFingerprints.includes(fingerprint)))) {
      throw new Error('scheduler checkpoint release set is incomplete or already consumed');
    }
    const receipt = finalized({
      schemaVersion: 'vexlife.intent-scheduler-recovery-checkpoint-consumption/v1',
      consumptionRef: `consumption.intent-scheduler.recovery.${claim.onceOnlyActivationRef.split('.').at(-1)}`,
      onceOnlyActivationRef: claim.onceOnlyActivationRef,
      schedulerInstanceRef: this.#instanceRef,
      schedulerAggregateFingerprint: aggregate.semanticFingerprint,
      schedulerPhase: aggregate.phase,
      checkpointCurrentState: checkpoint.currentState,
      checkpointRef,
      checkpointFingerprint: checkpoint.semanticFingerprint,
      workNodeRef: checkpoint.workNodeRef,
      priorSchedulerGeneration: checkpoint.priorSchedulerGeneration,
      claimReceiptRef: claim.claimReceiptRef,
      claimReceiptFingerprint: claim.semanticFingerprint,
      aggregateRef: claim.aggregateRef,
      recoveryAggregateFingerprint: claim.recoveryAggregateFingerprint,
      recoveryCycleRef: claim.recoveryCycleRef,
      recoveryCycleFingerprint: claim.recoveryCycleFingerprint,
      failureRef: claim.activeFailureRef,
      failureFingerprint: claim.activeFailureFingerprint,
      sourceStateFingerprint: claim.sourceStateFingerprint,
      leaseReleaseReceiptRefs: checkpoint.leaseReleaseReceipts.map((item) => item.receiptRef).sort(),
      leaseReleaseFingerprints: releaseFingerprints,
      state: 'CLAIMED_CURRENT',
      currentness: 'CURRENT',
      observedAt
    });
    const claimTransitionBindings = {
      checkpointRef,
      checkpointFingerprint: checkpoint.semanticFingerprint,
      workNodeRef: checkpoint.workNodeRef,
      sourceStateFingerprint: claim.sourceStateFingerprint,
      recoveryAggregateRef: claim.aggregateRef,
      recoveryAggregateFingerprint: claim.recoveryAggregateFingerprint,
      recoveryCycleRef: claim.recoveryCycleRef,
      recoveryCycleFingerprint: claim.recoveryCycleFingerprint,
      failureRef: claim.activeFailureRef,
      failureFingerprint: claim.activeFailureFingerprint,
      claimReceiptRef: claim.claimReceiptRef,
      claimReceiptFingerprint: claim.semanticFingerprint,
      consumptionRef: receipt.consumptionRef,
      consumptionFingerprint: receipt.semanticFingerprint,
      onceOnlyActivationRef: receipt.onceOnlyActivationRef,
      leaseReleaseReceiptRefs: receipt.leaseReleaseReceiptRefs,
      leaseReleaseFingerprints: receipt.leaseReleaseFingerprints,
      schedulerGeneration: checkpoint.priorSchedulerGeneration,
      observedAt
    };
    const edgeEvidence = recoveryClaimEdgeEvidence('CLAIMED_CURRENT', {
      ...claimTransitionBindings,
      schedulerPriorAggregateFingerprint: aggregate.semanticFingerprint,
      recoveryClaimReceipt: claim,
      checkpointConsumptionReceipt: receipt
    });
    const transition = recoveryClaimTransition(aggregate, 'CLAIMED_CURRENT', {
      ...claimTransitionBindings,
      edgeEvidence
    });
    this.#commit({
      type: 'RECOVERY_CLAIMED',
      transitionRef: transition.transitionRef,
      recoveryClaimTransition: transition
    });
    return clone(receipt);
  }

  #validateRecoveryResume(checkpoint, recovery, options, contextInput) {
    if (!recovery) return null;
    const consumption = recovery.checkpointConsumptionReceipt;
    const admission = recovery.checkpointAdmission;
    const action = recovery.actionReceipt;
    const context = recovery.contextRecoveryReceipt ?? null;
    const resource = recovery.resourceRecoveryReceipt ?? null;
    const schedulerAggregate = this.#state.aggregate.value;
    const stored = schedulerAggregate.recoveryClaims.find((item) => item.checkpointRef === checkpoint.checkpointRef);
    const assertFinalized = (value, schemaVersion, label) => {
      if (!value || value.schemaVersion !== schemaVersion || !value.semanticFingerprint) {
        throw new Error(`${label} is missing or has the wrong schema`);
      }
      const candidate = clone(value);
      delete candidate.semanticFingerprint;
      const contentAddressedRefFields = {
        'vexlife.runtime-recovery-checkpoint-admission/v1': 'admissionRef',
        'vexlife.runtime-recovery-action-receipt/v1': 'actionReceiptRef',
        'vexlife.runtime-context-recovery-receipt/v1': 'contextRecoveryReceiptRef',
        'vexlife.runtime-resource-recovery-receipt/v1': 'resourceRecoveryReceiptRef'
      };
      if (contentAddressedRefFields[schemaVersion]) delete candidate[contentAddressedRefFields[schemaVersion]];
      if (semanticHash(candidate) !== value.semanticFingerprint) throw new Error(`${label} fingerprint mismatch`);
      return value;
    };
    assertFinalized(consumption, 'vexlife.intent-scheduler-recovery-checkpoint-consumption/v1', 'recovery checkpoint consumption');
    assertFinalized(admission, 'vexlife.runtime-recovery-checkpoint-admission/v1', 'recovery checkpoint admission');
    assertFinalized(action, 'vexlife.runtime-recovery-action-receipt/v1', 'recovery action receipt');
    if (!stored || stored.state !== 'CLAIMED_CURRENT' || stored.currentness !== 'CURRENT' ||
        stored.consumptionFingerprint !== consumption.semanticFingerprint ||
        stored.claimReceiptFingerprint !== consumption.claimReceiptFingerprint ||
        consumption.checkpointRef !== checkpoint.checkpointRef ||
        consumption.checkpointFingerprint !== checkpoint.semanticFingerprint ||
        consumption.checkpointCurrentState !== 'PAUSED_AT_CHECKPOINT' ||
        consumption.state !== 'CLAIMED_CURRENT' || consumption.currentness !== 'CURRENT' ||
        admission.schedulerCheckpointRef !== checkpoint.checkpointRef ||
        admission.schedulerConsumptionFingerprint !== consumption.semanticFingerprint ||
        admission.onceOnlyActivationRef !== consumption.onceOnlyActivationRef ||
        admission.recoveryCycleRef !== stored.recoveryCycleRef ||
        admission.recoveryCycleFingerprint !== stored.recoveryCycleFingerprint ||
        action.aggregateRef !== consumption.aggregateRef ||
        action.failureFingerprint !== consumption.failureFingerprint ||
        action.recoveryCycleRef !== stored.recoveryCycleRef ||
        action.recoveryCycleFingerprint !== stored.recoveryCycleFingerprint ||
        action.checkpointAdmissionFingerprint !== admission.semanticFingerprint ||
        action.disposition !== 'RECOVERING') {
      throw new Error('recovery resume evidence is stale, detached, terminal, or not scheduler-owned');
    }
    const requiresContext = ['CONDENSE_CONTEXT_AND_REACQUIRE', 'SPLIT_WORK_NODE'].includes(action.action);
    const requiresResource = action.action === 'RETRY_REDUCED_BUDGET';
    if (Boolean(context) !== requiresContext || Boolean(resource) !== requiresResource) {
      throw new Error('recovery resume supplied missing or cross-action context/resource evidence');
    }
    let contextBinding = null;
    if (context) {
      assertFinalized(context, 'vexlife.runtime-context-recovery-receipt/v1', 'context recovery receipt');
      if (context.recoveryCycleRef !== stored.recoveryCycleRef ||
          context.recoveryCycleFingerprint !== stored.recoveryCycleFingerprint) {
        throw new Error('context recovery receipt is from a different recovery cycle');
      }
      const expectedSources = [...new Set(context.immutableSourceCoverage.map((item) => item.sourceRef))].sort();
      contextBinding = {
        contextRecoveryReceiptRef: context.contextRecoveryReceiptRef,
        contextRecoveryReceiptFingerprint: context.semanticFingerprint,
        immutableSourceCoverage: clone(context.immutableSourceCoverage),
        deterministicSummaryBindings: clone(context.deterministicSummaryBindings),
        preservedIntentRef: context.preservedIntentRef,
        preservedInterpretationRef: context.preservedInterpretationRef,
        preservedUnknownRefs: clone(context.preservedUnknownRefs),
        preservedAuthorityRef: context.preservedAuthorityRef,
        returnRouteRef: context.returnRouteRef,
        inputTokenEstimate: context.candidateInputTokenEstimate,
        reservedOutputTokens: context.reservedOutputTokens,
        hardTokenLimit: context.hardTokenLimit
      };
      const observedContext = {
        contextRecoveryReceiptRef: contextInput.contextRecoveryReceiptRef,
        contextRecoveryReceiptFingerprint: contextInput.contextRecoveryReceiptFingerprint,
        immutableSourceCoverage: contextInput.immutableSourceCoverage,
        deterministicSummaryBindings: contextInput.deterministicSummaryBindings,
        preservedIntentRef: contextInput.preservedIntentRef,
        preservedInterpretationRef: contextInput.preservedInterpretationRef,
        preservedUnknownRefs: contextInput.preservedUnknownRefs,
        preservedAuthorityRef: contextInput.preservedAuthorityRef,
        returnRouteRef: contextInput.checkpointReturnRef,
        inputTokenEstimate: contextInput.inputTokenEstimate,
        reservedOutputTokens: contextInput.reservedOutputTokens,
        hardTokenLimit: contextInput.hardTokenLimit
      };
      if (semanticHash(observedContext) !== semanticHash(contextBinding) ||
          semanticHash([...(contextInput.selectedSourceRefs ?? [])].sort()) !== semanticHash(expectedSources)) {
        throw new Error('scheduler context input did not derive from the exact recovery context receipt');
      }
    }
    let resourceBinding = null;
    if (resource) {
      assertFinalized(resource, 'vexlife.runtime-resource-recovery-receipt/v1', 'resource recovery receipt');
      if (resource.recoveryCycleRef !== stored.recoveryCycleRef ||
          resource.recoveryCycleFingerprint !== stored.recoveryCycleFingerprint) {
        throw new Error('resource recovery receipt is from a different recovery cycle');
      }
      const request = options.resourceRequestByNodeRef?.[checkpoint.workNodeRef] ?? {};
      if (semanticHash(request) !== semanticHash(resource.reducedRequest)) {
        throw new Error('scheduler resource request differs from exact reduced recovery request');
      }
      resourceBinding = {
        resourceRecoveryReceiptRef: resource.resourceRecoveryReceiptRef,
        resourceRecoveryReceiptFingerprint: resource.semanticFingerprint,
        reducedAdmissionFingerprint: resource.reducedAdmissionFingerprint,
        reducedRequestFingerprint: semanticHash(resource.reducedRequest)
      };
    }
    return Object.freeze({ consumption, admission, action, context, resource, contextBinding, resourceBinding, claim: stored });
  }

  #successorAuthorization(checkpoint, queue, contextInput, observationRef, issuedAt) {
    if (!observationRef) return null;
    const entry = (this.#relay?.snapshot.entries ?? []).find((item) =>
      item.observation?.observationRef === observationRef &&
      ['ACCEPTED', 'REINJECTED'].includes(item.state)
    );
    if (!entry ||
        entry.observation.contextLeaseRef !== checkpoint.priorContextLeaseRef ||
        entry.observation.contextLeaseFingerprint !== checkpoint.priorLeaseFingerprints.context ||
        entry.observation.workNodeRef !== checkpoint.workNodeRef) {
      throw new Error('successor observation is not exact canonical checkpoint evidence');
    }
    return createSuccessorContextAuthorization({
      authorizationRef: `authorization.intent-scheduler.successor.${checkpoint.checkpointRef}.${queue.generation}.${observationRef}`,
      schedulerIssuerRef: this.#instanceRef,
      checkpointRef: checkpoint.checkpointRef,
      priorContextLeaseRef: checkpoint.priorContextLeaseRef,
      priorContextLeaseFingerprint: checkpoint.priorLeaseFingerprints.context,
      observationRef,
      observationFingerprint: entry.observation.semanticFingerprint,
      runtimeSnapshotFingerprint: queue.runtimeSnapshotFingerprint,
      contextLeaseRef: contextInput.leaseRef,
      resourceLeaseFingerprint: queue.resourceLease.semanticFingerprint,
      capabilityLeaseFingerprint: queue.selectedBindings.capabilityLease.semanticFingerprint,
      effectLeaseFingerprint: queue.selectedBindings.effectLease.semanticFingerprint,
      workerLeaseRef: `worker-lease.${this.#workerRef}.${queue.generation}`,
      schedulerGeneration: queue.generation,
      cancellationTokenRef: contextInput.cancellationTokenRef,
      issuedAt
    });
  }

  #applyHeldToolDisposition(checkpoint, disposition, formed, observedAt) {
    const entry = this.#relay?.snapshot.entries.find((item) => item.toolCallRef === checkpoint.pendingToolCallRef);
    if (!entry || entry.state !== 'HELD') throw new Error('checkpoint held tool call is not current in the relay aggregate');
    if (!['RESUME', 'REISSUE', 'SUPERSEDE', 'CLOSE'].includes(disposition?.action)) {
      throw new Error('checkpoint carrying a held tool call requires one scheduler disposition before RUNNING');
    }
    const action = disposition.action;
    const leases = formed.leases;
    const authorization = finalized({
      schemaVersion: 'vexlife.intent-held-tool-scheduler-authorization/v1',
      authorizationRef: disposition.authorizationRef,
      schedulerInstanceRef: this.#instanceRef,
      checkpointRef: checkpoint.checkpointRef,
      priorToolCallRef: entry.toolCallRef,
      workNodeRef: formed.active.workNodeRef,
      action,
      runtimeSnapshotFingerprint: formed.runtimeTrustSnapshot.semanticFingerprint,
      schedulerGeneration: formed.active.schedulerGeneration,
      cancellationTokenRef: formed.active.cancellationTokenRef,
      workerLeaseRef: leases.worker.leaseRef,
      workerLeaseFingerprint: leases.worker.semanticFingerprint,
      contextLeaseRef: leases.context.leaseRef,
      contextLeaseFingerprint: leases.context.semanticFingerprint,
      resourceLeaseRef: leases.resource.leaseRef,
      resourceLeaseFingerprint: leases.resource.semanticFingerprint,
      capabilityLeaseRef: leases.capability.leaseRef,
      capabilityLeaseFingerprint: leases.capability.semanticFingerprint,
      effectLeaseRef: leases.effect.leaseRef,
      effectLeaseFingerprint: leases.effect.semanticFingerprint,
      replacementPolicyRef: disposition.replacementPolicyRef ?? null,
      replacementReasonRef: disposition.replacementReasonRef ?? null,
      formedAt: observedAt
    });
    let successorCall = null;
    if (action !== 'CLOSE') {
      const prior = entry.call;
      const replacement = disposition.successorCallInput ?? {};
      const preservesPurpose = ['RESUME', 'REISSUE'].includes(action);
      successorCall = createToolCall({
        toolCallRef: replacement.toolCallRef,
        workNodeRef: formed.active.workNodeRef,
        toolRef: preservesPurpose ? prior.toolRef : replacement.toolRef,
        effectRef: preservesPurpose ? prior.effectRef : replacement.effectRef,
        arguments: preservesPurpose ? prior.arguments : replacement.arguments,
        schedulerGeneration: formed.active.schedulerGeneration,
        cancellationTokenRef: formed.active.cancellationTokenRef,
        sourceEvidenceRef: preservesPurpose ? prior.sourceEvidenceRef : replacement.sourceEvidenceRef,
        sourceEvidenceHash: preservesPurpose ? prior.sourceEvidenceHash : replacement.sourceEvidenceHash,
        proposedAt: replacement.proposedAt ?? observedAt,
        timeoutAt: replacement.timeoutAt,
        cancellationPolicy: preservesPurpose ? prior.cancellationPolicy : replacement.cancellationPolicy,
        predecessorToolCallRef: prior.toolCallRef,
        heldDisposition: action,
        replacementPolicyRef: action === 'SUPERSEDE' ? disposition.replacementPolicyRef : null,
        replacementReasonRef: action === 'SUPERSEDE' ? disposition.replacementReasonRef : null
      }, {
        contextLease: leases.context,
        capabilityLease: leases.capability,
        effectLease: leases.effect,
        resourceLease: leases.resource,
        workerLease: leases.worker,
        runtimeTrustSnapshot: formed.runtimeTrustSnapshot,
        schedulerRegistry: this.#schedulerRegistry,
        observedAt
      });
    }
    const transition = this.#relay.transitionHeld(entry.toolCallRef, {
      action,
      checkpointRef: checkpoint.checkpointRef,
      successorCall,
      schedulerAuthorization: authorization,
      schedulerCapability: this.#relayCapability,
      receiptRef: disposition.receiptRef,
      transitionedAt: observedAt
    });
    if (!transition.changed) throw new Error(`held tool scheduler disposition failed: ${transition.reason}`);
    return freeze({
      authorization,
      receipt: transition.receipt,
      successorCall: transition.successorCall
    });
  }

  resume(checkpointRef, {
    graph,
    options,
    contextInput,
    sourceBindings,
    completePreemption = false,
    authorizeObservationRef = null,
    heldToolDisposition = null,
    recovery = null
  }) {
    const aggregate = this.#state.aggregate.value;
    if (aggregate.active || !['PAUSED', 'CONTINUATION_READY'].includes(aggregate.phase)) {
      throw new Error('resume requires exactly one paused or continuation-ready scheduler aggregate');
    }
    if (aggregate.observedClock &&
        parseCanonicalTimestamp(options.observedAt, 'resume observedAt') <
          parseCanonicalTimestamp(aggregate.observedClock.observedAt, 'scheduler observed clock')) {
      throw new Error('resume observed clock must be monotonic');
    }
    const checkpoint = aggregate.checkpoints.find((item) => item.checkpointRef === checkpointRef);
    if (!checkpoint || checkpoint.currentState !== 'PAUSED_AT_CHECKPOINT') {
      throw new Error('resume requires a current paused checkpoint');
    }
    if (this.#relay && this.#relay.snapshot.semanticFingerprint !== aggregate.relayLedger.semanticFingerprint) {
      throw new Error('relay ledger diverged from the scheduler aggregate');
    }
    const carriesHeldTool = !completePreemption && checkpoint.pendingToolCallRef !== 'NONE';
    if (carriesHeldTool && !['RESUME', 'REISSUE', 'SUPERSEDE', 'CLOSE'].includes(heldToolDisposition?.action)) {
      throw new Error('checkpoint carrying a held tool call requires one scheduler disposition before RUNNING');
    }
    const generation = options.schedulerGeneration ?? aggregate.generation + 1;
    if (generation <= aggregate.generation) throw new Error('resume scheduler generation must advance');
    const recoveryResume = completePreemption ? null : this.#validateRecoveryResume(checkpoint, recovery, options, contextInput);
    const queue = admitIntentSchedulerQueue(graph, {
      ...options,
      ...(recoveryResume?.resourceBinding ? {
        recoveryResourceBindingByNodeRef: {
          ...(options.recoveryResourceBindingByNodeRef ?? {}),
          [checkpoint.workNodeRef]: recoveryResume.resourceBinding
        }
      } : {}),
      schedulerRegistry: this.#schedulerRegistry,
      workerRef: this.#workerRef,
      schedulerInstanceRef: this.#instanceRef,
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
          queue.admissionReceipt.semanticFingerprint !== pending.admissionFingerprint ||
          queue.admissionReceipt.workerRef !== pending.incomingWorkerRef ||
          queue.runtimeSnapshotRef !== pending.incomingRuntimeSnapshotRef ||
          queue.runtimeSnapshotFingerprint !== pending.incomingRuntimeSnapshotFingerprint ||
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
    const priorContextLease = aggregate.leaseLedger[checkpoint.priorContextLeaseRef];
    const successorContextAuthorization = completePreemption
      ? null
      : this.#successorAuthorization(
        checkpoint,
        queue,
        contextInput,
        authorizeObservationRef,
        options.observedAt
      );
    const formed = this.#formActive(queue, {
      ...contextInput,
      runtimeTrustSnapshot: options.runtimeTrustSnapshot
    }, {
      priorContextLease,
      priorContextLeaseFingerprint: checkpoint.priorLeaseFingerprints.context,
      successorContextAuthorization
    });
    if (!formed.admitted) throw new Error(`fresh resume worker lease failed: ${formed.reason}`);
    let dispositionResult = null;
    try {
      if (carriesHeldTool) {
        dispositionResult = this.#applyHeldToolDisposition(checkpoint, heldToolDisposition, formed, options.observedAt);
      }
    } catch (error) {
      this.#authority.release(formed.leases.worker, {
        lifecycle: 'CANCELLED',
        receiptRef: `${heldToolDisposition?.receiptRef ?? checkpoint.checkpointRef}.failed.worker`,
        transitionedAt: options.observedAt,
        reason: 'HELD_TOOL_DISPOSITION_REJECTED'
      });
      throw error;
    }
    const freshLeaseRefs = Object.fromEntries(Object.entries(formed.leases).map(([kind, lease]) => [
      kind,
      kind === 'occupancy' ? lease.occupancyRef : lease.leaseRef
    ]));
    const freshLeaseFingerprints = Object.fromEntries(
      Object.entries(formed.leases).map(([kind, lease]) => [kind, lease.semanticFingerprint])
    );
    let resumeClaimTransition = null;
    if (recoveryResume) {
      const resumeTransitionBindings = {
        checkpointRef,
        claimReceiptRef: recoveryResume.claim.claimReceiptRef,
        claimReceiptFingerprint: recoveryResume.claim.claimReceiptFingerprint,
        consumptionRef: recoveryResume.consumption.consumptionRef,
        consumptionFingerprint: recoveryResume.consumption.semanticFingerprint,
        recoveryCycleRef: recoveryResume.claim.recoveryCycleRef,
        recoveryCycleFingerprint: recoveryResume.claim.recoveryCycleFingerprint,
        actionReceiptFingerprint: recoveryResume.action.semanticFingerprint,
        checkpointAdmissionFingerprint: recoveryResume.admission.semanticFingerprint,
        schedulerGeneration: generation,
        observedAt: options.observedAt
      };
      const schedulerResumeEvidence = contentAddressedSchedulerEvidence({
        contractRef: 'contract.intent-scheduler.recovery-resume-evidence/v1',
        formationRef: 'formation.intent-scheduler.recovery-resume.v1',
        schedulerInstanceRef: this.#instanceRef,
        schedulerPriorAggregateFingerprint: aggregate.semanticFingerprint,
        claimTransitionRef: recoveryResume.claim.lastTransitionRef,
        claimTransitionFingerprint: recoveryResume.claim.lastTransitionFingerprint,
        checkpointRef,
        checkpointFingerprint: checkpoint.semanticFingerprint,
        checkpointCurrentStateBefore: checkpoint.currentState,
        checkpointCurrentStateAfter: 'RESUMED',
        claimReceiptRef: recoveryResume.claim.claimReceiptRef,
        claimReceiptFingerprint: recoveryResume.claim.claimReceiptFingerprint,
        consumptionRef: recoveryResume.consumption.consumptionRef,
        consumptionFingerprint: recoveryResume.consumption.semanticFingerprint,
        recoveryAggregateRef: recoveryResume.claim.recoveryAggregateRef,
        recoveryAggregateFingerprint: recoveryResume.claim.recoveryAggregateFingerprint,
        recoveryCycleRef: recoveryResume.claim.recoveryCycleRef,
        recoveryCycleFingerprint: recoveryResume.claim.recoveryCycleFingerprint,
        failureRef: recoveryResume.claim.failureRef,
        failureFingerprint: recoveryResume.claim.failureFingerprint,
        workNodeRef: checkpoint.workNodeRef,
        sourceStateFingerprint: recoveryResume.claim.sourceStateFingerprint,
        actionReceiptRef: recoveryResume.action.actionReceiptRef,
        actionReceiptFingerprint: recoveryResume.action.semanticFingerprint,
        checkpointAdmissionRef: recoveryResume.admission.admissionRef,
        checkpointAdmissionFingerprint: recoveryResume.admission.semanticFingerprint,
        contextRecoveryReceiptFingerprint: recoveryResume.context?.semanticFingerprint ?? null,
        resourceRecoveryReceiptFingerprint: recoveryResume.resource?.semanticFingerprint ?? null,
        schedulerGeneration: generation,
        queueAdmissionRef: queue.admissionReceipt.admissionReceiptRef,
        queueAdmissionFingerprint: queue.admissionReceipt.semanticFingerprint,
        freshLeaseRefs,
        freshLeaseFingerprints,
        currentness: 'CURRENT',
        observedAt: options.observedAt
      }, {
        schemaVersion: 'vexlife.intent-scheduler-recovery-resume-evidence/v1',
        refField: 'resumeEvidenceRef',
        prefix: 'evidence.intent-scheduler.recovery-resume.'
      });
      const edgeEvidence = recoveryClaimEdgeEvidence('RESUMED_CONSUMED', {
        ...resumeTransitionBindings,
        schedulerPriorAggregateFingerprint: aggregate.semanticFingerprint,
        schedulerResumeEvidence
      });
      resumeClaimTransition = recoveryClaimTransition(aggregate, 'RESUMED_CONSUMED', {
        ...resumeTransitionBindings,
        edgeEvidence
      });
    }
    const committed = this.#commit({
      type: 'RESUMED',
      transitionRef: `transition.intent-scheduler.resume.${generation}`,
      checkpointRef: completePreemption ? null : checkpointRef,
      queue,
      active: formed.active,
      resourceSnapshot: options.resourceSnapshot,
      runtimeTrustSnapshot: options.runtimeTrustSnapshot,
      fairnessLedger: queue.fairnessLedger,
      leases: formed.leases,
      recoveryClaimTransition: resumeClaimTransition,
      heldToolDisposition: dispositionResult,
      relayLedger: this.#relay?.snapshot ?? aggregate.relayLedger,
      observedClock: observedClockReceipt(options.observedAt, `clock.intent-scheduler.resume.${generation}`)
    });
    const currentCheckpoint = committed.checkpoints.find((item) => item.checkpointRef === checkpointRef);
    const recoveryResumeReceipt = recoveryResume ? finalized({
      schemaVersion: 'vexlife.intent-scheduler-recovery-resume-receipt/v1',
      resumeReceiptRef: `receipt.intent-scheduler.recovery-resume.${recoveryResume.consumption.onceOnlyActivationRef.split('.').at(-1)}.${generation}`,
      schedulerInstanceRef: this.#instanceRef,
      schedulerPriorAggregateFingerprint: aggregate.semanticFingerprint,
      schedulerCurrentAggregateFingerprint: committed.semanticFingerprint,
      checkpointConsumptionRef: recoveryResume.consumption.consumptionRef,
      checkpointConsumptionFingerprint: recoveryResume.consumption.semanticFingerprint,
      recoveryClaimReceiptRef: recoveryResume.claim.claimReceiptRef,
      recoveryClaimReceiptFingerprint: recoveryResume.claim.claimReceiptFingerprint,
      recoveryClaimTransitionRef: resumeClaimTransition.transitionRef,
      recoveryClaimTransitionFingerprint: resumeClaimTransition.semanticFingerprint,
      onceOnlyActivationRef: recoveryResume.consumption.onceOnlyActivationRef,
      checkpointRef,
      checkpointFingerprint: checkpoint.semanticFingerprint,
      checkpointCurrentState: currentCheckpoint?.currentState,
      checkpointCurrentPointerFingerprint: semanticHash({
        checkpointRef,
        currentState: currentCheckpoint?.currentState,
        resumedByWorkerLeaseRef: currentCheckpoint?.resumedByWorkerLeaseRef
      }),
      aggregateRef: recoveryResume.action.aggregateRef,
      recoveryCycleRef: recoveryResume.claim.recoveryCycleRef,
      recoveryCycleFingerprint: recoveryResume.claim.recoveryCycleFingerprint,
      failureRef: recoveryResume.action.failureRef,
      failureFingerprint: recoveryResume.action.failureFingerprint,
      action: recoveryResume.action.action,
      actionReceiptRef: recoveryResume.action.actionReceiptRef,
      actionReceiptFingerprint: recoveryResume.action.semanticFingerprint,
      checkpointAdmissionRef: recoveryResume.admission.admissionRef,
      checkpointAdmissionFingerprint: recoveryResume.admission.semanticFingerprint,
      contextRecoveryReceiptRef: recoveryResume.context?.contextRecoveryReceiptRef ?? null,
      contextRecoveryReceiptFingerprint: recoveryResume.context?.semanticFingerprint ?? null,
      contextBindingFingerprint: recoveryResume.contextBinding ? semanticHash(recoveryResume.contextBinding) : null,
      resourceRecoveryReceiptRef: recoveryResume.resource?.resourceRecoveryReceiptRef ?? null,
      resourceRecoveryReceiptFingerprint: recoveryResume.resource?.semanticFingerprint ?? null,
      reducedRequestFingerprint: recoveryResume.resource ? semanticHash(recoveryResume.resource.reducedRequest) : null,
      reducedAdmissionFingerprint: recoveryResume.resource?.reducedAdmissionFingerprint ?? null,
      schedulerGeneration: generation,
      queueAdmissionRef: queue.admissionReceipt.admissionReceiptRef,
      queueAdmissionFingerprint: queue.admissionReceipt.semanticFingerprint,
      freshLeaseRefs,
      freshLeaseFingerprints,
      contextLeaseRecoveryBindingFingerprint: formed.leases.context.contextRecoveryReceiptFingerprint
        ? semanticHash({
          contextRecoveryReceiptRef: formed.leases.context.contextRecoveryReceiptRef,
          contextRecoveryReceiptFingerprint: formed.leases.context.contextRecoveryReceiptFingerprint,
          immutableSourceCoverage: formed.leases.context.immutableSourceCoverage,
          deterministicSummaryBindings: formed.leases.context.deterministicSummaryBindings,
          preservedIntentRef: formed.leases.context.preservedIntentRef,
          preservedInterpretationRef: formed.leases.context.preservedInterpretationRef,
          preservedUnknownRefs: formed.leases.context.preservedUnknownRefs,
          preservedAuthorityRef: formed.leases.context.preservedAuthorityRef,
          returnRouteRef: formed.leases.context.checkpointReturnRef,
          inputTokenEstimate: formed.leases.context.inputTokenEstimate,
          reservedOutputTokens: formed.leases.context.reservedOutputTokens,
          hardTokenLimit: formed.leases.context.hardTokenLimit
        }) : null,
      resourceLeaseRecoveryBindingFingerprint: formed.leases.resource.recoveryBinding
        ? semanticHash(formed.leases.resource.recoveryBinding) : null,
      state: 'RECOVERY_OUTPUTS_CONSUMED_CURRENT',
      currentness: 'CURRENT',
      observedAt: options.observedAt
    }) : null;
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
      workerLease: clone(formed.leases.worker),
      recoveryResumeReceipt: recoveryResumeReceipt ? clone(recoveryResumeReceipt) : null,
      successorContextAuthorization: successorContextAuthorization ? clone(successorContextAuthorization) : null,
      heldToolDisposition: dispositionResult ? clone(dispositionResult) : null
    };
  }

  resumeContinuation({
    graph,
    options,
    contextInput,
    sourceBindings,
    authorizeObservationRef = null,
    heldToolDisposition = null
  }) {
    const continuation = this.#state.aggregate.value.continuations.at(-1);
    if (!continuation) throw new Error('no preempted continuation is ready');
    const result = this.resume(continuation.checkpointRef, {
      graph,
      options,
      contextInput,
      sourceBindings,
      authorizeObservationRef,
      heldToolDisposition
    });
    return { ...result, state: 'PREEMPTED_WORK_RESUMED', continuation };
  }

  #closeUnownedRelayCalls({ releaseReceiptRef, releasedAt, reason }) {
    const aggregate = this.#state.aggregate.value;
    const retained = new Set(aggregate.continuations
      .map((item) => item.pendingToolCallRef)
      .filter((ref) => ref && ref !== 'NONE'));
    for (const entry of this.#relay?.snapshot.entries ?? []) {
      if (!['PENDING', 'HELD', 'ACCEPTED'].includes(entry.state)) continue;
      if (entry.state === 'HELD' && retained.has(entry.toolCallRef)) continue;
      if (entry.state === 'HELD') {
        if (!aggregate.active) throw new Error('scheduler terminal held close requires an active aggregate');
        const active = aggregate.active;
        const leases = {
          worker: aggregate.leaseLedger[active.workerLeaseRef],
          context: aggregate.leaseLedger[active.contextLeaseRef],
          resource: aggregate.leaseLedger[active.resourceLeaseRef],
          capability: aggregate.leaseLedger[active.capabilityLeaseRef],
          effect: aggregate.leaseLedger[active.effectLeaseRef]
        };
        if (Object.values(leases).some((lease) => !lease?.semanticFingerprint)) {
          throw new Error('scheduler terminal held close requires exact active leases');
        }
        const hold = entry.transitionReceipts.at(-1);
        const authorization = finalized({
          schemaVersion: 'vexlife.intent-held-tool-scheduler-authorization/v1',
          authorizationRef: `${releaseReceiptRef}.tool.${entry.toolCallRef}.authorization`,
          schedulerInstanceRef: this.#instanceRef,
          checkpointRef: hold.checkpointRef,
          priorToolCallRef: entry.toolCallRef,
          workNodeRef: entry.call.workNodeRef,
          action: 'CLOSE',
          runtimeSnapshotFingerprint: active.runtimeSnapshotFingerprint,
          schedulerGeneration: active.schedulerGeneration,
          cancellationTokenRef: active.cancellationTokenRef,
          workerLeaseRef: leases.worker.leaseRef,
          workerLeaseFingerprint: leases.worker.semanticFingerprint,
          contextLeaseRef: leases.context.leaseRef,
          contextLeaseFingerprint: leases.context.semanticFingerprint,
          resourceLeaseRef: leases.resource.leaseRef,
          resourceLeaseFingerprint: leases.resource.semanticFingerprint,
          capabilityLeaseRef: leases.capability.leaseRef,
          capabilityLeaseFingerprint: leases.capability.semanticFingerprint,
          effectLeaseRef: leases.effect.leaseRef,
          effectLeaseFingerprint: leases.effect.semanticFingerprint,
          terminalDispositionReason: reason,
          formedAt: releasedAt
        });
        const closed = this.#relay.transitionHeld(entry.toolCallRef, {
          action: 'CLOSE',
          checkpointRef: hold.checkpointRef,
          schedulerAuthorization: authorization,
          schedulerCapability: this.#relayCapability,
          receiptRef: `${releaseReceiptRef}.tool.${entry.toolCallRef}`,
          transitionedAt: releasedAt
        });
        if (!closed.changed) throw new Error(`scheduler terminal held close failed: ${closed.reason}`);
        continue;
      }
      this.#relay.cancel(entry.toolCallRef, {
        receiptRef: `${releaseReceiptRef}.tool.${entry.toolCallRef}`,
        closedAt: releasedAt,
        reason
      });
    }
  }

  completeActive({
    graph,
    intentRegistry,
    trustSnapshot,
    registeredProcessRefs = intentRegistry?.processRefs ?? [],
    registeredRoleRefs = [],
    completionEvidence,
    completionReceiptRef,
    releaseReceiptRef,
    completedAt
  }) {
    const aggregate = this.#state.aggregate.value;
    if (!aggregate.active) throw new Error('no active worker lease to complete');
    const admission = aggregate.queue.admissionReceipt;
    if (!graph?.semanticFingerprint || graph.semanticFingerprint !== aggregate.active.graphFingerprint ||
        completionEvidence?.workNodeRef !== aggregate.active.workNodeRef ||
        completionEvidence?.nodeFingerprint !== admission.nodeFingerprint ||
        completionEvidence?.expectedTransitionRef !== admission.expectedTransitionRef ||
        completionEvidence?.returnRouteRef !== admission.returnRouteRef) {
      throw new Error('completion evidence does not match the exact current admitted Workgraph node');
    }
    const completionVerification = this.#completionVerifier.verify({
      graph,
      runtimeTrustSnapshot: aggregate.runtimeTrust,
      schedulerInstanceRef: this.#instanceRef,
      schedulerGeneration: aggregate.active.schedulerGeneration,
      evidence: completionEvidence
    });
    const priorVerifications = aggregate.terminalReceipts.filter((item) =>
      item.schemaVersion === completionVerification.schemaVersion
    );
    for (const prior of priorVerifications) {
      if (prior.semanticFingerprint === completionVerification.semanticFingerprint) {
        throw new Error('completion verification replay is not allowed');
      }
      if (prior.verificationReceiptRef === completionVerification.verificationReceiptRef) {
        throw new Error('completion verification receipt ref conflicts with prior scheduler evidence');
      }
      const priorGateRefs = new Set(prior.gateResultReceipts.map((item) => item.gateResultRef));
      if (completionVerification.gateResultReceipts.some((item) => priorGateRefs.has(item.gateResultRef))) {
        throw new Error('completion gate evidence conflicts with prior scheduler evidence');
      }
    }
    const workgraphResult = reduceVerifiedWorkCompletion({
      graph,
      verification: completionVerification,
      actorRef: aggregate.runtimeTrust.actorRef,
      actorRoleRef: aggregate.runtimeTrust.roleRef,
      completedAt,
      receiptRef: completionReceiptRef
    }, {
      intentRegistry,
      schedulerRegistry: this.#schedulerRegistry,
      runtimeTrustSnapshot: aggregate.runtimeTrust,
      schedulerInstanceRef: this.#instanceRef,
      schedulerGeneration: aggregate.active.schedulerGeneration,
      schedulerObservedAt: aggregate.observedClock?.observedAt,
      registeredProcessRefs,
      registeredRoleRefs,
      trustSnapshot
    });
    const exact = workgraphResult.completionReceipt;
    this.#closeUnownedRelayCalls({ releaseReceiptRef, releasedAt: completedAt, reason: 'WORK_COMPLETED' });
    const transitions = this.#transitionActiveLeases({
      releaseReceiptRef,
      transitionedAt: completedAt,
      reason: 'WORK_COMPLETED',
      lifecycle: 'RELEASED'
    });
    const returnRouteReceipt = finalized({
      schemaVersion: 'vexlife.intent-return-route-receipt/v1',
      returnRouteReceiptRef: `${exact.receiptRef}.return-route`,
      completionReceiptRef: exact.receiptRef,
      completionVerificationRef: completionVerification.verificationReceiptRef,
      completionVerificationFingerprint: completionVerification.semanticFingerprint,
      completionEvidenceLineageFingerprint: workgraphResult.completionEvidenceLineage.semanticFingerprint,
      canonicalWorkgraphTransitionRef: workgraphResult.canonicalTransition.transitionRef,
      canonicalWorkgraphTransitionFingerprint: workgraphResult.canonicalTransition.semanticFingerprint,
      workNodeRef: exact.workNodeRef,
      priorGraphFingerprint: graph.semanticFingerprint,
      completedGraphFingerprint: workgraphResult.graph.semanticFingerprint,
      schedulerGeneration: aggregate.active.schedulerGeneration,
      expectedTransitionRef: admission.expectedTransitionRef,
      returnRouteRef: admission.returnRouteRef,
      state: 'RETURN_ROUTE_PRESERVED',
      completedAt
    });
    const queue = consumeAdmission(aggregate.queue, {
      state: 'COMPLETED',
      lifecycle: 'CLOSED',
      transitionedAt: completedAt,
      reason: 'WORK_COMPLETED',
      transitionedLeases: transitions.transitionedLeases
    });
    const currentRecoveryClaim = aggregate.recoveryClaims.find((item) =>
      item.state === 'RESUMED_CONSUMED' && item.workNodeRef === aggregate.active.workNodeRef &&
      item.schedulerGeneration === aggregate.active.schedulerGeneration
    ) ?? null;
    let terminalClaimTransition = null;
    if (currentRecoveryClaim) {
      const terminalTransitionBindings = {
        checkpointRef: currentRecoveryClaim.checkpointRef,
        claimReceiptRef: currentRecoveryClaim.claimReceiptRef,
        claimReceiptFingerprint: currentRecoveryClaim.claimReceiptFingerprint,
        consumptionRef: currentRecoveryClaim.consumptionRef,
        consumptionFingerprint: currentRecoveryClaim.consumptionFingerprint,
        recoveryCycleRef: currentRecoveryClaim.recoveryCycleRef,
        recoveryCycleFingerprint: currentRecoveryClaim.recoveryCycleFingerprint,
        actionReceiptFingerprint: currentRecoveryClaim.actionReceiptFingerprint,
        schedulerGeneration: aggregate.active.schedulerGeneration,
        terminalReceiptFingerprint: exact.semanticFingerprint,
        observedAt: completedAt
      };
      const schedulerTerminalEvidence = contentAddressedSchedulerEvidence({
        contractRef: 'contract.intent-scheduler.recovery-terminal-evidence/v1',
        formationRef: 'formation.intent-scheduler.recovery-terminal.v1',
        schedulerInstanceRef: this.#instanceRef,
        schedulerPriorAggregateFingerprint: aggregate.semanticFingerprint,
        recoveryClaimTransitionRef: currentRecoveryClaim.lastTransitionRef,
        recoveryClaimTransitionFingerprint: currentRecoveryClaim.lastTransitionFingerprint,
        checkpointRef: currentRecoveryClaim.checkpointRef,
        claimReceiptRef: currentRecoveryClaim.claimReceiptRef,
        claimReceiptFingerprint: currentRecoveryClaim.claimReceiptFingerprint,
        recoveryCycleRef: currentRecoveryClaim.recoveryCycleRef,
        recoveryCycleFingerprint: currentRecoveryClaim.recoveryCycleFingerprint,
        workNodeRef: aggregate.active.workNodeRef,
        schedulerGeneration: aggregate.active.schedulerGeneration,
        completionVerificationRef: completionVerification.verificationReceiptRef,
        completionVerificationFingerprint: completionVerification.semanticFingerprint,
        workgraphTransitionRef: workgraphResult.canonicalTransition.transitionRef,
        workgraphTransitionFingerprint: workgraphResult.canonicalTransition.semanticFingerprint,
        completionReceiptRef: exact.receiptRef,
        completionReceiptFingerprint: exact.semanticFingerprint,
        returnRouteReceiptRef: returnRouteReceipt.returnRouteReceiptRef,
        returnRouteReceiptFingerprint: returnRouteReceipt.semanticFingerprint,
        currentness: 'CURRENT',
        observedAt: completedAt
      }, {
        schemaVersion: 'vexlife.intent-scheduler-recovery-terminal-evidence/v1',
        refField: 'terminalEvidenceRef',
        prefix: 'evidence.intent-scheduler.recovery-terminal.'
      });
      const edgeEvidence = recoveryClaimEdgeEvidence('TERMINAL_CONSUMED', {
        ...terminalTransitionBindings,
        schedulerPriorAggregateFingerprint: aggregate.semanticFingerprint,
        schedulerTerminalEvidence
      });
      terminalClaimTransition = recoveryClaimTransition(aggregate, 'TERMINAL_CONSUMED', {
        ...terminalTransitionBindings,
        edgeEvidence
      });
    }
    this.#commit({
      type: 'COMPLETED',
      transitionRef: `transition.intent-scheduler.complete.${aggregate.generation}`,
      queue,
      transitionedLeases: transitions.transitionedLeases,
      completionVerification,
      workgraphTransition: workgraphResult.canonicalTransition,
      completionReceipt: exact,
      returnRouteReceipt,
      recoveryClaimTransition: terminalClaimTransition,
      relayLedger: this.#relay?.snapshot ?? aggregate.relayLedger,
      observedClock: observedClockReceipt(completedAt, `clock.intent-scheduler.complete.${aggregate.generation}`)
    });
    return {
      changed: true,
      state: this.#state.aggregate.value.phase,
      completionVerification: clone(completionVerification),
      completionEvidenceLineage: clone(workgraphResult.completionEvidenceLineage),
      workgraph: clone(workgraphResult.graph),
      workgraphTransitions: clone(workgraphResult.transitions),
      canonicalWorkgraphTransition: clone(workgraphResult.canonicalTransition),
      completionReceipt: clone(exact),
      dependentReadyRefs: clone(workgraphResult.dependentReadyRefs),
      parentConvergenceReadyRefs: clone(workgraphResult.parentConvergenceReadyRefs),
      returnRouteReceipt: clone(returnRouteReceipt),
      leaseTransitionReceipts: transitions.receipts,
      transitionedLeases: transitions.transitionedLeases,
      continuation: clone(this.#state.aggregate.value.continuations.at(-1) ?? null),
      relayLedger: this.#relay?.snapshot ?? null
    };
  }

  abandonRecoveryClaim(checkpointRef, {
    checkpointConsumptionReceipt,
    reasonRef,
    postDispositionCheckpointPolicy = 'TERMINALLY_HELD_WITH_EXACT_REASON',
    observedAt
  }) {
    const aggregate = this.#state.aggregate.value;
    parseCanonicalTimestamp(observedAt, 'pre-resume recovery disposition observedAt');
    const dispositionContract = this.#schedulerRegistry.runtimeRecoveryClaimContract?.preResumeDisposition;
    if (!dispositionContract?.allowedReasonRefs?.includes(reasonRef) ||
        !dispositionContract.allowedPostDispositionPolicies?.includes(postDispositionCheckpointPolicy) ||
        postDispositionCheckpointPolicy !== 'TERMINALLY_HELD_WITH_EXACT_REASON') {
      throw new Error('pre-resume recovery disposition reason or checkpoint policy is not source-managed');
    }
    const checkpoint = aggregate.checkpoints.find((item) => item.checkpointRef === checkpointRef);
    const currentRecoveryClaim = aggregate.recoveryClaims.find((item) =>
      item.checkpointRef === checkpointRef && item.state === 'CLAIMED_CURRENT' && item.currentness === 'CURRENT'
    ) ?? null;
    if (aggregate.phase !== 'PAUSED' || aggregate.active || !checkpoint ||
        checkpoint.currentState !== 'PAUSED_AT_CHECKPOINT' || !currentRecoveryClaim) {
      throw new Error('pre-resume recovery disposition requires the exact current paused claim');
    }
    const consumption = clone(checkpointConsumptionReceipt);
    if (!consumption || consumption.schemaVersion !== 'vexlife.intent-scheduler-recovery-checkpoint-consumption/v1' ||
        !consumption.semanticFingerprint) {
      throw new Error('pre-resume recovery disposition requires the exact checkpoint consumption receipt');
    }
    const consumptionCandidate = clone(consumption);
    delete consumptionCandidate.semanticFingerprint;
    if (semanticHash(consumptionCandidate) !== consumption.semanticFingerprint ||
        consumption.semanticFingerprint !== currentRecoveryClaim.consumptionFingerprint ||
        consumption.consumptionRef !== currentRecoveryClaim.consumptionRef ||
        consumption.checkpointRef !== checkpointRef ||
        consumption.checkpointFingerprint !== checkpoint.semanticFingerprint ||
        consumption.schedulerAggregateFingerprint !== currentRecoveryClaim.schedulerPriorAggregateFingerprint ||
        Date.parse(observedAt) <= Date.parse(currentRecoveryClaim.lastObservedAt)) {
      throw new Error('pre-resume recovery disposition is stale, substituted, or detached');
    }
    const schedulerDispositionReceipt = contentAddressedSchedulerEvidence({
      contractRef: 'contract.intent-scheduler.recovery-claim-disposition/v1',
      formationRef: 'formation.intent-scheduler.recovery-pre-resume-disposition.v1',
      disposition: 'ABANDONED_BEFORE_RESUME',
      schedulerInstanceRef: this.#instanceRef,
      schedulerAggregateFingerprint: aggregate.semanticFingerprint,
      schedulerPhase: aggregate.phase,
      claimTransitionRef: currentRecoveryClaim.lastTransitionRef,
      claimTransitionFingerprint: currentRecoveryClaim.lastTransitionFingerprint,
      claimReceiptRef: currentRecoveryClaim.claimReceiptRef,
      claimReceiptFingerprint: currentRecoveryClaim.claimReceiptFingerprint,
      consumptionRef: currentRecoveryClaim.consumptionRef,
      consumptionFingerprint: currentRecoveryClaim.consumptionFingerprint,
      checkpointRef,
      checkpointFingerprint: checkpoint.semanticFingerprint,
      checkpointCurrentState: checkpoint.currentState,
      recoveryAggregateRef: currentRecoveryClaim.recoveryAggregateRef,
      recoveryAggregateFingerprint: currentRecoveryClaim.recoveryAggregateFingerprint,
      recoveryCycleRef: currentRecoveryClaim.recoveryCycleRef,
      recoveryCycleFingerprint: currentRecoveryClaim.recoveryCycleFingerprint,
      failureRef: currentRecoveryClaim.failureRef,
      failureFingerprint: currentRecoveryClaim.failureFingerprint,
      workNodeRef: currentRecoveryClaim.workNodeRef,
      sourceStateFingerprint: currentRecoveryClaim.sourceStateFingerprint,
      schedulerGeneration: currentRecoveryClaim.schedulerGeneration,
      reasonRef,
      postDispositionCheckpointPolicy,
      oldActivationReusable: false,
      oldReleaseSetReusable: false,
      currentness: 'CURRENT',
      observedAt
    }, {
      schemaVersion: 'vexlife.intent-scheduler-recovery-claim-disposition/v1',
      refField: 'dispositionReceiptRef',
      prefix: 'receipt.intent-scheduler.recovery-claim-disposition.'
    });
    const dispositionTransitionBindings = {
      checkpointRef,
      claimReceiptRef: currentRecoveryClaim.claimReceiptRef,
      claimReceiptFingerprint: currentRecoveryClaim.claimReceiptFingerprint,
      consumptionRef: currentRecoveryClaim.consumptionRef,
      consumptionFingerprint: currentRecoveryClaim.consumptionFingerprint,
      recoveryCycleRef: currentRecoveryClaim.recoveryCycleRef,
      recoveryCycleFingerprint: currentRecoveryClaim.recoveryCycleFingerprint,
      schedulerGeneration: currentRecoveryClaim.schedulerGeneration,
      reasonRef,
      postDispositionCheckpointPolicy,
      dispositionReceiptRef: schedulerDispositionReceipt.dispositionReceiptRef,
      dispositionReceiptFingerprint: schedulerDispositionReceipt.semanticFingerprint,
      observedAt
    };
    const edgeEvidence = recoveryClaimEdgeEvidence('INVALIDATED_OR_ABANDONED', {
      ...dispositionTransitionBindings,
      schedulerPriorAggregateFingerprint: aggregate.semanticFingerprint,
      schedulerDispositionReceipt
    });
    const transition = recoveryClaimTransition(aggregate, 'INVALIDATED_OR_ABANDONED', {
      ...dispositionTransitionBindings,
      edgeEvidence
    });
    this.#commit({
      type: 'RECOVERY_CLAIM_DISPOSED',
      transitionRef: transition.transitionRef,
      checkpointRef,
      workNodeRef: currentRecoveryClaim.workNodeRef,
      reasonRef,
      recoveryDispositionReceipt: schedulerDispositionReceipt,
      recoveryClaimTransition: transition
    });
    return {
      changed: true,
      state: 'INVALIDATED_OR_ABANDONED',
      checkpointState: 'RECOVERY_TERMINALLY_HELD',
      dispositionReceipt: clone(schedulerDispositionReceipt),
      recoveryClaimTransition: clone(transition)
    };
  }

  cancelActive({ releaseReceiptRef, releasedAt, reason = 'CANCELLED_BY_CALLER' }) {
    const aggregate = this.#state.aggregate.value;
    if (!aggregate.active) return { changed: false, reason: 'NO_ACTIVE_WORK' };
    this.#closeUnownedRelayCalls({ releaseReceiptRef, releasedAt, reason });
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
    const currentRecoveryClaim = aggregate.recoveryClaims.find((item) =>
      item.state === 'RESUMED_CONSUMED' && item.workNodeRef === active.workNodeRef &&
      item.schedulerGeneration === active.schedulerGeneration
    ) ?? null;
    let abandonedClaimTransition = null;
    if (currentRecoveryClaim) {
      const checkpoint = aggregate.checkpoints.find((item) => item.checkpointRef === currentRecoveryClaim.checkpointRef);
      const reasonRef = 'reason.intent-scheduler.recovery.active-cancelled';
      const schedulerDispositionReceipt = contentAddressedSchedulerEvidence({
        contractRef: 'contract.intent-scheduler.recovery-claim-disposition/v1',
        formationRef: 'formation.intent-scheduler.recovery-active-cancellation.v1',
        disposition: 'ABANDONED_AFTER_RESUME',
        schedulerInstanceRef: this.#instanceRef,
        schedulerAggregateFingerprint: aggregate.semanticFingerprint,
        claimTransitionRef: currentRecoveryClaim.lastTransitionRef,
        claimTransitionFingerprint: currentRecoveryClaim.lastTransitionFingerprint,
        claimReceiptRef: currentRecoveryClaim.claimReceiptRef,
        claimReceiptFingerprint: currentRecoveryClaim.claimReceiptFingerprint,
        checkpointRef: currentRecoveryClaim.checkpointRef,
        checkpointFingerprint: currentRecoveryClaim.checkpointFingerprint,
        checkpointCurrentState: checkpoint?.currentState ?? null,
        recoveryAggregateRef: currentRecoveryClaim.recoveryAggregateRef,
        recoveryAggregateFingerprint: currentRecoveryClaim.recoveryAggregateFingerprint,
        recoveryCycleRef: currentRecoveryClaim.recoveryCycleRef,
        recoveryCycleFingerprint: currentRecoveryClaim.recoveryCycleFingerprint,
        failureRef: currentRecoveryClaim.failureRef,
        failureFingerprint: currentRecoveryClaim.failureFingerprint,
        workNodeRef: currentRecoveryClaim.workNodeRef,
        schedulerGeneration: active.schedulerGeneration,
        reasonRef,
        cancellationReason: reason,
        cancellationReceipt,
        postDispositionCheckpointPolicy: 'TERMINALLY_HELD_WITH_EXACT_REASON',
        currentness: 'CURRENT',
        observedAt: releasedAt
      }, {
        schemaVersion: 'vexlife.intent-scheduler-recovery-claim-disposition/v1',
        refField: 'dispositionReceiptRef',
        prefix: 'receipt.intent-scheduler.recovery-claim-disposition.'
      });
      const abandonedTransitionBindings = {
        checkpointRef: currentRecoveryClaim.checkpointRef,
        claimReceiptRef: currentRecoveryClaim.claimReceiptRef,
        claimReceiptFingerprint: currentRecoveryClaim.claimReceiptFingerprint,
        consumptionRef: currentRecoveryClaim.consumptionRef,
        consumptionFingerprint: currentRecoveryClaim.consumptionFingerprint,
        recoveryCycleRef: currentRecoveryClaim.recoveryCycleRef,
        recoveryCycleFingerprint: currentRecoveryClaim.recoveryCycleFingerprint,
        actionReceiptFingerprint: currentRecoveryClaim.actionReceiptFingerprint,
        schedulerGeneration: active.schedulerGeneration,
        reasonRef,
        postDispositionCheckpointPolicy: schedulerDispositionReceipt.postDispositionCheckpointPolicy,
        dispositionReceiptRef: schedulerDispositionReceipt.dispositionReceiptRef,
        dispositionReceiptFingerprint: schedulerDispositionReceipt.semanticFingerprint,
        observedAt: releasedAt
      };
      const edgeEvidence = recoveryClaimEdgeEvidence('INVALIDATED_OR_ABANDONED', {
        ...abandonedTransitionBindings,
        schedulerPriorAggregateFingerprint: aggregate.semanticFingerprint,
        schedulerDispositionReceipt
      });
      abandonedClaimTransition = recoveryClaimTransition(aggregate, 'INVALIDATED_OR_ABANDONED', {
        ...abandonedTransitionBindings,
        edgeEvidence
      });
    }
    this.#commit({
      type: 'CANCELLED',
      transitionRef: `transition.intent-scheduler.cancel.${aggregate.generation}`,
      queue,
      transitionedLeases: transitions.transitionedLeases,
      recoveryClaimTransition: abandonedClaimTransition,
      relayLedger: this.#relay?.snapshot ?? aggregate.relayLedger,
      observedClock: observedClockReceipt(releasedAt, `clock.intent-scheduler.cancel.${aggregate.generation}`)
    });
    return {
      changed: true,
      cancellationReceipt,
      leaseTransitionReceipts: transitions.receipts,
      transitionedLeases: transitions.transitionedLeases,
      relayLedger: this.#relay?.snapshot ?? null,
      continuation: clone(this.#state.aggregate.value.continuations.at(-1) ?? null)
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
