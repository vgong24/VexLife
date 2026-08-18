import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  LIVED_COMPANION_FAILURE_CODES,
  LivedCompanionError,
  assertNoSensitivePersistence,
  initializeLivedCompanionHome,
  performLivedCompanionTurn,
  resumeLivedCompanionConversation,
  sanitizeEndpointOrigin,
  writeLivedCompanionShutdownReceipt
} from '../src/core/lived-companion.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import { composeSemanticRelay } from '../src/core/conversation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ref(prefix) { return `${prefix}.${crypto.randomUUID()}`; }
function temp(label) { return fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-g01-${label}-`)); }
function makeHome(label) {
  const home = temp(label);
  const identity = {
    homeRef: ref('vex-home.test'),
    familyRef: ref('vex-family.test'),
    deviceRef: ref('device.vexlife.test'),
    companionLineageRef: ref('companion-lineage.vexlife.test')
  };
  initializeLivedCompanionHome({ home, ...identity });
  return { home, ...identity };
}
async function server() {
  let calls = 0;
  const instance = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname.startsWith('/timeout/')) return setTimeout(() => { if (!response.destroyed) response.end(JSON.stringify({ choices: [{ message: { content: 'late' } }] })); }, 500);
    if (pathname.startsWith('/delay/')) return setTimeout(() => { if (!response.destroyed) { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content: 'delayed reply' } }] })); } }, 120);
    if (pathname.startsWith('/http-error/')) { response.statusCode = 500; return response.end('{}'); }
    if (pathname.startsWith('/invalid/')) return response.end(JSON.stringify({ choices: [] }));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content: 'reply' } }] }));
  });
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  return { endpoint: (route='ok') => `http://127.0.0.1:${instance.address().port}/${route}/`, calls: () => calls, close: () => new Promise((resolve) => instance.close(resolve)) };
}

function nonLoopbackIpv4() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && entry.internal === false) return entry.address;
    }
  }
  throw new Error('one non-loopback IPv4 address is required for redirect-boundary proof');
}

async function redirectEscapeHarness() {
  const nonLoopbackAddress = nonLoopbackIpv4();
  let targetCalls = 0;
  const target = http.createServer((request, response) => {
    targetCalls += 1;
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ model: 'redirect-target', choices: [{ message: { content: 'escaped reply' } }] }));
  });
  await new Promise((resolve, reject) => {
    target.once('error', reject);
    target.listen(0, '0.0.0.0', resolve);
  });

  let redirectCalls = 0;
  const redirector = http.createServer((request, response) => {
    redirectCalls += 1;
    request.resume();
    response.statusCode = 307;
    response.setHeader('location', `http://${nonLoopbackAddress}:${target.address().port}/outside`);
    response.end();
  });
  await new Promise((resolve, reject) => {
    redirector.once('error', reject);
    redirector.listen(0, '127.0.0.1', resolve);
  });
  return {
    endpoint: `http://127.0.0.1:${redirector.address().port}/redirect/`,
    redirectCalls: () => redirectCalls,
    targetCalls: () => targetCalls,
    close: async () => {
      await new Promise((resolve) => redirector.close(resolve));
      await new Promise((resolve) => target.close(resolve));
    }
  };
}

function turn(homeIdentity, endpoint, overrides={}) {
  return {
    ...homeIdentity,
    instanceRef: ref('instance.test'), threadRef: ref('thread.test'), channelRef: ref('channel.test'), turnRef: ref('turn.test'),
    requestMessageRef: ref('message.request'), responseMessageRef: ref('message.response'), speakerRef: 'person.test', recipientRefs: ['role.vex.companion'],
    content: 'hello', endpointProfile: { profileRef: 'profile.loopback', admitted: true, endpoint, model: 'test-model' }, timeoutMs: 200, ...overrides
  };
}
async function rejectsCode(operation, code) {
  await assert.rejects(operation, (error) => error instanceof LivedCompanionError && error.code === code);
}

function absentProcessId() {
  for (const pid of [2147483647, 1073741823, 99999999]) {
    try { process.kill(pid, 0); }
    catch (error) { if (error?.code === 'ESRCH') return pid; }
  }
  throw new Error('could not identify one absent process id for the host proof');
}

