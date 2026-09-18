import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TERRAIN = 'reference/browser/modules/terrain-controller.js';

function source(relative) { return fs.readFileSync(path.join(ROOT, relative), 'utf8'); }

async function startServer(t) {
  const allowed = new Set([
    '/reference/browser/modules/terrain-controller.js',
    '/reference/browser/modules/navigation-controller.js',
    '/reference/browser/modules/dom.js'
  ]);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>');
      return;
    }
    if (!allowed.has(url.pathname)) { res.writeHead(404); res.end('not admitted'); return; }
    res.writeHead(200, {'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
    res.end(fs.readFileSync(path.join(ROOT, url.pathname.slice(1))));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

const fixtureHtml = `
<div id="view-terrain" style="position:relative;width:1000px;height:700px;overflow:hidden">
  <div id="terrainToolbar"><button id="terrainZoomIn">+</button><div id="terrainZoomTrack"><div id="terrainZoomKnob"></div></div><button id="terrainZoomOut">-</button><output id="terrainZoomStatus"></output><input id="terrainAutoEntryEnabled" type="checkbox" checked><input id="terrainAutoEntryVisibility" type="range" min="0.5" max="1" step="0.01" value="0.72"><input id="terrainAutoEntryConfidence" type="range" min="0.5" max="1" step="0.01" value="0.8"><output id="terrainAutoEntryStatus"></output></div>
  <div id="terrainHud"></div><div id="terrainScopeChip"></div><div id="terrainWorkspaceBadge"></div>
  <div id="terrainWorld" style="position:absolute;width:1200px;height:800px"><svg id="terrainEdges"></svg><article id="terrainFocus" style="position:absolute"></article><div id="terrainNodes"></div></div>
  <div id="terrainAdjacent"></div><div id="terrainContext" hidden></div>
</div>
<nav id="terrainBreadcrumb"></nav>
<button id="terrainUp"></button>
<div id="terrainJourneyRecent"></div><span id="terrainJourneyStatus"></span><button id="terrainRecentPrev"></button><button id="terrainRecentNext"></button><input id="terrainJourneyScrub" type="range"><div id="terrainJourneyCurrentMarker"></div><code id="terrainJourneyReason"></code><div id="terrainJourneyClusters"></div><button id="terrainJourneyRevisit"></button><div id="terrainJourneyList"></div><aside id="terrainJourneyDrawer"></aside>
<p id="terrainAdaptationReason"></p><button id="terrainAdaptationUndo"></button><input id="terrainAdaptiveLayoutEnabled" type="checkbox" checked>
<button id="vexSummon"></button>
`;

const blueprint = {
  terrain: [
    {terrainNodeRef:'root', parentRef:null, kind:'ROOT', labelStringRef:'root'},
    {terrainNodeRef:'alpha', parentRef:'root', kind:'BRANCH', labelStringRef:'alpha'},
    {terrainNodeRef:'beta', parentRef:'root', kind:'BRANCH', labelStringRef:'beta'},
    {terrainNodeRef:'alpha-leaf', parentRef:'alpha', kind:'LEAF', labelStringRef:'alpha-leaf'},
    {terrainNodeRef:'beta-leaf', parentRef:'beta', kind:'LEAF', labelStringRef:'beta-leaf'}
  ]
};

async function install(page, { delegated }) {
  return page.evaluate(async ({ fixtureHtml, blueprint, delegated }) => {
    document.body.innerHTML = fixtureHtml;
    const { createTerrainController } = await import('/reference/browser/modules/terrain-controller.js');
    const state = { terrain: { selected: 'root' } };
    const navigationEvents = [];
    const requests = [];
    const navigation = {
      fullJourney: () => [],
      semanticFrame: () => ({ selectedNodeRef: state.terrain.selected }),
      navigate: (elementRef, patch, actionRef, extra = {}) => {
        const event = { elementRef, patch: structuredClone(patch), actionRef, extra: structuredClone(extra) };
        navigationEvents.push(event);
        return event;
      }
    };
    const requestSemanticTravel = delegated
      ? (request) => { requests.push(structuredClone(request)); return { delegated: true }; }
      : null;
    const controller = createTerrainController({
      state,
      blueprint,
      t: (ref) => ref,
      navigation,
      semanticPatchForNode: (ref) => ({ selectedNodeRef: ref }),
      requestSemanticTravel
    });
    globalThis.__tnd = { controller, state, requests, navigationEvents };
    return { currentRef: controller.currentRef() };
  }, { fixtureHtml, blueprint, delegated });
}

async function idle(page) {
  await page.waitForFunction(() => document.querySelector('#terrainWorld')?.dataset.transitionPhase === 'IDLE');
}

async function snapshot(page) {
  return page.evaluate(() => ({
    currentRef: globalThis.__tnd.controller.currentRef(),
    requests: structuredClone(globalThis.__tnd.requests),
    navigationEvents: structuredClone(globalThis.__tnd.navigationEvents),
    presentation: globalThis.__tnd.controller.presentationSnapshot()
  }));
}

async function activateSyntheticControl(page, selector, index = 0) {
  // This focused proof owns Terrain request semantics, not production CSS hit-testing.
  // Invoke the real DOM click handler inside Chromium so the synthetic fixture cannot
  // create false pointer-actionability failures from intentionally omitted layout CSS.
  await page.locator(selector).nth(index).evaluate((element) => element.click());
}

test('TND-00..12 real Terrain request delegation preserves performer/default boundaries', async (t) => {
  const controllerSource = source(TERRAIN);
  assert.doesNotMatch(controllerSource, /navigation-continuity|src\/core\/navigation/iu, 'Terrain must not import Navigation Continuity meaning');
  assert.match(controllerSource, /requestSemanticTravel/);

  const base = await startServer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const delegatedPage = await browser.newPage();
  await delegatedPage.emulateMedia({ reducedMotion: 'reduce' });
  await delegatedPage.goto(base);
  await install(delegatedPage, { delegated: true });

  await activateSyntheticControl(delegatedPage, '.e27-node[data-terrain-ref="alpha"]');
  let s = await snapshot(delegatedPage);
  assert.equal(s.currentRef, 'root', 'delegated child request must not directly mutate Terrain');
  assert.deepEqual(s.requests.at(-1), { targetRef:'alpha', direction:'in' });
  assert.equal(s.navigationEvents.length, 0);

  const requestsBeforeDirect = s.requests.length;
  await delegatedPage.evaluate(() => globalThis.__tnd.controller.travel('alpha','in'));
  await idle(delegatedPage);
  s = await snapshot(delegatedPage);
  assert.equal(s.currentRef, 'alpha');
  assert.equal(s.requests.length, requestsBeforeDirect, 'direct travel performer must bypass delegate');
  assert.equal(s.navigationEvents.length, 1);

  await activateSyntheticControl(delegatedPage, '#terrainBreadcrumb button');
  s = await snapshot(delegatedPage);
  assert.equal(s.currentRef, 'alpha');
  assert.deepEqual(s.requests.at(-1), { targetRef:'root', direction:'out' });

  const requestCountBeforeCurrentCrumb = s.requests.length;
  const navCountBeforeCurrentCrumb = s.navigationEvents.length;
  await activateSyntheticControl(delegatedPage, '#terrainBreadcrumb button[aria-current="true"]');
  await idle(delegatedPage);
  s = await snapshot(delegatedPage);
  assert.equal(s.requests.length, requestCountBeforeCurrentCrumb, 'current breadcrumb recenter/reselect is not movement delegation');
  assert.ok(s.navigationEvents.length > navCountBeforeCurrentCrumb, 'current breadcrumb preserves direct existing behavior');

  await delegatedPage.evaluate(() => globalThis.__tnd.controller.navigateSibling('NEXT'));
  s = await snapshot(delegatedPage);
  assert.equal(s.currentRef, 'alpha');
  assert.deepEqual(s.requests.at(-1), { targetRef:'beta', direction:'sibling' });

  await delegatedPage.evaluate(() => globalThis.__tnd.controller.up());
  s = await snapshot(delegatedPage);
  assert.equal(s.currentRef, 'alpha');
  assert.deepEqual(s.requests.at(-1), { targetRef:'root', direction:'out' });

  const beforeAutoIn = s.requests.length;
  const autoIn = await delegatedPage.evaluate(() => globalThis.__tnd.controller.evaluateSemanticAutoEntry({nodeRef:'alpha-leaf',visibilityRatio:1,confidence:1,direction:'IN'}));
  s = await snapshot(delegatedPage);
  assert.equal(autoIn.committed, true);
  assert.equal(s.currentRef, 'alpha');
  assert.equal(s.requests.length, beforeAutoIn + 1);
  assert.deepEqual(s.requests.at(-1), { targetRef:'alpha-leaf', direction:'in' });

  await delegatedPage.evaluate(() => globalThis.__tnd.controller.travel('alpha-leaf','in'));
  await idle(delegatedPage);
  const beforeAutoOut = (await snapshot(delegatedPage)).requests.length;
  const autoOut = await delegatedPage.evaluate(() => globalThis.__tnd.controller.evaluateSemanticAutoEntry({nodeRef:'alpha',visibilityRatio:1,confidence:1,direction:'OUT'}));
  s = await snapshot(delegatedPage);
  assert.equal(autoOut.committed, true);
  assert.equal(s.currentRef, 'alpha-leaf');
  assert.equal(s.requests.length, beforeAutoOut + 1);
  assert.deepEqual(s.requests.at(-1), { targetRef:'alpha', direction:'out' });

  const navBeforeRepeated = s.navigationEvents.length;
  await delegatedPage.evaluate(() => {
    globalThis.__tnd.controller.up();
    globalThis.__tnd.controller.up();
  });
  s = await snapshot(delegatedPage);
  assert.equal(s.navigationEvents.length, navBeforeRepeated, 'delegated requests must not leak private direct transitions');

  const delegatedPresentation = s.presentation;
  assert.equal(delegatedPresentation.boundSemanticNodeRef, 'alpha-leaf');

  const invalidPage = await browser.newPage();
  await invalidPage.emulateMedia({ reducedMotion: 'reduce' });
  await invalidPage.goto(base);
  const invalid = await invalidPage.evaluate(async ({ fixtureHtml, blueprint }) => {
    document.body.innerHTML = fixtureHtml;
    const { createTerrainController } = await import('/reference/browser/modules/terrain-controller.js');
    try {
      createTerrainController({state:{terrain:{selected:'root'}},blueprint,t:(x)=>x,navigation:{fullJourney:()=>[],semanticFrame:()=>({}),navigate:()=>null},requestSemanticTravel:{}});
      return null;
    } catch (error) { return {name:error.name,message:error.message}; }
  }, { fixtureHtml, blueprint });
  assert.deepEqual(invalid, { name:'Error', message:'E2.8 Terrain requestSemanticTravel must be a function or null' });

  const defaultPage = await browser.newPage();
  await defaultPage.emulateMedia({ reducedMotion: 'reduce' });
  await defaultPage.goto(base);
  await install(defaultPage, { delegated: false });
  await activateSyntheticControl(defaultPage, '.e27-node[data-terrain-ref="alpha"]');
  await defaultPage.waitForFunction(() => globalThis.__tnd.controller.currentRef() === 'alpha');
  await idle(defaultPage);
  let d = await snapshot(defaultPage);
  assert.equal(d.currentRef, 'alpha');
  assert.equal(d.requests.length, 0);
  assert.equal(d.navigationEvents.length, 1);

  const defaultAutoIn = await defaultPage.evaluate(() => globalThis.__tnd.controller.evaluateSemanticAutoEntry({nodeRef:'alpha-leaf',visibilityRatio:1,confidence:1,direction:'IN'}));
  assert.equal(defaultAutoIn.committed, true);
  await defaultPage.waitForFunction(() => globalThis.__tnd.controller.currentRef() === 'alpha-leaf');
  await idle(defaultPage);
  d = await snapshot(defaultPage);
  assert.equal(d.currentRef, 'alpha-leaf');
  assert.equal(d.requests.length, 0);

  const defaultAutoOut = await defaultPage.evaluate(() => globalThis.__tnd.controller.evaluateSemanticAutoEntry({nodeRef:'alpha',visibilityRatio:1,confidence:1,direction:'OUT'}));
  assert.equal(defaultAutoOut.committed, true);
  await defaultPage.waitForFunction(() => globalThis.__tnd.controller.currentRef() === 'alpha');
  await idle(defaultPage);
  d = await snapshot(defaultPage);
  assert.equal(d.currentRef, 'alpha');
  assert.equal(d.requests.length, 0);
});

// [VXG RealForever]
