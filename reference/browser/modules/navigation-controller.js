import { $$ } from './dom.js';

export const RECENT_JOURNEY_LIMIT = 5;

const MAX_BACK_STACK = 128;
const cloneFrame = (frame) => structuredClone(frame);
const frameEquals = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function journeyWindow(events, start = null, size = RECENT_JOURNEY_LIMIT) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  if (!Number.isInteger(size) || size < 1) throw new TypeError('size must be a positive integer');
  const max = Math.max(0, events.length - size);
  const resolvedStart = start === null ? max : Math.max(0, Math.min(max, Number.isInteger(start) ? start : max));
  return { start: resolvedStart, entries: events.slice(resolvedStart, resolvedStart + size), total: events.length };
}

export function historicalFramePatch(event) {
  const frame = event?.after;
  if (!frame || typeof frame !== 'object') throw new TypeError('journey event.after must be an object');
  const patch = {};
  const screenTail = String(frame.screenRef || '').split('.').at(-1);
  if (screenTail && screenTail !== 'terrain') patch.contextProjection = screenTail;
  else patch.contextProjection = null;
  for (const key of ['projectRef', 'threadRef', 'channelRef', 'selectedNodeRef']) {
    if (frame[key] !== null && frame[key] !== undefined) patch[key] = frame[key];
  }
  return patch;
}

