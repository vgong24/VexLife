import { semanticHash } from './utils.mjs';

export const GUIDED_ESTABLISHMENT_PLAN_REF = 'plan.vexlife.guided-establishment.local.001';
export const GUIDED_ESTABLISHMENT_JOURNEY_REF = 'journey.vexlife.guided-local-establishment.001';
export const GUIDED_ESTABLISHMENT_PROFILE_REF = 'experience.vexlife.newcomer-guided';
export const GUIDED_ESTABLISHMENT_EFFECT_CLASS = 'DECLARATIVE_NO_EFFECT';
export const FEATURE_WALKTHROUGH_EFFECT_CLASS = 'DECLARATIVE_NO_EFFECT';

export const E27_AUTHORITATIVE_ROOT_CONTRACT_REF = 'contract.vexlife.e27.authoritative-root/v1';
export const E27_REFERENCE_BASELINE_REF = 'design-baseline.vexlife.e2.7.scoped-layers-vexorg-sandbox.34f17a12-38b6-438c-b899-6d07c36f1eb0';
export const E27_ARTIFACT_SHA256 = '9f944af803c43a494af944e987d1c4c6a6c7f71c89c648cbdf6536c07dbeda17';
export const E27_START_HERE_SHA256 = 'e4db5d25013cda1d89d1bad2ac70183bf7f1dd69cd8bd7a6c0aff33882590107';
export const E27_SUPERSESSION_REQUIRED_FIELDS = Object.freeze([
  'supersedesRef',
  'signalOrRegionRef',
  'delta',
  'reason',
  'canonicalOwnerRef',
  'evidenceRefs',
  'protectedPreserveRefs',
  'regressionProofRefs',
  'humanReviewRef',
  'assuranceRef'
]);

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
const FEATURE_WALKTHROUGH_PLAN_KEYS = new Set([
  'planRef',
  'journeyRef',
  'featureRef',
  'sourceVersionRef',
  'experienceProfileRef',
  'effects',
  'replayable',
  'stages',
  'truthBoundaries',
  'supersedesPlanRefOrNull'
]);
const FEATURE_WALKTHROUGH_STAGE_KEYS = new Set([
  'stageRef',
  'sequence',
  'purposeClass',
  'contentStringRef',
  'targetRefOrNull',
  'actionRefOrNull',
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

function isNullableRef(value) {
  return value === null || (typeof value === 'string' && value.length > 0);
}

export function validateAuthoritativeRootDesignContract(contract, { actionRefs = new Set() } = {}) {
  const errors = [];
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return ['authoritative E2.7 root design contract is missing'];
  }
  if (contract.contractRef !== E27_AUTHORITATIVE_ROOT_CONTRACT_REF) errors.push('authoritative E2.7 root contractRef changed');
  if (contract.authorityScope !== 'HUMAN_VISIBLE_DESIGN_AND_INTERACTION_GRAMMAR') errors.push('authoritative E2.7 authority scope changed');
  if (contract.referenceBaselineRef !== E27_REFERENCE_BASELINE_REF) errors.push('authoritative E2.7 reference baseline changed');
  if (contract.artifactSha256 !== E27_ARTIFACT_SHA256) errors.push('authoritative E2.7 artifact hash changed');
  if (contract.startHereSha256 !== E27_START_HERE_SHA256) errors.push('authoritative E2.7 start-here hash changed');
  if (contract.inheritanceDirection !== 'E27_ROOT_BODY_WITH_CURRENT_TRUTH_AND_CAPABILITIES_CARRIED_IN') {
    errors.push('authoritative E2.7 inheritance direction changed');
  }
  for (const field of ['acceptanceRef', 'sealRef', 'custodyRef', 'rootDispositionRef']) {
    if (typeof contract[field] !== 'string' || !contract[field]) errors.push(`authoritative E2.7 contract missing ${field}`);
  }

  const shell = contract.defaultShellGrammar;
  if (!shell || typeof shell !== 'object') errors.push('authoritative E2.7 default shell grammar is missing');
  else {
    if (shell.primaryStageScreenRef !== 'screen.vexlife.terrain' || shell.primaryStageRouteRef !== 'route.terrain') {
      errors.push('authoritative E2.7 default shell must use Terrain as the primary stage');
    }
    if (shell.singleStageDefault !== true) errors.push('authoritative E2.7 shell must be single-stage by default');
    if (!Array.isArray(shell.permanentPrimaryTabRefs) || shell.permanentPrimaryTabRefs.length !== 0) {
      errors.push('authoritative E2.7 shell cannot preserve permanent primary tabs by default');
    }
    if (shell.legacyCurrentBrowserPreservationDefault !== false) {
      errors.push('legacy current browser cannot be an implicit preservation default');
    }
    for (const routeRef of ['route.chat', 'route.health']) {
      if (!shell.secondaryRouteRefs?.includes(routeRef)) errors.push(`authoritative E2.7 shell missing secondary route ${routeRef}`);
    }
  }

  if (!Array.isArray(contract.preserveSignals) || contract.preserveSignals.length === 0 || new Set(contract.preserveSignals).size !== contract.preserveSignals.length) {
    errors.push('authoritative E2.7 preserve signals must be unique and non-empty');
  }
  for (const actionRef of contract.carriedActionRefs ?? []) {
    if (!actionRefs.has(actionRef)) errors.push(`authoritative E2.7 contract references missing action ${actionRef}`);
  }

  const autoEntry = contract.semanticAutoEntry;
  if (!autoEntry || typeof autoEntry !== 'object') errors.push('authoritative E2.7 semantic auto-entry contract is missing');
  else {
    if (autoEntry.state !== 'SOURCE_MANAGED_REQUIRED_FOR_STAGE_B') errors.push('semantic auto-entry Stage-B requirement changed');
    if (autoEntry.actionRef !== 'action.terrain.semantic-auto-entry.toggle' || !actionRefs.has(autoEntry.actionRef)) {
      errors.push('semantic auto-entry opt-out action is missing');
    }
    if (autoEntry.visibleThresholdRequired !== true || autoEntry.visibleConfidenceRequired !== true || autoEntry.optOutRequired !== true) {
      errors.push('semantic auto-entry must expose threshold, confidence and opt-out');
    }
    if (autoEntry.ordinaryScrollMayCommit !== false) errors.push('ordinary scrolling may not commit semantic auto-entry');
  }

  const supersession = contract.supersessionGrammar;
  if (!supersession || typeof supersession !== 'object') errors.push('authoritative E2.7 supersession grammar is missing');
  else {
    if (supersession.differenceFromE27RequiresAcceptedSupersessionEvidence !== true ||
        supersession.noAcceptedSupersessionEvidenceMeansE27Wins !== true) {
      errors.push('authoritative E2.7 supersession precedence changed');
    }
    if (JSON.stringify(supersession.requiredFields) !== JSON.stringify(E27_SUPERSESSION_REQUIRED_FIELDS)) {
      errors.push('authoritative E2.7 supersession required fields changed');
    }
  }
  for (const [index, record] of (contract.supersessionRecords ?? []).entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`authoritative E2.7 supersession record ${index} must be an object`);
      continue;
    }
    for (const field of E27_SUPERSESSION_REQUIRED_FIELDS) {
      const value = record[field];
      const missing = Array.isArray(value) ? value.length === 0 : typeof value !== 'string' || value.length === 0;
      if (missing) errors.push(`authoritative E2.7 supersession record ${index} missing ${field}`);
    }
  }

  const exclusions = contract.productExclusions;
  if (!exclusions || exclusions.syntheticVexOrgDataAllowed !== false || exclusions.syntheticOrganizationOrPeopleTruthAllowed !== false) {
    errors.push('synthetic VexOrg review data must remain excluded from product truth');
  }
  for (const forbidden of ['VexOrg Demo Company', 'Maya Chen']) {
    if (!exclusions?.forbiddenExamples?.includes(forbidden)) errors.push(`authoritative E2.7 product exclusion missing ${forbidden}`);
  }
  return errors;
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

