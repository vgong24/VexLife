import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/utils.mjs';
import {
  FamilyConversationError,
  createFamilyChannel,
  createFamilyMessage
} from '../src/core/family-conversation.mjs';
import {
  ConversationStoreError,
  appendConversationMessage,
  exportConversationChannel,
  listConversationChannelBindings,
  materializeConversationChannel,
  readConversationChannel,
  readConversationChannelBinding,
  readConversationMessage,
  recoverAbandonedConversationWriter
} from '../src/core/conversation-store.mjs';

function fixture() {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-conversation-'));
  const home = fs.realpathSync.native(raw);
  return { home, cleanup: () => fs.rmSync(raw, { recursive: true, force: true }) };
}

const t0 = '2026-09-09T08:10:00.000Z';
const t1 = '2026-09-09T08:10:01.000Z';
const t2 = '2026-09-09T08:10:02.000Z';
const t3 = '2026-09-09T08:10:03.000Z';
const instanceRef = 'instance.test.vf02b';
const channelRef = 'channel.vex-family.alpha';
const threadRef = 'thread.vex-family.alpha';
const spaceRef = 'space.vex-family.alpha';
const membershipSnapshotRef = 'membership-snapshot.vex-family.alpha.001';

function message({ messageRef, speakerRef, recipientRefs, witnessRefs, sequence, content, membershipGeneration = 1, channel = channelRef, thread = threadRef, space = spaceRef, createdAt }) {
  return {
    messageRef,
    spaceRef: space,
    threadRef: thread,
    channelRef: channel,
    speakerRef,
    recipientRefs,
    witnessRefs,
    membershipSnapshotRef,
    membershipGeneration,
    sequence,
    content,
    contentHash: semanticHash(content),
    createdAt
  };
}

const m0 = () => message({
  messageRef: 'message.family.alpha.000',
  speakerRef: 'person.victor',
  recipientRefs: ['person.mei', 'person.alex'],
  witnessRefs: ['person.victor', 'person.mei', 'person.alex', 'lineage.vex.family.alpha'],
  sequence: 0,
  content: 'Family message from Victor.',
  createdAt: t0
});
const m1 = () => message({
  messageRef: 'message.family.alpha.001',
  speakerRef: 'person.mei',
  recipientRefs: ['person.victor', 'person.alex'],
  witnessRefs: ['person.victor', 'person.mei', 'person.alex', 'lineage.vex.family.alpha'],
  sequence: 1,
  content: 'Mei can reply while any AI work is unrelated.',
  createdAt: t1
});
const m2 = () => message({
  messageRef: 'message.family.alpha.002',
  speakerRef: 'person.alex',
  recipientRefs: ['person.victor', 'person.mei'],
  witnessRefs: ['person.victor', 'person.mei', 'person.alex', 'lineage.vex.family.alpha'],
  sequence: 2,
  content: 'Alex is independently attributed.',
  membershipGeneration: 2,
  createdAt: t2
});

function channelRoot(home, channel = channelRef) {
  const key = semanticHash({ schemaVersion: 'vexlife.conversation-storage/v1', channelRef: channel });
  return path.join(home, 'conversations', 'channels', key);
}
function channelPath(home, channel = channelRef) {
  return path.join(channelRoot(home, channel), 'channel.json');
}
function messagePath(home, messageRef, channel = channelRef) {
  const identity = semanticHash({ schemaVersion: 'vexlife.conversation-message-address/v1', messageRef });
  return path.join(channelRoot(home, channel), 'messages', `${identity}.json`);
}
function residue(home) {
  const found = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'writer.lock' || entry.name.includes('.tmp-')) found.push(full);
    }
  };
  walk(home);
  return found;
}

