import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadFurnishingRegistry,
  loadFurnishingReferenceUniverse,
  compileFurnishingRegistry
} from '../scripts/furnishing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const furnishing = loadFurnishingRegistry(root);
const knownRefs = await loadFurnishingReferenceUniverse(root);
const compiled = compileFurnishingRegistry(furnishing, { knownRefs });
const graph = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/presentation-graph-registry.json'), 'utf8'));
const shell = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/fragments/screens/shell.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'reference/browser/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'reference/browser/app.js'), 'utf8');

const byFurnishing = (ref) => compiled.furnishings.find((item) => item.furnishingRef === ref);
const byPresentation = (ref) => graph.presentationNodes.find((item) => item.presentationRef === ref);

test('VF03B-00 Guide and real Companion Home identities remain distinct', () => {
  const assistance = shell.regions.find((region) => region.regionRef === 'region.shell.assistance');
  const guide = assistance.elements.find((item) => item.elementRef === 'element.vex.summon');
  const home = shell.regions.find((region) => region.regionRef === 'region.shell.home-furnishings');
  const talk = home.elements.find((item) => item.elementRef === 'element.vex.current-companion.open');
  assert.equal(guide.actionRef, 'action.vex.summon');
  assert.equal(talk.actionRef, 'action.view.select');
  assert.notEqual(guide.elementRef, talk.elementRef);
  assert.match(app, /openCurrentVexConversation/u);
});

test('VF03B-01 current Vex presence composes rightful owners without semantic takeover', () => {
  const vex = byFurnishing('furnishing.vexlife.current-vex-presence');
  assert.equal(vex.subject.subjectClass, 'PRESENCE');
  assert.equal(vex.subject.resourceRefOrNull, null);
  assert.deepEqual(vex.subject.semanticOwnerRefs, [
    'service.conversation',
    'service.device-family',
    'service.model-runtime',
    'service.runtime-recovery'
  ]);
  assert.ok(vex.subject.sourceRefs.includes('registry.vexlife.companion-availability-reentry.001'));
  assert.equal(vex.placement.primary.presentationRefOrNull, 'presentation.vexlife.home.current-vex-presence');
  assert.equal(vex.actionBindings[0].actionRef, 'action.view.select');
  assert.equal(vex.actionBindings[0].permissionRefOrNull, 'permission.none');
  assert.equal(compiled.effectAuthority, false);
});

test('VF03B-02 Continue remains one derived collection over current context', () => {
  const item = byFurnishing('furnishing.vexlife.continue');
  assert.equal(item.subject.subjectClass, 'DERIVED_COLLECTION');
  assert.equal(item.subject.resourceRefOrNull, null);
  assert.deepEqual(item.subject.semanticOwnerRefs, []);
  assert.equal(item.placement.primary.presentationRefOrNull, 'presentation.vexlife.home.continue');
  assert.equal(item.actionBindings[0].actionRef, 'action.view.select');
  assert.equal(item.addressabilityLinks[0].targetSubjectRef, 'feature.vexlife.addressed-conversation');
  assert.equal(item.addressabilityLinks[0].semanticRelationAuthority, false);
});

test('VF03B-03 Library remains contextual index and mints no external service', () => {
  const item = byFurnishing('furnishing.vexlife.library');
  assert.equal(item.subject.subjectClass, 'CONTEXTUAL_INDEX');
  assert.equal(item.subject.resourceRefOrNull, null);
  assert.deepEqual(item.subject.semanticOwnerRefs, []);
  assert.equal(item.actionBindings.length, 0);
  assert.equal(JSON.stringify(item).includes('vexstream-music'), false);
  assert.equal(item.wakePredicates.length, 1);
});

test('VF03B-04 Home presentation anatomy has no product semantic ownership', () => {
  for (const ref of [
    'presentation.vexlife.shared-shell.home-furnishings',
    'presentation.vexlife.home.current-vex-presence',
    'presentation.vexlife.home.continue',
    'presentation.vexlife.home.library'
  ]) {
    const node = byPresentation(ref);
    assert.ok(node, ref);
    assert.equal(node.productSemanticOwnership, false, ref);
    assert.equal(graph.placements.filter((item) => item.presentationRef === ref).length, 1, ref);
  }
  assert.equal(byPresentation('presentation.vexlife.home.continue').semanticOwnerRefOrNull, null);
  assert.equal(byPresentation('presentation.vexlife.home.library').semanticOwnerRefOrNull, null);
  assert.equal(graph.reachabilityPaths.some((item) => item.reachabilityRef === 'reachability.vexlife.home.continue'), true);
  assert.equal(graph.reachabilityPaths.some((item) => item.reachabilityRef === 'reachability.vexlife.home.library'), true);
});

test('VF03B-05 browser source binds the exact current Companion portal without a model turn', () => {
  assert.match(html, /id="homeTalkToVex"[^>]*data-node-ref="element\.vex\.current-companion\.open"/u);
  assert.match(html, /id="homeContinueOpen"[^>]*data-node-ref="element\.furnishing\.continue\.open-current"/u);
  assert.match(app, /project\.self-development/u);
  assert.match(app, /thread\.self-development\.open-conversation/u);
  assert.match(app, /channel\.self-development\.companion/u);
  assert.match(app, /navigation\.navigate\('element\.vex\.current-companion\.open'/u);
  assert.match(app, /HOME_COMPANION_AVAILABILITY_TIMEOUT_MS=5000/u);
  assert.match(app, /signal:AbortSignal\.timeout\(HOME_COMPANION_AVAILABILITY_TIMEOUT_MS\)/u);
  assert.match(app, /contextProjection:'chat'/u);
  assert.doesNotMatch(app.slice(app.indexOf('async function openCurrentVexConversation'), app.indexOf('function openCurrentConversationFromHome')), /chat\.selectProject|chat\.selectThread|chat\.selectChannel/u);
  const doorway = app.slice(app.indexOf('async function openCurrentVexConversation'), app.indexOf('function openCurrentConversationFromHome'));
  assert.doesNotMatch(doorway, /\/api\/v1\/companion\/turn/u);
});

test('VF03B-06 Home projection requires no Navigation/Terrain/Feature/UX-Evolution mutation', () => {
  assert.equal(shell.regions.some((region) => region.regionRef === 'region.shell.home-furnishings'), true);
  assert.match(app, /navigation\.navigate\('element\.vex\.current-companion\.open'/u);
  assert.match(app, /openContext\('chat','element\.furnishing\.continue\.open-current'\)/u);
});