export function validateFeatureWalkthroughPlan(plan, {
  profileRefs = new Set(),
  actionRefs = new Set(),
  stringRefs = new Set()
} = {}) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return ['feature walkthrough plan must be an object'];

  const label = plan.planRef ?? 'feature walkthrough plan';
  const extraPlanKeys = unknownKeys(plan, FEATURE_WALKTHROUGH_PLAN_KEYS);
  if (extraPlanKeys.length) errors.push(`${label} unsupported field ${extraPlanKeys[0]}`);
  for (const field of ['planRef', 'journeyRef', 'featureRef', 'sourceVersionRef', 'experienceProfileRef']) {
    if (typeof plan[field] !== 'string' || !plan[field]) errors.push(`${label} missing ${field}`);
  }
  if (plan.effects !== false) errors.push(`${label} effects must be false`);
  if (typeof plan.replayable !== 'boolean') errors.push(`${label} replayable must be boolean`);
  if (profileRefs.size && !profileRefs.has(plan.experienceProfileRef)) {
    errors.push(`${label} missing experience profile ${plan.experienceProfileRef}`);
  }
  if (!isNullableRef(plan.supersedesPlanRefOrNull)) errors.push(`${label} supersedesPlanRefOrNull must be null or a non-empty ref`);
  if (plan.supersedesPlanRefOrNull === plan.planRef) errors.push(`${label} cannot supersede itself`);

  if (!Array.isArray(plan.stages) || plan.stages.length === 0) {
    errors.push(`${label} stages requires at least one stage`);
  } else {
    const stageRefs = new Set();
    for (const [index, stage] of plan.stages.entries()) {
      if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
        errors.push(`${label} stages[${index}] must be an object`);
        continue;
      }
      const extraStageKeys = unknownKeys(stage, FEATURE_WALKTHROUGH_STAGE_KEYS);
      if (extraStageKeys.length) errors.push(`${label} stage unsupported field ${extraStageKeys[0]}`);
      if (typeof stage.stageRef !== 'string' || !stage.stageRef) errors.push(`${label} stage missing stageRef`);
      if (stageRefs.has(stage.stageRef)) errors.push(`${label} duplicate stageRef ${stage.stageRef}`);
      stageRefs.add(stage.stageRef);
      if (stage.sequence !== index) errors.push(`${label} stage sequence must be contiguous and zero-based`);
      for (const field of ['purposeClass', 'contentStringRef', 'expectedOutcomeClass', 'recoveryClass']) {
        if (typeof stage[field] !== 'string' || !stage[field]) errors.push(`${stage.stageRef ?? `stage[${index}]`} missing ${field}`);
      }
      if (stringRefs.size && stage.contentStringRef && !stringRefs.has(stage.contentStringRef)) {
        errors.push(`${stage.stageRef ?? `stage[${index}]`} missing content string ${stage.contentStringRef}`);
      }
      if (!isNullableRef(stage.targetRefOrNull)) errors.push(`${stage.stageRef ?? `stage[${index}]`} targetRefOrNull must be null or a non-empty ref`);
      if (!isNullableRef(stage.actionRefOrNull)) errors.push(`${stage.stageRef ?? `stage[${index}]`} actionRefOrNull must be null or a non-empty ref`);
      if (actionRefs.size && stage.actionRefOrNull && !actionRefs.has(stage.actionRefOrNull)) {
        errors.push(`${stage.stageRef ?? `stage[${index}]`} missing action ${stage.actionRefOrNull}`);
      }
      if (typeof stage.captureRequired !== 'boolean') errors.push(`${stage.stageRef ?? `stage[${index}]`} captureRequired must be boolean`);
    }
  }

  if (!Array.isArray(plan.truthBoundaries) || plan.truthBoundaries.length === 0) {
    errors.push(`${label} truthBoundaries requires at least one boundary`);
  } else {
    if (new Set(plan.truthBoundaries).size !== plan.truthBoundaries.length) errors.push(`${label} truthBoundaries contains duplicates`);
    for (const [index, boundary] of plan.truthBoundaries.entries()) {
      if (typeof boundary !== 'string' || boundary.length === 0) errors.push(`${label} truthBoundaries[${index}] must be non-empty`);
    }
  }

  return errors;
}

