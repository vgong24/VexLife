const ACTIVE_SPACE_BINDINGS = new WeakMap();
const PANEL_STATES = new WeakMap();
const FOCUSABLE_SELECTOR = [
  '[data-uxe-autofocus]',
  '[autofocus]',
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function assertElement(value, label) {
  if (!value || value.nodeType !== 1) throw new TypeError(`${label} must be an Element`);
  return value;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundPx(value) {
  return Math.round(finiteNonNegative(value) * 100) / 100;
}

function publishAvailableSpace(host, body) {
  const rect = body.getBoundingClientRect();
  const inlineSize = roundPx(rect.width);
  const blockSize = roundPx(rect.height);
  body.style.setProperty('--uxe-available-inline-size', `${inlineSize}px`);
  body.style.setProperty('--uxe-available-block-size', `${blockSize}px`);
  body.dataset.uxeAvailableInlineSize = String(inlineSize);
  body.dataset.uxeAvailableBlockSize = String(blockSize);
  const detail = Object.freeze({ inlineSize, blockSize });
  host.dispatchEvent(new CustomEvent('vexlife:available-space', { detail }));
  return detail;
}

export function bindAvailableSpace(host, { body = host?.querySelector?.('.uxe-active-surface-body') } = {}) {
  assertElement(host, 'host');
  assertElement(body, 'body');
  const prior = ACTIVE_SPACE_BINDINGS.get(host);
  if (prior) return prior;

  let observer = null;
  const publish = () => publishAvailableSpace(host, body);
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(publish);
    observer.observe(body);
  }
  const view = body.ownerDocument?.defaultView;
  view?.addEventListener?.('resize', publish, { passive: true });
  publish();

  const binding = Object.freeze({
    snapshot: publish,
    disconnect() {
      observer?.disconnect();
      view?.removeEventListener?.('resize', publish);
      ACTIVE_SPACE_BINDINGS.delete(host);
    }
  });
  ACTIVE_SPACE_BINDINGS.set(host, binding);
  return binding;
}

function appendTextOrNode(target, value) {
  if (value === null || value === undefined || value === '') return false;
  if (value?.nodeType) target.append(value);
  else target.append(target.ownerDocument.createTextNode(String(value)));
  return true;
}

export function renderCategorizedRows(container, categories = []) {
  assertElement(container, 'container');
  if (!Array.isArray(categories)) throw new TypeError('categories must be an array');
  const doc = container.ownerDocument;
  const fragment = doc.createDocumentFragment();
  let rowCount = 0;

  categories.forEach((category, categoryIndex) => {
    const section = doc.createElement('section');
    section.className = 'uxe-setting-category';
    section.dataset.categoryIndex = String(categoryIndex);

    const heading = doc.createElement('h3');
    heading.className = 'uxe-setting-category-title';
    heading.textContent = String(category?.label ?? 'Settings');
    section.append(heading);

    const rows = Array.isArray(category?.rows) ? category.rows : [];
    for (const [rowIndex, row] of rows.entries()) {
      const item = doc.createElement('div');
      item.className = 'uxe-setting-row';
      item.dataset.availability = String(row?.availability ?? 'UNKNOWN').toUpperCase();

      const label = doc.createElement('div');
      label.className = 'uxe-setting-label';
      label.textContent = String(row?.label ?? '');
      item.append(label);

      const value = doc.createElement('div');
      value.className = 'uxe-setting-value';
      appendTextOrNode(value, row?.currentValue);
      appendTextOrNode(value, row?.control);
      item.append(value);

      if (row?.explanation) {
        const explanation = doc.createElement('p');
        explanation.className = 'uxe-setting-explanation';
        explanation.id = `uxe-setting-${categoryIndex}-${rowIndex}-explanation`;
        explanation.textContent = String(row.explanation);
        item.append(explanation);
      }

      const availability = doc.createElement('span');
      availability.className = 'uxe-setting-availability';
      availability.textContent = String(row?.availability ?? 'UNKNOWN').toUpperCase();
      availability.setAttribute('aria-label', `Availability: ${availability.textContent}`);
      item.append(availability);

      section.append(item);
      rowCount += 1;
    }
    fragment.append(section);
  });

  container.replaceChildren(fragment);
  return Object.freeze({ categoryCount: categories.length, rowCount });
}

function isCompact(dialog, breakpoint) {
  const view = dialog.ownerDocument?.defaultView;
  return Boolean(view?.matchMedia?.(`(max-width:${breakpoint}px)`).matches);
}

function clampShift(dialog, nextX, nextY) {
  const view = dialog.ownerDocument?.defaultView;
  const rect = dialog.getBoundingClientRect();
  const margin = 8;
  const maxX = Math.max(0, (finiteNonNegative(view?.innerWidth) - rect.width) / 2 - margin);
  const maxY = Math.max(0, (finiteNonNegative(view?.innerHeight) - rect.height) / 2 - margin);
  return {
    x: Math.max(-maxX, Math.min(maxX, nextX)),
    y: Math.max(-maxY, Math.min(maxY, nextY))
  };
}

function setShift(dialog, state, x, y) {
  const next = isCompact(dialog, state.compactBreakpoint) ? { x: 0, y: 0 } : clampShift(dialog, x, y);
  state.shiftX = roundPx(next.x);
  state.shiftY = roundPx(next.y);
  dialog.style.setProperty('--uxe-panel-shift-x', `${state.shiftX}px`);
  dialog.style.setProperty('--uxe-panel-shift-y', `${state.shiftY}px`);
}

function installDragHandle(handle, dialog, state) {
  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    if (isCompact(dialog, state.compactBreakpoint)) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: state.shiftX, startY: state.shiftY };
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setShift(dialog, state, drag.startX + event.clientX - drag.x, drag.startY + event.clientY - drag.y);
  });
  const end = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    handle.releasePointerCapture?.(event.pointerId);
    drag = null;
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 32 : 16;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      Home: [-state.shiftX, -state.shiftY]
    }[event.key];
    if (!delta || isCompact(dialog, state.compactBreakpoint)) return;
    setShift(dialog, state, state.shiftX + delta[0], state.shiftY + delta[1]);
    event.preventDefault();
  });
}

