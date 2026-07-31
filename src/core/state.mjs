import { StateCell, combineStateCells, selectState } from './state-relay.mjs';

export { StateCell, combineStateCells, selectState };

function compactQueue(queue) {
  return {
    state: queue?.state ?? 'HELD_UNKNOWN',
    generation: queue?.generation ?? null,
    logicalReadyCount: queue?.logicalReady?.length ?? 0,
    admittedReadyCount: queue?.admittedReady?.length ?? 0,
    logicalReady: (queue?.logicalReady ?? []).map((item) => ({
      workNodeRef: item.workNodeRef,
      priorityClass: item.priorityClass,
      schedulingClass: item.schedulingClass,
      admitted: item.admitted === true,
      reasonRefs: [...(item.reasonRefs ?? [])]
    })),
    selectedWorkNodeRef: queue?.selected?.workNodeRef ?? null,
    blocked: (queue?.blocked ?? []).map((item) => ({
      workNodeRef: item.workNodeRef,
      reasonRefs: [...(item.reasonRefs ?? [])]
    }))
  };
}

export function createIntentSchedulerState({
  queue = { state: 'HELD_UNKNOWN', generation: 0, logicalReady: [], admittedReady: [], blocked: [] },
  active = null,
  resource = null,
  checkpoints = []
} = {}) {
  const queueState = new StateCell(queue, { name: 'intent-scheduler.queue' });
  const activeState = new StateCell(active, { name: 'intent-scheduler.active' });
  const resourceState = new StateCell(resource, { name: 'intent-scheduler.resource' });
  const checkpointState = new StateCell(checkpoints, { name: 'intent-scheduler.checkpoints' });

  const runtime = combineStateCells(
    [queueState, activeState, resourceState, checkpointState],
    (currentQueue, currentActive, currentResource, currentCheckpoints) => ({
      schemaVersion: 'vexlife.intent-scheduler-runtime-projection/v0',
      currentness: currentQueue?.currentness ?? 'HELD_UNKNOWN',
      queue: compactQueue(currentQueue),
      active: currentActive ? {
        workerRef: currentActive.workerRef,
        workNodeRef: currentActive.workNodeRef,
        generation: currentActive.generation,
        state: currentActive.state,
        contextLeaseRef: currentActive.contextLeaseRef ?? null,
        resourceLeaseRef: currentActive.resourceLeaseRef ?? null
      } : null,
      resource: currentResource ? {
        snapshotRef: currentResource.snapshotRef,
        currentness: currentResource.currentness,
        interactiveWaitState: currentResource.interactiveWaitState,
        backgroundWorkAdmission: currentResource.backgroundWorkAdmission,
        activeModelTurn: currentResource.activeModelTurn,
        activeHeavyTool: currentResource.activeHeavyTool
      } : null,
      checkpoints: currentCheckpoints.map((item) => ({
        checkpointRef: item.checkpointRef,
        workNodeRef: item.workNodeRef,
        currentState: item.currentState,
        nextSafeAction: item.nextSafeAction
      })),
      rawMachineDumpIncluded: false
    }),
    { name: 'intent-scheduler.runtime' }
  );

  const terrain = selectState(runtime, (value) => ({
    schemaVersion: 'vexlife.intent-scheduler-terrain-projection/v0',
    state: value.queue.state,
    activeWorkNodeRef: value.active?.workNodeRef ?? null,
    logicalReadyRefs: value.queue.logicalReady.map((item) => item.workNodeRef),
    blockedRefs: value.queue.blocked.map((item) => item.workNodeRef),
    sourceProjectionRef: 'projection.intent-scheduler.runtime'
  }), { name: 'intent-scheduler.terrain' });

  const health = selectState(runtime, (value) => ({
    schemaVersion: 'vexlife.intent-scheduler-health-projection/v0',
    state: value.queue.state === 'ADMITTED' || value.queue.state === 'IDLE' ? 'CLEAR' : value.queue.state,
    activeWorkerCount: value.active ? 1 : 0,
    admittedReadyCount: value.queue.admittedReadyCount,
    blockedCount: value.queue.blocked.length,
    reasonRefs: value.queue.blocked.flatMap((item) => item.reasonRefs).slice(0, 8),
    rawMachineDumpIncluded: false
  }), { name: 'intent-scheduler.health' });

  const guide = selectState(runtime, (value) => ({
    schemaVersion: 'vexlife.intent-scheduler-guide-projection/v0',
    whatIsHappeningNow: value.active
      ? `ACTIVE:${value.active.workNodeRef}`
      : value.queue.selectedWorkNodeRef
        ? `READY:${value.queue.selectedWorkNodeRef}`
        : 'NO_ADMITTED_WORK',
    whyWaiting: value.queue.blocked.slice(0, 3),
    nextSafeAction: value.active ? 'CONTINUE_OR_CHECKPOINT_ACTIVE_NODE' : value.queue.selectedWorkNodeRef ? 'LEASE_SELECTED_NODE' : 'REPAIR_OR_WAIT',
    sourceDescentRef: 'projection.intent-scheduler.runtime'
  }), { name: 'intent-scheduler.guide' });

  const dispose = () => {
    guide.dispose();
    health.dispose();
    terrain.dispose();
    runtime.dispose();
  };

  return {
    queue: queueState,
    active: activeState,
    resource: resourceState,
    checkpoints: checkpointState,
    runtime,
    terrain,
    health,
    guide,
    dispose
  };
}

// [VXG RealForever]