function familyRecord({
  revision = 1,
  membershipGeneration = 1,
  updatedAt = t1,
  priorRecordSha256 = null
} = {}) {
  const member = (name, role) => ({
    membershipRef: `membership.${name}`,
    principalRef: `principal.${name}`,
    principalBindingRef: `principal-binding.${name}`,
    role,
    status: 'ACTIVE',
    joinedAt: t0,
    leftOrRevokedAtOrNull: null,
    historyVisibilityPolicyRef: 'policy.vex-family.history.from-join'
  });
  const core = {
    schemaVersion: 'vexlife.family-space/v1',
    spaceRef,
    revision,
    membershipGeneration,
    familyCompanionBindingGeneration: 1,
    familyCompanionState: 'ACTIVE',
    familyCompanionLineageRef: 'lineage.vex.family.alpha',
    createdAt: t0,
    updatedAt,
    priorRecordSha256,
    members: [
      member('victor', 'OWNER'),
      member('mei', 'MEMBER'),
      member('alex', 'MEMBER')
    ]
  };
  return Object.freeze({ ...core, recordSha256: semanticHash(core) });
}

function groupFamilyChannel(record = familyRecord()) {
  return createFamilyChannel({
    channelRef,
    threadRef,
    kind: 'GROUP',
    familySpaceRecord: record,
    labelStringRef: 'string.vex-family.alpha',
    createdAt: t1
  });
}

function privateFamilyChannel(record = familyRecord(), {
  channel = 'channel.vex-family.alpha.private',
  members = ['principal.victor', 'principal.mei']
} = {}) {
  return createFamilyChannel({
    channelRef: channel,
    threadRef: 'thread.vex-family.alpha.private',
    kind: 'PRIVATE',
    familySpaceRecord: record,
    memberPrincipalRefs: members,
    includeFamilyCompanion: false,
    labelStringRef: 'string.vex-family.alpha.private',
    createdAt: t1
  });
}

test('VFS-01/03 A/B/C human events append independently and restart preserves exact order', () => {
  const fx = fixture();
  try {
    for (const event of [m0(), m1(), m2()]) {
      const result = appendConversationMessage({ home: fx.home, message: event, instanceRef });
      assert.equal(result.state, 'APPENDED');
    }
    const projection = readConversationChannel({ home: fx.home, channelRef });
    assert.equal(projection.state, 'CURRENT');
    assert.deepEqual(projection.messages.map((event) => event.messageRef), ['message.family.alpha.000','message.family.alpha.001','message.family.alpha.002']);
    assert.deepEqual(projection.messages.map((event) => event.speakerRef), ['person.victor','person.mei','person.alex']);
    assert.equal(projection.head.sequence, 2);
    const restarted = readConversationChannel({ home: fx.home, channelRef });
    assert.deepEqual(restarted.messages.map((event) => event.eventSha256), projection.messages.map((event) => event.eventSha256));
  } finally { fx.cleanup(); }
});

