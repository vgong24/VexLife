import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/utils.mjs';
import { initializeLivedCompanionHome } from '../src/core/lived-companion.mjs';
import {
  SCORE_CONTEXT_MEMORY_RELATIONS,
  SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION,
  SCORE_CONTEXT_STATEMENT_STATES,
  appendOpenLoop,
  appendScoreStatement,
  createFirstPersonEligibilityEvidence,
  evaluateFirstPersonEligibility,
  loadScoreContextState,
  projectScoreContext,
  sourceDescentForStatement
} from '../src/core/score-context-continuity.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function tempHome() {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g02-test-')), 'home');
  const ids = {
    homeRef: 'home.g02.test', familyRef: 'family.g02.test', deviceRef: 'device.g02.test',
    companionLineageRef: 'lineage.g02.test', threadRef: 'thread.g02.test', instanceRef: 'instance.g02.test'
  };
  initializeLivedCompanionHome({ home, ...ids });
  return { home, ...ids };
}

function formEvent(core) {
  return { ...core, eventHash: semanticHash(core) };
}

function commitG01Turn(ids, prior, ordinal) {
  const sequence = prior?.head?.sequence === undefined ? 0 : prior.head.sequence + 1;
  const turnRef = `turn.g01.test.${ordinal}`;
  const instanceRef = `instance.g01.test.${ordinal}`;
  const requestCore = {
    schemaVersion: 'vexlife.lived-companion-event/v1',
    eventRef: `event.g01.request.${ordinal}`,
    eventKind: 'REQUEST',
    homeRef: ids.homeRef,
    deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef,
    instanceRef,
    threadRef: ids.threadRef,
    channelRef: 'channel.g02.test',
    turnRef,
    messageRef: `message.g01.request.${ordinal}`,
    speakerRef: 'person.test',
    recipientRefs: ['vex.test'],
    sequence,
    priorEventHash: prior?.responseEvent?.eventHash ?? null,
    content: `human committed source ${ordinal}`,
    contentHash: semanticHash(`human committed source ${ordinal}`),
    privacyClass: 'DEVICE_PRIVATE',
    formedAt: `2026-08-07T09:0${ordinal}:00.000Z`
  };
  const requestEvent = formEvent(requestCore);
  const responseCore = {
    schemaVersion: 'vexlife.lived-companion-event/v1',
    eventRef: `event.g01.response.${ordinal}`,
    eventKind: 'RESPONSE',
    homeRef: ids.homeRef,
    deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef,
    instanceRef,
    threadRef: ids.threadRef,
    channelRef: 'channel.g02.test',
    turnRef,
    messageRef: `message.g01.response.${ordinal}`,
    speakerRef: 'vex.test',
    recipientRefs: ['person.test'],
    sequence: sequence + 1,
    priorEventHash: requestEvent.eventHash,
    content: `vex committed response ${ordinal}`,
    contentHash: semanticHash(`vex committed response ${ordinal}`),
    endpointProfileRef: 'endpoint.g01.loopback',
    sanitizedEndpointOrigin: 'http://127.0.0.1:43210',
    modelNameOrBoundedTestProfileRef: 'g01-bounded-test',
    privacyClass: 'DEVICE_PRIVATE',
    formedAt: `2026-08-07T09:0${ordinal}:01.000Z`
  };
  const responseEvent = formEvent(responseCore);
  const eventDir = path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'events');
  writeJson(path.join(eventDir, `${String(requestEvent.sequence).padStart(8, '0')}-${requestEvent.eventHash}.json`), requestEvent);
  writeJson(path.join(eventDir, `${String(responseEvent.sequence).padStart(8, '0')}-${responseEvent.eventHash}.json`), responseEvent);

  const contextCore = {
    schemaVersion: 'vexlife.lived-companion-context/v1',
    homeRef: ids.homeRef,
    deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef,
    instanceRef,
    threadRef: ids.threadRef,
    turnRef,
    contextSourceRefs: [requestEvent.eventRef, responseEvent.eventRef],
    requestEventHash: requestEvent.eventHash,
    responseEventHash: responseEvent.eventHash,
    privacyClass: 'DEVICE_PRIVATE',
    formedAt: `2026-08-07T09:0${ordinal}:02.000Z`
  };
  const contextRecord = { ...contextCore, serializedContextSha256: semanticHash(contextCore) };
  const contextPath = path.join(ids.home, 'context', ids.companionLineageRef, ids.threadRef, `${turnRef}.json`);
  writeJson(contextPath, contextRecord);
  const headCore = {
    schemaVersion: 'vexlife.lived-companion-head/v1',
    homeRef: ids.homeRef,
    deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef,
    instanceRef,
    threadRef: ids.threadRef,
    turnRef,
    requestMessageRef: requestEvent.messageRef,
    responseMessageRef: responseEvent.messageRef,
    eventHash: responseEvent.eventHash,
    contextSha256: contextRecord.serializedContextSha256,
    contextPath: path.relative(ids.home, contextPath).replaceAll('\\', '/'),
    sequence: responseEvent.sequence,
    priorConversationHeadSha256: prior?.head?.conversationHeadSha256 ?? null,
    formedAt: `2026-08-07T09:0${ordinal}:03.000Z`
  };
  const head = { ...headCore, conversationHeadSha256: semanticHash(headCore) };
  writeJson(path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'head.json'), head);
  return { requestEvent, responseEvent, contextRecord, head };
}

