import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVING_JOURNAL_MEMORY_ARCHIVE_DAY_TRUTH_CLASS,
  LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA,
  LIVING_JOURNAL_MEMORY_ARCHIVE_TRUTH_CLASS,
  projectLivingJournalMemoryArchive
} from '../src/core/living-journal-memory-archive.mjs';
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
  const score = loadScoreContextState(fixture.ids);
  return {
    ...fixture.ids,
    instanceRef: overrides.instanceRef ?? fixture.ids.instanceRef,
    restInvocationAuthorityRef: overrides.restInvocationAuthorityRef ?? 'authority.manual.living-journal-archive.test',
    dayRef: overrides.dayRef ?? 'day.living-journal-archive.000',
    dayIndex: overrides.dayIndex ?? 0,
    calendarDateRef: overrides.calendarDateRef ?? '2026-08-18',
    timeZoneRef: overrides.timeZoneRef ?? 'America/Los_Angeles',
    observedAt: overrides.observedAt ?? '2026-08-18T21:00:00.000Z',
    expectedConversationHeadSha256: overrides.expectedConversationHeadSha256 ?? fixture.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: overrides.expectedScoreHeadSha256 ?? score.head.scoreHeadSha256,
    expectedDailyDreamHeadSha256: Object.hasOwn(overrides, 'expectedDailyDreamHeadSha256')
      ? overrides.expectedDailyDreamHeadSha256
      : (state.head?.dailyDreamHeadSha256 ?? null)
  };
}