test('VFS-02 exact retry is idempotent and conflicting messageRef fails closed', () => {
  const fx = fixture();
  try {
    const first = appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    const duplicate = appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    assert.equal(duplicate.state, 'IDEMPOTENT_CURRENT');
    assert.equal(duplicate.event.eventSha256, first.event.eventSha256);
    const conflict = { ...m0(), content: 'Different bytes.' };
    conflict.contentHash = semanticHash(conflict.content);
    assert.throws(() => appendConversationMessage({ home: fx.home, message: conflict, instanceRef }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_MESSAGE_CONFLICT');
    assert.equal(readConversationChannel({ home: fx.home, channelRef }).messages.length, 1);
  } finally { fx.cleanup(); }
});

test('VFS-02 historical retry remains idempotent only through the verified current lineage', () => {
  const fx = fixture();
  try {
    appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    appendConversationMessage({ home: fx.home, message: m1(), instanceRef });
    appendConversationMessage({ home: fx.home, message: m2(), instanceRef });
    const duplicate = appendConversationMessage({ home: fx.home, message: m0(), instanceRef, observedAt: t2 });
    assert.equal(duplicate.state, 'IDEMPOTENT_CURRENT');
    assert.equal(duplicate.head.messageRef, 'message.family.alpha.002');
    assert.equal(readConversationChannel({ home: fx.home, channelRef }).messages.length, 3);
  } finally { fx.cleanup(); }
});

test('VFS-02 wrong sequence/stale append fails without advancing head', () => {
  const fx = fixture();
  try {
    appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    const stale = { ...m2(), sequence: 2 };
    assert.throws(() => appendConversationMessage({ home: fx.home, message: stale, instanceRef }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_STALE');
    assert.equal(readConversationChannel({ home: fx.home, channelRef }).head.sequence, 0);
  } finally { fx.cleanup(); }
});

test('VFS-05 fail-before-root-head exact retry commits the verified orphan event without residue', () => {
  const fx = fixture();
  try {
    assert.throws(() => appendConversationMessage({ home: fx.home, message: m0(), instanceRef, faults: { failBeforeHeadRename: true } }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_HEAD_NOT_COMMITTED');
    assert.equal(readConversationChannel({ home: fx.home, channelRef }).state, 'EMPTY');
    assert.throws(() => readConversationMessage({ home: fx.home, channelRef, messageRef: 'message.family.alpha.000' }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CORRUPT');
    assert.deepEqual(residue(fx.home), []);

    const recovered = appendConversationMessage({ home: fx.home, message: m0(), instanceRef, observedAt: t1 });
    assert.equal(recovered.state, 'APPENDED');
    assert.equal(recovered.head.messageRef, 'message.family.alpha.000');
    assert.deepEqual(readConversationChannel({ home: fx.home, channelRef }).messages.map((event) => event.messageRef), ['message.family.alpha.000']);
    assert.deepEqual(residue(fx.home), []);
  } finally { fx.cleanup(); }
});

test('VFS-05 fail-before-successor-head exact retry advances only matching current lineage', () => {
  const fx = fixture();
  try {
    appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    assert.throws(() => appendConversationMessage({ home: fx.home, message: m1(), instanceRef, faults: { failBeforeHeadRename: true } }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_HEAD_NOT_COMMITTED');
    assert.deepEqual(readConversationChannel({ home: fx.home, channelRef }).messages.map((event) => event.messageRef), ['message.family.alpha.000']);
    assert.throws(() => readConversationMessage({ home: fx.home, channelRef, messageRef: 'message.family.alpha.001' }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CORRUPT');

    const recovered = appendConversationMessage({ home: fx.home, message: m1(), instanceRef, observedAt: t2 });
    assert.equal(recovered.state, 'APPENDED');
    assert.equal(recovered.head.sequence, 1);
    assert.deepEqual(readConversationChannel({ home: fx.home, channelRef }).messages.map((event) => event.messageRef), ['message.family.alpha.000','message.family.alpha.001']);
    assert.deepEqual(residue(fx.home), []);
  } finally { fx.cleanup(); }
});

test('VFS-05 fail-after-head is current despite missing receipt and leaves no residue', () => {
  const fx = fixture();
  try {
    assert.throws(() => appendConversationMessage({ home: fx.home, message: m0(), instanceRef, faults: { failAfterHeadRenameBeforeReceipt: true } }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_RECEIPT_NOT_EMITTED');
    const projection = readConversationChannel({ home: fx.home, channelRef });
    assert.equal(projection.head.messageRef, 'message.family.alpha.000');
    assert.equal(projection.messages.length, 1);
    assert.deepEqual(residue(fx.home), []);
  } finally { fx.cleanup(); }
});

test('VFS-06 corrupt head, addressed event, and missing prior lineage all fail closed', () => {
  const fx = fixture();
  try {
    appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    appendConversationMessage({ home: fx.home, message: m1(), instanceRef });
    const root = channelRoot(fx.home);
    const headPath = path.join(root, 'current.json');
    const goodHead = fs.readFileSync(headPath, 'utf8');
    const head = JSON.parse(goodHead);
    fs.writeFileSync(headPath, `${JSON.stringify({ ...head, sequence: 99 }, null, 2)}\n`);
    assert.throws(() => readConversationChannel({ home: fx.home, channelRef }), (error) => error.code === 'CONVERSATION_CORRUPT');
    assert.throws(() => readConversationMessage({ home: fx.home, channelRef, messageRef: 'message.family.alpha.001' }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CORRUPT');
    fs.writeFileSync(headPath, goodHead);

    const latestPath = messagePath(fx.home, 'message.family.alpha.001');
    const goodLatest = fs.readFileSync(latestPath, 'utf8');
    const latest = JSON.parse(goodLatest);
    fs.writeFileSync(latestPath, `${JSON.stringify({ ...latest, content: 'tampered' }, null, 2)}\n`);
    assert.throws(() => readConversationChannel({ home: fx.home, channelRef }), (error) => error.code === 'CONVERSATION_CORRUPT');
    fs.writeFileSync(latestPath, goodLatest);

    fs.rmSync(messagePath(fx.home, 'message.family.alpha.000'));
    assert.throws(() => readConversationChannel({ home: fx.home, channelRef }), (error) => error.code === 'CONVERSATION_CORRUPT');
  } finally { fx.cleanup(); }
});

test('VFS-04 writer conflict requires exact abandoned-writer recovery', () => {
  const fx = fixture();
  try {
    appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    const lock = path.join(channelRoot(fx.home), 'writer.lock');
    fs.writeFileSync(lock, `${JSON.stringify({ schemaVersion:'vexlife.conversation-writer/v1', instanceRef:'instance.test.abandoned', pid:99999999, lockToken:'abandoned-lock-token-12345', formedAt:t1, leaseSha256:'0'.repeat(64) }, null, 2)}\n`, { mode: 0o600 });
    assert.throws(() => appendConversationMessage({ home: fx.home, message: m1(), instanceRef }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_WRITER_RECOVERY_REQUIRED');
    assert.throws(() => recoverAbandonedConversationWriter({ home: fx.home, channelRef, expectedInstanceRef: 'instance.wrong' }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_WRITER_CONFLICT');
    const recovered = recoverAbandonedConversationWriter({ home: fx.home, channelRef, expectedInstanceRef: 'instance.test.abandoned' });
    assert.equal(recovered.state, 'WRITER_RECOVERED');
    assert.equal(fs.existsSync(lock), false);
  } finally { fx.cleanup(); }
});

test('VFS-07/08 historical witness and membership generations remain immutable', () => {
  const fx = fixture();
  try {
    appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    appendConversationMessage({ home: fx.home, message: m1(), instanceRef });
    appendConversationMessage({ home: fx.home, message: m2(), instanceRef });
    const original = readConversationMessage({ home: fx.home, channelRef, messageRef: 'message.family.alpha.000' }).event;
    assert.equal(original.membershipGeneration, 1);
    assert.deepEqual(original.witnessRefs, ['person.victor','person.mei','person.alex','lineage.vex.family.alpha']);
    assert.equal(readConversationChannel({ home: fx.home, channelRef }).messages.at(-1).membershipGeneration, 2);
  } finally { fx.cleanup(); }
});

test('VFS-09 group and private channel stores remain identity-isolated', () => {
  const fx = fixture();
  try {
    appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    const privateChannel = 'channel.vex-family.alpha.private.victor';
    const privateMessage = message({
      messageRef: 'message.private.000', channel: privateChannel, thread: 'thread.vex-family.alpha.private',
      speakerRef:'person.victor', recipientRefs:['lineage.vex.family.alpha'], witnessRefs:['person.victor','lineage.vex.family.alpha'],
      sequence:0, content:'Private to Family Vex.', createdAt:t0
    });
    appendConversationMessage({ home: fx.home, message: privateMessage, instanceRef });
    assert.deepEqual(readConversationChannel({ home: fx.home, channelRef }).messages.map((event) => event.messageRef), ['message.family.alpha.000']);
    assert.deepEqual(readConversationChannel({ home: fx.home, channelRef: privateChannel }).messages.map((event) => event.messageRef), ['message.private.000']);
  } finally { fx.cleanup(); }
});

test('VFS-10/12 bounded reads expose truncation and export contains no filesystem metadata fields', () => {
  const fx = fixture();
  try {
    appendConversationMessage({ home: fx.home, message: m0(), instanceRef });
    appendConversationMessage({ home: fx.home, message: m1(), instanceRef });
    appendConversationMessage({ home: fx.home, message: m2(), instanceRef });
    const limited = readConversationChannel({ home: fx.home, channelRef, limit:2 });
    assert.equal(limited.truncated, true);
    assert.deepEqual(limited.messages.map((event) => event.messageRef), ['message.family.alpha.001','message.family.alpha.002']);
    const exported = exportConversationChannel({ home: fx.home, channelRef, limit:2 });
    assert.equal(exported.contentSafe, true);
    const keys = new Set();
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) { keys.add(key); walk(child); }
    };
    walk(exported);
    for (const forbidden of ['path','home','credential','privateKey','endpoint','writerLock']) assert.equal(keys.has(forbidden), false, forbidden);
  } finally { fx.cleanup(); }
});

test('VFS-00 symlink Home alias is rejected', (t) => {
  if (process.platform === 'win32') { t.skip('symlink setup differs under hosted Windows privileges'); return; }
  const fx = fixture();
  const link = `${fx.home}-alias`;
  try {
    fs.symlinkSync(fx.home, link, 'dir');
    assert.throws(() => appendConversationMessage({ home: link, message: m0(), instanceRef }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_HOME_INVALID');
  } finally { fs.rmSync(link, { force:true }); fx.cleanup(); }
});

test('VFCSTORE-CH-00/01/04 GROUP and PRIVATE Family channels materialize exact trusted bindings before any message and survive restart reads', () => {
  const fx = fixture();
  try {
    const record = familyRecord();
    const group = groupFamilyChannel(record);
    const privateChannel = privateFamilyChannel(record);

    const groupWrite = materializeConversationChannel({
      home: fx.home,
      channel: group,
      instanceRef: 'instance.test.vf02b.channel-group'
    });
    const privateWrite = materializeConversationChannel({
      home: fx.home,
      channel: privateChannel,
      instanceRef: 'instance.test.vf02b.channel-private'
    });
    assert.equal(groupWrite.state, 'MATERIALIZED');
    assert.equal(privateWrite.state, 'MATERIALIZED');
    assert.equal(fs.existsSync(path.join(channelRoot(fx.home, group.channelRef), 'current.json')), false);
    assert.equal(fs.existsSync(path.join(channelRoot(fx.home, privateChannel.channelRef), 'current.json')), false);

    const groupRead = readConversationChannelBinding({ home: fx.home, channelRef: group.channelRef });
    const privateRead = readConversationChannelBinding({ home: fx.home, channelRef: privateChannel.channelRef });
    assert.equal(groupRead.state, 'CURRENT');
    assert.equal(privateRead.state, 'CURRENT');
    assert.deepEqual(groupRead.channel, group);
    assert.deepEqual(privateRead.channel, privateChannel);
    assert.deepEqual(
      privateRead.channel.familySpaceBinding.audienceMemberBindings.map((member) => member.principalRef),
      ['principal.victor', 'principal.mei']
    );

    const restarted = readConversationChannelBinding({ home: fx.home, channelRef: group.channelRef });
    assert.equal(restarted.record.channelSha256, groupRead.record.channelSha256);
    assert.deepEqual(restarted.channel, groupRead.channel);
    assert.deepEqual(residue(fx.home), []);
  } finally { fx.cleanup(); }
});

test('VFCSTORE-CH-02/03 duplicate materialization is idempotent and changed canonical meaning conflicts', () => {
  const fx = fixture();
  try {
    const record = familyRecord();
    const group = groupFamilyChannel(record);
    const first = materializeConversationChannel({ home: fx.home, channel: group, instanceRef });
    const duplicate = materializeConversationChannel({ home: fx.home, channel: group, instanceRef, observedAt: t2 });
    assert.equal(duplicate.state, 'IDEMPOTENT_CURRENT');
    assert.equal(duplicate.record.channelSha256, first.record.channelSha256);

    const changedThread = { ...group, threadRef: 'thread.vex-family.changed' };
    assert.throws(
      () => materializeConversationChannel({ home: fx.home, channel: changedThread, instanceRef }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CHANNEL_CONFLICT'
    );

    const changedKindAndAudience = privateFamilyChannel(record, {
      channel: group.channelRef,
      members: ['principal.victor', 'principal.alex']
    });
    assert.throws(
      () => materializeConversationChannel({ home: fx.home, channel: changedKindAndAudience, instanceRef }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CHANNEL_CONFLICT'
    );
    assert.deepEqual(readConversationChannelBinding({ home: fx.home, channelRef }).channel, group);
  } finally { fx.cleanup(); }
});

test('VFCSTORE-CH-05 channel hash corruption and wrong durable address fail closed', () => {
  const fx = fixture();
  try {
    const group = groupFamilyChannel();
    materializeConversationChannel({ home: fx.home, channel: group, instanceRef });
    const file = channelPath(fx.home);
    const good = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(good);
    parsed.channel.familySpaceBinding.membershipGeneration += 1;
    fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
    assert.throws(
      () => readConversationChannelBinding({ home: fx.home, channelRef }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CHANNEL_CORRUPT'
    );
    fs.writeFileSync(file, good);

    const channelsDir = path.join(fx.home, 'conversations', 'channels');
    const wrongDir = path.join(channelsDir, '0'.repeat(64));
    fs.mkdirSync(wrongDir, { recursive: true });
    fs.copyFileSync(file, path.join(wrongDir, 'channel.json'));
    assert.throws(
      () => listConversationChannelBindings({ home: fx.home }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CHANNEL_CORRUPT'
    );
  } finally { fx.cleanup(); }
});

test('VFCSTORE-CH-06 enumeration derives only verified canonical records and ignores message-only/no-record directories', () => {
  const fx = fixture();
  try {
    const record = familyRecord();
    const group = groupFamilyChannel(record);
    const privateChannel = privateFamilyChannel(record);
    materializeConversationChannel({ home: fx.home, channel: privateChannel, instanceRef });
    materializeConversationChannel({ home: fx.home, channel: group, instanceRef });

    const noise = path.join(fx.home, 'conversations', 'channels', 'not-a-channel-address');
    fs.mkdirSync(noise, { recursive: true });
    fs.writeFileSync(path.join(noise, 'current.json'), '{}\n');

    const listed = listConversationChannelBindings({ home: fx.home });
    assert.equal(listed.state, 'CURRENT');
    assert.equal(listed.truncated, false);
    assert.deepEqual(listed.channels.map((channel) => channel.channelRef), [
      'channel.vex-family.alpha',
      'channel.vex-family.alpha.private'
    ]);
    assert.deepEqual(listed.channels[0], group);
    assert.deepEqual(listed.channels[1], privateChannel);
  } finally { fx.cleanup(); }
});

test('VFCSTORE-CH-07 Family Space generation change leaves durable channel bytes immutable and the current Family validator classifies the old binding stale', () => {
  const fx = fixture();
  try {
    const originalRecord = familyRecord();
    const group = groupFamilyChannel(originalRecord);
    materializeConversationChannel({ home: fx.home, channel: group, instanceRef });
    const storedBefore = fs.readFileSync(channelPath(fx.home), 'utf8');
    const storedChannel = readConversationChannelBinding({ home: fx.home, channelRef }).channel;
    const nextRecord = familyRecord({
      revision: 2,
      membershipGeneration: 2,
      updatedAt: t2,
      priorRecordSha256: originalRecord.recordSha256
    });

    assert.throws(
      () => createFamilyMessage({
        messageRef: 'message.family.stale.000',
        channel: storedChannel,
        familySpaceRecord: nextRecord,
        speakerRef: 'principal.victor',
        speakerPrincipalBindingRef: 'principal-binding.victor',
        recipientRefs: ['principal.mei', 'principal.alex'],
        content: 'This must not use stale channel authority.',
        sequence: 0,
        createdAt: t3
      }),
      (error) => error instanceof FamilyConversationError && error.code === 'FAMILY_CONVERSATION_STALE'
    );
    assert.equal(fs.readFileSync(channelPath(fx.home), 'utf8'), storedBefore);
  } finally { fx.cleanup(); }
});

test('VFCSTORE-CH-08 channel materialization does not change existing message event/head lineage', () => {
  const withChannel = fixture();
  const withoutChannel = fixture();
  try {
    materializeConversationChannel({
      home: withChannel.home,
      channel: groupFamilyChannel(),
      instanceRef: 'instance.test.vf02b.channel-lineage'
    });
    for (const event of [m0(), m1()]) {
      appendConversationMessage({ home: withChannel.home, message: event, instanceRef });
      appendConversationMessage({ home: withoutChannel.home, message: event, instanceRef });
    }
    const materialized = readConversationChannel({ home: withChannel.home, channelRef });
    const legacy = readConversationChannel({ home: withoutChannel.home, channelRef });
    assert.deepEqual(
      materialized.messages.map((event) => event.eventSha256),
      legacy.messages.map((event) => event.eventSha256)
    );
    assert.equal(materialized.head.eventSha256, legacy.head.eventSha256);
    assert.equal(materialized.head.headSha256, legacy.head.headSha256);
  } finally {
    withChannel.cleanup();
    withoutChannel.cleanup();
  }
});

test('VFCSTORE-CH-09/10 durable channel records preserve the existing owner envelope without endpoint/model/filesystem authority', () => {
  const fx = fixture();
  try {
    const group = groupFamilyChannel();
    const written = materializeConversationChannel({ home: fx.home, channel: group, instanceRef });
    assert.equal(written.record.schemaVersion, 'vexlife.conversation-channel-record/v1');
    assert.deepEqual(written.record.channel.familySpaceBinding, group.familySpaceBinding);
    const serialized = JSON.stringify(written.record);
    for (const forbidden of ['endpoint', 'modelRef', 'providerRef', 'homePath', 'filesystemPath', 'membershipAuthority']) {
      assert.equal(serialized.includes(`"${forbidden}"`), false, forbidden);
    }
    assert.equal(readConversationChannel({ home: fx.home, channelRef }).state, 'EMPTY');
  } finally { fx.cleanup(); }
});

test('VFCSTORE-CH-11 injected pre/post durable-write failures leave no lock/temp residue and exact retry recovers post-write result', () => {
  const fx = fixture();
  try {
    const group = groupFamilyChannel();
    assert.throws(
      () => materializeConversationChannel({
        home: fx.home,
        channel: group,
        instanceRef,
        faults: { failBeforeChannelWrite: true }
      }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CHANNEL_NOT_MATERIALIZED'
    );
    assert.equal(fs.existsSync(channelPath(fx.home)), false);
    assert.deepEqual(residue(fx.home), []);

    assert.throws(
      () => materializeConversationChannel({
        home: fx.home,
        channel: group,
        instanceRef,
        observedAt: t2,
        faults: { failAfterChannelWrite: true }
      }),
      (error) => error instanceof ConversationStoreError && error.code === 'CONVERSATION_CHANNEL_RESULT_NOT_EMITTED'
    );
    assert.equal(readConversationChannelBinding({ home: fx.home, channelRef }).state, 'CURRENT');
    assert.deepEqual(residue(fx.home), []);
    const retry = materializeConversationChannel({ home: fx.home, channel: group, instanceRef, observedAt: t3 });
    assert.equal(retry.state, 'IDEMPOTENT_CURRENT');
    assert.deepEqual(residue(fx.home), []);
  } finally { fx.cleanup(); }
});
