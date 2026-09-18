import {
  appendReceipt,
  createIntentReceipt,
  recordIntentTransition
} from './intent-workgraph.mjs';
import { validateIntentWorkgraph } from './intent-validation.mjs';
import {
  assertActiveInterval,
  assertSourceHash,
  INTENT_SCHEDULER_REQUIRED_FIELD_SETS,
  parseCanonicalTimestamp
} from './scheduler-runtime-trust.mjs';
import { semanticHash } from './utils.mjs';

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function requireFields(value, fields, label) {
  const missing = fields.filter((field) => value?.[field] === undefined || value?.[field] === null || value?.[field] === '');
  if (missing.length) throw new Error(`${label} missing required fields: ${missing.join(', ')}`);
}

function assertCanonical(value, label) {
  if (!value?.semanticFingerprint) throw new Error(`${label} requires a semantic fingerprint`);
  const semantic = clone(value);
  delete semantic.semanticFingerprint;
  if (semanticHash(semantic) !== value.semanticFingerprint) throw new Error(`${label} semantic fingerprint mismatch`);
}

export function validateCompletionVerifierContract(schedulerRegistry) {
  const contract = schedulerRegistry?.completionVerifierContract;
  if (!contract || contract.contractRef !== 'contract.intent-scheduler.completion-verifier-currentness') {
    throw new Error('completion verifier contract is not registered');
  }
  if (contract.evidenceClass !== 'DETERMINISTIC_FAKE_EXTERNAL_VERIFIER' ||
      contract.selfCertificationAllowed !== false ||
      contract.activeWindowRule !== 'formedAt <= observedAt < expiresAt' ||
      contract.consumptionWindowRule !==
        'formedAt <= observedAt <= consumedAt < expiresAt AND consumedAt >= schedulerObservedAt' ||
      contract.canonicalWorkgraphLineageRule !==
        'transition and Intent receipt bind exact verification receipt/fingerprint plus every gate-result/source-observation ref/hash') {
    throw new Error('completion verifier contract is not bounded deterministic external evidence');
  }
  if (contract.sourceDescriptor?.sourceRef !== contract.sourceRef ||
      semanticHash(contract.sourceDescriptor) !== contract.sourceHash) {
    throw new Error('completion verifier source identity or hash mismatch');
  }
  assertSourceHash(contract.sourceHash, 'completion verifier sourceHash');
  return freeze(clone(contract));
}

