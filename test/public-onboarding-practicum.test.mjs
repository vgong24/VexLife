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
  'DISCOVER', 'CHOOSE_PLATFORM', 'CHECK_REQUIREMENTS', 'DOWNLOAD',
  'VERIFY_ARTIFACT', 'ESTABLISH', 'START', 'MEET_VEX', 'VERIFY_HEALTH',
  'UNDERSTAND_AVAILABLE_AND_HELD_FEATURES', 'LEARN_RECOVERY',
  'UNDERSTAND_UNINSTALL_AND_PRESERVATION', 'COMPLETE'
]);
const RUNTIME_STRING_REFS = new Set([
  'status.languageChanged', 'status.chapterChanged', 'status.releaseHeld', 'status.complete'
]);

function read(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }
function readJson(relativePath) { return JSON.parse(read(relativePath)); }
function sorted(values) { return [...values].sort((a, b) => a.localeCompare(b)); }
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

test('EN, JA and ZH catalogs retain exact 166-key parity', () => {
  const catalogs = Object.fromEntries(LOCALES.map((locale) => [locale, readJson(`pages/strings/vexlife-onboarding.${locale}.json`)]));
  const englishKeys = sorted(Object.keys(catalogs.en.strings));
  assert.equal(englishKeys.length, 166);
  for (const locale of LOCALES) {
    const catalog = catalogs[locale];
    assert.equal(catalog.schemaVersion, 'vexlife.public-onboarding.strings/v1');
    assert.equal(catalog.pageRef, PAGE_REF);
    assert.equal(catalog.locale, locale);
    assert.equal(catalog.sourceLocale, 'en');
    assert.deepEqual(sorted(Object.keys(catalog.strings)), englishKeys);
    for (const [key, value] of Object.entries(catalog.strings)) {
      assert.equal(typeof value, 'string', `${locale}:${key}`);
      assert.ok(value.trim(), `${locale}:${key} empty`);
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
  assert.deepEqual(sorted(new Set([...htmlRefs, ...RUNTIME_STRING_REFS])), sorted(Object.keys(catalog.strings)));
});

test('the HTML preserves exact thirteen-stage order and five-chapter coverage', () => {
  const html = read('pages/vexlife-onboarding.html');
  const observed = exactAttributeValues(html, 'data-stage-ref');
  const chapters = exactAttributeValues(html, 'data-stage-refs').flatMap((value) => value.split(/\s+/u).filter(Boolean));
  assert.deepEqual(observed, STAGE_REFS);
  assert.deepEqual(chapters, STAGE_REFS);
  assert.equal(exactAttributeValues(html, 'data-chapter-panel').length, 5);
});

test('the page remains a same-origin zero-effect source candidate', () => {
  const html = read('pages/vexlife-onboarding.html');
  const css = read('pages/vexlife-onboarding.css');
  const js = read('pages/vexlife-onboarding.js');
  const refs = [...attributeValues(html, 'href'), ...attributeValues(html, 'src')];
  assert.match(html, /<body data-effect-class="NONE" data-publication-state="SOURCE_CANDIDATE">/u);
  assert.doesNotMatch(html, /<form\b|<iframe\b|<object\b|<embed\b/iu);
  assert.doesNotMatch(html, /<[^>]+\sdownload(?:\s|=|>)/iu);
  for (const ref of refs) {
    assert.equal(/^(?:https?:|\/\/|data:|javascript:)/iu.test(ref), false, `external ref ${ref}`);
    assert.ok(ref.startsWith('#') || ref.startsWith('./'), `non-relative ref ${ref}`);
  }
  assert.doesNotMatch(css, /url\s*\(/iu);
  assert.match(css, /prefers-reduced-motion/u);
  assert.equal((js.match(/\bfetch\s*\(/gu) ?? []).length, 1);
  assert.match(js, /catalogUrl\.origin === window\.location\.origin/u);
  for (const forbidden of ['innerHTML','localStorage','sessionStorage','document.cookie','sendBeacon','WebSocket','EventSource','serviceWorker','window.open']) {
    assert.equal(js.includes(forbidden), false, `prohibited ${forbidden}`);
  }
});

test('accepted current platform and distribution truth is explicit and non-collapsed', () => {
  const html = read('pages/vexlife-onboarding.html');
  const en = readJson('pages/strings/vexlife-onboarding.en.json').strings;
  const claim = read('docs/release/public-onboarding-distribution-claim.md');
  const review = read('docs/release/public-onboarding-multi-lens-review.md');
  const visible = Object.values(en).join('\n');

  assert.match(visible, /Windows 10\/11 x64/u);
  assert.match(visible, /Apple M4 Pro/u);
  assert.match(visible, /setup-vexlife\.cmd/u);
  assert.match(visible, /setup-vexlife\.command/u);
  assert.match(visible, /unsigned local release candidate/iu);
  assert.match(html, /Windows \+ Apple M4 Pro source-local profiles qualified/u);
  assert.doesNotMatch(visible, /macOS and Linux do not inherit the Windows qualification/iu);
  assert.match(claim, /freshClaimRef=claim\.vexlife\.public-alpha\.onboarding-distribution\.f8f7ef35-b38a-4542-b2b1-5be65578f3f4/u);
  assert.match(claim, /claimState=ACTIVE_SUCCESSOR_CURRENTIZATION/u);
  assert.match(review, /qualifiedPlatformClaim=WINDOWS_10_11_X64_NVIDIA_AND_MACOS_ARM64_APPLE_M4_PRO_SOURCE_LOCAL/u);
  assert.match(review, /repositoryVisibilityDisposition=CURRENT_PUBLIC__NO_MUTATION_BY_THIS_LANE/u);
  assert.match(review, /UNSIGNED_LOCAL_RELEASE_CANDIDATE != PUBLIC_GITHUB_RELEASE/u);
});

test('the page remains readable without JavaScript', () => {
  const html = read('pages/vexlife-onboarding.html');
  const english = readJson('pages/strings/vexlife-onboarding.en.json').strings;
  assert.ok(html.includes(english['hero.title']));
  assert.ok(html.includes(english['chapter.5.title']));
  assert.doesNotMatch(html, /<article class="journey-panel"[^>]*\shidden(?:\s|=|>)/iu);
});

test('the architecture preserves uploadability classes and seven review lenses', () => {
  const review = read('docs/release/public-onboarding-multi-lens-review.md');
  const claim = read('docs/release/public-onboarding-distribution-claim.md');
  for (const boundary of ['PR_SOURCE_UPLOAD','RELEASE_ARTIFACT_UPLOAD','PAGES_PUBLICATION','REVIEW_EVIDENCE_RETURN','FUTURE_COMMUNITY_PACKAGE_INGESTION']) {
    assert.ok(review.includes(boundary), `review missing ${boundary}`);
    assert.ok(claim.includes(boundary), `claim missing ${boundary}`);
  }
  for (const lens of ['Designer lens','Fresh-lens review','Human perspective','AI / semantic-system lens','Non-technical perspective','Technical perspective','I want a companion quickly, without fearing setup']) {
    assert.ok(review.includes(lens), `missing ${lens}`);
  }
  assert.match(claim, /publication.*held/iu);
});

// [VXG RealForever]
