const REQUIRED_PROPOSAL_FIELDS = Object.freeze([
  'proposalRef', 'featureRef', 'currentFrameRef', 'invocationClass', 'purposeClass', 'whyRelevantRefs',
  'awarenessState', 'routeState', 'availabilityState', 'exposureRef', 'effects'
]);

export const GUIDANCE_DERIVED_AWARENESS_STATES = Object.freeze(['UNINTRODUCED']);
export const GUIDANCE_EPHEMERAL_AWARENESS_STATES = Object.freeze(['OFFERED_THIS_SESSION']);
export const GUIDANCE_LOCAL_PREFERENCE_STATES = Object.freeze(['DEFERRED', 'ACKNOWLEDGED', 'SUPPRESSED']);
export const GUIDANCE_AWARENESS_STATES = Object.freeze([
  ...GUIDANCE_DERIVED_AWARENESS_STATES,
  ...GUIDANCE_EPHEMERAL_AWARENESS_STATES,
  ...GUIDANCE_LOCAL_PREFERENCE_STATES
]);
export const GUIDANCE_INVOCATION_CLASSES = Object.freeze(['PROACTIVE_INTRODUCTION', 'EXPLICIT_HELP', 'EXPLICIT_SHOW_ME']);
export const GUIDANCE_PURPOSE_CLASSES = Object.freeze(['EXPLORE', 'TRY', 'BUILD', 'REVISIT', 'LEARN', 'RECOVER']);
export const GUIDANCE_ROUTE_STATES = Object.freeze(['CURRENT', 'HELD']);
export const GUIDANCE_AVAILABILITY_STATES = Object.freeze(['AVAILABLE', 'HELD', 'UNAVAILABLE', 'UNKNOWN']);
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
export const GUIDANCE_HELP_SECTION_KINDS = Object.freeze([
  'WHAT_CAN_I_DO_HERE',
  'WHAT_CAN_VEX_HELP_WITH_HERE',
  'SHOW_ME_HOW',
  'RELEVANT_NOT_YET_INTRODUCED',
  'WHY_UNAVAILABLE',
  'RECOVERY_AND_GET_BACK',
  'ADVANCED_WHEN_I_WANT_IT'
]);
export const GUIDANCE_READING_DIRECTIONS = Object.freeze(['LTR', 'RTL']);

const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const nullableRef = (value) => value === null || nonempty(value);
const clone = (value) => value == null ? value : structuredClone(value);
const sameIdentity = (left, right) => left.featureRef === right.featureRef && left.planRef === right.planRef && left.sourceVersionRef === right.sourceVersionRef;

export function guidancePreferenceIdentity({ featureRef, planRef, sourceVersionRef } = {}) {
  if (![featureRef, planRef, sourceVersionRef].every(nonempty)) {
    throw new Error('featureRef, planRef and sourceVersionRef are required for guidance preference identity');
  }
  return Object.freeze({ featureRef, planRef, sourceVersionRef });
}

