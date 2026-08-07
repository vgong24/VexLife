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
  evaluateFirstPersonEligibility,
  loadScoreContextState,
  projectScoreContext,
  sourceDescentForStatement
} from '../src/core/score-context-continuity.mjs';

function tempHome() {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-g02-test-')), 'home');
  const ids = {
    homeRef: 'home.g02.test', familyRef: 'family.g02.test', deviceRef: 'device.g02.test',
    companionLineageRef: 'lineage.g02.test', threadRef: 'thread.g02.test', instanceRef: 'instance.g02.test'
  };
  initializeLivedCompanionHome({ home, ...ids });
  return { home, ...ids };
}

function sourceEvent(ids, sequence = 0, kind = 'REQUEST', turn = 'turn.g02.source') {
  const content = `${kind.toLowerCase()}-${sequence}`;
  const core = {
    schemaVersion: 'vexlife.lived-companion-event/v1', eventRef: `event.g02.source.${sequence}`,
    eventKind: kind, homeRef: ids.homeRef, deviceRef: ids.deviceRef,
    companionLineageRef: ids.companionLineageRef, instanceRef: 'instance.g01.source',
    threadRef: ids.threadRef, channelRef: 'channel.g02.test', turnRef: turn,
    messageRef: `message.g02.source.${sequence}`, speakerRef: kind === 'REQUEST' ? 'person.test' : 'vex.test',
    recipientRefs: [kind === 'REQUEST' ? 'vex.test' : 'person.test'], sequence,
    priorEventHash: null, content, contentHash: semanticHash(content), privacyClass: 'DEVICE_PRIVATE',
    formedAt: '2026-08-07T09:00:00.000Z',
    ...(kind === 'RESPONSE' ? {
      endpointProfileRef: 'endpoint.loopback.test', sanitizedEndpointOrigin: 'http://127.0.0.1:1',
      modelNameOrBoundedTestProfileRef: 'bounded-test'
    } : {})
  };
  return { ...core, eventHash: semanticHash(core) };
}

function append(ids, input = {}) {
  const state = loadScoreContextState(ids);
  return appendScoreStatement({
    ...ids, instanceRef: input.instanceRef ?? ids.instanceRef,
    expectedScoreHeadSha256: state.head?.scoreHeadSha256 ?? null,
    sourceConversationHeadSha256: 'a'.repeat(64), sourceEvents: input.sourceEvents ?? [sourceEvent(ids)],
    statementRef: input.statementRef ?? 'statement.g02.one', subjectRef: input.subjectRef ?? 'subject.g02.one',
    memoryRelation: input.memoryRelation ?? 'CURRENT_LINEAGE_AUTOBIOGRAPHY',
    statementState: input.statementState ?? 'HUMAN_CONFIRMED', summary: input.summary ?? 'Synthetic accepted memory.',
    acceptedForContinuity: input.acceptedForContinuity ?? true, consentState: input.consentState ?? 'PERMITTED',
    correctsStatementRef: input.correctsStatementRef, supersedesStatementRef: input.supersedesStatementRef,
    faults: input.faults
  });
}

test('G02 binds the exact accepted shared semantic disposition', () => {
  assert.equal(SCORE_CONTEXT_SHARED_SEMANTIC_DISPOSITION, 'github.issue.vextreme-sdk.350.comment.5215288414');
});

test('all six memory relation classes are explicit and closed', () => {
  assert.deepEqual(SCORE_CONTEXT_MEMORY_RELATIONS, [
    'CURRENT_LINEAGE_AUTOBIOGRAPHY','SHARED_RELATIONSHIP_HISTORY','PREDECESSOR_WITNESS_HISTORY',
    'INHERITED_CONTEXT','EXTERNAL_EVIDENCE','DISPUTED_OR_UNRESOLVED'
  ]);
});

test('accepted statement state vocabulary is explicit and closed', () => {
  assert.deepEqual(SCORE_CONTEXT_STATEMENT_STATES, [
    'OBSERVED','HUMAN_CONFIRMED','INFERRED','CONFLICTED','UNKNOWN','CORRECTED','SUPERSEDED','RELEASED_OR_TOMBSTONED'
  ]);
});

test('statement event commits only through an atomic current Score head', () => {
  const ids = tempHome();
  const result = append(ids);
  const state = loadScoreContextState(ids);
  assert.equal(state.head.scoreHeadSha256, result.head.scoreHeadSha256);
  assert.equal(state.currentStatementRefs[0], 'statement.g02.one');
  assert.equal(state.rawDurableEventEqualsCommittedCurrentScore, false);
});

test('correction preserves the prior statement and advances current meaning', () => {
  const ids = tempHome();
  append(ids);
  append(ids, { statementRef: 'statement.g02.two', subjectRef: 'subject.g02.one', statementState: 'CORRECTED', correctsStatementRef: 'statement.g02.one', summary: 'Corrected synthetic memory.' });
  const state = loadScoreContextState(ids);
  assert.equal(state.statements.length, 2);
  assert.equal(state.statements.find((x) => x.statementRef === 'statement.g02.one').effectiveState, 'CORRECTED');
  assert.equal(state.statements.find((x) => x.statementRef === 'statement.g02.one').current, false);
  assert.deepEqual(state.currentStatementRefs, ['statement.g02.two']);
});

