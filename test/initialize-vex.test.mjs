import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/vex-operational-profiles.json', import.meta.url), 'utf8'));
import {
  browserBindingForProfile,
  buildQualificationRequest,
  buildRuntimeArguments,
  buildVexInitializationPlan,
  classifyHomeState,
  resolveArtifactDeliveryChannels,
  runtimeProcessEvidenceMatches,
  selectOperationalProfile,
  validateOperationalProfileRegistry
} from '../src/core/vex-initialization.mjs';
import {
  ARTIFACT_FAILURE_CODES,
  ARTIFACT_PARTIAL_SOURCE_SCHEMA,
  classifyVerifiedArtifact,
  downloadVerifiedArtifact,
  downloadVerifiedArtifactFromChannels,
  sha256File
} from '../src/core/model-provision.mjs';

const profile = registry.profiles[0];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixtureArtifact(payload, overrides = {}) {
  return {
    artifactRef: 'artifact.test.mirror-neutral.001',
    filename: 'artifact.bin',
    sha256: crypto.createHash('sha256').update(payload).digest('hex'),
    expectedBytes: payload.length,
    maxBytes: Math.max(payload.length + 1024, 4096),
    sourceRef: 'source.test.artifact.001',
    licenseRef: 'license.test.001',
    ...overrides
  };
}

function streamResponse(payload, { status = 200, headers = {} } = {}) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    }
  });
  return new Response(body, { status, headers });
}

function writePartialSource(target, artifact, channel) {
  fs.writeFileSync(`${target}.partial-source.json`, `${JSON.stringify({
    schemaVersion: ARTIFACT_PARTIAL_SOURCE_SCHEMA,
    artifactSha256: artifact.sha256,
    expectedBytes: artifact.expectedBytes,
    channelRef: channel.channelRef,
    sourceUrlWithoutQuery: new URL(channel.url).origin + new URL(channel.url).pathname
  }, null, 2)}\n`);
}

test('operational profile registry resolves the release-qualified Windows profile without widening public-release claims', () => {
  assert.deepEqual(validateOperationalProfileRegistry(registry), { ok: true, errors: [] });
  const normal = selectOperationalProfile({ registry, platform: 'win32', architecture: 'x64' });
  assert.equal(normal.state, 'PROFILE_RESOLVED');
  assert.equal(normal.profile.profileRef, profile.profileRef);
  assert.equal(normal.profile.state, 'RELEASE_QUALIFIED');
  assert.equal(normal.profile.releaseQualification.class, 'SOURCE_LOCAL_OPERATIONAL_PROFILE');
  assert.equal(normal.profile.releaseQualification.officialVerifiedBuildClaimed, false);
  assert.equal(normal.profile.releaseQualification.publicReleaseClaimed, false);
  assert.equal(normal.profile.releaseQualification.p11FreshHumanClaimed, false);
  for (const artifact of [...normal.profile.runtime.artifacts, ...normal.profile.modelArtifacts]) {
    assert.ok(Number.isSafeInteger(artifact.expectedBytes) && artifact.expectedBytes > 0);
  }
  const qualificationRoute = selectOperationalProfile({ registry, platform: 'win32', architecture: 'x64', mode: 'candidate-qualification', profileRef: profile.profileRef });
  assert.equal(qualificationRoute.state, 'PROFILE_RESOLVED');
});

test('source-local release-qualified Mac resolves in normal mode while truly unsupported hosts still fail closed without a default LLM', () => {
  const mac = selectOperationalProfile({ registry, platform: 'darwin', architecture: 'arm64' });
  assert.equal(mac.state, 'PROFILE_RESOLVED');
  assert.equal(mac.profile.profileRef, 'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.macos-arm64-m4-pro-metal.001');
  assert.equal(mac.profile.state, 'RELEASE_QUALIFIED');
  assert.equal(mac.profile.releaseQualification.class, 'SOURCE_LOCAL_OPERATIONAL_PROFILE');
  assert.equal(mac.profile.releaseQualification.officialVerifiedBuildClaimed, false);
  assert.equal(mac.profile.releaseQualification.publicReleaseClaimed, false);
  assert.equal(mac.profile.releaseQualification.p11FreshHumanClaimed, false);
  assert.equal(selectOperationalProfile({ registry, platform: 'linux', architecture: 'x64' }).state, 'UNSUPPORTED_HOST');
  assert.equal(JSON.stringify(registry).includes('default llm'), false);
  assert.equal(JSON.stringify(registry).includes('DEFAULT_LLM'), false);
});

