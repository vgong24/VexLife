import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';

import {
  BROWSER_COMPANION_AVAILABILITY_PATH,
  createProductionHereticRuntimeBrowserOptions,
  createVexLifeBrowserServer,
  hereticRuntimeBrowserOptions,
  resolveHereticPersistentRuntimeCurrentLink,
  resolveHereticPersistentRuntimeLink,
} from '../scripts/serve-browser.mjs';
import {
  HERETIC_PRODUCT_ENDPOINT,
  HERETIC_REQUEST_MODEL,
  HERETIC_RUNTIME_IDENTITY,
  HERETIC_RUNTIME_RECEIPT_RELATIVE_PATH,
  HERETIC_VEXLIFE_HOST_EXECUTION_PROFILE_REF,
  HERETIC_VEXLIFE_RUNTIME_RECEIPT_SCHEMA,
  formHereticModelConfiguration,
} from '../src/core/heretic-runtime-link.mjs';
import {
  HERETIC_PERSISTENT_RUNTIME_BINDING_SCHEMA,
  currentHereticRuntimeOwnerSourceIdentity,
  hereticPersistentRuntimeServerArgs,
} from '../src/core/heretic-persistent-runtime-owner.mjs';
import { loadBrowserCompanionHomeIdentity } from '../src/core/browser-companion-bridge.mjs';
import {
  BROWSER_COMPANION_CONVERSATION_CURRENTNESS_PATH,
  BROWSER_COMPANION_STATUS_PATH
} from '../src/core/browser-companion-bridge.mjs';

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

function binding(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-binding-input/v1',
    truthClass: 'FOREIGN_CANONICAL_COMPANION_BINDING',
    bindingRef: 'binding.availability-http',
    homeRef: 'home.availability-http',
    companionLineageRef: 'lineage.availability-http',
    modelRefOrNull: 'model.availability-http',
    generationRefOrNull: 'generation.availability-http',
    bindingState: 'BOUND',
    currentness: 'CURRENT',
    sourceRefs: ['source.binding.availability-http'],
    ...overrides
  };
}

function runtimeObservation(overrides = {}) {
  return {
    schemaVersion: 'vexlife.companion-runtime-adapter-observation/v1',
    truthClass: 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION',
    observationRef: 'observation.availability-http.healthy',
    adapterRef: 'adapter.runtime.availability-http',
    bindingRef: 'binding.availability-http',
    homeRef: 'home.availability-http',
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: 'HEALTHY',
    qualificationState: 'CURRENT',
    safeReentryState: 'NOT_AVAILABLE',
    currentness: 'CURRENT',
    evidenceRefs: ['evidence.runtime.availability-http'],
    ...overrides
  };
}

function assertNoAuthority(body) {
  assert.equal(body.effectAuthorityGranted, false);
  assert.equal(body.rendererAuthorityGranted, false);
  assert.equal(body.modelIdentityAuthorityGranted, false);
  assert.equal(body.processAuthorityGranted, false);
  assert.equal(body.conversationAuthorityGranted, false);
}

