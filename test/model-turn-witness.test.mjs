import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelRuntimeResponse } from '../src/core/model-runtime-adapter.mjs';
import { formModelTurnWitness, verifyModelTurnWitness } from '../src/core/model-turn-witness.mjs';

const normalized = normalizeModelRuntimeResponse({
  endpointProfile: { admitted: true, profileRef: 'profile.loopback', endpoint: 'http://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' },
  modelBundleRef: 'model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001',
  operationalProfileRef: 'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001',
  runtimeRevisionRef: 'github.commit.ggml-org.llama-cpp.c0bc8591e8815c63cb01dd3f051a8b0df02501c9',
  runtimeCapabilityEvidenceRef: 'evidence.vmcf.runtime-census.a003',
  observedAt: '2026-09-02T09:10:22.300Z',
  responseBody: { model: 'safe-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'hello', reasoning_content: 'trace' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
});

test('forms a content-addressed external witness without visible response or raw reasoning duplication', () => {
  const witness = formModelTurnWitness({
    turnRef: 'turn.test.1', requestMessageRef: 'message.request.1', responseMessageRef: 'message.response.1',
    runtimeObservation: normalized.runtimeObservation,
    promptContextMaterializationReceipt: { receiptRef: 'receipt.prompt.1', semanticFingerprint: 'a'.repeat(64) },
    currentnessRefs: ['github.commit.vexlife.main.3d2ef4c8'],
    availableCapabilityRefs: ['runtime.c00','runtime.c08'], heldCapabilityRefs: ['runtime.c11','runtime.c12'],
    formedAt: '2026-09-02T09:10:30.000Z'
  });
  assert.equal(verifyModelTurnWitness(witness), true);
  assert.equal(witness.trust.modelSelfReportUsedAsExternalFact, false);
  assert.equal(witness.privacy.visibleResponseDuplicatedInWitness, false);
  assert.equal(JSON.stringify(witness).includes('hello'), false);
  assert.equal(JSON.stringify(witness).includes('trace'), false);
});

test('capability dispositions are disjoint and holds remain holds', () => {
  assert.throws(() => formModelTurnWitness({
    turnRef: 'turn.test.2', requestMessageRef: 'message.request.2', responseMessageRef: 'message.response.2',
    runtimeObservation: normalized.runtimeObservation,
    availableCapabilityRefs: ['runtime.c11'], heldCapabilityRefs: ['runtime.c11']
  }), /mutually exclusive/u);
});
