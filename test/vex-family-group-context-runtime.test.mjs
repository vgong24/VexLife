import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { semanticHash } from '../src/core/utils.mjs';
import {
  createFamilySpace,
  addFamilyMember,
  readFamilySpace
} from '../src/core/family-space-store.mjs';
import {
  createFamilyChannel,
  createFamilyMessage,
  familySpaceRecordSnapshotRef
} from '../src/core/family-conversation.mjs';
import {
  appendConversationMessage,
  materializeConversationChannel
} from '../src/core/conversation-store.mjs';
import {
  FAMILY_GROUP_FRONTIER_ADVANCED,
  FAMILY_GROUP_FRONTIER_CURRENTNESS,
  FamilyGroupContextError,
  createFamilyGroupContextLease,
  formFamilyGroupFrontier,
  verifyFamilyGroupFrontierCurrent
} from '../src/core/family-group-context-runtime.mjs';

const t = (second) => `2026-09-14T09:00:${String(second).padStart(2, '0')}.000Z`;
const instanceRef = 'instance.test.vf03a';
const spaceRef = 'space.vex-family.vf03a';
const channelRef = 'channel.vex-family.vf03a';
const threadRef = 'thread.vex-family.vf03a';
const companionRef = 'lineage.vex.family.vf03a';

function fixture(humans = ['victor', 'alex', 'bri']) {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'vf03a-'));
  const home = fs.realpathSync.native(raw);
  let second = 0;
  const at = () => t(second++);
  const first = humans[0];
  createFamilySpace({
    home,
    spaceRef,
    ownerPrincipalRef: `principal.${first}`,
    ownerPrincipalBindingRef: `principal-binding.${first}`,
    familyCompanionLineageRef: companionRef,
    observedAt: at(),
    instanceRef
  });
  for (const name of humans.slice(1)) {
    const current = readFamilySpace({ home, spaceRef }).record;
    addFamilyMember({
      home,
      spaceRef,
      actorPrincipalRef: `principal.${first}`,
      principalRef: `principal.${name}`,
      principalBindingRef: `principal-binding.${name}`,
      expectedRevision: current.revision,
      expectedMembershipGeneration: current.membershipGeneration,
      observedAt: at(),
      instanceRef
    });
  }
  const family = readFamilySpace({ home, spaceRef }).record;
  const channel = createFamilyChannel({
    channelRef,
    threadRef,
    kind: 'GROUP',
    familySpaceRecord: family,
    labelStringRef: 'string.vex-family.vf03a',
    createdAt: at()
  });
  materializeConversationChannel({ home, channel, instanceRef, observedAt: channel.createdAt });

  let messageSequence = 0;
  const appendHuman = (name, messageRef, content, createdAt = at()) => {
    const current = readFamilySpace({ home, spaceRef }).record;
    const message = createFamilyMessage({
      messageRef,
      channel,
      familySpaceRecord: current,
      speakerRef: `principal.${name}`,
      speakerPrincipalBindingRef: `principal-binding.${name}`,
      recipientRefs: humans.filter((other) => other !== name).map((other) => `principal.${other}`),
      content,
      sequence: messageSequence++,
      createdAt
    });
    appendConversationMessage({ home, message, instanceRef, observedAt: createdAt });
    return message;
  };

  const appendCompanion = (messageRef, content, createdAt = at()) => {
    const familyRecord = readFamilySpace({ home, spaceRef }).record;
    const sequence = messageSequence++;
    const recipientRefs = humans.map((name) => `principal.${name}`);
    const witnessRefs = [...recipientRefs, companionRef];
    const message = {
      messageRef,
      spaceRef,
      threadRef,
      channelRef,
      speakerRef: companionRef,
      recipientRefs,
      witnessRefs,
      membershipSnapshotRef: familySpaceRecordSnapshotRef(familyRecord.recordSha256),
      membershipGeneration: familyRecord.membershipGeneration,
      sequence,
      content,
      contentHash: semanticHash(content),
      createdAt
    };
    appendConversationMessage({ home, message, instanceRef, observedAt: createdAt });
    return message;
  };

  return {
    home,
    humans,
    channel,
    at,
    appendHuman,
    appendCompanion,
    currentFamily: () => readFamilySpace({ home, spaceRef }).record,
    cleanup: () => fs.rmSync(raw, { recursive: true, force: true })
  };
}

