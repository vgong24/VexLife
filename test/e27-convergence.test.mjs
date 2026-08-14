import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { journeyWindow, historicalFramePatch, RECENT_JOURNEY_LIMIT } from '../reference/browser/modules/navigation-controller.js';
import { ORDINARY_SCROLL_MAY_COMMIT_SEMANTIC_AUTO_ENTRY } from '../reference/browser/modules/terrain-controller.js';

const browserRoot = new URL('../reference/browser/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', browserRoot), 'utf8');
const app = fs.readFileSync(new URL('app.js', browserRoot), 'utf8');
const rootCss = fs.readFileSync(new URL('e27-convergence.css', browserRoot), 'utf8');
const canonical = fs.readFileSync(new URL('modules/e27-terrain-convergence.js', browserRoot), 'utf8');
const navigation = fs.readFileSync(new URL('modules/navigation-controller.js', browserRoot), 'utf8');
const terrain = fs.readFileSync(new URL('modules/terrain-controller.js', browserRoot), 'utf8');
const guide = fs.readFileSync(new URL('modules/guide-controller.js', browserRoot), 'utf8');

test('journey window keeps append-only source and exposes at most five recent events', () => {
  const events = Array.from({length:9}, (_, index) => ({ journeyRef:`journey.${index}` }));
  const window = journeyWindow(events);
  assert.equal(RECENT_JOURNEY_LIMIT,5); assert.equal(window.start,4); assert.equal(window.entries.length,5); assert.equal(window.total,9); assert.equal(events.length,9);
});

test('historical visit derives contextual projection without mutating history', () => {
  const event={after:{primaryStageScreenRef:'screen.vexlife.terrain',screenRef:'screen.vexlife.chat',projectRef:'project.local-vex',threadRef:'thread.foundation',channelRef:'channel.root',selectedNodeRef:'terrain.node.x'}};
  const before=structuredClone(event);
  assert.deepEqual(historicalFramePatch(event),{contextProjection:'chat',projectRef:'project.local-vex',threadRef:'thread.foundation',channelRef:'channel.root',selectedNodeRef:'terrain.node.x'});
  assert.deepEqual(event,before);
});

test('Stage B is rooted in Terrain and does not preserve primary-view tab topology', () => {
  assert.match(html,/data-presentation-contract="contract\.vexlife\.e27\.authoritative-root\/v1"/);
  assert.match(html,/id="view-terrain"[^>]*data-primary-stage="true"/);
  assert.match(html,/id="view-chat"[^>]*data-context-projection="chat"[^>]*hidden/);
  assert.match(html,/id="view-health"[^>]*data-context-projection="health"[^>]*hidden/);
  assert.match(html,/id="projectRail"[^>]*aria-hidden="true"/);
  assert.match(html,/id="guideToggle"[^>]*hidden/);
  assert.doesNotMatch(html,/selection\.primary-view/);
  assert.match(navigation,/primaryStageScreenRef: 'screen\.vexlife\.terrain'/);
  assert.match(navigation,/openContext/); assert.match(navigation,/returnToPrimaryStage/);
});

test('legacy filenames carry one canonical Stage-B authority, not a parallel convergence overlay', () => {
  assert.match(app,/^\/\/ Stage B canonical browser entry/m);
  assert.match(app,/import '\.\/modules\/e27-terrain-convergence\.js'/);
  assert.doesNotMatch(app,/selectView|projectCurrentFrame|state\.view\s*=\s*'chat'/);
  assert.match(canonical,/authoritativeRootDesignContract/);
  assert.match(canonical,/legacyCurrentBrowserPreservationDefault/);
  assert.doesNotMatch(canonical,/import .*app\.js/);
  assert.match(rootCss,/CANONICAL_STAGE_B_ROOT_STYLES/);
  assert.match(rootCss,/Authority: contract\.vexlife\.e27\.authoritative-root\/v1/);
  assert.doesNotMatch(rootCss,/Current canonical state\/data\/controllers remain authoritative/);
});

test('canonical contextual surfaces do not consume Terrain and reuse ambient Vex obstruction ownership', () => {
  assert.match(rootCss,/\.context-projection\{[\s\S]*position:absolute/);
  assert.match(rootCss,/\.project-rail\{[\s\S]*position:fixed/);
  assert.match(rootCss,/\.terrain-detail-drawer\{[\s\S]*position:absolute/);
  assert.match(rootCss,/\.terrain-journey-drawer\{[\s\S]*position:absolute/);
  for (const fragment of ['.terrain-journey-window','.terrain-adjacent-card:not([hidden])','.terrain-detail-drawer.is-open','.terrain-journey-drawer.is-open','.project-rail[aria-hidden="false"]','.context-projection:not([hidden])']) assert.ok(guide.includes(fragment),`ambient Vex obstruction owner missing ${fragment}`);
});

test('semantic auto-entry is opt-in, thresholded and ordinary-scroll-safe', () => {
  assert.equal(ORDINARY_SCROLL_MAY_COMMIT_SEMANTIC_AUTO_ENTRY,false);
  for (const id of ['terrainAutoEntryEnabled','terrainAutoEntryVisibility','terrainAutoEntryConfidence','terrainAutoEntryStatus']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(terrain,/visibilityThreshold/); assert.match(terrain,/confidenceThreshold/); assert.match(terrain,/OPTED_OUT/); assert.match(terrain,/ORDINARY_SCROLL_NEVER_COMMITS/);
  assert.match(terrain,/allowedSources = new Set\(\['EXPLICIT_SELECTION', 'EXPLICIT_CENTER', 'EXPLICIT_SIBLING'\]\)/);
});

test('one sibling gesture schedules at most one semantic auto-entry evaluation', () => {
  assert.match(terrain,/function centerOn\(nodeRef = state\.terrain\.selected, \{ autoEntrySource = 'EXPLICIT_CENTER' \} = \{\}\)/);
  assert.match(terrain,/evaluateSemanticAutoEntry\(\{ nodeRef, confidence: 1, source: autoEntrySource \}\)/);
  assert.match(terrain,/centerOn\(target, \{ autoEntrySource: 'EXPLICIT_SIBLING' \}\)/);
  assert.doesNotMatch(terrain,/centerOn\(target\);\s*queueMicrotask\(\(\) => evaluateSemanticAutoEntry\(/);
});

test('one visible ambient Vex carries source attribution without synthetic organization truth', () => {
  assert.match(html,/id="vexSummon"[^>]*data-node-ref="element\.vex\.summon"/);
  assert.match(html,/data-i18n="vex\.visible\.name">Vex</);
  assert.match(canonical,/projectVisibleVexIdentity/); assert.match(canonical,/sourceRoleRef/);
  assert.doesNotMatch(`${html}\n${app}\n${canonical}\n${terrain}\n${rootCss}`,/VexOrg Demo Company|Maya Chen/);
});

// [VXG RealForever]
