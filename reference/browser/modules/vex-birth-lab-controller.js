import {
  VEX_BIRTH_LAB_STATE_SCHEMA,
  projectVexBirthHumanChapter,
  formVexBirthSupportContext,
  formVexBirthStatusPackageModel,
  validateVexBirthAnnotationSet
} from '../../../src/core/vex-birth-lab.mjs';

export const VEX_BIRTH_COMPANION_STATUS_PATH = '/api/v1/companion/status';
export const VEX_BIRTH_COMPANION_TURN_PATH = '/api/v1/companion/turn';
export const VEX_BIRTH_ACTIVE_GENERATION_REF = 'generation.vex-foundation.g0';
export const VEX_BIRTH_SESSION_TRUTH_CLASS = 'LOCAL_SLICE_B_CANDIDATE_STATE';

const TRAINING_DISPOSITIONS = Object.freeze([
  'TRAIN',
  'COUNTEREXAMPLE',
  'HELD_OUT',
  'DO_NOT_TRAIN'
]);
const STATUS_STATES = new Set([
  'BOUND',
  'UNBOUND',
  'HOME_UNAVAILABLE',
  'MISCONFIGURED',
  'UNKNOWN'
]);
const ZIP_TEXT_ENCODER = new TextEncoder();
const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function portableRef(prefix = 'ref.vex-birth') {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}.${suffix.toLowerCase()}`;
}

function action(actionRef, label, effectClass, permissionRef = 'permission.none') {
  return Object.freeze({
    actionRef,
    label,
    effectClass,
    permissionRef,
    autoExecute: false
  });
}

export function normalizeVexBirthCompanionStatus(value) {
  const state = STATUS_STATES.has(value?.state) ? value.state : 'UNKNOWN';
  return Object.freeze({
    schemaVersion: value?.schemaVersion ?? 'vexlife.browser-companion-status/v1',
    state,
    truthClass: value?.truthClass ?? 'CURRENT_LOCAL_RUNTIME_BINDING',
    profileRef: value?.profileRef ?? 'model-profile.vexlife.browser-companion.local',
    failureCode: value?.failureCode ?? null
  });
}

function modelTruthClass(status) {
  switch (status.state) {
    case 'BOUND': return 'REAL_LOCAL_G0_BOUND';
    case 'HOME_UNAVAILABLE': return 'G0_HOME_UNAVAILABLE';
    case 'MISCONFIGURED': return 'G0_RUNTIME_MISCONFIGURED';
    case 'UNBOUND': return 'G0_RUNTIME_UNBOUND';
    default: return 'G0_RUNTIME_UNKNOWN';
  }
}

function heldTrainingActions(reason) {
  return TRAINING_DISPOSITIONS.map((disposition) => Object.freeze({
    ...action(
      `action.birth.annotation.${disposition.toLowerCase().replaceAll('_', '-')}`,
      disposition.replaceAll('_', ' '),
      'LOCAL_CANDIDATE_APPEND',
      'permission.birth.cultivation-annotate'
    ),
    reasonCode: 'UNTAUGHT_BASELINE_NOT_CLOSED',
    reason
  }));
}

export function buildVexBirthLabProjection({
  companionStatus,
  baselineClosed = false,
  baselineExchangeCount = 0,
  cultivationExchangeCount = 0,
  birthSessionRef = 'birth-session.vex-birth-lab.slice-b.local'
} = {}) {
  const status = normalizeVexBirthCompanionStatus(companionStatus);
  const bound = status.state === 'BOUND';
  const currentVBStage = !bound ? 'VB1' : baselineClosed ? 'VB3' : 'VB2';
  const currentChapter = projectVexBirthHumanChapter(currentVBStage);
  const availableActions = [
    action('action.birth.status.inspect', 'Refresh G0 binding', 'READ_ONLY'),
    action('action.birth.support.copy', 'Copy support context', 'LOCAL_EXPORT', 'permission.birth.support-export'),
    action('action.birth.status-package.generate', 'Generate status ZIP', 'LOCAL_EXPORT', 'permission.birth.support-export')
  ];
  const heldActions = [];
  const blockers = [];
  const unknowns = ['source.currentness.browser-self-attestation-unavailable'];

  let primaryAction;
  if (!bound) {
    primaryAction = action(
      'action.birth.runtime.verify',
      'Verify local G0 binding',
      'READ_ONLY'
    );
    blockers.push(`Local Companion binding is ${status.state}; no synthetic G0 reply is available.`);
    heldActions.push(...heldTrainingActions('A real bound G0 and accepted untaught baseline are required first.'));
  } else if (!baselineClosed) {
    primaryAction = action(
      'action.birth.baseline.finish',
      'Finish untaught baseline witness',
      'LOCAL_APPEND',
      'permission.birth.baseline-witness'
    );
    heldActions.push(...heldTrainingActions('Finish the untaught G0 baseline witness before forming training selections.'));
  } else {
    primaryAction = action(
      'action.birth.cultivation.finish',
      'Continue cultivation',
      'LOCAL_CANDIDATE_APPEND',
      'permission.birth.cultivation-annotate'
    );
  }

  return Object.freeze({
    schemaVersion: VEX_BIRTH_LAB_STATE_SCHEMA,
    truthClass: VEX_BIRTH_SESSION_TRUTH_CLASS,
    birthSessionRef,
    currentChapter,
    currentVBStage,
    activeGenerationRef: VEX_BIRTH_ACTIVE_GENERATION_REF,
    candidateGenerationRefOrNull: null,
    modelTruthClass: modelTruthClass(status),
    modelBindingState: status.state,
    trainingEffectTruth: 'PRE_EXECUTION_NO_EFFECT',
    sourceCurrentness: 'UNKNOWN',
    availableActions: Object.freeze([...availableActions, primaryAction]),
    heldActions: Object.freeze(heldActions),
    blockers: Object.freeze(blockers),
    unknowns: Object.freeze(unknowns),
    latestEvidenceRefs: Object.freeze([]),
    completionClaimAllowed: false,
    baselineClosed,
    baselineExchangeCount,
    cultivationExchangeCount,
    primaryAction
  });
}

function annotationFor(rangeRef, disposition) {
  return {
    annotationRef: portableRef('annotation.vex-birth'),
    conversationRangeRef: rangeRef,
    disposition
  };
}

export function setVexBirthTrainingDisposition(annotationsValue, rangeRef, disposition) {
  if (!TRAINING_DISPOSITIONS.includes(disposition)) {
    throw new TypeError(`unsupported training disposition ${disposition}`);
  }
  const prior = Array.isArray(annotationsValue) ? annotationsValue : [];
  const support = prior.filter(
    (entry) => entry.conversationRangeRef === rangeRef && entry.disposition === 'SUPPORT_ONLY'
  );
  const others = prior.filter((entry) => entry.conversationRangeRef !== rangeRef);
  const next = [...others, ...support, annotationFor(rangeRef, disposition)];
  return validateVexBirthAnnotationSet(next);
}

export function toggleVexBirthSupportOnly(annotationsValue, rangeRef) {
  const prior = Array.isArray(annotationsValue) ? annotationsValue : [];
  const hasSupport = prior.some(
    (entry) => entry.conversationRangeRef === rangeRef && entry.disposition === 'SUPPORT_ONLY'
  );
  const next = hasSupport
    ? prior.filter(
        (entry) => !(
          entry.conversationRangeRef === rangeRef &&
          entry.disposition === 'SUPPORT_ONLY'
        )
      )
    : [...prior, annotationFor(rangeRef, 'SUPPORT_ONLY')];
  return validateVexBirthAnnotationSet(next);
}

export function annotationDispositionForRange(annotationsValue, rangeRef) {
  const dispositions = (annotationsValue ?? [])
    .filter((entry) => entry.conversationRangeRef === rangeRef)
    .map((entry) => entry.disposition);
  return Object.freeze({
    training: TRAINING_DISPOSITIONS.find((item) => dispositions.includes(item)) ?? null,
    supportOnly: dispositions.includes('SUPPORT_ONLY')
  });
}

export function supportSelectedExcerpt(turns, annotationsValue) {
  const supportRanges = new Set(
    (annotationsValue ?? [])
      .filter((entry) => entry.disposition === 'SUPPORT_ONLY')
      .map((entry) => entry.conversationRangeRef)
  );
  return (turns ?? [])
    .filter((turn) => supportRanges.has(turn.rangeRef))
    .map((turn) => [
      `Human: ${turn.humanContent}`,
      `G0: ${turn.companionContent}`
    ].join('\n'))
    .join('\n\n');
}

function supportQuestion(value) {
  return nonempty(value)
    ? value.trim()
    : 'Help me understand the current Vex Birth Lab step without changing state.';
}

export function buildVexBirthSupportArtifacts({
  projection,
  turns = [],
  annotations = [],
  question = '',
  includeSelectedExcerpt = false
} = {}) {
  const excerpt = supportSelectedExcerpt(turns, annotations);
  const supportContext = formVexBirthSupportContext(projection, {
    question: supportQuestion(question),
    selectedExcerpt: excerpt || null,
    includeSelectedExcerpt: includeSelectedExcerpt && Boolean(excerpt)
  });
  const statusPackage = formVexBirthStatusPackageModel(projection, {
    includeSelectedExcerpts: includeSelectedExcerpt && Boolean(excerpt),
    selectedExcerptCount: includeSelectedExcerpt && excerpt ? 1 : 0
  });
  return Object.freeze({
    supportContext,
    statusPackage,
    selectedExcerpt: includeSelectedExcerpt ? excerpt : ''
  });
}

function markdownSupportContext(context) {
  const lines = [
    '# Vex Birth Lab Support Context',
    '',
    `- Birth session: \`${context.birthSessionRef}\``,
    `- Chapter: **${context.currentChapter}**`,
    `- VB stage: **${context.currentVBStage}**`,
    `- Active generation: \`${context.activeGenerationRef}\``,
    `- Training effect truth: **${context.trainingEffectTruth}**`,
    `- Source currentness: **${context.sourceCurrentness}**`,
    '',
    `Question: ${context.question}`,
    ''
  ];
  if (context.selectedExcerptOrNull) {
    lines.push('## Explicitly selected excerpt', '', context.selectedExcerptOrNull, '');
  }
  lines.push(
    '## Boundaries',
    '',
    '- This export is advisory context, not execution authority.',
    '- Raw full transcript is not included.',
    '- Training consent is not inferred from support selection.',
    ''
  );
  return lines.join('\n');
}

