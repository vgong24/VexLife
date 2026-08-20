import { semanticHash } from './utils.mjs';

const BASE_REQUIRED_LENSES = [
  'lens.vexlife.intent-and-placement',
  'lens.vexlife.identity-lattice',
  'lens.vexlife.state-and-currentness',
  'lens.vexlife.assurance-and-adversarial'
];

export const HUMAN_INTRODUCTION_DISPOSITIONS = Object.freeze([
  'WALKTHROUGH',
  'EXPLANATION_ONLY',
  'DISCOVERABLE_ONLY',
  'NONE_JUSTIFIED'
]);

export const HUMAN_INTRODUCTION_ROUTE_STATES = Object.freeze(['CURRENT', 'HELD']);

const HUMAN_INTRODUCTION_KEYS = new Set([
  'disposition',
  'routeState',
  'planRefOrNull',
  'rationale'
]);
const HUMAN_INTRODUCTION_PLAN_DISPOSITIONS = new Set(['WALKTHROUGH', 'EXPLANATION_ONLY']);
const HUMAN_INTRODUCTION_NO_PLAN_DISPOSITIONS = new Set(['DISCOVERABLE_ONLY', 'NONE_JUSTIFIED']);

function setOf(items, key) {
  return new Set((items ?? []).map((item) => item[key]).filter(Boolean));
}

function collectReferenceSets(bundle) {
  const blueprint = bundle.blueprint;
  return {
    stateRefs: setOf(blueprint.stateDomains, 'stateRef'),
    actionRefs: setOf(blueprint.actions, 'actionRef'),
    permissionRefs: setOf(blueprint.permissions, 'permissionRef'),
    processRefs: setOf(bundle.factory?.processes, 'processRef'),
    moduleRefs: setOf(bundle.modules?.modules, 'moduleRef'),
    testRefs: setOf(blueprint.tests, 'testRef'),
    platformRefs: setOf(blueprint.platforms, 'platformRef'),
    stringRefs: new Set(Object.keys(bundle.strings?.[blueprint.product.defaultLanguage] ?? {})),
    canonicalRefs: new Set([
      blueprint.blueprintRef,
      blueprint.product.productRef,
      ...blueprint.stateDomains.map((item) => item.stateRef),
      ...blueprint.actions.map((item) => item.actionRef),
      ...blueprint.permissions.map((item) => item.permissionRef),
      ...blueprint.roles.map((item) => item.roleRef),
      ...blueprint.screens.flatMap((screen) => [
        screen.screenRef,
        screen.conceptRef,
        screen.routeRef,
        screen.navigationNodeRef,
        ...screen.regions.flatMap((region) => [
          region.regionRef,
          region.conceptRef,
          region.navigationNodeRef,
          ...region.elements.flatMap((element) => [
            element.elementRef,
            element.conceptRef,
            element.interactionRef,
            element.navigationRef
          ].filter(Boolean))
        ])
      ]),
      ...blueprint.terrain.map((item) => item.terrainNodeRef),
      ...(bundle.factory?.foundations ?? []).map((item) => item.foundationRef),
      ...(bundle.factory?.processes ?? []).map((item) => item.processRef),
      ...(bundle.modules?.modules ?? []).map((item) => item.moduleRef),
      ...(bundle.capabilities?.capabilities ?? []).map((item) => item.capabilityRef),
      ...(bundle.bridge?.bridgeRef ? [bundle.bridge.bridgeRef] : []),
      ...(bundle.reviewLenses?.registryRef ? [bundle.reviewLenses.registryRef] : []),
      ...(bundle.featureRegistry?.registryRef ? [bundle.featureRegistry.registryRef] : []),
      ...(bundle.buildHealth?.registryRef ? [bundle.buildHealth.registryRef] : [])
    ])
  };
}

export function validateReviewLensRegistry(registry) {
  const errors = [];
  if (!registry?.registryRef) errors.push('review lens registry missing registryRef');
  const refs = new Set();
  for (const lens of registry?.lenses ?? []) {
    if (!lens.lensRef) errors.push('review lens missing lensRef');
    else if (refs.has(lens.lensRef)) errors.push(`duplicate review lens ${lens.lensRef}`);
    else refs.add(lens.lensRef);
    if (!lens.purpose) errors.push(`${lens.lensRef ?? 'unknown lens'} missing purpose`);
    if (!(lens.requiredQuestions?.length)) errors.push(`${lens.lensRef ?? 'unknown lens'} missing requiredQuestions`);
    if (!(lens.requiredEvidence?.length)) errors.push(`${lens.lensRef ?? 'unknown lens'} missing requiredEvidence`);
  }
  for (const required of BASE_REQUIRED_LENSES) if (!refs.has(required)) errors.push(`missing foundational review lens ${required}`);
  return { ok: errors.length === 0, errors, stats: { lenses: refs.size } };
}

