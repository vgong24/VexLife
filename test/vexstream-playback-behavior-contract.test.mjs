import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTABLE_BEHAVIOR_REQUIRED_INVARIANTS,
  PORTABLE_BEHAVIOR_ROW_FIELDS,
  buildIdentityIndex,
  loadBlueprint,
  validateBlueprint,
  validatePortableBehaviorContracts
} from '../src/core/blueprint.mjs';
import { Atlas } from '../src/core/atlas.mjs';

const bundle = loadBlueprint();
const contract = bundle.blueprint.behaviorContracts.find(
  (item) => item.contractRef === 'contract.vexlife.vexstream.playback.play-pause.001'
);

function row(ref) {
  return contract.semanticLawRows.find((item) => item.rowRef === ref);
}

test('P4 portable VexStream Play/Pause contract composes and validates', () => {
  const validation = validateBlueprint(bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.equal(validation.stats.portableBehaviorContracts, 1);
  assert.equal(validation.stats.portableBehaviorRows, 17);
  assert.equal(contract.ownerBlueprintRef, bundle.blueprint.blueprintRef);
  assert.equal(contract.authority.portableMeaningOwner, true);
  assert.equal(contract.authority.platformRealizationOwner, false);
  assert.equal(contract.authority.providerSuccessOwner, false);
  assert.equal(contract.authority.executionAuthorityOwner, false);
  assert.deepEqual(
    contract.invariantIdentities.map((item) => item.code).sort(),
    [...PORTABLE_BEHAVIOR_REQUIRED_INVARIANTS].sort()
  );
  for (const law of contract.semanticLawRows) {
    assert.deepEqual(Object.keys(law).sort(), [...PORTABLE_BEHAVIOR_ROW_FIELDS].sort());
  }
});

test('PlayPause resolves Control to distinct Act and Effect from semantic state', () => {
  assert.deepEqual(
    row('law.vexstream.playback.play-pause.paused-requests-play'),
    {
      rowRef: 'law.vexstream.playback.play-pause.paused-requests-play',
      sourceStateRef: 'state.vexstream.playback.media.paused-controllable',
      controlRefOrNull: 'control.vexstream.playback.play-pause',
      resolvedActRefOrNull: 'act.vexstream.playback.play',
      effectRefOrNull: 'effect.vexstream.playback.request-play',
      admission: 'ADMITTED_INTENT_PENDING_PROVIDER_ACKNOWLEDGEMENT',
      expectedProjectionRefOrNull: 'projection.vexstream.playback.pause-available',
      sourceRefs: [
        'source.vexlife-android.vexstream-playback.aff656f84a92048c4f9ee242b74e7155b4a059c8',
        'source.vextreme-sdk.vlbsot-construction.1a19f2119a923a8af678cbaaea14ea148e226837'
      ]
    }
  );
  assert.equal(
    row('law.vexstream.playback.play-pause.playing-requests-pause').resolvedActRefOrNull,
    'act.vexstream.playback.pause'
  );
  assert.equal(
    row('law.vexstream.playback.play-pause.ended-restarts-current').effectRefOrNull,
    'effect.vexstream.playback.restart-current'
  );
  assert.notEqual(contract.controlIdentities[0].controlRef, contract.actIdentities[0].actRef);
  assert.notEqual(contract.actIdentities[0].actRef, contract.effectIdentities[0].effectRef);
});

test('pending intent changes projection, survives stale observation and clears on matching acknowledgement', () => {
  assert.equal(
    row('law.vexstream.playback.pending-play.survives-stale-paused-observation').expectedProjectionRefOrNull,
    'projection.vexstream.playback.pause-available'
  );
  assert.equal(
    row('law.vexstream.playback.pending-pause.survives-stale-playing-observation').expectedProjectionRefOrNull,
    'projection.vexstream.playback.play-available'
  );
  assert.equal(
    row('law.vexstream.playback.pending-restart.survives-stale-ended-observation').expectedProjectionRefOrNull,
    'projection.vexstream.playback.play-pause-unavailable'
  );
  assert.equal(
    row('law.vexstream.playback.pending-restart.media-paused-observation-preserves-play-intent').admission,
    'PRESERVED_NEWER_ADMITTED_INTENT'
  );
  assert.equal(
    row('law.vexstream.playback.pending-restart.media-paused-observation-preserves-play-intent').expectedProjectionRefOrNull,
    'projection.vexstream.playback.pause-available'
  );
  assert.equal(
    row('law.vexstream.playback.pending-restart.clears-on-playing-media-acknowledgement').admission,
    'CLEARED_MATCHING_PROVIDER_ACKNOWLEDGEMENT'
  );
  assert.equal(
    row('law.vexstream.playback.pending-play.clears-on-playing-acknowledgement').admission,
    'CLEARED_MATCHING_PROVIDER_ACKNOWLEDGEMENT'
  );
  assert.equal(
    row('law.vexstream.playback.pending-pause.clears-on-paused-acknowledgement').admission,
    'CLEARED_MATCHING_PROVIDER_ACKNOWLEDGEMENT'
  );
  assert.equal(
    row('law.vexstream.playback.pending-play.newer-pause-replaces-pending-play').effectRefOrNull,
    'effect.vexstream.playback.request-pause'
  );
  assert.equal(
    row('law.vexstream.playback.pending-play.newer-pause-replaces-pending-play').expectedProjectionRefOrNull,
    'projection.vexstream.playback.play-available'
  );
  assert.equal(
    row('law.vexstream.playback.pending-pause.newer-play-replaces-pending-pause').effectRefOrNull,
    'effect.vexstream.playback.request-play'
  );
  assert.equal(
    row('law.vexstream.playback.pending-pause.newer-play-replaces-pending-pause').expectedProjectionRefOrNull,
    'projection.vexstream.playback.pause-available'
  );
  assert.equal(
    row('law.vexstream.playback.pending-intent.clears-on-no-media-observation').admission,
    'CLEARED_INCOMPATIBLE_TERMINAL_OBSERVATION'
  );
  assert.equal(
    row('law.vexstream.playback.pending-intent.clears-on-no-media-observation').expectedProjectionRefOrNull,
    'projection.vexstream.playback.play-pause-unavailable'
  );
});

test('effects and projections never claim provider success or execution authority', () => {
  assert.equal(contract.effectIdentities.every((item) => item.providerSuccessClaimed === false), true);
  assert.equal(contract.projectionIdentities.every((item) => item.executionAuthority === false), true);
  assert.equal(contract.stateIdentities.every((item) => item.semanticState && !item.displayState), true);
  const pausedRestartObservation = contract.stateIdentities.find(
    (item) => item.stateRef ===
      'state.vexstream.playback.ended.restart-request-pending.media-paused-observation.play-request-remains-pending'
  );
  assert.ok(pausedRestartObservation);
  assert.ok(pausedRestartObservation.conditions.includes('reconciledPendingIntent=REQUEST_PLAY'));
  const providerMediaObservations = contract.stateIdentities.filter(
    (item) => item.kind === 'MEDIA_OBSERVATION' &&
      item.conditions.some((condition) => condition.startsWith('providerPlayRequested='))
  );
  assert.equal(providerMediaObservations.length, 6);
  assert.equal(
    contract.stateIdentities
      .filter((item) =>
        item.stateRef === 'state.vexstream.playback.media.play-request-pending' ||
        item.stateRef === 'state.vexstream.playback.media.pause-request-pending'
      )
      .every((item) => item.conditions.includes('playPauseAvailable=true')),
    true
  );
  assert.equal(
    providerMediaObservations.every(
      (item) => item.conditions.includes('providerPlayPauseAvailable=true')
    ),
    true
  );
});

test('portable behavior identities enter the canonical Blueprint index and Atlas', () => {
  const index = buildIdentityIndex(bundle);
  const refs = new Set(index.map((item) => item.ref));
  for (const ref of [
    contract.contractRef,
    contract.behaviorRef,
    'control.vexstream.playback.play-pause',
    'act.vexstream.playback.play',
    'effect.vexstream.playback.request-play',
    'projection.vexstream.playback.pause-available',
    'law.vexstream.playback.play-pause.paused-requests-play',
    'source.vexlife-android.vexstream-playback.aff656f84a92048c4f9ee242b74e7155b4a059c8'
  ]) assert.equal(refs.has(ref), true, ref);

  const traversal = new Atlas(index).query({
    startRefs: [contract.behaviorRef],
    depthLimit: 3,
    resultLimit: 96,
    tokenBudget: 20000
  });
  assert.ok(traversal.results.some((item) => item.ref === 'law.vexstream.playback.play-pause.paused-requests-play'));
  assert.ok(traversal.results.some((item) => item.ref === 'effect.vexstream.playback.request-play'));
  assert.ok(traversal.results.some((item) =>
    item.ref === 'source.vexlife-android.vexstream-playback.aff656f84a92048c4f9ee242b74e7155b4a059c8'));
});

test('portable behavior validation fails closed on semantic collapse and authority drift', () => {
  const missingInvariant = structuredClone(bundle.blueprint.behaviorContracts);
  missingInvariant[0].invariantIdentities = missingInvariant[0].invariantIdentities.filter(
    (item) => item.code !== 'EFFECT_NOT_PROVIDER_SUCCESS'
  );
  assert.equal(validatePortableBehaviorContracts(missingInvariant).ok, false);

  const providerSuccess = structuredClone(bundle.blueprint.behaviorContracts);
  providerSuccess[0].effectIdentities[0].providerSuccessClaimed = true;
  assert.equal(validatePortableBehaviorContracts(providerSuccess).ok, false);

  const displayCollapse = structuredClone(bundle.blueprint.behaviorContracts);
  displayCollapse[0].stateIdentities[0].displayState = true;
  assert.equal(validatePortableBehaviorContracts(displayCollapse).ok, false);

  const executionAuthority = structuredClone(bundle.blueprint.behaviorContracts);
  executionAuthority[0].projectionIdentities[0].executionAuthority = true;
  assert.equal(validatePortableBehaviorContracts(executionAuthority).ok, false);

  const inventedEffect = structuredClone(bundle.blueprint.behaviorContracts);
  inventedEffect[0].semanticLawRows[0].effectRefOrNull = 'effect.vexstream.playback.invented';
  assert.equal(validatePortableBehaviorContracts(inventedEffect).ok, false);

  const malformedRow = structuredClone(bundle.blueprint.behaviorContracts);
  malformedRow[0].semanticLawRows[0].platformCommand = 'play';
  assert.equal(validatePortableBehaviorContracts(malformedRow).ok, false);
});

// [VXG RealForever]
