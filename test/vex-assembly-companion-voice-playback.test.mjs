import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPANION_VOICE_RECEIPT_SCHEMA,
  VOICE_DEPENDENCY_REF,
  VOICE_DISTRIBUTION_REF,
  VOICE_PACKAGE_ACCEPTANCE_REF,
  VOICE_PACKAGE_WORKSPACE_RELATIVE,
  VOICE_PROFILE_REF,
  VOICE_RUNTIME_BINDING_SCHEMA,
  VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_BINDINGS,
  VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_REFS,
  createCompanionVoicePlaybackAdapter,
  loadCurrentVoiceOperationalProfile
} from '../src/core/companion-voice-playback.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = 'One exact current Companion response.';
const completedTurn = Object.freeze({
  schemaVersion: 'vexlife.browser-companion-turn/v1',
  state: 'TURN_COMPLETED',
  truthClass: 'CURRENT_LOCAL_MODEL',
  content,
  modelNameOrBoundedTestProfileRef: 'model.current.fixture',
  turnRef: 'turn.voice.fixture.001',
  responseMessageRef: 'message.voice.fixture.response.001',
  conversationHeadSha256: 'a'.repeat(64)
});
const homeIdentity = Object.freeze({
  home: '/synthetic/vex-home',
  homeRef: 'home.voice.fixture',
  deviceRef: 'device.voice.fixture',
  companionLineageRef: 'lineage.voice.fixture'
});
const currentTurn = Object.freeze({
  schemaVersion: 'vexlife.lived-companion-current-completed-turn/v1',
  state: 'COMPLETED',
  currentness: 'CURRENT',
  homeRef: homeIdentity.homeRef,
  deviceRef: homeIdentity.deviceRef,
  companionLineageRef: homeIdentity.companionLineageRef,
  threadRef: 'thread.voice.fixture',
  conversationHeadSha256: completedTurn.conversationHeadSha256,
  turnRef: completedTurn.turnRef,
  requestMessageRef: 'message.voice.fixture.request.001',
  responseMessageRef: completedTurn.responseMessageRef,
  modelNameOrBoundedTestProfileRef: completedTurn.modelNameOrBoundedTestProfileRef,
  responseEventBinding: Object.freeze({ contentHash: semanticHash(content) })
});
const modelConfiguration = Object.freeze({
  schemaVersion: 'vexlife.model-configuration/v1',
  state: 'BOUND_QUALIFIED',
  profileRef: 'profile.vexlife.voice.fixture',
  requestModel: completedTurn.modelNameOrBoundedTestProfileRef,
  qualificationReceiptRef: 'receipt.model.fixture'
});

const activatedModelConfiguration = Object.freeze({
  schemaVersion: 'vexlife.activated-model-configuration/v2',
  state: 'BOUND_ACTIVATED_CULTIVATED_MODEL',
  bindingRef: 'binding.vexlife.voice.activated-m4.fixture',
  homeRef: homeIdentity.homeRef,
  companionLineageRef: homeIdentity.companionLineageRef,
  modelLineageRef: 'lineage.vex.m4.fixture',
  generationRef: 'generation.vex.m4.fixture',
  modelRef: 'model.vex.m4.fixture',
  modelProfileRef: 'model-profile.vex.m4.fixture',
  requestModel: completedTurn.modelNameOrBoundedTestProfileRef,
  qualificationReceiptRef: 'receipt.model.activated-m4.fixture',
  automaticFallback: false,
  automaticDownload: false,
  automaticActivation: false
});

