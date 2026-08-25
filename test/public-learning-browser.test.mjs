import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildPublicLearningProjection } from '../src/core/public-learning.mjs';
import { buildPublicPresentationTerrain, validatePublicLearningBrowserInputs } from '../reference/browser/modules/public-learning-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const gitText = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const CURRENT_COMMIT = gitText(['rev-parse','HEAD']);
const CURRENT_TREE = gitText(['show','-s','--format=%T',CURRENT_COMMIT]);
const BINDING = Object.freeze({ repository:'vgong24/VexLife', commitSha:CURRENT_COMMIT, treeSha:CURRENT_TREE, sourceAcceptanceState:'CANDIDATE_PROOF_ONLY' });
const REGISTRY = readJson('blueprint/public-learning-browser-registry.json');
const CATALOGS = Object.fromEntries(REGISTRY.requiredLocales.map((locale) => [locale, readJson(`blueprint/public-learning-browser/strings/${locale}.json`)]));
const PROJECTION = buildPublicLearningProjection({ root: ROOT, sourceBinding: BINDING });
const PROJECTION_PATH = path.join(ROOT, 'generated/public-learning/projection.json');
fs.mkdirSync(path.dirname(PROJECTION_PATH), { recursive: true });
fs.writeFileSync(PROJECTION_PATH, `${JSON.stringify(PROJECTION, null, 2)}\n`, 'utf8');

const ATLAS_GROUP = 'public-group.vexlife.architecture.atlas.001';
const ATLAS_REF = 'module.vexlife.core.atlas';
const ATLAS_LEAF = PROJECTION.leaves.find((leaf) => leaf.canonicalRef === ATLAS_REF);

function browserModuleRegistry() { return readJson('blueprint/module-registry/browser.json'); }
function source(relative) { return fs.readFileSync(path.join(ROOT, relative), 'utf8'); }

