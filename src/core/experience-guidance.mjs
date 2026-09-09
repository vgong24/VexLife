const REQUIRED_PROPOSAL_FIELDS = Object.freeze([
  'proposalRef', 'featureRef', 'currentFrameRef', 'purposeClass', 'whyRelevantRefs',
  'awarenessState', 'routeState', 'availabilityState', 'exposureRef', 'effects'
]);

export const GUIDANCE_DERIVED_AWARENESS_STATES = Object.freeze(['UNINTRODUCED']);
export const GUIDANCE_EPHEMERAL_AWARENESS_STATES = Object.freeze(['OFFERED_THIS_SESSION']);
export const GUIDANCE_LOCAL_PREFERENCE_STATES = Object.freeze(['DEFERRED', 'ACKNOWLEDGED', 'SUPPRESSED']);
export const GUIDANCE_PURPOSE_CLASSES = Object.freeze(['EXPLORE', 'TRY', 'BUILD', 'REVISIT', 'LEARN', 'RECOVER']);
export const GUIDANCE_TARGET_KINDS = Object.freeze(['ELEMENT', 'COMPONENT', 'COMPONENT_SLOT', 'REGION', 'TERRAIN_NODE', 'VESSEL']);
export const GUIDANCE_BINDING_POLICIES = Object.freeze([
  'STATIC_CANONICAL_TARGET',
  'EXACT_COMPONENT_INSTANCE',
  'EXACT_COMPONENT_SLOT_INSTANCE',
  'CURRENT_SELECTED_INSTANCE',
  'CURRENT_TERRAIN_NODE_INSTANCE',
  'CURRENT_VESSEL'
]);
export const GUIDANCE_PRESENTATION_KINDS = Object.freeze([
  'ANCHORED_CALLOUT',
  'CONTEXTUAL_EDGE_CALLOUT',
  'IN_FLOW_GUIDANCE',
  'GUIDE_VESSEL_EXPLANATION',
  'COMPACT_CONTEXT_SHEET',
  'NONVISUAL_DESCRIPTION'
]);

const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const nullableRef = (value) => value === null || nonempty(value);
const clone = (value) => value == null ? value : structuredClone(value);

export function guidancePreferenceIdentity({ featureRef, planRef, sourceVersionRef } = {}) {
  if (![featureRef, planRef, sourceVersionRef].every(nonempty)) {
    throw new Error('featureRef, planRef and sourceVersionRef are required for guidance preference identity');
  }
  return Object.freeze({ featureRef, planRef, sourceVersionRef });
}

export function deriveGuidanceAwareness({ preference = null, offeredThisSession = false } = {}) {
  if (preference === null) return offeredThisSession ? 'OFFERED_THIS_SESSION' : 'UNINTRODUCED';
  if (!preference || typeof preference !== 'object' || Array.isArray(preference)) throw new Error('guidance preference must be an object or null');
  if (!GUIDANCE_LOCAL_PREFERENCE_STATES.includes(preference.state)) throw new Error(`unsupported guidance preference state ${preference.state}`);
  guidancePreferenceIdentity(preference);
  return preference.state;
}

export function makeGuidancePreference({ state, featureRef, planRef, sourceVersionRef } = {}) {
  if (!GUIDANCE_LOCAL_PREFERENCE_STATES.includes(state)) throw new Error(`unsupported guidance preference state ${state}`);
  return Object.freeze({ state, ...guidancePreferenceIdentity({ featureRef, planRef, sourceVersionRef }) });
}

export function validateGuidanceTargetBinding(binding, { actionBearing = false } = {}) {
  const errors = [];
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return ['guidance target binding must be an object'];
  if (!nonempty(binding.targetRef)) errors.push('guidance target binding missing targetRef');
  if (!GUIDANCE_TARGET_KINDS.includes(binding.targetKind)) errors.push(`unsupported guidance targetKind ${binding.targetKind}`);
  if (!GUIDANCE_BINDING_POLICIES.includes(binding.bindingPolicy)) errors.push(`unsupported guidance bindingPolicy ${binding.bindingPolicy}`);
  for (const key of ['screenRefOrNull', 'regionRefOrNull', 'componentRefOrNull', 'slotRefOrNull', 'instanceRefOrNull', 'entityRefOrNull', 'selectionRefOrNull']) {
    if (!Object.hasOwn(binding, key) || !nullableRef(binding[key])) errors.push(`guidance target binding invalid ${key}`);
  }

  if (binding.bindingPolicy === 'STATIC_CANONICAL_TARGET' && binding.instanceRefOrNull !== null) {
    errors.push('STATIC_CANONICAL_TARGET must not include instanceRefOrNull');
  }
  if (binding.bindingPolicy === 'EXACT_COMPONENT_INSTANCE') {
    if (!nonempty(binding.componentRefOrNull) || !nonempty(binding.instanceRefOrNull)) errors.push('EXACT_COMPONENT_INSTANCE requires componentRefOrNull and instanceRefOrNull');
  }
  if (binding.bindingPolicy === 'EXACT_COMPONENT_SLOT_INSTANCE') {
    if (![binding.componentRefOrNull, binding.slotRefOrNull, binding.instanceRefOrNull].every(nonempty)) errors.push('EXACT_COMPONENT_SLOT_INSTANCE requires componentRefOrNull, slotRefOrNull and instanceRefOrNull');
  }
  if (binding.targetKind === 'COMPONENT_SLOT' && !nonempty(binding.slotRefOrNull)) errors.push('COMPONENT_SLOT target requires slotRefOrNull');
  if (actionBearing && ['CURRENT_SELECTED_INSTANCE', 'CURRENT_TERRAIN_NODE_INSTANCE', 'CURRENT_VESSEL'].includes(binding.bindingPolicy) && !nonempty(binding.selectionRefOrNull) && !nonempty(binding.instanceRefOrNull)) {
    errors.push('action-bearing dynamic guidance target requires an exact selectionRefOrNull or instanceRefOrNull');
  }
  return errors;
}

