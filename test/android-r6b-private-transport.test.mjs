import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANDROID_R6B_ALLOWED_PRIVATE_TRANSPORT_REFS,
  ANDROID_R6B_CANONICAL_WRITER,
  ANDROID_R6B_OUTPUT_PATHS,
  ANDROID_R6B_READY_STATE,
  projectAndroidR6BPrivateTransportConsumer,
  renderAndroidR6BOutputs,
} from '../src/core/android-r6b-private-transport-consumer.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function r6(overrides = {}) {
  return {
    schemaVersion: 'vexlife.android-r6-home-session-projection/v1',
    stage: 'R6_HOME_SESSION_AUTHORITY_ADMISSION',
    state: 'READY_FOR_PRIVATE_TRANSPORT',
    homeBridgeRef: 'bridge.vexlife.personal-home.001',
    sourceAuthoritySchemaVersion: 'vexlife.home-bridge-session-authority/v1',
    sourceAuthenticatedSessionSchemaVersion: 'vexlife.home-bridge-authenticated-session/v1',
    sourceAuthorityActionRef: 'action.vexlife.home-bridge.session-authority.resolve',
    authorityReceiptRef: 'authority-receipt.vexlife.r6b.fixture',
    stableSessionBindingRef: 'session-binding.vexlife.r6b.fixture',
    principalRef: 'person.victor-gong',
    deviceRef: 'device.android.r6b.fixture',
    membershipRef: 'membership.vexlife.r6b.fixture',
    leaseRef: 'lease.vexlife.r6b.fixture',
    leaseExpiresAt: '2030-01-01T00:00:00.000Z',
    currentRevocationGeneration: 9,
    sourceReceiptRefs: ['receipt.r6.fixture'],
    currentnessRefs: ['currentness.r6.fixture'],
    privateTransportRef: 'transport.vexlife.tailscale',
    canonicalWriter: 'DESKTOP_HOME_NODE',
    remoteWriterGranted: false,
    effects: {
      pairingMutationPerformed: false,
      authenticationMutationPerformed: false,
      authorizationMutationPerformed: false,
      capabilityLeaseMutationPerformed: false,
      revocationMutationPerformed: false,
      networkConnectionPerformed: false,
      homePayloadReadOrWritePerformed: false,
      credentialEffectPerformed: false,
      modelRuntimeEffectPerformed: false,
      physicalDeviceEffectPerformed: false,
    },
    ...overrides,
  };
}

function authority(overrides = {}) {
  return {
    schemaVersion: 'vextreme.vex-core.home-session-authority/v1',
    state: 'CURRENT',
    stableSessionBindingRef: 'session-binding.vexlife.r6b.fixture',
    principalRef: 'person.victor-gong',
    deviceRef: 'device.android.r6b.fixture',
    homeRef: 'home.vex.fixture',
    currentRevocationGeneration: 9,
    securityMembershipRef: 'membership.vexlife.r6b.fixture',
    securityAuthenticationReceiptRef: 'receipt.authentication.r6b.fixture',
    securityAuthorizationReceiptRef: 'receipt.authorization.r6b.fixture',
    securityLeaseRef: 'lease.vexlife.r6b.fixture',
    safetyStateDigest: 'state-digest.vex.r6b.fixture',
    safetyEvaluationRef: 'evaluation.vex.r6b.fixture',
    allowedProductCapabilityRefs: ['capability.vex.fixture'],
    membership: {
      schemaVersion: 'vexlife.bridge-device-membership/v1',
      membershipRef: 'membership.vexlife.r6b.fixture',
      homeNodeRef: 'home.vex.fixture',
      principalRef: 'person.victor-gong',
      deviceRef: 'device.android.r6b.fixture',
      devicePublicKey: 'PUBLIC_KEY_FIXTURE',
      capabilityRefs: ['capability.vex.fixture'],
      approvedBy: 'person.victor-gong',
      approvedAt: '2026-10-08T00:00:00.000Z',
      revocationGeneration: 9,
      state: 'ACTIVE',
      membershipHash: A,
    },
    lease: {
      schemaVersion: 'vexlife.bridge-capability-lease/v1',
      leaseRef: 'lease.vexlife.r6b.fixture',
      homeNodeRef: 'home.vex.fixture',
      principalRef: 'person.victor-gong',
      deviceRef: 'device.android.r6b.fixture',
      capabilityRefs: ['capability.vex.fixture'],
      projectRefs: ['project.vex.fixture'],
      issuedAt: '2026-10-08T00:00:00.000Z',
      expiresAt: '2030-01-01T00:00:00.000Z',
      revocationGeneration: 9,
      state: 'ACTIVE',
      leaseHash: B,
    },
    sourceReceiptRefs: ['receipt.vex-core.r6b.fixture'],
    currentnessRefs: ['currentness.vex-core.r6b.fixture'],
    effects: {
      authenticationMutation: false,
      authorizationMutation: false,
      membershipMutation: false,
      capabilityLeaseMutation: false,
      revocationMutation: false,
      HomePayloadReadOrWrite: false,
      remoteHomeWrite: false,
      networkMutation: false,
      credentialMutation: false,
      MemoryMutation: false,
      RelationshipsMutation: false,
      modelRuntimeEffect: false,
      publication: false,
    },
    ...overrides,
  };
}

