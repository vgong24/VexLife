'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readCurrentLivedCompanionCompletedTurn } from './lived-companion.mjs';
import { semanticHash } from './utils.mjs';

export const COMPANION_VOICE_RESULT_SCHEMA = 'vexlife.companion-voice-playback-result/v1';
export const COMPANION_VOICE_RECEIPT_SCHEMA = 'vexlife.companion-voice-playback-receipt/v1';
export const VOICE_RUNTIME_BINDING_SCHEMA = 'vexlife.companion-voice-runtime-binding/v1';
export const VOICE_PACKAGE_ACCEPTANCE_REF = 'acceptance.vex-assembly.va-i05.sdk-voice-distributable.001';
export const VOICE_DISTRIBUTION_REF = 'distribution.vextreme-sdk.voice-runtime.espeak-ng.1.52.0';
export const VOICE_DEPENDENCY_REF = 'runtime.espeak-ng.formant.1.52.0';
export const VOICE_PROFILE_REF = 'voice-capability-profile.espeak-ng.en-us.1.52.0';
export const VOICE_PACKAGE_WORKSPACE_RELATIVE = 'runtime/voice/package-workspace';
export const VOICE_BINDING_RELATIVE = 'runtime/voice/binding.json';
export const VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_BINDINGS = Object.freeze([
  Object.freeze({ controlRef: 'control.fixture.duration', capabilityRef: 'capability.prosody.duration' }),
  Object.freeze({ controlRef: 'control.fixture.relative-f0', capabilityRef: 'capability.prosody.relative-f0' }),
  Object.freeze({ controlRef: 'control.fixture.pause', capabilityRef: 'capability.prosody.pause' })
]);
export const VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_REFS = Object.freeze(
  VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_BINDINGS.map((binding) => binding.controlRef)
);

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/@#:[\]-]*$/u;

export class CompanionVoicePlaybackError extends Error {
  constructor(code, message, disposition = 'FAILED', detail = null) {
    super(message);
    this.name = 'CompanionVoicePlaybackError';
    this.code = code;
    this.disposition = disposition;
    this.detail = detail;
  }
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function safeRef(value) {
  return nonempty(value) && SAFE_REF.test(value);
}

function readJsonRegular(file, label, { missingDisposition = 'FAILED' } = {}) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new CompanionVoicePlaybackError(
        'VOICE_RUNTIME_BINDING_UNAVAILABLE',
        label + ' is not materialized for this Vex Home',
        missingDisposition
      );
    }
    throw new CompanionVoicePlaybackError('VOICE_RUNTIME_BINDING_INVALID', label + ' is unavailable', 'FAILED');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new CompanionVoicePlaybackError('VOICE_RUNTIME_BINDING_INVALID', label + ' must be one regular non-link file', 'FAILED');
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new CompanionVoicePlaybackError('VOICE_RUNTIME_BINDING_INVALID', label + ' is not valid JSON', 'FAILED');
  }
}

