import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';
import {
  BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA,
  RELATIONSHIPS_INVITATION_EFFECTS_NONE,
  createBrowserRelationshipsInvitationProductBridge,
} from '../src/core/browser-relationships-invitation-product-bridge.mjs';

const REQUEST = Object.freeze({
  schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA,
  operation: 'CREATE_EXPORT',
  requestRef: 'request.relationships.http.export.1',
  transport: 'FILE',
  productContractRef: 'vextreme.vexinterface.invitation-product-request/v1',
  payload: Object.freeze({
    recipientCommunityIdentityRef: 'community.bob',
    recipientUniverseRef: 'universe.bob',
    purposeRef: 'purpose.friend-introduction',
    requestedScopeRefs: Object.freeze(['scope.profile']),
    requestedChannelRefs: Object.freeze(['channel.manual']),
    audienceRefs: Object.freeze(['community.bob']),
    expiresAtMs: 2_000,
  }),
  sourceRefs: Object.freeze(['github.issue.vexlife.485']),
});

function fakeCompanion() {
  return Object.freeze({
    status: () => Object.freeze({ state: 'UNAVAILABLE' }),
    performTurn: async () => { throw new Error('companion route must not execute during invitation-product HTTP proof'); },
  });
}

async function withServer(options, run) {
  const server = createVexLifeBrowserServer({ companionBridge: fakeCompanion(), ...options });
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

function exportedResult(request) {
  const bytes = Buffer.from('opaque-public-signed-invitation', 'utf8');
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA,
    operation: request.operation,
    requestRef: request.requestRef,
    state: 'EXPORTED',
    transport: request.transport,
    artifact: Object.freeze({
      artifactSchemaRef: 'artifact.invitation.test.1',
      canonicalPayloadSchemaRef: 'vextreme.cdr.bridge-invitation-signing-payload/v1',
      artifactSha256: createHash('sha256').update(bytes).digest('hex'),
      artifactBytesBase64: bytes.toString('base64'),
      artifactByteLength: bytes.length,
      transport: 'FILE',
      transportProjectionState: 'EXACT_FILE_BYTES_READY',
    }),
    evidence: Object.freeze({ productEvidenceRef: 'evidence.synthetic.product.http.1' }),
    failureCode: null,
    syntheticAdapter: true,
    sourceRefs: Object.freeze(['github.issue.vexlife.485']),
    effects: RELATIONSHIPS_INVITATION_EFFECTS_NONE,
  });
}

test('invitation product route forwards one bounded same-origin request to the injected bridge', async () => {
  const observed = [];
  await withServer({
    relationshipsInvitationProductBridge: Object.freeze({
      async execute(input) {
        observed.push(structuredClone(input));
        return exportedResult(input);
      },
    }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(REQUEST),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(observed, [structuredClone(REQUEST)]);
    const payload = await response.json();
    assert.equal(payload.state, 'EXPORTED');
    assert.equal(payload.syntheticAdapter, true);
    assert.deepEqual(payload.effects, RELATIONSHIPS_INVITATION_EFFECTS_NONE);
  });
});

test('default production route is present but held when no upstream invitation adapter is bound', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(REQUEST),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.state, 'HELD_HOST_BINDING_REQUIRED');
    assert.equal(payload.failureCode, 'RELATIONSHIPS_INVITATION_HOST_BINDING_REQUIRED');
    assert.equal(payload.syntheticAdapter, false);
    assert.deepEqual(payload.effects, RELATIONSHIPS_INVITATION_EFFECTS_NONE);
  });
});

test('invitation product route enforces POST, JSON media type, malformed JSON and body bound before bridge invocation', async () => {
  let calls = 0;
  await withServer({
    relationshipsInvitationProductBridge: Object.freeze({
      async execute() {
        calls += 1;
        throw new Error('bridge must not execute for request-form rejection');
      },
    }),
  }, async (baseUrl) => {
    const get = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');

    const wrongType = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    assert.equal(wrongType.status, 415);
    assert.equal((await wrongType.json()).failureCode, 'RELATIONSHIPS_INVITATION_REQUEST_INVALID');

    const malformed = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).failureCode, 'RELATIONSHIPS_INVITATION_REQUEST_INVALID');

    const oversized = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES + 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).failureCode, 'RELATIONSHIPS_INVITATION_REQUEST_INVALID');
  });
  assert.equal(calls, 0);
});

test('unknown route bridge failure is normalized without leaking implementation details', async () => {
  await withServer({
    relationshipsInvitationProductBridge: Object.freeze({
      async execute() {
        throw new Error('private provider path and implementation detail');
      },
    }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(REQUEST),
    });
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.failureCode, 'RELATIONSHIPS_INVITATION_BRIDGE_FAILED');
    assert.equal(JSON.stringify(payload).includes('private provider path'), false);
  });
});

test('route does not reinterpret CODE/QR codec hold as successful transfer', async () => {
  const bridge = createBrowserRelationshipsInvitationProductBridge({
    upstreamAdapter: Object.freeze({
      async invoke() {
        return Object.freeze({
          state: 'HELD_CODEC_DEPENDENCY',
          adapterEvidenceRef: 'evidence.synthetic.codec.http.1',
          syntheticAdapter: true,
          artifact: null,
          evidence: null,
          sourceRefs: Object.freeze(['github.issue.vexlife.485']),
          effects: RELATIONSHIPS_INVITATION_EFFECTS_NONE,
        });
      },
    }),
  });
  await withServer({ relationshipsInvitationProductBridge: bridge }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...REQUEST, requestRef: 'request.relationships.http.codec.1', transport: 'QR' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.state, 'HELD_CODEC_DEPENDENCY');
    assert.equal(payload.artifact, null);
    assert.equal(payload.failureCode, 'RELATIONSHIPS_INVITATION_CODEC_DEPENDENCY_HELD');
  });
});
