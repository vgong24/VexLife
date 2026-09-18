import experienceRegistry from '../../../blueprint/experience-registry.json' with { type:'json' };
import terrainScreen from '../../../blueprint/fragments/screens/terrain.json' with { type:'json' };
import shellScreen from '../../../blueprint/fragments/screens/shell.json' with { type:'json' };
import {
  buildGuidanceProposal,
  buildHelpProjection,
  buildInteractionCue,
  resolveGuidancePlacement
} from '../../../src/core/experience-guidance.mjs';

export const HUMAN_HELP_FEATURE_BY_SCREEN = Object.freeze({
  'screen.vexlife.terrain': 'feature.vexlife.terrain',
  'screen.vexlife.chat': 'feature.vexlife.addressed-conversation'
});

export const HUMAN_HELP_INTERACTION_BY_SCREEN = Object.freeze({
  'screen.vexlife.terrain': Object.freeze({ gestureRef:'gesture.vexlife.terrain-pan', interactionFamily:'PAN' }),
  'screen.vexlife.chat': Object.freeze({ gestureRef:'gesture.vexlife.content-scroll', interactionFamily:'SCOPED_SCROLL' })
});

export const HUMAN_HELP_CURRENT_SURFACE_SELECTOR_BY_SCREEN = Object.freeze({
  'screen.vexlife.terrain': '#terrainFocus',
  'screen.vexlife.chat': '#view-chat'
});

const HUMAN_HELP_RESPONSE_BY_SCREEN = Object.freeze({
  'screen.vexlife.terrain': 'guide.answer.next.terrain',
  'screen.vexlife.chat': 'guide.answer.next.chat'
});

const HUMAN_HELP_DYNAMIC_INTERACTIONS_BY_SCREEN = Object.freeze({
  'screen.vexlife.terrain': Object.freeze([
    Object.freeze({ gestureRef:'gesture.vexlife.terrain-zoom', interactionFamily:'ZOOM', selector:'#terrainFocus', alternateControlSelector:'#terrainZoomIn' }),
    Object.freeze({ gestureRef:'gesture.vexlife.terrain-semantic-depth', interactionFamily:'SEMANTIC_DEPTH_SHIFT', selector:'#terrainFocus', alternateControlSelector:'#terrainUp' }),
    Object.freeze({ gestureRef:'gesture.vexlife.node-drag', interactionFamily:'DRAG_OR_MOVE', selector:'.e27-node' }),
    Object.freeze({ elementRef:'element.terrain.journey-scrub', ownerScreen:'terrain', interactionFamily:'SCRUB_OR_REVISIT', selector:'#terrainJourneyScrub' }),
    Object.freeze({ elementRef:'element.terrain.journey-revisit', ownerScreen:'terrain', interactionFamily:'SCRUB_OR_REVISIT', selector:'#terrainJourneyRevisit' })
  ]),
  'screen.vexlife.chat': Object.freeze([
    Object.freeze({ elementRef:'element.context-workspace.dock', ownerScreen:'shell', interactionFamily:'DOCK', selector:'#contextWorkspaceDock' }),
    Object.freeze({ elementRef:'element.context-workspace.resize.se', ownerScreen:'shell', interactionFamily:'RESIZE', selector:'#contextWorkspaceResizeSe' })
  ])
});

const HUMAN_HELP_SHARED_INTERACTIONS = Object.freeze([
  Object.freeze({ gestureRef:'gesture.vexlife.overlay-drag', interactionFamily:'DRAG_OR_MOVE', selector:'#guideHandle' }),
  Object.freeze({ gestureRef:'gesture.vexlife.vessel-resize', interactionFamily:'RESIZE', selector:'[data-resize-corner="se"]' })
]);

