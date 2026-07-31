import { $, escapeHtml, saveJson } from './dom.js';

export function createTerrainController({ state, blueprint, t, navigation }) {
  const terrainByRef = new Map(blueprint.terrain.map((node) => [node.terrainNodeRef, node]));
  const childrenByTerrainRef = new Map();
  for (const node of blueprint.terrain) {
    if (!node.parentRef) continue;
    const children = childrenByTerrainRef.get(node.parentRef) || [];
    children.push(node.terrainNodeRef); childrenByTerrainRef.set(node.parentRef, children);
  }
  const terrainPosition = (node) => state.terrain.positions[node.terrainNodeRef] || node.defaultPosition;
  function isTerrainHidden(nodeRef) {
    let current = terrainByRef.get(nodeRef); const seen = new Set();
    while (current?.parentRef && !seen.has(current.parentRef)) {
      seen.add(current.parentRef);
      if (state.terrain.collapsed.includes(current.parentRef)) return true;
      current = terrainByRef.get(current.parentRef);
    }
    return false;
  }
  function render() {
    const host = $('#terrainCanvas');
    [...host.querySelectorAll('.terrain-node')].forEach((element) => element.remove());
    for (const node of blueprint.terrain) {
      if (isTerrainHidden(node.terrainNodeRef)) continue;
      const pos = terrainPosition(node); const children = childrenByTerrainRef.get(node.terrainNodeRef) || [];
      const card = document.createElement('article'); card.className = 'terrain-node';
      card.dataset.nodeRef = node.terrainNodeRef; card.dataset.selectionGroup = 'selection.terrain-node';
      card.dataset.componentRef = 'component.vexlife.terrain-node'; card.dataset.instanceRef = `instance.terrain-node.${node.terrainNodeRef}`;
      card.style.left = `${pos.x}px`; card.style.top = `${pos.y}px`; card.classList.toggle('is-selected', state.terrain.selected === node.terrainNodeRef);
      card.innerHTML = `<h3>${escapeHtml(t(node.labelStringRef))}</h3><p>${escapeHtml(t('terrain.node-summary', { kind: t(`terrain.kind.${node.kind.toLowerCase()}`) }))}</p><footer><span class="child-badge" title="${escapeHtml(t('terrain.direct-children'))}">${children.length}</span>${children.length ? `<button type="button" data-collapse>${state.terrain.collapsed.includes(node.terrainNodeRef) ? escapeHtml(t('terrain.expand')) : escapeHtml(t('terrain.collapse'))}</button>` : ''}</footer>`;
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-collapse]')) return;
        state.terrain.selected = node.terrainNodeRef;
        navigation.navigate(node.terrainNodeRef, { selectedNodeRef: node.terrainNodeRef }, 'action.terrain.node.select'); render();
      });
      const collapseButton = $('[data-collapse]', card);
      if (collapseButton) {
        collapseButton.dataset.slotRef = 'slot.terrain-node.collapse'; collapseButton.dataset.instanceRef = `instance.terrain-node.${node.terrainNodeRef}.collapse`;
        collapseButton.addEventListener('click', (event) => { event.stopPropagation(); toggle(node.terrainNodeRef); });
      }
      makeDraggable(card, node.terrainNodeRef); host.append(card);
    }
    drawEdges(); renderDetail(); saveJson('vexlife.terrain.layout', state.terrain);
  }
  function toggle(nodeRef) {
    const set = new Set(state.terrain.collapsed); if (set.has(nodeRef)) set.delete(nodeRef); else set.add(nodeRef);
    state.terrain.collapsed = [...set]; navigation.navigate(nodeRef, { selectedNodeRef: nodeRef }, 'action.terrain.node.collapse'); render();
  }
  function makeDraggable(element, nodeRef) {
    let start = null;
    element.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      const pos = terrainPosition(terrainByRef.get(nodeRef)); start = { pointerX: event.clientX, pointerY: event.clientY, x: pos.x, y: pos.y };
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('pointermove', (event) => {
      if (!start || !element.hasPointerCapture(event.pointerId)) return;
      const x = Math.max(10, start.x + event.clientX - start.pointerX); const y = Math.max(10, start.y + event.clientY - start.pointerY);
      state.terrain.positions[nodeRef] = { x, y }; element.style.left = `${x}px`; element.style.top = `${y}px`; drawEdges();
    });
    element.addEventListener('pointerup', (event) => {
      if (!start) return; element.releasePointerCapture(event.pointerId); start = null;
      navigation.navigate(nodeRef, { selectedNodeRef: nodeRef }, 'action.terrain.node.move'); saveJson('vexlife.terrain.layout', state.terrain);
    });
  }
  function drawEdges() {
    const svg = $('#terrainEdges'); if (!svg) return; svg.replaceChildren();
    for (const node of blueprint.terrain) {
      if (!node.parentRef || isTerrainHidden(node.terrainNodeRef) || isTerrainHidden(node.parentRef)) continue;
      const child = terrainPosition(node); const parent = terrainPosition(terrainByRef.get(node.parentRef));
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', parent.x + 130); line.setAttribute('y1', parent.y + 112); line.setAttribute('x2', child.x + 130); line.setAttribute('y2', child.y); svg.append(line);
    }
  }
  function renderDetail() {
    const host = $('#terrainDetail'); const node = terrainByRef.get(state.terrain.selected);
    if (!node) { host.innerHTML = `<p>${escapeHtml(t('terrain.empty-detail'))}</p>`; return; }
    const children = childrenByTerrainRef.get(node.terrainNodeRef) || [];
    host.innerHTML = `<h2>${escapeHtml(t(node.labelStringRef))}</h2><p>${escapeHtml(node.terrainNodeRef)}</p><dl><dt>${escapeHtml(t('terrain.kind'))}</dt><dd>${escapeHtml(t(`terrain.kind.${node.kind.toLowerCase()}`))}</dd><dt>${escapeHtml(t('terrain.children'))}</dt><dd>${children.length}</dd><dt>${escapeHtml(t('terrain.collapsed'))}</dt><dd>${escapeHtml(t(state.terrain.collapsed.includes(node.terrainNodeRef) ? 'terrain.yes' : 'terrain.no'))}</dd><dt>${escapeHtml(t('terrain.canonical-parent'))}</dt><dd>${escapeHtml(node.parentRef || t('terrain.root'))}</dd></dl>`;
  }
  $('#terrainReset').addEventListener('click', () => { state.terrain = { positions: {}, collapsed: [], selected: null }; render(); });
  return { render, toggle, renderDetail };
}

// [VXG RealForever]