function canonicalGateResult(input, bindings, contract) {
  requireFields(input, [
    'gateResultRef',
    'completionGateRef',
    'sourceObservationRef',
    'sourceObservationHash',
    'observedBeforeState',
    'observedAfterState',
    'result'
  ], 'completion gate observation');
  assertSourceHash(input.sourceObservationHash, 'completion gate sourceObservationHash');
  if (input.result !== 'PASSED') throw new Error('completion gate result must be PASSED');
  if (input.observedBeforeState !== bindings.observedBeforeState ||
      input.observedAfterState !== 'COMPLETED' ||
      input.observedBeforeState === input.observedAfterState) {
    throw new Error('completion gate evidence must prove an observed state change to COMPLETED');
  }
  const receipt = {
    schemaVersion: 'vexlife.intent-completion-gate-result/v1',
    gateResultRef: input.gateResultRef,
    completionGateRef: input.completionGateRef,
    result: 'PASSED',
    currentness: 'CURRENT',
    verifierRef: contract.verifierRef,
    verifierSourceRef: contract.sourceRef,
    verifierSourceHash: contract.sourceHash,
    formationRef: contract.formationRef,
    sourceObservationRef: input.sourceObservationRef,
    sourceObservationHash: input.sourceObservationHash,
    workNodeRef: bindings.workNodeRef,
    nodeFingerprint: bindings.nodeFingerprint,
    graphRef: bindings.graphRef,
    graphFingerprint: bindings.graphFingerprint,
    runtimeSnapshotFingerprint: bindings.runtimeSnapshotFingerprint,
    schedulerInstanceRef: bindings.schedulerInstanceRef,
    schedulerGeneration: bindings.schedulerGeneration,
    expectedTransitionRef: bindings.expectedTransitionRef,
    returnRouteRef: bindings.returnRouteRef,
    observedBeforeState: input.observedBeforeState,
    observedAfterState: input.observedAfterState,
    formedAt: bindings.formedAt,
    observedAt: bindings.observedAt,
    expiresAt: bindings.expiresAt,
    selfCertified: false
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  return freeze(receipt);
}

export class DeterministicFakeCompletionVerifier {
  #contract;

  constructor({ schedulerRegistry }) {
    this.#contract = validateCompletionVerifierContract(schedulerRegistry);
  }

  get identity() {
    return clone(this.#contract);
  }

  verify({ graph, runtimeTrustSnapshot, schedulerInstanceRef, schedulerGeneration, evidence }) {
    if (!graph?.semanticFingerprint || !runtimeTrustSnapshot?.semanticFingerprint || !evidence) {
      throw new Error('completion verification requires exact graph, runtime and external evidence');
    }
    if (evidence.selfCertified === true || evidence.state === 'COMPLETED') {
      throw new Error('completion evidence cannot be self-certified or caller-declared COMPLETED state');
    }
    const node = graph.nodes.find((item) => item.workNodeRef === evidence.workNodeRef);
    if (!node) throw new Error('completion evidence references an unknown work node');
    if (node.semanticFingerprint !== evidence.nodeFingerprint) throw new Error('completion evidence node fingerprint mismatch');
    if (graph.graphRef !== evidence.graphRef || graph.semanticFingerprint !== evidence.graphFingerprint) {
      throw new Error('completion evidence graph binding mismatch');
    }
    if (runtimeTrustSnapshot.semanticFingerprint !== evidence.runtimeSnapshotFingerprint ||
        runtimeTrustSnapshot.schedulerGeneration !== schedulerGeneration) {
      throw new Error('completion evidence runtime binding mismatch');
    }
    if (evidence.schedulerInstanceRef !== schedulerInstanceRef || evidence.schedulerGeneration !== schedulerGeneration) {
      throw new Error('completion evidence scheduler binding mismatch');
    }
    if (node.expectedTransitionRef !== evidence.expectedTransitionRef || node.returnRouteRef !== evidence.returnRouteRef) {
      throw new Error('completion evidence transition or return route mismatch');
    }
    assertActiveInterval(evidence, 'completion evidence');
    if (evidence.observedBeforeState !== node.state || evidence.observedAfterState !== 'COMPLETED' ||
        evidence.observedBeforeState === evidence.observedAfterState) {
      throw new Error('completion evidence does not prove a changed authoritative Workgraph state');
    }
    const requiredGates = [...node.completionGateRefs].sort();
    const observations = [...(evidence.gateObservations ?? [])];
    const observedGates = observations.map((item) => item.completionGateRef).sort();
    if (JSON.stringify(observedGates) !== JSON.stringify(requiredGates)) {
      throw new Error('completion evidence does not exactly cover current completion gates');
    }
    if (new Set(observations.map((item) => item.gateResultRef)).size !== observations.length) {
      throw new Error('completion evidence contains duplicate gate result refs');
    }
    const bindings = {
      workNodeRef: node.workNodeRef,
      nodeFingerprint: node.semanticFingerprint,
      graphRef: graph.graphRef,
      graphFingerprint: graph.semanticFingerprint,
      runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
      schedulerInstanceRef,
      schedulerGeneration,
      expectedTransitionRef: node.expectedTransitionRef,
      returnRouteRef: node.returnRouteRef,
      observedBeforeState: node.state,
      formedAt: evidence.formedAt,
      observedAt: evidence.observedAt,
      expiresAt: evidence.expiresAt
    };
    const gateResultReceipts = observations.map((item) => canonicalGateResult(item, bindings, this.#contract))
      .sort((left, right) => left.completionGateRef.localeCompare(right.completionGateRef));
    const receipt = {
      schemaVersion: 'vexlife.intent-completion-verification/v1',
      verificationReceiptRef: evidence.verificationReceiptRef,
      contractRef: this.#contract.contractRef,
      verifierRef: this.#contract.verifierRef,
      verifierSourceRef: this.#contract.sourceRef,
      verifierSourceHash: this.#contract.sourceHash,
      formationRef: this.#contract.formationRef,
      workNodeRef: node.workNodeRef,
      nodeFingerprint: node.semanticFingerprint,
      graphRef: graph.graphRef,
      graphFingerprint: graph.semanticFingerprint,
      runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
      schedulerInstanceRef,
      schedulerGeneration,
      expectedTransitionRef: node.expectedTransitionRef,
      completionGateRefs: requiredGates,
      gateResultReceipts,
      observedBeforeState: node.state,
      observedAfterState: 'COMPLETED',
      returnRouteRef: node.returnRouteRef,
      formedAt: evidence.formedAt,
      observedAt: evidence.observedAt,
      expiresAt: evidence.expiresAt,
      currentness: 'CURRENT',
      selfCertified: false
    };
    requireFields(receipt, INTENT_SCHEDULER_REQUIRED_FIELD_SETS.completionVerificationRequiredFields
      .filter((field) => field !== 'semanticFingerprint'), 'completion verification receipt');
    receipt.semanticFingerprint = semanticHash(receipt);
    return freeze(receipt);
  }
}

export function assertCanonicalCompletionVerification(verification, {
  graph,
  runtimeTrustSnapshot,
  schedulerInstanceRef,
  schedulerGeneration,
  schedulerRegistry,
  consumedAt = null,
  schedulerObservedAt = null
}) {
  const contract = validateCompletionVerifierContract(schedulerRegistry);
  requireFields(verification, INTENT_SCHEDULER_REQUIRED_FIELD_SETS.completionVerificationRequiredFields,
    'completion verification receipt');
  assertCanonical(verification, 'completion verification receipt');
  assertActiveInterval(verification, 'completion verification receipt');
  if (verification.selfCertified !== false || verification.currentness !== 'CURRENT' ||
      verification.contractRef !== contract.contractRef || verification.verifierRef !== contract.verifierRef ||
      verification.verifierSourceRef !== contract.sourceRef || verification.verifierSourceHash !== contract.sourceHash ||
      verification.formationRef !== contract.formationRef) {
    throw new Error('completion verification does not bind the registered external verifier');
  }
  if (verification.graphRef !== graph.graphRef || verification.graphFingerprint !== graph.semanticFingerprint ||
      verification.runtimeSnapshotFingerprint !== runtimeTrustSnapshot.semanticFingerprint ||
      verification.schedulerInstanceRef !== schedulerInstanceRef ||
      verification.schedulerGeneration !== schedulerGeneration) {
    throw new Error('completion verification current graph/runtime/scheduler binding mismatch');
  }
  const node = graph.nodes.find((item) => item.workNodeRef === verification.workNodeRef);
  if (!node || node.semanticFingerprint !== verification.nodeFingerprint ||
      node.expectedTransitionRef !== verification.expectedTransitionRef ||
      node.returnRouteRef !== verification.returnRouteRef ||
      node.state !== verification.observedBeforeState || verification.observedAfterState !== 'COMPLETED' ||
      verification.observedBeforeState === verification.observedAfterState) {
    throw new Error('completion verification node transition binding mismatch');
  }
  const requiredGates = [...node.completionGateRefs].sort();
  if (JSON.stringify(verification.completionGateRefs) !== JSON.stringify(requiredGates) ||
      verification.gateResultReceipts.length !== requiredGates.length) {
    throw new Error('completion verification gate coverage mismatch');
  }
  const gateRefs = new Set();
  const resultRefs = new Set();
  for (const gate of verification.gateResultReceipts) {
    assertCanonical(gate, 'completion gate result receipt');
    if (gateRefs.has(gate.completionGateRef) || resultRefs.has(gate.gateResultRef)) {
      throw new Error('completion verification contains duplicate or conflicting gate evidence');
    }
    gateRefs.add(gate.completionGateRef);
    resultRefs.add(gate.gateResultRef);
    for (const [field, expected] of Object.entries({
      verifierRef: contract.verifierRef,
      verifierSourceRef: contract.sourceRef,
      verifierSourceHash: contract.sourceHash,
      formationRef: contract.formationRef,
      workNodeRef: node.workNodeRef,
      nodeFingerprint: node.semanticFingerprint,
      graphRef: graph.graphRef,
      graphFingerprint: graph.semanticFingerprint,
      runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
      schedulerInstanceRef,
      schedulerGeneration,
      expectedTransitionRef: node.expectedTransitionRef,
      returnRouteRef: node.returnRouteRef,
      observedBeforeState: node.state,
      observedAfterState: 'COMPLETED',
      formedAt: verification.formedAt,
      observedAt: verification.observedAt,
      expiresAt: verification.expiresAt,
      currentness: 'CURRENT',
      result: 'PASSED',
      selfCertified: false
    })) if (gate[field] !== expected) throw new Error(`completion gate result ${field} mismatch`);
  }
  if (JSON.stringify([...gateRefs].sort()) !== JSON.stringify(requiredGates)) {
    throw new Error('completion verification references a wrong or stale gate');
  }
  if (consumedAt !== null) {
    const consumed = parseCanonicalTimestamp(consumedAt, 'completion verification consumedAt');
    const observed = parseCanonicalTimestamp(verification.observedAt, 'completion verification observedAt');
    const expires = parseCanonicalTimestamp(verification.expiresAt, 'completion verification expiresAt');
    if (consumed < observed) throw new Error('completion cannot precede verification observation');
    if (consumed >= expires) throw new Error('completion verification expired before consumption');
    if (schedulerObservedAt === null) {
      throw new Error('completion consumption requires the canonical scheduler observed clock');
    }
    const schedulerObserved = parseCanonicalTimestamp(schedulerObservedAt, 'scheduler observed clock');
    if (consumed < schedulerObserved) {
      throw new Error('completion cannot precede the canonical scheduler observed clock');
    }
  }
  return freeze(clone(verification));
}

function completionEvidenceLineage(verification) {
  const gateEvidence = verification.gateResultReceipts.map((gate) => ({
    completionGateRef: gate.completionGateRef,
    gateResultRef: gate.gateResultRef,
    gateResultFingerprint: gate.semanticFingerprint,
    sourceObservationRef: gate.sourceObservationRef,
    sourceObservationHash: gate.sourceObservationHash
  })).sort((left, right) => left.completionGateRef.localeCompare(right.completionGateRef));
  const lineage = {
    schemaVersion: 'vexlife.intent-completion-evidence-lineage/v1',
    verificationReceiptRef: verification.verificationReceiptRef,
    verificationFingerprint: verification.semanticFingerprint,
    gateEvidence
  };
  lineage.semanticFingerprint = semanticHash(lineage);
  return freeze(lineage);
}

function assertUnusedCompletionEvidence(graph, lineage) {
  const prior = [...graph.transitions, ...graph.receipts]
    .map((item) => item.completionEvidenceLineage)
    .filter(Boolean);
  for (const existing of prior) {
    if (existing.verificationReceiptRef === lineage.verificationReceiptRef) {
      if (existing.verificationFingerprint === lineage.verificationFingerprint) {
        throw new Error('completion verification evidence has already been consumed');
      }
      throw new Error('completion verification receipt ref conflicts with prior Workgraph evidence');
    }
    if (existing.verificationFingerprint === lineage.verificationFingerprint) {
      throw new Error('completion verification fingerprint replay is not allowed');
    }
    const existingGateRefs = new Set((existing.gateEvidence ?? []).map((item) => item.gateResultRef));
    if (lineage.gateEvidence.some((item) => existingGateRefs.has(item.gateResultRef))) {
      throw new Error('completion gate evidence conflicts with prior Workgraph evidence');
    }
  }
}

function exactTerminalReceipt(graph, node) {
  return graph.receipts.some((receipt) => receipt.currentness === 'CURRENT' &&
    receipt.workNodeRef === node.workNodeRef && receipt.expectedTransitionRef === node.expectedTransitionRef &&
    receipt.nodeSemanticFingerprint === node.semanticFingerprint && receipt.sourceState === node.state &&
    receipt.disposition === node.state && receipt.state === 'PROVEN');
}

export function reduceVerifiedWorkCompletion({
  graph,
  verification,
  actorRef,
  actorRoleRef,
  processRef = 'process.vexlife.intent.verify-transition',
  completedAt,
  receiptRef
}, {
  intentRegistry,
  schedulerRegistry,
  runtimeTrustSnapshot,
  schedulerInstanceRef,
  schedulerGeneration,
  schedulerObservedAt,
  registeredProcessRefs = intentRegistry?.processRefs ?? [],
  registeredRoleRefs = [],
  trustSnapshot = null
}) {
  const canonicalVerification = assertCanonicalCompletionVerification(verification, {
    graph,
    runtimeTrustSnapshot,
    schedulerInstanceRef,
    schedulerGeneration,
    schedulerRegistry,
    consumedAt: completedAt,
    schedulerObservedAt
  });
  const evidenceLineage = completionEvidenceLineage(canonicalVerification);
  assertUnusedCompletionEvidence(graph, evidenceLineage);
  const evidenceSourceRefs = [
    evidenceLineage.verificationReceiptRef,
    ...evidenceLineage.gateEvidence.flatMap((item) => [item.gateResultRef, item.sourceObservationRef])
  ];
  const evidenceSourceHashes = [
    evidenceLineage.verificationFingerprint,
    ...evidenceLineage.gateEvidence.flatMap((item) => [item.gateResultFingerprint, item.sourceObservationHash])
  ];
  const node = graph.nodes.find((item) => item.workNodeRef === canonicalVerification.workNodeRef);
  let current = graph;
  const transitions = [];
  const route = node.state === 'VERIFYING' ? ['COMPLETED'] :
    node.state === 'RUNNING' ? ['VERIFYING', 'COMPLETED'] : ['RUNNING', 'VERIFYING', 'COMPLETED'];
  for (const [index, nextState] of route.entries()) {
    const priorState = current.nodes.find((item) => item.workNodeRef === node.workNodeRef).state;
    const final = nextState === 'COMPLETED';
    const transitionRef = final ? node.expectedTransitionRef : `${node.expectedTransitionRef}.${nextState.toLowerCase()}`;
    const result = recordIntentTransition(current, {
      transitionRef,
      workNodeRef: node.workNodeRef,
      priorState,
      nextState,
      reason: final ? 'EXTERNAL_COMPLETION_VERIFIED' : 'SCHEDULER_COMPLETION_REDUCTION',
      actorRef,
      actorRoleRef,
      processRef,
      sourceRefs: evidenceSourceRefs,
      completionEvidenceLineage: clone(evidenceLineage),
      createdAt: completedAt
    }, intentRegistry);
    if (!result.changed) throw new Error('completion reducer produced a duplicate canonical transition');
    current = result.graph;
    transitions.push(result.transition);
  }
  const finalTransition = transitions.at(-1);
  const completionReceipt = createIntentReceipt({
    receiptRef,
    workNodeRef: node.workNodeRef,
    expectedTransitionRef: finalTransition.transitionRef,
    nodeSemanticFingerprint: node.semanticFingerprint,
    disposition: 'COMPLETED',
    sourceState: 'COMPLETED',
    state: 'PROVEN',
    currentness: 'CURRENT',
    sourceRefs: evidenceSourceRefs,
    sourceHashes: evidenceSourceHashes,
    completionEvidenceLineage: clone(evidenceLineage),
    formedAt: completedAt,
    formationRef: canonicalVerification.formationRef
  }, intentRegistry);
  const appended = appendReceipt(current, completionReceipt, intentRegistry);
  if (!appended.changed) throw new Error('completion reducer rejected duplicate canonical Intent receipt');
  current = appended.graph;
  const validation = validateIntentWorkgraph(current, {
    registry: intentRegistry,
    registeredProcessRefs,
    registeredRoleRefs,
    trustSnapshot
  });
  if (!validation.ok) throw new Error(`completed Workgraph is invalid: ${validation.errors.join(', ')}`);
  const dependentReadyRefs = validation.sets.ready.filter((ref) =>
    current.nodes.find((item) => item.workNodeRef === ref)?.dependencyRefs.includes(node.workNodeRef)
  );
  const parentConvergenceReadyRefs = current.nodes.filter((parent) =>
    parent.childRefs?.includes(node.workNodeRef) && parent.childRefs.every((childRef) => {
      const child = current.nodes.find((item) => item.workNodeRef === childRef);
      return child && ['COMPLETED', 'CONVERGED', 'CLOSED', 'CANCELLED', 'SUPERSEDED'].includes(child.state) &&
        exactTerminalReceipt(current, child);
    })
  ).map((item) => item.workNodeRef).sort();
  return freeze({
    graph: current,
    transitions,
    canonicalTransition: finalTransition,
    completionReceipt,
    completionEvidenceLineage: evidenceLineage,
    dependentReadyRefs,
    parentConvergenceReadyRefs,
    validation
  });
}

// [VXG RealForever]
