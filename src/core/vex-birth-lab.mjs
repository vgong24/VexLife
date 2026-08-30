// Vex Birth Lab Slice A — pure no-effect state/support projection.
// This module performs no filesystem, network, model, training, activation,
// publication, Home, Memory, NWS, or VexLocalBridge effect.
//
// [VXG RealForever]

export const VEX_BIRTH_LAB_EVIDENCE_SCHEMA =
  'vexlife.vex-birth-lab-evidence/v1';
export const VEX_BIRTH_LAB_STATE_SCHEMA =
  'vexlife.vex-birth-lab-state/v1';
export const VEX_BIRTH_SUPPORT_CONTEXT_SCHEMA =
  'vexlife.vex-birth-support-context/v1';
export const VEX_BIRTH_STATUS_PACKAGE_SCHEMA =
  'vexlife.vex-birth-status-package-model/v1';

export const VEX_BIRTH_CHAPTERS = Object.freeze([
  Object.freeze({
    chapterRef: 'chapter.vex-birth.prepare',
    chapter: 'PREPARE',
    vbStages: Object.freeze(['VB0', 'VB1'])
  }),
  Object.freeze({
    chapterRef: 'chapter.vex-birth.meet-g0',
    chapter: 'MEET_G0',
    vbStages: Object.freeze(['VB2'])
  }),
  Object.freeze({
    chapterRef: 'chapter.vex-birth.cultivate',
    chapter: 'CULTIVATE',
    vbStages: Object.freeze(['VB3'])
  }),
  Object.freeze({
    chapterRef: 'chapter.vex-birth.review-freeze',
    chapter: 'REVIEW_AND_FREEZE',
    vbStages: Object.freeze(['VB4', 'VB5'])
  }),
  Object.freeze({
    chapterRef: 'chapter.vex-birth.train-compare',
    chapter: 'TRAIN_AND_COMPARE',
    vbStages: Object.freeze(['VB6', 'VB7', 'VB8', 'VB9'])
  }),
  Object.freeze({
    chapterRef: 'chapter.vex-birth.accept-reject-wake',
    chapter: 'ACCEPT_REJECT_WAKE',
    vbStages: Object.freeze(['VB10', 'VB11', 'VB12'])
  })
]);

export const VEX_BIRTH_VB_STAGES = Object.freeze(
  VEX_BIRTH_CHAPTERS.flatMap((entry) => entry.vbStages)
);

export const VEX_BIRTH_ANNOTATION_DISPOSITIONS = Object.freeze([
  'TRAIN',
  'COUNTEREXAMPLE',
  'HELD_OUT',
  'DO_NOT_TRAIN',
  'SUPPORT_ONLY'
]);

export const VEX_BIRTH_TRAINING_EFFECT_TRUTHS = Object.freeze([
  'PRE_EXECUTION_NO_EFFECT',
  'OPTIMIZER_ATTEMPT_EFFECT_UNKNOWN',
  'POST_OPTIMIZER_CHANGE_UNKNOWN',
  'POST_OPTIMIZER_UNCHANGED',
  'POST_OPTIMIZER_CHANGED'
]);

const ACCEPTED_RECEIPT_STATES = new Set(['ACCEPTED', 'PASS']);
const SOURCE_CURRENTNESS = new Set(['CURRENT', 'STALE', 'UNKNOWN']);
const MODEL_BINDING_STATES = new Set([
  'BOUND',
  'UNBOUND',
  'HOME_UNAVAILABLE',
  'MISCONFIGURED',
  'UNKNOWN'
]);
const WORKER_LIFECYCLES = new Set([
  'NONE',
  'PREPARED',
  'WORKING',
  'PAUSED',
  'WRAPPING_UP',
  'DONE',
  'FAILED',
  'CANCELLED',
  'UNKNOWN'
]);
const CANDIDATE_DISPOSITIONS = new Set([
  'NONE',
  'ACCEPT',
  'NARROW',
  'REJECT'
]);

const SUPPORT_ACTIONS = Object.freeze([
  Object.freeze({
    actionRef: 'action.birth.status.inspect',
    label: 'View current birth status',
    effectClass: 'READ_ONLY',
    permissionRef: 'permission.none',
    autoExecute: false
  }),
  Object.freeze({
    actionRef: 'action.birth.support.copy',
    label: 'Copy support context',
    effectClass: 'LOCAL_EXPORT',
    permissionRef: 'permission.birth.support-export',
    autoExecute: false
  }),
  Object.freeze({
    actionRef: 'action.birth.status-package.generate',
    label: 'Generate status ZIP',
    effectClass: 'LOCAL_EXPORT',
    permissionRef: 'permission.birth.support-export',
    autoExecute: false
  })
]);