export function buildVexBirthStatusZipEntries({
  projection,
  supportContext,
  statusPackage,
  selectedExcerpt = ''
} = {}) {
  const redactionManifest = {
    schemaVersion: 'vexlife.vex-birth-status-redaction/v1',
    rawFullTranscriptIncluded: false,
    privateMemoryIncluded: false,
    credentialsIncluded: false,
    modelWeightFilesIncluded: false,
    executionAuthorityGranted: false,
    selectedExcerptIncluded: Boolean(selectedExcerpt)
  };
  const currentStage = {
    schemaVersion: 'vexlife.vex-birth-current-stage/v1',
    birthSessionRef: projection.birthSessionRef,
    currentChapter: projection.currentChapter,
    currentVBStage: projection.currentVBStage,
    activeGenerationRef: projection.activeGenerationRef,
    modelBindingState: projection.modelBindingState,
    trainingEffectTruth: projection.trainingEffectTruth,
    sourceCurrentness: projection.sourceCurrentness
  };
  const actions = {
    schemaVersion: 'vexlife.vex-birth-actions/v1',
    availableActions: projection.availableActions,
    heldActions: projection.heldActions
  };
  const files = {
    'START-HERE.html': '<!doctype html><meta charset="utf-8"><title>Vex Birth Status</title><h1>Vex Birth Status</h1><p>This package is non-executable support context. It grants no training or activation authority.</p>',
    'BIRTH-STATUS.json': `${JSON.stringify(statusPackage, null, 2)}\n`,
    'SUPPORT-CONTEXT.md': markdownSupportContext(supportContext),
    'CURRENT-STAGE.json': `${JSON.stringify(currentStage, null, 2)}\n`,
    'AVAILABLE-ACTIONS.json': `${JSON.stringify(actions, null, 2)}\n`,
    'REDACTION-MANIFEST.json': `${JSON.stringify(redactionManifest, null, 2)}\n`
  };
  if (selectedExcerpt) files['excerpts/selected-excerpts.md'] = `${selectedExcerpt}\n`;
  return Object.freeze(files);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() & 0x1f) << 11)
    | ((date.getMinutes() & 0x3f) << 5)
    | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const day = ((year - 1980) << 9)
    | (((date.getMonth() + 1) & 0x0f) << 5)
    | (date.getDate() & 0x1f);
  return { time, day };
}

