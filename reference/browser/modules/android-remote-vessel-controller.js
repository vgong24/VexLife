import { createAndroidRemoteVesselReferenceBridge, validateAndroidRemoteVesselRegistry } from '../../../src/core/android-remote-vessel-projection.mjs';

const STYLE_ID = 'androidRemoteVesselStylesheet';
const REGION_ID = 'androidRemoteVesselRegion';
const STYLE_HREF = new URL('../android-remote-vessel.css', import.meta.url).href;

function ensureStyles(root) {
  const documentRef = root?.ownerDocument ?? root;
  if (!documentRef?.head || documentRef.getElementById(STYLE_ID)) return;
  const link = documentRef.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  documentRef.head.append(link);
}

function localizedElement(documentRef, tagName, key, fallback) {
  const element = documentRef.createElement(tagName);
  element.dataset.i18n = key;
  element.textContent = fallback;
  return element;
}

export function createAndroidRemoteVesselController({ registry, homeBridge, root = globalThis.document }) {
  validateAndroidRemoteVesselRegistry(registry, homeBridge);
  let connectionState = registry.browserRuntimeState;
  let mounted = false;

  const bridge = () => createAndroidRemoteVesselReferenceBridge(registry, homeBridge, { connectionState });

  function render() {
    const current = bridge();
    const state = root.querySelector('#androidRemoteVesselConnectionState');
    const canonicalWriter = root.querySelector('#androidRemoteVesselCanonicalWriter');
    if (state) state.textContent = current.projection.connectionState;
    if (canonicalWriter) canonicalWriter.textContent = current.projection.canonicalWriter;
    const region = root.querySelector(`#${REGION_ID}`);
    if (region) {
      region.dataset.connectionState = current.projection.connectionState;
      region.dataset.remoteWriterGranted = 'false';
      region.dataset.homeAccess = 'false';
    }
    return current;
  }

  function bind() {
    const host = root.querySelector('#securityAccessPreviewContent');
    if (!host) throw new Error('Android Remote Vessel requires the existing Security & Access preview host');
    ensureStyles(root);
    let region = root.querySelector(`#${REGION_ID}`);
    if (!region) {
      const documentRef = root.ownerDocument ?? root;
      region = documentRef.createElement('section');
      region.id = REGION_ID;
      region.className = 'android-remote-vessel';
      region.setAttribute('aria-labelledby', 'androidRemoteVesselTitle');
      region.dataset.projectionRef = 'projection.security-access.android-remote-vessel';

      const header = documentRef.createElement('header');
      const eyebrow = localizedElement(documentRef, 'small', 'security-access.phone-support', 'Phone support');
      const title = localizedElement(documentRef, 'h3', 'security-access.android-first', 'Android-first');
      title.id = 'androidRemoteVesselTitle';
      header.append(eyebrow, title);

      const status = documentRef.createElement('div');
      status.className = 'android-remote-vessel-status';
      const stateLabel = localizedElement(documentRef, 'small', 'security-access.trusted-devices', 'Trusted devices');
      const stateValue = documentRef.createElement('code');
      stateValue.id = 'androidRemoteVesselConnectionState';
      stateValue.textContent = registry.browserRuntimeState;
      status.append(stateLabel, stateValue);

      const explanation = localizedElement(documentRef, 'p', 'security-access.status.backend-unavailable', 'Preview — security runtime not connected');

      const truth = documentRef.createElement('p');
      truth.className = 'android-remote-vessel-truth';
      const mode = documentRef.createElement('code');
      mode.textContent = registry.mode;
      const separator = documentRef.createTextNode(' · ');
      const writer = documentRef.createElement('code');
      writer.id = 'androidRemoteVesselCanonicalWriter';
      writer.textContent = registry.canonicalWriter;
      truth.append(mode, separator, writer);

      const noRuntime = localizedElement(documentRef, 'small', 'security-access.trusted-devices.none', 'No runtime data available');
      noRuntime.className = 'android-remote-vessel-held';
      region.append(header, status, explanation, truth, noRuntime);

      const actions = host.querySelector('.security-access-actions');
      host.insertBefore(region, actions ?? null);
    }
    mounted = true;
    return render();
  }

  function snapshot() {
    return Object.freeze({ ...bridge(), mounted });
  }

  return Object.freeze({ bind, render, snapshot });
}

// [VXG RealForever]
