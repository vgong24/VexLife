import {
  assertUxEvolutionRegistry,
  resolveUxProjectionHostSelection,
} from '../../../src/core/ux-evolution.mjs';

const registryResponse = await fetch('../../../blueprint/ux-evolution-registry.json', { cache: 'no-store' });
if (!registryResponse.ok) throw new Error(`Unable to load ux-evolution-registry.json: HTTP ${registryResponse.status}`);
const registry = await registryResponse.json();
const validation = assertUxEvolutionRegistry(registry);
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const selection = resolveUxProjectionHostSelection(registry, {
  requestedProjection: 'evolution',
  localExecution: loopbackHosts.has(globalThis.location.hostname),
});

const root = document.querySelector('#evolutionHost');
const status = document.querySelector('#hostStatus');
const rendererState = document.querySelector('#rendererState');
const selectedProjection = document.querySelector('#selectedProjection');
const ownerState = document.querySelector('#ownerState');
const cutoverState = document.querySelector('#cutoverState');

root.dataset.hostState = selection.state;
root.dataset.activeRendererCount = selection.state === 'PASS' ? '1' : '0';
selectedProjection.textContent = selection.selectedProjection ?? 'NONE';
rendererState.textContent = selection.state === 'PASS'
  ? 'One active inert Evolution renderer; Reference document is not mounted'
  : 'Blocked — local/dev selection was not admitted';
ownerState.textContent = registry.projectionHost.sharedSemanticOwnerPolicy;
cutoverState.textContent = registry.projectionHost.cutoverAuthority ? 'Authorized' : 'Not authorized';
status.textContent = selection.state === 'PASS'
  ? 'Inert Evolution host active. No migrated semantic surfaces, persistence, user-data fork, publication or cutover.'
  : `Evolution host blocked: ${selection.reason}`;

const receipt = Object.freeze({
  schemaVersion: 'vexlife.ux-evolution-browser-host-receipt/v1',
  hostRef: registry.projectionHost.hostRef,
  registryRef: validation.registryRef,
  stageRef: registry.projectionHost.stageRef,
  state: selection.state,
  reason: selection.reason,
  selectedProjection: selection.selectedProjection,
  defaultProjection: selection.defaultProjection,
  selectionClass: selection.selectionClass ?? null,
  oneActiveRenderer: selection.oneActiveRenderer,
  activeRendererCount: selection.state === 'PASS' ? 1 : 0,
  referenceRendererMounted: false,
  migratedSemanticRefs: [...registry.projectionHost.migratedSemanticRefs],
  semanticStateOwnerMutation: false,
  userDataFork: false,
  userHistoryRollback: false,
  publicationAuthority: false,
  cutoverAuthority: false,
});
globalThis.__VEXLIFE_EVOLUTION_HOST__ = receipt;

// [VXG RealForever]