function sameCanonicalPath(left, right) {
  const a = path.normalize(path.resolve(left));
  const b = path.normalize(path.resolve(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function requireCanonicalDirectory(root, relative, label) {
  if (relative !== VOICE_PACKAGE_WORKSPACE_RELATIVE) {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_WORKSPACE_INVALID', label + ' does not use the accepted workspace identity', 'HELD');
  }
  const requested = path.resolve(root, relative);
  const rootPrefix = path.resolve(root) + path.sep;
  if (!requested.startsWith(rootPrefix)) {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_WORKSPACE_INVALID', label + ' escapes Vex Home', 'FAILED');
  }
  let stat;
  try {
    stat = fs.lstatSync(requested);
  } catch {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_UNAVAILABLE', label + ' is not materialized', 'HELD');
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_WORKSPACE_INVALID', label + ' must be one canonical directory', 'FAILED');
  }
  const canonical = fs.realpathSync.native(requested);
  if (!sameCanonicalPath(canonical, requested)) {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_WORKSPACE_INVALID', label + ' is not canonical', 'FAILED');
  }
  return canonical;
}

function validateModelConfiguration(value, identity) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CompanionVoicePlaybackError('VOICE_OPERATIONAL_PROFILE_NOT_CURRENT', 'Current qualified operational profile is unavailable', 'HELD');
  }
  const legacyQualified =
    value.schemaVersion === 'vexlife.model-configuration/v1' &&
    value.state === 'BOUND_QUALIFIED' &&
    safeRef(value.profileRef) &&
    nonempty(value.requestModel) &&
    safeRef(value.qualificationReceiptRef);
  const activatedQualified =
    value.schemaVersion === 'vexlife.activated-model-configuration/v2' &&
    value.state === 'BOUND_ACTIVATED_CULTIVATED_MODEL' &&
    safeRef(value.modelProfileRef) &&
    nonempty(value.requestModel) &&
    safeRef(value.qualificationReceiptRef) &&
    value.homeRef === identity?.homeRef &&
    value.companionLineageRef === identity?.companionLineageRef &&
    value.automaticFallback === false &&
    value.automaticDownload === false &&
    value.automaticActivation === false;
  if (!legacyQualified && !activatedQualified) {
    throw new CompanionVoicePlaybackError('VOICE_OPERATIONAL_PROFILE_NOT_CURRENT', 'Current qualified operational profile is unavailable', 'HELD');
  }
  const normalized = structuredClone(value);
  if (activatedQualified) normalized.profileRef = value.modelProfileRef;
  return Object.freeze(normalized);
}

export function loadCurrentVoiceOperationalProfile(homeIdentity) {
  return validateModelConfiguration(
    readJsonRegular(
      path.join(homeIdentity.home, 'config', 'model.json'),
      'Current Vex model configuration',
      { missingDisposition: 'HELD' }
    ),
    homeIdentity
  );
}

export function validateCompanionVoiceRuntimeBinding(value, homeIdentity, operationalProfileRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CompanionVoicePlaybackError('VOICE_RUNTIME_BINDING_INVALID', 'Voice runtime binding must be one object', 'FAILED');
  }
  const { bindingSha256, ...core } = value;
  if (!SHA256.test(bindingSha256 ?? '') || semanticHash(core) !== bindingSha256) {
    throw new CompanionVoicePlaybackError('VOICE_RUNTIME_BINDING_INVALID', 'Voice runtime binding digest is invalid', 'FAILED');
  }
  if (
    value.schemaVersion !== VOICE_RUNTIME_BINDING_SCHEMA ||
    value.state !== 'BOUND_QUALIFIED' ||
    value.packageAcceptanceRef !== VOICE_PACKAGE_ACCEPTANCE_REF ||
    value.packageWorkspaceRelative !== VOICE_PACKAGE_WORKSPACE_RELATIVE ||
    !SHA256.test(value.packageInstallReceiptSha256 ?? '') ||
    value.distributionRef !== VOICE_DISTRIBUTION_REF ||
    value.dependencyRef !== VOICE_DEPENDENCY_REF ||
    value.voiceProfileRef !== VOICE_PROFILE_REF ||
    value.homeRef !== homeIdentity.homeRef ||
    value.deviceRef !== homeIdentity.deviceRef ||
    value.companionLineageRef !== homeIdentity.companionLineageRef ||
    value.operationalProfileRef !== operationalProfileRef ||
    !value.runtimeBindingReceipt || typeof value.runtimeBindingReceipt !== 'object' ||
    !value.runtimeQualificationReceipt || typeof value.runtimeQualificationReceipt !== 'object' ||
    !value.runtimeExecutable || typeof value.runtimeExecutable !== 'object'
  ) {
    throw new CompanionVoicePlaybackError('VOICE_RUNTIME_BINDING_NOT_CURRENT', 'Voice runtime binding does not match the current Home/profile/package contract', 'HELD');
  }
  if (
    value.runtimeBindingReceipt.dependencyRef !== VOICE_DEPENDENCY_REF ||
    value.runtimeQualificationReceipt.dependencyRef !== VOICE_DEPENDENCY_REF ||
    value.runtimeQualificationReceipt.runtimeBindingRef !== value.runtimeBindingReceipt.runtimeBindingRef ||
    value.runtimeExecutable.dependencyRef !== VOICE_DEPENDENCY_REF ||
    value.runtimeExecutable.runtimeBindingRef !== value.runtimeBindingReceipt.runtimeBindingRef
  ) {
    throw new CompanionVoicePlaybackError('VOICE_RUNTIME_BINDING_NOT_CURRENT', 'Voice runtime evidence does not bind one exact dependency/runtime', 'HELD');
  }
  return Object.freeze(structuredClone(value));
}