function assertZeroEffects(effects) {
  assert.deepEqual(effects, {
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
}

test('Living Journal committed-day archive is a current empty bounded index before any Daily Stratum exists', () => {
  const fixture = createDailyMemoryDreamFixture('lj-archive-empty');
  const archive = projectLivingJournalMemoryArchive({ ...fixture.ids, maxDays: 8 });

  assert.equal(archive.schemaVersion, LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA);
  assert.equal(archive.state, 'CURRENT');
  assert.equal(archive.currentness, 'CURRENT');
  assert.equal(archive.truthClass, LIVING_JOURNAL_MEMORY_ARCHIVE_TRUTH_CLASS);
  assert.equal(archive.totalCommittedDays, 0);
  assert.deepEqual(archive.days, []);
  assert.equal(archive.selectedDay, null);
  assert.equal(archive.rawConversationContentIncluded, false);
  assertZeroEffects(archive.effects);
});

test('Living Journal archive indexes committed days newest-first and reconstructs an older day from its exact historical source frontier', () => {
  const fixture = createDailyMemoryDreamFixture('lj-archive-history');
  const day0 = commitDailyMemoryDream(commitInput(fixture));
  const dailyHeadAfterDay0 = loadDailyMemoryDreamState(fixture.ids).head.dailyDreamHeadSha256;

  replaceFixtureActiveAuthorityWithoutScore(fixture, 'archive-day-1');
  const day1 = commitDailyMemoryDream(commitInput(fixture, {
    dayRef: 'day.living-journal-archive.001',
    dayIndex: 1,
    calendarDateRef: '2026-08-19',
    observedAt: '2026-08-19T21:00:00.000Z',
    instanceRef: 'instance.living-journal.archive.day-1'
  }));

  const window0 = projectLivingJournalMemoryArchive({ ...fixture.ids, maxDays: 1, dayOffset: 0 });
  assert.equal(window0.totalCommittedDays, 2);
  assert.equal(window0.days.length, 1);
  assert.equal(window0.days[0].dayRef, 'day.living-journal-archive.001');
  assert.equal(window0.days[0].dailyStratumSha256, day1.stratum.dailyStratumSha256);
  assert.equal(window0.days[0].isLatestCommittedDay, true);
  assert.equal(window0.days[0].temporalTruthClass, LIVING_JOURNAL_MEMORY_ARCHIVE_DAY_TRUTH_CLASS);
  assert.equal(window0.days[0].currentNowEvaluated, false);
  assert.equal(window0.nextDayOffset, 1);

  const window1 = projectLivingJournalMemoryArchive({ ...fixture.ids, maxDays: 1, dayOffset: 1 });
  assert.equal(window1.days.length, 1);
  assert.equal(window1.days[0].dayRef, 'day.living-journal-archive.000');
  assert.equal(window1.days[0].dailyStratumSha256, day0.stratum.dailyStratumSha256);
  assert.equal(window1.days[0].isLatestCommittedDay, false);
  assert.equal(window1.nextDayOffset, null);

  const historical = projectLivingJournalMemoryArchive({
    ...fixture.ids,
    selectedDayRef: 'day.living-journal-archive.000',
    maxPages: 8,
    maxDays: 8
  });
  assert.ok(historical.selectedDay);
  assert.equal(historical.selectedDay.dayRef, 'day.living-journal-archive.000');
  assert.equal(historical.selectedDay.dailyStratumSha256, day0.stratum.dailyStratumSha256);
  assert.equal(historical.selectedDay.temporalTruthClass, LIVING_JOURNAL_MEMORY_ARCHIVE_DAY_TRUTH_CLASS);
  assert.equal(historical.selectedDay.currentNowEvaluated, false);
  assert.equal(historical.selectedDay.sourceSnapshotState, 'VERIFIED');
  assert.equal(historical.selectedDay.sourceSnapshotCurrentness, 'HISTORICAL_SOURCE_VERIFIED');
  assert.equal(historical.selectedDay.sourceDescent.historicalSourceVerificationState, 'VERIFIED');
  assert.equal(historical.selectedDay.sourceDescent.rawConversationContentIncluded, false);
  assert.equal(historical.selectedDay.pageCount, 1);
  assert.deepEqual(historical.selectedDay.heldOrDeferredStatementRefs, ['statement.g03.held']);

  const page = historical.selectedDay.pages[0];
  assert.equal(page.statementRef, 'statement.g03.active');
  assert.equal(page.summary, 'Accepted active continuity.');
  assert.equal(page.dailyStratumSha256, day0.stratum.dailyStratumSha256);
  assert.equal(page.sourceScoreHeadSha256AtDay, day0.stratum.sourceScoreHeadSha256);
  assert.equal(page.sourceSemanticAuthorityHeadSha256AtDay, day0.stratum.sourceSemanticAuthorityHeadSha256);
  assert.equal(page.temporalTruthClass, LIVING_JOURNAL_MEMORY_ARCHIVE_DAY_TRUTH_CLASS);
  assert.equal(page.currentNowEvaluated, false);
  assert.equal(page.rawSourceContentIncluded, false);
  assert.equal(page.firstPersonAuthorityGranted, false);

  const latest = projectLivingJournalMemoryArchive({
    ...fixture.ids,
    selectedDailyStratumSha256: day1.stratum.dailyStratumSha256,
    maxPages: 8
  });
  assert.equal(latest.selectedDay.isLatestCommittedDay, true);
  assert.equal(latest.selectedDay.currentNowEvaluated, false);
  assert.equal(latest.selectedDay.pageCount, 0);
  assert.ok(latest.selectedDay.heldOrDeferredStatementRefs.includes('statement.g03.active'));

  const serialized = JSON.stringify({ historical, latest, window0, window1 });
  for (const privateNeedle of fixture.privateNeedles) assert.equal(serialized.includes(privateNeedle), false);
  assert.equal(serialized.includes('private human source'), false);
  assert.equal(serialized.includes('private vex source'), false);
  assertZeroEffects(historical.effects);
  assertZeroEffects(latest.effects);

  const finalState = loadDailyMemoryDreamState(fixture.ids);
  assert.equal(finalState.head.dailyDreamHeadSha256, day1.head.dailyDreamHeadSha256);
  assert.notEqual(finalState.head.dailyDreamHeadSha256, dailyHeadAfterDay0);
  assert.equal(finalState.chain.length, 2);
});

test('Living Journal archive bounds and selection fail closed', () => {
  const fixture = createDailyMemoryDreamFixture('lj-archive-bounds');
  commitDailyMemoryDream(commitInput(fixture));

  for (const input of [
    { maxDays: 0 },
    { maxDays: 101 },
    { dayOffset: -1 },
    { maxPages: 0 },
    { maxPages: 101 },
    { selectedDailyStratumSha256: 'not-a-sha' }
  ]) {
    assert.throws(
      () => projectLivingJournalMemoryArchive({ ...fixture.ids, ...input }),
      (error) => error.code === 'LIVING_JOURNAL_ARCHIVE_INPUT_INVALID'
    );
  }

  assert.throws(
    () => projectLivingJournalMemoryArchive({ ...fixture.ids, selectedDayRef: 'day.not.committed' }),
    (error) => error.code === 'LIVING_JOURNAL_ARCHIVE_SELECTION_INVALID'
  );
});

test('Living Journal archive fails closed when committed Daily head ancestry is missing', () => {
  const fixture = createDailyMemoryDreamFixture('lj-archive-broken-lineage');
  commitDailyMemoryDream(commitInput(fixture));
  commitDailyMemoryDream(commitInput(fixture, {
    dayRef: 'day.living-journal-archive.001',
    dayIndex: 1,
    calendarDateRef: '2026-08-19',
    observedAt: '2026-08-19T21:00:00.000Z',
    instanceRef: 'instance.living-journal.archive.broken.day-1'
  }));

  const state = loadDailyMemoryDreamState(fixture.ids);
  const historicalHead = state.headChain[0];
  const headFile = path.join(
    fixture.ids.home,
    'daily-memory-dream',
    fixture.ids.companionLineageRef,
    fixture.ids.threadRef,
    'heads',
    `${historicalHead.dailyDreamHeadSha256}.json`
  );
  fs.rmSync(headFile);

  assert.throws(
    () => projectLivingJournalMemoryArchive({ ...fixture.ids, maxDays: 8 }),
    (error) => error.code === 'LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID' &&
      ['DREAM_RECEIPT_CORRUPT', 'DREAM_HEAD_MISMATCH'].includes(error.details?.sourceCode)
  );
});

// [VXG RealForever]