export function deriveRequiredLensRefs(feature) {
  const refs = new Set(BASE_REQUIRED_LENSES);
  const ui = (feature.canonicalNodeRefs ?? []).some((ref) => ref.startsWith('screen.') || ref.startsWith('element.') || ref.startsWith('region.'));
  if (ui) {
    refs.add('lens.vexlife.design-system');
    refs.add('lens.vexlife.usability-and-journey');
    refs.add('lens.vexlife.accessibility');
  }
  if ((feature.localizationRefs ?? []).length || feature.dataClass?.includes('MESSAGE') || feature.dataClass?.includes('CONVERSATION')) refs.add('lens.vexlife.localization-intent');
  if (feature.effectClass && !['READ_PROJECTION', 'USER_LAYOUT_ONLY'].includes(feature.effectClass)) {
    refs.add('lens.vexlife.security-privacy-permission');
    refs.add('lens.vexlife.recovery-migration-continuity');
  }
  if (feature.concurrencyClass && feature.concurrencyClass !== 'NONE') refs.add('lens.vexlife.concurrency-and-relay');
  if ((feature.platformRefs ?? []).length > 1) refs.add('lens.vexlife.platform-environment');
  if (feature.resourceClass) refs.add('lens.vexlife.resource-and-context');
  if ((feature.projectionRefs ?? []).length) refs.add('lens.vexlife.visibility-terrain-health');
  if (feature.dataClass?.includes('PUBLIC') || feature.effectClass?.includes('PUBLIC')) refs.add('lens.vexlife.legal-provenance-stewardship');
  refs.add('lens.vexlife.reuse-and-simplification');
  return [...refs].sort();
}

export function validateHumanIntroduction(feature, {
  featureWalkthroughPlans = new Map(),
  requireCurrentPlan = true
} = {}) {
  const errors = [];
  const featureRef = feature?.featureRef ?? 'unknown feature';
  const introduction = feature?.humanIntroduction;
  if (!introduction || typeof introduction !== 'object' || Array.isArray(introduction)) {
    return [`${featureRef} missing humanIntroduction`];
  }

  const extraKeys = Object.keys(introduction).filter((key) => !HUMAN_INTRODUCTION_KEYS.has(key));
  if (extraKeys.length) errors.push(`${featureRef} humanIntroduction unsupported field ${extraKeys[0]}`);
  if (!HUMAN_INTRODUCTION_DISPOSITIONS.includes(introduction.disposition)) {
    errors.push(`${featureRef} humanIntroduction has unknown disposition ${introduction.disposition}`);
  }
  if (!HUMAN_INTRODUCTION_ROUTE_STATES.includes(introduction.routeState)) {
    errors.push(`${featureRef} humanIntroduction has unknown routeState ${introduction.routeState}`);
  }
  if (typeof introduction.rationale !== 'string' || introduction.rationale.trim().length === 0) {
    errors.push(`${featureRef} humanIntroduction requires explicit rationale`);
  }
  if (!Object.hasOwn(introduction, 'planRefOrNull')) {
    errors.push(`${featureRef} humanIntroduction missing planRefOrNull`);
  }

  if (HUMAN_INTRODUCTION_NO_PLAN_DISPOSITIONS.has(introduction.disposition)) {
    if (introduction.planRefOrNull !== null) {
      errors.push(`${featureRef} ${introduction.disposition} humanIntroduction must not name a plan`);
    }
  }

  if (HUMAN_INTRODUCTION_PLAN_DISPOSITIONS.has(introduction.disposition)) {
    if (typeof introduction.planRefOrNull !== 'string' || introduction.planRefOrNull.length === 0) {
      errors.push(`${featureRef} ${introduction.disposition} humanIntroduction requires planRefOrNull`);
    } else {
      const plan = featureWalkthroughPlans.get(introduction.planRefOrNull);
      if (introduction.routeState === 'CURRENT' && requireCurrentPlan && !plan) {
        errors.push(`${featureRef} CURRENT ${introduction.disposition} missing feature walkthrough plan ${introduction.planRefOrNull}`);
      }
      if (plan && plan.featureRef !== feature.featureRef) {
        errors.push(`${featureRef} humanIntroduction plan ${introduction.planRefOrNull} belongs to ${plan.featureRef}`);
      }
    }
  }

  const humanVisible = (feature?.canonicalNodeRefs ?? []).some((ref) =>
    ref.startsWith('screen.') || ref.startsWith('element.') || ref.startsWith('region.'));
  if (humanVisible && introduction.disposition === 'NONE_JUSTIFIED') {
    errors.push(`${featureRef} cannot use NONE_JUSTIFIED while human-visible canonical refs are registered`);
  }

  return errors;
}

