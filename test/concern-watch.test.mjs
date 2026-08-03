import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  CONCERN_EVENT_TYPES,
  CONCERN_LIFECYCLE_STATES,
  CONCERN_OBSERVATION_REQUIRED_FIELDS,
  CONCERN_OUTCOMES,
  archiveConcern,
  closeConcern,
  createConcernAggregate,
  createConcernClosureReceipt,
  createConcernObservation,
  createConcernProjectionRelay,
  createConcernSchedulerAdmissionReceipt,
  createConcernWatchEvidenceConsumptionReceipt,
  createHumanAttentionRequest,
  createRecoveryConcernEvidence,
  deriveConcernSubject,
  evaluateConcernThreshold,
  formConcernAdmissionReview,
  projectConcernAggregate,
  recordConcernAdmissionReview,
  recordConcernObservation,
  recordConcernSchedulerAdmission,
  recordHumanAttentionRequest,
  recordRecoveryConcernEvidence,
  recordThresholdEvaluation,
  reopenConcernFromRecurrence,
  restoreConcernAggregate,
  runDeterministicConcernWatchJourney,
  serializeConcernAggregate,
  validateConcernAggregate,
  validateConcernObservation,
  validateConcernWatchRegistry,
  validateIntegratedConcernWatchReceipt
} from '../src/core/concern-watch.mjs';
import { admitIntentSchedulerQueue } from '../src/core/intent-scheduler.mjs';
import {
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { createResourceSnapshot } from '../src/core/resource-admission.mjs';
import { createSchedulerRuntimeTrustSnapshot } from '../src/core/scheduler-runtime-trust.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1').replaceAll('/', process.platform === 'win32' ? '\\' : '/');
const bundle = loadBlueprint(ROOT);
const registry = bundle.blueprint.concernWatch;
const schedulerContext = {
  intentRegistry: bundle.intentRegistry,
  schedulerRegistry: bundle.schedulerRegistry,
  registeredProcessRefs: bundle.factory.processes.map((item) => item.processRef),
  registeredRoleRefs: bundle.blueprint.roles.map((item) => item.roleRef)
};
const T0 = '2026-08-02T10:00:00.000Z';
const at = (seconds) => new Date(Date.parse(T0) + seconds * 1000).toISOString();
const integrated = runDeterministicConcernWatchJourney({ registry, schedulerContext });

function readdress(value, refField, prefix) {
  const core = structuredClone(value);
  delete core[refField];
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  return { ...core, [refField]: `${prefix}.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint };
}

function subjectBinding(subject, sourceBinding) {
  const binding = {
    concernSubjectRef: subject.concernSubjectRef,
    concernSubjectFingerprint: subject.semanticFingerprint,
    subjectAnchorFingerprint: subject.subjectAnchorFingerprint
  };
  return {
    ...binding,
    sourceAdmissionFingerprint: semanticHash({ ...binding, sourceBinding })
  };
}

function observation(suffix, overrides = {}) {
  const sourceBindingValue = {
    sourceRef: overrides.sourceRef ?? `source.concern-watch.test.${suffix}`,
    sourceFingerprint: overrides.sourceFingerprint ?? semanticHash({ source: suffix, meaning: overrides.meaning ?? 'exact writer collision risk' }),
    sourceRangeOrEventRef: overrides.sourceRangeOrEventRef ?? `source-event.concern-watch.test.${suffix}`
  };
  return createConcernObservation({
    ...sourceBindingValue,
    observedAt: overrides.observedAt ?? at(1),
    observerRef: overrides.observerRef ?? 'observer.concern-watch.test',
    aboutScopeRef: overrides.aboutScopeRef ?? 'project.vexlife',
    concernClass: overrides.concernClass ?? 'SCOPE_OR_AUTHORITY',
    signalClass: overrides.signalClass ?? 'FAILED_CHECK',
    certaintyClass: overrides.certaintyClass ?? 'SUPPORTED',
    impactClass: overrides.impactClass ?? 'HIGH',
    reversibilityClass: overrides.reversibilityClass ?? 'PARTIALLY_REVERSIBLE',
    humanAttentionClass: overrides.humanAttentionClass ?? 'ONLY_IF_THRESHOLD_MET',
    evidenceOriginClass: overrides.evidenceOriginClass ?? 'INDEPENDENT_CHECK',
    evidenceRefs: overrides.evidenceRefs ?? [`evidence.concern-watch.test.${suffix}`],
    unknownRefs: overrides.unknownRefs ?? [],
    policySignals: overrides.policySignals ?? { costOfWaiting: 'MEDIUM' },
    subjectBinding: overrides.subject ? subjectBinding(overrides.subject, sourceBindingValue) : overrides.subjectBinding,
    recurrenceBinding: overrides.recurrenceBinding,
    ...(overrides.extra ?? {})
  }, { registry });
}

function initialFixture(suffix = 'initial', overrides = {}) {
  const first = observation(`${suffix}.1`, overrides.first ?? {});
  const subject = deriveConcernSubject({ observations: [first], subjectKind: overrides.subjectKind ?? 'SCOPE_RISK' }, { registry });
  let aggregate = createConcernAggregate({ subject, formedAt: overrides.formedAt ?? at(0) }, { registry });
  aggregate = recordConcernObservation(aggregate, first, { registry }).aggregate;
  return { first, subject, aggregate };
}

function highConsequenceFixture(suffix = 'high', overrides = {}) {
  const fixture = initialFixture(suffix, { first: {
    observedAt: at(1), signalClass: 'FAILED_CHECK', certaintyClass: 'VERIFIED', impactClass: 'CRITICAL',
    reversibilityClass: 'UNKNOWN', humanAttentionClass: overrides.humanAttentionClass ?? 'ONLY_IF_THRESHOLD_MET',
    evidenceOriginClass: 'INDEPENDENT_CHECK', policySignals: overrides.policySignals ?? { costOfWaiting: 'CRITICAL' }
  } });
  const threshold = evaluateConcernThreshold(fixture.aggregate, { observedAt: at(2) }, { registry });
  const aggregate = recordThresholdEvaluation(fixture.aggregate, threshold, { registry }).aggregate;
  return { ...fixture, threshold, aggregate };
}

function testSchedulerBindingRefs(nodes) {
  return Object.fromEntries(schedulerContext.intentRegistry.bindingFields.map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => Array.isArray(item[field]) ? item[field] : [item[field]]).filter(Boolean))].sort()
  ]));
}

function testSchedulerProposal(suffix, { claimRef = `claim.concern-watch.test.${suffix}` } = {}) {
  const intentRef = `intent.concern-watch.test.${suffix}`;
  const workNodeRef = `work-node.concern-watch.test.${suffix}`;
  const intent = createIntentEnvelope({
    intentRef,
    originMessageRef: `message.${intentRef}`,
    originSpeakerRef: 'person.test.human',
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.vexlife',
    threadRef: `thread.concern-watch.test.${suffix}`,
    channelRef: `channel.concern-watch.test.${suffix}`,
    originalContentHash: semanticHash({ source: 'ConcernWatch scheduler test', suffix }),
    desiredOutcome: { intentKey: 'CONCERN_WATCH_NO_EFFECT_TEST', summary: 'Exercise external scheduler authority' },
    constraints: ['NO_EXTERNAL_EFFECTS', 'NO_MODEL_TURN'],
    createdAt: at(0),
    sourceLineageRef: `lineage.concern-watch.test.${suffix}`
  }, schedulerContext.intentRegistry);
  const node = createWorkNode({
    workNodeRef,
    rootIntentRef: intentRef,
    purpose: `Schedule exact ConcernWatch fixture ${suffix}`,
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.developer',
    priorityClass: 'HIGH',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.${workNodeRef}`,
    effectEnvelopeRef: `effect-envelope.${workNodeRef}`,
    resourceEnvelopeRef: `resource-envelope.${workNodeRef}`,
    expectedTransitionRef: `expected-transition.${workNodeRef}`,
    completionGateRefs: [`completion-gate.${workNodeRef}`],
    returnRouteRef: `return-route.concern-watch.test.${suffix}`,
    sourceRefs: [`source.concern-watch.scheduler.test.${suffix}`],
    createdAt: at(0)
  }, schedulerContext.intentRegistry);
  let priorState = 'CAPTURED';
  const transitions = ['DECOMPOSED', 'PLAN_VALIDATED', 'READY'].map((nextState, sequence) => {
    const transition = {
      transitionRef: `transition.concern-watch.test.${suffix}.${sequence}`,
      workNodeRef,
      sequence,
      priorState,
      nextState,
      reason: 'ConcernWatch scheduler test formation',
      actorRef: 'vex.test',
      actorRoleRef: 'role.vex.developer',
      processRef: 'process.vexlife.intent.verify-transition',
      sourceRefs: [`source.transition.concern-watch.${suffix}`],
      createdAt: at(sequence)
    };
    priorState = nextState;
    return transition;
  });
  const workgraph = createIntentWorkgraph({
    graphRef: `intent-workgraph.concern-watch.test.${suffix}`,
    intent,
    nodes: [node],
    transitions,
    receipts: [],
    bindingRefs: testSchedulerBindingRefs([node]),
    createdAt: at(0)
  }, schedulerContext.intentRegistry);
  return { intent, node, workgraph, claimRef };
}

