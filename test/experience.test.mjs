import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  ExperienceRegistry,
  GUIDED_ESTABLISHMENT_EFFECT_CLASS,
  GUIDED_ESTABLISHMENT_FRONTDOOR_BINDINGS,
  GUIDED_ESTABLISHMENT_JOURNEY_REF,
  GUIDED_ESTABLISHMENT_PLAN_REF,
  GUIDED_ESTABLISHMENT_PROFILE_REF,
  GUIDED_ESTABLISHMENT_REQUIRED_TRUTH_BOUNDARIES,
  GUIDED_ESTABLISHMENT_STAGE_PURPOSES,
  validateExperienceRegistry
} from '../src/core/experience.mjs';

const bundle = loadBlueprint();

const experienceValidationOptions = () => ({
  actionRefs: new Set((bundle.blueprint.actions ?? []).map((item) => item.actionRef)),
  componentRefs: new Set((bundle.blueprint.components ?? []).map((item) => item.componentRef)),
  stringRefs: new Set(Object.values(bundle.strings).flatMap((catalog) => Object.keys(catalog)))
});

const validateExperienceOnly = (source) => validateExperienceRegistry(source, experienceValidationOptions());

test('experience, gesture and vessel registry is canonical and localized', () => {
  const result = validateBlueprint(bundle);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(bundle.experience.vessels.length >= 4, true);
  for (const vessel of bundle.experience.vessels) for (const language of bundle.blueprint.product.requiredLanguages) assert.ok(bundle.strings[language][vessel.labelStringRef]);
});

test('ordinary content scrolling and explicit Terrain zoom do not collide', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const scroll = registry.resolveInteraction({ surfaceKind: 'MESSAGE_FEED', inputType: 'MOUSE_WHEEL' });
  assert.equal(scroll.disposition, 'INTERACTION_RESOLVED');
  assert.equal(scroll.actionRef, 'action.content.scroll');
  const terrainWheel = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'MOUSE_WHEEL' });
  assert.equal(terrainWheel.disposition, 'NO_MATCH');
  const zoom = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'ZOOM_BUTTON' });
  assert.equal(zoom.actionRef, 'action.terrain.canvas.zoom');
});

test('screen magnification is never captured as product zoom', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const result = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'PINCH', accessibilityMode: 'SCREEN_MAGNIFICATION' });
  assert.equal(result.disposition, 'NO_MATCH');
});

test('persona projections reveal only available bounded regions and roles', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const projection = registry.buildProfileProjection('experience.vexlife.leadership-root', { availableRegionRefs: ['region.terrain.canvas'], availableRoleRefs: ['role.vex.root-hub'] });
  assert.deepEqual(projection.visibleRegionRefs, ['region.terrain.canvas']);
  assert.equal(projection.defaultRoleRef, 'role.vex.root-hub');
});

test('ONB-00 canonical plan has unique deterministic identity and exact contiguous stage order', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const plan = registry.guidedEstablishmentPlan(GUIDED_ESTABLISHMENT_PLAN_REF);

  assert.equal(plan.planRef, GUIDED_ESTABLISHMENT_PLAN_REF);
  assert.equal(plan.journeyRef, GUIDED_ESTABLISHMENT_JOURNEY_REF);
  assert.equal(plan.experienceProfileRef, GUIDED_ESTABLISHMENT_PROFILE_REF);
  assert.equal(plan.effects, false);
  assert.deepEqual(plan.stages.map((stage) => stage.sequence), GUIDED_ESTABLISHMENT_STAGE_PURPOSES.map((_, index) => index));
  assert.deepEqual(plan.stages.map((stage) => stage.purposeClass), [...GUIDED_ESTABLISHMENT_STAGE_PURPOSES]);
  assert.equal(new Set(plan.stages.map((stage) => stage.stageRef)).size, plan.stages.length);
  assert.equal(validateExperienceOnly(bundle.experience).ok, true);
});

