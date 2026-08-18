import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA,
  LIVING_JOURNAL_MEMORY_TRUTH_CLASS,
  projectLivingJournalMemory
} from '../src/core/living-journal-memory-projection.mjs';
import {
  commitDailyMemoryDream,
  loadDailyMemoryDreamState
} from '../src/core/daily-memory-dream.mjs';
import { loadScoreContextState } from '../src/core/score-context-continuity.mjs';
import {
  createDailyMemoryDreamFixture,
  replaceFixtureActiveAuthorityWithoutScore
} from '../scripts/daily-memory-dream.mjs';

function commitInput(fixture, overrides = {}) {
  const state = loadDailyMemoryDreamState(fixture.ids);
  return {
    ...fixture.ids,
    instanceRef: overrides.instanceRef ?? fixture.ids.instanceRef,
    restInvocationAuthorityRef: overrides.restInvocationAuthorityRef ?? 'authority.manual.living-journal-memory.test',
    dayRef: overrides.dayRef ?? 'day.living-journal-memory.000',
    dayIndex: overrides.dayIndex ?? 0,
    calendarDateRef: overrides.calendarDateRef ?? '2026-08-17',
    timeZoneRef: overrides.timeZoneRef ?? 'America/Los_Angeles',
    observedAt: overrides.observedAt ?? '2026-08-18T00:00:00.000Z',
    expectedConversationHeadSha256: overrides.expectedConversationHeadSha256 ?? fixture.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: overrides.expectedScoreHeadSha256 ?? fixture.score.head.scoreHeadSha256,
    expectedDailyDreamHeadSha256: Object.hasOwn(overrides, 'expectedDailyDreamHeadSha256')
      ? overrides.expectedDailyDreamHeadSha256
      : (state.head?.dailyDreamHeadSha256 ?? null)
  };
}

test('Living Journal Memory projection holds before one committed Daily Memory stratum exists', () => {
  const fixture = createDailyMemoryDreamFixture('lj-memory-empty');
  const projection = projectLivingJournalMemory({ ...fixture.ids, maxPages: 4 });
  assert.equal(projection.schemaVersion, LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA);
  assert.equal(projection.state, 'HELD');
  assert.equal(projection.truthClass, 'MEMORY_REFERENCE_HELD');
  assert.deepEqual(projection.reasons, ['NO_COMMITTED_DAILY_MEMORY']);
  assert.equal(projection.realMemoryLoaded, false);
  assert.equal(projection.realJournalBodyLoaded, false);
  assert.equal(projection.rawConversationContentIncluded, false);
  assert.deepEqual(projection.pages, []);
});