export function validateGuidanceProposal(proposal) {
  const errors = [];
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return ['guidance proposal must be an object'];
  for (const field of REQUIRED_PROPOSAL_FIELDS) if (!Object.hasOwn(proposal, field)) errors.push(`guidance proposal missing ${field}`);
  for (const field of ['proposalRef', 'featureRef', 'currentFrameRef', 'exposureRef']) if (!nonempty(proposal[field])) errors.push(`guidance proposal invalid ${field}`);
  if (!GUIDANCE_PURPOSE_CLASSES.includes(proposal.purposeClass)) errors.push(`unsupported guidance purposeClass ${proposal.purposeClass}`);
  if (!Array.isArray(proposal.whyRelevantRefs) || proposal.whyRelevantRefs.length === 0 || proposal.whyRelevantRefs.some((ref) => !nonempty(ref))) errors.push('guidance proposal requires non-empty whyRelevantRefs');
  if (proposal.effects !== false) errors.push('guidance proposal effects must be false');
  if (proposal.targetBindingOrNull != null) errors.push(...validateGuidanceTargetBinding(proposal.targetBindingOrNull, { actionBearing: nonempty(proposal.suggestedActionRefOrNull) }));
  if (!nullableRef(proposal.planRefOrNull)) errors.push('guidance proposal invalid planRefOrNull');
  if (!nullableRef(proposal.sourceVersionRefOrNull)) errors.push('guidance proposal invalid sourceVersionRefOrNull');
  if (!nullableRef(proposal.suggestedActionRefOrNull)) errors.push('guidance proposal invalid suggestedActionRefOrNull');
  if (proposal.routeState !== 'CURRENT' && nonempty(proposal.suggestedActionRefOrNull)) errors.push('non-current guidance route cannot suggest a runnable action');
  if (proposal.availabilityState !== 'AVAILABLE' && nonempty(proposal.suggestedActionRefOrNull)) errors.push('unavailable guidance proposal cannot suggest a runnable action');
  return errors;
}

export function buildGuidanceProposal(value) {
  const proposal = { ...clone(value), effects: false };
  for (const optional of ['planRefOrNull', 'sourceVersionRefOrNull', 'targetBindingOrNull', 'suggestedActionRefOrNull']) {
    if (!Object.hasOwn(proposal, optional)) proposal[optional] = null;
  }
  const errors = validateGuidanceProposal(proposal);
  if (errors.length) throw new Error(errors[0]);
  return Object.freeze(proposal);
}

function rect(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`${label} is required`);
  const left = Number(value.left); const top = Number(value.top);
  const width = Number.isFinite(Number(value.width)) ? Number(value.width) : Number(value.right) - left;
  const height = Number.isFinite(Number(value.height)) ? Number(value.height) : Number(value.bottom) - top;
  if (![left, top, width, height].every(Number.isFinite) || width < 0 || height < 0) throw new Error(`${label} must contain finite geometry`);
  return { left, top, width, height, right: left + width, bottom: top + height };
}
const overlapArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const outsideArea = (candidate, safe) => {
  const clippedWidth = Math.max(0, Math.min(candidate.right, safe.right) - Math.max(candidate.left, safe.left));
  const clippedHeight = Math.max(0, Math.min(candidate.bottom, safe.bottom) - Math.max(candidate.top, safe.top));
  return candidate.width * candidate.height - clippedWidth * clippedHeight;
};

