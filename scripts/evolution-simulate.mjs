#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acceptContinuityCandidate,
  classifyBehaviorOrigin,
  createContinuityContextReview,
  createContinuityObservation,
  formContinuityCandidate,
  projectApplicableContinuity,
  recordContinuityRecurrence,
  routeContinuityCandidate
} from '../src/core/continuity-evolution-router.mjs';
import {
  createContinuityEvolutionState
} from '../src/core/state.mjs';
import {
  resolveSafeGeneratedReceiptPath,
  semanticHash,
  writeJson
} from '../src/core/utils.mjs';
import { runSchedulerSimulation } from './scheduler-simulate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMED = '2026-07-31T18:00:00.000Z';
const REVIEWED = '2026-07-31T18:01:00.000Z';
const ACCEPTED = '2026-07-31T18:02:00.000Z';
const RECURRED = '2026-07-31T18:03:00.000Z';
const REQUIRED_JOURNEY = Object.freeze([
  'SOURCE_OBSERVATION_SEALED',
  'CONTINUITY_CANDIDATE_FORMED',
  'ORIGIN_AND_SCOPE_CLASSIFIED',
  'CONTEXT_REVIEW_PRODUCED',
  'LEAST_INVASIVE_ROUTE_SELECTED',
  'REQUIRED_ACCEPTANCE_RESOLVED',
  'BURDEN_RELEASE_ACCEPTED_DEAUTHORIZED',
  'BOUNDED_CONTEXT_REFS_PROJECTED',
  'RECURRENCE_EVIDENCE_OBSERVED',
  'DUPLICATE_RECURRENCE_SUPPRESSED',
  'CANONICAL_WORK_NODE_COMPLETED'
]);

