export const CAPABILITY_STAGES = Object.freeze([
  'DISCOVERABLE',
  'EXPLAINABLE',
  'REQUESTABLE',
  'ADMITTED',
  'EXECUTABLE',
  'COMPLETED'
]);

export const ROOT_CAPABILITY_KERNEL = Object.freeze([
  'capability.search',
  'capability.describe',
  'process.resolve',
  'context.where',
  'help.render'
]);

export const COMPETENCE_STATES = Object.freeze([
  'UNKNOWN',
  'CANDIDATE',
  'PRACTICED',
  'IN_EVIDENCE',
  'BOUNDED_COMPETENT',
  'HELD'
]);

function stageIndex(stage) {
  const index = CAPABILITY_STAGES.indexOf(stage);
  if (index < 0) throw new Error(`unknown capability stage ${stage}`);
  return index;
}

function canonicalRefs(values = []) {
  if (!Array.isArray(values)) throw new Error('capability refs must be an array');
  if (values.some((value) => typeof value !== 'string' || !value)) {
    throw new Error('capability refs must contain only non-empty strings');
  }
  return [...new Set(values)].sort();
}

function currentnessProjection(capability, override = null) {
  const source = override ?? capability.currentness ?? {};
  return Object.freeze({
    state: source.state ?? source.currentnessState ?? 'UNKNOWN',
    sourceRef: source.sourceRef ?? capability.sourceOfTruth ?? null,
    sourceVersionRef: source.sourceVersionRef ?? null,
    compatibility: source.compatibility ?? 'UNKNOWN'
  });
}

function competenceProjection(capability, override = null) {
  const competenceState = override ?? capability.competenceState ?? 'UNKNOWN';
  if (!COMPETENCE_STATES.includes(competenceState)) {
    throw new Error(`unknown competence state ${competenceState}`);
  }
  return competenceState;
}

export function minimumStage(...stages) {
  const valid = stages.filter(Boolean);
  if (!valid.length) return 'DISCOVERABLE';
  return valid.reduce(
    (minimum, stage) => stageIndex(stage) < stageIndex(minimum) ? stage : minimum,
    valid[0]
  );
}

export function compileCapabilityFrame(registry, {
  roleRef,
  platformRef,
  projectCapabilityStages = {},
  permissionStages = {},
  effectStages = {},
  resourceStages = {},
  competenceStates = {},
  capabilityCurrentness = {},
  heldNextCapabilities = {},
  unknownDoorRefs = {},
  includeBelow = 'DISCOVERABLE'
}) {
  const capabilities = registry?.capabilities ?? [];
  const byRef = new Map(capabilities.map((capability) => [capability.capabilityRef, capability]));
  const kernelRefs = canonicalRefs(registry?.rootCapabilityKernel ?? ROOT_CAPABILITY_KERNEL);
  for (const capabilityRef of ROOT_CAPABILITY_KERNEL) {
    if (!kernelRefs.includes(capabilityRef) || !byRef.has(capabilityRef)) {
      throw new Error(`capability registry is missing root kernel capability ${capabilityRef}`);
    }
  }

  const entries = [];
  for (const capability of capabilities) {
    const rootKernel = kernelRefs.includes(capability.capabilityRef) || capability.alwaysAvailable === true;
    if (!rootKernel && !(capability.roleRefs ?? []).includes(roleRef)) continue;
    if (!rootKernel && !(capability.platformRefs ?? []).includes(platformRef)) continue;

    const permissionStage = permissionStages[capability.permissionRef] ??
      (capability.permissionRef === 'permission.none' ? 'COMPLETED' : 'REQUESTABLE');
    const effectStage = effectStages[capability.effectClass] ?? 'COMPLETED';
    const resourceStage = resourceStages[capability.resourceClass] ?? 'COMPLETED';
    const stage = minimumStage(
      capability.defaultStage,
      projectCapabilityStages[capability.capabilityRef] ?? 'COMPLETED',
      permissionStage,
      effectStage,
      resourceStage
    );
    if (stageIndex(stage) < stageIndex(includeBelow)) continue;

    entries.push(Object.freeze({
      capabilityRef: capability.capabilityRef,
      purpose: capability.purpose,
      stage,
      actionRefs: canonicalRefs(capability.actionRefs),
      permissionRef: capability.permissionRef,
      effectClass: capability.effectClass,
      resourceClass: capability.resourceClass,
      executable: stage === 'EXECUTABLE' || stage === 'COMPLETED',
      rootKernel,
      alwaysAvailable: rootKernel,
      parentCapabilityRef: capability.parentCapabilityRef ?? null,
      childCapabilityRefs: canonicalRefs(capability.childCapabilityRefs),
      recommendedNextCapabilityRefs: canonicalRefs(capability.recommendedNextCapabilityRefs),
      heldNextCapabilities: Object.freeze([
        ...new Map([
          ...(capability.heldNextCapabilities ?? []),
          ...(heldNextCapabilities[capability.capabilityRef] ?? [])
        ].map((item) => [item.capabilityRef ?? JSON.stringify(item), structuredClone(item)])).values()
      ]),
      unknownDoorRefs: canonicalRefs([
        ...(capability.unknownDoorRefs ?? []),
        ...(unknownDoorRefs[capability.capabilityRef] ?? [])
      ]),
      competenceState: competenceProjection(
        capability,
        competenceStates[capability.capabilityRef] ?? null
      ),
      currentness: currentnessProjection(
        capability,
        capabilityCurrentness[capability.capabilityRef] ?? null
      ),
      permissionStage,
      effectStage,
      resourceStage,
      parallelClass: capability.parallelClass ??
        (capability.effectClass === 'READ_ONLY' ? 'INDEPENDENT_READ_ONLY' : 'SERIAL_EFFECT'),
      dependencyRefs: canonicalRefs(capability.dependencyRefs),
      toolContract: capability.toolContract ? Object.freeze(structuredClone(capability.toolContract)) : null
    }));
  }

  return Object.freeze({
    schemaVersion: 'vexlife.capability-frame/v1',
    registryRef: registry.registryRef,
    registryVersion: registry.registryVersion ?? null,
    roleRef,
    platformRef,
    rootCapabilityKernel: Object.freeze([...kernelRefs]),
    entries: Object.freeze(entries.sort((left, right) =>
      left.capabilityRef.localeCompare(right.capabilityRef)))
  });
}

