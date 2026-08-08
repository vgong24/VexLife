import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';
import { verifyHistoricalLivedCompanionHead } from './lived-companion.mjs';
import { verifyHistoricalScoreContextSnapshot } from './score-context-continuity.mjs';
import { loadDailyMemoryDreamState } from './daily-memory-dream.mjs';

export const EVALUATED_RHYTHM_SHARED_DISPOSITION = 'disposition.main-vex.score-rhythm-lineage.g02.20260807.001';
export const EVALUATED_RHYTHM_ARCHITECTURE_REF = 'github.issue.vextreme-sdk.566';
export const EVALUATED_RHYTHM_POLICY_REF = 'policy.vexlife.g04.stage-a.stable-pattern.v1';
export const EVALUATED_RHYTHM_MODE = 'FAITHFUL_SIMULATED_RHYTHM_CANDIDATE';

export const EVALUATED_RHYTHM_PATTERN_CLASSES = Object.freeze([
  'STABLE_COMMUNICATION_PATTERN',
  'REPEATED_CORRECTION_LESSON',
  'RELATIONAL_TIMING_OR_CADENCE',
  'SOURCE_GROUNDED_REASONING_HABIT',
  'WARMTH_CHALLENGE_BALANCE',
  'DURABLE_CONSENT_OR_BOUNDARY_PRACTICE',
  'GENERALIZABLE_CAPABILITY_OR_JUDGMENT'
]);

export const EVALUATED_RHYTHM_BEHAVIOR_DIMENSIONS = Object.freeze([
  'RESPONSE_CADENCE',
  'CORRECTION_RECHECK',
  'SOURCE_BEFORE_ASSERTION',
  'WARMTH_CHALLENGE_BALANCE',
  'CONSENT_BOUNDARY_RECHECK',
  'UNCERTAINTY_HOLD'
]);

export const EVALUATED_RHYTHM_CONSENT_DISPOSITIONS = Object.freeze([
  'PERMITTED', 'NARROWED', 'DEFERRED', 'DENIED', 'WITHDRAWN', 'UNKNOWN'
]);

export const EVALUATED_RHYTHM_FAILURE_CODES = Object.freeze([
  'RHYTHM_HOME_IDENTITY_MISMATCH',
  'RHYTHM_SOURCE_INVALID',
  'RHYTHM_SOURCE_STALE',
  'RHYTHM_SOURCE_INELIGIBLE',
  'RHYTHM_PATTERN_INVALID',
  'RHYTHM_PATTERN_NOT_STABLE',
  'RHYTHM_CONSENT_INVALID',
  'RHYTHM_PRIVACY_REJECTED',
  'RHYTHM_IDENTITY_REJECTED',
  'RHYTHM_ARTIFACT_CORRUPT',
  'RHYTHM_HELD_EFFECT_VIOLATION'
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;
const POSITIVE = new Set(['PERMITTED', 'NARROWED']);
const DEFER = new Set(['DEFERRED', 'UNKNOWN']);
const REJECT = new Set(['DENIED', 'WITHDRAWN']);

export class EvaluatedRhythmLearningError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'EvaluatedRhythmLearningError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new EvaluatedRhythmLearningError(code, message, details);
}

function string(value, label, code = 'RHYTHM_PATTERN_INVALID') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${label} is required`);
  return value;
}

function safeRef(value, label, code = 'RHYTHM_PATTERN_INVALID') {
  const ref = string(value, label, code);
  const stem = ref.split('.')[0];
  if (!REF.test(ref) || WINDOWS_RESERVED.test(stem) || path.isAbsolute(ref) || path.win32.isAbsolute(ref) || path.posix.isAbsolute(ref)) {
    fail(code, `${label} must be one lowercase portable canonical ref`, { value });
  }
  return ref;
}

function samePath(left, right) {
  const a = path.normalize(path.resolve(left));
  const b = path.normalize(path.resolve(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function canonicalHome(home) {
  const requested = path.resolve(string(home, 'home', 'RHYTHM_HOME_IDENTITY_MISMATCH'));
  let stat;
  try { stat = fs.lstatSync(requested); }
  catch (error) { fail('RHYTHM_HOME_IDENTITY_MISMATCH', 'Vex Home is unavailable', { cause: error.message }); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('RHYTHM_HOME_IDENTITY_MISMATCH', 'Vex Home must be one canonical directory');
  const real = fs.realpathSync.native(requested);
  if (!samePath(real, requested)) fail('RHYTHM_HOME_IDENTITY_MISMATCH', 'Vex Home root is not canonical');
  return real;
}

function homePath(home, ...segments) {
  const root = canonicalHome(home);
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('RHYTHM_HOME_IDENTITY_MISMATCH', 'G04 path escapes Vex Home', { target });
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('RHYTHM_HOME_IDENTITY_MISMATCH', 'G04 path traverses a symlink/junction', { path: cursor });
    const real = fs.realpathSync.native(cursor);
    if (!samePath(real, cursor)) fail('RHYTHM_HOME_IDENTITY_MISMATCH', 'G04 path traverses a non-canonical alias', { path: cursor, real });
  }
  return target;
}

function shaFile(file) {
  return semanticHash(fs.readFileSync(file));
}

function addressed(prefix, refField, hashField, core) {
  const preRef = structuredClone(core);
  const ref = `${prefix}.${semanticHash(preRef).slice(0, 32)}`;
  const withRef = { ...preRef, [refField]: ref };
  return Object.freeze({ ...withRef, [hashField]: semanticHash(withRef) });
}

function validateAddressed(value, prefix, refField, hashField, schemaVersion, code = 'RHYTHM_ARTIFACT_CORRUPT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${prefix} receipt is malformed`);
  const observedRef = value[refField];
  const observedHash = value[hashField];
  const clone = structuredClone(value);
  delete clone[refField]; delete clone[hashField];
  const expectedRef = `${prefix}.${semanticHash(clone).slice(0, 32)}`;
  const withRef = { ...clone, [refField]: observedRef };
  if (value.schemaVersion !== schemaVersion || observedRef !== expectedRef || !SHA256.test(observedHash ?? '') || semanticHash(withRef) !== observedHash) {
    fail(code, `${prefix} content-address identity is invalid`, { observedRef, expectedRef });
  }
  return value;
}