const SCREEN_OWNER_BY_KEY = Object.freeze({ terrain:terrainScreen, shell:shellScreen });
const FALLBACK_PRESENTATION_KIND = 'GUIDE_VESSEL_EXPLANATION';
const COMPACT_PRESENTATION_KIND = 'COMPACT_CONTEXT_SHEET';
const NAVIGATION_SELECTOR = '.e27-appbar, .e27-breadcrumb, .e27-recentbar';
const PROTECTED_SELECTOR = '.terrain-toolbar, .terrain-journey-window, .e27-context-surface:not([hidden]), .e27-surface-menu:not([hidden]), .e27-terrain-context:not([hidden]), .e27-drawer.show';
const TRANSIENT_ATTRIBUTE = 'data-vex-human-projection-transient';
const NONVISUAL_ATTRIBUTE = 'data-vex-human-projection-nonvisual';
const NONVISUAL_ID = 'vexHumanHelpNonvisual';
const BROWSER_HUMAN_HELP_BINDINGS = new WeakMap();
const BROWSER_HUMAN_HELP_BIND_JOBS = new WeakMap();
const BROWSER_HUMAN_HELP_BIND_RETRY_MS = 25;
const BROWSER_HUMAN_HELP_BIND_MAX_ATTEMPTS = 600;

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

function currentRenderedInteractionSurface(frame, documentRef) {
  const selector = HUMAN_HELP_CURRENT_SURFACE_SELECTOR_BY_SCREEN[frame?.screenRef] ?? null;
  return selector && documentRef ? documentRef.querySelector(selector) : null;
}

function flattenScreenElements(screen) {
  return (screen?.regions ?? []).flatMap((region) => region?.elements ?? []);
}

function interactionOwnerElement(ownerScreen, elementRef) {
  const screen = SCREEN_OWNER_BY_KEY[ownerScreen] ?? null;
  return flattenScreenElements(screen).find((candidate) => candidate?.elementRef === elementRef) ?? null;
}

function semanticGestureCandidate(preference, experience) {
  if (!preference?.gestureRef || !Array.isArray(experience?.gestureContracts)) return null;
  const contract = experience.gestureContracts.find((candidate) => candidate?.gestureRef === preference.gestureRef) ?? null;
  if (!contract || !nonempty(contract.gestureRef) || !nonempty(contract.resultActionRef) || !nonempty(contract.helpStringRef)) return null;
  const ownerRefs = new Set([contract.gestureRef, contract.resultActionRef]);
  try {
    const cue = buildInteractionCue({
      cueRef: `cue.browser.human-help.gesture.${contract.gestureRef}`,
      interactionFamily: preference.interactionFamily,
      intentionContentRef: contract.helpStringRef,
      routeState: 'CURRENT',
      availabilityState: 'AVAILABLE',
      actionRefOrNull: contract.resultActionRef,
      gestureRefOrNull: contract.gestureRef,
      targetBindingOrNull: null
    }, {
      isKnownSemanticRef: (ref) => ownerRefs.has(ref)
    });
    return Object.freeze({
      cue,
      inputMethods:Object.freeze(Array.isArray(contract.inputs) ? [...contract.inputs] : []),
      accessibilityRole:null,
      stableIdentifierRef:null
    });
  } catch {
    return null;
  }
}

function semanticElementCandidate(preference) {
  if (!preference?.elementRef || !preference?.ownerScreen) return null;
  const owner = interactionOwnerElement(preference.ownerScreen, preference.elementRef);
  if (!owner || !nonempty(owner.elementRef) || !nonempty(owner.interactionRef) || !nonempty(owner.actionRef) || !nonempty(owner.labelStringRef)) return null;
  const ownerRefs = new Set([owner.interactionRef, owner.actionRef]);
  try {
    const cue = buildInteractionCue({
      cueRef: `cue.browser.human-help.interaction.${owner.interactionRef}`,
      interactionFamily: preference.interactionFamily,
      intentionContentRef: owner.labelStringRef,
      routeState: 'CURRENT',
      availabilityState: 'AVAILABLE',
      actionRefOrNull: owner.actionRef,
      interactionRefOrNull: owner.interactionRef,
      targetBindingOrNull: null
    }, {
      isKnownSemanticRef: (ref) => ownerRefs.has(ref)
    });
    return Object.freeze({
      cue,
      inputMethods:Object.freeze([]),
      accessibilityRole:nonempty(owner.accessibility?.role) ? owner.accessibility.role : null,
      stableIdentifierRef:nonempty(owner.accessibility?.stableIdentifierRef) ? owner.accessibility.stableIdentifierRef : null
    });
  } catch {
    return null;
  }
}

