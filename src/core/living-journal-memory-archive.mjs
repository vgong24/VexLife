import { semanticHash } from './utils.mjs';
import {
  loadDailyMemoryDreamState,
  sourceDescentForDailyStratum
} from './daily-memory-dream.mjs';
import { verifyHistoricalScoreContextSnapshot } from './score-context-continuity.mjs';

export const LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA = 'vexlife.living-journal.memory-archive/v1';
export const LIVING_JOURNAL_MEMORY_ARCHIVE_OWNER = 'github.issue.vexlife.151';

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

function ownerInput(input) {
  return {
    home: input.home,
    homeRef: input.homeRef,
    deviceRef: input.deviceRef,
    companionLineageRef: input.companionLineageRef,
    threadRef: input.threadRef
  };
}

function boundedInteger(value, { label, fallback, minimum, maximum }) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', `${label} must be an integer from ${minimum} through ${maximum}`, {
      [label]: value
    });
  }
  return resolved;
}

function archiveState(input) {
  try {
    return loadDailyMemoryDreamState(ownerInput(input));
  } catch (error) {
    fail('LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID', 'Committed Daily Memory lineage could not be verified', {
      sourceCode: error?.code ?? 'UNKNOWN'
    });
  }
}

function archiveDayRef(stratum) {
  return `archive-day.living-journal.${semanticHash({
    dayRef: stratum.dayRef,
    dayIndex: stratum.dayIndex,
    calendarDateRef: stratum.calendarDateRef,
    dailyStratumSha256: stratum.dailyStratumSha256
  }).slice(0, 32)}`;
}

function pageRef(stratum, statementRef) {
  return `page.living-journal.archive.${semanticHash({
    dailyStratumSha256: stratum.dailyStratumSha256,
    statementRef
  }).slice(0, 32)}`;
}

function authorityContains(snapshot, statement) {
  return Boolean(snapshot.semanticAuthorityHead?.currentAcceptanceBindings?.some((binding) =>
    binding.acceptanceRef === statement.semanticAcceptanceRef &&
    binding.acceptanceSha256 === statement.semanticAcceptanceSha256
  ));
}

function dayEntry(stratum, currentDailyStratumSha256) {
  return Object.freeze({
    archiveDayRef: archiveDayRef(stratum),
    dayRef: stratum.dayRef,
    dayIndex: stratum.dayIndex,
    calendarDateRef: stratum.calendarDateRef,
    timeZoneRef: stratum.timeZoneRef,
    dailyStratumRef: stratum.dailyStratumRef,
    dailyStratumSha256: stratum.dailyStratumSha256,
    sourceConversationHeadSha256: stratum.sourceConversationHeadSha256,
    sourceScoreHeadSha256: stratum.sourceScoreHeadSha256,
    sourceSemanticAuthorityHeadSha256: stratum.sourceSemanticAuthorityHeadSha256,
    temporalClass: stratum.dailyStratumSha256 === currentDailyStratumSha256 ? 'CURRENT_DAY' : 'HISTORICAL_AT_DAY'
  });
}

function selectDay(chain, input) {
  const selectors = [
    Object.hasOwn(input, 'selectedDayRef') && input.selectedDayRef !== undefined,
    Object.hasOwn(input, 'selectedDayIndex') && input.selectedDayIndex !== undefined,
    Object.hasOwn(input, 'selectedDailyStratumSha256') && input.selectedDailyStratumSha256 !== undefined
  ].filter(Boolean).length;
  if (selectors > 1) {
    fail('LIVING_JOURNAL_ARCHIVE_SELECTION_AMBIGUOUS', 'Select one historical day by dayRef, dayIndex, or dailyStratumSha256, not several');
  }
  if (chain.length === 0) return null;
  if (selectors === 0) return chain.at(-1);

  let selected = null;
  if (input.selectedDayRef !== undefined) {
    if (typeof input.selectedDayRef !== 'string' || input.selectedDayRef.length === 0) {
      fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', 'selectedDayRef must be a non-empty canonical ref');
    }
    selected = chain.find((item) => item.dayRef === input.selectedDayRef) ?? null;
  } else if (input.selectedDayIndex !== undefined) {
    if (!Number.isInteger(input.selectedDayIndex) || input.selectedDayIndex < 0) {
      fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', 'selectedDayIndex must be a non-negative integer');
    }
    selected = chain.find((item) => item.dayIndex === input.selectedDayIndex) ?? null;
  } else {
    if (typeof input.selectedDailyStratumSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(input.selectedDailyStratumSha256)) {
      fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', 'selectedDailyStratumSha256 must be a lowercase SHA-256');
    }
    selected = chain.find((item) => item.dailyStratumSha256 === input.selectedDailyStratumSha256) ?? null;
  }
  if (!selected) {
    fail('LIVING_JOURNAL_ARCHIVE_SELECTION_NOT_FOUND', 'Selected day is not in the committed Daily Memory lineage');
  }
  return selected;
}

