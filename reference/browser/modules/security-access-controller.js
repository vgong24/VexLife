import { createSecurityAccessRuntimeBridge, validateSecurityAccessRegistry } from '../../../src/core/security-access-projection.mjs';

const STORAGE_KEY = 'vexlife.security-access.preview-visible';

export function createSecurityAccessController({ registry, t, guide, storage = globalThis.localStorage, root = document }) {
  validateSecurityAccessRegistry(registry);
  const events = [];
  let eventOrdinal = 0;
  let detailsOpen = false;
  let runtimeState = 'BACKEND_UNAVAILABLE';
  const stored = storage?.getItem?.(STORAGE_KEY);
  let previewVisible = stored === null || stored === undefined
    ? registry.flag.safeDefault === 'FLAG_VISIBLE_PREVIEW'
    : stored === 'true';

  const byId = (id) => root.querySelector(`#${id}`);
  const record = (type, detail = {}) => {
    const safeDetail = Object.fromEntries(Object.entries(detail).filter(([, value]) =>
      ['string','boolean','number'].includes(typeof value)));
    if (events.length >= 64) events.shift();
    events.push(Object.freeze({ ordinal: eventOrdinal++, type, detail: Object.freeze(safeDetail) }));
  };
  const bridge = () => createSecurityAccessRuntimeBridge(registry, { runtimeState, previewVisible });

  function renderHeldActions(projection) {
    const host = byId('securityAccessHeldActions');
    if (!host) return;
    const rows = projection.heldActions.map((item) => {
      const row = document.createElement('div');
      row.className = 'security-access-held-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = true;
      button.textContent = t(item.labelStringRef);
      button.setAttribute('aria-disabled', 'true');
      const reason = document.createElement('small');
      reason.textContent = t(item.reasonStringRef);
      row.append(button, reason);
      return row;
    });
    host.replaceChildren(...rows);
  }

  function render() {
    const current = bridge();
    const projection = current.projection;
    const content = byId('securityAccessPreviewContent');
    const toggle = byId('securityAccessPreviewVisible');
    const details = byId('securityAccessDetails');
    const detailsToggle = byId('securityAccessDetailsToggle');
    const status = byId('securityAccessStatus');
    if (toggle) toggle.checked = previewVisible;
    if (content) content.hidden = !previewVisible;
    if (details) details.hidden = !previewVisible || !detailsOpen;
    if (detailsToggle) detailsToggle.setAttribute('aria-expanded', String(detailsOpen));
    if (status) status.textContent = t(projection.statusStringRef);
    renderHeldActions(projection);
    record('PREVIEW_RENDERED', { previewVisible, runtimeState });
    return current;
  }

  function setPreviewVisible(visible) {
    previewVisible = Boolean(visible);
    storage?.setItem?.(STORAGE_KEY, String(previewVisible));
    record('VISIBILITY_CHANGED', { previewVisible });
    return render();
  }

  function toggleDetails() {
    detailsOpen = !detailsOpen;
    record('DETAILS_TOGGLED', { detailsOpen });
    return render();
  }

  function askVex() {
    guide?.setOpen?.(true);
    guide?.addMessage?.('guide', { contentRef: 'security-access.guide.explanation' });
    record('ASK_VEX_EXPLAINED', { runtimeState });
    return bridge();
  }

  function bind() {
    byId('securityAccessPreviewVisible')?.addEventListener('change', (event) => setPreviewVisible(event.currentTarget.checked));
    byId('securityAccessDetailsToggle')?.addEventListener('click', toggleDetails);
    byId('securityAccessAskVex')?.addEventListener('click', askVex);
    return render();
  }

  function snapshot() {
    const current = bridge();
    return Object.freeze({
      ...current,
      detailsOpen,
      storageKey: STORAGE_KEY,
      auditEvents: Object.freeze(events.map((item) => item))
    });
  }

  return Object.freeze({ bind, render, snapshot, setPreviewVisible, toggleDetails, askVex });
}

// [VXG RealForever]
