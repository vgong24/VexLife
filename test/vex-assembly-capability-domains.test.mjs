import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CAPABILITY_ASSIMILATION_MODES } from '../src/core/capability-assimilation-runtime.mjs';
import { ROOT_CAPABILITY_KERNEL } from '../src/core/capability.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import { sourceManifestBucketId, sourceManifestBucketPath } from '../src/core/source-manifest.mjs';
import { createServerOwnedBrowserCompanionBridge } from '../scripts/serve-browser.mjs';
import {
  VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF,
  VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS,
  VEX_ASSEMBLY_ONLINE_HELD_STATE,
  bindVexAssemblyCapabilityDomainContext,
  createVexAssemblyCapabilityDomainSupport,
  readSourceManifestBackedCode,
} from '../src/core/vex-assembly-capability-domains.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN_REFS = Object.values(VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS).sort();

function requestResult(requests) {
  return {
    content: JSON.stringify({ intentDisposition: 'REQUEST_READ_ONLY_FUNCTIONS', requests }),
    model: 'model.test.va-i04.request-formation',
  };
}

function makeQualifiedHome(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-va-i04-home-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  initializeLivedCompanionHome({
    home,
    homeRef: 'vex-home.va-i04-test',
    familyRef: 'vex-family.va-i04-test',
    deviceRef: 'device.vexlife.va-i04-test',
    companionLineageRef: 'companion-lineage.vexlife.va-i04-test',
  });
  fs.mkdirSync(path.join(home, 'recovery'), { recursive: true });
  fs.writeFileSync(path.join(home, 'config', 'model.json'), `${JSON.stringify({
    schemaVersion: 'vexlife.model-configuration/v1',
    state: 'BOUND_QUALIFIED',
    profileRef: 'profile.vexlife.va-i04-test',
    activeModelBundleRef: 'model-bundle.vexlife.va-i04-test',
    generationRef: 'generation.vexlife.va-i04-test',
    modelProfileRef: 'model-profile.vexlife.va-i04-test',
    endpoint: 'http://127.0.0.1:18080',
    requestModel: 'model.va-i04-test',
    activeArtifactRef: 'artifact.va-i04-test',
    runtimeDependencyRef: 'runtime.va-i04-test',
    runtimePid: 12345,
    runtimeExecutablePath: '/private/not-projected/runtime',
    runtimeExecutableSha256: 'a'.repeat(64),
    runtimeExecutableSha256SourcePinned: 'a'.repeat(64),
    runtimeArguments: ['--local-only'],
    runtimeMaterializationRoot: '/private/not-projected/materialization',
    modelPath: '/private/not-projected/model',
    projectorPath: '/private/not-projected/projector',
    qualificationReceiptRef: 'receipt.vexlife.initialization.va-i04-test',
    automaticDownload: false,
    automaticActivation: false,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(home, 'recovery', 'vex-initialization-receipt.json'), `${JSON.stringify({
    schemaVersion: 'vexlife.initialization-receipt/v1',
    receiptRef: 'receipt.vexlife.initialization.va-i04-test',
    state: 'RUNTIME_QUALIFIED',
    profileRef: 'profile.vexlife.va-i04-test',
    modelBundleRef: 'model-bundle.vexlife.va-i04-test',
    generationRef: 'generation.vexlife.va-i04-test',
    modelProfileRef: 'model-profile.vexlife.va-i04-test',
    formedAt: '2026-10-08T20:00:00.000Z',
    runtime: { pid: 12345, disposition: 'REUSED_QUALIFIED_BOUND_RUNTIME' },
  }, null, 2)}\n`);
  return home;
}

function capabilityRegistry() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint', 'capability-registry.json'), 'utf8'));
}

test('VA-I04 keeps the canonical five-tool root and adds one non-executable parent with four exact-current read-only children', () => {
  const registry = capabilityRegistry();
  assert.equal(registry.registryVersion, 4);
  assert.deepEqual(registry.rootCapabilityKernel, ROOT_CAPABILITY_KERNEL);
  assert.deepEqual(registry.rootCapabilityKernel, [
    'capability.search',
    'capability.describe',
    'process.resolve',
    'context.where',
    'help.render',
  ]);
  const parent = registry.capabilities.find((item) => item.capabilityRef === VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF);
  assert.ok(parent);
  assert.equal(parent.defaultStage, 'EXPLAINABLE');
  assert.equal(parent.effectClass, 'READ_ONLY');
  assert.equal(parent.permissionRef, 'permission.none');
  assert.equal(parent.toolContract, undefined);
  assert.deepEqual([...parent.childCapabilityRefs].sort(), DOMAIN_REFS);
  for (const capabilityRef of DOMAIN_REFS) {
    const child = registry.capabilities.find((item) => item.capabilityRef === capabilityRef);
    assert.ok(child, capabilityRef);
    assert.equal(child.parentCapabilityRef, VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF);
    assert.equal(child.defaultStage, 'EXECUTABLE');
    assert.equal(child.effectClass, 'READ_ONLY');
    assert.equal(child.permissionRef, 'permission.none');
    assert.equal(child.resourceClass, 'IO_BOUNDED');
    assert.equal(child.currentness.state, 'CURRENT');
    assert.equal(child.currentness.compatibility, 'COMPATIBLE');
    assert.equal(child.currentness.sourceVersionRef, 'capability-registry.v4');
    assert.equal(child.toolContract.externalEffectsExecuted, false);
  }
  for (const capabilityRef of ROOT_CAPABILITY_KERNEL) {
    const root = registry.capabilities.find((item) => item.capabilityRef === capabilityRef);
    assert.equal(root.currentness.sourceVersionRef, 'capability-registry.v4');
  }
});

test('server-owned ADOPTED_READ_ONLY activation exposes all four domains on the first request and overrides caller/model activation attempts', async () => {
  let captured = null;
  const sentinel = Object.freeze({ ref: 'bridge.va-i04.capture' });
  const result = createServerOwnedBrowserCompanionBridge({
    sourceRoot: ROOT,
    companionHome: '/not-read-by-captured-bridge',
    endpoint: 'http://127.0.0.1:18080',
    model: 'model.va-i04-test',
    runtimeMode: CAPABILITY_ASSIMILATION_MODES.ADOPTED_READ_ONLY,
    bridgeFactory(options) {
      captured = options;
      return sentinel;
    },
  });
  assert.equal(result, sentinel);
  assert.ok(captured?.capabilityRuntime);
  let inferenceCount = 0;
  let resolved = null;
  let schedulerHold = null;
  try {
    resolved = await captured.capabilityRuntime.resolveTurn({
      taskIntent: 'Tell me what you can observe here without changing anything.',
      endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' },
      context: {
        taskRef: 'task.va-i04.first-turn',
        activeCapabilityRef: 'capability.vexlife.github.publication',
      },
      inference: async ({ requestContent }) => {
        inferenceCount += 1;
        if (inferenceCount === 1) {
          assert.match(requestContent, new RegExp(VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF.replaceAll('.', '\\.')));
          for (const capabilityRef of DOMAIN_REFS) {
            assert.match(requestContent, new RegExp(capabilityRef.replaceAll('.', '\\.')));
          }
          assert.match(requestContent, new RegExp(`"activeCapabilityRef":"${VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF.replaceAll('.', '\\.')}`));
          assert.doesNotMatch(requestContent, /capability\.vexlife\.github\.publication/u);
          return requestResult([
            { requestRef: 'read.online', capabilityRef: VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.ONLINE, arguments: {}, dependencyRefs: [] },
            { requestRef: 'read.context', capabilityRef: 'context.where', arguments: {}, dependencyRefs: [] },
          ]);
        }
        assert.match(requestContent, new RegExp(`"activeCapabilityRef":"${VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF.replaceAll('.', '\\.')}`));
        assert.match(requestContent, new RegExp(VEX_ASSEMBLY_ONLINE_HELD_STATE));
        return { content: 'The read-only domains are visible; ONLINE is held without a provider.', model: 'model.test.va-i04.synthesis' };
      },
    });
  } catch (error) {
    schedulerHold = String(error?.message ?? error);
  }

  if (schedulerHold !== null) {
    assert.match(schedulerHold, /^scheduler runtime admission held capability read (?:read\.online|read\.context): /u);
    assert.equal(
      schedulerHold.includes('RESOURCE:CPU_CONCURRENCY_INSUFFICIENT') ||
        schedulerHold.includes('RESOURCE:CPU_LOAD_CONSTRAINED'),
      true,
      schedulerHold,
    );
    assert.equal(inferenceCount, 1);
  } else {
    assert.ok(resolved);
    assert.equal(inferenceCount, 2);
    assert.equal(resolved.runtimeProjection.mode, CAPABILITY_ASSIMILATION_MODES.ADOPTED_READ_ONLY);
    assert.equal(resolved.runtimeProjection.toolRequestCount, 2);
    assert.equal(resolved.runtimeProjection.observationRefs.length, 2);
    assert.equal(resolved.runtimeProjection.exactlyOnceReceipts.length, 0);
    assert.equal(resolved.runtimeProjection.externalEffectsExecuted, false);
  }
  assert.equal(bindVexAssemblyCapabilityDomainContext({ activeCapabilityRef: 'capability.bad' }).activeCapabilityRef,
    VEX_ASSEMBLY_CAPABILITY_DOMAIN_PARENT_REF);
});