function candidateRenderedSurface(selector, documentRef) {
  if (!documentRef) return null;
  const element = documentRef.querySelector(selector);
  return visibleElement(element) ? element : null;
}

function makeInteractionCandidate(preference, experience, documentRef, { requireRendered = false } = {}) {
  const semantic = preference?.gestureRef
    ? semanticGestureCandidate(preference, experience)
    : semanticElementCandidate(preference);
  if (!semantic) return null;
  const selector = preference.selector ?? null;
  const element = selector ? candidateRenderedSurface(selector, documentRef) : null;
  if (requireRendered && !element) return null;
  return Object.freeze({ ...semantic, selector, element });
}

function declaredInteractionPreferences(frame) {
  const preferences = [];
  const primary = HUMAN_HELP_INTERACTION_BY_SCREEN[frame?.screenRef] ?? null;
  if (primary) {
    preferences.push(Object.freeze({
      ...primary,
      selector:HUMAN_HELP_CURRENT_SURFACE_SELECTOR_BY_SCREEN[frame.screenRef] ?? null
    }));
  }
  preferences.push(...(HUMAN_HELP_DYNAMIC_INTERACTIONS_BY_SCREEN[frame?.screenRef] ?? []));
  preferences.push(...HUMAN_HELP_SHARED_INTERACTIONS);
  return Object.freeze(preferences);
}

function normalizedInteractionIndex(interactionIndex, length) {
  if (!Number.isInteger(interactionIndex) || length <= 0) return 0;
  return ((interactionIndex % length) + length) % length;
}

function interactionCandidateAt({ frame, experience = experienceRegistry, documentRef = null, interactionIndex = 0 } = {}) {
  if (!frame || typeof frame !== 'object' || !nonempty(frame.screenRef)) throw new Error('current semantic frame is required');
  const preferences = declaredInteractionPreferences(frame);
  if (preferences.length === 0) return null;
  const preference = preferences[normalizedInteractionIndex(interactionIndex, preferences.length)];
  return makeInteractionCandidate(preference, experience, documentRef, { requireRendered:Boolean(documentRef) });
}

export function deriveHumanHelpInteractionCandidates({ frame, experience = experienceRegistry, documentRef = null } = {}) {
  if (!frame || typeof frame !== 'object' || !nonempty(frame.screenRef)) throw new Error('current semantic frame is required');
  const candidates = declaredInteractionPreferences(frame)
    .map((preference) => makeInteractionCandidate(preference, experience, documentRef, { requireRendered:Boolean(documentRef) }))
    .filter(Boolean);
  return Object.freeze(candidates);
}

export function deriveHumanHelpInteractionCue({ frame, experience = experienceRegistry, interactionIndex = 0 } = {}) {
  return interactionCandidateAt({ frame, experience, interactionIndex })?.cue ?? null;
}

export function deriveHumanHelpProjection({
  frame,
  recommendation = null,
  featureRef = null,
  experience = experienceRegistry,
  interactionCueOverride = undefined
} = {}) {
  if (!frame || typeof frame !== 'object' || !nonempty(frame.screenRef)) throw new Error('current semantic frame is required');
  const currentFrameRef = frameRef(frame);
  const available = recommendation?.state === 'AVAILABLE' && nonempty(recommendation.actionRef) && nonempty(recommendation.targetNodeRef);
  const interactionCue = interactionCueOverride === undefined
    ? deriveHumanHelpInteractionCue({ frame, experience })
    : interactionCueOverride;
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
    interactionCue,
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
  const activeElementIsDocumentRoot = activeElement === documentRef.body || activeElement === documentRef.documentElement;
  const focusRect = activeElement && !activeElementIsDocumentRoot && !excluded.has(activeElement) ? geometry(activeElement) : null;
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
    pointerEvents:'none',
    animation:'none',
    transition:'none'
  });
}