export function loadCompanionVoiceRuntimeBinding(homeIdentity, operationalProfileRef) {
  const value = readJsonRegular(
    path.join(homeIdentity.home, VOICE_BINDING_RELATIVE),
    'Companion Voice runtime binding',
    { missingDisposition: 'HELD' }
  );
  return validateCompanionVoiceRuntimeBinding(value, homeIdentity, operationalProfileRef);
}

export function loadAcceptedCompanionVoicePackage({ homeIdentity, binding }) {
  const workspace = requireCanonicalDirectory(
    homeIdentity.home,
    binding.packageWorkspaceRelative,
    'Accepted Voice package workspace'
  );
  const packageManifest = path.join(workspace, 'package.json');
  let stat;
  try {
    stat = fs.lstatSync(packageManifest);
  } catch {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_UNAVAILABLE', 'Accepted Voice package workspace has no package manifest', 'HELD');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_WORKSPACE_INVALID', 'Accepted Voice package manifest must be one regular file', 'FAILED');
  }
  const localRequire = createRequire(packageManifest);
  let direct;
  let processPort;
  let distribution;
  let voiceProfile;
  try {
    direct = localRequire('vextreme-sdk/voice-runtime');
    processPort = localRequire('vextreme-sdk/voice-runtime/process');
    distribution = localRequire('vextreme-sdk/voice-runtime/espeak-ng-1.52.0-distribution');
    voiceProfile = localRequire('vextreme-sdk/voice-runtime/espeak-ng-1.52.0-profile');
  } catch {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_UNAVAILABLE', 'Accepted Voice package exports are unavailable', 'HELD');
  }
  if (
    typeof direct?.createEspeakNgDirectPlaybackPort !== 'function' ||
    processPort?.DEPENDENCY_REF !== VOICE_DEPENDENCY_REF ||
    !safeRef(processPort?.ENGINE_PORT_REF) ||
    processPort?.VOICE_PROFILE_REF !== VOICE_PROFILE_REF ||
    distribution?.distributionRef !== VOICE_DISTRIBUTION_REF ||
    distribution?.dependencyRef !== VOICE_DEPENDENCY_REF ||
    distribution?.descriptor?.dependencyRef !== VOICE_DEPENDENCY_REF ||
    distribution?.hostEvidencePolicy?.runtimeBindingReceiptRequired !== true ||
    distribution?.hostEvidencePolicy?.runtimeQualificationReceiptRequired !== true ||
    distribution?.hostEvidencePolicy?.historicalBindingReceiptIncluded !== false ||
    distribution?.hostEvidencePolicy?.historicalQualificationReceiptIncluded !== false ||
    voiceProfile?.voiceCapabilityProfileRef !== VOICE_PROFILE_REF ||
    voiceProfile?.voiceSelectionClass !== 'PRESET_CLEARED_NON_CLONED' ||
    voiceProfile?.rightsDisposition !== 'EXPLICITLY_CLEARED' ||
    voiceProfile?.speakerIdentityClaimAllowed !== false ||
    voiceProfile?.trainingPermissionClaimAllowed !== false ||
    voiceProfile?.voiceFormationAllowed !== false
  ) {
    throw new CompanionVoicePlaybackError('VOICE_PACKAGE_IDENTITY_MISMATCH', 'Loaded Voice package does not match the accepted consumer boundary', 'HELD');
  }
  return Object.freeze({ direct, processPort, distribution, voiceProfile });
}

