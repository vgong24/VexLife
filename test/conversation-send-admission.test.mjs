import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  ADDRESSED_CONVERSATION_CURRENTNESS_SCHEMA,
  CONVERSATION_SEND_ADMISSION_SCHEMA,
  assertConversationSendAdmissionMatches,
  formConversationSendAdmission,
  verifyConversationSendAdmission
} from '../src/core/conversation-send-admission.mjs';
import { semanticHash } from '../src/core/utils.mjs';

function loadJson(relative) {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

function currentStaticSource() {
  const actions = loadJson('../blueprint/fragments/actions.json');
  const permissions = loadJson('../blueprint/fragments/permissions.json');
  const processes = loadJson('../blueprint/process-factory/processes-conversation-and-interface.json');
  const action = actions.find((item) => item.actionRef === 'action.message.send');
  const permission = permissions.find((item) => item.permissionRef === 'permission.conversation.send');
  const process = processes.find((item) => item.processRef === 'process.vexlife.conversation.send-addressed');
  assert.ok(action && permission && process, 'current addressed-send static source must exist');
  const sourceIdentity = { action, permission, process };
  return {
    currentness: 'CURRENT',
    sourceVersionRef: `source.vexlife.conversation-send.${semanticHash(sourceIdentity).slice(0, 32)}`,
    sourceRefs: [
      'blueprint/fragments/actions.json',
      'blueprint/fragments/permissions.json',
      'blueprint/process-factory/processes-conversation-and-interface.json'
    ],
    action,
    permission,
    process
  };
}

function baseInput() {
  const content = 'A bounded addressed message.';
  const contentHash = semanticHash(content);
  return {
    sendAttemptRef: 'send-attempt.conversation.stage-a.001',
    staticSource: structuredClone(currentStaticSource()),
    conversation: {
      projectRef: 'project.self-development',
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.local-vex.companion',
      channelState: 'ACTIVE',
      memberRefs: ['person.victor', 'role.vex.companion'],
      speakerRef: 'person.victor',
      recipientRefs: ['role.vex.companion'],
      content,
      originalLanguage: 'en',
      replyToMessageRefOrNull: null,
      contextRangeRefs: ['context-range.conversation.current']
    },
    confirmationWitness: {
      witnessRef: 'witness.composer-send.stage-a.001',
      confirmation: 'COMPOSER_SEND',
      currentness: 'CURRENT',
      sendAttemptRef: 'send-attempt.conversation.stage-a.001',
      channelRef: 'channel.local-vex.companion',
      contentHash,
      sourceRef: 'source.browser.composer-submit.stage-a.001'
    },
    addressedConversationCurrentness: {
      schemaVersion: ADDRESSED_CONVERSATION_CURRENTNESS_SCHEMA,
      projectionRef: 'projection.conversation.addressed-currentness.stage-a.001',
      currentness: 'CURRENT',
      threadRef: 'thread.self-development.open-conversation',
      channelRef: 'channel.local-vex.companion',
      channelState: 'ACTIVE',
      memberRefs: ['person.victor', 'role.vex.companion'],
      channelSha256: 'c'.repeat(64),
      channelRecordSha256: 'd'.repeat(64),
      headMessageRefOrNull: 'message.conversation.prior.001',
      headSequenceOrNull: 4,
      headSha256OrNull: 'e'.repeat(64),
      nextMessageSequence: 5,
      sourceRefs: [
        'src/core/conversation-store.mjs#readConversationChannelBinding',
        'src/core/conversation-store.mjs#readConversationChannel'
      ]
    },
    resourceAdmission: {
      admissionRef: 'admission.resource.stage-a.001',
      state: 'ADMITTED',
      currentness: 'CURRENT',
      semanticFingerprint: 'a'.repeat(64),
      sourceRefs: ['source.resource-admission.stage-a.001']
    },
    contextAdmission: {
      admissionRef: 'admission.context.stage-a.001',
      state: 'ADMITTED',
      currentness: 'CURRENT',
      semanticFingerprint: 'b'.repeat(64),
      sourceRefs: ['source.context-admission.stage-a.001']
    }
  };
}

function mustFail(mutator, pattern) {
  const input = baseInput();
  mutator(input);
  assert.throws(() => formConversationSendAdmission(input), pattern);
}

test('forms deterministic Conversation-first no-effect admission from current source truth', () => {
  const input = baseInput();
  const first = formConversationSendAdmission(input);
  const second = formConversationSendAdmission(baseInput());
  assert.deepEqual(first, second);
  assert.equal(verifyConversationSendAdmission(first), true);
  assert.equal(first.schemaVersion, CONVERSATION_SEND_ADMISSION_SCHEMA);
  assert.equal(first.state, 'ADMITTED');
  assert.equal(first.permission.permissionRef, 'permission.conversation.send');
  assert.equal(first.permission.state, 'ADMITTED');
  assert.equal(first.effect.effectClass, 'LOCAL_APPEND');
  assert.equal(first.effect.attemptScope, 'EXACT_BOUND_SEND_ATTEMPT');
  assert.equal(first.effect.performed, false);
  assert.equal(first.messageAppendPerformed, false);
  assert.equal(first.modelCallPerformed, false);
  assert.equal(first.activeTurnCurrentnessRequired, false);
  assert.equal(first.livedCompanionWriterCurrentnessRequired, false);
  assert.equal(first.rawContentIncluded, false);
  assert.equal(JSON.stringify(first).includes(input.conversation.content), false);
  assert.deepEqual(first.memberRefs, ['person.victor', 'role.vex.companion']);
  assert.deepEqual(first.recipientRefs, ['role.vex.companion']);
  assert.equal(first.contentHash, semanticHash(input.conversation.content));
  assert.equal(first.priorMessageRefOrNull, 'message.conversation.prior.001');
  assert.equal(first.priorMessageSequenceOrNull, 4);
  assert.equal(first.nextMessageSequence, 5);
});

test('same exact receipt verification is a semantic no-op, not a consume mutation', () => {
  const input = baseInput();
  const receipt = formConversationSendAdmission(input);
  assert.equal(assertConversationSendAdmissionMatches(receipt, input), receipt);
  assert.equal(assertConversationSendAdmissionMatches(receipt, baseInput()), receipt);
  assert.equal(verifyConversationSendAdmission(receipt), true);
});

test('attempt, conversation head, content, addressing, membership and source drift invalidate reuse', () => {
  const input = baseInput();
  const receipt = formConversationSendAdmission(input);
  for (const mutate of [
    (next) => { next.sendAttemptRef = 'send-attempt.conversation.stage-a.002'; next.confirmationWitness.sendAttemptRef = next.sendAttemptRef; },
    (next) => { next.addressedConversationCurrentness.headMessageRefOrNull = 'message.conversation.prior.002'; },
    (next) => { next.conversation.content = 'Changed content.'; next.confirmationWitness.contentHash = semanticHash(next.conversation.content); },
    (next) => { next.conversation.recipientRefs = ['person.victor']; },
    (next) => {
      next.conversation.memberRefs = ['person.victor', 'role.vex.companion', 'role.vex.guide'];
      next.addressedConversationCurrentness.memberRefs = [...next.conversation.memberRefs];
    },
    (next) => { next.staticSource.sourceVersionRef = 'source.vexlife.main.changed'; }
  ]) {
    const next = baseInput();
    mutate(next);
    assert.throws(() => assertConversationSendAdmissionMatches(receipt, next), /does not match the exact current send attempt|channel member/);
  }
});

test('fails closed on confirmation and channel-membership/currentness errors', () => {
  mustFail((x) => { x.confirmationWitness.confirmation = 'AUTO'; }, /COMPOSER_SEND/);
  mustFail((x) => { x.confirmationWitness.currentness = 'STALE'; }, /CURRENT/);
  mustFail((x) => { x.conversation.channelState = 'INACTIVE'; }, /ACTIVE/);
  mustFail((x) => { x.conversation.speakerRef = 'person.foreign'; }, /not a current channel member/);
  mustFail((x) => { x.conversation.recipientRefs = ['role.foreign']; }, /not a current channel member/);
});

test('fails closed on stale, mismatched or incoherent addressed Conversation currentness', () => {
  mustFail((x) => { x.addressedConversationCurrentness.currentness = 'STALE'; }, /CURRENT/);
  mustFail((x) => { x.addressedConversationCurrentness.channelRef = 'channel.foreign'; }, /channel\.local-vex\.companion/);
  mustFail((x) => { x.addressedConversationCurrentness.memberRefs = ['person.victor', 'role.vex.guide']; }, /does not match current source/);
  mustFail((x) => { x.addressedConversationCurrentness.headSha256OrNull = null; }, /entirely present or entirely absent/);
  mustFail((x) => { x.addressedConversationCurrentness.nextMessageSequence = 7; }, /advance the exact current head/);
  mustFail((x) => {
    x.addressedConversationCurrentness.headMessageRefOrNull = null;
    x.addressedConversationCurrentness.headSequenceOrNull = null;
    x.addressedConversationCurrentness.headSha256OrNull = null;
    x.addressedConversationCurrentness.nextMessageSequence = 1;
  }, /must be 0 without a head/);
});

test('pre-existing model-turn and Lived-writer currentness are rejected rather than gating human append', () => {
  mustFail((x) => {
    x.activeTurnCurrentness = {
      phase: 'ACTIVE',
      cancellationTargetRef: 'cancel-target.turn.stage-a.001'
    };
  }, /input\.activeTurnCurrentness is not admitted/);
  mustFail((x) => {
    x.writerCurrentness = {
      state: 'IDLE',
      ownerState: 'NONE'
    };
  }, /input\.writerCurrentness is not admitted/);
});

test('fails closed when resource or context admission is not current and admitted', () => {
  mustFail((x) => { x.resourceAdmission.state = 'HELD'; }, /ADMITTED/);
  mustFail((x) => { x.resourceAdmission.currentness = 'STALE'; }, /CURRENT/);
  mustFail((x) => { x.contextAdmission.state = 'HELD'; }, /ADMITTED/);
  mustFail((x) => { x.contextAdmission.currentness = 'UNKNOWN'; }, /CURRENT/);
});

test('fails closed on static action/permission/process drift', () => {
  mustFail((x) => { x.staticSource.action.permissionRef = 'permission.none'; }, /permission\.conversation\.send/);
  mustFail((x) => { x.staticSource.permission.confirmation = 'NONE'; }, /COMPOSER_SEND/);
  mustFail((x) => { x.staticSource.permission.recovery = 'ERASE'; }, /MESSAGE_CORRECTION_NOT_ERASURE/);
  mustFail((x) => { x.staticSource.process.effectOwnerRule = 'model writes directly'; }, /conversation service owns append/);
  mustFail((x) => { x.staticSource.process.authorityEnvelope.effects = ['PUBLIC_EXTERNAL']; }, /current source/);
});

test('caller-supplied authority booleans cannot widen admission', () => {
  mustFail((x) => { x.permissionGranted = true; }, /cannot supply authority|not admitted/);
  mustFail((x) => { x.addressedConversationCurrentness.authorized = true; }, /cannot supply authority/);
  mustFail((x) => { x.resourceAdmission.effectAuthorityGranted = true; }, /cannot supply authority/);
});

test('receipt tampering breaks content-addressed verification', () => {
  const receipt = structuredClone(formConversationSendAdmission(baseInput()));
  receipt.permission.state = 'GRANTED';
  assert.equal(verifyConversationSendAdmission(receipt), false);
  assert.throws(() => assertConversationSendAdmissionMatches(receipt, baseInput()), /receipt is invalid/);
});