function reviewFixture(suffix = 'review', proposalOverrides = {}) {
  const fixture = highConsequenceFixture(suffix);
  const proposal = testSchedulerProposal(suffix, proposalOverrides);
  const review = formConcernAdmissionReview(fixture.aggregate, {
    proposedWorkRef: proposal.node.workNodeRef,
    intentEnvelopeRef: proposal.intent.intentRef,
    intentEnvelopeFingerprint: proposal.intent.semanticFingerprint,
    workgraphRef: proposal.workgraph.graphRef,
    workgraphFingerprint: proposal.workgraph.semanticFingerprint,
    workNodeRef: proposal.node.workNodeRef,
    workNodeFingerprint: proposal.node.semanticFingerprint,
    dependencyRefs: proposal.node.dependencyRefs,
    pathClaimRefs: [`claim.concern-watch.test.${suffix}`],
    capabilityRefs: [proposal.node.capabilityEnvelopeRef],
    effectRefs: [proposal.node.effectEnvelopeRef],
    returnRouteRef: proposal.node.returnRouteRef,
    formedAt: at(3)
  }, { registry });
  const aggregate = recordConcernAdmissionReview(fixture.aggregate, review, { registry }).aggregate;
  return { ...fixture, proposal, review, aggregate };
}

function schedulerAuthorityEvidence(fixture) {
  const suffix = fixture.review.workNodeRef.split('.').at(-1);
  const { intentRegistry, schedulerRegistry } = schedulerContext;
  const sourceRef = 'source.intent-scheduler.test-runtime';
  const sourceHash = semanticHash({ source: 'ConcernWatch external scheduler test/v1' });
  const schedulerGeneration = 1;
  const workerRef = 'worker.model.test.primary';
  const formedAt = at(4);
  const observedAt = at(5);
  const expiresAt = at(60);
  const trustSnapshot = createIntentTrustSnapshot({
    schemaVersion: 'vexlife.intent-trust-snapshot/v0',
    snapshotRef: `trust-snapshot.concern-watch.test.${suffix}`,
    sourceRef: 'test/concern-watch.test.mjs#scheduler-authority',
    formationRef: 'formation.concern-watch.test.trust',
    formedAt: at(0),
    currentness: 'CURRENT',
    bindingRefs: testSchedulerBindingRefs(fixture.proposal.workgraph.nodes),
    actorRefs: ['person.test.human', 'vex.test'],
    decisionRefs: [],
    authorizationBindings: []
  }, intentRegistry);
  const resourceSnapshot = createResourceSnapshot({
    snapshotRef: `resource-snapshot.concern-watch.test.${suffix}`,
    generation: schedulerGeneration,
    sourceRef,
    sourceHash,
    formationRef: `formation.concern-watch.test.resource.${suffix}`,
    evidenceClass: 'SIMULATED_CURRENT',
    cpuLoadPct: 20,
    cpuConcurrencyLimit: 4,
    cpuActiveCount: 0,
    ramAvailableMb: 16384,
    ramReservedMb: 1024,
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
    formedAt,
    observedAt,
    expiresAt
  });
  const runtimeTrustSnapshot = createSchedulerRuntimeTrustSnapshot({
    snapshotRef: `runtime-snapshot.concern-watch.test.${suffix}`,
    sourceRef,
    sourceHash,
    formationRef: `formation.concern-watch.test.runtime.${suffix}`,
    evidenceClass: 'SIMULATED_CURRENT',
    schedulerGeneration,
    formedAt,
    observedAt,
    expiresAt,
    workerRef,
    actorRef: 'vex.test',
    roleRef: fixture.proposal.node.roleRef,
    claimRef: fixture.proposal.claimRef,
    occupancyRef: `occupancy.concern-watch.test.${suffix}`,
    leaseAuthorityRef: 'authority.intent-scheduler.test-runtime',
    resourceSnapshotRef: resourceSnapshot.snapshotRef,
    resourceSnapshotFingerprint: resourceSnapshot.semanticFingerprint,
    currentness: 'CURRENT'
  }, { schedulerRegistry, resourceSnapshot });
  const workNodeRef = fixture.proposal.node.workNodeRef;
  const common = {
    runtimeSnapshotRef: runtimeTrustSnapshot.snapshotRef,
    runtimeSnapshotFingerprint: runtimeTrustSnapshot.semanticFingerprint,
    schedulerGeneration,
    authorityRef: runtimeTrustSnapshot.leaseAuthorityRef,
    sourceRef,
    sourceHash,
    formedAt,
    observedAt,
    expiresAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE'
  };
  const schedulerOptions = {
    trustSnapshot,
    runtimeTrustSnapshot,
    resourceSnapshot,
    resourceRequestByNodeRef: {
      [workNodeRef]: { cpuSlots: 1, ramMb: 64, vramMb: 0, modelTurn: false, heavyTool: false, background: false }
    },
    occupancyByNodeRef: {
      [workNodeRef]: {
        occupancyRef: runtimeTrustSnapshot.occupancyRef,
        actorRef: runtimeTrustSnapshot.actorRef,
        roleRef: fixture.proposal.node.roleRef,
        workNodeRef,
        graphFingerprint: fixture.proposal.workgraph.semanticFingerprint,
        claimRef: fixture.proposal.claimRef,
        formationRef: `formation.concern-watch.test.occupancy.${suffix}`,
        ...common
      }
    },
    capabilityLeaseByNodeRef: {
      [workNodeRef]: {
        leaseRef: `capability-lease.concern-watch.test.${suffix}`,
        workNodeRef,
        graphFingerprint: fixture.proposal.workgraph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: fixture.proposal.node.capabilityEnvelopeRef,
        formationRef: `formation.concern-watch.test.capability.${suffix}`,
        toolRefs: [],
        ...common
      }
    },
    effectLeaseByNodeRef: {
      [workNodeRef]: {
        leaseRef: `effect-lease.concern-watch.test.${suffix}`,
        workNodeRef,
        graphFingerprint: fixture.proposal.workgraph.semanticFingerprint,
        trustSnapshotFingerprint: trustSnapshot.semanticFingerprint,
        envelopeRef: fixture.proposal.node.effectEnvelopeRef,
        formationRef: `formation.concern-watch.test.effect.${suffix}`,
        effectDisposition: 'NO_EFFECTS',
        allowedEffectRefs: [],
        ...common
      }
    },
    resourceLeaseRefByNodeRef: { [workNodeRef]: `resource-lease.concern-watch.test.${suffix}` },
    recoveryResourceBindingByNodeRef: {},
    workerRef,
    schedulerGeneration,
    fairnessMaxDeferrals: schedulerRegistry.fairnessPolicy.maxDeferrals,
    fairnessLedger: {},
    formedAt,
    expiresAt,
    observedAt
  };
  const schedulerQueue = admitIntentSchedulerQueue(fixture.proposal.workgraph, {
    ...schedulerOptions,
    ...schedulerContext
  });
  return {
    ...schedulerContext,
    workgraph: fixture.proposal.workgraph,
    schedulerOptions,
    schedulerQueue
  };
}