test('Home classification distinguishes fresh, preserved and migration-required state', () => {
  assert.equal(classifyHomeState({ homeManifestPresent: false, homeDirectoryPresent: false, homeDirectoryNonEmpty: false }), 'FRESH_HOME_ALLOWED');
  assert.equal(classifyHomeState({ homeManifestPresent: true, homeDirectoryPresent: true, homeDirectoryNonEmpty: true }), 'EXISTING_HOME_PRESERVED');
  assert.equal(classifyHomeState({ homeManifestPresent: false, homeDirectoryPresent: true, homeDirectoryNonEmpty: true }), 'HOME_REQUIRES_MIGRATION_PLAN');
});

test('runtime reuse requires exact executable and exact bound argument tokens across Windows separator forms', () => {
  const expectedExecutablePath = 'C:\\Vex Home\\runtime\\llama-cpp-b10107\\llama-server.exe';
  const modelPath = 'C:\\Vex Home\\models\\model.gguf';
  const projectorPath = 'C:\\Vex Home\\models\\mmproj.gguf';
  const expectedArguments = buildRuntimeArguments(profile, { modelPath, projectorPath });
  const processEvidence = {
    name: 'llama-server.exe',
    executablePath: expectedExecutablePath,
    commandLine: '"C:/Vex Home/runtime/llama-cpp-b10107/llama-server.exe" -m "C:/Vex Home/models/model.gguf" --mmproj "C:/Vex Home/models/mmproj.gguf" --host 127.0.0.1 --port 18080 --n-predict 256 --reasoning-budget 128'
  };
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence, expectedExecutablePath, expectedArguments }), true);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: { ...processEvidence, name: 'node.exe' }, expectedExecutablePath, expectedArguments }), false);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: { ...processEvidence, executablePath: 'C:\\Other\\llama-server.exe' }, expectedExecutablePath, expectedArguments }), false);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: { ...processEvidence, commandLine: processEvidence.commandLine.replace('model.gguf"', 'other.gguf"') }, expectedExecutablePath, expectedArguments }), false);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: { ...processEvidence, commandLine: processEvidence.commandLine.replace('--host 127.0.0.1', '--host 0.0.0.0') }, expectedExecutablePath, expectedArguments }), false);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: { ...processEvidence, commandLine: processEvidence.commandLine.replace('model.gguf"', 'model.gguf.evil"') }, expectedExecutablePath, expectedArguments }), false);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: { ...processEvidence, commandLine: `${processEvidence.commandLine} --host 0.0.0.0` }, expectedExecutablePath, expectedArguments }), false);
  assert.equal(runtimeProcessEvidenceMatches({ processEvidence: { ...processEvidence, commandLine: processEvidence.commandLine.replace('--reasoning-budget 128', '--reasoning-budget 256') }, expectedExecutablePath, expectedArguments }), false);
});

test('runtime arguments and browser binding stay exact, bounded and loopback-bound', () => {
  const args = buildRuntimeArguments(profile, { modelPath: 'C:/home/models/model.gguf', projectorPath: 'C:/home/models/mmproj.gguf' });
  assert.ok(args.includes('127.0.0.1'));
  assert.ok(args.includes('18080'));
  assert.deepEqual(args.slice(-4), ['--n-predict', '256', '--reasoning-budget', '128']);
  assert.equal(args.includes(profile.endpoint.requestModel), false, 'runtime request-model identity is an API binding, not an assumed llama.cpp --alias capability');
  assert.deepEqual(browserBindingForProfile(profile), {
    VEXLIFE_COMPANION_ENDPOINT: 'http://127.0.0.1:18080',
    VEXLIFE_COMPANION_MODEL: 'Qwen3.5-4B-Q4_K_M',
    VEXLIFE_OPERATIONAL_PROFILE_REF: profile.profileRef
  });
});

