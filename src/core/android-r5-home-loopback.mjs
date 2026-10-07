import crypto from 'node:crypto';
import { evaluateRemoteRequest } from './home-bridge.mjs';
import { VexCompoundState } from './state-relay.mjs';

export const ANDROID_R5_HOME_LOOPBACK_SCHEMA = 'vexlife.android-r5-home-loopback/v0';
export const ANDROID_R5_HOME_LOOPBACK_STAGE = 'R5_SYNTHETIC_LOOPBACK_HOME_BRIDGE_INTEGRATION';
export const HOME_BRIDGE_REF = 'bridge.vexlife.personal-home.001';
export const LOOPBACK_TRANSPORT_REF = 'transport.vexlife.loopback';
export const LOOPBACK_TRANSPORT_STATE = 'REFERENCE_LOCAL';
export const PROOF_LABEL = 'SYNTHETIC / LOOPBACK';
export const PROJECTION_REF = 'projection.vexlife.android.r5.home-loopback';
export const OUTPUT_STATE_REF = 'state.vexlife.android.r5.home-loopback';
export const HOME_RESPONSE_INPUT_REF = 'input.vexlife.android.r5.home-loopback.response';

export const REQUEST_ENVELOPE_FIELDS = Object.freeze([
  'requestRef',
  'deviceRef',
  'leaseRef',
  'channelRef',
  'speakerRef',
  'recipientRefs',
  'actionRef',
  'expectedCurrentStateRef',
  'resourceEnvelopeRef',
  'idempotencyKey',
  'sentAt',
]);

export const RESPONSE_ENVELOPE_FIELDS = Object.freeze([
  'requestRef',
  'receiptRef',
  'homeNodeRef',
  'companionLineageRef',
  'state',
  'projectionRefs',
  'newCurrentStateRef',
  'resourceReceiptRef',
  'returnedAt',
]);

export const SYNTHETIC_REFS = Object.freeze({
  principalRef: 'synthetic.principal.android-r5.loopback.001',
  deviceRef: 'synthetic.device.android-r5.loopback.001',
  homeNodeRef: 'synthetic.home.android-r5.loopback.001',
  leaseRef: 'synthetic.lease.android-r5.loopback.001',
  channelRef: 'synthetic.channel.android-r5.loopback.001',
  companionLineageRef: 'synthetic.companion-lineage.android-r5.loopback.001',
  requestRef: 'synthetic.request.android-r5.loopback.001',
  receiptRef: 'synthetic.receipt.android-r5.loopback.001',
  actionRef: 'synthetic.action.android-r5.loopback.observe',
  capabilityRef: 'synthetic.capability.android-r5.loopback.read',
  expectedCurrentStateRef: 'synthetic.state.android-r5.home.before.001',
  resourceEnvelopeRef: 'synthetic.resource-envelope.android-r5.loopback.001',
  resourceReceiptRef: 'synthetic.resource-receipt.android-r5.loopback.001',
  outputInstanceRef: 'synthetic.instance.android-r5.home-loopback.001',
  inputInstanceRef: 'synthetic.instance.android-r5.home-response.001',
  transitionRef: 'synthetic.transition.android-r5.home-response.001',
});

const EFFECTS = Object.freeze({
  syntheticFixture: true,
  loopbackSemanticProof: true,
  realPairing: false,
  authenticationMutation: false,
  authorizationMutation: false,
  membershipMutation: false,
  capabilityLeaseMutation: false,
  revocationMutation: false,
  realNetwork: false,
  homeRead: false,
  homeWrite: false,
  homeMutation: false,
  credentialEffect: false,
  modelRuntimeEffect: false,
  rawModelEndpointExposure: false,
  physicalDeviceEffect: false,
  install: false,
  signing: false,
  releasePublication: false,
});

export const ANDROID_R5_OUTPUT_PATHS = Object.freeze([
  'platform/android/README.md',
  'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt',
  'platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt',
  'platform/android/app/src/main/kotlin/vexlife/android/home/AndroidHomeLoopbackContract.kt',
  'platform/android/app/src/main/kotlin/vexlife/android/presentation/AndroidHomeLoopbackSurface.kt',
  'platform/android/app/src/test/kotlin/vexlife/android/app/R5HomeLoopbackContractTest.kt',
  'platform/android/app/src/main/res/values/vexlife_r2.xml',
  'platform/android/app/src/main/res/values-ja/vexlife_r2.xml',
  'platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml',
]);