function assertGuidedEstablishmentPlan(plan, options) {
  const errors = validateGuidedEstablishmentPlan(plan, options);
  if (errors.length) throw new Error(errors[0]);
  return plan;
}

function assertFeatureWalkthroughPlan(plan, options) {
  const errors = validateFeatureWalkthroughPlan(plan, options);
  if (errors.length) throw new Error(errors[0]);
  return plan;
}

export class ExperienceRegistry {
  constructor(source) {
    if (!source?.registryRef) throw new Error('experience registryRef is required');
    this.registryRef = source.registryRef;
    this.rootDesignContract = structuredClone(source.authoritativeRootDesignContract ?? null);
    this.profiles = new Map((source.experienceProfiles ?? []).map((item) => [item.profileRef, structuredClone(item)]));
    this.gestures = new Map((source.gestureContracts ?? []).map((item) => [item.gestureRef, structuredClone(item)]));
    this.vessels = new Map((source.vessels ?? []).map((item) => [item.vesselRef, structuredClone(item)]));
    this.guidedEstablishmentPlans = new Map((source.guidedEstablishmentPlans ?? []).map((item) => [item.planRef, structuredClone(item)]));
    this.featureWalkthroughPlans = new Map((source.featureWalkthroughPlans ?? []).map((item) => [item.planRef, structuredClone(item)]));
  }