function reachability(overrides = {}) {
  const base = {
    schemaVersion: 'localvex.home-reachability-lived-state/v1',
    current: {
      schemaVersion: 'localvex.home-reachability-lived-state/v1',
      homeRef: 'home.vex.fixture',
      companionLineageRef: 'lineage.vex.fixture',
      revisionDigest: A,
      revisionGeneration: 6,
      pointerDigest: B,
      pointerGeneration: 7,
      revocationGeneration: 9,
      signatureReceiptRef: 'receipt.signature.r6b.fixture',
      acceptanceReceiptRef: 'receipt.acceptance.r6b.fixture',
      signerFingerprintRef: 'signer-fingerprint.ed25519.r6bfixture',
      acceptedAt: '2026-10-08T00:00:00.000Z',
      signatureVerified: true,
      pointerAcceptanceVerified: true,
      provesLiveReachability: false,
      grantsAuthority: false,
    },
    revision: {
      schemaVersion: 'localvex.home-reachability-map/v1',
      contractRef: 'contract.localvex.home-reachability-map-and-gateway-state.v1',
      homeRef: 'home.vex.fixture',
      companionLineageRef: 'lineage.vex.fixture',
      revisionRef: 'revision.home.r6b.fixture',
      revisionGeneration: 6,
      previousRevisionDigest: null,
      revocationGeneration: 9,
      route: { routeRef: 'route.vex.fixture', state: 'REMOTE_CANDIDATE', generation: 4 },
      gateway: { gatewayRef: 'gateway.vex.fixture', state: 'READY', generation: 3, remoteCanonicalWrite: false, rawModelEndpointIsGateway: false },
      signatureEvidence: { evidenceClass: 'EXTERNAL_VERIFICATION_REQUIRED', signerFingerprintRef: 'signer-fingerprint.ed25519.r6bfixture', signatureReceiptRef: 'receipt.signature.r6b.fixture', cryptographicVerificationPerformedByThisModule: false },
      currentness: 'CANDIDATE_ONLY',
      provesLiveReachability: false,
      grantsAuthority: false,
      effects: {},
      revisionDigest: A,
    },
    pointerCandidate: {
      schemaVersion: 'localvex.home-reachability-map/v1',
      homeRef: 'home.vex.fixture',
      revisionDigest: A,
      expectedPreviousPointerDigest: null,
      pointerGeneration: 7,
      revocationGeneration: 9,
      acceptanceReceiptRef: 'receipt.acceptance.r6b.fixture',
      acceptanceExternallyVerifiedByThisModule: false,
      currentness: 'CANDIDATE_ONLY',
      grantsAuthority: false,
      effects: {},
      pointerDigest: B,
    },
    signatureReceipt: {
      schemaVersion: 'localvex.home-reachability-lived-state/v1',
      signatureReceiptRef: 'receipt.signature.r6b.fixture',
      homeRef: 'home.vex.fixture',
      companionLineageRef: 'lineage.vex.fixture',
      revisionDigest: A,
      signerFingerprintRef: 'signer-fingerprint.ed25519.r6bfixture',
      algorithm: 'Ed25519',
      publicKeySpkiDerBase64: 'UFVCTElDS0VZ',
      signatureBase64: 'U0lHTkFUVVJF',
      cryptographicVerificationPerformed: true,
      provesLiveReachability: false,
      grantsAuthority: false,
      receiptDigest: A,
    },
    acceptanceReceipt: {
      schemaVersion: 'localvex.home-reachability-lived-state/v1',
      acceptanceReceiptRef: 'receipt.acceptance.r6b.fixture',
      homeRef: 'home.vex.fixture',
      companionLineageRef: 'lineage.vex.fixture',
      revisionDigest: A,
      pointerDigest: B,
      pointerGeneration: 7,
      revocationGeneration: 9,
      expectedPreviousPointerDigest: null,
      signerFingerprintRef: 'signer-fingerprint.ed25519.r6bfixture',
      algorithm: 'Ed25519',
      acceptedAt: '2026-10-08T00:00:00.000Z',
      pointerAcceptancePerformed: true,
      provesLiveReachability: false,
      authenticates: false,
      authorizes: false,
      grantsAuthority: false,
      publicKeySpkiDerBase64: 'UFVCTElDS0VZ',
      signatureBase64: 'U0lHTkFUVVJF',
      signedPayloadDigest: A,
      cryptographicVerificationPerformed: true,
      receiptDigest: B,
    },
    sourceAddressable: true,
    cryptographicallyVerified: true,
    pointerAcceptanceVerified: true,
    provesLiveReachability: false,
    authenticates: false,
    authorizes: false,
    grantsAuthority: false,
  };
  return { ...base, ...overrides };
}

