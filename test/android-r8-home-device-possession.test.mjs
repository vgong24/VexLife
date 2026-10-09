import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANDROID_R8_KEY_PROFILE,
  ANDROID_R8_OUTPUT_PATHS,
  ANDROID_R8_SIGNATURE_ALGORITHM_REF,
  ANDROID_R8_SIGNING_PAYLOAD_SCHEMA,
  androidR8SigningPayloadSha256,
  canonicalAndroidR8SigningBytes,
  normalizeAndroidR8SigningPayload,
  renderAndroidR8DevicePossessionOutputs,
  validateAndroidR8DevicePossessionProfile,
} from '../src/core/android-r8-device-possession.mjs';

function fixture() {
  return {
    schemaVersion: ANDROID_R8_SIGNING_PAYLOAD_SCHEMA,
    challengeRef: 'challenge.home-possession.fixture.001',
    homeRef: 'home.fixture',
    principalRef: 'principal.fixture',
    deviceRef: 'device.android.fixture',
    membershipRef: 'membership.fixture',
    membershipHash: 'a'.repeat(64),
    revocationGeneration: 7,
    devicePublicKeyFingerprintRef: `fingerprint.sha256.${'b'.repeat(64)}`,
    nonceBase64Url: 'AAECAwQFBgcICQ',
    issuedAtMs: 1760000000000,
    expiresAtMs: 1760000300000,
  };
}

test('profile binds the source-placed AndroidKeyStore P-256 SHA-256 contract', () => {
  assert.deepEqual(validateAndroidR8DevicePossessionProfile(), ANDROID_R8_KEY_PROFILE);
  assert.equal(ANDROID_R8_KEY_PROFILE.provider, 'AndroidKeyStore');
  assert.equal(ANDROID_R8_KEY_PROFILE.keyAlgorithm, 'EC');
  assert.equal(ANDROID_R8_KEY_PROFILE.curve, 'secp256r1');
  assert.equal(ANDROID_R8_KEY_PROFILE.signatureAlgorithm, 'SHA256withECDSA');
  assert.equal(ANDROID_R8_SIGNATURE_ALGORITHM_REF, 'signature.vextreme.ecdsa-p256-sha256');
  assert.equal(ANDROID_R8_KEY_PROFILE.privateKeyExportable, false);
});

test('canonical signing vector is sorted JSON plus one LF with a fixed digest', () => {
  const bytes = canonicalAndroidR8SigningBytes(fixture());
  assert.equal(bytes.length, 585);
  assert.equal(bytes.at(-1), 0x0a);
  assert.equal(androidR8SigningPayloadSha256(fixture()), '16a22f6bbd4a7fababfa0e220b5b7c5d4d86182e12ccb1f89f3e7da78adc0bba');
});

test('insertion order cannot change canonical bytes', () => {
  const original = fixture();
  const reversed = Object.fromEntries(Object.entries(original).reverse());
  assert.deepEqual(canonicalAndroidR8SigningBytes(reversed), canonicalAndroidR8SigningBytes(original));
});

test('semantic identity/currentness changes change the digest', () => {
  const one = fixture();
  const two = { ...one, deviceRef: 'device.android.other' };
  const three = { ...one, revocationGeneration: one.revocationGeneration + 1 };
  assert.notEqual(androidR8SigningPayloadSha256(one), androidR8SigningPayloadSha256(two));
  assert.notEqual(androidR8SigningPayloadSha256(one), androidR8SigningPayloadSha256(three));
});

test('extra private or endpoint-shaped fields fail closed', () => {
  assert.throws(() => normalizeAndroidR8SigningPayload({ ...fixture(), privateKey: 'forbidden' }), /FIELDS/);
  assert.throws(() => normalizeAndroidR8SigningPayload({ ...fixture(), endpointUrl: 'https:\/\/example.invalid' }), /FIELDS/);
});

test('generated Kotlin separates production AndroidKeyStore provider from explicit fake and keeps all source effects false', () => {
  const rendered = renderAndroidR8DevicePossessionOutputs();
  assert.deepEqual(Object.keys(rendered.files).sort(), [...ANDROID_R8_OUTPUT_PATHS].sort());
  const source = rendered.files[ANDROID_R8_OUTPUT_PATHS[0]];
  assert.match(source, /class AndroidKeystoreDevicePossessionKeyProvider/);
  assert.match(source, /KeyGenParameterSpec\.Builder/);
  assert.match(source, /ECGenParameterSpec\(AndroidHomeDevicePossessionProfile\.CURVE\)/);
  assert.match(source, /Signature\.getInstance\(AndroidHomeDevicePossessionProfile\.SIGNATURE_ALGORITHM\)/);
  assert.match(source, /class FakeDevicePossessionKeyProvider/);
  assert.match(source, /privateKeyExportable: Boolean = false/);
  assert.doesNotMatch(source, /getEncoded\(\).*PrivateKey|privateKeyBase64|exportPrivateKey/i);
  assert.deepEqual(Object.values(rendered.effects), Array(Object.keys(rendered.effects).length).fill(false));
});

// [VXG RealForever]