test('DIRECT and canonical E2 modes remain tool-free and do not receive VA-I04 domain activation', async () => {
  let direct = null;
  createServerOwnedBrowserCompanionBridge({
    sourceRoot: ROOT,
    companionHome: '/not-read-by-captured-bridge',
    runtimeMode: CAPABILITY_ASSIMILATION_MODES.DIRECT_SINGLE_TURN,
    bridgeFactory(options) { direct = options; return {}; },
  });
  assert.equal(direct.capabilityRuntime, null);

  let e2 = null;
  createServerOwnedBrowserCompanionBridge({
    sourceRoot: ROOT,
    companionHome: '/not-read-by-captured-bridge',
    runtimeMode: CAPABILITY_ASSIMILATION_MODES.CANONICAL_E2_UNTAUGHT_G0,
    bridgeFactory(options) { e2 = options; return {}; },
  });
  let calls = 0;
  const resolved = await e2.capabilityRuntime.resolveTurn({
    taskIntent: 'Canonical E2 stays tool-free.',
    endpointProfile: { profileRef: 'profile.test', admitted: true, endpoint: 'http://127.0.0.1:1', model: 'test' },
    context: { activeCapabilityRef: 'capability.bad' },
    inference: async () => {
      calls += 1;
      return { content: 'Tool-free.', model: 'model.test.e2' };
    },
  });
  assert.equal(calls, 1);
  assert.equal(resolved.runtimeProjection.inferenceCount, 1);
  assert.equal(resolved.runtimeProjection.toolRequestCount, 0);
  assert.equal(Object.hasOwn(resolved.runtimeProjection, 'capabilityFrameInput'), false);
});

