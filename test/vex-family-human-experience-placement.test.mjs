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
  assert.ok(feature.moduleRefs.includes('module.vexlife.core.family-companion-runtime'));
  assert.ok(feature.moduleRefs.includes('module.vexlife.browser.chat-controller'));
});

test('VF07A-01 Family human introduction is current discoverability, not invented effect authority', () => {
  const feature = familyFeature();
  assert.deepEqual(feature.humanIntroduction, {
    disposition: 'DISCOVERABLE_ONLY',
    routeState: 'CURRENT',
    planRefOrNull: null,
    rationale: feature.humanIntroduction.rationale
  });
  assert.match(feature.humanIntroduction.rationale, /Host\/Join\/Leave/u);
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

test('VF07A-02 accepted Family boundaries remain explicit in feature ownership', () => {
  const feature = familyFeature();
  assert.equal(feature.effectClass, 'APPEND_ONLY_MESSAGE');
  assert.equal(feature.dataClass, 'PRIVATE_FAMILY_CONVERSATION');
  assert.equal(feature.concurrencyClass, 'ONE_MODEL_WORKER_PLUS_MODEL_INDEPENDENT_HUMAN_CHAT');
  assert.ok(feature.testRefs.includes('test.intent-scheduler.single-worker'));
  assert.ok(feature.testRefs.includes('test.bridge.no-direct-model-exposure'));
  assert.ok(feature.localizationRefs.includes('family-room.audience'));
  assert.ok(feature.localizationRefs.includes('family-room.work.held'));
  assert.ok(feature.knownGaps.some((value) => value.includes('Host, Join and Leave')));
  assert.ok(feature.knownGaps.some((value) => value.includes('ONB-DIST')));
});

test('VF07A-03 feature registration does not absorb onboarding or follow-through ownership', () => {
  const feature = familyFeature();
  const serialized = JSON.stringify(feature);
  for (const forbidden of [
    'public-onboarding',
    'pages/vexlife-onboarding',
    'reminder',
    'calendar',
    'notification',
    'assignment'
  ]) {
    if (forbidden === 'reminder' || forbidden === 'calendar' || forbidden === 'assignment') {
      assert.equal(feature.actionRefs.some((value) => value.includes(forbidden)), false);
      assert.equal(feature.processRefs.some((value) => value.includes(forbidden)), false);
      continue;
    }
    assert.equal(feature.moduleRefs.some((value) => value.includes(forbidden)), false);
  }
  assert.equal(serialized.includes('humanRecruitmentAuthority'), false);
});

// [VXG RealForever]
