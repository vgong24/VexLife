import {
  GUIDANCE_AVAILABILITY_STATES,
  GUIDANCE_HELP_SECTION_KINDS,
  validateGuidanceProposal,
  validateInteractionCue
} from './experience-guidance.mjs';
import { VEX_SELF_CAPABILITY_FRAME_SCHEMA } from './vex-self-capability-frame.mjs';
import { semanticHash } from './utils.mjs';

export const DEVEX_GUIDANCE_PROJECTION_SCHEMA = 'vexlife.devex-guidance-projection/v1';
export const DEVEX_GUIDANCE_HELP_COMMAND_REF = 'command.vexlife.help';

const HELP_CAPABILITY_REF = 'help.render';
const HELP_ALIAS_LITERAL = '/help';
const HELP_ALIAS_FORM_REF = 'form.vexlife.operator.slash-alias';
const SAFE_CONTEXT_FIELDS = Object.freeze([
  'projectRef',
  'threadRef',
  'channelRef',
  'screenRef',
  'selectedNodeRef'
]);
const SENSITIVE_CONTEXT_FIELDS = Object.freeze([
  'homeRef',
  'deviceRef',
  'companionLineageRef'
]);
const EFFECT_FIELDS = Object.freeze([
  'commandExecuted',
  'actionExecuted',
  'modelTurnCreated',
  'modelToolInvoked',
  'navigationEffect',
  'journeyEffect',
  'persistenceEffect',
  'memoryWritten',
  'networkEffect'
]);

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const clone = (value) => value == null ? value : structuredClone(value);

function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])
    ));
  }
  return value;
}

function uniqueStrings(value, label) {
  if (!Array.isArray(value) || value.some((item) => !nonempty(item)) ||
      new Set(value).size !== value.length) {
    throw new TypeError(`${label} must contain unique non-empty refs`);
  }
  return [...value];
}

function guidanceTargetBindingProjection(bindingOrNull) {
  if (bindingOrNull === null) return null;
  return freezeDeep({
    targetRef: bindingOrNull.targetRef,
    targetKind: bindingOrNull.targetKind,
    screenRefOrNull: bindingOrNull.screenRefOrNull,
    regionRefOrNull: bindingOrNull.regionRefOrNull,
    componentRefOrNull: bindingOrNull.componentRefOrNull,
    slotRefOrNull: bindingOrNull.slotRefOrNull,
    instanceRefOrNull: bindingOrNull.instanceRefOrNull,
    entityRefOrNull: bindingOrNull.entityRefOrNull,
    selectionRefOrNull: bindingOrNull.selectionRefOrNull,
    bindingPolicy: bindingOrNull.bindingPolicy
  });
}

function acceptedHelpCommandBinding(binding) {
  if (!object(binding)) throw new TypeError('one Experience Foundation Help CommandBinding is required');
  if (binding.commandRef !== DEVEX_GUIDANCE_HELP_COMMAND_REF) {
    throw new TypeError('Devex guidance projection requires command.vexlife.help');
  }
  if (binding.capabilityRef !== HELP_CAPABILITY_REF) {
    throw new TypeError('Help CommandBinding capabilityRef drifted');
  }
  if (!nonempty(binding.purpose)) throw new TypeError('Help CommandBinding purpose is required');
  if (binding.actionRefOrNull !== null || binding.processRefOrNull !== null) {
    throw new TypeError('Help CommandBinding must remain no-action and no-process');
  }
  if (!Array.isArray(binding.aliases) || binding.aliases.length !== 1 ||
      binding.aliases[0]?.literal !== HELP_ALIAS_LITERAL ||
      binding.aliases[0]?.formRef !== HELP_ALIAS_FORM_REF) {
    throw new TypeError('Help CommandBinding slash projection drifted');
  }
  return freezeDeep({
    commandRef: binding.commandRef,
    capabilityRef: binding.capabilityRef,
    purpose: binding.purpose,
    aliases: binding.aliases.map(({ literal, formRef }) => ({ literal, formRef })),
    actionRefOrNull: null,
    processRefOrNull: null
  });
}

