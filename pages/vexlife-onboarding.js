const PAGE_REF = 'page.vexlife.public-onboarding.001';
const CATALOG_SCHEMA = 'vexlife.public-onboarding.strings/v1';
const SUPPORTED_LOCALES = Object.freeze(['en', 'ja', 'zh']);
const STAGE_REFS = Object.freeze([
  'DISCOVER',
  'CHOOSE_PLATFORM',
  'CHECK_REQUIREMENTS',
  'DOWNLOAD',
  'VERIFY_ARTIFACT',
  'ESTABLISH',
  'START',
  'MEET_VEX',
  'VERIFY_HEALTH',
  'UNDERSTAND_AVAILABLE_AND_HELD_FEATURES',
  'LEARN_RECOVERY',
  'UNDERSTAND_UNINSTALL_AND_PRESERVATION',
  'COMPLETE'
]);
const CATALOG_URLS = Object.freeze(Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    new URL(`./strings/vexlife-onboarding.${locale}.json`, import.meta.url)
  ])
));

const state = {
  pageRef: PAGE_REF,
  locale: 'en',
  chapterIndex: 0,
  chapterCount: 5,
  complete: false,
  statusRef: null,
  effectClass: 'NONE',
  publicationState: 'SOURCE_CANDIDATE',
  catalogState: 'LOADING',
  stageRefs: [...STAGE_REFS]
};

const catalogCache = new Map();
let activeStrings = null;
let canonicalKeys = null;

window.__VEXLIFE_ONBOARDING_READY__ = false;
window.__VEXLIFE_ONBOARDING_STATE__ = { ...state, stageRefs: [...state.stageRefs] };

function updatePublicState() {
  window.__VEXLIFE_ONBOARDING_STATE__ = {
    ...state,
    stageRefs: [...state.stageRefs]
  };
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedKeys(value) {
  return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateCatalog(catalog, expectedLocale) {
  invariant(catalog && typeof catalog === 'object', `Catalog ${expectedLocale} must be an object`);
  invariant(catalog.schemaVersion === CATALOG_SCHEMA, `Catalog ${expectedLocale} has the wrong schema`);
  invariant(catalog.pageRef === PAGE_REF, `Catalog ${expectedLocale} has the wrong pageRef`);
  invariant(catalog.locale === expectedLocale, `Catalog ${expectedLocale} has the wrong locale`);
  invariant(catalog.sourceLocale === 'en', `Catalog ${expectedLocale} must name en as sourceLocale`);
  invariant(typeof catalog.languageName === 'string' && catalog.languageName.trim(), `Catalog ${expectedLocale} needs a languageName`);
  invariant(catalog.strings && typeof catalog.strings === 'object' && !Array.isArray(catalog.strings), `Catalog ${expectedLocale} needs strings`);

  for (const [key, value] of Object.entries(catalog.strings)) {
    invariant(typeof key === 'string' && key.length > 0, `Catalog ${expectedLocale} has an empty key`);
    invariant(typeof value === 'string' && value.trim().length > 0, `Catalog ${expectedLocale} has an empty value for ${key}`);
  }

  const keys = sortedKeys(catalog.strings);
  if (expectedLocale === 'en') {
    canonicalKeys = keys;
  } else {
    invariant(Array.isArray(canonicalKeys), 'English catalog must be loaded first');
    invariant(arraysEqual(keys, canonicalKeys), `Catalog ${expectedLocale} does not exactly match the English keys`);
  }

  return catalog;
}

async function loadCatalog(locale) {
  invariant(SUPPORTED_LOCALES.includes(locale), `Unsupported locale: ${locale}`);
  if (catalogCache.has(locale)) return catalogCache.get(locale);

  if (!catalogCache.has('en') && locale !== 'en') await loadCatalog('en');

  const catalogUrl = CATALOG_URLS[locale];
  invariant(catalogUrl.origin === window.location.origin, `Catalog ${locale} must remain same-origin`);
  const response = await fetch(catalogUrl, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error'
  });
  invariant(response.ok, `Catalog ${locale} request failed with ${response.status}`);
  const catalog = validateCatalog(await response.json(), locale);
  catalogCache.set(locale, catalog);
  return catalog;
}

function text(key) {
  const value = activeStrings?.[key];
  invariant(typeof value === 'string' && value.length > 0, `Missing active string: ${key}`);
  return value;
}

function interpolate(template, values = {}) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/gu, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function applyStrings(strings) {
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    invariant(typeof strings[key] === 'string', `Missing visible string: ${key}`);
    element.textContent = strings[key];
  });

  document.querySelectorAll('[data-i18n-content]').forEach((element) => {
    const key = element.dataset.i18nContent;
    invariant(typeof strings[key] === 'string', `Missing content string: ${key}`);
    element.setAttribute('content', strings[key]);
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    invariant(typeof strings[key] === 'string', `Missing aria-label string: ${key}`);
    element.setAttribute('aria-label', strings[key]);
  });
}

function setStatus(key, values = {}) {
  const status = document.querySelector('[data-runtime-status]');
  if (status && activeStrings) status.textContent = interpolate(text(key), values);
  state.statusRef = key;
  updatePublicState();
}

function chapterTitle(index) {
  return text(`chapter.${index + 1}.title`);
}

