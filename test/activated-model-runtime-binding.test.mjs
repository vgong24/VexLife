import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ACTIVATED_MODEL_CONFIGURATION_SCHEMA,
  ACTIVATED_MODEL_CUSTODY_HANDOFF_SCHEMA,
  ACTIVATED_MODEL_RUNTIME_RECEIPT_SCHEMA,
  ActivatedModelRuntimeBindingError,
  assertNoActivatedRuntimeSelectionInjection,
  formCultivatedFirstLivedTurnEvidence,
  loadActivatedModelRuntimeBindingRegistry,
  planActivatedModelResume,
  qualifyActivatedMlxRuntime,
  startOrResumeActivatedModelRuntime,
  validateActivatedModelRuntimeBindingRegistry,
  verifyActivatedArtifactCustody
} from '../src/core/activated-model-runtime-binding.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGISTRY_PATH = path.join(ROOT, 'blueprint', 'activated-model-runtime-bindings.json');
const SOURCE_IDENTITY = Object.freeze({
  schemaVersion: 'vexlife.activated-model-runtime-source-identity/v1',
  repository: 'vgong24/VexLife',
  candidateHead: '1'.repeat(40),
  candidateTree: '2'.repeat(40),
  registrySha256: '3'.repeat(64),
  moduleSha256: '4'.repeat(64),
  sourceBindingSha256: '5'.repeat(64)
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function semanticHash(value) {
  const canonicalize = (input) => Array.isArray(input)
    ? input.map(canonicalize)
    : input && typeof input === 'object'
      ? Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonicalize(input[key])]))
      : input;
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}
function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-m4-${label}-`));
}
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function makeHome(label = 'home') {
  const home = tempDir(label);
  writeJson(path.join(home, 'config', 'home.json'), {
    schemaVersion: 'vexlife.home/v1',
    homeRef: `home.test.${label}.001`
  });
  return home;
}
function baseBinding() {
  return structuredClone(loadActivatedModelRuntimeBindingRegistry(REGISTRY_PATH).binding);
}
function makeFixtureArtifact(binding, root, entries = {
  'config.json': '{"model":"fixture"}\n',
  'model.safetensors': 'fixture-weights',
  'tokenizer.json': '{"tokenizer":"fixture"}\n'
}) {
  const modelDirectory = path.join(root, 'model');
  fs.mkdirSync(modelDirectory, { recursive: true });
  for (const [name, content] of Object.entries(entries)) fs.writeFileSync(path.join(modelDirectory, name), content);
  const rows = Object.keys(entries).sort().map((name) => {
    const bytes = fs.readFileSync(path.join(modelDirectory, name));
    return { path: name, bytes: bytes.length, sha256: sha256(bytes) };
  });
  binding.artifact.expectedMemberNames = rows.map((row) => row.path);
  binding.artifact.memberCount = rows.length;
  binding.artifact.totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  binding.artifact.contentSetSha256 = sha256(Buffer.from(JSON.stringify(rows), 'utf8'));
  binding.artifact.providerVerifiedMembers = {
    'model.safetensors': rows.find((row) => row.path === 'model.safetensors')?.sha256,
    'tokenizer.json': rows.find((row) => row.path === 'tokenizer.json')?.sha256
  };
  return { modelDirectory, rows };
}
function makePython(root) {
  const pythonExecutable = path.join(root, 'python3.14');
  fs.writeFileSync(pythonExecutable, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  return pythonExecutable;
}
function makeHandoff(binding, modelDirectory, pythonExecutable, sourceIdentity = SOURCE_IDENTITY) {
  const handoff = {
    schemaVersion: ACTIVATED_MODEL_CUSTODY_HANDOFF_SCHEMA,
    handoffRef: 'handoff.test.activated-m4.001',
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef,
    activationEvidenceRef: binding.activationEvidenceRef,
    distributionTrustEvidenceRef: binding.distributionTrustEvidenceRef,
    artifactRef: binding.artifact.artifactRef,
    artifactContentSetSha256: binding.artifact.contentSetSha256,
    artifactMemberCount: binding.artifact.memberCount,
    artifactTotalBytes: binding.artifact.totalBytes,
    artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
    runtimeAdapterRef: binding.runtime.runtimeAdapterRef,
    runtimeClass: binding.runtime.runtimeClass,
    pythonVersion: binding.runtime.pythonVersion,
    mlxLmVersion: binding.runtime.mlxLmVersion,
    mlxLmSourceCommit: binding.runtime.mlxLmSourceCommit,
    source: {
      repository: sourceIdentity.repository,
      candidateHead: sourceIdentity.candidateHead,
      candidateTree: sourceIdentity.candidateTree,
      registrySha256: sourceIdentity.registrySha256,
      moduleSha256: sourceIdentity.moduleSha256
    },
    privateLocators: { modelDirectory, pythonExecutable }
  };
  const bytes = Buffer.from(`${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  return { handoff, bytes, digest: sha256(bytes) };
}
function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}
function exactRuntimeFetch(binding, modelDirectory, trace = []) {
  return async (url, options = {}) => {
    trace.push({ url, options });
    if (url === `${binding.runtime.origin}${binding.runtime.healthPath}`) return jsonResponse({ status: 'ok' });
    if (url === `${binding.runtime.origin}${binding.runtime.modelsPath}`) {
      return jsonResponse({ object: 'list', data: [{ id: path.resolve(modelDirectory), object: 'model' }] });
    }
    if (url === `${binding.runtime.origin}${binding.runtime.chatPath}`) {
      const request = JSON.parse(options.body);
      return jsonResponse({ id: 'chatcmpl-fixture', object: 'chat.completion', model: request.model, choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }] });
    }
    throw new Error(`unexpected fixture URL: ${url}`);
  };
}
function errorCode(error) {
  return error instanceof ActivatedModelRuntimeBindingError ? error.code : null;
}

