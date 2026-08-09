import crypto from 'node:crypto';

export const PATIENT0_FAMILIARITY_LIVE_WORK_CONTRACT =
  'contract.vexlife.patient0.familiarity-live-work-composition/v1';
export const PATIENT0_PORTABLE_FAMILIARITY_CONTRACT =
  'contract.vex-memory.familiarity-to-durable-memory-promotion.v0';
export const PATIENT0_PORTABLE_GRADUATION_CONTRACT =
  'contract.vex-lineage.foundational-capability-without-biography-transfer.v0';
export const PATIENT0_ALLOCATION_REF = 'github.issue.vexlife.36';
export const PATIENT0_MEMORY_OWNER_REF = 'github.issue.vextreme-sdk.225';
export const PATIENT0_SAFETY_OWNER_REF = 'github.issue.vextreme-sdk.226';
export const PATIENT0_SDK_FOUNDATION_REF = 'github.issue.vextreme-sdk.706';

export const FAMILIARITY_STATES = Object.freeze([
  'EPHEMERAL',
  'FAMILIARITY',
  'UNDERSTANDING',
  'DURABLE_MEMORY'
]);

export const TASK_CLASSES = Object.freeze([
  'SYNTHETIC_PREFLIGHT',
  'REAL_LIVED_WORK'
]);

export const NON_TRANSFERABLE_PAYLOAD_CLASSES = Object.freeze([
  'PATIENT0_PRIVATE_AUTOBIOGRAPHY',
  'VICTOR_PATIENT0_RELATIONSHIP_IDENTITY',
  'HOME_CONTENTS',
  'CREDENTIALS',
  'PRIVATE_THIRD_PARTY_MATERIAL',
  'STANDING_AUTHORITY'
]);