function diagnosis(overrides = {}) {
  return {
    schemaVersion: 'vextreme.patient0.p7.connectivity-projection/v1',
    projectionRef: 'projection.patient0.p7.connectivity.r6bfixture',
    projectionClass: 'REFERENCE_ONLY_NO_EFFECT',
    homeRef: 'home.vex.fixture',
    diagnosis: { state: 'CONNECTED_AUTHORIZED' },
    truth: {
      sourceAddressableOwnerProjection: true,
      provesPairing: false,
      provesReachability: false,
      authenticatesUser: false,
      grantsAuthorization: false,
      executesRecovery: false,
      substitutesSiblingHome: false,
      exposesRawModelEndpoint: false,
      provesP7Accepted: false,
    },
    effects: {
      pairedDevice: false,
      generatedCredential: false,
      serializedSecret: false,
      mutatedRecoveryCredential: false,
      exposedNetworkService: false,
      mutatedListenerFirewallOrRoute: false,
      wroteHome: false,
      grantedRemoteHomeWrite: false,
      widenedPrivateBoundary: false,
      exposedRawModelEndpoint: false,
      changedModelLifecycle: false,
      published: false,
    },
    ...overrides,
  };
}

test('accepted owner projections yield only runtime-adapter readiness', () => {
  const out = projectAndroidR6BPrivateTransportConsumer({
    r6Session: r6(),
    homeSessionAuthority: authority(),
    reachability: reachability(),
    connectivityProjection: diagnosis(),
  });
  assert.equal(out.state, ANDROID_R6B_READY_STATE);
  assert.equal(out.homeRef, 'home.vex.fixture');
  assert.equal(out.routeRef, 'route.vex.fixture');
  assert.equal(out.gatewayRef, 'gateway.vex.fixture');
  assert.equal(out.privateTransportRef, 'transport.vexlife.tailscale');
  assert.equal(out.canonicalWriter, ANDROID_R6B_CANONICAL_WRITER);
  assert.equal(out.remoteWriterGranted, false);
  assert.equal(out.provesLiveReachability, false);
  assert.equal(out.authenticates, false);
  assert.equal(out.authorizes, false);
  assert.equal(out.grantsAuthority, false);
  assert.deepEqual(Object.values(out.effects), Array(Object.keys(out.effects).length).fill(false));
});