test('ONB-00 Windows and macOS projections bind only to accepted Frontdoor source paths and stay effect-free', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  for (const [platformRef, adapterSourcePath] of Object.entries(GUIDED_ESTABLISHMENT_FRONTDOOR_BINDINGS)) {
    const first = registry.buildGuidedEstablishmentProjection(GUIDED_ESTABLISHMENT_PLAN_REF, { platformRef });
    const second = registry.buildGuidedEstablishmentProjection(GUIDED_ESTABLISHMENT_PLAN_REF, { platformRef });
    assert.equal(first.adapterSourcePath, adapterSourcePath);
    assert.equal(first.effects, false);
    assert.deepEqual(first, second);
    assert.equal(first.stages.every((stage) => stage.effectClass === GUIDED_ESTABLISHMENT_EFFECT_CLASS), true);
    assert.equal(first.stages.some((stage) => stage.actionRef || stage.permissionRef || stage.autoExecute), false);
  }
});

test('ONB-00 pure Review Kit seed maps journey, ordered stages and sparse capture refs without renderer/backend fields', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const seed = registry.buildGuidedEstablishmentReviewSeed(GUIDED_ESTABLISHMENT_PLAN_REF);
  const plan = registry.guidedEstablishmentPlan(GUIDED_ESTABLISHMENT_PLAN_REF);

  assert.equal(seed.featureOrJourneyRef, plan.journeyRef);
  assert.deepEqual(seed.reviewStepRefs, plan.stages.map((stage) => stage.stageRef));
  assert.deepEqual(seed.reviewSteps, plan.stages.map((stage) => ({ reviewStepRef: stage.stageRef, sequence: stage.sequence })));
  assert.deepEqual(seed.captureAtStepRefs, plan.stages.filter((stage) => stage.captureRequired).map((stage) => stage.stageRef));
  assert.equal(seed.effects, false);

  const forbiddenKeys = new Set([
    'playwright',
    'playwrightSelector',
    'cssSelector',
    'xpath',
    'browserCommand',
    'shellCommand',
    'executable',
    'scriptPath',
    'captureFunction',
    'selector',
    'pageUrl',
    'url',
    'backendCommand'
  ]);
  const scanKeys = (value) => {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, child]) => [key, ...scanKeys(child)]);
  };
  assert.deepEqual(scanKeys(seed).filter((key) => forbiddenKeys.has(key)), []);
});

test('ONB-00 canonical truth boundaries preserve availability, authorization and evidence distinctions', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const plan = registry.guidedEstablishmentPlan(GUIDED_ESTABLISHMENT_PLAN_REF);
  assert.deepEqual(plan.truthBoundaries, [...GUIDED_ESTABLISHMENT_REQUIRED_TRUTH_BOUNDARIES]);
  for (const required of [
    'PREPARED != AVAILABLE',
    'UNAVAILABLE != BROKEN',
    'PAIRED != AUTHORIZED',
    'AUTHENTICATED != CAPABILITY_LEASE',
    'DIAGNOSIS_AVAILABLE != REPAIR_AUTHORITY',
    'GUIDE_PLAN != LIVED_JOURNEY_EVENT',
    'GUIDE_PLAN != EXPERIENCE_CAPTURE_EVIDENCE'
  ]) assert.ok(plan.truthBoundaries.includes(required));
});

test('ONB-00 rejects duplicate, reordered or unknown canonical stages', () => {
  const duplicate = structuredClone(bundle.experience);
  duplicate.guidedEstablishmentPlans[0].stages[1].stageRef = duplicate.guidedEstablishmentPlans[0].stages[0].stageRef;
  let result = validateExperienceOnly(duplicate);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate stageRef')));

  const reordered = structuredClone(bundle.experience);
  [reordered.guidedEstablishmentPlans[0].stages[0], reordered.guidedEstablishmentPlans[0].stages[1]] =
    [reordered.guidedEstablishmentPlans[0].stages[1], reordered.guidedEstablishmentPlans[0].stages[0]];
  result = validateExperienceOnly(reordered);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('stage sequence must be contiguous and zero-based') || error.includes('canonical stage identity/order changed')));

  const unknown = structuredClone(bundle.experience);
  unknown.guidedEstablishmentPlans[0].stages[0].stageRef = 'stage.vexlife.guided-establishment.unknown';
  result = validateExperienceOnly(unknown);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('canonical stage identity/order changed')));
});