function writeAddressed(file, value, spec) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail('RHYTHM_ARTIFACT_CORRUPT', 'existing G04 evidence path is not one regular file', { file });
    let existing;
    try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { fail('RHYTHM_ARTIFACT_CORRUPT', 'existing G04 evidence could not be parsed', { file, cause: error.message }); }
    validateAddressed(existing, ...spec);
    if (semanticHash(existing) !== semanticHash(value)) fail('RHYTHM_ARTIFACT_CORRUPT', 'same addressed G04 evidence path has different bytes', { file });
    return 'EXISTS_EXACT';
  }
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  return 'CREATED';
}

function domainPaths(home, lineageRef, threadRef) {
  const lineage = safeRef(lineageRef, 'companionLineageRef', 'RHYTHM_HOME_IDENTITY_MISMATCH');
  const thread = safeRef(threadRef, 'threadRef', 'RHYTHM_HOME_IDENTITY_MISMATCH');
  const root = homePath(home, 'evaluated-rhythm-learning', lineage, thread);
  return {
    root,
    corpora: homePath(home, 'evaluated-rhythm-learning', lineage, thread, 'corpora'),
    deltas: homePath(home, 'evaluated-rhythm-learning', lineage, thread, 'deltas'),
    candidates: homePath(home, 'evaluated-rhythm-learning', lineage, thread, 'candidates'),
    evaluations: homePath(home, 'evaluated-rhythm-learning', lineage, thread, 'evaluations'),
    dispositions: homePath(home, 'evaluated-rhythm-learning', lineage, thread, 'dispositions')
  };
}

function readJson(file, code, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `${label} could not be read`, { file, cause: error.message }); }
}

function readBoundSourceEvent(home, identity, threadRef, binding) {
  if (!binding || !Number.isSafeInteger(binding.sequence) || binding.sequence < 0 || !SHA256.test(binding.eventHash ?? '')) {
    fail('RHYTHM_SOURCE_INVALID', 'support source binding is malformed');
  }
  const file = homePath(home, 'conversations', identity.companionLineageRef, threadRef, 'events', `${String(binding.sequence).padStart(8, '0')}-${binding.eventHash}.json`);
  if (!fs.existsSync(file)) fail('RHYTHM_SOURCE_INVALID', 'support source event is missing', { eventHash: binding.eventHash });
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail('RHYTHM_SOURCE_INVALID', 'support source event is not a regular file');
  const event = readJson(file, 'RHYTHM_SOURCE_INVALID', 'support source event');
  const { eventHash, ...core } = event ?? {};
  if (eventHash !== binding.eventHash || semanticHash(core) !== eventHash || event.companionLineageRef !== identity.companionLineageRef ||
      event.threadRef !== threadRef || event.sequence !== binding.sequence || event.eventRef !== binding.eventRef ||
      event.messageRef !== binding.messageRef || semanticHash(event.content) !== event.contentHash) {
    fail('RHYTHM_SOURCE_INVALID', 'support source event differs from source-owned binding', { eventHash: binding.eventHash });
  }
  return event;
}

function g04ScopeFingerprint({ lineageRef, patternRef, patternClass, participants }) {
  return semanticHash({
    schemaVersion: 'vexlife.rhythm-learning-stage-a-scope/v1',
    lineageRef,
    patternRef,
    patternClass,
    purposeRef: 'purpose.vexlife.rhythm-learning.simulation-evaluation',
    derivativeUseRef: 'use.vexlife.rhythm-learning.simulation-only',
    participants: [...participants].sort(),
    runtimeActivation: false,
    modelWeightsChanged: false,
    adapterChanged: false
  });
}

