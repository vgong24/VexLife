import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BrowserCompanionBridgeError,
  createBrowserCompanionBridge,
  resolveBrowserCompanionRuntimeBinding,
  validateBrowserCompanionRequest
} from '../src/core/browser-companion-bridge.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import { createContextLease } from '../src/core/context-lease.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startModelServer() {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls.push({ path: request.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      model: 'Qwen3.5-4B-Q4_K_M',
      choices: [{ message: { content: 'Real local bridge reply.' } }]
    }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    calls,
    endpoint: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function makeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-browser-companion-'));
  const home = path.join(root, 'home');
  initializeLivedCompanionHome({
    home,
    homeRef: 'vex-home.browser-companion-test',
    familyRef: 'vex-family.browser-companion-test',
    deviceRef: 'device.vexlife.browser-companion-test',
    companionLineageRef: 'companion-lineage.vexlife.browser-companion-test'
  });
  return { root, home };
}

test('browser companion runtime binding is server-side numeric loopback only', () => {
  assert.equal(resolveBrowserCompanionRuntimeBinding({}).state, 'UNBOUND');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'BOUND');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://localhost:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'https://127.0.0.1:18080', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
  assert.equal(resolveBrowserCompanionRuntimeBinding({ endpoint: 'http://127.0.0.1:18080?token=secret', model: 'Qwen3.5-4B-Q4_K_M' }).state, 'MISCONFIGURED');
});

test('browser request cannot inject endpoint, Home, runtime or authorization authority', () => {
  const admitted = {
    projectRef: 'project.local-vex',
    threadRef: 'thread.local-vex.foundation',
    channelRef: 'channel.local-vex.companion',
    content: 'Hello Vex',
    screenRef: 'screen.vexlife.chat',
    selectedNodeRef: 'element.channel.companion'
  };
  assert.equal(validateBrowserCompanionRequest(admitted).content, 'Hello Vex');
  assert.equal(validateBrowserCompanionRequest({ ...admitted, semanticRelayInput: semanticRelayInput() }).semanticRelayInput.relayRef, 'relay.browser-companion-test');
  for (const extra of ['endpoint', 'home', 'runtimeExecutable', 'authorization']) {
    assert.throws(
      () => validateBrowserCompanionRequest({ ...admitted, [extra]: 'forbidden' }),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_REQUEST_NOT_ADMITTED'
    );
  }
});

