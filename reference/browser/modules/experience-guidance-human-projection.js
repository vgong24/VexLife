import {
  buildGuidanceProposal,
  buildHelpProjection,
  resolveGuidancePlacement
} from '../../../src/core/experience-guidance.mjs';

export const HUMAN_HELP_FEATURE_BY_SCREEN = Object.freeze({
  'screen.vexlife.terrain': 'feature.vexlife.terrain',
  'screen.vexlife.chat': 'feature.vexlife.addressed-conversation'
});

const HUMAN_HELP_RESPONSE_BY_SCREEN = Object.freeze({
  'screen.vexlife.terrain': 'guide.answer.next.terrain',
  'screen.vexlife.chat': 'guide.answer.next.chat'
});

const FALLBACK_PRESENTATION_KIND = 'GUIDE_VESSEL_EXPLANATION';
const COMPACT_PRESENTATION_KIND = 'COMPACT_CONTEXT_SHEET';
const NAVIGATION_SELECTOR = '.e27-appbar, .e27-breadcrumb, .e27-recentbar';
const PROTECTED_SELECTOR = '.terrain-toolbar, .terrain-journey-window, .e27-context-surface:not([hidden]), .e27-surface-menu:not([hidden]), .e27-terrain-context:not([hidden]), .e27-drawer.show';
const STYLE_PROPERTIES = Object.freeze(['left', 'right', 'top', 'bottom', 'width', 'height']);

const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const frameRef = (frame) => `frame.browser.${frame?.screenRef ?? 'unknown'}.${frame?.routeRef ?? 'unknown'}.${frame?.selectedNodeRef ?? 'none'}`;
const visibleElement = (element) => Boolean(element?.isConnected !== false && element?.getClientRects?.().length > 0);
const geometry = (element) => {
  if (!visibleElement(element)) return null;
  const value = element.getBoundingClientRect();
  return { left:value.left, top:value.top, width:value.width, height:value.height, right:value.right, bottom:value.bottom };
};
const selectorEscape = (value) => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');

function currentTargetBinding(recommendation, frame) {
  if (recommendation?.state !== 'AVAILABLE' || !nonempty(recommendation.targetNodeRef)) return null;
  return Object.freeze({
    targetRef: recommendation.targetNodeRef,
    targetKind: 'ELEMENT',
    screenRefOrNull: frame.screenRef ?? null,
    regionRefOrNull: null,
    componentRefOrNull: null,
    slotRefOrNull: null,
    instanceRefOrNull: null,
    entityRefOrNull: null,
    selectionRefOrNull: null,
    bindingPolicy: 'STATIC_CANONICAL_TARGET'
  });
}

export function deriveHumanHelpProjection({ frame, recommendation = null, featureRef = null } = {}) {
  if (!frame || typeof frame !== 'object' || !nonempty(frame.screenRef)) throw new Error('current semantic frame is required');
  const currentFrameRef = frameRef(frame);
  const available = recommendation?.state === 'AVAILABLE' && nonempty(recommendation.actionRef) && nonempty(recommendation.targetNodeRef);
  const sections = [
    { sectionKind:'WHAT_CAN_I_DO_HERE', itemRefs:[available ? recommendation.actionRef : frame.screenRef] },
    ...(nonempty(featureRef) ? [{ sectionKind:'WHAT_CAN_VEX_HELP_WITH_HERE', itemRefs:[featureRef] }] : []),
    ...(available ? [{ sectionKind:'SHOW_ME_HOW', itemRefs:[recommendation.targetNodeRef] }] : [{ sectionKind:'WHY_UNAVAILABLE', itemRefs:[recommendation?.reason ?? 'NO_CURRENT_EXECUTABLE_RECOMMENDATION'] }]),
    { sectionKind:'RECOVERY_AND_GET_BACK', itemRefs:['action.navigation.back'] }
  ];
  const proposals = [];
  if (available && nonempty(featureRef)) {
    proposals.push(buildGuidanceProposal({
      proposalRef: `proposal.browser.human-help.${frame.screenRef}.${recommendation.targetNodeRef}`,
      featureRef,
      currentFrameRef,
      invocationClass: 'EXPLICIT_HELP',
      purposeClass: 'EXPLORE',
      whyRelevantRefs: [`reason.current-frame.${frame.screenRef}`, `reason.current-action.${recommendation.actionRef}`],
      awarenessState: 'OFFERED_THIS_SESSION',
      routeState: 'CURRENT',
      availabilityState: 'AVAILABLE',
      exposureRef: 'exposure.vexlife.contextual',
      targetBindingOrNull: currentTargetBinding(recommendation, frame),
      suggestedActionRefOrNull: recommendation.actionRef
    }));
  }
  const help = buildHelpProjection({ currentFrameRef, sections, proposals });
  return Object.freeze({
    help,
    featureRef: nonempty(featureRef) ? featureRef : null,
    recommendation: recommendation ? structuredClone(recommendation) : null,
    offerCount: help.proposals.length,
    responseContentRef: available ? (HUMAN_HELP_RESPONSE_BY_SCREEN[frame.screenRef] ?? recommendation.labelStringRef ?? 'health.value.unavailable') : 'health.value.unavailable',
    effects: false,
    navigationEffect: false,
    journeyEffect: false,
    persistenceEffect: false,
    autoExecute: false
  });
}

