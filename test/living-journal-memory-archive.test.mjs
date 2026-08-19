import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA,
  projectLivingJournalMemoryArchive
} from '../src/core/living-journal-memory-archive.mjs';
import {
  commitDailyMemoryDream,
  loadDailyMemoryDreamState
} from '../src/core/daily-memory-dream.mjs';
import {
  createDailyMemoryDreamFixture,
  replaceFixtureActiveAuthorityWithoutScore
} from '../scripts/daily-memory-dream.mjs';

function commitInput(fixture, overrides = {}) {
  const state = loadDailyMemoryDreamState(fixture.ids);
  return {
    ...fixture.ids,
    instanceRef: overrides.instanceRef ?? fixture.ids.instanceRef,
    restInvocationAuthorityRef: overrides.restInvocationAuthorityRef ?? 'authority.manual.living-journal-archive.test',
    dayRef: overrides.dayRef ?? 'day.living-journal-archive.000',
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

function formTwoCommittedDays(name) {
  const fixture = createDailyMemoryDreamFixture(name);
  const first = commitDailyMemoryDream(commitInput(fixture));
  replaceFixtureActiveAuthorityWithoutScore(fixture, `${name}-day-one`);
  const second = commitDailyMemoryDream(commitInput(fixture, {
    dayRef: 'day.living-journal-archive.001',
    dayIndex: 1,
    calendarDateRef: '2026-08-18',
    observedAt: '2026-08-19T00:00:00.000Z'
  }));
  return { fixture, first, second };
}

test('Living Journal archive is a bounded empty projection before the first committed day', () => {
  const fixture = createDailyMemoryDreamFixture('lj-archive-empty');
  const archive = projectLivingJournalMemoryArchive({ ...fixture.ids, maxDays: 5 });
  assert.equal(archive.schemaVersion, LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA);
  assert.equal(archive.state, 'CURRENT');
  assert.equal(archive.archiveState, 'EMPTY');
  assert.equal(archive.totalCommittedDays, 0);
  assert.deepEqual(archive.index.days, []);
  assert.equal(archive.selectedDay, null);
  assert.equal(archive.rawConversationContentIncluded, false);
});

test('Living Journal archive windows committed days newest-first and source-verifies a selected historical day', () => {
  const { fixture, first, second } = formTwoCommittedDays('lj-archive-history');
  const before = loadDailyMemoryDreamState(fixture.ids);

  const archive = projectLivingJournalMemoryArchive({
    ...fixture.ids,
    maxDays: 1,
    indexOffset: 0,
    maxPages: 8,
    selectedDayRef: 'day.living-journal-archive.000'
  });

  assert.equal(archive.schemaVersion, LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA);
  assert.equal(archive.archiveState, 'AVAILABLE');
  assert.equal(archive.totalCommittedDays, 2);
  assert.equal(archive.currentDailyStratumSha256, second.stratum.dailyStratumSha256);
  assert.equal(archive.index.order, 'NEWEST_COMMITTED_FIRST');
  assert.equal(archive.index.returnedDays, 1);
  assert.equal(archive.index.hasMore, true);
  assert.equal(archive.index.nextOffset, 1);
  assert.equal(archive.index.days[0].dayRef, 'day.living-journal-archive.001');
  assert.equal(archive.index.days[0].dayIndex, 1);
  assert.equal(archive.index.days[0].calendarDateRef, '2026-08-18');
  assert.equal(archive.index.days[0].dailyStratumSha256, second.stratum.dailyStratumSha256);
  assert.equal(archive.index.days[0].temporalClass, 'CURRENT_DAY');

  const selected = archive.selectedDay;
  assert.ok(selected);
  assert.equal(selected.dayRef, 'day.living-journal-archive.000');
  assert.equal(selected.dayIndex, 0);
  assert.equal(selected.calendarDateRef, '2026-08-17');
  assert.equal(selected.dailyStratumRef, first.stratum.dailyStratumRef);
  assert.equal(selected.dailyStratumSha256, first.stratum.dailyStratumSha256);
  assert.equal(selected.temporalClass, 'HISTORICAL_AT_DAY');
  assert.equal(selected.truthClass, 'HISTORICAL_MEMORY_REFERENCE');
  assert.equal(selected.historicalSourceVerificationState, 'VERIFIED');
  assert.equal(selected.pageCount, 1);
  assert.equal(selected.pages[0].summary, 'Accepted active continuity.');
  assert.equal(selected.pages[0].statementRef, 'statement.g03.active');
  assert.equal(selected.pages[0].temporalClass, 'HISTORICAL_AT_DAY');
  assert.equal(selected.pages[0].dailyStratumSha256, first.stratum.dailyStratumSha256);
  assert.equal(selected.pages[0].rawSourceContentIncluded, false);
  assert.equal(selected.sourceDescent.rawConversationContentIncluded, false);
  assert.equal(selected.rawConversationContentIncluded, false);
  assert.deepEqual(selected.boundedOutStatementRefs, []);

  const serialized = JSON.stringify(archive);
  for (const privateNeedle of fixture.privateNeedles) assert.equal(serialized.includes(privateNeedle), false);
  assert.equal(serialized.includes('private human source'), false);
  assert.equal(serialized.includes('private vex source'), false);
  assert.deepEqual(archive.effects, {
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

  const after = loadDailyMemoryDreamState(fixture.ids);
  assert.equal(after.head.dailyDreamHeadSha256, before.head.dailyDreamHeadSha256);
  assert.equal(after.chain.length, before.chain.length);
});

test('Later semantic-authority currentness does not rewrite the prior committed day', () => {
  const { fixture, first } = formTwoCommittedDays('lj-archive-no-rewrite');
  const historical = projectLivingJournalMemoryArchive({
    ...fixture.ids,
    selectedDailyStratumSha256: first.stratum.dailyStratumSha256,
    maxPages: 8
  });
  const current = projectLivingJournalMemoryArchive({
    ...fixture.ids,
    selectedDayIndex: 1,
    maxPages: 8
  });

  assert.equal(historical.selectedDay.temporalClass, 'HISTORICAL_AT_DAY');
  assert.equal(historical.selectedDay.pages.length, 1);
  assert.equal(historical.selectedDay.pages[0].summary, 'Accepted active continuity.');
  assert.equal(current.selectedDay.temporalClass, 'CURRENT_DAY');
  assert.equal(current.selectedDay.pages.length, 0);
  assert.deepEqual(current.selectedDay.heldOrDeferredStatementRefs, ['statement.g03.active', 'statement.g03.held']);
});

test('Living Journal archive rejects ambiguous/missing selections and unbounded requests', () => {
  const { fixture } = formTwoCommittedDays('lj-archive-bounds');
  assert.throws(
    () => projectLivingJournalMemoryArchive({ ...fixture.ids, maxDays: 0 }),
    (error) => error.code === 'LIVING_JOURNAL_ARCHIVE_INPUT_INVALID'
  );
  assert.throws(
    () => projectLivingJournalMemoryArchive({ ...fixture.ids, maxPages: 101 }),
    (error) => error.code === 'LIVING_JOURNAL_ARCHIVE_INPUT_INVALID'
  );
  assert.throws(
    () => projectLivingJournalMemoryArchive({
      ...fixture.ids,
      selectedDayRef: 'day.living-journal-archive.000',
      selectedDayIndex: 0
    }),
    (error) => error.code === 'LIVING_JOURNAL_ARCHIVE_SELECTION_AMBIGUOUS'
  );
  assert.throws(
    () => projectLivingJournalMemoryArchive({ ...fixture.ids, selectedDayRef: 'day.missing' }),
    (error) => error.code === 'LIVING_JOURNAL_ARCHIVE_SELECTION_NOT_FOUND'
  );
});

test('Living Journal archive fails closed when canonical Daily Memory lineage is corrupted', () => {
  const fixture = createDailyMemoryDreamFixture('lj-archive-corrupt');
  commitDailyMemoryDream(commitInput(fixture));
  const headFile = path.join(
    fixture.ids.home,
    'daily-memory-dream',
    fixture.ids.companionLineageRef,
    fixture.ids.threadRef,
    'head.json'
  );
  const head = JSON.parse(fs.readFileSync(headFile, 'utf8'));
  head.dayIndex = 99;
  fs.writeFileSync(headFile, `${JSON.stringify(head, null, 2)}\n`, 'utf8');

  assert.throws(
    () => projectLivingJournalMemoryArchive({ ...fixture.ids }),
    (error) => error.code === 'LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID' && error.details.sourceCode === 'DREAM_RECEIPT_CORRUPT'
  );
});

// [VXG RealForever]
