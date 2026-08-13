import { semanticHash } from './utils.mjs';

export const GUIDED_ESTABLISHMENT_PLAN_REF = 'plan.vexlife.guided-establishment.local.001';
export const GUIDED_ESTABLISHMENT_JOURNEY_REF = 'journey.vexlife.guided-local-establishment.001';
export const GUIDED_ESTABLISHMENT_PROFILE_REF = 'experience.vexlife.newcomer-guided';
export const GUIDED_ESTABLISHMENT_EFFECT_CLASS = 'DECLARATIVE_NO_EFFECT';

export const GUIDED_ESTABLISHMENT_FRONTDOOR_BINDINGS = Object.freeze({
  'platform.windows': 'install/vexlife-setup.ps1',
  'platform.macos': 'install/vexlife-setup.sh'
});

export const GUIDED_ESTABLISHMENT_STAGE_PURPOSES = Object.freeze([
  'DISCOVER',
  'CHOOSE_PLATFORM',
  'CHECK_REQUIREMENTS',
  'DOWNLOAD',
  'VERIFY_ARTIFACT',
  'ESTABLISH',
  'START',
  'MEET_VEX',
  'VERIFY_HEALTH',
  'UNDERSTAND_AVAILABLE_AND_HELD_FEATURES',
  'LEARN_RECOVERY',
  'UNDERSTAND_UNINSTALL_AND_PRESERVATION',
  'COMPLETE'
]);

export const GUIDED_ESTABLISHMENT_REQUIRED_TRUTH_BOUNDARIES = Object.freeze([
  'GUIDED_SCRIPT_SETUP != SIGNED_ZERO_PREREQUISITE_NATIVE_INSTALLER',
  'DOWNLOAD != VERIFIED_ARTIFACT',
  'VERIFIED_ARTIFACT != ESTABLISHED',
  'ESTABLISHED != RUNNING',
  'RUNNING != EVERY_FEATURE_AVAILABLE',
  'PREPARED != AVAILABLE',
  'UNAVAILABLE != BROKEN',
  'PAIRED != AUTHORIZED',
  'AUTHENTICATED != CAPABILITY_LEASE',
  'DIAGNOSIS_AVAILABLE != REPAIR_AUTHORITY',
  'GUIDE_PLAN != LIVED_JOURNEY_EVENT',
  'GUIDE_PLAN != EXPERIENCE_CAPTURE_EVIDENCE',
  'CURRENT_SCREENSHOT != CURRENT_FOREVER',
  'PUBLIC_GUIDE_CANDIDATE != PUBLICATION_AUTHORITY'
]);

const GUIDED_PLAN_KEYS = new Set([
  'planRef',
  'journeyRef',
  'experienceProfileRef',
  'effects',
  'platformBindings',
  'stages',
  'truthBoundaries'
]);
const GUIDED_PLATFORM_BINDING_KEYS = new Set(['platformRef', 'adapterSourcePath']);
const GUIDED_STAGE_KEYS = new Set([
  'stageRef',
  'sequence',
  'purposeClass',
  'actorClass',
  'effectClass',
  'expectedOutcomeClass',
  'captureRequired',
  'recoveryClass'
]);
const SUPPORTED_GUIDE_PLATFORM_REFS = new Set(Object.keys(GUIDED_ESTABLISHMENT_FRONTDOOR_BINDINGS));

function unknownKeys(value, allowed) {
  return Object.keys(value ?? {}).filter((key) => !allowed.has(key));
}

function isSafeRelativeSourcePath(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !/^[a-z]:[\\/]/iu.test(value) &&
    !value.split(/[\\/]/u).includes('..');
}

