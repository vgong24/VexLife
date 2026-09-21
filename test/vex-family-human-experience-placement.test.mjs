import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { validateFeatureRegistry } from '../src/core/feature-registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const FAMILY_FEATURE_REF = 'feature.vexlife.vex-family';

function familyFeature() {
  const feature = bundle.featureRegistry.features.find((candidate) => candidate.featureRef === FAMILY_FEATURE_REF);
  assert.ok(feature, 'Family feature must be registered');
  return feature;
}

test('VF07A-00 Family is one current registered feature over accepted owners', () => {
  const result = validateFeatureRegistry(bundle.featureRegistry, bundle);
  assert.equal(result.ok, true, result.errors.join('\n'));

  const feature = familyFeature();
  assert.equal(feature.status, 'IMPLEMENTED_REFERENCE');
  assert.deepEqual(feature.platformRefs, ['platform.browser']);
  assert.ok(feature.canonicalNodeRefs.includes('screen.vexlife.chat'));
  assert.ok(feature.canonicalNodeRefs.includes('state.family-space'));
  assert.ok(feature.stateRefs.includes('state.intent-scheduler'));
  assert.ok(feature.moduleRefs.includes('module.vexlife.core.family-space-store'));
  assert.ok(feature.moduleRefs.includes('module.vexlife.core.browser-family-conversation-bridge'));
  assert.ok(feature.moduleRefs.includes('module.vexlife.core.browser-family-lifecycle-bridge'));
  assert.ok(feature.moduleRefs.includes('module.vexlife.core.family-companion-runtime'));
  assert.ok(feature.moduleRefs.includes('module.vexlife.browser.chat-controller'));
});

test('VF07A-01 Family human introduction currentizes accepted lifecycle + follow-through without inventing effect authority', () => {
  const feature = familyFeature();
  assert.deepEqual(feature.humanIntroduction, {
    disposition: 'DISCOVERABLE_ONLY',
    routeState: 'CURRENT',
    planRefOrNull: null,
    rationale: feature.humanIntroduction.rationale
  });
  assert.match(feature.humanIntroduction.rationale, /visible Host\/Join\/Leave controls/u);
  assert.match(feature.humanIntroduction.rationale, /generic follow-through/u);
  assert.match(feature.humanIntroduction.rationale, /membership lifecycle stays server-owned/u);
  assert.match(feature.humanIntroduction.rationale, /follow-through stays generic-owner-owned/u);

  assert.equal(feature.actionRefs.includes('action.message.send'), true);
  assert.equal(feature.permissionRefs.includes('permission.conversation.send'), true);

  const serialized = JSON.stringify(feature);
  for (const forbidden of [
    'action.family.host',
    'action.family.join',
    'action.family.leave',
    'permission.family.admin',
    'permission.family.join'
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('VF07A-02 accepted Family boundaries and current visible lifecycle localization remain explicit', () => {
  const feature = familyFeature();
  assert.equal(feature.effectClass, 'APPEND_ONLY_MESSAGE');
  assert.equal(feature.dataClass, 'PRIVATE_FAMILY_CONVERSATION');
  assert.equal(feature.concurrencyClass, 'ONE_MODEL_WORKER_PLUS_MODEL_INDEPENDENT_HUMAN_CHAT');
  assert.ok(feature.testRefs.includes('test.intent-scheduler.single-worker'));
  assert.ok(feature.testRefs.includes('test.bridge.no-direct-model-exposure'));
  assert.ok(feature.localizationRefs.includes('family-room.audience'));
  assert.ok(feature.localizationRefs.includes('family-room.work.held'));

  for (const ref of [
    'family-room.lifecycle.heading',
    'family-room.lifecycle.host',
    'family-room.lifecycle.join.label',
    'family-room.lifecycle.join.placeholder',
    'family-room.lifecycle.join',
    'family-room.lifecycle.leave',
    'family-room.lifecycle.ready',
    'family-room.lifecycle.working',
    'family-room.lifecycle.success',
    'family-room.lifecycle.failed',
    'family-room.lifecycle.held'
  ]) assert.ok(feature.localizationRefs.includes(ref), `missing current lifecycle localization ref ${ref}`);

  assert.equal(feature.knownGaps.some((value) => value.includes('no accepted browser action')), false);
  assert.equal(feature.knownGaps.some((value) => value.includes('until a generic accepted owner is source-placed')), false);
  assert.ok(feature.knownGaps.some((value) => value.includes('Outside-human Family invitation delivery and consent')));
  assert.ok(feature.knownGaps.some((value) => value.includes('Generic calendar ownership remains absent')));
  assert.ok(feature.knownGaps.some((value) => value.includes('ONB-DIST')));
  assert.ok(feature.knownGaps.some((value) => value.includes('real-human Family validation')));
});

test('VF07A-03 feature registration does not absorb onboarding, lifecycle or follow-through ownership', () => {
  const feature = familyFeature();
  const serialized = JSON.stringify(feature);

  assert.equal(feature.humanIntroduction.disposition, 'DISCOVERABLE_ONLY');
  assert.equal(feature.humanIntroduction.planRefOrNull, null);
  assert.equal(feature.moduleRefs.includes('module.vexlife.core.browser-family-lifecycle-bridge'), true);

  for (const forbidden of [
    'public-onboarding',
    'pages/vexlife-onboarding',
    'action.family.host',
    'action.family.join',
    'action.family.leave',
    'permission.family.admin',
    'permission.family.join'
  ]) assert.equal(serialized.includes(forbidden), false);

  for (const ownerTerm of ['reminder', 'calendar', 'notification', 'assignment']) {
    assert.equal(feature.actionRefs.some((value) => value.includes(ownerTerm)), false);
    assert.equal(feature.processRefs.some((value) => value.includes(ownerTerm)), false);
  }

  assert.equal(serialized.includes('humanRecruitmentAuthority'), false);
});

// [VXG RealForever]