function collectRects(documentRef, selector, excluded = new Set()) {
  return [...documentRef.querySelectorAll(selector)]
    .filter((element) => !excluded.has(element) && visibleElement(element))
    .map(geometry)
    .filter(Boolean);
}

export function resolveHumanHelpPlacement({ targetElement, guideElement, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  const targetRect = geometry(targetElement);
  const guideRect = geometry(guideElement);
  if (!targetRect || !guideRect || !documentRef || !windowRef) {
    return Object.freeze({ state:'FALLBACK_REQUIRED', presentationKind:FALLBACK_PRESENTATION_KIND, geometry:null, reason:'CURRENT_RENDERED_TARGET_UNAVAILABLE', coreResult:null });
  }
  const viewportRect = { left:0, top:0, width:Number(windowRef.innerWidth), height:Number(windowRef.innerHeight) };
  if (![viewportRect.width, viewportRect.height].every(Number.isFinite) || viewportRect.width <= 0 || viewportRect.height <= 0) {
    return Object.freeze({ state:'FALLBACK_REQUIRED', presentationKind:'NONVISUAL_DESCRIPTION', geometry:null, reason:'VIEWPORT_GEOMETRY_UNAVAILABLE', coreResult:null });
  }
  const excluded = new Set([targetElement, guideElement]);
  const activeElement = documentRef.activeElement;
  const focusRect = activeElement && !excluded.has(activeElement) ? geometry(activeElement) : null;
  const direction = (windowRef.getComputedStyle?.(documentRef.documentElement) ?? globalThis.getComputedStyle?.(documentRef.documentElement))?.direction === 'rtl' ? 'RTL' : 'LTR';
  const coreResult = resolveGuidancePlacement({
    targetRect,
    surfaceSize: { width:guideRect.width, height:guideRect.height },
    viewportRect,
    safeArea: viewportRect,
    protectedRects: collectRects(documentRef, PROTECTED_SELECTOR, excluded),
    navigationRects: collectRects(documentRef, NAVIGATION_SELECTOR, excluded),
    focusRect,
    readingDirection: direction
  });
  if (viewportRect.width <= 760) {
    return Object.freeze({ state:'FALLBACK_REQUIRED', presentationKind:COMPACT_PRESENTATION_KIND, geometry:null, reason:'COMPACT_VIEWPORT', coreResult });
  }
  if (coreResult.state === 'ANCHORED') {
    return Object.freeze({ ...coreResult, coreResult });
  }
  return Object.freeze({ ...coreResult, presentationKind:FALLBACK_PRESENTATION_KIND, geometry:null, reason:'NO_SAFE_ANCHORED_GUIDE_POSITION', coreResult });
}

function captureInlineStyle(element) {
  return Object.fromEntries(STYLE_PROPERTIES.map((property) => [property, element.style[property] ?? '']));
}
function restoreInlineStyle(element, snapshot) {
  if (!snapshot) return;
  for (const property of STYLE_PROPERTIES) element.style[property] = snapshot[property] ?? '';
}

export function createBrowserHumanHelpProjection({
  navigation,
  addMessage,
  nextRecommendation,
  windowElement,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  if (typeof navigation?.semanticFrame !== 'function') throw new Error('Human Help projection requires navigation.semanticFrame()');
  if (typeof addMessage !== 'function') throw new Error('Human Help projection requires addMessage()');
  if (typeof nextRecommendation !== 'function') throw new Error('Human Help projection requires nextRecommendation()');
  if (!windowElement || !documentRef || !windowRef) throw new Error('Human Help projection requires current browser DOM');

  let baselineStyle = null;
  let activeTarget = null;
  let lastProjection = null;
  let resizeObserver = null;
  let mutationObserver = null;

  function clearObservers() {
    resizeObserver?.disconnect?.();
    mutationObserver?.disconnect?.();
    resizeObserver = null;
    mutationObserver = null;
  }
  function applyPlacement(placement) {
    if (baselineStyle === null) baselineStyle = captureInlineStyle(windowElement);
    if (placement?.state === 'ANCHORED' && placement.geometry) {
      windowElement.style.left = `${placement.geometry.left}px`;
      windowElement.style.top = `${placement.geometry.top}px`;
      windowElement.style.right = 'auto';
      windowElement.style.bottom = 'auto';
    } else restoreInlineStyle(windowElement, baselineStyle);
    windowElement.dataset.guidancePresentationKind = placement?.presentationKind ?? FALLBACK_PRESENTATION_KIND;
    windowElement.dataset.guidanceTransient = 'true';
  }
  function fallback(reason = 'CURRENT_RENDERED_TARGET_UNAVAILABLE') {
    return Object.freeze({ state:'FALLBACK_REQUIRED', presentationKind:windowRef.innerWidth <= 760 ? COMPACT_PRESENTATION_KIND : FALLBACK_PRESENTATION_KIND, geometry:null, reason, coreResult:null });
  }
  function refreshPlacement() {
    const placement = activeTarget?.isConnected !== false && visibleElement(activeTarget)
      ? resolveHumanHelpPlacement({ targetElement:activeTarget, guideElement:windowElement, documentRef, windowRef })
      : fallback('CURRENT_RENDERED_TARGET_DISAPPEARED');
    applyPlacement(placement);
    if (lastProjection) lastProjection = Object.freeze({ ...lastProjection, placement });
    return placement;
  }
  function observeTarget() {
    clearObservers();
    if (!activeTarget) return;
    if (typeof globalThis.ResizeObserver === 'function') {
      resizeObserver = new globalThis.ResizeObserver(() => refreshPlacement());
      resizeObserver.observe(activeTarget);
    }
    if (typeof globalThis.MutationObserver === 'function' && documentRef.body) {
      mutationObserver = new globalThis.MutationObserver(() => {
        if (!activeTarget?.isConnected) refreshPlacement();
      });
      mutationObserver.observe(documentRef.body, { childList:true, subtree:true });
    }
  }
  function dismiss() {
    clearObservers();
    activeTarget = null;
    restoreInlineStyle(windowElement, baselineStyle);
    baselineStyle = null;
    delete windowElement.dataset.guidancePresentationKind;
    delete windowElement.dataset.guidanceTransient;
    return true;
  }
  function projectExplicitHelp() {
    dismiss();
    const frame = navigation.semanticFrame();
    const recommendation = nextRecommendation(frame);
    const featureRef = HUMAN_HELP_FEATURE_BY_SCREEN[frame.screenRef] ?? null;
    const projection = deriveHumanHelpProjection({ frame, recommendation, featureRef });
    addMessage('guide', { contentRef:projection.responseContentRef, contentParams:{}, intentRef:null });
    const targetRef = recommendation?.state === 'AVAILABLE' ? recommendation.targetNodeRef : frame.selectedNodeRef;
    activeTarget = nonempty(targetRef) ? documentRef.querySelector(`[data-node-ref="${selectorEscape(targetRef)}"]`) : null;
    const placement = activeTarget
      ? resolveHumanHelpPlacement({ targetElement:activeTarget, guideElement:windowElement, documentRef, windowRef })
      : fallback('CURRENT_RENDERED_TARGET_UNAVAILABLE');
    applyPlacement(placement);
    lastProjection = Object.freeze({ ...projection, frame:structuredClone(frame), placement });
    observeTarget();
    return lastProjection;
  }
  function snapshot() { return lastProjection ? structuredClone(lastProjection) : null; }
  const onResize = () => { if (activeTarget) refreshPlacement(); };
  const onPointerDown = (event) => {
    if (event.target?.closest?.('#guideHandle, [data-resize-corner]')) dismiss();
  };
  windowRef.addEventListener('resize', onResize);
  windowElement.addEventListener('pointerdown', onPointerDown, true);
  function dispose() {
    dismiss();
    windowRef.removeEventListener('resize', onResize);
    windowElement.removeEventListener('pointerdown', onPointerDown, true);
  }
  return Object.freeze({ projectExplicitHelp, refreshPlacement, dismiss, snapshot, dispose });
}


export function bindBrowserHumanHelpProjectionAtReady({ globalRef = globalThis } = {}) {
  const documentRef = globalRef?.document;
  if (!documentRef || typeof globalRef.addEventListener !== 'function') return Object.freeze({ state:'NOT_BROWSER' });

  function bind() {
    if (globalRef.__VEXLIFE_HUMAN_HELP_PROJECTION__) return globalRef.__VEXLIFE_HUMAN_HELP_PROJECTION__;
    const app = globalRef.__VEXLIFE_APP__;
    const guide = app?.guide;
    const button = documentRef.querySelector('[data-guide-intent-ref="intent.guide.current"]');
    const windowElement = documentRef.querySelector('#guideWindow');
    if (!app?.navigation || !guide || !button || !windowElement) return null;
    if (typeof guide.addMessage !== 'function' || typeof guide.nextRecommendation !== 'function') return null;

    const projection = createBrowserHumanHelpProjection({
      navigation: app.navigation,
      addMessage: (...args) => guide.addMessage(...args),
      nextRecommendation: (...args) => guide.nextRecommendation(...args),
      windowElement,
      documentRef,
      windowRef: globalRef
    });
    button.addEventListener('click', projection.projectExplicitHelp);
    globalRef.__VEXLIFE_HUMAN_HELP_PROJECTION__ = projection;
    return projection;
  }

  if (documentRef.readyState === 'complete') {
    globalRef.queueMicrotask?.(bind);
    return Object.freeze({ state:'BIND_QUEUED' });
  }
  globalRef.addEventListener('DOMContentLoaded', bind, { once:true });
  return Object.freeze({ state:'BIND_ON_DOM_CONTENT_LOADED' });
}

if (globalThis.document) bindBrowserHumanHelpProjectionAtReady();

// [VXG RealForever]