const STAGE_PRIMARY_ACTIONS = Object.freeze({
  VB0: Object.freeze({
    actionRef: 'action.birth.prepare-g0',
    label: 'Prepare first-birth Home and G0',
    effectClass: 'DELEGATED_MODEL_PROVISIONING',
    permissionRef: 'permission.model.provision',
    autoExecute: false
  }),
  VB1: Object.freeze({
    actionRef: 'action.birth.prepare-g0',
    label: 'Finish preparing G0',
    effectClass: 'DELEGATED_MODEL_PROVISIONING',
    permissionRef: 'permission.model.provision',
    autoExecute: false
  }),
  VB2: Object.freeze({
    actionRef: 'action.birth.baseline.finish',
    label: 'Finish untaught baseline witness',
    effectClass: 'LOCAL_APPEND',
    permissionRef: 'permission.birth.baseline-witness',
    autoExecute: false
  }),
  VB3: Object.freeze({
    actionRef: 'action.birth.cultivation.finish',
    label: 'Finish cultivation session',
    effectClass: 'LOCAL_CANDIDATE_APPEND',
    permissionRef: 'permission.birth.cultivation-annotate',
    autoExecute: false
  }),
  VB4: Object.freeze({
    actionRef: 'action.birth.lesson.review',
    label: 'Review incomplete lessons',
    effectClass: 'DURABLE_MEANING_REVIEW',
    permissionRef: 'permission.birth.lesson-review',
    autoExecute: false
  }),
  VB5: Object.freeze({
    actionRef: 'action.birth.pack.freeze',
    label: 'Freeze learning pack',
    effectClass: 'LOCAL_CANDIDATE_APPEND',
    permissionRef: 'permission.birth.pack-freeze',
    autoExecute: false
  }),
  VB6: Object.freeze({
    actionRef: 'action.birth.training-plan.preflight',
    label: 'Run no-effect training preflight',
    effectClass: 'READ_ONLY',
    permissionRef: 'permission.none',
    autoExecute: false
  }),
  VB7: Object.freeze({
    actionRef: 'action.birth.training.progress',
    label: 'View training progress',
    effectClass: 'READ_ONLY',
    permissionRef: 'permission.none',
    autoExecute: false
  }),
  VB8: Object.freeze({
    actionRef: 'action.birth.comparison.review',
    label: 'Review G0 and G1 candidate',
    effectClass: 'READ_ONLY',
    permissionRef: 'permission.none',
    autoExecute: false
  }),
  VB9: Object.freeze({
    actionRef: 'action.birth.candidate.disposition',
    label: 'Accept, narrow, or reject candidate',
    effectClass: 'DURABLE_MEANING_REVIEW',
    permissionRef: 'permission.birth.candidate-disposition',
    autoExecute: false
  }),
  VB10: Object.freeze({
    actionRef: 'action.birth.generation.register',
    label: 'Register accepted G1',
    effectClass: 'MODEL_GENERATION_REGISTRATION',
    permissionRef: 'permission.birth.generation-register',
    autoExecute: false
  }),
  VB11: Object.freeze({
    actionRef: 'action.birth.generation.wake',
    label: 'Wake G1',
    effectClass: 'MODEL_ACTIVATION',
    permissionRef: 'permission.birth.generation-activate',
    autoExecute: false
  }),
  VB12: Object.freeze({
    actionRef: 'action.birth.replay.finish',
    label: 'Finish clean birth replay',
    effectClass: 'LOCAL_APPEND',
    permissionRef: 'permission.birth.replay',
    autoExecute: false
  })
});

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function freeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    return Object.freeze(value);
  }
  return value;
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VexBirthLabError(
      'BIRTH_EVIDENCE_INVALID',
      `${label} must be one object`
    );
  }
  return value;
}

function requirePortableRef(value, label) {
  if (
    !nonempty(value) ||
    !/^[a-z0-9](?:[a-z0-9._-]{0,254}[a-z0-9])?$/u.test(value)
  ) {
    throw new VexBirthLabError(
      'BIRTH_EVIDENCE_INVALID',
      `${label} must be one portable canonical ref`
    );
  }
  return value;
}

