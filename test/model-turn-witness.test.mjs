import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelRuntimeResponse } from '../src/core/model-runtime-adapter.mjs';
import { formModelRuntimeInvocationEvidence, verifyModelRuntimeInvocationEvidence, formModelTurnWitness, verifyModelTurnWitness } from '../src/core/model-turn-witness.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const normalized = normalizeModelRuntimeResponse({
  endpointProfile: { admitted: true, profileRef: 'profile.loopback', endpoint: 'http://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' },
  modelBundleRef: 'model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001',
  operationalProfileRef: 'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001',
  runtimeRevisionRef: 'github.commit.ggml-org.llama-cpp.c0bc8591e8815c63cb01dd3f051a8b0df02501c9',
  runtimeCapabilityEvidenceRef: 'evidence.vmcf.runtime-census.a003',
  observedAt: '2026-09-02T09:10:22.300Z',
  responseBody: { model: 'safe-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'hello', reasoning_content: 'trace' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
});
const invocationEvidence = formModelRuntimeInvocationEvidence({
  endpointProfileRef: 'profile.loopback', sanitizedEndpointOrigin: 'http://127.0.0.1:18080', requestBodySha256: 'b'.repeat(64),
  runtimeObservation: normalized.runtimeObservation, httpStatus: 200, actualHttpCall: true, formedAt: '2026-09-02T09:10:29.000Z'
});

function readdressWitness(core) { const witnessSha256 = semanticHash(core); return { ...core, witnessRef: `witness.vexlife.model-turn.${witnessSha256.slice(0, 32)}`, witnessSha256 }; }
function readdressInvocation(core) { const invocationSha256 = semanticHash(core); return { ...core, invocationRef: `evidence.vexlife.model-runtime-invocation.${invocationSha256.slice(0, 32)}`, invocationSha256 }; }

test('forms a content-addressed external witness without visible response or raw reasoning duplication', () => {
  const witness = formModelTurnWitness({
    turnRef: 'turn.test.1', requestMessageRef: 'message.request.1', responseMessageRef: 'message.response.1', runtimeObservation: normalized.runtimeObservation, invocationEvidence,
    promptContextMaterializationReceipt: { receiptRef: 'receipt.prompt.1', semanticFingerprint: 'a'.repeat(64) },
    currentnessRefs: ['github.commit.vexlife.main.3d2ef4c8'], availableCapabilityRefs: ['runtime.c00','runtime.c08'], heldCapabilityRefs: ['runtime.c11','runtime.c12'],
    formedAt: '2026-09-02T09:10:30.000Z'
  });
  assert.equal(verifyModelTurnWitness(witness), true);
  assert.equal(witness.trust.modelSelfReportUsedAsExternalFact, false);
  assert.equal(witness.privacy.visibleResponseDuplicatedInWitness, false);
  assert.equal(witness.observedEffects.providerOrNetworkObserved, true);
  assert.equal(witness.invocationEvidence.invocationRef, invocationEvidence.invocationRef);
  assert.equal(JSON.stringify(witness).includes('hello'), false);
  assert.equal(JSON.stringify(witness).includes('trace'), false);
});

test('witness formation requires invocation-owner evidence and exact observation binding', () => {
  assert.throws(() => formModelTurnWitness({ turnRef: 'turn.test.none', requestMessageRef: 'message.request.none', responseMessageRef: 'message.response.none', runtimeObservation: normalized.runtimeObservation }), /invocation-owner evidence/u);
  const other = normalizeModelRuntimeResponse({ endpointProfile: { admitted: true, profileRef: 'profile.loopback', endpoint: 'http://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' }, observedAt: '2026-09-02T09:10:22.300Z', responseBody: { model: 'safe-model', choices: [{ message: { role: 'assistant', content: 'different' } }] } }).runtimeObservation;
  assert.throws(() => formModelTurnWitness({ turnRef: 'turn.test.mismatch', requestMessageRef: 'message.request.mismatch', responseMessageRef: 'message.response.mismatch', runtimeObservation: other, invocationEvidence }), /does not bind/u);
});

test('invocation evidence is closed and requires actual successful numeric-loopback HTTP evidence', () => {
  assert.equal(verifyModelRuntimeInvocationEvidence(invocationEvidence), true);
  assert.throws(() => formModelRuntimeInvocationEvidence({ endpointProfileRef: 'profile.loopback', sanitizedEndpointOrigin: 'http://127.0.0.1:18080', requestBodySha256: 'b'.repeat(64), runtimeObservation: normalized.runtimeObservation, httpStatus: 200, actualHttpCall: false }), /actual HTTP call/u);
  const { invocationRef, invocationSha256, ...core } = structuredClone(invocationEvidence);
  const forged = readdressInvocation({ ...core, actualHttpCall: false, surprise: true });
  assert.equal(verifyModelRuntimeInvocationEvidence(forged), false);
});

test('closed witness verifier rejects forged truth/effects even with recomputed content address', () => {
  const valid = formModelTurnWitness({ turnRef: 'turn.test.forge', requestMessageRef: 'message.request.forge', responseMessageRef: 'message.response.forge', runtimeObservation: normalized.runtimeObservation, invocationEvidence, heldCapabilityRefs: ['runtime.c11','runtime.c12'], formedAt: '2026-09-02T09:10:30.000Z' });
  const { witnessRef, witnessSha256, ...core } = structuredClone(valid);
  const forged = readdressWitness({ ...core, truthClass: 'MODEL_SELF_REPORT', observedEffects: { ...core.observedEffects, nativeToolExecutionObserved: true, trainingEffectObserved: true } });
  assert.equal(verifyModelTurnWitness(forged), false);
});

test('capability dispositions are disjoint and holds remain holds', () => {
  assert.throws(() => formModelTurnWitness({ turnRef: 'turn.test.2', requestMessageRef: 'message.request.2', responseMessageRef: 'message.response.2', runtimeObservation: normalized.runtimeObservation, invocationEvidence, availableCapabilityRefs: ['runtime.c11'], heldCapabilityRefs: ['runtime.c11'] }), /mutually exclusive/u);
});