function view(size) {
  return new DataView(new ArrayBuffer(size));
}

function set16(dataView, offset, value) {
  dataView.setUint16(offset, value, true);
}

function set32(dataView, offset, value) {
  dataView.setUint32(offset, value >>> 0, true);
}

function concatBytes(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    const bytes = chunk instanceof Uint8Array
      ? chunk
      : new Uint8Array(chunk.buffer ?? chunk);
    result.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return result;
}

export function encodeStoredZip(filesValue) {
  const entries = Object.entries(filesValue ?? {});
  if (!entries.length) throw new TypeError('ZIP requires at least one file');
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  const stamp = dosDateTime();

  for (const [name, content] of entries) {
    if (!nonempty(name) || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) {
      throw new TypeError(`unsafe ZIP path ${name}`);
    }
    const nameBytes = ZIP_TEXT_ENCODER.encode(name);
    const contentBytes = content instanceof Uint8Array
      ? content
      : ZIP_TEXT_ENCODER.encode(String(content));
    const digest = crc32(contentBytes);

    const local = view(30);
    set32(local, 0, 0x04034b50);
    set16(local, 4, 20);
    set16(local, 6, 0x0800);
    set16(local, 8, 0);
    set16(local, 10, stamp.time);
    set16(local, 12, stamp.day);
    set32(local, 14, digest);
    set32(local, 18, contentBytes.byteLength);
    set32(local, 22, contentBytes.byteLength);
    set16(local, 26, nameBytes.byteLength);
    set16(local, 28, 0);
    locals.push(new Uint8Array(local.buffer), nameBytes, contentBytes);

    const central = view(46);
    set32(central, 0, 0x02014b50);
    set16(central, 4, 20);
    set16(central, 6, 20);
    set16(central, 8, 0x0800);
    set16(central, 10, 0);
    set16(central, 12, stamp.time);
    set16(central, 14, stamp.day);
    set32(central, 16, digest);
    set32(central, 20, contentBytes.byteLength);
    set32(central, 24, contentBytes.byteLength);
    set16(central, 28, nameBytes.byteLength);
    set16(central, 30, 0);
    set16(central, 32, 0);
    set16(central, 34, 0);
    set16(central, 36, 0);
    set32(central, 38, 0);
    set32(central, 42, localOffset);
    centrals.push(new Uint8Array(central.buffer), nameBytes);

    localOffset += 30 + nameBytes.byteLength + contentBytes.byteLength;
  }

  const centralBytes = concatBytes(centrals);
  const end = view(22);
  set32(end, 0, 0x06054b50);
  set16(end, 4, 0);
  set16(end, 6, 0);
  set16(end, 8, entries.length);
  set16(end, 10, entries.length);
  set32(end, 12, centralBytes.byteLength);
  set32(end, 16, localOffset);
  set16(end, 20, 0);
  return concatBytes([...locals, centralBytes, new Uint8Array(end.buffer)]);
}

