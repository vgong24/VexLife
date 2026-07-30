import { semanticHash } from './utils.mjs';

export function validateImplementationPlan(plan) {
  const errors = [];
  const milestones = new Set((plan.milestones ?? []).map((item) => item.milestoneRef));
  const works = new Map();
  for (const work of plan.workUnits ?? []) {
    if (!work.workRef) errors.push('work unit missing workRef');
    if (works.has(work.workRef)) errors.push(`duplicate workRef ${work.workRef}`);
    works.set(work.workRef, work);
    if (!milestones.has(work.milestoneRef)) errors.push(`${work.workRef} references missing milestone ${work.milestoneRef}`);
    if (!(work.pathScope ?? []).length) errors.push(`${work.workRef} missing pathScope`);
    if (!(work.requiredTestRefs ?? []).length) errors.push(`${work.workRef} missing requiredTestRefs`);
    if (!work.effectBoundary) errors.push(`${work.workRef} missing effectBoundary`);
  }
  for (const work of works.values()) for (const dependency of work.dependsOn ?? []) if (!works.has(dependency)) errors.push(`${work.workRef} missing dependency ${dependency}`);

  const visiting = new Set();
  const visited = new Set();
  const visit = (ref) => {
    if (visiting.has(ref)) { errors.push(`dependency cycle at ${ref}`); return; }
    if (visited.has(ref)) return;
    visiting.add(ref);
    for (const dependency of works.get(ref)?.dependsOn ?? []) visit(dependency);
    visiting.delete(ref);
    visited.add(ref);
  };
  for (const ref of works.keys()) visit(ref);
  return { ok: errors.length === 0, errors, stats: { milestones: milestones.size, workUnits: works.size } };
}

export function compileImplementationPacket(plan, {
  workRef,
  platform = null,
  acceptedWorkRefs = [],
  currentBlueprintHash = null,
  now = new Date().toISOString()
}) {
  const validation = validateImplementationPlan(plan);
  if (!validation.ok) return { state: 'BLOCKED_INVALID_IMPLEMENTATION_PLAN', errors: validation.errors };
  const work = (plan.workUnits ?? []).find((item) => item.workRef === workRef);
  if (!work) return { state: 'BLOCKED_UNKNOWN_WORK_REF', workRef };
  if (platform && !(work.platformRefs ?? []).includes(`platform.${platform}`) && !(work.platformRefs ?? []).includes('platform.any')) {
    return { state: 'BLOCKED_PLATFORM_NOT_APPLICABLE', workRef, platform };
  }
  const accepted = new Set(acceptedWorkRefs);
  const unmetDependencies = (work.dependsOn ?? []).filter((dependency) => !accepted.has(dependency));
  const packetCore = {
    schemaVersion: 'vexlife.implementation-packet/v0',
    planRef: plan.planRef,
    planVersion: plan.planVersion,
    demoContractRef: plan.demoContractRef,
    workRef: work.workRef,
    purpose: work.purpose,
    distance: work.distance,
    milestoneRef: work.milestoneRef,
    platformRef: platform ? `platform.${platform}` : null,
    ownershipRoleRef: work.ownershipRoleRef,
    parallelGroupRef: work.parallelGroupRef,
    dependsOn: [...(work.dependsOn ?? [])],
    unmetDependencies,
    pathScope: [...work.pathScope],
    requiredSourceRefs: [...(work.requiredSourceRefs ?? [])],
    requiredTestRefs: [...work.requiredTestRefs],
    outputRefs: [...(work.outputRefs ?? [])],
    exclusions: [...(work.exclusions ?? [])],
    effectBoundary: work.effectBoundary,
    completionGate: work.completionGate,
    currentBlueprintHash,
    returnRoute: work.returnRoute,
    formedAt: now
  };
  const packet = { ...packetCore, packetRef: `implementation-packet.${semanticHash(packetCore).slice(0, 24)}`, packetHash: semanticHash(packetCore) };
  return { state: unmetDependencies.length ? 'WAITING_DEPENDENCIES' : 'PACKET_READY_NO_AUTHORITY', packet };
}

export function demoDistanceProjection(plan, completedWorkRefs = []) {
  const completed = new Set(completedWorkRefs);
  const rows = (plan.milestones ?? []).map((milestone) => {
    const units = (plan.workUnits ?? []).filter((work) => work.milestoneRef === milestone.milestoneRef);
    const done = units.filter((work) => completed.has(work.workRef));
    const blocked = units.filter((work) => (work.dependsOn ?? []).some((ref) => !completed.has(ref)) && !completed.has(work.workRef));
    return {
      milestoneRef: milestone.milestoneRef,
      distance: milestone.distance,
      purpose: milestone.purpose,
      totalUnits: units.length,
      completedUnits: done.length,
      blockedUnits: blocked.length,
      state: done.length === units.length && units.length ? 'COMPLETE' : blocked.length === units.length && units.length ? 'BLOCKED' : 'ACTIVE_OR_READY'
    };
  });
  return { schemaVersion: 'vexlife.demo-distance-projection/v0', planRef: plan.planRef, rows, semanticHash: semanticHash(rows) };
}

// [VXG RealForever]