test('ONB-00 rejects unknown platform bindings and current Frontdoor source-path drift', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  assert.throws(
    () => registry.buildGuidedEstablishmentProjection(GUIDED_ESTABLISHMENT_PLAN_REF, { platformRef: 'platform.android' }),
    /unsupported guided establishment platform/
  );

  const unknownPlatform = structuredClone(bundle.experience);
  unknownPlatform.guidedEstablishmentPlans[0].platformBindings[0].platformRef = 'platform.android';
  let result = validateExperienceOnly(unknownPlatform);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('unknown platform binding')));

  const driftedFrontdoor = structuredClone(bundle.experience);
  driftedFrontdoor.guidedEstablishmentPlans[0].platformBindings[0].adapterSourcePath = 'install/replacement.ps1';
  result = validateExperienceOnly(driftedFrontdoor);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('current Frontdoor source binding drifted')));
});

test('ONB-00 recovery and uninstall semantics are declarative and do not claim successful repair or deletion', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const plan = registry.guidedEstablishmentPlan(GUIDED_ESTABLISHMENT_PLAN_REF);
  const recovery = plan.stages.find((stage) => stage.purposeClass === 'LEARN_RECOVERY');
  const uninstall = plan.stages.find((stage) => stage.purposeClass === 'UNDERSTAND_UNINSTALL_AND_PRESERVATION');
  assert.equal(recovery.effectClass, GUIDED_ESTABLISHMENT_EFFECT_CLASS);
  assert.equal(recovery.recoveryClass, 'DOCUMENTED_RECOVERY_ROUTE_ONLY');
  assert.equal(uninstall.effectClass, GUIDED_ESTABLISHMENT_EFFECT_CLASS);
  assert.equal(uninstall.recoveryClass, 'PRESERVATION_CHOICE_REQUIRED');
  assert.equal(plan.stages.some((stage) => /REPAIRED|DELETED|UNINSTALLED_SUCCESSFULLY/u.test(stage.expectedOutcomeClass)), false);
});

test('ONB-00 stage identities support later capture without screenshot filenames or renderer selectors', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const plan = registry.guidedEstablishmentPlan(GUIDED_ESTABLISHMENT_PLAN_REF);
  const seed = registry.buildGuidedEstablishmentReviewSeed(GUIDED_ESTABLISHMENT_PLAN_REF);
  assert.equal(seed.captureAtStepRefs.length > 0, true);
  assert.equal(seed.captureAtStepRefs.every((ref) => plan.stages.some((stage) => stage.stageRef === ref)), true);
  const serialized = JSON.stringify({ plan, seed });
  assert.equal(/\.(png|jpg|jpeg|webp)\b/iu.test(serialized), false);
  assert.equal(/playwrightSelector|cssSelector|xpath|backendCommand|pageUrl/u.test(serialized), false);
});

test('GuidedEstablishmentPlan grammar can be reused without changing canonical local-establishment stage identities', () => {
  const source = structuredClone(bundle.experience);
  const canonicalStageRefs = source.guidedEstablishmentPlans[0].stages.map((stage) => stage.stageRef);
  source.guidedEstablishmentPlans.push({
    planRef: 'plan.vexlife.guide.future-offline.001',
    journeyRef: 'journey.vexlife.future-offline.001',
    experienceProfileRef: GUIDED_ESTABLISHMENT_PROFILE_REF,
    effects: false,
    platformBindings: [
      { platformRef: 'platform.windows', adapterSourcePath: 'docs/future-offline-windows.md' }
    ],
    stages: [
      {
        stageRef: 'stage.vexlife.future-offline.prepare',
        sequence: 0,
        purposeClass: 'PREPARE',
        actorClass: 'HUMAN',
        effectClass: GUIDED_ESTABLISHMENT_EFFECT_CLASS,
        expectedOutcomeClass: 'PREPARATION_UNDERSTOOD',
        captureRequired: false,
        recoveryClass: 'STOP_WITHOUT_EFFECT'
      },
      {
        stageRef: 'stage.vexlife.future-offline.verify',
        sequence: 1,
        purposeClass: 'VERIFY',
        actorClass: 'HUMAN',
        effectClass: GUIDED_ESTABLISHMENT_EFFECT_CLASS,
        expectedOutcomeClass: 'VERIFICATION_ROUTE_UNDERSTOOD',
        captureRequired: true,
        recoveryClass: 'DOCUMENTED_RECOVERY_ROUTE_ONLY'
      }
    ],
    truthBoundaries: ['GUIDE_PLAN != RUNTIME_EFFECT']
  });

  const result = validateExperienceOnly(source);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(source.guidedEstablishmentPlans[0].stages.map((stage) => stage.stageRef), canonicalStageRefs);
});

