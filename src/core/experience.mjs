import { semanticHash } from './utils.mjs';

export class ExperienceRegistry {
  constructor(source) {
    if (!source?.registryRef) throw new Error('experience registryRef is required');
    this.registryRef = source.registryRef;
    this.profiles = new Map((source.experienceProfiles ?? []).map((item) => [item.profileRef, structuredClone(item)]));
    this.gestures = new Map((source.gestureContracts ?? []).map((item) => [item.gestureRef, structuredClone(item)]));
    this.vessels = new Map((source.vessels ?? []).map((item) => [item.vesselRef, structuredClone(item)]));
  }

  profile(ref) { const value = this.profiles.get(ref); if (!value) throw new Error(`missing experience profile ${ref}`); return structuredClone(value); }
  vessel(ref) { const value = this.vessels.get(ref); if (!value) throw new Error(`missing action vessel ${ref}`); return structuredClone(value); }

  resolveInteraction({ surfaceKind, inputType, preferredGestureRef = null, modifiers = [], accessibilityMode = null } = {}) {
    const candidates = [...this.gestures.values()].filter((gesture) => gesture.surfaceKinds.includes(surfaceKind) && gesture.inputs.includes(inputType));
    let selected = preferredGestureRef ? candidates.filter((gesture) => gesture.gestureRef === preferredGestureRef) : candidates;
    if (accessibilityMode === 'SCREEN_MAGNIFICATION' && inputType === 'PINCH') selected = [];
    if (selected.length === 0) return { disposition: 'NO_MATCH', surfaceKind, inputType, candidateRefs: candidates.map((item) => item.gestureRef), semanticHash: semanticHash({ surfaceKind, inputType, modifiers, accessibilityMode }) };
    if (selected.length > 1) return { disposition: 'AMBIGUOUS_BLOCKED', surfaceKind, inputType, candidateRefs: selected.map((item) => item.gestureRef).sort(), semanticHash: semanticHash(selected.map((item) => item.gestureRef).sort()) };
    const gesture = selected[0];
    return { disposition: 'INTERACTION_RESOLVED', gestureRef: gesture.gestureRef, actionRef: gesture.resultActionRef, rules: structuredClone(gesture.rules), modifiers: [...modifiers], semanticHash: semanticHash({ gestureRef: gesture.gestureRef, surfaceKind, inputType, modifiers, accessibilityMode }) };
  }

  buildProfileProjection(profileRef, { availableRegionRefs = [], availableRoleRefs = [] } = {}) {
    const profile = this.profile(profileRef);
    return {
      profileRef,
      defaultRouteRef: profile.defaultRouteRef,
      defaultRoleRef: availableRoleRefs.includes(profile.defaultRoleRef) ? profile.defaultRoleRef : null,
      visibleRegionRefs: profile.defaultVisibleRegionRefs.filter((ref) => availableRegionRefs.includes(ref)),
      detailDensity: profile.detailDensity,
      guideMode: profile.guideMode,
      attentionPolicy: profile.attentionPolicy,
      semanticHash: semanticHash({ profileRef, availableRegionRefs: [...availableRegionRefs].sort(), availableRoleRefs: [...availableRoleRefs].sort() })
    };
  }
}

export function validateExperienceRegistry(source, { actionRefs = new Set(), componentRefs = new Set(), stringRefs = new Set() } = {}) {
  const errors = [];
  const seen = new Set();
  const add = (ref, kind) => { if (!ref) errors.push(`${kind} missing ref`); else if (seen.has(ref)) errors.push(`duplicate experience ref ${ref}`); else seen.add(ref); };
  for (const profile of source.experienceProfiles ?? []) {
    add(profile.profileRef, 'profile');
    if (!stringRefs.has(profile.labelStringRef)) errors.push(`${profile.profileRef} missing label string ${profile.labelStringRef}`);
  }
  for (const gesture of source.gestureContracts ?? []) {
    add(gesture.gestureRef, 'gesture');
    if (!actionRefs.has(gesture.resultActionRef)) errors.push(`${gesture.gestureRef} missing action ${gesture.resultActionRef}`);
    if (!stringRefs.has(gesture.helpStringRef)) errors.push(`${gesture.gestureRef} missing help string ${gesture.helpStringRef}`);
    if (!(gesture.surfaceKinds?.length && gesture.inputs?.length && gesture.rules?.length)) errors.push(`${gesture.gestureRef} incomplete interaction contract`);
  }
  for (const vessel of source.vessels ?? []) {
    add(vessel.vesselRef, 'vessel');
    if (!componentRefs.has(vessel.componentRef)) errors.push(`${vessel.vesselRef} missing component ${vessel.componentRef}`);
    if (!stringRefs.has(vessel.labelStringRef)) errors.push(`${vessel.vesselRef} missing label string ${vessel.labelStringRef}`);
    for (const actionRef of vessel.actionRefs ?? []) if (!actionRefs.has(actionRef)) errors.push(`${vessel.vesselRef} missing action ${actionRef}`);
    if (!vessel.accessibility?.neverObscuresDeclaredControls) errors.push(`${vessel.vesselRef} must protect declared controls`);
  }
  return { ok: errors.length === 0, errors };
}

// [VXG RealForever]
