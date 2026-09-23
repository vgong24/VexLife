import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROWSER_COMPANION_RECOVERY_PATH,
  BrowserCompanionBridgeError,
  createBrowserCompanionBridge
} from '../src/core/browser-companion-bridge.mjs';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

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

function request(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-recovery-request/v1',
    truthClass: 'SAME_BINDING_RECOVERY_REQUEST',
    contractRef: 'contract.vexlife.companion-recovery-effect.001',
    actionRef: 'action.companion.reenter-current-binding',
    availabilityProjectionRef: 'projection.vexlife.companion-availability.abc123',
    reentryPlanRef: 'plan.vexlife.companion-reentry.abc123',
    idempotencyKey: `companion-reentry:${'a'.repeat(64)}`,
    bindingRef: 'binding.vr03',
    homeRef: 'home.vr03',
    companionLineageRef: 'lineage.vr03',
    modelRefOrNull: 'model.vr03',
    generationRefOrNull: 'generation.vr03',
    runtimeAdapterRef: 'adapter.runtime.vr03',
    runtimeObservationRef: 'observation.vr03.pre',
    effectAuthorityGranted: false,
    executionDisposition: 'DELEGATE_TO_RIGHTFUL_RUNTIME_ADAPTER',
    requestRef: `request.vexlife.companion-recovery.${'b'.repeat(32)}`,
    requestSha256: 'c'.repeat(64),
    ...overrides
  };
}

function ownerReceipt(input, overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-recovery-owner-receipt/v1',
    truthClass: 'FOREIGN_RIGHTFUL_RUNTIME_OWNER_RECEIPT',
    requestRef: input.requestRef,
    reentryPlanRef: input.reentryPlanRef,
    bindingRef: input.bindingRef,
    homeRef: input.homeRef,
    companionLineageRef: input.companionLineageRef,
    modelRefOrNull: input.modelRefOrNull,
    generationRefOrNull: input.generationRefOrNull,
    runtimeAdapterRef: input.runtimeAdapterRef,
    effectOwnerRef: 'owner.runtime.vr03',
    effectReceiptRef: 'receipt.runtime.vr03',
    sourceRefs: ['source.runtime.vr03'],
    disposition: 'PERFORMED_SAME_BINDING_REENTRY',
    postRecoveryObservationRequired: true,
    proofClass: 'REAL_HOST',
    ...overrides
  };
}

function fakeCompanion(recover) {
  return createBrowserCompanionBridge({
    endpoint: null,
    model: null,
    recoveryOwner: recover ? { recover } : null
  });
}

test('VR03 route forwards one exact admitted recovery request to the injected rightful owner', async () => {
  const calls = [];
  await withServer({
    companionBridge: fakeCompanion(async (input) => {
      calls.push(structuredClone(input));
      return ownerReceipt(input);
    })
  }, async (base) => {
    const input = request();
    const response = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), ownerReceipt(input));
    assert.deepEqual(calls, [input]);
  });
});

test('VR03 route rejects method, content type, malformed JSON, oversized body and caller authority fields before delegation', async () => {
  let calls = 0;
  await withServer({
    companionBridge: fakeCompanion(async (input) => { calls += 1; return ownerReceipt(input); })
  }, async (base) => {
    const get = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');

    const wrongType = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}'
    });
    assert.equal(wrongType.status, 415);

    const malformed = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });
    assert.equal(malformed.status, 400);

    const oversized = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(20 * 1024) })
    });
    assert.equal(oversized.status, 413);

    const forged = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request(), processId: 123, runtimeEffectAuthority: true })
    });
    assert.equal(forged.status, 400);
    const payload = await forged.json();
    assert.equal(payload.failureCode, 'COMPANION_RECOVERY_REQUEST_NOT_ADMITTED');
  });
  assert.equal(calls, 0);
});

test('VR03 production-default absence of a recovery owner fails closed without implying a runtime effect', async () => {
  await withServer({ companionBridge: fakeCompanion(null) }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request())
    });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.failureCode, 'COMPANION_RECOVERY_OWNER_UNAVAILABLE');
    assert.equal(Object.values(payload.effects).every((value) => value === false), true);
  });
});

test('VR03 rejects foreign or malformed owner results and hides unknown owner implementation details', async () => {
  await withServer({
    companionBridge: fakeCompanion(async (input) => ownerReceipt(input, { homeRef: 'home.foreign' }))
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request())
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).failureCode, 'COMPANION_RECOVERY_OWNER_RESULT_INVALID');
  });

  await withServer({
    companionBridge: fakeCompanion(async () => { throw new Error('private process detail'); })
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request())
    });
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.failureCode, 'COMPANION_RECOVERY_FAILED');
    assert.equal(JSON.stringify(payload).includes('private process detail'), false);
    assert.equal(Object.values(payload.effects).every((value) => value === false), true);
  });
});

test('VR03 recovery result may carry a current VR02 acceptance but never lived acceptance', async () => {
  const input = request();
  const accepted = {
    schemaVersion: 'vexlife.companion-recovery-acceptance/v1',
    truthClass: 'SAME_BINDING_RECOVERY_ACCEPTED_READY',
    requestRef: input.requestRef,
    reentryPlanRef: input.reentryPlanRef,
    bindingRef: input.bindingRef,
    homeRef: input.homeRef,
    companionLineageRef: input.companionLineageRef,
    modelRefOrNull: input.modelRefOrNull,
    generationRefOrNull: input.generationRefOrNull,
    runtimeAdapterRef: input.runtimeAdapterRef,
    effectOwnerRef: 'owner.runtime.vr03',
    ownerEffectReceiptRef: 'receipt.runtime.vr03',
    ownerEffectProofClass: 'REAL_HOST',
    postRecoveryAvailabilityRef: 'projection.vexlife.companion-availability.post',
    postRecoveryRuntimeObservationRef: 'observation.vr03.post',
    availabilityState: 'READY',
    livedEndToEndAccepted: false
  };
  await withServer({
    companionBridge: fakeCompanion(async () => accepted)
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_RECOVERY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.livedEndToEndAccepted, false);
    assert.equal(body.availabilityState, 'READY');
  });
});

test('VR03 existing status/turn bridge surface remains separate from recovery transport', () => {
  const bridge = fakeCompanion(null);
  assert.equal(typeof bridge.status, 'function');
  assert.equal(typeof bridge.performTurn, 'function');
  assert.equal(typeof bridge.performRecovery, 'function');
  assert.equal(bridge.status().state, 'UNBOUND');
});

// [VXG RealForever]
