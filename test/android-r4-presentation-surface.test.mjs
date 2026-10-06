import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANDROID_R4_OUTPUT_PATHS,
  CANONICAL_WRITER,
  HOME_BRIDGE_REF,
  PRESENTATION_KIND,
  PRESENTATION_REF,
  R2_BASE_FILES,
  REFERENCE_STATE,
  acceptedR2BaseFiles,
  renderAndroidR4PresentationSurface,
  validateAcceptedR2Preimages,
} from '../src/core/android-r4-presentation-surface.mjs';

const protectedEffects = [
  'pairingOfferCreation','pairingApproval','deviceMembershipMutation','authentication','authorization',
  'capabilityLeaseIssuance','capabilityLeaseRenewal','revocationMutation','realTransportConnection',
  'networkListenerOrExposure','homeRead','homeWrite','homeMutation','memoryMutation','friendMutation',
  'credentialEffect','rawModelEndpointExposure','providerEffect','modelRuntimeEffect','training','activation','publication',
];

const presentationRequirements = [
  'ANDROID_REMOTE_VESSEL_PRESENTATION_BOUND',
  'READ_ONLY_REMOTE_VESSEL_STATUS_ONLY',
  'PRODUCT_SEMANTIC_OWNERSHIP_FALSE',
  'REFERENCE_DEFAULT_UNPAIRED',
  'CANONICAL_WRITER_DESKTOP_HOME_NODE',
  'REMOTE_WRITER_GRANTED_FALSE',
  'PAIRING_AUTHENTICATION_AUTHORIZATION_REMAIN_DISTINCT_AND_UNGRANTED',
  'CAPABILITY_LEASE_EFFECT_FALSE',
  'TRANSPORT_AND_NETWORK_EFFECT_FALSE',
  'HOME_AND_MEMORY_EFFECT_FALSE',
  'CREDENTIAL_EFFECT_FALSE',
  'MODEL_RUNTIME_EFFECT_FALSE',
  'RAW_MODEL_ENDPOINT_EXPOSED_FALSE',
  'PUBLICATION_EFFECT_FALSE',
  'NO_NEW_ROUTE_OR_ACTION',
];

function canonicalInput() {
  return {
    presentationGraph: {
      schemaVersion: 'vexlife.presentation-graph-registry/v1',
      registryRef: 'registry.vexlife.presentation-graph.001',
      registryVersion: 11,
      effects: false,
      presentationNodes: [{
        presentationRef: PRESENTATION_REF,
        presentationKind: PRESENTATION_KIND,
        sourceRef: 'projection.security-access.android-remote-vessel',
        productSemanticOwnership: false,
        referenceState: REFERENCE_STATE,
        canonicalWriter: CANONICAL_WRITER,
        remoteWriterGranted: false,
        rawModelEndpointExposed: false,
      }],
      testObligations: [{
        obligationRef: 'obligation.vexlife.security-access.android-remote-vessel',
        targetRef: PRESENTATION_REF,
        requires: presentationRequirements,
      }],
    },
    androidRemoteVesselRegistry: {
      schemaVersion: 'vexlife.android-remote-vessel-reference/v1',
      registryRef: 'registry.vexlife.android-remote-vessel.001',
      featureRef: 'feature.vexlife.security-access',
      homeBridgeRef: HOME_BRIDGE_REF,
      mode: 'REMOTE_HOME',
      androidFirst: true,
      iPhoneRequired: false,
      projection: {
        stateRef: 'state.health',
        ownerRef: 'service.health',
        regionRef: 'region.health.security-access',
        targetPlatformRef: 'platform.android',
        truthClass: 'ANDROID_REMOTE_VESSEL_REFERENCE',
      },
      browserRuntimeState: REFERENCE_STATE,
      executableFirstSliceStates: ['UNPAIRED','HOME_UNREACHABLE','LEASE_EXPIRED','REVOKED'],
      heldConnectedStates: ['PAIRING_OFFERED','PAIRING_APPROVED','LEASE_ACTIVE','CONNECTED_DIRECT','CONNECTED_RELAYED'],
      canonicalWriter: CANONICAL_WRITER,
      remoteWriterGranted: false,
      implicitAdmin: false,
      rawModelEndpointExposed: false,
      protectedEffects,
    },
    homeBridgeRegistry: {
      bridgeRef: HOME_BRIDGE_REF,
      modes: ['REMOTE_HOME','LOCAL_SIBLING','HYBRID'],
      connectionStates: [
        'UNPAIRED','PAIRING_OFFERED','PAIRING_APPROVED','LEASE_ACTIVE','CONNECTED_DIRECT',
        'CONNECTED_RELAYED','HOME_UNREACHABLE','LEASE_EXPIRED','REVOKED',
      ],
    },
    securityAccessPreviewRegistry: {
      registryRef: 'registry.vexlife.security-access-preview.001',
      androidRemoteVesselRegistryRef: 'registry.vexlife.android-remote-vessel.001',
      androidRemoteVesselProjectionRef: 'projection.security-access.android-remote-vessel',
    },
    localizationCatalogs: {
      en: {
        'security-access.android-first': 'Android-first',
        'security-access.status.backend-unavailable': 'Preview — security runtime not connected',
      },
      ja: {
        'security-access.android-first': 'Android優先',
        'security-access.status.backend-unavailable': 'プレビュー — セキュリティランタイム未接続',
      },
      zh: {
        'security-access.android-first': 'Android 优先',
        'security-access.status.backend-unavailable': '预览 — 安全运行时尚未连接',
      },
    },
  };
}

