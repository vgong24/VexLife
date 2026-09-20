import { projectIntentSets, validateIntentWorkgraph } from './intent-validation.mjs';
import {
  ADAPTER_INPUT_SCHEMA,
  SDK_ACCEPTED_MERGE,
  SDK_PROCESS_REF,
  SDK_PROCESS_SOURCE_REF,
  SDK_PROFILE_REF,
  SDK_REQUEST_SCHEMA,
  SDK_RUNTIME_SOURCE_REF,
  consumeStewardshipReceipt,
  formStewardshipRequest
} from './stewardship-orchestration-adapter.mjs';

const PRIORITY_ORDER = new Map([
  ['IMMEDIATE', 0],
  ['HIGH', 1],
  ['NORMAL', 2],
  ['LOW', 3]
]);

function compactNode(node, detail = {}) {
  return {
    workNodeRef: node.workNodeRef,
    purpose: node.purpose,
    state: node.state,
    priorityClass: node.priorityClass,
    processRef: node.processRef,
    returnRouteRef: node.returnRouteRef,
    waitingReason: detail.waitingReason ?? null,
    unmetDependencyRefs: detail.unmetDependencyRefs ?? [],
    blockingReasonRef: detail.blockingReasonRef ?? null,
    requiredHumanDecisionRef: detail.requiredHumanDecisionRef ?? null,
    evidenceSourceRefs: detail.evidenceSourceRefs ?? []
  };
}

function sortNodes(nodes) {
  return [...nodes].sort((left, right) =>
    (PRIORITY_ORDER.get(left.priorityClass) ?? 99) - (PRIORITY_ORDER.get(right.priorityClass) ?? 99) ||
    left.workNodeRef.localeCompare(right.workNodeRef)
  );
}

