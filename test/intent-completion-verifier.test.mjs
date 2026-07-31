import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  DeterministicFakeCompletionVerifier,
  assertCanonicalCompletionVerification,
  reduceVerifiedWorkCompletion
} from '../src/core/intent-completion-verifier.mjs';
import {
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { validateIntentWorkgraph } from '../src/core/intent-validation.mjs';
import { ToolResultRelay } from '../src/core/tool-result-relay.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const intentRegistry = bundle.intentRegistry;
const schedulerRegistry = bundle.schedulerRegistry;
const registeredProcessRefs = bundle.factory.processes.map((item) => item.processRef);
const registeredRoleRefs = bundle.blueprint.roles.map((item) => item.roleRef);
const FORMED = '2026-07-31T00:00:00.000Z';
const OBSERVED = '2026-07-31T00:10:00.000Z';
const EXPIRES = '2026-07-31T01:00:00.000Z';

function envelope() {
  return createIntentEnvelope({
    intentRef: 'intent.completion-verifier.test',
    originMessageRef: 'message.completion-verifier.test',
    originSpeakerRef: 'person.test.human',
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.test',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Verify source-managed completion' },
    constraints: [],
    createdAt: FORMED,
    sourceLineageRef: 'lineage.completion-verifier.test'
  }, intentRegistry);
}

