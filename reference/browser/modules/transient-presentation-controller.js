const DEFAULT_MARGIN = 12;
const DEFAULT_MIN_WIDTH = 280;
const DEFAULT_MIN_HEIGHT = 180;
const COMPACT_SHEET_MAX_WIDTH = 760;
const COMPACT_FULL_SCREEN_MAX_WIDTH = 480;
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function resolveTransientPresentationMode({ viewportWidth }) {
  const width = finiteNumber(viewportWidth, 0);
  if (width <= COMPACT_FULL_SCREEN_MAX_WIDTH) return 'FULL_SCREEN';
  if (width <= COMPACT_SHEET_MAX_WIDTH) return 'SHEET';
  return 'FLOATING';
}

export function constrainTransientRect({
  left,
  top,
  width,
  height,
  viewportWidth,
  viewportHeight,
  margin = DEFAULT_MARGIN,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT
}) {
  const safeMargin = Math.max(0, finiteNumber(margin, DEFAULT_MARGIN));
  const safeViewportWidth = Math.max(0, finiteNumber(viewportWidth, 0));
  const safeViewportHeight = Math.max(0, finiteNumber(viewportHeight, 0));
  const availableWidth = Math.max(0, safeViewportWidth - (safeMargin * 2));
  const availableHeight = Math.max(0, safeViewportHeight - (safeMargin * 2));
  const floorWidth = Math.min(Math.max(0, finiteNumber(minWidth, DEFAULT_MIN_WIDTH)), availableWidth);
  const floorHeight = Math.min(Math.max(0, finiteNumber(minHeight, DEFAULT_MIN_HEIGHT)), availableHeight);
  const nextWidth = Math.min(Math.max(floorWidth, finiteNumber(width, floorWidth)), availableWidth);
  const nextHeight = Math.min(Math.max(floorHeight, finiteNumber(height, floorHeight)), availableHeight);
  const maxLeft = Math.max(safeMargin, safeViewportWidth - safeMargin - nextWidth);
  const maxTop = Math.max(safeMargin, safeViewportHeight - safeMargin - nextHeight);
  const nextLeft = Math.min(Math.max(safeMargin, finiteNumber(left, safeMargin)), maxLeft);
  const nextTop = Math.min(Math.max(safeMargin, finiteNumber(top, safeMargin)), maxTop);
  return Object.freeze({ left: nextLeft, top: nextTop, width: nextWidth, height: nextHeight });
}

function firstFocusable(surface) {
  return surface?.querySelector?.('[autofocus]') ?? surface?.querySelector?.(FOCUSABLE_SELECTOR) ?? null;
}

function viewportSnapshot(win) {
  return {
    viewportWidth: Math.max(0, Number(win?.innerWidth) || 0),
    viewportHeight: Math.max(0, Number(win?.innerHeight) || 0)
  };
}