function schedulerInput(fixture, legacyOverrides = {}) {
  return { schedulerAuthorityEvidence: schedulerAuthorityEvidence(fixture), ...legacyOverrides };
}

function admittedFixture(suffix = 'admitted') {
  const fixture = reviewFixture(suffix);
  const admission = createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review, schedulerInput(fixture), { registry });
  const aggregate = recordConcernSchedulerAdmission(fixture.aggregate, admission, { registry }).aggregate;
  return { ...fixture, admission, aggregate };
}

function recoveryFixture(suffix = 'recovery') {
  const fixture = admittedFixture(suffix);
  const recovery = createRecoveryConcernEvidence(fixture.aggregate, {
    recoveryAggregateRef: `aggregate.runtime-recovery.${suffix}`,
    recoveryAggregateFingerprint: semanticHash({ recovery: suffix }),
    failureRef: `failure.concern-watch.${suffix}`,
    failureFingerprint: semanticHash({ failure: suffix }),
    recoveryDisposition: 'RETRY_WITH_CURRENT_EVIDENCE',
    schedulerCurrentnessReceiptRef: fixture.admission.schedulerCurrentnessReceiptRef,
    schedulerCurrentnessReceiptFingerprint: fixture.admission.schedulerCurrentnessReceiptFingerprint,
    schedulerCurrentness: 'CURRENT',
    currentness: 'CURRENT',
    evidenceRefs: [`evidence.recovery.concern-watch.${suffix}`],
    observedAt: at(6)
  }, { registry });
  const aggregate = recordRecoveryConcernEvidence(fixture.aggregate, recovery, { registry }).aggregate;
  return { ...fixture, recovery, aggregate };
}

function resolvedFixture(suffix = 'resolved', disposition = 'RESOLVED_WATCH_FOR_RECURRENCE') {
  const fixture = recoveryFixture(suffix);
  const closure = createConcernClosureReceipt(fixture.aggregate, {
    disposition,
    evidenceRefs: [fixture.recovery.recoveryConcernEvidenceRef],
    schedulerCompletion: {
      completionReceiptRef: `receipt.scheduler-completion.${suffix}`,
      completionReceiptFingerprint: semanticHash({ completion: suffix }),
      schedulerAggregateFingerprint: semanticHash({ scheduler: suffix, completed: true }),
      workNodeRef: fixture.admission.workNodeRef,
      workNodeFingerprint: fixture.admission.workNodeFingerprint,
      state: 'COMPLETED',
      currentness: 'CURRENT',
      observedAt: at(7)
    },
    closedByRef: 'scheduler.concern-watch.test',
    closedAt: at(8)
  }, { registry });
  const aggregate = closeConcern(fixture.aggregate, closure, { registry }).aggregate;
  return { ...fixture, closure, aggregate };
}

test('CW0 source observations are immutable, content-addressed, and never self-accepting', () => {
  const source = observation('cw0');
  assert.equal(validateConcernObservation(source, { registry }).ok, true);
  assert.equal(Object.isFrozen(source), true);
  assert.equal(Object.hasOwn(source, 'acceptedConcern'), false);
  assert.equal(Object.hasOwn(source, 'state'), false);
  assert.throws(() => observation('cw0.self', { extra: { state: 'ADMITTED_WORK' } }), /cannot author state/);
  const forged = structuredClone(source);
  forged.impactClass = 'LOW';
  assert.equal(validateConcernObservation(forged, { registry }).ok, false);
});

test('CW1 source-derived semantic subjects distinguish nearby meaning and exclude scope or urgency', () => {
  const source = observation('cw1.source');
  const subject = deriveConcernSubject({ observations: [source], subjectKind: 'SCOPE_RISK' }, { registry });
  const sameSourceDifferentScope = observation('cw1.scope', {
    sourceRef: source.sourceRef,
    sourceFingerprint: source.sourceFingerprint,
    sourceRangeOrEventRef: source.sourceRangeOrEventRef,
    aboutScopeRef: 'project.other',
    impactClass: 'LOW'
  });
  const sameSubject = deriveConcernSubject({ observations: [sameSourceDifferentScope], subjectKind: 'SCOPE_RISK' }, { registry });
  const differentMeaning = observation('cw1.different', { meaning: 'different nearby concern' });
  const differentSubject = deriveConcernSubject({ observations: [differentMeaning], subjectKind: 'SCOPE_RISK' }, { registry });
  assert.equal(subject.concernSubjectRef, sameSubject.concernSubjectRef);
  assert.notEqual(subject.concernSubjectRef, differentSubject.concernSubjectRef);
  assert.throws(() => createConcernObservation({ ...source, concernSubjectRef: subject.concernSubjectRef }, { registry }), /cannot author concernSubjectRef/);
});