export const ANDROID_R5_NEW_GENERATED_PATHS = Object.freeze([
  'platform/android/app/src/main/kotlin/vexlife/android/home/AndroidHomeLoopbackContract.kt',
  'platform/android/app/src/main/kotlin/vexlife/android/presentation/AndroidHomeLoopbackSurface.kt',
  'platform/android/app/src/test/kotlin/vexlife/android/app/R5HomeLoopbackContractTest.kt',
]);

function clone(value) { return structuredClone(value); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function semanticFingerprint(value) { return sha256(JSON.stringify(stable(value))); }
function exactArray(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} drift`);
  }
}
function exactKeys(value, expected, label) {
  const observed = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(observed) !== JSON.stringify(required)) throw new Error(`${label} field-set drift`);
}
function requireSyntheticRef(value, label) {
  if (typeof value !== 'string' || !value.startsWith('synthetic.')) throw new Error(`${label} must be synthetic.*`);
}
function replaceExactlyOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  if (first < 0 || source.indexOf(find, first + find.length) >= 0) throw new Error(`${label} anchor drift`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + find.length)}`;
}
function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function kotlin(value) { return JSON.stringify(String(value)); }

export function validateHomeBridgeRegistry(homeBridgeRegistry) {
  if (!homeBridgeRegistry || typeof homeBridgeRegistry !== 'object') throw new TypeError('homeBridgeRegistry is required');
  if (homeBridgeRegistry.bridgeRef !== HOME_BRIDGE_REF) throw new Error('Home Bridge ref drift');
  const loopback = homeBridgeRegistry.transportAdapters?.find((item) => item.transportRef === LOOPBACK_TRANSPORT_REF);
  if (!loopback || loopback.state !== LOOPBACK_TRANSPORT_STATE) throw new Error('REFERENCE_LOCAL loopback adapter unavailable');
  exactArray(homeBridgeRegistry.requestEnvelopeFields, REQUEST_ENVELOPE_FIELDS, 'requestEnvelopeFields');
  exactArray(homeBridgeRegistry.responseEnvelopeFields, RESPONSE_ENVELOPE_FIELDS, 'responseEnvelopeFields');
  return deepFreeze({
    bridgeRef: HOME_BRIDGE_REF,
    transportRef: LOOPBACK_TRANSPORT_REF,
    transportState: LOOPBACK_TRANSPORT_STATE,
    requestEnvelopeFields: [...REQUEST_ENVELOPE_FIELDS],
    responseEnvelopeFields: [...RESPONSE_ENVELOPE_FIELDS],
  });
}

export function syntheticFixture(overrides = {}) {
  const request = {
    requestRef: SYNTHETIC_REFS.requestRef,
    deviceRef: SYNTHETIC_REFS.deviceRef,
    leaseRef: SYNTHETIC_REFS.leaseRef,
    channelRef: SYNTHETIC_REFS.channelRef,
    speakerRef: SYNTHETIC_REFS.principalRef,
    recipientRefs: [SYNTHETIC_REFS.companionLineageRef],
    actionRef: SYNTHETIC_REFS.actionRef,
    expectedCurrentStateRef: SYNTHETIC_REFS.expectedCurrentStateRef,
    resourceEnvelopeRef: SYNTHETIC_REFS.resourceEnvelopeRef,
    idempotencyKey: 'synthetic.android-r5.loopback.001',
    sentAt: '2026-10-06T00:00:00.000Z',
    ...(overrides.request || {}),
  };
  const membership = {
    state: 'ACTIVE',
    principalRef: SYNTHETIC_REFS.principalRef,
    deviceRef: SYNTHETIC_REFS.deviceRef,
    homeNodeRef: SYNTHETIC_REFS.homeNodeRef,
    capabilityRefs: [SYNTHETIC_REFS.capabilityRef],
    ...(overrides.membership || {}),
  };
  const lease = {
    state: 'ACTIVE',
    leaseRef: SYNTHETIC_REFS.leaseRef,
    principalRef: SYNTHETIC_REFS.principalRef,
    deviceRef: SYNTHETIC_REFS.deviceRef,
    homeNodeRef: SYNTHETIC_REFS.homeNodeRef,
    capabilityRefs: [SYNTHETIC_REFS.capabilityRef],
    projectRefs: [],
    issuedAt: '2026-10-06T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    revocationGeneration: 7,
    ...(overrides.lease || {}),
  };
  exactKeys(request, REQUEST_ENVELOPE_FIELDS, 'synthetic request');
  for (const [label, value] of [
    ['request.requestRef', request.requestRef], ['request.deviceRef', request.deviceRef], ['request.leaseRef', request.leaseRef],
    ['request.channelRef', request.channelRef], ['request.speakerRef', request.speakerRef], ['membership.principalRef', membership.principalRef],
    ['membership.deviceRef', membership.deviceRef], ['membership.homeNodeRef', membership.homeNodeRef], ['lease.leaseRef', lease.leaseRef],
    ['lease.principalRef', lease.principalRef], ['lease.deviceRef', lease.deviceRef], ['lease.homeNodeRef', lease.homeNodeRef],
  ]) requireSyntheticRef(value, label);
  return deepFreeze({ request, membership, lease });
}