function writeAbandonedWriterLease(home, threadRef) {
  const lockDirectory = path.join(home.home, 'runtime', 'thread-writer-locks', home.companionLineageRef);
  fs.mkdirSync(lockDirectory, { recursive: true });
  const leaseCore = {
    schemaVersion: 'vexlife.thread-writer-lease/v1',
    companionLineageRef: home.companionLineageRef,
    threadRef,
    instanceRef: ref('instance.abandoned'),
    lockToken: crypto.randomUUID(),
    pid: absentProcessId(),
    formedAt: new Date().toISOString()
  };
  const lease = { ...leaseCore, leaseSha256: semanticHash(leaseCore) };
  const lockPath = path.join(lockDirectory, `${threadRef}.lock`);
  fs.writeFileSync(lockPath, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
  return { lockPath, lease };
}

function writerLeasePath(home, threadRef) {
  const lockDirectory = path.join(home.home, 'runtime', 'thread-writer-locks', home.companionLineageRef);
  fs.mkdirSync(lockDirectory, { recursive: true });
  return path.join(lockDirectory, `${threadRef}.lock`);
}

function writeUnverifiableWriterLease(home, threadRef, variant) {
  const lockPath = writerLeasePath(home, threadRef);
  if (variant === 'malformed') {
    fs.writeFileSync(lockPath, '{', 'utf8');
  } else {
    const leaseCore = {
      schemaVersion: 'vexlife.thread-writer-lease/v1',
      companionLineageRef: home.companionLineageRef,
      threadRef,
      instanceRef: variant === 'invalid-identity' ? '../invalid-instance' : ref('instance.unverifiable'),
      lockToken: crypto.randomUUID(),
      pid: variant === 'invalid-identity' ? 0 : absentProcessId(),
      formedAt: new Date().toISOString()
    };
    const lease = {
      ...leaseCore,
      leaseSha256: variant === 'invalid-hash' ? '0'.repeat(64) : semanticHash(leaseCore)
    };
    fs.writeFileSync(lockPath, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
  }
  return { lockPath, observedLeaseFileSha256: crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex') };
}

test('failure vocabulary contains every required typed failure', () => {
  assert.equal(LIVED_COMPANION_FAILURE_CODES.length, 18);
  assert.equal(new Set(LIVED_COMPANION_FAILURE_CODES).size, 18);
});

test('fresh proof Home forms one explicit device and lineage identity', () => {
  const value = makeHome('fresh');
  const manifest = JSON.parse(fs.readFileSync(path.join(value.home, 'config/home.json'), 'utf8'));
  assert.equal(manifest.currentDeviceRef, value.deviceRef);
  assert.equal(manifest.currentCompanionLineageRef, value.companionLineageRef);
});


test('path-bearing identity refs cannot escape the admitted Vex Home', () => {
  const root = temp('path-escape');
  const home = path.join(root, 'home');
  assert.throws(() => initializeLivedCompanionHome({
    home,
    homeRef: 'home.safe',
    familyRef: 'family.safe',
    deviceRef: '../../outside/device',
    companionLineageRef: 'lineage.safe'
  }), (error) => error instanceof LivedCompanionError && error.code === 'HOME_IDENTITY_MISMATCH');
  assert.equal(fs.existsSync(path.join(root, 'outside', 'device.json')), false);
});


test('loopback endpoint redirects cannot escape to a non-loopback destination', async () => {
  const harness = await redirectEscapeHarness();
  const home = makeHome('redirect-boundary');
  const input = turn(home, harness.endpoint);
  try {
    await rejectsCode(() => performLivedCompanionTurn(input), 'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED');
    assert.equal(harness.redirectCalls(), 1);
    assert.equal(harness.targetCalls(), 0);
    const headPath = path.join(home.home, 'conversations', home.companionLineageRef, input.threadRef, 'head.json');
    assert.equal(fs.existsSync(headPath), false);
  } finally {
    await harness.close();
  }
});

test('hostname aliases are not accepted as numeric loopback proof', async () => {
  const service = await server();
  const home = makeHome('localhost-alias');
  const endpoint = service.endpoint().replace('127.0.0.1', 'localhost');
  try {
    await rejectsCode(() => performLivedCompanionTurn(turn(home, endpoint)), 'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED');
    assert.equal(service.calls(), 0);
  } finally {
    await service.close();
  }
});

test('event directory symlink or junction cannot escape Vex Home writes', async () => {
  const service = await server();
  const home = makeHome('event-directory-link');
  const input = turn(home, service.endpoint());
  const threadRoot = path.join(home.home, 'conversations', home.companionLineageRef, input.threadRef);
  const outside = temp('outside-events');
  fs.mkdirSync(threadRoot, { recursive: true });
  fs.symlinkSync(outside, path.join(threadRoot, 'events'), process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await rejectsCode(() => performLivedCompanionTurn(input), 'HOME_IDENTITY_MISMATCH');
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(service.calls(), 0);
  } finally { await service.close(); }
});

test('symlinked event entries cannot influence duplicate or event-chain reads', {
  skip: process.platform === 'win32' ? 'file-symlink coverage runs in the hosted Linux foundation job' : false
}, async () => {
  const service = await server();
  const home = makeHome('event-entry-link');
  const input = turn(home, service.endpoint());
  const events = path.join(home.home, 'conversations', home.companionLineageRef, input.threadRef, 'events');
  const outside = path.join(temp('outside-event-entry'), 'external.json');
  fs.mkdirSync(events, { recursive: true });
  fs.writeFileSync(outside, JSON.stringify({ turnRef: input.turnRef, eventHash: 'external-controlled' }));
  fs.symlinkSync(outside, path.join(events, 'external.json'), 'file');
  try {
    await rejectsCode(() => performLivedCompanionTurn(input), 'EVENT_CHAIN_CORRUPT');
    assert.equal(service.calls(), 0);
  } finally { await service.close(); }
});

test('existing Home is preserved and requires migration', async () => {
  const value = makeHome('existing');
  await rejectsCode(async () => initializeLivedCompanionHome(value), 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN');
});

test('partial non-empty Home without manifest is preserved byte-identically', async () => {
  const root = temp('partial-home');
  const home = path.join(root, 'home');
  const legacy = path.join(home, 'legacy', 'keep.bin');
  const interrupted = path.join(home, 'config', 'interrupted.tmp');
  const legacyBytes = Buffer.from([0, 1, 2, 3, 254, 255]);
  const interruptedBytes = Buffer.from('interrupted-home-state\n', 'utf8');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.mkdirSync(path.dirname(interrupted), { recursive: true });
  fs.writeFileSync(legacy, legacyBytes);
  fs.writeFileSync(interrupted, interruptedBytes);

  await rejectsCode(async () => initializeLivedCompanionHome({
    home,
    homeRef: ref('home.partial'),
    familyRef: ref('family.partial'),
    deviceRef: ref('device.partial'),
    companionLineageRef: ref('lineage.partial')
  }), 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN');

  assert.deepEqual(fs.readFileSync(legacy), legacyBytes);
  assert.deepEqual(fs.readFileSync(interrupted), interruptedBytes);
  assert.equal(fs.existsSync(path.join(home, 'config', 'home.json')), false);
  assert.equal(fs.existsSync(path.join(home, 'config', 'model.json')), false);
  assert.equal(fs.existsSync(path.join(home, 'devices')), false);
});

test('pre-existing file Home root is preserved and requires migration', async () => {
  const home = path.join(temp('file-home-root'), 'home');
  const bytes = Buffer.from('not-a-directory-home\n', 'utf8');
  fs.writeFileSync(home, bytes);

  await rejectsCode(async () => initializeLivedCompanionHome({
    home,
    homeRef: ref('home.file'),
    familyRef: ref('family.file'),
    deviceRef: ref('device.file'),
    companionLineageRef: ref('lineage.file')
  }), 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN');

  assert.equal(fs.lstatSync(home).isFile(), true);
  assert.deepEqual(fs.readFileSync(home), bytes);
});

test('linked Home root is preserved and requires migration', async () => {
  const root = temp('linked-home-root');
  const target = path.join(root, 'target');
  const linked = path.join(root, 'home');
  const marker = path.join(target, 'keep.txt');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(marker, 'preserve-me\n', 'utf8');
  fs.symlinkSync(target, linked, process.platform === 'win32' ? 'junction' : 'dir');

  await rejectsCode(async () => initializeLivedCompanionHome({
    home: linked,
    homeRef: ref('home.linked'),
    familyRef: ref('family.linked'),
    deviceRef: ref('device.linked'),
    companionLineageRef: ref('lineage.linked')
  }), 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN');

  assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve-me\n');
  assert.equal(fs.existsSync(path.join(target, 'config')), false);
});

test('one exact empty existing directory is fresh-eligible', () => {
  const home = path.join(temp('empty-existing-home'), 'home');
  fs.mkdirSync(home, { recursive: true });
  const result = initializeLivedCompanionHome({
    home,
    homeRef: ref('home.empty-existing'),
    familyRef: ref('family.empty-existing'),
    deviceRef: ref('device.empty-existing'),
    companionLineageRef: ref('lineage.empty-existing')
  });
  assert.equal(result.home, fs.realpathSync.native(home));
  assert.equal(fs.existsSync(path.join(home, 'config', 'home.json')), true);
});


test('fresh Home beneath a linked parent is rejected before target mutation', async () => {
  const root = temp('linked-parent-fresh-home');
  const actualParent = path.join(root, 'actual-parent');
  const linkedParent = path.join(root, 'linked-parent');
  const targetHome = path.join(actualParent, 'home');
  fs.mkdirSync(actualParent, { recursive: true });
  fs.symlinkSync(actualParent, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');

  await rejectsCode(async () => initializeLivedCompanionHome({
    home: path.join(linkedParent, 'home'),
    homeRef: ref('home.linked-parent'),
    familyRef: ref('family.linked-parent'),
    deviceRef: ref('device.linked-parent'),
    companionLineageRef: ref('lineage.linked-parent')
  }), 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN');

  assert.equal(fs.existsSync(targetHome), false);
});

test('an initialized Home reached through a linked parent fails before HTTP or event effects', async () => {
  const root = temp('linked-parent-turn-home');
  const actualParent = path.join(root, 'actual-parent');
  const linkedParent = path.join(root, 'linked-parent');
  const actualHome = path.join(actualParent, 'home');
  fs.mkdirSync(actualParent, { recursive: true });
  const identity = {
    homeRef: ref('home.linked-parent-turn'),
    familyRef: ref('family.linked-parent-turn'),
    deviceRef: ref('device.linked-parent-turn'),
    companionLineageRef: ref('lineage.linked-parent-turn')
  };
  initializeLivedCompanionHome({ home: actualHome, ...identity });
  fs.symlinkSync(actualParent, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
  const service = await server();
  const input = turn({ home: path.join(linkedParent, 'home'), ...identity }, service.endpoint());
  try {
    await rejectsCode(() => performLivedCompanionTurn(input), 'HOME_IDENTITY_MISMATCH');
    assert.equal(service.calls(), 0);
    assert.equal(
      fs.existsSync(path.join(actualHome, 'conversations', identity.companionLineageRef, input.threadRef, 'events')),
      false
    );
  } finally {
    await service.close();
  }
});

test('portable canonical ref grammar rejects Windows aliases before Home mutation', async () => {
  const invalidRefs = [
    'C:device',
    'device:stream',
    'device.',
    'device ',
    'CON',
    'nul',
    'COM1',
    'lpt9',
    'Device.case'
  ];
  for (const invalidRef of invalidRefs) {
    const home = path.join(temp('portable-ref'), 'home');
    await rejectsCode(async () => initializeLivedCompanionHome({
      home,
      homeRef: ref('home.portable-ref'),
      familyRef: ref('family.portable-ref'),
      deviceRef: invalidRef,
      companionLineageRef: ref('lineage.portable-ref')
    }), 'HOME_IDENTITY_MISMATCH');
    assert.equal(fs.existsSync(home), false);
  }
});

test('stored context path is canonical-Home relative and supports clean shutdown', async () => {
  const service = await server();
  const home = makeHome('canonical-context-path');
  const input = turn(home, service.endpoint());
  try {
    const completed = await performLivedCompanionTurn(input);
    assert.equal(completed.head.contextPath.startsWith('..'), false);
    assert.equal(path.isAbsolute(completed.head.contextPath), false);
    const shutdown = writeLivedCompanionShutdownReceipt({
      ...home,
      instanceRef: input.instanceRef,
      threadRef: input.threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256
    });
    assert.equal(shutdown.receipt.clean, true);
  } finally {
    await service.close();
  }
});

test('uninitialized Home fails before endpoint use', async () => {
  const service = await server();
  try { await rejectsCode(() => performLivedCompanionTurn(turn({ home: temp('missing'), homeRef:'h', deviceRef:'d', companionLineageRef:'l' }, service.endpoint())), 'HOME_NOT_INITIALIZED'); }
  finally { await service.close(); }
});

test('one admitted loopback endpoint performs an actual HTTP turn and advances head atomically', async () => {
  const service = await server(); const home = makeHome('turn');
  try {
    const result = await performLivedCompanionTurn(turn(home, service.endpoint()));
    assert.equal(result.actualHttpCall, true);
    assert.equal(result.head.eventHash, result.responseEvent.eventHash);
    assert.equal(service.calls(), 1);
    assert.ok(fs.existsSync(result.headPath));
  } finally { await service.close(); }
});

test('request and response events are immutable addressed records', async () => {
  const service = await server(); const home = makeHome('events');
  try {
    const result = await performLivedCompanionTurn(turn(home, service.endpoint()));
    assert.equal(result.requestEvent.eventKind, 'REQUEST');
    assert.equal(result.responseEvent.eventKind, 'RESPONSE');
    assert.equal(result.responseEvent.priorEventHash, result.requestEvent.eventHash);
    assert.deepEqual(result.requestEvent.recipientRefs, ['role.vex.companion']);
  } finally { await service.close(); }
});

test('bounded context binds exact request and response event hashes', async () => {
  const service = await server(); const home = makeHome('context');
  try {
    const result = await performLivedCompanionTurn(turn(home, service.endpoint()));
    assert.equal(result.contextRecord.requestEventHash, result.requestEvent.eventHash);
    assert.equal(result.contextRecord.responseEventHash, result.responseEvent.eventHash);
    assert.equal(result.head.contextSha256, result.contextRecord.serializedContextSha256);
  } finally { await service.close(); }
});

test('unadmitted endpoint profile fails closed', async () => {
  const service = await server(); const home = makeHome('profile');
  try { await rejectsCode(() => performLivedCompanionTurn(turn(home, service.endpoint(), { endpointProfile: { profileRef:'x', admitted:false, endpoint:service.endpoint() } })), 'ENDPOINT_PROFILE_NOT_ADMITTED'); }
  finally { await service.close(); }
});

test('non-loopback endpoint fails even when a caller self-asserts admission', async () => {
  await rejectsCode(() => performLivedCompanionTurn(turn(makeHome('nonloopback'), 'https://example.com/', {
    endpointProfile: {
      profileRef: 'profile.caller-authored',
      admitted: true,
      explicitNonLoopbackAdmission: true,
      endpoint: 'https://example.com/'
    }
  })), 'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED');
});

test('unreachable endpoint preserves failure evidence without a completed head', async () => {
  const probe = http.createServer(); await new Promise((resolve) => probe.listen(0,'127.0.0.1',resolve)); const port=probe.address().port; await new Promise((resolve)=>probe.close(resolve));
  const home=makeHome('unreachable'); const input=turn(home,`http://127.0.0.1:${port}/`);
  await rejectsCode(()=>performLivedCompanionTurn(input),'ENDPOINT_UNREACHABLE');
  assert.equal(fs.existsSync(path.join(home.home,'conversations',home.companionLineageRef,input.threadRef,'head.json')),false);
});

test('endpoint timeout is typed and does not present completion', async () => {
  const service=await server(); const home=makeHome('timeout');
  try { await rejectsCode(()=>performLivedCompanionTurn(turn(home,service.endpoint('timeout'),{timeoutMs:20})),'ENDPOINT_TIMEOUT'); }
  finally { await service.close(); }
});

test('endpoint HTTP errors are typed', async () => {
  const service=await server();
  try { await rejectsCode(()=>performLivedCompanionTurn(turn(makeHome('http'),service.endpoint('http-error'))),'ENDPOINT_HTTP_ERROR'); }
  finally { await service.close(); }
});

test('invalid endpoint responses are typed', async () => {
  const service=await server();
  try { await rejectsCode(()=>performLivedCompanionTurn(turn(makeHome('invalid'),service.endpoint('invalid'))),'ENDPOINT_RESPONSE_INVALID'); }
  finally { await service.close(); }
});

test('duplicate turn is suppressed before a second HTTP call or append', async () => {
  const service=await server(); const home=makeHome('duplicate'); const input=turn(home,service.endpoint());
  try {
    await performLivedCompanionTurn(input); const calls=service.calls();
    await rejectsCode(()=>performLivedCompanionTurn({...input,requestMessageRef:ref('request'),responseMessageRef:ref('response')}),'DUPLICATE_TURN_SUPPRESSED');
    assert.equal(service.calls(),calls);
  } finally { await service.close(); }
});


test('failed turn routes to a new turn and preserves first failure evidence', async () => {
  let calls = 0;
  const service = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    if (calls === 1) {
      response.statusCode = 500;
      response.end('{}');
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'recovered reply' } }]
    }));
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${service.address().port}/`;
  const home = makeHome('failed-turn-recovery');
  const input = turn(home, endpoint);
  try {
    let firstError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(input),
      (error) => {
        firstError = error;
        return error instanceof LivedCompanionError && error.code === 'ENDPOINT_HTTP_ERROR';
      }
    );
    assert.equal(calls, 1);
    const firstPath = firstError.details.failureReceiptPath;
    const firstBytes = fs.readFileSync(firstPath);
    const firstReceipt = JSON.parse(firstBytes);
    assert.equal(firstReceipt.schemaVersion, 'vexlife.lived-companion-failure-receipt/v2');
    assert.equal(firstReceipt.requestDurablyRecorded, true);
    assert.equal(firstReceipt.retrySameTurnAllowed, false);
    assert.equal(firstReceipt.exactNextSafeRoute, 'FORM_NEW_TURN_REF_AND_RETRY');
    assert.match(firstReceipt.failureReceiptSha256, /^[0-9a-f]{64}$/u);

    let duplicateError = null;
    await assert.rejects(
      () => performLivedCompanionTurn({
        ...input,
        instanceRef: ref('instance.same-turn-retry'),
        requestMessageRef: ref('message.request.retry'),
        responseMessageRef: ref('message.response.retry')
      }),
      (error) => {
        duplicateError = error;
        return error instanceof LivedCompanionError && error.code === 'DUPLICATE_TURN_SUPPRESSED';
      }
    );
    assert.equal(calls, 1);
    assert.deepEqual(fs.readFileSync(firstPath), firstBytes);
    const followUpPath = duplicateError.details.failureReceiptPath;
    assert.notEqual(followUpPath, firstPath);
    const followUp = JSON.parse(fs.readFileSync(followUpPath, 'utf8'));
    assert.equal(followUp.followUpToFirstFailure, true);
    assert.equal(
      followUp.firstFailureReceiptFileSha256,
      crypto.createHash('sha256').update(firstBytes).digest('hex')
    );
    assert.equal(followUp.retrySameTurnAllowed, false);
    assert.equal(
      followUp.exactNextSafeRoute,
      'USE_EXISTING_TURN_EVIDENCE_OR_FORM_NEW_TURN_REF'
    );
    assert.equal(followUp.existingTurnEvidence.eventKind, 'REQUEST');

    const recovered = await performLivedCompanionTurn({
      ...input,
      instanceRef: ref('instance.new-turn-retry'),
      turnRef: ref('turn.new-retry'),
      requestMessageRef: ref('message.request.new-retry'),
      responseMessageRef: ref('message.response.new-retry')
    });
    assert.equal(recovered.state, 'TURN_COMPLETED');
    assert.equal(calls, 2);
  } finally {
    await new Promise((resolve) => service.close(resolve));
  }
});



test('corrupt prior completed event chain blocks the next turn before endpoint effects', async () => {
  const service = await server();
  const home = makeHome('prior-chain-corruption');
  const threadRef = ref('thread.prior-chain-corruption');
  const first = turn(home, service.endpoint(), {
    threadRef,
    instanceRef: ref('instance.prior-chain.first'),
    turnRef: ref('turn.prior-chain.first')
  });
  try {
    const completed = await performLivedCompanionTurn(first);
    const callsBefore = service.calls();
    const events = path.join(home.home, 'conversations', home.companionLineageRef, threadRef, 'events');
    const responseFile = fs.readdirSync(events)
      .map((name) => path.join(events, name))
      .find((file) => file.endsWith(`-${completed.head.eventHash}.json`));
    assert.ok(responseFile, 'completed response event must be locatable');
    fs.unlinkSync(responseFile);

    const second = turn(home, service.endpoint(), {
      threadRef,
      instanceRef: ref('instance.prior-chain.second'),
      turnRef: ref('turn.prior-chain.second')
    });
    await rejectsCode(() => performLivedCompanionTurn(second), 'EVENT_CHAIN_CORRUPT');
    assert.equal(service.calls(), callsBefore);
    const persistedHead = JSON.parse(fs.readFileSync(completed.headPath, 'utf8'));
    assert.equal(persistedHead.conversationHeadSha256, completed.head.conversationHeadSha256);
  } finally {
    await service.close();
  }
});

test('same-turn duplicate follow-up retains the validated prior head and resume route', async () => {
  const service = await server();
  const home = makeHome('duplicate-prior-head');
  const threadRef = ref('thread.duplicate-prior-head');
  try {
    const completed = await performLivedCompanionTurn(turn(home, service.endpoint(), {
      threadRef,
      instanceRef: ref('instance.duplicate-prior-head.completed'),
      turnRef: ref('turn.duplicate-prior-head.completed')
    }));
    const failedInput = turn(home, service.endpoint('http-error'), {
      threadRef,
      instanceRef: ref('instance.duplicate-prior-head.failed'),
      turnRef: ref('turn.duplicate-prior-head.failed')
    });
    let firstError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(failedInput),
      (error) => {
        firstError = error;
        return error instanceof LivedCompanionError && error.code === 'ENDPOINT_HTTP_ERROR';
      }
    );
    const firstPath = firstError.details.failureReceiptPath;
    const firstBytes = fs.readFileSync(firstPath);
    const firstReceipt = JSON.parse(firstBytes);
    assert.equal(firstReceipt.lastValidHead.conversationHeadSha256, completed.head.conversationHeadSha256);
    assert.equal(firstReceipt.resumePossible, true);
    assert.equal(firstReceipt.exactNextSafeRoute, 'RESUME_LAST_VALID_HEAD_THEN_FORM_NEW_TURN_REF');

    const callsBeforeDuplicate = service.calls();
    let duplicateError = null;
    await assert.rejects(
      () => performLivedCompanionTurn({
        ...failedInput,
        instanceRef: ref('instance.duplicate-prior-head.same-turn-retry'),
        requestMessageRef: ref('message.duplicate-prior-head.same-turn.request'),
        responseMessageRef: ref('message.duplicate-prior-head.same-turn.response'),
        endpointProfile: {
          ...failedInput.endpointProfile,
          endpoint: service.endpoint()
        }
      }),
      (error) => {
        duplicateError = error;
        return error instanceof LivedCompanionError && error.code === 'DUPLICATE_TURN_SUPPRESSED';
      }
    );
    assert.equal(service.calls(), callsBeforeDuplicate);
    assert.deepEqual(fs.readFileSync(firstPath), firstBytes);
    const followUp = JSON.parse(fs.readFileSync(duplicateError.details.failureReceiptPath, 'utf8'));
    assert.equal(followUp.lastValidHead.conversationHeadSha256, completed.head.conversationHeadSha256);
    assert.equal(followUp.resumePossible, true);
    assert.equal(followUp.followUpToFirstFailure, true);
    assert.equal(followUp.firstFailureReceiptFileSha256, crypto.createHash('sha256').update(firstBytes).digest('hex'));
    assert.equal(
      followUp.exactNextSafeRoute,
      'USE_EXISTING_TURN_EVIDENCE_OR_RESUME_LAST_VALID_HEAD_AND_FORM_NEW_TURN_REF'
    );
  } finally {
    await service.close();
  }
});

test('resume rejects in-Home cross-thread context substitution even when hashes are recomputed', async () => {
  const service = await server();
  const home = makeHome('cross-thread-context');
  try {
    const first = turn(home, service.endpoint(), {
      threadRef: ref('thread.context.first'),
      instanceRef: ref('instance.context.first'),
      turnRef: ref('turn.context.first')
    });
    const second = turn(home, service.endpoint(), {
      threadRef: ref('thread.context.second'),
      instanceRef: ref('instance.context.second'),
      turnRef: ref('turn.context.second')
    });
    const completedFirst = await performLivedCompanionTurn(first);
    const shutdownFirst = writeLivedCompanionShutdownReceipt({
      ...home,
      instanceRef: first.instanceRef,
      threadRef: first.threadRef,
      expectedConversationHeadSha256: completedFirst.head.conversationHeadSha256
    });
    const completedSecond = await performLivedCompanionTurn(second);

    const head = JSON.parse(fs.readFileSync(completedFirst.headPath, 'utf8'));
    head.contextPath = completedSecond.head.contextPath;
    head.contextSha256 = completedSecond.head.contextSha256;
    const { conversationHeadSha256: ignoredHeadHash, ...headCore } = head;
    head.conversationHeadSha256 = semanticHash(headCore);
    fs.writeFileSync(completedFirst.headPath, `${JSON.stringify(head, null, 2)}\n`, 'utf8');

    const shutdown = JSON.parse(fs.readFileSync(shutdownFirst.receiptPath, 'utf8'));
    shutdown.conversationHeadSha256 = head.conversationHeadSha256;
    shutdown.contextSha256 = head.contextSha256;
    const { shutdownReceiptSha256: ignoredShutdownHash, ...shutdownCore } = shutdown;
    shutdown.shutdownReceiptSha256 = semanticHash(shutdownCore);
    fs.writeFileSync(shutdownFirst.receiptPath, `${JSON.stringify(shutdown, null, 2)}\n`, 'utf8');

    await rejectsCode(async () => resumeLivedCompanionConversation({
      ...home,
      priorInstanceRef: first.instanceRef,
      instanceRef: ref('instance.context.resume'),
      threadRef: first.threadRef,
      expectedConversationHeadSha256: head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.shutdownReceiptSha256
    }), 'CONTEXT_HASH_MISMATCH');
  } finally {
    await service.close();
  }
});

test('resume rejects in-Home cross-thread event substitution even when objects remain content-addressed', async () => {
  const service = await server();
  const home = makeHome('cross-thread-events');
  try {
    const first = turn(home, service.endpoint(), {
      threadRef: ref('thread.events.first'),
      instanceRef: ref('instance.events.first'),
      turnRef: ref('turn.events.first')
    });
    const second = turn(home, service.endpoint(), {
      threadRef: ref('thread.events.second'),
      instanceRef: ref('instance.events.second'),
      turnRef: ref('turn.events.second')
    });
    const completedFirst = await performLivedCompanionTurn(first);
    const shutdownFirst = writeLivedCompanionShutdownReceipt({
      ...home,
      instanceRef: first.instanceRef,
      threadRef: first.threadRef,
      expectedConversationHeadSha256: completedFirst.head.conversationHeadSha256
    });
    const completedSecond = await performLivedCompanionTurn(second);

    const firstEvents = path.join(home.home, 'conversations', home.companionLineageRef, first.threadRef, 'events');
    const secondEvents = path.join(home.home, 'conversations', home.companionLineageRef, second.threadRef, 'events');
    for (const name of fs.readdirSync(secondEvents)) {
      fs.copyFileSync(path.join(secondEvents, name), path.join(firstEvents, `substituted-${name}`));
    }

    const head = JSON.parse(fs.readFileSync(completedFirst.headPath, 'utf8'));
    head.eventHash = completedSecond.head.eventHash;
    head.sequence = completedSecond.head.sequence;
    const { conversationHeadSha256: ignoredHeadHash, ...headCore } = head;
    head.conversationHeadSha256 = semanticHash(headCore);
    fs.writeFileSync(completedFirst.headPath, `${JSON.stringify(head, null, 2)}\n`, 'utf8');

    const shutdown = JSON.parse(fs.readFileSync(shutdownFirst.receiptPath, 'utf8'));
    shutdown.conversationHeadSha256 = head.conversationHeadSha256;
    shutdown.eventHash = head.eventHash;
    const { shutdownReceiptSha256: ignoredShutdownHash, ...shutdownCore } = shutdown;
    shutdown.shutdownReceiptSha256 = semanticHash(shutdownCore);
    fs.writeFileSync(shutdownFirst.receiptPath, `${JSON.stringify(shutdown, null, 2)}\n`, 'utf8');

    await rejectsCode(async () => resumeLivedCompanionConversation({
      ...home,
      priorInstanceRef: first.instanceRef,
      instanceRef: ref('instance.events.resume'),
      threadRef: first.threadRef,
      expectedConversationHeadSha256: head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.shutdownReceiptSha256
    }), 'EVENT_CHAIN_CORRUPT');
  } finally {
    await service.close();
  }
});


test('completed event history remains anchored at genesis after adversarial rehashing', async () => {
  const service = await server();
  const home = makeHome('semantic-genesis-anchor');
  const threadRef = ref('thread.semantic-genesis-anchor');
  const first = turn(home, service.endpoint(), {
    threadRef,
    instanceRef: ref('instance.semantic.first'),
    turnRef: ref('turn.semantic.first')
  });
  const second = turn(home, service.endpoint(), {
    threadRef,
    instanceRef: ref('instance.semantic.second'),
    turnRef: ref('turn.semantic.second')
  });
  try {
    await performLivedCompanionTurn(first);
    const completed = await performLivedCompanionTurn(second);
    const eventsDirectory = path.join(home.home, 'conversations', home.companionLineageRef, threadRef, 'events');
    const entries = fs.readdirSync(eventsDirectory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({ name, file: path.join(eventsDirectory, name), event: JSON.parse(fs.readFileSync(path.join(eventsDirectory, name), 'utf8')) }));
    const request = entries.find(({ event }) => event.turnRef === second.turnRef && event.eventKind === 'REQUEST');
    const response = entries.find(({ event }) => event.turnRef === second.turnRef && event.eventKind === 'RESPONSE');

    request.event.priorEventHash = null;
    const { eventHash: ignoredRequestHash, ...requestCore } = request.event;
    request.event.eventHash = semanticHash(requestCore);
    response.event.priorEventHash = request.event.eventHash;
    const { eventHash: ignoredResponseHash, ...responseCore } = response.event;
    response.event.eventHash = semanticHash(responseCore);

    fs.unlinkSync(request.file);
    fs.unlinkSync(response.file);
    fs.writeFileSync(
      path.join(eventsDirectory, `${String(request.event.sequence).padStart(8, '0')}-${request.event.eventHash}.json`),
      `${JSON.stringify(request.event, null, 2)}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(eventsDirectory, `${String(response.event.sequence).padStart(8, '0')}-${response.event.eventHash}.json`),
      `${JSON.stringify(response.event, null, 2)}\n`,
      'utf8'
    );

    const contextPath = path.resolve(home.home, ...completed.head.contextPath.split('/'));
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    context.requestEventHash = request.event.eventHash;
    context.responseEventHash = response.event.eventHash;
    const { serializedContextSha256: ignoredContextHash, ...contextCore } = context;
    context.serializedContextSha256 = semanticHash(contextCore);
    fs.writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');

    const head = JSON.parse(fs.readFileSync(completed.headPath, 'utf8'));
    head.eventHash = response.event.eventHash;
    head.contextSha256 = context.serializedContextSha256;
    const { conversationHeadSha256: ignoredHeadHash, ...headCore } = head;
    head.conversationHeadSha256 = semanticHash(headCore);
    fs.writeFileSync(completed.headPath, `${JSON.stringify(head, null, 2)}\n`, 'utf8');

    await rejectsCode(
      async () => writeLivedCompanionShutdownReceipt({
        ...home,
        instanceRef: second.instanceRef,
        threadRef,
        expectedConversationHeadSha256: head.conversationHeadSha256
      }),
      'EVENT_CHAIN_CORRUPT'
    );
  } finally {
    await service.close();
  }
});

test('event contentHash is independently verified even when event/context/head envelopes are rehashed', async () => {
  const service = await server();
  const home = makeHome('semantic-content-hash');
  const input = turn(home, service.endpoint());
  try {
    const completed = await performLivedCompanionTurn(input);
    const eventsDirectory = path.join(home.home, 'conversations', home.companionLineageRef, input.threadRef, 'events');
    const responseName = fs.readdirSync(eventsDirectory).find((name) => {
      const event = JSON.parse(fs.readFileSync(path.join(eventsDirectory, name), 'utf8'));
      return event.eventKind === 'RESPONSE';
    });
    const responseFile = path.join(eventsDirectory, responseName);
    const response = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
    const staleContentHash = response.contentHash;
    response.content = 'tampered content with intentionally stale contentHash';
    const { eventHash: ignoredEventHash, ...responseCore } = response;
    response.eventHash = semanticHash(responseCore);
    fs.unlinkSync(responseFile);
    fs.writeFileSync(
      path.join(eventsDirectory, `${String(response.sequence).padStart(8, '0')}-${response.eventHash}.json`),
      `${JSON.stringify(response, null, 2)}\n`,
      'utf8'
    );

    const contextPath = path.resolve(home.home, ...completed.head.contextPath.split('/'));
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    context.responseEventHash = response.eventHash;
    const { serializedContextSha256: ignoredContextHash, ...contextCore } = context;
    context.serializedContextSha256 = semanticHash(contextCore);
    fs.writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');

    const head = JSON.parse(fs.readFileSync(completed.headPath, 'utf8'));
    head.eventHash = response.eventHash;
    head.contextSha256 = context.serializedContextSha256;
    const { conversationHeadSha256: ignoredHeadHash, ...headCore } = head;
    head.conversationHeadSha256 = semanticHash(headCore);
    fs.writeFileSync(completed.headPath, `${JSON.stringify(head, null, 2)}\n`, 'utf8');

    assert.equal(response.contentHash, staleContentHash);
    assert.notEqual(response.contentHash, semanticHash(response.content));
    await rejectsCode(
      async () => writeLivedCompanionShutdownReceipt({
        ...home,
        instanceRef: input.instanceRef,
        threadRef: input.threadRef,
        expectedConversationHeadSha256: head.conversationHeadSha256
      }),
      'EVENT_CHAIN_CORRUPT'
    );
  } finally {
    await service.close();
  }
});

test('event filename must match exact sequence and eventHash address', async () => {
  const service = await server();
  const home = makeHome('semantic-event-address');
  const input = turn(home, service.endpoint());
  try {
    const completed = await performLivedCompanionTurn(input);
    const eventsDirectory = path.join(home.home, 'conversations', home.companionLineageRef, input.threadRef, 'events');
    const responseName = fs.readdirSync(eventsDirectory).find((name) => {
      const event = JSON.parse(fs.readFileSync(path.join(eventsDirectory, name), 'utf8'));
      return event.eventKind === 'RESPONSE';
    });
    fs.renameSync(path.join(eventsDirectory, responseName), path.join(eventsDirectory, 'misaddressed-event.json'));
    await rejectsCode(
      async () => writeLivedCompanionShutdownReceipt({
        ...home,
        instanceRef: input.instanceRef,
        threadRef: input.threadRef,
        expectedConversationHeadSha256: completed.head.conversationHeadSha256
      }),
      'EVENT_CHAIN_CORRUPT'
    );
  } finally {
    await service.close();
  }
});

test('context must remain at exact canonical path and retain request/response source refs', async () => {
  const service = await server();
  const home = makeHome('semantic-context-provenance');
  const input = turn(home, service.endpoint(), { contextSourceRefs: ['source.original'] });
  try {
    const completed = await performLivedCompanionTurn(input);

    const alternateRoot = temp('semantic-context-alternate');
    const alternateHome = path.join(alternateRoot, 'home');
    fs.cpSync(home.home, alternateHome, { recursive: true });
    const alternateHeadPath = path.join(
      alternateHome,
      'conversations',
      home.companionLineageRef,
      input.threadRef,
      'head.json'
    );
    const alternateHead = JSON.parse(fs.readFileSync(alternateHeadPath, 'utf8'));
    const canonicalContextPath = path.resolve(alternateHome, ...alternateHead.contextPath.split('/'));
    const alternateContextPath = path.join(alternateHome, 'recovery', 'alternate-context.json');
    fs.mkdirSync(path.dirname(alternateContextPath), { recursive: true });
    fs.copyFileSync(canonicalContextPath, alternateContextPath);
    alternateHead.contextPath = 'recovery/alternate-context.json';
    const { conversationHeadSha256: ignoredAlternateHeadHash, ...alternateHeadCore } = alternateHead;
    alternateHead.conversationHeadSha256 = semanticHash(alternateHeadCore);
    fs.writeFileSync(alternateHeadPath, `${JSON.stringify(alternateHead, null, 2)}\n`, 'utf8');
    await rejectsCode(
      async () => writeLivedCompanionShutdownReceipt({
        ...home,
        home: alternateHome,
        instanceRef: input.instanceRef,
        threadRef: input.threadRef,
        expectedConversationHeadSha256: alternateHead.conversationHeadSha256
      }),
      'CONTEXT_HASH_MISMATCH'
    );

    const provenanceRoot = temp('semantic-context-source-refs');
    const provenanceHome = path.join(provenanceRoot, 'home');
    fs.cpSync(home.home, provenanceHome, { recursive: true });
    const provenanceHeadPath = path.join(
      provenanceHome,
      'conversations',
      home.companionLineageRef,
      input.threadRef,
      'head.json'
    );
    const provenanceHead = JSON.parse(fs.readFileSync(provenanceHeadPath, 'utf8'));
    const provenanceContextPath = path.resolve(provenanceHome, ...provenanceHead.contextPath.split('/'));
    const provenanceContext = JSON.parse(fs.readFileSync(provenanceContextPath, 'utf8'));
    provenanceContext.contextSourceRefs = ['source.forged'];
    const { serializedContextSha256: ignoredProvenanceHash, ...provenanceCore } = provenanceContext;
    provenanceContext.serializedContextSha256 = semanticHash(provenanceCore);
    fs.writeFileSync(provenanceContextPath, `${JSON.stringify(provenanceContext, null, 2)}\n`, 'utf8');
    provenanceHead.contextSha256 = provenanceContext.serializedContextSha256;
    const { conversationHeadSha256: ignoredProvenanceHeadHash, ...provenanceHeadCore } = provenanceHead;
    provenanceHead.conversationHeadSha256 = semanticHash(provenanceHeadCore);
    fs.writeFileSync(provenanceHeadPath, `${JSON.stringify(provenanceHead, null, 2)}\n`, 'utf8');
    await rejectsCode(
      async () => writeLivedCompanionShutdownReceipt({
        ...home,
        home: provenanceHome,
        instanceRef: input.instanceRef,
        threadRef: input.threadRef,
        expectedConversationHeadSha256: provenanceHead.conversationHeadSha256
      }),
      'CONTEXT_HASH_MISMATCH'
    );
  } finally {
    await service.close();
  }
});

test('forged orphan event JSON cannot create false duplicate evidence', async () => {
  const service = await server();
  const home = makeHome('semantic-forged-duplicate');
  const input = turn(home, service.endpoint());
  const eventsDirectory = path.join(home.home, 'conversations', home.companionLineageRef, input.threadRef, 'events');
  fs.mkdirSync(eventsDirectory, { recursive: true });
  const fakeHash = '0'.repeat(64);
  fs.writeFileSync(
    path.join(eventsDirectory, `00000000-${fakeHash}.json`),
    `${JSON.stringify({
      turnRef: input.turnRef,
      eventHash: fakeHash,
      eventKind: 'REQUEST',
      sequence: 0
    }, null, 2)}\n`,
    'utf8'
  );
  try {
    const callsBefore = service.calls();
    await rejectsCode(() => performLivedCompanionTurn(input), 'EVENT_CHAIN_CORRUPT');
    assert.equal(service.calls(), callsBefore);
  } finally {
    await service.close();
  }
});

test('absent-writer recovery never promotes a semantically corrupt head as resumable', async () => {
  const service = await server();
  const home = makeHome('semantic-abandoned-corrupt-head');
  const threadRef = ref('thread.semantic-abandoned');
  const completedInput = turn(home, service.endpoint(), { threadRef });
  try {
    const completed = await performLivedCompanionTurn(completedInput);
    const eventsDirectory = path.join(home.home, 'conversations', home.companionLineageRef, threadRef, 'events');
    const headEventFile = fs.readdirSync(eventsDirectory)
      .map((name) => path.join(eventsDirectory, name))
      .find((file) => JSON.parse(fs.readFileSync(file, 'utf8')).eventHash === completed.head.eventHash);
    fs.unlinkSync(headEventFile);
    writeAbandonedWriterLease(home, threadRef);

    let observed = null;
    await assert.rejects(
      () => performLivedCompanionTurn(turn(home, service.endpoint(), {
        threadRef,
        instanceRef: ref('instance.semantic-abandoned-next'),
        turnRef: ref('turn.semantic-abandoned-next')
      })),
      (error) => {
        observed = error;
        return error instanceof LivedCompanionError && error.code === 'THREAD_WRITER_RECOVERY_REQUIRED';
      }
    );
    const receipt = JSON.parse(fs.readFileSync(observed.details.failureReceiptPath, 'utf8'));
    assert.equal(observed.details.lastValidHeadSha256, null);
    assert.equal(receipt.lastValidHead, null);
    assert.equal(receipt.resumePossible, false);
    assert.equal(receipt.exactNextSafeRoute, 'EXPLICIT_THREAD_WRITER_LEASE_RECOVERY_REQUIRED');
  } finally {
    await service.close();
  }
});

test('one atomic writer lease prevents concurrent thread forks and releases for retry', async () => {
  const service=await server();
  const home=makeHome('concurrent-writers');
  const threadRef=ref('thread.concurrent');
  const first=turn(home,service.endpoint('delay'),{threadRef,instanceRef:ref('instance.first'),turnRef:ref('turn.first')});
  const second=turn(home,service.endpoint('delay'),{threadRef,instanceRef:ref('instance.second'),turnRef:ref('turn.second')});
  try {
    const results=await Promise.allSettled([
      performLivedCompanionTurn(first),
      performLivedCompanionTurn(second)
    ]);
    const completed=results.filter((result)=>result.status==='fulfilled');
    const rejected=results.filter((result)=>result.status==='rejected');
    assert.equal(completed.length,1);
    assert.equal(rejected.length,1);
    assert.equal(rejected[0].reason.code,'THREAD_WRITER_CONFLICT');
    assert.equal(service.calls(),1);

    const events=path.join(home.home,'conversations',home.companionLineageRef,threadRef,'events');
    assert.equal(fs.readdirSync(events).filter((name)=>name.endsWith('.json')).length,2);
    const head=JSON.parse(fs.readFileSync(path.join(home.home,'conversations',home.companionLineageRef,threadRef,'head.json'),'utf8'));
    assert.equal(head.conversationHeadSha256,completed[0].value.head.conversationHeadSha256);

    const losingInput=results[0].status==='rejected'?first:second;
    const retried=await performLivedCompanionTurn({...losingInput,endpointProfile:{...losingInput.endpointProfile,endpoint:service.endpoint()}});
    assert.equal(retried.state,'TURN_COMPLETED');
    assert.equal(service.calls(),2);

    const winningInput=results[0].status==='fulfilled'?first:second;
    await rejectsCode(()=>performLivedCompanionTurn({...winningInput,endpointProfile:{...winningInput.endpointProfile,endpoint:service.endpoint()},requestMessageRef:ref('request.retry'),responseMessageRef:ref('response.retry')}),'DUPLICATE_TURN_SUPPRESSED');
    assert.equal(service.calls(),2);
  } finally { await service.close(); }
});


test('abandoned writer lease is classified for explicit recovery instead of impossible retry', async () => {
  const service = await server();
  const home = makeHome('abandoned-writer');
  const threadRef = ref('thread.abandoned');
  const input = turn(home, service.endpoint(), {
    threadRef,
    instanceRef: ref('instance.retry'),
    turnRef: ref('turn.retry')
  });
  const { lockPath, lease } = writeAbandonedWriterLease(home, threadRef);
  try {
    let observed = null;
    await assert.rejects(
      () => performLivedCompanionTurn(input),
      (error) => {
        observed = error;
        return error instanceof LivedCompanionError && error.code === 'THREAD_WRITER_RECOVERY_REQUIRED';
      }
    );
    assert.equal(service.calls(), 0);
    assert.equal(fs.existsSync(lockPath), true);
    assert.equal(observed.details.ownerState, 'ABSENT');
    assert.equal(observed.details.leaseSha256, lease.leaseSha256);
    const receipt = JSON.parse(fs.readFileSync(observed.details.failureReceiptPath, 'utf8'));
    assert.equal(receipt.failureCode, 'THREAD_WRITER_RECOVERY_REQUIRED');
    assert.equal(receipt.exactNextSafeRoute, 'EXPLICIT_THREAD_WRITER_LEASE_RECOVERY_REQUIRED');
    assert.equal(receipt.threadWriterLeaseDisposition.ownerState, 'ABSENT');
    assert.equal(receipt.threadWriterLeaseDisposition.leaseSha256, lease.leaseSha256);
    const events = path.join(home.home, 'conversations', home.companionLineageRef, threadRef, 'events');
    assert.equal(fs.existsSync(events), false);
  } finally { await service.close(); }
});

test('unverifiable writer lease evidence routes to attention without endpoint or event effects', async () => {
  const service = await server();
  try {
    for (const variant of ['malformed', 'invalid-hash', 'invalid-identity']) {
      const home = makeHome(`unverifiable-writer-${variant}`);
      const threadRef = ref(`thread.unverifiable.${variant}`);
      const input = turn(home, service.endpoint(), {
        threadRef,
        instanceRef: ref('instance.retry'),
        turnRef: ref('turn.retry')
      });
      const evidence = writeUnverifiableWriterLease(home, threadRef, variant);
      const callsBefore = service.calls();
      let observed = null;
      await assert.rejects(
        () => performLivedCompanionTurn(input),
        (error) => {
          observed = error;
          return error instanceof LivedCompanionError && error.code === 'THREAD_WRITER_CONFLICT';
        }
      );
      assert.equal(service.calls(), callsBefore);
      assert.equal(fs.existsSync(evidence.lockPath), true);
      assert.equal(observed.details.ownerState, 'UNVERIFIABLE');
      assert.equal(observed.details.exactNextSafeRoute, 'ATTENTION_REQUIRED_UNVERIFIABLE_THREAD_WRITER');
      assert.equal(observed.details.observedLeaseFileSha256, evidence.observedLeaseFileSha256);
      assert.equal(observed.details.leaseSha256, null);
      const receipt = JSON.parse(fs.readFileSync(observed.details.failureReceiptPath, 'utf8'));
      assert.equal(receipt.failureCode, 'THREAD_WRITER_CONFLICT');
      assert.equal(receipt.exactNextSafeRoute, 'ATTENTION_REQUIRED_UNVERIFIABLE_THREAD_WRITER');
      assert.equal(receipt.threadWriterLeaseDisposition.ownerState, 'UNVERIFIABLE');
      assert.equal(receipt.threadWriterLeaseDisposition.observedLeaseFileSha256, evidence.observedLeaseFileSha256);
      assert.ok(receipt.threadWriterLeaseDisposition.leaseValidationState);
      const events = path.join(home.home, 'conversations', home.companionLineageRef, threadRef, 'events');
      assert.equal(fs.existsSync(events), false);
    }
  } finally { await service.close(); }
});

test('persistence failure before head leaves prior head absent and recovery evidence visible', async () => {
  const service=await server(); const home=makeHome('persistence'); const input=turn(home,service.endpoint(),{faults:{persistenceFailureBeforeHead:true}});
  try {
    await rejectsCode(()=>performLivedCompanionTurn(input),'PERSISTENCE_WRITE_FAILED');
    assert.equal(fs.existsSync(path.join(home.home,'conversations',home.companionLineageRef,input.threadRef,'head.json')),false);
  } finally { await service.close(); }
});

test('clean shutdown receipt binds the exact completing instance and head', async () => {
  const service=await server(); const home=makeHome('shutdown'); const input=turn(home,service.endpoint());
  try {
    const completed=await performLivedCompanionTurn(input);
    assert.throws(() => writeLivedCompanionShutdownReceipt({...home,instanceRef:'instance.not-the-writer',threadRef:input.threadRef,expectedConversationHeadSha256:completed.head.conversationHeadSha256}),
      (error) => error instanceof LivedCompanionError && error.code === 'CONVERSATION_HEAD_MISMATCH');
    const shutdown=writeLivedCompanionShutdownReceipt({...home,instanceRef:input.instanceRef,threadRef:input.threadRef,expectedConversationHeadSha256:completed.head.conversationHeadSha256});
    assert.equal(shutdown.receipt.clean,true);
    assert.equal(shutdown.receipt.instanceRef,input.instanceRef);
    assert.equal(shutdown.receipt.conversationHeadSha256,completed.head.conversationHeadSha256);
  } finally { await service.close(); }
});

test('fresh instance resumes only from the exact completing instance and shutdown receipt', async () => {
  const service=await server(); const home=makeHome('resume'); const input=turn(home,service.endpoint());
  try {
    const completed=await performLivedCompanionTurn(input);
    const shutdown=writeLivedCompanionShutdownReceipt({...home,instanceRef:input.instanceRef,threadRef:input.threadRef,expectedConversationHeadSha256:completed.head.conversationHeadSha256});
    const common={...home,threadRef:input.threadRef,expectedConversationHeadSha256:completed.head.conversationHeadSha256,expectedShutdownReceiptSha256:shutdown.receipt.shutdownReceiptSha256};
    const resumed=resumeLivedCompanionConversation({...common,priorInstanceRef:input.instanceRef,instanceRef:ref('instance.fresh')});
    assert.equal(resumed.state,'RESUMED');
    assert.equal(resumed.receipt.shutdownReceiptSha256,shutdown.receipt.shutdownReceiptSha256);
    await rejectsCode(async()=>resumeLivedCompanionConversation({...common,priorInstanceRef:input.instanceRef,instanceRef:input.instanceRef}),'CONVERSATION_HEAD_MISMATCH');
    await rejectsCode(async()=>resumeLivedCompanionConversation({...common,priorInstanceRef:'instance.never-owned-head',instanceRef:ref('instance.fresh')}),'CONVERSATION_HEAD_MISMATCH');
    await rejectsCode(async()=>resumeLivedCompanionConversation({...common,priorInstanceRef:input.instanceRef,instanceRef:ref('instance.fresh'),expectedShutdownReceiptSha256:'0'.repeat(64)}),'CONVERSATION_HEAD_MISMATCH');
  } finally { await service.close(); }
});


test('tampered head hashes and context paths outside Home fail closed', async () => {
  const service=await server(); const home=makeHome('head-integrity'); const input=turn(home,service.endpoint());
  try {
    const completed=await performLivedCompanionTurn(input);
    const shutdown=writeLivedCompanionShutdownReceipt({...home,instanceRef:input.instanceRef,threadRef:input.threadRef,expectedConversationHeadSha256:completed.head.conversationHeadSha256});
    const headPath=completed.headPath;
    const original=JSON.parse(fs.readFileSync(headPath,'utf8'));
    const outside=path.join(temp('outside-context-record'),'outside-context.json');
    fs.copyFileSync(path.resolve(home.home,...original.contextPath.split('/')),outside);

    const stale={...original,contextPath:'../outside-context.json'};
    fs.writeFileSync(headPath,`${JSON.stringify(stale,null,2)}
`,'utf8');
    await rejectsCode(async()=>resumeLivedCompanionConversation({...home,priorInstanceRef:input.instanceRef,instanceRef:ref('instance.fresh'),threadRef:input.threadRef,expectedConversationHeadSha256:original.conversationHeadSha256,expectedShutdownReceiptSha256:shutdown.receipt.shutdownReceiptSha256}),'CONVERSATION_HEAD_MISMATCH');

    const { conversationHeadSha256: ignored, ...rehashedCore }=stale;
    const rehashed={...rehashedCore,conversationHeadSha256:semanticHash(rehashedCore)};
    fs.writeFileSync(headPath,`${JSON.stringify(rehashed,null,2)}\n`,'utf8');
    const tamperedShutdown=JSON.parse(fs.readFileSync(shutdown.receiptPath,'utf8'));
    tamperedShutdown.conversationHeadSha256=rehashed.conversationHeadSha256;
    const { shutdownReceiptSha256: ignoredShutdownHash, ...tamperedShutdownCore }=tamperedShutdown;
    tamperedShutdown.shutdownReceiptSha256=semanticHash(tamperedShutdownCore);
    fs.writeFileSync(shutdown.receiptPath,`${JSON.stringify(tamperedShutdown,null,2)}\n`,'utf8');
    await rejectsCode(async()=>resumeLivedCompanionConversation({...home,priorInstanceRef:input.instanceRef,instanceRef:ref('instance.fresh'),threadRef:input.threadRef,expectedConversationHeadSha256:rehashed.conversationHeadSha256,expectedShutdownReceiptSha256:tamperedShutdown.shutdownReceiptSha256}),'CONTEXT_HASH_MISMATCH');
  } finally { await service.close(); }
});


test('exact in-memory authorization is blocked before request persistence or hostile response persistence', async () => {
  let calls = 0;
  const service = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      model: 'echo-authorization',
      choices: [{ message: { content: request.headers.authorization || '' } }]
    }));
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${service.address().port}/`;
  const secret = `Bearer ${crypto.randomUUID()}`;
  try {
    const requestHome = makeHome('privacy-request-secret');
    const requestInput = turn(requestHome, endpoint, {
      content: `do not persist ${secret}`,
      inMemoryAuthorization: secret
    });
    let requestError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(requestInput),
      (error) => {
        requestError = error;
        return error instanceof LivedCompanionError && error.code === 'PRIVACY_POLICY_BLOCKED';
      }
    );
    assert.equal(calls, 0);
    assert.equal(requestError.details.requestDurablyRecorded, false);
    assert.equal(requestError.details.responseDurablyRecorded, false);
    assert.equal(assertNoSensitivePersistence(requestHome.home, [secret]).secretLeakCount, 0);

    const responseHome = makeHome('privacy-response-secret');
    const responseInput = turn(responseHome, endpoint, {
      inMemoryAuthorization: secret
    });
    let responseError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(responseInput),
      (error) => {
        responseError = error;
        return error instanceof LivedCompanionError && error.code === 'PRIVACY_POLICY_BLOCKED';
      }
    );
    assert.equal(calls, 1);
    assert.equal(responseError.details.requestDurablyRecorded, true);
    assert.equal(responseError.details.responseDurablyRecorded, false);
    assert.equal(assertNoSensitivePersistence(responseHome.home, [secret]).secretLeakCount, 0);
    assert.equal(
      fs.existsSync(path.join(
        responseHome.home,
        'conversations',
        responseHome.companionLineageRef,
        responseInput.threadRef,
        'head.json'
      )),
      false
    );
  } finally {
    await new Promise((resolve) => service.close(resolve));
  }

});

test('raw bearer credential material is blocked even when the authorization scheme prefix is absent', async () => {
  let calls = 0;
  const service = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    const authorization = String(request.headers.authorization || '');
    const credential = authorization.replace(/^Bearer\s+/iu, '');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      model: 'credential-material-echo',
      choices: [{ message: { content: `echo:${credential}` } }]
    }));
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${service.address().port}/`;
  const credential = `tok-${crypto.randomUUID()}`;
  const authorization = `Bearer ${credential}`;
  const home = makeHome('privacy-bearer-material');
  const input = turn(home, endpoint, { inMemoryAuthorization: authorization });
  try {
    let observed = null;
    await assert.rejects(
      () => performLivedCompanionTurn(input),
      (error) => {
        observed = error;
        return error instanceof LivedCompanionError && error.code === 'PRIVACY_POLICY_BLOCKED';
      }
    );
    assert.equal(calls, 1);
    assert.equal(observed.details.requestDurablyRecorded, true);
    assert.equal(observed.details.responseDurablyRecorded, false);
    assert.equal(assertNoSensitivePersistence(home.home, [authorization, credential]).secretLeakCount, 0);
  } finally {
    await new Promise((resolve) => service.close(resolve));
  }
});

