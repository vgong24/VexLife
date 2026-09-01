import './browser-random-uuid.js';
import './vex-birth-lab-controller.js';
import { createAndroidRemoteVesselController } from './android-remote-vessel-controller.js';

export async function loadBrowserBundle(root = '../../') {
  async function fetchJson(relativePath) {
    const response = await fetch(`${root}${relativePath}`);
    if (!response.ok) throw new Error(`Unable to load ${relativePath}: HTTP ${response.status}`);
    return response.json();
  }
  async function loadComposedBlueprint() {
    const descriptor = await fetchJson('blueprint/vexlife.blueprint.json');
    if (!descriptor.includes) return descriptor;
    const output = Object.fromEntries(Object.entries(descriptor).filter(([key]) => key !== 'includes' && key !== 'composition'));
    for (const [field, source] of Object.entries(descriptor.includes)) {
      if (Array.isArray(source)) {
        const fragments = await Promise.all(source.map(fetchJson));
        output[field] = fragments.every(Array.isArray) ? fragments.flat() : fragments;
      } else output[field] = await fetchJson(source);
    }
    return output;
  }
  const [blueprint, experience, featureRegistry, designTokens, en, zh, ja] = await Promise.all([
    loadComposedBlueprint(),
    fetchJson('blueprint/experience-registry.json'),
    fetchJson('blueprint/feature-registry.json'),
    fetchJson('blueprint/design-tokens.json'),
    fetchJson('blueprint/strings/en.json'),
    fetchJson('blueprint/strings/zh.json'),
    fetchJson('blueprint/strings/ja.json')
  ]);
  const androidRemoteVessel = createAndroidRemoteVesselController({
    registry: blueprint.androidRemoteVessel,
    homeBridge: blueprint.homeBridge
  });
  androidRemoteVessel.bind();
  globalThis.__VEXLIFE_ANDROID_REMOTE_VESSEL__ = androidRemoteVessel;
  return { blueprint, experience, featureRegistry, designTokens, catalogs: { en, zh, ja }, androidRemoteVessel };
}

// [VXG RealForever]
