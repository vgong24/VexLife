import { semanticHash } from './utils.mjs';
import {
  loadScoreContextState,
  sourceDescentForStatement
} from './score-context-continuity.mjs';
import {
  projectDailyMemoryDream,
  sourceDescentForDailyStratum
} from './daily-memory-dream.mjs';

export const LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA = 'vexlife.living-journal.memory-projection/v1';
export const LIVING_JOURNAL_MEMORY_TRUTH_CLASS = 'CURRENT_MEMORY_REFERENCE';
export const LIVING_JOURNAL_MEMORY_OWNER = 'github.issue.vextreme-sdk.225';
export const LIVING_JOURNAL_DAILY_RECORD_OWNER = 'github.issue.vextreme-sdk.416';

const POSITIVE_CONSENT = new Set(['PERMITTED', 'NARROWED']);
const EFFECTS = Object.freeze({
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

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function sourceInput(input) {
  return {
    home: input.home,
    homeRef: input.homeRef,
    deviceRef: input.deviceRef,
    companionLineageRef: input.companionLineageRef,
    threadRef: input.threadRef
  };
}

function boundedLimit(value) {
  const limit = value ?? 24;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    fail('LIVING_JOURNAL_MEMORY_INPUT_INVALID', 'maxPages must be an integer from 1 through 100', { maxPages: value });
  }
  return limit;
}

function held(source, reasons, details = {}) {
  return Object.freeze({
    schemaVersion: LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA,
    state: 'HELD',
    currentness: 'HELD',
    truthClass: 'MEMORY_REFERENCE_HELD',
    realMemoryLoaded: false,
    realJournalBodyLoaded: false,
    rawConversationContentIncluded: false,
    pages: [],
    heldOrDeferredStatementRefs: [...(source?.heldOrDeferredStatementRefs ?? [])],
    boundedOutStatementRefs: [],
    reasons: [...new Set(reasons)].sort(),
    details: structuredClone(details),
    effects: { ...EFFECTS }
  });
}

function currentAuthorityContains(score, statement) {
  return Boolean(score.currentSemanticAuthorityHead?.currentAcceptanceBindings?.some((binding) =>
    binding.acceptanceRef === statement.semanticAcceptanceRef &&
    binding.acceptanceSha256 === statement.semanticAcceptanceSha256
  ));
}

function pageRef(daily, statementRef) {
  return `page.living-journal.memory.${semanticHash({
    dailyStratumSha256: daily.currentDailyStratumSha256,
    statementRef
  }).slice(0, 32)}`;
}

/**
 * Read-only bridge from accepted G03 daily Memory selection + accepted G02
 * continuity summaries into bounded Living Journal page packets.
 *
 * This function does not read raw G01 conversation bodies into its projection,
 * does not create semantic acceptance, and performs no Home/Memory mutation.
 */
export function projectLivingJournalMemory(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('LIVING_JOURNAL_MEMORY_INPUT_INVALID', 'input must be an object');
  }
  const maxPages = boundedLimit(input.maxPages);
  const ownerInput = sourceInput(input);
  const daily = projectDailyMemoryDream(ownerInput);

  if (daily.currentness !== 'CURRENT' || daily.attention.length > 0) {
    return held(daily, ['DAILY_MEMORY_ATTENTION'], {
      dailyState: daily.state,
      dailyCurrentness: daily.currentness,
      attention: daily.attention
    });
  }
  if (!daily.currentDailyStratumRef || !daily.currentDailyStratumSha256) {
    return held(daily, ['NO_COMMITTED_DAILY_MEMORY'], {
      dailyState: daily.state,
      dailyCurrentness: daily.currentness
    });
  }

  const score = loadScoreContextState(ownerInput);
  if (score.currentness !== 'CURRENT' || score.attention.length > 0 || !score.head || !score.currentSemanticAuthorityHead) {
    return held(daily, ['SCORE_MEMORY_ATTENTION'], {
      scoreState: score.state,
      scoreCurrentness: score.currentness,
      attention: score.attention,
      scoreHeadPresent: Boolean(score.head),
      semanticAuthorityHeadPresent: Boolean(score.currentSemanticAuthorityHead)
    });
  }

  const dailySource = sourceDescentForDailyStratum(ownerInput, daily.currentDailyStratumSha256);
  if (
    dailySource.sourceScoreHeadSha256 !== score.head.scoreHeadSha256 ||
    dailySource.sourceSemanticAuthorityHeadSha256 !== score.currentSemanticAuthorityHead.semanticAuthorityHeadSha256
  ) {
    return held(daily, ['DAILY_MEMORY_SOURCE_FRONTIER_STALE'], {
      dailySourceScoreHeadSha256: dailySource.sourceScoreHeadSha256,
      currentScoreHeadSha256: score.head.scoreHeadSha256,
      dailySourceSemanticAuthorityHeadSha256: dailySource.sourceSemanticAuthorityHeadSha256,
      currentSemanticAuthorityHeadSha256: score.currentSemanticAuthorityHead.semanticAuthorityHeadSha256
    });
  }
  if (dailySource.rawConversationContentIncluded !== false) {
    fail('LIVING_JOURNAL_MEMORY_SOURCE_INVALID', 'Daily Memory source descent unexpectedly includes raw conversation content');
  }

  const statements = new Map(score.statements.map((statement) => [statement.statementRef, statement]));
  const activeRefs = [...daily.activeContinuityStatementRefs];
  const selectedRefs = activeRefs.slice(0, maxPages);
  const boundedOutStatementRefs = activeRefs.slice(maxPages);
  const stagedPages = [];

  for (const [index, statementRef] of selectedRefs.entries()) {
    const statement = statements.get(statementRef);
    if (!statement) {
      fail('LIVING_JOURNAL_MEMORY_SOURCE_INVALID', 'Daily Memory active statement is absent from current Score replay', { statementRef });
    }
    if (
      statement.current !== true ||
      statement.acceptedForContinuity !== true ||
      !POSITIVE_CONSENT.has(statement.consentState) ||
      !currentAuthorityContains(score, statement)
    ) {
      fail('LIVING_JOURNAL_MEMORY_SOURCE_INVALID', 'Daily Memory active statement is not current and admitted for new continuity use', {
        statementRef,
        current: statement.current,
        acceptedForContinuity: statement.acceptedForContinuity,
        consentState: statement.consentState
      });
    }
    if (
      typeof statement.summary !== 'string' || statement.summary.length === 0 ||
      typeof statement.summaryHash !== 'string' || statement.summaryHash.length === 0 ||
      typeof statement.recordedStatementState !== 'string' || statement.recordedStatementState.length === 0 ||
      typeof statement.effectiveState !== 'string' || statement.effectiveState.length === 0
    ) {
      fail('LIVING_JOURNAL_MEMORY_SOURCE_INVALID', 'accepted Score statement is missing its canonical readable summary/state identity', { statementRef });
    }

    const descent = sourceDescentForStatement(score, statementRef);
    if (descent.rawSourceContentIncluded !== false) {
      fail('LIVING_JOURNAL_MEMORY_SOURCE_INVALID', 'Score source descent unexpectedly includes raw source content', { statementRef });
    }
    if (descent.observedCurrentConversationHeadSha256 !== dailySource.sourceConversationHeadSha256) {
      return held(daily, ['DAILY_MEMORY_SOURCE_FRONTIER_STALE'], {
        statementRef,
        dailySourceConversationHeadSha256: dailySource.sourceConversationHeadSha256,
        observedCurrentConversationHeadSha256: descent.observedCurrentConversationHeadSha256
      });
    }

    stagedPages.push(Object.freeze({
      pageRef: pageRef(daily, statementRef),
      pageIndex: index,
      statementRef,
      summary: statement.summary,
      summaryHash: statement.summaryHash,
      memoryRelation: statement.memoryRelation,
      recordedStatementState: statement.recordedStatementState,
      effectiveState: statement.effectiveState,
      current: statement.current,
      acceptedForContinuity: statement.acceptedForContinuity,
      consentState: statement.consentState,
      semanticSubjectFingerprint: statement.semanticSubjectFingerprint,
      semanticAcceptanceRef: statement.semanticAcceptanceRef,
      semanticAcceptanceSha256: statement.semanticAcceptanceSha256,
      semanticAuthorityHeadSha256: statement.semanticAuthorityHeadSha256,
      currentDailyStratumRef: daily.currentDailyStratumRef,
      currentDailyStratumSha256: daily.currentDailyStratumSha256,
      dayRef: daily.dayRef,
      dayIndex: daily.dayIndex,
      sourceConversationHeadSha256: dailySource.sourceConversationHeadSha256,
      sourceScoreHeadSha256: dailySource.sourceScoreHeadSha256,
      sourceSemanticAuthorityHeadSha256: dailySource.sourceSemanticAuthorityHeadSha256,
      sourceBindings: structuredClone(statement.sourceBindings),
      sourceDescent: structuredClone(descent),
      rawSourceContentIncluded: false,
      firstPersonAuthorityGranted: false
    }));
  }

  return Object.freeze({
    schemaVersion: LIVING_JOURNAL_MEMORY_PROJECTION_SCHEMA,
    state: 'CURRENT',
    currentness: 'CURRENT',
    truthClass: LIVING_JOURNAL_MEMORY_TRUTH_CLASS,
    realMemoryLoaded: true,
    realJournalBodyLoaded: stagedPages.length > 0,
    rawConversationContentIncluded: false,
    sourceOwnerRefs: [LIVING_JOURNAL_MEMORY_OWNER, LIVING_JOURNAL_DAILY_RECORD_OWNER],
    daily: Object.freeze({
      currentDailyStratumRef: daily.currentDailyStratumRef,
      currentDailyStratumSha256: daily.currentDailyStratumSha256,
      dayRef: daily.dayRef,
      dayIndex: daily.dayIndex,
      sourceConversationHeadSha256: dailySource.sourceConversationHeadSha256,
      sourceScoreHeadSha256: dailySource.sourceScoreHeadSha256,
      sourceSemanticAuthorityHeadSha256: dailySource.sourceSemanticAuthorityHeadSha256,
      sourceDescent: structuredClone(dailySource)
    }),
    pageCount: stagedPages.length,
    maxPages,
    pages: stagedPages,
    heldOrDeferredStatementRefs: [...daily.heldOrDeferredStatementRefs],
    boundedOutStatementRefs,
    reasons: [],
    effects: { ...EFFECTS }
  });
}

// [VXG RealForever]