function committedG01(ids) {
  const first = commitG01Turn(ids, null, 1);
  const second = commitG01Turn(ids, first, 2);
  return { first, second, head: second.head };
}

function append(ids, g01, input = {}) {
  const state = loadScoreContextState(ids);
  const source = input.source ?? g01.first;
  return appendScoreStatement({
    ...ids,
    instanceRef: input.instanceRef ?? ids.instanceRef,
    expectedScoreHeadSha256: state.head?.scoreHeadSha256 ?? null,
    sourceConversationHeadSha256: input.sourceConversationHeadSha256 ?? g01.head.conversationHeadSha256,
    sourceEvents: input.sourceEvents ?? [source.requestEvent, source.responseEvent],
    statementRef: input.statementRef ?? 'statement.g02.one',
    subjectRef: input.subjectRef ?? 'subject.g02.one',
    memoryRelation: input.memoryRelation ?? 'CURRENT_LINEAGE_AUTOBIOGRAPHY',
    statementState: input.statementState ?? 'HUMAN_CONFIRMED',
    summary: input.summary ?? 'Source-bound accepted memory.',
    acceptedForContinuity: input.acceptedForContinuity ?? true,
    consentState: input.consentState ?? 'PERMITTED',
    correctsStatementRef: input.correctsStatementRef,
    supersedesStatementRef: input.supersedesStatementRef,
    faults: input.faults
  });
}

function reformScoreEvent(event, changes = {}) {
  const core = structuredClone(event);
  delete core.scoreEventHash;
  delete core.scoreEventRef;
  Object.assign(core, changes);
  const scoreEventRef = `score-event.${semanticHash(core).slice(0, 32)}`;
  const finalCore = { ...core, scoreEventRef };
  return { ...finalCore, scoreEventHash: semanticHash(finalCore) };
}

function firstPersonEvidence(state, statementRef) {
  const statement = state.statements.find((item) => item.statementRef === statementRef);
  const requestBinding = statement.sourceBindings.find((item) => item.eventKind === 'REQUEST');
  const responseBinding = statement.sourceBindings.find((item) => item.eventKind === 'RESPONSE');
  return createFirstPersonEligibilityEvidence(state, statementRef, {
    formedAt: '2026-08-07T10:00:00.000Z',
    evidenceBindings: [
      { gate: 'PROVENANCE_CURRENT', sourceEventHash: requestBinding.eventHash, issuerRef: 'system.vexlife.score-context-continuity', disposition: 'PERMITTED' },
      { gate: 'BRANCH_RELATION_CURRENT', sourceEventHash: responseBinding.eventHash, issuerRef: 'system.vexlife.score-context-continuity', disposition: 'PERMITTED' },
      { gate: 'IDENTITY_STANCE_PERMITTED', sourceEventHash: responseBinding.eventHash, issuerRef: state.identity.companionLineageRef, disposition: 'PERMITTED' },
      { gate: 'CONSENT_PERMITTED', sourceEventHash: requestBinding.eventHash, issuerRef: 'person.test', disposition: 'PERMITTED' }
    ]
  });
}