test('Living Journal projects the current accepted Memory summary into one bounded real page with exact source descent', () => {
  const fixture = createDailyMemoryDreamFixture('lj-memory-current');
  const committed = commitDailyMemoryDream(commitInput(fixture));
  const scoreBefore = loadScoreContextState(fixture.ids);
  const dreamBefore = loadDailyMemoryDreamState(fixture.ids);

  const projection = projectLivingJournalMemory({ ...fixture.ids, maxPages: 8 });

  assert.equal(projection.schemaVersion, LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA);
  assert.equal(projection.state, 'CURRENT');
  assert.equal(projection.currentness, 'CURRENT');
  assert.equal(projection.truthClass, LIVING_JOURNAL_MEMORY_TRUTH_CLASS);
  assert.equal(projection.realMemoryLoaded, true);
  assert.equal(projection.realJournalBodyLoaded, true);
  assert.equal(projection.rawConversationContentIncluded, false);
  assert.equal(projection.pageCount, 1);
  assert.equal(projection.pages.length, 1);
  assert.deepEqual(projection.heldOrDeferredStatementRefs, ['statement.g03.held']);
  assert.deepEqual(projection.boundedOutStatementRefs, []);

  const page = projection.pages[0];
  const accepted = scoreBefore.statements.find((item) => item.statementRef === 'statement.g03.active');
  assert.ok(accepted);
  assert.equal(page.statementRef, accepted.statementRef);
  assert.equal(page.summary, 'Accepted active continuity.');
  assert.equal(page.summary, accepted.summary);
  assert.equal(page.summaryHash, accepted.summaryHash);
  assert.equal(page.memoryRelation, accepted.memoryRelation);
  assert.equal(page.recordedStatementState, accepted.recordedStatementState);
  assert.equal(page.effectiveState, accepted.effectiveState);
  assert.equal(page.acceptedForContinuity, true);
  assert.equal(page.consentState, 'PERMITTED');
  assert.equal(page.semanticAcceptanceRef, accepted.semanticAcceptanceRef);
  assert.equal(page.semanticAcceptanceSha256, accepted.semanticAcceptanceSha256);
  assert.equal(page.sourceDescent.rawSourceContentIncluded, false);
  assert.equal(page.sourceDescent.observedCurrentConversationHeadSha256, fixture.g01.head.conversationHeadSha256);
  assert.equal(page.sourceDescent.observedCommittedSourceEventRefs.length, 2);
  assert.deepEqual(page.sourceBindings, accepted.sourceBindings);
  assert.equal(page.rawSourceContentIncluded, false);
  assert.equal(page.firstPersonAuthorityGranted, false);

  assert.equal(projection.daily.currentDailyStratumSha256, committed.stratum.dailyStratumSha256);
  assert.equal(projection.daily.sourceConversationHeadSha256, fixture.g01.head.conversationHeadSha256);
  assert.equal(projection.daily.sourceScoreHeadSha256, fixture.score.head.scoreHeadSha256);
  assert.equal(
    projection.daily.sourceSemanticAuthorityHeadSha256,
    fixture.score.currentSemanticAuthorityHead.semanticAuthorityHeadSha256
  );
  assert.equal(projection.daily.sourceDescent.rawConversationContentIncluded, false);

  const serialized = JSON.stringify(projection);
  for (const privateNeedle of fixture.privateNeedles) assert.equal(serialized.includes(privateNeedle), false);
  assert.equal(serialized.includes('private human source'), false);
  assert.equal(serialized.includes('private vex source'), false);

  assert.deepEqual(projection.effects, {
    homeMutated: false,
    memoryMutated: false,
    semanticAcceptanceCreated: false,
    firstPersonAuthorityGranted: false,
    modelCalled: false,
    translationCalled: false,
    networkCalled: false,
    trainingRan: false,
    modelWeightsChanged: false,
    publicationPerformed: false
  });

  const scoreAfter = loadScoreContextState(fixture.ids);
  const dreamAfter = loadDailyMemoryDreamState(fixture.ids);
  assert.equal(scoreAfter.head.scoreHeadSha256, scoreBefore.head.scoreHeadSha256);
  assert.equal(dreamAfter.head.dailyDreamHeadSha256, dreamBefore.head.dailyDreamHeadSha256);
  assert.equal(scoreAfter.chain.length, scoreBefore.chain.length);
  assert.equal(dreamAfter.chain.length, dreamBefore.chain.length);
});

test('Living Journal Memory projection fails closed on invalid page bounds', () => {
  const fixture = createDailyMemoryDreamFixture('lj-memory-bounds');
  assert.throws(
    () => projectLivingJournalMemory({ ...fixture.ids, maxPages: 0 }),
    (error) => error.code === 'LIVING_JOURNAL_MEMORY_INPUT_INVALID'
  );
  assert.throws(
    () => projectLivingJournalMemory({ ...fixture.ids, maxPages: 101 }),
    (error) => error.code === 'LIVING_JOURNAL_MEMORY_INPUT_INVALID'
  );
});

test('Living Journal holds a committed Daily Memory projection when the current semantic-authority frontier advances', () => {
  const fixture = createDailyMemoryDreamFixture('lj-memory-stale');
  commitDailyMemoryDream(commitInput(fixture));
  const before = loadScoreContextState(fixture.ids);
  const historicalHead = before.currentSemanticAuthorityHead.semanticAuthorityHeadSha256;

  const replaced = replaceFixtureActiveAuthorityWithoutScore(fixture, 'living-journal-stale');
  assert.notEqual(replaced.after.currentSemanticAuthorityHead.semanticAuthorityHeadSha256, historicalHead);

  const projection = projectLivingJournalMemory({ ...fixture.ids, maxPages: 8 });
  assert.equal(projection.state, 'HELD');
  assert.deepEqual(projection.reasons, ['DAILY_MEMORY_SOURCE_FRONTIER_STALE']);
  assert.equal(projection.realMemoryLoaded, false);
  assert.equal(projection.pages.length, 0);
  assert.equal(projection.rawConversationContentIncluded, false);
  assert.equal(projection.effects.memoryMutated, false);
  assert.equal(projection.effects.homeMutated, false);
});

// [VXG RealForever]
