import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCEPTED_PROJECTION_SURFACES,
  EXPERIENCE_GALLERY_HASH,
  EXPERIENCE_GALLERY_SCHEMA,
  buildExperienceGalleryProjection,
  galleryEntryMatchesQuery,
  humanizeGalleryRef
} from '../reference/browser/modules/experience-gallery-controller.js';

function sources() {
  return {
    featureRegistry: {
      schemaVersion: 'vexlife.feature-registry/v0',
      registryRef: 'registry.vexlife.features.001',
      features: [{
        featureRef: 'feature.vexlife.terrain',
        purpose: 'Spatial current-context projection.',
        status: 'IMPLEMENTED_REFERENCE',
        humanIntroduction: { disposition: 'DISCOVERABLE_ONLY', routeState: 'CURRENT', rationale: 'Visible directly.' },
        canonicalNodeRefs: ['screen.vexlife.terrain'],
        actionRefs: ['action.terrain.canvas.pan'],
        moduleRefs: ['module.vexlife.core.terrain'],
        testRefs: ['test.terrain.drag'],
        platformRefs: ['platform.browser'],
        projectionRefs: ['projection.terrain.current'],
        resourceClass: 'UI_GRAPH_BOUNDED_NEIGHBORHOOD',
        dataClass: 'CURRENT_PROJECT_PROJECTION',
        effectClass: 'USER_LAYOUT_ONLY',
        concurrencyClass: 'LAYOUT_STATE_SEPARATE_FROM_CANONICAL'
      }]
    },
    experienceRegistry: {
      schemaVersion: 'vexlife.experience-registry/v0',
      registryRef: 'registry.vexlife.experience.001'
    },
    experienceFoundation: {
      schemaVersion: 'vexlife.experience-foundation/v1',
      foundationRef: 'foundation.vexlife.experience.001',
      parentExperienceRegistryRef: 'registry.vexlife.experience.001',
      effects: false,
      experiencePatterns: [{
        patternRef: 'pattern.vexlife.action-decision',
        patternKind: 'ACTION_DECISION',
        purpose: 'Show one action with truthful availability.',
        formRefs: ['form.vexlife.human.button'],
        defaultExposureRef: 'exposure.vexlife.primary'
      }],
      interactionForms: [{
        formRef: 'form.vexlife.human.button',
        formKind: 'BUTTON',
        consumerClass: 'HUMAN',
        platformRefs: ['platform.browser'],
        purpose: 'Visible action control.'
      }],
      commandBindings: [{
        commandRef: 'command.vexlife.help',
        purpose: 'Render compact guidance.',
        capabilityRef: 'help.render',
        actionRefOrNull: null,
        processRefOrNull: null,
        aliases: [{ literal: '/help', formRef: 'form.vexlife.operator.slash-alias' }]
      }]
    },
    experienceGuidance: {
      schemaVersion: 'vexlife.experience-guidance/v1',
      guidanceRef: 'guidance.vexlife.experience.001',
      parentExperienceFoundationRef: 'foundation.vexlife.experience.001',
      featurePerceptibilityOwnerRef: 'registry.vexlife.features.001',
      effects: false,
      help: { sectionKinds: ['WHAT_CAN_I_DO_HERE'] },
      placement: { presentationKinds: ['ANCHORED_CALLOUT'] },
      interactionCue: { candidateFamilies: ['PAN'] },
      nonCollapseRules: ['INTERACTION_CUE != ACTION_AUTHORITY']
    }
  };
}

test('Gallery projects canonical owners without creating another registry or authority', () => {
  const projection = buildExperienceGalleryProjection(sources());
  assert.equal(projection.schemaVersion, EXPERIENCE_GALLERY_SCHEMA);
  assert.equal(projection.truthClass, 'SOURCE_BOUND_BROWSER_REFERENCE_VISIBILITY_PROJECTION');
  assert.equal(projection.effects, false);
  assert.equal(projection.authorityGranted, false);
  assert.equal(projection.canonicalRegistryCreated, false);
  assert.equal(projection.sourceRefs.featureRegistryRef, 'registry.vexlife.features.001');
  assert.equal(projection.sourceRefs.experienceFoundationRef, 'foundation.vexlife.experience.001');
  assert.equal(EXPERIENCE_GALLERY_HASH, '#experience-gallery');
});

