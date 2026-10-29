import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MAC_COMPANION_AVAILABILITY_URL,
  validateMacCompanionAvailability,
  waitForMacCompanionReady
} from '../scripts/macos-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lifecycleSource = fs.readFileSync(path.join(ROOT, 'scripts', 'macos-lifecycle.mjs'), 'utf8');

function availability(
  availabilityState,
  {
    recoveryClass = availabilityState === 'READY' ? 'NONE_REQUIRED' : 'RETRY_IN_PROGRESS',
    reasonCode = availabilityState === 'READY' ? 'EXACT_RUNTIME_READY' : 'EXACT_RUNTIME_STARTING'
  } = {}
) {
  return {
    schemaVersion: 'vexlife.companion-availability/v1',
    truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
    registryRef: 'registry.vexlife.companion-availability-reentry.001',
    bindingRef: 'binding.vexlife.test',
    homeRef: 'home.vexlife.test',
    companionLineageRef: 'companion.vexlife.test',
    modelRefOrNull: 'model.vexlife.test',
    generationRefOrNull: null,
    runtimeAdapterRef: 'runtime-adapter.vexlife.test',
    runtimeObservationRef: 'runtime-observation.vexlife.test',
    availabilityState,
    recoveryClass,
    reasonCode,
    bindingState: 'BOUND',
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: availabilityState === 'READY' ? 'HEALTHY' : 'STARTING',
    qualificationState: availabilityState === 'READY' ? 'CURRENT' : 'NOT_APPLICABLE',
    sourceRefs: ['source.vexlife.test'],
    effectAuthorityGranted: false,
    rendererAuthorityGranted: false,
    modelIdentityAuthorityGranted: false,
    processAuthorityGranted: false,
    conversationAuthorityGranted: false,
    projectionRef: 'projection.vexlife.companion-availability.test',
    projectionSha256: 'a'.repeat(64)
  };
}

function response(value) {
  return {
    ok: true,
    status: 200,
    async json() { return value; }
  };
}

test('Mac Open Vex completes only after the canonical Companion projection reaches READY', async () => {
  const observed = [
    availability('STARTING'),
    availability('READY')
  ];
  const calls = [];
  const result = await waitForMacCompanionReady({
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options?.method ?? null, cache: options?.cache ?? null });
      return response(observed.shift());
    },
    maxAttempts: 2,
    intervalMs: 0,
    sleep: async () => {}
  });

  assert.equal(result.state, 'READY');
  assert.equal(result.attempt, 2);
  assert.equal(result.availability.availabilityState, 'READY');
  assert.deepEqual(
    calls.map((entry) => [entry.url, entry.method, entry.cache]),
    [
      [MAC_COMPANION_AVAILABILITY_URL, 'GET', 'no-store'],
      [MAC_COMPANION_AVAILABILITY_URL, 'GET', 'no-store']
    ]
  );
});

test('Mac Open Vex fails closed when the browser answers but Companion is semantically unavailable', async () => {
  const unavailable = availability('UNAVAILABLE', {
    recoveryClass: 'REPAIR_REQUIRED',
    reasonCode: 'SAFE_REENTRY_NOT_AVAILABLE'
  });
  unavailable.runtimeState = 'UNREACHABLE';
  unavailable.qualificationState = 'STALE';

  let calls = 0;
  await assert.rejects(
    () => waitForMacCompanionReady({
      fetchImpl: async () => {
        calls += 1;
        return response(unavailable);
      },
      maxAttempts: 20,
      intervalMs: 0,
      sleep: async () => {}
    }),
    /Mac Open Vex Companion is not READY: UNAVAILABLE\/REPAIR_REQUIRED\/SAFE_REENTRY_NOT_AVAILABLE/
  );
  assert.equal(calls, 1);
});

test('Mac Open Vex rejects a non-canonical availability projection', () => {
  assert.throws(
    () => validateMacCompanionAvailability({
      schemaVersion: 'vexlife.companion-availability/v1',
      truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
      availabilityState: 'READY'
    }),
    /Mac Open Vex Companion availability is missing projectionRef/
  );
});

test('Mac Open Vex requires the same canonical availability evidence fields as the browser consumer', () => {
  const invalidDigest = availability('READY');
  invalidDigest.projectionSha256 = 'not-a-sha256';
  assert.throws(
    () => validateMacCompanionAvailability(invalidDigest),
    /projectionSha256 is invalid/
  );

  const duplicateSources = availability('READY');
  duplicateSources.sourceRefs = ['source.vexlife.test', 'source.vexlife.test'];
  assert.throws(
    () => validateMacCompanionAvailability(duplicateSources),
    /sourceRefs are invalid/
  );

  const invalidModelRef = availability('READY');
  invalidModelRef.modelRefOrNull = '';
  assert.throws(
    () => validateMacCompanionAvailability(invalidModelRef),
    /modelRefOrNull must be null or one ref/
  );

  const missingRegistry = availability('READY');
  delete missingRegistry.registryRef;
  assert.throws(
    () => validateMacCompanionAvailability(missingRegistry),
    /availability is missing registryRef/
  );
});

test('runStart does not claim lifecycle completion before semantic Companion readiness', () => {
  assert.match(
    lifecycleSource,
    /const browser = await startBrowser\(home, repo, initialized, \{ forceCurrentBrowserRebind \}\);[\s\S]*?const companionAvailability = await waitForMacCompanionReady\(\);[\s\S]*?return \{ initialized, browser, companionAvailability \};/
  );
  assert.doesNotMatch(
    lifecycleSource,
    /const browser = await startBrowser\(home, repo, initialized, \{ forceCurrentBrowserRebind \}\);\s*return \{ initialized, browser \};/
  );
});

// [VXG RealForever]
