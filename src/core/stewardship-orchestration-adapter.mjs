import { createHash } from 'node:crypto';

export const ADAPTER_INPUT_SCHEMA = 'vexlife.stewardship-orchestration-adapter-input/v1';
export const ADAPTER_BUILD_RECEIPT_SCHEMA = 'vexlife.stewardship-orchestration-adapter-build-receipt/v1';
export const ADAPTER_ROUTE_RECEIPT_SCHEMA = 'vexlife.stewardship-orchestration-adapter-route-receipt/v1';
export const SDK_REQUEST_SCHEMA = 'vextreme.stewardship-orchestration-request/v1';
export const SDK_RECEIPT_SCHEMA = 'vextreme.stewardship-orchestration-receipt/v1';
export const SDK_PROCESS_REF = 'process.multivex.operations.stewardship-orchestration.v1';
export const SDK_PROFILE_REF = 'VS-FND-00';
export const SDK_ACCEPTED_MERGE = '4dc3fbfad0298d4055196b5d50d8aa73e9f4ac68';
export const SDK_RUNTIME_SOURCE_REF = `repo.vextreme-sdk/lib/continuity-operations/stewardship-orchestration.js@${SDK_ACCEPTED_MERGE}`;
export const SDK_PROCESS_SOURCE_REF = `repo.vextreme-sdk/docs/private-continuity/multivex/process-factory/processes/stewardship-orchestration.json@${SDK_ACCEPTED_MERGE}`;

const ACTOR_CLASSES = ['HUMAN','VEX_AI','DETERMINISTIC_SERVICE','INSTITUTION','EXTERNAL_PROFESSIONAL','EXTERNAL_AUTHORITY'];
const TRANSITIONS = ['CONTINUE_CURRENT_OCCUPANCY','ROUTE_QUALIFIED_OCCUPANCY','REFRESH_CURRENTNESS','WAIT_EXTERNAL_EVENT','HOLD_WITH_REACTIVATION','FORM_DECISION_PACKET','FORM_DISCUSSION','ROUTE_LICENSED_OR_EXTERNAL_AUTHORITY','VERIFY_OUTCOME','CLOSE_VERIFIED','BLOCKED_UNKNOWN'];
const EFFECT_KEYS = ['network','providerInvocation','sourceMutation','schedulerMutation','concernMutation','homeMutation','memoryMutation','familyMutation','authorityGrant','reminderScheduling','legalDecision','financialEffect','externalDelivery','training','modelWeightMutation','publication'];
const REQUEST_KEYS = ['schemaVersion','caseRef','intent','pathFrontier','continuity','timing','responsibility','outcome','sourceRefs'];
const REQUEST_SECTION_KEYS = {
  intent:['rootIntentionRef','protectedOutcomeRefs','constraintRefs','sourceRefs'],
  pathFrontier:['activePathRefOrNull','minimalSafePathRefOrNull','recommendedPathRefOrNull','alternatePathRefs','heldPathRefs','decisionPathRefOrNull','pathEvidenceRefs','recommendationBasisRefs','whatWouldChangeRecommendationRefs','decisionNeed'],
  continuity:['activeWorkRefs','openLoopRefs','heldOpportunityRefs','waitingExternalRefs','refreshTriggerRefs','currentness','materialUnknownRefs'],
  timing:['readinessState','readinessEvidenceClass','readinessEvidenceRefs','reminderConsentState','resurfaceMode','safeUntilOrNull','reactivationTriggerRefs','interruptPolicyRefOrNull'],
  responsibility:['requiredRoleRefOrNull','requiredCapabilityRefs','currentOccupancyOrNull','alternateOccupancies','externalAuthorityRequired'],
  outcome:['effectProposedRefOrNull','effectResultRefOrNull','outcomeVerificationRefOrNull','intentSatisfied','residualOpenLoopRefs']
};
const OCCUPANCY_KEYS = ['occupancyRef','roleRef','actorClass','capabilityRefs','capabilityState','authorityState'];
const RECEIPT_KEYS = ['schemaVersion','profileRef','caseRef','accepted','intentProjection','pathProjection','continuityProjection','decisionTimingProjection','responsibilityProjection','outcomeProjection','nextTransition','blockers','sourceRefs','effects','fingerprint'];
const FP = /^[a-f0-9]{64}$/u;
const SDK_FP = /^sha256:[a-f0-9]{64}$/u;