function node(workNodeRef, overrides = {}) {
  return createWorkNode({
    workNodeRef,
    rootIntentRef: 'intent.completion-verifier.test',
    parentWorkNodeRef: null,
    purpose: `Purpose ${workNodeRef}`,
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.developer',
    priorityClass: 'NORMAL',
    contextPlanRef: null,
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.${workNodeRef}`,
    effectEnvelopeRef: `effect-envelope.${workNodeRef}`,
    resourceEnvelopeRef: `resource-envelope.${workNodeRef}`,
    expectedTransitionRef: `expected-transition.${workNodeRef}`,
    completionGateRefs: [`completion-gate.${workNodeRef}`],
    returnRouteRef: `return-route.${workNodeRef}`,
    sourceRefs: [`source.${workNodeRef}`],
    createdAt: FORMED,
    ...overrides
  }, intentRegistry);
}

function transitionPath(targetState) {
  const queue = [['CAPTURED', []]];
  const visited = new Set(['CAPTURED']);
  while (queue.length) {
    const [state, pathStates] = queue.shift();
    for (const nextState of intentRegistry.allowedTransitions[state] ?? []) {
      if (visited.has(nextState)) continue;
      const nextPath = [...pathStates, nextState];
      if (nextState === targetState) return nextPath;
      visited.add(nextState);
      queue.push([nextState, nextPath]);
    }
  }
  throw new Error(`no formation route to ${targetState}`);
}

function graphFixture() {
  const main = node('work.completion.main', { parentWorkNodeRef: 'work.completion.parent' });
  const dependent = node('work.completion.dependent', { dependencyRefs: [main.workNodeRef] });
  const parent = node('work.completion.parent', {
    state: 'WAITING_DEPENDENCIES',
    childRefs: [main.workNodeRef]
  });
  const nodes = [main, dependent, parent];
  const transitions = nodes.flatMap((item) => {
    let priorState = 'CAPTURED';
    return transitionPath(item.state).map((nextState, sequence) => {
      const transition = {
        transitionRef: `transition.formation.${item.workNodeRef}.${sequence}`,
        workNodeRef: item.workNodeRef,
        sequence,
        priorState,
        nextState,
        reason: 'source-managed completion fixture',
        actorRef: 'vex.test',
        actorRoleRef: 'role.vex.developer',
        processRef: 'process.vexlife.intent.verify-transition',
        sourceRefs: [`source.${item.workNodeRef}`],
        createdAt: `2026-07-31T00:00:0${sequence}.000Z`
      };
      priorState = nextState;
      return transition;
    });
  });
  const bindingRefs = Object.fromEntries(intentRegistry.bindingFields.map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => Array.isArray(item[field]) ? item[field] : [item[field]]).filter(Boolean))].sort()
  ]));
  const graph = createIntentWorkgraph({
    graphRef: 'intent-workgraph.completion-verifier.test',
    intent: envelope(),
    nodes,
    transitions,
    receipts: [],
    bindingRefs,
    createdAt: FORMED
  }, intentRegistry);
  const trustSnapshot = createIntentTrustSnapshot({
    schemaVersion: 'vexlife.intent-trust-snapshot/v0',
    snapshotRef: 'trust-snapshot.completion-verifier.test',
    sourceRef: 'test/intent-completion-verifier.test.mjs#trust',
    formationRef: 'formation.completion-verifier.trust',
    formedAt: FORMED,
    currentness: 'CURRENT',
    bindingRefs,
    actorRefs: ['vex.test'],
    decisionRefs: [],
    authorizationBindings: []
  }, intentRegistry);
  return { graph, main, dependent, parent, trustSnapshot };
}

function completionEvidence(graph, main, overrides = {}) {
  return {
    verificationReceiptRef: 'verification.completion-verifier.test',
    workNodeRef: main.workNodeRef,
    nodeFingerprint: main.semanticFingerprint,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    runtimeSnapshotFingerprint: 'b'.repeat(64),
    schedulerInstanceRef: 'instance.completion-verifier.test',
    schedulerGeneration: 2,
    expectedTransitionRef: main.expectedTransitionRef,
    gateObservations: main.completionGateRefs.map((completionGateRef) => ({
      gateResultRef: `gate-result.${completionGateRef}`,
      completionGateRef,
      sourceObservationRef: `source-observation.${completionGateRef}`,
      sourceObservationHash: semanticHash({ completionGateRef, state: 'COMPLETED' }),
      observedBeforeState: main.state,
      observedAfterState: 'COMPLETED',
      result: 'PASSED'
    })),
    observedBeforeState: main.state,
    observedAfterState: 'COMPLETED',
    returnRouteRef: main.returnRouteRef,
    formedAt: FORMED,
    observedAt: OBSERVED,
    expiresAt: EXPIRES,
    selfCertified: false,
    ...overrides
  };
}

test('S23 external completion verifier rejects self-certification, unchanged state, stale gates and conflicting evidence', () => {
  const { graph, main } = graphFixture();
  const runtimeTrustSnapshot = { semanticFingerprint: 'b'.repeat(64), schedulerGeneration: 2 };
  const verifier = new DeterministicFakeCompletionVerifier({ schedulerRegistry });
  const verify = (evidence) => verifier.verify({
    graph,
    runtimeTrustSnapshot,
    schedulerInstanceRef: 'instance.completion-verifier.test',
    schedulerGeneration: 2,
    evidence
  });
  assert.throws(() => verify(completionEvidence(graph, main, { selfCertified: true })), /cannot be self-certified/);
  assert.throws(() => verify(completionEvidence(graph, main, {
    observedAfterState: main.state,
    gateObservations: completionEvidence(graph, main).gateObservations.map((item) => ({ ...item, observedAfterState: main.state }))
  })), /changed authoritative Workgraph state/);
  assert.throws(() => verify(completionEvidence(graph, main, { expiresAt: OBSERVED })), /formedAt <= observedAt < expiresAt/);
  assert.throws(() => verify(completionEvidence(graph, main, {
    gateObservations: [{ ...completionEvidence(graph, main).gateObservations[0], completionGateRef: 'completion-gate.wrong' }]
  })), /exactly cover current completion gates/);
  assert.throws(() => verify(completionEvidence(graph, main, {
    gateObservations: [
      completionEvidence(graph, main).gateObservations[0],
      completionEvidence(graph, main).gateObservations[0]
    ]
  })), /exactly cover current completion gates|duplicate gate result refs/);

  const valid = verify(completionEvidence(graph, main));
  const wrongSource = structuredClone(valid);
  wrongSource.gateResultReceipts[0].verifierSourceRef = 'source.forged';
  delete wrongSource.gateResultReceipts[0].semanticFingerprint;
  wrongSource.gateResultReceipts[0].semanticFingerprint = semanticHash(wrongSource.gateResultReceipts[0]);
  delete wrongSource.semanticFingerprint;
  wrongSource.semanticFingerprint = semanticHash(wrongSource);
  assert.throws(() => assertCanonicalCompletionVerification(wrongSource, {
    graph,
    runtimeTrustSnapshot,
    schedulerInstanceRef: 'instance.completion-verifier.test',
    schedulerGeneration: 2,
    schedulerRegistry
  }), /verifierSourceRef mismatch/);
});

test('S24 completion is current at consumption and carries exact evidence into Workgraph convergence', () => {
  const { graph, main, dependent, parent, trustSnapshot } = graphFixture();
  const runtimeTrustSnapshot = { semanticFingerprint: 'b'.repeat(64), schedulerGeneration: 2 };
  const verifier = new DeterministicFakeCompletionVerifier({ schedulerRegistry });
  const verification = verifier.verify({
    graph,
    runtimeTrustSnapshot,
    schedulerInstanceRef: 'instance.completion-verifier.test',
    schedulerGeneration: 2,
    evidence: completionEvidence(graph, main)
  });
  const reduce = ({ candidateGraph = graph, candidateVerification = verification, completedAt = OBSERVED,
    schedulerObservedAt = OBSERVED } = {}) => reduceVerifiedWorkCompletion({
    graph: candidateGraph,
    verification: candidateVerification,
    actorRef: 'vex.test',
    actorRoleRef: 'role.vex.developer',
    completedAt,
    receiptRef: 'receipt.completion-verifier.test'
  }, {
    intentRegistry,
    schedulerRegistry,
    runtimeTrustSnapshot,
    schedulerInstanceRef: 'instance.completion-verifier.test',
    schedulerGeneration: 2,
    schedulerObservedAt,
    registeredProcessRefs,
    registeredRoleRefs,
    trustSnapshot
  });
  assert.throws(() => reduce({ completedAt: FORMED, schedulerObservedAt: FORMED }),
    /cannot precede verification observation/);
  assert.throws(() => reduce({ completedAt: EXPIRES }), /expired before consumption/);
  assert.throws(() => reduce({ completedAt: OBSERVED, schedulerObservedAt: EXPIRES }),
    /cannot precede the canonical scheduler observed clock/);
  const staleSerialized = structuredClone(verification);
  staleSerialized.expiresAt = OBSERVED;
  delete staleSerialized.semanticFingerprint;
  staleSerialized.semanticFingerprint = semanticHash(staleSerialized);
  assert.throws(() => reduce({ candidateVerification: staleSerialized }),
    /formedAt <= observedAt < expiresAt/);
  const result = reduce();
  assert.equal(result.graph.nodes.find((item) => item.workNodeRef === main.workNodeRef).state, 'COMPLETED');
  assert.equal(result.canonicalTransition.transitionRef, main.expectedTransitionRef);
  assert.equal(result.completionReceipt.expectedTransitionRef, main.expectedTransitionRef);
  assert.ok(result.canonicalTransition.sourceRefs.includes(verification.verificationReceiptRef));
  assert.equal(result.canonicalTransition.completionEvidenceLineage.verificationFingerprint,
    verification.semanticFingerprint);
  assert.ok(result.completionReceipt.sourceRefs.includes(verification.gateResultReceipts[0].gateResultRef));
  assert.ok(result.completionReceipt.sourceHashes.includes(verification.gateResultReceipts[0].semanticFingerprint));
  assert.equal(result.completionReceipt.completionEvidenceLineage.semanticFingerprint,
    result.completionEvidenceLineage.semanticFingerprint);
  assert.deepEqual(result.dependentReadyRefs, [dependent.workNodeRef]);
  assert.deepEqual(result.parentConvergenceReadyRefs, [parent.workNodeRef]);
  assert.equal(validateIntentWorkgraph(result.graph, {
    registry: intentRegistry,
    registeredProcessRefs,
    registeredRoleRefs,
    trustSnapshot
  }).ok, true);
  assert.throws(() => reduce({ candidateGraph: result.graph }),
    /current graph\/runtime\/scheduler binding mismatch|node transition binding mismatch/);
});

function canonicalRelayCall() {
  const call = {
    schemaVersion: 'vexlife.intent-tool-call/v1',
    toolCallRef: 'tool-call.relay-replay.test',
    schedulerInstanceRef: 'instance.relay-replay.test',
    workNodeRef: 'work.relay-replay.test',
    workerRef: 'worker.model.test.primary',
    workerLeaseRef: 'worker-lease.relay-replay.test',
    graphFingerprint: '1'.repeat(64),
    trustSnapshotFingerprint: '2'.repeat(64),
    runtimeSnapshotFingerprint: '3'.repeat(64),
    contextLeaseRef: 'context-lease.relay-replay.test',
    contextLeaseFingerprint: '4'.repeat(64),
    toolContractRef: 'contract.intent-scheduler.mock-tool.inspect/v0',
    toolRef: 'tool.mock.inspect',
    effectRef: 'effect.mock.read',
    argumentSchemaRef: 'schema.tool.mock.inspect/v0',
    arguments: { sourceRef: 'source.relay-replay.test' },
    argumentHash: semanticHash({ sourceRef: 'source.relay-replay.test' }),
    capabilityLeaseRef: 'capability-lease.relay-replay.test',
    capabilityLeaseFingerprint: '5'.repeat(64),
    effectLeaseRef: 'effect-lease.relay-replay.test',
    effectLeaseFingerprint: '6'.repeat(64),
    resourceLeaseRef: 'resource-lease.relay-replay.test',
    resourceLeaseFingerprint: '7'.repeat(64),
    resultSchemaRef: 'schema.tool.mock.result/v0',
    resultRequiredFields: ['summaryRef'],
    maxObservationBytes: 1024,
    executorRef: 'executor.mock.deterministic.inspect',
    schedulerGeneration: 1,
    cancellationTokenRef: 'token.relay-replay.test',
    sourceEvidenceRef: 'source.blueprint.intent-scheduler-registry',
    sourceEvidenceHash: semanticHash(schedulerRegistry),
    proposedAt: FORMED,
    timeoutAt: EXPIRES,
    cancellationPolicy: 'CHECKPOINT_THEN_CANCEL',
    predecessorToolCallRef: null,
    heldDisposition: null,
    replacementPolicyRef: null,
    replacementReasonRef: null,
    externalEffectsExecuted: false
  };
  call.semanticPurposeFingerprint = semanticHash({
    workNodeRef: call.workNodeRef,
    toolContractRef: call.toolContractRef,
    toolRef: call.toolRef,
    effectRef: call.effectRef,
    argumentSchemaRef: call.argumentSchemaRef,
    argumentHash: call.argumentHash,
    resultSchemaRef: call.resultSchemaRef,
    executorRef: call.executorRef,
    sourceEvidenceRef: call.sourceEvidenceRef,
    sourceEvidenceHash: call.sourceEvidenceHash
  });
  call.semanticFingerprint = semanticHash(call);
  return call;
}

function relayResult(call) {
  return {
    toolCallRef: call.toolCallRef,
    observationRef: 'observation.relay-replay.test',
    workNodeRef: call.workNodeRef,
    workerRef: call.workerRef,
    workerLeaseRef: call.workerLeaseRef,
    graphFingerprint: call.graphFingerprint,
    trustSnapshotFingerprint: call.trustSnapshotFingerprint,
    runtimeSnapshotFingerprint: call.runtimeSnapshotFingerprint,
    contextLeaseRef: call.contextLeaseRef,
    contextLeaseFingerprint: call.contextLeaseFingerprint,
    toolRef: call.toolRef,
    effectRef: call.effectRef,
    capabilityLeaseFingerprint: call.capabilityLeaseFingerprint,
    effectLeaseFingerprint: call.effectLeaseFingerprint,
    resourceLeaseFingerprint: call.resourceLeaseFingerprint,
    schedulerGeneration: call.schedulerGeneration,
    cancellationTokenRef: call.cancellationTokenRef,
    executorRef: call.executorRef,
    sourceEvidenceRef: call.sourceEvidenceRef,
    sourceEvidenceHash: call.sourceEvidenceHash,
    schemaRef: call.resultSchemaRef,
    observation: { summaryRef: 'summary.relay-replay.test' },
    artifactRefs: []
  };
}

function forgedTransition(call, priorState, nextState, sequence, receiptRef, overrides = {}) {
  const contract = schedulerRegistry.relayTransitionContracts.find((item) =>
    item.priorState === priorState && item.nextState === nextState
  );
  const receipt = {
    schemaVersion: contract?.receiptSchemaVersion ?? 'vexlife.intent-tool-call-cancellation/v1',
    receiptRef,
    eventContractRef: contract?.contractRef ?? 'contract.intent-scheduler.relay-event.invalid',
    toolCallRef: call.toolCallRef,
    priorState,
    nextState,
    sequence,
    currentness: 'CURRENT',
    sourceRef: call.sourceEvidenceRef,
    sourceHash: call.sourceEvidenceHash,
    formationRef: 'formation.intent-scheduler.relay-transition.v1',
    transitionedAt: OBSERVED,
    ...overrides
  };
  receipt.semanticFingerprint = semanticHash(receipt);
  return receipt;
}

function refingerprintLedger(snapshot) {
  const ledger = structuredClone(snapshot);
  delete ledger.semanticFingerprint;
  ledger.semanticFingerprint = semanticHash(ledger);
  return ledger;
}

test('S25 relay restore enforces typed event semantics, terminal history and once-only restart continuation', () => {
  const call = canonicalRelayCall();
  const relay = new ToolResultRelay(null, { schedulerRegistry });
  relay.register(call);
  const restoredPending = new ToolResultRelay(relay.snapshot, { schedulerRegistry });
  assert.equal(restoredPending.snapshot.entries[0].state, 'PENDING');
  assert.equal(restoredPending.accept(relayResult(call), { receivedAt: OBSERVED }).accepted, true);
  const restoredAccepted = new ToolResultRelay(restoredPending.snapshot, { schedulerRegistry });
  assert.equal(restoredAccepted.accept(relayResult(call), { receivedAt: OBSERVED }).reason, 'DUPLICATE_RESULT');

  const heldRelay = new ToolResultRelay(null, { schedulerRegistry });
  heldRelay.register(call);
  heldRelay.hold(call.toolCallRef, {
    receiptRef: 'receipt.relay.held',
    heldAt: OBSERVED,
    checkpointRef: 'checkpoint.relay-replay.test'
  });
  const mismatch = structuredClone(heldRelay.snapshot);
  mismatch.entries[0].state = 'PENDING';
  assert.throws(() => new ToolResultRelay(refingerprintLedger(mismatch), { schedulerRegistry }), /supplied state does not match replay-derived state/);

  const closedRelay = new ToolResultRelay(null, { schedulerRegistry });
  closedRelay.register(call);
  closedRelay.cancel(call.toolCallRef, { receiptRef: 'receipt.relay.closed', closedAt: OBSERVED });
  const outOfOrder = structuredClone(closedRelay.snapshot);
  outOfOrder.entries[0].transitionReceipts[0].sequence = 1;
  delete outOfOrder.entries[0].transitionReceipts[0].semanticFingerprint;
  outOfOrder.entries[0].transitionReceipts[0].semanticFingerprint =
    semanticHash(outOfOrder.entries[0].transitionReceipts[0]);
  assert.throws(() => new ToolResultRelay(refingerprintLedger(outOfOrder), { schedulerRegistry }), /sequence is out of order/);

  const wrongSchema = structuredClone(heldRelay.snapshot);
  wrongSchema.entries[0].transitionReceipts[0].schemaVersion = 'vexlife.intent-tool-call-cancellation/v1';
  delete wrongSchema.entries[0].transitionReceipts[0].semanticFingerprint;
  wrongSchema.entries[0].transitionReceipts[0].semanticFingerprint =
    semanticHash(wrongSchema.entries[0].transitionReceipts[0]);
  assert.throws(() => new ToolResultRelay(refingerprintLedger(wrongSchema), { schedulerRegistry }),
    /registered typed event contract/);

  const wrongSource = structuredClone(heldRelay.snapshot);
  wrongSource.entries[0].transitionReceipts[0].sourceHash = 'f'.repeat(64);
  delete wrongSource.entries[0].transitionReceipts[0].semanticFingerprint;
  wrongSource.entries[0].transitionReceipts[0].semanticFingerprint =
    semanticHash(wrongSource.entries[0].transitionReceipts[0]);
  assert.throws(() => new ToolResultRelay(refingerprintLedger(wrongSource), { schedulerRegistry }),
    /typed relay transition source\/formation lineage mismatch/);

  const wrongObservation = structuredClone(restoredPending.snapshot);
  wrongObservation.entries[0].transitionReceipts[0].observationRef = 'observation.relay-replay.wrong';
  delete wrongObservation.entries[0].transitionReceipts[0].semanticFingerprint;
  wrongObservation.entries[0].transitionReceipts[0].semanticFingerprint =
    semanticHash(wrongObservation.entries[0].transitionReceipts[0]);
  assert.throws(() => new ToolResultRelay(refingerprintLedger(wrongObservation), { schedulerRegistry }),
    /typed ACCEPT receipt observation lineage mismatch/);

  const wrongCancellation = structuredClone(closedRelay.snapshot);
  wrongCancellation.entries[0].transitionReceipts[0].cancellationTokenRef = 'token.relay-replay.wrong';
  delete wrongCancellation.entries[0].transitionReceipts[0].semanticFingerprint;
  wrongCancellation.entries[0].transitionReceipts[0].semanticFingerprint =
    semanticHash(wrongCancellation.entries[0].transitionReceipts[0]);
  assert.throws(() => new ToolResultRelay(refingerprintLedger(wrongCancellation), { schedulerRegistry }),
    /typed CANCEL\/CLOSE receipt cancellation lineage mismatch/);

  const observationWithoutAccept = structuredClone(closedRelay.snapshot);
  observationWithoutAccept.entries[0].observation = restoredPending.snapshot.entries[0].observation;
  assert.throws(() => new ToolResultRelay(refingerprintLedger(observationWithoutAccept), { schedulerRegistry }),
    /observation exists without a typed ACCEPT event/);

  const wrongContext = structuredClone(restoredPending.snapshot);
  const acceptedEntry = wrongContext.entries[0];
  acceptedEntry.state = 'REINJECTED';
  acceptedEntry.reinjectedContextLeaseRef = 'context-lease.relay-replay.successor';
  acceptedEntry.transitionReceipts.push(forgedTransition(call, 'ACCEPTED', 'REINJECTED', 1,
    'receipt.relay.reinjected', {
      contextLeaseRef: 'context-lease.relay-replay.wrong',
      observationRef: acceptedEntry.observation.observationRef,
      observationFingerprint: acceptedEntry.observation.semanticFingerprint
    }));
  assert.throws(() => new ToolResultRelay(refingerprintLedger(wrongContext), { schedulerRegistry }),
    /typed REINJECT receipt observation\/context lineage mismatch/);

  const missingAuthorization = structuredClone(heldRelay.snapshot);
  const heldEntry = missingAuthorization.entries[0];
  heldEntry.state = 'CLOSED';
  heldEntry.transitionReceipts.push(forgedTransition(call, 'HELD', 'CLOSED', 1,
    'receipt.relay.held-close', {
      checkpointRef: 'checkpoint.relay-replay.test',
      action: 'CLOSE',
      schedulerAuthorizationRef: 'authorization.relay-replay.test',
      schedulerAuthorizationFingerprint: '8'.repeat(64),
      schedulerInstanceRef: call.schedulerInstanceRef,
      priorContextLeaseRef: call.contextLeaseRef,
      priorSemanticPurposeFingerprint: call.semanticPurposeFingerprint,
      priorSchedulerGeneration: call.schedulerGeneration
    }));
  assert.throws(() => new ToolResultRelay(refingerprintLedger(missingAuthorization), { schedulerRegistry }),
    /missing required fields: schedulerAuthorization/);

  const terminalThenAccept = structuredClone(closedRelay.snapshot);
  terminalThenAccept.entries[0].state = 'ACCEPTED';
  terminalThenAccept.entries[0].observation = restoredPending.snapshot.entries[0].observation;
  terminalThenAccept.entries[0].transitionReceipts.push(
    forgedTransition(call, 'CLOSED', 'ACCEPTED', 1, 'receipt.relay.accepted-after-close')
  );
  assert.throws(() => new ToolResultRelay(refingerprintLedger(terminalThenAccept), { schedulerRegistry }), /illegal state progression|after a terminal state/);
});

// [VXG RealForever]