test('raw Basic password material is blocked even when the authorization header is decoded by the endpoint', async () => {
  let calls = 0;
  const service = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    const authorization = String(request.headers.authorization || '');
    const encoded = authorization.replace(/^Basic\s+/iu, '');
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const password = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : '';
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      model: 'basic-password-echo',
      choices: [{ message: { content: `echo:${password}` } }]
    }));
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${service.address().port}/`;
  const password = `pw-${crypto.randomUUID()}`;
  const authorization = `Basic ${Buffer.from(`proof-user:${password}`, 'utf8').toString('base64')}`;
  const home = makeHome('privacy-basic-password-material');
  const input = turn(home, endpoint, { inMemoryAuthorization: authorization });
  try {
    let observed = null;
    await assert.rejects(
      () => performLivedCompanionTurn(input),
      (error) => {
        observed = error;
        return error instanceof LivedCompanionError && error.code === 'PRIVACY_POLICY_BLOCKED';
      }
    );
    assert.equal(calls, 1);
    assert.equal(observed.details.requestDurablyRecorded, true);
    assert.equal(observed.details.responseDurablyRecorded, false);
    assert.equal(assertNoSensitivePersistence(home.home, [authorization, password]).secretLeakCount, 0);
  } finally {
    await new Promise((resolve) => service.close(resolve));
  }
});

test('authorization cannot escape through persisted metadata and response model provenance is validated', async () => {
  let responseMode = 'safe';
  let calls = 0;
  const service = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    response.setHeader('content-type', 'application/json');
    const model =
      responseMode === 'echo-model'
        ? request.headers.authorization
        : responseMode === 'invalid-model'
          ? { bad: true }
          : 'safe-model';
    response.end(JSON.stringify({
      model,
      choices: [{ message: { content: 'safe reply' } }]
    }));
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${service.address().port}/`;
  const secret = `Bearer ${crypto.randomUUID()}`;
  try {
    const inputHome = makeHome('privacy-nested-input-secret');
    const input = turn(inputHome, endpoint, {
      contextSourceRefs: ['source.safe', secret],
      inMemoryAuthorization: secret
    });
    let inputError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(input),
      (error) => {
        inputError = error;
        return error instanceof LivedCompanionError && error.code === 'PRIVACY_POLICY_BLOCKED';
      }
    );
    assert.equal(calls, 0);
    assert.equal(inputError.details.requestDurablyRecorded, false);
    assert.equal(assertNoSensitivePersistence(inputHome.home, [secret]).secretLeakCount, 0);

    responseMode = 'echo-model';
    const echoHome = makeHome('privacy-response-model-secret');
    const echoInput = turn(echoHome, endpoint, { inMemoryAuthorization: secret });
    let echoError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(echoInput),
      (error) => {
        echoError = error;
        return error instanceof LivedCompanionError && error.code === 'PRIVACY_POLICY_BLOCKED';
      }
    );
    assert.equal(echoError.details.requestDurablyRecorded, true);
    assert.equal(echoError.details.responseDurablyRecorded, false);
    assert.equal(assertNoSensitivePersistence(echoHome.home, [secret]).secretLeakCount, 0);
    assert.equal(
      fs.existsSync(path.join(
        echoHome.home,
        'conversations',
        echoHome.companionLineageRef,
        echoInput.threadRef,
        'head.json'
      )),
      false
    );

    responseMode = 'invalid-model';
    const invalidHome = makeHome('invalid-response-model-provenance');
    const invalidInput = turn(invalidHome, endpoint);
    let invalidError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(invalidInput),
      (error) => {
        invalidError = error;
        return error instanceof LivedCompanionError && error.code === 'ENDPOINT_RESPONSE_INVALID';
      }
    );
    assert.equal(invalidError.details.requestDurablyRecorded, true);
    assert.equal(invalidError.details.responseDurablyRecorded, false);
    assert.equal(
      fs.existsSync(path.join(
        invalidHome.home,
        'conversations',
        invalidHome.companionLineageRef,
        invalidInput.threadRef,
        'head.json'
      )),
      false
    );
  } finally {
    await new Promise((resolve) => service.close(resolve));
  }
});

