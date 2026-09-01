import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import {
  ARTIFACT_CHUNK_MANIFEST_SCHEMA,
  ARTIFACT_DELIVERY_FAILURE_CODES,
  ArtifactDeliveryError,
  formDeterministicArtifactMirror,
  resolveAndDownloadArtifact,
  validateArtifactDescriptor,
  validateArtifactDeliveryRegistry,
  validateArtifactRegistry,
  validateChunkManifest
} from '../src/core/artifact-delivery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const response = (bytes, status = 200, headers = {}) => new Response(new ReadableStream({
  start(controller) { controller.enqueue(Buffer.from(bytes)); controller.close(); }
}), { status, headers });
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vex-artifact-delivery-'));
const artifactFor = (bytes, overrides = {}) => ({
  artifactRef: 'artifact.synthetic.alpha',
  filename: 'artifact.bin',
  mediaType: 'application/octet-stream',
  sha256: sha(bytes),
  expectedBytes: bytes.length,
  maxBytes: Math.max(bytes.length, 1),
  sourceRef: 'source.synthetic.alpha',
  licenseRef: 'license.synthetic.alpha',
  ...overrides
});
const artifacts = (artifact) => ({
  schemaVersion: 'vexlife.artifact-registry/v1',
  registryRef: 'registry.vexlife.artifacts.test',
  state: 'TEST',
  artifacts: [artifact]
});
const delivery = (artifactRef, channels, policies = null) => ({
  schemaVersion: 'vexlife.artifact-delivery-registry/v1',
  registryRef: 'registry.vexlife.artifact-delivery.test',
  state: 'TEST',
  defaultPolicyRef: 'policy.test.default',
  policies: policies ?? [{ policyRef: 'policy.test.default', allowedTransportClasses: ['DIRECT_HTTPS_FILE_V1', 'VERIFIED_CHUNK_MANIFEST_V1'] }],
  channelsByArtifactRef: { [artifactRef]: channels }
});

function directDownloadStub() {
  return async ({ url, expectedSha256, expectedBytes, finalPath, fetchImpl }) => {
    const existing = fs.existsSync(finalPath) ? fs.readFileSync(finalPath) : null;
    if (existing && existing.length === expectedBytes && sha(existing) === expectedSha256) {
      return { disposition: 'REUSED_VERIFIED', bytes: existing.length, actualSha256: expectedSha256 };
    }
    const res = await fetchImpl(url, { redirect: 'follow', headers: {} });
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length !== expectedBytes) throw new Error(`artifact byte count mismatch: expected ${expectedBytes}, actual ${bytes.length}`);
    const actualSha256 = sha(bytes);
    if (actualSha256 !== expectedSha256) throw new Error(`checksum mismatch: expected ${expectedSha256}, actual ${actualSha256}`);
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    fs.writeFileSync(finalPath, bytes);
    return { disposition: 'DOWNLOADED_AND_VERIFIED', bytes: bytes.length, actualSha256 };
  };
}

function chunkManifest(artifact, partBuffers, base = 'https://mirror.invalid/release/') {
  let offset = 0;
  const cumulative = crypto.createHash('sha256');
  const parts = partBuffers.map((bytes, index) => {
    cumulative.update(bytes);
    const part = {
      index,
      offset,
      bytes: bytes.length,
      sha256: sha(bytes),
      cumulativeBytes: offset + bytes.length,
      cumulativeSha256: cumulative.copy().digest('hex'),
      assetName: `artifact.bin.part-${index + 1}`,
      url: `${base}artifact.bin.part-${index + 1}`
    };
    offset += bytes.length;
    return part;
  });
  const manifest = {
    schemaVersion: ARTIFACT_CHUNK_MANIFEST_SCHEMA,
    artifactRef: artifact.artifactRef,
    filename: artifact.filename,
    expectedBytes: artifact.expectedBytes,
    expectedSha256: artifact.sha256,
    chunking: { algorithm: 'FIXED_BYTES', chunkBytes: partBuffers[0].length },
    parts,
    sourceRef: artifact.sourceRef,
    licenseRef: artifact.licenseRef,
    releaseRef: 'release.synthetic.alpha'
  };
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, bytes, sha256: sha(bytes) };
}

