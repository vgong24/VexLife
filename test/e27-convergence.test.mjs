import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { journeyWindow, historicalFramePatch } from '../reference/browser/modules/e27-terrain-convergence.js';

const browserRoot = new URL('../reference/browser/', import.meta.url);
const css = fs.readFileSync(new URL('e27-convergence.css', browserRoot), 'utf8');
const html = fs.readFileSync(new URL('index.html', browserRoot), 'utf8');
const convergence = fs.readFileSync(new URL('modules/e27-terrain-convergence.js', browserRoot), 'utf8');
const guide = fs.readFileSync(new URL('modules/guide-controller.js', browserRoot), 'utf8');

test('journey window exposes at most five recent semantic events without truncating source', () => {
  const events = Array.from({length:9}, (_, i) => ({ journeyRef:`journey.${i}` }));
  const window = journeyWindow(events);
  assert.equal(window.start, 4);
  assert.equal(window.entries.length, 5);
  assert.equal(window.total, 9);
  assert.equal(events.length, 9);
});

test('historical journey visit derives a semantic frame patch without mutating the event', () => {
  const event = { after:{ screenRef:'screen.vexlife.terrain', projectRef:'project.local-vex', threadRef:'thread.foundation', channelRef:'channel.root', selectedNodeRef:'terrain.node.x' } };
  const before = structuredClone(event);
  assert.deepEqual(historicalFramePatch(event), { view:'terrain', projectRef:'project.local-vex', threadRef:'thread.foundation', channelRef:'channel.root', selectedNodeRef:'terrain.node.x' });
  assert.deepEqual(event, before);
});

test('projection CSS removes permanent rail and detail-column canvas tax', () => {
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.project-rail\{[\s\S]*position:fixed/);
  assert.match(css, /\.e27-terrain-detail\{[\s\S]*position:absolute/);
  assert.match(css, /\.e27-adjacent\{[\s\S]*position:absolute/);
  assert.match(css, /\.e27-journey-drawer\{[\s\S]*position:absolute/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('browser loads the bounded E2.7 convergence layer after accepted app source', () => {
  assert.match(html, /<link rel="stylesheet" href="\.\/e27-convergence\.css">/);
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>[\s\S]*<script type="module" src="\.\/modules\/e27-terrain-convergence\.js"><\/script>/);
  assert.doesNotMatch(convergence, /app\.blueprint/);
  assert.match(convergence, /navigation\.fullJourney\(\)/);
  assert.match(convergence, /navigation\.navigate\(nodeRef, patch, 'action\.context\.open'\)/);
});

test('contextual overlays expose real aria controls and reuse accepted Guide obstruction owner', () => {
  assert.match(convergence, /terrainDetail\.id = terrainDetail\.id \|\| 'terrainDetailPanel'/);
  assert.match(convergence, /detailToggle\.setAttribute\('aria-controls', terrainDetail\.id\)/);
  assert.match(convergence, /app\.guide\.avoidDeclaredControls\(\)/);
  assert.match(convergence, /app\.guide\.persistGeometry\?\.\(\)/);
  for (const fragment of ['e27-journey-window','e27-adjacent-card:not([hidden])','e27-terrain-detail.is-open','e27-journey-drawer.is-open','project-rail[aria-hidden="false"]']) {
    assert.ok(guide.includes(fragment), `Guide obstruction owner missing ${fragment}`);
  }
});

test('convergence remains projection-only and never imports mock VexOrg product truth', () => {
  assert.doesNotMatch(`${convergence}\n${css}\n${html}`, /VexOrg Demo Company|Maya Chen/);
  assert.match(convergence, /state\.guideOpen/);
  assert.match(convergence, /terrain\.siblingRefs/);
  assert.doesNotMatch(convergence, /new TerrainLayout|canonicalParent|parentRef\s*=/);
});

// [VXG RealForever]
