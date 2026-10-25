import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  LIVED_COMPANION_CONNECTION_FAILURE_CODES,
  LIVED_COMPANION_OUTPUT_TOKEN_LIMIT,
  LivedCompanionConnectionError,
  invokeLivedCompanionEndpoint,
  isLivedCompanionLoopbackHost,
  sanitizeEndpointOrigin,
  validateLivedCompanionEndpointProfile
} from '../src/core/lived-companion-connection.mjs';
import { verifyModelRuntimeObservation } from '../src/core/model-runtime-adapter.mjs';
import { verifyModelRuntimeInvocationEvidence } from '../src/core/model-turn-witness.mjs';

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function profile(endpoint, overrides = {}) {
  return {
    admitted: true,
    profileRef: 'model-profile.vexlife.connection.fixture',
    endpoint,
    model: 'fixture-model',
    ...overrides
  };
}

function responseBody(content = 'Hello from the local runtime') {
  return {
    id: 'fixture-response',
    model: 'fixture-model',
    choices: [{ message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }
  };
}

test('Connection performs one admitted loopback call and returns closed runtime evidence', async () => {
  const observed = [];
  await withServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    observed.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization ?? null,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(responseBody()));
  }, async (endpoint) => {
    const result = await invokeLivedCompanionEndpoint({
      endpointProfile: profile(endpoint),
      messages: [{ role: 'user', content: 'Hello' }],
      inMemoryAuthorization: 'Bearer ephemeral-fixture',
      timeoutMs: 1000
    });

    assert.equal(result.content, 'Hello from the local runtime');
    assert.equal(result.model, 'fixture-model');
    assert.equal(verifyModelRuntimeObservation(result.runtimeObservation), true);
    assert.equal(verifyModelRuntimeInvocationEvidence(result.invocationEvidence), true);
    assert.equal(result.invocationEvidence.actualHttpCall, true);
    assert.equal(result.invocationEvidence.loopbackOnly, true);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].method, 'POST');
    assert.equal(observed[0].url, '/v1/chat/completions');
    assert.equal(observed[0].authorization, 'Bearer ephemeral-fixture');
    assert.deepEqual(observed[0].body.messages, [{ role: 'user', content: 'Hello' }]);
    assert.equal(observed[0].body.max_tokens, LIVED_COMPANION_OUTPUT_TOKEN_LIMIT);
    assert.equal(Object.hasOwn(observed[0].body, 'stream'), false);
    assert.equal(JSON.stringify(result).includes('ephemeral-fixture'), false);
  });
});

test('Connection preserves sanitized endpoint-origin semantics', () => {
  assert.equal(
    sanitizeEndpointOrigin('http://user:secret@127.0.0.1:11434/base?token=private#fragment'),
    'http://127.0.0.1:11434'
  );
});

test('Connection owns one numeric-loopback predicate reused by endpoint admission and provenance validation', () => {
  assert.equal(isLivedCompanionLoopbackHost('127.0.0.1'), true);
  assert.equal(isLivedCompanionLoopbackHost('::1'), true);
  assert.equal(isLivedCompanionLoopbackHost('[::1]'), true);
  assert.equal(isLivedCompanionLoopbackHost('localhost'), false);
  assert.equal(isLivedCompanionLoopbackHost('example.com'), false);
});

test('Connection rejects non-loopback provider identity before network use', () => {
  assert.throws(
    () => validateLivedCompanionEndpointProfile(profile('https://example.com')),
    (error) => error instanceof LivedCompanionConnectionError
      && error.code === 'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED'
  );
});

test('Connection preserves redirect confinement as the existing endpoint failure code', async () => {
  await withServer((_request, response) => {
    response.writeHead(302, { location: 'http://127.0.0.1:9/foreign' });
    response.end();
  }, async (endpoint) => {
    await assert.rejects(
      invokeLivedCompanionEndpoint({
        endpointProfile: profile(endpoint),
        messages: [{ role: 'user', content: 'Hello' }],
        timeoutMs: 1000
      }),
      (error) => error instanceof LivedCompanionConnectionError
        && error.code === 'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED'
    );
  });
});