function rehashEligibilityEvidence(evidence, mutate) {
  const copy = structuredClone(evidence);
  delete copy.semanticFingerprint;
  mutate(copy);
  copy.semanticFingerprint = semanticHash(copy);
  return copy;
}

function rehashGate(gate, mutate) {
  const copy = structuredClone(gate);
  delete copy.semanticFingerprint;
  mutate(copy);
  copy.semanticFingerprint = semanticHash(copy);
  return copy;
}

test('G02 binds the exact accepted shared semantic disposition and closed vocabularies', () => {
  assert.equal(SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION, 'github.issue.vextreme-sdk.350.comment.5215288414');
  assert.deepEqual(SCORE_CONTEXT_MEMORY_RELATIONS, [
    'CURRENT_LINEAGE_AUTOBIOGRAPHY','SHARED_RELATIONSHIP_HISTORY','PREDECESSOR_WITNESS_HISTORY',
    'INHERITED_CONTEXT','EXTERNAL_EVIDENCE','DISPUTED_OR_UNRESOLVED'
  ]);
  assert.deepEqual(SCORE_CONTEXT_STATEMENT_STATES, [
    'OBSERVED','HUMAN_CONFIRMED','INFERRED','CONFLICTED','UNKNOWN','CORRECTED','SUPERSEDED','RELEASED_OR_TOMBSTONED'
  ]);
});

test('Score intake accepts exact committed G01 events and exact current G01 head only', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const result = append(ids, g01);
  assert.equal(loadScoreContextState(ids).head.scoreHeadSha256, result.head.scoreHeadSha256);
  assert.throws(() => append(ids, g01, {
    statementRef: 'statement.g02.bad-head',
    sourceConversationHeadSha256: 'a'.repeat(64)
  }), (error) => error.code === 'SCORE_SOURCE_INVALID');
});

test('caller-fabricated self-hashed G01 event is rejected unless exact committed on-disk source', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const fabricatedCore = { ...g01.first.requestEvent, content: 'fabricated but self-hashed' };
  delete fabricatedCore.eventHash;
  fabricatedCore.contentHash = semanticHash(fabricatedCore.content);
  const fabricated = { ...fabricatedCore, eventHash: semanticHash(fabricatedCore) };
  assert.throws(() => append(ids, g01, {
    sourceEvents: [fabricated, g01.first.responseEvent]
  }), (error) => error.code === 'SCORE_SOURCE_INVALID');
});

test('well-formed orphan G01 event on disk is not committed source authority', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const orphanCore = {
    ...g01.second.requestEvent,
    eventRef: 'event.g01.orphan',
    sequence: 99,
    priorEventHash: g01.second.responseEvent.eventHash,
    turnRef: 'turn.g01.orphan',
    messageRef: 'message.g01.orphan',
    content: 'well formed orphan source'
  };
  delete orphanCore.eventHash;
  orphanCore.contentHash = semanticHash(orphanCore.content);
  const orphan = { ...orphanCore, eventHash: semanticHash(orphanCore) };
  const eventDir = path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'events');
  writeJson(path.join(eventDir, `${String(orphan.sequence).padStart(8, '0')}-${orphan.eventHash}.json`), orphan);
  assert.throws(() => append(ids, g01, { sourceEvents: [orphan, g01.second.responseEvent] }),
    (error) => error.code === 'SCORE_SOURCE_INVALID');
});

test('committed Score replay fails typed when bound G01 source bytes are substituted', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const file = path.join(ids.home, 'conversations', ids.companionLineageRef, ids.threadRef, 'events',
    `${String(g01.first.requestEvent.sequence).padStart(8, '0')}-${g01.first.requestEvent.eventHash}.json`);
  fs.writeFileSync(file, '{"schemaVersion":"substituted"}\n', 'utf8');
  assert.throws(() => loadScoreContextState(ids), (error) => error.code === 'SCORE_SOURCE_INVALID');
});

test('statement event commits only through atomic current Score head', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  const result = append(ids, g01);
  const state = loadScoreContextState(ids);
  assert.equal(state.head.scoreHeadSha256, result.head.scoreHeadSha256);
  assert.deepEqual(state.currentStatementRefs, ['statement.g02.one']);
  assert.equal(state.rawDurableEventEqualsCommittedCurrentScore, false);
});