function verifiedSelection(input, stratum, currentDailyStratumSha256, maxPages) {
  let dailySource;
  let snapshot;
  try {
    dailySource = sourceDescentForDailyStratum(ownerInput(input), stratum.dailyStratumSha256);
    snapshot = verifyHistoricalScoreContextSnapshot({
      ...ownerInput(input),
      scoreHeadSha256: stratum.sourceScoreHeadSha256,
      semanticAuthorityHeadSha256: stratum.sourceSemanticAuthorityHeadSha256
    });
  } catch (error) {
    fail('LIVING_JOURNAL_ARCHIVE_HISTORICAL_VERIFICATION_FAILED', 'Selected committed day failed historical source verification', {
      dayRef: stratum.dayRef,
      dailyStratumSha256: stratum.dailyStratumSha256,
      sourceCode: error?.code ?? 'UNKNOWN'
    });
  }

  if (
    dailySource.dailyStratumSha256 !== stratum.dailyStratumSha256 ||
    dailySource.sourceConversationHeadSha256 !== stratum.sourceConversationHeadSha256 ||
    dailySource.sourceScoreHeadSha256 !== stratum.sourceScoreHeadSha256 ||
    dailySource.sourceSemanticAuthorityHeadSha256 !== stratum.sourceSemanticAuthorityHeadSha256 ||
    dailySource.rawConversationContentIncluded !== false ||
    snapshot.rawConversationContentIncluded !== false ||
    snapshot.scoreHead.scoreHeadSha256 !== stratum.sourceScoreHeadSha256 ||
    snapshot.semanticAuthorityHead.semanticAuthorityHeadSha256 !== stratum.sourceSemanticAuthorityHeadSha256
  ) {
    fail('LIVING_JOURNAL_ARCHIVE_HISTORICAL_VERIFICATION_FAILED', 'Selected committed day differs from exact historical source-owned verification', {
      dayRef: stratum.dayRef,
      dailyStratumSha256: stratum.dailyStratumSha256
    });
  }

  const historicalStatements = snapshot.statements
    .filter((item) => item.current === true)
    .sort((left, right) => left.statementRef.localeCompare(right.statementRef));
  const active = historicalStatements.filter((statement) =>
    statement.acceptedForContinuity === true &&
    POSITIVE_CONSENT.has(statement.consentState) &&
    authorityContains(snapshot, statement)
  );
  const held = historicalStatements.filter((statement) => !active.includes(statement));
  const selectedStatements = active.slice(0, maxPages);
  const boundedOutStatementRefs = active.slice(maxPages).map((item) => item.statementRef);

  const temporalClass = stratum.dailyStratumSha256 === currentDailyStratumSha256 ? 'CURRENT_DAY' : 'HISTORICAL_AT_DAY';
  const pages = selectedStatements.map((statement, index) => Object.freeze({
    pageRef: pageRef(stratum, statement.statementRef),
    pageIndex: index,
    temporalClass,
    statementRef: statement.statementRef,
    summary: statement.summary,
    summaryHash: statement.summaryHash,
    memoryRelation: statement.memoryRelation,
    recordedStatementState: statement.recordedStatementState,
    effectiveState: statement.effectiveState,
    acceptedForContinuity: statement.acceptedForContinuity,
    consentState: statement.consentState,
    semanticSubjectFingerprint: statement.semanticSubjectFingerprint,
    semanticAcceptanceRef: statement.semanticAcceptanceRef,
    semanticAcceptanceSha256: statement.semanticAcceptanceSha256,
    semanticAuthorityHeadSha256: statement.semanticAuthorityHeadSha256,
    sourceBindings: structuredClone(statement.sourceBindings),
    dayRef: stratum.dayRef,
    dayIndex: stratum.dayIndex,
    calendarDateRef: stratum.calendarDateRef,
    dailyStratumRef: stratum.dailyStratumRef,
    dailyStratumSha256: stratum.dailyStratumSha256,
    sourceConversationHeadSha256: stratum.sourceConversationHeadSha256,
    sourceScoreHeadSha256: stratum.sourceScoreHeadSha256,
    sourceSemanticAuthorityHeadSha256: stratum.sourceSemanticAuthorityHeadSha256,
    rawSourceContentIncluded: false,
    firstPersonAuthorityGranted: false
  }));

  return Object.freeze({
    archiveDayRef: archiveDayRef(stratum),
    temporalClass,
    truthClass: temporalClass === 'CURRENT_DAY' ? 'CURRENT_MEMORY_REFERENCE' : 'HISTORICAL_MEMORY_REFERENCE',
    dayRef: stratum.dayRef,
    dayIndex: stratum.dayIndex,
    calendarDateRef: stratum.calendarDateRef,
    timeZoneRef: stratum.timeZoneRef,
    dailyStratumRef: stratum.dailyStratumRef,
    dailyStratumSha256: stratum.dailyStratumSha256,
    sourceConversationHeadSha256: stratum.sourceConversationHeadSha256,
    sourceScoreHeadSha256: stratum.sourceScoreHeadSha256,
    sourceSemanticAuthorityHeadSha256: stratum.sourceSemanticAuthorityHeadSha256,
    historicalSourceVerificationState: dailySource.historicalSourceVerificationState,
    sourceDescent: structuredClone(dailySource),
    pageCount: pages.length,
    maxPages,
    pages,
    heldOrDeferredStatementRefs: held.map((item) => item.statementRef),
    boundedOutStatementRefs,
    rawConversationContentIncluded: false
  });
}