export function createNavigationController({ state, elementByRef, getProject, getThread, getChannel, resolveSemanticNodeRef = () => null, resolveInteractionRef = () => null, onFrameChange = () => {} }) {
  state.view = 'terrain';
  state.contextProjection ??= null;
  const currentScreenRef = () => state.contextProjection ? `screen.vexlife.${state.contextProjection}` : 'screen.vexlife.terrain';
  const currentRouteRef = () => state.contextProjection ? `route.${state.contextProjection}` : 'route.terrain';
  const semanticFrame = () => ({
    primaryStageScreenRef: 'screen.vexlife.terrain', screenRef: currentScreenRef(), routeRef: currentRouteRef(),
    contextProjection: state.contextProjection, projectRef: state.projectRef, threadRef: state.threadRef,
    channelRef: state.channelRef, selectedNodeRef: state.selectedNodeRef
  });
  const backStack = [];
  let browserHistoryEnabled = false;
  function appendJourney({ elementRef, interactionRef = null, actionRef, subjectRef = state.selectedNodeRef, before, after }) {
    const last = state.journey.at(-1);
    if (last && last.elementRef === elementRef && last.interactionRef === interactionRef && last.actionRef === actionRef &&
        last.subjectRef === subjectRef && frameEquals(last.before, before) && frameEquals(last.after, after)) {
      return { changed: false, event: last };
    }
    const event = {
      journeyRef: `journey.browser.${crypto.randomUUID()}`,
      elementRef,
      interactionRef,
      actionRef,
      subjectRef,
      before: cloneFrame(before),
      after: cloneFrame(after),
      formedAt: new Date().toISOString()
    };
    state.journey.push(event);
    return { changed: true, event };
  }
  function seedCurrentJourney(elementRef = state.selectedNodeRef, actionRef = 'action.navigation.home') {
    if (state.journey.length) return state.journey.at(-1);
    const frame = semanticFrame();
    return appendJourney({ elementRef, actionRef, before: frame, after: frame }).event;
  }
  function pushBackFrame(frame) {
    const last = backStack.at(-1);
    if (!last || !frameEquals(last, frame)) backStack.push(cloneFrame(frame));
    if (backStack.length > MAX_BACK_STACK) backStack.splice(0, backStack.length - MAX_BACK_STACK);
  }
  function normalizePatch(patch) {
    const next = { ...patch };
    if (Object.hasOwn(next, 'view')) { const requested = next.view; next.contextProjection = requested === 'terrain' ? null : requested; delete next.view; }
    next.view = 'terrain'; return next;
  }
  function navigate(elementRef, patch = {}, actionRef = 'action.navigation.semantic', { interactionRef = null, subjectRef = null } = {}) {
    const before = semanticFrame();
    const next = normalizePatch(patch);
    const explicitSemanticNodeRef = Object.hasOwn(next, 'selectedNodeRef') ? next.selectedNodeRef : null;
    const promotedSemanticNodeRef = explicitSemanticNodeRef ?? resolveSemanticNodeRef(elementRef);
    if (promotedSemanticNodeRef) next.selectedNodeRef = promotedSemanticNodeRef;
    else delete next.selectedNodeRef;
    Object.assign(state, next);
    const after = semanticFrame();
    const frameChanged = !frameEquals(before, after);
    if (frameChanged) pushBackFrame(before);
    const resolvedInteractionRef = interactionRef ?? resolveInteractionRef(elementRef) ?? null;
    const suppressSameFrameJourney = !frameChanged &&
      promotedSemanticNodeRef === after.selectedNodeRef &&
      actionRef === 'action.terrain.layout.reset';
    const journey = suppressSameFrameJourney
      ? { changed:false, event:state.journey.at(-1) ?? null }
      : appendJourney({
          elementRef,
          interactionRef: resolvedInteractionRef,
          actionRef,
          subjectRef: subjectRef ?? after.selectedNodeRef,
          before,
          after
        });
    if (frameChanged && browserHistoryEnabled && globalThis.history?.pushState) {
      globalThis.history.pushState({ vexlifeSemantic: true }, '', globalThis.location?.href);
    }
    onFrameChange(after);
    return journey.event;
  }
  function openContext(contextProjection, nodeRef, actionRef = 'action.context.open') {
    if (!['chat', 'health', 'living-journal'].includes(contextProjection)) throw new Error(`Unsupported contextual projection: ${contextProjection}`);
    return navigate(nodeRef, { contextProjection }, actionRef);
  }
  function returnToPrimaryStage(nodeRef = 'element.nav.terrain', actionRef = 'action.navigation.home') { return navigate(nodeRef, { contextProjection: null }, actionRef); }
  function applyFrame(frame) {
    const context = frame.contextProjection ?? (() => { const screenTail = String(frame.screenRef || '').split('.').at(-1); return ['chat', 'health', 'living-journal'].includes(screenTail) ? screenTail : null; })();
    state.view = 'terrain'; state.contextProjection = context; state.projectRef = frame.projectRef ?? state.projectRef; state.threadRef = frame.threadRef ?? state.threadRef; state.channelRef = frame.channelRef ?? state.channelRef; state.selectedNodeRef = frame.selectedNodeRef ?? state.selectedNodeRef;
  }
  function back() {
    const target = backStack.pop(); if (!target) return { changed: false, reason: 'BACK_STACK_EMPTY', frame: semanticFrame() };
    const before = semanticFrame(); applyFrame(target); const after = semanticFrame(); const journey = appendJourney({ elementRef: target.selectedNodeRef, actionRef: 'action.navigation.back', before, after }); onFrameChange(after); return { changed: !frameEquals(before, after), frame: cloneFrame(after), journeyEvent: journey.event };
  }
  function enableBrowserHistory() { if (!globalThis.history?.replaceState || !globalThis.history?.pushState) return false; backStack.splice(0); globalThis.history.replaceState({ vexlifeSemantic: true }, '', globalThis.location?.href); browserHistoryEnabled = true; return true; }
  function recentJourney(limit = RECENT_JOURNEY_LIMIT) { if (!Number.isInteger(limit) || limit < 1) throw new TypeError('limit must be a positive integer'); return state.journey.slice(-limit).map((event) => structuredClone(event)); }
  const fullJourney = () => state.journey.map((event) => structuredClone(event));
  const journeyProjection = (limit = RECENT_JOURNEY_LIMIT) => ({ fullEventCount: state.journey.length, recentTrajectory: recentJourney(limit) });
  const backDepth = () => backStack.length;
  function breadcrumb(ref) { const refs = []; let current = elementByRef.get(ref); const seen = new Set(); while (current && !seen.has(current.ref)) { seen.add(current.ref); refs.unshift(current.ref); current = current.parentRef ? elementByRef.get(current.parentRef) : null; } return refs; }
  function setSelection(groupRef, nodeRef) { state.selections.set(groupRef, nodeRef); $$(`[data-selection-group="${CSS.escape(groupRef)}"]`).forEach((element) => { const selected = element.dataset.nodeRef === nodeRef || element.dataset.selectionValue === nodeRef; element.classList.toggle('is-selected', selected); element.setAttribute('aria-selected', String(selected)); if (selected) element.setAttribute('aria-current', 'true'); else element.removeAttribute('aria-current'); }); }
  return { semanticFrame, seedCurrentJourney, navigate, openContext, returnToPrimaryStage, back, backDepth, enableBrowserHistory, recentJourney, fullJourney, journeyProjection, breadcrumb, setSelection, currentScreenRef, currentRouteRef, getProject, getThread, getChannel };
}

// [VXG RealForever]