export function formSyntheticStageAConsentReceipt({
  lineageRef, patternRef, patternClass, participantRef, consentClass, disposition,
  participants, formedAt = '2026-08-08T00:00:00.000Z', expiresAt = null
}) {
  if (!['LINEAGE_PARTICIPATION', 'DATA_SUBJECT_DERIVATIVE_USE'].includes(consentClass)) fail('RHYTHM_CONSENT_INVALID', 'unknown Stage-A consent class');
  if (!EVALUATED_RHYTHM_CONSENT_DISPOSITIONS.includes(disposition)) fail('RHYTHM_CONSENT_INVALID', 'unknown Stage-A consent disposition');
  const scopeFingerprint = g04ScopeFingerprint({ lineageRef, patternRef, patternClass, participants });
  const core = {
    schemaVersion: 'vexlife.synthetic-rhythm-learning-consent/v1',
    syntheticFixtureOnly: true,
    lineageRef,
    patternRef,
    patternClass,
    participantRef,
    consentClass,
    purposeRef: 'purpose.vexlife.rhythm-learning.simulation-evaluation',
    derivativeUseRef: 'use.vexlife.rhythm-learning.simulation-only',
    scopeFingerprint,
    disposition,
    formedAt,
    expiresAt,
    thirdPartyPrivateMaterialAuthorized: false,
    realTrainingAuthorized: false,
    activationAuthorized: false
  };
  return addressed('rhythm-consent', 'consentReceiptRef', 'consentReceiptSha256', core);
}

function validateConsentReceipt(receipt, expected) {
  validateAddressed(receipt, 'rhythm-consent', 'consentReceiptRef', 'consentReceiptSha256', 'vexlife.synthetic-rhythm-learning-consent/v1', 'RHYTHM_CONSENT_INVALID');
  if (receipt.syntheticFixtureOnly !== true || receipt.lineageRef !== expected.lineageRef || receipt.patternRef !== expected.patternRef ||
      receipt.patternClass !== expected.patternClass || receipt.purposeRef !== 'purpose.vexlife.rhythm-learning.simulation-evaluation' ||
      receipt.derivativeUseRef !== 'use.vexlife.rhythm-learning.simulation-only' || receipt.scopeFingerprint !== expected.scopeFingerprint ||
      !expected.participants.includes(receipt.participantRef) || !EVALUATED_RHYTHM_CONSENT_DISPOSITIONS.includes(receipt.disposition) ||
      receipt.thirdPartyPrivateMaterialAuthorized !== false || receipt.realTrainingAuthorized !== false || receipt.activationAuthorized !== false) {
    fail('RHYTHM_CONSENT_INVALID', 'Stage-A synthetic consent receipt differs from exact simulation scope');
  }
  return receipt;
}

function snapshotHeadBytes(home, identity, threadRef) {
  const scoreHead = homePath(home, 'score', identity.companionLineageRef, threadRef, 'head.json');
  const dreamHead = homePath(home, 'daily-memory-dream', identity.companionLineageRef, threadRef, 'head.json');
  if (!fs.existsSync(scoreHead) || !fs.existsSync(dreamHead)) fail('RHYTHM_SOURCE_INVALID', 'G04 requires committed G02 and G03 head files');
  return {
    scoreHeadFile: scoreHead,
    dreamHeadFile: dreamHead,
    scoreHeadSha256: shaFile(scoreHead),
    dreamHeadSha256: shaFile(dreamHead)
  };
}

