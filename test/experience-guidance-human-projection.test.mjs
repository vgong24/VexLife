import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  bindBrowserHumanHelpProjectionAtReady,
  deriveHumanHelpProjection,
  resolveHumanHelpPlacement
} from '../reference/browser/modules/experience-guidance-human-projection.js';

const terrainFrame = Object.freeze({
  primaryStageScreenRef: 'screen.vexlife.terrain',
  screenRef: 'screen.vexlife.terrain',
  routeRef: 'route.terrain',
  contextProjection: null,
  projectRef: 'project.vexlife.root-hub',
  threadRef: 'thread.root-hub.welcome',
  channelRef: 'channel.root-hub.welcome.root',
  selectedNodeRef: 'terrain.project.root-hub'
});

const availableRecommendation = Object.freeze({
  state: 'AVAILABLE',
  screenRef: 'screen.vexlife.terrain',
  targetNodeRef: 'element.terrain.reset',
  actionRef: 'action.terrain.layout.reset',
  labelStringRef: 'terrain.reset',
  permissionRef: 'permission.none',
  reason: 'CURRENT_RENDERED_TARGET_EXECUTABLE',
  evaluated: []
});

function fakeElement({ left = 0, top = 0, width = 120, height = 44 } = {}) {
  const rect = { left, top, width, height, right:left + width, bottom:top + height };
  return {
    isConnected: true,
    style: { left:'', right:'', top:'', bottom:'', width:'', height:'' },
    dataset: {},
    getClientRects: () => [rect],
    getBoundingClientRect: () => rect,
    addEventListener() {},
    removeEventListener() {}
  };
}

function fakePlacementDocument() {
  return {
    activeElement: null,
    documentElement: {},
    querySelectorAll: () => []
  };
}

test('EFX01C-01/03 explicit current Help emits at most one deterministic no-effect proposal', () => {
  const projection = deriveHumanHelpProjection({
    frame: terrainFrame,
    recommendation: availableRecommendation,
    featureRef: 'feature.vexlife.terrain'
  });
  assert.equal(projection.help.state, 'CURRENT');
  assert.equal(projection.help.effects, false);
  assert.equal(projection.offerCount, 1);
  assert.equal(projection.help.proposals.length, 1);
  const [proposal] = projection.help.proposals;
  assert.equal(proposal.invocationClass, 'EXPLICIT_HELP');
  assert.equal(proposal.featureRef, 'feature.vexlife.terrain');
  assert.equal(proposal.suggestedActionRefOrNull, 'action.terrain.layout.reset');
  assert.equal(proposal.targetBindingOrNull.targetRef, 'element.terrain.reset');
  assert.equal(proposal.targetBindingOrNull.bindingPolicy, 'STATIC_CANONICAL_TARGET');
  assert.equal(projection.effects, false);
  assert.equal(projection.navigationEffect, false);
  assert.equal(projection.journeyEffect, false);
  assert.equal(projection.persistenceEffect, false);
  assert.equal(projection.autoExecute, false);
});

test('EFX01C-02/08 unavailable current Help fails closed without a runnable offer', () => {
  const projection = deriveHumanHelpProjection({
    frame: { ...terrainFrame, screenRef:'screen.vexlife.health', routeRef:'route.health' },
    recommendation: { state:'UNAVAILABLE', reason:'NO_CURRENT_FRAME_ACTION_CANDIDATE' },
    featureRef: null
  });
  assert.equal(projection.offerCount, 0);
  assert.equal(projection.help.proposals.length, 0);
  assert.ok(projection.help.sections.some((section) => section.sectionKind === 'WHY_UNAVAILABLE'));
  assert.equal(projection.responseContentRef, 'health.value.unavailable');
});

test('EFX01C-05/06 desktop placement consumes core resolver without persistence mutation', () => {
  const targetElement = fakeElement({ left:400, top:300, width:80, height:44 });
  const guideElement = fakeElement({ left:20, top:20, width:220, height:100 });
  const result = resolveHumanHelpPlacement({
    targetElement,
    guideElement,
    documentRef: fakePlacementDocument(),
    windowRef: { innerWidth:1200, innerHeight:800, getComputedStyle:() => ({ direction:'ltr' }) }
  });
  assert.equal(result.state, 'ANCHORED');
  assert.ok(result.geometry);
  assert.equal(result.persistedPreferenceMutation, false);
  assert.equal(result.semanticNavigationEffect, false);
  assert.equal(result.journeyEffect, false);
  assert.equal(result.coreResult.state, 'ANCHORED');
});