export function createTransientPresentationController({
  surface,
  trigger = null,
  dismissControl = null,
  dragHandle = null,
  draggable = false,
  onDismiss = null,
  windowRef = globalThis,
  documentRef = globalThis.document,
  margin = DEFAULT_MARGIN,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT
} = {}) {
  if (!surface || typeof surface.setAttribute !== 'function') {
    throw new TypeError('transient presentation surface is required');
  }

  let priorFocus = null;
  let drag = null;
  let open = !surface.hidden;

  function mode() {
    return resolveTransientPresentationMode({ viewportWidth: windowRef?.innerWidth ?? 0 });
  }

  function applyMode() {
    const nextMode = mode();
    surface.dataset.presentationMode = nextMode;
    if (nextMode !== 'FLOATING') {
      surface.style.removeProperty('left');
      surface.style.removeProperty('top');
      surface.style.removeProperty('width');
      surface.style.removeProperty('height');
      return nextMode;
    }
    const rect = surface.getBoundingClientRect();
    const next = constrainTransientRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      ...viewportSnapshot(windowRef),
      margin,
      minWidth,
      minHeight
    });
    surface.style.left = `${next.left}px`;
    surface.style.top = `${next.top}px`;
    surface.style.width = `${next.width}px`;
    surface.style.height = `${next.height}px`;
    surface.style.right = 'auto';
    surface.style.bottom = 'auto';
    return nextMode;
  }

  function focusSurface() {
    const target = firstFocusable(surface) ?? surface;
    if (target === surface && !surface.hasAttribute('tabindex')) surface.setAttribute('tabindex', '-1');
    target.focus?.({ preventScroll: true });
  }

  function restoreFocus() {
    const target = priorFocus?.isConnected ? priorFocus : trigger;
    target?.focus?.({ preventScroll: true });
    priorFocus = null;
  }

  function show({ focus = true } = {}) {
    if (!open) priorFocus = documentRef?.activeElement ?? trigger ?? null;
    open = true;
    surface.hidden = false;
    surface.setAttribute('aria-hidden', 'false');
    surface.dataset.presentationState = 'OPEN';
    applyMode();
    if (focus) queueMicrotask(focusSurface);
    return snapshot();
  }

  function dismiss(reason = 'DISMISS_CONTROL', { restore = true } = {}) {
    if (!open) return snapshot();
    open = false;
    drag = null;
    surface.hidden = true;
    surface.setAttribute('aria-hidden', 'true');
    surface.dataset.presentationState = 'CLOSED';
    if (restore) queueMicrotask(restoreFocus);
    if (typeof onDismiss === 'function') onDismiss(Object.freeze({ reason }));
    return snapshot();
  }

  function toggle() {
    return open ? dismiss('TRIGGER_TOGGLE') : show();
  }

  function snapshot() {
    return Object.freeze({ open, mode: mode(), draggable: draggable === true && Boolean(dragHandle) });
  }

  function onKeyDown(event) {
    if (!open || event?.key !== 'Escape') return;
    event.preventDefault?.();
    event.stopPropagation?.();
    dismiss('ESCAPE');
  }

  function beginDrag(event) {
    if (!open || draggable !== true || !dragHandle || mode() !== 'FLOATING') return;
    const rect = surface.getBoundingClientRect();
    drag = Object.freeze({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    dragHandle.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId || mode() !== 'FLOATING') return;
    const next = constrainTransientRect({
      left: drag.left + (event.clientX - drag.x),
      top: drag.top + (event.clientY - drag.y),
      width: drag.width,
      height: drag.height,
      ...viewportSnapshot(windowRef),
      margin,
      minWidth,
      minHeight
    });
    surface.style.left = `${next.left}px`;
    surface.style.top = `${next.top}px`;
    surface.style.width = `${next.width}px`;
    surface.style.height = `${next.height}px`;
    surface.style.right = 'auto';
    surface.style.bottom = 'auto';
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragHandle?.releasePointerCapture?.(event.pointerId);
    drag = null;
    applyMode();
  }

  trigger?.addEventListener?.('click', toggle);
  dismissControl?.addEventListener?.('click', () => dismiss('DISMISS_CONTROL'));
  documentRef?.addEventListener?.('keydown', onKeyDown, true);
  windowRef?.addEventListener?.('resize', applyMode);
  dragHandle?.addEventListener?.('pointerdown', beginDrag);
  dragHandle?.addEventListener?.('pointermove', moveDrag);
  dragHandle?.addEventListener?.('pointerup', endDrag);
  dragHandle?.addEventListener?.('pointercancel', endDrag);
  surface.setAttribute('aria-hidden', String(!open));
  surface.dataset.presentationState = open ? 'OPEN' : 'CLOSED';
  applyMode();

  return Object.freeze({
    show,
    dismiss,
    toggle,
    applyMode,
    snapshot,
    destroy() {
      trigger?.removeEventListener?.('click', toggle);
      documentRef?.removeEventListener?.('keydown', onKeyDown, true);
      windowRef?.removeEventListener?.('resize', applyMode);
      dragHandle?.removeEventListener?.('pointerdown', beginDrag);
      dragHandle?.removeEventListener?.('pointermove', moveDrag);
      dragHandle?.removeEventListener?.('pointerup', endDrag);
      dragHandle?.removeEventListener?.('pointercancel', endDrag);
      drag = null;
    }
  });
}

// [VXG RealForever]