function responseFromAdmission(fixture, admission) {
  const response = {
    requestRef: fixture.request.requestRef,
    receiptRef: SYNTHETIC_REFS.receiptRef,
    homeNodeRef: fixture.membership.homeNodeRef,
    companionLineageRef: SYNTHETIC_REFS.companionLineageRef,
    state: admission.state,
    projectionRefs: [PROJECTION_REF],
    newCurrentStateRef: OUTPUT_STATE_REF,
    resourceReceiptRef: SYNTHETIC_REFS.resourceReceiptRef,
    returnedAt: '2026-10-06T00:00:01.000Z',
  };
  exactKeys(response, RESPONSE_ENVELOPE_FIELDS, 'synthetic response');
  requireSyntheticRef(response.receiptRef, 'response.receiptRef');
  requireSyntheticRef(response.homeNodeRef, 'response.homeNodeRef');
  requireSyntheticRef(response.companionLineageRef, 'response.companionLineageRef');
  requireSyntheticRef(response.resourceReceiptRef, 'response.resourceReceiptRef');
  return deepFreeze(response);
}

function boundedProjection(response, admission) {
  return deepFreeze({
    schemaVersion: 'vexlife.android-r5-home-loopback-projection/v0',
    proofLabel: PROOF_LABEL,
    bridgeRef: HOME_BRIDGE_REF,
    transportRef: LOOPBACK_TRANSPORT_REF,
    requestRef: response.requestRef,
    receiptRef: response.receiptRef,
    projectionRef: PROJECTION_REF,
    stateRef: response.newCurrentStateRef,
    state: response.state,
    principalRef: admission.principalRef,
    canonicalWriter: admission.canonicalWriter,
    remoteWriterGranted: admission.remoteWriterGranted,
    syntheticFixture: true,
    realHomeConnected: false,
    realNetworkConnected: false,
    homeWriterGranted: false,
    rawModelEndpointExposed: false,
  });
}