test('EFX01C-08/11 compact viewport degrades to accepted compact presentation without geometry', () => {
  const result = resolveHumanHelpPlacement({
    targetElement: fakeElement({ left:300, top:240, width:80, height:44 }),
    guideElement: fakeElement({ left:10, top:500, width:320, height:100 }),
    documentRef: fakePlacementDocument(),
    windowRef: { innerWidth:700, innerHeight:820, getComputedStyle:() => ({ direction:'ltr' }) }
  });
  assert.equal(result.state, 'FALLBACK_REQUIRED');
  assert.equal(result.presentationKind, 'COMPACT_CONTEXT_SHEET');
  assert.equal(result.geometry, null);
});

test('EFX01C-01 browser-ready binding reuses existing CURRENT Help control and public Guide projection', () => {
  const listeners = new Map();
  const buttonListeners = [];
  const button = { addEventListener:(type, fn) => buttonListeners.push([type, fn]) };
  const guideWindow = fakeElement({ left:20, top:20, width:340, height:330 });
  const documentRef = {
    readyState: 'loading',
    body: {},
    documentElement: {},
    activeElement: null,
    querySelector(selector) {
      if (selector === '[data-guide-intent-ref="intent.guide.current"]') return button;
      if (selector === '#guideWindow') return guideWindow;
      return null;
    },
    querySelectorAll: () => []
  };
  const messages = [];
  const globalRef = {
    document: documentRef,
    innerWidth: 1200,
    innerHeight: 800,
    getComputedStyle: () => ({ direction:'ltr' }),
    addEventListener:(type, fn) => listeners.set(type, fn),
    removeEventListener() {},
    __VEXLIFE_APP__: {
      navigation: { semanticFrame:() => terrainFrame },
      guide: {
        addMessage:(...args) => messages.push(args),
        nextRecommendation:() => ({ state:'UNAVAILABLE', reason:'NO_CURRENT_EXECUTABLE_RECOMMENDATION' })
      }
    }
  };
  const scheduled = bindBrowserHumanHelpProjectionAtReady({ globalRef });
  assert.equal(scheduled.state, 'BIND_ON_DOM_CONTENT_LOADED');
  assert.equal(typeof listeners.get('DOMContentLoaded'), 'function');
  listeners.get('DOMContentLoaded')();
  assert.ok(globalRef.__VEXLIFE_HUMAN_HELP_PROJECTION__);
  assert.equal(buttonListeners.length, 1);
  assert.equal(buttonListeners[0][0], 'click');
  buttonListeners[0][1]();
  assert.equal(messages.length, 1);
  assert.equal(messages[0][1].contentRef, 'health.value.unavailable');
  assert.equal(globalRef.__VEXLIFE_HUMAN_HELP_PROJECTION__.snapshot().effects, false);
});

test('EFX01C-09/12 source has no persistence, navigation mutation or auto-execution path', () => {
  const adapter = fs.readFileSync(new URL('../reference/browser/modules/experience-guidance-human-projection.js', import.meta.url), 'utf8');
  const bundle = fs.readFileSync(new URL('../reference/browser/modules/browser-bundle.js', import.meta.url), 'utf8');
  assert.match(adapter, /buildHelpProjection/);
  assert.match(adapter, /resolveGuidancePlacement/);
  assert.doesNotMatch(adapter, /localStorage\.setItem|navigation\.navigate|\.click\(\)|autoExecute\s*:\s*true/);
  assert.match(bundle, /import '\.\/experience-guidance-human-projection\.js';/);
});

test('EFX01C-13 reused Help copy exists in every required language without catalog mutation', () => {
  const bundle = loadBlueprint();
  const refs = [
    'guide.ask.current',
    'guide.answer.current',
    'guide.answer.next.terrain',
    'guide.answer.next.chat',
    'health.value.unavailable'
  ];
  for (const language of bundle.blueprint.product.requiredLanguages) {
    for (const ref of refs) assert.ok(bundle.strings[language][ref], `${language} missing ${ref}`);
  }
});

// [VXG RealForever]