test('runtime readiness qualification disables thinking without changing normal companion binding', () => {
  const request = buildQualificationRequest(profile);
  assert.deepEqual(request.chat_template_kwargs, { enable_thinking: false });
  assert.equal(request.model, profile.endpoint.requestModel);
  assert.equal(request.messages[0].content, profile.qualification.probePrompt);
  assert.equal(request.max_tokens, profile.qualification.probeMaxTokens);
  assert.equal(request.temperature, 0);
});

test('initialization plan exposes only the admitted product effects', () => {
  const plan = buildVexInitializationPlan({ profile, home: 'C:/VexHome', homeState: 'FRESH_HOME_ALLOWED', hostEvidence: { platform: 'win32', architecture: 'x64' }, mode: 'candidate-qualification' });
  assert.equal(plan.effects.networkFetch, true);
  assert.equal(plan.effects.loopbackOnly, true);
  assert.equal(plan.effects.repositoryWrite, false);
  assert.equal(plan.effects.memoryCanonicalWrite, false);
  assert.equal(plan.effects.training, false);
  assert.match(plan.planSha256, /^[0-9a-f]{64}$/u);
});

test('Windows setup and start surfaces require a qualified model binding before browser startup', () => {
  const setup = fs.readFileSync(path.join(ROOT, 'install/vexlife-setup.ps1'), 'utf8');
  const start = fs.readFileSync(path.join(ROOT, 'start-vexlife.ps1'), 'utf8');
  const cmdText = fs.readFileSync(path.join(ROOT, 'start-vexlife.cmd'), 'utf8');

  for (const script of [setup, start]) {
    assert.match(script, /scripts[\\\/]initialize-vex\.mjs/u);
    assert.match(script, /BOUND_QUALIFIED/u);
    assert.match(script, /VEXLIFE_COMPANION_ENDPOINT/u);
    assert.match(script, /VEXLIFE_COMPANION_MODEL/u);
  }
  assert.ok(setup.indexOf('scripts\\initialize-vex.mjs') < setup.indexOf('scripts\\serve-browser.mjs'));
  assert.ok(start.indexOf('$initArgs = @("$Root/scripts/initialize-vex.mjs"') < start.indexOf('$startedBrowser = Start-OwnedBrowserServer'));
  assert.equal(/Read-Host\s+"Model download URL/iu.test(setup), false);
  assert.equal(/Expected SHA-256 checksum/iu.test(setup), false);
  assert.match(cmdText, /start-vexlife\.ps1/u);
  assert.equal(cmdText.includes('scripts\\bootstrap.mjs'), false);
  for (const script of [setup, start]) {
    for (const required of [
      'vexlife.browser-process-receipt/v1',
      '--vexlife-browser-owner-token',
      '--vexlife-home',
      '--vexlife-repo',
      'Start-OwnedBrowserServer',
      'Get-OwnedBrowserServer',
      'processInstanceRef',
      'ownerToken'
    ]) assert.ok(script.includes(required), `missing durable browser process identity contract: ${required}`);
  }
  assert.equal(start.includes('& node "$Root/scripts/serve-browser.mjs"'), false);
  assert.match(start, /Get-ExactQualifiedRuntimeOwnership/u);
  assert.match(start, /runtime\.executableSha256/u);
  assert.match(start, /expectedModelPath/u);
  assert.match(start, /expectedProjectorPath/u);
});

test('candidate launcher authority remains an internal qualification-only environment route', () => {
  const setup = fs.readFileSync(path.join(ROOT, 'install/vexlife-setup.ps1'), 'utf8');
  const start = fs.readFileSync(path.join(ROOT, 'start-vexlife.ps1'), 'utf8');
  for (const script of [setup, start]) {
    assert.match(script, /VEXLIFE_CANDIDATE_PROFILE_REF/u);
    assert.match(script, /VEXLIFE_CANDIDATE_AUTHORITY_REF/u);
    assert.match(script, /candidate-qualification/u);
  }
  assert.match(setup, /VEXLIFE_SETUP_RUNTIME_CONSENT/u);
  assert.equal(setup.includes('--candidate-authority-ref') && setup.includes('Read-Host "Candidate'), false);
});

test('verified artifact download reuses exact cache, resumes only a source-bound partial and deletes integrity-mismatch partial state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-init-test-'));
  const payload = Buffer.from('abcdef0123456789'.repeat(4096));
  const artifact = fixtureArtifact(payload);
  const target = path.join(root, 'artifact.bin');
  const partial = `${target}.partial`;
  const channel = { channelRef: 'channel.test.primary', url: 'https://example.invalid/a.bin?token=not-persisted' };
  fs.writeFileSync(partial, payload.subarray(0, 1024));
  writePartialSource(target, artifact, channel);
  let seenRange = null;
  const fetchImpl = async (url, init = {}) => {
    seenRange = init.headers?.Range ?? null;
    const start = 1024;
    return streamResponse(payload.subarray(start), { status: 206, headers: { 'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}`, 'content-length': String(payload.length - start) } });
  };
  const result = await downloadVerifiedArtifact({ url: channel.url, channelRef: channel.channelRef, expectedSha256: artifact.sha256, finalPath: target, expectedBytes: payload.length, maxBytes: payload.length + 1, fetchImpl });
  assert.equal(seenRange, 'bytes=1024-');
  assert.equal(result.disposition, 'RESUMED_AND_VERIFIED');
  assert.equal(fs.existsSync(`${target}.partial-source.json`), false);
  assert.equal((await sha256File(target)), artifact.sha256);
  assert.equal((await classifyVerifiedArtifact({ finalPath: target, expectedSha256: artifact.sha256, expectedBytes: payload.length })).state, 'VERIFIED_REUSABLE');

  const second = await downloadVerifiedArtifact({ url: channel.url, channelRef: channel.channelRef, expectedSha256: artifact.sha256, finalPath: target, expectedBytes: payload.length, maxBytes: payload.length + 1, fetchImpl: async () => { throw new Error('network must not be used'); } });
  assert.equal(second.disposition, 'REUSED_VERIFIED');

  const badTarget = path.join(root, 'bad.bin');
  const badFetch = async () => streamResponse(Buffer.from('wrong'));
  await assert.rejects(
    () => downloadVerifiedArtifact({ url: channel.url, channelRef: channel.channelRef, expectedSha256: artifact.sha256, finalPath: badTarget, expectedBytes: artifact.expectedBytes, maxBytes: artifact.maxBytes, fetchImpl: badFetch }),
    (error) => error.code === ARTIFACT_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH
  );
  assert.equal(fs.existsSync(`${badTarget}.partial`), false);
  assert.equal(fs.existsSync(`${badTarget}.partial-source.json`), false);
});

test('DIST-CH-00/01/15 production registry is single-channel while artifact identity stays provider-neutral and cross-platform', () => {
  assert.deepEqual(validateOperationalProfileRegistry(registry), { ok: true, errors: [] });
  const deliveryEntries = Object.entries(registry.deliveryChannelsByArtifactRef);
  assert.ok(deliveryEntries.length >= 1);
  for (const [, channels] of deliveryEntries) assert.equal(channels.length, 1, 'production source does not invent a second mirror');
  for (const currentProfile of registry.profiles) {
    for (const artifact of [...currentProfile.runtime.artifacts, ...currentProfile.modelArtifacts]) assert.equal(Object.hasOwn(artifact, 'url'), false);
  }
  const windowsModel = registry.profiles.find((entry) => entry.platform === 'win32').modelArtifacts[0];
  const macModel = registry.profiles.find((entry) => entry.platform === 'darwin').modelArtifacts[0];
  assert.deepEqual(windowsModel, macModel);
  assert.deepEqual(resolveArtifactDeliveryChannels(registry, windowsModel.artifactRef), resolveArtifactDeliveryChannels(registry, macModel.artifactRef));

  const varied = structuredClone(registry);
  varied.deliveryChannelsByArtifactRef[windowsModel.artifactRef].push({ channelRef: 'channel.fixture.second', url: 'https://mirror.invalid/model.gguf' });
  assert.deepEqual(varied.profiles.find((entry) => entry.platform === 'win32').modelArtifacts[0], windowsModel);
  assert.deepEqual(validateOperationalProfileRegistry(varied), { ok: true, errors: [] });
});

test('DIST-CH-02 duplicate, missing and orphan delivery bindings fail closed', () => {
  const modelRef = registry.profiles[0].modelArtifacts[0].artifactRef;
  const missing = structuredClone(registry);
  delete missing.deliveryChannelsByArtifactRef[modelRef];
  assert.equal(validateOperationalProfileRegistry(missing).ok, false);

  const orphan = structuredClone(registry);
  orphan.deliveryChannelsByArtifactRef['artifact.orphan.001'] = [{ channelRef: 'channel.orphan.001', url: 'https://example.invalid/orphan.bin' }];
  assert.equal(validateOperationalProfileRegistry(orphan).ok, false);

  const duplicate = structuredClone(registry);
  const refs = Object.keys(duplicate.deliveryChannelsByArtifactRef);
  duplicate.deliveryChannelsByArtifactRef[refs[1]][0].channelRef = duplicate.deliveryChannelsByArtifactRef[refs[0]][0].channelRef;
  assert.equal(validateOperationalProfileRegistry(duplicate).ok, false);
});

test('DIST-CH-03 caller cannot inject or reorder source-managed delivery channels', () => {
  const artifactRef = registry.profiles[0].modelArtifacts[0].artifactRef;
  const resolved = resolveArtifactDeliveryChannels(registry, artifactRef);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved[0]), true);
  assert.deepEqual(resolved, registry.deliveryChannelsByArtifactRef[artifactRef]);
  assert.throws(() => resolved.push({ channelRef: 'channel.injected', url: 'https://evil.invalid/x' }), TypeError);
  const initializer = fs.readFileSync(path.join(ROOT, 'scripts/initialize-vex.mjs'), 'utf8');
  assert.equal(/--(?:artifact-)?channel|--mirror|delivery-channel/iu.test(initializer), false);
});

