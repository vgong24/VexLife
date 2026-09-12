import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/utils.mjs';
import {
  ConversationStoreError,
  appendConversationMessage,
  exportConversationChannel,
  readConversationChannel,
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