function currentHelpProjection(helpProjection) {
  if (!object(helpProjection) || helpProjection.state !== 'CURRENT' ||
      !nonempty(helpProjection.currentFrameRef)) {
    throw new TypeError('one CURRENT Help projection is required');
  }
  if (helpProjection.effects !== false || helpProjection.memoryWritten !== false ||
      helpProjection.networkTelemetry !== false ||
      helpProjection.explicitHelpBlockedBySuppression !== false) {
    throw new TypeError('Help projection must remain explicit, no-effect and non-telemetric');
  }
  if (!Array.isArray(helpProjection.sections) || !Array.isArray(helpProjection.proposals)) {
    throw new TypeError('Help projection sections and proposals are required');
  }

  const sections = helpProjection.sections.map((section, index) => {
    if (!object(section) || !GUIDANCE_HELP_SECTION_KINDS.includes(section.sectionKind)) {
      throw new TypeError(`Help section ${index} has an unsupported sectionKind`);
    }
    const itemRefs = uniqueStrings(section.itemRefs, `Help section ${section.sectionKind} itemRefs`);
    return freezeDeep({ sectionKind: section.sectionKind, itemRefs });
  });
  const proposals = helpProjection.proposals.map((proposal) => {
    const errors = validateGuidanceProposal(proposal);
    if (errors.length) throw new TypeError(`Help proposal is invalid: ${errors[0]}`);
    if (proposal.currentFrameRef !== helpProjection.currentFrameRef) {
      throw new TypeError('Help proposal must share the Help projection currentFrameRef');
    }
    return freezeDeep({
      proposalRef: proposal.proposalRef,
      featureRef: proposal.featureRef,
      planRefOrNull: proposal.planRefOrNull,
      sourceVersionRefOrNull: proposal.sourceVersionRefOrNull,
      currentFrameRef: proposal.currentFrameRef,
      invocationClass: proposal.invocationClass,
      purposeClass: proposal.purposeClass,
      whyRelevantRefs: [...proposal.whyRelevantRefs],
      awarenessState: proposal.awarenessState,
      routeState: proposal.routeState,
      availabilityState: proposal.availabilityState,
      targetBindingOrNull: guidanceTargetBindingProjection(proposal.targetBindingOrNull),
      suggestedActionRefOrNull: proposal.suggestedActionRefOrNull,
      exposureRef: proposal.exposureRef,
      effects: false
    });
  });
  const proposalRefs = proposals.map((proposal) => proposal.proposalRef);
  if (new Set(proposalRefs).size !== proposalRefs.length) {
    throw new TypeError('Help proposal refs must be unique');
  }

  return freezeDeep({
    state: helpProjection.state,
    currentFrameRef: helpProjection.currentFrameRef,
    sections,
    proposals
  });
}

function contentAddressedSelfCapabilityFrame(frame) {
  if (!object(frame) || frame.schemaVersion !== VEX_SELF_CAPABILITY_FRAME_SCHEMA ||
      frame.truthClass !== 'BOUNDED_SOURCE_BOUND_SELF_CAPABILITY_FRAME' ||
      frame.effectAuthorityGranted !== false ||
      !nonempty(frame.selfCapabilityFrameRef) ||
      !/^[0-9a-f]{64}$/u.test(frame.semanticFingerprint ?? '')) {
    throw new TypeError('one source-bound Vex self-capability frame is required');
  }
  const { selfCapabilityFrameRef, semanticFingerprint, ...core } = frame;
  if (selfCapabilityFrameRef !== `frame.vex-self-capability.${semanticFingerprint.slice(0, 32)}` ||
      semanticHash(core) !== semanticFingerprint) {
    throw new TypeError('Vex self-capability frame content address is invalid');
  }
  if (!nonempty(frame.modelConnectionProjectionRef) || !nonempty(frame.generationRef) ||
      !object(frame.currentContext) || !object(frame.coverage) ||
      typeof frame.coverage.truncated !== 'boolean') {
    throw new TypeError('Vex self-capability frame projection/context coverage is incomplete');
  }

  const availableCapabilityRefs = uniqueStrings(
    frame.availableCapabilityRefs,
    'availableCapabilityRefs'
  );
  const unavailableCapabilityRefs = uniqueStrings(
    frame.unavailableCapabilityRefs,
    'unavailableCapabilityRefs'
  );
  const unknownCapabilityRefs = uniqueStrings(
    frame.unknownCapabilityRefs,
    'unknownCapabilityRefs'
  );
  uniqueStrings(frame.actuallyUsedRefs, 'actuallyUsedRefs');
  const currentnessRefs = uniqueStrings(frame.currentnessRefs, 'currentnessRefs');
  const sourceRefs = uniqueStrings(frame.sourceRefs, 'sourceRefs');
  const omittedRefs = uniqueStrings(frame.coverage.omittedRefs, 'coverage.omittedRefs');

  if (!Array.isArray(frame.heldCapabilityEntries)) {
    throw new TypeError('heldCapabilityEntries must be an array');
  }
  const heldCapabilityEntries = frame.heldCapabilityEntries.map((entry) => {
    if (!object(entry) || !nonempty(entry.capabilityRef) || !nonempty(entry.holdReason)) {
      throw new TypeError('heldCapabilityEntries must contain capabilityRef and holdReason');
    }
    return freezeDeep({
      capabilityRef: entry.capabilityRef,
      holdReason: entry.holdReason
    });
  });
  const heldCapabilityRefs = heldCapabilityEntries.map((entry) => entry.capabilityRef);
  if (new Set(heldCapabilityRefs).size !== heldCapabilityRefs.length) {
    throw new TypeError('held capability refs must be unique');
  }

  const stateGroups = [
    availableCapabilityRefs,
    heldCapabilityRefs,
    unavailableCapabilityRefs,
    unknownCapabilityRefs
  ];
  const allStateRefs = stateGroups.flat();
  if (new Set(allStateRefs).size !== allStateRefs.length) {
    throw new TypeError('self-capability availability groups must be disjoint');
  }

  const currentContext = {};
  for (const field of [...SAFE_CONTEXT_FIELDS, ...SENSITIVE_CONTEXT_FIELDS]) {
    const value = frame.currentContext[field] ?? null;
    if (!(value === null || nonempty(value))) {
      throw new TypeError(`Vex self-capability currentContext.${field} must be null or one ref`);
    }
    if (SAFE_CONTEXT_FIELDS.includes(field)) currentContext[field] = value;
  }

  return freezeDeep({
    selfCapabilityFrameRef,
    modelConnectionProjectionRef: frame.modelConnectionProjectionRef,
    generationRef: frame.generationRef,
    currentContext,
    availableCapabilityRefs,
    heldCapabilityEntries,
    unavailableCapabilityRefs,
    unknownCapabilityRefs,
    currentnessRefs,
    sourceRefs,
    coverage: {
      truncated: frame.coverage.truncated,
      omittedRefs
    }
  });
}