test('E2.7 Stage A keeps semantic depth separate from pixel zoom and scrolling', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const semanticDepth = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'SEMANTIC_DEPTH_CONTROL' });
  assert.equal(semanticDepth.disposition, 'INTERACTION_RESOLVED');
  assert.equal(semanticDepth.actionRef, 'action.terrain.semantic-depth.set');
  const zoom = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'ZOOM_BUTTON' });
  assert.equal(zoom.actionRef, 'action.terrain.canvas.zoom');
  const wheel = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'MOUSE_WHEEL' });
  assert.equal(wheel.disposition, 'NO_MATCH');
  assert.notEqual(semanticDepth.actionRef, zoom.actionRef);
});

test('E2.7 Stage A makes the Vex vessel summonable and four-corner resizable without collapsing internal roles', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const vex = registry.vessel('vessel.vexlife.guide');
  assert.equal(vex.labelStringRef, 'vessel.guide.name');
  assert.ok(vex.actionRefs.includes('action.vex.summon'));
  assert.ok(vex.actionRefs.includes('action.vessel.resize'));
  const resize = registry.resolveInteraction({ surfaceKind: 'FLOATING_VESSEL', inputType: 'CORNER_HANDLE_DRAG' });
  assert.equal(resize.actionRef, 'action.vessel.resize');
  for (const language of bundle.blueprint.product.requiredLanguages) {
    assert.equal(bundle.strings[language]['vex.visible.name'], 'Vex');
    assert.equal(bundle.strings[language]['vessel.guide.name'], 'Vex');
    assert.ok(bundle.strings[language]['role.companion.name']);
    assert.ok(bundle.strings[language]['role.guide.name']);
    assert.ok(bundle.strings[language]['role.root-hub.name']);
  }
  assert.ok(bundle.blueprint.roles.some((role) => role.roleRef === 'role.vex.companion'));
  assert.ok(bundle.blueprint.roles.some((role) => role.roleRef === 'role.vex.guide'));
  assert.ok(bundle.blueprint.roles.some((role) => role.roleRef === 'role.vex.root-hub'));
});

test('E2.7 Stage A leaves the accepted ONB plan identities and Frontdoor bindings unchanged', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const plan = registry.guidedEstablishmentPlan(GUIDED_ESTABLISHMENT_PLAN_REF);
  assert.deepEqual(
    plan.platformBindings,
    Object.entries(GUIDED_ESTABLISHMENT_FRONTDOOR_BINDINGS).map(([platformRef, adapterSourcePath]) => ({ platformRef, adapterSourcePath }))
  );
  assert.equal(plan.stages.find((stage) => stage.purposeClass === 'MEET_VEX')?.expectedOutcomeClass, 'FIRST_INTERACTION_READY');
});

test('E2.7 authoritative root contract makes Terrain the default body and keeps current routes subordinate', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const contract = registry.authoritativeRootDesignContract();
  const shell = bundle.blueprint.screens.find((screen) => screen.screenRef === 'screen.vexlife.shell');
  const terrain = bundle.blueprint.screens.find((screen) => screen.screenRef === 'screen.vexlife.terrain');

  assert.equal(contract.contractRef, 'contract.vexlife.e27.authoritative-root/v1');
  assert.equal(contract.referenceBaselineRef, 'design-baseline.vexlife.e2.7.scoped-layers-vexorg-sandbox.34f17a12-38b6-438c-b899-6d07c36f1eb0');
  assert.equal(contract.artifactSha256, '9f944af803c43a494af944e987d1c4c6a6c7f71c89c648cbdf6536c07dbeda17');
  assert.equal(contract.defaultShellGrammar.primaryStageScreenRef, 'screen.vexlife.terrain');
  assert.equal(contract.defaultShellGrammar.primaryStageRouteRef, 'route.terrain');
  assert.equal(contract.defaultShellGrammar.singleStageDefault, true);
  assert.deepEqual(contract.defaultShellGrammar.permanentPrimaryTabRefs, []);
  assert.equal(contract.defaultShellGrammar.legacyCurrentBrowserPreservationDefault, false);
  assert.deepEqual(contract.defaultShellGrammar.secondaryRouteRefs, ['route.chat', 'route.health']);
  assert.equal(contract.semanticAutoEntry.actionRef, 'action.terrain.semantic-auto-entry.toggle');
  assert.equal(contract.semanticAutoEntry.visibleThresholdRequired, true);
  assert.equal(contract.semanticAutoEntry.visibleConfidenceRequired, true);
  assert.equal(contract.semanticAutoEntry.optOutRequired, true);
  assert.equal(contract.semanticAutoEntry.ordinaryScrollMayCommit, false);
  assert.equal(shell.presentationContractRef, contract.contractRef);
  assert.equal(shell.presentationClass, 'E27_ROOTED_SINGLE_TERRAIN_STAGE');
  assert.equal(shell.defaultPrimaryScreenRef, terrain.screenRef);
  assert.equal(shell.defaultPrimaryRouteRef, terrain.routeRef);
  assert.equal(shell.persistentPrimaryTabs, false);
  assert.equal(terrain.primaryStage, true);
  assert.ok(bundle.blueprint.actions.some((action) => action.actionRef === 'action.terrain.semantic-auto-entry.toggle'));
});