test('VA-I09 Voice operational profile accepts the exact current activated-M4 v2 Home binding', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-voice-activated-m4-'));
  const home = path.join(root, 'home');
  try {
    fs.mkdirSync(path.join(home, 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(home, 'config', 'model.json'),
      JSON.stringify(activatedModelConfiguration, null, 2) + '\n',
      'utf8'
    );
    const current = loadCurrentVoiceOperationalProfile({ ...homeIdentity, home });
    assert.equal(current.schemaVersion, 'vexlife.activated-model-configuration/v2');
    assert.equal(current.state, 'BOUND_ACTIVATED_CULTIVATED_MODEL');
    assert.equal(current.profileRef, activatedModelConfiguration.modelProfileRef);
    assert.equal(current.requestModel, activatedModelConfiguration.requestModel);
    assert.equal(current.qualificationReceiptRef, activatedModelConfiguration.qualificationReceiptRef);

    fs.writeFileSync(
      path.join(home, 'config', 'model.json'),
      JSON.stringify({ ...activatedModelConfiguration, companionLineageRef: 'lineage.other' }, null, 2) + '\n',
      'utf8'
    );
    assert.throws(
      () => loadCurrentVoiceOperationalProfile({ ...homeIdentity, home }),
      (error) => error?.code === 'VOICE_OPERATIONAL_PROFILE_NOT_CURRENT'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function binding(overrides = {}) {
  const core = {
    schemaVersion: VOICE_RUNTIME_BINDING_SCHEMA,
    state: 'BOUND_QUALIFIED',
    packageAcceptanceRef: VOICE_PACKAGE_ACCEPTANCE_REF,
    packageWorkspaceRelative: VOICE_PACKAGE_WORKSPACE_RELATIVE,
    packageInstallReceiptSha256: 'b'.repeat(64),
    distributionRef: VOICE_DISTRIBUTION_REF,
    dependencyRef: VOICE_DEPENDENCY_REF,
    voiceProfileRef: VOICE_PROFILE_REF,
    homeRef: homeIdentity.homeRef,
    deviceRef: homeIdentity.deviceRef,
    companionLineageRef: homeIdentity.companionLineageRef,
    operationalProfileRef: modelConfiguration.profileRef,
    runtimeBindingReceipt: {
      runtimeBindingRef: 'runtime-binding.voice.fixture',
      dependencyRef: VOICE_DEPENDENCY_REF,
      localLocationRef: 'runtime-location.voice.fixture'
    },
    runtimeQualificationReceipt: {
      qualificationReceiptRef: 'runtime-qualification.voice.fixture',
      runtimeBindingRef: 'runtime-binding.voice.fixture',
      dependencyRef: VOICE_DEPENDENCY_REF
    },
    runtimeExecutable: {
      dependencyRef: VOICE_DEPENDENCY_REF,
      runtimeBindingRef: 'runtime-binding.voice.fixture',
      localLocationRef: 'runtime-location.voice.fixture',
      executablePath: 'espeak-ng-fixture'
    },
    formedAt: '2026-10-09T12:00:00.000Z',
    ...overrides
  };
  return Object.freeze({ ...core, bindingSha256: semanticHash(core) });
}

function packageBundle(playImpl) {
  return Object.freeze({
    direct: Object.freeze({
      createEspeakNgDirectPlaybackPort: () => Object.freeze({ play: playImpl })
    }),
    processPort: Object.freeze({
      ENGINE_PORT_REF: 'engine-port.espeak-ng.fixture',
      DEPENDENCY_REF: VOICE_DEPENDENCY_REF,
      VOICE_PROFILE_REF
    }),
    distribution: Object.freeze({
      distributionRef: VOICE_DISTRIBUTION_REF,
      dependencyRef: VOICE_DEPENDENCY_REF,
      descriptor: Object.freeze({ dependencyRef: VOICE_DEPENDENCY_REF }),
      hostEvidencePolicy: Object.freeze({
        runtimeBindingReceiptRequired: true,
        runtimeQualificationReceiptRequired: true,
        historicalBindingReceiptIncluded: false,
        historicalQualificationReceiptIncluded: false
      })
    }),
    voiceProfile: Object.freeze({
      voiceCapabilityProfileRef: VOICE_PROFILE_REF,
      voiceSelectionClass: 'PRESET_CLEARED_NON_CLONED',
      rightsDisposition: 'EXPLICITLY_CLEARED',
      speakerIdentityClaimAllowed: false,
      trainingPermissionClaimAllowed: false,
      voiceFormationAllowed: false
    })
  });
}

function adapter({ current = currentTurn, voiceBinding = binding(), playImpl = null } = {}) {
  const calls = [];
  const play = playImpl ?? (async (request) => {
    calls.push(request);
    return {
      truthBoundary: {
        engineDirectAudioCompletionObserved: true,
        deviceSampleAcceptanceObserved: false,
        speakerAudibilityObserved: 'UNKNOWN_NOT_EVALUATED',
        humanHearingObserved: 'UNKNOWN_NOT_EVALUATED'
      },
      semanticPlaybackReceipt: {
        semanticPlaybackReceiptRef: 'semantic-playback-receipt.voice.fixture',
        playbackDisposition: 'COMPLETE'
      }
    };
  });
  return {
    calls,
    value: createCompanionVoicePlaybackAdapter({
      currentTurnReader: () => current,
      modelConfigurationLoader: () => modelConfiguration,
      bindingLoader: () => voiceBinding,
      packageLoader: () => packageBundle(play),
      nowIso: () => '2026-10-09T12:01:00.000Z'
    })
  };
}

const input = () => ({
  completedTurn,
  threadRef: 'thread.voice.fixture',
  homeIdentity
});

test('VA-I06 holds before engine execution when host-local Voice binding is absent', async () => {
  const { value, calls } = adapter({ voiceBinding: null });
  const result = await value.playCompletedTurn(input());
  assert.equal(result.state, 'HELD');
  assert.equal(result.reasonCode, 'VOICE_RUNTIME_BINDING_UNAVAILABLE');
  assert.equal(result.receipt, null);
  assert.equal(result.completedTurnPreserved, true);
  assert.equal(result.engineAttempted, false);
  assert.equal(calls.length, 0);
});

test('VA-I06 binds one exact current Companion response to one semantic Voice unit', async () => {
  const { value, calls } = adapter();
  const result = await value.playCompletedTurn(input());
  assert.equal(result.state, 'COMPLETE');
  assert.equal(calls.length, 1);
  const request = calls[0];
  assert.equal(request.semanticTextByRef[request.semanticUnitRef], content);
  assert.equal(request.vocalGesturePlan.gestureSequence.length, 1);
  assert.equal(request.acousticTargetEnvelope.segments.length, 1);
  assert.deepEqual(
    request.acousticTargetEnvelope.appliedControlRefs,
    VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_REFS
  );
  assert.deepEqual(request.acousticTargetEnvelope.approximatedControlRefs, []);
  assert.deepEqual(request.acousticTargetEnvelope.unavailableControlRefs, []);
  assert.deepEqual(request.controlBindings, VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_BINDINGS);
  assert.equal(request.acousticTargetEnvelope.segments[0].durationScale, 1);
  assert.equal(request.acousticTargetEnvelope.segments[0].relativeF0Semitones, 0);
  assert.equal(request.acousticTargetEnvelope.segments[0].pauseBeforeMs, 0);
  assert.equal(request.acousticTargetEnvelope.segments[0].pauseAfterMs, 0);
  assert.equal(request.unavailableControlPolicy, 'DEGRADE_EXPLICITLY');
  assert.equal(request.dependencyDescriptor.dependencyRef, VOICE_DEPENDENCY_REF);
});

test('VA-I06 success receipt preserves completed-turn lineage and hearing truth split', async () => {
  const { value } = adapter();
  const result = await value.playCompletedTurn(input());
  const receipt = result.receipt;
  assert.equal(receipt.schemaVersion, COMPANION_VOICE_RECEIPT_SCHEMA);
  assert.equal(receipt.turnRef, completedTurn.turnRef);
  assert.equal(receipt.responseMessageRef, completedTurn.responseMessageRef);
  assert.equal(receipt.conversationHeadSha256, completedTurn.conversationHeadSha256);
  assert.equal(receipt.companionLineageRef, homeIdentity.companionLineageRef);
  assert.equal(receipt.HomeRef, homeIdentity.homeRef);
  assert.equal(receipt.voiceProfileRef, VOICE_PROFILE_REF);
  assert.equal(receipt.runtimeDependencyRef, VOICE_DEPENDENCY_REF);
  assert.equal(receipt.engineCompletionObserved, true);
  assert.equal(receipt.osAudioRoutingObserved, false);
  assert.equal(receipt.humanAudibilityState, 'NOT_EVALUATED');
  assert.equal(result.operationalProfileRef, modelConfiguration.profileRef);
});

for (const [label, mutate] of [
  ['head', (x) => ({ ...x, conversationHeadSha256: 'c'.repeat(64) })],
  ['response message', (x) => ({ ...x, responseMessageRef: 'message.other' })],
  ['model', (x) => ({ ...x, modelNameOrBoundedTestProfileRef: 'model.other' })],
  ['content', (x) => ({ ...x, responseEventBinding: { contentHash: 'd'.repeat(64) } })],
  ['lineage', (x) => ({ ...x, companionLineageRef: 'lineage.other' })]
]) {
  test('VA-I06 rejects stale or cross-bound current-turn ' + label + ' before engine execution', async () => {
    const { value, calls } = adapter({ current: mutate(currentTurn) });
    const result = await value.playCompletedTurn(input());
    assert.equal(result.state, 'FAILED');
    assert.equal(result.reasonCode, 'VOICE_COMPLETED_TURN_NOT_CURRENT');
    assert.equal(result.receipt, null);
    assert.equal(result.completedTurnPreserved, true);
    assert.equal(result.engineAttempted, false);
    assert.equal(calls.length, 0);
  });
}

test('VA-I06 rejects a host Voice binding for another operational profile before engine execution', async () => {
  const { value, calls } = adapter({ voiceBinding: binding({ operationalProfileRef: 'profile.other' }) });
  const result = await value.playCompletedTurn(input());
  assert.equal(result.state, 'HELD');
  assert.equal(result.reasonCode, 'VOICE_RUNTIME_BINDING_NOT_CURRENT');
  assert.equal(result.receipt, null);
  assert.equal(result.engineAttempted, false);
  assert.equal(calls.length, 0);
});

test('VA-I06 engine failure never becomes a product playback success receipt', async () => {
  const { value } = adapter({
    playImpl: async () => {
      throw new Error('synthetic engine failure');
    }
  });
  const result = await value.playCompletedTurn(input());
  assert.equal(result.state, 'FAILED');
  assert.equal(result.reasonCode, 'VOICE_PLAYBACK_FAILED');
  assert.equal(result.receipt, null);
  assert.equal(result.engineAttempted, true);
  assert.equal(result.completedTurnPreserved, true);
  assert.equal(result.humanAudibilityState, 'NOT_EVALUATED');
});

test('VA-I06 public source consumes package exports without embedding private SDK repository internals', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/companion-voice-playback.mjs'), 'utf8');
  assert.match(source, /vextreme-sdk\/voice-runtime/);
  assert.doesNotMatch(source, /github\.com\/vgong24\/Vextreme-SDK/i);
  assert.doesNotMatch(source, /lib\/embodied-relationship-plane/);
  assert.doesNotMatch(source, /b3de9ae0375948085eb5f927ac0e157bbfe62ea1/);
});

test('VA-I06 live browser composition adds Voice only after the completed Companion turn', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/serve-browser-core.mjs'), 'utf8');
  const turn = source.indexOf('const result = await companionBridge.performTurn(input);');
  const voice = source.indexOf('await companionVoicePlayback.playCompletedTurn({');
  const response = source.indexOf('sendJson(response, 200, { ...result, voicePlayback });');
  assert.ok(turn >= 0 && voice > turn && response > voice);
  assert.match(source, /createVexLifeBrowserServer\(\{ companionVoicePlayback: companionVoice \}\)/);
});

test('VA-I06 current-turn owner projects exact response identity without raw content', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/lived-companion.mjs'), 'utf8');
  assert.match(source, /responseMessageRef: head\.responseMessageRef/);
  assert.match(source, /modelNameOrBoundedTestProfileRef: response\.modelNameOrBoundedTestProfileRef/);
  assert.match(source, /rawConversationContentIncluded: false/);
});

// [VXG RealForever]
