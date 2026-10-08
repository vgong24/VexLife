import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ANDROID_R5_NEW_GENERATED_PATHS,
  ANDROID_R5_OUTPUT_PATHS,
  HOME_BRIDGE_REF,
  LOOPBACK_TRANSPORT_REF,
  PROOF_LABEL,
  REQUEST_ENVELOPE_FIELDS,
  RESPONSE_ENVELOPE_FIELDS,
  SYNTHETIC_REFS,
  evaluateSyntheticHomeLoopback,
  renderAndroidR5Outputs,
  syntheticFixture,
  validateHomeBridgeRegistry,
} from '../src/core/android-r5-home-loopback.mjs';

function registry() {
  return {
    schemaVersion: 'vexlife.home-bridge-registry/v0',
    bridgeRef: HOME_BRIDGE_REF,
    transportAdapters: [
      { transportRef: 'transport.vexlife.tailscale', state: 'RECOMMENDED_PERSONAL_ADAPTER' },
      { transportRef: LOOPBACK_TRANSPORT_REF, state: 'REFERENCE_LOCAL' },
    ],
    requestEnvelopeFields: [...REQUEST_ENVELOPE_FIELDS],
    responseEnvelopeFields: [...RESPONSE_ENVELOPE_FIELDS],
  };
}
function baseFiles() {
  return {
    'platform/android/README.md': '# R4\n',
    'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt': 'package vexlife.android.app\nimport vexlife.android.presentation.AndroidRemoteVesselSurface\nfun witness() {\n            AndroidRemoteVesselSurface()\n}\n',
    'platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt': 'package vexlife.android.identity\nobject GeneratedCanonicalRefs {\n}\n',
    'platform/android/app/src/main/res/values/vexlife_r2.xml': '<resources>\n</resources>\n',
    'platform/android/app/src/main/res/values-ja/vexlife_r2.xml': '<resources>\n</resources>\n',
    'platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml': '<resources>\n</resources>\n',
  };
}

function denied(overrides = {}, options = {}) {
  return evaluateSyntheticHomeLoopback({ homeBridgeRegistry: registry(), fixtureOverrides: overrides, ...options }).admission;
}

test('R5-00/01 binds accepted Home Bridge loopback state and exact envelopes', () => {
  const bound = validateHomeBridgeRegistry(registry());
  assert.equal(bound.bridgeRef, HOME_BRIDGE_REF);
  assert.equal(bound.transportRef, LOOPBACK_TRANSPORT_REF);
  assert.equal(bound.transportState, 'REFERENCE_LOCAL');
  assert.deepEqual(bound.requestEnvelopeFields, REQUEST_ENVELOPE_FIELDS);
  assert.deepEqual(bound.responseEnvelopeFields, RESPONSE_ENVELOPE_FIELDS);
});

test('R5-02 fixture identities are explicit synthetic refs', () => {
  const fixture = syntheticFixture();
  for (const value of [
    fixture.request.requestRef, fixture.request.deviceRef, fixture.request.leaseRef, fixture.request.channelRef,
    fixture.request.speakerRef, fixture.membership.principalRef, fixture.membership.deviceRef,
    fixture.membership.homeNodeRef, fixture.lease.leaseRef, fixture.lease.principalRef,
    fixture.lease.deviceRef, fixture.lease.homeNodeRef,
  ]) assert.match(value, /^synthetic\./);
});

test('R5-03 admitted synthetic request consumes the existing evaluator and canonical writer boundary', () => {
  const result = evaluateSyntheticHomeLoopback({ homeBridgeRegistry: registry() });
  assert.equal(result.admission.state, 'REMOTE_REQUEST_ADMITTED');
  assert.equal(result.admission.canonicalWriter, 'DESKTOP_HOME_NODE');
  assert.equal(result.admission.remoteWriterGranted, false);
  assert.equal(result.response.requestRef, SYNTHETIC_REFS.requestRef);
  assert.deepEqual(Object.keys(result.response).sort(), [...RESPONSE_ENVELOPE_FIELDS].sort());
});

test('R5-04 wrong principal/device/lease/revocation/action/capability fail closed through evaluator', () => {
  assert.equal(denied({ request: { speakerRef: 'synthetic.principal.wrong' } }).reason, 'PRINCIPAL_BINDING_MISMATCH');
  assert.equal(denied({ request: { deviceRef: 'synthetic.device.wrong' } }).state, 'DEVICE_REVOKED');
  assert.equal(denied({ lease: { state: 'EXPIRED' } }).state, 'LEASE_EXPIRED');
  assert.equal(denied({ currentRevocationGeneration: 8 }).state, 'DEVICE_REVOKED');
  assert.equal(denied({ registeredActionRefs: [] }).reason, 'UNREGISTERED_ACTION');
  assert.match(denied({ resourceCapabilityRefs: [] }).reason, /^MISSING_/);
});