test('E2.7 authoritative root validation fails closed on implicit legacy preservation, incomplete supersession, or synthetic product truth', () => {
  const legacy = structuredClone(bundle.experience);
  legacy.authoritativeRootDesignContract.defaultShellGrammar.legacyCurrentBrowserPreservationDefault = true;
  let result = validateExperienceOnly(legacy);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('implicit preservation default')));

  const incompleteSupersession = structuredClone(bundle.experience);
  incompleteSupersession.authoritativeRootDesignContract.supersessionRecords.push({
    supersedesRef: 'signal.e27.single-terrain-stage',
    signalOrRegionRef: 'region.terrain.canvas',
    delta: 'candidate delta',
    reason: 'candidate reason',
    canonicalOwnerRef: 'owner.test',
    evidenceRefs: ['evidence.test'],
    protectedPreserveRefs: ['signal.e27.one-visible-vex'],
    regressionProofRefs: ['proof.test'],
    humanReviewRef: 'review.test'
  });
  result = validateExperienceOnly(incompleteSupersession);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('missing assuranceRef')));

  const synthetic = structuredClone(bundle.experience);
  synthetic.authoritativeRootDesignContract.productExclusions.syntheticOrganizationOrPeopleTruthAllowed = true;
  result = validateExperienceOnly(synthetic);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('synthetic VexOrg review data')));
});

test('E2.8 Q3 Guide vessel owns bounded presence and preferred-vs-resolved placement policy', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const vex = registry.vessel('vessel.vexlife.guide');
  assert.equal(vex.presenceStateGrammar.stateOwnerRef, 'state.guide');
  assert.deepEqual(vex.presenceStateGrammar.states.map((item) => item.state), ['AMBIENT','ATTENTIVE','SUMMONED','ACTIVE_CONVERSATION']);
  assert.equal(vex.presenceStateGrammar.hiddenModelPriority, false);
  assert.equal(vex.presenceStateGrammar.unknownNeedFallback, 'AMBIENT');
  assert.deepEqual(vex.placementPolicy.precedence, ['LATEST_EXPLICIT_HUMAN_SURFACE_INTENT','EXPLICIT_HUMAN_PLACEMENT_PREFERENCE','CONTEXT_DOCK_SUGGESTION','CANONICAL_DEFAULT']);
  assert.equal(vex.placementPolicy.preferredGeometryPersistence, 'EXPLICIT_HUMAN_DRAG_RESIZE_DOCK_ONLY');
  assert.equal(vex.placementPolicy.resolvedGeometryPersistence, 'TRANSIENT_NEVER_PROMOTED_BY_AUTOMATIC_RESOLUTION');
  assert.equal(vex.placementPolicy.automaticObstructionSignal, 'RENDERED_PROTECTED_RECT_PROJECTION');
  assert.equal(vex.placementPolicy.compactFallbackRewritesWidePreference, false);
  for (const language of bundle.blueprint.product.requiredLanguages) for (const item of vex.presenceStateGrammar.states) assert.ok(bundle.strings[language][item.stringRef]);
});

// [VXG RealForever]