export function deriveGuidanceAwareness({ identity, preference = null, offeredThisSession = false } = {}) {
  const currentIdentity = guidancePreferenceIdentity(identity);
  if (preference === null) return offeredThisSession ? 'OFFERED_THIS_SESSION' : 'UNINTRODUCED';
  if (!preference || typeof preference !== 'object' || Array.isArray(preference)) throw new Error('guidance preference must be an object or null');
  if (!GUIDANCE_LOCAL_PREFERENCE_STATES.includes(preference.state)) throw new Error(`unsupported guidance preference state ${preference.state}`);
  const preferenceIdentity = guidancePreferenceIdentity(preference);
  if (!sameIdentity(currentIdentity, preferenceIdentity)) return offeredThisSession ? 'OFFERED_THIS_SESSION' : 'UNINTRODUCED';
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
  if (!GUIDANCE_INVOCATION_CLASSES.includes(proposal.invocationClass)) errors.push(`unsupported guidance invocationClass ${proposal.invocationClass}`);
  if (!GUIDANCE_PURPOSE_CLASSES.includes(proposal.purposeClass)) errors.push(`unsupported guidance purposeClass ${proposal.purposeClass}`);
  if (!GUIDANCE_AWARENESS_STATES.includes(proposal.awarenessState)) errors.push(`unsupported guidance awarenessState ${proposal.awarenessState}`);
  if (!GUIDANCE_ROUTE_STATES.includes(proposal.routeState)) errors.push(`unsupported guidance routeState ${proposal.routeState}`);
  if (!GUIDANCE_AVAILABILITY_STATES.includes(proposal.availabilityState)) errors.push(`unsupported guidance availabilityState ${proposal.availabilityState}`);
  if (!Array.isArray(proposal.whyRelevantRefs) || proposal.whyRelevantRefs.length === 0 || proposal.whyRelevantRefs.some((ref) => !nonempty(ref))) errors.push('guidance proposal requires non-empty whyRelevantRefs');
  if (proposal.effects !== false) errors.push('guidance proposal effects must be false');
  if (proposal.targetBindingOrNull != null) errors.push(...validateGuidanceTargetBinding(proposal.targetBindingOrNull, { actionBearing: nonempty(proposal.suggestedActionRefOrNull) }));
  if (!nullableRef(proposal.planRefOrNull)) errors.push('guidance proposal invalid planRefOrNull');
  if (!nullableRef(proposal.sourceVersionRefOrNull)) errors.push('guidance proposal invalid sourceVersionRefOrNull');
  if (!nullableRef(proposal.suggestedActionRefOrNull)) errors.push('guidance proposal invalid suggestedActionRefOrNull');
  if (proposal.invocationClass === 'PROACTIVE_INTRODUCTION' && proposal.awarenessState !== 'UNINTRODUCED') {
    errors.push('proactive introduction requires UNINTRODUCED awarenessState');
  }
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

function placementGeometry(direction, anchor, size, margin, readingDirection) {
  const centerX = anchor.left + anchor.width / 2;
  const centerY = anchor.top + anchor.height / 2;
  const inlineEndLeft = readingDirection === 'RTL' ? anchor.left - size.width - margin : anchor.right + margin;
  const inlineStartLeft = readingDirection === 'RTL' ? anchor.right + margin : anchor.left - size.width - margin;
  const placements = {
    BLOCK_START: { left: centerX - size.width / 2, top: anchor.top - size.height - margin },
    INLINE_END: { left: inlineEndLeft, top: centerY - size.height / 2 },
    BLOCK_END: { left: centerX - size.width / 2, top: anchor.bottom + margin },
    INLINE_START: { left: inlineStartLeft, top: centerY - size.height / 2 },
    BLOCK_START_INLINE_END: { left: inlineEndLeft, top: anchor.top - size.height - margin },
    BLOCK_END_INLINE_END: { left: inlineEndLeft, top: anchor.bottom + margin },
    BLOCK_END_INLINE_START: { left: inlineStartLeft, top: anchor.bottom + margin },
    BLOCK_START_INLINE_START: { left: inlineStartLeft, top: anchor.top - size.height - margin }
  };
  const point = placements[direction];
  if (!point) throw new Error(`unsupported guidance direction ${direction}`);
  return { ...point, width: size.width, height: size.height, right: point.left + size.width, bottom: point.top + size.height };
}

function directionCapacity(direction, anchor, safe, readingDirection) {
  const blockStart = Math.max(0, anchor.top - safe.top);
  const blockEnd = Math.max(0, safe.bottom - anchor.bottom);
  const physicalLeft = Math.max(0, anchor.left - safe.left);
  const physicalRight = Math.max(0, safe.right - anchor.right);
  const inlineStart = readingDirection === 'RTL' ? physicalRight : physicalLeft;
  const inlineEnd = readingDirection === 'RTL' ? physicalLeft : physicalRight;
  const capacities = {
    BLOCK_START: blockStart,
    INLINE_END: inlineEnd,
    BLOCK_END: blockEnd,
    INLINE_START: inlineStart,
    BLOCK_START_INLINE_END: Math.min(blockStart, inlineEnd),
    BLOCK_END_INLINE_END: Math.min(blockEnd, inlineEnd),
    BLOCK_END_INLINE_START: Math.min(blockEnd, inlineStart),
    BLOCK_START_INLINE_START: Math.min(blockStart, inlineStart)
  };
  if (!Object.hasOwn(capacities, direction)) throw new Error(`unsupported guidance direction ${direction}`);
  return capacities[direction];
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
  readingDirection = 'LTR',
  margin = 12
} = {}) {
  if (!GUIDANCE_READING_DIRECTIONS.includes(readingDirection)) throw new Error(`unsupported readingDirection ${readingDirection}`);
  const anchor = rect(targetRect, 'targetRect');
  const viewport = rect(viewportRect, 'viewportRect');
  const safe = safeArea ? rect(safeArea, 'safeArea') : viewport;
  const size = { width: Number(surfaceSize?.width), height: Number(surfaceSize?.height) };
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) throw new Error('surfaceSize requires positive finite width/height');
  const protectedValues = protectedRects.map((value, index) => rect(value, `protectedRects[${index}]`));
  const navigationValues = navigationRects.map((value, index) => rect(value, `navigationRects[${index}]`));
  const focusValue = focusRect ? rect(focusRect, 'focusRect') : null;
  const candidates = [...new Set(preferredDirections)].map((direction, preferenceIndex) => {
    const geometry = placementGeometry(direction, anchor, size, margin, readingDirection);
    const outside = outsideArea(geometry, safe);
    const targetOverlap = overlapArea(geometry, anchor);
    const focusOverlap = focusValue ? overlapArea(geometry, focusValue) : 0;
    const navigationOverlap = navigationValues.reduce((sum, item) => sum + overlapArea(geometry, item), 0);
    const protectedOverlap = protectedValues.reduce((sum, item) => sum + overlapArea(geometry, item), 0);
    const violationScore = outside * 1_000_000 + targetOverlap * 100_000 + focusOverlap * 100_000 + navigationOverlap * 75_000 + protectedOverlap * 50_000;
    const capacity = directionCapacity(direction, anchor, safe, readingDirection);
    const safeCandidate = violationScore === 0;
    return { direction, geometry, preferenceIndex, capacity, safeCandidate, violationScore, outside, targetOverlap, focusOverlap, navigationOverlap, protectedOverlap };
  }).sort((a, b) => Number(b.safeCandidate) - Number(a.safeCandidate) || a.violationScore - b.violationScore || b.capacity - a.capacity || a.preferenceIndex - b.preferenceIndex || a.direction.localeCompare(b.direction));
  const best = candidates[0] ?? null;
  if (best?.safeCandidate) {
    return Object.freeze({ state: 'ANCHORED', presentationKind: 'ANCHORED_CALLOUT', direction: best.direction, readingDirection, geometry: best.geometry, availableCapacity: best.capacity, persistedPreferenceMutation: false, semanticNavigationEffect: false, journeyEffect: false });
  }
  return Object.freeze({ state: 'FALLBACK_REQUIRED', presentationKind: 'CONTEXTUAL_EDGE_CALLOUT', direction: null, readingDirection, geometry: null, rejectedCandidateDirection: best?.direction ?? null, fallbackOrder: ['CONTEXTUAL_EDGE_CALLOUT', 'IN_FLOW_GUIDANCE', 'GUIDE_VESSEL_EXPLANATION', 'COMPACT_CONTEXT_SHEET', 'NONVISUAL_DESCRIPTION'], persistedPreferenceMutation: false, semanticNavigationEffect: false, journeyEffect: false });
}

export function buildHelpProjection({ currentFrameRef, sections = [], proposals = [] } = {}) {
  if (!nonempty(currentFrameRef)) throw new Error('currentFrameRef is required');
  const normalizedSections = sections.map((section) => {
    if (!section || typeof section !== 'object' || !GUIDANCE_HELP_SECTION_KINDS.includes(section.sectionKind)) throw new Error(`unsupported Help sectionKind ${section?.sectionKind}`);
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
