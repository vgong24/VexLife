import { $, escapeHtml, saveJson } from './dom.js';

const MIN_PIXEL_SCALE = 0.5;
const MAX_PIXEL_SCALE = 2;
const MIN_SEMANTIC_DEPTH = 0;
const MAX_SEMANTIC_DEPTH = 2;
const DEFAULT_VISIBILITY_THRESHOLD = 0.72;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
export const ORDINARY_SCROLL_MAY_COMMIT_SEMANTIC_AUTO_ENTRY = false;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createTerrainController({ state, blueprint, t, navigation }) {
  const terrainByRef = new Map(blueprint.terrain.map((node) => [node.terrainNodeRef, node]));
  const childrenByTerrainRef = new Map();
  for (const node of blueprint.terrain) {
    if (!node.parentRef) continue;
    const children = childrenByTerrainRef.get(node.parentRef) || [];
    children.push(node.terrainNodeRef);
    childrenByTerrainRef.set(node.parentRef, children);
  }
  state.terrain = {
    positions: state.terrain?.positions || {}, collapsed: state.terrain?.collapsed || [], selected: state.terrain?.selected || null,
    pixelScale: Number.isFinite(state.terrain?.pixelScale) ? state.terrain.pixelScale : 1,
    semanticDepth: Number.isInteger(state.terrain?.semanticDepth) ? state.terrain.semanticDepth : 1,
    centerNodeRef: state.terrain?.centerNodeRef || null,
    autoEntry: {
      enabled: state.terrain?.autoEntry?.enabled === true,
      visibilityThreshold: Number.isFinite(state.terrain?.autoEntry?.visibilityThreshold) ? clamp(state.terrain.autoEntry.visibilityThreshold, 0.5, 1) : DEFAULT_VISIBILITY_THRESHOLD,
      confidenceThreshold: Number.isFinite(state.terrain?.autoEntry?.confidenceThreshold) ? clamp(state.terrain.autoEntry.confidenceThreshold, 0.5, 1) : DEFAULT_CONFIDENCE_THRESHOLD,
      lastEvaluation: state.terrain?.autoEntry?.lastEvaluation || null
    }
  };
  const terrainPosition = (node) => state.terrain.positions[node.terrainNodeRef] || node.defaultPosition;
  const siblingRefs = (nodeRef) => {
    const node = terrainByRef.get(nodeRef); if (!node) return [];
    return [...terrainByRef.values()].filter((candidate) => candidate.parentRef === node.parentRef).sort((left, right) => {
      const a = terrainPosition(left); const b = terrainPosition(right); return a.x - b.x || a.y - b.y || left.terrainNodeRef.localeCompare(right.terrainNodeRef);
    }).map((candidate) => candidate.terrainNodeRef);
  };
  function isTerrainHidden(nodeRef) {
    let current = terrainByRef.get(nodeRef); const seen = new Set();
    while (current?.parentRef && !seen.has(current.parentRef)) { seen.add(current.parentRef); if (state.terrain.collapsed.includes(current.parentRef)) return true; current = terrainByRef.get(current.parentRef); }
    return false;
  }
  function viewportProjection() {
    return { pixelScale: state.terrain.pixelScale, semanticDepth: state.terrain.semanticDepth, centerNodeRef: state.terrain.centerNodeRef, semanticAutoEntry: structuredClone(state.terrain.autoEntry), ordinaryScrollMayCommit: ORDINARY_SCROLL_MAY_COMMIT_SEMANTIC_AUTO_ENTRY };
  }
  function renderAutoEntryStatus() {
    const enabled = $('#terrainAutoEntryEnabled'); const visibility = $('#terrainAutoEntryVisibility'); const confidence = $('#terrainAutoEntryConfidence'); const status = $('#terrainAutoEntryStatus');
    if (enabled) enabled.checked = state.terrain.autoEntry.enabled;
    if (visibility) visibility.value = String(state.terrain.autoEntry.visibilityThreshold);
    if (confidence) confidence.value = String(state.terrain.autoEntry.confidenceThreshold);
    if (status) { const marker = state.terrain.autoEntry.enabled ? '●' : '○'; status.textContent = `${marker} V≥${Math.round(state.terrain.autoEntry.visibilityThreshold * 100)}% · C≥${Math.round(state.terrain.autoEntry.confidenceThreshold * 100)}%`; }
  }
  function applyViewport() {
    const canvas = $('#terrainCanvas'); const world = $('#terrainWorld');
    world.style.transform = `scale(${state.terrain.pixelScale})`; world.style.transformOrigin = '0 0'; canvas.dataset.semanticDepth = String(state.terrain.semanticDepth);
    $('#terrainZoomStatus').textContent = `${Math.round(state.terrain.pixelScale * 100)}%`;
    $('#terrainSemanticDepthStatus').textContent = t(['terrain.semantic-depth.overview','terrain.semantic-depth.context','terrain.semantic-depth.source-descent'][state.terrain.semanticDepth]);
    renderAutoEntryStatus();
  }
  function nodeVisibilityRatio(nodeRef) {
    const canvas = $('#terrainCanvas'); const node = document.querySelector(`.terrain-node[data-node-ref="${CSS.escape(nodeRef)}"]`);
    if (!canvas || !node || node.getClientRects().length === 0) return 0;
    const c = canvas.getBoundingClientRect(); const n = node.getBoundingClientRect();
    const width = Math.max(0, Math.min(c.right, n.right) - Math.max(c.left, n.left)); const height = Math.max(0, Math.min(c.bottom, n.bottom) - Math.max(c.top, n.top));
    return clamp((width * height) / Math.max(1, n.width * n.height), 0, 1);
  }
  function evaluateSemanticAutoEntry({ nodeRef = state.terrain.selected, visibilityRatio = nodeVisibilityRatio(nodeRef), confidence = 1, source = 'UNKNOWN' } = {}) {
    const allowedSources = new Set(['EXPLICIT_SELECTION', 'EXPLICIT_CENTER', 'EXPLICIT_SIBLING']);
    const record = { nodeRef: nodeRef ?? null, visibilityRatio, confidence, source, committed: false, reason: 'HELD' };
    if (source === 'ORDINARY_SCROLL') record.reason = 'ORDINARY_SCROLL_NEVER_COMMITS';
    else if (!allowedSources.has(source)) record.reason = 'SOURCE_NOT_ADMITTED';
    else if (!state.terrain.autoEntry.enabled) record.reason = 'OPTED_OUT';
    else if (!nodeRef || !terrainByRef.has(nodeRef)) record.reason = 'NO_CURRENT_NODE';
    else if (visibilityRatio < state.terrain.autoEntry.visibilityThreshold) record.reason = 'VISIBILITY_BELOW_THRESHOLD';
    else if (confidence < state.terrain.autoEntry.confidenceThreshold) record.reason = 'CONFIDENCE_BELOW_THRESHOLD';
    else if (state.terrain.semanticDepth >= MAX_SEMANTIC_DEPTH) record.reason = 'MAX_SEMANTIC_DEPTH';
    else { state.terrain.semanticDepth += 1; record.committed = true; record.reason = 'EXPLICIT_SAMPLE_ADMITTED'; navigation.navigate(nodeRef, { selectedNodeRef: nodeRef }, 'action.terrain.semantic-depth.set'); applyViewport(); }
    state.terrain.autoEntry.lastEvaluation = record; save(); return structuredClone(record);
  }
  function centerOn(nodeRef = state.terrain.selected) {
    const node = terrainByRef.get(nodeRef); if (!node) return false;
    state.terrain.centerNodeRef = nodeRef; const pos = terrainPosition(node); const canvas = $('#terrainCanvas'); const scale = state.terrain.pixelScale;
    canvas.scrollTo({ left: Math.max(0, pos.x * scale - canvas.clientWidth / 2 + 130 * scale), top: Math.max(0, pos.y * scale - canvas.clientHeight / 2 + 56 * scale), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    navigation.navigate('element.terrain.center-current-context', { selectedNodeRef: nodeRef }, 'action.terrain.center-current-context'); save(); queueMicrotask(() => evaluateSemanticAutoEntry({ nodeRef, confidence: 1, source: 'EXPLICIT_CENTER' })); return true;
  }
  function render() {
    const host = $('#terrainNodes'); host.replaceChildren();
    for (const node of blueprint.terrain) {
      if (isTerrainHidden(node.terrainNodeRef)) continue;
      const pos = terrainPosition(node); const children = childrenByTerrainRef.get(node.terrainNodeRef) || [];
      const card = document.createElement('article'); card.className = 'terrain-node'; card.dataset.nodeRef = node.terrainNodeRef; card.dataset.selectionGroup = 'selection.terrain-node'; card.dataset.componentRef = 'component.vexlife.terrain-node'; card.dataset.instanceRef = `instance.terrain-node.${node.terrainNodeRef}`; card.style.left = `${pos.x}px`; card.style.top = `${pos.y}px`; card.classList.toggle('is-selected', state.terrain.selected === node.terrainNodeRef);
      card.innerHTML = `<h3>${escapeHtml(t(node.labelStringRef))}</h3><p>${escapeHtml(t('terrain.node-summary', { kind: t(`terrain.kind.${node.kind.toLowerCase()}`) }))}</p><footer><span class="child-badge" title="${escapeHtml(t('terrain.direct-children'))}">${children.length}</span>${children.length ? `<button type="button" data-collapse>${state.terrain.collapsed.includes(node.terrainNodeRef) ? escapeHtml(t('terrain.expand')) : escapeHtml(t('terrain.collapse'))}</button>` : ''}</footer>`;
      card.addEventListener('click', (event) => { if (event.target.closest('[data-collapse]')) return; state.terrain.selected = node.terrainNodeRef; navigation.navigate(node.terrainNodeRef, { selectedNodeRef: node.terrainNodeRef }, 'action.terrain.node.select'); render(); queueMicrotask(() => evaluateSemanticAutoEntry({ nodeRef: node.terrainNodeRef, confidence: 1, source: 'EXPLICIT_SELECTION' })); });
      const collapseButton = $('[data-collapse]', card); if (collapseButton) { collapseButton.dataset.slotRef = 'slot.terrain-node.collapse'; collapseButton.dataset.instanceRef = `instance.terrain-node.${node.terrainNodeRef}.collapse`; collapseButton.addEventListener('click', (event) => { event.stopPropagation(); toggle(node.terrainNodeRef); }); }
      makeDraggable(card, node.terrainNodeRef); host.append(card);
    }
    drawEdges(); renderDetail(); applyViewport(); save();
  }
  function save() { saveJson('vexlife.terrain.layout', state.terrain); }
  function toggle(nodeRef) { const set = new Set(state.terrain.collapsed); if (set.has(nodeRef)) set.delete(nodeRef); else set.add(nodeRef); state.terrain.collapsed = [...set]; navigation.navigate(nodeRef, { selectedNodeRef: nodeRef }, 'action.terrain.node.collapse'); render(); }
  function makeDraggable(element, nodeRef) {
    let start = null;
    element.addEventListener('pointerdown', (event) => { if (event.target.closest('button')) return; const pos = terrainPosition(terrainByRef.get(nodeRef)); start = { pointerX: event.clientX, pointerY: event.clientY, x: pos.x, y: pos.y }; element.setPointerCapture(event.pointerId); });
    element.addEventListener('pointermove', (event) => { if (!start || !element.hasPointerCapture(event.pointerId)) return; const scale = state.terrain.pixelScale; const x = Math.max(10, start.x + (event.clientX - start.pointerX) / scale); const y = Math.max(10, start.y + (event.clientY - start.pointerY) / scale); state.terrain.positions[nodeRef] = { x, y }; element.style.left = `${x}px`; element.style.top = `${y}px`; drawEdges(); });
    element.addEventListener('pointerup', (event) => { if (!start) return; element.releasePointerCapture(event.pointerId); start = null; navigation.navigate(nodeRef, { selectedNodeRef: nodeRef }, 'action.terrain.node.move'); save(); });
  }
  function drawEdges() {
    const svg = $('#terrainEdges'); svg.replaceChildren();
    for (const node of blueprint.terrain) { if (!node.parentRef || isTerrainHidden(node.terrainNodeRef) || isTerrainHidden(node.parentRef)) continue; const child = terrainPosition(node); const parent = terrainPosition(terrainByRef.get(node.parentRef)); const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('x1', parent.x + 130); line.setAttribute('y1', parent.y + 112); line.setAttribute('x2', child.x + 130); line.setAttribute('y2', child.y); svg.append(line); }
  }
  function renderDetail() {
    const host = $('#terrainDetail'); const node = terrainByRef.get(state.terrain.selected);
    if (!node) { host.innerHTML = `<p>${escapeHtml(t('terrain.empty-detail'))}</p>`; return; }
    const children = childrenByTerrainRef.get(node.terrainNodeRef) || []; const collapsedRef = state.terrain.collapsed.includes(node.terrainNodeRef) ? 'terrain.yes' : 'terrain.no';
    host.innerHTML = `<h2>${escapeHtml(t(node.labelStringRef))}</h2><p>${escapeHtml(node.terrainNodeRef)}</p><dl><dt>${escapeHtml(t('terrain.kind'))}</dt><dd>${escapeHtml(t(`terrain.kind.${node.kind.toLowerCase()}`))}</dd><dt>${escapeHtml(t('terrain.children'))}</dt><dd>${children.length}</dd><dt>${escapeHtml(t('terrain.collapsed'))}</dt><dd>${escapeHtml(t(collapsedRef))}</dd><dt>${escapeHtml(t('terrain.canonical-parent'))}</dt><dd>${escapeHtml(node.parentRef || t('terrain.root'))}</dd></dl>`;
  }
  function setPixelScale(value) { state.terrain.pixelScale = clamp(value, MIN_PIXEL_SCALE, MAX_PIXEL_SCALE); applyViewport(); save(); return state.terrain.pixelScale; }
  function setSemanticDepth(value) { state.terrain.semanticDepth = clamp(Math.round(value), MIN_SEMANTIC_DEPTH, MAX_SEMANTIC_DEPTH); navigation.navigate('element.terrain.semantic-depth-status', {}, 'action.terrain.semantic-depth.set'); applyViewport(); save(); return state.terrain.semanticDepth; }
  function setAutoEntryEnabled(enabled) { state.terrain.autoEntry.enabled = Boolean(enabled); renderAutoEntryStatus(); save(); return state.terrain.autoEntry.enabled; }
  function setAutoEntryThresholds({ visibilityThreshold, confidenceThreshold } = {}) { if (Number.isFinite(visibilityThreshold)) state.terrain.autoEntry.visibilityThreshold = clamp(visibilityThreshold, 0.5, 1); if (Number.isFinite(confidenceThreshold)) state.terrain.autoEntry.confidenceThreshold = clamp(confidenceThreshold, 0.5, 1); renderAutoEntryStatus(); save(); return structuredClone(state.terrain.autoEntry); }
  function navigateSibling(direction) {
    const current = state.terrain.selected; const ordered = siblingRefs(current); const index = ordered.indexOf(current); if (index < 0) return false; const nextIndex = direction === 'PREVIOUS' ? index - 1 : index + 1; if (nextIndex < 0 || nextIndex >= ordered.length) return false; const target = ordered[nextIndex]; state.terrain.selected = target; navigation.navigate(target, { selectedNodeRef: target }, 'action.navigation.sibling'); render(); centerOn(target); queueMicrotask(() => evaluateSemanticAutoEntry({ nodeRef: target, confidence: 1, source: 'EXPLICIT_SIBLING' })); return true;
  }
  $('#terrainReset').addEventListener('click', () => { const autoEntry = state.terrain.autoEntry; state.terrain = { positions: {}, collapsed: [], selected: null, pixelScale: 1, semanticDepth: 1, centerNodeRef: null, autoEntry }; render(); });
  $('#terrainZoomOut')?.addEventListener('click', () => setPixelScale(state.terrain.pixelScale - 0.1)); $('#terrainZoomIn')?.addEventListener('click', () => setPixelScale(state.terrain.pixelScale + 0.1));
  $('#terrainDepthDown')?.addEventListener('click', () => setSemanticDepth(state.terrain.semanticDepth - 1)); $('#terrainDepthUp')?.addEventListener('click', () => setSemanticDepth(state.terrain.semanticDepth + 1));
  $('#terrainCenter')?.addEventListener('click', () => centerOn()); $('#terrainSiblingPrevious')?.addEventListener('click', () => navigateSibling('PREVIOUS')); $('#terrainSiblingNext')?.addEventListener('click', () => navigateSibling('NEXT'));
  $('#terrainAutoEntryEnabled')?.addEventListener('change', (event) => setAutoEntryEnabled(event.currentTarget.checked)); $('#terrainAutoEntryVisibility')?.addEventListener('input', (event) => setAutoEntryThresholds({ visibilityThreshold: Number(event.currentTarget.value) })); $('#terrainAutoEntryConfidence')?.addEventListener('input', (event) => setAutoEntryThresholds({ confidenceThreshold: Number(event.currentTarget.value) }));
  $('#terrainCanvas')?.addEventListener('scroll', () => { evaluateSemanticAutoEntry({ source: 'ORDINARY_SCROLL', confidence: 0 }); }, { passive: true });
  return { render, toggle, renderDetail, setPixelScale, setSemanticDepth, centerOn, siblingRefs, navigateSibling, viewportProjection, setAutoEntryEnabled, setAutoEntryThresholds, evaluateSemanticAutoEntry };
}

// [VXG RealForever]
