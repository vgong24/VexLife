import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  VEX_BIRTH_COMPANION_AVAILABILITY_PATH,
  annotationDispositionForRange,
  buildVexBirthLabProjection,
  buildVexBirthStatusZipEntries,
  buildVexBirthSupportArtifacts,
  encodeStoredZip,
  normalizeVexBirthCompanionAvailability,
  setVexBirthTrainingDisposition,
  supportSelectedExcerpt,
  toggleVexBirthSupportOnly
} from '../reference/browser/modules/vex-birth-lab-controller.js';

function availability(overrides = {}) {
  const availabilityState = overrides.availabilityState ?? 'READY';
  return {
    schemaVersion: 'vexlife.companion-availability/v1',
    truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
    registryRef: 'registry.vexlife.companion-availability-reentry.001',
    bindingRef: 'binding.browser-vex-birth.test',
    homeRef: 'home.browser-vex-birth.test',
    companionLineageRef: 'lineage.browser-vex-birth.test',
    modelRefOrNull: 'model.browser-vex-birth.m4',
    generationRefOrNull: 'generation.browser-vex-birth.m4',
    runtimeAdapterRef: 'adapter.runtime.browser-vex-birth.test',
    runtimeObservationRef: 'observation.browser-vex-birth.test',
    availabilityState,
    recoveryClass: overrides.recoveryClass ?? (availabilityState === 'READY' ? 'NONE_REQUIRED' : 'REPAIR_REQUIRED'),
    reasonCode: overrides.reasonCode ?? 'BROWSER_VEX_BIRTH_TEST',
    bindingState: overrides.bindingState ?? 'BOUND',
    runtimeOwnershipState: overrides.runtimeOwnershipState ?? 'EXACT_OWNED',
    runtimeState: overrides.runtimeState ?? 'HEALTHY',
    qualificationState: overrides.qualificationState ?? 'CURRENT',
    sourceRefs: ['source.browser-vex-birth.test'],
    effectAuthorityGranted: false,
    rendererAuthorityGranted: false,
    modelIdentityAuthorityGranted: false,
    processAuthorityGranted: false,
    conversationAuthorityGranted: false,
    projectionRef: 'projection.vexlife.companion-availability.browser-vex-birth-test',
    projectionSha256: 'b'.repeat(64),
    ...overrides
  };
}

test('Slice B projects canonical READY source-bound M4 baseline without claiming neural training', () => {
  const projection = buildVexBirthLabProjection({
    companionAvailability: availability(),
    baselineClosed: false,
    baselineExchangeCount: 1
  });

  assert.equal(VEX_BIRTH_COMPANION_AVAILABILITY_PATH, '/api/v1/companion/availability');
  assert.equal(projection.currentChapter, 'MEET_G0');
  assert.equal(projection.currentVBStage, 'VB2');
  assert.equal(projection.companionAvailabilityState, 'READY');
  assert.equal(projection.activeGenerationRef, 'generation.browser-vex-birth.m4');
  assert.equal(projection.activeModelRefOrNull, 'model.browser-vex-birth.m4');
  assert.equal(projection.modelBindingState, 'BOUND');
  assert.equal(projection.trainingEffectTruth, 'PRE_EXECUTION_NO_EFFECT');
  assert.equal(projection.sourceCurrentness, 'UNKNOWN');
  assert.equal(projection.completionClaimAllowed, false);
  assert.ok(projection.heldActions.some((entry) => entry.actionRef.includes('annotation.train')));
});

test('non-READY canonical Companion truth never becomes a synthetic Birth turn', () => {
  const current = normalizeVexBirthCompanionAvailability(availability({
    availabilityState: 'ACTION_REQUIRED',
    recoveryClass: 'REPAIR_REQUIRED',
    reasonCode: 'HOME_UNAVAILABLE',
    bindingState: 'HOME_UNAVAILABLE'
  }));
  const projection = buildVexBirthLabProjection({ companionAvailability: current });
  assert.equal(projection.currentChapter, 'PREPARE');
  assert.equal(projection.currentVBStage, 'VB1');
  assert.equal(projection.companionAvailabilityState, 'ACTION_REQUIRED');
  assert.equal(projection.modelBindingState, 'HOME_UNAVAILABLE');
  assert.ok(projection.blockers.some((message) => message.includes('no real Birth turn')));

  assert.throws(
    () => normalizeVexBirthCompanionAvailability({
      schemaVersion: 'vexlife.browser-companion-status/v1',
      state: 'BOUND'
    }),
    /canonical Companion availability|schema\/truth\/state/
  );
});

test('training dispositions are mutually exclusive while SUPPORT_ONLY remains independent', () => {
  const rangeRef = 'range.vex-birth.test.001';
  let annotations = setVexBirthTrainingDisposition([], rangeRef, 'TRAIN');
  annotations = toggleVexBirthSupportOnly(annotations, rangeRef);
  let state = annotationDispositionForRange(annotations, rangeRef);
  assert.equal(state.training, 'TRAIN');
  assert.equal(state.supportOnly, true);

  annotations = setVexBirthTrainingDisposition(annotations, rangeRef, 'HELD_OUT');
  state = annotationDispositionForRange(annotations, rangeRef);
  assert.equal(state.training, 'HELD_OUT');
  assert.equal(state.supportOnly, true);
  assert.equal(annotations.filter((entry) => entry.disposition === 'TRAIN').length, 0);

  annotations = setVexBirthTrainingDisposition(annotations, rangeRef, 'DO_NOT_TRAIN');
  state = annotationDispositionForRange(annotations, rangeRef);
  assert.equal(state.training, 'DO_NOT_TRAIN');
  assert.equal(state.supportOnly, true);
});