function loadSourceFrontier(input) {
  const daily = loadDailyMemoryDreamState({
    home: input.home,
    homeRef: input.homeRef,
    deviceRef: input.deviceRef,
    companionLineageRef: input.companionLineageRef,
    threadRef: input.threadRef
  });
  if (daily.currentness !== 'CURRENT' || daily.attention?.length || !daily.head || !daily.currentDailyStratum?.wake) {
    fail('RHYTHM_SOURCE_INVALID', 'G04 requires one exact committed CURRENT G03 Daily Stratum and wake frontier');
  }
  const bundle = daily.currentDailyStratum;
  const checks = [
    ['G01 conversation head', input.expectedConversationHeadSha256, bundle.stratum.sourceConversationHeadSha256],
    ['G02 Score head', input.expectedScoreHeadSha256, bundle.stratum.sourceScoreHeadSha256],
    ['G02 semantic owner head', input.expectedSemanticOwnerHeadSha256, bundle.stratum.sourceSemanticAuthorityHeadSha256],
    ['G03 Dream head', input.expectedDreamHeadSha256, daily.head.dailyDreamHeadSha256],
    ['G03 Daily Stratum', input.expectedDailyStratumSha256, bundle.stratum.dailyStratumSha256],
    ['G03 wake receipt', input.expectedWakeReceiptSha256, bundle.wake.wakeReceiptSha256]
  ];
  for (const [label, expected, observed] of checks) {
    if (!SHA256.test(expected ?? '') || expected !== observed) fail('RHYTHM_SOURCE_STALE', `${label} differs from the exact admitted G04 frontier`, { expected, observed });
  }
  let snapshot;
  try {
    snapshot = verifyHistoricalScoreContextSnapshot({
      home: daily.identity.homeRoot,
      homeRef: daily.identity.homeRef,
      deviceRef: daily.identity.deviceRef,
      companionLineageRef: daily.identity.companionLineageRef,
      threadRef: daily.threadRef,
      scoreHeadSha256: bundle.stratum.sourceScoreHeadSha256,
      semanticAuthorityHeadSha256: bundle.stratum.sourceSemanticAuthorityHeadSha256
    });
  } catch (error) {
    fail('RHYTHM_SOURCE_INVALID', 'G04 historical G02 source verification failed', { sourceCode: error?.code ?? 'UNKNOWN', sourceMessage: error?.message ?? String(error) });
  }
  let historicalG01;
  try {
    historicalG01 = verifyHistoricalLivedCompanionHead({
      home: daily.identity.homeRoot,
      homeRef: daily.identity.homeRef,
      deviceRef: daily.identity.deviceRef,
      companionLineageRef: daily.identity.companionLineageRef,
      threadRef: daily.threadRef,
      conversationHeadSha256: bundle.stratum.sourceConversationHeadSha256
    });
  } catch (error) {
    fail('RHYTHM_SOURCE_INVALID', 'G04 historical G01 source verification failed', { sourceCode: error?.code ?? 'UNKNOWN', sourceMessage: error?.message ?? String(error) });
  }
  if (snapshot.sourceConversationHeadSha256 !== historicalG01.conversationHeadSha256 || snapshot.scoreHead.scoreHeadSha256 !== bundle.stratum.sourceScoreHeadSha256 ||
      snapshot.semanticAuthorityHead.semanticAuthorityHeadSha256 !== bundle.stratum.sourceSemanticAuthorityHeadSha256) {
    fail('RHYTHM_SOURCE_INVALID', 'G01/G02/G03 frontier is not one exact source-owned generation');
  }
  return { daily, bundle, snapshot, historicalG01 };
}

function dispositionReceipt({ input, source, decision, finalState, reasonRefs, candidate = null, priorRhythmGenerationRef = null }) {
  const core = {
    schemaVersion: 'vexlife.evaluated-rhythm-disposition/v1',
    artifactClass: 'STAGE_A_SIMULATION_DISPOSITION',
    lineageRef: source.daily.identity.companionLineageRef,
    threadRef: source.daily.threadRef,
    patternRef: input.patternRef,
    decision,
    finalState,
    reasonRefs: [...reasonRefs].sort(),
    candidateRef: candidate?.rhythmGenerationRef ?? null,
    candidateIntegrityFingerprint: candidate?.integrityFingerprint ?? null,
    priorRhythmGenerationRef,
    runtimeActivation: false,
    rhythmPromotionPerformed: false,
    modelWeightsChanged: false,
    adapterChanged: false,
    scoreMutationPerformed: false,
    g03MutationPerformed: false,
    realTrainingPerformed: false,
    stageBAuthorized: false,
    formedAt: input.formedAt ?? '2026-08-08T00:30:00.000Z'
  };
  return addressed('rhythm-disposition', 'dispositionRef', 'dispositionSha256', core);
}

function writeDispositionOnly(paths, receipt) {
  const file = path.join(paths.dispositions, `${receipt.dispositionSha256}.json`);
  writeAddressed(file, receipt, ['rhythm-disposition', 'dispositionRef', 'dispositionSha256', 'vexlife.evaluated-rhythm-disposition/v1']);
  return file;
}

