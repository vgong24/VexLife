import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formVr07StaticProof,
  validateVr07Matrix
} from '../scripts/vex-reboot-cross-platform-proof.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const matrix = () => structuredClone(read('test/fixtures/vex-reboot/vr07-cross-platform-current-model-matrix.json'));
const profiles = () => structuredClone(read('blueprint/vex-operational-profiles.json'));

test('VR07 exact current matrix validates against accepted G0 profiles', () => {
  const value = validateVr07Matrix(matrix(), profiles());
  assert.deepEqual(value.supportedRealHostCellRefs, ['P0_G0_WINDOWS', 'P1_G0_MACOS', 'P2_M4_MACOS']);
  assert.deepEqual(value.notApplicableCellRefs, ['P3_M4_WINDOWS']);
});

test('VR07 Windows G0 cell binds the exact release-qualified runtime and request model', () => {
  const next = matrix();
  next.cells.find((cell) => cell.cellRef === 'P0_G0_WINDOWS').runtimeRef = 'runtime.foreign';
  assert.throws(() => validateVr07Matrix(next, profiles()), /P0 runtime mismatch/);
});

test('VR07 macOS G0 cell binds the exact release-qualified runtime and request model', () => {
  const next = matrix();
  next.cells.find((cell) => cell.cellRef === 'P1_G0_MACOS').requestModel = 'foreign-model';
  assert.throws(() => validateVr07Matrix(next, profiles()), /P1 request model mismatch/);
});

test('VR07 G0 proof requires release-qualified accepted profiles', () => {
  const nextProfiles = profiles();
  nextProfiles.profiles.find((profile) => profile.platform === 'win32').state = 'CANDIDATE';
  assert.throws(() => validateVr07Matrix(matrix(), nextProfiles), /P0 profile state mismatch/);
});

test('VR07 M4 macOS cell preserves #595/#636 and exact MLX runtime identity', () => {
  const next = matrix();
  const cell = next.cells.find((item) => item.cellRef === 'P2_M4_MACOS');
  cell.runtimeAdapterRef = 'adapter.runtime.foreign';
  assert.throws(() => validateVr07Matrix(next, profiles()), /P2 runtime adapter mismatch/);
});

test('VR07 M4 macOS owner currentness remains external rather than self-certified', () => {
  const next = matrix();
  next.cells.find((cell) => cell.cellRef === 'P2_M4_MACOS').ownerCurrentness = 'CURRENT';
  assert.throws(() => validateVr07Matrix(next, profiles()), /P2 owner currentness mismatch/);
});

test('VR07 does not invent an activated-M4 Windows owner', () => {
  const next = matrix();
  const cell = next.cells.find((item) => item.cellRef === 'P3_M4_WINDOWS');
  cell.state = 'SUPPORTED_CURRENT_SOURCE';
  assert.throws(() => validateVr07Matrix(next, profiles()), /P3 state mismatch/);
});

test('VR07 forbids G0 fallback for the unsupported M4 Windows cell', () => {
  const next = matrix();
  next.cells.find((cell) => cell.cellRef === 'P3_M4_WINDOWS').fallbackToOtherModelAllowed = true;
  assert.throws(() => validateVr07Matrix(next, profiles()), /P3 fallback mismatch/);
});

test('VR07 rejects duplicate or substituted proof cells', () => {
  const next = matrix();
  next.cells[3] = structuredClone(next.cells[2]);
  assert.throws(() => validateVr07Matrix(next, profiles()), /cell identity mismatch/);
});

test('VR07 requires the same-binding recovery invariants for all future real-host cells', () => {
  const next = matrix();
  next.requiredInvariants = next.requiredInvariants.filter((item) => item !== 'NO_FALLBACK_MODEL_OR_GENERATION');
  assert.throws(() => validateVr07Matrix(next, profiles()), /required invariants incomplete/);
});

test('VR07 preserves supported-variant != required Cartesian-product law', () => {
  const next = matrix();
  next.nonCollapseLaws = next.nonCollapseLaws.filter((item) => item !== 'SUPPORTED_VARIANT != REQUIRED_CARTESIAN_PRODUCT');
  assert.throws(() => validateVr07Matrix(next, profiles()), /non-collapse law missing/);
});

test('VR07 static proof performs no runtime/platform/model/Home effects', () => {
  const receipt = formVr07StaticProof({ matrix: matrix(), operationalProfiles: profiles() });
  assert.equal(receipt.state, 'PASS');
  assert.deepEqual(receipt.realHostCellsExecuted, []);
  assert.deepEqual(receipt.realHostCellsPending, ['P0_G0_WINDOWS', 'P1_G0_MACOS', 'P2_M4_MACOS']);
  assert.equal(receipt.windowsM4Disposition, 'NOT_APPLICABLE_NOT_PROVEN');
  assert.equal(receipt.fallbackToG0ForWindowsM4, false);
  assert.equal(receipt.externalEffectsExecuted, false);
  assert.equal(receipt.runtimeStartStopPerformed, false);
  assert.equal(receipt.modelLoadInferPerformed, false);
  assert.equal(receipt.platformLifecycleMutationPerformed, false);
  assert.equal(receipt.modelIdentityMutationPerformed, false);
  assert.equal(receipt.homeMemoryMutationPerformed, false);
  assert.equal(receipt.featureTerminalClaimed, false);
});

// [VXG RealForever]