export function projectCapabilityFrontier(frame, {
  activeCapabilityRef = null,
  maximumEntries = 12
} = {}) {
  if (!Number.isInteger(maximumEntries) || maximumEntries < ROOT_CAPABILITY_KERNEL.length) {
    throw new Error('capability frontier maximumEntries is too small for the root kernel');
  }
  const byRef = new Map(frame.entries.map((entry) => [entry.capabilityRef, entry]));
  const selected = new Set(frame.rootCapabilityKernel);
  if (activeCapabilityRef) selected.add(activeCapabilityRef);
  const active = activeCapabilityRef ? byRef.get(activeCapabilityRef) : null;
  for (const capabilityRef of active?.childCapabilityRefs ?? []) selected.add(capabilityRef);
  for (const capabilityRef of active?.recommendedNextCapabilityRefs ?? []) selected.add(capabilityRef);

  const entries = [...selected]
    .map((capabilityRef) => byRef.get(capabilityRef))
    .filter(Boolean)
    .sort((left, right) => {
      const leftKernel = frame.rootCapabilityKernel.includes(left.capabilityRef) ? 0 : 1;
      const rightKernel = frame.rootCapabilityKernel.includes(right.capabilityRef) ? 0 : 1;
      return leftKernel - rightKernel || left.capabilityRef.localeCompare(right.capabilityRef);
    })
    .slice(0, maximumEntries);

  return Object.freeze({
    schemaVersion: 'vexlife.capability-frontier/v1',
    registryRef: frame.registryRef,
    registryVersion: frame.registryVersion,
    roleRef: frame.roleRef,
    platformRef: frame.platformRef,
    activeCapabilityRef,
    rootCapabilityKernel: Object.freeze([...frame.rootCapabilityKernel]),
    entries: Object.freeze(entries.map((entry) => Object.freeze({
      capabilityRef: entry.capabilityRef,
      purpose: entry.purpose,
      stage: entry.stage,
      childCapabilityRefs: entry.childCapabilityRefs,
      recommendedNextCapabilityRefs: entry.recommendedNextCapabilityRefs,
      heldNextCapabilities: entry.heldNextCapabilities,
      unknownDoorRefs: entry.unknownDoorRefs,
      competenceState: entry.competenceState,
      currentness: entry.currentness,
      permissionStage: entry.permissionStage,
      effectStage: entry.effectStage,
      resourceStage: entry.resourceStage,
      parallelClass: entry.parallelClass,
      dependencyRefs: entry.dependencyRefs
    })))
  });
}

export function requireExecutable(frame, capabilityRef) {
  const capability = frame.entries.find((item) => item.capabilityRef === capabilityRef);
  if (!capability) return { state: 'BLOCKED_CAPABILITY_NOT_VISIBLE', capabilityRef };
  if (!capability.executable) {
    return {
      state: 'BLOCKED_CAPABILITY_STAGE',
      capabilityRef,
      observedStage: capability.stage
    };
  }
  return { state: 'CAPABILITY_EXECUTABLE', capability };
}

// [VXG RealForever]
