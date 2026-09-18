import { semanticHash } from './utils.mjs';
import {
  loadDailyMemoryDreamState,
  sourceDescentForDailyStratum
} from './daily-memory-dream.mjs';
import { verifyHistoricalScoreContextSnapshot } from './score-context-continuity.mjs';

export const LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA = 'vexlife.living-journal.memory-archive/v1';
export const LIVING_JOURNAL_MEMORY_ARCHIVE_OWNER = 'github.issue.vexlife.151';
export const LIVING_JOURNAL_MEMORY_ARCHIVE_TRUTH_CLASS = 'COMMITTED_MEMORY_ARCHIVE';
export const LIVING_JOURNAL_MEMORY_ARCHIVE_DAY_TRUTH_CLASS = 'COMMITTED_MEMORY_AT_DAY';

const SHA256 = /^[0-9a-f]{64}$/u;
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

function boundedInteger(value, label, fallback, minimum, maximum) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', `${label} must be an integer from ${minimum} through ${maximum}`, {
      [label]: value
    });
  }
  return resolved;
}

function optionalString(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', `${label} must be a non-empty string when supplied`);
  }
  return value;
}

function loadArchiveState(ownerInput) {
  try {
    return loadDailyMemoryDreamState(ownerInput);
  } catch (error) {
    fail('LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID', 'Committed Daily Memory lineage could not be verified for archive projection', {
      sourceCode: error?.code ?? 'UNKNOWN'
    });
  }
}

function historicalDailySource(ownerInput, dailyStratumSha256) {
  try {
    return sourceDescentForDailyStratum(ownerInput, dailyStratumSha256);
  } catch (error) {
    fail('LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID', 'Selected committed day failed exact Daily Memory source verification', {
      sourceCode: error?.code ?? 'UNKNOWN',
      dailyStratumSha256
    });
  }
}

function historicalScoreSnapshot(ownerInput, dailySource) {
  try {
    return verifyHistoricalScoreContextSnapshot({
      ...ownerInput,
      scoreHeadSha256: dailySource.sourceScoreHeadSha256,
      semanticAuthorityHeadSha256: dailySource.sourceSemanticAuthorityHeadSha256
    });
  } catch (error) {
    fail('LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID', 'Selected committed day failed exact historical Score verification', {
      sourceCode: error?.code ?? 'UNKNOWN',
      sourceScoreHeadSha256: dailySource.sourceScoreHeadSha256,
      sourceSemanticAuthorityHeadSha256: dailySource.sourceSemanticAuthorityHeadSha256
    });
  }
}

function currentAuthorityContains(snapshot, statement) {
  return Boolean(snapshot.semanticAuthorityHead?.currentAcceptanceBindings?.some((binding) =>
    binding.acceptanceRef === statement.semanticAcceptanceRef &&
    binding.acceptanceSha256 === statement.semanticAcceptanceSha256
  ));
}

function historicalStatementProjection(snapshot) {
  const currentStatements = snapshot.statements
    .filter((statement) => statement.current === true)
    .sort((left, right) => left.statementRef.localeCompare(right.statementRef));
  const active = currentStatements.filter((statement) =>
    statement.acceptedForContinuity === true &&
    POSITIVE_CONSENT.has(statement.consentState) &&
    currentAuthorityContains(snapshot, statement)
  );
  const held = currentStatements.filter((statement) => !(
    statement.acceptedForContinuity === true &&
    POSITIVE_CONSENT.has(statement.consentState) &&
    currentAuthorityContains(snapshot, statement)
  ));
  return { active, held };
}

function archiveDayRef(stratum) {
  return `archive-day.living-journal.${semanticHash({
    dayRef: stratum.dayRef,
    dayIndex: stratum.dayIndex,
    calendarDateRef: stratum.calendarDateRef,
    dailyStratumSha256: stratum.dailyStratumSha256
  }).slice(0, 32)}`;
}

function pageRef(dailyStratumSha256, statementRef) {
  return `page.living-journal.archive.${semanticHash({ dailyStratumSha256, statementRef }).slice(0, 32)}`;
}