test('rehashing contradictory canonical first-failure recovery claims does not make them trustworthy', async () => {
  const service = await server();
  const home = makeHome('failure-receipt-rehashed-contradiction');
  const input = turn(home, service.endpoint('http-error'));
  try {
    let firstError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(input),
      (error) => {
        firstError = error;
        return error instanceof LivedCompanionError && error.code === 'ENDPOINT_HTTP_ERROR';
      }
    );
    const firstPath = firstError.details.failureReceiptPath;
    const receipt = JSON.parse(fs.readFileSync(firstPath, 'utf8'));
    assert.equal(receipt.requestDurablyRecorded, true);

    receipt.failureCode = 'ENDPOINT_TIMEOUT';
    receipt.failureMessage = 'shape-valid but historically false recovery story';
    receipt.requestDurablyRecorded = false;
    receipt.responseDurablyRecorded = false;
    receipt.retrySameTurnAllowed = true;
    receipt.exactNextSafeRoute = 'INITIALIZE_OR_RETRY_WITH_ADMITTED_INPUTS';
    const { failureReceiptSha256: ignoredHash, ...receiptCore } = receipt;
    receipt.failureReceiptSha256 = semanticHash(receiptCore);
    fs.writeFileSync(firstPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

    const callsBefore = service.calls();
    let followError = null;
    await assert.rejects(
      () => performLivedCompanionTurn({
        ...input,
        instanceRef: ref('instance.failure-receipt.rehashed-retry'),
        requestMessageRef: ref('message.failure-receipt.rehashed.request'),
        responseMessageRef: ref('message.failure-receipt.rehashed.response'),
        endpointProfile: {
          ...input.endpointProfile,
          endpoint: service.endpoint()
        }
      }),
      (error) => {
        followError = error;
        return error instanceof LivedCompanionError && error.code === 'DUPLICATE_TURN_SUPPRESSED';
      }
    );
    assert.equal(service.calls(), callsBefore);
    assert.equal(followError.details.failureReceiptPath, null);
    assert.equal(
      followError.details.failureEvidenceIntegrityState,
      'CORRUPT_EXISTING_FIRST_FAILURE_RECEIPT'
    );
    assert.deepEqual(
      fs.readdirSync(path.dirname(firstPath)).filter((name) => name.startsWith('failure-receipt')).sort(),
      ['failure-receipt.json']
    );
  } finally {
    await service.close();
  }
});

