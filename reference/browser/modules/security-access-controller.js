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

  const PERCEPTION_REASON_STRING_REFS = Object.freeze({
    NO_ACCEPTED_PRODUCER: 'security-access.perception.reason.no-accepted-producer',
    AUTHORITY_NOT_ESTABLISHED: 'security-access.perception.reason.authority-not-established',
    ADAPTER_UNAVAILABLE: 'security-access.perception.reason.adapter-unavailable',
    OBSERVER_NOT_ESTABLISHED: 'security-access.perception.reason.observer-not-established',
    HELD: 'security-access.perception.reason.held'
  });
  const PERCEPTION_CURRENTNESS_STRING_REFS = Object.freeze({
    CURRENT: 'security-access.perception.currentness.current',
    STALE: 'security-access.perception.currentness.stale',
    UNKNOWN: 'security-access.perception.currentness.unknown'
  });

  function renderPerceptionStatus(projection) {
    const facts = byId('securityAccessRegion')?.querySelector('.security-access-facts');
    if (!facts) return;
    let host = byId('securityAccessPerceptionStatus');
    if (!host) {
      host = document.createElement('article');
      host.id = 'securityAccessPerceptionStatus';
      host.dataset.presentationRef = registry.perceptionStatus.presentationRef;
      const label = document.createElement('small');
      label.dataset.i18n = 'security-access.perception';
      const value = document.createElement('h3');
      value.id = 'securityAccessPerceptionState';
      const evidence = document.createElement('p');
      evidence.id = 'securityAccessPerceptionEvidence';
      host.append(label, value, evidence);
      facts.append(host);
    }
    const label = host.querySelector('small');
    const value = host.querySelector('#securityAccessPerceptionState');
    const evidence = host.querySelector('#securityAccessPerceptionEvidence');
    const stringRef = registry.perceptionStatus.stateStringRefs[projection.perceptionStatus.state];
    const currentnessStringRef = PERCEPTION_CURRENTNESS_STRING_REFS[projection.perceptionStatus.currentness];
    const reasonStringRef = PERCEPTION_REASON_STRING_REFS[projection.perceptionStatus.state];
    if (!stringRef || !currentnessStringRef || !reasonStringRef) throw new Error('Security & Access perception visible truth binding missing');
    if (label) label.textContent = t('security-access.perception');
    if (value) {
      value.dataset.i18n = stringRef;
      value.textContent = t(stringRef);
    }
    if (evidence) {
      evidence.textContent = [
        `${t('security-access.perception.source')}: ${t('security-access.perception.source-owner')}`,
        `${t('security-access.perception.currentness')}: ${t(currentnessStringRef)}`,
        `${t('security-access.perception.reason')}: ${t(reasonStringRef)}`
      ].join(' · ');
      evidence.dataset.perceptionSourceOwner = projection.perceptionStatus.semanticOwnerRef;
      evidence.dataset.perceptionCurrentness = projection.perceptionStatus.currentness;
      evidence.dataset.perceptionReasonStringRef = reasonStringRef;
    }
    host.dataset.perceptionState = projection.perceptionStatus.state;
    host.dataset.perceptionCurrentness = projection.perceptionStatus.currentness;
  }

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
    renderPerceptionStatus(projection);
    renderHeldActions(projection);
    record('PREVIEW_RENDERED', { previewVisible, runtimeState, perceptionState: projection.perceptionStatus.state });
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
