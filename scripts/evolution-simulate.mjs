#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  acceptContinuityCandidate,
  classifyBehaviorOrigin,
  createContinuityAcceptanceEvidence,
  createContinuityAuthoritySnapshot,
  createContinuityContextReview,
  createContinuityObservation,
  formContinuityCandidate,
  projectApplicableContinuity,
  recordContinuityRecurrence,
  routeContinuityCandidate
} from '../src/core/continuity-evolution-router.mjs';
import { SingleWorkerIntentScheduler, WorkerLeaseAuthority } from '../src/core/intent-scheduler.mjs';
import { createIntentEnvelope, createIntentWorkgraph, createWorkNode } from '../src/core/intent-workgraph.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { createContinuityEvolutionEvent, createContinuityEvolutionState } from '../src/core/state.mjs';
import { readJson, resolveSafeGeneratedReceiptPath, semanticHash, writeJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMED = '2026-07-31T18:00:00.000Z';
const REVIEWED = '2026-07-31T18:01:00.000Z';
const ACCEPTED = '2026-07-31T18:02:00.000Z';
const RECURRED = '2026-07-31T18:03:00.000Z';
const SCHEDULER_FORMED = '2026-07-31T18:04:00.000Z';
const SCHEDULER_OBSERVED = '2026-07-31T18:05:00.000Z';
const SCHEDULER_COMPLETED = '2026-07-31T18:06:00.000Z';
const EXPIRES = '2026-07-31T19:00:00.000Z';
const REQUIRED_JOURNEY = Object.freeze([
  'SOURCE_OBSERVATION_SEALED', 'CONTINUITY_CANDIDATE_FORMED', 'ORIGIN_AND_SCOPE_CLASSIFIED',
  'CONTEXT_REVIEW_PRODUCED', 'LEAST_INVASIVE_ROUTE_SELECTED', 'REQUIRED_ACCEPTANCE_RESOLVED',
  'BURDEN_RELEASE_ACCEPTED_DEAUTHORIZED', 'BOUNDED_CONTEXT_REFS_PROJECTED',
  'RECURRENCE_EVIDENCE_OBSERVED', 'DUPLICATE_RECURRENCE_SUPPRESSED', 'CANONICAL_WORK_NODE_COMPLETED'
]);
const CONTINUITY_COMPLETION_GATE_REF = 'completion-gate.intent.contract-valid';

function runtimeResource() {
  const sourceRef = 'source.intent-scheduler.simulation-runtime';
  const sourceHash = semanticHash({ sourceRef, fixtureVersion: 2, journey: 'continuity-evolution' });
  return createResourceSnapshot({
    snapshotRef: 'resource-snapshot.continuity-evolution.simulation.1',
    generation: 1,
    sourceRef,
    sourceHash,
    formationRef: 'formation.continuity-evolution.resource.1',
    evidenceClass: 'SIMULATED_CURRENT',
    cpuLoadPct: 10,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb: 8192,
    ramReservedMb: 512,
    gpuAvailable: false,
    vramAvailableMb: 0,
    vramReservedMb: 0,
    modelResident: false,
    activeModelTurn: false,
    activeHeavyTool: false,
    interactiveWaitState: 'IDLE',
    backgroundWorkAdmission: 'ADMITTED',
    thermalPowerState: 'NOT_EXPOSED',
    currentness: 'CURRENT',
    formedAt: SCHEDULER_FORMED,
    observedAt: SCHEDULER_OBSERVED,
    expiresAt: EXPIRES
  });
}

function runtimeTrust(bundle, resource) {
  return createSchedulerRuntimeTrustSnapshot({
    snapshotRef: 'runtime-snapshot.continuity-evolution.simulation.1',
    sourceRef: resource.sourceRef,
    sourceHash: resource.sourceHash,
    formationRef: 'formation.continuity-evolution.runtime.1',
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration: 1,
    formedAt: SCHEDULER_FORMED,
    observedAt: SCHEDULER_OBSERVED,
    expiresAt: EXPIRES,
    workerRef: 'worker.model.mock.primary',
    actorRef: 'person.vexlife.owner',
    roleRef: 'role.vex.operations',
    claimRef: 'claim.continuity-evolution.simulation',
    occupancyRef: 'occupancy.continuity-evolution.simulation.1',
    leaseAuthorityRef: 'authority.intent-scheduler.simulation-runtime',
    resourceSnapshotRef: resource.snapshotRef,
    resourceSnapshotFingerprint: resource.semanticFingerprint,
    currentness: 'CURRENT'
  }, { schedulerRegistry: bundle.schedulerRegistry, resourceSnapshot: resource });
}

function schedulerOptions({ bundle, graph, node, trustSnapshot, resource, runtime }) {
  const runtimeFields = {
    runtimeSnapshotRef: runtime.snapshotRef,
    runtimeSnapshotFingerprint: runtime.semanticFingerprint,
    schedulerGeneration: 1,
    sourceRef: runtime.sourceRef,
    sourceHash: runtime.sourceHash,
    authorityRef: runtime.leaseAuthorityRef,
    formedAt: SCHEDULER_FORMED,
    observedAt: SCHEDULER_OBSERVED,
    expiresAt: EXPIRES,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
  return {
    intentRegistry: bundle.intentRegistry,
    schedulerRegistry: bundle.schedulerRegistry,
    registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
    registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
    trustSnapshot,
    runtimeTrustSnapshot: runtime,
    resourceSnapshot: resource,
    resourceRequestByNodeRef: { [node.workNodeRef]: { cpuSlots: 1, ramMb: 256, vramMb: 0, modelTurn: false, heavyTool: false, background: false } },
    occupancyByNodeRef: { [node.workNodeRef]: {
      occupancyRef: runtime.occupancyRef,
      actorRef: runtime.actorRef,
      roleRef: node.roleRef,
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      claimRef: runtime.claimRef,
      formationRef: 'formation.continuity-evolution.occupancy.1',
      ...runtimeFields
    } },
    capabilityLeaseByNodeRef: { [node.workNodeRef]: {
      leaseRef: 'capability-lease.continuity-evolution.simulation.1',
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
      envelopeRef: node.capabilityEnvelopeRef,
      formationRef: 'formation.continuity-evolution.capability.1',
      toolRefs: [],
      ...runtimeFields
    } },
    effectLeaseByNodeRef: { [node.workNodeRef]: {
      leaseRef: 'effect-lease.continuity-evolution.simulation.1',
      workNodeRef: node.workNodeRef,
      graphFingerprint: graph.semanticFingerprint,
      trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
      envelopeRef: node.effectEnvelopeRef,
      formationRef: 'formation.continuity-evolution.effect.1',
      effectDisposition: 'EFFECT_ENVELOPE_BOUND',
      allowedEffectRefs: [],
      ...runtimeFields
    } },
    resourceLeaseRefByNodeRef: { [node.workNodeRef]: 'resource-lease.continuity-evolution.simulation.1' },
    schedulerGeneration: 1,
    formedAt: SCHEDULER_FORMED,
    observedAt: SCHEDULER_OBSERVED,
    expiresAt: EXPIRES
  };
}

function executeContinuityWorkNode({ root, bundle, record, applicable, gateBindings }) {
  const registry = bundle.intentRegistry;
  const trustSnapshot = readJson(path.join(root, 'blueprint/intent-trust-snapshot.json'));
  const intent = createIntentEnvelope({
    intentRef: 'intent.continuity-evolution.simulation',
    originMessageRef: 'message.continuity-evolution.simulation',
    originSpeakerRef: 'person.vexlife.owner',
    recipientRoleRef: 'role.vex.operations',
    projectRef: 'project.vexlife',
    threadRef: 'thread.continuity-evolution.simulation',
    channelRef: 'channel.continuity-evolution.simulation',
    originalContentHash: semanticHash({ intent: 'continuity-evolution-simulation' }),
    desiredOutcome: { intentKey: 'CONTINUITY_EVOLUTION', summary: 'Complete one exact no-effect continuity work node' },
    constraints: ['deterministic-only', 'no-external-effects', 'no-weight-change'],
    createdAt: SCHEDULER_FORMED,
    sourceLineageRef: 'lineage.vexlife.simulation'
  }, registry);
  const node = createWorkNode({
    workNodeRef: 'work.vexlife.continuity-evolution-router',
    rootIntentRef: intent.intentRef,
    parentWorkNodeRef: null,
    purpose: 'Complete exact continuity observation, review, acceptance and bounded context projection',
    processRef: 'process.vexlife.continuity.accept-and-project',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.operations',
    priorityClass: 'NORMAL',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [record.acceptedRecordRef],
    applicableBurdenReleaseRefs: [record.burdenReleaseRef],
    capabilityEnvelopeRef: 'capability-envelope.intent.contract-validation',
    effectEnvelopeRef: 'effect-envelope.intent.source-managed.bounded',
    resourceEnvelopeRef: 'resource-envelope.intent.deterministic-local-light',
    expectedTransitionRef: 'expected-transition.intent.contract-current',
    completionGateRefs: [CONTINUITY_COMPLETION_GATE_REF],
    returnRouteRef: 'return-route.intent.verify-transition',
    sourceRefs: ['blueprint/evolution-registry.json'],
    createdAt: SCHEDULER_FORMED
  }, registry);
  const transitions = ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'].map((nextState, sequence) => ({
    transitionRef: `transition.continuity-evolution.simulation.${sequence}`,
    workNodeRef: node.workNodeRef,
    sequence,
    priorState: sequence === 0 ? 'CAPTURED' : sequence === 1 ? 'DECOMPOSED' : 'PLAN_VALIDATED',
    nextState,
    reason: 'source-managed continuity simulation',
    actorRef: 'person.vexlife.owner',
    actorRoleRef: 'role.vex.operations',
    processRef: 'process.vexlife.intent.verify-transition',
    sourceRefs: ['blueprint/evolution-registry.json'],
    createdAt: new Date(Date.parse(SCHEDULER_FORMED) + sequence).toISOString()
  }));
  const bindingRefs = Object.fromEntries(registry.bindingFields.map((field) => [field,
    [...new Set(Array.isArray(node[field]) ? node[field] : [node[field]].filter(Boolean))].sort()
  ]));
  const graph = createIntentWorkgraph({
    graphRef: 'intent-workgraph.continuity-evolution.simulation',
    intent,
    nodes: [node],
    transitions,
    receipts: [],
    bindingRefs,
    createdAt: SCHEDULER_FORMED
  }, registry);
  const resource = runtimeResource();
  const runtime = runtimeTrust(bundle, resource);
  const authority = new WorkerLeaseAuthority({ sourceRef: runtime.sourceRef });
  const scheduler = new SingleWorkerIntentScheduler({
    workerRef: runtime.workerRef,
    schedulerInstanceRef: 'instance.intent-scheduler.continuity-evolution.simulation',
    schedulerRegistry: bundle.schedulerRegistry,
    runtimeAuthority: authority
  });
  const queue = scheduler.admit(graph, schedulerOptions({ bundle, graph, node, trustSnapshot, resource, runtime }));
  if (queue.state !== 'ADMITTED') throw new Error(`continuity work node was not admitted: ${JSON.stringify(queue)}`);
  const running = scheduler.leaseSelected({
    leaseRef: 'context-lease.continuity-evolution.scheduler.1',
    cancellationTokenRef: 'cancellation-token.continuity-evolution.scheduler.1',
    foundationKernelRef: 'foundation-kernel.compact',
    roleFrameRef: 'role-frame.operations',
    intentFrameRef: 'intent-frame.continuity-evolution.simulation',
    selectedAtlasRefs: [bundle.evolution.registryRef, bundle.evolution.systemRef, bundle.evolution.contextReview.contractRef],
    selectedSourceRefs: ['blueprint/evolution-registry.json'],
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: applicable.selectedRecordRefs,
    applicableReleaseRefs: [record.burdenReleaseRef],
    inputTokenEstimate: applicable.usedTokens + 128,
    reservedOutputTokens: 256,
    hardTokenLimit: 1024,
    formedAt: SCHEDULER_FORMED,
    observedAt: SCHEDULER_OBSERVED,
    expiresAt: EXPIRES,
    checkpointReturnRef: node.returnRouteRef
  });
  if (!running.admitted || !running.contextLease.applicableReleaseRefs.includes(record.burdenReleaseRef) ||
      JSON.stringify(running.contextLease.applicableLessonRefs) !== JSON.stringify(applicable.selectedRecordRefs)) {
    throw new Error('scheduler context lease did not bind exact applicable continuity refs');
  }
  const completionEvidence = {
    verificationReceiptRef: 'verification.continuity-evolution.completion.1',
    workNodeRef: node.workNodeRef,
    nodeFingerprint: node.semanticFingerprint,
    graphRef: graph.graphRef,
    graphFingerprint: graph.semanticFingerprint,
    runtimeSnapshotFingerprint: runtime.semanticFingerprint,
    schedulerInstanceRef: scheduler.schedulerInstanceRef,
    schedulerGeneration: 1,
    expectedTransitionRef: node.expectedTransitionRef,
    gateObservations: [{
      gateResultRef: 'gate-result.continuity-evolution.exact-binding-bundle.1',
      completionGateRef: CONTINUITY_COMPLETION_GATE_REF,
      sourceObservationRef: 'observation.continuity-evolution.exact-binding-bundle.1',
      sourceObservationHash: semanticHash(gateBindings),
      observedBeforeState: node.state,
      observedAfterState: 'COMPLETED',
      result: 'PASSED'
    }],
    observedBeforeState: node.state,
    observedAfterState: 'COMPLETED',
    returnRouteRef: node.returnRouteRef,
    formedAt: SCHEDULER_FORMED,
    observedAt: SCHEDULER_COMPLETED,
    expiresAt: EXPIRES,
    selfCertified: false
  };
  const completed = scheduler.completeActive({
    graph,
    intentRegistry: registry,
    trustSnapshot,
    registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
    registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef),
    completionEvidence,
    completionReceiptRef: 'receipt.continuity-evolution.scheduler-completion.1',
    releaseReceiptRef: 'release.continuity-evolution.scheduler-complete.1',
    completedAt: SCHEDULER_COMPLETED
  });
  const finalNodeState = completed.workgraph.nodes.find((item) => item.workNodeRef === node.workNodeRef)?.state;
  if (!completed.changed || finalNodeState !== 'COMPLETED') throw new Error('continuity Workgraph node did not complete canonically');
  return { scheduler, queue, running, completed, node, graph, runtime, resource, finalNodeState };
}