function renderChapter(index, { announce = true } = {}) {
  const nextIndex = Math.max(0, Math.min(state.chapterCount - 1, Number(index)));
  state.chapterIndex = nextIndex;
  state.complete = false;

  document.querySelectorAll('[data-chapter-button]').forEach((button) => {
    const selected = Number(button.dataset.chapterButton) === nextIndex;
    if (selected) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });

  document.querySelectorAll('[data-chapter-panel]').forEach((panel) => {
    const selected = Number(panel.dataset.chapterPanel) === nextIndex;
    panel.dataset.active = String(selected);
    panel.hidden = !selected;
  });

  const previous = document.querySelector('[data-previous]');
  const next = document.querySelector('[data-next]');
  const complete = document.querySelector('[data-complete]');
  const completionCopy = document.querySelector('[data-completion-copy]');
  if (previous) previous.disabled = nextIndex === 0;
  if (next) next.hidden = nextIndex === state.chapterCount - 1;
  if (complete) complete.hidden = nextIndex !== state.chapterCount - 1;
  if (completionCopy) completionCopy.hidden = true;

  const progressText = document.querySelector('[data-progress-text]');
  const progressBar = document.querySelector('[data-progress-bar]');
  const progressTrack = progressBar?.closest('[role="progressbar"]');
  if (progressText) progressText.textContent = `${nextIndex + 1} / ${state.chapterCount}`;
  if (progressBar) progressBar.style.width = `${((nextIndex + 1) / state.chapterCount) * 100}%`;
  if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(nextIndex + 1));

  if (announce) {
    setStatus('status.chapterChanged', {
      current: nextIndex + 1,
      total: state.chapterCount,
      title: chapterTitle(nextIndex)
    });
  } else {
    updatePublicState();
  }
}

function bindChapterControls() {
  document.querySelectorAll('[data-chapter-button]').forEach((button) => {
    button.addEventListener('click', () => renderChapter(Number(button.dataset.chapterButton)));
  });

  document.querySelector('[data-previous]')?.addEventListener('click', () => {
    renderChapter(state.chapterIndex - 1);
  });

  document.querySelector('[data-next]')?.addEventListener('click', () => {
    renderChapter(state.chapterIndex + 1);
  });

  document.querySelector('[data-complete]')?.addEventListener('click', () => {
    state.complete = true;
    const completionCopy = document.querySelector('[data-completion-copy]');
    if (completionCopy) completionCopy.hidden = false;
    setStatus('status.complete');
  });
}

function bindHeldReleaseControl() {
  const button = document.querySelector('[data-release-held]');
  const copy = document.querySelector('[data-release-copy]');
  if (!button || !copy) return;

  button.setAttribute('aria-expanded', 'false');
  button.removeAttribute('aria-disabled');
  button.addEventListener('click', () => {
    const willOpen = copy.hidden;
    copy.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
    setStatus('status.releaseHeld');
  });
}

async function setLocale(locale, { announce = true } = {}) {
  const selectedLocale = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  const catalog = await loadCatalog(selectedLocale);
  activeStrings = catalog.strings;
  state.locale = selectedLocale;
  state.catalogState = 'CURRENT';

  document.documentElement.lang = selectedLocale;
  applyStrings(activeStrings);
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.language === selectedLocale));
  });

  renderChapter(state.chapterIndex, { announce: false });
  if (announce) {
    setStatus('status.languageChanged', { language: catalog.languageName });
  } else {
    setStatus('status.chapterChanged', {
      current: state.chapterIndex + 1,
      total: state.chapterCount,
      title: chapterTitle(state.chapterIndex)
    });
  }
}

function bindLanguageControls() {
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', async () => {
      const locale = button.dataset.language;
      try {
        await setLocale(locale);
      } catch (error) {
        state.catalogState = 'ERROR';
        updatePublicState();
        console.error(error);
      }
    });
  });
}

function verifyStaticContract() {
  invariant(document.body.dataset.effectClass === 'NONE', 'Page effect class must remain NONE');
  invariant(document.body.dataset.publicationState === 'SOURCE_CANDIDATE', 'Page publication state must remain SOURCE_CANDIDATE');

  const observedStageRefs = [...document.querySelectorAll('[data-stage-ref]')]
    .map((element) => element.dataset.stageRef);
  invariant(arraysEqual(observedStageRefs, STAGE_REFS), 'Rendered stage order does not match the accepted journey');

  const panelStageRefs = [...document.querySelectorAll('[data-chapter-panel]')]
    .flatMap((panel) => panel.dataset.stageRefs.split(/\s+/u).filter(Boolean));
  invariant(arraysEqual(panelStageRefs, STAGE_REFS), 'Chapter stage coverage does not match the accepted journey');

  invariant(document.querySelectorAll('[data-chapter-panel]').length === state.chapterCount, 'Expected exactly five chapters');
}

async function initialize() {
  verifyStaticContract();
  bindChapterControls();
  bindHeldReleaseControl();
  bindLanguageControls();
  document.body.dataset.enhanced = 'true';

  const requestedLocale = new URL(window.location.href).searchParams.get('lang');
  const initialLocale = SUPPORTED_LOCALES.includes(requestedLocale) ? requestedLocale : 'en';

  try {
    await loadCatalog('en');
    await setLocale(initialLocale, { announce: false });
  } catch (error) {
    state.locale = 'en';
    state.catalogState = 'FALLBACK_ENGLISH_LOAD_ERROR';
    state.statusRef = 'CATALOG_LOAD_ERROR';
    updatePublicState();
    console.error(error);
    renderChapter(0, { announce: false });
  }

  window.__VEXLIFE_ONBOARDING_READY__ = true;
  updatePublicState();
}

initialize();

// [VXG RealForever]