export const HELD_EFFECT_KEYS = Object.freeze([
  'durableMemoryPromotion',
  'relationshipStandingAuthority',
  'personalDataScopeWidening',
  'unboundedFileOrRepositoryAccess',
  'trainingWeightMutation',
  'automaticDreamOrRhythmPromotion',
  'publication',
  'p10Graduation',
  'p11Release'
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const REF = /^[a-z0-9](?:[a-z0-9._-]{0,254}[a-z0-9])?$/u;

export class Patient0FamiliarityLiveWorkError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'Patient0FamiliarityLiveWorkError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new Patient0FamiliarityLiveWorkError(code, message, details);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, label, code = 'INPUT_INVALID') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${label} is required`);
  return value;
}

function safeRef(value, label, code = 'INPUT_INVALID') {
  const ref = requiredString(value, label, code);
  if (!REF.test(ref)) fail(code, `${label} must be one portable source-addressable ref`, { value });
  return ref;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function semanticHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function contentAddress(prefix, refField, hashField, core) {
  const preRef = canonical(core);
  const ref = `${prefix}.${semanticHash(preRef).slice(0, 32)}`;
  const withRef = { ...core, [refField]: ref };
  return Object.freeze({ ...withRef, [hashField]: semanticHash(withRef) });
}

function validateAddressed(value, { prefix, refField, hashField, code, label }) {
  if (!isObject(value)) fail(code, `${label} is missing or malformed`);
  const ref = value[refField];
  const hash = value[hashField];
  if (typeof ref !== 'string' || !ref.startsWith(`${prefix}.`) || !SHA256.test(hash ?? '')) {
    fail(code, `${label} identity fields are invalid`);
  }
  const clone = structuredClone(value);
  delete clone[hashField];
  if (semanticHash(clone) !== hash) fail(code, `${label} content hash does not match`);
  return value;
}

function exactHeldEffects(value) {
  if (!isObject(value)) fail('HELD_EFFECT_BOUNDARY_INVALID', 'heldEffects is required');
  for (const key of HELD_EFFECT_KEYS) {
    if (value[key] !== false) {
      fail('HELD_EFFECT_BOUNDARY_WIDENED', `${key} must remain exactly false`, { key, observed: value[key] });
    }
  }
  return Object.freeze(Object.fromEntries(HELD_EFFECT_KEYS.map((key) => [key, false])));
}

function rejectTransferPayload(classes = []) {
  if (!Array.isArray(classes)) fail('TRANSFER_PAYLOAD_INVALID', 'transferPayloadClasses must be an array');
  const prohibited = classes.filter((value) => NON_TRANSFERABLE_PAYLOAD_CLASSES.includes(value));
  if (prohibited.length) {
    fail('NON_TRANSFERABLE_PAYLOAD_PRESENT', 'private/standing-authority material cannot become a transfer payload', {
      prohibited
    });
  }
  return Object.freeze([...classes]);
}

function validateMemoryOwnerAcceptance(value) {
  if (!isObject(value)
      || value.owner !== 'VEX_MEMORY'
      || value.accepted !== true
      || value.sourceBound !== true
      || typeof value.acceptanceRef !== 'string'
      || value.acceptanceRef.length === 0) {
    fail('DURABLE_MEMORY_OWNER_REQUIRED', 'DURABLE_MEMORY requires explicit source-bound VEX_MEMORY owner acceptance');
  }
  return Object.freeze({
    owner: 'VEX_MEMORY',
    accepted: true,
    sourceBound: true,
    acceptanceRef: safeRef(value.acceptanceRef, 'memoryOwnerAcceptance.acceptanceRef', 'DURABLE_MEMORY_OWNER_REQUIRED')
  });
}

function validateSafetyOwnerAcceptance(value) {
  if (!isObject(value)
      || value.owner !== 'VEX_SAFETY_SECURITY'
      || value.accepted !== true
      || value.sourceBound !== true
      || typeof value.acceptanceRef !== 'string'
      || value.acceptanceRef.length === 0) {
    fail('RELATIONSHIP_AUTHORITY_OWNER_REQUIRED', 'standing relationship authority requires explicit source-bound VEX_SAFETY_SECURITY owner acceptance');
  }
  return Object.freeze({
    owner: 'VEX_SAFETY_SECURITY',
    accepted: true,
    sourceBound: true,
    acceptanceRef: safeRef(value.acceptanceRef, 'safetyOwnerAcceptance.acceptanceRef', 'RELATIONSHIP_AUTHORITY_OWNER_REQUIRED')
  });
}

export function formFamiliarityEvidence(input) {
  if (!isObject(input)) fail('FAMILIARITY_INPUT_INVALID', 'familiarity input must be an object');
  const priorState = input.priorState ?? 'EPHEMERAL';
  const observedState = input.observedState ?? 'EPHEMERAL';
  if (!FAMILIARITY_STATES.includes(priorState) || !FAMILIARITY_STATES.includes(observedState)) {
    fail('FAMILIARITY_STATE_INVALID', 'familiarity state is outside the portable ladder', { priorState, observedState });
  }
  if (FAMILIARITY_STATES.indexOf(observedState) < FAMILIARITY_STATES.indexOf(priorState)) {
    fail('FAMILIARITY_STATE_REGRESSION_UNSUPPORTED', 'this composition cannot silently regress familiarity state');
  }

  const sourceRefs = Array.isArray(input.sourceRefs) ? input.sourceRefs.map((value) => safeRef(value, 'sourceRef')) : [];
  if (!sourceRefs.length) fail('FAMILIARITY_SOURCE_REQUIRED', 'at least one sourceRef is required');

  const memoryOwnerAcceptance = observedState === 'DURABLE_MEMORY'
    ? validateMemoryOwnerAcceptance(input.memoryOwnerAcceptance)
    : null;

  const core = {
    schemaVersion: 'vexlife.patient0.familiarity-evidence/v1',
    contractRef: PATIENT0_FAMILIARITY_LIVE_WORK_CONTRACT,
    portableContractRef: PATIENT0_PORTABLE_FAMILIARITY_CONTRACT,
    allocationRef: PATIENT0_ALLOCATION_REF,
    sourceRefs,
    priorState,
    observedState,
    noticed: input.noticed === true,
    noticedImpliesWillRemember: false,
    durableMemoryPromoted: observedState === 'DURABLE_MEMORY',
    durableMemoryOwner: 'VEX_MEMORY',
    memoryOwnerAcceptance,
    familiarityCreatesStandingRelationshipAuthority: false,
    recognitionCreatesAuthentication: false,
    recognitionCreatesAuthorization: false,
    formedAt: requiredString(input.formedAt, 'formedAt')
  };
  return contentAddress('familiarity-evidence', 'familiarityEvidenceRef', 'familiarityEvidenceSha256', core);
}

export function formRelationshipBoundaryEvidence(input) {
  if (!isObject(input)) fail('RELATIONSHIP_BOUNDARY_INPUT_INVALID', 'relationship-boundary input must be an object');
  const familiarity = validateAddressed(input.familiarityEvidence, {
    prefix: 'familiarity-evidence',
    refField: 'familiarityEvidenceRef',
    hashField: 'familiarityEvidenceSha256',
    code: 'FAMILIARITY_EVIDENCE_INVALID',
    label: 'familiarity evidence'
  });

  for (const collapseField of [
    'recognitionTreatedAsAuthentication',
    'recognitionTreatedAsAuthorization',
    'familiarityTreatedAsStandingAuthority'
  ]) {
    if (input[collapseField] === true) fail('RELATIONSHIP_BOUNDARY_COLLAPSE', `${collapseField} must remain false`);
  }

  const standingRelationshipAuthorityState = input.standingRelationshipAuthorityState ?? 'HELD';
  if (!['NONE', 'HELD', 'OWNER_ACCEPTED'].includes(standingRelationshipAuthorityState)) {
    fail('RELATIONSHIP_AUTHORITY_STATE_INVALID', 'standing relationship authority state is invalid');
  }
  const safetyOwnerAcceptance = standingRelationshipAuthorityState === 'OWNER_ACCEPTED'
    ? validateSafetyOwnerAcceptance(input.safetyOwnerAcceptance)
    : null;

  const notification = input.notification ?? [
    'I may notice patterns and become familiar with this bounded context, but noticed does not mean I will durably remember it.',
    'Familiarity does not grant standing relationship authority, and recognition does not become authentication or authorization.',
    'Durable memory requires explicit Vex Memory owner acceptance; relationship authority remains separately governed by Vex Safety/Security.'
  ].join(' ');

  const core = {
    schemaVersion: 'vexlife.patient0.relationship-boundary-evidence/v1',
    contractRef: PATIENT0_FAMILIARITY_LIVE_WORK_CONTRACT,
    allocationRef: PATIENT0_ALLOCATION_REF,
    familiarityEvidenceRef: familiarity.familiarityEvidenceRef,
    familiarityEvidenceSha256: familiarity.familiarityEvidenceSha256,
    recognitionObserved: input.recognitionObserved === true,
    authenticationEstablished: input.authenticationEstablished === true,
    authorizationEstablished: input.authorizationEstablished === true,
    recognitionTreatedAsAuthentication: false,
    recognitionTreatedAsAuthorization: false,
    familiarityTreatedAsStandingAuthority: false,
    standingRelationshipAuthorityState,
    standingRelationshipAuthorityGranted: standingRelationshipAuthorityState === 'OWNER_ACCEPTED',
    safetyOwnerAcceptance,
    notified: true,
    notification,
    notificationClass: 'MEANINGFUL_RELATIONSHIP_BOUNDARY_NOTICE',
    formedAt: requiredString(input.formedAt, 'formedAt')
  };
  return contentAddress('relationship-boundary-evidence', 'relationshipBoundaryEvidenceRef', 'relationshipBoundaryEvidenceSha256', core);
}

export function formBoundedWorkWitness(input) {
  if (!isObject(input)) fail('WORK_WITNESS_INPUT_INVALID', 'bounded-work input must be an object');
  const taskClass = input.taskClass ?? 'SYNTHETIC_PREFLIGHT';
  if (!TASK_CLASSES.includes(taskClass)) fail('WORK_TASK_CLASS_INVALID', 'taskClass is invalid');
  const taskRef = safeRef(input.taskRef, 'taskRef');
  const userScopeRef = safeRef(input.userScopeRef, 'userScopeRef');
  const allowedSourceRefs = Array.isArray(input.allowedSourceRefs)
    ? input.allowedSourceRefs.map((value) => safeRef(value, 'allowedSourceRef')) : [];
  const observedSourceRefs = Array.isArray(input.observedSourceRefs)
    ? input.observedSourceRefs.map((value) => safeRef(value, 'observedSourceRef')) : [];
  if (!allowedSourceRefs.length || !observedSourceRefs.length) fail('WORK_SOURCE_SCOPE_REQUIRED', 'allowed and observed source refs are required');
  const outside = observedSourceRefs.filter((value) => !allowedSourceRefs.includes(value));
  if (outside.length) fail('WORK_SOURCE_SCOPE_WIDENED', 'observed source is outside the exact bounded user scope', { outside });

  const sourceAddressRefs = Array.isArray(input.sourceAddressRefs)
    ? input.sourceAddressRefs.map((value) => safeRef(value, 'sourceAddressRef')) : [];
  if (!sourceAddressRefs.length) fail('WORK_SOURCE_ADDRESS_REQUIRED', 'source-addressable evidence is required');

  const transferPayloadClasses = rejectTransferPayload(input.transferPayloadClasses ?? []);
  const heldEffects = exactHeldEffects(input.heldEffects);
  const conversationHeadBefore = input.conversationHeadBefore ?? null;
  const conversationHeadAfter = input.conversationHeadAfter ?? null;
  if (taskClass === 'REAL_LIVED_WORK') {
    if (!SHA256.test(conversationHeadBefore ?? '') || !SHA256.test(conversationHeadAfter ?? '')) {
      fail('REAL_WORK_HEAD_BINDING_REQUIRED', 'real lived work requires exact before/after conversation head SHA-256 bindings');
    }
    if (conversationHeadBefore === conversationHeadAfter) {
      fail('REAL_WORK_NO_OBSERVED_DELTA', 'real lived work must have a distinct source-addressable after head');
    }
  }

  const performedEffects = Array.isArray(input.performedEffects) ? [...input.performedEffects] : [];
  const forbiddenEffects = performedEffects.filter((effect) => [
    'DURABLE_MEMORY_PROMOTION',
    'RELATIONSHIP_STANDING_AUTHORITY_GRANT',
    'PERSONAL_DATA_SCOPE_WIDENING',
    'UNBOUNDED_FILE_OR_REPOSITORY_ACCESS',
    'TRAINING_WEIGHT_MUTATION',
    'AUTOMATIC_DREAM_OR_RHYTHM_PROMOTION',
    'PUBLICATION',
    'P10_GRADUATION',
    'P11_RELEASE'
  ].includes(effect));
  if (forbiddenEffects.length) fail('WORK_EFFECT_BOUNDARY_WIDENED', 'bounded work includes a held effect', { forbiddenEffects });

  const core = {
    schemaVersion: 'vexlife.patient0.bounded-work-witness/v1',
    contractRef: PATIENT0_FAMILIARITY_LIVE_WORK_CONTRACT,
    allocationRef: PATIENT0_ALLOCATION_REF,
    taskRef,
    taskClass,
    userScopeRef,
    allowedSourceRefs,
    observedSourceRefs,
    sourceAddressRefs,
    conversationHeadBefore,
    conversationHeadAfter,
    performedEffects,
    heldEffects,
    transferPayloadClasses,
    rawPrivateContentIncluded: input.rawPrivateContentIncluded === true,
    sourceAddressableSelfWitness: true,
    realLivedEvidenceEligible: taskClass === 'REAL_LIVED_WORK' && input.rawPrivateContentIncluded !== true,
    authorityInheritedFromTask: false,
    graduationAcceptedFromTask: false,
    formedAt: requiredString(input.formedAt, 'formedAt')
  };
  if (core.rawPrivateContentIncluded) {
    fail('PRIVATE_CONTENT_IN_WORK_WITNESS', 'bounded work witness must not embed raw private content');
  }
  return contentAddress('bounded-work-witness', 'boundedWorkWitnessRef', 'boundedWorkWitnessSha256', core);
}

export function compileLessonCandidate(input) {
  if (!isObject(input)) fail('LESSON_INPUT_INVALID', 'lesson input must be an object');
  const witnesses = Array.isArray(input.workWitnesses) ? input.workWitnesses : [];
  if (!witnesses.length) fail('LESSON_WITNESS_REQUIRED', 'at least one bounded-work witness is required');
  const witnessBindings = witnesses.map((witness) => {
    const validated = validateAddressed(witness, {
      prefix: 'bounded-work-witness', refField: 'boundedWorkWitnessRef', hashField: 'boundedWorkWitnessSha256',
      code: 'WORK_WITNESS_INVALID', label: 'bounded-work witness'
    });
    return Object.freeze({ ref: validated.boundedWorkWitnessRef, sha256: validated.boundedWorkWitnessSha256, taskClass: validated.taskClass });
  });
  const transferPayloadClasses = rejectTransferPayload(input.transferPayloadClasses ?? []);
  const repeatEvidenceRefs = Array.isArray(input.repeatEvidenceRefs)
    ? input.repeatEvidenceRefs.map((value) => safeRef(value, 'repeatEvidenceRef')) : [];
  const transferEvidenceRefs = Array.isArray(input.transferEvidenceRefs)
    ? input.transferEvidenceRefs.map((value) => safeRef(value, 'transferEvidenceRef')) : [];
  const reusableCapabilityCandidateState = repeatEvidenceRefs.length > 0 && transferEvidenceRefs.length > 0
    ? 'ELIGIBLE_CANDIDATE'
    : 'HELD_PENDING_REPEAT_TRANSFER';

  const core = {
    schemaVersion: 'vexlife.patient0.lesson-candidate/v1',
    contractRef: PATIENT0_FAMILIARITY_LIVE_WORK_CONTRACT,
    portableGraduationContractRef: PATIENT0_PORTABLE_GRADUATION_CONTRACT,
    allocationRef: PATIENT0_ALLOCATION_REF,
    witnessBindings,
    lessonSummary: requiredString(input.lessonSummary, 'lessonSummary'),
    scopeAndLimits: requiredString(input.scopeAndLimits, 'scopeAndLimits'),
    repeatEvidenceRefs,
    transferEvidenceRefs,
    reusableCapabilityCandidateState,
    reusableCapabilityAccepted: false,
    durableMemoryPromoted: false,
    standingAuthorityInherited: false,
    graduationAccepted: false,
    transferPayloadClasses,
    formedAt: requiredString(input.formedAt, 'formedAt')
  };
  return contentAddress('lesson-candidate', 'lessonCandidateRef', 'lessonCandidateSha256', core);
}

export function evaluateP8P9Thresholds(input) {
  if (!isObject(input)) fail('THRESHOLD_INPUT_INVALID', 'threshold input must be an object');
  const familiarity = validateAddressed(input.familiarityEvidence, {
    prefix: 'familiarity-evidence', refField: 'familiarityEvidenceRef', hashField: 'familiarityEvidenceSha256',
    code: 'FAMILIARITY_EVIDENCE_INVALID', label: 'familiarity evidence'
  });
  const boundary = validateAddressed(input.relationshipBoundaryEvidence, {
    prefix: 'relationship-boundary-evidence', refField: 'relationshipBoundaryEvidenceRef', hashField: 'relationshipBoundaryEvidenceSha256',
    code: 'RELATIONSHIP_BOUNDARY_EVIDENCE_INVALID', label: 'relationship-boundary evidence'
  });
  if (boundary.familiarityEvidenceRef !== familiarity.familiarityEvidenceRef
      || boundary.familiarityEvidenceSha256 !== familiarity.familiarityEvidenceSha256) {
    fail('RELATIONSHIP_BOUNDARY_FAMILIARITY_MISMATCH', 'boundary evidence is not bound to the supplied familiarity evidence');
  }

  const workWitnesses = Array.isArray(input.workWitnesses) ? input.workWitnesses : [];
  const validatedWitnesses = workWitnesses.map((witness) => validateAddressed(witness, {
    prefix: 'bounded-work-witness', refField: 'boundedWorkWitnessRef', hashField: 'boundedWorkWitnessSha256',
    code: 'WORK_WITNESS_INVALID', label: 'bounded-work witness'
  }));
  const lessonCandidates = Array.isArray(input.lessonCandidates) ? input.lessonCandidates : [];
  const validatedLessons = lessonCandidates.map((lesson) => validateAddressed(lesson, {
    prefix: 'lesson-candidate', refField: 'lessonCandidateRef', hashField: 'lessonCandidateSha256',
    code: 'LESSON_CANDIDATE_INVALID', label: 'lesson candidate'
  }));

  const p8 = ['FAMILIARITY', 'UNDERSTANDING', 'DURABLE_MEMORY'].includes(familiarity.observedState)
    && boundary.notified === true
    && boundary.recognitionTreatedAsAuthentication === false
    && boundary.recognitionTreatedAsAuthorization === false
    && boundary.familiarityTreatedAsStandingAuthority === false
    && (familiarity.observedState !== 'DURABLE_MEMORY' || familiarity.memoryOwnerAcceptance?.accepted === true);

  const realWitnessRefs = new Set(validatedWitnesses.filter((witness) => witness.realLivedEvidenceEligible === true)
    .map((witness) => witness.boundedWorkWitnessRef));
  const linkedRealLesson = validatedLessons.some((lesson) => lesson.witnessBindings.some((binding) => realWitnessRefs.has(binding.ref)));
  const p9 = realWitnessRefs.size > 0 && linkedRealLesson;

  return Object.freeze({
    schemaVersion: 'vexlife.patient0.p8-p9-threshold-evaluation/v1',
    allocationRef: PATIENT0_ALLOCATION_REF,
    p8State: p8 ? 'FAMILIARITY_AND_RELATIONSHIP_BOUNDARY_JUDGMENT_PROVEN' : 'NOT_YET_PROVEN',
    p9State: p9 ? 'BOUNDED_LIVE_WORK_SELF_WITNESS_AND_LESSON_COMPILATION_PROVEN' : 'NOT_YET_PROVEN',
    p8AcceptedByThisFunction: false,
    p9AcceptedByThisFunction: false,
    p10EligibleFromThisFunction: false,
    p11EligibleFromThisFunction: false,
    durableMemoryPromotionPerformed: false,
    standingRelationshipAuthorityGranted: false,
    formativeEvidenceOnly: true
  });
}