/**
 * Read-only archive projection over the accepted committed G03 Daily Memory
 * lineage. The index is bounded/windowed, historical selection is source-verified,
 * and readable bodies are accepted G02 summaries only.
 */
export function projectLivingJournalMemoryArchive(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', 'input must be an object');
  }
  const maxDays = boundedInteger(input.maxDays, {
    label: 'maxDays', fallback: 14, minimum: 1, maximum: 90
  });
  const indexOffset = boundedInteger(input.indexOffset, {
    label: 'indexOffset', fallback: 0, minimum: 0, maximum: 1_000_000
  });
  const maxPages = boundedInteger(input.maxPages, {
    label: 'maxPages', fallback: 24, minimum: 1, maximum: 100
  });

  const state = archiveState(input);
  if (state.currentness !== 'CURRENT' || state.attention.length > 0) {
    fail('LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID', 'Committed Daily Memory lineage is not current and clean', {
      state: state.state,
      currentness: state.currentness,
      attentionCodes: state.attention.map((item) => item.code ?? item.reason ?? 'UNKNOWN')
    });
  }

  const currentDailyStratumSha256 = state.head?.dailyStratumSha256 ?? null;
  const newestFirst = [...state.chain].reverse();
  const window = newestFirst.slice(indexOffset, indexOffset + maxDays);
  const selectedStratum = selectDay(state.chain, input);
  const selectedDay = selectedStratum
    ? verifiedSelection(input, selectedStratum, currentDailyStratumSha256, maxPages)
    : null;
  const nextOffset = indexOffset + window.length < newestFirst.length
    ? indexOffset + window.length
    : null;

  return Object.freeze({
    schemaVersion: LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA,
    ownerRef: LIVING_JOURNAL_MEMORY_ARCHIVE_OWNER,
    state: 'CURRENT',
    currentness: 'CURRENT',
    archiveState: newestFirst.length === 0 ? 'EMPTY' : 'AVAILABLE',
    rawConversationContentIncluded: false,
    totalCommittedDays: newestFirst.length,
    currentDailyStratumSha256,
    index: Object.freeze({
      order: 'NEWEST_COMMITTED_FIRST',
      offset: indexOffset,
      maxDays,
      returnedDays: window.length,
      hasMore: nextOffset !== null,
      nextOffset,
      days: window.map((stratum) => dayEntry(stratum, currentDailyStratumSha256))
    }),
    selectedDay,
    effects: { ...EFFECTS }
  });
}

// [VXG RealForever]
