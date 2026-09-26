const DEFAULT_MARGIN = 12;
const DEFAULT_MIN_WIDTH = 280;
const DEFAULT_MIN_HEIGHT = 180;
const COMPACT_SHEET_MAX_WIDTH = 760;
const COMPACT_FULL_SCREEN_MAX_WIDTH = 480;
const AVAILABLE_SPACE_BINDINGS = new WeakMap();
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
  constraintLeft = 0,
  constraintTop = 0,
  margin = DEFAULT_MARGIN,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT
}) {
  const safeConstraintLeft = finiteNumber(constraintLeft, 0);
  const safeConstraintTop = finiteNumber(constraintTop, 0);
  const safeMargin = Math.max(0, finiteNumber(margin, DEFAULT_MARGIN));
  const safeViewportWidth = Math.max(0, finiteNumber(viewportWidth, 0));
  const safeViewportHeight = Math.max(0, finiteNumber(viewportHeight, 0));
  const availableWidth = Math.max(0, safeViewportWidth - (safeMargin * 2));
  const availableHeight = Math.max(0, safeViewportHeight - (safeMargin * 2));
  const floorWidth = Math.min(Math.max(0, finiteNumber(minWidth, DEFAULT_MIN_WIDTH)), availableWidth);
  const floorHeight = Math.min(Math.max(0, finiteNumber(minHeight, DEFAULT_MIN_HEIGHT)), availableHeight);
  const nextWidth = Math.min(Math.max(floorWidth, finiteNumber(width, floorWidth)), availableWidth);
  const nextHeight = Math.min(Math.max(floorHeight, finiteNumber(height, floorHeight)), availableHeight);
  const minLeft = safeConstraintLeft + safeMargin;
  const minTop = safeConstraintTop + safeMargin;
  const maxLeft = Math.max(minLeft, safeConstraintLeft + safeViewportWidth - safeMargin - nextWidth);
  const maxTop = Math.max(minTop, safeConstraintTop + safeViewportHeight - safeMargin - nextHeight);
  const nextLeft = Math.min(Math.max(minLeft, finiteNumber(left, minLeft)), maxLeft);
  const nextTop = Math.min(Math.max(minTop, finiteNumber(top, minTop)), maxTop);
  return Object.freeze({ left: nextLeft, top: nextTop, width: nextWidth, height: nextHeight });
}

function firstFocusable(surface) {
  return surface?.querySelector?.('[autofocus]') ?? surface?.querySelector?.(FOCUSABLE_SELECTOR) ?? null;
}

function viewportSnapshot(win) {
  return { left:0, top:0, viewportWidth:Math.max(0,Number(win?.innerWidth)||0), viewportHeight:Math.max(0,Number(win?.innerHeight)||0), coordinateSpace:'VIEWPORT', hostRef:'viewport' };
}
function resolvedConstraintSnapshot(constraintHost,surface,win){const host=typeof constraintHost==='function'?constraintHost():constraintHost;if(!host||host===surface||typeof host.getBoundingClientRect!=='function')return viewportSnapshot(win);const r=host.getBoundingClientRect();return{left:finiteNumber(r.left,0),top:finiteNumber(r.top,0),viewportWidth:Math.max(0,finiteNumber(r.width,0)),viewportHeight:Math.max(0,finiteNumber(r.height,0)),coordinateSpace:'EXPLICIT_HOST',hostRef:host.id?`#${host.id}`:(host.dataset?.nodeRef??'explicit-host')};}
function applySurfaceRect(surface,rect){surface.style.left=`${rect.left}px`;surface.style.top=`${rect.top}px`;surface.style.width=`${rect.width}px`;surface.style.height=`${rect.height}px`;surface.style.right='auto';surface.style.bottom='auto';}