test('Product features, Experience patterns and interaction forms remain distinct', () => {
  const projection = buildExperienceGalleryProjection(sources());
  assert.equal(projection.productFeatures.length, 1);
  assert.equal(projection.productFeatures[0].featureRef, 'feature.vexlife.terrain');
  assert.equal(projection.experiencePatterns.length, 1);
  assert.equal(projection.experiencePatterns[0].patternRef, 'pattern.vexlife.action-decision');
  assert.equal(projection.interactionForms.length, 1);
  assert.equal(projection.interactionForms[0].formRef, 'form.vexlife.human.button');
  assert.ok(projection.boundaries.includes('COMPONENT != FEATURE'));
  assert.ok(projection.boundaries.includes('EXPERIENCE_PATTERN != FEATURE'));
});

test('Command and Guidance vocabulary is descriptive only', () => {
  const projection = buildExperienceGalleryProjection(sources());
  assert.deepEqual(projection.commandBindings[0].aliases, [{ literal: '/help', formRef: 'form.vexlife.operator.slash-alias' }]);
  assert.deepEqual(projection.guidance.helpSectionKinds, ['WHAT_CAN_I_DO_HERE']);
  assert.deepEqual(projection.guidance.presentationKinds, ['ANCHORED_CALLOUT']);
  assert.deepEqual(projection.guidance.interactionCueFamilies, ['PAN']);
  assert.ok(projection.boundaries.includes('GUIDANCE_RELEVANCE != COMMAND_PERMISSION'));
  assert.ok(projection.boundaries.includes('INTERACTION_CUE != ACTION_AUTHORITY'));
});

test('Accepted Experience projection surfaces expose source and proof without becoming features', () => {
  const projection = buildExperienceGalleryProjection(sources());
  assert.equal(projection.acceptedProjectionSurfaces.length, ACCEPTED_PROJECTION_SURFACES.length);
  const refs = projection.acceptedProjectionSurfaces.map((entry) => entry.projectionRef);
  assert.ok(refs.includes('projection.gallery.devex-guidance'));
  assert.ok(refs.includes('projection.gallery.typed-command'));
  assert.ok(refs.includes('projection.gallery.self-capability-frame'));
  assert.ok(projection.acceptedProjectionSurfaces.every((entry) => entry.sourcePath && entry.proofPath));
  assert.equal(projection.productFeatures.some((feature) => refs.includes(feature.featureRef)), false);
});

test('Cross-owner currentness mismatch fails closed', () => {
  const input = sources();
  input.experienceGuidance.parentExperienceFoundationRef = 'foundation.other';
  assert.throws(
    () => buildExperienceGalleryProjection(input),
    /not bound to the supplied Experience Foundation/
  );
});

test('Effect-bearing Experience sources fail closed', () => {
  const input = sources();
  input.experienceFoundation.effects = true;
  assert.throws(() => buildExperienceGalleryProjection(input), /refuses effect-bearing Experience sources/);
});

test('Projection is deeply immutable', () => {
  const projection = buildExperienceGalleryProjection(sources());
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.productFeatures), true);
  assert.equal(Object.isFrozen(projection.productFeatures[0]), true);
  assert.equal(Object.isFrozen(projection.guidance), true);
  assert.throws(() => { projection.productFeatures[0].status = 'ACTIVE'; }, TypeError);
});

test('Search matching and human labels are deterministic', () => {
  const projection = buildExperienceGalleryProjection(sources());
  assert.equal(galleryEntryMatchesQuery(projection.productFeatures[0], 'terrain'), true);
  assert.equal(galleryEntryMatchesQuery(projection.productFeatures[0], 'unrelated'), false);
  assert.equal(humanizeGalleryRef('feature.vexlife.screen-aware-guide'), 'Screen Aware Guide');
});
