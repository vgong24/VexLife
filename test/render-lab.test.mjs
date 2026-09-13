import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RENDER_LAB_BOUNDARIES,
  RENDER_LAB_HASH,
  RENDER_LAB_SCHEMA,
  buildRenderLabProjection,
  renderLabSpecimenMatchesQuery
} from '../reference/browser/modules/render-lab-controller.js';

function sources() {
  return {
    blueprint: {
      schemaVersion: 'vexlife.universal-blueprint/v0',
      blueprintRef: 'blueprint.vexlife.universal.001',
      screens: [{
        screenRef: 'screen.vexlife.terrain',
        regions: [
          {
            regionRef: 'region.terrain.canvas',
            elements: [
              { elementRef: 'element.terrain.canvas', interactionRef: 'interaction.terrain.canvas', actionRef: null },
              { elementRef: 'element.terrain.manual-layout-toggle', interactionRef: 'interaction.terrain.manual-layout-toggle', actionRef: 'action.terrain.manual-layout.toggle' }
            ]
          },
          {
            regionRef: 'region.terrain.instrumentation',
            elements: [
              { elementRef: 'element.terrain.instrumentation-toggle', interactionRef: 'interaction.terrain.instrumentation-toggle', actionRef: 'action.terrain.instrumentation.toggle' }
            ]
          }
        ]
      }]
    },
    featureRegistry: {
      schemaVersion: 'vexlife.feature-registry/v0',
      registryRef: 'registry.vexlife.features.001',
      features: [{
        featureRef: 'feature.vexlife.terrain',
        canonicalNodeRefs: [
          'screen.vexlife.terrain',
          'state.terrain',
          'region.terrain.canvas',
          'region.terrain.instrumentation',
          'element.terrain.instrumentation-toggle',
          'element.terrain.manual-layout-toggle'
        ],
        stateRefs: ['state.terrain', 'state.selection'],
        actionRefs: [
          'action.terrain.canvas.pan',
          'action.terrain.instrumentation.toggle',
          'action.terrain.manual-layout.toggle'
        ]
      }]
    },
    experienceRegistry: {
      schemaVersion: 'vexlife.experience-registry/v0',
      registryRef: 'registry.vexlife.experience.001',
      gestureContracts: [{
        gestureRef: 'gesture.vexlife.terrain-pan',
        resultActionRef: 'action.terrain.canvas.pan'
      }]
    },
    experienceFoundation: {
      schemaVersion: 'vexlife.experience-foundation/v1',
      foundationRef: 'foundation.vexlife.experience.001',
      parentExperienceRegistryRef: 'registry.vexlife.experience.001',
      effects: false,
      interactionForms: [{ formRef: 'form.vexlife.human.button' }],
      availabilityStates: [
        { availabilityRef: 'availability.vexlife.available', availabilityState: 'AVAILABLE', operable: true, reasonRequired: false },
        { availabilityRef: 'availability.vexlife.held', availabilityState: 'HELD', operable: false, reasonRequired: true },
        { availabilityRef: 'availability.vexlife.unavailable', availabilityState: 'UNAVAILABLE', operable: false, reasonRequired: true },
        { availabilityRef: 'availability.vexlife.unknown', availabilityState: 'UNKNOWN', operable: false, reasonRequired: true }
      ]
    },
    experienceGuidance: {
      schemaVersion: 'vexlife.experience-guidance/v1',
      guidanceRef: 'guidance.vexlife.experience.001',
      parentExperienceFoundationRef: 'foundation.vexlife.experience.001',
      featurePerceptibilityOwnerRef: 'registry.vexlife.features.001',
      effects: false,
      targetBinding: {
        targetKinds: ['ELEMENT', 'COMPONENT', 'COMPONENT_SLOT', 'REGION', 'TERRAIN_NODE', 'VESSEL'],
        bindingPolicies: ['STATIC_CANONICAL_TARGET', 'EXACT_COMPONENT_INSTANCE']
      },
      interactionCue: {
        referenceFields: ['actionRefOrNull', 'interactionRefOrNull', 'gestureRefOrNull', 'componentRefOrNull', 'slotRefOrNull']
      }
    },
    designTokens: {
      schemaVersion: 'vexlife.design-tokens/v0',
      tokenSetRef: 'tokens.vexlife.core.001',
      color: { 'surface.canvas': '#081016', 'accent.primary': '#73A8FF' },
      typography: { basePx: 16, headingPx: 28 },
      space: { '1': 4, '4': 16 },
      radius: { small: 8, medium: 14 }
    }
  };
}

test('Render Lab is a mock-only source-bound projection, never a new registry or authority', () => {
  const projection = buildRenderLabProjection(sources());
  assert.equal(projection.schemaVersion, RENDER_LAB_SCHEMA);
  assert.equal(projection.truthClass, 'SOURCE_BOUND_MOCK_VISUAL_SPECIMEN_PROJECTION');
  assert.equal(projection.effects, false);
  assert.equal(projection.mockOnly, true);
  assert.equal(projection.authorityGranted, false);
  assert.equal(projection.canonicalRegistryCreated, false);
  assert.equal(projection.automationIdentityCreated, false);
  assert.equal(RENDER_LAB_HASH, '#render-lab');
});