test('R4 binds the accepted no-effect Remote Vessel presentation and renders deterministically', () => {
  const first = renderAndroidR4PresentationSurface(canonicalInput());
  const second = renderAndroidR4PresentationSurface(canonicalInput());
  assert.equal(first.presentationRef, PRESENTATION_REF);
  assert.equal(first.referenceState, REFERENCE_STATE);
  assert.equal(first.canonicalWriter, CANONICAL_WRITER);
  assert.equal(first.semanticFingerprint, second.semanticFingerprint);
  assert.deepEqual(first.inventory, second.inventory);
  assert.deepEqual(Object.keys(first.files).sort(), [...ANDROID_R4_OUTPUT_PATHS].sort());
  assert.ok(Object.values(first.effects).every((value) => value === false));
});

test('R4 native surface is presentation-only and contains no action/network/Home execution API', () => {
  const rendered = renderAndroidR4PresentationSurface(canonicalInput());
  const surface = rendered.files['platform/android/app/src/main/kotlin/vexlife/android/presentation/AndroidRemoteVesselSurface.kt'];
  const main = rendered.files['platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt'];
  assert.match(main, /AndroidRemoteVesselSurface\(\)/);
  assert.match(surface, /READ_ONLY_REMOTE_VESSEL_STATUS|EFFECT_AUTHORITY_GRANTED/);
  assert.doesNotMatch(surface, /onClick|launch\s*\{|WebSocket|Http|Retrofit|OkHttp|HomeBridge|requestPermission/);
  assert.doesNotMatch(surface, /MutableStateFlow|ViewModel|OperationExecutor/);
});

test('R4 localizes visible text from stable source refs without changing semantic identity', () => {
  const input = canonicalInput();
  const first = renderAndroidR4PresentationSurface(input);
  input.localizationCatalogs.en['security-access.android-first'] = 'Android — local label changed';
  const second = renderAndroidR4PresentationSurface(input);
  assert.equal(first.presentationRef, second.presentationRef);
  assert.notEqual(
    first.files['platform/android/app/src/main/res/values/vexlife_r2.xml'],
    second.files['platform/android/app/src/main/res/values/vexlife_r2.xml'],
  );
  assert.match(first.files['platform/android/app/src/main/res/values-ja/vexlife_r2.xml'], /Android優先/);
  assert.match(first.files['platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml'], /Android 优先/);
});

test('R4 fails closed when Presentation Graph ownership or protected-effect truth drifts', () => {
  const presentationDrift = canonicalInput();
  presentationDrift.presentationGraph.presentationNodes[0].productSemanticOwnership = true;
  assert.throws(() => renderAndroidR4PresentationSurface(presentationDrift), /productSemanticOwnership/);

  const effectDrift = canonicalInput();
  effectDrift.androidRemoteVesselRegistry.protectedEffects = protectedEffects.filter((item) => item !== 'homeWrite');
  assert.throws(() => renderAndroidR4PresentationSurface(effectDrift), /protected effect missing homeWrite/);

  const connectedDrift = canonicalInput();
  connectedDrift.androidRemoteVesselRegistry.browserRuntimeState = 'CONNECTED_DIRECT';
  assert.throws(() => renderAndroidR4PresentationSurface(connectedDrift), /browserRuntimeState must equal UNPAIRED/);
});

test('R4 source placement excludes Manifest Gradle and physical-device mutation', () => {
  const rendered = renderAndroidR4PresentationSurface(canonicalInput());
  const paths = new Set(Object.keys(rendered.files));
  assert.equal(paths.has('platform/android/app/src/main/AndroidManifest.xml'), false);
  assert.equal(paths.has('platform/android/app/build.gradle.kts'), false);
  assert.equal(paths.has('platform/android/build.gradle.kts'), false);
  assert.equal(rendered.effects.physicalDevice, false);
});

test('R4 validates the exact accepted R2 preimage set before write', () => {
  const base = acceptedR2BaseFiles();
  assert.equal(validateAcceptedR2Preimages(base).state, 'PASS');
  base['platform/android/README.md'] += '\nDRIFT\n';
  const drifted = validateAcceptedR2Preimages(base);
  assert.equal(drifted.state, 'FAIL');
  assert.deepEqual(drifted.mismatches.map((item) => item.path), ['platform/android/README.md']);
  assert.equal(Object.isFrozen(R2_BASE_FILES), true);
});

// [VXG RealForever]
