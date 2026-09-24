#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VR07_MATRIX_SCHEMA = 'vexlife.vex-reboot-cross-platform-current-model-matrix/v1';
export const VR07_RECEIPT_SCHEMA = 'vexlife.vex-reboot-cross-platform-proof/v1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXACT_CELLS = Object.freeze(['P0_G0_WINDOWS', 'P1_G0_MACOS', 'P2_M4_MACOS', 'P3_M4_WINDOWS']);
const REQUIRED_INVARIANTS = Object.freeze([
  'PRESERVE_EXACT_HOME',
  'PRESERVE_COMPANION_LINEAGE',
  'PRESERVE_MODEL_AND_GENERATION_BINDING',
  'INITIAL_READY_REQUIRES_CURRENT_OWNED_QUALIFIED_RUNTIME',
  'CONTROLLED_UNAVAILABLE_PRECEDES_RECOVERY',
  'CANONICAL_RECOVERABLE_PRECEDES_REQUEST',
  'ONE_EXACT_DELEGATED_RECOVERY_REQUEST',
  'RIGHTFUL_PLATFORM_OWNER_PERFORMS_EFFECT',
  'FRESH_OWNED_QUALIFIED_OBSERVATION_PRECEDES_READY',
  'ONE_REAL_COMPANION_TURN_AFTER_RECOVERY',
  'NO_ORPHAN_DUPLICATE_OR_FOREIGN_PROCESS',
  'NO_FALLBACK_MODEL_OR_GENERATION'
]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fail(message) {
  throw new Error(message);
}
function exact(value, expected, label) {
  if (value !== expected) fail(`${label} mismatch`);
}
function profileByRef(registry, ref) {
  const profiles = Array.isArray(registry?.profiles) ? registry.profiles : [];
  const found = profiles.find((profile) => profile?.profileRef === ref);
  if (!found) fail(`profile missing: ${ref}`);
  return found;
}
function cellByRef(matrix, ref) {
  const cells = Array.isArray(matrix?.cells) ? matrix.cells : [];
  const found = cells.find((cell) => cell?.cellRef === ref);
  if (!found) fail(`cell missing: ${ref}`);
  return found;
}

export function validateVr07Matrix(matrix, operationalProfiles) {
  if (!object(matrix) || matrix.schemaVersion !== VR07_MATRIX_SCHEMA) fail('VR07 matrix schema mismatch');
  if (!Array.isArray(matrix.cells) || matrix.cells.length !== EXACT_CELLS.length) fail('VR07 exact four-cell matrix required');
  const refs = matrix.cells.map((cell) => cell?.cellRef);
  if (new Set(refs).size !== refs.length || EXACT_CELLS.some((ref) => !refs.includes(ref))) fail('VR07 cell identity mismatch');
  if (!Array.isArray(matrix.requiredInvariants) || REQUIRED_INVARIANTS.some((rule) => !matrix.requiredInvariants.includes(rule))) {
    fail('VR07 required invariants incomplete');
  }
  for (const law of [
    'SUPPORTED_VARIANT != REQUIRED_CARTESIAN_PRODUCT',
    'M4_WINDOWS_NOT_CURRENTLY_OWNED != G0_FALLBACK_ALLOWED',
    'STATIC_PROFILE_VALIDATION != REAL_HOST_RECOVERY_PROOF',
    'PROOF_MATRIX != RUNTIME_EFFECT_AUTHORITY'
  ]) {
    if (!matrix.nonCollapseLaws?.includes(law)) fail(`VR07 non-collapse law missing: ${law}`);
  }

  const windows = cellByRef(matrix, 'P0_G0_WINDOWS');
  const windowsProfile = profileByRef(operationalProfiles, windows.profileRef);
  exact(windows.modelClass, 'G0_RELEASE_QUALIFIED', 'P0 modelClass');
  exact(windows.platform, 'win32', 'P0 platform');
  exact(windows.architecture, 'x64', 'P0 architecture');
  exact(windows.state, 'SUPPORTED_CURRENT_SOURCE', 'P0 state');
  exact(windows.proofClass, 'REAL_HOST_REQUIRED', 'P0 proofClass');
  exact(windows.realHostEvidenceRequired, true, 'P0 realHostEvidenceRequired');
  exact(windows.fallbackToOtherModelAllowed, false, 'P0 fallback');
  exact(windowsProfile.state, 'RELEASE_QUALIFIED', 'P0 profile state');
  exact(windowsProfile.platform, windows.platform, 'P0 profile platform');
  exact(windowsProfile.architecture, windows.architecture, 'P0 profile architecture');
  exact(windowsProfile.runtime?.dependencyRef, windows.runtimeRef, 'P0 runtime');
  exact(windowsProfile.endpoint?.origin, windows.endpointOrigin, 'P0 endpoint');
  exact(windowsProfile.endpoint?.requestModel, windows.requestModel, 'P0 request model');

  const mac = cellByRef(matrix, 'P1_G0_MACOS');
  const macProfile = profileByRef(operationalProfiles, mac.profileRef);
  exact(mac.modelClass, 'G0_RELEASE_QUALIFIED', 'P1 modelClass');
  exact(mac.platform, 'darwin', 'P1 platform');
  exact(mac.architecture, 'arm64', 'P1 architecture');
  exact(mac.state, 'SUPPORTED_CURRENT_SOURCE', 'P1 state');
  exact(mac.proofClass, 'REAL_HOST_REQUIRED', 'P1 proofClass');
  exact(mac.realHostEvidenceRequired, true, 'P1 realHostEvidenceRequired');
  exact(mac.fallbackToOtherModelAllowed, false, 'P1 fallback');
  exact(macProfile.state, 'RELEASE_QUALIFIED', 'P1 profile state');
  exact(macProfile.platform, mac.platform, 'P1 profile platform');
  exact(macProfile.architecture, mac.architecture, 'P1 profile architecture');
  exact(macProfile.runtime?.dependencyRef, mac.runtimeRef, 'P1 runtime');
  exact(macProfile.endpoint?.origin, mac.endpointOrigin, 'P1 endpoint');
  exact(macProfile.endpoint?.requestModel, mac.requestModel, 'P1 request model');

  const m4Mac = cellByRef(matrix, 'P2_M4_MACOS');
  exact(m4Mac.modelClass, 'ACTIVATED_CULTIVATED_M4', 'P2 modelClass');
  exact(m4Mac.platform, 'darwin', 'P2 platform');
  exact(m4Mac.architecture, 'arm64', 'P2 architecture');
  exact(m4Mac.state, 'CURRENT_OWNER_PATH', 'P2 state');
  exact(m4Mac.proofClass, 'REAL_HOST_REQUIRED', 'P2 proofClass');
  exact(m4Mac.bindingOwnerRef, 'github.issue.vexlife.595', 'P2 binding owner');
  exact(m4Mac.runtimeOwnerRef, 'github.issue.vextreme-sdk.636', 'P2 runtime owner');
  exact(m4Mac.runtimeAdapterRef, 'adapter.runtime.mlx.macos-victor.001', 'P2 runtime adapter');
  exact(m4Mac.runtimeClass, 'MLX_LM_DIRECT_RUNTIME', 'P2 runtime class');
  exact(m4Mac.ownerCurrentness, 'EXTERNAL_REQUIRED', 'P2 owner currentness');
  exact(m4Mac.realHostEvidenceRequired, true, 'P2 realHostEvidenceRequired');
  exact(m4Mac.fallbackToOtherModelAllowed, false, 'P2 fallback');

  const m4Windows = cellByRef(matrix, 'P3_M4_WINDOWS');
  exact(m4Windows.modelClass, 'ACTIVATED_CULTIVATED_M4', 'P3 modelClass');
  exact(m4Windows.platform, 'win32', 'P3 platform');
  exact(m4Windows.state, 'NOT_APPLICABLE_NOT_PROVEN', 'P3 state');
  exact(m4Windows.proofClass, 'NOT_APPLICABLE', 'P3 proofClass');
  exact(m4Windows.bindingOwnerRef, null, 'P3 binding owner');
  exact(m4Windows.runtimeOwnerRef, null, 'P3 runtime owner');
  exact(m4Windows.runtimeAdapterRef, null, 'P3 runtime adapter');
  exact(m4Windows.realHostEvidenceRequired, false, 'P3 realHostEvidenceRequired');
  exact(m4Windows.fallbackToOtherModelAllowed, false, 'P3 fallback');

  return Object.freeze({
    cells: Object.freeze(EXACT_CELLS.map((ref) => Object.freeze({ ...cellByRef(matrix, ref) }))),
    supportedRealHostCellRefs: Object.freeze(['P0_G0_WINDOWS', 'P1_G0_MACOS', 'P2_M4_MACOS']),
    notApplicableCellRefs: Object.freeze(['P3_M4_WINDOWS'])
  });
}

export function formVr07StaticProof({ matrix, operationalProfiles }) {
  const validated = validateVr07Matrix(matrix, operationalProfiles);
  return Object.freeze({
    schemaVersion: VR07_RECEIPT_SCHEMA,
    state: 'PASS',
    truthClass: 'STATIC_OWNER_AND_PROFILE_PROOF_ONLY',
    matrixRef: matrix.matrixRef,
    operationalProfileRegistryRef: operationalProfiles.registryRef,
    supportedRealHostCellRefs: validated.supportedRealHostCellRefs,
    notApplicableCellRefs: validated.notApplicableCellRefs,
    realHostCellsExecuted: Object.freeze([]),
    realHostCellsPending: validated.supportedRealHostCellRefs,
    windowsM4Disposition: 'NOT_APPLICABLE_NOT_PROVEN',
    fallbackToG0ForWindowsM4: false,
    externalEffectsExecuted: false,
    runtimeStartStopPerformed: false,
    modelLoadInferPerformed: false,
    platformLifecycleMutationPerformed: false,
    modelIdentityMutationPerformed: false,
    homeMemoryMutationPerformed: false,
    featureTerminalClaimed: false
  });
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const receipt = formVr07StaticProof({
    matrix: readJson('test/fixtures/vex-reboot/vr07-cross-platform-current-model-matrix.json'),
    operationalProfiles: readJson('blueprint/vex-operational-profiles.json')
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

// [VXG RealForever]
