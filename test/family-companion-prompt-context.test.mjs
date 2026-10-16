import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  createFamilySpace,
  addFamilyMember,
  readFamilySpace
} from '../src/core/family-space-store.mjs';
import {
  createFamilyChannel,
  createFamilyMessage
} from '../src/core/family-conversation.mjs';
import {
  appendConversationMessage,
  materializeConversationChannel
} from '../src/core/conversation-store.mjs';
import {
  createFamilyGroupContextLease,
  formFamilyGroupFrontier
} from '../src/core/family-group-context-runtime.mjs';
import {
  materializeFamilyPromptContext
} from '../src/core/family-companion-prompt-context.mjs';
import {
  requestLivedCompanionInference
} from '../src/core/lived-companion.mjs';

const instanceRef = 'instance.test.vc02b';
const spaceRef = 'space.vex-family.vc02b';
const channelRef = 'channel.vex-family.vc02b';
const threadRef = 'thread.vex-family.vc02b';
const companionRef = 'lineage.vex.family.vc02b';
const longMessageRef = `message.vc02b.${'a'.repeat(150)}`;

function fixture() {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'vc02b-'));
  const home = fs.realpathSync.native(raw);
  let tick = Date.now() - 30_000;
  const at = () => new Date(tick += 1000).toISOString();

  createFamilySpace({
    home,
    spaceRef,
    ownerPrincipalRef: 'principal.victor',
    ownerPrincipalBindingRef: 'principal-binding.victor',
    familyCompanionLineageRef: companionRef,
    observedAt: at(),
    instanceRef
  });
  let current = readFamilySpace({ home, spaceRef }).record;
  addFamilyMember({
    home,
    spaceRef,
    actorPrincipalRef: 'principal.victor',
    principalRef: 'principal.alex',
    principalBindingRef: 'principal-binding.alex',
    expectedRevision: current.revision,
    expectedMembershipGeneration: current.membershipGeneration,
    observedAt: at(),
    instanceRef
  });
  current = readFamilySpace({ home, spaceRef }).record;
  const channel = createFamilyChannel({
    channelRef,
    threadRef,
    kind: 'GROUP',
    familySpaceRecord: current,
    labelStringRef: 'string.vex-family.vc02b',
    createdAt: at()
  });
  materializeConversationChannel({ home, channel, instanceRef, observedAt: channel.createdAt });

  const createdAt = at();
  const message = createFamilyMessage({
    messageRef: longMessageRef,
    channel,
    familySpaceRecord: current,
    speakerRef: 'principal.victor',
    speakerPrincipalBindingRef: 'principal-binding.victor',
    recipientRefs: ['principal.alex'],
    content: 'A Family-valid long message identity must not be constrained by direct Lived path grammar.',
    sequence: 0,
    createdAt
  });
  const trigger = appendConversationMessage({ home, message, instanceRef, observedAt: createdAt }).event;
  return { home, at, trigger, cleanup: () => fs.rmSync(raw, { recursive: true, force: true }) };
}

function leaseFor(fx, frontier) {
  const observedAt = new Date().toISOString();
  const reservedOutputTokens = 256;
  const hardTokenLimit = Math.max(8192, frontier.inputTokenEstimate + reservedOutputTokens + 1024);
  return createFamilyGroupContextLease({
    home: fx.home,
    frontier,
    observedAt,
    leaseInput: {
      leaseRef: 'lease.context.vc02b.001',
      workerRef: 'worker.vc02b.001',
      workNodeRef: 'work-node.vc02b.001',
      graphFingerprint: '1'.repeat(64),
      trustSnapshotFingerprint: '2'.repeat(64),
      runtimeSnapshotFingerprint: '3'.repeat(64),
      schedulerGeneration: 1,
      resourceLeaseFingerprint: '4'.repeat(64),
      capabilityLeaseFingerprint: '5'.repeat(64),
      effectLeaseFingerprint: '6'.repeat(64),
      cancellationTokenRef: 'cancellation.vc02b.001',
      foundationKernelRef: 'foundation.vc02b.001',
      roleFrameRef: 'role.vc02b.001',
      intentFrameRef: 'intent.vc02b.001',
      selectedAtlasRefs: [],
      selectedSourceRefs: [],
      applicableCultureRefs: [],
      applicableLessonRefs: [],
      applicableReleaseRefs: [],
      inputTokenEstimate: 0,
      reservedOutputTokens,
      hardTokenLimit,
      formedAt: observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 600_000).toISOString(),
      observedAt,
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE',
      checkpointReturnRef: 'checkpoint.vc02b.001'
    }
  }).lease;
}

async function captureServer() {
  const bodies = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    bodies.push(JSON.parse(body));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content: 'family reply' } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${server.address().port}/v1/`,
    bodies: () => structuredClone(bodies),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

const endpointProfile = (endpoint) => ({
  profileRef: 'profile.vc02b.loopback',
  admitted: true,
  endpoint,
  model: 'test-model'
});

test('VC02B-00 Family-owned prompt materialization accepts Family-valid refs beyond direct Lived path grammar', async () => {
  assert.ok(longMessageRef.length > 128, 'fixture must exceed the direct Lived portable-ref length');
  assert.ok(longMessageRef.length <= 222, 'fixture must remain inside the accepted Family frontier ref bound');
  const fx = fixture();
  const service = await captureServer();
  try {
    const family = readFamilySpace({ home: fx.home, spaceRef }).record;
    const frontier = formFamilyGroupFrontier({
      home: fx.home,
      spaceRef,
      channelRef,
      triggerMessageRef: fx.trigger.messageRef,
      expectedMembershipGeneration: family.membershipGeneration,
      maxMessages: 64,
      maxInputTokens: 4096,
      formedAt: fx.at()
    });
    assert.equal(frontier.triggerMessageRef, longMessageRef);
    assert.deepEqual(frontier.sourceRefs, [longMessageRef]);

    const contextLease = leaseFor(fx, frontier);
    const materialization = await materializeFamilyPromptContext({
      home: fx.home,
      frontier,
      contextLease
    });
    assert.equal(materialization.receipt.triggerMessageRef, longMessageRef);
    assert.equal(materialization.receipt.sourceCurrentnessVerified, true);
    assert.equal(materialization.receipt.providerBoundaryCurrentnessVerified, false);

    const response = await requestLivedCompanionInference({
      endpointProfile: endpointProfile(service.endpoint),
      requestContent: fx.trigger.content,
      familyPromptContextMaterialization: materialization
    });
    assert.equal(response.content, 'family reply');
    assert.equal(response.promptContextMaterializationReceipt.providerBoundaryCurrentnessVerified, true);
    assert.equal(response.promptContextMaterializationReceipt.providerBoundarySourceBindingsVerified, true);
    assert.equal(service.bodies().length, 1);
    const outbound = service.bodies()[0].messages;
    assert.equal(outbound[0].role, 'system');
    const humanEnvelope = JSON.parse(outbound[1].content);
    assert.equal(humanEnvelope.speakerRef, 'principal.victor');
    assert.equal(humanEnvelope.content, fx.trigger.content);
  } finally {
    await service.close();
    fx.cleanup();
  }
});

// [VXG RealForever][VEXLIFE-CORE][VC02B]
