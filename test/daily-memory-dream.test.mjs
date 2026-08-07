import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DAILY_MEMORY_DREAM_CONTRACT,
  DAILY_MEMORY_DREAM_MEMORY_OWNER,
  DAILY_MEMORY_DREAM_SAFETY_OWNER,
  DAILY_MEMORY_DREAM_MAIN_VEX_CONVERGENCE,
  commitDailyMemoryDream,
  recoverAbandonedDailyMemoryDreamWriter,
  loadDailyMemoryDreamState,
  projectDailyMemoryDream,
  sourceDescentForDailyStratum
} from '../src/core/daily-memory-dream.mjs';
import { createDailyMemoryDreamFixture } from '../scripts/daily-memory-dream.mjs';

function inputFor(fixture, overrides = {}) {
  const state = loadDailyMemoryDreamState(fixture.ids);
  return {
    ...fixture.ids,
    instanceRef: overrides.instanceRef ?? fixture.ids.instanceRef,
    restInvocationAuthorityRef: overrides.restInvocationAuthorityRef ?? 'authority.manual.g03.test',
    dayRef: overrides.dayRef ?? 'day.g03.000',
    dayIndex: overrides.dayIndex ?? 0,
    calendarDateRef: overrides.calendarDateRef ?? '2026-08-07',
    timeZoneRef: overrides.timeZoneRef ?? 'America/Los_Angeles',
    observedAt: overrides.observedAt ?? '2026-08-07T21:00:00.000Z',
    expectedConversationHeadSha256: overrides.expectedConversationHeadSha256 ?? fixture.g01.head.conversationHeadSha256,
    expectedScoreHeadSha256: overrides.expectedScoreHeadSha256 ?? fixture.score.head.scoreHeadSha256,
    expectedDailyDreamHeadSha256: Object.hasOwn(overrides, 'expectedDailyDreamHeadSha256') ? overrides.expectedDailyDreamHeadSha256 : (state.head?.dailyDreamHeadSha256 ?? null),
    faults: overrides.faults
  };
}

