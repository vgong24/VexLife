import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';
import {
  BROWSER_RELATIONSHIPS_RUNTIME_API_PATH,
  BrowserRelationshipsRuntimeBridgeError
} from '../src/core/browser-relationships-runtime-bridge.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function fakeCompanion() {
  return {
    status: () => Object.freeze({ state: 'UNAVAILABLE' }),
    performTurn: async () => { throw new Error('companion route must not execute during Relationships runtime proof'); }
  };
}

function admitted() {
  return {
    alphaConsentAcknowledged: true,
    invitationState: 'RECEIVED_VERIFIED_REFERENCE',
    invitationDecision: 'ACCEPT',
    identityState: 'VERIFIED_CURRENT',
    presenceClass: 'APP_ON_MODEL_UNLOADED',
    routeClass: 'DIRECT_CANDIDATE',
    failureState: 'NONE',
    withdrawn: false,
    revoked: false,
    disconnected: false,
    blocked: false,
    localRelationshipFormed: true
  };
}

function hostBindingResult() {
  return Object.freeze({
    schemaVersion: 'vexlife.relationships-runtime-bridge-plan/v1',
    state: 'HOST_BINDING_REQUIRED',
    truthClass: 'CURRENT_PRODUCT_TO_ACCEPTED_CDR_BRIDGE_PLAN',
    reasons: [],
    requiredHostRoles: [
      { platformRole: 'MAC_LISTENER', runtimeRole: 'LISTENER' },
      { platformRole: 'WINDOWS_CONNECTOR', runtimeRole: 'CONNECTOR' }
    ],
    hostExecutionDeferred: true,
    semanticAcknowledged: false,
    effects: {
      networkEffectPerformed: false,
      hostExecutionPerformed: false,
      relationshipMutationPerformed: false,
      canonicalRelationshipPersisted: false
    }
  });
}

test('Relationships runtime route forwards only the admitted browser snapshot to the injected no-effect bridge', async () => {
  let calls = 0;
  let observed = null;
  const result = hostBindingResult();
  await withServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    relationshipsRuntimeBridge: {
      prepare(input) {
        calls += 1;
        observed = structuredClone(input);
        return result;
      }
    }
  }, async (baseUrl) => {
    const input = admitted();
    const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_RUNTIME_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), result);
    assert.deepEqual(observed, input);
  });
  assert.equal(calls, 1);
});

test('Relationships runtime route enforces method, content type, malformed JSON and body bound before bridge execution', async () => {
  let calls = 0;
  await withServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    relationshipsRuntimeBridge: {
      prepare() { calls += 1; return hostBindingResult(); }
    }
  }, async (baseUrl) => {
    const get = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_RUNTIME_API_PATH}`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');

    const wrongType = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_RUNTIME_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}'
    });
    assert.equal(wrongType.status, 415);
    const wrongTypePayload = await wrongType.json();
    assert.equal(wrongTypePayload.failureCode, 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
    assert.equal(wrongTypePayload.message, 'Relationships runtime request must use application/json');

    const malformed = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_RUNTIME_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    assert.equal(malformed.status, 400);
    const malformedPayload = await malformed.json();
    assert.equal(malformedPayload.failureCode, 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
    assert.equal(malformedPayload.message, 'Relationships runtime request body is not valid JSON');

    const oversized = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_RUNTIME_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...admitted(), padding: 'x'.repeat(20 * 1024) })
    });
    assert.equal(oversized.status, 413);
    const oversizedPayload = await oversized.json();
    assert.equal(oversizedPayload.failureCode, 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
    assert.equal(oversizedPayload.message, 'Relationships runtime request exceeds the bounded body size');
  });
  assert.equal(calls, 0);
});

test('typed bridge rejection stays fail-closed and does not expose internal cause details', async () => {
  await withServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    relationshipsRuntimeBridge: {
      prepare() {
        throw new BrowserRelationshipsRuntimeBridgeError(
          'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED',
          'Current product truth is not admitted for runtime-plan formation',
          400,
          'private internal detail must never cross the route'
        );
      }
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_RUNTIME_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(admitted())
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.failureCode, 'RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED');
    assert.equal(payload.message, 'Current product truth is not admitted for runtime-plan formation');
    assert.equal(JSON.stringify(payload).includes('private internal detail'), false);
    assert.equal(Object.values(payload.effects).every((value) => value === false), true);
  });
});

test('unknown bridge failure is normalized to one safe 500 response with no implied runtime effect', async () => {
  await withServer({
    staticRoot: repoRoot,
    companionBridge: fakeCompanion(),
    relationshipsRuntimeBridge: {
      prepare() { throw new Error('ambient implementation detail'); }
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_RUNTIME_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(admitted())
    });
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.failureCode, 'RELATIONSHIPS_RUNTIME_PLAN_FAILED');
    assert.equal(payload.message, 'Relationships runtime plan failed safely');
    assert.equal(JSON.stringify(payload).includes('ambient implementation detail'), false);
    assert.equal(payload.effects.networkEffectPerformed, false);
    assert.equal(payload.effects.hostExecutionPerformed, false);
    assert.equal(payload.effects.relationshipMutationPerformed, false);
  });
});

// [VXG RealForever]