function frontierFor(fx, triggerMessageRef, overrides = {}) {
  const family = fx.currentFamily();
  return formFamilyGroupFrontier({
    home: fx.home,
    spaceRef,
    channelRef,
    triggerMessageRef,
    expectedMembershipGeneration: family.membershipGeneration,
    maxMessages: 64,
    maxInputTokens: 4096,
    formedAt: overrides.formedAt ?? fx.at(),
    ...overrides
  });
}

function leaseInput(observedAt) {
  return {
    leaseRef: 'lease.context.vf03a.001',
    workerRef: 'worker.vf03a.001',
    workNodeRef: 'work-node.vf03a.001',
    graphFingerprint: 'graph-fingerprint-vf03a',
    trustSnapshotFingerprint: 'trust-fingerprint-vf03a',
    runtimeSnapshotFingerprint: 'runtime-fingerprint-vf03a',
    schedulerGeneration: 1,
    resourceLeaseFingerprint: 'resource-lease-fingerprint-vf03a',
    capabilityLeaseFingerprint: 'capability-lease-fingerprint-vf03a',
    effectLeaseFingerprint: 'effect-lease-fingerprint-vf03a',
    cancellationTokenRef: 'cancellation.vf03a.001',
    foundationKernelRef: 'foundation.vf03a.001',
    roleFrameRef: 'role.vf03a.001',
    intentFrameRef: 'intent.vf03a.001',
    selectedAtlasRefs: [],
    selectedSourceRefs: [],
    applicableCultureRefs: [],
    applicableLessonRefs: [],
    applicableReleaseRefs: [],
    inputTokenEstimate: 0,
    reservedOutputTokens: 256,
    hardTokenLimit: 8192,
    formedAt: observedAt,
    expiresAt: '2026-09-14T10:00:00.000Z',
    observedAt,
    currentness: 'CURRENT',
    lifecycle: 'ACTIVE',
    checkpointReturnRef: 'checkpoint.vf03a.001'
  };
}

test('FGC-00 three humans and Family Vex preserve exact distinct canonical speakers', () => {
  const fx = fixture();
  try {
    fx.appendHuman('victor', 'message.vf03a.000', 'Victor opens the Family thread.');
    fx.appendHuman('alex', 'message.vf03a.001', 'Alex responds independently.');
    fx.appendHuman('bri', 'message.vf03a.002', 'Bri is independently attributed.');
    fx.appendCompanion('message.vf03a.003', 'Family Vex speaks under its exact lineage.');
    const frontier = frontierFor(fx, 'message.vf03a.000');
    assert.deepEqual(
      frontier.selectedMessageBindings.map((message) => message.speakerRef),
      ['principal.victor', 'principal.alex', 'principal.bri', companionRef]
    );
    assert.equal(frontier.requestPrincipalRef, 'principal.victor');
    assert.equal(frontier.familyCompanionLineageRef, companionRef);
  } finally { fx.cleanup(); }
});

test('FGC-01 five-human selection is deterministic and source-bound', () => {
  const fx = fixture(['victor', 'alex', 'bri', 'mei', 'sam']);
  try {
    for (const [index, name] of fx.humans.entries()) {
      fx.appendHuman(name, `message.vf03a.five.${index}`, `${name} message ${index}`);
    }
    const formedAt = fx.at();
    const first = frontierFor(fx, 'message.vf03a.five.0', { formedAt });
    const second = frontierFor(fx, 'message.vf03a.five.0', { formedAt });
    assert.equal(first.frontierSha256, second.frontierSha256);
    assert.equal(first.selectedMessageBindings.length, 5);
    assert.deepEqual(first.sourceRefs, first.selectedMessageBindings.map((message) => message.messageRef).sort());
  } finally { fx.cleanup(); }
});