test('LOCAL and ONLINE are bounded observations with no mutation, credentials, or network effects', async () => {
  const support = createVexAssemblyCapabilityDomainSupport({ sourceRoot: ROOT, home: '/unused' });
  const local = await support.executors[VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.LOCAL]({});
  assert.equal(local.payload.state, 'CURRENT_BOUNDED_LOCAL_OBSERVATION');
  assert.equal(local.payload.effects.networkPerformed, false);
  assert.equal(local.payload.effects.filesystemMutationPerformed, false);
  assert.equal(local.payload.source.manifestRef, 'source-manifest.vexlife.universal-blueprint.001');
  assert.equal(Object.hasOwn(local.payload.source, 'absolutePath'), false);

  const online = await support.executors[VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.ONLINE]({});
  assert.equal(online.payload.state, VEX_ASSEMBLY_ONLINE_HELD_STATE);
  assert.equal(online.payload.providerRef, null);
  assert.equal(online.payload.networkPerformed, false);
  assert.equal(online.payload.credentialsUsed, false);
  assert.equal(online.payload.effects.networkPerformed, false);
});

test('VEXHOME returns only canonical Home identity plus qualified runtime/recovery summary and performs no recovery or Memory read', async (t) => {
  const home = makeQualifiedHome(t);
  const support = createVexAssemblyCapabilityDomainSupport({ sourceRoot: ROOT, home });
  const observed = await support.executors[VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.VEXHOME]({});
  assert.equal(observed.payload.state, 'CURRENT_VEXHOME_RUNTIME_SUMMARY');
  assert.deepEqual(observed.payload.homeIdentity, {
    homeRef: 'vex-home.va-i04-test',
    deviceRef: 'device.vexlife.va-i04-test',
    companionLineageRef: 'companion-lineage.vexlife.va-i04-test',
  });
  assert.equal(observed.payload.modelBinding.automaticDownload, false);
  assert.equal(observed.payload.modelBinding.automaticActivation, false);
  assert.equal(observed.payload.runtimeSummary.livenessObserved, false);
  assert.equal(observed.payload.runtimeSummary.processEffectPerformed, false);
  assert.equal(observed.payload.recoverySummary.exactBindingMatch, true);
  assert.equal(observed.payload.recoverySummary.recoveryExecuted, false);
  assert.equal(observed.payload.effects.memoryReadPerformed, false);
  assert.equal(observed.payload.effects.memoryMutationPerformed, false);
  assert.equal(JSON.stringify(observed.payload).includes(home), false);
  assert.equal(JSON.stringify(observed.payload).includes('/private/not-projected'), false);
});