function chunkFetch(manifestUrl, manifestBytes, partMap, { failOnce = new Set(), calls = [] } = {}) {
  return async (url, init = {}) => {
    calls.push({ url, redirect: init.redirect });
    if (url === manifestUrl) return response(manifestBytes, 200, { 'content-length': String(manifestBytes.length) });
    if (failOnce.has(url)) {
      failOnce.delete(url);
      throw Object.assign(new Error('synthetic network unavailable'), { name: 'TypeError' });
    }
    const bytes = partMap.get(url);
    if (!bytes) return response(Buffer.from('missing'), 404);
    return response(bytes, 200, { 'content-length': String(bytes.length) });
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof ArtifactDeliveryError && error.code === code);
}

test('MIR-00 artifact identity is exact and excludes delivery/provider fields', () => {
  const bytes = Buffer.from('artifact');
  assert.equal(validateArtifactRegistry(artifacts(artifactFor(bytes))).artifacts.length, 1);
  assert.throws(() => validateArtifactRegistry({ ...artifacts(artifactFor(bytes)), providerPreference: 'forbidden' }), ArtifactDeliveryError);
  for (const forbidden of ['url', 'provider', 'channels', 'activeModelBundleRef']) {
    assert.throws(() => validateArtifactDescriptor({ ...artifactFor(bytes), [forbidden]: 'forbidden' }), ArtifactDeliveryError);
  }
});

test('MIR-01 source-managed channel order wins over caller-shaped noise', async () => {
  const bytes = Buffer.from('primary');
  const artifact = artifactFor(bytes);
  const target = path.join(home(), 'artifact.bin');
  const calls = [];
  const registry = delivery(artifact.artifactRef, [
    { channelRef: 'channel.primary', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://primary.invalid/a' },
    { channelRef: 'channel.secondary', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://secondary.invalid/a' }
  ]);
  const result = await resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef,
    finalPath: target,
    artifactRegistry: artifacts(artifact),
    deliveryRegistry: registry,
    directDownload: directDownloadStub(),
    channels: [{ channelRef: 'channel.injected' }],
    fetchImpl: async (url, init) => { calls.push({ url, init }); return response(bytes); }
  });
  assert.equal(result.selectedChannelRef, 'channel.primary');
  assert.deepEqual(calls.map((item) => item.url), ['https://primary.invalid/a']);
});