function interactionCueProjection(interactionCueOrNull, isKnownSemanticRef) {
  if (interactionCueOrNull === null) return null;
  const errors = validateInteractionCue(interactionCueOrNull, { isKnownSemanticRef });
  if (errors.length) throw new TypeError(`InteractionCue is invalid: ${errors[0]}`);
  return freezeDeep({
    cueRef: interactionCueOrNull.cueRef,
    interactionFamily: interactionCueOrNull.interactionFamily,
    intentionContentRef: interactionCueOrNull.intentionContentRef,
    routeState: interactionCueOrNull.routeState,
    availabilityState: interactionCueOrNull.availabilityState,
    actionRefOrNull: interactionCueOrNull.actionRefOrNull,
    interactionRefOrNull: interactionCueOrNull.interactionRefOrNull,
    gestureRefOrNull: interactionCueOrNull.gestureRefOrNull,
    componentRefOrNull: interactionCueOrNull.componentRefOrNull,
    slotRefOrNull: interactionCueOrNull.slotRefOrNull,
    targetBindingOrNull: guidanceTargetBindingProjection(interactionCueOrNull.targetBindingOrNull),
    effects: false,
    grantsActionAuthority: false,
    autoExecute: false,
    navigationEffect: false,
    journeyEffect: false,
    persistenceEffect: false,
    memoryWritten: false,
    networkTelemetry: false
  });
}

function availabilitySummary(proposals) {
  return freezeDeep(Object.fromEntries(
    GUIDANCE_AVAILABILITY_STATES.map((state) => [
      state,
      proposals
        .filter((proposal) => proposal.availabilityState === state)
        .map((proposal) => proposal.proposalRef)
        .sort()
    ])
  ));
}

function targetBindings(proposals) {
  return freezeDeep(proposals
    .filter((proposal) => proposal.targetBindingOrNull !== null)
    .map((proposal) => ({
      proposalRef: proposal.proposalRef,
      targetBinding: clone(proposal.targetBindingOrNull)
    }))
    .sort((left, right) => left.proposalRef.localeCompare(right.proposalRef)));
}

function noEffects() {
  return freezeDeep(Object.fromEntries(EFFECT_FIELDS.map((field) => [field, false])));
}

export function projectGuidanceForDevex({
  commandBinding,
  helpProjection,
  selfCapabilityFrame,
  interactionCueOrNull = null,
  isKnownSemanticRef = null
} = {}) {
  const command = acceptedHelpCommandBinding(commandBinding);
  const guidance = currentHelpProjection(helpProjection);
  const selfCapabilityContext = contentAddressedSelfCapabilityFrame(selfCapabilityFrame);
  const interactionCue = interactionCueProjection(interactionCueOrNull, isKnownSemanticRef);

  const core = {
    schemaVersion: DEVEX_GUIDANCE_PROJECTION_SCHEMA,
    truthClass: 'SOURCE_BOUND_READ_ONLY_GUIDANCE_PERCEPTION',
    audienceClasses: ['VEX', 'DEVEX'],
    commandProjection: {
      ...command,
      permissionGranted: false,
      executionRequested: false,
      executionPerformed: false,
      modelTurnCreated: false,
      modelToolFormed: false
    },
    currentGuidance: {
      state: guidance.state,
      currentFrameRef: guidance.currentFrameRef,
      sections: guidance.sections,
      proposals: guidance.proposals,
      interactionCueOrNull: interactionCue,
      availabilitySummary: availabilitySummary(guidance.proposals),
      targetBindings: targetBindings(guidance.proposals)
    },
    selfCapabilityContext,
    boundaries: {
      humanGuidanceIsModelAuthority: false,
      guidanceRelevanceGrantsCommandPermission: false,
      interactionCueGrantsActionAuthority: false,
      modelToolFormGrantsSemanticAction: false,
      privateHumanMemoryProjected: false
    },
    effects: false,
    authorityGranted: false,
    effectEvidence: noEffects()
  };
  const semanticFingerprint = semanticHash(core);
  return freezeDeep({
    ...core,
    projectionRef: `projection.vexlife.devex-guidance.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

// [VXG RealForever][EFX-01E]