test('DIST-CH-04/05 unavailable primary alone may fall through to an ordered secondary channel', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-dist-ch-'));
  const payload = Buffer.from('mirror-neutral-payload');
  const artifact = fixtureArtifact(payload);
  const channels = [
    { channelRef: 'channel.fixture.primary', url: 'https://primary.invalid/artifact.bin' },
    { channelRef: 'channel.fixture.secondary', url: 'https://secondary.invalid/artifact.bin' }
  ];

  const primaryTarget = path.join(root, 'primary.bin');
  const primary = await downloadVerifiedArtifactFromChannels({ artifact, channels, finalPath: primaryTarget, fetchImpl: async (url) => {
    assert.equal(url, channels[0].url);
    return streamResponse(payload);
  } });
  assert.equal(primary.selectedChannelRef, channels[0].channelRef);
  assert.deepEqual(primary.attemptedChannelRefs, [channels[0].channelRef]);

  const fallbackTarget = path.join(root, 'fallback.bin');
  const seen = [];
  const fallback = await downloadVerifiedArtifactFromChannels({ artifact, channels, finalPath: fallbackTarget, fetchImpl: async (url) => {
    seen.push(url);
    if (url === channels[0].url) return new Response('unavailable', { status: 503 });
    return streamResponse(payload);
  } });
  assert.deepEqual(seen, channels.map((channel) => channel.url));
  assert.equal(fallback.selectedChannelRef, channels[1].channelRef);
  assert.deepEqual(fallback.attemptedChannelRefs, channels.map((channel) => channel.channelRef));
});