test('MIR-02 higher-level delivery does not change the legacy direct call contract', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/artifact-delivery.mjs'), 'utf8');
  assert.match(source, /directDownload\(\{\s*url:\s*channel\.url,\s*expectedSha256:/su);
  assert.equal(source.includes('channelRef: channel.channelRef,\n      expectedSha256'), false);
});

test('MIR-03 direct primary channel success is verified', async () => {
  const bytes = Buffer.from('hello-direct');
  const artifact = artifactFor(bytes);
  const target = path.join(home(), artifact.filename);
  const result = await resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef,
    finalPath: target,
    artifactRegistry: artifacts(artifact),
    deliveryRegistry: delivery(artifact.artifactRef, [{ channelRef: 'channel.direct', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://direct.invalid/file?download=true' }]),
    directDownload: directDownloadStub(),
    fetchImpl: async () => response(bytes)
  });
  assert.equal(result.actualSha256, artifact.sha256);
  assert.equal(result.selectedChannelRef, 'channel.direct');
  assert.equal(result.recordedSourceUrl.includes('?'), false);
});

test('MIR-04 only typed CHANNEL_UNAVAILABLE advances to fallback', async () => {
  const bytes = Buffer.from('fallback');
  const artifact = artifactFor(bytes);
  const target = path.join(home(), artifact.filename);
  const calls = [];
  const result = await resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef,
    finalPath: target,
    artifactRegistry: artifacts(artifact),
    deliveryRegistry: delivery(artifact.artifactRef, [
      { channelRef: 'channel.one', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://one.invalid/a' },
      { channelRef: 'channel.two', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://two.invalid/a' }
    ]),
    directDownload: directDownloadStub(),
    fetchImpl: async (url) => { calls.push(url); return url.includes('one.invalid') ? response(Buffer.alloc(0), 404) : response(bytes); }
  });
  assert.deepEqual(result.attemptedChannelRefs, ['channel.one', 'channel.two']);
  assert.equal(result.selectedChannelRef, 'channel.two');
});

test('MIR-05 direct integrity mismatch hard-stops without fallback', async () => {
  const bytes = Buffer.from('right');
  const artifact = artifactFor(bytes);
  const calls = [];
  await expectCode(resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef,
    finalPath: path.join(home(), artifact.filename),
    artifactRegistry: artifacts(artifact),
    deliveryRegistry: delivery(artifact.artifactRef, [
      { channelRef: 'channel.bad', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://bad.invalid/a' },
      { channelRef: 'channel.good', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://good.invalid/a' }
    ]),
    directDownload: directDownloadStub(),
    fetchImpl: async (url) => { calls.push(url); return response(url.includes('bad.invalid') ? Buffer.from('wrong') : bytes); }
  }), ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH);
  assert.deepEqual(calls, ['https://bad.invalid/a']);
});

test('MIR-06/MIR-07 chunk manifest binds source-pinned digest, final identity and contiguous topology', () => {
  const whole = Buffer.from('aaaabbbbcccc');
  const artifact = artifactFor(whole);
  const formed = chunkManifest(artifact, [Buffer.from('aaaa'), Buffer.from('bbbb'), Buffer.from('cccc')]);
  const channel = { channelRef: 'channel.chunk', transportClass: 'VERIFIED_CHUNK_MANIFEST_V1', manifestUrl: 'https://mirror.invalid/manifest', manifestSha256: formed.sha256 };
  assert.equal(validateChunkManifest(formed.manifest, { artifact, channel, manifestSha256: formed.sha256 }).parts.length, 3);
  assert.throws(() => validateChunkManifest({ ...formed.manifest, parts: formed.manifest.parts.map((part, index) => index === 1 ? { ...part, offset: 5 } : part) }, { artifact, channel, manifestSha256: formed.sha256 }), ArtifactDeliveryError);
  assert.throws(() => validateChunkManifest({ ...formed.manifest, sourceRef: 'source.other' }, { artifact, channel, manifestSha256: formed.sha256 }), ArtifactDeliveryError);
});

test('MIR-06 manifest digest mismatch hard-stops before fallback', async () => {
  const whole = Buffer.from('aaaabbbb');
  const artifact = artifactFor(whole);
  const formed = chunkManifest(artifact, [Buffer.from('aaaa'), Buffer.from('bbbb')]);
  const badChannel = { channelRef: 'channel.chunk.bad', transportClass: 'VERIFIED_CHUNK_MANIFEST_V1', manifestUrl: 'https://mirror.invalid/manifest', manifestSha256: '0'.repeat(64) };
  const calls = [];
  await expectCode(resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef,
    finalPath: path.join(home(), artifact.filename),
    artifactRegistry: artifacts(artifact),
    deliveryRegistry: delivery(artifact.artifactRef, [badChannel, { channelRef: 'channel.direct.good', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://good.invalid/a' }]),
    directDownload: directDownloadStub(),
    fetchImpl: async (url) => { calls.push(url); return url === badChannel.manifestUrl ? response(formed.bytes) : response(whole); }
  }), ARTIFACT_DELIVERY_FAILURE_CODES.ARTIFACT_INTEGRITY_MISMATCH);
  assert.deepEqual(calls, [badChannel.manifestUrl]);
});

test('MIR-08/MIR-17 synthetic 3-part artifact reconstructs byte-identically', async () => {
  const parts = [Buffer.from('aaaa'), Buffer.from('bbbb'), Buffer.from('cccc')];
  const whole = Buffer.concat(parts);
  const artifact = artifactFor(whole);
  const formed = chunkManifest(artifact, parts);
  const channel = { channelRef: 'channel.chunk', transportClass: 'VERIFIED_CHUNK_MANIFEST_V1', manifestUrl: 'https://mirror.invalid/manifest', manifestSha256: formed.sha256 };
  const map = new Map(formed.manifest.parts.map((part, index) => [part.url, parts[index]]));
  const target = path.join(home(), artifact.filename);
  const result = await resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef,
    finalPath: target,
    artifactRegistry: artifacts(artifact),
    deliveryRegistry: delivery(artifact.artifactRef, [channel]),
    directDownload: directDownloadStub(),
    fetchImpl: chunkFetch(channel.manifestUrl, formed.bytes, map)
  });
  assert.equal(result.actualSha256, artifact.sha256);
  assert.deepEqual(fs.readFileSync(target), whole);
});

test('MIR-09 same-channel retry resumes only after the exact committed sidecar', async () => {
  const parts = [Buffer.from('aaaa'), Buffer.from('bbbb')];
  const whole = Buffer.concat(parts);
  const artifact = artifactFor(whole);
  const formed = chunkManifest(artifact, parts);
  const channel = { channelRef: 'channel.chunk', transportClass: 'VERIFIED_CHUNK_MANIFEST_V1', manifestUrl: 'https://mirror.invalid/manifest', manifestSha256: formed.sha256 };
  const map = new Map(formed.manifest.parts.map((part, index) => [part.url, parts[index]]));
  const target = path.join(home(), artifact.filename);
  const firstCalls = [];
  await expectCode(resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef, finalPath: target, artifactRegistry: artifacts(artifact), deliveryRegistry: delivery(artifact.artifactRef, [channel]), directDownload: directDownloadStub(),
    fetchImpl: chunkFetch(channel.manifestUrl, formed.bytes, map, { failOnce: new Set([formed.manifest.parts[1].url]), calls: firstCalls })
  }), ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE);
  assert.equal(fs.existsSync(`${target}.assembly-sidecar.json`), true);
  const secondCalls = [];
  const result = await resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef, finalPath: target, artifactRegistry: artifacts(artifact), deliveryRegistry: delivery(artifact.artifactRef, [channel]), directDownload: directDownloadStub(),
    fetchImpl: chunkFetch(channel.manifestUrl, formed.bytes, map, { calls: secondCalls })
  });
  assert.equal(result.disposition, 'RESUMED_AND_VERIFIED');
  assert.equal(secondCalls.some((item) => item.url === formed.manifest.parts[0].url), false);
  assert.equal(secondCalls.some((item) => item.url === formed.manifest.parts[1].url), true);
});