function receiptAccepted(receipt) {
  return Boolean(
    receipt &&
    typeof receipt === 'object' &&
    ACCEPTED_RECEIPT_STATES.has(receipt.state)
  );
}

function normalizedEvidence(value) {
  const evidence = requireObject(value, 'Birth evidence');
  if (evidence.schemaVersion !== VEX_BIRTH_LAB_EVIDENCE_SCHEMA) {
    throw new VexBirthLabError(
      'BIRTH_EVIDENCE_INVALID',
      `evidence.schemaVersion must be ${VEX_BIRTH_LAB_EVIDENCE_SCHEMA}`
    );
  }

  requirePortableRef(evidence.birthSessionRef, 'birthSessionRef');
  const source = requireObject(evidence.source, 'source');
  if (!SOURCE_CURRENTNESS.has(source.currentness)) {
    throw new VexBirthLabError(
      'BIRTH_EVIDENCE_INVALID',
      'source.currentness must be CURRENT, STALE, or UNKNOWN'
    );
  }
  const lineage = requireObject(evidence.lineage, 'lineage');
  requirePortableRef(lineage.g0Ref, 'lineage.g0Ref');
  requirePortableRef(
    lineage.activeGenerationRef,
    'lineage.activeGenerationRef'
  );
  if (
    lineage.candidateGenerationRefOrNull !== null &&
    lineage.candidateGenerationRefOrNull !== undefined
  ) {
    requirePortableRef(
      lineage.candidateGenerationRefOrNull,
      'lineage.candidateGenerationRefOrNull'
    );
  }
  if (
    lineage.acceptedCandidateRefOrNull !== null &&
    lineage.acceptedCandidateRefOrNull !== undefined
  ) {
    requirePortableRef(
      lineage.acceptedCandidateRefOrNull,
      'lineage.acceptedCandidateRefOrNull'
    );
  }
  if (lineage.g0RollbackPreserved !== true) {
    throw new VexBirthLabError(
      'BIRTH_G0_ROLLBACK_NOT_PRESERVED',
      'lineage.g0RollbackPreserved must remain true'
    );
  }

  const model = requireObject(evidence.model, 'model');
  if (!MODEL_BINDING_STATES.has(model.bindingState)) {
    throw new VexBirthLabError(
      'BIRTH_EVIDENCE_INVALID',
      'model.bindingState is not recognized'
    );
  }

  const training = requireObject(
    evidence.workers?.training ?? { lifecycle: 'NONE' },
    'workers.training'
  );
  if (!WORKER_LIFECYCLES.has(training.lifecycle)) {
    throw new VexBirthLabError(
      'BIRTH_EVIDENCE_INVALID',
      'workers.training.lifecycle is not recognized'
    );
  }
  const effectTruth =
    training.effectTruth ?? 'PRE_EXECUTION_NO_EFFECT';
  if (!VEX_BIRTH_TRAINING_EFFECT_TRUTHS.includes(effectTruth)) {
    throw new VexBirthLabError(
      'BIRTH_EVIDENCE_INVALID',
      'workers.training.effectTruth is not recognized'
    );
  }

  const disposition = evidence.candidateDisposition ?? 'NONE';
  if (!CANDIDATE_DISPOSITIONS.has(disposition)) {
    throw new VexBirthLabError(
      'BIRTH_EVIDENCE_INVALID',
      'candidateDisposition is not recognized'
    );
  }

  return {
    ...clone(evidence),
    receipts: clone(evidence.receipts ?? {}),
    workers: {
      ...clone(evidence.workers ?? {}),
      training: {
        ...clone(training),
        effectTruth
      }
    },
    candidateDisposition: disposition,
    latestEvidenceRefs: Array.isArray(evidence.latestEvidenceRefs)
      ? [...new Set(
          evidence.latestEvidenceRefs.filter((item) => nonempty(item))
        )].slice(0, 64)
      : []
  };
}

function deriveCurrentStage(receipts) {
  let missingSeen = false;
  let current = null;

  for (const stage of VEX_BIRTH_VB_STAGES) {
    const accepted = receiptAccepted(receipts[stage]);
    if (!accepted && current === null) {
      current = stage;
      missingSeen = true;
      continue;
    }
    if (accepted && missingSeen) {
      throw new VexBirthLabError(
        'BIRTH_RECEIPT_SEQUENCE_CONTRADICTORY',
        `${stage} is accepted after a missing predecessor`
      );
    }
  }

  return current ?? 'BORN';
}