export function evaluateSyntheticHomeLoopback({ homeBridgeRegistry, fixtureOverrides = {}, rawModelEndpointExposed = false } = {}) {
  const sourceBinding = validateHomeBridgeRegistry(homeBridgeRegistry);
  const fixture = syntheticFixture(fixtureOverrides);
  const admission = deepFreeze(evaluateRemoteRequest({
    request: fixture.request,
    membership: fixture.membership,
    lease: fixture.lease,
    now: '2026-10-06T00:00:02.000Z',
    currentRevocationGeneration: fixtureOverrides.currentRevocationGeneration ?? fixture.lease.revocationGeneration,
    registeredActionRefs: fixtureOverrides.registeredActionRefs ?? [SYNTHETIC_REFS.actionRef],
    requiredCapabilityRefs: fixtureOverrides.requiredCapabilityRefs ?? [SYNTHETIC_REFS.capabilityRef],
    roleCapabilityRefs: fixtureOverrides.roleCapabilityRefs ?? [SYNTHETIC_REFS.capabilityRef],
    projectCapabilityRefs: fixtureOverrides.projectCapabilityRefs ?? [SYNTHETIC_REFS.capabilityRef],
    resourceCapabilityRefs: fixtureOverrides.resourceCapabilityRefs ?? [SYNTHETIC_REFS.capabilityRef],
    rawModelEndpointExposed,
  }));
  if (admission.state !== 'REMOTE_REQUEST_ADMITTED') {
    return deepFreeze({
      schemaVersion: ANDROID_R5_HOME_LOOPBACK_SCHEMA,
      stage: ANDROID_R5_HOME_LOOPBACK_STAGE,
      sourceBinding,
      fixture,
      admission,
      response: null,
      stateReceipt: null,
      projection: null,
      effects: { ...EFFECTS },
    });
  }
  if (admission.canonicalWriter !== 'DESKTOP_HOME_NODE' || admission.remoteWriterGranted !== false) {
    throw new Error('Home evaluator writer boundary drift');
  }
  const response = responseFromAdmission(fixture, admission);
  const compound = new VexCompoundState({
    inputRefs: [HOME_RESPONSE_INPUT_REF],
    processLatestState: (latest) => ({
      observation: 'PRESENT',
      valueOrNull: boundedProjection(latest[HOME_RESPONSE_INPUT_REF].valueOrNull, admission),
      transitionRef: SYNTHETIC_REFS.transitionRef,
    }),
    name: 'android-r5-home-loopback',
    stateRef: OUTPUT_STATE_REF,
    instanceRef: SYNTHETIC_REFS.outputInstanceRef,
    initialOutput: null,
    outputObservation: 'UNOBSERVED',
  });
  const stateReceipt = compound.accept(HOME_RESPONSE_INPUT_REF, {
    valueOrNull: response,
    observation: 'PRESENT',
    instanceRef: SYNTHETIC_REFS.inputInstanceRef,
    transitionRef: SYNTHETIC_REFS.transitionRef,
  });
  if (!stateReceipt.reconciled || stateReceipt.output.observation !== 'PRESENT') throw new Error('R5 compound state did not reconcile');
  const projection = stateReceipt.output.valueOrNull;
  return deepFreeze({
    schemaVersion: ANDROID_R5_HOME_LOOPBACK_SCHEMA,
    stage: ANDROID_R5_HOME_LOOPBACK_STAGE,
    sourceBinding,
    fixture,
    admission,
    response,
    stateReceipt,
    projection,
    semanticFingerprint: semanticFingerprint({ response, projection }),
    effects: { ...EFFECTS },
  });
}

