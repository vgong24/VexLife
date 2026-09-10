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
const TRANSIENT_ATTRIBUTE = 'data-vex-human-projection-transient';
const BROWSER_HUMAN_HELP_BINDINGS = new WeakMap();

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

export function resolveHumanHelpPlacement({ targetElement, surfaceElement = null, guideElement = null, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  const targetRect = geometry(targetElement);
  const surfaceRect = geometry(surfaceElement ?? guideElement);
  if (!targetRect || !surfaceRect || !documentRef || !windowRef) {
    return Object.freeze({ state:'FALLBACK_REQUIRED', presentationKind:FALLBACK_PRESENTATION_KIND, geometry:null, reason:'CURRENT_RENDERED_TARGET_UNAVAILABLE', coreResult:null });
  }
  const viewportRect = { left:0, top:0, width:Number(windowRef.innerWidth), height:Number(windowRef.innerHeight) };
  if (![viewportRect.width, viewportRect.height].every(Number.isFinite) || viewportRect.width <= 0 || viewportRect.height <= 0) {
    return Object.freeze({ state:'FALLBACK_REQUIRED', presentationKind:'NONVISUAL_DESCRIPTION', geometry:null, reason:'VIEWPORT_GEOMETRY_UNAVAILABLE', coreResult:null });
  }
  const excluded = new Set([targetElement, surfaceElement ?? guideElement]);
  const activeElement = documentRef.activeElement;
  const focusRect = activeElement && !excluded.has(activeElement) ? geometry(activeElement) : null;
  const direction = (windowRef.getComputedStyle?.(documentRef.documentElement) ?? globalThis.getComputedStyle?.(documentRef.documentElement))?.direction === 'rtl' ? 'RTL' : 'LTR';
  const coreResult = resolveGuidancePlacement({
    targetRect,
    surfaceSize: { width:surfaceRect.width, height:surfaceRect.height },
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

function styleTransientSurface(element) {
  Object.assign(element.style, {
    position:'fixed',
    left:'-10000px',
    top:'-10000px',
    right:'auto',
    bottom:'auto',
    width:'min(300px, calc(100vw - 24px))',
    height:'auto',
    padding:'10px 12px',
    border:'1px solid var(--line)',
    borderRadius:'12px',
    background:'color-mix(in srgb,var(--surface) 96%,transparent)',
    color:'var(--text)',
    boxShadow:'var(--shadow)',
    fontSize:'11px',
    lineHeight:'1.45',
    zIndex:'69',
    pointerEvents:'none'
  });
}

export function createBrowserHumanHelpProjection({
  navigation,
  addMessage,
  nextRecommendation,
  translate,
  windowElement,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  if (typeof navigation?.semanticFrame !== 'function') throw new Error('Human Help projection requires navigation.semanticFrame()');
  if (typeof addMessage !== 'function') throw new Error('Human Help projection requires addMessage()');
  if (typeof nextRecommendation !== 'function') throw new Error('Human Help projection requires nextRecommendation()');
  if (typeof translate !== 'function') throw new Error('Human Help projection requires current browser translation');
  if (!windowElement || !documentRef || !windowRef || typeof documentRef.createElement !== 'function') throw new Error('Human Help projection requires current browser DOM');

  let activeTarget = null;
  let transientSurface = null;
  let transientContent = '';
  let lastProjection = null;
  let resizeObserver = null;
  let mutationObserver = null;

  function clearObservers() {
    resizeObserver?.disconnect?.();
    mutationObserver?.disconnect?.();
    resizeObserver = null;
    mutationObserver = null;
  }
  function removeTransientSurface() {
    transientSurface?.remove?.();
    transientSurface = null;
  }
  function ensureTransientSurface() {
    if (transientSurface && transientSurface.isConnected !== false) return transientSurface;
    const node = documentRef.createElement('div');
    node.setAttribute(TRANSIENT_ATTRIBUTE, 'true');
    node.setAttribute('aria-hidden', 'true');
    node.textContent = transientContent;
    styleTransientSurface(node);
    documentRef.body?.append?.(node);
    transientSurface = node;
    return node;
  }
  function applyPlacement(placement) {
    if (placement?.state !== 'ANCHORED' || !placement.geometry) {
      removeTransientSurface();
      return;
    }
    const node = ensureTransientSurface();
    node.style.left = `${placement.geometry.left}px`;
    node.style.top = `${placement.geometry.top}px`;
  }
  function fallback(reason = 'CURRENT_RENDERED_TARGET_UNAVAILABLE') {
    return Object.freeze({ state:'FALLBACK_REQUIRED', presentationKind:windowRef.innerWidth <= 760 ? COMPACT_PRESENTATION_KIND : FALLBACK_PRESENTATION_KIND, geometry:null, reason, coreResult:null });
  }
  function currentPlacement() {
    if (!activeTarget) return fallback('CURRENT_RENDERED_TARGET_UNAVAILABLE');
    if (activeTarget.isConnected === false || !visibleElement(activeTarget)) return fallback('CURRENT_RENDERED_TARGET_DISAPPEARED');
    const surface = ensureTransientSurface();
    return resolveHumanHelpPlacement({ targetElement:activeTarget, surfaceElement:surface, documentRef, windowRef });
  }
  function refreshPlacement() {
    const placement = currentPlacement();
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
    transientContent = '';
    removeTransientSurface();
    return true;
  }
  function projectExplicitHelp() {
    dismiss();
    const frame = navigation.semanticFrame();
    const recommendation = nextRecommendation(frame);
    const featureRef = HUMAN_HELP_FEATURE_BY_SCREEN[frame.screenRef] ?? null;
    const projection = deriveHumanHelpProjection({ frame, recommendation, featureRef });
    addMessage('guide', { contentRef:projection.responseContentRef, contentParams:{}, intentRef:null });
    transientContent = translate(projection.responseContentRef, {});
    const targetRef = recommendation?.state === 'AVAILABLE' ? recommendation.targetNodeRef : frame.selectedNodeRef;
    activeTarget = nonempty(targetRef) ? documentRef.querySelector(`[data-node-ref="${selectorEscape(targetRef)}"]`) : null;
    const placement = currentPlacement();
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
    const existing = BROWSER_HUMAN_HELP_BINDINGS.get(globalRef);
    if (existing) return existing;
    const app = globalRef.__VEXLIFE_APP__;
    const guide = app?.guide;
    const button = documentRef.querySelector('[data-guide-intent-ref="intent.guide.current"]');
    const windowElement = documentRef.querySelector('#guideWindow');
    if (!app?.navigation || !guide || !button || !windowElement || typeof app.t !== 'function') return null;
    if (typeof guide.addMessage !== 'function' || typeof guide.nextRecommendation !== 'function') return null;

    const projection = createBrowserHumanHelpProjection({
      navigation: app.navigation,
      addMessage: (...args) => guide.addMessage(...args),
      nextRecommendation: (...args) => guide.nextRecommendation(...args),
      translate: (...args) => app.t(...args),
      windowElement,
      documentRef,
      windowRef: globalRef
    });
    button.addEventListener('click', projection.projectExplicitHelp);
    BROWSER_HUMAN_HELP_BINDINGS.set(globalRef, projection);
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