export function projectVexBirthHumanChapter(vbStage) {
  if (vbStage === 'BORN') return 'COMPLETE';
  const entry = VEX_BIRTH_CHAPTERS.find((candidate) =>
    candidate.vbStages.includes(vbStage)
  );
  if (!entry) {
    throw new VexBirthLabError(
      'BIRTH_STAGE_UNKNOWN',
      `Unknown Vex Birth stage: ${String(vbStage)}`
    );
  }
  return entry.chapter;
}

function modelTruth(evidence, currentStage) {
  if (evidence.model.bindingState !== 'BOUND') {
    return 'MODEL_UNAVAILABLE_NO_SYNTHETIC_SUBSTITUTE';
  }
  if (currentStage === 'BORN' || /^VB1[012]$/u.test(currentStage)) {
    return evidence.lineage.activeGenerationRef ===
      evidence.lineage.acceptedCandidateRefOrNull
      ? 'CURRENT_REAL_LOCAL_G1'
      : 'CURRENT_REAL_LOCAL_G0';
  }
  return evidence.lineage.activeGenerationRef === evidence.lineage.g0Ref
    ? 'CURRENT_REAL_LOCAL_G0'
    : 'CURRENT_REAL_LOCAL_G1';
}

function hold(action, reasonCode, reason) {
  return freeze({
    ...clone(action),
    held: true,
    reasonCode,
    reason
  });
}

function available(action) {
  return freeze({
    ...clone(action),
    held: false
  });
}

function derivePrimaryAction(evidence, currentStage) {
  if (currentStage === 'BORN') {
    return null;
  }
  const action = STAGE_PRIMARY_ACTIONS[currentStage];
  if (!action) {
    throw new VexBirthLabError(
      'BIRTH_ACTION_PROJECTION_FAILED',
      `No primary action is registered for ${currentStage}`
    );
  }

  if (evidence.source.currentness !== 'CURRENT') {
    return {
      available: null,
      held: hold(
        action,
        'SOURCE_REVALIDATION_REQUIRED',
        `Source currentness is ${evidence.source.currentness}`
      )
    };
  }

  if (
    currentStage === 'VB2' &&
    evidence.model.bindingState !== 'BOUND'
  ) {
    return {
      available: null,
      held: hold(
        action,
        'REAL_MODEL_NOT_BOUND',
        'Untaught baseline requires the real local G0'
      )
    };
  }

  if (
    currentStage === 'VB5' &&
    evidence.packReviewComplete !== true
  ) {
    return {
      available: null,
      held: hold(
        action,
        'PACK_REVIEW_INCOMPLETE',
        'All included lessons and exclusions must be reviewed first'
      )
    };
  }

  if (currentStage === 'VB6') {
    if (evidence.trainingPlanState === 'READY') {
      const trainAction = {
        actionRef: 'action.birth.foundation.train-candidate',
        label: 'Start G1 candidate training',
        effectClass: 'ISOLATED_FOUNDATION_MODEL_TRAINING',
        permissionRef: 'permission.birth.foundation.train',
        autoExecute: false
      };
      return { available: available(trainAction), held: null };
    }
    return { available: available(action), held: null };
  }

  if (
    currentStage === 'VB9' &&
    evidence.evaluationComplete !== true
  ) {
    return {
      available: null,
      held: hold(
        action,
        'EVALUATION_INCOMPLETE',
        'Candidate disposition requires completed evaluation evidence'
      )
    };
  }

  if (currentStage === 'VB11') {
    if (evidence.candidateDisposition !== 'ACCEPT') {
      return {
        available: null,
        held: hold(
          action,
          'CANDIDATE_NOT_ACCEPTED',
          'Wake requires an accepted candidate'
        )
      };
    }
    if (evidence.separateActivationAuthorityAvailable !== true) {
      return {
        available: null,
        held: hold(
          action,
          'ACTIVATION_AUTHORITY_UNAVAILABLE',
          'Wake requires separate activation authority'
        )
      };
    }
  }

  return { available: available(action), held: null };
}

export class VexBirthLabError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'VexBirthLabError';
    this.code = code;
    this.details = details;
  }
}