export function bindAvailableSpaceContract({
  host,
  body = host?.querySelector?.('.uxe-active-surface-body'),
  windowRef = body?.ownerDocument?.defaultView ?? globalThis
} = {}) {
  if (!host || typeof host.dispatchEvent !== 'function') throw new TypeError('active-surface host is required');
  if (!body || typeof body.getBoundingClientRect !== 'function') throw new TypeError('active-surface body is required');
  const prior = AVAILABLE_SPACE_BINDINGS.get(host);
  if (prior) return prior;

  let observer = null;
  function snapshot() {
    const rect = body.getBoundingClientRect();
    const inlineSize = Math.max(0, Math.round(rect.width * 100) / 100);
    const blockSize = Math.max(0, Math.round(rect.height * 100) / 100);
    body.style.setProperty('--uxe-available-inline-size', `${inlineSize}px`);
    body.style.setProperty('--uxe-available-block-size', `${blockSize}px`);
    body.dataset.uxeAvailableInlineSize = String(inlineSize);
    body.dataset.uxeAvailableBlockSize = String(blockSize);
    const detail = Object.freeze({ inlineSize, blockSize });
    const CustomEventRef = windowRef?.CustomEvent;
    if (typeof CustomEventRef === 'function') host.dispatchEvent(new CustomEventRef('vexlife:available-space',{detail}));
    return detail;
  }

  if (typeof windowRef?.ResizeObserver === 'function') {
    observer = new windowRef.ResizeObserver(snapshot);
    observer.observe(body);
  }
  windowRef?.addEventListener?.('resize', snapshot, { passive: true });
  snapshot();

  const binding = Object.freeze({
    snapshot,
    disconnect() {
      observer?.disconnect();
      windowRef?.removeEventListener?.('resize', snapshot);
      AVAILABLE_SPACE_BINDINGS.delete(host);
    }
  });
  AVAILABLE_SPACE_BINDINGS.set(host, binding);
  return binding;
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
  constraintHost = null,
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

  const constraint=()=>resolvedConstraintSnapshot(constraintHost,surface,windowRef);
  function mode(){return resolveTransientPresentationMode({viewportWidth:constraint().viewportWidth});}

  function applyMode(){
    const bounds=constraint(),nextMode=resolveTransientPresentationMode({viewportWidth:bounds.viewportWidth});
    surface.dataset.presentationMode=nextMode;surface.dataset.constraintSpace=bounds.coordinateSpace;surface.dataset.constraintHostRef=bounds.hostRef;
    surface.style.setProperty('--e29-constraint-inline-size',`${bounds.viewportWidth}px`);surface.style.setProperty('--e29-constraint-block-size',`${bounds.viewportHeight}px`);
    if(nextMode==='FULL_SCREEN'){applySurfaceRect(surface,{left:bounds.left,top:bounds.top,width:bounds.viewportWidth,height:bounds.viewportHeight});return nextMode;}
    if(nextMode==='SHEET'){const inset=Math.min(8,Math.max(0,bounds.viewportWidth/4),Math.max(0,bounds.viewportHeight/4)),width=Math.max(0,bounds.viewportWidth-inset*2),height=Math.max(0,Math.min(bounds.viewportHeight*.72,620,bounds.viewportHeight-inset*2));applySurfaceRect(surface,{left:bounds.left+inset,top:bounds.top+bounds.viewportHeight-inset-height,width,height});return nextMode;}
    const rect=surface.getBoundingClientRect();const next=constrainTransientRect({left:rect.left,top:rect.top,width:rect.width,height:rect.height,viewportWidth:bounds.viewportWidth,viewportHeight:bounds.viewportHeight,constraintLeft:bounds.left,constraintTop:bounds.top,margin,minWidth,minHeight});applySurfaceRect(surface,next);return nextMode;
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

  function back() {
    return dismiss('BACK');
  }

  function snapshot() {
    const bounds=constraint();return Object.freeze({ open, mode:resolveTransientPresentationMode({viewportWidth:bounds.viewportWidth}), draggable:draggable===true&&Boolean(dragHandle), constraintSpace:bounds.coordinateSpace, constraintHostRef:bounds.hostRef });
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
      viewportWidth: constraint().viewportWidth,
      viewportHeight: constraint().viewportHeight,
      constraintLeft: constraint().left,
      constraintTop: constraint().top,
      margin,
      minWidth,
      minHeight
    });
    applySurfaceRect(surface,next);
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
    back,
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
