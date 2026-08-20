import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_LIVING_JOURNAL_ARCHIVE_API_PATH,
  BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_DAYS,
  BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_PAGES,
  BROWSER_LIVING_JOURNAL_MEMORY_API_PATH,
  BROWSER_LIVING_JOURNAL_MEMORY_MAX_PAGES,
  BrowserLivingJournalMemoryBridgeError,
  browserLivingJournalMemoryFailurePayload,
  createBrowserLivingJournalMemoryBridge,
  validateBrowserLivingJournalArchiveRequest,
  validateBrowserLivingJournalMemoryIdentity,
  validateBrowserLivingJournalMemoryRequest
} from '../src/core/browser-living-journal-memory-bridge.mjs';
import { projectLivingJournalMemory } from '../src/core/living-journal-memory-projection.mjs';
import { projectLivingJournalMemoryArchive } from '../src/core/living-journal-memory-archive.mjs';
import {
  commitDailyMemoryDream,
  loadDailyMemoryDreamState
} from '../src/core/daily-memory-dream.mjs';
import { loadScoreContextState } from '../src/core/score-context-continuity.mjs';
import { createDailyMemoryDreamFixture } from '../scripts/daily-memory-dream.mjs';

function identityFor(fixture) {
  return {
    home: fixture.ids.home,
    homeRef: fixture.ids.homeRef,
    deviceRef: fixture.ids.deviceRef,
    companionLineageRef: fixture.ids.companionLineageRef
  };
}

function commitInput(fixture, overrides = {}) {
  const state = loadDailyMemoryDreamState(fixture.ids);
  return {
    ...fixture.ids,
    instanceRef: overrides.instanceRef ?? fixture.ids.instanceRef,
    restInvocationAuthorityRef: overrides.restInvocationAuthorityRef ?? 'authority.manual.browser-living-journal-memory.test',
    dayRef: overrides.dayRef ?? 'day.browser-living-journal-memory.000',
    dayIndex: overrides.dayIndex ?? 0,
    calendarDateRef: overrides.calendarDateRef ?? '2026-08-17',
    timeZoneRef: overrides.timeZoneRef ?? 'America/Los_Angeles',
    observedAt: overrides.observedAt ?? '2026-08-18T04:00:00.000Z',
    expectedConversationHeadSha256: overrides.expectedConversationHeadSha256 ?? fixture.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: overrides.expectedScoreHeadSha256 ?? fixture.score.head.scoreHeadSha256,
    expectedDailyDreamHeadSha256: Object.hasOwn(overrides, 'expectedDailyDreamHeadSha256')
      ? overrides.expectedDailyDreamHeadSha256
      : (state.head?.dailyDreamHeadSha256 ?? null)
  };
}

function expectBridgeCode(fn, code) {
  assert.throws(fn, (error) => error instanceof BrowserLivingJournalMemoryBridgeError && error.code === code);
}

test('Browser Living Journal Memory bridge exposes one bounded API contract and rejects browser authority injection', () => {
  const fixture = createDailyMemoryDreamFixture('browser-lj-bridge-boundary');
  const identity = identityFor(fixture);
  assert.equal(BROWSER_LIVING_JOURNAL_MEMORY_API_PATH, '/api/v1/living-journal/memory');
  assert.equal(BROWSER_LIVING_JOURNAL_MEMORY_MAX_PAGES, 24);
  assert.deepEqual(validateBrowserLivingJournalMemoryIdentity(identity), identity);
  assert.deepEqual(
    validateBrowserLivingJournalMemoryRequest({ threadRef: fixture.ids.threadRef }),
    { threadRef: fixture.ids.threadRef, maxPages: 24 }
  );
  assert.deepEqual(
    validateBrowserLivingJournalMemoryRequest({ threadRef: fixture.ids.threadRef, maxPages: 8 }),
    { threadRef: fixture.ids.threadRef, maxPages: 8 }
  );

  for (const injected of [
    { home: fixture.ids.home },
    { homeRef: fixture.ids.homeRef },
    { deviceRef: fixture.ids.deviceRef },
    { companionLineageRef: fixture.ids.companionLineageRef },
    { endpoint: 'http://127.0.0.1:43210' },
    { model: 'model.local' },
    { authorization: 'secret' },
    { semanticAcceptanceRef: 'acceptance.injected' },
    { rawSourceText: 'private source' }
  ]) {
    expectBridgeCode(
      () => validateBrowserLivingJournalMemoryRequest({ threadRef: fixture.ids.threadRef, ...injected }),
      'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED'
    );
  }

  for (const invalid of [
    { threadRef: '../bad' },
    { threadRef: 'thread.valid', maxPages: 0 },
    { threadRef: 'thread.valid', maxPages: 25 },
    { threadRef: 'thread.valid', maxPages: 1.5 }
  ]) {
    expectBridgeCode(
      () => validateBrowserLivingJournalMemoryRequest(invalid),
      'LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED'
    );
  }

  expectBridgeCode(
    () => validateBrowserLivingJournalMemoryIdentity({ ...identity, threadRef: fixture.ids.threadRef }),
    'LIVING_JOURNAL_MEMORY_IDENTITY_INVALID'
  );
});