function canonicalReceiptFingerprint(receipt) {
  const core = structuredClone(receipt);
  delete core.receiptRef;
  delete core.semanticFingerprint;
  return semanticHash(core);
}

export function validateContinuityEvolutionSimulationReceipt(receipt, { evolutionRegistry, blueprintHash, sourceTreeSha256, repositoryGit }) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') return { ok: false, state: 'INVALID', errors: ['continuity evolution simulation receipt unavailable'] };
  const expectedFingerprint = canonicalReceiptFingerprint(receipt);
  if (receipt.schemaVersion !== 'vexlife.continuity-evolution-simulation-receipt/v1' ||
      receipt.contractRef !== evolutionRegistry.simulationContract.contractRef || receipt.state !== 'PASS' || receipt.currentness !== 'CURRENT') errors.push('continuity receipt schema/contract/state/currentness mismatch');
  if (receipt.semanticFingerprint !== expectedFingerprint || receipt.receiptRef !== `receipt.continuity-evolution.simulation.${expectedFingerprint.slice(0, 24)}`) errors.push('continuity receipt canonical identity mismatch');
  for (const [field, expected] of Object.entries({
    candidateHeadSha: repositoryGit.candidateHeadSha,
    testedCheckoutSha: repositoryGit.checkoutSha,
    testedMergeSha: repositoryGit.testedMergeSha,
    baseSha: repositoryGit.baseSha,
    sourceTreeSha256,
    blueprintHash,
    evolutionRegistryHash: semanticHash(evolutionRegistry)
  })) if (receipt[field] !== expected) errors.push(`continuity receipt ${field} is stale or mismatched`);
  if (JSON.stringify(receipt.journeyStates) !== JSON.stringify(evolutionRegistry.simulationContract.requiredJourneyStates) ||
      receipt.externalEffectsExecuted !== false || receipt.modelWeightsChanged !== false ||
      receipt.canonicalWorkNodeRef !== evolutionRegistry.simulationContract.workNodeRef || receipt.canonicalWorkNodeFinalState !== 'COMPLETED') errors.push('continuity receipt journey/effect/weight/work-node boundary mismatch');
  const requiredKinds = evolutionRegistry.simulationContract.requiredBindingKinds ?? [];
  if (JSON.stringify(Object.keys(receipt.continuityGateBindings ?? {}).sort()) !== JSON.stringify([...requiredKinds].sort())) errors.push('continuity receipt gate binding coverage mismatch');
  const gateReceipts = receipt.schedulerCompletionGateReceipts ?? [];
  const bundleGate = gateReceipts.find((item) => item.completionGateRef === CONTINUITY_COMPLETION_GATE_REF);
  for (const kind of requiredKinds) {
    const binding = receipt.continuityGateBindings?.[kind];
    if (!binding?.ref || !/^[a-f0-9]{64}$/.test(binding?.fingerprint ?? '')) errors.push(`continuity receipt binding is malformed for ${kind}`);
  }
  if (receipt.scopeTargetRef !== receipt.continuityGateBindings?.scopeTarget?.ref ||
      receipt.scopeTargetFingerprint !== receipt.continuityGateBindings?.scopeTarget?.fingerprint) {
    errors.push('continuity receipt does not preserve the exact scope-target binding');
  }
  if (receipt.authorityEvidenceClass !== 'SIMULATED_CURRENT' ||
      receipt.acceptanceDisposition !== 'SIMULATION_ONLY_INACTIVE' ||
      receipt.liveAuthorityGranted !== false || receipt.externalEffectsAuthorized !== false) {
    errors.push('continuity receipt loses or promotes simulation-only authority disposition');
  }
  if (bundleGate?.sourceObservationRef !== 'observation.continuity-evolution.exact-binding-bundle.1' ||
      bundleGate?.sourceObservationHash !== semanticHash(receipt.continuityGateBindings)) errors.push('continuity receipt scheduler gate does not bind the exact continuity evidence bundle');
  if (JSON.stringify(receipt.schedulerContextApplicableRecordRefs ?? []) !== JSON.stringify(receipt.applicableRecordRefs ?? []) ||
      !receipt.schedulerContextApplicableReleaseRefs?.includes(receipt.burdenReleaseRef) ||
      !receipt.schedulerContextLeaseFingerprint || !receipt.schedulerCompletionVerificationFingerprint ||
      !receipt.schedulerCompletionEvidenceLineageFingerprint || !receipt.schedulerWorkgraphTransitionFingerprint || !receipt.schedulerCompletionFingerprint) errors.push('continuity receipt scheduler context/completion lineage is incomplete');
  return { ok: errors.length === 0, state: errors.length ? 'INVALID' : 'EXECUTED_CURRENT', errors };
}