export function validateFeatureRegistry(registry, bundle) {
  const errors = [];
  if (!registry?.registryRef) errors.push('feature registry missing registryRef');
  const schema = registry?.featureSchema ?? {};
  const requiredFields = schema.requiredFields ?? [];
  const statuses = new Set(schema.statusVocabulary ?? []);
  const lensRefs = setOf(bundle.reviewLenses?.lenses, 'lensRef');
  const sets = collectReferenceSets(bundle);
  const featureRefs = new Set();
  const featureWalkthroughPlans = new Map((bundle.experience?.featureWalkthroughPlans ?? []).map((plan) => [plan.planRef, plan]));

  const referenceGroups = [
    ['stateRefs', sets.stateRefs],
    ['actionRefs', sets.actionRefs],
    ['permissionRefs', sets.permissionRefs],
    ['processRefs', sets.processRefs],
    ['moduleRefs', sets.moduleRefs],
    ['testRefs', sets.testRefs],
    ['platformRefs', sets.platformRefs],
    ['localizationRefs', sets.stringRefs],
    ['canonicalNodeRefs', sets.canonicalRefs]
  ];

  for (const feature of registry?.features ?? []) {
    if (!feature.featureRef) errors.push('feature missing featureRef');
    else if (featureRefs.has(feature.featureRef)) errors.push(`duplicate featureRef ${feature.featureRef}`);
    else featureRefs.add(feature.featureRef);
    for (const field of requiredFields) {
      const value = feature[field];
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length && !['localizationRefs'].includes(field))) errors.push(`${feature.featureRef ?? 'unknown feature'} missing ${field}`);
    }
    if (!requiredFields.includes('humanIntroduction')) errors.push('feature schema must require humanIntroduction');
    errors.push(...validateHumanIntroduction(feature, { featureWalkthroughPlans }));
    if (statuses.size && !statuses.has(feature.status)) errors.push(`${feature.featureRef} has unknown status ${feature.status}`);
    for (const [field, allowed] of referenceGroups) {
      for (const ref of feature[field] ?? []) if (!allowed.has(ref)) errors.push(`${feature.featureRef} ${field} references missing ${ref}`);
    }
    for (const ref of feature.reviewLensRefs ?? []) if (!lensRefs.has(ref)) errors.push(`${feature.featureRef} references missing review lens ${ref}`);
    for (const required of deriveRequiredLensRefs(feature)) if (!(feature.reviewLensRefs ?? []).includes(required)) errors.push(`${feature.featureRef} missing derived review lens ${required}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: { features: featureRefs.size },
    semanticHash: semanticHash({ registryRef: registry?.registryRef, features: registry?.features ?? [] })
  };
}

export function scaffoldFeatureContract({
  featureRef,
  purpose,
  platformRefs = [],
  canonicalNodeRefs = [],
  humanIntroduction
} = {}) {
  if (!featureRef || !featureRef.startsWith('feature.')) throw new Error('featureRef must start with feature.');
  if (!purpose) throw new Error('purpose is required');
  if (humanIntroduction === undefined) throw new Error('humanIntroduction is required');
  const shapeErrors = validateHumanIntroduction(
    { featureRef, canonicalNodeRefs, humanIntroduction },
    { requireCurrentPlan: false }
  );
  if (shapeErrors.length) throw new Error(shapeErrors[0]);
  const candidate = {
    featureRef,
    purpose,
    status: 'PROPOSED',
    humanIntroduction: structuredClone(humanIntroduction),
    canonicalNodeRefs,
    stateRefs: [],
    actionRefs: [],
    permissionRefs: [],
    processRefs: [],
    moduleRefs: [],
    localizationRefs: [],
    testRefs: [],
    platformRefs,
    reviewLensRefs: [],
    resourceClass: 'UNCLASSIFIED',
    dataClass: 'UNCLASSIFIED',
    effectClass: 'UNCLASSIFIED',
    concurrencyClass: 'UNCLASSIFIED',
    rollbackRouteRef: 'REQUIRED',
    projectionRefs: [],
    knownGaps: []
  };
  candidate.reviewLensRefs = deriveRequiredLensRefs(candidate);
  return candidate;
}

// [VXG RealForever]