test('MIR-10 switching channels never reuses prior partial provenance', async () => {
  const parts = [Buffer.from('aaaa'), Buffer.from('bbbb')];
  const whole = Buffer.concat(parts);
  const artifact = artifactFor(whole);
  const a = chunkManifest(artifact, parts, 'https://a.invalid/release/');
  const b = chunkManifest(artifact, parts, 'https://b.invalid/release/');
  const channelA = { channelRef: 'channel.a', transportClass: 'VERIFIED_CHUNK_MANIFEST_V1', manifestUrl: 'https://a.invalid/manifest', manifestSha256: a.sha256 };
  const channelB = { channelRef: 'channel.b', transportClass: 'VERIFIED_CHUNK_MANIFEST_V1', manifestUrl: 'https://b.invalid/manifest', manifestSha256: b.sha256 };
  const map = new Map([...a.manifest.parts.map((part, index) => [part.url, parts[index]]), ...b.manifest.parts.map((part, index) => [part.url, parts[index]])]);
  const calls = [];
  const failOnce = new Set([a.manifest.parts[1].url]);
  const fetchImpl = async (url, init = {}) => {
    calls.push(url);
    if (url === channelA.manifestUrl) return response(a.bytes);
    if (url === channelB.manifestUrl) return response(b.bytes);
    if (failOnce.has(url)) { failOnce.delete(url); throw Object.assign(new Error('unavailable'), { name: 'TypeError' }); }
    return response(map.get(url));
  };
  const target = path.join(home(), artifact.filename);
  const result = await resolveAndDownloadArtifact({ artifactRef: artifact.artifactRef, finalPath: target, artifactRegistry: artifacts(artifact), deliveryRegistry: delivery(artifact.artifactRef, [channelA, channelB]), directDownload: directDownloadStub(), fetchImpl });
  assert.equal(result.selectedChannelRef, 'channel.b');
  assert.equal(calls.filter((url) => url === b.manifest.parts[0].url).length, 1);
});

test('MIR-10 direct-channel fallback clears legacy partial provenance before switching', async () => {
  const bytes = Buffer.from('direct-fallback');
  const artifact = artifactFor(bytes);
  const target = path.join(home(), artifact.filename);
  const observations = [];
  let call = 0;
  const directDownload = async ({ finalPath }) => {
    call += 1;
    if (call === 1) {
      fs.writeFileSync(`${finalPath}.partial`, Buffer.from('foreign-prefix'));
      throw Object.assign(new Error('network unavailable'), { name: 'TypeError' });
    }
    observations.push(fs.existsSync(`${finalPath}.partial`));
    fs.writeFileSync(finalPath, bytes);
    return { disposition: 'DOWNLOADED_AND_VERIFIED', bytes: bytes.length, actualSha256: artifact.sha256 };
  };
  const result = await resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef,
    finalPath: target,
    artifactRegistry: artifacts(artifact),
    deliveryRegistry: delivery(artifact.artifactRef, [
      { channelRef: 'channel.direct.one', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://one.invalid/a' },
      { channelRef: 'channel.direct.two', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://two.invalid/a' }
    ]),
    directDownload,
    fetchImpl: async () => { throw new Error('unused'); }
  });
  assert.equal(result.selectedChannelRef, 'channel.direct.two');
  assert.deepEqual(observations, [false]);
});