function ensureCss() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-vex-birth-lab-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../vex-birth-lab.css', import.meta.url).href;
  link.dataset.vexBirthLabCss = 'true';
  document.head.append(link);
}

function staticMarkup() {
  return `
    <div class="vbl-shell" role="dialog" aria-modal="false" aria-labelledby="vblTitle">
      <header class="vbl-header">
        <div>
          <small>LOCAL ONLY · FIRST BIRTH</small>
          <h1 id="vblTitle">Vex Birth Lab</h1>
          <p id="vblTruthBanner">Checking the real local G0 binding…</p>
        </div>
        <button id="vblClose" type="button" aria-label="Close Vex Birth Lab">×</button>
      </header>

      <div class="vbl-status-strip" aria-live="polite">
        <span>Chapter <strong id="vblChapter">PREPARE</strong></span>
        <span>Stage <strong id="vblStage">VB1</strong></span>
        <span>Generation <strong>G0</strong></span>
        <span>Model <strong id="vblModelState">UNKNOWN</strong></span>
        <span>Source <strong>UNKNOWN</strong></span>
        <span>Training <strong>NOT STARTED</strong></span>
      </div>

      <div class="vbl-layout">
        <nav class="vbl-map" aria-label="Vex Birth chapters">
          <h2>Birth map</h2>
          <ol>
            <li data-vbl-map="PREPARE">1 · Prepare</li>
            <li data-vbl-map="MEET_G0">2 · Meet G0</li>
            <li data-vbl-map="CULTIVATE">3 · Cultivate</li>
            <li data-vbl-map="REVIEW_AND_FREEZE">4 · Review &amp; Freeze</li>
            <li data-vbl-map="TRAIN_AND_COMPARE">5 · Train &amp; Compare</li>
            <li data-vbl-map="ACCEPT_REJECT_WAKE">6 · Accept / Reject / Wake</li>
          </ol>
          <button id="vblRefreshStatus" type="button">Refresh G0 binding</button>
        </nav>

        <main class="vbl-main">
          <section class="vbl-panel vbl-baseline">
            <div class="vbl-panel-heading">
              <div>
                <small id="vblModeEyebrow">UNTAUGHT BASELINE</small>
                <h2 id="vblModeTitle">Meet G0 before teaching</h2>
              </div>
              <span id="vblBaselineBadge">OPEN</span>
            </div>
            <p id="vblModeExplanation">
              Nothing in this Birth session has changed neural weights. Ask what you naturally want to ask before teaching anything.
            </p>
            <div id="vblFeed" class="vbl-feed" aria-live="polite"></div>
            <form id="vblComposer" class="vbl-composer">
              <label for="vblInput">Talk with untouched G0</label>
              <textarea id="vblInput" rows="3" placeholder="Say something to G0…" required></textarea>
              <div>
                <span id="vblComposerHint">Waiting for a verified local G0 binding.</span>
                <button id="vblSend" type="submit">Send to real G0</button>
              </div>
            </form>
            <button id="vblFinishBaseline" class="vbl-primary" type="button" disabled>
              Finish untaught baseline witness
            </button>
          </section>
        </main>

        <aside class="vbl-guide">
          <h2>Birth Guide</h2>
          <div class="vbl-guide-card">
            <small>What is true?</small>
            <p id="vblGuideTruth">Training has not started.</p>
          </div>
          <div class="vbl-guide-card">
            <small>Next safe action</small>
            <p id="vblGuideNext">Verify local G0 binding.</p>
          </div>
          <details>
            <summary>What is held?</summary>
            <ul id="vblHeldActions"></ul>
          </details>
          <details>
            <summary>Annotation meanings</summary>
            <dl>
              <dt>TRAIN</dt><dd>Candidate formation example.</dd>
              <dt>COUNTEREXAMPLE</dt><dd>Behavior or overgeneralization to avoid.</dd>
              <dt>HELD OUT</dt><dd>Evaluation only; never training.</dd>
              <dt>DO NOT TRAIN</dt><dd>Explicit neural exclusion.</dd>
              <dt>SUPPORT ONLY</dt><dd>May be shared for help; grants no training consent.</dd>
            </dl>
          </details>
        </aside>
      </div>

      <footer class="vbl-footer">
        <label class="vbl-support-question">
          Support question
          <input id="vblSupportQuestion" value="Help me understand the current Vex Birth Lab step without changing state.">
        </label>
        <label><input id="vblIncludeExcerpt" type="checkbox"> Include only SUPPORT_ONLY-marked excerpts</label>
        <button id="vblCopySupport" type="button">Copy Support Context</button>
        <button id="vblStatusZip" type="button">Generate Status ZIP</button>
        <span id="vblExportStatus" role="status"></span>
      </footer>
    </div>
  `;
}

