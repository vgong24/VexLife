import crypto from 'node:crypto';

import { normalizeModelRuntimeResponse } from './model-runtime-adapter.mjs';
import { formModelRuntimeInvocationEvidence } from './model-turn-witness.mjs';

export const LIVED_COMPANION_CONNECTION_FAILURE_CODES = Object.freeze([
  'ENDPOINT_PROFILE_NOT_ADMITTED',
  'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED',
  'ENDPOINT_HTTP_ERROR',
  'ENDPOINT_RESPONSE_INVALID',
  'ENDPOINT_TIMEOUT',
  'ENDPOINT_UNREACHABLE'
]);

const CONNECTION_FAILURE_CODE_SET = new Set(LIVED_COMPANION_CONNECTION_FAILURE_CODES);

export const LIVED_COMPANION_OUTPUT_TOKEN_LIMIT = 16_000;
export const LIVED_COMPANION_RESPONSE_DELTA_SCHEMA = 'vexlife.lived-companion-response-delta/v1';

export class LivedCompanionConnectionError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'LivedCompanionConnectionError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  if (!CONNECTION_FAILURE_CODE_SET.has(code)) {
    throw new TypeError(`unsupported Lived Companion connection failure code ${code}`);
  }
  throw new LivedCompanionConnectionError(code, message, details);
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

export function isLivedCompanionLoopbackHost(hostname) {
  const normalized = String(hostname).toLowerCase().replace(/^\[|\]$/gu, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

export function sanitizeEndpointOrigin(endpoint) {
  const parsed = new URL(endpoint);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.origin;
}

function endpointRequestUrl(endpoint) {
  const base = new URL(endpoint);
  const prefix = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  base.pathname = `${prefix}v1/chat/completions`.replace(/\/{2,}/gu, '/');
  base.search = '';
  base.hash = '';
  return base;
}

export function validateLivedCompanionEndpointProfile(endpointProfile) {
  if (
    !endpointProfile?.admitted ||
    !nonempty(endpointProfile.profileRef) ||
    !nonempty(endpointProfile.endpoint) ||
    (
      endpointProfile.model !== undefined &&
      endpointProfile.model !== null &&
      !nonempty(endpointProfile.model)
    )
  ) {
    fail(
      'ENDPOINT_PROFILE_NOT_ADMITTED',
      'an admitted endpoint profile with string identity and endpoint metadata is required'
    );
  }
  let parsed;
  try {
    parsed = new URL(endpointProfile.endpoint);
  } catch {
    fail('ENDPOINT_PROFILE_NOT_ADMITTED', 'endpoint profile URL is invalid');
  }
  if (!isLivedCompanionLoopbackHost(parsed.hostname)) {
    fail(
      'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED',
      'G01 accepts loopback endpoints only; non-loopback use requires a separately admitted adapter'
    );
  }
  return endpointProfile;
}

function validateProviderReadyMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new TypeError('Lived Companion connection requires provider-ready messages');
  }
  for (const [index, message] of messages.entries()) {
    if (
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      !nonempty(message.role) ||
      typeof message.content !== 'string'
    ) {
      throw new TypeError(`provider-ready message ${index} is invalid`);
    }
  }
  return messages;
}

function validateResponseDeltaObserver(value) {
  if (value !== null && typeof value !== 'function') throw new TypeError('Lived Companion responseDeltaObserver must be null or one function');
  return value;
}