const clone = (value) => structuredClone(value);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
const nonEmpty = (value) => typeof value === 'string' && value.length > 0;
const refs = (value) => Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length;
const canonicalRefs = (value) => [...new Set(value)].sort();
const stable = (value) => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const hash = (value) => createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
const sdkHash = (value) => `sha256:${createHash('sha256').update(`${JSON.stringify(stable(value), null, 2)}\n`, 'utf8').digest('hex')}`;
const noEffects = () => Object.fromEntries(EFFECT_KEYS.map((key) => [key, false]));
const add = (errors, ok, code) => { if (!ok) errors.push(code); };

function requestShape(request, errors) {
  add(errors, exact(request, REQUEST_KEYS), 'SDK_REQUEST_SHAPE_INVALID');
  if (!exact(request, REQUEST_KEYS)) return;
  add(errors, request.schemaVersion === SDK_REQUEST_SCHEMA, 'SDK_REQUEST_SCHEMA_INVALID');
  add(errors, nonEmpty(request.caseRef), 'SDK_CASE_REF_INVALID');
  add(errors, refs(request.sourceRefs) && request.sourceRefs.length > 0, 'SDK_SOURCE_REFS_INVALID');
  for (const [section, keys] of Object.entries(REQUEST_SECTION_KEYS)) {
    add(errors, exact(request[section], keys), `SDK_${section.toUpperCase()}_SHAPE_INVALID`);
  }
  const current = request.responsibility?.currentOccupancyOrNull;
  if (current !== null && current !== undefined) add(errors, exact(current, OCCUPANCY_KEYS), 'SDK_CURRENT_OCCUPANCY_SHAPE_INVALID');
  if (Array.isArray(request.responsibility?.alternateOccupancies)) {
    request.responsibility.alternateOccupancies.forEach((item, index) => add(errors, exact(item, OCCUPANCY_KEYS), `SDK_ALTERNATE_OCCUPANCY_${index}_SHAPE_INVALID`));
  }
}

function localShape(local, errors) {
  const shapes = [
    ['graph',['graphRef','graphFingerprint','rootIntentRef']],
    ['work',['workNodeRef','nodeFingerprint','roleRef','capabilityEnvelopeRef','effectEnvelopeRef','returnRouteRef']],
    ['assignment',['assignmentRef','assignmentFingerprint','sourceIntentRef','workNodeRef','assigneeRef','assignmentState','authorityDisposition','effectDisposition']],
    ['occupancy',['occupancyRef','occupancyFingerprint','actorRef','actorClass','workNodeRef','graphFingerprint','roleRef','currentness','lifecycle']],
    ['capabilityLease',['leaseRef','leaseFingerprint','workNodeRef','graphFingerprint','envelopeRef','currentness','lifecycle']],
    ['effectLease',['leaseRef','leaseFingerprint','workNodeRef','graphFingerprint','envelopeRef','effectDisposition','currentness','lifecycle']]
  ];
  for (const [name, keys] of shapes) add(errors, exact(local?.[name], keys), `${name.toUpperCase()}_SHAPE_INVALID`);
  add(errors, refs(local?.sourceRefs) && local.sourceRefs.length > 0, 'LOCAL_SOURCE_REFS_INVALID');
  if (errors.some((code) => code.endsWith('_SHAPE_INVALID'))) return false;
  for (const [name, value] of [['graph',local.graph.graphFingerprint],['node',local.work.nodeFingerprint],['assignment',local.assignment.assignmentFingerprint],['occupancy',local.occupancy.occupancyFingerprint],['capability',local.capabilityLease.leaseFingerprint],['effect',local.effectLease.leaseFingerprint]]) add(errors, FP.test(value), `${name.toUpperCase()}_FINGERPRINT_INVALID`);
  add(errors, ACTOR_CLASSES.includes(local.occupancy.actorClass), 'OCCUPANCY_ACTOR_CLASS_INVALID');
  add(errors, local.assignment.assignmentState === 'CURRENT', 'ASSIGNMENT_NOT_CURRENT');
  add(errors, local.assignment.authorityDisposition === 'NO_AUTHORITY', 'ASSIGNMENT_AUTHORITY_COLLAPSE');
  add(errors, local.assignment.effectDisposition === 'NO_EFFECTS', 'ASSIGNMENT_EFFECT_COLLAPSE');
  for (const [name, binding] of [['OCCUPANCY',local.occupancy],['CAPABILITY_LEASE',local.capabilityLease],['EFFECT_LEASE',local.effectLease]]) {
    add(errors, binding.currentness === 'CURRENT', `${name}_NOT_CURRENT`);
    add(errors, binding.lifecycle === 'ACTIVE', `${name}_NOT_ACTIVE`);
  }
  add(errors, ['NO_EFFECTS','EFFECT_ENVELOPE_BOUND'].includes(local.effectLease.effectDisposition), 'EFFECT_LEASE_DISPOSITION_INVALID');
  return true;
}

