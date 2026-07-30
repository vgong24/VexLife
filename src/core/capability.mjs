const STAGE_ORDER = ['DISCOVERABLE', 'EXPLAINABLE', 'REQUESTABLE', 'ADMITTED', 'EXECUTABLE', 'COMPLETED'];

function stageIndex(stage) {
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0) throw new Error(`unknown capability stage ${stage}`);
  return index;
}

export function minimumStage(...stages) {
  const valid = stages.filter(Boolean);
  if (!valid.length) return 'DISCOVERABLE';
  return valid.reduce((minimum, stage) => stageIndex(stage) < stageIndex(minimum) ? stage : minimum, valid[0]);
}

export function compileCapabilityFrame(registry, {
  roleRef,
  platformRef,
  projectCapabilityStages = {},
  permissionStages = {},
  resourceStages = {},
  includeBelow = 'DISCOVERABLE'
}) {
  const entries = [];
  for (const capability of registry.capabilities ?? []) {
    if (!(capability.roleRefs ?? []).includes(roleRef)) continue;
    if (!(capability.platformRefs ?? []).includes(platformRef)) continue;
    const stage = minimumStage(
      capability.defaultStage,
      projectCapabilityStages[capability.capabilityRef] ?? 'COMPLETED',
      permissionStages[capability.permissionRef] ?? (capability.permissionRef === 'permission.none' ? 'COMPLETED' : 'REQUESTABLE'),
      resourceStages[capability.resourceClass] ?? 'COMPLETED'
    );
    if (stageIndex(stage) < stageIndex(includeBelow)) continue;
    entries.push({
      capabilityRef: capability.capabilityRef,
      purpose: capability.purpose,
      stage,
      actionRefs: [...capability.actionRefs],
      permissionRef: capability.permissionRef,
      effectClass: capability.effectClass,
      resourceClass: capability.resourceClass,
      executable: stage === 'EXECUTABLE' || stage === 'COMPLETED'
    });
  }
  return {
    schemaVersion: 'vexlife.capability-frame/v0',
    registryRef: registry.registryRef,
    roleRef,
    platformRef,
    entries: entries.sort((a, b) => a.capabilityRef.localeCompare(b.capabilityRef))
  };
}

export function requireExecutable(frame, capabilityRef) {
  const capability = frame.entries.find((item) => item.capabilityRef === capabilityRef);
  if (!capability) return { state: 'BLOCKED_CAPABILITY_NOT_VISIBLE', capabilityRef };
  if (!capability.executable) return { state: 'BLOCKED_CAPABILITY_STAGE', capabilityRef, observedStage: capability.stage };
  return { state: 'CAPABILITY_EXECUTABLE', capability };
}

// [VXG RealForever]