test('MIR-11 tampered cumulative checkpoint is discarded and restarted', async () => {
  const parts = [Buffer.from('aaaa'), Buffer.from('bbbb')];
  const whole = Buffer.concat(parts);
  const artifact = artifactFor(whole);
  const formed = chunkManifest(artifact, parts);
  const channel = { channelRef: 'channel.chunk', transportClass: 'VERIFIED_CHUNK_MANIFEST_V1', manifestUrl: 'https://mirror.invalid/manifest', manifestSha256: formed.sha256 };
  const map = new Map(formed.manifest.parts.map((part, index) => [part.url, parts[index]]));
  const target = path.join(home(), artifact.filename);
  await expectCode(resolveAndDownloadArtifact({ artifactRef: artifact.artifactRef, finalPath: target, artifactRegistry: artifacts(artifact), deliveryRegistry: delivery(artifact.artifactRef, [channel]), directDownload: directDownloadStub(), fetchImpl: chunkFetch(channel.manifestUrl, formed.bytes, map, { failOnce: new Set([formed.manifest.parts[1].url]) }) }), ARTIFACT_DELIVERY_FAILURE_CODES.CHANNEL_UNAVAILABLE);
  fs.appendFileSync(`${target}.assembly.partial`, 'tamper');
  const calls = [];
  await resolveAndDownloadArtifact({ artifactRef: artifact.artifactRef, finalPath: target, artifactRegistry: artifacts(artifact), deliveryRegistry: delivery(artifact.artifactRef, [channel]), directDownload: directDownloadStub(), fetchImpl: chunkFetch(channel.manifestUrl, formed.bytes, map, { calls }) });
  assert.equal(calls.some((item) => item.url === formed.manifest.parts[0].url), true);
});