function dayEntry(stratum, head, latestDailyStratumSha256) {
  return Object.freeze({
    archiveDayRef: archiveDayRef(stratum),
    dayRef: stratum.dayRef,
    dayIndex: stratum.dayIndex,
    calendarDateRef: stratum.calendarDateRef,
    timeZoneRef: stratum.timeZoneRef,
    observedAt: stratum.observedAt,
    dailyStratumRef: stratum.dailyStratumRef,
    dailyStratumSha256: stratum.dailyStratumSha256,
    dailyDreamHeadRef: head.dailyDreamHeadRef,
    dailyDreamHeadSha256: head.dailyDreamHeadSha256,
    sourceConversationHeadSha256: stratum.sourceConversationHeadSha256,
    sourceScoreHeadSha256: stratum.sourceScoreHeadSha256,
    sourceSemanticAuthorityHeadSha256: stratum.sourceSemanticAuthorityHeadSha256,
    isLatestCommittedDay: stratum.dailyStratumSha256 === latestDailyStratumSha256,
    temporalTruthClass: LIVING_JOURNAL_MEMORY_ARCHIVE_DAY_TRUTH_CLASS,
    currentNowEvaluated: false
  });
}

function selectCommittedDay(days, selectedDayRef, selectedDailyStratumSha256) {
  if (selectedDailyStratumSha256 !== null && !SHA256.test(selectedDailyStratumSha256)) {
    fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', 'selectedDailyStratumSha256 must be one lowercase SHA-256 when supplied');
  }
  if (selectedDayRef === null && selectedDailyStratumSha256 === null) return null;

  const matches = days.filter((day) =>
    (selectedDayRef === null || day.dayRef === selectedDayRef) &&
    (selectedDailyStratumSha256 === null || day.dailyStratumSha256 === selectedDailyStratumSha256)
  );
  if (matches.length !== 1) {
    fail('LIVING_JOURNAL_ARCHIVE_SELECTION_INVALID', 'Archive day selection must resolve exactly one committed day', {
      selectedDayRef,
      selectedDailyStratumSha256,
      matchCount: matches.length
    });
  }
  return matches[0];
}

function held(state) {
  return Object.freeze({
    schemaVersion: LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA,
    state: 'HELD',
    currentness: 'HELD',
    truthClass: 'MEMORY_ARCHIVE_HELD',
    rawConversationContentIncluded: false,
    totalCommittedDays: 0,
    days: [],
    selectedDay: null,
    reasons: ['DAILY_MEMORY_ATTENTION'],
    sourceAttentionCodes: [...new Set((state.attention ?? []).map((item) => item.code ?? 'UNKNOWN'))].sort(),
    effects: { ...EFFECTS }
  });
}

/**
 * Bounded, read-only projection over the already-committed G03 Daily Memory
 * lineage. The archive never rewrites a historical day through current Memory
 * truth: every selected page is reconstructed from the exact historical G02
 * and semantic-authority frontier bound by that Daily Stratum.
 */
