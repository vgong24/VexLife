import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONVERSATION_COMPANION_REENTRY_ACTION_REF,
  CONVERSATION_MESSAGE_SEND_ACTION_REF,
  projectConversationCompanionActionDecisions
} from '../src/core/conversation-companion-action-projection.mjs';

function availability(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-availability/v1',
    truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
    projectionRef: 'projection.vexlife.companion-availability.fixture',
    projectionSha256: 'a'.repeat(64),
    availabilityState: 'READY',
    recoveryClass: 'NONE_REQUIRED',
    reasonCode: 'EXACT_RUNTIME_READY',
    sourceRefs: ['source.binding.fixture', 'source.runtime.fixture'],
    effectAuthorityGranted: false,
    rendererAuthorityGranted: false,
    modelIdentityAuthorityGranted: false,
    processAuthorityGranted: false,
    conversationAuthorityGranted: false,
    ...overrides
  };
}

function project(overrides = {}) {
  return projectConversationCompanionActionDecisions({
    channelRef: 'channel.fixture.companion',
    companionAvailability: availability(overrides)
  });
}

test('READY exposes Send and suppresses unnecessary re-entry without granting effects', () => {
  const value = project();
  assert.equal(value.decisions.send.actionRef, CONVERSATION_MESSAGE_SEND_ACTION_REF);
  assert.equal(value.decisions.send.availabilityRef, 'availability.vexlife.available');
  assert.equal(value.decisions.send.operable, true);
  assert.equal(value.decisions.reenterCurrentBinding.actionRef, CONVERSATION_COMPANION_REENTRY_ACTION_REF);
  assert.equal(value.decisions.reenterCurrentBinding.availabilityRef, 'availability.vexlife.unavailable');
  assert.equal(value.decisions.reenterCurrentBinding.reasonCode, 'COMPANION_ALREADY_READY');
  assert.equal(value.sourceAvailabilityProjectionSha256, 'a'.repeat(64));
  assert.equal(value.effectAuthorityGranted, false);
  assert.equal(value.rendererAuthorityGranted, false);
  assert.deepEqual(value.effects, { messageSend: false, companionReentry: false });
});

test('RECOVERABLE holds Send and exposes only the exact same-binding recovery action', () => {
  const value = project({
    availabilityState: 'RECOVERABLE',
    recoveryClass: 'SAFE_REENTRY_AVAILABLE',
    reasonCode: 'EXACT_SAME_BINDING_REENTRY_AVAILABLE'
  });
  assert.equal(value.decisions.send.availabilityRef, 'availability.vexlife.held');
  assert.equal(value.decisions.send.operable, false);
  assert.deepEqual(value.decisions.send.recoveryActionRefs, [CONVERSATION_COMPANION_REENTRY_ACTION_REF]);
  assert.equal(value.decisions.reenterCurrentBinding.availabilityRef, 'availability.vexlife.available');
  assert.equal(value.decisions.reenterCurrentBinding.operable, true);
});

test('STARTING keeps both semantic actions held rather than inventing availability', () => {
  const value = project({
    availabilityState: 'STARTING',
    recoveryClass: 'RETRY_IN_PROGRESS',
    reasonCode: 'EXACT_RUNTIME_STARTING'
  });
  assert.equal(value.decisions.send.availabilityRef, 'availability.vexlife.held');
  assert.equal(value.decisions.reenterCurrentBinding.availabilityRef, 'availability.vexlife.held');
});

test('HELD currentness preserves the source reason and grants no action', () => {
  const value = project({
    availabilityState: 'HELD',
    recoveryClass: 'BINDING_REVALIDATION_REQUIRED',
    reasonCode: 'CURRENTNESS_NOT_CURRENT'
  });
  assert.equal(value.decisions.send.availabilityRef, 'availability.vexlife.held');
  assert.equal(value.decisions.send.reasonCode, 'CURRENTNESS_NOT_CURRENT');
  assert.equal(value.decisions.reenterCurrentBinding.availabilityRef, 'availability.vexlife.held');
  assert.equal(value.decisions.reenterCurrentBinding.reasonCode, 'CURRENTNESS_NOT_CURRENT');
});

test('ACTION_REQUIRED and UNAVAILABLE fail closed as non-operable decisions', () => {
  for (const fixture of [
    { availabilityState: 'ACTION_REQUIRED', recoveryClass: 'REPAIR_REQUIRED', reasonCode: 'RUNTIME_DEGRADED' },
    { availabilityState: 'UNAVAILABLE', recoveryClass: 'REPAIR_REQUIRED', reasonCode: 'SAFE_REENTRY_NOT_AVAILABLE' }
  ]) {
    const value = project(fixture);
    assert.equal(value.decisions.send.availabilityRef, 'availability.vexlife.unavailable');
    assert.equal(value.decisions.reenterCurrentBinding.availabilityRef, 'availability.vexlife.unavailable');
    assert.equal(value.decisions.send.operable, false);
    assert.equal(value.decisions.reenterCurrentBinding.operable, false);
  }
});

test('projection preserves source lineage without copying provider/runtime implementation detail', () => {
  const value = project({
    sourceRefs: ['source.runtime.z', 'source.binding.a']
  });
  assert.deepEqual(value.sourceRefs, [
    'projection.vexlife.companion-availability.fixture',
    'source.binding.a',
    'source.runtime.z'
  ]);
  for (const forbidden of ['pid', 'endpoint', 'homePath', 'providerPayload', 'modelOutput']) {
    assert.equal(JSON.stringify(value).includes(`"${forbidden}"`), false);
  }
});

test('projection identity is deterministic for identical current truth', () => {
  const a = project();
  const b = project();
  assert.equal(a.projectionRef, b.projectionRef);
  assert.equal(a.projectionSha256, b.projectionSha256);
});

test('malformed or authority-bearing availability is rejected before projection', () => {
  assert.throws(
    () => projectConversationCompanionActionDecisions({
      channelRef: 'channel.fixture.companion',
      companionAvailability: availability({ schemaVersion: 'foreign.schema' })
    }),
    /schema\/truth\/state/u
  );
  assert.throws(
    () => projectConversationCompanionActionDecisions({
      channelRef: 'channel.fixture.companion',
      companionAvailability: availability({ effectAuthorityGranted: true })
    }),
    /effectAuthorityGranted must remain false/u
  );
  assert.throws(
    () => projectConversationCompanionActionDecisions({
      channelRef: 'channel.fixture.companion',
      companionAvailability: availability({ sourceRefs: ['source.same', 'source.same'] })
    }),
    /unique non-empty refs/u
  );
});

test('projection input contract requires one current channel identity', () => {
  assert.throws(
    () => projectConversationCompanionActionDecisions({
      channelRef: '',
      companionAvailability: availability()
    }),
    /channelRef/u
  );
});

// [VXG RealForever]