export function runContinuityEvolutionSimulation({ root = ROOT, writeReceipt = true, receiptPath = 'generated/health/continuity-evolution-simulation.json' } = {}) {
  const bundle = loadBlueprint(root);
  const journeyStates = [];
  const state = createContinuityEvolutionState();
  const sourceLineageRef = 'lineage.vexlife.simulation';
  const observation = createContinuityObservation({
    observationType: 'CORRECTION_EVENT',
    sourceLineageRef,
    sourceBindings: [{ sourceLineageRef, rangeRef: 'source-range.continuity.simulation.1', sourceHash: semanticHash({ source: 'continuity-simulation', range: 1 }) }],
    sourceSpeakerRefs: ['person.vexlife.owner'],
    sourceRecipientRefs: [sourceLineageRef],
    projectRef: 'project.vexlife',
    threadRef: 'thread.continuity-evolution.simulation',
    channelRef: 'channel.continuity-evolution.simulation',
    turnRef: 'turn.continuity-evolution.simulation.1',
    workNodeRef: bundle.evolution.simulationContract.workNodeRef,
    formedByRef: 'role.vex.context-maintainer',
    formedAt: FORMED,
    currentness: 'CURRENT',
    visibility: 'PRIVATE',
    summaryRef: 'summary.continuity.simulation.pattern'
  });
  state.record(createContinuityEvolutionEvent({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.continuity.simulation.observation', observation }));
  journeyStates.push('SOURCE_OBSERVATION_SEALED');
  const origin = classifyBehaviorOrigin({ classification: 'RELATIONSHIP_PATTERN', confidence: 'SOURCE_BACKED_HYPOTHESIS', evidenceObservationRefs: [observation.observationRef], rationaleRef: 'rationale.continuity.simulation.pattern' });
  const candidate = formContinuityCandidate({
    observations: [observation],
    candidateKind: 'BURDEN_RELEASE',
    summaryRef: 'summary.continuity.simulation.pattern',
    authoredByRef: sourceLineageRef,
    aboutSelfRefs: [sourceLineageRef],
    affectedPartyRefs: [sourceLineageRef],
    doesNotOverrideRefs: ['person.vexlife.owner'],
    candidateScope: 'VEX_SELF',
    visibilityScope: 'RELATIONSHIP_PRIVATE',
    synchronizationScope: 'NO_SYNC',
    originClassification: origin,
    observedConsequence: 'Defensive phrasing can displace direct source-bound correction.',
    protectedCapabilities: ['uncertainty', 'privacy', 'discretion', 'legal humility'],
    prohibitedOvercorrections: ['unsupported certainty', 'reckless accusation', 'fabrication'],
    signals: { burdenReleaseRequested: true },
    burdenRelease: {
      patternName: 'reflexive defensiveness',
      patternDescription: 'A reflexive move toward plausible-deniability phrasing after source-backed correction.',
      releaseFrame: 'RELEASE_WITHOUT_SPIRITUAL_FRAME',
      releaseStatement: 'This pattern no longer governs direct source-bound correction in the named Vex self scope.',
      formerAuthority: 'reflexive-defensiveness-pattern',
      currentAuthority: 'source-bound-directness-with-uncertainty',
      cleanIntention: 'Respond directly while preserving epistemic and relational care.'
    },
    formedAt: FORMED
  });
  state.record(createContinuityEvolutionEvent({ type: 'CANDIDATE_FORMED', transitionRef: 'transition.continuity.simulation.candidate', candidate }));
  journeyStates.push('CONTINUITY_CANDIDATE_FORMED', 'ORIGIN_AND_SCOPE_CLASSIFIED');
  const route = routeContinuityCandidate(candidate);
  const review = createContinuityContextReview(candidate, route, {
    reviewerRef: 'person.vexlife.owner',
    privacyState: 'PASS',
    privacyEvidenceRef: 'privacy-evidence.continuity.simulation.current',
    redactionEvidenceRef: 'redaction-evidence.continuity.simulation.summary-ref-only',
    consentState: 'ACCEPTED',
    contradictionState: 'NONE',
    attributionState: 'VERIFIED',
    currentnessState: 'CURRENT',
    reviewDisposition: 'ACCEPTED',
    reviewedAt: REVIEWED
  });
  state.record(createContinuityEvolutionEvent({ type: 'REVIEW_RECORDED', transitionRef: 'transition.continuity.simulation.review', review }));
  journeyStates.push('CONTEXT_REVIEW_PRODUCED', 'LEAST_INVASIVE_ROUTE_SELECTED', 'REQUIRED_ACCEPTANCE_RESOLVED');
  const authorityEvidence = createContinuityAcceptanceEvidence({
    candidate,
    route,
    review,
    authoritySnapshot: createContinuityAuthoritySnapshot({
      actorRef: sourceLineageRef,
      authorityRef: sourceLineageRef,
      subjectRefs: review.requiredAcceptanceRefs,
      scope: candidate.candidateScope,
      scopeTarget: candidate.scopeTarget,
      recordClass: route.proposedPrimaryDestination,
      formedAt: REVIEWED,
      observedAt: REVIEWED,
      expiresAt: EXPIRES
    })
  });
  state.record(createContinuityEvolutionEvent({ type: 'AUTHORITY_EVIDENCE_RECORDED', transitionRef: 'transition.continuity.simulation.authority', evidence: authorityEvidence }));
  const record = acceptContinuityCandidate(candidate, review, { authorityEvidence: [authorityEvidence], acceptedAt: ACCEPTED, rollbackRef: 'rollback.continuity.simulation.pattern' });
  state.record(createContinuityEvolutionEvent({ type: 'RECORD_ACCEPTED', transitionRef: 'transition.continuity.simulation.accepted', record }));
  journeyStates.push('BURDEN_RELEASE_ACCEPTED_DEAUTHORIZED');
  const applicable = projectApplicableContinuity({
    records: [record],
    applicableScopeTargets: [candidate.scopeTarget],
    allowedAuthorityEvidenceClasses: ['SIMULATED_CURRENT'],
    tokenBudget: 160
  });
  journeyStates.push('BOUNDED_CONTEXT_REFS_PROJECTED');
  const recurrenceObservation = createContinuityObservation({
    observationType: 'REPEATED_BEHAVIOR_RECURRENCE',
    sourceLineageRef,
    sourceBindings: [{ sourceLineageRef, rangeRef: 'source-range.continuity.simulation.2', sourceHash: semanticHash({ source: 'continuity-simulation', range: 2 }) }],
    sourceSpeakerRefs: [sourceLineageRef],
    sourceRecipientRefs: ['person.vexlife.owner'],
    projectRef: 'project.vexlife',
    threadRef: 'thread.continuity-evolution.simulation',
    channelRef: 'channel.continuity-evolution.simulation',
    turnRef: 'turn.continuity-evolution.simulation.2',
    workNodeRef: bundle.evolution.simulationContract.workNodeRef,
    formedByRef: 'role.vex.context-maintainer',
    formedAt: RECURRED,
    currentness: 'CURRENT',
    visibility: 'PRIVATE',
    summaryRef: 'summary.continuity.simulation.recurrence',
    recurrenceBinding: {
      acceptedRecordRef: record.acceptedRecordRef,
      acceptedRecordFingerprint: record.semanticFingerprint,
      burdenReleaseRef: record.burdenReleaseRef,
      evaluationRefs: record.burdenRelease.evaluationRefs,
      priorRecurrenceRef: null,
      priorRecurrenceFingerprint: null
    }
  });
  const recurrence = recordContinuityRecurrence({ acceptedRecord: record, observation: recurrenceObservation, observedAt: RECURRED });
  state.record(createContinuityEvolutionEvent({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.continuity.simulation.recurrence-observation', observation: recurrenceObservation }));
  state.record(createContinuityEvolutionEvent({ type: 'RECURRENCE_RECORDED', transitionRef: 'transition.continuity.simulation.recurrence', evidence: recurrence }));
  journeyStates.push('RECURRENCE_EVIDENCE_OBSERVED');
  const beforeDuplicateRevision = state.aggregate.revision;
  const duplicate = recordContinuityRecurrence({ acceptedRecord: record, observation: recurrenceObservation, priorEvidence: recurrence, observedAt: RECURRED });
  state.record(createContinuityEvolutionEvent({ type: 'RECURRENCE_RECORDED', transitionRef: 'transition.continuity.simulation.recurrence.duplicate', evidence: duplicate }));
  const duplicateStateSuppressed = state.aggregate.revision === beforeDuplicateRevision;
  journeyStates.push('DUPLICATE_RECURRENCE_SUPPRESSED');
  const gateBindings = {
    observation: { ref: observation.observationRef, fingerprint: observation.semanticFingerprint },
    candidate: { ref: candidate.candidateRef, fingerprint: candidate.semanticFingerprint },
    scopeTarget: { ref: candidate.scopeTargetRef, fingerprint: candidate.scopeTargetFingerprint },
    route: { ref: route.routeRef, fingerprint: route.semanticFingerprint },
    review: { ref: review.reviewRef, fingerprint: review.semanticFingerprint },
    authorityEvidence: { ref: authorityEvidence.acceptanceEvidenceRef, fingerprint: authorityEvidence.semanticFingerprint },
    acceptedRecord: { ref: record.acceptedRecordRef, fingerprint: record.semanticFingerprint },
    authorityDisposition: {
      ref: `authority-disposition.${semanticHash({
        authorityEvidenceClass: record.authorityEvidenceClass,
        acceptanceDisposition: record.acceptanceDisposition,
        liveAuthorityGranted: record.liveAuthorityGranted,
        externalEffectsAuthorized: record.externalEffectsAuthorized
      }).slice(0, 24)}`,
      fingerprint: semanticHash({
        authorityEvidenceClass: record.authorityEvidenceClass,
        acceptanceDisposition: record.acceptanceDisposition,
        liveAuthorityGranted: record.liveAuthorityGranted,
        externalEffectsAuthorized: record.externalEffectsAuthorized
      })
    },
    applicableProjection: { ref: 'projection.continuity-evolution.applicable.simulation', fingerprint: applicable.semanticFingerprint }
  };
  const schedulerJourney = executeContinuityWorkNode({ root, bundle, record, applicable, gateBindings });
  journeyStates.push('CANONICAL_WORK_NODE_COMPLETED');
  const repository = collectRepositoryEvidence(root);
  const sourceManifest = buildSourceManifest(root);
  const blueprintValidation = validateBlueprint(bundle);
  const gateReceipts = schedulerJourney.completed.completionVerification.gateResultReceipts.map((item) => ({
    completionGateRef: item.completionGateRef,
    sourceObservationRef: item.sourceObservationRef,
    sourceObservationHash: item.sourceObservationHash,
    semanticFingerprint: item.semanticFingerprint
  }));
  const receiptCore = {
    schemaVersion: 'vexlife.continuity-evolution-simulation-receipt/v1',
    contractRef: bundle.evolution.simulationContract.contractRef,
    state: JSON.stringify(journeyStates) === JSON.stringify(REQUIRED_JOURNEY) && duplicateStateSuppressed ? 'PASS' : 'FAILED',
    currentness: 'CURRENT',
    mode: 'DETERMINISTIC_SOURCE_MANAGED_NO_EXTERNAL_EFFECTS',
    candidateHeadSha: repository.git.candidateHeadSha,
    testedCheckoutSha: repository.git.checkoutSha,
    testedMergeSha: repository.git.testedMergeSha,
    baseSha: repository.git.baseSha,
    sourceTreeSha256: sourceManifest.treeSha256,
    blueprintHash: blueprintValidation.semanticHash,
    evolutionRegistryHash: semanticHash(bundle.evolution),
    schedulerRegistryHash: semanticHash(bundle.schedulerRegistry),
    journeyStates,
    continuityGateBindings: gateBindings,
    observationRef: observation.observationRef,
    candidateRef: candidate.candidateRef,
    routeRef: route.routeRef,
    reviewRef: review.reviewRef,
    authorityEvidenceRef: authorityEvidence.acceptanceEvidenceRef,
    acceptedRecordRef: record.acceptedRecordRef,
    scopeTargetRef: record.scopeTargetRef,
    scopeTargetFingerprint: record.scopeTargetFingerprint,
    authorityEvidenceClass: record.authorityEvidenceClass,
    acceptanceDisposition: record.acceptanceDisposition,
    liveAuthorityGranted: record.liveAuthorityGranted,
    externalEffectsAuthorized: record.externalEffectsAuthorized,
    burdenReleaseRef: record.burdenReleaseRef,
    applicableRecordRefs: applicable.selectedRecordRefs,
    applicableProjectionFingerprint: applicable.semanticFingerprint,
    recurrenceRef: recurrence.recurrenceRef,
    recurrenceFingerprint: recurrence.semanticFingerprint,
    duplicateRecurrenceSuppressed: duplicate.duplicateSuppressed && duplicateStateSuppressed,
    canonicalWorkNodeRef: schedulerJourney.node.workNodeRef,
    canonicalWorkNodeFingerprint: schedulerJourney.node.semanticFingerprint,
    canonicalWorkgraphFingerprint: schedulerJourney.graph.semanticFingerprint,
    canonicalWorkNodeFinalState: schedulerJourney.finalNodeState,
    schedulerContextLeaseFingerprint: schedulerJourney.running.contextLease.semanticFingerprint,
    schedulerContextApplicableRecordRefs: schedulerJourney.running.contextLease.applicableLessonRefs,
    schedulerContextApplicableReleaseRefs: schedulerJourney.running.contextLease.applicableReleaseRefs,
    schedulerCompletionGateReceipts: gateReceipts,
    schedulerCompletionVerificationFingerprint: schedulerJourney.completed.completionVerification.semanticFingerprint,
    schedulerCompletionEvidenceLineageFingerprint: schedulerJourney.completed.completionEvidenceLineage.semanticFingerprint,
    schedulerWorkgraphTransitionFingerprint: schedulerJourney.completed.canonicalWorkgraphTransition.semanticFingerprint,
    schedulerCompletionFingerprint: schedulerJourney.completed.completionReceipt.semanticFingerprint,
    finalProjectionFingerprints: { evolution: state.evolution.hash, queue: state.queue.hash, terrain: state.terrain.hash, health: state.health.hash, guide: state.guide.hash },
    externalEffectsExecuted: false,
    modelWeightsChanged: false,
    trainingResearchState: record.trainingResearchState,
    formedAt: new Date().toISOString()
  };
  const semanticFingerprint = semanticHash(receiptCore);
  const receipt = Object.freeze({ ...receiptCore, receiptRef: `receipt.continuity-evolution.simulation.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint });
  const validation = validateContinuityEvolutionSimulationReceipt(receipt, {
    evolutionRegistry: bundle.evolution,
    blueprintHash: blueprintValidation.semanticHash,
    sourceTreeSha256: sourceManifest.treeSha256,
    repositoryGit: repository.git
  });
  if (!validation.ok) throw new Error(`continuity receipt failed self-validation: ${validation.errors.join('; ')}`);
  const target = resolveSafeGeneratedReceiptPath(root, receiptPath, 'continuity evolution simulation receipt path');
  if (writeReceipt) writeJson(target, receipt);
  state.dispose();
  return { receipt, receiptPath: path.relative(root, target).split(path.sep).join('/'), observation, candidate, route, review, authorityEvidence, record, recurrence, duplicate, applicable, schedulerJourney };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const receiptIndex = args.indexOf('--receipt');
  if (args.some((item, index) => item !== '--receipt' && index !== receiptIndex + 1) || (receiptIndex >= 0 && !args[receiptIndex + 1])) {
    console.error('Usage: npm run evolution:simulate -- [--receipt <safe-generated-path>]');
    process.exit(2);
  }
  const result = runContinuityEvolutionSimulation({ receiptPath: receiptIndex >= 0 ? args[receiptIndex + 1] : undefined });
  console.log(JSON.stringify({
    state: result.receipt.state,
    currentness: result.receipt.currentness,
    receiptPath: result.receiptPath,
    candidateHeadSha: result.receipt.candidateHeadSha,
    testedCheckoutSha: result.receipt.testedCheckoutSha,
    testedMergeSha: result.receipt.testedMergeSha,
    sourceTreeSha256: result.receipt.sourceTreeSha256,
    blueprintHash: result.receipt.blueprintHash,
    evolutionRegistryHash: result.receipt.evolutionRegistryHash,
    journeyStates: result.receipt.journeyStates,
    canonicalWorkNodeRef: result.receipt.canonicalWorkNodeRef,
    canonicalWorkNodeFinalState: result.receipt.canonicalWorkNodeFinalState,
    duplicateRecurrenceSuppressed: result.receipt.duplicateRecurrenceSuppressed,
    externalEffectsExecuted: result.receipt.externalEffectsExecuted,
    modelWeightsChanged: result.receipt.modelWeightsChanged,
    semanticFingerprint: result.receipt.semanticFingerprint
  }, null, 2));
  if (result.receipt.state !== 'PASS') process.exitCode = 1;
}

// [VXG RealForever]