function validateCompletedBrowserTurn(value) {
  if (
    !value || typeof value !== 'object' || Array.isArray(value) ||
    value.schemaVersion !== 'vexlife.browser-companion-turn/v1' ||
    value.state !== 'TURN_COMPLETED' ||
    value.truthClass !== 'CURRENT_LOCAL_MODEL' ||
    !nonempty(value.content) ||
    !safeRef(value.turnRef) ||
    !safeRef(value.responseMessageRef) ||
    !SHA256.test(value.conversationHeadSha256 ?? '') ||
    !nonempty(value.modelNameOrBoundedTestProfileRef)
  ) {
    throw new CompanionVoicePlaybackError('VOICE_COMPLETED_TURN_INVALID', 'Voice requires one exact completed current Companion turn', 'FAILED');
  }
  return value;
}

function requireCurrentCompletedTurn({
  completedTurn,
  current,
  homeIdentity,
  threadRef,
  modelConfiguration
}) {
  if (
    current?.schemaVersion !== 'vexlife.lived-companion-current-completed-turn/v1' ||
    current?.state !== 'COMPLETED' ||
    current?.currentness !== 'CURRENT' ||
    current.homeRef !== homeIdentity.homeRef ||
    current.deviceRef !== homeIdentity.deviceRef ||
    current.companionLineageRef !== homeIdentity.companionLineageRef ||
    current.threadRef !== threadRef ||
    current.conversationHeadSha256 !== completedTurn.conversationHeadSha256 ||
    current.turnRef !== completedTurn.turnRef ||
    current.responseMessageRef !== completedTurn.responseMessageRef ||
    current.modelNameOrBoundedTestProfileRef !== completedTurn.modelNameOrBoundedTestProfileRef ||
    current.responseEventBinding?.contentHash !== semanticHash(completedTurn.content) ||
    modelConfiguration.requestModel !== completedTurn.modelNameOrBoundedTestProfileRef
  ) {
    throw new CompanionVoicePlaybackError('VOICE_COMPLETED_TURN_NOT_CURRENT', 'Completed Companion response is stale or does not match current Home/model lineage', 'FAILED');
  }
  return current;
}

function voiceRefs(completedTurn) {
  const suffix = crypto.createHash('sha256')
    .update(completedTurn.turnRef + '|' + completedTurn.responseMessageRef + '|' + completedTurn.conversationHeadSha256)
    .digest('hex')
    .slice(0, 24);
  return Object.freeze({
    semanticUnitRef: 'semantic-unit.vexlife.companion-voice.' + suffix,
    expressionIntentRef: 'expression-intent.vexlife.companion-voice.' + suffix,
    vocalGesturePlanRef: 'vocal-gesture-plan.vexlife.companion-voice.' + suffix,
    acousticTargetEnvelopeRef: 'acoustic-target-envelope.vexlife.companion-voice.' + suffix,
    segmentRef: 'segment.vexlife.companion-voice.' + suffix,
    speakerBaselineRef: 'speaker-baseline.vexlife.companion-voice.espeak-ng.en-us'
  });
}

