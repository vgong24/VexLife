import { projectTurnFormationEvidence } from '../../../src/core/model-connection-atlas.mjs';

export const MODEL_TURN_FORMATION_BROWSER_REGISTRY_SCHEMA = 'vexlife.model-turn-formation-browser/v1';
const REQUIRED_LANGUAGES = Object.freeze(['en', 'ja', 'zh']);
const REQUIRED_KEYS = Object.freeze([
  'summary',
  'state',
  'current',
  'unknown',
  'turn',
  'witness',
  'modelBundle',
  'operationalProfile',
  'runtimeRevision',
  'promptContext',
  'modelConnection',
  'selfCapability',
  'available',
  'held',
  'unavailable',
  'unknownCapabilities',
  'actuallyUsed',
  'nativeTool',
  'multimodal',
  'reasoning',
  'sealed',
  'notObserved',
  'effectsBoundary',
  'sourceBoundary'
]);
let cachedReference = null;

async function fetchJson(root, relativePath, fetchImpl) {
  const response = await fetchImpl(`${root}${relativePath}`);
  if (!response?.ok) throw new Error(`Unable to load ${relativePath}: HTTP ${response?.status ?? 'UNKNOWN'}`);
  return response.json();
}

export async function loadModelTurnFormationReference(root = '../../', fetchImpl = globalThis.fetch) {
  if (cachedReference && fetchImpl === globalThis.fetch && root === '../../') return cachedReference;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const [registry, en, ja, zh] = await Promise.all([
    fetchJson(root, 'blueprint/model-turn-formation-browser-registry.json', fetchImpl),
    fetchJson(root, 'blueprint/model-turn-formation-browser/strings/en.json', fetchImpl),
    fetchJson(root, 'blueprint/model-turn-formation-browser/strings/ja.json', fetchImpl),
    fetchJson(root, 'blueprint/model-turn-formation-browser/strings/zh.json', fetchImpl)
  ]);
  if (registry?.schemaVersion !== MODEL_TURN_FORMATION_BROWSER_REGISTRY_SCHEMA ||
      registry?.registryRef !== 'registry.vexlife.model-turn-formation-browser.001' ||
      JSON.stringify(registry.requiredLanguages) !== JSON.stringify(REQUIRED_LANGUAGES)) {
    throw new Error('model turn formation browser registry drift');
  }
  const catalogs = Object.freeze({ en, ja, zh });
  const referenceKeys = Object.keys(en).sort();
  for (const language of REQUIRED_LANGUAGES) {
    const candidateKeys = Object.keys(catalogs[language] ?? {}).sort();
    if (JSON.stringify(candidateKeys) !== JSON.stringify(referenceKeys)) {
      throw new Error(`model turn formation catalog key drift: ${language}`);
    }
  }
  for (const key of REQUIRED_KEYS) {
    if (!referenceKeys.includes(key)) throw new Error(`model turn formation visible string missing: ${key}`);
  }
  const output = Object.freeze({ registry: Object.freeze(registry), catalogs });
  if (fetchImpl === globalThis.fetch && root === '../../') cachedReference = output;
  return output;
}

export function projectBrowserModelTurnFormation(body) {
  if (!body?.modelTurnWitness) return null;
  try {
    return projectTurnFormationEvidence({
      modelTurnWitness: body.modelTurnWitness,
      capabilityRuntime: body.capabilityRuntime ?? null,
      promptContextMaterialization: body.promptContextMaterialization ?? null,
      modelConnectionProjection: body.modelConnectionProjection ?? null,
      selfCapabilityFrame: body.selfCapabilityFrame ?? null
    });
  } catch {
    return null;
  }
}

function text(catalog, key) {
  return catalog?.[key] ?? key;
}
function appendRow(grid, catalog, labelKey, value) {
  const row = document.createElement('div');
  row.className = 'semantic-relay-row';
  const label = document.createElement('span');
  label.textContent = text(catalog, labelKey);
  const strong = document.createElement('strong');
  strong.textContent = value ?? '—';
  row.append(label, strong);
  grid.append(row);
}
function refList(values) {
  return Array.isArray(values) && values.length ? values.join(' · ') : '—';
}
function stateLabel(catalog, state) {
  return state?.startsWith('CURRENT_') ? text(catalog, 'current') : text(catalog, 'unknown');
}

export async function renderModelTurnFormationDisclosure(article, projection, {
  language = 'en',
  root = '../../',
  fetchImpl = globalThis.fetch
} = {}) {
  if (!article || !projection) return false;
  const { catalogs } = await loadModelTurnFormationReference(root, fetchImpl);
  const catalog = catalogs[REQUIRED_LANGUAGES.includes(language) ? language : 'en'];
  const details = document.createElement('details');
  details.className = 'semantic-relay-disclosure model-turn-formation-disclosure';
  details.dataset.turnRef = projection.turnRef;
  details.dataset.witnessRef = projection.modelTurnWitnessRef;
  details.dataset.modelConnectionState = projection.modelConnection.state;
  details.dataset.selfCapabilityState = projection.selfCapability.state;
  details.dataset.effectAuthorityGranted = 'false';

  const summary = document.createElement('summary');
  summary.textContent = text(catalog, 'summary');
  details.append(summary);

  const grid = document.createElement('div');
  grid.className = 'semantic-relay-grid';
  appendRow(grid, catalog, 'state', text(catalog, 'current'));
  appendRow(grid, catalog, 'turn', projection.turnRef);
  appendRow(grid, catalog, 'witness', projection.modelTurnWitnessRef);
  appendRow(grid, catalog, 'modelBundle', projection.model.modelBundleRef);
  appendRow(grid, catalog, 'operationalProfile', projection.model.operationalProfileRef);
  appendRow(grid, catalog, 'runtimeRevision', projection.model.runtimeRevisionRef);
  appendRow(grid, catalog, 'promptContext', projection.promptContext.receiptRef ?? text(catalog, 'notObserved'));
  appendRow(grid, catalog, 'modelConnection', projection.modelConnection.projectionRef ?? text(catalog, 'unknown'));
  appendRow(grid, catalog, 'selfCapability', projection.selfCapability.selfCapabilityFrameRef ?? text(catalog, 'unknown'));
  appendRow(grid, catalog, 'available', refList(projection.capabilityDisposition.availableRefs));
  appendRow(grid, catalog, 'held', refList(projection.capabilityDisposition.heldRefs));
  appendRow(grid, catalog, 'unavailable', refList(projection.capabilityDisposition.unavailableRefs));
  appendRow(grid, catalog, 'unknownCapabilities', refList(projection.capabilityDisposition.unknownRefs));
  appendRow(grid, catalog, 'actuallyUsed', projection.selfCapability.state === 'CURRENT_BOUNDED_REFERENCE' ? refList(projection.selfCapability.actuallyUsedRefs) : text(catalog, 'unknown'));
  appendRow(grid, catalog, 'nativeTool', projection.observedEffects.nativeToolExecutionObserved ? text(catalog, 'current') : text(catalog, 'notObserved'));
  appendRow(grid, catalog, 'multimodal', projection.observedEffects.multimodalInputObserved ? text(catalog, 'current') : text(catalog, 'notObserved'));
  appendRow(grid, catalog, 'reasoning', projection.reasoningTrace.present ? text(catalog, 'sealed') : text(catalog, 'notObserved'));
  appendRow(grid, catalog, 'effectsBoundary', 'effectAuthorityGranted=false');
  appendRow(grid, catalog, 'sourceBoundary', refList(projection.currentnessRefs));
  details.append(grid);

  article.querySelector('.message-body')?.after(details);
  return true;
}

// [VXG RealForever]
