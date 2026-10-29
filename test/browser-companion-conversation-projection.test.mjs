import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createBrowserCompanionBridge } from '../src/core/browser-companion-bridge.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import {
  CONVERSATION_STORE_EVENT_SCHEMA,
  CONVERSATION_STORE_HEAD_SCHEMA,
  materializeConversationChannel
} from '../src/core/conversation-store.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUEST = Object.freeze({
  projectRef: 'project.self-development',
  threadRef: 'thread.self-development.open-conversation',
  channelRef: 'channel.self-development.companion'
});

function makeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-browser-conversation-projection-'));
  const home = path.join(root, 'home');
  initializeLivedCompanionHome({
    home,
    homeRef: 'vex-home.browser-conversation-projection-test',
    familyRef: 'vex-family.browser-conversation-projection-test',
    deviceRef: 'device.vexlife.browser-conversation-projection-test',
    companionLineageRef: 'companion-lineage.vexlife.browser-conversation-projection-test'
  });
  return { root, home };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function seedLongConversation(home, messageCount = 1001) {
  const homeManifest = JSON.parse(fs.readFileSync(path.join(home, 'config', 'home.json'), 'utf8'));
  const device = JSON.parse(
    fs.readFileSync(path.join(home, 'devices', `${homeManifest.currentDeviceRef}.json`), 'utf8')
  );
  materializeConversationChannel({
    home,
    instanceRef: device.deviceRef,
    observedAt: device.createdAt,
    channel: {
      channelRef: REQUEST.channelRef,
      threadRef: REQUEST.threadRef,
      kind: 'DIRECT',
      memberRefs: [device.personRef, 'role.vex.companion'],
      labelStringRef: 'channel.companion.name',
      state: 'ACTIVE',
      createdAt: device.createdAt
    }
  });

  const channelKey = semanticHash({
    schemaVersion: 'vexlife.conversation-storage/v1',
    channelRef: REQUEST.channelRef
  });
  const channelRoot = path.join(home, 'conversations', 'channels', channelKey);
  const messagesRoot = path.join(channelRoot, 'messages');
  const startedAt = Date.parse(device.createdAt);
  let priorMessageRef = null;
  let priorEventSha256 = null;
  let head = null;

  /*
   * This is a bounded read-path fixture, not a writer-effect test. Form the exact
   * content-addressed event lineage directly so the regression reaches the 1,000
   * message projection bound without performing 1,001 fsync-backed appends.
   */
  for (let sequence = 0; sequence < messageCount; sequence += 1) {
    const human = sequence % 2 === 0;
    const ordinal = String(sequence).padStart(4, '0');
    const messageRef = `message.projection-snapshot.${ordinal}`;
    const content = `Projection snapshot message ${sequence}.`;
    const createdAt = new Date(startedAt + sequence * 1000).toISOString();
    const eventCore = {
      schemaVersion: CONVERSATION_STORE_EVENT_SCHEMA,
      messageRef,
      spaceRef: null,
      threadRef: REQUEST.threadRef,
      channelRef: REQUEST.channelRef,
      speakerRef: human ? device.personRef : 'role.vex.companion',
      recipientRefs: human ? ['role.vex.companion'] : [device.personRef],
      witnessRefs: [`witness.projection-snapshot.${ordinal}`],
      membershipSnapshotRef: null,
      membershipGeneration: null,
      sequence,
      content,
      contentHash: semanticHash(content),
      createdAt,
      priorMessageRef,
      priorEventSha256
    };
    const event = Object.freeze({
      ...eventCore,
      eventSha256: semanticHash(eventCore)
    });
    const messageAddress = semanticHash({
      schemaVersion: 'vexlife.conversation-message-address/v1',
      messageRef
    });
    writeJson(path.join(messagesRoot, `${messageAddress}.json`), event);

    const headCore = {
      schemaVersion: CONVERSATION_STORE_HEAD_SCHEMA,
      channelRef: REQUEST.channelRef,
      messageRef,
      sequence,
      eventSha256: event.eventSha256,
      updatedAt: createdAt
    };
    head = Object.freeze({
      ...headCore,
      headSha256: semanticHash(headCore)
    });
    priorMessageRef = messageRef;
    priorEventSha256 = event.eventSha256;
  }

  writeJson(path.join(channelRoot, 'current.json'), head);
}

test('Conversation projection derives head and messages from one coherent exported snapshot', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/browser-companion-bridge.mjs'), 'utf8');
  const start = source.indexOf('  function conversationProjection(input) {');
  const end = source.indexOf('\n  async function performRecovery', start);
  assert.ok(start >= 0 && end > start, 'Conversation projection source boundary must remain discoverable');
  const projectionSource = source.slice(start, end);

  assert.match(projectionSource, /const exported = exportConversationChannel\(/u);
  assert.match(projectionSource, /const head = exported\.head \?\? null;/u);
  assert.doesNotMatch(
    projectionSource,
    /conversationCurrentness\(/u,
    'projection must not compare two independently observed canonical heads'
  );
  assert.doesNotMatch(
    projectionSource,
    /readConversationChannel\(/u,
    'projection must derive currentness from the same exported snapshot that supplies messages'
  );
});

test('bounded Conversation projection remains truncated while terminating at the exact canonical head', () => {
  const { root, home } = makeHome();
  try {
    seedLongConversation(home);
    const bridge = createBrowserCompanionBridge({
      home,
      instanceRef: 'instance.vexlife.browser-conversation-projection-snapshot'
    });

    const projection = bridge.conversationProjection(REQUEST);
    assert.equal(projection.state, 'CURRENT');
    assert.equal(projection.truthClass, 'CURRENT_LOCAL_CONVERSATION_PROJECTION');
    assert.equal(projection.effectsPerformed, false);
    assert.equal(projection.truncated, true);
    assert.equal(projection.messages.length, 1000);
    assert.equal(projection.messages[0].sequence, 1);
    assert.equal(projection.messages.at(-1).sequence, 1000);
    assert.equal(projection.headSequenceOrNull, 1000);
    assert.equal(projection.headMessageRefOrNull, 'message.projection-snapshot.1000');
    assert.equal(projection.messages.at(-1).messageRef, projection.headMessageRefOrNull);
    assert.deepEqual(
      projection.messages.map((message) => message.sequence),
      Array.from({ length: 1000 }, (_, index) => index + 1)
    );

    const currentness = bridge.conversationCurrentness(REQUEST);
    assert.equal(currentness.state, 'CURRENT');
    assert.equal(currentness.headMessageRefOrNull, projection.headMessageRefOrNull);
    assert.equal(currentness.headSequenceOrNull, projection.headSequenceOrNull);
    assert.equal(
      currentness.canonicalConversationHeadSha256,
      projection.canonicalConversationHeadSha256
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