test('tampered canonical first failure receipt cannot become trusted follow-up provenance', async () => {
  const service = await server();
  const home = makeHome('failure-receipt-integrity');
  const input = turn(home, service.endpoint('http-error'));
  try {
    let firstError = null;
    await assert.rejects(
      () => performLivedCompanionTurn(input),
      (error) => {
        firstError = error;
        return error instanceof LivedCompanionError && error.code === 'ENDPOINT_HTTP_ERROR';
      }
    );
    const firstPath = firstError.details.failureReceiptPath;
    const firstReceipt = JSON.parse(fs.readFileSync(firstPath, 'utf8'));
    firstReceipt.failureCode = 'FORGED_FAILURE_CODE';
    fs.writeFileSync(firstPath, `${JSON.stringify(firstReceipt, null, 2)}\n`, 'utf8');
    const callsBefore = service.calls();
    let followError = null;
    await assert.rejects(
      () => performLivedCompanionTurn({
        ...input,
        instanceRef: ref('instance.failure-receipt.retry'),
        requestMessageRef: ref('message.failure-receipt.retry.request'),
        responseMessageRef: ref('message.failure-receipt.retry.response'),
        endpointProfile: {
          ...input.endpointProfile,
          endpoint: service.endpoint()
        }
      }),
      (error) => {
        followError = error;
        return error instanceof LivedCompanionError && error.code === 'DUPLICATE_TURN_SUPPRESSED';
      }
    );
    assert.equal(service.calls(), callsBefore);
    assert.equal(followError.details.failureReceiptPath, null);
    assert.equal(
      followError.details.failureEvidenceIntegrityState,
      'CORRUPT_EXISTING_FIRST_FAILURE_RECEIPT'
    );
    const recoveryDirectory = path.dirname(firstPath);
    assert.deepEqual(
      fs.readdirSync(recoveryDirectory).filter((name) => name.startsWith('failure-receipt')).sort(),
      ['failure-receipt.json']
    );
  } finally {
    await service.close();
  }
});