// M4B02: the public source registry is an exact projection of already accepted upstream identities.
test('M4B02 exact accepted activated-M4 registry validates and has one binding', () => {
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const result = validateActivatedModelRuntimeBindingRegistry(raw);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.binding.modelRef, 'model.vex.m4.small.g2.base.368e89e5ca219fab');
  assert.equal(result.binding.modelProfileRef, 'model-profile.vex.m4.small.g2.certified.20260920A');
  assert.equal(result.binding.runtime.runtimeAdapterRef, 'adapter.runtime.mlx.macos-victor.001');
});

// M4B03: model/profile/provider/endpoint choice is not an environment injection surface.
test('M4B03 arbitrary runtime/model/provider environment injection fails closed', () => {
  assert.throws(
    () => assertNoActivatedRuntimeSelectionInjection({ VEXLIFE_COMPANION_ENDPOINT: 'http://127.0.0.1:9999' }),
    (error) => errorCode(error) === 'ACTIVATED_MODEL_RUNTIME_SELECTION_INJECTION_REJECTED'
  );
  assert.equal(assertNoActivatedRuntimeSelectionInjection({ HOME: '/tmp/example' }), true);
});

// M4B04/M4B05: private location is operational only; the exact content seal is independently recomputed.
test('M4B04-M4B05 private locator is not model identity and exact fixture content seal verifies', async () => {
  const binding = baseBinding();
  const root = tempDir('custody');
  const { modelDirectory } = makeFixtureArtifact(binding, root);
  const receipt = await verifyActivatedArtifactCustody({ binding, modelDirectory });
  assert.equal(receipt.artifactRef, binding.artifact.artifactRef);
  assert.equal(receipt.contentSetSha256, binding.artifact.contentSetSha256);
  assert.equal(receipt.memberCount, binding.artifact.memberCount);
  assert.notEqual(modelDirectory, binding.artifact.artifactRef);
});

// M4B06: accepted provider member hash and aggregate seal fail independently and typed.
test('M4B06 wrong provider member and wrong aggregate seal fail closed', async () => {
  const root = tempDir('custody-fail');
  const providerBinding = baseBinding();
  const { modelDirectory } = makeFixtureArtifact(providerBinding, root);
  providerBinding.artifact.providerVerifiedMembers['tokenizer.json'] = '0'.repeat(64);
  await assert.rejects(
    verifyActivatedArtifactCustody({ binding: providerBinding, modelDirectory }),
    (error) => errorCode(error) === 'ACTIVATED_ARTIFACT_PROVIDER_MEMBER_MISMATCH'
  );

  const sealBinding = baseBinding();
  makeFixtureArtifact(sealBinding, root);
  sealBinding.artifact.providerVerifiedMembers = {};
  sealBinding.artifact.contentSetSha256 = 'f'.repeat(64);
  await assert.rejects(
    verifyActivatedArtifactCustody({ binding: sealBinding, modelDirectory }),
    (error) => errorCode(error) === 'ACTIVATED_ARTIFACT_CONTENT_SEAL_MISMATCH'
  );
});