export function validateStewardshipAdapterInput(input) {
  const errors = [];
  add(errors, exact(input, ['schemaVersion','sdkBinding','localBindings','requestDraft']), 'ADAPTER_INPUT_SHAPE_INVALID');
  if (!exact(input, ['schemaVersion','sdkBinding','localBindings','requestDraft'])) return { ok:false, errors };
  add(errors, input.schemaVersion === ADAPTER_INPUT_SCHEMA, 'ADAPTER_SCHEMA_INVALID');
  add(errors, exact(input.sdkBinding, ['processRef','profileRef','acceptedMergeRef','runtimeSourceRef','processSourceRef']), 'SDK_BINDING_SHAPE_INVALID');
  if (exact(input.sdkBinding, ['processRef','profileRef','acceptedMergeRef','runtimeSourceRef','processSourceRef'])) {
    add(errors, input.sdkBinding.processRef === SDK_PROCESS_REF, 'SDK_PROCESS_REF_MISMATCH');
    add(errors, input.sdkBinding.profileRef === SDK_PROFILE_REF, 'SDK_PROFILE_REF_MISMATCH');
    add(errors, input.sdkBinding.acceptedMergeRef === SDK_ACCEPTED_MERGE, 'SDK_ACCEPTED_MERGE_MISMATCH');
    add(errors, input.sdkBinding.runtimeSourceRef === SDK_RUNTIME_SOURCE_REF, 'SDK_RUNTIME_SOURCE_REF_MISMATCH');
    add(errors, input.sdkBinding.processSourceRef === SDK_PROCESS_SOURCE_REF, 'SDK_PROCESS_SOURCE_REF_MISMATCH');
  }
  add(errors, exact(input.localBindings, ['graph','work','assignment','occupancy','capabilityLease','effectLease','sourceRefs']), 'LOCAL_BINDINGS_SHAPE_INVALID');
  if (!exact(input.localBindings, ['graph','work','assignment','occupancy','capabilityLease','effectLease','sourceRefs'])) return { ok:false, errors:[...new Set(errors)].sort() };
  const local = input.localBindings;
  const localUsable = localShape(local, errors);
  requestShape(input.requestDraft, errors);
  if (localUsable) {
    add(errors, local.assignment.sourceIntentRef === local.graph.rootIntentRef, 'ASSIGNMENT_ROOT_INTENT_MISMATCH');
    add(errors, local.assignment.workNodeRef === local.work.workNodeRef, 'ASSIGNMENT_WORK_NODE_MISMATCH');
    add(errors, local.assignment.assigneeRef === local.occupancy.actorRef, 'ASSIGNMENT_ASSIGNEE_OCCUPANCY_MISMATCH');
    add(errors, local.occupancy.workNodeRef === local.work.workNodeRef && local.occupancy.graphFingerprint === local.graph.graphFingerprint && local.occupancy.roleRef === local.work.roleRef, 'OCCUPANCY_BINDING_MISMATCH');
    add(errors, local.capabilityLease.workNodeRef === local.work.workNodeRef && local.capabilityLease.graphFingerprint === local.graph.graphFingerprint && local.capabilityLease.envelopeRef === local.work.capabilityEnvelopeRef, 'CAPABILITY_LEASE_BINDING_MISMATCH');
    add(errors, local.effectLease.workNodeRef === local.work.workNodeRef && local.effectLease.graphFingerprint === local.graph.graphFingerprint && local.effectLease.envelopeRef === local.work.effectEnvelopeRef, 'EFFECT_LEASE_BINDING_MISMATCH');
    const request = input.requestDraft;
    add(errors, request.intent?.rootIntentionRef === local.graph.rootIntentRef, 'SDK_ROOT_INTENT_SUBSTITUTION');
    add(errors, request.continuity?.activeWorkRefs?.includes(local.work.workNodeRef), 'SDK_ACTIVE_WORK_BINDING_MISSING');
    add(errors, request.responsibility?.requiredRoleRefOrNull === local.work.roleRef, 'SDK_REQUIRED_ROLE_MISMATCH');
    add(errors, JSON.stringify(request.responsibility?.requiredCapabilityRefs) === JSON.stringify([local.work.capabilityEnvelopeRef]), 'SDK_REQUIRED_CAPABILITY_BINDING_MISMATCH');
    add(errors, Array.isArray(request.responsibility?.alternateOccupancies) && request.responsibility.alternateOccupancies.length === 0, 'SDK_ADAPTER_V1_ALTERNATE_OCCUPANCIES_NOT_SUPPORTED');
    const current = request.responsibility?.currentOccupancyOrNull;
    add(errors, !!current, 'SDK_CURRENT_OCCUPANCY_REQUIRED');
    if (current) {
      add(errors, current.occupancyRef === local.occupancy.occupancyRef && current.roleRef === local.work.roleRef && current.actorClass === local.occupancy.actorClass, 'SDK_CURRENT_OCCUPANCY_BINDING_MISMATCH');
      add(errors, JSON.stringify(current.capabilityRefs) === JSON.stringify([local.work.capabilityEnvelopeRef]), 'SDK_OCCUPANCY_CAPABILITY_BINDING_MISMATCH');
      add(errors, current.capabilityState === 'CURRENT' && current.authorityState === 'CURRENT', 'SDK_OCCUPANCY_NOT_CURRENT');
    }
    const required = canonicalRefs([...local.sourceRefs,input.sdkBinding.runtimeSourceRef,input.sdkBinding.processSourceRef]);
    const actual = refs(request.sourceRefs) ? canonicalRefs(request.sourceRefs) : [];
    add(errors, required.every((ref) => actual.includes(ref)), 'SDK_REQUIRED_SOURCE_BINDINGS_MISSING');
  }
  return { ok:errors.length === 0, errors:[...new Set(errors)].sort() };
}

