import crypto from 'node:crypto';
import { StateCell } from './state-relay.mjs';
import { semanticHash } from './utils.mjs';
import { JourneyLedger } from './journey.mjs';

export class NavigationLattice {
  constructor(nodes = [], { journeyLedger = new JourneyLedger() } = {}) {
    this.nodes = new Map(nodes.map((node) => [node.nodeRef, { ...node }]));
    this.journeyLedger = journeyLedger;
    this.state = new StateCell({
      screenRef: null, routeRef: null, projectRef: null, threadRef: null, channelRef: null,
      selectedNodeRef: null, trajectory: []
    }, { name: 'navigation.current' });
  }

  register(node) {
    if (!node.nodeRef) throw new Error('nodeRef is required');
    if (this.nodes.has(node.nodeRef)) throw new Error(`duplicate navigation node ${node.nodeRef}`);
    this.nodes.set(node.nodeRef, { ...node });
  }

  navigate(next) {
    const previous = this.state.value;
    const semanticStep = {
      screenRef: next.screenRef ?? previous.screenRef,
      routeRef: next.routeRef ?? previous.routeRef,
      projectRef: next.projectRef ?? previous.projectRef,
      threadRef: next.threadRef ?? previous.threadRef,
      channelRef: next.channelRef ?? previous.channelRef,
      selectedNodeRef: next.selectedNodeRef ?? previous.selectedNodeRef
    };
    const same = semanticHash(semanticStep) === semanticHash({
      screenRef: previous.screenRef, routeRef: previous.routeRef, projectRef: previous.projectRef,
      threadRef: previous.threadRef, channelRef: previous.channelRef, selectedNodeRef: previous.selectedNodeRef
    });
    if (same) return { changed: false, value: previous, journeyEvent: null };
    const nextState = { ...semanticStep, trajectory: [...previous.trajectory.slice(-11), semanticStep] };
    const result = this.state.set(nextState);
    const journey = this.journeyLedger.append({
      journeyRef: next.journeyRef ?? `journey.vexlife.${crypto.randomUUID()}`,
      elementRef: next.elementRef ?? semanticStep.selectedNodeRef,
      interactionRef: next.interactionRef ?? null,
      actionRef: next.actionRef ?? 'action.navigation.unknown',
      fromFrame: { screenRef: previous.screenRef, routeRef: previous.routeRef, projectRef: previous.projectRef, threadRef: previous.threadRef, channelRef: previous.channelRef, selectedNodeRef: previous.selectedNodeRef },
      toFrame: semanticStep,
      subjectRef: next.subjectRef ?? semanticStep.selectedNodeRef
    });
    return { ...result, journeyEvent: journey.event };
  }

  breadcrumb(nodeRef) {
    const refs = []; let current = this.nodes.get(nodeRef); const seen = new Set();
    while (current && !seen.has(current.nodeRef)) {
      seen.add(current.nodeRef); refs.unshift(current.nodeRef);
      current = current.parentNodeRef ? this.nodes.get(current.parentNodeRef) : null;
    }
    return refs;
  }

  screenFrame() {
    const current = this.state.value;
    const selected = current.selectedNodeRef ? this.nodes.get(current.selectedNodeRef) : null;
    return {
      ...current,
      selectedNode: selected ? { ...selected } : null,
      breadcrumbNodeRefs: selected ? this.breadcrumb(selected.nodeRef) : [],
      trajectory: this.journeyLedger.currentTrajectory(),
      rawPointerLogIncluded: false
    };
  }
}

export class SelectionStore {
  constructor() { this.groups = new Map(); }
  select(groupRef, nodeRef) {
    const previous = this.groups.get(groupRef) ?? null;
    if (previous === nodeRef) return { changed: false, groupRef, nodeRef, previous };
    this.groups.set(groupRef, nodeRef);
    return { changed: true, groupRef, nodeRef, previous };
  }
  selected(groupRef) { return this.groups.get(groupRef) ?? null; }
  isSelected(groupRef, nodeRef) { return this.selected(groupRef) === nodeRef; }
}

// [VXG RealForever]