export function createForwardPanel({
  document: doc = globalThis.document,
  panelRef,
  title = 'Options',
  dismissLabel = 'Close',
  dragHandle = false,
  compactBreakpoint = 760
} = {}) {
  if (!doc?.createElement) throw new TypeError('document is required');
  if (!panelRef || typeof panelRef !== 'string') throw new TypeError('panelRef is required');

  const dialog = doc.createElement('dialog');
  dialog.className = 'uxe-forward-panel';
  dialog.dataset.uxePanelRef = panelRef;
  dialog.setAttribute('aria-modal', 'true');

  const frame = doc.createElement('div');
  frame.className = 'uxe-forward-panel-frame';
  const header = doc.createElement('header');
  header.className = 'uxe-forward-panel-header';
  const heading = doc.createElement('h2');
  heading.className = 'uxe-forward-panel-title';
  heading.textContent = title;
  const controls = doc.createElement('div');
  controls.className = 'uxe-forward-panel-controls';

  let handle = null;
  if (dragHandle) {
    handle = doc.createElement('button');
    handle.type = 'button';
    handle.className = 'uxe-forward-panel-drag-handle';
    handle.dataset.uxeDragHandle = 'true';
    handle.setAttribute('aria-label', 'Move panel');
    handle.textContent = '⋮⋮';
    controls.append(handle);
  }

  const dismiss = doc.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'uxe-forward-panel-dismiss';
  dismiss.dataset.uxeDismiss = 'true';
  dismiss.setAttribute('aria-label', dismissLabel);
  dismiss.textContent = '×';
  controls.append(dismiss);
  header.append(heading, controls);

  const body = doc.createElement('div');
  body.className = 'uxe-forward-panel-body';
  frame.append(header, body);
  dialog.append(frame);

  const state = {
    returnFocus: null,
    lastReason: null,
    shiftX: 0,
    shiftY: 0,
    compactBreakpoint,
    onDismiss: null
  };
  PANEL_STATES.set(dialog, state);

  const close = (reason = 'DISMISS') => {
    if (!dialog.open) return false;
    state.lastReason = String(reason);
    dialog.dataset.uxeDismissReason = state.lastReason;
    dialog.close(state.lastReason);
    return true;
  };

  dismiss.addEventListener('click', () => close('VISIBLE_DISMISS'));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close('ESCAPE');
  });
  dialog.addEventListener('close', () => {
    state.onDismiss?.(state.lastReason ?? dialog.returnValue ?? 'DISMISS');
    const target = state.returnFocus;
    state.returnFocus = null;
    state.onDismiss = null;
    if (target?.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
  });
  if (handle) installDragHandle(handle, dialog, state);

  const view = doc.defaultView;
  const syncPresentation = () => {
    const compact = isCompact(dialog, compactBreakpoint);
    dialog.dataset.uxePresentation = compact ? 'SHEET' : 'FLOATING_PANEL';
    if (compact) setShift(dialog, state, 0, 0);
    return dialog.dataset.uxePresentation;
  };
  view?.addEventListener?.('resize', syncPresentation, { passive: true });

  const api = Object.freeze({
    element: dialog,
    body,
    dismiss,
    dragHandle: handle,
    open({ trigger = doc.activeElement, onDismiss = null } = {}) {
      if (!dialog.isConnected) doc.body.append(dialog);
      state.returnFocus = trigger?.nodeType === 1 ? trigger : null;
      state.onDismiss = typeof onDismiss === 'function' ? onDismiss : null;
      syncPresentation();
      if (!dialog.open) dialog.showModal();
      const focusTarget = body.querySelector(FOCUSABLE_SELECTOR) ?? dismiss;
      queueMicrotask(() => focusTarget.focus({ preventScroll: true }));
      return Object.freeze({ state: 'OPEN', panelRef, presentation: dialog.dataset.uxePresentation });
    },
    close,
    back() {
      return close('BACK');
    },
    snapshot() {
      return Object.freeze({
        state: dialog.open ? 'OPEN' : 'CLOSED',
        panelRef,
        presentation: dialog.dataset.uxePresentation || syncPresentation(),
        shiftX: state.shiftX,
        shiftY: state.shiftY,
        dismissReason: state.lastReason
      });
    },
    destroy() {
      if (dialog.open) close('DESTROY');
      view?.removeEventListener?.('resize', syncPresentation);
      dialog.remove();
      PANEL_STATES.delete(dialog);
    }
  });
  return api;
}

// [VXG RealForever]
