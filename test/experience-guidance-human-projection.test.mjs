import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  bindBrowserHumanHelpProjectionAtReady,
  createBrowserHumanHelpProjection,
  deriveHumanHelpInteractionCandidates,
  deriveHumanHelpInteractionCue,
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

const chatFrame = Object.freeze({
  ...terrainFrame,
  screenRef: 'screen.vexlife.chat',
  routeRef: 'route.chat',
  contextProjection: 'chat'
});

const interactionExperience = Object.freeze({
  gestureContracts: Object.freeze([
    Object.freeze({
      gestureRef: 'gesture.vexlife.terrain-pan',
      resultActionRef: 'action.terrain.canvas.pan',
      helpStringRef: 'gesture.terrain-pan.help'
    }),
    Object.freeze({
      gestureRef: 'gesture.vexlife.content-scroll',
      resultActionRef: 'action.content.scroll',
      helpStringRef: 'gesture.content-scroll.help'
    }),
    Object.freeze({
      gestureRef: 'gesture.vexlife.terrain-zoom',
      resultActionRef: 'action.terrain.canvas.zoom',
      helpStringRef: 'gesture.terrain-zoom.help'
    }),
    Object.freeze({
      gestureRef: 'gesture.vexlife.terrain-semantic-depth',
      resultActionRef: 'action.terrain.semantic-depth.set',
      helpStringRef: 'gesture.terrain-semantic-depth.help'
    }),
    Object.freeze({
      gestureRef: 'gesture.vexlife.node-drag',
      resultActionRef: 'action.terrain.node.move',
      helpStringRef: 'gesture.node-drag.help'
    }),
    Object.freeze({
      gestureRef: 'gesture.vexlife.overlay-drag',
      resultActionRef: 'action.guide.move',
      helpStringRef: 'gesture.overlay-drag.help'
    }),
    Object.freeze({
      gestureRef: 'gesture.vexlife.vessel-resize',
      resultActionRef: 'action.vessel.resize',
      helpStringRef: 'gesture.vessel-resize.help'
    })
  ])
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

function fakeElement({ left = 0, top = 0, width = 120, height = 44, connected = true } = {}) {
  const rect = { left, top, width, height, right:left + width, bottom:top + height };
  return {
    isConnected: connected,
    style: { left:'', right:'', top:'', bottom:'', width:'', height:'' },
    dataset: {},
    attributes: {},
    textContent: '',
    getClientRects() { return this.isConnected ? [rect] : []; },
    getBoundingClientRect: () => rect,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    addEventListener() {},
    removeEventListener() {},
    remove() { this.isConnected = false; }
  };
}

function fakePlacementDocument() {
  return {
    activeElement: null,
    documentElement: {},
    querySelectorAll: () => []
  };
}

function fakeProjectionEnvironment({ experience = { gestureContracts:[] }, frame = terrainFrame } = {}) {
  const targetElement = fakeElement({ left:400, top:300, width:80, height:44 });
  const currentTerrainSurface = fakeElement({ left:470, top:250, width:380, height:196 });
  const currentChatSurface = fakeElement({ left:280, top:160, width:620, height:520 });
  const terrainZoom = fakeElement({ left:20, top:160, width:44, height:44 });
  const terrainDepth = fakeElement({ left:1020, top:18, width:110, height:44 });
  const terrainNode = fakeElement({ left:720, top:340, width:160, height:90 });
  const journeyScrub = fakeElement({ left:360, top:690, width:320, height:44 });
  const journeyRevisit = fakeElement({ left:700, top:690, width:160, height:44 });
  const workspaceDock = fakeElement({ left:300, top:120, width:220, height:44 });
  const workspaceResize = fakeElement({ left:880, top:680, width:44, height:44 });
  const guideHandle = fakeElement({ left:30, top:30, width:280, height:44 });
  const guideResize = fakeElement({ left:320, top:310, width:44, height:44 });
  const guideWindow = fakeElement({ left:20, top:20, width:340, height:330 });
  Object.assign(guideWindow.style, { left:'20px', right:'14px', top:'92px', bottom:'', width:'340px', height:'330px' });
  const transientNodes = [];
  const documentRef = {
    body: {
      append(node) {
        node.isConnected = true;
        transientNodes.push(node);
      }
    },
    documentElement: {},
    activeElement: null,
    createElement() { return fakeElement({ left:-10000, top:-10000, width:260, height:72, connected:false }); },
    querySelector(selector) {
      if (selector === '[data-node-ref="element.terrain.reset"]') return targetElement;
      if (selector === '#terrainFocus') return currentTerrainSurface;
      if (selector === '#view-chat') return currentChatSurface;
      if (selector === '#terrainZoomIn') return terrainZoom;
      if (selector === '#terrainUp') return terrainDepth;
      if (selector === '.e27-node') return terrainNode;
      if (selector === '#terrainJourneyScrub') return journeyScrub;
      if (selector === '#terrainJourneyRevisit') return journeyRevisit;
      if (selector === '#contextWorkspaceDock') return workspaceDock;
      if (selector === '#contextWorkspaceResizeSe') return workspaceResize;
      if (selector === '#guideHandle') return guideHandle;
      if (selector === '[data-resize-corner="se"]') return guideResize;
      return null;
    },
    querySelectorAll: () => []
  };
  const windowRef = {
    innerWidth:1200,
    innerHeight:800,
    getComputedStyle:() => ({ direction:'ltr' }),
    addEventListener() {},
    removeEventListener() {}
  };
  const projection = createBrowserHumanHelpProjection({
    navigation: { semanticFrame:() => frame },
    nextRecommendation:() => availableRecommendation,
    translate:(ref) => `Visible copy for ${ref}`,
    windowElement:guideWindow,
    experience,
    documentRef,
    windowRef
  });
  return {
    targetElement,
    currentTerrainSurface,
    currentChatSurface,
    guideWindow,
    transientNodes,
    documentRef,
    windowRef,
    projection
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

test('EFX01D-D2-01/02/04/05 Terrain current Help consumes the accepted PAN owner without granting its action', () => {
  const cue = deriveHumanHelpInteractionCue({ frame:terrainFrame, experience:interactionExperience });
  assert.equal(cue.interactionFamily, 'PAN');
  assert.equal(cue.gestureRefOrNull, 'gesture.vexlife.terrain-pan');
  assert.equal(cue.actionRefOrNull, 'action.terrain.canvas.pan');
  assert.equal(cue.intentionContentRef, 'gesture.terrain-pan.help');
  assert.equal(cue.targetBindingOrNull, null);
  assert.equal(cue.effects, false);
  assert.equal(cue.grantsActionAuthority, false);
  assert.equal(cue.autoExecute, false);
  assert.equal(cue.navigationEffect, false);
  assert.equal(cue.journeyEffect, false);
  assert.equal(cue.persistenceEffect, false);
  assert.notEqual(cue.intentionContentRef, cue.gestureRefOrNull);
  assert.notEqual(cue.intentionContentRef, cue.actionRefOrNull);
});

test('EFX01D-D2-03 Chat current Help consumes the accepted SCOPED_SCROLL owner independently of NEXT availability', () => {
  const projection = deriveHumanHelpProjection({
    frame: chatFrame,
    recommendation: { state:'UNAVAILABLE', reason:'RENDERED_TARGET_MISSING' },
    featureRef: 'feature.vexlife.addressed-conversation',
    experience: interactionExperience
  });
  assert.equal(projection.interactionCue.interactionFamily, 'SCOPED_SCROLL');
  assert.equal(projection.interactionCue.gestureRefOrNull, 'gesture.vexlife.content-scroll');
  assert.equal(projection.interactionCue.actionRefOrNull, 'action.content.scroll');
  assert.equal(projection.interactionCue.intentionContentRef, 'gesture.content-scroll.help');
  assert.equal(projection.interactionCue.targetBindingOrNull, null);
  assert.equal(projection.offerCount, 0);
});

test('EFX01D-D2-07 missing or malformed registry ownership fails closed to existing Help instead of inventing a cue', () => {
  const missing = deriveHumanHelpProjection({
    frame: terrainFrame,
    recommendation: availableRecommendation,
    featureRef: 'feature.vexlife.terrain',
    experience: { gestureContracts:[] }
  });
  assert.equal(missing.interactionCue, null);
  assert.equal(missing.responseContentRef, 'guide.answer.next.terrain');
  assert.equal(missing.offerCount, 1);

  const malformed = deriveHumanHelpInteractionCue({
    frame: terrainFrame,
    experience: { gestureContracts:[{ gestureRef:'gesture.vexlife.terrain-pan', helpStringRef:'gesture.terrain-pan.help' }] }
  });
  assert.equal(malformed, null);
});

test('EFX01D-D2-08 teaching stays semantically targetless while visually anchoring to the current rendered surface, never the unrelated NEXT target', () => {
  const { currentTerrainSurface, transientNodes, projection } = fakeProjectionEnvironment({ experience:interactionExperience });
  const shown = projection.projectExplicitHelp();
  assert.equal(shown.interactionCue.targetBindingOrNull, null);
  assert.equal(shown.recommendation.targetNodeRef, 'element.terrain.reset');
  assert.equal(shown.interactionCue.gestureRefOrNull, 'gesture.vexlife.terrain-pan');
  assert.equal(shown.placement.state, 'ANCHORED');
  assert.equal(currentTerrainSurface.isConnected, true);
  const activeTransient = transientNodes.find((node) => node.isConnected);
  assert.ok(activeTransient);
  assert.equal(activeTransient.textContent, 'Visible copy for gesture.terrain-pan.help');
  projection.dispose();
});

test('EFX01D-D3-01/02 accepted dynamic/spatial candidates consume current owners and never mint SPATIAL_REVEAL', () => {
  const { documentRef } = fakeProjectionEnvironment({ experience:interactionExperience });
  const candidates = deriveHumanHelpInteractionCandidates({ frame:terrainFrame, experience:interactionExperience, documentRef });
  const cues = candidates.map(({ cue }) => cue);
  assert.deepEqual(
    cues.slice(0, 3).map((cue) => cue.interactionFamily),
    ['PAN', 'ZOOM', 'SEMANTIC_DEPTH_SHIFT']
  );
  assert.equal(cues[1].gestureRefOrNull, 'gesture.vexlife.terrain-zoom');
  assert.equal(cues[1].actionRefOrNull, 'action.terrain.canvas.zoom');
  assert.equal(cues[2].gestureRefOrNull, 'gesture.vexlife.terrain-semantic-depth');
  assert.equal(cues[2].actionRefOrNull, 'action.terrain.semantic-depth.set');
  const scrub = cues.find((cue) => cue.interactionRefOrNull === 'interaction.terrain.journey-scrub');
  const revisit = cues.find((cue) => cue.interactionRefOrNull === 'interaction.terrain.journey-revisit');
  assert.equal(scrub?.interactionFamily, 'SCRUB_OR_REVISIT');
  assert.equal(scrub?.actionRefOrNull, 'action.journey.scrub');
  assert.equal(scrub?.gestureRefOrNull, null);
  assert.equal(scrub?.intentionContentRef, 'journey.scrub');
  assert.equal(revisit?.actionRefOrNull, 'action.journey.revisit');
  assert.equal(revisit?.gestureRefOrNull, null);
  assert.equal(cues.some((cue) => cue.interactionFamily === 'SPATIAL_REVEAL'), false);
  assert.ok(cues.every((cue) => cue.effects === false && cue.grantsActionAuthority === false && cue.autoExecute === false));
});

test('EFX01D-D3-03 contextual workspace DOCK/RESIZE teaching consumes interaction/action owners without inventing gestures', () => {
  const { documentRef } = fakeProjectionEnvironment({ experience:interactionExperience, frame:chatFrame });
  const cues = deriveHumanHelpInteractionCandidates({ frame:chatFrame, experience:interactionExperience, documentRef }).map(({ cue }) => cue);
  const dock = cues.find((cue) => cue.interactionRefOrNull === 'interaction.context-workspace.dock');
  const resize = cues.find((cue) => cue.interactionRefOrNull === 'interaction.context-workspace.resize.se');
  assert.equal(dock?.interactionFamily, 'DOCK');
  assert.equal(dock?.actionRefOrNull, 'action.context-workspace.dock');
  assert.equal(dock?.gestureRefOrNull, null);
  assert.equal(dock?.intentionContentRef, 'context-workspace.dock');
  assert.equal(resize?.interactionFamily, 'RESIZE');
  assert.equal(resize?.actionRefOrNull, 'action.context-workspace.resize');
  assert.equal(resize?.gestureRefOrNull, null);
  assert.equal(resize?.intentionContentRef, 'context-workspace.resize.se');
});

test('EFX01D-D3-04 repeated explicit Help advances session-locally while preserving one transient no-effect surface', () => {
  const { guideWindow, transientNodes, projection } = fakeProjectionEnvironment({ experience:interactionExperience });
  const before = { ...guideWindow.style };
  const first = projection.projectExplicitHelp();
  const second = projection.projectExplicitHelp();
  const third = projection.projectExplicitHelp();
  assert.equal(first.interactionCue.interactionFamily, 'PAN');
  assert.equal(second.interactionCue.interactionFamily, 'ZOOM');
  assert.equal(second.interactionCue.gestureRefOrNull, 'gesture.vexlife.terrain-zoom');
  assert.equal(third.interactionCue.interactionFamily, 'SEMANTIC_DEPTH_SHIFT');
  assert.equal(third.interactionCue.gestureRefOrNull, 'gesture.vexlife.terrain-semantic-depth');
  const active = transientNodes.filter((node) => node.isConnected);
  assert.equal(active.length, 1);
  assert.equal(active[0].dataset.interactionFamily, 'SEMANTIC_DEPTH_SHIFT');
  assert.equal(active[0].dataset.actionRef, 'action.terrain.semantic-depth.set');
  assert.equal(active[0].textContent, 'Visible copy for gesture.terrain-semantic-depth.help');
  assert.deepEqual(guideWindow.style, before);
  assert.equal(third.effects, false);
  assert.equal(third.navigationEffect, false);
  assert.equal(third.journeyEffect, false);
  assert.equal(third.persistenceEffect, false);
  assert.equal(third.autoExecute, false);
  projection.dispose();
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

test('EFX01C-06/10 adaptive placement owns only transient projection nodes and leaves Guide geometry untouched', () => {
  const { guideWindow, transientNodes, projection } = fakeProjectionEnvironment();
  const before = { ...guideWindow.style };
  const shown = projection.projectExplicitHelp();
  assert.equal(shown.placement.state, 'ANCHORED');
  assert.deepEqual(guideWindow.style, before);
  assert.equal(guideWindow.dataset.guidanceTransient, undefined);
  const activeTransient = transientNodes.find((node) => node.isConnected);
  assert.ok(activeTransient);
  assert.equal(activeTransient.getAttribute('data-vex-human-projection-transient'), 'true');
  assert.notEqual(activeTransient.style.left, '-10000px');
  assert.match(activeTransient.textContent, /Visible copy/);
  projection.dismiss();
  assert.deepEqual(guideWindow.style, before);
  assert.equal(transientNodes.some((node) => node.isConnected), false);
  projection.dispose();
});

test('EFX01C-07 target disappearance degrades truthfully without mutating Guide geometry', () => {
  const { targetElement, guideWindow, transientNodes, projection } = fakeProjectionEnvironment();
  const before = { ...guideWindow.style };
  const shown = projection.projectExplicitHelp();
  assert.equal(shown.placement.state, 'ANCHORED');
  assert.ok(transientNodes.some((node) => node.isConnected));
  targetElement.isConnected = false;
  const degraded = projection.refreshPlacement();
  assert.equal(degraded.state, 'FALLBACK_REQUIRED');
  assert.equal(degraded.reason, 'CURRENT_RENDERED_TARGET_DISAPPEARED');
  assert.equal(degraded.geometry, null);
  assert.deepEqual(guideWindow.style, before);
  assert.equal(transientNodes.some((node) => node.isConnected), false);
  assert.equal(projection.snapshot().placement.reason, 'CURRENT_RENDERED_TARGET_DISAPPEARED');
  projection.dispose();
});

test('EFX01C-01 browser-ready binding reuses existing CURRENT Help control without duplicating canonical Guide output or creating a second public runtime API', () => {
  const listeners = new Map();
  const buttonListeners = [];
  const button = { addEventListener:(type, fn) => buttonListeners.push([type, fn]) };
  const guideWindow = fakeElement({ left:20, top:20, width:340, height:330 });
  const documentRef = {
    readyState: 'loading',
    body: { append(node) { node.isConnected = true; } },
    documentElement: {},
    activeElement: null,
    createElement() { return fakeElement({ width:260, height:72, connected:false }); },
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
    t:(ref) => `Visible copy for ${ref}`,
    __VEXLIFE_APP__: {
      navigation: { semanticFrame:() => terrainFrame },
      guide: {
        addMessage:(...args) => messages.push(args),
        nextRecommendation:() => ({ state:'UNAVAILABLE', reason:'NO_CURRENT_EXECUTABLE_RECOMMENDATION' })
      }
    }
  };
  globalRef.__VEXLIFE_APP__.t = globalRef.t;
  const scheduled = bindBrowserHumanHelpProjectionAtReady({ globalRef });
  assert.equal(scheduled.state, 'BIND_ON_DOM_CONTENT_LOADED');
  assert.equal(typeof listeners.get('DOMContentLoaded'), 'function');
  listeners.get('DOMContentLoaded')();
  assert.equal(buttonListeners.length, 1);
  assert.equal(buttonListeners[0][0], 'click');
  buttonListeners[0][1]();
  assert.equal(messages.length, 0);
  assert.equal(Object.hasOwn(globalRef, '__VEXLIFE_HUMAN_HELP_PROJECTION__'), false);
});


test('EFX01C-01 delayed app publication after DOMContentLoaded still binds exactly once without taking Guide message ownership', () => {
  const listeners = new Map();
  const timers = new Map();
  let nextTimerId = 1;
  const buttonListeners = [];
  const button = { addEventListener:(type, fn) => buttonListeners.push([type, fn]) };
  const guideWindow = fakeElement({ left:20, top:20, width:340, height:330 });
  const documentRef = {
    readyState: 'loading',
    body: { append(node) { node.isConnected = true; } },
    documentElement: {},
    activeElement: null,
    createElement() { return fakeElement({ width:260, height:72, connected:false }); },
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
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    setTimeout(fn) { const id = nextTimerId++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    t:(ref) => `Visible copy for ${ref}`
  };

  const scheduled = bindBrowserHumanHelpProjectionAtReady({ globalRef });
  assert.equal(scheduled.state, 'BIND_ON_DOM_CONTENT_LOADED');
  assert.equal(bindBrowserHumanHelpProjectionAtReady({ globalRef }).state, 'BIND_PENDING');
  assert.equal(typeof listeners.get('DOMContentLoaded'), 'function');

  listeners.get('DOMContentLoaded')();
  assert.equal(buttonListeners.length, 0);

  globalRef.__VEXLIFE_APP__ = {
    navigation: { semanticFrame:() => terrainFrame },
    guide: {
      addMessage:(...args) => messages.push(args),
      nextRecommendation:() => ({ state:'UNAVAILABLE', reason:'NO_CURRENT_EXECUTABLE_RECOMMENDATION' })
    },
    t: globalRef.t
  };

  for (let guard = 0; guard < 10 && buttonListeners.length === 0 && timers.size > 0; guard += 1) {
    const [id, callback] = timers.entries().next().value;
    timers.delete(id);
    callback();
  }

  assert.equal(buttonListeners.length, 1);
  assert.equal(buttonListeners[0][0], 'click');
  buttonListeners[0][1]();
  assert.equal(messages.length, 0);
  assert.equal(bindBrowserHumanHelpProjectionAtReady({ globalRef }).state, 'ALREADY_BOUND');
  assert.equal(buttonListeners.length, 1);
  assert.equal(Object.hasOwn(globalRef, '__VEXLIFE_HUMAN_HELP_PROJECTION__'), false);
});

test('EFX01C-09 accepted Terrain wheel scope excludes Guide and scroll-scope descendants', () => {
  const terrain = fs.readFileSync(new URL('../reference/browser/modules/terrain-controller.js', import.meta.url), 'utf8');
  assert.match(terrain, /event\.target\.closest\('\.scroll-scope,\.e27-vex,\.e27-context-surface'\)/);
});

test('EFX01C-09/12 + EFX01D-D2-05/06 + D3 source has no persistence, navigation mutation, auto-execution, duplicate Guide messaging, or second public runtime path', () => {
  const adapter = fs.readFileSync(new URL('../reference/browser/modules/experience-guidance-human-projection.js', import.meta.url), 'utf8');
  const bundle = fs.readFileSync(new URL('../reference/browser/modules/browser-bundle.js', import.meta.url), 'utf8');
  assert.match(adapter, /buildHelpProjection/);
  assert.match(adapter, /buildInteractionCue/);
  assert.match(adapter, /experience-registry\.json/);
  assert.match(adapter, /#terrainFocus/);
  assert.match(adapter, /#view-chat/);
  assert.match(adapter, /#terrainZoomIn/);
  assert.match(adapter, /#terrainJourneyScrub/);
  assert.match(adapter, /#contextWorkspaceDock/);
  assert.match(adapter, /resolveGuidancePlacement/);
  assert.match(adapter, /data-vex-human-projection-transient/);
  assert.doesNotMatch(adapter, /__VEXLIFE_HUMAN_HELP_PROJECTION__/);
  assert.doesNotMatch(adapter, /guide\.addMessage|addMessage\('guide'|localStorage\.setItem|navigation\.navigate|\.click\(\)|autoExecute\s*:\s*true/);
  assert.match(bundle, /import '\.\/experience-guidance-human-projection\.js';/);
});

test('EFX01C-13 + EFX01D-D2-09 + D3 accepted teaching copy exists in every required language without catalog mutation', () => {
  const bundle = loadBlueprint();
  const refs = [
    'guide.ask.current',
    'guide.answer.current',
    'guide.answer.next.terrain',
    'guide.answer.next.chat',
    'health.value.unavailable',
    'gesture.terrain-pan.help',
    'gesture.content-scroll.help',
    'gesture.terrain-zoom.help',
    'gesture.terrain-semantic-depth.help',
    'gesture.node-drag.help',
    'gesture.overlay-drag.help',
    'gesture.vessel-resize.help',
    'journey.scrub',
    'journey.revisit',
    'context-workspace.dock',
    'context-workspace.resize.se'
  ];
  for (const language of bundle.blueprint.product.requiredLanguages) {
    for (const ref of refs) assert.ok(bundle.strings[language][ref], `${language} missing ${ref}`);
  }
});

// [VXG RealForever]