test('support export includes only explicitly SUPPORT_ONLY-marked exchange content', () => {
  const turns = [
    {
      rangeRef: 'range.vex-birth.test.001',
      humanContent: 'selected human text',
      companionContent: 'selected model text'
    },
    {
      rangeRef: 'range.vex-birth.test.002',
      humanContent: 'private other human text',
      companionContent: 'private other model text'
    }
  ];
  const annotations = toggleVexBirthSupportOnly([], turns[0].rangeRef);
  const excerpt = supportSelectedExcerpt(turns, annotations);
  assert.match(excerpt, /selected human text/);
  assert.match(excerpt, /selected model text/);
  assert.doesNotMatch(excerpt, /private other human text/);
  assert.doesNotMatch(excerpt, /private other model text/);
});

test('status package is non-executable and raw transcript is excluded by default', () => {
  const projection = buildVexBirthLabProjection({
    companionAvailability: availability(),
    baselineClosed: true,
    cultivationExchangeCount: 1
  });
  const turns = [{
    rangeRef: 'range.vex-birth.test.001',
    humanContent: 'bounded support excerpt',
    companionContent: 'bounded model excerpt'
  }];
  const annotations = toggleVexBirthSupportOnly([], turns[0].rangeRef);
  const artifacts = buildVexBirthSupportArtifacts({
    projection,
    turns,
    annotations,
    question: 'What is the next safe step?',
    includeSelectedExcerpt: false
  });

  assert.equal(artifacts.selectedExcerpt, '');
  assert.equal(artifacts.statusPackage.executable, false);
  assert.equal(artifacts.statusPackage.rawFullTranscriptIncluded, false);
  assert.equal(artifacts.statusPackage.executionAuthorityGranted, false);

  const entries = buildVexBirthStatusZipEntries({
    projection,
    ...artifacts
  });
  assert.ok(entries['START-HERE.html']);
  assert.ok(entries['BIRTH-STATUS.json']);
  assert.ok(entries['SUPPORT-CONTEXT.md']);
  assert.ok(entries['REDACTION-MANIFEST.json']);
  assert.equal(Object.hasOwn(entries, 'excerpts/selected-excerpts.md'), false);
  assert.doesNotMatch(entries['SUPPORT-CONTEXT.md'], /bounded support excerpt/);

  const zip = encodeStoredZip(entries);
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
});

test('explicit support excerpt may coexist with held-out training disposition without training consent collapse', () => {
  const projection = buildVexBirthLabProjection({
    companionAvailability: availability(),
    baselineClosed: true
  });
  const turns = [{
    rangeRef: 'range.vex-birth.test.heldout',
    humanContent: 'explicitly share this question',
    companionContent: 'explicitly share this response'
  }];
  let annotations = setVexBirthTrainingDisposition([], turns[0].rangeRef, 'HELD_OUT');
  annotations = toggleVexBirthSupportOnly(annotations, turns[0].rangeRef);

  const artifacts = buildVexBirthSupportArtifacts({
    projection,
    turns,
    annotations,
    question: 'Review this selected excerpt.',
    includeSelectedExcerpt: true
  });
  assert.match(artifacts.selectedExcerpt, /explicitly share this question/);
  assert.equal(annotationDispositionForRange(annotations, turns[0].rangeRef).training, 'HELD_OUT');
  assert.equal(annotationDispositionForRange(annotations, turns[0].rangeRef).supportOnly, true);

  const entries = buildVexBirthStatusZipEntries({
    projection,
    ...artifacts
  });
  assert.ok(entries['excerpts/selected-excerpts.md']);
  const redaction = JSON.parse(entries['REDACTION-MANIFEST.json']);
  assert.equal(redaction.rawFullTranscriptIncluded, false);
  assert.equal(redaction.executionAuthorityGranted, false);
  assert.equal(redaction.selectedExcerptIncluded, true);
});

test('Birth Lab open and close keep surface-menu accessibility and visible focus ownership aligned', () => {
  const source = readFileSync(
    new URL('../reference/browser/modules/vex-birth-lab-controller.js', import.meta.url),
    'utf8'
  );
  const openBlock = source.match(/function open\(\) \{[\s\S]*?\n  \}/u)?.[0] ?? '';
  const closeBlock = source.match(/function close\(\) \{[\s\S]*?\n  \}/u)?.[0] ?? '';

  assert.match(openBlock, /querySelector\('#surfaceMenu'\)[\s\S]*setAttribute\('hidden', ''\)/u);
  assert.match(openBlock, /querySelector\('#surfaceMenuButton'\)[\s\S]*setAttribute\('aria-expanded', 'false'\)/u);
  assert.match(closeBlock, /querySelector\('#surfaceMenuButton'\)\?\.focus\(\)/u);
  assert.doesNotMatch(closeBlock, /#openVexBirthLab/u);
});

// [VXG RealForever]