function renderReadme(base, projection) {
  return `${base}\n## R5 — synthetic / loopback Home Bridge integration proof\n\nR5 consumes the accepted Home Bridge evaluator and canonical VexCompoundState using\ndeterministic synthetic identities. It proves the Android projection boundary without\ncreating a real Home connection, network/session authority, credentials, or Home writer.\n\n\`\`\`text\nproofLabel=${PROOF_LABEL}\nhomeBridgeRef=${HOME_BRIDGE_REF}\ntransportRef=${LOOPBACK_TRANSPORT_REF}\nrequestRef=${projection.requestRef}\nreceiptRef=${projection.receiptRef}\ncanonicalWriter=${projection.canonicalWriter}\nremoteWriterGranted=false\nrealHomeConnected=false\nrealNetworkConnected=false\n\`\`\`\n\nR6 remains the separately protected real paired Home integration stage.\n`;
}
function renderMainActivity(base) {
  let result = replaceExactlyOnce(
    base,
    'import vexlife.android.presentation.AndroidRemoteVesselSurface\n',
    'import vexlife.android.presentation.AndroidRemoteVesselSurface\nimport vexlife.android.presentation.AndroidHomeLoopbackSurface\n',
    'MainActivity R5 import',
  );
  result = replaceExactlyOnce(
    result,
    '            AndroidRemoteVesselSurface()\n',
    '            AndroidRemoteVesselSurface()\n            AndroidHomeLoopbackSurface()\n',
    'MainActivity R5 surface',
  );
  return result;
}
function renderCanonicalRefs(base) {
  const addition = `\n    const val R5_HOME_LOOPBACK_PROOF_LABEL: String = ${kotlin(PROOF_LABEL)}\n    const val R5_HOME_BRIDGE_REF: String = ${kotlin(HOME_BRIDGE_REF)}\n    const val R5_LOOPBACK_TRANSPORT_REF: String = ${kotlin(LOOPBACK_TRANSPORT_REF)}\n    const val R5_REQUEST_REF: String = ${kotlin(SYNTHETIC_REFS.requestRef)}\n    const val R5_RECEIPT_REF: String = ${kotlin(SYNTHETIC_REFS.receiptRef)}\n    const val R5_PROJECTION_REF: String = ${kotlin(PROJECTION_REF)}\n    const val R5_STATE_REF: String = ${kotlin(OUTPUT_STATE_REF)}\n\n    val homeLoopbackPresentation = SemanticRef("presentation.vexlife.android.r5.home-loopback")\n    val homeLoopbackTitleElement = SemanticRef("element.vexlife.android.r5.home-loopback.title")\n    val homeLoopbackStatusElement = SemanticRef("element.vexlife.android.r5.home-loopback.status")\n`;
  return replaceExactlyOnce(base, '\n}\n', `${addition}}\n`, 'GeneratedCanonicalRefs R5 closing brace');
}
function renderStrings(base, title, status) {
  const addition = `    <string name="r5_home_loopback_title">${xml(title)}</string>\n    <string name="r5_home_loopback_status">${xml(status)}</string>\n`;
  return replaceExactlyOnce(base, '</resources>\n', `${addition}</resources>\n`, 'R5 Android strings');
}
function renderContractKotlin(projection) {
  return `package vexlife.android.home\n\nobject AndroidHomeLoopbackContract {\n    const val PROOF_LABEL: String = ${kotlin(PROOF_LABEL)}\n    const val HOME_BRIDGE_REF: String = ${kotlin(HOME_BRIDGE_REF)}\n    const val TRANSPORT_REF: String = ${kotlin(LOOPBACK_TRANSPORT_REF)}\n    const val REQUEST_REF: String = ${kotlin(projection.requestRef)}\n    const val RECEIPT_REF: String = ${kotlin(projection.receiptRef)}\n    const val PROJECTION_REF: String = ${kotlin(PROJECTION_REF)}\n    const val STATE_REF: String = ${kotlin(OUTPUT_STATE_REF)}\n    const val CANONICAL_WRITER: String = ${kotlin(projection.canonicalWriter)}\n    const val REMOTE_WRITER_GRANTED: Boolean = false\n    const val SYNTHETIC_FIXTURE: Boolean = true\n    const val REAL_HOME_CONNECTED: Boolean = false\n    const val REAL_NETWORK_CONNECTED: Boolean = false\n    const val HOME_WRITER_GRANTED: Boolean = false\n    const val RAW_MODEL_ENDPOINT_EXPOSED: Boolean = false\n}\n`;
}
function renderSurfaceKotlin() {
  return `package vexlife.android.presentation\n\nimport androidx.compose.foundation.layout.Arrangement\nimport androidx.compose.foundation.layout.Column\nimport androidx.compose.material3.MaterialTheme\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.platform.testTag\nimport androidx.compose.ui.res.stringResource\nimport androidx.compose.ui.unit.dp\nimport vexlife.android.app.R\nimport vexlife.android.identity.GeneratedCanonicalRefs\n\n@Composable\nfun AndroidHomeLoopbackSurface() {\n    Column(\n        verticalArrangement = Arrangement.spacedBy(4.dp),\n        modifier = Modifier.testTag(GeneratedCanonicalRefs.homeLoopbackPresentation.value),\n    ) {\n        Text(\n            text = stringResource(R.string.r5_home_loopback_title),\n            style = MaterialTheme.typography.titleMedium,\n            modifier = Modifier.testTag(GeneratedCanonicalRefs.homeLoopbackTitleElement.value),\n        )\n        Text(\n            text = stringResource(R.string.r5_home_loopback_status),\n            style = MaterialTheme.typography.bodyMedium,\n            modifier = Modifier.testTag(GeneratedCanonicalRefs.homeLoopbackStatusElement.value),\n        )\n    }\n}\n`;
}
function renderKotlinTest() {
  return `package vexlife.android.app\n\nimport org.junit.Assert.assertEquals\nimport org.junit.Assert.assertFalse\nimport org.junit.Assert.assertTrue\nimport org.junit.Test\nimport vexlife.android.home.AndroidHomeLoopbackContract\nimport vexlife.android.identity.GeneratedCanonicalRefs\n\nclass R5HomeLoopbackContractTest {\n    @Test fun syntheticLoopbackProjectionCannotBecomeRealHomeTruth() {\n        assertEquals("SYNTHETIC / LOOPBACK", AndroidHomeLoopbackContract.PROOF_LABEL)\n        assertEquals("bridge.vexlife.personal-home.001", AndroidHomeLoopbackContract.HOME_BRIDGE_REF)\n        assertEquals("transport.vexlife.loopback", AndroidHomeLoopbackContract.TRANSPORT_REF)\n        assertEquals(AndroidHomeLoopbackContract.REQUEST_REF, GeneratedCanonicalRefs.R5_REQUEST_REF)\n        assertEquals(AndroidHomeLoopbackContract.RECEIPT_REF, GeneratedCanonicalRefs.R5_RECEIPT_REF)\n        assertTrue(AndroidHomeLoopbackContract.SYNTHETIC_FIXTURE)\n        assertFalse(AndroidHomeLoopbackContract.REMOTE_WRITER_GRANTED)\n        assertFalse(AndroidHomeLoopbackContract.REAL_HOME_CONNECTED)\n        assertFalse(AndroidHomeLoopbackContract.REAL_NETWORK_CONNECTED)\n        assertFalse(AndroidHomeLoopbackContract.HOME_WRITER_GRANTED)\n        assertFalse(AndroidHomeLoopbackContract.RAW_MODEL_ENDPOINT_EXPOSED)\n    }\n}\n`;
}

