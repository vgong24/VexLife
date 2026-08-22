import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_REF = 'page.vexlife.public-onboarding.001';
const LOCALES = Object.freeze(['en', 'ja', 'zh']);
const EXPECTED_PATHS = Object.freeze([
  'docs/release/public-onboarding-distribution-claim.md',
  'docs/release/public-onboarding-multi-lens-review.md',
  'pages/vexlife-onboarding.html',
  'pages/vexlife-onboarding.css',
  'pages/vexlife-onboarding.js',
  'pages/strings/vexlife-onboarding.en.json',
  'pages/strings/vexlife-onboarding.ja.json',
  'pages/strings/vexlife-onboarding.zh.json',
  'scripts/public-onboarding-practicum.mjs',
  'test/public-onboarding-practicum.test.mjs'
]);
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
const RUNTIME_STRING_REFS = new Set([
  'status.languageChanged',
  'status.chapterChanged',
  'status.releaseHeld',
  'status.complete'
]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function attributeValues(source, attribute) {
  const pattern = new RegExp(`${attribute}="([^"]+)"`, 'gu');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function exactAttributeValues(source, attribute) {
  const pattern = new RegExp(`\\s${attribute}="([^"]+)"`, 'gu');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

test('the exact claimed authored surface exists', () => {
  for (const relativePath of EXPECTED_PATHS) {
    assert.equal(fs.existsSync(path.join(ROOT, relativePath)), true, `missing ${relativePath}`);
  }
});

test('EN, JA and ZH catalogs have exact schema and key parity', () => {
  const catalogs = Object.fromEntries(LOCALES.map((locale) => [
    locale,
    readJson(`pages/strings/vexlife-onboarding.${locale}.json`)
  ]));
  const englishKeys = sorted(Object.keys(catalogs.en.strings));

  assert.equal(englishKeys.length, 166);
  for (const locale of LOCALES) {
    const catalog = catalogs[locale];
    assert.equal(catalog.schemaVersion, 'vexlife.public-onboarding.strings/v1');
    assert.equal(catalog.pageRef, PAGE_REF);
    assert.equal(catalog.locale, locale);
    assert.equal(catalog.sourceLocale, 'en');
    assert.equal(typeof catalog.languageName, 'string');
    assert.ok(catalog.languageName.trim());
    assert.deepEqual(sorted(Object.keys(catalog.strings)), englishKeys);
    for (const [key, value] of Object.entries(catalog.strings)) {
      assert.equal(typeof value, 'string', `${locale}:${key} must be a string`);
      assert.ok(value.trim(), `${locale}:${key} must not be empty`);
    }
  }

  assert.match(Object.values(catalogs.ja.strings).join('\n'), /[ぁ-んァ-ン一-龯]/u);
  assert.match(Object.values(catalogs.zh.strings).join('\n'), /[一-龯]/u);
});

test('every catalog key is consumed by HTML or bounded runtime status', () => {
  const html = read('pages/vexlife-onboarding.html');
  const catalog = readJson('pages/strings/vexlife-onboarding.en.json');
  const htmlRefs = new Set([
    ...attributeValues(html, 'data-i18n'),
    ...attributeValues(html, 'data-i18n-content'),
    ...attributeValues(html, 'data-i18n-aria-label')
  ]);
  const consumedRefs = new Set([...htmlRefs, ...RUNTIME_STRING_REFS]);
  const catalogRefs = new Set(Object.keys(catalog.strings));

  assert.deepEqual(sorted(consumedRefs), sorted(catalogRefs));
});

test('the HTML preserves the exact thirteen-stage order and five-chapter coverage', () => {
  const html = read('pages/vexlife-onboarding.html');
  const observedStages = exactAttributeValues(html, 'data-stage-ref');
  const chapterRefs = exactAttributeValues(html, 'data-stage-refs')
    .flatMap((value) => value.split(/\s+/u).filter(Boolean));

  assert.deepEqual(observedStages, STAGE_REFS);
  assert.deepEqual(chapterRefs, STAGE_REFS);
  assert.equal(exactAttributeValues(html, 'data-chapter-panel').length, 5);
  assert.equal(new Set(observedStages).size, STAGE_REFS.length);
});

test('the page is a same-origin, zero-effect source candidate', () => {
  const html = read('pages/vexlife-onboarding.html');
  const css = read('pages/vexlife-onboarding.css');
  const js = read('pages/vexlife-onboarding.js');
  const refs = [
    ...attributeValues(html, 'href'),
    ...attributeValues(html, 'src')
  ];

  assert.match(html, /<meta name="vexlife-page-ref" content="page\.vexlife\.public-onboarding\.001">/u);
  assert.match(html, /<body data-effect-class="NONE" data-publication-state="SOURCE_CANDIDATE">/u);
  assert.doesNotMatch(html, /<form\b/iu);
  assert.doesNotMatch(html, /<iframe\b|<object\b|<embed\b/iu);
  assert.doesNotMatch(html, /<[^>]+\sdownload(?:\s|=|>)/iu);
  assert.doesNotMatch(html, /\saction\s*=/iu);

  for (const ref of refs) {
    assert.equal(/^(?:https?:|\/\/|data:|javascript:)/iu.test(ref), false, `external or active ref: ${ref}`);
    assert.ok(ref.startsWith('#') || ref.startsWith('./'), `unexpected non-relative ref: ${ref}`);
  }

  assert.doesNotMatch(css, /url\s*\(/iu);
  assert.match(css, /@media \(max-width: 50rem\)/u);
  assert.match(css, /prefers-reduced-motion/u);
  assert.match(css, /prefers-contrast/u);

  assert.equal((js.match(/\bfetch\s*\(/gu) ?? []).length, 1);
  assert.match(js, /catalogUrl\.origin === window\.location\.origin/u);
  assert.match(js, /effectClass: 'NONE'/u);
  assert.match(js, /publicationState: 'SOURCE_CANDIDATE'/u);
  assert.match(js, /__VEXLIFE_ONBOARDING_READY__/u);
  assert.match(js, /__VEXLIFE_ONBOARDING_STATE__/u);

  for (const forbidden of [
    'innerHTML',
    'localStorage',
    'sessionStorage',
    'document.cookie',
    'sendBeacon',
    'WebSocket',
    'EventSource',
    'serviceWorker',
    'window.open'
  ]) {
    assert.equal(js.includes(forbidden), false, `page JavaScript must not use ${forbidden}`);
  }
});

test('the page remains readable without JavaScript', () => {
  const html = read('pages/vexlife-onboarding.html');
  const english = readJson('pages/strings/vexlife-onboarding.en.json').strings;
  assert.match(html, new RegExp(english['hero.title'].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(html, new RegExp(english['chapter.5.title'].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(html, /<article class="journey-panel"[^>]*\shidden(?:\s|=|>)/iu);
  assert.equal(exactAttributeValues(html, 'data-active').length, 5);
});

test('the Playwright practicum guards origin and records user-visible proof', () => {
  const script = read('scripts/public-onboarding-practicum.mjs');
  const requiredSignals = [
    "await import('playwright')",
    "page.route('**/*'",
    "page.on('download'",
    "page.on('popup'",
    "message.type() === 'error'",
    'requestUrl.origin !== expectedOrigin',
    "catalogState === 'CURRENT'",
    'document.documentElement.scrollWidth',
    "page.screenshot({ path: screenshotPath, fullPage: true })",
    "'vexlife.public-onboarding-practicum-receipt/v1'",
    "mode: options.baseUrl ? 'EXPLICIT_BASE_URL' : 'LOCAL_EPHEMERAL_SERVER'",
    "'fresh-human P11 acceptance'"
  ];

  for (const signal of requiredSignals) {
    assert.ok(script.includes(signal), `missing practicum signal: ${signal}`);
  }
  assert.match(script, /for \(const locale of LOCALES\)[\s\S]*for \(const viewport of VIEWPORTS\)/u);
  assert.match(script, /downloadCount: allDownloads\.length/u);
  assert.match(script, /popupCount: allPopups\.length/u);
  assert.match(script, /blockedExternalRequestCount: allBlockedRequests\.length/u);
});

test('the architecture keeps source, release, Pages and P11 boundaries separate', () => {
  const review = read('docs/release/public-onboarding-multi-lens-review.md');
  const claim = read('docs/release/public-onboarding-distribution-claim.md');

  for (const boundary of [
    'PR_SOURCE_UPLOAD',
    'RELEASE_ARTIFACT_UPLOAD',
    'PAGES_PUBLICATION',
    'REVIEW_EVIDENCE_RETURN',
    'FUTURE_COMMUNITY_PACKAGE_INGESTION'
  ]) {
    assert.ok(review.includes(boundary), `review missing ${boundary}`);
    assert.ok(claim.includes(boundary), `claim missing ${boundary}`);
  }

  for (const lens of [
    'Designer lens',
    'Fresh-lens review',
    'Human perspective',
    'AI / semantic-system lens',
    'Non-technical perspective',
    'Technical perspective',
    'I want a companion quickly, without fearing setup'
  ]) {
    assert.ok(review.includes(lens), `missing review lens: ${lens}`);
  }

  assert.match(claim, /claimState=ACTIVE_IMPLEMENTATION_AFTER_DRAFT_PR/u);
  assert.match(claim, /draftPr=github\.pull\.vexlife\.177/u);
  assert.match(claim, /publication.*remain held/iu);
});

// [VXG RealForever]