test('review finding 1 rejects unrelated first sources and unbound subsequent sources at record and replay', () => {
  const sourceA = observation('finding1.source-a');
  const subjectA = deriveConcernSubject({ observations: [sourceA], subjectKind: 'SCOPE_RISK' }, { registry });
  const empty = createConcernAggregate({ subject: subjectA, formedAt: at(0) }, { registry });
  const unrelatedB = observation('finding1.source-b', { subject: subjectA });
  const before = empty.semanticFingerprint;
  assert.throws(() => recordConcernObservation(empty, unrelatedB, { registry }), /first observation source binding/);
  assert.equal(empty.semanticFingerprint, before);
  assert.equal(empty.observations.length, 0);

  const initial = recordConcernObservation(empty, sourceA, { registry }).aggregate;
  const validSecond = observation('finding1.second', { observedAt: at(2), subject: subjectA });
  const unboundSecond = observation('finding1.second-unbound', {
    sourceRef: validSecond.sourceRef,
    sourceFingerprint: validSecond.sourceFingerprint,
    sourceRangeOrEventRef: validSecond.sourceRangeOrEventRef,
    observedAt: at(2),
    evidenceRefs: ['evidence.concern-watch.test.finding1.second-unbound']
  });
  assert.throws(() => recordConcernObservation(initial, unboundSecond, { registry }), /subject lineage/);

  const forgedFirstReplay = JSON.parse(serializeConcernAggregate(initial, { registry }));
  forgedFirstReplay.events[0].payload.observation = unrelatedB;
  forgedFirstReplay.events[0] = readdress(forgedFirstReplay.events[0], 'eventRef', 'concern-event.observation-recorded');
  assert.throws(() => restoreConcernAggregate(JSON.stringify(forgedFirstReplay), { registry }), /first observation source binding/);

  const withSecond = recordConcernObservation(initial, validSecond, { registry }).aggregate;
  const forgedSubsequentReplay = JSON.parse(serializeConcernAggregate(withSecond, { registry }));
  forgedSubsequentReplay.events[1].payload.observation = unboundSecond;
  forgedSubsequentReplay.events[1] = readdress(forgedSubsequentReplay.events[1], 'eventRef', 'concern-event.observation-recorded');
  assert.throws(() => restoreConcernAggregate(JSON.stringify(forgedSubsequentReplay), { registry }), /subject lineage/);
});

test('CW2 duplicate evidence, observation, and restart recurrence are once-only semantic no-ops', () => {
  const fixture = initialFixture('cw2');
  const duplicate = recordConcernObservation(fixture.aggregate, fixture.first, { registry });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.aggregate.semanticFingerprint, fixture.aggregate.semanticFingerprint);
  const sameEvidence = observation('cw2.same-evidence', {
    observedAt: at(2), subject: fixture.subject, evidenceRefs: fixture.first.evidenceRefs
  });
  const result = recordConcernObservation(fixture.aggregate, sameEvidence, { registry });
  assert.equal(result.changed, false);
  const restored = restoreConcernAggregate(serializeConcernAggregate(fixture.aggregate, { registry }), { registry });
  assert.equal(recordConcernObservation(restored, fixture.first, { registry }).changed, false);
  assert.throws(() => observation('cw2.duplicates', { evidenceRefs: ['evidence.duplicate', 'evidence.duplicate'] }), /duplicate evidence/);
});

test('CW3 dormant watches consume no physical model worker or effect authority', () => {
  const fixture = initialFixture('cw3', { first: {
    signalClass: 'MODEL_INFERENCE', certaintyClass: 'LOW_CONFIDENCE', impactClass: 'LOW', evidenceOriginClass: 'MODEL_INFERENCE'
  } });
  const threshold = evaluateConcernThreshold(fixture.aggregate, { observedAt: at(2) }, { registry });
  assert.equal(threshold.thresholdCrossed, false);
  assert.equal(registry.schedulerIntegration.dormantWatchConsumesPhysicalWorker, false);
  assert.equal(registry.schedulerIntegration.dormantWatchConsumesEffectAuthority, false);
  assert.equal(integrated.receipt.dormantPhysicalWorkers, 0);
  assert.equal(integrated.receipt.dormantEffectAuthorities, 0);
});

test('CW4 threshold policy is source-managed and caller threshold, priority, or urgency substitution fails closed', () => {
  const fixture = initialFixture('cw4');
  assert.throws(() => evaluateConcernThreshold(fixture.aggregate, { observedAt: at(2), thresholdOverride: 0 }, { registry }), /substitution/);
  assert.throws(() => evaluateConcernThreshold(fixture.aggregate, { observedAt: at(2), priorityOverride: 'INTERACTIVE' }, { registry }), /substitution/);
  assert.throws(() => evaluateConcernThreshold(fixture.aggregate, { observedAt: at(2), urgency: 'PANIC' }, { registry }), /substitution/);
  const substituted = structuredClone(registry);
  substituted.thresholdPolicy.standardActivation.minimumIndependentEvidence = 1;
  assert.throws(() => validateConcernAggregate(fixture.aggregate, { registry: substituted }), /policy is stale or substituted/);
});

test('CW5 repeated model inference cannot raise urgency and requests independent evidence', () => {
  const fixture = initialFixture('cw5', { first: {
    signalClass: 'MODEL_INFERENCE', certaintyClass: 'LOW_CONFIDENCE', impactClass: 'HIGH', evidenceOriginClass: 'MODEL_INFERENCE',
    policySignals: { activeRecoveryOrIncident: true, resourcePressure: 'CRITICAL', costOfWaiting: 'CRITICAL' }
  } });
  const second = observation('cw5.2', {
    observedAt: at(2), subject: fixture.subject, signalClass: 'MODEL_INFERENCE', certaintyClass: 'LOW_CONFIDENCE',
    impactClass: 'CRITICAL', evidenceOriginClass: 'MODEL_INFERENCE',
    policySignals: { activeRecoveryOrIncident: true, resourcePressure: 'CRITICAL', costOfWaiting: 'CRITICAL' }
  });
  const aggregate = recordConcernObservation(fixture.aggregate, second, { registry }).aggregate;
  const threshold = evaluateConcernThreshold(aggregate, { observedAt: at(3) }, { registry });
  assert.equal(threshold.outcome, 'EVIDENCE_REQUIRED');
  assert.equal(threshold.thresholdCrossed, false);
  assert.equal(threshold.modelRepetitionRaisedUrgency, false);
  assert.equal(threshold.recommendedPriorityClass, 'BACKGROUND');
  assert.equal(threshold.statistics.context.activeRecoveryOrIncident, false);
  assert.equal(threshold.statistics.modelContext.activeRecoveryOrIncident, true);
  assert.equal(threshold.statistics.modelContextUsedForPriority, false);
});

test('review finding 2 source-managed identities prevent fresh evidence refs from manufacturing a 3/3 threshold', () => {
  const fixture = initialFixture('finding2');
  let aggregate = fixture.aggregate;
  for (const [suffix, observedAt] of [['2', at(2)], ['3', at(3)]]) {
    const repeated = observation(`finding2.${suffix}`, {
      sourceRef: fixture.first.sourceRef,
      sourceFingerprint: fixture.first.sourceFingerprint,
      sourceRangeOrEventRef: fixture.first.sourceRangeOrEventRef,
      observerRef: fixture.first.observerRef,
      evidenceOriginClass: fixture.first.evidenceOriginClass,
      observedAt,
      subject: fixture.subject,
      evidenceRefs: [`evidence.concern-watch.test.finding2.fresh-${suffix}`]
    });
    aggregate = recordConcernObservation(aggregate, repeated, { registry }).aggregate;
  }
  const threshold = evaluateConcernThreshold(aggregate, { observedAt: at(4) }, { registry });
  assert.equal(threshold.statistics.observationCount, 3);
  assert.equal(threshold.statistics.independentEvidenceCount, 1);
  assert.equal(threshold.statistics.recurrenceCount, 1);
  assert.equal(threshold.statistics.independenceIdentities.length, 1);
  assert.equal(threshold.statistics.recurrenceIdentities.length, 1);
  assert.equal(threshold.thresholdCrossed, false);
  assert.equal(threshold.outcome, 'EVIDENCE_REQUIRED');
});