function makeTurnCard(turn, baselineClosed, annotations, onAnnotation) {
  const article = document.createElement('article');
  article.className = 'vbl-turn';
  article.dataset.rangeRef = turn.rangeRef;

  const meta = document.createElement('div');
  meta.className = 'vbl-turn-meta';
  meta.textContent = turn.phase === 'BASELINE'
    ? 'Untaught baseline · not training-selected'
    : 'Cultivation exchange · no training selection by default';

  const human = document.createElement('p');
  human.className = 'vbl-human';
  const humanStrong = document.createElement('strong');
  humanStrong.textContent = 'You';
  human.append(humanStrong, document.createTextNode(` ${turn.humanContent}`));

  const companion = document.createElement('p');
  companion.className = 'vbl-companion';
  const companionStrong = document.createElement('strong');
  companionStrong.textContent = 'G0';
  companion.append(companionStrong, document.createTextNode(` ${turn.companionContent}`));

  const marks = document.createElement('div');
  marks.className = 'vbl-marks';
  const state = annotationDispositionForRange(annotations, turn.rangeRef);

  const trainingButtons = [
    ['TRAIN', 'Teach this'],
    ['COUNTEREXAMPLE', 'Counterexample'],
    ['HELD_OUT', 'Hold out'],
    ['DO_NOT_TRAIN', 'Do not train']
  ];
  for (const [disposition, label] of trainingButtons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.disposition = disposition;
    button.disabled = !baselineClosed || turn.phase === 'BASELINE';
    button.setAttribute('aria-pressed', String(state.training === disposition));
    if (button.disabled) button.title = 'Training annotations unlock only after the untaught baseline closes.';
    button.addEventListener('click', () => onAnnotation(turn.rangeRef, disposition));
    marks.append(button);
  }

  const support = document.createElement('button');
  support.type = 'button';
  support.textContent = 'Support only';
  support.dataset.disposition = 'SUPPORT_ONLY';
  support.setAttribute('aria-pressed', String(state.supportOnly));
  support.addEventListener('click', () => onAnnotation(turn.rangeRef, 'SUPPORT_ONLY'));
  marks.append(support);

  article.append(meta, human, companion, marks);
  return article;
}

