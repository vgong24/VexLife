import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { journeyWindow, historicalFramePatch } from '../reference/browser/modules/e27-terrain-convergence.js';

const css = fs.readFileSync(new URL('../reference/browser/e27-convergence.css', import.meta.url), 'utf8');

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
});

// [VXG RealForever]