// M4B07/M4B08: qualification is loopback, identity-bound, and zero-lived-effect.
test('M4B07-M4B08 neutral loopback qualification binds exact served path and default_model without a lived turn', async () => {
  const binding = baseBinding();
  const root = tempDir('qualify');
  const modelDirectory = path.join(root, 'private-model');
  fs.mkdirSync(modelDirectory, { recursive: true });
  const trace = [];
  const result = await qualifyActivatedMlxRuntime({ binding, modelDirectory, fetchImpl: exactRuntimeFetch(binding, modelDirectory, trace) });
  assert.equal(result.actualHttpCall, true);
  assert.equal(result.modelsExactMatchCount, 1);
  assert.equal(result.requestModel, 'default_model');
  assert.equal(result.livedConversationEffect, false);
  assert.equal(result.personaEffect, false);
  const post = trace.find((entry) => entry.url.endsWith('/v1/chat/completions'));
  const request = JSON.parse(post.options.body);
  assert.deepEqual(request.messages, [{ role: 'user', content: '' }]);
  assert.equal(request.max_tokens, 0);
  assert.equal(Object.hasOwn(request, 'system'), false);
});

// M4B09/M4B16/M4B17: first bind requires exact handoff; stale explicit M4 does not downgrade to G0.
test('M4B09-M4B16-M4B17 plan requires handoff once and refuses stale/no-fallback currentness', async () => {
  const binding = baseBinding();
  const root = tempDir('plan');
  const home = makeHome('plan');
  const { modelDirectory } = makeFixtureArtifact(binding, root);
  const pythonExecutable = makePython(root);
  const handoff = makeHandoff(binding, modelDirectory, pythonExecutable);
  const sourceDigests = { registrySha256: SOURCE_IDENTITY.registrySha256, moduleSha256: SOURCE_IDENTITY.moduleSha256 };

  await assert.rejects(
    planActivatedModelResume({ home, binding, sourceDigests, sourceIdentity: SOURCE_IDENTITY, environment: {} }),
    (error) => errorCode(error) === 'ACTIVATED_MODEL_HANDOFF_REQUIRED'
  );
  const first = await planActivatedModelResume({ home, binding, sourceDigests, sourceIdentity: SOURCE_IDENTITY, handoffBytes: handoff.bytes, handoffSha256: handoff.digest, environment: {} });
  assert.equal(first.state, 'FIRST_BIND_FROM_EXACT_HANDOFF');
  assert.equal(first.noFallback, true);

  writeJson(path.join(home, 'config', 'model.json'), {
    schemaVersion: ACTIVATED_MODEL_CONFIGURATION_SCHEMA,
    state: 'BOUND_ACTIVATED_CULTIVATED_MODEL',
    bindingRef: binding.bindingRef,
    modelRef: 'model.wrong',
    modelProfileRef: binding.modelProfileRef
  });
  await assert.rejects(
    planActivatedModelResume({ home, binding, sourceDigests, sourceIdentity: SOURCE_IDENTITY, environment: {} }),
    (error) => errorCode(error) === 'ACTIVATED_MODEL_HOME_BINDING_NOT_CURRENT'
  );
});

