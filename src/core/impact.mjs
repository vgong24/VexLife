import { semanticHash } from './utils.mjs';

function byRef(items, key) { return new Map((items ?? []).map((item) => [item[key], item])); }
function changedRefs(beforeItems, afterItems, key) {
  const before = byRef(beforeItems, key); const after = byRef(afterItems, key);
  const added = [...after.keys()].filter((ref) => !before.has(ref));
  const removed = [...before.keys()].filter((ref) => !after.has(ref));
  const changed = [...after.keys()].filter((ref) => before.has(ref) && semanticHash(before.get(ref)) !== semanticHash(after.get(ref)));
  return { added, removed, changed };
}

export function buildBlueprintImpact(before, after) {
  const screenImpact = changedRefs(before.screens, after.screens, 'screenRef');
  const actionImpact = changedRefs(before.actions, after.actions, 'actionRef');
  const permissionImpact = changedRefs(before.permissions, after.permissions, 'permissionRef');
  const stateImpact = changedRefs(before.stateDomains, after.stateDomains, 'stateRef');
  const terrainImpact = changedRefs(before.terrain, after.terrain, 'terrainNodeRef');
  const affectedNodeRefs = [...new Set(Object.values({ screenImpact, actionImpact, permissionImpact, stateImpact, terrainImpact }).flatMap((group) => [...group.added, ...group.removed, ...group.changed]))].sort();
  const breaking = permissionImpact.removed.length > 0 || actionImpact.removed.length > 0 || screenImpact.removed.length > 0 || Number(after.contractVersion) > Number(before.contractVersion);
  const report = {
    schemaVersion: 'vexlife.blueprint-impact/v0',
    beforeVersion: before.version, afterVersion: after.version,
    beforeContractVersion: before.contractVersion, afterContractVersion: after.contractVersion,
    changeClass: breaking ? 'BREAKING_OR_MIGRATION_REQUIRED' : 'COMPATIBLE_EXTENSION_OR_CLARIFICATION',
    affectedNodeRefs,
    groups: { screens: screenImpact, actions: actionImpact, permissions: permissionImpact, states: stateImpact, terrain: terrainImpact },
    affectedPlatforms: (after.platforms ?? []).map((item) => item.platformRef),
    stableMainsIntentionallyBroken: false
  };
  return { ...report, impactHash: semanticHash(report) };
}

// [VXG RealForever]
