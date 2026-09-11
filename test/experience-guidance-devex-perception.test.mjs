import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildGuidanceProposal,
  buildHelpProjection,
  buildInteractionCue
} from '../src/core/experience-guidance.mjs';
import {
  DEVEX_GUIDANCE_HELP_COMMAND_REF,
  DEVEX_GUIDANCE_PROJECTION_SCHEMA,
  projectGuidanceForDevex
} from '../src/core/devex-guidance-projection.mjs';
import { VEX_SELF_CAPABILITY_FRAME_SCHEMA } from '../src/core/vex-self-capability-frame.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const experienceFoundation = JSON.parse(fs.readFileSync(
  new URL('../blueprint/experience-foundation.json', import.meta.url),
  'utf8'
));
const helpCommandBinding = experienceFoundation.commandBindings.find(
  (binding) => binding.commandRef === DEVEX_GUIDANCE_HELP_COMMAND_REF
);

const targetBinding = Object.freeze({
  targetRef: 'element.terrain.reset',
  targetKind: 'ELEMENT',
  screenRefOrNull: 'screen.vexlife.terrain',
  regionRefOrNull: null,
  componentRefOrNull: null,
  slotRefOrNull: null,
  instanceRefOrNull: null,
  entityRefOrNull: null,
  selectionRefOrNull: null,
  bindingPolicy: 'STATIC_CANONICAL_TARGET'
});

const availableProposal = buildGuidanceProposal({
  proposalRef: 'proposal.efx01e.current.terrain-reset',
  featureRef: 'feature.vexlife.terrain',
  currentFrameRef: 'frame.browser.screen.vexlife.terrain.route.terrain.terrain.project.root-hub',
  invocationClass: 'EXPLICIT_HELP',
  purposeClass: 'EXPLORE',
  whyRelevantRefs: ['reason.current-screen.terrain'],
  awarenessState: 'OFFERED_THIS_SESSION',
  routeState: 'CURRENT',
  availabilityState: 'AVAILABLE',
  exposureRef: 'exposure.vexlife.contextual',
  targetBindingOrNull: targetBinding,
  suggestedActionRefOrNull: 'action.terrain.layout.reset'
});

const availableHelp = buildHelpProjection({
  currentFrameRef: availableProposal.currentFrameRef,
  sections: [
    {
      sectionKind: 'WHAT_CAN_I_DO_HERE',
      itemRefs: ['screen.vexlife.terrain']
    },
    {
      sectionKind: 'SHOW_ME_HOW',
      itemRefs: ['element.terrain.reset']
    }
  ],
  proposals: [availableProposal]
});

const knownCueRefs = new Set([
  'gesture.vexlife.terrain-pan',
  'action.terrain.canvas.pan'
]);
const panCue = buildInteractionCue({
  cueRef: 'cue.efx01e.terrain-pan',
  interactionFamily: 'PAN',
  intentionContentRef: 'gesture.terrain-pan.help',
  routeState: 'CURRENT',
  availabilityState: 'AVAILABLE',
  actionRefOrNull: 'action.terrain.canvas.pan',
  gestureRefOrNull: 'gesture.vexlife.terrain-pan',
  targetBindingOrNull: null
}, {
  isKnownSemanticRef: (ref) => knownCueRefs.has(ref)
});