test('R5-05 raw model endpoint exposure fails closed', () => {
  const admission = denied({}, { rawModelEndpointExposed: true });
  assert.equal(admission.state, 'CAPABILITY_DENIED');
  assert.equal(admission.reason, 'RAW_MODEL_ENDPOINT_EXPOSED');
});

test('R5-06/07 admitted response reconciles through synchronous VexCompoundState into one bounded latest projection', () => {
  const result = evaluateSyntheticHomeLoopback({ homeBridgeRegistry: registry() });
  assert.equal(result.stateReceipt.accepted, true);
  assert.equal(result.stateReceipt.reconciled, true);
  assert.equal(result.projection.proofLabel, PROOF_LABEL);
  assert.equal(result.projection.syntheticFixture, true);
  assert.equal(result.projection.realHomeConnected, false);
  assert.equal(result.projection.realNetworkConnected, false);
  assert.equal(result.projection.homeWriterGranted, false);
});

test('R5-08/09 Android output preserves identity while visibly labelling synthetic loopback truth', () => {
  const rendered = renderAndroidR5Outputs({ homeBridgeRegistry: registry(), baseFiles: baseFiles() });
  assert.deepEqual(Object.keys(rendered.files).sort(), [...ANDROID_R5_OUTPUT_PATHS].sort());
  assert.deepEqual(rendered.newPaths, ANDROID_R5_NEW_GENERATED_PATHS);
  const contract = rendered.files['platform/android/app/src/main/kotlin/vexlife/android/home/AndroidHomeLoopbackContract.kt'];
  const surface = rendered.files['platform/android/app/src/main/kotlin/vexlife/android/presentation/AndroidHomeLoopbackSurface.kt'];
  assert.match(contract, /SYNTHETIC \/ LOOPBACK/);
  assert.match(contract, /REAL_HOME_CONNECTED: Boolean = false/);
  assert.match(contract, /HOME_WRITER_GRANTED: Boolean = false/);
  assert.doesNotMatch(surface, /onClick|Retrofit|OkHttp|WebSocket|HttpURLConnection|Socket\(/);
  assert.match(rendered.files['platform/android/app/src/main/res/values/vexlife_r2.xml'], /SYNTHETIC \/ LOOPBACK/);
});

test('R5-10 deterministic inputs produce byte-identical generated Android output', () => {
  const first = renderAndroidR5Outputs({ homeBridgeRegistry: registry(), baseFiles: baseFiles() });
  const second = renderAndroidR5Outputs({ homeBridgeRegistry: registry(), baseFiles: baseFiles() });
  assert.equal(first.semanticFingerprint, second.semanticFingerprint);
  assert.deepEqual(first.inventory, second.inventory);
  assert.deepEqual(first.files, second.files);
});

test('R5-11 generator source pins accepted R4 Git-object rendering rather than generated worktree base', () => {
  const source = fs.readFileSync(new URL('../scripts/generate-android-r5.mjs', import.meta.url), 'utf8');
  assert.match(source, /ACCEPTED_R4_BASE = '4bf6f8cd758acb092cf92359f52b48a08ef0c1c6'/);
  assert.match(source, /gitShowText/);
  assert.match(source, /validateWorktreePreimages/);
  assert.match(source, /renderBaseFilesFromGit/);
  assert.doesNotMatch(source, /renderBaseFilesFromWorktree/);
});

test('R5-13 production truth remains explicitly unestablished by the loopback fixture', () => {
  const result = evaluateSyntheticHomeLoopback({ homeBridgeRegistry: registry() });
  assert.equal(result.effects.syntheticFixture, true);
  assert.equal(result.effects.loopbackSemanticProof, true);
  assert.equal(result.effects.realNetwork, false);
  assert.equal(result.effects.homeRead, false);
  assert.equal(result.effects.homeWrite, false);
  assert.equal(result.effects.homeMutation, false);
  assert.equal(result.effects.modelRuntimeEffect, false);
  assert.equal(result.effects.physicalDeviceEffect, false);
  assert.equal(result.effects.releasePublication, false);
});

// [VXG RealForever]