export function projectLivingJournalMemoryArchive(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('LIVING_JOURNAL_ARCHIVE_INPUT_INVALID', 'input must be an object');
  }

  const maxDays = boundedInteger(input.maxDays, 'maxDays', 30, 1, 100);
  const dayOffset = boundedInteger(input.dayOffset, 'dayOffset', 0, 0, 1000000);
  const maxPages = boundedInteger(input.maxPages, 'maxPages', 24, 1, 100);
  const selectedDayRef = optionalString(input.selectedDayRef, 'selectedDayRef');
  const selectedDailyStratumSha256 = optionalString(input.selectedDailyStratumSha256, 'selectedDailyStratumSha256');
  const ownerInput = sourceInput(input);
  const state = loadArchiveState(ownerInput);

  if (state.currentness !== 'CURRENT' || (state.attention ?? []).length > 0) return held(state);
  if (state.headChain.length !== state.chain.length) {
    fail('LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID', 'Committed Daily Memory head and stratum lineage lengths differ');
  }

  const latestDailyStratumSha256 = state.head?.dailyStratumSha256 ?? null;
  const chronologicalDays = state.chain.map((stratum, index) =>
    dayEntry(stratum, state.headChain[index], latestDailyStratumSha256));
  const newestFirstDays = [...chronologicalDays].reverse();
  const days = newestFirstDays.slice(dayOffset, dayOffset + maxDays);
  const nextDayOffset = dayOffset + days.length < newestFirstDays.length ? dayOffset + days.length : null;
  const selection = selectCommittedDay(chronologicalDays, selectedDayRef, selectedDailyStratumSha256);

  let selectedDay = null;
  if (selection !== null) {
    const dailySource = historicalDailySource(ownerInput, selection.dailyStratumSha256);
    if (dailySource.historicalSourceVerificationState !== 'VERIFIED' || dailySource.rawConversationContentIncluded !== false) {
      fail('LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID', 'Selected committed day did not preserve verified content-absent historical source truth', {
        historicalSourceVerificationState: dailySource.historicalSourceVerificationState,
        rawConversationContentIncluded: dailySource.rawConversationContentIncluded
      });
    }

    const snapshot = historicalScoreSnapshot(ownerInput, dailySource);
    if (
      snapshot.state !== 'VERIFIED' ||
      snapshot.currentness !== 'HISTORICAL_SOURCE_VERIFIED' ||
      snapshot.rawConversationContentIncluded !== false ||
      snapshot.sourceConversationHeadSha256 !== dailySource.sourceConversationHeadSha256 ||
      snapshot.scoreHead.scoreHeadSha256 !== dailySource.sourceScoreHeadSha256 ||
      snapshot.semanticAuthorityHead.semanticAuthorityHeadSha256 !== dailySource.sourceSemanticAuthorityHeadSha256
    ) {
      fail('LIVING_JOURNAL_ARCHIVE_SOURCE_INVALID', 'Selected committed day historical Score frontier does not match its Daily source binding');
    }

    const { active, held: heldStatements } = historicalStatementProjection(snapshot);
    const selectedStatements = active.slice(0, maxPages);
    const boundedOutStatementRefs = active.slice(maxPages).map((statement) => statement.statementRef);
    const pages = selectedStatements.map((statement, index) => Object.freeze({
      pageRef: pageRef(selection.dailyStratumSha256, statement.statementRef),
      pageIndex: index,
      statementRef: statement.statementRef,
      summary: statement.summary,
      summaryHash: statement.summaryHash,
      memoryRelation: statement.memoryRelation,
      recordedStatementState: statement.recordedStatementState,
      effectiveStateAtDay: statement.effectiveState,
      acceptedForContinuityAtDay: statement.acceptedForContinuity,
      consentStateAtDay: statement.consentState,
      semanticSubjectFingerprint: statement.semanticSubjectFingerprint,
      semanticAcceptanceRef: statement.semanticAcceptanceRef,
      semanticAcceptanceSha256: statement.semanticAcceptanceSha256,
      semanticAuthorityHeadSha256AtDay: statement.semanticAuthorityHeadSha256,
      sourceBindings: structuredClone(statement.sourceBindings),
      sourceConversationHeadSha256AtDay: dailySource.sourceConversationHeadSha256,
      sourceScoreHeadSha256AtDay: dailySource.sourceScoreHeadSha256,
      sourceSemanticAuthorityHeadSha256AtDay: dailySource.sourceSemanticAuthorityHeadSha256,
      dailyStratumRef: selection.dailyStratumRef,
      dailyStratumSha256: selection.dailyStratumSha256,
      dayRef: selection.dayRef,
      dayIndex: selection.dayIndex,
      temporalTruthClass: LIVING_JOURNAL_MEMORY_ARCHIVE_DAY_TRUTH_CLASS,
      currentNowEvaluated: false,
      rawSourceContentIncluded: false,
      firstPersonAuthorityGranted: false
    }));

    selectedDay = Object.freeze({
      ...selection,
      sourceDescent: structuredClone(dailySource),
      sourceSnapshotState: snapshot.state,
      sourceSnapshotCurrentness: snapshot.currentness,
      pageCount: pages.length,
      maxPages,
      pages,
      heldOrDeferredStatementRefs: heldStatements.map((statement) => statement.statementRef),
      boundedOutStatementRefs,
      rawConversationContentIncluded: false
    });
  }

  return Object.freeze({
    schemaVersion: LIVING_JOURNAL_MEMORY_ARCHIVE_SCHEMA,
    ownerRef: LIVING_JOURNAL_MEMORY_ARCHIVE_OWNER,
    state: 'CURRENT',
    currentness: 'CURRENT',
    truthClass: LIVING_JOURNAL_MEMORY_ARCHIVE_TRUTH_CLASS,
    rawConversationContentIncluded: false,
    totalCommittedDays: chronologicalDays.length,
    latestCommittedDailyStratumSha256: latestDailyStratumSha256,
    newestFirst: true,
    maxDays,
    dayOffset,
    nextDayOffset,
    days,
    selectedDay,
    uncommittedTailCount: state.uncommittedTail.length,
    effects: { ...EFFECTS }
  });
}

// [VXG RealForever]