test('DIST-CH-06/07 integrity mismatch hard-stops without trying another channel', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-dist-integrity-'));
  const payload = Buffer.from('accepted-payload');
  const channels = [
    { channelRef: 'channel.fixture.primary', url: 'https://primary.invalid/artifact.bin' },
    { channelRef: 'channel.fixture.secondary', url: 'https://secondary.invalid/artifact.bin' }
  ];
  let secondaryCalls = 0;
  const artifact = fixtureArtifact(payload);
  await assert.rejects(
    () => downloadVerifiedArtifactFromChannels({ artifact, channels, finalPath: path.join(root, 'hash.bin'), fetchImpl: async (url) => {
      if (url === channels[1].url) secondaryCalls += 1;
      return streamResponse(Buffer.from('wrong-payload'));
    } }),
    (error) => error.code === ARTIFACT_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH
  );
  assert.equal(secondaryCalls, 0);

  const shortArtifact = fixtureArtifact(payload, { expectedBytes: payload.length + 1 });
  await assert.rejects(
    () => downloadVerifiedArtifactFromChannels({ artifact: shortArtifact, channels, finalPath: path.join(root, 'bytes.bin'), fetchImpl: async (url) => {
      if (url === channels[1].url) secondaryCalls += 1;
      return streamResponse(payload);
    } }),
    (error) => error.code === ARTIFACT_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH
  );
  assert.equal(secondaryCalls, 0);
});