// M4B06/M4B17: a digest-bound handoff cannot be silently retargeted to another head/profile/artifact/runtime.
test('M4B06 exact digest-bound handoff rejects source identity mismatch', async () => {
  const binding = baseBinding();
  const root = tempDir('handoff');
  const home = makeHome('handoff');
  const { modelDirectory } = makeFixtureArtifact(binding, root);
  const pythonExecutable = makePython(root);
  const handoff = makeHandoff(binding, modelDirectory, pythonExecutable);
  const parsed = JSON.parse(handoff.bytes);
  parsed.source.candidateHead = 'a'.repeat(40);
  const badBytes = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`);
  const badDigest = sha256(badBytes);
  await assert.rejects(
    planActivatedModelResume({
      home,
      binding,
      sourceDigests: { registrySha256: SOURCE_IDENTITY.registrySha256, moduleSha256: SOURCE_IDENTITY.moduleSha256 },
      sourceIdentity: SOURCE_IDENTITY,
      handoffBytes: badBytes,
      handoffSha256: badDigest,
      environment: {}
    }),
    (error) => errorCode(error) === 'ACTIVATED_BINDING_HANDOFF_MISMATCH'
  );
});

// M4B09/M4B10/M4B15/M4B16: actual source path writes only Home-local truth and server-owned browser binding.
test('M4B09-M4B10-M4B15-M4B16 first start persists Home binding; restart reuses or replaces runtime without lineage reset', async () => {
  const binding = baseBinding();
  const root = tempDir('runtime');
  const home = makeHome('runtime');
  const { modelDirectory } = makeFixtureArtifact(binding, root);
  const pythonExecutable = makePython(root);
  const handoff = makeHandoff(binding, modelDirectory, pythonExecutable);
  let spawned = false;
  let currentPid = 41001;
  let oldAlive = false;
  const trace = [];
  const fetchImpl = async (url, options = {}) => {
    trace.push({ url, options });
    if (url.endsWith('/health')) return spawned ? jsonResponse({ status: 'ok' }) : jsonResponse({ status: 'unavailable' }, 503);
    if (url.endsWith('/v1/models')) return jsonResponse({ object: 'list', data: [{ id: path.resolve(modelDirectory), object: 'model' }] });
    if (url.endsWith('/v1/chat/completions')) return jsonResponse({ model: 'default_model', choices: [{ message: { content: '' } }] });
    throw new Error(`unexpected URL ${url}`);
  };
  const commonHooks = {
    host: { platform: 'darwin', architecture: 'arm64' },
    versionProbe: async () => ({ pythonVersion: '3.14.7', mlxLmVersion: '0.32.0' }),
    fetchImpl,
    processMatches: ({ pid }) => pid === currentPid && oldAlive,
    sleep: async () => {},
    now: () => '2026-09-20T08:30:00.000Z'
  };
  const first = await startOrResumeActivatedModelRuntime({
    home,
    binding,
    sourceIdentity: SOURCE_IDENTITY,
    handoffBytes: handoff.bytes,
    handoffSha256: handoff.digest,
    environment: {},
    hooks: {
      ...commonHooks,
      processAlive: (pid) => pid === currentPid && spawned,
      spawnRuntime: async () => { spawned = true; oldAlive = true; return currentPid; }
    }
  });
  assert.equal(first.planState, 'FIRST_BIND_FROM_EXACT_HANDOFF');
  assert.equal(first.browserEnvironment.VEXLIFE_COMPANION_ENDPOINT, binding.runtime.origin);
  assert.equal(first.browserEnvironment.VEXLIFE_COMPANION_MODEL, 'default_model');
  const configPath = path.join(home, 'config', 'model.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.modelRef, binding.modelRef);
  assert.equal(config.automaticFallback, false);
  assert.equal(config.privateMaterializationPath, path.resolve(modelDirectory));
  assert.equal(fs.existsSync(path.join(home, 'runtime', 'initialization', 'receipt.json')), true);
  assert.equal(fs.existsSync(path.join(home, 'recovery', 'vex-initialization-receipt.json')), true);

  const second = await startOrResumeActivatedModelRuntime({
    home,
    binding,
    sourceIdentity: SOURCE_IDENTITY,
    environment: {},
    hooks: {
      ...commonHooks,
      processAlive: (pid) => pid === currentPid && oldAlive,
      spawnRuntime: async () => { throw new Error('must reuse'); }
    }
  });
  assert.equal(second.planState, 'RESUME_PERSISTED_ACTIVATED_BINDING');
  assert.equal(second.runtimeDisposition, 'REUSED_EXACT_OWNED_MLX_RUNTIME');

  oldAlive = false;
  spawned = false;
  currentPid = 41002;
  const third = await startOrResumeActivatedModelRuntime({
    home,
    binding,
    sourceIdentity: SOURCE_IDENTITY,
    environment: {},
    hooks: {
      ...commonHooks,
      processAlive: (pid) => pid === currentPid && spawned,
      processMatches: () => false,
      spawnRuntime: async () => { spawned = true; return currentPid; }
    }
  });
  assert.equal(third.planState, 'RESUME_PERSISTED_ACTIVATED_BINDING');
  assert.equal(third.runtimeDisposition, 'STARTED_NEW_EXACT_MLX_RUNTIME');
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'config', 'home.json'), 'utf8')).homeRef, 'home.test.runtime.001');
});

// M4B07: wrong served model path is not accepted merely because endpoint is healthy.
test('M4B07 healthy loopback with wrong served materialization fails exact identity qualification', async () => {
  const binding = baseBinding();
  const root = tempDir('wrong-model');
  const modelDirectory = path.join(root, 'expected');
  fs.mkdirSync(modelDirectory, { recursive: true });
  await assert.rejects(
    qualifyActivatedMlxRuntime({
      binding,
      modelDirectory,
      fetchImpl: async (url, options = {}) => {
        if (url.endsWith('/health')) return jsonResponse({ status: 'ok' });
        if (url.endsWith('/v1/models')) return jsonResponse({ object: 'list', data: [{ id: path.join(root, 'other') }] });
        if (url.endsWith('/v1/chat/completions')) return jsonResponse({ model: JSON.parse(options.body).model });
        throw new Error(`unexpected URL ${url}`);
      }
    }),
    (error) => errorCode(error) === 'ACTIVATED_RUNTIME_MODEL_IDENTITY_QUALIFICATION_FAILED'
  );
});

// M4B13: one completed lived turn becomes one content-addressed index; no transcript/replay store is created.
test('M4B13 one natural completed browser turn forms one shared content-addressed evidence index without replay', () => {
  const binding = baseBinding();
  const runtimeBindingReceipt = {
    schemaVersion: ACTIVATED_MODEL_RUNTIME_RECEIPT_SCHEMA,
    receiptRef: 'receipt.vexlife.activated-model-runtime.fixture',
    state: 'ACTIVATED_MODEL_RUNTIME_QUALIFIED',
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef
  };
  const browserTurnReceipt = {
    schemaVersion: 'vexlife.browser-companion-turn/v1',
    state: 'TURN_COMPLETED',
    actualHttpCall: true,
    loopbackOnly: true,
    modelNameOrBoundedTestProfileRef: binding.bindingRef,
    conversationHeadSha256: 'a'.repeat(64),
    requestEventRef: 'event.request.fixture',
    requestEventSha256: 'b'.repeat(64),
    responseEventRef: 'event.response.fixture',
    responseEventSha256: 'c'.repeat(64),
    promptContextReceiptRef: 'receipt.prompt-context.fixture',
    modelTurnWitness: { model: 'default_model', fingerprint: 'fixture' }
  };
  const one = formCultivatedFirstLivedTurnEvidence({ binding, runtimeBindingReceipt, browserTurnReceipt });
  const two = formCultivatedFirstLivedTurnEvidence({ binding, runtimeBindingReceipt, browserTurnReceipt });
  assert.equal(one.sharedEvidenceRef, two.sharedEvidenceRef);
  assert.equal(one.transcriptCopied, false);
  assert.equal(one.replayPerformed, false);
  assert.equal(one.conversationHeadSha256, browserTurnReceipt.conversationHeadSha256);
  assert.equal(Object.hasOwn(one, 'transcript'), false);
});

// M4B13 negative: fixtures/non-http/non-loopback turns may never masquerade as the first lived Victor episode.
test('M4B13 simulated or non-completed turn is rejected as shared lived evidence', () => {
  const binding = baseBinding();
  const runtimeBindingReceipt = {
    schemaVersion: ACTIVATED_MODEL_RUNTIME_RECEIPT_SCHEMA,
    receiptRef: 'receipt.vexlife.activated-model-runtime.fixture',
    state: 'ACTIVATED_MODEL_RUNTIME_QUALIFIED',
    bindingRef: binding.bindingRef,
    modelRef: binding.modelRef,
    modelProfileRef: binding.modelProfileRef
  };
  assert.throws(
    () => formCultivatedFirstLivedTurnEvidence({
      binding,
      runtimeBindingReceipt,
      browserTurnReceipt: {
        schemaVersion: 'vexlife.browser-companion-turn/v1',
        state: 'TURN_COMPLETED',
        actualHttpCall: false,
        loopbackOnly: true,
        modelNameOrBoundedTestProfileRef: binding.bindingRef
      }
    }),
    (error) => errorCode(error) === 'CULTIVATED_FIRST_LIVED_TURN_EVIDENCE_INVALID'
  );
});

// Keep this source-only fixture explicit: it proves deterministic code, not a real M4 host run.
test('M4B18 deterministic fixture suite carries no real model/activation/training effect', () => {
  const binding = baseBinding();
  assert.deepEqual(binding.effects, {
    activation: false,
    succession: false,
    training: false,
    weightMutation: false,
    memoryMutation: false,
    publication: false,
    modelDownload: false,
    artifactMutation: false
  });
  assert.equal(semanticHash({ fixture: true }).length, 64);
});

// [VXG RealForever]