export function reduceVexBirthLabState(value) {
  const evidence = normalizedEvidence(value);
  const currentVBStage = deriveCurrentStage(evidence.receipts);
  const currentChapter = projectVexBirthHumanChapter(currentVBStage);
  const primary = derivePrimaryAction(evidence, currentVBStage);

  const availableActions = SUPPORT_ACTIONS.map(available);
  const heldActions = [];
  if (primary?.available) availableActions.push(primary.available);
  if (primary?.held) heldActions.push(primary.held);

  const blockers = [];
  const unknowns = [];
  if (evidence.source.currentness === 'STALE') {
    blockers.push({
      findingRef: 'finding.birth.source-stale',
      code: 'SOURCE_REVALIDATION_REQUIRED'
    });
  } else if (evidence.source.currentness === 'UNKNOWN') {
    unknowns.push({
      findingRef: 'finding.birth.source-unknown',
      code: 'SOURCE_CURRENTNESS_UNKNOWN'
    });
  }
  if (evidence.model.bindingState !== 'BOUND') {
    blockers.push({
      findingRef: 'finding.birth.model-unavailable',
      code: 'REAL_MODEL_NOT_BOUND'
    });
  }

  const state = {
    schemaVersion: VEX_BIRTH_LAB_STATE_SCHEMA,
    birthSessionRef: evidence.birthSessionRef,
    currentChapter,
    currentVBStage,
    activeGenerationRef: evidence.lineage.activeGenerationRef,
    candidateGenerationRefOrNull:
      evidence.lineage.candidateGenerationRefOrNull ?? null,
    acceptedCandidateRefOrNull:
      evidence.lineage.acceptedCandidateRefOrNull ?? null,
    modelTruthClass: modelTruth(evidence, currentVBStage),
    trainingEffectTruth: evidence.workers.training.effectTruth,
    workerLifecycle: evidence.workers.training.lifecycle,
    sourceCurrentness: evidence.source.currentness,
    candidateDisposition: evidence.candidateDisposition,
    availableActions,
    heldActions,
    blockers,
    unknowns,
    latestEvidenceRefs: evidence.latestEvidenceRefs,
    completionClaimAllowed: currentVBStage === 'BORN',
    effects: {
      modelCalled: false,
      trainingPerformed: false,
      activationPerformed: false,
      publicationPerformed: false,
      homeMemoryMutationPerformed: false
    }
  };

  return freeze(state);
}

function publicAction(action) {
  return {
    actionRef: action.actionRef,
    label: action.label,
    effectClass: action.effectClass,
    permissionRef: action.permissionRef,
    autoExecute: false
  };
}

export function formVexBirthSupportContext(
  stateValue,
  {
    question,
    selectedExcerpt = null,
    includeSelectedExcerpt = false
  } = {}
) {
  const state = requireObject(stateValue, 'Birth Lab state');
  if (state.schemaVersion !== VEX_BIRTH_LAB_STATE_SCHEMA) {
    throw new VexBirthLabError(
      'BIRTH_SUPPORT_CONTEXT_INVALID',
      `state.schemaVersion must be ${VEX_BIRTH_LAB_STATE_SCHEMA}`
    );
  }
  if (!nonempty(question)) {
    throw new VexBirthLabError(
      'BIRTH_SUPPORT_CONTEXT_INVALID',
      'question is required'
    );
  }
  if (includeSelectedExcerpt && !nonempty(selectedExcerpt)) {
    throw new VexBirthLabError(
      'BIRTH_SUPPORT_CONTEXT_INVALID',
      'selectedExcerpt must be explicit when included'
    );
  }

  return freeze({
    schemaVersion: VEX_BIRTH_SUPPORT_CONTEXT_SCHEMA,
    artifactClass: 'CONTEXT_HANDOFF',
    executable: false,
    birthSessionRef: state.birthSessionRef,
    currentChapter: state.currentChapter,
    currentVBStage: state.currentVBStage,
    activeGenerationRef: state.activeGenerationRef,
    candidateGenerationRefOrNull:
      state.candidateGenerationRefOrNull,
    trainingEffectTruth: state.trainingEffectTruth,
    sourceCurrentness: state.sourceCurrentness,
    availableActions: state.availableActions.map(publicAction),
    heldActions: state.heldActions.map((action) => ({
      ...publicAction(action),
      reasonCode: action.reasonCode,
      reason: action.reason
    })),
    blockers: clone(state.blockers),
    unknowns: clone(state.unknowns),
    selectedExcerpt: includeSelectedExcerpt ? selectedExcerpt : null,
    question,
    latestEvidenceRefs: clone(state.latestEvidenceRefs),
    rawTranscriptIncluded: false,
    privateHomeContentIncluded: false,
    credentialsIncluded: false,
    modelWeightsIncluded: false,
    executionAuthorityGranted: false
  });
}