export function formCompanionVoicePlaybackRequest({
  completedTurn,
  packageBundle,
  binding
}) {
  const refs = voiceRefs(completedTurn);
  const vocalGesturePlan = Object.freeze({
    schemaVersion: 'vextreme.embodied-relationship-plane.prosody.vocal-gesture-plan/v0',
    vocalGesturePlanRef: refs.vocalGesturePlanRef,
    expressionIntentRef: refs.expressionIntentRef,
    speakerBaselineRef: refs.speakerBaselineRef,
    gestureSequence: Object.freeze([Object.freeze({
      semanticUnitRef: refs.semanticUnitRef
    })])
  });
  const acousticTargetEnvelope = Object.freeze({
    schemaVersion: 'vextreme.embodied-relationship-plane.prosody.acoustic-target-envelope/v0',
    acousticTargetEnvelopeRef: refs.acousticTargetEnvelopeRef,
    vocalGesturePlanRef: refs.vocalGesturePlanRef,
    enginePortRef: packageBundle.processPort.ENGINE_PORT_REF,
    speakerBaselineRef: refs.speakerBaselineRef,
    appliedControlRefs: VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_REFS,
    approximatedControlRefs: Object.freeze([]),
    unavailableControlRefs: Object.freeze([]),
    segments: Object.freeze([Object.freeze({
      segmentRef: refs.segmentRef,
      semanticUnitRef: refs.semanticUnitRef,
      durationScale: 1,
      relativeF0Semitones: 0,
      pauseBeforeMs: 0,
      pauseAfterMs: 0
    })])
  });
  return Object.freeze({
    expressionIntentRef: refs.expressionIntentRef,
    vocalGesturePlanRef: refs.vocalGesturePlanRef,
    vocalGesturePlan,
    semanticUnitRef: refs.semanticUnitRef,
    acousticTargetEnvelope,
    semanticTextByRef: Object.freeze({
      [refs.semanticUnitRef]: completedTurn.content
    }),
    dependencyDescriptor: packageBundle.distribution.descriptor,
    runtimeBindingReceipt: binding.runtimeBindingReceipt,
    runtimeQualificationReceipt: binding.runtimeQualificationReceipt,
    runtimeExecutable: binding.runtimeExecutable,
    voiceCapabilityProfile: packageBundle.voiceProfile,
    controlBindings: VOICE_DIRECT_PLAYBACK_BASELINE_CONTROL_BINDINGS,
    unavailableControlPolicy: 'DEGRADE_EXPLICITLY'
  });
}

function terminalResult(state, reasonCode, {
  operationalProfileRef = null,
  receipt = null,
  engineAttempted = false
} = {}) {
  return Object.freeze({
    schemaVersion: COMPANION_VOICE_RESULT_SCHEMA,
    state,
    truthClass: state === 'COMPLETE'
      ? 'CURRENT_COMPANION_VOICE_PLAYBACK'
      : 'COMPANION_TURN_COMPLETED_VOICE_NOT_PROVEN',
    reasonCode,
    operationalProfileRef,
    receipt,
    engineAttempted,
    completedTurnPreserved: true,
    humanAudibilityState: 'NOT_EVALUATED'
  });
}

