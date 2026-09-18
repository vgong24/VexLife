import { StateCell } from './state-relay.mjs';

const MIN_PIXEL_SCALE = 0.5;
const MAX_PIXEL_SCALE = 2;
const MIN_SEMANTIC_DEPTH = 0;
const MAX_SEMANTIC_DEPTH = 2;
const SEMANTIC_DEPTH_LEVELS = Object.freeze([
  Object.freeze({ level: 0, semanticDepthRef: 'semantic-depth.terrain.overview', semanticDepthClass: 'OVERVIEW', labelStringRef: 'terrain.semantic-depth.overview' }),
  Object.freeze({ level: 1, semanticDepthRef: 'semantic-depth.terrain.context', semanticDepthClass: 'CONTEXT', labelStringRef: 'terrain.semantic-depth.context' }),
  Object.freeze({ level: 2, semanticDepthRef: 'semantic-depth.terrain.source-descent', semanticDepthClass: 'SOURCE_DESCENT', labelStringRef: 'terrain.semantic-depth.source-descent' })
]);

export class TerrainLayout {
  constructor(nodes) {
    this.nodes = new Map(nodes.map((node) => [node.terrainNodeRef, structuredClone(node)]));
    this.state = new StateCell({
      positions: {},
      collapsedNodeRefs: [],
      pixelScale: 1,
      semanticDepth: 1,
      centerNodeRef: null
    }, { name: 'terrain.layout' });
  }

  requireNode(nodeRef) {
    if (!this.nodes.has(nodeRef)) throw new Error(`unknown Terrain node ${nodeRef}`);
    return this.nodes.get(nodeRef);
  }

  move(nodeRef, x, y) {
    this.requireNode(nodeRef);
    return this.state.update((current) => ({ ...current, positions: { ...current.positions, [nodeRef]: { x, y } } }));
  }

  setCollapsed(nodeRef, collapsed) {
    this.requireNode(nodeRef);
    return this.state.update((current) => {
      const set = new Set(current.collapsedNodeRefs);
      if (collapsed) set.add(nodeRef); else set.delete(nodeRef);
      return { ...current, collapsedNodeRefs: [...set].sort() };
    });
  }

  setPixelScale(pixelScale) {
    if (!Number.isFinite(pixelScale) || pixelScale < MIN_PIXEL_SCALE || pixelScale > MAX_PIXEL_SCALE) {
      throw new RangeError(`Terrain pixelScale must be between ${MIN_PIXEL_SCALE} and ${MAX_PIXEL_SCALE}`);
    }
    return this.state.update((current) => ({ ...current, pixelScale }));
  }

  setSemanticDepth(semanticDepth) {
    if (!Number.isInteger(semanticDepth) || semanticDepth < MIN_SEMANTIC_DEPTH || semanticDepth > MAX_SEMANTIC_DEPTH) {
      throw new RangeError(`Terrain semanticDepth must be an integer between ${MIN_SEMANTIC_DEPTH} and ${MAX_SEMANTIC_DEPTH}`);
    }
    return this.state.update((current) => ({ ...current, semanticDepth }));
  }

  centerOn(nodeRef) {
    this.requireNode(nodeRef);
    return this.state.update((current) => ({ ...current, centerNodeRef: nodeRef }));
  }

  childCount(nodeRef) {
    return [...this.nodes.values()].filter((node) => node.parentRef === nodeRef).length;
  }

  siblingRefs(nodeRef) {
    const node = this.requireNode(nodeRef);
    const layout = this.state.value;
    const positionOf = (candidate) => layout.positions[candidate.terrainNodeRef] ?? candidate.defaultPosition;
    return [...this.nodes.values()]
      .filter((candidate) => candidate.parentRef === node.parentRef)
      .sort((left, right) => {
        const a = positionOf(left); const b = positionOf(right);
        return a.x - b.x || a.y - b.y || left.terrainNodeRef.localeCompare(right.terrainNodeRef);
      })
      .map((candidate) => candidate.terrainNodeRef);
  }

  viewportProjection() {
    const { pixelScale, semanticDepth, centerNodeRef } = this.state.value;
    const level = SEMANTIC_DEPTH_LEVELS[semanticDepth];
    return {
      pixelScale,
      semanticDepth,
      semanticDepthRef: level.semanticDepthRef,
      semanticDepthClass: level.semanticDepthClass,
      labelStringRef: level.labelStringRef,
      centerNodeRef
    };
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