export function formStewardshipRequest(input) {
  const value = clone(input);
  const validation = validateStewardshipAdapterInput(value);
  if (!validation.ok) {
    const error = new Error('STEWARDSHIP_ADAPTER_INPUT_INVALID');
    error.code = 'STEWARDSHIP_ADAPTER_INPUT_INVALID';
    error.errors = validation.errors;
    throw error;
  }
  const request = clone(value.requestDraft);
  const local = value.localBindings;
  const core = {
    schemaVersion:ADAPTER_BUILD_RECEIPT_SCHEMA, processRef:SDK_PROCESS_REF, profileRef:SDK_PROFILE_REF,
    acceptedMergeRef:SDK_ACCEPTED_MERGE, caseRef:request.caseRef,
    graphRef:local.graph.graphRef, graphFingerprint:local.graph.graphFingerprint, rootIntentRef:local.graph.rootIntentRef,
    workNodeRef:local.work.workNodeRef, nodeFingerprint:local.work.nodeFingerprint,
    assignmentRef:local.assignment.assignmentRef, assignmentFingerprint:local.assignment.assignmentFingerprint,
    occupancyRef:local.occupancy.occupancyRef, occupancyFingerprint:local.occupancy.occupancyFingerprint,
    capabilityLeaseRef:local.capabilityLease.leaseRef, capabilityLeaseFingerprint:local.capabilityLease.leaseFingerprint,
    effectLeaseRef:local.effectLease.leaseRef, effectLeaseFingerprint:local.effectLease.leaseFingerprint,
    requestFingerprint:hash(request), sourceRefs:canonicalRefs(request.sourceRefs),
    executionAuthority:'NONE', effectAuthority:'NONE', effects:noEffects()
  };
  return { request, adapterReceipt:Object.freeze({...core, semanticFingerprint:hash(core)}) };
}