export function createCompanionVoicePlaybackAdapter({
  currentTurnReader = readCurrentLivedCompanionCompletedTurn,
  modelConfigurationLoader = loadCurrentVoiceOperationalProfile,
  bindingLoader = loadCompanionVoiceRuntimeBinding,
  packageLoader = loadAcceptedCompanionVoicePackage,
  nowIso = () => new Date().toISOString()
} = {}) {
  for (const [name, value] of Object.entries({
    currentTurnReader,
    modelConfigurationLoader,
    bindingLoader,
    packageLoader,
    nowIso
  })) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
  }

  return Object.freeze({
    async playCompletedTurn({ completedTurn, threadRef, homeIdentity } = {}) {
      let operationalProfileRef = null;
      let engineAttempted = false;
      try {
        const turn = validateCompletedBrowserTurn(completedTurn);
        if (
          !homeIdentity || typeof homeIdentity !== 'object' || Array.isArray(homeIdentity) ||
          !nonempty(homeIdentity.home) ||
          !safeRef(homeIdentity.homeRef) ||
          !safeRef(homeIdentity.deviceRef) ||
          !safeRef(homeIdentity.companionLineageRef) ||
          !safeRef(threadRef)
        ) {
          throw new CompanionVoicePlaybackError('VOICE_HOME_IDENTITY_INVALID', 'Voice requires exact current Vex Home/thread identity', 'FAILED');
        }

        const modelConfiguration = modelConfigurationLoader(homeIdentity);
        operationalProfileRef = modelConfiguration.profileRef;
        const current = currentTurnReader({
          home: homeIdentity.home,
          homeRef: homeIdentity.homeRef,
          deviceRef: homeIdentity.deviceRef,
          companionLineageRef: homeIdentity.companionLineageRef,
          threadRef,
          expectedConversationHeadSha256: turn.conversationHeadSha256
        });
        requireCurrentCompletedTurn({
          completedTurn: turn,
          current,
          homeIdentity,
          threadRef,
          modelConfiguration
        });

        const binding = bindingLoader(homeIdentity, operationalProfileRef);
        if (binding === null || binding === undefined) {
          return terminalResult('HELD', 'VOICE_RUNTIME_BINDING_UNAVAILABLE', { operationalProfileRef });
        }
        const currentBinding = validateCompanionVoiceRuntimeBinding(
          binding,
          homeIdentity,
          operationalProfileRef
        );
        const packageBundle = packageLoader({ homeIdentity, binding: currentBinding });
        const request = formCompanionVoicePlaybackRequest({
          completedTurn: turn,
          packageBundle,
          binding: currentBinding
        });
        const port = packageBundle.direct.createEspeakNgDirectPlaybackPort();
        if (!port || typeof port.play !== 'function') {
          throw new CompanionVoicePlaybackError('VOICE_PACKAGE_IDENTITY_MISMATCH', 'Accepted Voice direct playback port is unavailable', 'HELD');
        }
        engineAttempted = true;
        const engine = await port.play(request);
        const engineReceipt = engine?.semanticPlaybackReceipt;
        if (
          engine?.truthBoundary?.engineDirectAudioCompletionObserved !== true ||
          engineReceipt?.playbackDisposition !== 'COMPLETE' ||
          !safeRef(engineReceipt?.semanticPlaybackReceiptRef)
        ) {
          throw new CompanionVoicePlaybackError('VOICE_ENGINE_COMPLETION_UNPROVEN', 'Voice engine did not prove one complete semantic playback receipt', 'FAILED');
        }
        const formedAt = nowIso();
        if (!nonempty(formedAt) || Number.isNaN(Date.parse(formedAt))) {
          throw new CompanionVoicePlaybackError('VOICE_RECEIPT_TIME_INVALID', 'Voice playback receipt time is invalid', 'FAILED');
        }
        const receipt = Object.freeze({
          schemaVersion: COMPANION_VOICE_RECEIPT_SCHEMA,
          turnRef: turn.turnRef,
          responseMessageRef: turn.responseMessageRef,
          conversationHeadSha256: turn.conversationHeadSha256,
          companionLineageRef: homeIdentity.companionLineageRef,
          HomeRef: homeIdentity.homeRef,
          voiceProfileRef: packageBundle.voiceProfile.voiceCapabilityProfileRef,
          runtimeDependencyRef: packageBundle.distribution.dependencyRef,
          enginePlaybackReceiptRefOrHash: engineReceipt.semanticPlaybackReceiptRef,
          engineCompletionObserved: true,
          osAudioRoutingObserved: false,
          humanAudibilityState: 'NOT_EVALUATED',
          formedAt
        });
        return terminalResult('COMPLETE', 'ENGINE_DIRECT_AUDIO_COMPLETION_OBSERVED', {
          operationalProfileRef,
          receipt,
          engineAttempted: true
        });
      } catch (error) {
        const typed = error instanceof CompanionVoicePlaybackError
          ? error
          : new CompanionVoicePlaybackError(
              'VOICE_PLAYBACK_FAILED',
              'Companion Voice playback failed safely',
              'FAILED',
              error?.message ?? String(error)
            );
        return terminalResult(
          typed.disposition === 'HELD' ? 'HELD' : 'FAILED',
          typed.code,
          { operationalProfileRef, engineAttempted }
        );
      }
    }
  });
}

// [VXG RealForever]