function validateGuidedEstablishmentPlan(plan, { profileRefs = new Set() } = {}) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return ['guided establishment plan must be an object'];

  const extraPlanKeys = unknownKeys(plan, GUIDED_PLAN_KEYS);
  if (extraPlanKeys.length) errors.push(`${plan.planRef ?? 'guided plan'} unsupported field ${extraPlanKeys[0]}`);
  for (const field of ['planRef', 'journeyRef', 'experienceProfileRef']) {
    if (typeof plan[field] !== 'string' || !plan[field]) errors.push(`guided establishment plan missing ${field}`);
  }
  if (plan.effects !== false) errors.push(`${plan.planRef ?? 'guided plan'} effects must be false`);
  if (profileRefs.size && !profileRefs.has(plan.experienceProfileRef)) {
    errors.push(`${plan.planRef ?? 'guided plan'} missing experience profile ${plan.experienceProfileRef}`);
  }

  if (!Array.isArray(plan.platformBindings) || plan.platformBindings.length === 0) {
    errors.push(`${plan.planRef ?? 'guided plan'} platformBindings requires at least one binding`);
  } else {
    const platformRefs = new Set();
    for (const [index, binding] of plan.platformBindings.entries()) {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
        errors.push(`${plan.planRef ?? 'guided plan'} platformBindings[${index}] must be an object`);
        continue;
      }
      const extraBindingKeys = unknownKeys(binding, GUIDED_PLATFORM_BINDING_KEYS);
      if (extraBindingKeys.length) errors.push(`${plan.planRef ?? 'guided plan'} platform binding unsupported field ${extraBindingKeys[0]}`);
      if (!SUPPORTED_GUIDE_PLATFORM_REFS.has(binding.platformRef)) errors.push(`${plan.planRef ?? 'guided plan'} unknown platform binding ${binding.platformRef}`);
      if (platformRefs.has(binding.platformRef)) errors.push(`${plan.planRef ?? 'guided plan'} duplicate platform binding ${binding.platformRef}`);
      platformRefs.add(binding.platformRef);
      if (!isSafeRelativeSourcePath(binding.adapterSourcePath)) errors.push(`${plan.planRef ?? 'guided plan'} invalid adapter source path ${binding.adapterSourcePath}`);
    }
  }

  if (!Array.isArray(plan.stages) || plan.stages.length === 0) {
    errors.push(`${plan.planRef ?? 'guided plan'} stages requires at least one stage`);
  } else {
    const stageRefs = new Set();
    for (const [index, stage] of plan.stages.entries()) {
      if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
        errors.push(`${plan.planRef ?? 'guided plan'} stages[${index}] must be an object`);
        continue;
      }
      const extraStageKeys = unknownKeys(stage, GUIDED_STAGE_KEYS);
      if (extraStageKeys.length) errors.push(`${plan.planRef ?? 'guided plan'} stage unsupported field ${extraStageKeys[0]}`);
      if (!stage.stageRef) errors.push(`${plan.planRef ?? 'guided plan'} stage missing stageRef`);
      if (stageRefs.has(stage.stageRef)) errors.push(`${plan.planRef ?? 'guided plan'} duplicate stageRef ${stage.stageRef}`);
      stageRefs.add(stage.stageRef);
      if (stage.sequence !== index) errors.push(`${plan.planRef ?? 'guided plan'} stage sequence must be contiguous and zero-based`);
      for (const field of ['purposeClass', 'actorClass', 'expectedOutcomeClass', 'recoveryClass']) {
        if (typeof stage[field] !== 'string' || !stage[field]) errors.push(`${stage.stageRef ?? `stage[${index}]`} missing ${field}`);
      }
      if (stage.effectClass !== GUIDED_ESTABLISHMENT_EFFECT_CLASS) {
        errors.push(`${stage.stageRef ?? `stage[${index}]`} effectClass must be ${GUIDED_ESTABLISHMENT_EFFECT_CLASS}`);
      }
      if (typeof stage.captureRequired !== 'boolean') errors.push(`${stage.stageRef ?? `stage[${index}]`} captureRequired must be boolean`);
    }
  }

  if (!Array.isArray(plan.truthBoundaries) || plan.truthBoundaries.length === 0) {
    errors.push(`${plan.planRef ?? 'guided plan'} truthBoundaries requires at least one boundary`);
  } else if (new Set(plan.truthBoundaries).size !== plan.truthBoundaries.length) {
    errors.push(`${plan.planRef ?? 'guided plan'} truthBoundaries contains duplicates`);
  }

  if (plan.planRef === GUIDED_ESTABLISHMENT_PLAN_REF) {
    if (plan.journeyRef !== GUIDED_ESTABLISHMENT_JOURNEY_REF) errors.push(`${plan.planRef} canonical journeyRef changed`);
    if (plan.experienceProfileRef !== GUIDED_ESTABLISHMENT_PROFILE_REF) errors.push(`${plan.planRef} canonical experienceProfileRef changed`);

    const expectedBindings = Object.entries(GUIDED_ESTABLISHMENT_FRONTDOOR_BINDINGS);
    if (plan.platformBindings?.length !== expectedBindings.length) {
      errors.push(`${plan.planRef} canonical platform binding count changed`);
    }
    for (const [platformRef, sourcePath] of expectedBindings) {
      const binding = plan.platformBindings?.find((candidate) => candidate.platformRef === platformRef);
      if (!binding || binding.adapterSourcePath !== sourcePath) {
        errors.push(`${plan.planRef} current Frontdoor source binding drifted for ${platformRef}`);
      }
    }

    if (plan.stages?.length !== GUIDED_ESTABLISHMENT_STAGE_PURPOSES.length) {
      errors.push(`${plan.planRef} canonical stage count changed`);
    }
    for (const [index, purposeClass] of GUIDED_ESTABLISHMENT_STAGE_PURPOSES.entries()) {
      const stage = plan.stages?.[index];
      const expectedStageRef = `stage.vexlife.guided-establishment.${purposeClass.toLowerCase().replaceAll('_', '-')}`;
      if (!stage || stage.purposeClass !== purposeClass || stage.stageRef !== expectedStageRef) {
        errors.push(`${plan.planRef} canonical stage identity/order changed at ${purposeClass}`);
      }
    }

    if (JSON.stringify(plan.truthBoundaries) !== JSON.stringify(GUIDED_ESTABLISHMENT_REQUIRED_TRUTH_BOUNDARIES)) {
      errors.push(`${plan.planRef} canonical truth boundaries changed`);
    }
  }

  return errors;
}