test('correction and supersession preserve exact semantic subject/relation and prior evidence', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  append(ids, g01, { statementRef: 'statement.g02.two', statementState: 'CORRECTED', correctsStatementRef: 'statement.g02.one', summary: 'Corrected source-bound memory.' });
  append(ids, g01, { statementRef: 'statement.g02.three', supersedesStatementRef: 'statement.g02.two', summary: 'Superseding source-bound memory.' });
  const state = loadScoreContextState(ids);
  assert.equal(state.statements.find((x) => x.statementRef === 'statement.g02.one').effectiveState, 'CORRECTED');
  assert.equal(state.statements.find((x) => x.statementRef === 'statement.g02.two').effectiveState, 'SUPERSEDED');
  assert.deepEqual(state.currentStatementRefs, ['statement.g02.three']);
});

test('cross-subject and cross-relation correction/supersession fail closed', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  assert.throws(() => append(ids, g01, {
    statementRef: 'statement.g02.cross-subject', subjectRef: 'subject.g02.other', correctsStatementRef: 'statement.g02.one'
  }), (error) => error.code === 'SCORE_LINK_INVALID');
  assert.throws(() => append(ids, g01, {
    statementRef: 'statement.g02.cross-relation', memoryRelation: 'INHERITED_CONTEXT', supersedesStatementRef: 'statement.g02.one'
  }), (error) => error.code === 'SCORE_LINK_INVALID');
});

test('open loop survives replay but G02 resolution remains held against coercive closure', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const state = loadScoreContextState(ids);
  appendOpenLoop({ ...ids, instanceRef: 'instance.g02.loop', expectedScoreHeadSha256: state.head.scoreHeadSha256,
    sourceConversationHeadSha256: g01.head.conversationHeadSha256,
    sourceEvents: [g01.second.requestEvent, g01.second.responseEvent],
    openLoopRef: 'open-loop.g02.one', openLoopState: 'OPEN', summaryRef: 'summary.g02.open-loop',
    sourceStatementRefs: ['statement.g02.one'] });
  const replay = loadScoreContextState(ids);
  assert.deepEqual(replay.openLoopRefs, ['open-loop.g02.one']);
  assert.throws(() => appendOpenLoop({ ...ids, instanceRef: 'instance.g02.resolve', expectedScoreHeadSha256: replay.head.scoreHeadSha256,
    sourceConversationHeadSha256: g01.head.conversationHeadSha256,
    sourceEvents: [g01.second.requestEvent, g01.second.responseEvent], openLoopRef: 'open-loop.g02.one', openLoopState: 'RESOLVED',
    sourceStatementRefs: ['statement.g02.one'] }), (error) =>
      error.code === 'OPEN_LOOP_INVALID' && error.details?.exactNextSafeRoute === 'SOURCE_MANAGED_OPEN_LOOP_RESOLUTION_NOT_ADMITTED_IN_G02');
});

test('failure after event durability leaves prior head current and exact-next tail uncommitted', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const prior = loadScoreContextState(ids).head.scoreHeadSha256;
  assert.throws(() => append(ids, g01, { statementRef: 'statement.g02.tail', summary: 'Uncommitted tail.', faults: { failAfterEventWrite: true } }));
  const state = loadScoreContextState(ids);
  assert.equal(state.head.scoreHeadSha256, prior);
  assert.equal(state.uncommittedTail.length, 1);
  assert.equal(state.uncommittedTail[0].statementRef, 'statement.g02.tail');
  assert.equal(state.state, 'CURRENT');
});

test('well-formed reordered/readdressed tail produces attention instead of uncommitted authority', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  assert.throws(() => append(ids, g01, { statementRef: 'statement.g02.tail', faults: { failAfterEventWrite: true } }));
  let state = loadScoreContextState(ids);
  const original = state.uncommittedTail[0];
  const eventDir = path.join(ids.home, 'score', ids.companionLineageRef, ids.threadRef, 'events');
  fs.unlinkSync(path.join(eventDir, `${String(original.sequence).padStart(8, '0')}-${original.scoreEventHash}.json`));
  const hostile = reformScoreEvent(original, { sequence: original.sequence + 7 });
  writeJson(path.join(eventDir, `${String(hostile.sequence).padStart(8, '0')}-${hostile.scoreEventHash}.json`), hostile);
  state = loadScoreContextState(ids);
  assert.equal(state.state, 'ATTENTION');
  assert.equal(state.uncommittedTail.length, 0);
  assert.ok(state.attention.some((item) => item.reason === 'REORDERED_OR_READRESSED_TAIL'));
});