test('unbound browser companion fails closed without synthetic output', async () => {
  const { root, home } = makeHome();
  try {
    const bridge = createBrowserCompanionBridge({ home });
    assert.equal(bridge.status().state, 'UNBOUND');
    await assert.rejects(
      () => bridge.performTurn({
        threadRef: 'thread.local-vex.foundation',
        channelRef: 'channel.local-vex.companion',
        content: 'This must not fabricate a reply.'
      }),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_RUNTIME_UNBOUND'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser companion delegates the visible turn to G01 and persists its exact head', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({
      home,
      endpoint: model.endpoint,
      model: 'Qwen3.5-4B-Q4_K_M',
      instanceRef: 'instance.vexlife.browser-companion-test'
    });
    assert.equal(bridge.status().state, 'BOUND');
    const result = await bridge.performTurn({
      projectRef: 'project.local-vex',
      threadRef: 'thread.local-vex.foundation',
      channelRef: 'channel.local-vex.companion',
      content: 'Show me one real local reply.',
      screenRef: 'screen.vexlife.chat',
      selectedNodeRef: 'element.channel.companion'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(result.truthClass, 'CURRENT_LOCAL_MODEL');
    assert.equal(result.content, 'Real local bridge reply.');
    assert.equal(result.actualHttpCall, true);
    assert.equal(result.loopbackOnly, true);
    assert.equal(result.writerLeaseReleased, true);
    assert.match(result.conversationHeadSha256, /^[a-f0-9]{64}$/u);
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].path, '/v1/chat/completions');
    assert.equal(model.calls[0].body.model, 'Qwen3.5-4B-Q4_K_M');

    const headPath = path.join(
      home,
      'conversations',
      'companion-lineage.vexlife.browser-companion-test',
      'thread.local-vex.foundation',
      'head.json'
    );
    const head = JSON.parse(fs.readFileSync(headPath, 'utf8'));
    assert.equal(head.conversationHeadSha256, result.conversationHeadSha256);
    assert.equal(head.threadRef, 'thread.local-vex.foundation');
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser source never routes companion channel through simulatedReply', () => {
  const chat = fs.readFileSync(path.join(ROOT, 'reference/browser/modules/chat-controller.js'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'scripts/serve-browser.mjs'), 'utf8');
  assert.match(chat, /channel\.roleKey === 'companion'[\s\S]*requestRealCompanionReply/u);
  assert.match(chat, /simulatedReply\(channel, frameAtSend\)[\s\S]*channel\.roleKey === 'companion'\) return false/u);
  assert.match(chat, /fetch\('\/api\/v1\/companion\/turn'/u);
  assert.match(chat, /channel\.roleKey === 'companion' \? companionBindingState === 'BOUND' : isVexAvailable\(\)/u);
  assert.doesNotMatch(chat, /endpoint\s*:/u);
  assert.match(server, /VEXLIFE_COMPANION_ENDPOINT/u);
  assert.match(server, /createBrowserCompanionBridge/u);
});

function semanticRelayInput(overrides = {}) {
  return {
    relayRef: 'relay.browser-companion-test',
    sourceLanguageRef: 'language.en',
    sourceLocaleRef: 'locale.en-US',
    preferredConversationLanguageRef: 'language.en',
    requestedResponseLanguageRef: 'language.ja',
    uiLocaleRef: 'locale.en-US',
    originatorRef: 'person.local-user',
    originatorKind: 'HUMAN',
    onBehalfOfOriginator: true,
    materiality: 'MATERIAL',
    ambiguityState: 'AMBIGUOUS',
    recipientRefs: ['role.vex.companion'],
    intentRefs: ['intent.browser-companion-test'],
    canonicalMeaningRefs: ['meaning.browser-companion-test'],
    interpretationProjectionRef: 'projection.interpretation.browser-companion-test',
    interpretationState: 'CANDIDATE',
    boundaryClassRef: 'boundary.browser-companion-test',
    sourceRefs: ['source.browser-companion-test'],
    evidenceRefs: ['evidence.browser-companion-test'],
    authorityRefs: ['authority.browser-companion-test'],
    targets: [{
      recipientRef: 'role.vex.companion',
      recipientPreferredLanguageRef: 'language.ja',
      targetLanguageRef: 'language.ja',
      targetAudienceRef: 'audience.local-vex',
      runtimeCapability: {
        capabilityRef: 'capability.runtime.multilingual.browser-companion-test',
        currentnessState: 'CURRENT',
        multilingualOutput: true,
        supportedLanguageRefs: ['language.en', 'language.ja'],
        evidenceRefs: ['evidence.runtime.multilingual.current.browser-companion-test']
      },
      localeQualityState: 'ADMITTED',
      terminologyState: 'ADMITTED',
      authorityState: 'ADMITTED',
      localizationReadinessState: 'TRANSLATION_READY',
      humanReviewAvailable: false,
      deliveryState: 'NOT_DELIVERED',
      acknowledgementState: 'NOT_REQUESTED',
      understandingState: 'NOT_ASSESSED',
      equivalenceReceipt: {
        canonicalMeaningRefs: ['meaning.browser-companion-test'],
        intentRefs: ['intent.browser-companion-test'],
        sourceRefs: ['source.browser-companion-test'],
        evidenceRefs: ['evidence.browser-companion-test'],
        boundaryClassRef: 'boundary.browser-companion-test'
      }
    }],
    ...overrides
  };
}

test('material browser semantic relay holds before model or durable message effect until originating human confirms', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({ home, endpoint: model.endpoint, model: 'Qwen3.5-4B-Q4_K_M', instanceRef: 'instance.vexlife.browser-companion-relay-test' });
    const attention = await bridge.performTurn({
      threadRef: 'thread.local-vex.foundation',
      channelRef: 'channel.local-vex.companion',
      content: 'Do not send until I confirm the meaning.',
      semanticRelayInput: semanticRelayInput()
    });
    assert.equal(attention.state, 'CONFIRMATION_REQUIRED');
    assert.equal(attention.truthClass, 'CURRENT_SEMANTIC_RELAY_ATTENTION');
    assert.equal(attention.rawTextIncluded, false);
    assert.deepEqual(attention.requiredActions, ['CONFIRM', 'CORRECT', 'HOLD']);
    assert.equal(model.calls.length, 0);
    const headPath = path.join(home, 'conversations', 'companion-lineage.vexlife.browser-companion-test', 'thread.local-vex.foundation', 'head.json');
    assert.equal(fs.existsSync(headPath), false);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('originating-human CONFIRM persists the exact reference-only relay and still uses the real G01 path', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({ home, endpoint: model.endpoint, model: 'Qwen3.5-4B-Q4_K_M', instanceRef: 'instance.vexlife.browser-companion-relay-confirm-test' });
    const result = await bridge.performTurn({
      threadRef: 'thread.local-vex.foundation',
      channelRef: 'channel.local-vex.companion',
      content: 'Confirmed source content remains canonical.',
      semanticRelayInput: semanticRelayInput(),
      semanticRelayAction: 'CONFIRM'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(result.requestSemanticRelay.interpretationState, 'CONFIRMED');
    assert.equal(result.requestSemanticRelay.confirmedByRef, 'person.local-user');
    assert.equal(result.requestSemanticRelay.sourceLanguageRef, 'language.en');
    assert.equal(result.requestSemanticRelay.requestedResponseLanguageRef, 'language.ja');
    assert.equal(result.requestSemanticRelay.uiLocaleRef, 'locale.en-US');
    assert.equal(result.requestSemanticRelay.targets[0].projectionMode, 'MODEL_NATIVE');
    assert.equal(result.requestSemanticRelay.targets[0].runtimeCapability.currentnessState, 'CURRENT');
    assert.equal(result.responseSemanticRelay, null);
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].body.messages[0].content, 'Confirmed source content remains canonical.');
    const eventsRoot = path.join(home, 'conversations', 'companion-lineage.vexlife.browser-companion-test', 'thread.local-vex.foundation', 'events');
    const events = fs.readdirSync(eventsRoot).sort().map((name) => JSON.parse(fs.readFileSync(path.join(eventsRoot, name), 'utf8')));
    assert.equal(events[0].content, 'Confirmed source content remains canonical.');
    assert.equal(events[0].semanticRelay.relayRef, 'relay.browser-companion-test');
    assert.equal(Object.hasOwn(events[0].semanticRelay, 'rawText'), false);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browser semantic relay rejects raw-text metadata before endpoint or durable message effect', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({ home, endpoint: model.endpoint, model: 'Qwen3.5-4B-Q4_K_M', instanceRef: 'instance.vexlife.browser-companion-relay-invalid-test' });
    await assert.rejects(
      () => bridge.performTurn({
        threadRef: 'thread.local-vex.foundation',
        channelRef: 'channel.local-vex.companion',
        content: 'This source stays outside relay metadata.',
        semanticRelayInput: semanticRelayInput({ rawText: 'forbidden duplicate' })
      }),
      (error) => error instanceof BrowserCompanionBridgeError && error.code === 'COMPANION_SEMANTIC_RELAY_INVALID'
    );
    assert.equal(model.calls.length, 0);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('originating-human CORRECT mints a distinct server-side interpretation projection and preserves supersession lineage', async () => {
  const { root, home } = makeHome();
  const model = await startModelServer();
  try {
    const bridge = createBrowserCompanionBridge({ home, endpoint: model.endpoint, model: 'Qwen3.5-4B-Q4_K_M', instanceRef: 'instance.vexlife.browser-companion-relay-correct-test' });
    const priorProjectionRef = 'projection.interpretation.browser-companion-test';
    const result = await bridge.performTurn({
      threadRef: 'thread.local-vex.foundation',
      channelRef: 'channel.local-vex.companion',
      content: 'Corrected source content remains canonical.',
      semanticRelayInput: semanticRelayInput({ interpretationProjectionRef: priorProjectionRef }),
      semanticRelayAction: 'CORRECT'
    });
    assert.equal(result.state, 'TURN_COMPLETED');
    assert.equal(result.requestSemanticRelay.interpretationState, 'CORRECTED');
    assert.equal(result.requestSemanticRelay.supersedesInterpretationProjectionRef, priorProjectionRef);
    assert.notEqual(result.requestSemanticRelay.interpretationProjectionRef, priorProjectionRef);
    assert.match(result.requestSemanticRelay.interpretationProjectionRef, /^projection\.interpretation\.browser-correction\.[0-9a-f-]{36}$/u);
    assert.equal(result.requestSemanticRelay.confirmedByRef, 'person.local-user');
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].body.messages[0].content, 'Corrected source content remains canonical.');
    const eventsRoot = path.join(home, 'conversations', 'companion-lineage.vexlife.browser-companion-test', 'thread.local-vex.foundation', 'events');
    const events = fs.readdirSync(eventsRoot).sort().map((name) => JSON.parse(fs.readFileSync(path.join(eventsRoot, name), 'utf8')));
    assert.equal(events[0].content, 'Corrected source content remains canonical.');
    assert.equal(events[0].semanticRelay.interpretationState, 'CORRECTED');
    assert.equal(events[0].semanticRelay.supersedesInterpretationProjectionRef, priorProjectionRef);
    assert.equal(Object.hasOwn(events[0].semanticRelay, 'rawText'), false);
  } finally {
    await model.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function browserPromptContextLease(selectedSourceRefs) {
  const now=Date.now();
  return createContextLease({
    leaseRef:`lease.browser-prompt-context.${crypto.randomUUID()}`, workerRef:'worker.browser-prompt-context.test', workNodeRef:'work-node.browser-prompt-context.test',
    graphFingerprint:'1'.repeat(64), trustSnapshotFingerprint:'2'.repeat(64), runtimeSnapshotFingerprint:'3'.repeat(64), schedulerGeneration:1,
    resourceLeaseFingerprint:'4'.repeat(64), capabilityLeaseFingerprint:'5'.repeat(64), effectLeaseFingerprint:'6'.repeat(64), cancellationTokenRef:'cancel.browser-prompt-context.test',
    foundationKernelRef:'foundation.browser-prompt-context.test', roleFrameRef:'role-frame.browser-prompt-context.test', intentFrameRef:'intent-frame.browser-prompt-context.test',
    selectedAtlasRefs:[], selectedSourceRefs, applicableCultureRefs:[], applicableLessonRefs:[], applicableReleaseRefs:[], inputTokenEstimate:2048, reservedOutputTokens:512, hardTokenLimit:4096,
    formedAt:new Date(now-1000).toISOString(), expiresAt:new Date(now+600000).toISOString(), observedAt:new Date(now).toISOString(), currentness:'CURRENT', lifecycle:'ACTIVE', checkpointReturnRef:'checkpoint.browser-prompt-context.test'
  }).lease;
}
function browserPromptContinuity(lineageRef,threadRef,lease){
  const core={schemaVersion:'vexlife.continuity-stream-adapter-projection/v1',currentness:'CURRENT',currentnessReasonRefs:[],portableFrame:{sourceRefs:[]},owners:{context:{leaseRef:lease.leaseRef,semanticFingerprint:lease.semanticFingerprint,currentness:'CURRENT',lifecycle:'ACTIVE'}},current:{lineageRef,threadRef,cursorEventRef:'event.cursor.browser-prompt',frameRef:'frame.browser-prompt',frameFingerprint:`sha256:${'7'.repeat(64)}`,activeWorkNodeRefs:[],currentIntentReceiptRefs:[],openLoopRefs:[],currentStatementRefs:[],currentContinuityRecordRefs:[],currentDailyStratumRefOrNull:null,recoveryPhaseOrNull:null},sourceRefs:[],effects:{homeMutated:false,memoryPromoted:false,scoreAppended:false,intentTransitioned:false,contextLeaseCreated:false,continuityAcceptanceCreated:false,recoveryActionApplied:false,dailyDreamCommitted:false,journalRewritten:false,providerCalled:false,networkCalled:false,publicationPerformed:false,modelCalled:false,trainingRan:false,modelWeightsChanged:false,relationshipMutated:false,externalDisclosure:false},projectionTruth:{readOnly:true,ownerMutationPerformed:false,rawTranscriptIncluded:false,hiddenReasoningIncluded:false,rawPrivatePayloadIncluded:false,semanticAcceptanceCreated:false,memoryPromotionPerformed:false,recoveryActionPerformed:false,externalEffectPerformed:false}};
  const semanticFingerprint=semanticHash(core);return {...core,adapterProjectionRef:`projection.vexlife.continuity-stream-adapter.${semanticFingerprint.slice(0,32)}`,semanticFingerprint};
}

test('browser prompt-context resolver materializes selected lived events into the actual loopback messages request', async () => {
  const {root,home}=makeHome(); const model=await startModelServer(); const threadRef='thread.local-vex.prompt-context';
  try {
    const firstBridge=createBrowserCompanionBridge({home,endpoint:model.endpoint,model:'Qwen3.5-4B-Q4_K_M',instanceRef:'instance.vexlife.browser-prompt-first'});
    await firstBridge.performTurn({threadRef,channelRef:'channel.local-vex.companion',content:'Remember cobalt lantern.'});
    const eventsRoot=path.join(home,'conversations','companion-lineage.vexlife.browser-companion-test',threadRef,'events');
    const priorEvents=fs.readdirSync(eventsRoot).sort().map(name=>JSON.parse(fs.readFileSync(path.join(eventsRoot,name),'utf8')));
    const selectedRefs=priorEvents.map(event=>event.eventRef); const lease=browserPromptContextLease(selectedRefs); const continuityProjection=browserPromptContinuity('companion-lineage.vexlife.browser-companion-test',threadRef,lease);
    const bridge=createBrowserCompanionBridge({home,endpoint:model.endpoint,model:'Qwen3.5-4B-Q4_K_M',instanceRef:'instance.vexlife.browser-prompt-second',promptContextResolver:async()=>({contextLease:lease,continuityProjection,selectedConversationEventRefs:selectedRefs})});
    const result=await bridge.performTurn({threadRef,channelRef:'channel.local-vex.companion',content:'What phrase did I ask you to remember?'});
    assert.deepEqual(model.calls.at(-1).body.messages,[{role:'user',content:'Remember cobalt lantern.'},{role:'assistant',content:'Real local bridge reply.'},{role:'user',content:'What phrase did I ask you to remember?'}]);
    assert.equal(result.promptContextMaterialization.currentRequestIncludedExactlyOnce,true);
    assert.equal(result.promptContextMaterialization.exactMessagesSha256,semanticHash(model.calls.at(-1).body.messages));
  } finally {await model.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('browser context wrapper leaves differently-shaped Home School internal inference prompts separately governed', async () => {
  const {root,home}=makeHome(); const model=await startModelServer(); const threadRef='thread.local-vex.prompt-context-governed';
  try {
    const firstBridge=createBrowserCompanionBridge({home,endpoint:model.endpoint,model:'Qwen3.5-4B-Q4_K_M',instanceRef:'instance.vexlife.browser-prompt-governed-first'});
    await firstBridge.performTurn({threadRef,channelRef:'channel.local-vex.companion',content:'Prior exact context.'});
    const eventsRoot=path.join(home,'conversations','companion-lineage.vexlife.browser-companion-test',threadRef,'events');
    const selectedRefs=fs.readdirSync(eventsRoot).sort().map(name=>JSON.parse(fs.readFileSync(path.join(eventsRoot,name),'utf8')).eventRef); const lease=browserPromptContextLease(selectedRefs); const continuityProjection=browserPromptContinuity('companion-lineage.vexlife.browser-companion-test',threadRef,lease);
    const capabilityRuntime={resolveTurn:async({inference,endpointProfile,taskIntent,inMemoryAuthorization,timeoutMs})=>{await inference({endpointProfile,requestContent:'HOME_SCHOOL_INTERNAL_PROMPT',inMemoryAuthorization,timeoutMs});const response=await inference({endpointProfile,requestContent:taskIntent,inMemoryAuthorization,timeoutMs});return {response,actualHttpCall:true,contextSourceRefs:[],runtimeProjection:{schemaVersion:'test.home-school-separated/v1'}};}};
    const bridge=createBrowserCompanionBridge({home,endpoint:model.endpoint,model:'Qwen3.5-4B-Q4_K_M',instanceRef:'instance.vexlife.browser-prompt-governed-second',capabilityRuntime,promptContextResolver:async()=>({contextLease:lease,continuityProjection,selectedConversationEventRefs:selectedRefs})});
    const before=model.calls.length; await bridge.performTurn({threadRef,channelRef:'channel.local-vex.companion',content:'Current exact human request.'}); const calls=model.calls.slice(before);
    assert.deepEqual(calls[0].body.messages,[{role:'user',content:'HOME_SCHOOL_INTERNAL_PROMPT'}]);
    assert.deepEqual(calls[1].body.messages,[{role:'user',content:'Prior exact context.'},{role:'assistant',content:'Real local bridge reply.'},{role:'user',content:'Current exact human request.'}]);
  } finally {await model.close();fs.rmSync(root,{recursive:true,force:true});}
});


// [VXG RealForever]