test('FGC-02 non-group/private source is rejected before frontier formation', () => {
  const fx = fixture();
  try {
    const family = fx.currentFamily();
    const privateChannel = createFamilyChannel({
      channelRef: 'channel.vex-family.vf03a.private',
      threadRef: 'thread.vex-family.vf03a.private',
      kind: 'PRIVATE',
      familySpaceRecord: family,
      memberPrincipalRefs: ['principal.victor', 'principal.alex'],
      includeFamilyCompanion: false,
      labelStringRef: 'string.vex-family.vf03a.private',
      createdAt: fx.at()
    });
    materializeConversationChannel({
      home: fx.home,
      channel: privateChannel,
      instanceRef,
      observedAt: privateChannel.createdAt
    });
    const message = createFamilyMessage({
      messageRef: 'message.vf03a.private.000',
      channel: privateChannel,
      familySpaceRecord: family,
      speakerRef: 'principal.victor',
      speakerPrincipalBindingRef: 'principal-binding.victor',
      recipientRefs: ['principal.alex'],
      content: 'Private Family content.',
      sequence: 0,
      createdAt: fx.at()
    });
    appendConversationMessage({ home: fx.home, message, instanceRef, observedAt: message.createdAt });
    assert.throws(
      () => formFamilyGroupFrontier({
        home: fx.home,
        spaceRef,
        channelRef: privateChannel.channelRef,
        triggerMessageRef: message.messageRef,
        expectedMembershipGeneration: family.membershipGeneration,
        formedAt: fx.at()
      }),
      (error) => error instanceof FamilyGroupContextError && error.code === 'FAMILY_GROUP_CONTEXT_CHANNEL_DENIED'
    );
  } finally { fx.cleanup(); }
});

test('FGC-03 FROM_JOIN visibility floor excludes pre-join source from participant frontier', () => {
  const fx = fixture();
  try {
    const alex = fx.currentFamily().members.find((member) => member.principalRef === 'principal.alex');
    const beforeJoin = new Date(Date.parse(alex.joinedAt) - 1).toISOString();
    fx.appendHuman('victor', 'message.vf03a.before-join', 'Earlier Family history.', beforeJoin);
    fx.appendHuman('alex', 'message.vf03a.after-join', 'Alex asks after joining.');
    const frontier = frontierFor(fx, 'message.vf03a.after-join');
    assert.deepEqual(frontier.selectedMessageBindings.map((message) => message.messageRef), ['message.vf03a.after-join']);
  } finally { fx.cleanup(); }
});

test('FGC-04 stale expected membership generation fails closed', () => {
  const fx = fixture();
  try {
    const trigger = fx.appendHuman('victor', 'message.vf03a.stale.000', 'Generation-bound request.');
    const family = fx.currentFamily();
    assert.throws(
      () => formFamilyGroupFrontier({
        home: fx.home,
        spaceRef,
        channelRef,
        triggerMessageRef: trigger.messageRef,
        expectedMembershipGeneration: family.membershipGeneration - 1,
        formedAt: fx.at()
      }),
      (error) => error instanceof FamilyGroupContextError && error.code === 'FAMILY_GROUP_CONTEXT_STALE'
    );
  } finally { fx.cleanup(); }
});

test('FGC-05 original trigger remains exact when newer authorized Family messages are included', () => {
  const fx = fixture();
  try {
    const trigger = fx.appendHuman('victor', 'message.vf03a.trigger.000', 'Original request.');
    fx.appendHuman('alex', 'message.vf03a.trigger.001', 'New context after the request.');
    fx.appendHuman('bri', 'message.vf03a.trigger.002', 'More authorized current context.');
    const frontier = frontierFor(fx, trigger.messageRef);
    assert.equal(frontier.triggerMessageRef, trigger.messageRef);
    assert.equal(frontier.triggerMessageHash, frontier.selectedMessageBindings[0].eventSha256);
    assert.equal(frontier.selectedMessageBindings.filter((message) => message.messageRef === trigger.messageRef).length, 1);
    assert.equal(frontier.lastIncludedMessageRef, 'message.vf03a.trigger.002');
  } finally { fx.cleanup(); }
});

test('FGC-06 Family Vex prior speech is recognized by exact current lineage identity', () => {
  const fx = fixture();
  try {
    fx.appendHuman('victor', 'message.vf03a.lineage.000', 'Question.');
    fx.appendCompanion('message.vf03a.lineage.001', 'Prior Family Vex response.');
    const frontier = frontierFor(fx, 'message.vf03a.lineage.000');
    const companion = frontier.selectedMessageBindings.find((message) => message.messageRef === 'message.vf03a.lineage.001');
    assert.equal(companion.speakerRef, companionRef);
    assert.equal(frontier.familyCompanionLineageRef, companionRef);
  } finally { fx.cleanup(); }
});

