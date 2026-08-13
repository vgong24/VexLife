import { $$ } from './dom.js';

const MAX_BACK_STACK = 128;
const cloneFrame = (frame) => structuredClone(frame);
const frameEquals = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function createNavigationController({ state, elementByRef, getProject, getThread, getChannel, onFrameChange = () => {} }) {
  const currentScreenRef = () => `screen.vexlife.${state.view}`;
  const currentRouteRef = () => `route.${state.view}`;
  const semanticFrame = () => ({
    screenRef: currentScreenRef(), routeRef: currentRouteRef(), projectRef: state.projectRef,
    threadRef: state.threadRef, channelRef: state.channelRef, selectedNodeRef: state.selectedNodeRef
  });
  const backStack = [];
  let browserHistoryEnabled = false;

  function appendJourney({ elementRef, actionRef, before, after }) {
    const last = state.journey.at(-1);
    if (last && frameEquals(last.after, after) && last.actionRef === actionRef) return last;
    const event = {
      journeyRef: `journey.browser.${crypto.randomUUID()}`,
      elementRef,
      actionRef,
      before: cloneFrame(before),
      after: cloneFrame(after),
      formedAt: new Date().toISOString()
    };
    state.journey.push(event);
    return event;
  }

  function pushBackFrame(frame) {
    const last = backStack.at(-1);
    if (!last || !frameEquals(last, frame)) backStack.push(cloneFrame(frame));
    if (backStack.length > MAX_BACK_STACK) backStack.splice(0, backStack.length - MAX_BACK_STACK);
  }

  function navigate(nodeRef, patch = {}, actionRef = 'action.navigation.semantic') {
    const before = semanticFrame();
    Object.assign(state, patch);
    state.selectedNodeRef = nodeRef || state.selectedNodeRef;
    const after = semanticFrame();
    if (!frameEquals(before, after)) {
      pushBackFrame(before);
      appendJourney({ elementRef: nodeRef, actionRef, before, after });
      if (browserHistoryEnabled && globalThis.history?.pushState) {
        globalThis.history.pushState({ vexlifeSemantic: true }, '', globalThis.location?.href);
      }
    }
    onFrameChange(after);
    return state.journey.at(-1) ?? null;
  }

  function applyFrame(frame) {
    const screenTail = String(frame.screenRef || '').split('.').at(-1);
    if (screenTail) state.view = screenTail;
    state.projectRef = frame.projectRef ?? state.projectRef;
    state.threadRef = frame.threadRef ?? state.threadRef;
    state.channelRef = frame.channelRef ?? state.channelRef;
    state.selectedNodeRef = frame.selectedNodeRef ?? state.selectedNodeRef;
  }

  function back() {
    const target = backStack.pop();
    if (!target) return { changed: false, reason: 'BACK_STACK_EMPTY', frame: semanticFrame() };
    const before = semanticFrame();
    applyFrame(target);
    const after = semanticFrame();
    const event = appendJourney({ elementRef: target.selectedNodeRef, actionRef: 'action.navigation.back', before, after });
    onFrameChange(after);
    return { changed: !frameEquals(before, after), frame: cloneFrame(after), journeyEvent: event };
  }

  function enableBrowserHistory() {
    if (!globalThis.history?.replaceState || !globalThis.history?.pushState) return false;
    backStack.splice(0);
    globalThis.history.replaceState({ vexlifeSemantic: true }, '', globalThis.location?.href);
    browserHistoryEnabled = true;
    return true;
  }

  function recentJourney(limit = 12) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError('recent journey limit must be a positive integer');
    return state.journey.slice(-limit).map((event) => structuredClone(event));
  }
  const fullJourney = () => state.journey.map((event) => structuredClone(event));
  const journeyProjection = (limit = 12) => ({ fullEventCount: state.journey.length, recentTrajectory: recentJourney(limit) });
  const backDepth = () => backStack.length;

  function breadcrumb(ref) {
    const refs = []; let current = elementByRef.get(ref); const seen = new Set();
    while (current && !seen.has(current.ref)) {
      seen.add(current.ref); refs.unshift(current.ref);
      current = current.parentRef ? elementByRef.get(current.parentRef) : null;
    }
    return refs;
  }
  function setSelection(groupRef, nodeRef) {
    state.selections.set(groupRef, nodeRef);
    $$(`[data-selection-group="${CSS.escape(groupRef)}"]`).forEach((element) => {
      const selected = element.dataset.nodeRef === nodeRef || element.dataset.selectionValue === nodeRef;
      element.classList.toggle('is-selected', selected);
      element.setAttribute('aria-selected', String(selected));
      if (selected) element.setAttribute('aria-current', 'true'); else element.removeAttribute('aria-current');
    });
  }
  return {
    semanticFrame, navigate, back, backDepth, enableBrowserHistory,
    recentJourney, fullJourney, journeyProjection, breadcrumb, setSelection,
    currentScreenRef, currentRouteRef, getProject, getThread, getChannel
  };
}

// [VXG RealForever]