test('Browser Living Journal Memory bridge returns the exact current #131 projection without read effects or raw source bodies', () => {
  const fixture = createDailyMemoryDreamFixture('browser-lj-bridge-current');
  commitDailyMemoryDream(commitInput(fixture));
  const scoreBefore = loadScoreContextState(fixture.ids);
  const dreamBefore = loadDailyMemoryDreamState(fixture.ids);
  const bridge = createBrowserLivingJournalMemoryBridge({ identity: identityFor(fixture) });

  const result = bridge.read({ threadRef: fixture.ids.threadRef, maxPages: 8 });
  const canonical = projectLivingJournalMemory({ ...fixture.ids, maxPages: 8 });

  assert.deepEqual(result, canonical);
  assert.equal(result.state, 'CURRENT');
  assert.equal(result.currentness, 'CURRENT');
  assert.equal(result.truthClass, 'CURRENT_MEMORY_REFERENCE');
  assert.equal(result.rawConversationContentIncluded, false);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pages[0].summary, 'Accepted active continuity.');
  assert.equal(result.pages[0].summaryHash, scoreBefore.statements.find((item) => item.statementRef === result.pages[0].statementRef)?.summaryHash);
  assert.equal(result.pages[0].sourceConversationHeadSha256, fixture.g01.head.conversationHeadSha256);
  assert.equal(result.pages[0].sourceScoreHeadSha256, fixture.score.head.scoreHeadSha256);
  assert.equal(result.pages[0].sourceDescent.rawSourceContentIncluded, false);
  assert.deepEqual(result.effects, {
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

  const serialized = JSON.stringify(result);
  for (const privateNeedle of fixture.privateNeedles) assert.equal(serialized.includes(privateNeedle), false);

  const scoreAfter = loadScoreContextState(fixture.ids);
  const dreamAfter = loadDailyMemoryDreamState(fixture.ids);
  assert.equal(scoreAfter.head.scoreHeadSha256, scoreBefore.head.scoreHeadSha256);
  assert.equal(dreamAfter.head.dailyDreamHeadSha256, dreamBefore.head.dailyDreamHeadSha256);
  assert.equal(scoreAfter.chain.length, scoreBefore.chain.length);
  assert.equal(dreamAfter.chain.length, dreamBefore.chain.length);
});

test('Browser Living Journal Memory bridge preserves held #131 truth instead of promoting it to current', () => {
  const fixture = createDailyMemoryDreamFixture('browser-lj-bridge-held');
  const bridge = createBrowserLivingJournalMemoryBridge({ identity: identityFor(fixture) });

  const result = bridge.read({ threadRef: fixture.ids.threadRef, maxPages: 4 });
  const canonical = projectLivingJournalMemory({ ...fixture.ids, maxPages: 4 });

  assert.deepEqual(result, canonical);
  assert.equal(result.state, 'HELD');
  assert.equal(result.currentness, 'HELD');
  assert.equal(result.truthClass, 'MEMORY_REFERENCE_HELD');
  assert.equal(result.realMemoryLoaded, false);
  assert.equal(result.realJournalBodyLoaded, false);
  assert.deepEqual(result.pages, []);
  assert.deepEqual(result.reasons, ['NO_COMMITTED_DAILY_MEMORY']);
  assert.equal(result.rawConversationContentIncluded, false);
  assert.equal(result.effects.homeMutated, false);
  assert.equal(result.effects.memoryMutated, false);
});

test('Browser Living Journal Memory bridge maps source failures to content-safe public failures', () => {
  const privateHome = ['', 'Users', 'private', 'VexHome'].join('/');
  const sourceError = new Error(`private human source ${privateHome}`);
  sourceError.code = 'LIVING_JOURNAL_MEMORY_SOURCE_INVALID';
  const sourcePayload = browserLivingJournalMemoryFailurePayload(sourceError);
  assert.deepEqual(sourcePayload, {
    schemaVersion: 'vexlife.browser-living-journal-memory-failure/v1',
    state: 'FAILED',
    truthClass: 'CURRENT_LOCAL_MEMORY_FAILURE',
    failureCode: 'LIVING_JOURNAL_MEMORY_SOURCE_INVALID',
    message: 'Living Journal Memory source state is unavailable or inconsistent'
  });
  assert.equal(JSON.stringify(sourcePayload).includes('private human source'), false);
  assert.equal(JSON.stringify(sourcePayload).includes(privateHome), false);

  const unknownPayload = browserLivingJournalMemoryFailurePayload(new Error('internal secret detail'));
  assert.equal(unknownPayload.failureCode, 'LIVING_JOURNAL_MEMORY_READ_FAILED');
  assert.equal(unknownPayload.message, 'Living Journal Memory read failed safely');
  assert.equal(JSON.stringify(unknownPayload).includes('internal secret detail'), false);
});

test('Browser Living Journal archive bridge admits only bounded historical read fields and returns the exact accepted archive projection', () => {
  const fixture=createDailyMemoryDreamFixture('browser-lj-archive-bridge');const identity=identityFor(fixture);const committed=commitDailyMemoryDream(commitInput(fixture));const bridge=createBrowserLivingJournalMemoryBridge({identity});
  assert.equal(BROWSER_LIVING_JOURNAL_ARCHIVE_API_PATH,'/api/v1/living-journal/archive');assert.equal(BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_DAYS,30);assert.equal(BROWSER_LIVING_JOURNAL_ARCHIVE_MAX_PAGES,24);
  assert.deepEqual(validateBrowserLivingJournalArchiveRequest({threadRef:fixture.ids.threadRef,maxDays:7,dayOffset:0,maxPages:8,selectedDailyStratumSha256:committed.stratum.dailyStratumSha256}),{threadRef:fixture.ids.threadRef,maxDays:7,dayOffset:0,maxPages:8,selectedDayRef:null,selectedDailyStratumSha256:committed.stratum.dailyStratumSha256});
  for(const injected of [{home:fixture.ids.home},{deviceRef:fixture.ids.deviceRef},{model:'model.injected'},{rawSourceText:'private'}])expectBridgeCode(()=>validateBrowserLivingJournalArchiveRequest({threadRef:fixture.ids.threadRef,...injected}),'LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED');
  const result=bridge.readArchive({threadRef:fixture.ids.threadRef,maxDays:7,maxPages:8,selectedDailyStratumSha256:committed.stratum.dailyStratumSha256});const canonical=projectLivingJournalMemoryArchive({...fixture.ids,maxDays:7,maxPages:8,selectedDailyStratumSha256:committed.stratum.dailyStratumSha256});assert.deepEqual(result,canonical);assert.equal(result.selectedDay.temporalTruthClass,'COMMITTED_MEMORY_AT_DAY');assert.equal(result.selectedDay.currentNowEvaluated,false);assert.equal(result.rawConversationContentIncluded,false);
});

// [VXG RealForever]