test('CODE reads only manifest-addressed regular UTF-8 source and returns exact source identity with a bounded excerpt', async () => {
  const support = createVexAssemblyCapabilityDomainSupport({ sourceRoot: ROOT, home: '/unused' });
  const observed = await support.executors[VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.CODE]({ path: 'docs/CULTURE.md' });
  assert.equal(observed.payload.state, 'CURRENT_CODE_SOURCE');
  assert.equal(observed.payload.requestedPath, 'docs/CULTURE.md');
  assert.match(observed.payload.sourceIdentity.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(observed.payload.sourceIdentity.manifestRef, 'source-manifest.vexlife.universal-blueprint.001');
  assert.ok(observed.payload.excerptBytes <= 4096);
  assert.equal(observed.payload.effects.repositoryMutationPerformed, false);
  assert.equal(observed.payload.effects.processMutationPerformed, false);
  assert.equal(observed.payload.effects.networkPerformed, false);
  for (const rejectedPath of [
    '../package.json',
    '.git/config',
    'runtime/private.json',
    'models/private.gguf',
    'generated/private.json',
    'source-manifest-parts/bucket-23.json',
    'node_modules/example/index.js',
    'not-manifested-va-i04.txt',
  ]) {
    const rejected = await support.executors[VEX_ASSEMBLY_CAPABILITY_DOMAIN_REFS.CODE]({ path: rejectedPath });
    assert.equal(rejected.payload.state, 'HELD_CODE_READ_REJECTED', rejectedPath);
    assert.equal(rejected.payload.content, null, rejectedPath);
    assert.equal(rejected.payload.effects.repositoryMutationPerformed, false, rejectedPath);
  }
});

test('CODE fails closed on a manifest-claimed filesystem symlink without following it', { skip: process.platform === 'win32' }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-va-i04-code-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const descriptor = JSON.parse(fs.readFileSync(path.join(ROOT, 'SOURCE-MANIFEST.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'SOURCE-MANIFEST.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
  const relativePath = 'safe.txt';
  const target = path.join(root, 'target.txt');
  fs.writeFileSync(target, 'secret-through-link\n');
  fs.symlinkSync(target, path.join(root, relativePath));
  const bytes = fs.readFileSync(target);
  const bucketId = sourceManifestBucketId(relativePath);
  const bucketRef = sourceManifestBucketPath(bucketId);
  fs.mkdirSync(path.join(root, 'source-manifest-parts'), { recursive: true });
  fs.writeFileSync(path.join(root, bucketRef), `${JSON.stringify({
    schemaVersion: descriptor.partSchemaVersion,
    bucketId,
    files: [{ path: relativePath, mode: '100644', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }],
  }, null, 2)}\n`);
  const result = readSourceManifestBackedCode({ sourceRoot: root, relativePath });
  assert.equal(result.state, 'HELD_CODE_READ_REJECTED');
  assert.equal(result.reasonCode, 'CODE_SOURCE_SYMLINK_REJECTED');
  assert.equal(result.content, null);
});

// [VXG RealForever]
