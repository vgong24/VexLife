import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelRuntimeResponse, verifyModelRuntimeObservation } from '../src/core/model-runtime-adapter.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const endpointProfile = { admitted: true, profileRef: 'profile.loopback', endpoint: 'http://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' };
const refs = {
  modelBundleRef: 'model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001',
  operationalProfileRef: 'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001',
  runtimeRevisionRef: 'github.commit.ggml-org.llama-cpp.c0bc8591e8815c63cb01dd3f051a8b0df02501c9',
  runtimeCapabilityEvidenceRef: 'evidence.vmcf.runtime-census.a003'
};

function readdressObservation(core) {
  const observationSha256 = semanticHash(core);
  return { ...core, observationRef: `observation.vexlife.model-runtime.${observationSha256.slice(0, 32)}`, observationSha256 };
}

test('normalizes observed llama.cpp response without persisting raw reasoning or local model path', () => {
  const value = normalizeModelRuntimeResponse({
    endpointProfile, ...refs, observedAt: '2026-09-02T09:10:22.300Z',
    responseBody: {
      id: 'chatcmpl-proof', object: 'chat.completion', created: 1,
      model: 'C:\\Users\\victo\\.vexlife\\models\\Qwen_Qwen3.5-4B-Q4_K_M.gguf',
      system_fingerprint: 'b10107-proof',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'visible', reasoning_content: 'private model-emitted trace' } }],
      usage: { prompt_tokens: 21, completion_tokens: 7, total_tokens: 28, prompt_tokens_details: { cached_tokens: 4 } },
      timings: { prompt_n: 21, prompt_ms: 10, predicted_n: 7, predicted_ms: 20 }
    }
  });
  assert.equal(value.content, 'visible');
  assert.equal(value.model, endpointProfile.model);
  assert.equal(value.runtimeObservation.modelProvenance.reportedModelField.pathClass, 'LOCAL_PATH_LIKE');
  assert.equal(value.runtimeObservation.modelProvenance.reportedModelField.rawValuePersisted, false);
  assert.equal(value.runtimeObservation.reasoningTrace.present, true);
  assert.equal(value.runtimeObservation.reasoningTrace.rawPersisted, false);
  assert.match(value.runtimeObservation.responseBodySha256, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(value.runtimeObservation).includes('private model-emitted trace'), false);
  assert.equal(JSON.stringify(value.runtimeObservation).includes('C:\\Users\\victo'), false);
  assert.equal(verifyModelRuntimeObservation(value.runtimeObservation), true);
});

test('known container nodes are not fabricated as unknown upstream fields', () => {
  const value = normalizeModelRuntimeResponse({
    endpointProfile, ...refs,
    responseBody: {
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      timings: { prompt_n: 1, predicted_n: 1 }, model: 'safe-model'
    }
  });
  assert.deepEqual(value.runtimeObservation.unknownUpstreamFields, []);
});

test('truly unknown fields are metadata-only and raw value is absent', () => {
  const value = normalizeModelRuntimeResponse({
    endpointProfile, ...refs,
    responseBody: {
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok', new_runtime_field: { secretish: 'do-not-copy' } } }],
      model: 'safe-model', vendor_extra: ['x', 'y']
    }
  });
  assert.deepEqual(value.runtimeObservation.unknownUpstreamFields.map(x => x.jsonPointer), ['/choices/0/message/new_runtime_field','/vendor_extra']);
  assert.equal(JSON.stringify(value.runtimeObservation).includes('do-not-copy'), false);
  assert.equal(JSON.stringify(value.runtimeObservation).includes('"x"'), false);
});

test('thinking-disabled response records reasoning absent without inventing unsupported state', () => {
  const value = normalizeModelRuntimeResponse({ endpointProfile, ...refs, responseBody: { model: 'safe-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '5' } }] } });
  assert.equal(value.runtimeObservation.reasoningTrace.present, false);
  assert.equal(value.runtimeObservation.reasoningTrace.trainingProjection, 'NONE');
});

test('closed verifier rejects self-consistent forged truth class and extra fields', () => {
  const valid = normalizeModelRuntimeResponse({ endpointProfile, ...refs, observedAt: '2026-09-02T09:10:22.300Z', responseBody: { model: 'safe-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }] } }).runtimeObservation;
  const { observationRef, observationSha256, ...core } = structuredClone(valid);
  const forged = readdressObservation({ ...core, truthClass: 'MODEL_SELF_REPORT', surpriseRawField: 'attacker-controlled' });
  assert.equal(verifyModelRuntimeObservation(forged), false);
});

test('closed verifier rejects policy mutation even when content address is recomputed', () => {
  const valid = normalizeModelRuntimeResponse({ endpointProfile, ...refs, observedAt: '2026-09-02T09:10:22.300Z', responseBody: { model: 'safe-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok', reasoning_content: 'trace' } }] } }).runtimeObservation;
  const { observationRef, observationSha256, ...core } = structuredClone(valid);
  const forged = readdressObservation({ ...core, reasoningTrace: { ...core.reasoningTrace, rawState: 'PERSISTED' } });
  assert.equal(verifyModelRuntimeObservation(forged), false);
});

test('formation rejects non-canonical timestamps and path-like fallback model identities', () => {
  assert.throws(() => normalizeModelRuntimeResponse({ endpointProfile, ...refs, observedAt: 'not-a-time', responseBody: { model: 'safe-model', choices: [{ message: { content: 'ok' } }] } }), /canonical timestamp/u);
  assert.throws(() => normalizeModelRuntimeResponse({ endpointProfile: { ...endpointProfile, model: 'C:\\unsafe\\model.gguf' }, ...refs, responseBody: { choices: [{ message: { content: 'ok' } }] } }), /non-path compatibility model/u);
});