test('specimens carry accepted semantic target/action/state refs rather than DOM or display identities', () => {
  const projection = buildRenderLabProjection(sources());
  const pan = projection.specimens.find((entry) => entry.specimenRef === 'specimen.render-lab.terrain-pan');
  const toggle = projection.specimens.find((entry) => entry.specimenRef === 'specimen.render-lab.instrumentation-toggle');
  assert.equal(pan.targetBinding.targetRef, 'element.terrain.canvas');
  assert.equal(pan.targetBinding.screenRefOrNull, 'screen.vexlife.terrain');
  assert.equal(pan.interactionCue.actionRefOrNull, 'action.terrain.canvas.pan');
  assert.equal(pan.interactionCue.interactionRefOrNull, 'interaction.terrain.canvas');
  assert.equal(pan.expectedStateRef, 'state.terrain');
  assert.equal(toggle.targetBinding.targetRef, 'element.terrain.instrumentation-toggle');
  assert.equal(toggle.interactionCue.actionRefOrNull, 'action.terrain.instrumentation.toggle');
  assert.equal(toggle.interactionCue.interactionRefOrNull, 'interaction.terrain.instrumentation-toggle');
  assert.equal(toggle.targetBinding.instanceRefOrNull, null);
  assert.notEqual(toggle.title, toggle.targetBinding.targetRef);
  assert.equal(Object.hasOwn(toggle.targetBinding, 'domId'), false);
});

test('direct manipulation keeps canonical gesture semantics distinct from buttons', () => {
  const projection = buildRenderLabProjection(sources());
  const pan = projection.specimens.find((entry) => entry.visualKind === 'DIRECT_MANIPULATION');
  const control = projection.specimens.find((entry) => entry.visualKind === 'ACTION_CONTROL');
  assert.equal(pan.interactionCue.gestureRefOrNull, 'gesture.vexlife.terrain-pan');
  assert.equal(pan.formRefOrNull, null);
  assert.equal(control.interactionCue.gestureRefOrNull, null);
  assert.equal(control.formRefOrNull, 'form.vexlife.human.button');
  assert.ok(projection.boundaries.includes('GESTURE != BUTTON'));
  assert.ok(projection.boundaries.includes('DIRECT_MANIPULATION != BUTTON'));
});

test('source mismatches fail closed against the accepted blueprint instead of feature-summary projections', () => {
  const input = sources();
  input.experienceRegistry.gestureContracts[0].resultActionRef = 'action.other';
  assert.throws(() => buildRenderLabProjection(input), /gesture\/action mismatch/);

  const featureSummaryIsNotTargetRegistry = sources();
  featureSummaryIsNotTargetRegistry.featureRegistry.features[0].canonicalNodeRefs = ['screen.vexlife.terrain', 'state.terrain'];
  assert.doesNotThrow(() => buildRenderLabProjection(featureSummaryIsNotTargetRegistry));

  const targetMismatch = sources();
  targetMismatch.blueprint.screens[0].regions[0].elements = targetMismatch.blueprint.screens[0].regions[0].elements
    .filter((entry) => entry.elementRef !== 'element.terrain.canvas');
  assert.throws(() => buildRenderLabProjection(targetMismatch), /element target is not canonical/);

  const hierarchyMismatch = sources();
  hierarchyMismatch.blueprint.screens[0].regions[0].elements = hierarchyMismatch.blueprint.screens[0].regions[0].elements
    .filter((entry) => entry.elementRef !== 'element.terrain.manual-layout-toggle');
  hierarchyMismatch.blueprint.screens[0].regions[1].elements.push({
    elementRef: 'element.terrain.manual-layout-toggle',
    interactionRef: 'interaction.terrain.manual-layout-toggle',
    actionRef: 'action.terrain.manual-layout.toggle'
  });
  assert.throws(() => buildRenderLabProjection(hierarchyMismatch), /element\/region binding mismatch/);
});

test('accepted token and availability vocabularies are projected without claiming product currentness', () => {
  const projection = buildRenderLabProjection(sources());
  assert.deepEqual(projection.tokenGroups.color.map((entry) => entry.tokenRef), ['color.surface.canvas', 'color.accent.primary']);
  assert.deepEqual(projection.availabilityStates.map((entry) => entry.availabilityState), ['AVAILABLE', 'HELD', 'UNAVAILABLE', 'UNKNOWN']);
  assert.equal(projection.sourceRefs.tokenSetRef, 'tokens.vexlife.core.001');
});

test('projection and nested semantic identities are deeply immutable', () => {
  const projection = buildRenderLabProjection(sources());
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.specimens), true);
  assert.equal(Object.isFrozen(projection.specimens[0].targetBinding), true);
  assert.throws(() => { projection.specimens[0].targetBinding.targetRef = 'other'; }, TypeError);
});

test('search uses source-bound specimen content, not a localized label as canonical identity', () => {
  const projection = buildRenderLabProjection(sources());
  const specimen = projection.specimens[0];
  assert.equal(renderLabSpecimenMatchesQuery(specimen, 'terrain-pan'), true);
  assert.equal(renderLabSpecimenMatchesQuery(specimen, 'action.terrain.canvas.pan'), true);
  assert.equal(renderLabSpecimenMatchesQuery(specimen, 'unrelated'), false);
});

test('handoff non-collapse requirements remain explicit', () => {
  for (const rule of [
    'GUIDANCE_TARGET != DOM_ID',
    'ELEMENT_REF != INSTANCE_REF',
    'ENTITY_REF != DISPLAY_LABEL',
    'DISPLAY_TEXT != AUTOMATION_IDENTITY',
    'GESTURE != BUTTON',
    'DIRECT_MANIPULATION != BUTTON'
  ]) assert.ok(RENDER_LAB_BOUNDARIES.includes(rule), rule);
});
