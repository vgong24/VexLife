const DISCLOSURE_IDS = Object.freeze({
  diagnostics: 'relationshipsConnectionDetails',
  vex: 'relationshipsVexDetails',
  recovery: 'relationshipsRecoveryDetails'
});

const openState = new Map(Object.values(DISCLOSURE_IDS).map((id) => [id, false]));
let applyScheduled = false;

function touchSizedSummary(summary) {
  summary.style.minWidth = '44px';
  summary.style.minHeight = '44px';
  summary.style.display = 'flex';
  summary.style.alignItems = 'center';
  summary.style.cursor = 'pointer';
  return summary;
}

function makeDisclosure({ id, kind, summaryText, nodes }) {
  const usableNodes = nodes.filter(Boolean);
  if (!summaryText || usableNodes.length !== nodes.length) return null;
  const parent = usableNodes[0]?.parentElement;
  if (!parent || usableNodes.some((node) => node.parentElement !== parent)) return null;

  const existing = document.getElementById(id);
  if (existing) {
    const summary = existing.querySelector(':scope > summary');
    if (summary && summary.textContent !== summaryText) summary.textContent = summaryText;
    return existing;
  }

  const details = document.createElement('details');
  details.id = id;
  details.dataset.relationshipsDisclosure = kind;
  details.open = openState.get(id) === true;

  const summary = touchSizedSummary(document.createElement('summary'));
  summary.textContent = summaryText;
  summary.dataset.relationshipsDisclosureSummary = kind;
  details.append(summary);

  parent.insertBefore(details, usableNodes[0]);
  for (const node of usableNodes) details.append(node);

  details.addEventListener('toggle', () => {
    openState.set(id, details.open);
  });
  return details;
}

function deliveryHeadingText() {
  const delivery = document.querySelector('#relationshipsDelivery');
  const heading = delivery?.previousElementSibling?.previousElementSibling;
  return heading?.textContent?.trim() || null;
}

function applyConnectionDiagnosticsDisclosure() {
  const panel = document.querySelector('[data-rel="connect-panel"]');
  if (!panel || panel.hidden) {
    openState.set(DISCLOSURE_IDS.diagnostics, false);
    return null;
  }

  const alpha = panel.querySelector('#relationshipsAlphaConsent');
  const alphaBody = alpha?.previousElementSibling;
  const alphaHeading = alphaBody?.previousElementSibling;
  const presence = panel.querySelector('#relationshipsPresence')?.closest('label');
  const route = panel.querySelector('#relationshipsRoute')?.closest('label');
  const failure = panel.querySelector('#relationshipsFailure')?.closest('label');
  const runtimeStatus = panel.querySelector('#relationshipsRuntimePlanStatus');
  const runtimeBody = runtimeStatus?.previousElementSibling;
  const runtimeHeading = runtimeBody?.previousElementSibling;
  const prepare = panel.querySelector('#relationshipsPrepareRuntimePlan');

  return makeDisclosure({
    id: DISCLOSURE_IDS.diagnostics,
    kind: 'connection-diagnostics',
    summaryText: deliveryHeadingText(),
    nodes: [
      alphaHeading,
      alphaBody,
      alpha,
      presence,
      route,
      failure,
      runtimeHeading,
      runtimeBody,
      runtimeStatus,
      prepare
    ]
  });
}

function applyVexDisclosure() {
  const button = document.querySelector('#relationshipsVexExplain');
  const body = button?.previousElementSibling;
  const heading = body?.previousElementSibling;
  const explanation = button?.nextElementSibling;
  return makeDisclosure({
    id: DISCLOSURE_IDS.vex,
    kind: 'vex-assistance',
    summaryText: heading?.textContent?.trim() || null,
    nodes: [heading, body, button, explanation]
  });
}

function applyRecoveryDisclosure() {
  const controls = document.querySelector('#relationshipsBlock')?.closest('.e27-focus-actions');
  const status = controls?.previousElementSibling;
  const body = status?.previousElementSibling;
  const heading = body?.previousElementSibling;
  return makeDisclosure({
    id: DISCLOSURE_IDS.recovery,
    kind: 'safety-recovery',
    summaryText: heading?.textContent?.trim() || null,
    nodes: [heading, body, status, controls]
  });
}

export function applyRelationshipsHumanFirstPresentation() {
  const surface = document.querySelector('#view-relationships');
  if (!surface) return Object.freeze({ installed: false });
  if (surface.hidden) {
    openState.set(DISCLOSURE_IDS.diagnostics, false);
    openState.set(DISCLOSURE_IDS.vex, false);
    openState.set(DISCLOSURE_IDS.recovery, false);
  }

  const diagnostics = applyConnectionDiagnosticsDisclosure();
  const vex = applyVexDisclosure();
  const recovery = applyRecoveryDisclosure();
  surface.dataset.humanFirstPresentation = 'progressive-disclosure-v1';

  return Object.freeze({
    installed: true,
    disclosures: Object.freeze({
      diagnostics: Boolean(diagnostics),
      vex: Boolean(vex),
      recovery: Boolean(recovery)
    })
  });
}

export function installRelationshipsHumanFirstPresentation({ root = document.querySelector('#contextSurface') } = {}) {
  if (!root) return Object.freeze({ installed: false, disconnect() {} });

  const apply = () => {
    if (applyScheduled) return;
    applyScheduled = true;
    queueMicrotask(() => {
      applyScheduled = false;
      applyRelationshipsHumanFirstPresentation();
    });
  };

  const observer = new MutationObserver(apply);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  applyRelationshipsHumanFirstPresentation();

  return Object.freeze({
    installed: true,
    disconnect() { observer.disconnect(); }
  });
}

if (typeof document !== 'undefined') installRelationshipsHumanFirstPresentation();

// [VXG RealForever]
