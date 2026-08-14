import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { journeyWindow, RECENT_JOURNEY_LIMIT } from '../reference/browser/modules/navigation-controller.js';

const browserRoot = new URL('../reference/browser/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', browserRoot), 'utf8');
const css = fs.readFileSync(new URL('app.css', browserRoot), 'utf8');
const app = fs.readFileSync(new URL('app.js', browserRoot), 'utf8');
const terrain = fs.readFileSync(new URL('modules/terrain-controller.js', browserRoot), 'utf8');

test('E2.7 root body is presentation foundation, not a comparator beside old shell', () => {
  assert.match(html,/class="e27-app"/); assert.match(html,/class="e27-appbar topbar"/); assert.match(html,/class="e27-terrain terrain"/); assert.match(html,/id="terrainWorld" class="e27-world"/); assert.match(html,/id="terrainFocus" class="e27-focus"/); assert.match(html,/id="guideWindow" class="e27-vex guide-window"/);
  assert.doesNotMatch(html,/class="context-nav"/); assert.doesNotMatch(html,/class="top-actions"/); assert.doesNotMatch(html,/class="primary-stage"/); assert.doesNotMatch(html,/class="project-rail"/);
  assert.doesNotMatch(app,/e27-terrain-convergence\.js/); assert.doesNotMatch(css,/CANONICAL_STAGE_B_ROOT_STYLES/);
});

test('sealed E2.7 interaction grammar is materialized directly', () => {
  for (const marker of ['e27-zoom-rail','e27-intent-tracker','e27-adjacent','e27-recentbar','e27-drawer','e27-surface-menu','e27-vex']) assert.match(html,new RegExp(marker));
  assert.match(terrain,/projectionMode/); assert.match(terrain,/fan/); assert.match(terrain,/rings/); assert.match(terrain,/carousel/); assert.match(terrain,/ENTER_SCALE_RATIO/); assert.match(terrain,/EXIT_SCALE_RATIO/); assert.match(terrain,/navigateSibling/); assert.match(terrain,/workspaceMode/);
});

test('canonical VexLife truth is transplanted into E2.7 body', () => {
  assert.match(app,/loadBrowserBundle/); assert.match(app,/createDemoData/); assert.match(app,/createChatController/); assert.match(app,/createNavigationController/); assert.match(app,/createGuideController/); assert.match(app,/TERRAIN_CONTEXT/); assert.match(app,/UNAVAILABLE|CURRENT_SYNTHETIC_REFERENCE/);
  assert.doesNotMatch(`${html}\n${css}\n${app}\n${terrain}`,/VexOrg Demo Company|Maya Chen|Project Aurora|synthetic employee/i);
});

test('conversation and health are contextual surfaces, not permanent product tabs', () => {
  assert.match(html,/id="contextSurface" class="e27-context-surface context-projection" hidden/); assert.match(html,/id="view-chat"[^>]*hidden/); assert.match(html,/id="view-health"[^>]*hidden/); assert.match(app,/openContext\('chat'\)/); assert.match(app,/openContext\('health'\)/); assert.match(app,/returnToTerrain/);
  assert.doesNotMatch(html,/data-action="open-context" data-context="chat"/); assert.doesNotMatch(html,/selection\.primary-view/);
});

test('semantic auto-entry is opt-in and thresholded inside spatial zoom grammar', () => {
  assert.match(html,/id="terrainAutoEntryEnabled"/); assert.match(html,/id="terrainAutoEntryVisibility"/); assert.match(html,/id="terrainAutoEntryConfidence"/);
  assert.match(terrain,/OPTED_OUT/); assert.match(terrain,/VISIBILITY_BELOW_THRESHOLD/); assert.match(terrain,/CONFIDENCE_BELOW_THRESHOLD/); assert.match(terrain,/INTENT_ADMITTED/); assert.match(terrain,/event\.target\.closest\('\.scroll-scope/);
});

test('journey projection preserves append-only source and recent-five human window', () => {
  assert.equal(RECENT_JOURNEY_LIMIT,5); const events=Array.from({length:9},(_,index)=>({journeyRef:`j.${index}`})); const view=journeyWindow(events,2); assert.equal(view.entries.length,5); assert.equal(events.length,9); assert.match(terrain,/navigation\.fullJourney\(\)/); assert.match(terrain,/journeyWindow\(events/);
});

// [VXG RealForever]
