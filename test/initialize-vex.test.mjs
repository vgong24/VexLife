import assert from 'node:assert/strict';
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
  selectOperationalProfile,
  validateOperationalProfileRegistry
} from '../src/core/vex-initialization.mjs';
import { classifyVerifiedArtifact, downloadVerifiedArtifact, sha256File } from '../src/core/model-provision.mjs';
import crypto from 'node:crypto';

const profile = registry.profiles[0];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('operational profile registry is exact and candidate profiles do not silently become normal defaults', () => {
  assert.deepEqual(validateOperationalProfileRegistry(registry), { ok: true, errors: [] });
  const normal = selectOperationalProfile({ registry, platform: 'win32', architecture: 'x64' });
  assert.equal(normal.state, 'NO_RELEASE_QUALIFIED_PROFILE');
  assert.equal(normal.heldProfileRef, profile.profileRef);
  const candidate = selectOperationalProfile({ registry, platform: 'win32', architecture: 'x64', mode: 'candidate-qualification', profileRef: profile.profileRef });
  assert.equal(candidate.state, 'PROFILE_RESOLVED');
});

test('unsupported hosts fail closed and no default LLM fallback exists', () => {
  assert.equal(selectOperationalProfile({ registry, platform: 'darwin', architecture: 'arm64' }).state, 'UNSUPPORTED_HOST');
  assert.equal(JSON.stringify(registry).includes('default llm'), false);
  assert.equal(JSON.stringify(registry).includes('DEFAULT_LLM'), false);
});

test('Home classification distinguishes fresh, preserved and migration-required state', () => {
  assert.equal(classifyHomeState({ homeManifestPresent: false, homeDirectoryPresent: false, homeDirectoryNonEmpty: false }), 'FRESH_HOME_ALLOWED');
  assert.equal(classifyHomeState({ homeManifestPresent: true, homeDirectoryPresent: true, homeDirectoryNonEmpty: true }), 'EXISTING_HOME_PRESERVED');
  assert.equal(classifyHomeState({ homeManifestPresent: false, homeDirectoryPresent: true, homeDirectoryNonEmpty: true }), 'HOME_REQUIRES_MIGRATION_PLAN');
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
  assert.ok(start.indexOf('$initArgs = @("$Root/scripts/initialize-vex.mjs"') < start.indexOf('& node "$Root/scripts/serve-browser.mjs"'));
  assert.equal(/Read-Host\s+"Model download URL/iu.test(setup), false);
  assert.equal(/Expected SHA-256 checksum/iu.test(setup), false);
  assert.match(cmdText, /start-vexlife\.ps1/u);
  assert.equal(cmdText.includes('scripts\\bootstrap.mjs'), false);
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

test('verified artifact download reuses exact cache, resumes partial range and deletes hash-mismatch partials', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vex-init-test-'));
  const payload = Buffer.from('abcdef0123456789'.repeat(4096));
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const target = path.join(root, 'artifact.bin');
  const partial = `${target}.partial`;
  fs.writeFileSync(partial, payload.subarray(0, 1024));
  let seenRange = null;
  const fetchImpl = async (url, init = {}) => {
    seenRange = init.headers?.Range ?? null;
    const start = 1024;
    const body = new ReadableStream({ start(controller) { controller.enqueue(payload.subarray(start)); controller.close(); } });
    return new Response(body, { status: 206, headers: { 'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}`, 'content-length': String(payload.length - start) } });
  };
  const result = await downloadVerifiedArtifact({ url: 'https://example.invalid/a.bin', expectedSha256: sha, finalPath: target, expectedBytes: payload.length, maxBytes: payload.length + 1, fetchImpl });
  assert.equal(seenRange, 'bytes=1024-');
  assert.equal(result.disposition, 'RESUMED_AND_VERIFIED');
  assert.equal((await sha256File(target)), sha);
  assert.equal((await classifyVerifiedArtifact({ finalPath: target, expectedSha256: sha, expectedBytes: payload.length })).state, 'VERIFIED_REUSABLE');

  const second = await downloadVerifiedArtifact({ url: 'https://example.invalid/a.bin', expectedSha256: sha, finalPath: target, expectedBytes: payload.length, maxBytes: payload.length + 1, fetchImpl: async () => { throw new Error('network must not be used'); } });
  assert.equal(second.disposition, 'REUSED_VERIFIED');

  const badTarget = path.join(root, 'bad.bin');
  const badFetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('wrong')); controller.close(); } }), { status: 200 });
  await assert.rejects(() => downloadVerifiedArtifact({ url: 'https://example.invalid/bad.bin', expectedSha256: sha, finalPath: badTarget, maxBytes: 1024, fetchImpl: badFetch }), /checksum mismatch/u);
  assert.equal(fs.existsSync(`${badTarget}.partial`), false);
});
