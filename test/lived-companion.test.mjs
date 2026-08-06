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
    if (pathname.startsWith('/http-error/')) { response.statusCode = 500; return response.end('{}'); }
    if (pathname.startsWith('/invalid/')) return response.end(JSON.stringify({ choices: [] }));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content: 'reply' } }] }));
  });
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  return { endpoint: (route='ok') => `http://127.0.0.1:${instance.address().port}/${route}/`, calls: () => calls, close: () => new Promise((resolve) => instance.close(resolve)) };
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

test('failure vocabulary contains every required typed failure', () => {
  assert.equal(LIVED_COMPANION_FAILURE_CODES.length, 15);
  assert.equal(new Set(LIVED_COMPANION_FAILURE_CODES).size, 15);
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

test('existing Home is preserved and requires migration', async () => {
  const value = makeHome('existing');
  await rejectsCode(async () => initializeLivedCompanionHome(value), 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN');
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
    const outside=path.join(path.dirname(home.home),'outside-context.json');
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
  assert.equal(value.typedFailureProofs.length>=15,true);
  assert.equal(value.LC18Performed,false);
});

// [VXG RealForever]