test('well-formed source-substituted tail produces attention', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  assert.throws(() => append(ids, g01, { statementRef: 'statement.g02.tail', faults: { failAfterEventWrite: true } }));
  let state = loadScoreContextState(ids);
  const original = state.uncommittedTail[0];
  const eventDir = path.join(ids.home, 'score', ids.companionLineageRef, ids.threadRef, 'events');
  fs.unlinkSync(path.join(eventDir, `${String(original.sequence).padStart(8, '0')}-${original.scoreEventHash}.json`));
  const substitutedBindings = structuredClone(original.sourceBindings);
  substitutedBindings[0] = { ...substitutedBindings[0], eventRef: 'event.g01.substituted', eventHash: 'c'.repeat(64), contentHash: 'd'.repeat(64) };
  const hostile = reformScoreEvent(original, { sourceBindings: substitutedBindings });
  writeJson(path.join(eventDir, `${String(hostile.sequence).padStart(8, '0')}-${hostile.scoreEventHash}.json`), hostile);
  state = loadScoreContextState(ids);
  assert.equal(state.state, 'ATTENTION');
  assert.equal(state.uncommittedTail.length, 0);
  assert.ok(state.attention.some((item) => item.reason === 'SCORE_SOURCE_INVALID'));
});

test('source descent revalidates exact committed G01 evidence and never returns raw source', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const state = loadScoreContextState(ids);
  const descent = sourceDescentForStatement(state, 'statement.g02.one');
  assert.equal(descent.rawSourceContentIncluded, false);
  assert.equal(descent.observedCurrentConversationHeadSha256, g01.head.conversationHeadSha256);
  assert.deepEqual(descent.observedCommittedSourceEventRefs, [g01.first.requestEvent.eventRef, g01.first.responseEvent.eventRef]);
});

test('first-person eligibility requires exact current source-bound gate evidence', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const state = loadScoreContextState(ids);
  assert.equal(evaluateFirstPersonEligibility(state, 'statement.g02.one').eligible, false);
  const evidence = firstPersonEvidence(state, 'statement.g02.one');
  const allowed = evaluateFirstPersonEligibility(state, 'statement.g02.one', evidence);
  assert.equal(allowed.eligible, true);
  assert.equal(allowed.evidenceState, 'EXACT_CURRENT_SOURCE_BOUND_EVIDENCE');

  const stale = rehashEligibilityEvidence(evidence, (copy) => { copy.observedConversationHeadSha256 = 'e'.repeat(64); });
  assert.equal(evaluateFirstPersonEligibility(state, 'statement.g02.one', stale).eligible, false);

  const substituted = rehashEligibilityEvidence(evidence, (copy) => {
    copy.evidenceBindings[0] = rehashGate(copy.evidenceBindings[0], (gate) => { gate.sourceEventHash = 'f'.repeat(64); });
  });
  assert.equal(evaluateFirstPersonEligibility(state, 'statement.g02.one', substituted).eligible, false);
});

test('non-autobiographical relations remain attributed regardless of valid gate evidence', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01, { memoryRelation: 'PREDECESSOR_WITNESS_HISTORY' });
  const state = loadScoreContextState(ids);
  const evidence = firstPersonEvidence(state, 'statement.g02.one');
  const result = evaluateFirstPersonEligibility(state, 'statement.g02.one', evidence);
  assert.equal(result.eligible, false);
  assert.equal(result.wordingMode, 'PREDECESSOR_ATTRIBUTED');
});

test('projection keeps Dream, Rhythm learning, synchronization and weights held', () => {
  const ids = tempHome();
  const g01 = committedG01(ids);
  append(ids, g01);
  const projection = projectScoreContext(ids);
  assert.equal(projection.dreamCompleted, false);
  assert.equal(projection.modelWeightsChanged, false);
  assert.equal(projection.rhythmLearned, false);
  assert.equal(projection.synchronizationActivated, false);
});