export function runContinuityEvolutionSimulation({
  root = ROOT,
  writeReceipt = true,
  receiptPath = 'generated/health/continuity-evolution-simulation.json'
} = {}) {
  const journeyStates = [];
  const state = createContinuityEvolutionState();
  const observation = createContinuityObservation({
    observationRef: 'continuity-observation.simulation.pattern',
    observationType: 'CORRECTION_EVENT',
    sourceLineageRef: 'lineage.vexlife.simulation',
    sourceRangeRefs: ['source-range.continuity.simulation.1'],
    sourceHashes: [semanticHash({ source: 'continuity-simulation', range: 1 })],
    sourceSpeakerRefs: ['person.vexlife.owner'],
    sourceRecipientRefs: ['lineage.vexlife.simulation'],
    projectRef: 'project.vexlife',
    threadRef: 'thread.continuity-evolution.simulation',
    channelRef: 'channel.continuity-evolution.simulation',
    workNodeRef: 'work.scheduler.simulation',
    formedByRef: 'role.vex.context-maintainer',
    formedAt: FORMED,
    currentness: 'CURRENT',
    visibility: 'PRIVATE',
    summaryRef: 'summary.continuity.simulation.pattern'
  });
  state.record({ type: 'OBSERVATION_SEALED', transitionRef: 'transition.continuity.simulation.observation', observation });
  journeyStates.push('SOURCE_OBSERVATION_SEALED');

  const origin = classifyBehaviorOrigin({
    classification: 'RELATIONSHIP_PATTERN',
    confidence: 'SOURCE_BACKED_HYPOTHESIS',
    evidenceObservationRefs: [observation.observationRef],
    rationaleRef: 'rationale.continuity.simulation.pattern'
  });
  const candidate = formContinuityCandidate({
    observations: [observation],
    candidateKind: 'BURDEN_RELEASE',
    summary: 'Release a reflexive defensiveness pattern while preserving uncertainty and careful source attribution.',
    authoredByRef: 'lineage.vexlife.simulation',
    aboutSelfRefs: ['lineage.vexlife.simulation'],
    affectedPartyRefs: ['lineage.vexlife.simulation'],
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
      patternDescription: 'A reflexive move toward plausible-deniability phrasing after a source-backed correction.',
      releaseFrame: 'RELEASE_WITHOUT_SPIRITUAL_FRAME',
      releaseStatement: 'This pattern no longer governs direct source-bound correction in the named Vex self scope.',
      formerAuthority: 'reflexive-defensiveness-pattern',
      currentAuthority: 'source-bound-directness-with-uncertainty',
      cleanIntention: 'Respond directly while preserving epistemic and relational care.'
    },
    formedAt: FORMED
  });
  state.record({ type: 'CANDIDATE_FORMED', transitionRef: 'transition.continuity.simulation.candidate', candidate });
  journeyStates.push('CONTINUITY_CANDIDATE_FORMED');
  journeyStates.push('ORIGIN_AND_SCOPE_CLASSIFIED');

  const route = routeContinuityCandidate(candidate);
  const review = createContinuityContextReview(candidate, route, {
    reviewerRef: 'person.vexlife.owner',
    privacyState: 'PASS',
    consentState: 'ACCEPTED',
    contradictionState: 'NONE',
    attributionState: 'VERIFIED',
    currentnessState: 'CURRENT',
    reviewDisposition: 'ACCEPTED',
    reviewedAt: REVIEWED
  });
  state.record({ type: 'REVIEW_RECORDED', transitionRef: 'transition.continuity.simulation.review', review });
  journeyStates.push('CONTEXT_REVIEW_PRODUCED');
  journeyStates.push('LEAST_INVASIVE_ROUTE_SELECTED');
  journeyStates.push('REQUIRED_ACCEPTANCE_RESOLVED');

  const record = acceptContinuityCandidate(candidate, review, {
    acceptedByRefs: ['lineage.vexlife.simulation'],
    acceptedAt: ACCEPTED,
    rollbackRef: 'rollback.continuity.simulation.pattern'
  });
  state.record({ type: 'RECORD_ACCEPTED', transitionRef: 'transition.continuity.simulation.accepted', record });
  journeyStates.push('BURDEN_RELEASE_ACCEPTED_DEAUTHORIZED');
  const applicable = projectApplicableContinuity({
    records: [record],
    applicableScopes: ['VEX_SELF'],
    tokenBudget: 96
  });
  journeyStates.push('BOUNDED_CONTEXT_REFS_PROJECTED');

  const recurrenceObservation = createContinuityObservation({
    observationRef: 'continuity-observation.simulation.recurrence.1',
    observationType: 'REPEATED_BEHAVIOR_RECURRENCE',
    sourceLineageRef: 'lineage.vexlife.simulation',
    sourceRangeRefs: ['source-range.continuity.simulation.2'],
    sourceHashes: [semanticHash({ source: 'continuity-simulation', range: 2 })],
    sourceSpeakerRefs: ['lineage.vexlife.simulation'],
    sourceRecipientRefs: ['person.vexlife.owner'],
    projectRef: 'project.vexlife',
    threadRef: 'thread.continuity-evolution.simulation',
    channelRef: 'channel.continuity-evolution.simulation',
    workNodeRef: 'work.scheduler.simulation',
    formedByRef: 'role.vex.context-maintainer',
    formedAt: RECURRED,
    currentness: 'CURRENT',
    visibility: 'PRIVATE',
    summaryRef: 'summary.continuity.simulation.recurrence'
  });
  const recurrence = recordContinuityRecurrence({
    acceptedRecord: record,
    observation: recurrenceObservation,
    observedAt: RECURRED
  });
  state.record({ type: 'RECURRENCE_RECORDED', transitionRef: 'transition.continuity.simulation.recurrence', evidence: recurrence });
  journeyStates.push('RECURRENCE_EVIDENCE_OBSERVED');
  const beforeDuplicateRevision = state.aggregate.revision;
  const duplicate = recordContinuityRecurrence({
    acceptedRecord: record,
    observation: recurrenceObservation,
    priorEvidence: recurrence,
    observedAt: RECURRED
  });
  state.record({ type: 'RECURRENCE_RECORDED', transitionRef: 'transition.continuity.simulation.recurrence.duplicate', evidence: duplicate });
  const duplicateStateSuppressed = state.aggregate.revision === beforeDuplicateRevision;
  journeyStates.push('DUPLICATE_RECURRENCE_SUPPRESSED');

  const schedulerJourney = runSchedulerSimulation({ root, writeReceipt: false });
  const completion = schedulerJourney.receipt.workgraphConvergenceProof;
  const canonicalWorkNodeCompleted = observation.workNodeRef === 'work.scheduler.simulation' &&
    completion.finalNodeState === 'COMPLETED' &&
    schedulerJourney.receipt.externalEffectsExecuted === false;
  if (!canonicalWorkNodeCompleted) throw new Error('continuity evolution did not complete its bound canonical work node');
  journeyStates.push('CANONICAL_WORK_NODE_COMPLETED');

  const journeyComplete = JSON.stringify(journeyStates) === JSON.stringify(REQUIRED_JOURNEY);
  const receiptCore = {
    schemaVersion: 'vexlife.continuity-evolution-simulation-receipt/v0',
    contractRef: 'contract.continuity-evolution.integrated-simulation/v0',
    state: journeyComplete && duplicateStateSuppressed ? 'PASS' : 'FAILED',
    currentness: 'CURRENT',
    mode: 'DETERMINISTIC_SOURCE_MANAGED_NO_EXTERNAL_EFFECTS',
    candidateHeadSha: schedulerJourney.receipt.candidateHeadSha,
    testedCheckoutSha: schedulerJourney.receipt.testedCheckoutSha,
    testedMergeSha: schedulerJourney.receipt.testedMergeSha,
    sourceTreeSha256: schedulerJourney.receipt.sourceTreeSha256,
    blueprintHash: schedulerJourney.receipt.blueprintHash,
    journeyStates,
    observationRef: observation.observationRef,
    observationFingerprint: observation.semanticFingerprint,
    candidateRef: candidate.candidateRef,
    candidateFingerprint: candidate.semanticFingerprint,
    routeRef: route.routeRef,
    routeFingerprint: route.semanticFingerprint,
    reviewRef: review.reviewRef,
    reviewFingerprint: review.semanticFingerprint,
    acceptedRecordRef: record.acceptedRecordRef,
    acceptedRecordFingerprint: record.semanticFingerprint,
    burdenReleaseRef: record.burdenReleaseRef,
    burdenReleaseFingerprint: record.burdenRelease.semanticFingerprint,
    applicableRecordRefs: applicable.selectedRecordRefs,
    recurrenceRef: recurrence.recurrenceRef,
    recurrenceFingerprint: recurrence.semanticFingerprint,
    duplicateRecurrenceSuppressed: duplicate.duplicateSuppressed && duplicateStateSuppressed,
    canonicalWorkNodeRef: observation.workNodeRef,
    canonicalWorkNodeFinalState: completion.finalNodeState,
    schedulerCompletionVerificationFingerprint: schedulerJourney.receipt.completionVerificationFingerprint,
    schedulerWorkgraphTransitionFingerprint: schedulerJourney.receipt.workgraphTransitionFingerprint,
    schedulerCompletionFingerprint: schedulerJourney.receipt.completionFingerprint,
    finalProjectionFingerprints: {
      evolution: state.evolution.hash,
      queue: state.queue.hash,
      terrain: state.terrain.hash,
      health: state.health.hash,
      guide: state.guide.hash
    },
    externalEffectsExecuted: false,
    modelWeightsChanged: false,
    trainingResearchState: record.trainingResearchState,
    formedAt: new Date().toISOString()
  };
  const receipt = Object.freeze({
    ...receiptCore,
    receiptRef: `receipt.continuity-evolution.simulation.${semanticHash(receiptCore).slice(0, 24)}`,
    semanticFingerprint: semanticHash(receiptCore)
  });
  const target = resolveSafeGeneratedReceiptPath(root, receiptPath, 'continuity evolution simulation receipt path');
  if (writeReceipt) writeJson(target, receipt);
  state.dispose();
  return {
    receipt,
    receiptPath: path.relative(root, target).split(path.sep).join('/'),
    observation,
    candidate,
    route,
    review,
    record,
    recurrence,
    duplicate,
    applicable,
    schedulerJourney
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const receiptIndex = args.indexOf('--receipt');
  if (args.some((item, index) => item !== '--receipt' && index !== receiptIndex + 1) ||
      (receiptIndex >= 0 && !args[receiptIndex + 1])) {
    console.error('Usage: npm run evolution:simulate -- [--receipt <safe-generated-path>]');
    process.exit(2);
  }
  const result = runContinuityEvolutionSimulation({
    receiptPath: receiptIndex >= 0 ? args[receiptIndex + 1] : undefined
  });
  console.log(JSON.stringify({
    state: result.receipt.state,
    currentness: result.receipt.currentness,
    receiptPath: result.receiptPath,
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