export function consumeStewardshipReceipt(input, sdkReceipt) {
  const formed = formStewardshipRequest(input);
  const request = formed.request;
  const local = input.localBindings;
  const receipt = clone(sdkReceipt);
  const errors = [];
  add(errors, exact(receipt, RECEIPT_KEYS), 'SDK_RECEIPT_SHAPE_INVALID');
  if (exact(receipt, RECEIPT_KEYS)) {
    add(errors, receipt.schemaVersion === SDK_RECEIPT_SCHEMA, 'SDK_RECEIPT_SCHEMA_INVALID');
    add(errors, receipt.profileRef === SDK_PROFILE_REF, 'SDK_RECEIPT_PROFILE_REF_MISMATCH');
    add(errors, receipt.caseRef === request.caseRef, 'SDK_RECEIPT_CASE_REF_MISMATCH');
    add(errors, receipt.accepted === true, 'SDK_RECEIPT_NOT_ACCEPTED');
    add(errors, TRANSITIONS.includes(receipt.nextTransition), 'SDK_RECEIPT_TRANSITION_INVALID');
    add(errors, refs(receipt.sourceRefs) && JSON.stringify(canonicalRefs(receipt.sourceRefs)) === JSON.stringify(canonicalRefs(request.sourceRefs)), 'SDK_RECEIPT_SOURCE_REFS_MISMATCH');
    add(errors, exact(receipt.effects, EFFECT_KEYS), 'SDK_RECEIPT_EFFECT_SHAPE_INVALID');
    if (exact(receipt.effects, EFFECT_KEYS)) for (const key of EFFECT_KEYS) add(errors, receipt.effects[key] === false, `SDK_RECEIPT_EFFECT_TRUE:${key}`);
    add(errors, SDK_FP.test(receipt.fingerprint), 'SDK_RECEIPT_FINGERPRINT_INVALID');
    if (SDK_FP.test(receipt.fingerprint)) {
      const raw = clone(receipt); delete raw.fingerprint;
      add(errors, receipt.fingerprint === sdkHash(raw), 'SDK_RECEIPT_FINGERPRINT_MISMATCH');
    }
    add(errors, receipt.intentProjection?.rootIntentionRef === local.graph.rootIntentRef && receipt.intentProjection?.interpretationReplacesGoal === false, 'SDK_RECEIPT_INTENT_COLLAPSE');
    add(errors, receipt.pathProjection?.minimalSafePathIsOnlyPath === false && receipt.pathProjection?.heldPathHasEffectAuthorityByImplication === false, 'SDK_RECEIPT_PATH_COLLAPSE');
    add(errors, receipt.decisionTimingProjection?.recommendationIsHumanDecision === false && receipt.decisionTimingProjection?.reminderSchedulingAuthorized === false && receipt.decisionTimingProjection?.inferredReadinessGrantsConsent === false, 'SDK_RECEIPT_DECISION_COLLAPSE');
    add(errors, receipt.responsibilityProjection?.requiredRoleRefOrNull === local.work.roleRef && receipt.responsibilityProjection?.currentOccupancyRefOrNull === local.occupancy.occupancyRef, 'SDK_RECEIPT_RESPONSIBILITY_MISMATCH');
    const selected = receipt.responsibilityProjection?.selectedOccupancyRefOrNull;
    add(errors, selected === null || selected === local.occupancy.occupancyRef, 'SDK_RECEIPT_FOREIGN_SELECTED_OCCUPANCY');
    const actorClass = receipt.responsibilityProjection?.selectedActorClassOrNull;
    add(errors, actorClass === null || actorClass === local.occupancy.actorClass, 'SDK_RECEIPT_SELECTED_ACTOR_CLASS_MISMATCH');
    add(errors, receipt.responsibilityProjection?.actorClassAloneGrantsAuthority === false, 'SDK_RECEIPT_ACTOR_AUTHORITY_COLLAPSE');
    add(errors, receipt.outcomeProjection?.effectResultIsOutcomeVerified === false && receipt.outcomeProjection?.taskCompletionIsIntentSatisfaction === false, 'SDK_RECEIPT_OUTCOME_COLLAPSE');
  }
  if (errors.length) {
    const error = new Error('STEWARDSHIP_SDK_RECEIPT_INVALID');
    error.code = 'STEWARDSHIP_SDK_RECEIPT_INVALID';
    error.errors = [...new Set(errors)].sort();
    throw error;
  }
  const core = {
    schemaVersion:ADAPTER_ROUTE_RECEIPT_SCHEMA, processRef:SDK_PROCESS_REF, profileRef:SDK_PROFILE_REF,
    caseRef:request.caseRef, sourceSdkReceiptFingerprint:receipt.fingerprint,
    sourceAdapterBuildFingerprint:formed.adapterReceipt.semanticFingerprint,
    graphRef:local.graph.graphRef, graphFingerprint:local.graph.graphFingerprint,
    workNodeRef:local.work.workNodeRef, assignmentRef:local.assignment.assignmentRef, occupancyRef:local.occupancy.occupancyRef,
    nextTransition:receipt.nextTransition, blockers:[...receipt.blockers].sort(), returnRouteRef:local.work.returnRouteRef,
    recommendationOnly:true, executionAuthority:'NONE', effectAuthority:'NONE', sourceRefs:canonicalRefs(receipt.sourceRefs), effects:noEffects()
  };
  return Object.freeze({...core, semanticFingerprint:hash(core)});
}

// [VXG RealForever]