test('CW6 one exact registered high-consequence observation may activate immediately', () => {
  const fixture = highConsequenceFixture('cw6');
  assert.equal(fixture.threshold.thresholdCrossed, true);
  assert.equal(fixture.threshold.ruleRef, registry.thresholdPolicy.singleObservationHighConsequenceRule.ruleRef);
  assert.equal(fixture.aggregate.state, 'THRESHOLD_MET');
  const nearby = initialFixture('cw6.nearby', { first: {
    signalClass: 'MODEL_INFERENCE', certaintyClass: 'VERIFIED', impactClass: 'CRITICAL', reversibilityClass: 'UNKNOWN', evidenceOriginClass: 'MODEL_INFERENCE'
  } });
  assert.equal(evaluateConcernThreshold(nearby.aggregate, { observedAt: at(2) }, { registry }).thresholdCrossed, false);
});

test('CW7 projections emit once for changed evidence and stale or duplicate evidence is a semantic no-op', () => {
  const fixture = initialFixture('cw7');
  const relay = createConcernProjectionRelay(fixture.aggregate, { registry });
  assert.equal(relay.update(fixture.aggregate).changed, false);
  const changedObservation = observation('cw7.2', { observedAt: at(2), subject: fixture.subject });
  const changed = recordConcernObservation(fixture.aggregate, changedObservation, { registry }).aggregate;
  assert.equal(relay.update(changed).changed, true);
  assert.equal(relay.revision, 1);
  assert.equal(relay.update(recordConcernObservation(changed, changedObservation, { registry }).aggregate).changed, false);
  assert.equal(relay.revision, 1);
});

test('CW8 threshold crossing produces review only; exact Workgraph and scheduler evidence separately admits work', () => {
  const fixture = reviewFixture('cw8');
  assert.equal(fixture.aggregate.state, 'ADMISSION_REVIEW');
  assert.equal(fixture.aggregate.schedulerAdmissions.length, 0);
  assert.equal(fixture.review.executionAuthorityGranted, false);
  const admission = createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review, schedulerInput(fixture), { registry });
  const admitted = recordConcernSchedulerAdmission(fixture.aggregate, admission, { registry }).aggregate;
  assert.equal(admitted.state, 'ADMITTED_WORK');
  assert.equal(admitted.schedulerAdmissions.length, 1);
  assert.equal(admission.externalEffectsAuthorized, false);
  assert.equal(integrated.receipt.workgraphRef.startsWith('intent-workgraph.'), true);
});

test('CW9 concern priority cannot bypass dependencies or preempt active interactive work', () => {
  const fixture = reviewFixture('cw9');
  assert.throws(() => createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review,
    schedulerInput(fixture, { dependencyState: 'BLOCKED' }), { registry }), /caller-authored.*dependencyState/);
  assert.throws(() => createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review,
    schedulerInput(fixture, { activeInteractiveWorkState: 'PREEMPTED' }), { registry }), /caller-authored.*activeInteractiveWorkState/);
  assert.throws(() => createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review,
    schedulerInput(fixture, { acceptedPriorityClass: 'INTERACTIVE' }), { registry }), /caller-authored.*acceptedPriorityClass/);
});

test('CW10 overlapping concern routes cannot hold two writers or admit the same concern twice', () => {
  const fixture = reviewFixture('cw10');
  const before = fixture.aggregate.semanticFingerprint;
  assert.throws(() => createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review,
    schedulerInput(fixture, { conflictingWriterRefs: ['writer.overlap.concern-watch'] }), { registry }), /caller-authored.*conflictingWriterRefs/);
  assert.equal(fixture.aggregate.semanticFingerprint, before);
  assert.throws(() => createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review,
    schedulerInput(fixture, { writerClaimRef: 'claim.concern-watch.test.detached' }), { registry }), /caller-authored.*writerClaimRef/);
  assert.throws(() => createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review,
    schedulerInput(fixture, { pathClaimFingerprint: '0'.repeat(64) }), { registry }), /caller-authored.*pathClaimFingerprint/);
  const admission = createConcernSchedulerAdmissionReceipt(fixture.aggregate, fixture.review, schedulerInput(fixture), { registry });
  const admitted = recordConcernSchedulerAdmission(fixture.aggregate, admission, { registry }).aggregate;
  assert.throws(() => createConcernSchedulerAdmissionReceipt(admitted, fixture.review, schedulerInput(fixture), { registry }), /not current|ADMISSION_REVIEW/);
});