test('canonical first failure receipt is no-clobber and follow-ups bind its exact bytes', async () => {
  const service = await server();
  const home = makeHome('failure-receipt-no-clobber');
  const threadRef = ref('thread.failure-receipt-no-clobber');
  const owner = turn(home, service.endpoint('delay'), {
    threadRef,
    instanceRef: ref('instance.failure-receipt.owner'),
    turnRef: ref('turn.failure-receipt.owner')
  });
  const contenderBase = turn(home, service.endpoint(), {
    threadRef,
    turnRef: ref('turn.failure-receipt.contender')
  });
  try {
    const ownerPromise = performLivedCompanionTurn(owner);
    await new Promise((resolve) => setTimeout(resolve, 30));

    let firstConflict = null;
    await assert.rejects(
      () => performLivedCompanionTurn({
        ...contenderBase,
        instanceRef: ref('instance.failure-receipt.contender.one')
      }),
      (error) => {
        firstConflict = error;
        return error instanceof LivedCompanionError && error.code === 'THREAD_WRITER_CONFLICT';
      }
    );
    const firstPath = firstConflict.details.failureReceiptPath;
    const firstBytes = fs.readFileSync(firstPath);
    assert.equal(firstConflict.details.failureEvidenceIntegrityState, 'FIRST_FAILURE_ATOMICALLY_FORMED');

    let secondConflict = null;
    await assert.rejects(
      () => performLivedCompanionTurn({
        ...contenderBase,
        instanceRef: ref('instance.failure-receipt.contender.two'),
        requestMessageRef: ref('message.failure-receipt.contender.two.request'),
        responseMessageRef: ref('message.failure-receipt.contender.two.response')
      }),
      (error) => {
        secondConflict = error;
        return error instanceof LivedCompanionError && error.code === 'THREAD_WRITER_CONFLICT';
      }
    );
    assert.deepEqual(fs.readFileSync(firstPath), firstBytes);
    assert.match(
      secondConflict.details.failureEvidenceIntegrityState,
      /^FOLLOW_UP_(?:CONTENT_ADDRESSED_FORMED|IDEMPOTENTLY_REUSED)$/u
    );
    const follow = JSON.parse(fs.readFileSync(secondConflict.details.failureReceiptPath, 'utf8'));
    assert.equal(follow.followUpToFirstFailure, true);
    assert.equal(
      follow.firstFailureReceiptFileSha256,
      crypto.createHash('sha256').update(firstBytes).digest('hex')
    );

    const completed = await ownerPromise;
    assert.equal(completed.state, 'TURN_COMPLETED');
  } finally {
    await service.close();
  }
});