test('R6/VEX_CORE identity and revocation mismatch fail closed', () => {
  assert.throws(() => projectAndroidR6BPrivateTransportConsumer({
    r6Session: r6({ deviceRef: 'device.other' }),
    homeSessionAuthority: authority(),
    reachability: reachability(),
  }), /SESSION_IDENTITY_MISMATCH/);
  assert.throws(() => projectAndroidR6BPrivateTransportConsumer({
    r6Session: r6(),
    homeSessionAuthority: authority({ currentRevocationGeneration: 10 }),
    reachability: reachability(),
  }), /SESSION_IDENTITY_MISMATCH/);
});

test('Home identity and accepted reachability currentness mismatch fail closed', () => {
  assert.throws(() => projectAndroidR6BPrivateTransportConsumer({
    r6Session: r6(),
    homeSessionAuthority: authority(),
    reachability: reachability({ current: { ...reachability().current, homeRef: 'home.other' } }),
  }), /REACHABILITY_HOME_MISMATCH/);
  assert.throws(() => projectAndroidR6BPrivateTransportConsumer({
    r6Session: r6(),
    homeSessionAuthority: authority(),
    reachability: reachability({ pointerAcceptanceVerified: false }),
  }), /REACHABILITY_NOT_VERIFIED/);
});

test('route/gateway readiness and remote-writer boundary fail closed', () => {
  const badRoute = reachability();
  badRoute.revision = { ...badRoute.revision, route: { ...badRoute.revision.route, state: 'UNREACHABLE' } };
  assert.throws(() => projectAndroidR6BPrivateTransportConsumer({
    r6Session: r6(), homeSessionAuthority: authority(), reachability: badRoute,
  }), /REMOTE_ROUTE_NOT_READY/);
  assert.throws(() => projectAndroidR6BPrivateTransportConsumer({
    r6Session: r6({ remoteWriterGranted: true }), homeSessionAuthority: authority(), reachability: reachability(),
  }), /WRITER_BOUNDARY_DRIFT/);
});

test('optional SDK diagnosis remains reference-only and Home-bound', () => {
  assert.throws(() => projectAndroidR6BPrivateTransportConsumer({
    r6Session: r6(), homeSessionAuthority: authority(), reachability: reachability(),
    connectivityProjection: diagnosis({ homeRef: 'home.other' }),
  }), /CONNECTIVITY_HOME_MISMATCH/);
});

test('renderer is deterministic, exact, and contains no endpoint/network implementation', () => {
  const one = renderAndroidR6BOutputs();
  const two = renderAndroidR6BOutputs();
  assert.deepEqual(one, two);
  assert.deepEqual(Object.keys(one.files).sort(), [...ANDROID_R6B_OUTPUT_PATHS].sort());
  assert.deepEqual(ANDROID_R6B_ALLOWED_PRIVATE_TRANSPORT_REFS, [
    'transport.vexlife.tailscale',
    'transport.vexlife.wireguard',
  ]);
  for (const text of Object.values(one.files)) {
    for (const forbidden of ['java.net.', 'Socket(', 'HttpURLConnection', 'HttpsURLConnection', 'OkHttp', 'Ktor', 'android.permission.INTERNET', 'http://', 'https://']) {
      assert.equal(text.includes(forbidden), false, forbidden);
    }
  }
  assert.deepEqual(Object.values(one.effects), Array(Object.keys(one.effects).length).fill(false));
});

// [VXG RealForever]