test('Connection preserves HTTP and malformed-response failure vocabulary', async () => {
  for (const fixture of [
    { status: 503, body: JSON.stringify({ error: 'offline' }), code: 'ENDPOINT_HTTP_ERROR' },
    { status: 200, body: '{not-json', code: 'ENDPOINT_RESPONSE_INVALID' }
  ]) {
    await withServer((_request, response) => {
      response.writeHead(fixture.status, { 'content-type': 'application/json' });
      response.end(fixture.body);
    }, async (endpoint) => {
      await assert.rejects(
        invokeLivedCompanionEndpoint({
          endpointProfile: profile(endpoint),
          messages: [{ role: 'user', content: 'Hello' }],
          timeoutMs: 1000
        }),
        (error) => error instanceof LivedCompanionConnectionError && error.code === fixture.code
      );
    });
  }
});

test('Connection timeout remains a typed endpoint failure and does not widen the vocabulary', async () => {
  await withServer((_request, _response) => {}, async (endpoint) => {
    await assert.rejects(
      invokeLivedCompanionEndpoint({
        endpointProfile: profile(endpoint),
        messages: [{ role: 'user', content: 'Hello' }],
        timeoutMs: 20
      }),
      (error) => error instanceof LivedCompanionConnectionError && error.code === 'ENDPOINT_TIMEOUT'
    );
  });
  assert.deepEqual(LIVED_COMPANION_CONNECTION_FAILURE_CODES, [
    'ENDPOINT_PROFILE_NOT_ADMITTED',
    'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED',
    'ENDPOINT_HTTP_ERROR',
    'ENDPOINT_RESPONSE_INVALID',
    'ENDPOINT_TIMEOUT',
    'ENDPOINT_UNREACHABLE'
  ]);
});

test('Connection streams visible content deltas while closing one final runtime observation', async () => {
  const observed = [];
  await withServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    observed.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const frame of [
      { id:'fixture-stream', object:'chat.completion.chunk', model:'fixture-model', created:1, choices:[{index:0,finish_reason:null,delta:{role:'assistant',content:'Hello '}}] },
      { id:'fixture-stream', object:'chat.completion.chunk', model:'fixture-model', created:1, choices:[{index:0,finish_reason:null,delta:{role:'assistant',content:'stream.'}}] },
      { id:'fixture-stream', object:'chat.completion.chunk', model:'fixture-model', created:1, choices:[{index:0,finish_reason:'stop',delta:{role:'assistant'}}] },
      { id:'fixture-stream', object:'chat.completion', model:'fixture-model', created:1, choices:[], usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5} }
    ]) response.write(`data: ${JSON.stringify(frame)}\n\n`);
    response.end('data: [DONE]\n\n');
  }, async (endpoint) => {
    const deltas = [];
    const result = await invokeLivedCompanionEndpoint({
      endpointProfile: profile(endpoint),
      messages: [{ role:'user', content:'Hello' }],
      responseDeltaObserver: async (delta) => { deltas.push(delta); },
      timeoutMs: 1000
    });
    assert.equal(result.content, 'Hello stream.');
    assert.equal(verifyModelRuntimeObservation(result.runtimeObservation), true);
    assert.equal(verifyModelRuntimeInvocationEvidence(result.invocationEvidence), true);
    assert.deepEqual(deltas.map((delta) => delta.contentDelta), ['Hello ', 'stream.']);
    assert.ok(deltas.every((delta) => delta.truthClass === 'EPHEMERAL_LOCAL_MODEL_PROGRESS' && delta.effectsPerformed === false));
    assert.equal(observed[0].stream, true);
    assert.equal(observed[0].stream_options.include_usage, true);
    assert.equal(observed[0].max_tokens, LIVED_COMPANION_OUTPUT_TOKEN_LIMIT);
  });
});

// [VXG RealForever]