test('endpoint provenance is sanitized and in-memory credentials never persist', async () => {
  const service=await server(); const home=makeHome('privacy'); const secret=`Bearer ${crypto.randomUUID()}`; const query=`secret-${crypto.randomUUID()}`;
  try {
    const result=await performLivedCompanionTurn(turn(home,`${service.endpoint()}?token=${query}`,{inMemoryAuthorization:secret}));
    assert.equal(result.responseEvent.sanitizedEndpointOrigin,sanitizeEndpointOrigin(service.endpoint()));
    assert.deepEqual(assertNoSensitivePersistence(home.home,[secret,query]).secretLeakCount,0);
  } finally { await service.close(); }
});

test('CLI proof performs loopback turn, shutdown, fresh-process resume, failures, and privacy controls', () => {
  const home=temp('cli-proof-home'); const receipt=path.join(temp('cli-proof-receipt'),'receipt.json');
  const result=spawnSync(process.execPath,['scripts/lived-companion.mjs','proof'],{cwd:ROOT,encoding:'utf8',env:{...process.env,VEXLIFE_G01_PROOF_HOME:home,VEXLIFE_G01_PROOF_RECEIPT:receipt,VEXLIFE_CANDIDATE_HEAD_SHA:'a'.repeat(40)},maxBuffer:32*1024*1024});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const value=JSON.parse(fs.readFileSync(receipt,'utf8'));
  assert.equal(value.state,'PASS');
  assert.equal(value.actualHttpCall,true);
  assert.equal(value.freshProcessResume,true);
  assert.equal(value.typedFailureProofs.length>=31,true);
  assert.equal(value.semanticStateContinuity,true);
  assert.equal(value.semanticEvidenceIntegrity,true);
  assert.equal(value.credentialPersistenceBoundary,true);
  assert.equal(value.failureEvidencePublicationIntegrity,true);
  assert.equal(value.abandonedWriterRecoveryDisposition,true);
  assert.equal(value.abandonedWriterRecoveryOperationHeld,true);
  assert.equal(value.LC18Performed,false);
});