function assertGuidedEstablishmentPlan(plan, options) {
  const errors = validateGuidedEstablishmentPlan(plan, options);
  if (errors.length) throw new Error(errors[0]);
  return plan;
}

export class ExperienceRegistry {
  constructor(source) {
    if (!source?.registryRef) throw new Error('experience registryRef is required');
    this.registryRef = source.registryRef;
    this.profiles = new Map((source.experienceProfiles ?? []).map((item) => [item.profileRef, structuredClone(item)]));
    this.gestures = new Map((source.gestureContracts ?? []).map((item) => [item.gestureRef, structuredClone(item)]));
    this.vessels = new Map((source.vessels ?? []).map((item) => [item.vesselRef, structuredClone(item)]));
    this.guidedEstablishmentPlans = new Map((source.guidedEstablishmentPlans ?? []).map((item) => [item.planRef, structuredClone(item)]));
  }

  profile(ref) { const value = this.profiles.get(ref); if (!value) throw new Error(`missing experience profile ${ref}`); return structuredClone(value); }
  vessel(ref) { const value = this.vessels.get(ref); if (!value) throw new Error(`missing action vessel ${ref}`); return structuredClone(value); }
  guidedEstablishmentPlan(ref) {
    const value = this.guidedEstablishmentPlans.get(ref);
    if (!value) throw new Error(`missing guided establishment plan ${ref}`);
    return structuredClone(value);
  }

  resolveInteraction({ surfaceKind, inputType, preferredGestureRef = null, modifiers = [], accessibilityMode = null } = {}) {
    const candidates = [...this.gestures.values()].filter((gesture) => gesture.surfaceKinds.includes(surfaceKind) && gesture.inputs.includes(inputType));
    let selected = preferredGestureRef ? candidates.filter((gesture) => gesture.gestureRef === preferredGestureRef) : candidates;
    if (accessibilityMode === 'SCREEN_MAGNIFICATION' && inputType === 'PINCH') selected = [];
    if (selected.length === 0) return { disposition: 'NO_MATCH', surfaceKind, inputType, candidateRefs: candidates.map((item) => item.gestureRef), semanticHash: semanticHash({ surfaceKind, inputType, modifiers, accessibilityMode }) };
    if (selected.length > 1) return { disposition: 'AMBIGUOUS_BLOCKED', surfaceKind, inputType, candidateRefs: selected.map((item) => item.gestureRef).sort(), semanticHash: semanticHash(selected.map((item) => item.gestureRef).sort()) };
    const gesture = selected[0];
    return { disposition: 'INTERACTION_RESOLVED', gestureRef: gesture.gestureRef, actionRef: gesture.resultActionRef, rules: structuredClone(gesture.rules), modifiers: [...modifiers], semanticHash: semanticHash({ gestureRef: gesture.gestureRef, surfaceKind, inputType, modifiers, accessibilityMode }) };
  }

  buildProfileProjection(profileRef, { availableRegionRefs = [], availableRoleRefs = [] } = {}) {
    const profile = this.profile(profileRef);
    return {
      profileRef,
      defaultRouteRef: profile.defaultRouteRef,
      defaultRoleRef: availableRoleRefs.includes(profile.defaultRoleRef) ? profile.defaultRoleRef : null,
      visibleRegionRefs: profile.defaultVisibleRegionRefs.filter((ref) => availableRegionRefs.includes(ref)),
      detailDensity: profile.detailDensity,
      guideMode: profile.guideMode,
      attentionPolicy: profile.attentionPolicy,
      semanticHash: semanticHash({ profileRef, availableRegionRefs: [...availableRegionRefs].sort(), availableRoleRefs: [...availableRoleRefs].sort() })
    };
  }