test('DIST-CH-08 malformed resume protocol hard-stops and clears partial provenance without fallback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-dist-protocol-'));
  const payload = Buffer.from('0123456789abcdef');
  const artifact = fixtureArtifact(payload);
  const target = path.join(root, 'artifact.bin');
  const channels = [
    { channelRef: 'channel.fixture.primary', url: 'https://primary.invalid/artifact.bin' },
    { channelRef: 'channel.fixture.secondary', url: 'https://secondary.invalid/artifact.bin' }
  ];
  fs.writeFileSync(`${target}.partial`, payload.subarray(0, 4));
  writePartialSource(target, artifact, channels[0]);
  let secondaryCalls = 0;
  await assert.rejects(
    () => downloadVerifiedArtifactFromChannels({ artifact, channels, finalPath: target, fetchImpl: async (url) => {
      if (url === channels[1].url) secondaryCalls += 1;
      return streamResponse(payload.subarray(4), { status: 206, headers: { 'content-range': `bytes 5-${payload.length - 1}/${payload.length}` } });
    } }),
    (error) => error.code === ARTIFACT_FAILURE_CODES.CHANNEL_PROTOCOL_INVALID
  );
  assert.equal(secondaryCalls, 0);
  assert.equal(fs.existsSync(`${target}.partial`), false);
  assert.equal(fs.existsSync(`${target}.partial-source.json`), false);
});

test('DIST-CH-09/10 matching sidecar resumes while missing or stale provenance restarts from byte zero', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-dist-resume-'));
  const payload = Buffer.from('0123456789abcdef');
  const artifact = fixtureArtifact(payload);
  const channel = { channelRef: 'channel.fixture.primary', url: 'https://primary.invalid/artifact.bin?download=true' };

  const resumeTarget = path.join(root, 'resume.bin');
  fs.writeFileSync(`${resumeTarget}.partial`, payload.subarray(0, 4));
  writePartialSource(resumeTarget, artifact, channel);
  let resumeRange = null;
  await downloadVerifiedArtifactFromChannels({ artifact, channels: [channel], finalPath: resumeTarget, fetchImpl: async (url, init = {}) => {
    resumeRange = init.headers?.Range ?? null;
    return streamResponse(payload.subarray(4), { status: 206, headers: { 'content-range': `bytes 4-${payload.length - 1}/${payload.length}`, 'content-length': String(payload.length - 4) } });
  } });
  assert.equal(resumeRange, 'bytes=4-');

  const staleTarget = path.join(root, 'stale.bin');
  fs.writeFileSync(`${staleTarget}.partial`, payload.subarray(0, 4));
  let staleRange = 'NOT_CALLED';
  await downloadVerifiedArtifactFromChannels({ artifact, channels: [channel], finalPath: staleTarget, fetchImpl: async (url, init = {}) => {
    staleRange = init.headers?.Range ?? null;
    return streamResponse(payload);
  } });
  assert.equal(staleRange, null);
});

test('DIST-CH-11 switching channels discards prior partial provenance and starts the next channel at byte zero', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-dist-switch-'));
  const payload = Buffer.from('channel-switch-payload');
  const artifact = fixtureArtifact(payload);
  const target = path.join(root, 'artifact.bin');
  const channels = [
    { channelRef: 'channel.fixture.primary', url: 'https://primary.invalid/artifact.bin' },
    { channelRef: 'channel.fixture.secondary', url: 'https://secondary.invalid/artifact.bin' }
  ];
  let secondaryRange = 'NOT_CALLED';
  let primaryCalls = 0;
  const result = await downloadVerifiedArtifactFromChannels({ artifact, channels, finalPath: target, fetchImpl: async (url, init = {}) => {
    if (url === channels[0].url) {
      primaryCalls += 1;
      throw new TypeError('simulated transport loss');
    }
    secondaryRange = init.headers?.Range ?? null;
    assert.equal(fs.existsSync(`${target}.partial-source.json`), true, 'secondary owns a freshly written sidecar before network');
    const sidecar = JSON.parse(fs.readFileSync(`${target}.partial-source.json`, 'utf8'));
    assert.equal(sidecar.channelRef, channels[1].channelRef);
    return streamResponse(payload);
  } });
  assert.equal(primaryCalls, 1);
  assert.equal(secondaryRange, null);
  assert.equal(result.selectedChannelRef, channels[1].channelRef);
});