test('FGC-07 Context Lease selectedSourceRefs exactly cover chosen Family message refs', () => {
  const fx = fixture();
  try {
    fx.appendHuman('victor', 'message.vf03a.lease.000', 'Lease source zero.');
    fx.appendHuman('alex', 'message.vf03a.lease.001', 'Lease source one.');
    const formedAt = fx.at();
    const frontier = frontierFor(fx, 'message.vf03a.lease.000', { formedAt });
    const result = createFamilyGroupContextLease({
      home: fx.home,
      frontier,
      leaseInput: leaseInput(formedAt),
      observedAt: formedAt
    });
    assert.deepEqual(
      result.lease.selectedSourceRefs,
      frontier.selectedMessageBindings.map((message) => message.messageRef).sort()
    );
    assert.equal(result.lease.familyGroupFrontierRef, frontier.frontierRef);
    assert.equal(result.lease.familyGroupFrontierSha256, frontier.frontierSha256);
    assert.equal(Object.hasOwn(result.lease, 'messageHistory'), false);
  } finally { fx.cleanup(); }
});

test('FGC-08 message and token bounds fail closed without whole-history fallback', () => {
  const fx = fixture();
  try {
    fx.appendHuman('victor', 'message.vf03a.bounds.000', 'A bounded source message.');
    fx.appendHuman('alex', 'message.vf03a.bounds.001', 'Another bounded source message.');
    assert.throws(
      () => frontierFor(fx, 'message.vf03a.bounds.000', { maxMessages: 1 }),
      (error) => error instanceof FamilyGroupContextError && error.code === 'FAMILY_GROUP_CONTEXT_BOUNDS_EXCEEDED'
    );
    assert.throws(
      () => frontierFor(fx, 'message.vf03a.bounds.000', { maxInputTokens: 1 }),
      (error) => error instanceof FamilyGroupContextError && error.code === 'FAMILY_GROUP_CONTEXT_BOUNDS_EXCEEDED'
    );
  } finally { fx.cleanup(); }
});

test('FGC-09 currentness re-witness reproduces current selection and reports later frontier advance', () => {
  const fx = fixture();
  try {
    fx.appendHuman('victor', 'message.vf03a.verify.000', 'Trigger.');
    const formedAt = fx.at();
    const frontier = frontierFor(fx, 'message.vf03a.verify.000', { formedAt });
    const first = verifyFamilyGroupFrontierCurrent({ home: fx.home, frontier, observedAt: formedAt });
    assert.equal(first.state, FAMILY_GROUP_FRONTIER_CURRENTNESS);

    const later = fx.appendHuman('alex', 'message.vf03a.verify.001', 'Arrived after frontier formation.', fx.at());
    const verifiedAt = fx.at();
    const advanced = verifyFamilyGroupFrontierCurrent({ home: fx.home, frontier, observedAt: verifiedAt });
    assert.equal(advanced.state, FAMILY_GROUP_FRONTIER_ADVANCED);
    assert.equal(advanced.advancedMessageRef, later.messageRef);
    assert.throws(
      () => createFamilyGroupContextLease({
        home: fx.home,
        frontier,
        leaseInput: leaseInput(verifiedAt),
        observedAt: verifiedAt
      }),
      (error) => error instanceof FamilyGroupContextError && error.code === 'FAMILY_GROUP_CONTEXT_ADVANCED'
    );
  } finally { fx.cleanup(); }
});

test('FGC-10 frontier is reference/hash bounded and carries no message content, Memory or model effect', () => {
  const fx = fixture();
  try {
    fx.appendHuman('victor', 'message.vf03a.no-effect.000', 'Content stays in the Conversation owner.');
    const frontier = frontierFor(fx, 'message.vf03a.no-effect.000');
    const encoded = JSON.stringify(frontier);
    assert.equal(encoded.includes('Content stays in the Conversation owner.'), false);
    assert.equal(Object.hasOwn(frontier, 'messages'), false);
    assert.equal(Object.hasOwn(frontier, 'memory'), false);
    assert.equal(Object.hasOwn(frontier, 'providerMessages'), false);
    assert.equal(Object.hasOwn(frontier, 'effects'), false);
    assert.equal(frontier.currentness, FAMILY_GROUP_FRONTIER_CURRENTNESS);
  } finally { fx.cleanup(); }
});

// [VXG RealForever]