test('supersession preserves immutable predecessor evidence', () => {
  const ids = tempHome();
  append(ids);
  append(ids, { statementRef: 'statement.g02.two', supersedesStatementRef: 'statement.g02.one', summary: 'Superseding synthetic interpretation.' });
  const state = loadScoreContextState(ids);
  assert.equal(state.chain.length, 2);
  assert.equal(state.statements.find((x) => x.statementRef === 'statement.g02.one').effectiveState, 'SUPERSEDED');
  assert.equal(state.statements.find((x) => x.statementRef === 'statement.g02.two').current, true);
});

test('open loop survives replay and remains source-bound', () => {
  const ids = tempHome();
  append(ids);
  const state = loadScoreContextState(ids);
  appendOpenLoop({ ...ids, expectedScoreHeadSha256: state.head.scoreHeadSha256,
    sourceConversationHeadSha256: 'a'.repeat(64), sourceEvents: [sourceEvent(ids)],
    openLoopRef: 'open-loop.g02.one', openLoopState: 'OPEN', summaryRef: 'summary.g02.open-loop',
    sourceStatementRefs: ['statement.g02.one'] });
  const replay = loadScoreContextState(ids);
  assert.deepEqual(replay.openLoopRefs, ['open-loop.g02.one']);
  assert.equal(projectScoreContext(ids).openLoops[0].sourceBindings.length, 1);
});

test('failure after event durability leaves prior head current and exposes uncommitted tail', () => {
  const ids = tempHome();
  append(ids);
  const prior = loadScoreContextState(ids).head.scoreHeadSha256;
  assert.throws(() => append(ids, { statementRef: 'statement.g02.tail', summary: 'Uncommitted tail.', faults: { failAfterEventWrite: true } }));
  const state = loadScoreContextState(ids);
  assert.equal(state.head.scoreHeadSha256, prior);
  assert.equal(state.uncommittedTail.length, 1);
  assert.equal(state.uncommittedTail[0].statementRef, 'statement.g02.tail');
});

test('hash-invalid uncommitted tail never becomes current and produces attention', () => {
  const ids = tempHome();
  append(ids);
  const state = loadScoreContextState(ids);
  const events = path.join(ids.home, 'score', ids.companionLineageRef, ids.threadRef, 'events');
  fs.writeFileSync(path.join(events, `00000001-${'b'.repeat(64)}.json`), '{"schemaVersion":"broken"}\n');
  const observed = loadScoreContextState(ids);
  assert.equal(observed.head.scoreHeadSha256, state.head.scoreHeadSha256);
  assert.equal(observed.state, 'ATTENTION');
  assert.equal(observed.attention[0].code, 'INVALID_TAIL');
});

test('source descent binds compact exact G01 evidence without raw source duplication', () => {
  const ids = tempHome();
  append(ids);
  const state = loadScoreContextState(ids);
  const descent = sourceDescentForStatement(state, 'statement.g02.one');
  assert.equal(descent.rawSourceContentIncluded, false);
  assert.equal(descent.sourceBindings[0].eventRef, 'event.g02.source.0');
  assert.match(descent.sourceBindings[0].eventHash, /^[0-9a-f]{64}$/);
});

test('first-person eligibility is limited to accepted current-lineage autobiography with all gates', () => {
  const ids = tempHome();
  append(ids);
  const statement = loadScoreContextState(ids).statements[0];
  const allowed = evaluateFirstPersonEligibility(statement, { provenanceCurrent: true, branchRelationCurrent: true, identityStancePermits: true, consentPermits: true });
  assert.equal(allowed.eligible, true);
  const predecessor = { ...statement, memoryRelation: 'PREDECESSOR_WITNESS_HISTORY' };
  assert.deepEqual(evaluateFirstPersonEligibility(predecessor, { provenanceCurrent: true, branchRelationCurrent: true, identityStancePermits: true, consentPermits: true }), {
    eligible: false, wordingMode: 'PREDECESSOR_ATTRIBUTED', historicalAuthorityFromRhythm: false
  });
});

test('all non-autobiographical relations have attributed wording modes', () => {
  const base = { current: true, acceptedForContinuity: true, consentState: 'PERMITTED', effectiveState: 'HUMAN_CONFIRMED' };
  const gates = { provenanceCurrent: true, branchRelationCurrent: true, identityStancePermits: true, consentPermits: true };
  const modes = new Map(SCORE_CONTEXT_MEMORY_RELATIONS.map((relation) => [relation, evaluateFirstPersonEligibility({ ...base, memoryRelation: relation }, gates).wordingMode]));
  assert.equal(modes.get('SHARED_RELATIONSHIP_HISTORY'), 'RELATIONSHIP_ATTRIBUTED');
  assert.equal(modes.get('PREDECESSOR_WITNESS_HISTORY'), 'PREDECESSOR_ATTRIBUTED');
  assert.equal(modes.get('INHERITED_CONTEXT'), 'SOURCE_ATTRIBUTED');
  assert.equal(modes.get('EXTERNAL_EVIDENCE'), 'SOURCE_ATTRIBUTED');
  assert.equal(modes.get('DISPUTED_OR_UNRESOLVED'), 'UNRESOLVED_ATTRIBUTED');
});

test('projection keeps Dream, Rhythm learning, synchronization and weights held', () => {
  const ids = tempHome();
  append(ids);
  const projection = projectScoreContext(ids);
  assert.equal(projection.dreamCompleted, false);
  assert.equal(projection.modelWeightsChanged, false);
  assert.equal(projection.rhythmLearned, false);
  assert.equal(projection.synchronizationActivated, false);
});