async function readStreamingCompletion(response, endpointProfile, responseDeltaObserver) {
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    fail('ENDPOINT_RESPONSE_INVALID', 'streaming endpoint response did not expose a readable body');
  }
  const decoder = new TextDecoder();
  let buffer = '', content = '', accumulatedContentCharacters = 0;
  let observedModel = endpointProfile.model ?? null, responseId = null, created = null, finishReason = null, usage = null, done = false;
  const consumeEvent = async (raw) => {
    const lines = raw.split(/\r?\n/u);
    if (lines.every((line) => line.trim() === '' || line.startsWith(':'))) return;
    const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data === '[DONE]') { done = true; return; }
    let event;
    try { event = JSON.parse(data); } catch { fail('ENDPOINT_RESPONSE_INVALID', 'streaming endpoint emitted invalid SSE JSON'); }
    if (event?.model !== undefined && event?.model !== null) {
      if (!nonempty(event.model)) fail('ENDPOINT_RESPONSE_INVALID', 'streaming endpoint model provenance must be one non-empty string');
      observedModel = event.model;
    }
    if (typeof event?.id === 'string' && event.id) responseId ??= event.id;
    if (Number.isFinite(event?.created)) created ??= event.created;
    if (event?.usage && typeof event.usage === 'object' && !Array.isArray(event.usage)) usage = event.usage;
    const choice = event?.choices?.[0] ?? null;
    if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason;
    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      content += delta;
      accumulatedContentCharacters += [...delta].length;
      if (responseDeltaObserver) {
        try {
          await responseDeltaObserver(Object.freeze({
            schemaVersion: LIVED_COMPANION_RESPONSE_DELTA_SCHEMA,
            truthClass: 'EPHEMERAL_LOCAL_MODEL_PROGRESS',
            contentDelta: delta,
            accumulatedContentCharacters,
            effectsPerformed: false
          }));
        } catch {}
      }
    }
  };
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    for (;;) {
      const boundary = buffer.match(/\r?\n\r?\n/u);
      if (!boundary || boundary.index === undefined) break;
      const raw = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      await consumeEvent(raw);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) await consumeEvent(buffer);
  if (!done) fail('ENDPOINT_RESPONSE_INVALID', 'streaming endpoint closed before the terminal [DONE] frame');
  return {
    ...(responseId ? { id: responseId } : {}),
    object: 'chat.completion',
    model: observedModel ?? endpointProfile.model ?? 'bounded-loopback-proof',
    ...(created === null ? {} : { created }),
    choices: [{ index: 0, finish_reason: finishReason, message: { role: 'assistant', content } }],
    ...(usage ? { usage } : {})
  };
}

export async function invokeLivedCompanionEndpoint({
  endpointProfile,
  messages,
  inMemoryAuthorization = null,
  timeoutMs = 5000,
  responseDeltaObserver = null,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString()
} = {}) {
  validateLivedCompanionEndpointProfile(endpointProfile);
  validateProviderReadyMessages(messages);
  validateResponseDeltaObserver(responseDeltaObserver);
  if (typeof fetchImpl !== 'function') throw new TypeError('Lived Companion connection requires fetch');
  if (typeof now !== 'function') throw new TypeError('Lived Companion connection requires a clock function');
  const streaming = responseDeltaObserver !== null;
  const requestPayload = {
    model: endpointProfile.model || 'bounded-loopback-proof',
    messages,
    max_tokens: LIVED_COMPANION_OUTPUT_TOKEN_LIMIT,
    ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {})
  };
  const requestBody = JSON.stringify(requestPayload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json' };
    if (inMemoryAuthorization) headers.authorization = inMemoryAuthorization;
    const response = await fetchImpl(endpointRequestUrl(endpointProfile.endpoint), { method: 'POST', headers, body: requestBody, signal: controller.signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) fail('ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED', 'G01 rejects endpoint redirects because the redirected destination is not part of the admitted loopback effect', { status: response.status });
    if (!response.ok) fail('ENDPOINT_HTTP_ERROR', `endpoint returned HTTP ${response.status}`, { status: response.status });
    let body;
    if (streaming) body = await readStreamingCompletion(response, endpointProfile, responseDeltaObserver);
    else {
      try { body = await response.json(); } catch { fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response was not valid JSON'); }
    }
    if (body?.model !== undefined && body?.model !== null && !nonempty(body.model)) fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response model provenance must be one non-empty string');
    let normalized;
    try { normalized = normalizeModelRuntimeResponse({ responseBody: body, endpointProfile, observedAt: now() }); }
    catch (error) { fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response could not form a closed runtime observation', { cause: error.message }); }
    let invocationEvidence;
    try {
      invocationEvidence = formModelRuntimeInvocationEvidence({
        endpointProfileRef: endpointProfile.profileRef,
        sanitizedEndpointOrigin: sanitizeEndpointOrigin(endpointProfile.endpoint),
        requestBodySha256: crypto.createHash('sha256').update(Buffer.from(requestBody, 'utf8')).digest('hex'),
        runtimeObservation: normalized.runtimeObservation,
        httpStatus: response.status,
        actualHttpCall: true,
        formedAt: now()
      });
    } catch (error) { fail('ENDPOINT_RESPONSE_INVALID', 'endpoint response could not form closed invocation evidence', { cause: error.message }); }
    return Object.freeze({ content: normalized.content, model: normalized.model, runtimeObservation: normalized.runtimeObservation, invocationEvidence });
  } catch (error) {
    if (error instanceof LivedCompanionConnectionError) throw error;
    if (error?.name === 'AbortError') fail('ENDPOINT_TIMEOUT', 'endpoint request timed out');
    fail('ENDPOINT_UNREACHABLE', 'endpoint could not be reached', { cause: error.message });
  } finally { clearTimeout(timeout); }
}

// [VXG RealForever]