function placementGeometry(direction, anchor, size, margin) {
  const centerX = anchor.left + anchor.width / 2;
  const centerY = anchor.top + anchor.height / 2;
  const placements = {
    BLOCK_START: { left: centerX - size.width / 2, top: anchor.top - size.height - margin },
    INLINE_END: { left: anchor.right + margin, top: centerY - size.height / 2 },
    BLOCK_END: { left: centerX - size.width / 2, top: anchor.bottom + margin },
    INLINE_START: { left: anchor.left - size.width - margin, top: centerY - size.height / 2 },
    BLOCK_START_INLINE_END: { left: anchor.right + margin, top: anchor.top - size.height - margin },
    BLOCK_END_INLINE_END: { left: anchor.right + margin, top: anchor.bottom + margin },
    BLOCK_END_INLINE_START: { left: anchor.left - size.width - margin, top: anchor.bottom + margin },
    BLOCK_START_INLINE_START: { left: anchor.left - size.width - margin, top: anchor.top - size.height - margin }
  };
  const point = placements[direction];
  if (!point) throw new Error(`unsupported guidance direction ${direction}`);
  return { ...point, width: size.width, height: size.height, right: point.left + size.width, bottom: point.top + size.height };
}

export function resolveGuidancePlacement({
  targetRect,
  surfaceSize,
  viewportRect,
  safeArea = null,
  protectedRects = [],
  navigationRects = [],
  focusRect = null,
  preferredDirections = ['BLOCK_START', 'INLINE_END', 'BLOCK_END', 'INLINE_START'],
  margin = 12
} = {}) {
  const anchor = rect(targetRect, 'targetRect');
  const viewport = rect(viewportRect, 'viewportRect');
  const safe = safeArea ? rect(safeArea, 'safeArea') : viewport;
  const size = { width: Number(surfaceSize?.width), height: Number(surfaceSize?.height) };
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) throw new Error('surfaceSize requires positive finite width/height');
  const protectedValues = protectedRects.map((value, index) => rect(value, `protectedRects[${index}]`));
  const navigationValues = navigationRects.map((value, index) => rect(value, `navigationRects[${index}]`));
  const focusValue = focusRect ? rect(focusRect, 'focusRect') : null;
  const candidates = [...new Set(preferredDirections)].map((direction, preferenceIndex) => {
    const geometry = placementGeometry(direction, anchor, size, margin);
    const outside = outsideArea(geometry, safe);
    const targetOverlap = overlapArea(geometry, anchor);
    const focusOverlap = focusValue ? overlapArea(geometry, focusValue) : 0;
    const navigationOverlap = navigationValues.reduce((sum, item) => sum + overlapArea(geometry, item), 0);
    const protectedOverlap = protectedValues.reduce((sum, item) => sum + overlapArea(geometry, item), 0);
    const distance = (geometry.left - anchor.left) ** 2 + (geometry.top - anchor.top) ** 2;
    const score = outside * 1_000_000 + targetOverlap * 100_000 + focusOverlap * 100_000 + navigationOverlap * 75_000 + protectedOverlap * 50_000 + distance + preferenceIndex;
    return { direction, geometry, score, outside, targetOverlap, focusOverlap, navigationOverlap, protectedOverlap };
  }).sort((a, b) => a.score - b.score || a.direction.localeCompare(b.direction));
  const best = candidates[0] ?? null;
  if (best && best.outside === 0 && best.targetOverlap === 0 && best.focusOverlap === 0 && best.navigationOverlap === 0 && best.protectedOverlap === 0) {
    return Object.freeze({ state: 'ANCHORED', presentationKind: 'ANCHORED_CALLOUT', direction: best.direction, geometry: best.geometry, persistedPreferenceMutation: false, semanticNavigationEffect: false, journeyEffect: false });
  }
  return Object.freeze({ state: 'FALLBACK_REQUIRED', presentationKind: 'CONTEXTUAL_EDGE_CALLOUT', direction: best?.direction ?? null, geometry: best?.geometry ?? null, fallbackOrder: ['CONTEXTUAL_EDGE_CALLOUT', 'IN_FLOW_GUIDANCE', 'GUIDE_VESSEL_EXPLANATION', 'COMPACT_CONTEXT_SHEET', 'NONVISUAL_DESCRIPTION'], persistedPreferenceMutation: false, semanticNavigationEffect: false, journeyEffect: false });
}

export function buildHelpProjection({ currentFrameRef, sections = [], proposals = [] } = {}) {
  if (!nonempty(currentFrameRef)) throw new Error('currentFrameRef is required');
  const normalizedSections = sections.map((section) => {
    if (!section || typeof section !== 'object' || !nonempty(section.sectionKind)) throw new Error('Help section requires sectionKind');
    return clone(section);
  });
  const normalizedProposals = proposals.map((proposal) => buildGuidanceProposal(proposal));
  return Object.freeze({
    state: 'CURRENT',
    currentFrameRef,
    sections: normalizedSections,
    proposals: normalizedProposals,
    effects: false,
    memoryWritten: false,
    networkTelemetry: false,
    explicitHelpBlockedBySuppression: false
  });
}

// [VXG RealForever]
