import { $$ } from './dom.js';

export function createNavigationController({ state, elementByRef, getProject, getThread, getChannel, onFrameChange = () => {} }) {
  const currentScreenRef = () => `screen.vexlife.${state.view}`;
  const currentRouteRef = () => `route.${state.view}`;
  const semanticFrame = () => ({
    screenRef: currentScreenRef(), routeRef: currentRouteRef(), projectRef: state.projectRef,
    threadRef: state.threadRef, channelRef: state.channelRef, selectedNodeRef: state.selectedNodeRef
  });
  function navigate(nodeRef, patch = {}, actionRef = 'action.navigation.semantic') {
    const before = semanticFrame();
    Object.assign(state, patch);
    state.selectedNodeRef = nodeRef || state.selectedNodeRef;
    const after = semanticFrame();
    const last = state.journey.at(-1);
    if (!last || JSON.stringify(last.after) !== JSON.stringify(after)) {
      state.journey.push({ journeyRef: `journey.browser.${crypto.randomUUID()}`, elementRef: nodeRef, actionRef, before, after, formedAt: new Date().toISOString() });
      state.journey = state.journey.slice(-12);
    }
    onFrameChange(after);
  }
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
  return { semanticFrame, navigate, breadcrumb, setSelection, currentScreenRef, currentRouteRef, getProject, getThread, getChannel };
}

// [VXG RealForever]