function styleNonvisualSurface(element) {
  Object.assign(element.style, {
    position:'fixed',
    width:'1px',
    height:'1px',
    padding:'0',
    margin:'-1px',
    overflow:'hidden',
    clip:'rect(0 0 0 0)',
    whiteSpace:'nowrap',
    border:'0',
    animation:'none',
    transition:'none'
  });
}

export function createBrowserHumanHelpProjection({
  navigation,
  nextRecommendation,
  translate,
  windowElement,
  experience = experienceRegistry,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  if (typeof navigation?.semanticFrame !== 'function') throw new Error('Human Help projection requires navigation.semanticFrame()');
  if (typeof nextRecommendation !== 'function') throw new Error('Human Help projection requires nextRecommendation()');
  if (typeof translate !== 'function') throw new Error('Human Help projection requires current browser translation');
  if (!windowElement || !documentRef || !windowRef || typeof documentRef.createElement !== 'function') throw new Error('Human Help projection requires current browser DOM');

  let activeTarget = null;
  let activeInteractionCue = null;
  let activeInteractionCandidate = null;
  let transientSurface = null;
  let nonvisualSurface = null;
  let describedTarget = null;
  let priorDescribedBy = null;
  let transientContent = '';
  let lastProjection = null;
  let resizeObserver = null;
  let mutationObserver = null;
  const interactionCursorByFrame = new Map();

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
  function removeNonvisualSurface() {
    nonvisualSurface?.remove?.();
    nonvisualSurface = null;
  }
  function applyInteractionMetadata(node) {
    const cue = activeInteractionCue;
    node.dataset.cueRef = cue?.cueRef ?? '';
    node.dataset.interactionFamily = cue?.interactionFamily ?? '';
    node.dataset.gestureRef = cue?.gestureRefOrNull ?? '';
    node.dataset.actionRef = cue?.actionRefOrNull ?? '';
    node.dataset.interactionRef = cue?.interactionRefOrNull ?? '';
    node.dataset.inputMethods = (activeInteractionCandidate?.inputMethods ?? []).join(' ');
    node.dataset.accessibilityRole = activeInteractionCandidate?.accessibilityRole ?? '';
    node.dataset.stableIdentifierRef = activeInteractionCandidate?.stableIdentifierRef ?? '';
  }
  function ensureTransientSurface() {
    if (transientSurface && transientSurface.isConnected !== false) {
      transientSurface.textContent = transientContent;
      applyInteractionMetadata(transientSurface);
      return transientSurface;
    }
    const node = documentRef.createElement('div');
    node.setAttribute(TRANSIENT_ATTRIBUTE, 'true');
    node.setAttribute('aria-hidden', 'true');
    node.textContent = transientContent;
    applyInteractionMetadata(node);
    styleTransientSurface(node);
    documentRef.body?.append?.(node);
    transientSurface = node;
    return node;
  }
  function ensureNonvisualSurface() {
    if (!activeInteractionCue || typeof documentRef.body?.appendChild !== 'function') return null;
    if (nonvisualSurface && nonvisualSurface.isConnected !== false) {
      nonvisualSurface.textContent = transientContent;
      applyInteractionMetadata(nonvisualSurface);
      return nonvisualSurface;
    }
    const node = documentRef.createElement('div');
    node.id = NONVISUAL_ID;
    node.setAttribute(NONVISUAL_ATTRIBUTE, 'true');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-atomic', 'true');
    node.textContent = transientContent;
    applyInteractionMetadata(node);
    styleNonvisualSurface(node);
    documentRef.body.appendChild(node);
    nonvisualSurface = node;
    return node;
  }
  function clearTargetDescription() {
    if (!describedTarget) return;
    if (priorDescribedBy === null) describedTarget.removeAttribute?.('aria-describedby');
    else describedTarget.setAttribute?.('aria-describedby', priorDescribedBy);
    describedTarget = null;
    priorDescribedBy = null;
  }
  function bindTargetDescription() {
    clearTargetDescription();
    const description = ensureNonvisualSurface();
    if (!description || !activeTarget?.setAttribute) return;
    describedTarget = activeTarget;
    priorDescribedBy = activeTarget.getAttribute?.('aria-describedby') ?? null;
    const tokens = new Set(String(priorDescribedBy ?? '').split(/\s+/).filter(Boolean));
    tokens.add(description.id);
    activeTarget.setAttribute('aria-describedby', [...tokens].join(' '));
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
    if (activeTarget.isConnected === false || !visibleElement(activeTarget)) {
      clearTargetDescription();
      removeNonvisualSurface();
      return fallback('CURRENT_RENDERED_TARGET_DISAPPEARED');
    }
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
    clearTargetDescription();
    activeTarget = null;
    activeInteractionCue = null;
    activeInteractionCandidate = null;
    transientContent = '';
    removeTransientSurface();
    removeNonvisualSurface();
    return true;
  }
  function selectCurrentInteraction(frame) {
    const preferences = declaredInteractionPreferences(frame);
    if (preferences.length === 0) return null;
    const key = frameRef(frame);
    const cursor = interactionCursorByFrame.get(key) ?? 0;
    const candidate = interactionCandidateAt({ frame, experience, documentRef, interactionIndex:cursor });
    if (!candidate) return null;
    interactionCursorByFrame.set(key, cursor + 1);
    return candidate;
  }
  function projectExplicitHelp() {
    dismiss();
    const frame = navigation.semanticFrame();
    const recommendation = nextRecommendation(frame);
    const featureRef = HUMAN_HELP_FEATURE_BY_SCREEN[frame.screenRef] ?? null;
    const candidate = selectCurrentInteraction(frame);
    activeInteractionCandidate = candidate;
    activeInteractionCue = candidate?.cue ?? null;
    const projection = deriveHumanHelpProjection({
      frame,
      recommendation,
      featureRef,
      experience,
      interactionCueOverride:activeInteractionCue
    });
    transientContent = translate(projection.interactionCue?.intentionContentRef ?? projection.responseContentRef, {});
    if (projection.interactionCue) {
      activeTarget = candidate?.element ?? currentRenderedInteractionSurface(frame, documentRef);
    } else {
      const targetRef = recommendation?.state === 'AVAILABLE' ? recommendation.targetNodeRef : frame.selectedNodeRef;
      activeTarget = nonempty(targetRef) ? documentRef.querySelector(`[data-node-ref="${selectorEscape(targetRef)}"]`) : null;
    }
    if (activeInteractionCue && activeTarget) bindTargetDescription();
    const placement = currentPlacement();
    applyPlacement(placement);
    lastProjection = Object.freeze({
      ...projection,
      frame:structuredClone(frame),
      placement,
      interactionProjection: candidate ? Object.freeze({
        inputMethods:[...(candidate.inputMethods ?? [])],
        accessibilityRole:candidate.accessibilityRole ?? null,
        stableIdentifierRef:candidate.stableIdentifierRef ?? null
      }) : null
    });
    observeTarget();
    return lastProjection;
  }
  function snapshot() { return lastProjection ? structuredClone(lastProjection) : null; }
  const onResize = () => { if (activeTarget) refreshPlacement(); };
  const onPointerDown = (event) => {
    if (event.target?.closest?.('#guideHandle, [data-resize-corner]')) dismiss();
  };
  const onKeyDown = (event) => {
    if (event?.key !== 'Escape') return;
    if (!activeInteractionCue && !transientSurface && !nonvisualSurface) return;
    dismiss();
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
  };
  windowRef.addEventListener('resize', onResize);
  windowRef.addEventListener('keydown', onKeyDown, true);
  windowElement.addEventListener('pointerdown', onPointerDown, true);
  function dispose() {
    dismiss();
    windowRef.removeEventListener('resize', onResize);
    windowRef.removeEventListener('keydown', onKeyDown, true);
    windowElement.removeEventListener('pointerdown', onPointerDown, true);
  }
  return Object.freeze({ projectExplicitHelp, refreshPlacement, dismiss, snapshot, dispose });
}

export function bindBrowserHumanHelpProjectionAtReady({ globalRef = globalThis } = {}) {
  const documentRef = globalRef?.document;
  if (!documentRef || typeof globalRef.addEventListener !== 'function') return Object.freeze({ state:'NOT_BROWSER' });
  if (BROWSER_HUMAN_HELP_BINDINGS.has(globalRef)) return Object.freeze({ state:'ALREADY_BOUND' });
  if (BROWSER_HUMAN_HELP_BIND_JOBS.has(globalRef)) return Object.freeze({ state:'BIND_PENDING' });

  function bind() {
    const existing = BROWSER_HUMAN_HELP_BINDINGS.get(globalRef);
    if (existing) return existing;
    const app = globalRef.__VEXLIFE_APP__;
    const guide = app?.guide;
    const button = documentRef.querySelector('[data-guide-intent-ref="intent.guide.current"]');
    const windowElement = documentRef.querySelector('#guideWindow');
    if (!app?.navigation || !guide || !button || !windowElement || typeof app.t !== 'function') return null;
    if (typeof guide.nextRecommendation !== 'function') return null;

    const projection = createBrowserHumanHelpProjection({
      navigation: app.navigation,
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

  let attempts = 0;
  let timerId = null;
  let settled = false;
  const onReady = () => { attempt(); };

  function cleanup() {
    if (timerId !== null && typeof globalRef.clearTimeout === 'function') {
      globalRef.clearTimeout(timerId);
      timerId = null;
    }
    globalRef.removeEventListener?.('DOMContentLoaded', onReady);
    globalRef.removeEventListener?.('load', onReady);
    BROWSER_HUMAN_HELP_BIND_JOBS.delete(globalRef);
  }

  function scheduleRetry() {
    if (settled || attempts >= BROWSER_HUMAN_HELP_BIND_MAX_ATTEMPTS) return;
    if (typeof globalRef.setTimeout === 'function') {
      timerId = globalRef.setTimeout(attempt, BROWSER_HUMAN_HELP_BIND_RETRY_MS);
    }
  }

  function attempt() {
    if (settled) return null;
    attempts += 1;
    const projection = bind();
    if (projection) {
      settled = true;
      cleanup();
      return projection;
    }
    if (attempts >= BROWSER_HUMAN_HELP_BIND_MAX_ATTEMPTS) {
      settled = true;
      cleanup();
      return null;
    }
    scheduleRetry();
    return null;
  }

  BROWSER_HUMAN_HELP_BIND_JOBS.set(globalRef, Object.freeze({ attempt }));
  globalRef.addEventListener('DOMContentLoaded', onReady, { once:true });
  globalRef.addEventListener('load', onReady, { once:true });

  if (documentRef.readyState === 'complete') {
    if (typeof globalRef.queueMicrotask === 'function') globalRef.queueMicrotask(attempt);
    else attempt();
    return Object.freeze({ state:'BIND_QUEUED' });
  }
  if (typeof globalRef.setTimeout === 'function') timerId = globalRef.setTimeout(attempt, 0);
  return Object.freeze({ state:'BIND_ON_DOM_CONTENT_LOADED' });
}

if (globalThis.document) bindBrowserHumanHelpProjectionAtReady();

// [VXG RealForever]