  authoritativeRootDesignContract() {
    if (!this.rootDesignContract) throw new Error('missing authoritative E2.7 root design contract');
    return structuredClone(this.rootDesignContract);
  }
  profile(ref) { const value = this.profiles.get(ref); if (!value) throw new Error(`missing experience profile ${ref}`); return structuredClone(value); }
  vessel(ref) { const value = this.vessels.get(ref); if (!value) throw new Error(`missing action vessel ${ref}`); return structuredClone(value); }
  guidedEstablishmentPlan(ref) {
    const value = this.guidedEstablishmentPlans.get(ref);
    if (!value) throw new Error(`missing guided establishment plan ${ref}`);
    return structuredClone(value);
  }
  featureWalkthroughPlan(ref) {
    const value = this.featureWalkthroughPlans.get(ref);
    if (!value) throw new Error(`missing feature walkthrough plan ${ref}`);
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

  buildFeatureWalkthroughProjection(planRef) {
    const plan = this.featureWalkthroughPlan(planRef);
    assertFeatureWalkthroughPlan(plan, { profileRefs: new Set(this.profiles.keys()) });
    const projection = {
      planRef: plan.planRef,
      journeyRef: plan.journeyRef,
      featureRef: plan.featureRef,
      sourceVersionRef: plan.sourceVersionRef,
      experienceProfileRef: plan.experienceProfileRef,
      effects: false,
      replayable: plan.replayable,
      stages: plan.stages.map((stage) => structuredClone(stage)),
      truthBoundaries: [...plan.truthBoundaries],
      supersedesPlanRefOrNull: plan.supersedesPlanRefOrNull
    };
    return { ...projection, semanticHash: semanticHash(projection) };
  }

  buildFeatureWalkthroughReviewSeed(planRef) {
    const plan = this.featureWalkthroughPlan(planRef);
    assertFeatureWalkthroughPlan(plan, { profileRefs: new Set(this.profiles.keys()) });
    const seed = {
      featureOrJourneyRef: plan.journeyRef,
      reviewStepRefs: plan.stages.map((stage) => stage.stageRef),
      captureAtStepRefs: plan.stages.filter((stage) => stage.captureRequired).map((stage) => stage.stageRef),
      sourceVersionRef: plan.sourceVersionRef,
      effects: false
    };
    return { ...seed, semanticHash: semanticHash(seed) };
  }
}

export function validateExperienceRegistry(source, { actionRefs = new Set(), componentRefs = new Set(), stringRefs = new Set() } = {}) {
  const errors = [];
  const seen = new Set();
  const add = (ref, kind) => { if (!ref) errors.push(`${kind} missing ref`); else if (seen.has(ref)) errors.push(`duplicate experience ref ${ref}`); else seen.add(ref); };
  errors.push(...validateAuthoritativeRootDesignContract(source.authoritativeRootDesignContract, { actionRefs }));
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
  for (const plan of source.featureWalkthroughPlans ?? []) {
    add(plan.planRef, 'feature walkthrough plan');
    add(plan.journeyRef, 'feature walkthrough journey');
    errors.push(...validateFeatureWalkthroughPlan(plan, { profileRefs, actionRefs, stringRefs }));
    for (const stage of plan.stages ?? []) add(stage.stageRef, 'feature walkthrough stage');
  }
  return { ok: errors.length === 0, errors };
}

// [VXG RealForever]