test('DIST-CH-12 verified cache performs zero network regardless of available channels', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-dist-cache-'));
  const payload = Buffer.from('already-verified');
  const artifact = fixtureArtifact(payload);
  const target = path.join(root, 'artifact.bin');
  fs.writeFileSync(target, payload);
  let fetchCalls = 0;
  const result = await downloadVerifiedArtifactFromChannels({
    artifact,
    channels: [
      { channelRef: 'channel.fixture.primary', url: 'https://primary.invalid/a?secret=1' },
      { channelRef: 'channel.fixture.secondary', url: 'https://secondary.invalid/a?secret=2' }
    ],
    finalPath: target,
    fetchImpl: async () => { fetchCalls += 1; throw new Error('must not fetch'); }
  });
  assert.equal(fetchCalls, 0);
  assert.equal(result.disposition, 'REUSED_VERIFIED');
});

test('DIST-CH-13/14 receipts are channel-bounded and sanitized; credentialed endpoints fail before effect', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-dist-provenance-'));
  const payload = Buffer.from('provenance-payload');
  const artifact = fixtureArtifact(payload);
  const target = path.join(root, 'artifact.bin');
  const channels = [
    { channelRef: 'channel.fixture.primary', url: 'https://primary.invalid/artifact.bin?download=true&signature=secret' },
    { channelRef: 'channel.fixture.secondary', url: 'https://secondary.invalid/artifact.bin?token=secret' }
  ];
  const result = await downloadVerifiedArtifactFromChannels({ artifact, channels, finalPath: target, fetchImpl: async (url) => streamResponse(payload) });
  assert.equal(result.selectedChannelRef, channels[0].channelRef);
  assert.deepEqual(result.attemptedChannelRefs, [channels[0].channelRef]);
  assert.equal(result.recordedSourceUrl, 'https://primary.invalid/artifact.bin');
  assert.equal(JSON.stringify(result).includes('signature=secret'), false);

  let fetchCalls = 0;
  await assert.rejects(
    () => downloadVerifiedArtifactFromChannels({ artifact, channels: [{ channelRef: 'channel.bad', url: 'https://user:pass@example.invalid/artifact.bin' }], finalPath: path.join(root, 'bad.bin'), fetchImpl: async () => { fetchCalls += 1; return streamResponse(payload); } }),
    (error) => error.code === ARTIFACT_FAILURE_CODES.ARTIFACT_POLICY_REJECTED
  );
  assert.equal(fetchCalls, 0);
});

test('DIST-CH-16/17 existing runtime/model owners and held effect classes remain unchanged by delivery-channel composition', () => {
  const initializer = fs.readFileSync(path.join(ROOT, 'scripts/initialize-vex.mjs'), 'utf8');
  assert.match(initializer, /materializeRuntime\(profile, artifactPaths\)/u);
  assert.match(initializer, /buildRuntimeArguments\(profile/u);
  assert.match(initializer, /promptConsent\(profile\)/u);
  assert.equal(initializer.includes('--mirror'), false);
  const plan = buildVexInitializationPlan({ profile, home: 'C:/VexHome', homeState: 'EXISTING_HOME_PRESERVED', hostEvidence: { platform: 'win32', architecture: 'x64' }, mode: 'normal' });
  assert.deepEqual({
    repositoryWrite: plan.effects.repositoryWrite,
    publicEffect: plan.effects.publicEffect,
    memoryCanonicalWrite: plan.effects.memoryCanonicalWrite,
    training: plan.effects.training,
    loopbackOnly: plan.effects.loopbackOnly
  }, {
    repositoryWrite: false,
    publicEffect: false,
    memoryCanonicalWrite: false,
    training: false,
    loopbackOnly: true
  });
});