async function startProofServer(t) {
  const allow = new Set(REGISTRY.runtimeAllowlist);
  const routeDocument = new Set([REGISTRY.fieldRoutePath, ...PROJECTION.leaves.map((leaf) => leaf.routePath)]);
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    requests.push(pathname);
    let relative = null;
    if (routeDocument.has(pathname)) relative = 'reference/browser/public-learning/index.html';
    else if (allow.has(pathname)) relative = pathname.slice(1);
    if (!relative || REGISTRY.forbiddenRuntimePrefixes.some((prefix) => pathname.startsWith(prefix))) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not admitted');
      return;
    }
    const absolute = path.resolve(ROOT, relative);
    if (!absolute.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      response.writeHead(404); response.end('not admitted'); return;
    }
    const type = relative.endsWith('.html') ? 'text/html' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.json') ? 'application/json' : 'text/javascript';
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
    response.end(fs.readFileSync(absolute));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => server.close());
  const address = server.address();
  return { base: `http://127.0.0.1:${address.port}`, requests };
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.publicLearningReady === 'true');
}
async function transitionIdle(page) {
  await page.waitForFunction(() => document.querySelector('#terrainWorld')?.dataset.transitionPhase === 'IDLE');
}
const overlap = (a,b) => Boolean(a && b && a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y);
const rgb = (value) => (String(value).match(/\d+(?:\.\d+)?/g) ?? []).slice(0,3).map(Number);
const luminance = ([r,g,b]) => {
  const c=[r,g,b].map(v=>v/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
};
const contrast = (a,b) => {
  const x=luminance(rgb(a)), y=luminance(rgb(b));
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

validatePublicLearningBrowserInputs({ projection: PROJECTION, registry: REGISTRY, catalogs: CATALOGS });

test('S7P-00..04 source registry, localization, public truth and owner reuse remain bounded', () => {
  const keys = Object.keys(CATALOGS.en.strings).sort();
  for (const locale of ['ja','zh']) assert.deepEqual(Object.keys(CATALOGS[locale].strings).sort(), keys);
  assert.equal(Object.values(PROJECTION.effects).every((value) => value === false), true);
  const presentation = buildPublicPresentationTerrain(PROJECTION);
  const byRef = new Map(presentation.map((node) => [node.terrainNodeRef, node]));
  assert.equal(byRef.get(REGISTRY.presentationPolicy.entryRef).parentRef, null);
  assert.equal(byRef.get(ATLAS_GROUP).parentRef, REGISTRY.presentationPolicy.entryRef);
  assert.equal(byRef.get(ATLAS_REF).parentRef, ATLAS_GROUP);
  assert.equal(PROJECTION.nodes.find((node) => node.ref === ATLAS_REF).parentRef, null);
  assert.equal(REGISTRY.presentationPolicy.nonSpatialProjectionSharesTerrainRefs, true);

  const controller = source('reference/browser/modules/public-learning-controller.js');
  assert.match(controller, /createNavigationController/);
  assert.match(controller, /createTerrainController/);
  assert.match(controller, /presentationSnapshot\(\)/);
  assert.match(controller, /restorePresentation/);
  assert.match(controller, /terrain\.travel\(ref,\s*directionTo\(ref\)\)/);
  for (const forbidden of ['demo-data.js','chat-controller.js','guide-controller.js','living-journal-controller.js','reference/browser/app.js','/api/']) {
    assert.doesNotMatch(controller, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }

  const modules = new Map(browserModuleRegistry().map((entry) => [entry.moduleRef, entry]));
  for (const [ref, expectedPath] of [
    ['module.vexlife.browser.architecture-atlas-document','reference/browser/public-learning/index.html'],
    ['module.vexlife.browser.architecture-atlas-adapter','reference/browser/public-learning/app.js'],
    ['module.vexlife.browser.architecture-atlas-styles','reference/browser/public-learning/app.css'],
    ['module.vexlife.browser.architecture-atlas-controller','reference/browser/modules/public-learning-controller.js']
  ]) {
    assert.equal(modules.get(ref)?.path, expectedPath, ref);
    assert.equal(modules.get(ref)?.tests.includes('test/public-learning-browser.test.mjs'), true, `${ref} test ownership`);
  }
});

test('S7P-05..16 rendered path, accessible list, mobile/keyboard/localization and exact return are current', async (t) => {
  const { base, requests } = await startProofServer(t);
  assert.equal((await fetch(`${base}/reference/browser/app.js`)).status, 404);
  assert.equal((await fetch(`${base}/api/memory`)).status, 404);
  assert.equal((await fetch(`${base}/docs/private-continuity/secret.txt`)).status, 404);
  requests.length = 0;

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}${REGISTRY.fieldRoutePath}`);
  await ready(page);

  const expectedPresentation = buildPublicPresentationTerrain(PROJECTION).map((node) => node.terrainNodeRef).sort();
  const listRefs = (await page.locator('[data-public-list-ref]').evaluateAll((items) => items.map((item) => item.dataset.publicListRef))).sort();
  assert.deepEqual(listRefs, expectedPresentation, 'non-spatial list must project the complete same ref set as Terrain');

  const browse = page.locator('#publicBrowse');
  assert.equal(await browse.getAttribute('open'), null, 'non-spatial list starts as an explicit progressive disclosure');
  await page.locator('#publicBrowseSummary').click();
  await page.locator('#publicBrowse[open]').waitFor();

  await page.locator(`button[data-public-list-ref="${ATLAS_GROUP}"]`).click();
  await transitionIdle(page);
  assert.equal((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).currentRef, ATLAS_GROUP);
  await page.locator(`button[data-public-list-ref="${ATLAS_REF}"]`).click();
  await transitionIdle(page);
  const beforeLeaf = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(beforeLeaf.currentRef, ATLAS_REF);
  assert.equal(await page.locator('#publicDetailTitle').textContent(), PROJECTION.strings.en['public.node.atlas.title']);

  const technical = page.locator('#publicDetailRelationships details[data-relationship-technical="true"]');
  assert.ok(await technical.count() > 0);
  assert.equal(await technical.first().getAttribute('open'), null, 'raw relationship refs must be progressively disclosed');

  const primary = page.locator('[data-public-action="read-leaf"]');
  const primaryColors = await primary.evaluate((el) => {
    const style=getComputedStyle(el); return {color:style.color,background:style.backgroundColor};
  });
  assert.ok(contrast(primaryColors.color, primaryColors.background) >= 4.5, `primary action contrast too low: ${JSON.stringify(primaryColors)}`);

  await primary.click();
  await page.locator('#publicLeaf:not([hidden])').waitFor();
  const opened = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(opened.routePath, ATLAS_LEAF.routePath);
  assert.equal(opened.journeyEventCount, beforeLeaf.journeyEventCount, 'leaf open must not append Journey');
  for (const key of ['what','why','how','when','boundaries','related']) {
    assert.equal(await page.locator(`[data-leaf-section="${key}"] p`).textContent(), PROJECTION.strings.en[ATLAS_LEAF.sectionRefs[key]]);
  }
  const relationRefs = await page.locator('#publicLeafRelationships li').evaluateAll((items) => items.map((item) => item.dataset.relationshipRef));
  for (const ref of ATLAS_LEAF.relatedRefs) assert.ok(relationRefs.includes(ref), `missing public relation ${ref}`);
  const terrainBeforeScroll = opened.terrainPresentation;
  await page.locator('#publicLeafScroller').evaluate((element) => { element.scrollTop = Math.min(260, element.scrollHeight); element.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(20);
  assert.deepEqual((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).terrainPresentation, terrainBeforeScroll, 'leaf scrolling must not change Terrain');

  await page.goBack();
  await page.locator('#publicLeaf').waitFor({ state: 'hidden' });
  const returned = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.deepEqual(returned.semanticFrame, beforeLeaf.semanticFrame);
  assert.deepEqual(returned.terrainPresentation, beforeLeaf.terrainPresentation);
  assert.equal(returned.journeyEventCount, beforeLeaf.journeyEventCount);
  assert.equal(returned.lastReturnReceipt?.state, 'PASS');
  assert.equal(returned.routePath, REGISTRY.fieldRoutePath);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.focusRef ?? null), `control.public-learning.read-leaf.${ATLAS_REF}`);

  assert.equal(await page.locator('#vexSummon').getAttribute('aria-describedby'), 'publicAskVexHeaderNote');
  assert.equal((await page.locator('#publicAskVexHeaderNote').textContent()).trim(), CATALOGS.en.strings['public.browser.ask-vex-held']);

  const hiddenInteractive = await page.locator('[inert] button,[inert] input,[inert] select,[inert] textarea,[inert] a[href],[inert] [tabindex]').count();
  assert.ok(hiddenInteractive > 0, 'proof requires actual held engineering controls inside inert boundaries');
  const tabTrace = [];
  for (let i=0;i<36;i+=1) {
    await page.keyboard.press('Tab');
    tabTrace.push(await page.evaluate(() => ({
      id: document.activeElement?.id ?? '',
      inInert: Boolean(document.activeElement?.closest?.('[inert]')),
      hidden: Boolean(document.activeElement?.closest?.('[aria-hidden="true"]'))
    })));
  }
  assert.equal(tabTrace.some((item) => item.inInert || item.hidden), false, `Tab entered a held hidden boundary: ${JSON.stringify(tabTrace)}`);

  for (const locale of ['ja','zh','en']) {
    await page.selectOption('#languageSelect', locale);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.equal(await page.locator('#terrainBreadcrumb').getAttribute('aria-label'), CATALOGS[locale].strings[REGISTRY.accessibleNameRefs.breadcrumb]);
    assert.equal(await page.locator('#terrainToolbar').getAttribute('aria-label'), CATALOGS[locale].strings[REGISTRY.accessibleNameRefs.zoomControls]);
    assert.equal(await page.locator('#languageSelect').getAttribute('aria-label'), CATALOGS[locale].strings[REGISTRY.accessibleNameRefs.languageSelect]);
    assert.equal(await page.locator('#publicBrowseNav').getAttribute('aria-label'), CATALOGS[locale].strings[REGISTRY.accessibleNameRefs.browseNav]);
  }

  await page.goto(`${base}${ATLAS_LEAF.routePath}`);
  await ready(page);
  await page.locator('#publicLeaf:not([hidden])').waitFor();
  const direct = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(direct.currentRef, ATLAS_REF);
  assert.equal(direct.journeyEventCount, 1, 'direct leaf forms only the entry Journey seed');
  assert.equal(await page.locator('#vexSummon').isDisabled(), true);
  assert.equal(await page.locator('#vexSummon').getAttribute('data-effect-state'), 'HELD');
  await page.locator('#publicLeafReturn').click();
  assert.equal(new URL(page.url()).pathname, REGISTRY.fieldRoutePath);
  assert.equal((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).currentRef, ATLAS_REF);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}${REGISTRY.fieldRoutePath}`);
  await ready(page);
  const compact = await page.evaluate(() => globalThis.__vexlifePublicLearning.proof());
  assert.equal(compact.terrainPresentation.projectionGrammar, 'MOBILE_STACK');
  assert.equal(compact.semanticFrame.selectedNodeRef, REGISTRY.presentationPolicy.entryRef);

  const layout = await page.evaluate(() => {
    const box = (selector) => {
      const r=document.querySelector(selector)?.getBoundingClientRect();
      return r ? {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right} : null;
    };
    return {
      width:innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
      header:box('.public-learning-header'),
      breadcrumb:box('#terrainBreadcrumb'),
      focus:box('#terrainFocus'),
      zoom:box('#terrainToolbar')
    };
  });
  assert.ok(layout.header && layout.breadcrumb && layout.header.bottom <= layout.breadcrumb.y + 1, `mobile header/breadcrumb overlap: ${JSON.stringify(layout)}`);
  assert.equal(overlap(layout.focus, layout.zoom), false, `mobile current card/zoom rail overlap: ${JSON.stringify(layout)}`);
  assert.ok(layout.scrollWidth <= layout.width + 1, `mobile horizontal overflow: ${JSON.stringify(layout)}`);

  await page.locator('#publicBrowseSummary').click();
  await page.locator('#publicBrowse[open]').waitFor();
  await page.locator(`button[data-public-list-ref="${ATLAS_GROUP}"]`).click();
  await transitionIdle(page);
  await page.locator(`button[data-public-list-ref="${ATLAS_REF}"]`).click();
  await transitionIdle(page);
  await page.waitForFunction(() => {
    const stage = document.querySelector('.public-learning-stage');
    return document.querySelector('#publicBrowse')?.open === false && Math.abs(stage?.scrollTop ?? 999) <= 1;
  });
  const compactAtlas = await page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right } : null;
    };
    return {
      terrain: box('.public-learning-terrain'),
      focus: box('#terrainFocus'),
      title: box('#terrainFocus h2'),
      zoom: box('#terrainToolbar'),
      titleText: document.querySelector('#terrainFocus h2')?.textContent?.trim() ?? '',
      stageScrollTop: document.querySelector('.public-learning-stage')?.scrollTop ?? null,
      activeBreadcrumb: Boolean(document.querySelector('#terrainBreadcrumb button[aria-current="true"]')?.matches(':focus'))
    };
  });
  assert.equal((await page.evaluate(() => globalThis.__vexlifePublicLearning.proof())).currentRef, ATLAS_REF);
  assert.ok(compactAtlas.terrain && compactAtlas.focus && compactAtlas.title, `mobile Atlas containment geometry missing: ${JSON.stringify(compactAtlas)}`);
  assert.ok(compactAtlas.focus.x >= compactAtlas.terrain.x - 1
    && compactAtlas.focus.y >= compactAtlas.terrain.y - 1
    && compactAtlas.focus.right <= compactAtlas.terrain.right + 1
    && compactAtlas.focus.bottom <= compactAtlas.terrain.bottom + 1, `mobile Atlas current card escaped visible Terrain viewport: ${JSON.stringify(compactAtlas)}`);
  assert.ok(compactAtlas.title.x >= compactAtlas.terrain.x - 1
    && compactAtlas.title.y >= compactAtlas.terrain.y - 1
    && compactAtlas.title.right <= compactAtlas.terrain.right + 1
    && compactAtlas.title.bottom <= compactAtlas.terrain.bottom + 1, `mobile Atlas current-card title is clipped outside visible Terrain viewport: ${JSON.stringify(compactAtlas)}`);
  assert.equal(compactAtlas.titleText, PROJECTION.strings.en['public.node.atlas.title']);
  assert.equal(overlap(compactAtlas.focus, compactAtlas.zoom), false, `mobile Atlas current card/zoom rail overlap after list navigation: ${JSON.stringify(compactAtlas)}`);
  assert.ok(compactAtlas.stageScrollTop <= 1, `mobile field did not return to visible Terrain after list navigation: ${JSON.stringify(compactAtlas)}`);
  assert.equal(compactAtlas.activeBreadcrumb, true, `mobile list navigation did not hand stable focus to visible current breadcrumb: ${JSON.stringify(compactAtlas)}`);

  assert.ok(requests.every((pathname) => REGISTRY.runtimeAllowlist.includes(pathname) || pathname === REGISTRY.fieldRoutePath || PROJECTION.leaves.some((leaf) => leaf.routePath === pathname)), `unadmitted runtime request: ${requests.find((pathname) => !REGISTRY.runtimeAllowlist.includes(pathname) && pathname !== REGISTRY.fieldRoutePath && !PROJECTION.leaves.some((leaf) => leaf.routePath === pathname))}`);
});

test('S7P-17 authored browser files are syntactically current', () => {
  for (const relative of ['reference/browser/public-learning/app.js','reference/browser/modules/public-learning-controller.js','test/public-learning-browser.test.mjs']) {
    const result = spawnSync(process.execPath, ['--check', path.join(ROOT, relative)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relative}: ${result.stderr}`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'blueprint/fragments/tests.json')), true);
});

// [VXG RealForever]