test('second correction revalidates every external scheduler binding at record, replay, and integrated-consumer boundaries', () => {
  const fixture = reviewFixture('second-correction');
  const validAdmission = createConcernSchedulerAdmissionReceipt(
    fixture.aggregate,
    fixture.review,
    schedulerInput(fixture),
    { registry }
  );
  const admitted = recordConcernSchedulerAdmission(fixture.aggregate, validAdmission, { registry }).aggregate;
  const serialized = serializeConcernAggregate(admitted, { registry });
  const other = reviewFixture('second-correction-unrelated');
  const unrelatedAdmission = createConcernSchedulerAdmissionReceipt(
    other.aggregate,
    other.review,
    schedulerInput(other),
    { registry }
  );
  const mutations = [
    ['authority evidence schema', 'evidence', (value) => { value.schemaVersion = 'vexlife.concern-scheduler-authority-evidence/forged'; }],
    ['authority evidence contract', 'evidence', (value) => { value.contractRef = 'contract.vexlife.concern-scheduler-authority-evidence/forged'; }],
    ['scheduler validation route', 'evidence', (value) => { value.validationRouteRef = 'caller.recomputed.scheduler'; }],
    ['Intent envelope ref', 'evidence', (value) => { value.workgraph.intent.intentRef = 'intent.unrelated'; }],
    ['Intent envelope fingerprint', 'evidence', (value) => { value.workgraph.intent.semanticFingerprint = '0'.repeat(64); }],
    ['Workgraph ref', 'evidence', (value) => { value.workgraph.graphRef = 'intent-workgraph.unrelated'; }],
    ['Workgraph fingerprint', 'evidence', (value) => { value.workgraph.semanticFingerprint = '0'.repeat(64); }],
    ['work-node ref', 'evidence', (value) => { value.workgraph.nodes[0].workNodeRef = 'work-node.unrelated'; }],
    ['work-node fingerprint', 'evidence', (value) => { value.workgraph.nodes[0].semanticFingerprint = '0'.repeat(64); }],
    ['scheduler aggregate fingerprint', 'receipt', (value) => { value.schedulerAggregateFingerprint = '0'.repeat(64); }],
    ['scheduler currentness receipt ref', 'receipt', (value) => { value.schedulerCurrentnessReceiptRef = 'admission.intent-scheduler.unrelated'; }],
    ['scheduler currentness receipt fingerprint', 'receipt', (value) => { value.schedulerCurrentnessReceiptFingerprint = '0'.repeat(64); }],
    ['external admission schema', 'receipt', (value) => { value.externalSchedulerAdmissionSchemaVersion = 'vexlife.intent-scheduler-admission-receipt/forged'; }],
    ['external admission contract', 'receipt', (value) => { value.externalSchedulerAdmissionContractRef = 'contract.intent-scheduler.forged'; }],
    ['scheduler generation', 'receipt', (value) => { value.schedulerGeneration += 1; }],
    ['writer claim', 'receipt', (value) => { value.writerClaimRef = 'claim.unrelated'; }],
    ['path claim fingerprint', 'receipt', (value) => { value.pathClaimFingerprint = '0'.repeat(64); }],
    ['accepted priority', 'receipt', (value) => { value.acceptedPriorityClass = 'BACKGROUND'; }],
    ['dependency state', 'receipt', (value) => { value.dependencyState = 'BLOCKED'; }],
    ['interactive state', 'receipt', (value) => { value.activeInteractiveWorkState = 'PREEMPTED'; }],
    ['formation chronology', 'receipt', (value) => { value.formedAt = at(2); }],
    ['observation chronology', 'receipt', (value) => { value.observedAt = at(3); }],
    ['expiry/currentness', 'receipt', (value) => { value.expiresAt = at(5); }],
    ['scheduler queue aggregate', 'evidence', (value) => { value.schedulerQueue.semanticFingerprint = '0'.repeat(64); }],
    ['scheduler queue currentness receipt', 'evidence', (value) => { value.schedulerQueue.admissionReceipt.semanticFingerprint = '0'.repeat(64); }],
    ['scheduler queue generation', 'evidence', (value) => { value.schedulerQueue.generation += 1; }],
    ['scheduler queue schema', 'evidence', (value) => { value.schedulerQueue.admissionReceipt.schemaVersion = 'vexlife.intent-scheduler-admission-receipt/forged'; }],
    ['external writer/path authority', 'evidence', (value) => {
      const workNodeRef = Object.keys(value.schedulerOptions.occupancyByNodeRef)[0];
      value.schedulerOptions.occupancyByNodeRef[workNodeRef].claimRef = 'claim.unrelated';
    }],
    ['unrelated well-formed scheduler material', 'evidence', (value) => {
      Object.assign(value, structuredClone(unrelatedAdmission.schedulerAuthorityEvidence));
    }]
  ];
  const forgeAdmission = (sourceAdmission, layer, mutate) => {
    const forged = structuredClone(sourceAdmission);
    if (layer === 'evidence') {
      const evidence = structuredClone(forged.schedulerAuthorityEvidence);
      mutate(evidence);
      forged.schedulerAuthorityEvidence = readdress(
        evidence,
        'schedulerAuthorityEvidenceRef',
        'evidence.concern-watch.scheduler-authority'
      );
      forged.schedulerAuthorityEvidenceRef = forged.schedulerAuthorityEvidence.schedulerAuthorityEvidenceRef;
      forged.schedulerAuthorityEvidenceFingerprint = forged.schedulerAuthorityEvidence.semanticFingerprint;
    } else mutate(forged);
    return readdress(forged, 'schedulerAdmissionRef', 'concern-scheduler-admission');
  };
  const recordBefore = fixture.aggregate.semanticFingerprint;
  const replayBefore = admitted.semanticFingerprint;
  const integratedBefore = integrated.receipt.causalEvidence.resolvedAggregate.semanticFingerprint;
  for (const [label, layer, mutate] of mutations) {
    const forgedRecordAdmission = forgeAdmission(validAdmission, layer, mutate);
    assert.throws(
      () => recordConcernSchedulerAdmission(fixture.aggregate, forgedRecordAdmission, { registry }),
      /scheduler|external|authority|currentness|chronology|expiry|stale|detached|forged/,
      `${label} record boundary`
    );
    assert.equal(fixture.aggregate.semanticFingerprint, recordBefore, `${label} record rejection mutated aggregate`);

    const forgedReplay = JSON.parse(serialized);
    const schedulerEventIndex = forgedReplay.events.findIndex((event) => event.type === 'SCHEDULER_ADMITTED');
    forgedReplay.events[schedulerEventIndex].payload.schedulerAdmission = forgedRecordAdmission;
    forgedReplay.events[schedulerEventIndex] = readdress(
      forgedReplay.events[schedulerEventIndex],
      'eventRef',
      'concern-event.scheduler-admitted'
    );
    assert.throws(
      () => restoreConcernAggregate(JSON.stringify(forgedReplay), { registry }),
      /scheduler|external|authority|currentness|chronology|expiry|stale|detached|forged/,
      `${label} replay boundary`
    );
    assert.equal(admitted.semanticFingerprint, replayBefore, `${label} replay rejection mutated aggregate`);

    const forgedIntegrated = structuredClone(integrated.receipt);
    forgedIntegrated.causalEvidence.schedulerAdmission = forgeAdmission(
      forgedIntegrated.causalEvidence.schedulerAdmission,
      layer,
      mutate
    );
    const readdressedIntegrated = readdress(
      forgedIntegrated,
      'receiptRef',
      'receipt.concern-watch.integrated'
    );
    const result = validateIntegratedConcernWatchReceipt(readdressedIntegrated, { registry });
    assert.equal(result.ok, false, `${label} integrated-consumer boundary`);
    assert.match(
      result.errors.join('; '),
      /scheduler|external|authority|currentness|chronology|expiry|stale|detached|forged/,
      `${label} integrated-consumer reason`
    );
    assert.equal(
      integrated.receipt.causalEvidence.resolvedAggregate.semanticFingerprint,
      integratedBefore,
      `${label} integrated rejection mutated aggregate`
    );
  }
});

test('CW11 recovery failure or hold becomes exact current concern evidence and stale prior-cycle evidence rejects', () => {
  const fixture = recoveryFixture('cw11');
  assert.equal(fixture.aggregate.recoveryEvidence.length, 1);
  assert.equal(fixture.aggregate.recoveryEvidence[0].failureRef, fixture.recovery.failureRef);
  assert.equal(recordRecoveryConcernEvidence(fixture.aggregate, fixture.recovery, { registry }).changed, false);
  const prior = admittedFixture('cw11.stale');
  assert.throws(() => createRecoveryConcernEvidence(prior.aggregate, {
    recoveryAggregateRef: 'aggregate.runtime-recovery.stale', recoveryAggregateFingerprint: semanticHash({ stale: true }),
    failureRef: 'failure.stale', failureFingerprint: semanticHash({ failure: 'stale' }), recoveryDisposition: 'HELD',
    schedulerCurrentnessReceiptRef: prior.admission.schedulerCurrentnessReceiptRef,
    schedulerCurrentnessReceiptFingerprint: prior.admission.schedulerCurrentnessReceiptFingerprint,
    schedulerCurrentness: 'STALE', currentness: 'CURRENT', evidenceRefs: ['evidence.stale'], observedAt: at(6)
  }, { registry }), /stale/);
});

