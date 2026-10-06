import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadFurnishingRegistry,
  loadFurnishingReferenceUniverse,
  compileFurnishingRegistry,
  projectFurnishings
} from '../scripts/furnishing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const furnishing = loadFurnishingRegistry(root);
const knownRefs = await loadFurnishingReferenceUniverse(root);
const compiled = compileFurnishingRegistry(furnishing, { knownRefs });
const graph = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/presentation-graph-registry.json'), 'utf8'));
const shell = JSON.parse(fs.readFileSync(path.join(root, 'blueprint/fragments/screens/shell.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'reference/browser/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'reference/browser/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'reference/browser/app.css'), 'utf8');
const terrain = fs.readFileSync(path.join(root, 'reference/browser/modules/terrain-controller.js'), 'utf8');

const byFurnishing = (ref) => compiled.furnishings.find((item) => item.furnishingRef === ref);
const byPresentation = (ref) => graph.presentationNodes.find((item) => item.presentationRef === ref);

test('VF03B-00 Guide and real Companion identities remain distinct while one-visible-Vex is presentation-controlled', () => {
  const assistance = shell.regions.find((region) => region.regionRef === 'region.shell.assistance');
  const guide = assistance.elements.find((item) => item.elementRef === 'element.vex.summon');
  const home = shell.regions.find((region) => region.regionRef === 'region.shell.home-furnishings');
  const talk = home.elements.find((item) => item.elementRef === 'element.vex.current-companion.open');
  assert.equal(guide.actionRef, 'action.vex.summon');
  assert.equal(talk.actionRef, 'action.view.select');
  assert.notEqual(guide.elementRef, talk.elementRef);
  assert.match(app, /openCurrentVexConversation/u);
  assert.match(app, /latestResumableConversationFrame/u);
  assert.match(html, /id="guideMinimize"[^>]+data-i18n-aria-label="guide\.title"/u);
  assert.match(css, /#guideMinimize::before\{content:"\?"/u);
  assert.doesNotMatch(css, /#guideWindow\[data-vessel-presence-state="AMBIENT"\]\{display:none\}/u);
});

test('VF03B-01 current Vex presence rebinds to current context without semantic takeover', () => {
  const vex = byFurnishing('furnishing.vexlife.current-vex-presence');
  assert.equal(vex.subject.subjectClass, 'PRESENCE');
  assert.equal(vex.subject.resourceRefOrNull, null);
  assert.equal(vex.placement.primary.placementRef, 'placement.vexlife.current-vex-presence.current-context');
  assert.equal(vex.placement.primary.presentationRefOrNull, 'presentation.vexlife.home.current-vex-presence');
  assert.ok(vex.placement.primary.ownerRefs.includes('github.issue.vexlife.745'));
  assert.equal(vex.actionBindings[0].actionRef, 'action.view.select');
  assert.equal(compiled.effectAuthority, false);
});

test('VF03B-02 Continue remains Journey-bound derived collection and is not empty premium chrome', () => {
  const item = byFurnishing('furnishing.vexlife.continue');
  assert.equal(item.subject.subjectClass, 'DERIVED_COLLECTION');
  assert.equal(item.subject.resourceRefOrNull, null);
  assert.deepEqual(item.subject.semanticOwnerRefs, []);
  assert.equal(item.placement.primary.placementRef, 'placement.vexlife.continue.current-context');
  assert.equal(item.placement.primary.presentationRefOrNull, 'presentation.vexlife.home.continue');
  assert.equal(item.actionBindings[0].actionRef, 'action.view.select');
  assert.match(app, /navigation\?\.fullJourney\?\.\(\)/u);
  assert.match(app, /frame\?\.contextProjection==='chat'/u);
  assert.doesNotMatch(html, /id="homeContinue"/u);
});

test('VF03B-03 Library remains contextual index but returns UNPLACED until a useful host is earned', () => {
  const item = byFurnishing('furnishing.vexlife.library');
  assert.equal(item.subject.subjectClass, 'CONTEXTUAL_INDEX');
  assert.equal(item.subject.resourceRefOrNull, null);
  assert.equal(item.placement.posture, 'UNPLACED');
  assert.equal(item.placement.primary, null);
  assert.deepEqual(item.placement.contextual, []);
  assert.deepEqual(item.subject.sourceRefs, ['github.issue.vexlife.811']);
  assert.deepEqual(item.bindings.currentness, []);
  assert.deepEqual(item.bindings.visibility, []);
  assert.deepEqual(item.bindings.reachability, []);
  assert.deepEqual(item.bindings.availability, []);
  assert.deepEqual(item.bindings.attention, []);
  assert.deepEqual(item.bindings.recovery, []);
  assert.equal(item.actionBindings.length, 0);
  assert.equal(item.wakePredicates.length, 1);
  assert.equal(item.wakePredicates[0].sourceRef, 'github.issue.vexlife.811');
  assert.equal(JSON.stringify(item).includes('vexstream-music'), false);
  assert.equal(byPresentation('presentation.vexlife.home.library'), undefined);
});

test('VF03B-04 Terrain current-context slot preserves one semantic stage and no product semantic ownership', () => {
  for (const ref of [
    'presentation.vexlife.terrain.current-context',
    'presentation.vexlife.terrain.current-context-supplement',
    'presentation.vexlife.home.current-vex-presence',
    'presentation.vexlife.home.continue'
  ]) {
    const node = byPresentation(ref);
    assert.ok(node, ref);
    assert.equal(node.productSemanticOwnership, false, ref);
    assert.equal(graph.placements.filter((item) => item.presentationRef === ref).length, 1, ref);
  }
  assert.equal(byPresentation('presentation.vexlife.terrain.current-context').parentPresentationRefOrNull, 'presentation.vexlife.terrain.canvas');
  assert.equal(byPresentation('presentation.vexlife.home.current-vex-presence').parentPresentationRefOrNull, 'presentation.vexlife.terrain.current-context-supplement');
  assert.equal(byPresentation('presentation.vexlife.home.continue').parentPresentationRefOrNull, 'presentation.vexlife.terrain.current-context-supplement');
  assert.equal(byPresentation('presentation.vexlife.shared-shell.home-furnishings'), undefined);
  assert.match(terrain, /renderCurrentContextSupplement/u);
  assert.match(terrain, /id="terrainCurrentContextSupplement"/u);
});

test('VF03B-05 browser source binds one Companion portal without model turn or automatic availability polling', () => {
  assert.match(app, /project\.self-development/u);
  assert.match(app, /thread\.self-development\.open-conversation/u);
  assert.match(app, /channel\.self-development\.companion/u);
  assert.match(app, /navigation\.navigate\('element\.vex\.current-companion\.open'/u);
  assert.match(app, /contextProjection:'chat'/u);
  assert.match(app, /chat\?\.companionAvailability\?\.\(\)/u);
  assert.match(app, /healthCompanionAvailabilityReadState!=='UNREQUESTED'/u);
  const doorway = app.slice(app.indexOf('async function openCurrentVexConversation'), app.indexOf('function openCurrentConversationFromHome'));
  assert.doesNotMatch(doorway, /\/api\/v1\/companion\/turn/u);
  assert.doesNotMatch(doorway, /refreshCompanionAvailability/u);
  assert.doesNotMatch(app, /void refreshHealthCompanionAvailability\(\)/u);
});

test('VF03B-06 current-context composition requires no Navigation Feature or UX-Evolution semantic mutation', () => {
  assert.match(app, /renderCurrentContextSupplement:renderFurnishingCurrentContextSupplement/u);
  assert.match(app, /navigation\.navigate\('element\.furnishing\.continue\.open-current'/u);
  assert.doesNotMatch(html, /id="furnishingHome"/u);
  assert.match(terrain, /E2\.9 Terrain renderCurrentContextSupplement must be a function or null/u);
});

test('VF03B-07 HELD Companion availability keeps the Conversation doorway available', () => {
  const vex = byFurnishing('furnishing.vexlife.current-vex-presence');
  const open = vex.actionBindings.find((item) => item.actionBindingRef === 'action-binding.current-vex-presence.open');
  assert.equal(open.availabilityOwnerRef, 'service.conversation');
  assert.equal(open.availabilitySourceRef, 'state.channels');
  const observation = (bindingRef, ownerRef, sourceRef, state, reasonRefs = []) => ({ bindingRef, ownerRef, sourceRef, state, reasonRefs, evidenceRefs: [], effectAuthorityGranted: false });
  const projection = projectFurnishings(compiled, { includeFurnishingRefsOrNull: ['furnishing.vexlife.current-vex-presence'], observations: [
    observation('binding.current-vex-presence.availability', 'github.issue.vexlife.634', 'registry.vexlife.companion-availability-reentry.001', 'HELD', ['reason.vex.not-ready']),
    observation('binding.current-vex-presence.action.open.availability', 'service.conversation', 'state.channels', 'AVAILABLE')
  ] });
  const projected = projection.furnishings[0];
  assert.equal(projected.availability.state, 'HELD');
  assert.deepEqual(projected.availableActions, ['action.view.select']);
  assert.equal(projection.effectAuthorityGranted, false);
});

// [VXG RealForever]