export function renderAndroidR5Outputs({ homeBridgeRegistry, baseFiles } = {}) {
  const sourceBinding = validateHomeBridgeRegistry(homeBridgeRegistry);
  if (!baseFiles || typeof baseFiles !== 'object') throw new TypeError('baseFiles are required');
  const evaluation = evaluateSyntheticHomeLoopback({ homeBridgeRegistry });
  if (evaluation.admission.state !== 'REMOTE_REQUEST_ADMITTED' || !evaluation.projection) throw new Error('canonical synthetic R5 fixture was not admitted');
  const projection = evaluation.projection;
  const requiredBase = [
    'platform/android/README.md',
    'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt',
    'platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt',
    'platform/android/app/src/main/res/values/vexlife_r2.xml',
    'platform/android/app/src/main/res/values-ja/vexlife_r2.xml',
    'platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml',
  ];
  for (const path of requiredBase) if (typeof baseFiles[path] !== 'string') throw new Error(`missing R4 base file ${path}`);
  const files = {
    'platform/android/README.md': renderReadme(baseFiles['platform/android/README.md'], projection),
    'platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt': renderMainActivity(baseFiles['platform/android/app/src/main/kotlin/vexlife/android/app/MainActivity.kt']),
    'platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt': renderCanonicalRefs(baseFiles['platform/android/app/src/main/kotlin/vexlife/android/identity/GeneratedCanonicalRefs.kt']),
    'platform/android/app/src/main/kotlin/vexlife/android/home/AndroidHomeLoopbackContract.kt': renderContractKotlin(projection),
    'platform/android/app/src/main/kotlin/vexlife/android/presentation/AndroidHomeLoopbackSurface.kt': renderSurfaceKotlin(),
    'platform/android/app/src/test/kotlin/vexlife/android/app/R5HomeLoopbackContractTest.kt': renderKotlinTest(),
    'platform/android/app/src/main/res/values/vexlife_r2.xml': renderStrings(baseFiles['platform/android/app/src/main/res/values/vexlife_r2.xml'], 'Synthetic Home loopback', 'SYNTHETIC / LOOPBACK — no real Home connection'),
    'platform/android/app/src/main/res/values-ja/vexlife_r2.xml': renderStrings(baseFiles['platform/android/app/src/main/res/values-ja/vexlife_r2.xml'], 'Synthetic Home ループバック', 'SYNTHETIC / LOOPBACK — 実 Home 接続ではありません'),
    'platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml': renderStrings(baseFiles['platform/android/app/src/main/res/values-zh-rCN/vexlife_r2.xml'], 'Synthetic Home 回环', 'SYNTHETIC / LOOPBACK — 非真实 Home 连接'),
  };
  const paths = Object.keys(files).sort();
  if (JSON.stringify(paths) !== JSON.stringify([...ANDROID_R5_OUTPUT_PATHS].sort())) throw new Error('R5 output path set drift');
  const inventory = paths.map((path) => ({ path, bytes: Buffer.byteLength(files[path], 'utf8'), sha256: sha256(files[path]) }));
  const semanticCore = {
    schemaVersion: ANDROID_R5_HOME_LOOPBACK_SCHEMA,
    stage: ANDROID_R5_HOME_LOOPBACK_STAGE,
    sourceBinding,
    projection,
    outputInventory: inventory,
  };
  return deepFreeze({
    ...semanticCore,
    files,
    inventory,
    semanticFingerprint: semanticFingerprint(semanticCore),
    newPaths: [...ANDROID_R5_NEW_GENERATED_PATHS],
    effects: { ...EFFECTS },
  });
}

// [VXG RealForever]
