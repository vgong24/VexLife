import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import test from 'node:test';

import {
  BROWSER_RELATIONSHIPS_INVITATION_REQUEST_MAX_BYTES,
  createVexLifeBrowserServer,
} from '../scripts/serve-browser.mjs';
import { createRelationshipsInvitationProductClient } from '../reference/browser/modules/relationships-invitation-product-client.js';
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

async function rawRequest(baseUrl, { path = '/', host = '127.0.0.1' } = {}) {
  const target = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: Number(target.port),
      path,
      method: 'GET',
      headers: { Host: host },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Object.freeze({
        statusCode: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      })));
    });
    request.on('error', reject);
    request.setTimeout(2_000, () => request.destroy(new Error('raw browser request timed out')));
    request.end();
  });
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

test('wrapper delegates malformed Host parsing to the core fail-safe boundary', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await rawRequest(baseUrl, {
      path: '/reference/browser/',
      host: '%',
    });
    assert.equal(response.statusCode, 500);
    const payload = JSON.parse(response.body);
    assert.equal(payload.failureCode, 'COMPANION_TURN_FAILED');
  });
});

test('browser client preserves the typed host-binding hold when local transport is unbound', async () => {
  const client = createRelationshipsInvitationProductClient({ fetchImpl: null });
  const result = await client.createExport({
    requestRef: 'request.relationships.client.unbound.1',
    transport: 'FILE',
    payload: Object.freeze({}),
    sourceRefs: Object.freeze(['github.issue.vexlife.485']),
  });
  assert.equal(result.state, 'HELD_HOST_BINDING_REQUIRED');
  assert.equal(result.failureCode, 'RELATIONSHIPS_INVITATION_HOST_BINDING_REQUIRED');
  assert.equal(result.syntheticAdapter, false);
  assert.equal(Object.values(result.effects).every((value) => value === false), true);
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

test('invitation product route carries the maximum exact FILE artifact through the bounded JSON envelope', async () => {
  const artifactBytes = Buffer.alloc(BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES, 0x78);
  let calls = 0;
  const bridge = createBrowserRelationshipsInvitationProductBridge({
    upstreamAdapter: Object.freeze({
      async invoke() {
        calls += 1;
        throw new Error('synthetic downstream unavailable after exact artifact admission');
      },
    }),
  });
  await withServer({ relationshipsInvitationProductBridge: bridge }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...REQUEST,
        operation: 'IMPORT_VERIFY',
        requestRef: 'request.relationships.http.max-import.1',
        payload: {
          artifactBytesBase64: artifactBytes.toString('base64'),
          expectedArtifactSha256: createHash('sha256').update(artifactBytes).digest('hex'),
          transportRecoveryEvidenceRefOrNull: null,
        },
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.state, 'HELD_UPSTREAM_UNAVAILABLE');
    assert.equal(payload.failureCode, 'RELATIONSHIPS_INVITATION_UPSTREAM_UNAVAILABLE');
  });
  assert.equal(calls, 1, 'maximum-size exact artifact must reach bridge-level admission and the injected adapter');
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
      body: JSON.stringify({ padding: 'x'.repeat(BROWSER_RELATIONSHIPS_INVITATION_REQUEST_MAX_BYTES + 1024) }),
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