export function formVexBirthStatusPackageModel(
  stateValue,
  {
    includeSelectedExcerpts = false,
    selectedExcerptCount = 0
  } = {}
) {
  const state = requireObject(stateValue, 'Birth Lab state');
  if (state.schemaVersion !== VEX_BIRTH_LAB_STATE_SCHEMA) {
    throw new VexBirthLabError(
      'BIRTH_STATUS_PACKAGE_INVALID',
      `state.schemaVersion must be ${VEX_BIRTH_LAB_STATE_SCHEMA}`
    );
  }
  if (
    !Number.isSafeInteger(selectedExcerptCount) ||
    selectedExcerptCount < 0
  ) {
    throw new VexBirthLabError(
      'BIRTH_STATUS_PACKAGE_INVALID',
      'selectedExcerptCount must be a non-negative integer'
    );
  }
  if (!includeSelectedExcerpts && selectedExcerptCount !== 0) {
    throw new VexBirthLabError(
      'BIRTH_STATUS_PACKAGE_INVALID',
      'selected excerpts cannot be counted when inclusion is false'
    );
  }

  const files = [
    'START-HERE.html',
    'BIRTH-STATUS.json',
    'SUPPORT-CONTEXT.md',
    'CURRENT-STAGE.json',
    'AVAILABLE-ACTIONS.json',
    'REDACTION-MANIFEST.json'
  ];
  if (includeSelectedExcerpts && selectedExcerptCount > 0) {
    files.push('excerpts/selected-excerpts.md');
  }

  return freeze({
    schemaVersion: VEX_BIRTH_STATUS_PACKAGE_SCHEMA,
    artifactClass: 'CONTEXT_HANDOFF',
    executable: false,
    birthSessionRef: state.birthSessionRef,
    files,
    optionalDirectories: [
      'receipts/',
      'plans/',
      'results/',
      'excerpts/'
    ],
    taskManifestIncluded: false,
    returnManifestIncluded: false,
    rawFullTranscriptIncluded: false,
    privateMemoryIncluded: false,
    credentialsIncluded: false,
    modelWeightFilesIncluded: false,
    selectedExcerptCount:
      includeSelectedExcerpts ? selectedExcerptCount : 0,
    executionAuthorityGranted: false
  });
}

export function validateVexBirthAnnotationSet(annotationsValue) {
  if (!Array.isArray(annotationsValue)) {
    throw new VexBirthLabError(
      'BIRTH_ANNOTATIONS_INVALID',
      'annotations must be one array'
    );
  }

  const byRange = new Map();
  for (const annotation of annotationsValue) {
    requireObject(annotation, 'annotation');
    requirePortableRef(annotation.annotationRef, 'annotation.annotationRef');
    requirePortableRef(
      annotation.conversationRangeRef,
      'annotation.conversationRangeRef'
    );
    if (
      !VEX_BIRTH_ANNOTATION_DISPOSITIONS.includes(
        annotation.disposition
      )
    ) {
      throw new VexBirthLabError(
        'BIRTH_ANNOTATIONS_INVALID',
        'annotation.disposition is not recognized'
      );
    }
    const set =
      byRange.get(annotation.conversationRangeRef) ?? new Set();
    set.add(annotation.disposition);
    byRange.set(annotation.conversationRangeRef, set);
  }

  for (const [rangeRef, dispositions] of byRange) {
    const trainingDispositions = [
      'TRAIN',
      'COUNTEREXAMPLE',
      'HELD_OUT',
      'DO_NOT_TRAIN'
    ].filter((item) => dispositions.has(item));
    if (trainingDispositions.length > 1) {
      throw new VexBirthLabError(
        'BIRTH_ANNOTATION_DISPOSITION_CONFLICT',
        `${rangeRef} has conflicting training dispositions`,
        { rangeRef, dispositions: trainingDispositions }
      );
    }
  }

  return freeze({
    schemaVersion: 'vexlife.vex-birth-annotation-validation/v1',
    state: 'VALID',
    annotationCount: annotationsValue.length,
    conversationRangeCount: byRange.size,
    supportOnlyDoesNotGrantTrainingConsent: true
  });
}

// [VXG RealForever]