function downloadBytes(bytes, filename, type = 'application/zip') {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

function supportContextPlainText(context) {
  return markdownSupportContext(context);
}

export function createVexBirthLabController({
  root,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  clipboard = globalThis.navigator?.clipboard ?? null,
  now = () => new Date().toISOString()
} = {}) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Vex Birth Lab root is required');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  const state = {
    birthSessionRef: portableRef('birth-session.vex-birth-lab'),
    companionStatus: normalizeVexBirthCompanionStatus({ state: 'UNKNOWN' }),
    baselineClosed: false,
    turns: [],
    annotations: [],
    busy: false,
    modelTurnRequestCount: 0,
    lastStatusObservedAt: null
  };

  const q = (selector) => root.querySelector(selector);

  function projection() {
    return buildVexBirthLabProjection({
      companionStatus: state.companionStatus,
      baselineClosed: state.baselineClosed,
      baselineExchangeCount: state.turns.filter((turn) => turn.phase === 'BASELINE').length,
      cultivationExchangeCount: state.turns.filter((turn) => turn.phase === 'CULTIVATION').length,
      birthSessionRef: state.birthSessionRef
    });
  }

  function renderHeld(current) {
    const list = q('#vblHeldActions');
    list.replaceChildren();
    if (!current.heldActions.length) {
      const item = document.createElement('li');
      item.textContent = 'No Slice B annotation hold is active.';
      list.append(item);
      return;
    }
    const unique = [...new Map(
      current.heldActions.map((entry) => [entry.reasonCode, entry.reason])
    ).entries()];
    for (const [code, reason] of unique) {
      const item = document.createElement('li');
      item.textContent = `${code}: ${reason}`;
      list.append(item);
    }
  }

  function renderFeed() {
    const feed = q('#vblFeed');
    feed.replaceChildren();
    if (!state.turns.length) {
      const empty = document.createElement('div');
      empty.className = 'vbl-empty';
      empty.textContent = state.companionStatus.state === 'BOUND'
        ? 'No baseline exchange yet. Your first real G0 turn will appear here.'
        : 'G0 is not currently available here. No synthetic reply will be substituted.';
      feed.append(empty);
      return;
    }
    for (const turn of state.turns) {
      feed.append(makeTurnCard(
        turn,
        state.baselineClosed,
        state.annotations,
        (rangeRef, disposition) => {
          state.annotations = disposition === 'SUPPORT_ONLY'
            ? [...toggleVexBirthSupportOnly(state.annotations, rangeRef)]
            : [...setVexBirthTrainingDisposition(state.annotations, rangeRef, disposition)];
          render();
        }
      ));
    }
  }

  function render() {
    const current = projection();
    q('#vblChapter').textContent = current.currentChapter;
    q('#vblStage').textContent = current.currentVBStage;
    q('#vblModelState').textContent = current.modelBindingState;
    q('#vblTruthBanner').textContent = current.modelBindingState === 'BOUND'
      ? `Vex · Generation G0 · ${state.baselineClosed ? 'Cultivation candidate session' : 'Untaught baseline'} · neural training NOT STARTED`
      : `G0 ${current.modelBindingState.toLowerCase().replaceAll('_', ' ')} — no synthetic reply substituted.`;
    q('#vblGuideTruth').textContent = current.modelBindingState === 'BOUND'
      ? `Real local Companion binding is BOUND. Training effect truth remains ${current.trainingEffectTruth}.`
      : `Real local Companion binding is ${current.modelBindingState}. Training effect truth remains ${current.trainingEffectTruth}.`;
    q('#vblGuideNext').textContent = current.primaryAction.label;
    q('#vblBaselineBadge').textContent = state.baselineClosed ? 'CLOSED' : 'OPEN';
    q('#vblModeEyebrow').textContent = state.baselineClosed ? 'CULTIVATION' : 'UNTAUGHT BASELINE';
    q('#vblModeTitle').textContent = state.baselineClosed ? 'Cultivate deliberately' : 'Meet G0 before teaching';
    q('#vblModeExplanation').textContent = state.baselineClosed
      ? 'Nothing is selected for neural formation by default. Mark only the exchanges that actually express a lesson, counterexample, held-out check, exclusion, or support excerpt.'
      : 'Nothing in this Birth session has changed neural weights. Ask what you naturally want to ask before teaching anything. Baseline exchanges cannot become training selections in Slice B.';
    const send = q('#vblSend');
    const input = q('#vblInput');
    const bound = current.modelBindingState === 'BOUND';
    send.disabled = !bound || state.busy;
    input.disabled = !bound || state.busy;
    q('#vblComposerHint').textContent = state.busy
      ? 'Waiting for the real local G0 response…'
      : bound
        ? (state.baselineClosed ? 'Real G0 conversation · mark exchanges explicitly after they return.' : 'Untaught G0 · baseline questions are never auto-selected for training.')
        : 'Waiting for a verified local G0 binding.';
    const baselineTurns = state.turns.filter((turn) => turn.phase === 'BASELINE').length;
    q('#vblFinishBaseline').disabled = state.baselineClosed || baselineTurns === 0 || !bound;
    q('#vblFinishBaseline').hidden = state.baselineClosed;
    for (const item of root.querySelectorAll('[data-vbl-map]')) {
      item.dataset.current = String(item.dataset.vblMap === current.currentChapter);
    }
    renderHeld(current);
    renderFeed();
  }

  async function refreshStatus() {
    try {
      const response = await fetchImpl(VEX_BIRTH_COMPANION_STATUS_PATH, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.companionStatus = normalizeVexBirthCompanionStatus(await response.json());
    } catch {
      state.companionStatus = normalizeVexBirthCompanionStatus({
        state: 'UNKNOWN',
        failureCode: 'COMPANION_STATUS_UNAVAILABLE'
      });
    }
    state.lastStatusObservedAt = now();
    render();
    return state.companionStatus;
  }

  async function sendTurn(content) {
    if (state.companionStatus.state !== 'BOUND') {
      throw new Error('Real local G0 is not bound; no synthetic turn is allowed.');
    }
    state.busy = true;
    state.modelTurnRequestCount += 1;
    render();
    try {
      const response = await fetchImpl(VEX_BIRTH_COMPANION_TURN_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({
          projectRef: 'project.local-vex',
          threadRef: 'thread.vex-birth-lab.first-g0',
          channelRef: 'channel.vex-birth-lab.first-g0.companion',
          content,
          selectedNodeRef: 'terrain.project.local-vex',
          screenRef: 'screen.vexlife.chat'
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || !nonempty(payload.content)) {
        const code = payload?.failureCode ?? payload?.code ?? `HTTP_${response.status}`;
        throw new Error(`Local Companion turn failed safely (${code}); no synthetic reply was substituted.`);
      }
      const turn = {
        rangeRef: portableRef('range.vex-birth-lab'),
        phase: state.baselineClosed ? 'CULTIVATION' : 'BASELINE',
        humanContent: content,
        companionContent: payload.content,
        turnRef: payload.turnRef ?? null,
        responseMessageRef: payload.responseMessageRef ?? null,
        conversationHeadSha256: payload.conversationHeadSha256 ?? null
      };
      state.turns.push(turn);
      return Object.freeze(structuredClone(turn));
    } finally {
      state.busy = false;
      render();
    }
  }

  function finishBaseline() {
    const baselineTurns = state.turns.filter((turn) => turn.phase === 'BASELINE').length;
    if (state.companionStatus.state !== 'BOUND' || baselineTurns === 0) {
      throw new Error('At least one real untaught G0 exchange is required before baseline closure.');
    }
    state.baselineClosed = true;
    render();
    return projection();
  }

  function supportArtifacts() {
    return buildVexBirthSupportArtifacts({
      projection: projection(),
      turns: state.turns,
      annotations: state.annotations,
      question: q('#vblSupportQuestion').value,
      includeSelectedExcerpt: q('#vblIncludeExcerpt').checked
    });
  }

  async function copySupport() {
    const status = q('#vblExportStatus');
    try {
      const artifacts = supportArtifacts();
      const text = markdownSupportContext(artifacts.supportContext);
      if (!clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await clipboard.writeText(text);
      status.textContent = 'Support context copied. It grants no execution or training authority.';
    } catch (error) {
      status.textContent = `Support export held: ${error.message}`;
    }
  }

  function generateStatusZip() {
    const status = q('#vblExportStatus');
    try {
      const artifacts = supportArtifacts();
      const entries = buildVexBirthStatusZipEntries({
        projection: projection(),
        ...artifacts
      });
      const bytes = encodeStoredZip(entries);
      downloadBytes(
        bytes,
        `Vex-Birth-Status-${state.birthSessionRef.replaceAll('.', '-')}.zip`
      );
      status.textContent = 'Status ZIP generated. It is non-executable context only.';
    } catch (error) {
      status.textContent = `Status ZIP held: ${error.message}`;
    }
  }

  q('#vblRefreshStatus').addEventListener('click', refreshStatus);
  q('#vblClose').addEventListener('click', () => close());
  q('#vblFinishBaseline').addEventListener('click', () => {
    try {
      finishBaseline();
    } catch (error) {
      q('#vblExportStatus').textContent = error.message;
    }
  });
  q('#vblComposer').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = q('#vblInput');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
      await sendTurn(content);
    } catch (error) {
      q('#vblExportStatus').textContent = error.message;
    }
  });
  q('#vblCopySupport').addEventListener('click', copySupport);
  q('#vblStatusZip').addEventListener('click', generateStatusZip);

  function open() {
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.querySelector('#surfaceMenu')?.setAttribute('hidden', '');
    root.querySelector('#vblClose')?.focus();
    refreshStatus();
  }

  function close() {
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.querySelector('#openVexBirthLab')?.focus();
  }

  function snapshot() {
    const current = projection();
    return Object.freeze({
      schemaVersion: 'vexlife.vex-birth-lab-browser-snapshot/v1',
      birthSessionRef: state.birthSessionRef,
      currentChapter: current.currentChapter,
      currentVBStage: current.currentVBStage,
      activeGenerationRef: current.activeGenerationRef,
      modelBindingState: current.modelBindingState,
      trainingEffectTruth: current.trainingEffectTruth,
      baselineClosed: state.baselineClosed,
      baselineExchangeCount: state.turns.filter((turn) => turn.phase === 'BASELINE').length,
      cultivationExchangeCount: state.turns.filter((turn) => turn.phase === 'CULTIVATION').length,
      annotationCount: state.annotations.length,
      modelTurnRequestCount: state.modelTurnRequestCount,
      lastStatusObservedAt: state.lastStatusObservedAt,
      rawTranscriptIncluded: false
    });
  }

  render();
  return Object.freeze({
    open,
    close,
    refreshStatus,
    sendTurn,
    finishBaseline,
    projection,
    snapshot
  });
}

