import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROWSER_COMPANION_AVAILABILITY_PATH,
  createVexLifeBrowserServer
} from '../scripts/serve-browser.mjs';
import { BROWSER_COMPANION_STATUS_PATH } from '../src/core/browser-companion-bridge.mjs';

async function withServer(options, run) {
  const server = createVexLifeBrowserServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function binding(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-binding-input/v1',
    truthClass: 'FOREIGN_CANONICAL_COMPANION_BINDING',
    bindingRef: 'binding.availability-http',
    homeRef: 'home.availability-http',
    companionLineageRef: 'lineage.availability-http',
    modelRefOrNull: 'model.availability-http',
    generationRefOrNull: 'generation.availability-http',
    bindingState: 'BOUND',
    currentness: 'CURRENT',
    sourceRefs: ['source.binding.availability-http'],
    ...overrides
  };
}

function runtimeObservation(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-runtime-adapter-observation/v1',
    truthClass: 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION',
    observationRef: 'observation.availability-http.healthy',
    adapterRef: 'adapter.runtime.availability-http',
    bindingRef: 'binding.availability-http',
    homeRef: 'home.availability-http',
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: 'HEALTHY',
    qualificationState: 'CURRENT',
    safeReentryState: 'NOT_AVAILABLE',
    currentness: 'CURRENT',
    evidenceRefs: ['evidence.runtime.availability-http'],
    ...overrides
  };
}

function assertNoAuthority(body) {
  assert.equal(body.effectAuthorityGranted, false);
  assert.equal(body.rendererAuthorityGranted, false);
  assert.equal(body.modelIdentityAuthorityGranted, false);
  assert.equal(body.processAuthorityGranted, false);
  assert.equal(body.conversationAuthorityGranted, false);
}

test('availability route composes exact VR01 READY truth from injected foreign evidence', async () => {
  await withServer({
    resolveCompanionBinding: async () => binding(),
    resolveCompanionRuntimeObservation: async () => runtimeObservation()
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.schemaVersion, 'vexlife.companion-availability/v1');
    assert.equal(body.truthClass, 'SOURCE_BOUND_COMPANION_AVAILABILITY');
    assert.equal(body.availabilityState, 'READY');
    assert.equal(body.recoveryClass, 'NONE_REQUIRED');
    assert.equal(body.runtimeState, 'HEALTHY');
    assert.equal(body.qualificationState, 'CURRENT');
    assertNoAuthority(body);
  });
});

test('availability route exposes canonical RECOVERABLE without executing recovery', async () => {
  await withServer({
    resolveCompanionBinding: async () => binding(),
    resolveCompanionRuntimeObservation: async () => runtimeObservation({
      observationRef: 'observation.availability-http.stopped',
      runtimeOwnershipState: 'NO_OWNED_RUNTIME',
      runtimeState: 'STOPPED',
      qualificationState: 'STALE',
      safeReentryState: 'AVAILABLE'
    })
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.availabilityState, 'RECOVERABLE');
    assert.equal(body.recoveryClass, 'SAFE_REENTRY_AVAILABLE');
    assert.equal(body.reasonCode, 'EXACT_SAME_BINDING_REENTRY_AVAILABLE');
    assertNoAuthority(body);
  });
});

test('availability route fails closed when either foreign provider is unavailable', async () => {
  for (const options of [
    {},
    { resolveCompanionBinding: async () => binding() },
    { resolveCompanionRuntimeObservation: async () => runtimeObservation() }
  ]) {
    await withServer(options, async (base) => {
      const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.failureCode, 'COMPANION_AVAILABILITY_PROVIDER_UNAVAILABLE');
      assert.equal(Object.values(body.effects).every((value) => value === false), true);
    });
  }
});

test('availability route rejects malformed evidence without leaking provider detail', async () => {
  await withServer({
    resolveCompanionBinding: async () => ({ ...binding(), schemaVersion: 'foreign.schema' }),
    resolveCompanionRuntimeObservation: async () => runtimeObservation()
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.failureCode, 'COMPANION_AVAILABILITY_NOT_CURRENT');
    assert.equal(Object.values(body.effects).every((value) => value === false), true);
  });

  await withServer({
    resolveCompanionBinding: async () => { throw new Error('private binding path'); },
    resolveCompanionRuntimeObservation: async () => runtimeObservation()
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.failureCode, 'COMPANION_AVAILABILITY_NOT_CURRENT');
    assert.equal(JSON.stringify(body).includes('private binding path'), false);
  });
});

test('foreign runtime identity becomes canonical HELD rather than synthetic READY', async () => {
  await withServer({
    resolveCompanionBinding: async () => binding(),
    resolveCompanionRuntimeObservation: async () => runtimeObservation({
      bindingRef: 'binding.foreign',
      homeRef: 'home.foreign'
    })
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.availabilityState, 'HELD');
    assert.equal(body.recoveryClass, 'BINDING_REVALIDATION_REQUIRED');
    assert.equal(body.reasonCode, 'FOREIGN_IDENTITY_MISMATCH');
    assertNoAuthority(body);
  });
});

test('availability route is GET-only and existing status does not consume availability providers', async () => {
  let bindingCalls = 0;
  let runtimeCalls = 0;
  await withServer({
    resolveCompanionBinding: async () => { bindingCalls += 1; return binding(); },
    resolveCompanionRuntimeObservation: async () => { runtimeCalls += 1; return runtimeObservation(); }
  }, async (base) => {
    const post = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET');
    assert.equal(bindingCalls, 0);
    assert.equal(runtimeCalls, 0);

    const status = await fetch(base + BROWSER_COMPANION_STATUS_PATH);
    assert.equal(status.status, 200);
    assert.equal(bindingCalls, 0);
    assert.equal(runtimeCalls, 0);

    const availability = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(availability.status, 200);
    assert.equal(bindingCalls, 1);
    assert.equal(runtimeCalls, 1);
  });
});

// [VXG RealForever]