function makeSelfCapabilityFrame(overrides = {}) {
  const base = {
    schemaVersion: VEX_SELF_CAPABILITY_FRAME_SCHEMA,
    truthClass: 'BOUNDED_SOURCE_BOUND_SELF_CAPABILITY_FRAME',
    modelConnectionProjectionRef: 'projection.vexlife.model-connection.0123456789abcdef0123456789abcdef',
    generationRef: 'generation.vexlife.model.test',
    modelBundleRef: 'model-bundle.vexlife.test',
    operationalProfileRef: 'profile.vexlife.test',
    runtimeCapabilityProfileRef: 'runtime-profile.vexlife.test',
    currentContext: {
      homeRef: 'home.private.test',
      deviceRef: 'device.private.test',
      companionLineageRef: 'lineage.private.test',
      projectRef: 'project.vexlife.root-hub',
      threadRef: 'thread.root-hub.welcome',
      channelRef: 'channel.root-hub.welcome.root',
      screenRef: 'screen.vexlife.terrain',
      selectedNodeRef: 'terrain.project.root-hub'
    },
    capabilityEntries: [],
    availableCapabilityRefs: ['capability.vexlife.navigation'],
    heldCapabilityEntries: [{
      capabilityRef: 'capability.vexlife.model.provision',
      holdReason: 'CANONICAL_STAGE_REQUESTABLE',
      bindingRefs: [],
      requiredRuntimeCellRefs: []
    }],
    unavailableCapabilityRefs: ['capability.vexlife.unavailable-fixture'],
    unknownCapabilityRefs: ['capability.vexlife.unknown-fixture'],
    actuallyUsedRefs: [],
    runtimeCapability: {
      availableCellRefs: [],
      heldCellEntries: [],
      unavailableCellRefs: [],
      unknownCellRefs: []
    },
    currentnessRefs: ['accepted-main.edc99b3f175b787ed2abba313ca3ba7b446180da'],
    sourceRefs: [
      'registry.vexlife.capabilities.001',
      'registry.vexlife.model-connection-bindings.001'
    ],
    coverage: {
      sourceRefs: [
        'registry.vexlife.capabilities.001',
        'registry.vexlife.model-connection-bindings.001'
      ],
      tokenBudget: 1200,
      usedTokens: 300,
      omittedRefs: ['capability.vexlife.omitted-fixture'],
      omissionReasons: ['TOKEN_BUDGET'],
      truncated: true
    },
    effectAuthorityGranted: false,
    formedAt: '2026-09-10T00:00:00.000Z'
  };
  const core = {
    ...base,
    ...structuredClone(overrides),
    currentContext: {
      ...base.currentContext,
      ...(overrides.currentContext ?? {})
    },
    coverage: {
      ...base.coverage,
      ...(overrides.coverage ?? {})
    }
  };
  const semanticFingerprint = semanticHash(core);
  return Object.freeze({
    ...core,
    selfCapabilityFrameRef: `frame.vex-self-capability.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function project(overrides = {}) {
  return projectGuidanceForDevex({
    commandBinding: helpCommandBinding,
    helpProjection: availableHelp,
    selfCapabilityFrame: makeSelfCapabilityFrame(),
    interactionCueOrNull: panCue,
    isKnownSemanticRef: (ref) => knownCueRefs.has(ref),
    ...overrides
  });
}

test('EFX01E-01 consumes the accepted /help CommandBinding without granting command permission', () => {
  assert.ok(helpCommandBinding, 'accepted command.vexlife.help binding is missing');
  const projection = project();
  assert.equal(projection.schemaVersion, DEVEX_GUIDANCE_PROJECTION_SCHEMA);
  assert.equal(projection.truthClass, 'SOURCE_BOUND_READ_ONLY_GUIDANCE_PERCEPTION');
  assert.equal(projection.commandProjection.commandRef, 'command.vexlife.help');
  assert.equal(projection.commandProjection.capabilityRef, 'help.render');
  assert.deepEqual(
    projection.commandProjection.aliases,
    [{ literal:'/help', formRef:'form.vexlife.operator.slash-alias' }]
  );
  assert.equal(projection.commandProjection.actionRefOrNull, null);
  assert.equal(projection.commandProjection.processRefOrNull, null);
  assert.equal(projection.commandProjection.permissionGranted, false);
  assert.equal(projection.commandProjection.executionRequested, false);
  assert.equal(projection.commandProjection.executionPerformed, false);
});

test('EFX01E-02 exposes current Help sections, proposal availability and exact target binding', () => {
  const projection = project();
  assert.equal(projection.currentGuidance.state, 'CURRENT');
  assert.equal(projection.currentGuidance.currentFrameRef, availableProposal.currentFrameRef);
  assert.deepEqual(
    projection.currentGuidance.sections.map((section) => section.sectionKind),
    ['WHAT_CAN_I_DO_HERE', 'SHOW_ME_HOW']
  );
  assert.deepEqual(
    projection.currentGuidance.availabilitySummary.AVAILABLE,
    [availableProposal.proposalRef]
  );
  assert.deepEqual(projection.currentGuidance.availabilitySummary.HELD, []);
  assert.deepEqual(projection.currentGuidance.targetBindings, [{
    proposalRef: availableProposal.proposalRef,
    targetBinding
  }]);
  assert.equal(
    projection.currentGuidance.proposals[0].suggestedActionRefOrNull,
    'action.terrain.layout.reset'
  );
  assert.equal(projection.authorityGranted, false);
  assert.equal(projection.effectEvidence.actionExecuted, false);
});

test('EFX01E-03 preserves one accepted InteractionCue as perception rather than action authority', () => {
  const projection = project();
  const cue = projection.currentGuidance.interactionCueOrNull;
  assert.equal(cue.cueRef, panCue.cueRef);
  assert.equal(cue.interactionFamily, 'PAN');
  assert.equal(cue.gestureRefOrNull, 'gesture.vexlife.terrain-pan');
  assert.equal(cue.actionRefOrNull, 'action.terrain.canvas.pan');
  assert.equal(cue.effects, false);
  assert.equal(cue.grantsActionAuthority, false);
  assert.equal(cue.autoExecute, false);
  assert.equal(projection.boundaries.interactionCueGrantsActionAuthority, false);
});

test('EFX01E-04 consumes bounded self-capability truth while excluding private Human context', () => {
  const projection = project();
  const context = projection.selfCapabilityContext;
  assert.equal(context.currentContext.projectRef, 'project.vexlife.root-hub');
  assert.equal(context.currentContext.screenRef, 'screen.vexlife.terrain');
  assert.equal(context.currentContext.selectedNodeRef, 'terrain.project.root-hub');
  for (const forbidden of ['homeRef', 'deviceRef', 'companionLineageRef']) {
    assert.equal(Object.hasOwn(context.currentContext, forbidden), false);
  }
  assert.deepEqual(context.availableCapabilityRefs, ['capability.vexlife.navigation']);
  assert.deepEqual(context.heldCapabilityEntries, [{
    capabilityRef: 'capability.vexlife.model.provision',
    holdReason: 'CANONICAL_STAGE_REQUESTABLE'
  }]);
  assert.deepEqual(context.unavailableCapabilityRefs, ['capability.vexlife.unavailable-fixture']);
  assert.deepEqual(context.unknownCapabilityRefs, ['capability.vexlife.unknown-fixture']);
  assert.equal(context.coverage.truncated, true);
  assert.deepEqual(context.coverage.omittedRefs, ['capability.vexlife.omitted-fixture']);
  assert.equal(projection.boundaries.privateHumanMemoryProjected, false);
});

test('EFX01E-05 fails closed when the Help CommandBinding drifts into action, process or another alias', () => {
  for (const replacement of [
    { actionRefOrNull:'action.unowned' },
    { processRefOrNull:'process.unowned' },
    { capabilityRef:'capability.vexlife.cli.typed' },
    { aliases:[{ literal:'/execute', formRef:'form.vexlife.operator.slash-alias' }] }
  ]) {
    assert.throws(() => project({
      commandBinding: { ...structuredClone(helpCommandBinding), ...replacement }
    }), /Help CommandBinding|slash projection|command\.vexlife\.help/);
  }
});

test('EFX01E-06 rejects a self-capability frame whose content changed after addressing', () => {
  const frame = structuredClone(makeSelfCapabilityFrame());
  frame.currentContext.projectRef = 'project.vexlife.tampered';
  assert.throws(() => project({ selfCapabilityFrame:frame }), /content address is invalid/);
});

test('EFX01E-07 rejects an InteractionCue whose semantic owner is not known to the consumer', () => {
  assert.throws(() => project({
    isKnownSemanticRef: () => false
  }), /InteractionCue is invalid: interaction cue unresolved/);
});

test('EFX01E-08 keeps HELD and UNAVAILABLE guidance distinct and non-runnable', () => {
  const held = buildGuidanceProposal({
    proposalRef: 'proposal.efx01e.held',
    featureRef: 'feature.vexlife.held-fixture',
    currentFrameRef: availableProposal.currentFrameRef,
    invocationClass: 'EXPLICIT_HELP',
    purposeClass: 'LEARN',
    whyRelevantRefs: ['reason.held-fixture'],
    awarenessState: 'OFFERED_THIS_SESSION',
    routeState: 'CURRENT',
    availabilityState: 'HELD',
    exposureRef: 'exposure.vexlife.contextual',
    targetBindingOrNull: null,
    suggestedActionRefOrNull: null
  });
  const unavailable = buildGuidanceProposal({
    proposalRef: 'proposal.efx01e.unavailable',
    featureRef: 'feature.vexlife.unavailable-fixture',
    currentFrameRef: availableProposal.currentFrameRef,
    invocationClass: 'EXPLICIT_HELP',
    purposeClass: 'LEARN',
    whyRelevantRefs: ['reason.unavailable-fixture'],
    awarenessState: 'OFFERED_THIS_SESSION',
    routeState: 'CURRENT',
    availabilityState: 'UNAVAILABLE',
    exposureRef: 'exposure.vexlife.contextual',
    targetBindingOrNull: null,
    suggestedActionRefOrNull: null
  });
  const helpProjection = buildHelpProjection({
    currentFrameRef: availableProposal.currentFrameRef,
    sections: [{ sectionKind:'WHY_UNAVAILABLE', itemRefs:['reason.held-fixture'] }],
    proposals: [held, unavailable]
  });
  const projection = project({ helpProjection, interactionCueOrNull:null });
  assert.deepEqual(projection.currentGuidance.availabilitySummary.HELD, [held.proposalRef]);
  assert.deepEqual(
    projection.currentGuidance.availabilitySummary.UNAVAILABLE,
    [unavailable.proposalRef]
  );
  assert.ok(projection.currentGuidance.proposals.every(
    (proposal) => proposal.suggestedActionRefOrNull === null
  ));
  assert.equal(projection.commandProjection.permissionGranted, false);
  assert.equal(projection.effectEvidence.commandExecuted, false);
});

test('EFX01E-09 strips unregistered fields from guidance, target, cue and self-capability input', () => {
  const hostileProposal = {
    ...structuredClone(availableProposal),
    privateHumanMemory: { ref:'memory.private.should-not-cross' },
    targetBindingOrNull: {
      ...structuredClone(targetBinding),
      rawHumanContent: 'must-not-cross'
    }
  };
  const hostileHelp = {
    ...structuredClone(availableHelp),
    privateHumanMemory: { ref:'memory.private.help' },
    proposals: [hostileProposal]
  };
  const hostileCue = {
    ...structuredClone(panCue),
    rawProviderReasoning: 'must-not-cross'
  };
  const hostileSelfFrame = makeSelfCapabilityFrame({
    privateHumanMemory: { ref:'memory.private.self-frame' }
  });

  const projection = project({
    helpProjection: hostileHelp,
    interactionCueOrNull: hostileCue,
    selfCapabilityFrame: hostileSelfFrame
  });

  assert.equal(Object.hasOwn(projection.currentGuidance.proposals[0], 'privateHumanMemory'), false);
  assert.equal(
    Object.hasOwn(projection.currentGuidance.proposals[0].targetBindingOrNull, 'rawHumanContent'),
    false
  );
  assert.equal(
    Object.hasOwn(projection.currentGuidance.interactionCueOrNull, 'rawProviderReasoning'),
    false
  );
  assert.equal(Object.hasOwn(projection.selfCapabilityContext, 'privateHumanMemory'), false);
});

test('EFX01E-10 is deterministic, deeply immutable and performs no model/tool/Memory/network effect', () => {
  const first = project();
  const second = project();
  assert.equal(first.semanticFingerprint, second.semanticFingerprint);
  assert.equal(first.projectionRef, second.projectionRef);
  assert.match(first.semanticFingerprint, /^[0-9a-f]{64}$/u);
  assert.ok(Object.values(first.effectEvidence).every((value) => value === false));
  assert.equal(first.effects, false);
  assert.equal(first.commandProjection.modelTurnCreated, false);
  assert.equal(first.commandProjection.modelToolFormed, false);
  assert.equal(first.boundaries.humanGuidanceIsModelAuthority, false);
  assert.equal(first.boundaries.guidanceRelevanceGrantsCommandPermission, false);
  assert.equal(first.boundaries.modelToolFormGrantsSemanticAction, false);
  assert.throws(() => {
    first.currentGuidance.sections[0].itemRefs.push('hostile.ref');
  }, TypeError);
});

// [VXG RealForever][EFX-01E]