export function installVexBirthLab() {
  if (typeof document === 'undefined') return null;
  if (document.querySelector('#vexBirthLabSurface')) {
    return globalThis.__vexBirthLabController ?? null;
  }
  ensureCss();

  const menu = document.querySelector('#surfaceMenu');
  const app = document.querySelector('#app');
  if (!menu || !app) return null;

  const button = document.createElement('button');
  button.id = 'openVexBirthLab';
  button.type = 'button';
  button.dataset.nodeRef = 'element.vex-birth-lab.open';
  button.textContent = 'Vex Birth Lab';
  const health = menu.querySelector('#openHealth');
  if (health) health.after(button);
  else menu.append(button);

  const surface = document.createElement('aside');
  surface.id = 'vexBirthLabSurface';
  surface.className = 'vex-birth-lab-surface';
  surface.hidden = true;
  surface.setAttribute('aria-hidden', 'true');
  surface.dataset.nodeRef = 'screen.vexlife.vex-birth-lab';
  surface.innerHTML = staticMarkup();
  app.append(surface);

  const controller = createVexBirthLabController({ root: surface });
  globalThis.__vexBirthLabController = controller;
  globalThis.__vexBirthLabDiagnostics = Object.freeze({
    snapshot: () => controller.snapshot()
  });
  button.addEventListener('click', controller.open);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !surface.hidden) controller.close();
  });

  controller.refreshStatus();
  return controller;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installVexBirthLab(), { once: true });
  } else {
    queueMicrotask(() => installVexBirthLab());
  }
}

// [VXG RealForever]