function nextSafeAction(graph, validation, sets) {
  if (validation.errors.length) {
    return {
      action: 'REPAIR_INVALID_WORKGRAPH',
      workNodeRef: null,
      reason: validation.errors[0],
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  const needsHuman = sortNodes(graph.nodes.filter((node) => ['NEEDS_CLARIFICATION', 'WAITING_HUMAN', 'HELD_UNKNOWN'].includes(node.state)));
  if (needsHuman.length) {
    return {
      action: 'REQUEST_BOUNDED_HUMAN_DECISION',
      workNodeRef: needsHuman[0].workNodeRef,
      reason: needsHuman[0].state,
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  const ready = sortNodes(graph.nodes.filter((node) => sets.ready.includes(node.workNodeRef)));
  if (ready.length) {
    return {
      action: 'PROPOSE_START_READY_NODE',
      workNodeRef: ready[0].workNodeRef,
      reason: 'DEPENDENCY_RECEIPTS_CURRENT',
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  const recoverable = sortNodes(graph.nodes.filter((node) => node.state === 'FAILED_RECOVERABLE'));
  if (recoverable.length) {
    return {
      action: 'PROPOSE_RECOVERY_ROUTE',
      workNodeRef: recoverable[0].workNodeRef,
      reason: recoverable[0].returnRouteRef,
      authority: 'NO_EXECUTION_AUTHORITY'
    };
  }
  return {
    action: 'HOLD_NO_SAFE_ACTION',
    workNodeRef: null,
    reason: sets.terminal.length === graph.nodes.length ? 'GRAPH_TERMINAL' : 'WAITING_FOR_EXACT_EVIDENCE',
    authority: 'NO_EXECUTION_AUTHORITY'
  };
}

export function projectIntentStatus(graph, {
  registry,
  registeredProcessRefs = registry?.processRefs ?? [],
  registeredRoleRefs = [],
  trustSnapshot = null,
  recentLimit = 5
} = {}) {
  const validation = validateIntentWorkgraph(graph, {
    registry,
    registeredProcessRefs,
    registeredRoleRefs,
    trustSnapshot
  });
  const sets = projectIntentSets(graph, { registry });
  const byRef = new Map(graph.nodes.map((node) => [node.workNodeRef, node]));
  const compactRefs = (refs) => refs.map((ref) => {
    const node = byRef.get(ref);
    return node ? compactNode(node, sets.detailsByRef[ref]) : null;
  }).filter(Boolean);
  const happening = graph.nodes.filter((node) => ['CONTEXT_ADMITTED', 'RUNNING', 'WAITING_TOOL', 'VERIFYING'].includes(node.state));
  const needsHuman = graph.nodes.filter((node) => ['NEEDS_CLARIFICATION', 'WAITING_HUMAN', 'HELD_UNKNOWN'].includes(node.state));
  const recentlyCompleted = graph.transitions
    .filter((transition) => ['COMPLETED', 'CONVERGED', 'CLOSED'].includes(transition.nextState))
    .slice(-recentLimit)
    .reverse()
    .map((transition) => ({
      workNodeRef: transition.workNodeRef,
      state: transition.nextState,
      transitionRef: transition.transitionRef,
      createdAt: transition.createdAt
    }));
  return {
    schemaVersion: 'vexlife.intent-status-projection/v0',
    state: validation.state,
    currentness: 'CURRENT',
    graphRef: graph.graphRef,
    intentRef: graph.rootIntentRef,
    whatIsHappeningNow: sortNodes(happening).map((node) => compactNode(node, sets.detailsByRef[node.workNodeRef])),
    ready: compactRefs(sets.ready),
    waiting: compactRefs(sets.waiting),
    needsHuman: sortNodes(needsHuman).map((node) => compactNode(node, sets.detailsByRef[node.workNodeRef])),
    blocked: compactRefs(sets.blocked),
    recentlyCompleted,
    nextSafeAction: nextSafeAction(graph, validation, sets),
    sourceDescent: {
      graphRef: graph.graphRef,
      intentRef: graph.rootIntentRef,
      detailCommand: `npm run intent:status -- --graph <path> --detail`
    },
    validation: {
      errors: validation.errors,
      attentions: validation.attentions,
      topologicalOrder: validation.topologicalOrder
    }
  };
}

export function projectIntentPlan(graph, options = {}) {
  const status = projectIntentStatus(graph, options);
  return {
    schemaVersion: 'vexlife.intent-plan-projection/v0',
    state: status.state,
    currentness: status.currentness,
    graphRef: graph.graphRef,
    intentRef: graph.rootIntentRef,
    topologicalOrder: status.validation.topologicalOrder,
    sets: {
      ready: status.ready.map((node) => node.workNodeRef),
      waiting: status.waiting.map((node) => node.workNodeRef),
      blocked: status.blocked.map((node) => node.workNodeRef)
    },
    nextSafeAction: status.nextSafeAction,
    sourceDescent: status.sourceDescent,
    errors: status.validation.errors,
    attentions: status.validation.attentions
  };
}


const STEWARDSHIP_PROJECTION_SECTIONS = Object.freeze([
  'intent', 'pathFrontier', 'continuity', 'timing', 'authority', 'outcome'
]);
const STEWARDSHIP_CURRENTNESS = Object.freeze(['CURRENT', 'STALE', 'INVALID', 'UNKNOWN']);
const STEWARDSHIP_READINESS = Object.freeze(['READY_NOW', 'DISCUSSION_WELCOME', 'NOT_NOW', 'READINESS_UNKNOWN']);
const STEWARDSHIP_READINESS_EVIDENCE = Object.freeze([
  'EXPLICIT_USER_SIGNAL', 'NEGOTIATED_RELATIONSHIP_ACCOMMODATION',
  'CURRENT_INTERACTION_CONSTRAINT', 'INFERRED_CANDIDATE'
]);
const STEWARDSHIP_REMINDER_CONSENT = Object.freeze(['NOT_OFFERED', 'OFFERED', 'ACCEPTED', 'DECLINED', 'SUPPRESSED']);
const STEWARDSHIP_RESURFACE_MODES = Object.freeze([
  'AT_EXPLICIT_TIME', 'ON_EXPLICIT_TRIGGER', 'ON_NATURAL_RELEVANCE',
  'WHEN_PREREQUISITE_COMPLETES', 'URGENT_ONLY', 'MANUAL_ONLY'
]);
const STEWARDSHIP_DECISION_NEEDS = Object.freeze(['NONE', 'CHOICE', 'DISCUSSION']);
const STEWARDSHIP_ACTOR_CLASSES = Object.freeze(['HUMAN','VEX_AI','DETERMINISTIC_SERVICE','INSTITUTION','EXTERNAL_PROFESSIONAL','EXTERNAL_AUTHORITY']);
const FP64 = /^[a-f0-9]{64}$/u;

const canonicalRefs = (value = []) => [...new Set(value)].sort();
const stableRef = (value) => typeof value === 'string' && value.length > 0 && !/\s/u.test(value);
const stableRefs = (value) => Array.isArray(value) && value.every(stableRef) && new Set(value).size === value.length;

function stewardshipError(code, details = []) {
  const error = new Error(code);
  error.code = code;
  error.errors = canonicalRefs(details.length ? details : [code]);
  return error;
}

function evidenceBase(section, evidence, contract, errors) {
  const missingRef = contract?.missingProducerRefs?.[section] ?? ('missing-producer.intent.stewardship.' + section);
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    errors.push(missingRef);
    return false;
  }
  const allowed = contract?.semanticProducerRefs?.[section] ?? [];
  if (!stableRef(evidence.producerRef) || !allowed.includes(evidence.producerRef)) {
    errors.push('STEWARDSHIP_' + section.toUpperCase() + '_PRODUCER_NOT_SOURCE_MANAGED');
  }
  if (!FP64.test(evidence.producerFingerprint ?? '')) {
    errors.push('STEWARDSHIP_' + section.toUpperCase() + '_PRODUCER_FINGERPRINT_INVALID');
  }
  if (!stableRefs(evidence.sourceRefs) || !evidence.sourceRefs.includes(evidence.producerRef)) {
    errors.push('STEWARDSHIP_' + section.toUpperCase() + '_SOURCE_REFS_INVALID');
  }
  if (!STEWARDSHIP_CURRENTNESS.includes(evidence.currentness)) {
    errors.push('STEWARDSHIP_' + section.toUpperCase() + '_CURRENTNESS_INVALID');
  } else if (evidence.currentness !== 'CURRENT') {
    errors.push('STEWARDSHIP_' + section.toUpperCase() + '_NOT_CURRENT');
  }
  return true;
}

function exactCurrentAssignment(graph, assignmentRef, workNodeRef) {
  return (graph.acceptedAssignments ?? []).find((assignment) =>
    assignment.assignmentRef === assignmentRef &&
    assignment.workNodeRef === workNodeRef &&
    assignment.assignmentState === 'CURRENT'
  ) ?? null;
}

function validateSchedulerEvidence(graph, work, assignment, schedulerEvidence, errors) {
  if (!schedulerEvidence || typeof schedulerEvidence !== 'object') {
    errors.push('STEWARDSHIP_SCHEDULER_EVIDENCE_REQUIRED');
    return;
  }
  if (!stableRefs(schedulerEvidence.sourceRefs) || schedulerEvidence.sourceRefs.length === 0) {
    errors.push('STEWARDSHIP_SCHEDULER_SOURCE_REFS_INVALID');
  }
  const admission = schedulerEvidence.admissionReceipt;
  const occupancy = schedulerEvidence.occupancy;
  const capabilityLease = schedulerEvidence.capabilityLease;
  const effectLease = schedulerEvidence.effectLease;
  if (!admission ||
      admission.schemaVersion !== 'vexlife.intent-scheduler-admission-receipt/v1' ||
      admission.currentness !== 'CURRENT' || admission.lifecycle !== 'ACTIVE') {
    errors.push('STEWARDSHIP_SCHEDULER_ADMISSION_NOT_CURRENT_ACTIVE');
  }
  if (!occupancy ||
      occupancy.schemaVersion !== 'vexlife.intent-scheduler-occupancy/v1' ||
      occupancy.currentness !== 'CURRENT' || occupancy.lifecycle !== 'ACTIVE') {
    errors.push('STEWARDSHIP_SCHEDULER_OCCUPANCY_NOT_CURRENT_ACTIVE');
  }
  if (!capabilityLease ||
      capabilityLease.schemaVersion !== 'vexlife.intent-capability-lease/v1' ||
      capabilityLease.currentness !== 'CURRENT' || capabilityLease.lifecycle !== 'ACTIVE') {
    errors.push('STEWARDSHIP_CAPABILITY_LEASE_NOT_CURRENT_ACTIVE');
  }
  if (!effectLease ||
      effectLease.schemaVersion !== 'vexlife.intent-effect-lease/v1' ||
      effectLease.currentness !== 'CURRENT' || effectLease.lifecycle !== 'ACTIVE') {
    errors.push('STEWARDSHIP_EFFECT_LEASE_NOT_CURRENT_ACTIVE');
  }
  if (occupancy && (
    occupancy.workNodeRef !== work.workNodeRef ||
    occupancy.graphFingerprint !== graph.semanticFingerprint ||
    occupancy.roleRef !== work.roleRef ||
    occupancy.actorRef !== assignment.assigneeRef
  )) errors.push('STEWARDSHIP_OCCUPANCY_BINDING_MISMATCH');
  if (capabilityLease && (
    capabilityLease.workNodeRef !== work.workNodeRef ||
    capabilityLease.graphFingerprint !== graph.semanticFingerprint ||
    capabilityLease.envelopeRef !== work.capabilityEnvelopeRef
  )) errors.push('STEWARDSHIP_CAPABILITY_LEASE_BINDING_MISMATCH');
  if (effectLease && (
    effectLease.workNodeRef !== work.workNodeRef ||
    effectLease.graphFingerprint !== graph.semanticFingerprint ||
    effectLease.envelopeRef !== work.effectEnvelopeRef ||
    !['NO_EFFECTS','EFFECT_ENVELOPE_BOUND'].includes(effectLease.effectDisposition)
  )) errors.push('STEWARDSHIP_EFFECT_LEASE_BINDING_MISMATCH');
  for (const [label, fingerprint] of [
    ['OCCUPANCY', occupancy?.semanticFingerprint],
    ['CAPABILITY_LEASE', capabilityLease?.semanticFingerprint],
    ['EFFECT_LEASE', effectLease?.semanticFingerprint]
  ]) {
    if (!FP64.test(fingerprint ?? '')) errors.push('STEWARDSHIP_' + label + '_FINGERPRINT_INVALID');
  }
  if (admission && occupancy && capabilityLease && effectLease && (
    admission.graphRef !== graph.graphRef ||
    admission.graphFingerprint !== graph.semanticFingerprint ||
    admission.workNodeRef !== work.workNodeRef ||
    admission.nodeFingerprint !== work.semanticFingerprint ||
    admission.occupancyRef !== occupancy.occupancyRef ||
    admission.occupancyFingerprint !== occupancy.semanticFingerprint ||
    admission.capabilityEnvelopeRef !== work.capabilityEnvelopeRef ||
    admission.capabilityLeaseRef !== capabilityLease.leaseRef ||
    admission.capabilityLeaseFingerprint !== capabilityLease.semanticFingerprint ||
    admission.effectEnvelopeRef !== work.effectEnvelopeRef ||
    admission.effectLeaseRef !== effectLease.leaseRef ||
    admission.effectLeaseFingerprint !== effectLease.semanticFingerprint ||
    admission.returnRouteRef !== work.returnRouteRef
  )) errors.push('STEWARDSHIP_SCHEDULER_ADMISSION_BINDING_MISMATCH');
}

function validateStewardshipSemanticEvidence(graph, work, semanticEvidence, contract, errors) {
  for (const section of STEWARDSHIP_PROJECTION_SECTIONS) {
    evidenceBase(section, semanticEvidence?.[section], contract, errors);
  }
  const intent = semanticEvidence?.intent;
  if (intent) {
    if (!stableRefs(intent.protectedOutcomeRefs) || intent.protectedOutcomeRefs.length === 0) {
      errors.push('STEWARDSHIP_PROTECTED_OUTCOME_REFS_REQUIRED');
    }
    if (!stableRefs(intent.constraintRefs)) errors.push('STEWARDSHIP_CONSTRAINT_REFS_INVALID');
  }

  const path = semanticEvidence?.pathFrontier;
  if (path) {
    const scalarPathFields = [
      'activePathRefOrNull', 'minimalSafePathRefOrNull', 'recommendedPathRefOrNull', 'decisionPathRefOrNull'
    ];
    for (const field of scalarPathFields) {
      if (path[field] !== null && path[field] !== undefined && !stableRef(path[field])) {
        errors.push('STEWARDSHIP_PATH_' + field.toUpperCase() + '_INVALID');
      }
    }
    for (const field of [
      'alternatePathRefs', 'heldPathRefs', 'pathEvidenceRefs',
      'recommendationBasisRefs', 'whatWouldChangeRecommendationRefs'
    ]) {
      if (!stableRefs(path[field])) errors.push('STEWARDSHIP_PATH_' + field.toUpperCase() + '_INVALID');
    }
    if (!STEWARDSHIP_DECISION_NEEDS.includes(path.decisionNeed)) errors.push('STEWARDSHIP_DECISION_NEED_INVALID');
    const pathRefs = [
      path.activePathRefOrNull, path.minimalSafePathRefOrNull, path.recommendedPathRefOrNull,
      path.decisionPathRefOrNull, ...(path.alternatePathRefs ?? []), ...(path.heldPathRefs ?? [])
    ].filter(Boolean);
    if (pathRefs.includes(work.workNodeRef)) errors.push('STEWARDSHIP_WORK_NODE_REF_USED_AS_PATH_REF');
    const planRefs = new Set((graph.proposedPlans ?? []).flatMap((plan) => [plan.planRef, plan.planContentRef]));
    if (pathRefs.some((ref) => planRefs.has(ref))) errors.push('STEWARDSHIP_PLAN_REF_USED_AS_PATH_REF');
    if (path.recommendedPathRefOrNull !== null && (path.recommendationBasisRefs ?? []).length === 0) {
      errors.push('STEWARDSHIP_RECOMMENDATION_BASIS_REQUIRED');
    }
  }

  const continuity = semanticEvidence?.continuity;
  if (continuity) {
    for (const field of ['openLoopRefs','heldOpportunityRefs','waitingExternalRefs','refreshTriggerRefs','materialUnknownRefs']) {
      if (!stableRefs(continuity[field])) errors.push('STEWARDSHIP_CONTINUITY_' + field.toUpperCase() + '_INVALID');
    }
    if (!STEWARDSHIP_CURRENTNESS.includes(continuity.continuityCurrentness)) {
      errors.push('STEWARDSHIP_CONTINUITY_STATE_INVALID');
    }
  }

  const timing = semanticEvidence?.timing;
  if (timing) {
    if (!STEWARDSHIP_READINESS.includes(timing.readinessState)) errors.push('STEWARDSHIP_READINESS_STATE_INVALID');
    if (!STEWARDSHIP_READINESS_EVIDENCE.includes(timing.readinessEvidenceClass)) errors.push('STEWARDSHIP_READINESS_EVIDENCE_CLASS_INVALID');
    if (!stableRefs(timing.readinessEvidenceRefs)) errors.push('STEWARDSHIP_READINESS_EVIDENCE_REFS_INVALID');
    if (!STEWARDSHIP_REMINDER_CONSENT.includes(timing.reminderConsentState)) errors.push('STEWARDSHIP_REMINDER_CONSENT_INVALID');
    if (!STEWARDSHIP_RESURFACE_MODES.includes(timing.resurfaceMode)) errors.push('STEWARDSHIP_RESURFACE_MODE_INVALID');
    if (!stableRefs(timing.reactivationTriggerRefs)) errors.push('STEWARDSHIP_REACTIVATION_TRIGGER_REFS_INVALID');
    if (timing.interruptPolicyRefOrNull !== null && !stableRef(timing.interruptPolicyRefOrNull)) errors.push('STEWARDSHIP_INTERRUPT_POLICY_REF_INVALID');
    if (timing.safeUntilOrNull !== null && Number.isNaN(Date.parse(timing.safeUntilOrNull))) errors.push('STEWARDSHIP_SAFE_UNTIL_INVALID');
    if (['READY_NOW','DISCUSSION_WELCOME'].includes(timing.readinessState) && timing.readinessEvidenceClass === 'INFERRED_CANDIDATE') {
      errors.push('STEWARDSHIP_INFERRED_READINESS_CANNOT_DECLARE_READY');
    }
    if (timing.readinessState === 'NOT_NOW' && timing.readinessEvidenceClass === 'INFERRED_CANDIDATE') {
      errors.push('STEWARDSHIP_INFERENCE_CANNOT_DECLARE_NOT_NOW');
    }
    if (timing.reminderConsentState === 'ACCEPTED' && timing.sourceRefs?.length === 0) {
      errors.push('STEWARDSHIP_REMINDER_CONSENT_REQUIRES_SOURCE');
    }
  }

  const authority = semanticEvidence?.authority;
  if (authority) {
    if (typeof authority.externalAuthorityRequired !== 'boolean') {
      errors.push('STEWARDSHIP_EXTERNAL_AUTHORITY_REQUIRED_INVALID');
    }
    if (!STEWARDSHIP_ACTOR_CLASSES.includes(authority.actorClass)) {
      errors.push('STEWARDSHIP_ACTOR_CLASS_NOT_SOURCE_BOUND');
    }
  }

  const outcome = semanticEvidence?.outcome;
  if (outcome) {
    for (const field of ['effectProposedRefOrNull','effectResultRefOrNull','outcomeVerificationRefOrNull','intentSatisfactionEvidenceRefOrNull']) {
      if (outcome[field] !== null && outcome[field] !== undefined && !stableRef(outcome[field])) {
        errors.push('STEWARDSHIP_OUTCOME_' + field.toUpperCase() + '_INVALID');
      }
    }
    if (typeof outcome.intentSatisfied !== 'boolean') errors.push('STEWARDSHIP_INTENT_SATISFIED_INVALID');
    if (!stableRefs(outcome.residualOpenLoopRefs)) errors.push('STEWARDSHIP_RESIDUAL_OPEN_LOOP_REFS_INVALID');
    if (outcome.intentSatisfied && !outcome.intentSatisfactionEvidenceRefOrNull) {
      errors.push('STEWARDSHIP_INTENT_SATISFACTION_REQUIRES_EXPLICIT_EVIDENCE');
    }
    if (outcome.intentSatisfied && outcome.intentSatisfactionEvidenceRefOrNull === outcome.outcomeVerificationRefOrNull) {
      errors.push('STEWARDSHIP_WORK_COMPLETION_CANNOT_SELF_CERTIFY_INTENT_SATISFACTION');
    }
  }
}

export function inspectIntentStewardshipProjection(graph, {
  registry,
  registeredProcessRefs = registry?.processRefs ?? [],
  registeredRoleRefs = [],
  trustSnapshot = null,
  workNodeRef,
  assignmentRef,
  schedulerEvidence,
  semanticEvidence
} = {}) {
  const errors = [];
  const missingProducerRefs = [];
  const contract = registry?.stewardshipRequestProjectionContract;
  if (!contract || contract.projectionRef !== 'projection.intent.stewardship-request') {
    errors.push('STEWARDSHIP_PROJECTION_CONTRACT_MISSING');
    return { ok:false, errors, missingProducerRefs };
  }
  const validation = validateIntentWorkgraph(graph, {
    registry, registeredProcessRefs, registeredRoleRefs, trustSnapshot
  });
  errors.push(...validation.errors.map((error) => 'WORKGRAPH:' + error));
  const work = (graph.nodes ?? []).find((node) => node.workNodeRef === workNodeRef);
  if (!work) errors.push('STEWARDSHIP_WORK_NODE_MISSING');
  const assignment = exactCurrentAssignment(graph, assignmentRef, workNodeRef);
  if (!assignment) errors.push('STEWARDSHIP_CURRENT_ACCEPTED_ASSIGNMENT_MISSING');

  for (const section of contract.requiredSemanticSections ?? []) {
    if (!semanticEvidence?.[section]) missingProducerRefs.push(contract.missingProducerRefs?.[section] ?? section);
  }
  if (work && assignment) {
    validateSchedulerEvidence(graph, work, assignment, schedulerEvidence, errors);
    validateStewardshipSemanticEvidence(graph, work, semanticEvidence, contract, errors);
  }
  errors.push(...missingProducerRefs);
  return {
    ok:errors.length === 0,
    errors:canonicalRefs(errors),
    missingProducerRefs:canonicalRefs(missingProducerRefs),
    workNodeRef:work?.workNodeRef ?? null,
    assignmentRef:assignment?.assignmentRef ?? null,
    projectionRef:contract.projectionRef
  };
}

export function formIntentStewardshipRequestProjection(graph, options = {}) {
  const inspection = inspectIntentStewardshipProjection(graph, options);
  if (!inspection.ok) throw stewardshipError('INTENT_STEWARDSHIP_REQUEST_PROJECTION_INVALID', inspection.errors);

  const { registry, workNodeRef, assignmentRef, schedulerEvidence, semanticEvidence, caseRef } = options;
  if (!stableRef(caseRef)) throw stewardshipError('STEWARDSHIP_CASE_REF_REQUIRED');
  const contract = registry.stewardshipRequestProjectionContract;
  const work = graph.nodes.find((node) => node.workNodeRef === workNodeRef);
  const assignment = exactCurrentAssignment(graph, assignmentRef, workNodeRef);
  const sourceRefs = canonicalRefs([
    ...(graph.intent?.sourceLineageRef ? [graph.intent.sourceLineageRef] : []),
    ...(work.sourceRefs ?? []),
    ...(assignment.sourceRefs ?? []),
    ...(schedulerEvidence.sourceRefs ?? []),
    ...STEWARDSHIP_PROJECTION_SECTIONS.flatMap((section) => semanticEvidence[section].sourceRefs ?? []),
    'github.issue.vexlife.563',
    SDK_RUNTIME_SOURCE_REF,
    SDK_PROCESS_SOURCE_REF
  ]);
  const materialUnknownRefs = canonicalRefs([
    ...(semanticEvidence.continuity.materialUnknownRefs ?? [])
  ]);
  const requestDraft = {
    schemaVersion:SDK_REQUEST_SCHEMA,
    caseRef,
    intent:{
      rootIntentionRef:graph.rootIntentRef,
      protectedOutcomeRefs:canonicalRefs(semanticEvidence.intent.protectedOutcomeRefs),
      constraintRefs:canonicalRefs(semanticEvidence.intent.constraintRefs),
      sourceRefs:canonicalRefs(semanticEvidence.intent.sourceRefs)
    },
    pathFrontier:{
      activePathRefOrNull:semanticEvidence.pathFrontier.activePathRefOrNull ?? null,
      minimalSafePathRefOrNull:semanticEvidence.pathFrontier.minimalSafePathRefOrNull ?? null,
      recommendedPathRefOrNull:semanticEvidence.pathFrontier.recommendedPathRefOrNull ?? null,
      alternatePathRefs:canonicalRefs(semanticEvidence.pathFrontier.alternatePathRefs),
      heldPathRefs:canonicalRefs(semanticEvidence.pathFrontier.heldPathRefs),
      decisionPathRefOrNull:semanticEvidence.pathFrontier.decisionPathRefOrNull ?? null,
      pathEvidenceRefs:canonicalRefs(semanticEvidence.pathFrontier.pathEvidenceRefs),
      recommendationBasisRefs:canonicalRefs(semanticEvidence.pathFrontier.recommendationBasisRefs),
      whatWouldChangeRecommendationRefs:canonicalRefs(semanticEvidence.pathFrontier.whatWouldChangeRecommendationRefs),
      decisionNeed:semanticEvidence.pathFrontier.decisionNeed
    },
    continuity:{
      activeWorkRefs:canonicalRefs([work.workNodeRef]),
      openLoopRefs:canonicalRefs(semanticEvidence.continuity.openLoopRefs),
      heldOpportunityRefs:canonicalRefs(semanticEvidence.continuity.heldOpportunityRefs),
      waitingExternalRefs:canonicalRefs(semanticEvidence.continuity.waitingExternalRefs),
      refreshTriggerRefs:canonicalRefs(semanticEvidence.continuity.refreshTriggerRefs),
      currentness:semanticEvidence.continuity.continuityCurrentness,
      materialUnknownRefs
    },
    timing:{
      readinessState:semanticEvidence.timing.readinessState,
      readinessEvidenceClass:semanticEvidence.timing.readinessEvidenceClass,
      readinessEvidenceRefs:canonicalRefs(semanticEvidence.timing.readinessEvidenceRefs),
      reminderConsentState:semanticEvidence.timing.reminderConsentState,
      resurfaceMode:semanticEvidence.timing.resurfaceMode,
      safeUntilOrNull:semanticEvidence.timing.safeUntilOrNull ?? null,
      reactivationTriggerRefs:canonicalRefs(semanticEvidence.timing.reactivationTriggerRefs),
      interruptPolicyRefOrNull:semanticEvidence.timing.interruptPolicyRefOrNull ?? null
    },
    responsibility:{
      requiredRoleRefOrNull:work.roleRef,
      requiredCapabilityRefs:[work.capabilityEnvelopeRef],
      currentOccupancyOrNull:{
        occupancyRef:schedulerEvidence.occupancy.occupancyRef,
        roleRef:work.roleRef,
        actorClass:semanticEvidence.authority.actorClass,
        capabilityRefs:[work.capabilityEnvelopeRef],
        capabilityState:'CURRENT',
        authorityState:'CURRENT'
      },
      alternateOccupancies:[],
      externalAuthorityRequired:semanticEvidence.authority.externalAuthorityRequired
    },
    outcome:{
      effectProposedRefOrNull:semanticEvidence.outcome.effectProposedRefOrNull ?? null,
      effectResultRefOrNull:semanticEvidence.outcome.effectResultRefOrNull ?? null,
      outcomeVerificationRefOrNull:semanticEvidence.outcome.outcomeVerificationRefOrNull ?? null,
      intentSatisfied:semanticEvidence.outcome.intentSatisfied,
      residualOpenLoopRefs:canonicalRefs(semanticEvidence.outcome.residualOpenLoopRefs)
    },
    sourceRefs
  };
  const adapterInput = {
    schemaVersion:ADAPTER_INPUT_SCHEMA,
    sdkBinding:{
      processRef:SDK_PROCESS_REF,
      profileRef:SDK_PROFILE_REF,
      acceptedMergeRef:SDK_ACCEPTED_MERGE,
      runtimeSourceRef:SDK_RUNTIME_SOURCE_REF,
      processSourceRef:SDK_PROCESS_SOURCE_REF
    },
    localBindings:{
      graph:{
        graphRef:graph.graphRef,
        graphFingerprint:graph.semanticFingerprint,
        rootIntentRef:graph.rootIntentRef
      },
      work:{
        workNodeRef:work.workNodeRef,
        nodeFingerprint:work.semanticFingerprint,
        roleRef:work.roleRef,
        capabilityEnvelopeRef:work.capabilityEnvelopeRef,
        effectEnvelopeRef:work.effectEnvelopeRef,
        returnRouteRef:work.returnRouteRef
      },
      assignment:{
        assignmentRef:assignment.assignmentRef,
        assignmentFingerprint:assignment.semanticFingerprint,
        sourceIntentRef:assignment.sourceIntentRef,
        workNodeRef:assignment.workNodeRef,
        assigneeRef:assignment.assigneeRef,
        assignmentState:assignment.assignmentState,
        authorityDisposition:assignment.authorityDisposition,
        effectDisposition:assignment.effectDisposition
      },
      occupancy:{
        occupancyRef:schedulerEvidence.occupancy.occupancyRef,
        occupancyFingerprint:schedulerEvidence.occupancy.semanticFingerprint,
        actorRef:schedulerEvidence.occupancy.actorRef,
        actorClass:semanticEvidence.authority.actorClass,
        workNodeRef:schedulerEvidence.occupancy.workNodeRef,
        graphFingerprint:schedulerEvidence.occupancy.graphFingerprint,
        roleRef:schedulerEvidence.occupancy.roleRef,
        currentness:schedulerEvidence.occupancy.currentness,
        lifecycle:schedulerEvidence.occupancy.lifecycle
      },
      capabilityLease:{
        leaseRef:schedulerEvidence.capabilityLease.leaseRef,
        leaseFingerprint:schedulerEvidence.capabilityLease.semanticFingerprint,
        workNodeRef:schedulerEvidence.capabilityLease.workNodeRef,
        graphFingerprint:schedulerEvidence.capabilityLease.graphFingerprint,
        envelopeRef:schedulerEvidence.capabilityLease.envelopeRef,
        currentness:schedulerEvidence.capabilityLease.currentness,
        lifecycle:schedulerEvidence.capabilityLease.lifecycle
      },
      effectLease:{
        leaseRef:schedulerEvidence.effectLease.leaseRef,
        leaseFingerprint:schedulerEvidence.effectLease.semanticFingerprint,
        workNodeRef:schedulerEvidence.effectLease.workNodeRef,
        graphFingerprint:schedulerEvidence.effectLease.graphFingerprint,
        envelopeRef:schedulerEvidence.effectLease.envelopeRef,
        effectDisposition:schedulerEvidence.effectLease.effectDisposition,
        currentness:schedulerEvidence.effectLease.currentness,
        lifecycle:schedulerEvidence.effectLease.lifecycle
      },
      sourceRefs:canonicalRefs([
        ...(work.sourceRefs ?? []),
        ...(assignment.sourceRefs ?? []),
        ...(schedulerEvidence.sourceRefs ?? [])
      ])
    },
    requestDraft
  };
  const formed = formStewardshipRequest(adapterInput);
  return Object.freeze({
    schemaVersion:contract.schemaVersion,
    projectionRef:contract.projectionRef,
    graphRef:graph.graphRef,
    workNodeRef:work.workNodeRef,
    assignmentRef:assignment.assignmentRef,
    returnRouteRef:work.returnRouteRef,
    nextSafeAction:projectIntentStatus(graph, options).nextSafeAction,
    missingProducerRefs:[],
    executionAuthority:'NONE',
    effectAuthority:'NONE',
    adapterInput,
    request:formed.request,
    adapterReceipt:formed.adapterReceipt
  });
}

export function consumeIntentStewardshipRecommendation(projection, sdkReceipt) {
  if (!projection?.adapterInput || projection?.projectionRef !== 'projection.intent.stewardship-request') {
    throw stewardshipError('INTENT_STEWARDSHIP_PROJECTION_REQUIRED');
  }
  const route = consumeStewardshipReceipt(projection.adapterInput, sdkReceipt);
  if (route.returnRouteRef !== projection.returnRouteRef) {
    throw stewardshipError('INTENT_STEWARDSHIP_RETURN_ROUTE_MISMATCH');
  }
  if (route.recommendationOnly !== true || route.executionAuthority !== 'NONE' || route.effectAuthority !== 'NONE') {
    throw stewardshipError('INTENT_STEWARDSHIP_ROUTE_AUTHORITY_COLLAPSE');
  }
  return Object.freeze({
    projectionRef:projection.projectionRef,
    graphRef:projection.graphRef,
    workNodeRef:projection.workNodeRef,
    returnRouteRef:route.returnRouteRef,
    nextTransition:route.nextTransition,
    blockers:[...route.blockers],
    recommendationOnly:true,
    executionAuthority:'NONE',
    effectAuthority:'NONE',
    routeReceipt:route
  });
}

// [VXG RealForever]