test('CW12 human attention route asks only the smallest explicit decision and never uses Victor as message bus', () => {
  const fixture = highConsequenceFixture('cw12', { humanAttentionClass: 'DECISION_REQUIRED' });
  assert.equal(fixture.threshold.outcome, 'HUMAN_ATTENTION_REQUIRED');
  const request = createHumanAttentionRequest(fixture.aggregate, {
    whyVictorIsNeeded: 'Only Victor can choose whether this bounded risk is accepted.',
    smallestDecisionOrEvidence: 'Choose accept risk or keep the hold.',
    availableOptions: ['ACCEPT_RISK', 'KEEP_HOLD'],
    recommendedOption: 'KEEP_HOLD',
    consequenceOfWaiting: 'The proposed work remains unadmitted.',
    safeUntil: at(60),
    returnRouteRef: 'return-route.concern-watch.operations',
    formedAt: at(3)
  }, { registry });
  const waiting = recordHumanAttentionRequest(fixture.aggregate, request, { registry }).aggregate;
  assert.equal(waiting.state, 'WAITING_HUMAN');
  assert.equal(request.agentRelayRequestedFromVictor, false);
  assert.equal(request.operationalClosureRequestedFromVictor, false);
  assert.throws(() => createHumanAttentionRequest(fixture.aggregate, {
    whyVictorIsNeeded: 'Need choice', smallestDecisionOrEvidence: 'Choose', availableOptions: ['ONLY_ONE'],
    recommendedOption: 'ONLY_ONE', consequenceOfWaiting: 'Held', returnRouteRef: 'return.test', formedAt: at(3)
  }, { registry }), /options/);
});

test('CW13 resolution removes active Queue, Terrain, Guide, and priority while preserving immutable history', () => {
  const fixture = resolvedFixture('cw13');
  const projection = projectConcernAggregate(fixture.aggregate, { registry });
  assert.equal(fixture.aggregate.state, 'RESOLVED');
  assert.equal(fixture.aggregate.active, false);
  assert.equal(fixture.aggregate.queuePriorityActive, false);
  assert.equal(projection.views.QUEUE, null);
  assert.equal(projection.views.TERRAIN, null);
  assert.equal(projection.views.GUIDE, null);
  assert.ok(fixture.aggregate.observations.length > 0);
  assert.ok(fixture.aggregate.events.length > 0);
  const archived = archiveConcern(fixture.aggregate, { archivedAt: at(9), archivedByRef: 'role.vex.operations' }, { registry });
  assert.equal(archived.aggregate.state, 'ARCHIVED');
  assert.equal(archived.aggregate.observations.length, fixture.aggregate.observations.length);
});

test('review finding 3 rejects re-addressed closure vocabulary, schema, and projection contradictions at record and replay', () => {
  const fixture = initialFixture('finding3', { first: {
    impactClass: 'CRITICAL', certaintyClass: 'SUPPORTED', unknownRefs: ['unknown.concern-watch.finding3']
  } });
  const threshold = evaluateConcernThreshold(fixture.aggregate, { observedAt: at(2) }, { registry });
  const held = recordThresholdEvaluation(fixture.aggregate, threshold, { registry }).aggregate;
  assert.equal(held.state, 'HELD_UNKNOWN');
  const validClosure = createConcernClosureReceipt(held, {
    disposition: 'RESOLVED_NO_RECURRENCE_EXPECTED',
    evidenceRefs: [fixture.first.evidenceRefs[0]],
    closedByRef: 'role.vex.operations',
    closedAt: at(3)
  }, { registry });
  const closed = closeConcern(held, validClosure, { registry }).aggregate;
  const closedSerialized = serializeConcernAggregate(closed, { registry });
  const mutations = [
    ['schema', (value) => { value.schemaVersion = 'vexlife.concern-closure-receipt/forged'; }],
    ['contract', (value) => { value.contractRef = 'contract.vexlife.concern-closure/forged'; }],
    ['disposition', (value) => { value.disposition = 'FORGED_RESOLUTION'; }],
    ['recurrence', (value) => { value.recurrenceWatch = true; }],
    ['history', (value) => { value.historyRetained = false; }],
    ['projection', (value) => { value.activeProjectionRemoved = false; }],
    ['queue', (value) => { value.queuePriorityRemoved = false; }]
  ];
  for (const [label, mutate] of mutations) {
    const changed = structuredClone(validClosure);
    mutate(changed);
    const forgedClosure = readdress(changed, 'closureRef', 'concern-closure');
    assert.throws(() => closeConcern(held, forgedClosure, { registry }), /closure|disposition|unknown/, `${label} record boundary`);

    const forgedReplay = JSON.parse(closedSerialized);
    const closureEventIndex = forgedReplay.events.length - 1;
    forgedReplay.events[closureEventIndex].payload.closure = forgedClosure;
    forgedReplay.events[closureEventIndex] = readdress(
      forgedReplay.events[closureEventIndex],
      'eventRef',
      'concern-event.concern-closed'
    );
    assert.throws(() => restoreConcernAggregate(JSON.stringify(forgedReplay), { registry }), /closure|disposition|unknown/, `${label} replay boundary`);
  }
  assert.equal(held.state, 'HELD_UNKNOWN');
  assert.equal(held.closures.length, 0);
});

test('CW14 recurrence after closure reopens only through the exact prior concern and closure lineage', () => {
  const fixture = resolvedFixture('cw14');
  const priorLineage = {
    priorConcernAggregateRef: fixture.aggregate.aggregateRef,
    priorConcernAggregateFingerprint: fixture.aggregate.semanticFingerprint,
    priorClosureRef: fixture.closure.closureRef,
    priorClosureFingerprint: fixture.closure.semanticFingerprint
  };
  const recurrence = observation('cw14.recurrence', {
    observedAt: at(10), subject: fixture.subject, recurrenceBinding: priorLineage
  });
  const reopened = reopenConcernFromRecurrence(fixture.aggregate, recurrence, { formedAt: at(9) }, { registry });
  assert.equal(reopened.cycle, fixture.aggregate.cycle + 1);
  assert.equal(reopened.root.priorLineage.priorConcernAggregateRef, fixture.aggregate.aggregateRef);
  const wrong = observation('cw14.wrong', {
    observedAt: at(10), subject: fixture.subject,
    recurrenceBinding: { ...priorLineage, priorConcernAggregateFingerprint: '0'.repeat(64) }
  });
  assert.throws(() => reopenConcernFromRecurrence(fixture.aggregate, wrong, { formedAt: at(9) }, { registry }), /wrong prior|stale/);
});

test('CW15 restart replay rejects duplicate, forged, stale, same-ref/different-content, and prior-cycle events', () => {
  const fixture = recoveryFixture('cw15');
  const serialized = serializeConcernAggregate(fixture.aggregate, { registry });
  assert.equal(restoreConcernAggregate(serialized, { registry }).semanticFingerprint, fixture.aggregate.semanticFingerprint);
  const duplicate = JSON.parse(serialized);
  duplicate.events.push(structuredClone(duplicate.events.at(-1)));
  assert.throws(() => restoreConcernAggregate(JSON.stringify(duplicate), { registry }), /stale|sequence|duplicate/);
  const forged = JSON.parse(serialized);
  forged.events[0].payload.observation.impactClass = 'LOW';
  assert.throws(() => restoreConcernAggregate(JSON.stringify(forged), { registry }), /forged|different content/);
  const priorCycle = JSON.parse(serialized);
  priorCycle.events[0].cycle += 1;
  assert.throws(() => restoreConcernAggregate(JSON.stringify(priorCycle), { registry }), /prior-cycle|forged/);
});