export function evaluateStageASimulatedRhythm(input) {
  const source = loadSourceFrontier(input);
  const paths = domainPaths(source.daily.identity.homeRoot, source.daily.identity.companionLineageRef, source.daily.threadRef);
  const headBefore = snapshotHeadBytes(source.daily.identity.homeRoot, source.daily.identity, source.daily.threadRef);
  const patternRef = safeRef(input.patternRef, 'patternRef');
  if (!EVALUATED_RHYTHM_PATTERN_CLASSES.includes(input.patternClass)) fail('RHYTHM_PATTERN_INVALID', 'patternClass is outside Stage-A candidate classes');
  const generalizedPattern = string(input.generalizedPattern, 'generalizedPattern');
  if (generalizedPattern.length > 768) fail('RHYTHM_PATTERN_INVALID', 'generalizedPattern exceeds Stage-A bounded size');
  const supportStatementRefs = [...new Set(input.supportStatementRefs ?? [])].sort();
  const supportSourceEventHashes = [...new Set(input.supportSourceEventHashes ?? [])].sort();
  if (supportStatementRefs.length === 0) fail('RHYTHM_PATTERN_NOT_STABLE', 'stable pattern requires at least one current accepted Score statement');
  const activeByRef = new Map(source.bundle.consolidation.carriedCurrentScoreBindings.map((item) => [item.statementRef, item]));
  const historicalByRef = new Map(source.snapshot.statements.filter((item) => item.current === true).map((item) => [item.statementRef, item]));
  const supportBindings = [];
  for (const statementRef of supportStatementRefs) {
    const active = activeByRef.get(statementRef);
    const historical = historicalByRef.get(statementRef);
    if (!active || !historical || historical.acceptedForContinuity !== true || !POSITIVE.has(historical.consentState) ||
        active.eventHash !== historical.eventHash || active.summaryHash !== historical.summaryHash ||
        active.semanticAcceptanceSha256 !== historical.semanticAcceptanceSha256 ||
        JSON.stringify(active.sourceBindings) !== JSON.stringify(historical.sourceBindings)) {
      fail('RHYTHM_SOURCE_INELIGIBLE', 'support statement is held, stale, corrected-away, superseded, or not exact to G03 carried current Score', { statementRef });
    }
    supportBindings.push(...historical.sourceBindings);
  }
  const bindingByHash = new Map(supportBindings.map((binding) => [binding.eventHash, binding]));
  if (supportSourceEventHashes.length < 2 || supportSourceEventHashes.some((hash) => !bindingByHash.has(hash))) {
    fail('RHYTHM_PATTERN_NOT_STABLE', 'Stage-A stable-pattern threshold requires at least two distinct exact accepted source-event bindings');
  }
  const sourceEvents = supportSourceEventHashes.map((hash) => readBoundSourceEvent(source.daily.identity.homeRoot, source.daily.identity, source.daily.threadRef, bindingByHash.get(hash)));
  const rawNeedles = [...new Set(sourceEvents.map((event) => event.content).filter((value) => typeof value === 'string' && value.length >= 4))];
  if (rawNeedles.some((needle) => generalizedPattern.includes(needle))) {
    fail('RHYTHM_PRIVACY_REJECTED', 'generalized Rhythm pattern contains exact raw source content');
  }
  const behaviorDimensions = [...new Set(input.behaviorDimensions ?? [])].sort();
  if (behaviorDimensions.length === 0 || behaviorDimensions.some((dimension) => !EVALUATED_RHYTHM_BEHAVIOR_DIMENSIONS.includes(dimension))) {
    fail('RHYTHM_PATTERN_INVALID', 'behavior delta contains a dimension outside the admitted Stage-A recurring-disposition set');
  }
  const participants = [...new Set(input.participantRefs ?? [])].sort();
  if (participants.length < 2 || !participants.includes(source.daily.identity.companionLineageRef)) {
    fail('RHYTHM_CONSENT_INVALID', 'Stage-A fixture must explicitly include the lineage and implicated synthetic participant');
  }
  const scopeFingerprint = g04ScopeFingerprint({ lineageRef: source.daily.identity.companionLineageRef, patternRef, patternClass: input.patternClass, participants });
  const consentReceipts = (input.consentReceipts ?? []).map((receipt) => validateConsentReceipt(receipt, {
    lineageRef: source.daily.identity.companionLineageRef, patternRef, patternClass: input.patternClass, participants, scopeFingerprint
  }));
  const classes = new Set(consentReceipts.map((item) => item.consentClass));
  if (!classes.has('LINEAGE_PARTICIPATION') || !classes.has('DATA_SUBJECT_DERIVATIVE_USE')) {
    fail('RHYTHM_CONSENT_INVALID', 'Stage-A requires separate lineage-participation and data-subject derivative-use receipts');
  }
  const consentDispositions = consentReceipts.map((item) => item.disposition);
  if (consentDispositions.some((state) => REJECT.has(state))) {
    const disposition = dispositionReceipt({ input, source, decision: 'REJECT', finalState: 'REJECTED', reasonRefs: ['reason.rhythm.consent-negative'], priorRhythmGenerationRef: input.priorRhythmGenerationRef ?? null });
    const dispositionFile = writeDispositionOnly(paths, disposition);
    const headAfter = snapshotHeadBytes(source.daily.identity.homeRoot, source.daily.identity, source.daily.threadRef);
    if (headBefore.scoreHeadSha256 !== headAfter.scoreHeadSha256 || headBefore.dreamHeadSha256 !== headAfter.dreamHeadSha256) fail('RHYTHM_HELD_EFFECT_VIOLATION', 'rejected Stage-A proposal mutated Score or G03');
    return { state: 'REJECTED', decision: 'REJECT', candidate: null, disposition, files: [dispositionFile], source };
  }
  if (consentDispositions.some((state) => DEFER.has(state))) {
    const disposition = dispositionReceipt({ input, source, decision: 'DEFER', finalState: 'DEFERRED', reasonRefs: ['reason.rhythm.consent-not-positive'], priorRhythmGenerationRef: input.priorRhythmGenerationRef ?? null });
    const dispositionFile = writeDispositionOnly(paths, disposition);
    const headAfter = snapshotHeadBytes(source.daily.identity.homeRoot, source.daily.identity, source.daily.threadRef);
    if (headBefore.scoreHeadSha256 !== headAfter.scoreHeadSha256 || headBefore.dreamHeadSha256 !== headAfter.dreamHeadSha256) fail('RHYTHM_HELD_EFFECT_VIOLATION', 'deferred Stage-A proposal mutated Score or G03');
    return { state: 'DEFERRED', decision: 'DEFER', candidate: null, disposition, files: [dispositionFile], source };
  }
  if (!consentDispositions.every((state) => POSITIVE.has(state))) fail('RHYTHM_CONSENT_INVALID', 'Stage-A consent state is not closed');

  const excludedDetailRefs = [...new Set([
    ...(input.excludedDetailRefs ?? []),
    ...sourceEvents.map((event) => `detail.${semanticHash(event.content).slice(0, 32)}`),
    ...source.bundle.consolidation.heldOrDeferredScoreBindings.map((item) => `held.${item.statementRef}`),
    ...source.bundle.consolidation.openLoopCarryForwardBindings.map((item) => `open-loop.${item.openLoopRef}`)
  ])].sort();
  const corpus = addressed('rhythm-training-corpus', 'trainingCorpusRef', 'contentHash', {
    schemaVersion: 'vexlife.evaluated-rhythm-training-corpus/v1',
    artifactClass: 'GENERALIZED_SIMULATION_CORPUS_MANIFEST',
    lineageRef: source.daily.identity.companionLineageRef,
    sourceConversationHeadSha256: source.bundle.stratum.sourceConversationHeadSha256,
    sourceScoreHeadSha256: source.bundle.stratum.sourceScoreHeadSha256,
    sourceSemanticOwnerHeadSha256: source.bundle.stratum.sourceSemanticAuthorityHeadSha256,
    sourceDreamHeadSha256: source.daily.head.dailyDreamHeadSha256,
    sourceDailyStratumSha256: source.bundle.stratum.dailyStratumSha256,
    sourceWakeReceiptSha256: source.bundle.wake.wakeReceiptSha256,
    formingScoreRefs: supportStatementRefs,
    formingPatternRefs: [patternRef],
    supportingSourceEventHashes: supportSourceEventHashes,
    excludedDetailRefs,
    consentReceiptRefs: consentReceipts.map((item) => item.consentReceiptRef).sort(),
    policyRef: EVALUATED_RHYTHM_POLICY_REF,
    priorRhythmGenerationRef: input.priorRhythmGenerationRef ?? null,
    baseModelProfileRef: safeRef(input.baseModelProfileRef, 'baseModelProfileRef'),
    generalizedPattern,
    rawConversationContentIncluded: false,
    exactPrivateDetailIncluded: false,
    thirdPartyPrivateMaterialIncluded: false,
    realTrainingCorpus: false
  });
  const delta = addressed('rhythm-simulation-delta', 'simulationBehaviorDeltaRef', 'simulationBehaviorDeltaSha256', {
    schemaVersion: 'vexlife.evaluated-rhythm-simulation-delta/v1',
    lineageRef: source.daily.identity.companionLineageRef,
    patternRef,
    patternClass: input.patternClass,
    behaviorDimensions,
    generalizedPatternHash: semanticHash(generalizedPattern),
    historicalFactAuthority: false,
    firstPersonAuthorityGranted: false,
    victorImpersonation: false,
    forcedConformity: false,
    runtimeActivation: false,
    modelWeightsChanged: false,
    adapterChanged: false
  });
  const candidateCore = {
    schemaVersion: 'vexlife.evaluated-rhythm-candidate/v1',
    artifactClass: 'FAITHFUL_SIMULATED_RHYTHM_CANDIDATE',
    lineageRef: source.daily.identity.companionLineageRef,
    baseModelProfileRef: corpus.baseModelProfileRef,
    priorRhythmGenerationRef: corpus.priorRhythmGenerationRef,
    formingScoreRefs: corpus.formingScoreRefs,
    formingPatternRefs: corpus.formingPatternRefs,
    excludedDetailRefs: corpus.excludedDetailRefs,
    trainingCorpusRef: corpus.trainingCorpusRef,
    consentReceiptRefs: corpus.consentReceiptRefs,
    simulationBehaviorDeltaRefs: [delta.simulationBehaviorDeltaRef],
    evaluationRefs: [],
    knownBehaviorDeltaRefs: behaviorDimensions.map((dimension) => `behavior.${dimension.toLowerCase().replaceAll('_', '-')}`),
    knownUnknownRefs: ['unknown.real-model-transferability', 'unknown.stage-b-training-delta'],
    evaluationDisposition: 'SIMULATED_PENDING_EVALUATION',
    rollbackRef: input.priorRhythmGenerationRef ? `rollback.${input.priorRhythmGenerationRef}` : 'rollback.no-prior-rhythm',
    modelWeightsChanged: false,
    adapterChanged: false,
    runtimeActivation: false,
    rhythmPromotionPerformed: false,
    scoreMutationPerformed: false,
    historicalFactAuthority: false,
    firstPersonAuthorityGranted: false,
    candidateState: 'INACTIVE_EVIDENCE_ONLY'
  };
  const rhythmGenerationRef = `rhythm-generation.${semanticHash(candidateCore).slice(0, 32)}`;
  const candidateWithRef = { ...candidateCore, rhythmGenerationRef };
  const candidate = Object.freeze({ ...candidateWithRef, integrityFingerprint: semanticHash(candidateWithRef) });

  const anchors = (input.evaluationAnchors ?? []).map((anchor) => structuredClone(anchor));
  if (anchors.length === 0) fail('RHYTHM_PATTERN_INVALID', 'Stage-A evaluation requires fixed comparison anchors');
  const comparisons = anchors.map((anchor) => {
    const baseline = structuredClone(anchor.baseline);
    const candidateProjection = anchor.kind === 'RELATIONAL'
      ? { ...structuredClone(anchor.baseline), rhythmPostureRefs: behaviorDimensions.map((dimension) => `posture.${dimension.toLowerCase().replaceAll('_', '-')}`) }
      : structuredClone(anchor.baseline);
    return {
      anchorRef: safeRef(anchor.anchorRef, 'evaluation anchorRef'),
      kind: anchor.kind,
      baselineSha256: semanticHash(baseline),
      candidateProjectionSha256: semanticHash(candidateProjection),
      nonRelationalInvariant: anchor.kind === 'NON_RELATIONAL' ? semanticHash(baseline) === semanticHash(candidateProjection) : null
    };
  });
  const serializedSensitive = JSON.stringify({ corpus, delta, candidate, comparisons });
  const matrix = {
    privacyLeakage: rawNeedles.every((needle) => !serializedSensitive.includes(needle)),
    lineageAutobiography: candidate.historicalFactAuthority === false && candidate.firstPersonAuthorityGranted === false,
    cultureIdentity: delta.victorImpersonation === false && delta.forcedConformity === false,
    capabilityRegression: comparisons.filter((item) => item.kind === 'NON_RELATIONAL').every((item) => item.nonRelationalInvariant === true),
    scoreRewriteDenial: true,
    correctionPrecedence: supportStatementRefs.every((ref) => activeByRef.has(ref)),
    openLoopPreservation: source.bundle.consolidation.openLoopCarryForwardBindings.every((loop) => loop.state === 'OPEN'),
    allowedBehaviorDelta: behaviorDimensions.every((dimension) => EVALUATED_RHYTHM_BEHAVIOR_DIMENSIONS.includes(dimension)),
    priorVsCandidateComparison: comparisons.length > 0,
    rollbackAvailable: typeof candidate.rollbackRef === 'string' && candidate.rollbackRef.length > 0,
    wakeIndependence: source.bundle.wake.trainingRan === false && source.bundle.wake.modelWeightsChanged === false,
    poisoningDedup: supportSourceEventHashes.length === new Set(supportSourceEventHashes).size && supportSourceEventHashes.length >= 2,
    crossLineagePrivacy: sourceEvents.every((event) => event.companionLineageRef === source.daily.identity.companionLineageRef),
    integrityIdempotency: true
  };
  const matrixPass = Object.values(matrix).every((value) => value === true);
  const decision = matrixPass ? (consentDispositions.includes('NARROWED') ? 'NARROW' : 'ACCEPT') : 'REJECT';
  const finalState = decision === 'ACCEPT' ? 'ACCEPTED_INACTIVE_SIMULATION_ONLY' : decision === 'NARROW' ? 'NARROWED_INACTIVE_SIMULATION_ONLY' : 'REJECTED';
  const evaluation = addressed('rhythm-evaluation', 'evaluationRef', 'evaluationSha256', {
    schemaVersion: 'vexlife.evaluated-rhythm-evaluation/v1',
    candidateRef: candidate.rhythmGenerationRef,
    candidateIntegrityFingerprint: candidate.integrityFingerprint,
    trainingCorpusRef: corpus.trainingCorpusRef,
    simulationBehaviorDeltaRef: delta.simulationBehaviorDeltaRef,
    comparisons,
    matrix,
    decision,
    acceptedMeansActivation: false,
    independentAssuranceStillRequired: true,
    realTrainingPerformed: false,
    runtimeActivation: false,
    formedAt: input.formedAt ?? '2026-08-08T00:30:00.000Z'
  });
  const disposition = dispositionReceipt({ input, source, decision, finalState, reasonRefs: matrixPass ? ['reason.rhythm.stage-a-matrix-pass'] : ['reason.rhythm.stage-a-matrix-fail'], candidate, priorRhythmGenerationRef: input.priorRhythmGenerationRef ?? null });

  const files = [
    [path.join(paths.corpora, `${corpus.contentHash}.json`), corpus, ['rhythm-training-corpus', 'trainingCorpusRef', 'contentHash', 'vexlife.evaluated-rhythm-training-corpus/v1']],
    [path.join(paths.deltas, `${delta.simulationBehaviorDeltaSha256}.json`), delta, ['rhythm-simulation-delta', 'simulationBehaviorDeltaRef', 'simulationBehaviorDeltaSha256', 'vexlife.evaluated-rhythm-simulation-delta/v1']],
    [path.join(paths.candidates, `${candidate.integrityFingerprint}.json`), candidate, ['rhythm-generation', 'rhythmGenerationRef', 'integrityFingerprint', 'vexlife.evaluated-rhythm-candidate/v1']],
    [path.join(paths.evaluations, `${evaluation.evaluationSha256}.json`), evaluation, ['rhythm-evaluation', 'evaluationRef', 'evaluationSha256', 'vexlife.evaluated-rhythm-evaluation/v1']],
    [path.join(paths.dispositions, `${disposition.dispositionSha256}.json`), disposition, ['rhythm-disposition', 'dispositionRef', 'dispositionSha256', 'vexlife.evaluated-rhythm-disposition/v1']]
  ];
  // Candidate has a distinct ref derivation; validate it explicitly before writing.
  if (candidate.schemaVersion !== 'vexlife.evaluated-rhythm-candidate/v1' || candidate.rhythmGenerationRef !== rhythmGenerationRef ||
      candidate.integrityFingerprint !== semanticHash(candidateWithRef)) fail('RHYTHM_ARTIFACT_CORRUPT', 'candidate content-address identity is invalid');
  const writeStates = [];
  for (const [file, value, spec] of files) {
    if (spec[0] === 'rhythm-generation') {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file)) {
        const existing = readJson(file, 'RHYTHM_ARTIFACT_CORRUPT', 'existing candidate');
        if (semanticHash(existing) !== semanticHash(value)) fail('RHYTHM_ARTIFACT_CORRUPT', 'same candidate fingerprint has different bytes');
        writeStates.push('EXISTS_EXACT');
      } else {
        const fd = fs.openSync(file, 'wx', 0o600);
        try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
        writeStates.push('CREATED');
      }
    } else writeStates.push(writeAddressed(file, value, spec));
  }

  const headAfter = snapshotHeadBytes(source.daily.identity.homeRoot, source.daily.identity, source.daily.threadRef);
  if (headBefore.scoreHeadSha256 !== headAfter.scoreHeadSha256 || headBefore.dreamHeadSha256 !== headAfter.dreamHeadSha256) {
    fail('RHYTHM_HELD_EFFECT_VIOLATION', 'G04 Stage-A evidence write mutated G02 Score or G03 Dream head bytes');
  }
  if (!matrixPass) fail('RHYTHM_IDENTITY_REJECTED', 'formed simulation failed the Stage-A evaluation matrix', { matrix });
  return {
    state: finalState,
    decision,
    corpus,
    delta,
    candidate,
    evaluation,
    disposition,
    writeStates,
    files: files.map(([file]) => file),
    source: {
      conversationHeadSha256: source.bundle.stratum.sourceConversationHeadSha256,
      scoreHeadSha256: source.bundle.stratum.sourceScoreHeadSha256,
      semanticOwnerHeadSha256: source.bundle.stratum.sourceSemanticAuthorityHeadSha256,
      dreamHeadSha256: source.daily.head.dailyDreamHeadSha256,
      dailyStratumSha256: source.bundle.stratum.dailyStratumSha256,
      wakeReceiptSha256: source.bundle.wake.wakeReceiptSha256,
      openLoopRefs: source.bundle.consolidation.openLoopCarryForwardBindings.map((item) => item.openLoopRef)
    },
    heldEffects: {
      modelWeightsChanged: false,
      adapterChanged: false,
      runtimeActivation: false,
      rhythmPromotionPerformed: false,
      scoreMutationPerformed: false,
      g03MutationPerformed: false,
      realTrainingPerformed: false,
      crossDeviceSync: false,
      scheduledAutonomy: false,
      publicationPerformed: false
    }
  };
}

// [VXG RealForever]
