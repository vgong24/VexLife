import { StateCell } from './state-relay.mjs';

export class TerrainLayout {
  constructor(nodes) {
    this.nodes = new Map(nodes.map((node) => [node.terrainNodeRef, structuredClone(node)]));
    this.state = new StateCell({ positions: {}, collapsedNodeRefs: [] }, { name: 'terrain.layout' });
  }

  move(nodeRef, x, y) {
    if (!this.nodes.has(nodeRef)) throw new Error(`unknown Terrain node ${nodeRef}`);
    return this.state.update((current) => ({ ...current, positions: { ...current.positions, [nodeRef]: { x, y } } }));
  }

  setCollapsed(nodeRef, collapsed) {
    if (!this.nodes.has(nodeRef)) throw new Error(`unknown Terrain node ${nodeRef}`);
    return this.state.update((current) => {
      const set = new Set(current.collapsedNodeRefs);
      if (collapsed) set.add(nodeRef); else set.delete(nodeRef);
      return { ...current, collapsedNodeRefs: [...set].sort() };
    });
  }

  childCount(nodeRef) {
    return [...this.nodes.values()].filter((node) => node.parentRef === nodeRef).length;
  }

  projection() {
    const layout = this.state.value;
    const collapsed = new Set(layout.collapsedNodeRefs);
    const hidden = new Set();
    const markDescendants = (parentRef) => {
      for (const node of this.nodes.values()) {
        if (node.parentRef === parentRef) { hidden.add(node.terrainNodeRef); markDescendants(node.terrainNodeRef); }
      }
    };
    for (const ref of collapsed) markDescendants(ref);
    return [...this.nodes.values()].map((node) => ({
      ...structuredClone(node),
      position: layout.positions[node.terrainNodeRef] ?? node.defaultPosition,
      collapsed: collapsed.has(node.terrainNodeRef),
      hidden: hidden.has(node.terrainNodeRef),
      childCount: this.childCount(node.terrainNodeRef)
    }));
  }
}

// [VXG RealForever]