test('CW16 Queue, Terrain, Health, Guide, and human inbox derive compactly from one replayed aggregate', () => {
  const fixture = admittedFixture('cw16');
  const projection = projectConcernAggregate(fixture.aggregate, { registry });
  assert.equal(projection.sourceAggregateFingerprint, fixture.aggregate.semanticFingerprint);
  assert.ok(projection.views.QUEUE);
  assert.ok(projection.views.TERRAIN);
  assert.ok(projection.views.GUIDE);
  assert.equal(projection.views.HEALTH.activeConcernRef, fixture.aggregate.aggregateRef);
  const encoded = JSON.stringify(projection);
  assert.equal(encoded.includes('"observations"'), false);
  assert.equal(encoded.includes('"evidenceRefs"'), false);
  assert.equal(projection.rawObservationHistoryIncluded, false);
  assert.equal(projection.rawEvidencePayloadIncluded, false);
});

test('CW17 PR-ready and Health independently consume the exact integrated ConcernWatch receipt', () => {
  assert.equal(integrated.prReadyReceipt.consumerRef, 'PR_READY');
  assert.equal(integrated.healthReceipt.consumerRef, 'HEALTH');
  assert.notEqual(integrated.prReadyReceipt.consumptionReceiptRef, integrated.healthReceipt.consumptionReceiptRef);
  assert.equal(integrated.prReadyReceipt.integratedReceiptFingerprint, integrated.receipt.semanticFingerprint);
  assert.equal(integrated.healthReceipt.integratedReceiptFingerprint, integrated.receipt.semanticFingerprint);
  const substituted = structuredClone(integrated.receipt);
  substituted.workNodeFingerprint = '0'.repeat(64);
  assert.throws(() => createConcernWatchEvidenceConsumptionReceipt(substituted, 'HEALTH', { observedAt: at(100) }, { registry }), /invalid|forged/);
  const unrelated = resolvedFixture('cw17.parallel');
  const unrelatedLineage = {
    priorConcernAggregateRef: unrelated.aggregate.aggregateRef,
    priorConcernAggregateFingerprint: unrelated.aggregate.semanticFingerprint,
    priorClosureRef: unrelated.closure.closureRef,
    priorClosureFingerprint: unrelated.closure.semanticFingerprint
  };
  const unrelatedObservation = observation('cw17.parallel.recurrence', {
    observedAt: at(10), subject: unrelated.subject, recurrenceBinding: unrelatedLineage
  });
  const unrelatedRecurrence = reopenConcernFromRecurrence(unrelated.aggregate, unrelatedObservation, { formedAt: at(9) }, { registry });
  const parallel = structuredClone(integrated.receipt);
  parallel.resolvedConcernAggregateRef = unrelated.aggregate.aggregateRef;
  parallel.resolvedConcernAggregateFingerprint = unrelated.aggregate.semanticFingerprint;
  parallel.resolvedClosureRef = unrelated.closure.closureRef;
  parallel.recurrenceConcernAggregateRef = unrelatedRecurrence.aggregateRef;
  parallel.recurrenceConcernAggregateFingerprint = unrelatedRecurrence.semanticFingerprint;
  parallel.recurrencePriorConcernAggregateRef = unrelated.aggregate.aggregateRef;
  parallel.causalEvidence.resolvedAggregate = unrelated.aggregate;
  parallel.causalEvidence.recurrenceAggregate = unrelatedRecurrence;
  const readdressedParallel = readdress(parallel, 'receiptRef', 'receipt.concern-watch.integrated');
  assert.equal(validateIntegratedConcernWatchReceipt(readdressedParallel, { registry }).ok, false);
});

test('CW18 Blueprint composition, repository gates, proof vocabulary, and no-effect boundaries remain exact-current', () => {
  const validation = validateBlueprint(bundle);
  assert.deepEqual(validation.errors, []);
  assert.equal(validateConcernWatchRegistry(registry).ok, true);
  assert.deepEqual(registry.observationContract.requiredFields, [...CONCERN_OBSERVATION_REQUIRED_FIELDS]);
  assert.deepEqual(registry.vocabularies.lifecycleStates, [...CONCERN_LIFECYCLE_STATES]);
  assert.deepEqual(registry.vocabularies.outcomes, [...CONCERN_OUTCOMES]);
  assert.deepEqual(registry.lifecycleContract.eventTypes, [...CONCERN_EVENT_TYPES]);
  assert.deepEqual(registry.integratedJourney.proofRefs, Array.from({ length: 19 }, (_, index) => `CW${index}`));
  const checks = new Set(bundle.buildHealth.checks.map((item) => item.checkRef));
  for (const ref of ['check.tests', 'check.manifest', 'check.browser-integration']) assert.ok(checks.has(ref));
  for (const ref of ['workflow.dco', 'workflow.manifest-linux', 'workflow.manifest-windows']) assert.ok(integrated.receipt.repositoryGateRefs.includes(ref));
  assert.equal(integrated.receipt.externalEffectsExecuted, false);
  assert.equal(integrated.receipt.modelTurnsExecuted, 0);
  assert.equal(validateIntegratedConcernWatchReceipt(integrated.receipt, { registry }).ok, true);
});

test('adversarial scope, hidden hold, forged subject, caller urgency, stale scheduler, and detached causal proof fail closed', () => {
  const fixture = initialFixture('adversarial');
  const wrongScope = observation('adversarial.scope', { observedAt: at(2), subject: fixture.subject, aboutScopeRef: 'project.other' });
  assert.throws(() => recordConcernObservation(fixture.aggregate, wrongScope, { registry }), /wrong project/);
  const validSubject = observation('adversarial.subject', { observedAt: at(2), subject: fixture.subject });
  const forgedSubjectValue = structuredClone(validSubject);
  forgedSubjectValue.subjectBinding.concernSubjectFingerprint = '0'.repeat(64);
  const forgedSubject = readdress(forgedSubjectValue, 'concernObservationRef', 'concern-observation');
  assert.throws(() => recordConcernObservation(fixture.aggregate, forgedSubject, { registry }), /subject/);
  assert.throws(() => observation('adversarial.urgency', { extra: { urgency: 'CRITICAL' } }), /cannot author urgency/);
  const held = initialFixture('adversarial.held', { first: {
    impactClass: 'CRITICAL', certaintyClass: 'SUPPORTED', unknownRefs: ['unknown.concern-watch.hidden-gap']
  } });
  const heldReceipt = evaluateConcernThreshold(held.aggregate, { observedAt: at(2) }, { registry });
  const heldAggregate = recordThresholdEvaluation(held.aggregate, heldReceipt, { registry }).aggregate;
  assert.equal(heldAggregate.state, 'HELD_UNKNOWN');
  assert.equal(projectConcernAggregate(heldAggregate, { registry }).views.HEALTH.state, 'ATTENTION');
  const review = reviewFixture('adversarial.scheduler');
  assert.throws(() => createConcernSchedulerAdmissionReceipt(review.aggregate, review.review,
    schedulerInput(review, { currentness: 'STALE' }), { registry }), /caller-authored.*currentness/);
  const detached = structuredClone(integrated.receipt);
  detached.recurrencePriorConcernAggregateRef = 'aggregate.detached.parallel-fixture';
  assert.equal(validateIntegratedConcernWatchReceipt(detached, { registry }).ok, false);
});

// [VXG RealForever]