function durableRelay(messageRef, originatorRef, recipientRef, overrides = {}) {
  const sourceLanguageRef = overrides.sourceLanguageRef ?? 'language.en';
  const targetLanguageRef = overrides.targetLanguageRef ?? sourceLanguageRef;
  const composed = composeSemanticRelay({
    relayRef: overrides.relayRef ?? `relay.${messageRef}`,
    sourceMessageRef: messageRef,
    sourceLanguageRef,
    sourceLocaleRef: 'locale.en-US',
    preferredConversationLanguageRef: 'language.en',
    requestedResponseLanguageRef: targetLanguageRef,
    uiLocaleRef: 'locale.en-US',
    originatorRef,
    originatorKind: overrides.originatorKind ?? (originatorRef.startsWith('person.') ? 'HUMAN' : 'AI'),
    onBehalfOfOriginator: false,
    materiality: 'ORDINARY',
    ambiguityState: 'CLEAR',
    recipientRefs: [recipientRef],
    intentRefs: ['intent.lived.semantic-relay'],
    canonicalMeaningRefs: ['meaning.lived.semantic-relay'],
    interpretationProjectionRef: `projection.interpretation.${messageRef}`,
    interpretationState: 'CANDIDATE',
    boundaryClassRef: 'boundary.device-private.lived-turn',
    targets: [{
      recipientRef,
      recipientPreferredLanguageRef: targetLanguageRef,
      targetLanguageRef,
      targetAudienceRef: 'audience.direct-companion',
      runtimeCapability: {
        capabilityRef: 'capability.runtime.test-current',
        currentnessState: 'CURRENT',
        multilingualOutput: true,
        supportedLanguageRefs: [targetLanguageRef],
        evidenceRefs: ['evidence.runtime.test-current']
      },
      localeQualityState: 'ADMITTED',
      terminologyState: 'ADMITTED',
      authorityState: 'ADMITTED',
      localizationReadinessState: 'UNAVAILABLE',
      humanReviewAvailable: false,
      deliveryState: 'NOT_DELIVERED',
      acknowledgementState: 'NOT_REQUESTED',
      understandingState: 'NOT_ASSESSED'
    }],
    sourceRefs: [`source.${messageRef}`],
    evidenceRefs: ['evidence.lived.semantic-relay'],
    authorityRefs: ['authority.lived.semantic-relay']
  });
  assert.equal(composed.status, 'COMPOSED');
  return composed.relay;
}

test('durable v2 lived events carry reference-only semantic relay while raw content remains canonical at the event root', async () => {
  const service = await server();
  const home = makeHome('semantic-relay-v2');
  const requestMessageRef = ref('message.request.semantic');
  const responseMessageRef = ref('message.response.semantic');
  try {
    const result = await performLivedCompanionTurn(turn(home, service.endpoint(), {
      requestMessageRef,
      responseMessageRef,
      requestSemanticRelay: durableRelay(requestMessageRef, 'person.test', 'role.vex.companion'),
      responseSemanticRelay: durableRelay(responseMessageRef, 'role.vex.companion', 'person.test', { originatorKind: 'AI' })
    }));
    assert.equal(result.requestEvent.schemaVersion, 'vexlife.lived-companion-event/v2');
    assert.equal(result.responseEvent.schemaVersion, 'vexlife.lived-companion-event/v2');
    assert.equal(result.requestEvent.content, 'hello');
    assert.equal(result.responseEvent.content, 'reply');
    assert.equal(result.requestEvent.semanticRelay.sourceMessageRef, requestMessageRef);
    assert.equal(result.responseEvent.semanticRelay.sourceMessageRef, responseMessageRef);
    assert.equal(JSON.stringify(result.requestEvent.semanticRelay).includes('hello'), false);
    assert.equal(JSON.stringify(result.responseEvent.semanticRelay).includes('reply'), false);
    const { eventHash: requestHash, ...requestCore } = result.requestEvent;
    const { eventHash: responseHash, ...responseCore } = result.responseEvent;
    assert.equal(semanticHash(requestCore), requestHash);
    assert.equal(semanticHash(responseCore), responseHash);
  } finally {
    await service.close();
  }
});

test('historical v1 events remain exact and mixed v1/v2 event chains resume without fabricated relay or confirmation truth', async () => {
  const service = await server();
  const home = makeHome('semantic-relay-mixed');
  const threadRef = ref('thread.semantic.mixed');
  const channelRef = ref('channel.semantic.mixed');
  const firstInstanceRef = ref('instance.semantic.v1');
  const secondInstanceRef = ref('instance.semantic.v2');
  try {
    const historical = await performLivedCompanionTurn(turn(home, service.endpoint(), {
      instanceRef: firstInstanceRef,
      threadRef,
      channelRef,
      turnRef: ref('turn.semantic.v1'),
      requestMessageRef: ref('message.request.v1'),
      responseMessageRef: ref('message.response.v1')
    }));
    assert.equal(historical.requestEvent.schemaVersion, 'vexlife.lived-companion-event/v1');
    assert.equal(Object.hasOwn(historical.requestEvent, 'semanticRelay'), false);
    assert.equal(Object.hasOwn(historical.responseEvent, 'semanticRelay'), false);

    const requestMessageRef = ref('message.request.v2');
    const responseMessageRef = ref('message.response.v2');
    const current = await performLivedCompanionTurn(turn(home, service.endpoint(), {
      instanceRef: secondInstanceRef,
      threadRef,
      channelRef,
      turnRef: ref('turn.semantic.v2'),
      requestMessageRef,
      responseMessageRef,
      requestSemanticRelay: durableRelay(requestMessageRef, 'person.test', 'role.vex.companion'),
      responseSemanticRelay: durableRelay(responseMessageRef, 'role.vex.companion', 'person.test', { originatorKind: 'AI' })
    }));
    const shutdown = writeLivedCompanionShutdownReceipt({
      ...home,
      instanceRef: secondInstanceRef,
      threadRef,
      expectedConversationHeadSha256: current.head.conversationHeadSha256
    });
    const resumed = resumeLivedCompanionConversation({
      ...home,
      priorInstanceRef: secondInstanceRef,
      instanceRef: ref('instance.semantic.resumed'),
      threadRef,
      expectedConversationHeadSha256: current.head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    });
    assert.deepEqual(resumed.chain.map((event) => event.schemaVersion), [
      'vexlife.lived-companion-event/v1',
      'vexlife.lived-companion-event/v1',
      'vexlife.lived-companion-event/v2',
      'vexlife.lived-companion-event/v2'
    ]);
    assert.equal(Object.hasOwn(resumed.chain[0], 'semanticRelay'), false);
    assert.equal(Object.hasOwn(resumed.chain[1], 'semanticRelay'), false);
    assert.equal(resumed.chain[2].semanticRelay.confirmedByRef, null);
    assert.equal(resumed.chain[3].semanticRelay.confirmedByRef, null);
  } finally {
    await service.close();
  }
});

test('raw text inside durable semantic relay metadata fails before any request event or endpoint effect', async () => {
  const service = await server();
  const home = makeHome('semantic-relay-raw-reject');
  const requestMessageRef = ref('message.request.raw-reject');
  const responseMessageRef = ref('message.response.raw-reject');
  const invalidRelay = {
    ...durableRelay(requestMessageRef, 'person.test', 'role.vex.companion'),
    rawText: 'hello'
  };
  const input = turn(home, service.endpoint(), {
    requestMessageRef,
    responseMessageRef,
    requestSemanticRelay: invalidRelay,
    responseSemanticRelay: durableRelay(responseMessageRef, 'role.vex.companion', 'person.test', { originatorKind: 'AI' })
  });
  try {
    await rejectsCode(() => performLivedCompanionTurn(input), 'SEMANTIC_RELAY_INVALID');
    assert.equal(service.calls(), 0);
    const headPath = path.join(home.home, 'conversations', home.companionLineageRef, input.threadRef, 'head.json');
    assert.equal(fs.existsSync(headPath), false);
  } finally {
    await service.close();
  }
});

// [VXG RealForever]