test('MIR-12 verified final cache performs zero network and selects no channel', async () => {
  const bytes = Buffer.from('cached');
  const artifact = artifactFor(bytes);
  const root = home();
  const target = path.join(root, artifact.filename);
  fs.writeFileSync(target, bytes);
  const result = await resolveAndDownloadArtifact({
    artifactRef: artifact.artifactRef, finalPath: target, artifactRegistry: artifacts(artifact), deliveryRegistry: delivery(artifact.artifactRef, [{ channelRef: 'channel.direct', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://direct.invalid/a' }]), directDownload: directDownloadStub(), fetchImpl: async () => { throw new Error('network must not run'); }
  });
  assert.equal(result.disposition, 'REUSED_VERIFIED');
  assert.equal(result.providerOrNetworkEffect, false);
  assert.equal(result.selectedChannelRef, null);
  assert.deepEqual(result.attemptedChannelRefs, []);
});

test('MIR-13 receipt sanitization removes query material and credential-shaped source URLs fail closed', async () => {
  const bytes = Buffer.from('secretless');
  const artifact = artifactFor(bytes);
  const result = await resolveAndDownloadArtifact({ artifactRef: artifact.artifactRef, finalPath: path.join(home(), artifact.filename), artifactRegistry: artifacts(artifact), deliveryRegistry: delivery(artifact.artifactRef, [{ channelRef: 'channel.direct', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://host.invalid/a?download=true' }]), directDownload: directDownloadStub(), fetchImpl: async () => response(bytes) });
  assert.equal(JSON.stringify(result).includes('TOPSECRET'), false);
  assert.equal(result.recordedSourceUrl, 'https://host.invalid/a');
  assert.throws(() => validateArtifactDeliveryRegistry(delivery(artifact.artifactRef, [{ channelRef: 'channel.secret', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://host.invalid/a?token=secret' }]), artifacts(artifact)), ArtifactDeliveryError);
});

test('MIR-14 direct delivery requests redirect-follow and accepts HTTP 200', async () => {
  const bytes = Buffer.from('redirect');
  const artifact = artifactFor(bytes);
  let redirect = null;
  await resolveAndDownloadArtifact({ artifactRef: artifact.artifactRef, finalPath: path.join(home(), artifact.filename), artifactRegistry: artifacts(artifact), deliveryRegistry: delivery(artifact.artifactRef, [{ channelRef: 'channel.direct', transportClass: 'DIRECT_HTTPS_FILE_V1', url: 'https://direct.invalid/a' }]), directDownload: directDownloadStub(), fetchImpl: async (url, init) => { redirect = init.redirect; return response(bytes, 200); } });
  assert.equal(redirect, 'follow');
});

test('MIR-15 malformed, duplicate and unsafe chunk definitions fail closed', () => {
  const whole = Buffer.from('aaaabbbb');
  const artifact = artifactFor(whole);
  const formed = chunkManifest(artifact, [Buffer.from('aaaa'), Buffer.from('bbbb')]);
  const channel = { channelRef: 'channel.chunk', transportClass: 'VERIFIED_CHUNK_MANIFEST_V1', manifestUrl: 'https://mirror.invalid/manifest', manifestSha256: formed.sha256 };
  const duplicate = structuredClone(formed.manifest);
  duplicate.parts[1].assetName = duplicate.parts[0].assetName;
  assert.throws(() => validateChunkManifest(duplicate, { artifact, channel, manifestSha256: formed.sha256 }), ArtifactDeliveryError);
  const unsafe = structuredClone(formed.manifest);
  unsafe.parts[0].assetName = '../escape';
  assert.throws(() => validateChunkManifest(unsafe, { artifact, channel, manifestSha256: formed.sha256 }), ArtifactDeliveryError);
});

test('MIR-16 chunk reconstruction streams part bodies instead of materializing the full artifact buffer', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/artifact-delivery.mjs'), 'utf8');
  const start = source.indexOf('async function downloadPartToFile');
  const end = source.indexOf('async function appendFile', start);
  const body = source.slice(start, end);
  assert.match(body, /pipeline\(Readable\.fromWeb\(response\.body\)/u);
  assert.equal(body.includes('arrayBuffer'), false);
  assert.equal(body.includes('Buffer.concat'), false);
});

test('MIR-18 deterministic packager reproduces manifest and inventory bytes', async () => {
  const bytes = Buffer.from('abcdefghijkl');
  const artifact = artifactFor(bytes);
  const root = home();
  const input = path.join(root, artifact.filename);
  fs.writeFileSync(input, bytes);
  const a = path.join(root, 'a');
  const b = path.join(root, 'b');
  const args = { inputPath: input, artifact, chunkBytes: 4, publicationBaseUrl: 'https://mirror.invalid/releases/tag/', releaseRef: 'release.synthetic.alpha' };
  const ra = await formDeterministicArtifactMirror({ ...args, outputDir: a });
  const rb = await formDeterministicArtifactMirror({ ...args, outputDir: b });
  assert.equal(ra.manifestSha256, rb.manifestSha256);
  for (const name of fs.readdirSync(a).sort()) assert.deepEqual(fs.readFileSync(path.join(a, name)), fs.readFileSync(path.join(b, name)));
});

test('MIR-19/MIR-20 current direct caller compatibility boundary stays external and source work has no protected effects', () => {
  const core = fs.readFileSync(path.join(ROOT, 'src/core/artifact-delivery.mjs'), 'utf8');
  const cli = fs.readFileSync(path.join(ROOT, 'scripts/form-artifact-mirror.mjs'), 'utf8');
  assert.equal(core.includes('g04b-native-provisioning'), false);
  assert.equal(core.includes('/v1/chat/completions'), false);
  assert.equal(core.includes('optimizer'), false);
  assert.equal(core.includes('child_process'), false);
  assert.equal(cli.includes('github.com/api'), false);
  assert.equal(cli.includes('fetch('), false);
  assert.equal(cli.includes('https://api.github.com'), false);
  assert.equal(cli.includes('child_process'), false);
});

test('MIR-21 module composition registers the additive fragment and generic registries validate empty', () => {
  const moduleRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/module-registry.json'), 'utf8'));
  assert.equal(moduleRegistry.includes.modules.at(-1), 'blueprint/module-registry/artifact-delivery.json');
  assert.equal(moduleRegistry.includes.modules.includes('blueprint/module-registry/security-access-preview.json'), true);
  const artifactRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/artifact-registry.json'), 'utf8'));
  const deliveryRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/artifact-delivery-registry.json'), 'utf8'));
  assert.equal(validateArtifactRegistry(artifactRegistry).artifacts.length, 0);
  assert.equal(Object.keys(validateArtifactDeliveryRegistry(deliveryRegistry, artifactRegistry).channelsByArtifactRef).length, 0);
});