  buildGuidedEstablishmentProjection(planRef, { platformRef } = {}) {
    const plan = this.guidedEstablishmentPlan(planRef);
    assertGuidedEstablishmentPlan(plan, { profileRefs: new Set(this.profiles.keys()) });
    const binding = plan.platformBindings.find((candidate) => candidate.platformRef === platformRef);
    if (!binding) throw new Error(`unsupported guided establishment platform ${platformRef}`);
    const projection = {
      planRef: plan.planRef,
      journeyRef: plan.journeyRef,
      experienceProfileRef: plan.experienceProfileRef,
      platformRef,
      adapterSourcePath: binding.adapterSourcePath,
      effects: false,
      stages: plan.stages.map((stage) => structuredClone(stage)),
      truthBoundaries: [...plan.truthBoundaries]
    };
    return { ...projection, semanticHash: semanticHash(projection) };
  }

  buildGuidedEstablishmentReviewSeed(planRef) {
    const plan = this.guidedEstablishmentPlan(planRef);
    assertGuidedEstablishmentPlan(plan, { profileRefs: new Set(this.profiles.keys()) });
    const seed = {
      featureOrJourneyRef: plan.journeyRef,
      reviewStepRefs: plan.stages.map((stage) => stage.stageRef),
      reviewSteps: plan.stages.map((stage) => ({
        reviewStepRef: stage.stageRef,
        sequence: stage.sequence
      })),
      captureAtStepRefs: plan.stages.filter((stage) => stage.captureRequired).map((stage) => stage.stageRef),
      effects: false
    };
    return { ...seed, semanticHash: semanticHash(seed) };
  }
}

export function validateExperienceRegistry(source, { actionRefs = new Set(), componentRefs = new Set(), stringRefs = new Set() } = {}) {
  const errors = [];
  const seen = new Set();
  const add = (ref, kind) => { if (!ref) errors.push(`${kind} missing ref`); else if (seen.has(ref)) errors.push(`duplicate experience ref ${ref}`); else seen.add(ref); };
  const profileRefs = new Set((source.experienceProfiles ?? []).map((item) => item.profileRef));
  for (const profile of source.experienceProfiles ?? []) {
    add(profile.profileRef, 'profile');
    if (!stringRefs.has(profile.labelStringRef)) errors.push(`${profile.profileRef} missing label string ${profile.labelStringRef}`);
  }
  for (const gesture of source.gestureContracts ?? []) {
    add(gesture.gestureRef, 'gesture');
    if (!actionRefs.has(gesture.resultActionRef)) errors.push(`${gesture.gestureRef} missing action ${gesture.resultActionRef}`);
    if (!stringRefs.has(gesture.helpStringRef)) errors.push(`${gesture.gestureRef} missing help string ${gesture.helpStringRef}`);
    if (!(gesture.surfaceKinds?.length && gesture.inputs?.length && gesture.rules?.length)) errors.push(`${gesture.gestureRef} incomplete interaction contract`);
  }
  for (const vessel of source.vessels ?? []) {
    add(vessel.vesselRef, 'vessel');
    if (!componentRefs.has(vessel.componentRef)) errors.push(`${vessel.vesselRef} missing component ${vessel.componentRef}`);
    if (!stringRefs.has(vessel.labelStringRef)) errors.push(`${vessel.vesselRef} missing label string ${vessel.labelStringRef}`);
    for (const actionRef of vessel.actionRefs ?? []) if (!actionRefs.has(actionRef)) errors.push(`${vessel.vesselRef} missing action ${actionRef}`);
    if (!vessel.accessibility?.neverObscuresDeclaredControls) errors.push(`${vessel.vesselRef} must protect declared controls`);
  }
  for (const plan of source.guidedEstablishmentPlans ?? []) {
    add(plan.planRef, 'guided establishment plan');
    add(plan.journeyRef, 'guided establishment journey');
    errors.push(...validateGuidedEstablishmentPlan(plan, { profileRefs }));
    for (const stage of plan.stages ?? []) add(stage.stageRef, 'guided establishment stage');
  }
  return { ok: errors.length === 0, errors };
}

// [VXG RealForever]