test('Conversation currentness route is exact-identity GET-only and delegates no message content', async () => {
  const calls = [];
  const companionBridge = {
    conversationCurrentness(input) {
      calls.push(input);
      return Object.freeze({
        schemaVersion: 'vexlife.browser-companion-conversation-currentness/v1',
        state: 'CURRENT',
        truthClass: 'CURRENT_LOCAL_CONVERSATION_IDENTITY',
        ...input,
        channelSha256: 'a'.repeat(64),
        channelRecordSha256: 'b'.repeat(64),
        headMessageRefOrNull: 'message.current.001',
        headSequenceOrNull: 7,
        canonicalConversationHeadSha256: 'c'.repeat(64),
        headUpdatedAtOrNull: '2026-10-29T00:00:00.000Z',
        effectsPerformed: false
      });
    }
  };
  await withServer({ companionBridge }, async (base) => {
    const query = new URLSearchParams({
      projectRef: 'project.self-development',
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion'
    });
    const response = await fetch(`${base}${BROWSER_COMPANION_CONVERSATION_CURRENTNESS_PATH}?${query.toString()}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.state, 'CURRENT');
    assert.equal(body.canonicalConversationHeadSha256, 'c'.repeat(64));
    assert.equal(body.effectsPerformed, false);
    assert.deepEqual(calls, [{
      projectRef: 'project.self-development',
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.self-development.companion'
    }]);

    const bad = await fetch(`${base}${BROWSER_COMPANION_CONVERSATION_CURRENTNESS_PATH}?projectRef=project.self-development`);
    assert.equal(bad.status, 400);
    const held = await bad.json();
    assert.equal(held.state, 'HELD');
    assert.equal(held.effectsPerformed, false);

    const post = await fetch(`${base}${BROWSER_COMPANION_CONVERSATION_CURRENTNESS_PATH}?${query.toString()}`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET');
  });
});

test('availability route composes exact VR01 READY truth from injected foreign evidence', async () => {
  await withServer({
    resolveCompanionBinding: async () => binding(),
    resolveCompanionRuntimeObservation: async () => runtimeObservation()
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.schemaVersion, 'vexlife.companion-availability/v1');
    assert.equal(body.truthClass, 'SOURCE_BOUND_COMPANION_AVAILABILITY');
    assert.equal(body.availabilityState, 'READY');
    assert.equal(body.recoveryClass, 'NONE_REQUIRED');
    assert.equal(body.runtimeState, 'HEALTHY');
    assert.equal(body.qualificationState, 'CURRENT');
    assertNoAuthority(body);
  });
});

test('availability route exposes canonical RECOVERABLE without executing recovery', async () => {
  await withServer({
    resolveCompanionBinding: async () => binding(),
    resolveCompanionRuntimeObservation: async () => runtimeObservation({
      observationRef: 'observation.availability-http.stopped',
      runtimeOwnershipState: 'NO_OWNED_RUNTIME',
      runtimeState: 'STOPPED',
      qualificationState: 'STALE',
      safeReentryState: 'AVAILABLE'
    })
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.availabilityState, 'RECOVERABLE');
    assert.equal(body.recoveryClass, 'SAFE_REENTRY_AVAILABLE');
    assert.equal(body.reasonCode, 'EXACT_SAME_BINDING_REENTRY_AVAILABLE');
    assertNoAuthority(body);
  });
});

test('availability route fails closed when either foreign provider is unavailable', async () => {
  for (const options of [
    {},
    { resolveCompanionBinding: async () => binding() },
    { resolveCompanionRuntimeObservation: async () => runtimeObservation() }
  ]) {
    await withServer(options, async (base) => {
      const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.failureCode, 'COMPANION_AVAILABILITY_PROVIDER_UNAVAILABLE');
      assert.equal(Object.values(body.effects).every((value) => value === false), true);
    });
  }
});

test('availability route rejects malformed evidence without leaking provider detail', async () => {
  await withServer({
    resolveCompanionBinding: async () => ({ ...binding(), schemaVersion: 'foreign.schema' }),
    resolveCompanionRuntimeObservation: async () => runtimeObservation()
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.failureCode, 'COMPANION_AVAILABILITY_NOT_CURRENT');
    assert.equal(Object.values(body.effects).every((value) => value === false), true);
  });

  await withServer({
    resolveCompanionBinding: async () => { throw new Error('private binding path'); },
    resolveCompanionRuntimeObservation: async () => runtimeObservation()
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.failureCode, 'COMPANION_AVAILABILITY_NOT_CURRENT');
    assert.equal(JSON.stringify(body).includes('private binding path'), false);
  });
});

test('foreign runtime identity becomes canonical HELD rather than synthetic READY', async () => {
  await withServer({
    resolveCompanionBinding: async () => binding(),
    resolveCompanionRuntimeObservation: async () => runtimeObservation({
      bindingRef: 'binding.foreign',
      homeRef: 'home.foreign'
    })
  }, async (base) => {
    const response = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.availabilityState, 'HELD');
    assert.equal(body.recoveryClass, 'BINDING_REVALIDATION_REQUIRED');
    assert.equal(body.reasonCode, 'FOREIGN_IDENTITY_MISMATCH');
    assertNoAuthority(body);
  });
});

test('availability route is GET-only and existing status does not consume availability providers', async () => {
  let bindingCalls = 0;
  let runtimeCalls = 0;
  await withServer({
    resolveCompanionBinding: async () => { bindingCalls += 1; return binding(); },
    resolveCompanionRuntimeObservation: async () => { runtimeCalls += 1; return runtimeObservation(); }
  }, async (base) => {
    const post = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET');
    assert.equal(bindingCalls, 0);
    assert.equal(runtimeCalls, 0);

    const status = await fetch(base + BROWSER_COMPANION_STATUS_PATH);
    assert.equal(status.status, 200);
    assert.equal(bindingCalls, 0);
    assert.equal(runtimeCalls, 0);

    const availability = await fetch(base + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(availability.status, 200);
    assert.equal(bindingCalls, 1);
    assert.equal(runtimeCalls, 1);
  });
});


function writeProductionDiscoveryJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

test('production browser composition discovers current bound Heretic receipt from Home when launch-only receipt environment is absent', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-production-heretic-discovery-'));
  const deviceRef = 'device.production-heretic-discovery';
  const lineageRef = 'lineage.production-heretic-discovery';
  const homeRef = 'home.production-heretic-discovery';
  const personRef = 'person.production-heretic-discovery';
  const runtimeReceiptPath = path.join(home, ...HERETIC_RUNTIME_RECEIPT_RELATIVE_PATH.split('/'));
  const modelPath = path.join(home, 'fixture-model');
  const pythonEnvironmentRoot = path.join(home, 'fixture-python');
  const pythonPath = path.join(pythonEnvironmentRoot, 'bin', 'python');
  const sourceIdentity = currentHereticRuntimeOwnerSourceIdentity();
  const deadPid = 2147483000;
  const previousReceiptEnvironment = process.env.VEXLIFE_HERETIC_RUNTIME_RECEIPT_PATH;
  let server = null;
  let browser = null;
  try {
    writeProductionDiscoveryJson(path.join(home, 'config', 'home.json'), {
      schemaVersion: 'vexlife.home/v0',
      homeRef,
      currentDeviceRef: deviceRef,
      currentCompanionLineageRef: lineageRef,
    });
    writeProductionDiscoveryJson(path.join(home, 'devices', deviceRef + '.json'), {
      deviceRef,
      companionLineageRef: lineageRef,
      personRef,
      createdAt: '2026-10-30T00:00:00.000Z',
    });
    const binding = {
      schemaVersion: HERETIC_PERSISTENT_RUNTIME_BINDING_SCHEMA,
      authorityRef: 'authority.production-heretic-discovery',
      modelRef: HERETIC_RUNTIME_IDENTITY.modelRef,
      modelProfileRef: HERETIC_RUNTIME_IDENTITY.modelProfileRef,
      artifactRef: HERETIC_RUNTIME_IDENTITY.artifactRef,
      artifactCustodyEvidenceRef: HERETIC_RUNTIME_IDENTITY.artifactCustodyEvidenceRef,
      artifactContentSetSha256: HERETIC_RUNTIME_IDENTITY.artifactContentSetSha256,
      runtimeAdapterRef: HERETIC_RUNTIME_IDENTITY.runtimeAdapterRef,
      runtimeClass: HERETIC_RUNTIME_IDENTITY.runtimeClass,
      hostExecutionProfileRef: HERETIC_VEXLIFE_HOST_EXECUTION_PROFILE_REF,
      pythonVersion: HERETIC_RUNTIME_IDENTITY.pythonVersion,
      mlxLmVersion: HERETIC_RUNTIME_IDENTITY.mlxLmVersion,
      trainerSourceCommit: HERETIC_RUNTIME_IDENTITY.trainerSourceCommit,
      modelPath,
      pythonPath,
      pythonEnvironmentRoot,
      port: Number(new URL(HERETIC_PRODUCT_ENDPOINT).port),
      receiptPath: runtimeReceiptPath,
      sourceIdentity,
    };
    const runtimeArgs = hereticPersistentRuntimeServerArgs(binding);
    const receipt = {
      schemaVersion: HERETIC_VEXLIFE_RUNTIME_RECEIPT_SCHEMA,
      receiptRef: 'receipt.vexlife.heretic-persistent-runtime.production-discovery',
      state: 'PERSISTENT_MLX_RUNTIME_QUALIFIED',
      formedAt: '2026-10-30T00:00:00.000Z',
      authorityRef: binding.authorityRef,
      modelRef: binding.modelRef,
      modelProfileRef: binding.modelProfileRef,
      artifactRef: binding.artifactRef,
      artifactCustodyEvidenceRef: binding.artifactCustodyEvidenceRef,
      artifactContentSetSha256: binding.artifactContentSetSha256,
      runtimeAdapterRef: binding.runtimeAdapterRef,
      runtimeClass: binding.runtimeClass,
      transportClass: HERETIC_RUNTIME_IDENTITY.transportClass,
      hostExecutionProfileRef: binding.hostExecutionProfileRef,
      pythonVersion: binding.pythonVersion,
      mlxLmVersion: binding.mlxLmVersion,
      trainerSourceCommit: binding.trainerSourceCommit,
      modelPath,
      pythonPath,
      pythonEnvironmentRoot,
      endpoint: HERETIC_PRODUCT_ENDPOINT,
      requestModel: HERETIC_REQUEST_MODEL,
      sourceIdentity,
      runtime: {
        pid: deadPid,
        processGroupId: deadPid,
        exactOwnedDetachedGroup: true,
        args: runtimeArgs,
      },
      qualification: {
        healthAndExactModelVerified: true,
        actualChatCompletionPerformed: true,
        loadResultRef: null,
      },
      effects: {
        modelRuntime: true,
        providerNetwork: false,
        modelDownload: false,
        artifactMutation: false,
        training: false,
        weightMutation: false,
        memoryMutation: false,
        activation: false,
        succession: false,
        publication: false,
        repositoryMutation: false,
        homeMutation: false,
      },
    };
    let runtimeLive = false;
    let recoveryEffectCalls = 0;
    const resourceObserver = () => Object.freeze({
      schemaVersion: 'vexlife.host-resource-observation/v1',
      truthClass: 'SOURCE_BOUND_HOST_RESOURCE_OBSERVATION',
      resourceObservationRef: runtimeLive ? 'observation.production-heretic-discovery.runtime-live' : 'observation.production-heretic-discovery.runtime-stopped',
      resourceRef: 'resource.vexlife.heretic.persistent-runtime',
      resourceClass: 'HERETIC_PERSISTENT_MLX_RUNTIME',
      ownershipState: runtimeLive ? 'EXACT_VEX_OWNED' : 'UNOWNED',
      lifecycleState: runtimeLive ? 'CURRENT' : 'ABANDONED',
      currentness: 'CURRENT',
      ownershipProof: runtimeLive ? {
        currentness: 'CURRENT', ownerReceiptRef: receipt.receiptRef, exactOwnedProcessInstance: true, pidMatchOnly: false,
        runtimeIdentityRef: 'runtime.production-heretic-discovery.current', executableIdentityRef: 'executable.production-heretic-discovery.current',
        processGroupIdentityRef: 'process-group.production-heretic-discovery.current',
      } : null,
      lifecycleEvidenceRefOrNull: runtimeLive ? null : 'evidence.production-heretic-discovery.verified-not-live',
      sourceRefs: [receipt.receiptRef, 'source.test.production-heretic-resource-observer'],
    });
    const recoverPersistentHereticRuntime = async () => {
      recoveryEffectCalls += 1; runtimeLive = true;
      return Object.freeze({ disposition: 'STARTED_NEW_EXACT_MLX_RUNTIME', pid: receipt.runtime.pid, endpoint: receipt.endpoint, requestModel: receipt.requestModel, receipt });
    };

    const homeIdentity = loadBrowserCompanionHomeIdentity(home);
    writeProductionDiscoveryJson(path.join(home, 'config', 'model.json'), formHereticModelConfiguration({ homeIdentity, receipt }));
    writeProductionDiscoveryJson(runtimeReceiptPath, receipt);

    delete process.env.VEXLIFE_HERETIC_RUNTIME_RECEIPT_PATH;
    const productionOptions = createProductionHereticRuntimeBrowserOptions(home);
    assert.equal(typeof productionOptions.resolveCompanionBinding, 'function');
    assert.equal(typeof productionOptions.resolveCompanionRuntimeObservation, 'function');
    server = createVexLifeBrowserServer(productionOptions);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    let address = server.address();
    assert.equal(typeof address, 'object');
    const response = await fetch('http://127.0.0.1:' + address.port + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(response.status, 200);
    const availability = await response.json();
    assert.equal(availability.schemaVersion, 'vexlife.companion-availability/v1');
    assert.equal(availability.truthClass, 'SOURCE_BOUND_COMPANION_AVAILABILITY');
    assert.equal(availability.availabilityState, 'RECOVERABLE');
    assert.equal(availability.recoveryClass, 'SAFE_REENTRY_AVAILABLE');
    assert.equal(availability.runtimeOwnershipState, 'NO_OWNED_RUNTIME');
    assert.equal(availability.runtimeState, 'STOPPED');
    assert.equal(availability.qualificationState, 'STALE');
    assert.equal(availability.bindingState, 'BOUND');
    assert.equal(availability.homeRef, homeRef);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server = null;

    const runtimeLink = resolveHereticPersistentRuntimeLink({ runtimeHome: home });
    const recoveryProofOptions = hereticRuntimeBrowserOptions(runtimeLink, {
      companionHome: home,
      resolveCurrentRuntimeLink: () => resolveHereticPersistentRuntimeCurrentLink({ runtimeHome: home, resourceObserver }),
      recoverPersistentHereticRuntime,
    });
    server = createVexLifeBrowserServer(recoveryProofOptions);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    address = server.address();
    assert.equal(typeof address, 'object');

    let recoveryPosts = 0, turnPosts = 0;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/v1/companion/recovery-action' && request.method() === 'POST') recoveryPosts += 1;
      if (pathname === '/api/v1/companion/turn' && request.method() === 'POST') turnPosts += 1;
    });
    await page.goto('http://127.0.0.1:' + address.port + '/reference/browser/?open=vex', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__?.chat?.companionAvailabilityState?.() === 'READY', null, { timeout: 5000 });
    const browserState = await page.evaluate(() => ({
      availabilityState: globalThis.__VEXLIFE_APP__.chat.companionAvailabilityState(),
      interfaceCurrentness: globalThis.__VEXLIFE_APP__.chat.interfaceCurrentness().kind,
      sendDisabled: document.querySelector('#composer button[type="submit"]')?.disabled ?? null,
      recoveryVisible: !document.querySelector('#companionRecoveryButton')?.hidden,
    }));
    assert.deepEqual(browserState, { availabilityState: 'READY', interfaceCurrentness: 'READY', sendDisabled: false, recoveryVisible: false });
    assert.equal(recoveryPosts, 1); assert.equal(recoveryEffectCalls, 1); assert.equal(turnPosts, 0);
    const readyResponse = await fetch('http://127.0.0.1:' + address.port + BROWSER_COMPANION_AVAILABILITY_PATH);
    assert.equal(readyResponse.status, 200);
    const readyAvailability = await readyResponse.json();
    assert.equal(readyAvailability.availabilityState, 'READY');
    assert.equal(readyAvailability.recoveryClass, 'NONE_REQUIRED');
  } finally {
    if (browser) await browser.close();
    if (server?.listening) await new Promise((resolve) => server.close(() => resolve()));
    if (previousReceiptEnvironment === undefined) delete process.env.VEXLIFE_HERETIC_RUNTIME_RECEIPT_PATH;
    else process.env.VEXLIFE_HERETIC_RUNTIME_RECEIPT_PATH = previousReceiptEnvironment;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// [VXG RealForever]