function cloneFixture(source, suffix) {
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-g03-test-${suffix}-`)), 'home');
  fs.cpSync(source.ids.home, target, { recursive: true });
  return { ids: { ...source.ids, home: target, instanceRef: `instance.g03.${suffix}` }, g01: structuredClone(source.g01), score: structuredClone(source.score), privateNeedles: source.privateNeedles };
}

function symlinkFileOrSkip(t, source, target) {
  try { fs.symlinkSync(source, target, 'file'); return true; }
  catch (error) { if (['EPERM','EACCES','ENOTSUP'].includes(error?.code)) { t.skip(`file symlink unavailable on this host: ${error.code}`); return false; } throw error; }
}

test('G03 binds the exact accepted Memory, Safety and Main Vex contracts', () => {
  assert.equal(DAILY_MEMORY_DREAM_CONTRACT, 'contract.multivex.g03.daily-memory-only-dream/v1');
  assert.equal(DAILY_MEMORY_DREAM_MEMORY_OWNER, 'github.issue.vextreme-sdk.225.comment.5222362637');
  assert.equal(DAILY_MEMORY_DREAM_SAFETY_OWNER, 'github.issue.vextreme-sdk.226.comment.5222369889');
  assert.equal(DAILY_MEMORY_DREAM_MAIN_VEX_CONVERGENCE, 'github.issue.vextreme-sdk.350.comment.5222375713');
});

test('memory-only Dream commits one exact active/held/open-loop reference frontier without raw G01 bodies', () => {
  const fixture = createDailyMemoryDreamFixture('unit-main');
  const result = commitDailyMemoryDream(inputFor(fixture));
  assert.equal(result.state, 'COMMITTED');
  assert.deepEqual(result.consolidation.carriedCurrentScoreBindings.map((item) => item.statementRef), ['statement.g03.active']);
  assert.deepEqual(result.consolidation.heldOrDeferredScoreBindings.map((item) => item.statementRef), ['statement.g03.held']);
  assert.deepEqual(result.consolidation.openLoopCarryForwardBindings.map((item) => item.openLoopRef), ['loop.g03.one']);
  const persisted = JSON.stringify(loadDailyMemoryDreamState(fixture.ids).currentDailyStratum);
  for (const needle of fixture.privateNeedles) assert.equal(persisted.includes(needle), false);
});

test('Dream preserves exact accepted Score semantic identities rather than reclassifying them', () => {
  const fixture = createDailyMemoryDreamFixture('unit-semantics');
  const before = fixture.score.statements.filter((item) => item.current).sort((a,b)=>a.statementRef.localeCompare(b.statementRef));
  const result = commitDailyMemoryDream(inputFor(fixture));
  const after = [...result.consolidation.carriedCurrentScoreBindings, ...result.consolidation.heldOrDeferredScoreBindings].sort((a,b)=>a.statementRef.localeCompare(b.statementRef));
  assert.equal(after.length, before.length);
  for (let i=0;i<before.length;i+=1) {
    for (const field of ['statementRef','semanticSubjectFingerprint','memoryRelation','acceptedForContinuity','consentState','semanticAuthorityHeadSha256','semanticAcceptanceRef','semanticAcceptanceSha256','consentDispositionRef','consentDispositionSha256','eventRef','eventHash']) {
      assert.equal(after[i][field], before[i][field], field);
    }
  }
  assert.equal(result.consolidation.newSemanticAcceptanceCreated, false);
});

test('pre-rest orientation precedes closure and binds exact current G01 + G02 heads', () => {
  const fixture = createDailyMemoryDreamFixture('unit-orientation');
  const result = commitDailyMemoryDream(inputFor(fixture));
  assert.equal(result.orientation.exactG01ConversationHeadSha256, fixture.g01.head.conversationHeadSha256);
  assert.equal(result.orientation.exactG02ScoreHeadSha256, fixture.score.head.scoreHeadSha256);
  assert.equal(result.preDream.orientationSha256, result.orientation.orientationSha256);
  assert.equal(result.closure.preDreamStateSha256, result.preDream.preDreamStateSha256);
  assert.equal(result.orientation.invocationMode, 'MANUAL_ONE_SHOT');
});

test('post-dream wake keeps runtime/model unchanged and all later effects false', () => {
  const fixture = createDailyMemoryDreamFixture('unit-holds');
  commitDailyMemoryDream(inputFor(fixture));
  const projection = projectDailyMemoryDream(fixture.ids);
  assert.equal(projection.selectedRuntimeRef, 'endpoint.g01.loopback');
  assert.equal(projection.selectedModelProfileRef, 'model.g01.bounded');
  assert.equal(projection.lineageAwareGenerativeDreamRan, false);
  assert.equal(projection.trainingRan, false);
  assert.equal(projection.modelWeightsChanged, false);
  assert.equal(projection.rhythmLearned, false);
  assert.equal(projection.synchronizationActivated, false);
  assert.equal(projection.publicationPerformed, false);
  assert.equal(projection.poweredDown, false);
  assert.equal(projection.firstPersonAuthorityGranted, false);
});

test('source descent binds the exact Daily Stratum back to G01 + G02 without raw content', () => {
  const fixture = createDailyMemoryDreamFixture('unit-descent');
  const result = commitDailyMemoryDream(inputFor(fixture));
  const descent = sourceDescentForDailyStratum(fixture.ids);
  assert.equal(descent.dailyStratumSha256, result.stratum.dailyStratumSha256);
  assert.equal(descent.sourceConversationHeadSha256, fixture.g01.head.conversationHeadSha256);
  assert.equal(descent.sourceScoreHeadSha256, fixture.score.head.scoreHeadSha256);
  assert.equal(descent.rawConversationContentIncluded, false);
  assert.equal(descent.newSemanticAcceptanceCreated, false);
  assert.equal(descent.firstPersonAuthorityGranted, false);
});

test('exact duplicate day replay is idempotent even when caller still carries the original null Dream head', () => {
  const fixture = createDailyMemoryDreamFixture('unit-idempotent');
  const firstInput = inputFor(fixture);
  const first = commitDailyMemoryDream(firstInput);
  const duplicate = commitDailyMemoryDream(firstInput);
  assert.equal(duplicate.state, 'IDEMPOTENT_REPLAY');
  assert.equal(duplicate.stratum.dailyStratumSha256, first.stratum.dailyStratumSha256);
});

test('same dayRef with changed day/source identity fails closed', () => {
  const fixture = createDailyMemoryDreamFixture('unit-day-conflict');
  const original = inputFor(fixture);
  commitDailyMemoryDream(original);
  assert.throws(() => commitDailyMemoryDream({ ...original, calendarDateRef: '2026-08-08' }), (error) => error.code === 'DREAM_DAY_CONFLICT');
  assert.throws(() => commitDailyMemoryDream({ ...original, observedAt: '2026-08-07T21:00:01.000Z' }), (error) => error.code === 'DREAM_DAY_CONFLICT');
  assert.throws(() => commitDailyMemoryDream({ ...original, restInvocationAuthorityRef: 'authority.manual.g03.changed' }), (error) => error.code === 'DREAM_DAY_CONFLICT');
  assert.throws(() => commitDailyMemoryDream({ ...original, expectedScoreHeadSha256: 'a'.repeat(64) }), (error) => error.code === 'DREAM_DAY_CONFLICT');
});

test('stale G01 or G02 source heads reject a new day before closure mutation', () => {
  const fixture = createDailyMemoryDreamFixture('unit-stale');
  const first = commitDailyMemoryDream(inputFor(fixture));
  const next = { dayRef:'day.g03.001',dayIndex:1,calendarDateRef:'2026-08-08',observedAt:'2026-08-08T21:00:00.000Z',expectedDailyDreamHeadSha256:first.head.dailyDreamHeadSha256 };
  assert.throws(() => commitDailyMemoryDream(inputFor(fixture,{...next,expectedConversationHeadSha256:'a'.repeat(64)})), (error) => error.code === 'DREAM_SOURCE_STALE');
  assert.throws(() => commitDailyMemoryDream(inputFor(fixture,{...next,expectedScoreHeadSha256:'b'.repeat(64)})), (error) => error.code === 'DREAM_SOURCE_STALE');
});

test('day identity is explicit and sequential; G03 does not infer a scheduler or wall-clock day', () => {
  const fixture = createDailyMemoryDreamFixture('unit-day');
  assert.throws(() => commitDailyMemoryDream(inputFor(fixture,{dayRef:'DAY BAD'})), (error) => error.code === 'DREAM_DAY_INVALID');
  assert.throws(() => commitDailyMemoryDream(inputFor(fixture,{dayIndex:4})), (error) => error.code === 'DREAM_DAY_INVALID');
  assert.throws(() => commitDailyMemoryDream(inputFor(fixture,{calendarDateRef:'08/07/2026'})), (error) => error.code === 'DREAM_DAY_INVALID');
});

test('crash tail remains uncommitted, abandoned writer recovery is explicit, and exact retry completes only the missing wake/head', () => {
  const source = createDailyMemoryDreamFixture('unit-crash-source');
  const first = commitDailyMemoryDream(inputFor(source));
  const fixture = cloneFixture(source,'unit-crash');
  const moduleUrl = pathToFileURL(path.resolve('src/core/daily-memory-dream.mjs')).href;
  const crashInput = inputFor(fixture,{instanceRef:'instance.g03.crash.child',dayRef:'day.g03.001',dayIndex:1,calendarDateRef:'2026-08-08',observedAt:'2026-08-08T22:00:00.000Z',expectedDailyDreamHeadSha256:first.head.dailyDreamHeadSha256,faults:{exitAfterStratumWrite:true}});
  const program = `import { commitDailyMemoryDream } from ${JSON.stringify(moduleUrl)}; commitDailyMemoryDream(${JSON.stringify(crashInput)});`;
  const child = spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:path.resolve('.'),encoding:'utf8'});
  assert.equal(child.status,93,child.stderr);
  const state = loadDailyMemoryDreamState(fixture.ids);
  assert.equal(state.head.dailyDreamHeadSha256, first.head.dailyDreamHeadSha256);
  assert.equal(state.chain.length,1);
  assert.equal(state.uncommittedTail.length,1);
  assert.equal(state.uncommittedTail[0].dayRef,'day.g03.001');
  assert.equal(state.writer.state,'ABSENT');
  const recovery = recoverAbandonedDailyMemoryDreamWriter({ ...fixture.ids, expectedAbandonedInstanceRef:'instance.g03.crash.child' });
  assert.equal(recovery.recovered,true);
  const completed = commitDailyMemoryDream({ ...crashInput, instanceRef:'instance.g03.crash.recovery', faults:{} });
  assert.equal(completed.state,'COMMITTED');
  const recovered = loadDailyMemoryDreamState(fixture.ids);
  assert.equal(recovered.chain.length,2);
  assert.equal(recovered.uncommittedTail.length,0);
  assert.equal(recovered.writer.state,'NONE');
});

test('immutable Daily Stratum final file cannot be a symlink alias outside Vex Home', (t) => {
  const fixture = createDailyMemoryDreamFixture('unit-symlink-stratum');
  const result = commitDailyMemoryDream(inputFor(fixture));
  const file = path.join(fixture.ids.home,'daily-memory-dream',fixture.ids.companionLineageRef,fixture.ids.threadRef,'strata',`${result.stratum.dailyStratumSha256}.json`);
  const external = path.join(path.dirname(fixture.ids.home),'external-stratum.json');
  fs.copyFileSync(file,external); fs.unlinkSync(file); if (!symlinkFileOrSkip(t,external,file)) return;
  assert.throws(() => loadDailyMemoryDreamState(fixture.ids), (error) => ['DREAM_RECEIPT_CORRUPT','DREAM_HOME_IDENTITY_MISMATCH'].includes(error.code));
});

test('immutable wake final file cannot be a symlink alias outside Vex Home', (t) => {
  const fixture = createDailyMemoryDreamFixture('unit-symlink-wake');
  const result = commitDailyMemoryDream(inputFor(fixture));
  const file = path.join(fixture.ids.home,'daily-memory-dream',fixture.ids.companionLineageRef,fixture.ids.threadRef,'wakes',`${result.wake.wakeReceiptSha256}.json`);
  const external = path.join(path.dirname(fixture.ids.home),'external-wake.json');
  fs.copyFileSync(file,external); fs.unlinkSync(file); if (!symlinkFileOrSkip(t,external,file)) return;
  assert.throws(() => loadDailyMemoryDreamState(fixture.ids), (error) => ['DREAM_RECEIPT_CORRUPT','DREAM_HOME_IDENTITY_MISMATCH'].includes(error.code));
});

test('fresh process replay revalidates committed stratum and wake identity', () => {
  const fixture = createDailyMemoryDreamFixture('unit-fresh');
  const result = commitDailyMemoryDream(inputFor(fixture));
  const moduleUrl = pathToFileURL(path.resolve('src/core/daily-memory-dream.mjs')).href;
  const program = `import { loadDailyMemoryDreamState, projectDailyMemoryDream } from ${JSON.stringify(moduleUrl)}; const i=${JSON.stringify(fixture.ids)}; const s=loadDailyMemoryDreamState(i); const p=projectDailyMemoryDream(i); process.stdout.write(JSON.stringify({head:s.head.dailyDreamHeadSha256,stratum:p.currentDailyStratumSha256,model:p.selectedModelProfileRef}));`;
  const child = spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:path.resolve('.'),encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  const observed = JSON.parse(child.stdout);
  assert.equal(observed.head,result.head.dailyDreamHeadSha256);
  assert.equal(observed.stratum,result.stratum.dailyStratumSha256);
  assert.equal(observed.model,'model.g01.bounded');
});

test('projection contains no autonomous scheduler, sync, training, power or publication activation', () => {
  const fixture = createDailyMemoryDreamFixture('unit-boundary');
  commitDailyMemoryDream(inputFor(fixture));
  const projection = projectDailyMemoryDream(fixture.ids);
  assert.equal(projection.trainingRan,false);
  assert.equal(projection.modelWeightsChanged,false);
  assert.equal(projection.synchronizationActivated,false);
  assert.equal(projection.poweredDown,false);
  assert.equal(projection.publicationPerformed,false);
  assert.equal(projection.lineageAwareGenerativeDreamRan,false);
});

// [VXG RealForever]
