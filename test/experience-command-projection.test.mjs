import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildGuidanceProposal,
  buildHelpProjection
} from '../src/core/experience-guidance.mjs';
import {
  EXPERIENCE_COMMAND_MODEL_TOOL_FORM_REF,
  EXPERIENCE_COMMAND_PROJECTION_SCHEMA,
  EXPERIENCE_COMMAND_SLASH_FORM_REF,
  projectExperienceCommand
} from '../src/core/experience-command-projection.mjs';
import { VEX_SELF_CAPABILITY_FRAME_SCHEMA } from '../src/core/vex-self-capability-frame.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const experienceFoundation = JSON.parse(fs.readFileSync(
  new URL('../blueprint/experience-foundation.json', import.meta.url),
  'utf8'
));

const currentFrameRef = 'frame.browser.screen.vexlife.terrain.route.terrain';
const helpProposal = buildGuidanceProposal({
  proposalRef: 'proposal.efx02.current.terrain-help',
  featureRef: 'feature.vexlife.terrain',
  currentFrameRef,
  invocationClass: 'EXPLICIT_HELP',
  purposeClass: 'EXPLORE',
  whyRelevantRefs: ['reason.current-screen.terrain'],
  awarenessState: 'OFFERED_THIS_SESSION',
  routeState: 'CURRENT',
  availabilityState: 'AVAILABLE',
  targetBindingOrNull: null,
  suggestedActionRefOrNull: null,
  exposureRef: 'exposure.vexlife.contextual'
});
const helpProjection = buildHelpProjection({
  currentFrameRef,
  sections: [{
    sectionKind: 'WHAT_CAN_I_DO_HERE',
    itemRefs: ['screen.vexlife.terrain']
  }],
  proposals: [helpProposal]
});

function makeSelfCapabilityFrame(overrides = {}) {
  const base = {
    schemaVersion: VEX_SELF_CAPABILITY_FRAME_SCHEMA,
    truthClass: 'BOUNDED_SOURCE_BOUND_SELF_CAPABILITY_FRAME',
    modelConnectionProjectionRef: 'projection.vexlife.model-connection.efx02',
    generationRef: 'generation.vexlife.efx02.fixture',
    currentContext: {
      projectRef: 'project.vexlife.root-hub',
      threadRef: null,
      channelRef: null,
      screenRef: 'screen.vexlife.terrain',
      selectedNodeRef: null,
      homeRef: 'home.private.must-not-cross',
      deviceRef: 'device.private.must-not-cross',
      companionLineageRef: 'lineage.private.must-not-cross'
    },
    availableCapabilityRefs: ['help.render'],
    heldCapabilityEntries: [],
    unavailableCapabilityRefs: [],
    unknownCapabilityRefs: [],
    actuallyUsedRefs: [],
    currentnessRefs: ['accepted-main.5211866b873c0fc65cc26bbd527a8604d4e2adc2'],
    sourceRefs: ['source.blueprint.experience-foundation'],
    coverage: {
      truncated: false,
      omittedRefs: []
    },
    effectAuthorityGranted: false
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

function helpContext(overrides = {}) {
  return {
    helpProjection,
    selfCapabilityFrame: makeSelfCapabilityFrame(),
    interactionCueOrNull: null,
    ...overrides
  };
}

function slash(classification, {
  foundation = experienceFoundation,
  help = null,
  requestOverrides = {}
} = {}) {
  return projectExperienceCommand({
    experienceFoundation: foundation,
    request: {
      kind: 'CLASSIFIER_RECEIPT',
      classification,
      ...requestOverrides
    },
    helpContextOrNull: help
  });
}

function modelTool(commandRef, {
  foundation = experienceFoundation,
  help = null,
  requestOverrides = {}
} = {}) {
  return projectExperienceCommand({
    experienceFoundation: foundation,
    request: {
      kind: 'MODEL_TOOL_REQUEST',
      commandRef,
      ...requestOverrides
    },
    helpContextOrNull: help
  });
}

test('EFX02-01 resolves a KNOWN_COMMAND receipt to one exact accepted CommandBinding', () => {
  const projection = slash({
    kind: 'KNOWN_COMMAND',
    command: '/where',
    suggestion: null
  });

  assert.equal(projection.schemaVersion, EXPERIENCE_COMMAND_PROJECTION_SCHEMA);
  assert.equal(projection.truthClass, 'SOURCE_BOUND_NO_EFFECT_COMMAND_PROJECTION');
  assert.equal(projection.routeDisposition, 'REGISTERED_COMMAND_PROJECTED');
  assert.equal(projection.commandProjectionOrNull.commandRef, 'command.vexlife.where');
  assert.equal(projection.commandProjectionOrNull.capabilityRef, 'context.where');
  assert.equal(
    projection.commandProjectionOrNull.projectedFormRef,
    EXPERIENCE_COMMAND_SLASH_FORM_REF
  );
  assert.equal(projection.commandProjectionOrNull.projectedLiteralOrNull, '/where');
  assert.equal(projection.commandProjectionOrNull.actionRefOrNull, null);
  assert.equal(projection.commandProjectionOrNull.processRefOrNull, null);
  assert.equal(projection.commandProjectionOrNull.permissionGranted, false);
  assert.equal(projection.commandProjectionOrNull.executionRequested, false);
});

test('EFX02-02 consumes classifier receipts and rejects raw text or a classifier function', () => {
  for (const requestOverrides of [
    { input: '/where' },
    { text: '/where' },
    { rawText: '/where' },
    { message: '/where' },
    { classifier: () => ({ kind:'KNOWN_COMMAND', command:'/where', suggestion:null }) }
  ]) {
    assert.throws(() => slash({
      kind: 'KNOWN_COMMAND',
      command: '/where',
      suggestion: null
    }, { requestOverrides }), /cannot contain|unsupported field/);
  }
});

test('EFX02-03 rejects an unknown slash command locally without waking a model', () => {
  const projection = slash({
    kind: 'UNKNOWN_COMMAND',
    command: '/hep',
    suggestion: '/help'
  });

  assert.equal(projection.routeDisposition, 'LOCAL_REJECT_UNKNOWN_COMMAND');
  assert.equal(projection.commandProjectionOrNull, null);
  assert.equal(projection.guidanceProjectionOrNull, null);
  assert.equal(projection.inputProjection.formProjectionOrNull.formRef, EXPERIENCE_COMMAND_SLASH_FORM_REF);
  assert.deepEqual(projection.suggestionProjectionOrNull, {
    literal: '/help',
    commandRef: 'command.vexlife.help',
    capabilityRef: 'help.render',
    permissionGranted: false,
    executionRequested: false
  });
  assert.equal(projection.boundaries.unknownCommandCreatesModelTurn, false);
  assert.equal(projection.effectEvidence.modelTurnRequested, false);
  assert.equal(projection.effectEvidence.modelTurnCreated, false);
});

test('EFX02-04 keeps NOT_COMMAND outside command routing without granting ordinary-message authority', () => {
  const projection = slash({
    kind: 'NOT_COMMAND',
    command: null,
    suggestion: null
  });

  assert.equal(projection.routeDisposition, 'NOT_COMMAND');
  assert.equal(projection.commandProjectionOrNull, null);
  assert.equal(projection.suggestionProjectionOrNull, null);
  assert.equal(projection.inputProjection.formProjectionOrNull, null);
  assert.equal(projection.inputProjection.literalOrNull, null);
  assert.equal(projection.boundaries.notCommandGrantsOrdinaryMessageAuthority, false);
  assert.equal(projection.effectEvidence.modelTurnRequested, false);
});

test('EFX02-05 composes the accepted EFX-01E guidance projection only for /help', () => {
  const projection = slash({
    kind: 'KNOWN_COMMAND',
    command: '/help',
    suggestion: null
  }, { help: helpContext() });

  assert.equal(projection.commandProjectionOrNull.commandRef, 'command.vexlife.help');
  assert.equal(projection.commandProjectionOrNull.capabilityRef, 'help.render');
  assert.equal(
    projection.guidanceProjectionOrNull.truthClass,
    'SOURCE_BOUND_READ_ONLY_GUIDANCE_PERCEPTION'
  );
  assert.equal(
    projection.guidanceProjectionOrNull.commandProjection.commandRef,
    'command.vexlife.help'
  );
  assert.equal(
    projection.guidanceProjectionOrNull.currentGuidance.currentFrameRef,
    currentFrameRef
  );
  assert.equal(
    Object.hasOwn(
      projection.guidanceProjectionOrNull.selfCapabilityContext.currentContext,
      'homeRef'
    ),
    false
  );
});

test('EFX02-06 projects model-tool /help through the same semantic command and guidance owner', () => {
  const slashProjection = slash({
    kind: 'KNOWN_COMMAND',
    command: '/help',
    suggestion: null
  }, { help: helpContext() });
  const toolProjection = modelTool('command.vexlife.help', { help: helpContext() });

  assert.equal(toolProjection.commandProjectionOrNull.commandRef, slashProjection.commandProjectionOrNull.commandRef);
  assert.equal(toolProjection.commandProjectionOrNull.capabilityRef, slashProjection.commandProjectionOrNull.capabilityRef);
  assert.equal(toolProjection.commandProjectionOrNull.projectedFormRef, EXPERIENCE_COMMAND_MODEL_TOOL_FORM_REF);
  assert.equal(toolProjection.commandProjectionOrNull.projectedLiteralOrNull, null);
  assert.equal(toolProjection.inputProjection.classifierReceiptOrNull, null);
  assert.equal(toolProjection.guidanceProjectionOrNull.currentGuidance.currentFrameRef, currentFrameRef);
  assert.equal(toolProjection.boundaries.modelToolFormGrantsSemanticAction, false);
  assert.equal(toolProjection.effectEvidence.modelToolInvoked, false);
});

test('EFX02-07 slash and model-tool forms preserve one non-help command identity', () => {
  const slashProjection = slash({
    kind: 'KNOWN_COMMAND',
    command: '/search',
    suggestion: null
  });
  const toolProjection = modelTool('command.vexlife.search');

  assert.equal(slashProjection.commandProjectionOrNull.commandRef, 'command.vexlife.search');
  assert.equal(toolProjection.commandProjectionOrNull.commandRef, 'command.vexlife.search');
  assert.equal(slashProjection.commandProjectionOrNull.capabilityRef, 'capability.search');
  assert.equal(toolProjection.commandProjectionOrNull.capabilityRef, 'capability.search');
  assert.notEqual(
    slashProjection.commandProjectionOrNull.projectedFormRef,
    toolProjection.commandProjectionOrNull.projectedFormRef
  );
  assert.equal(slashProjection.authorityGranted, false);
  assert.equal(toolProjection.authorityGranted, false);
});

test('EFX02-08 fails closed if a CommandBinding gains action or process authority', () => {
  for (const replacement of [
    { actionRefOrNull: 'action.unowned' },
    { processRefOrNull: 'process.unowned' }
  ]) {
    const foundation = structuredClone(experienceFoundation);
    Object.assign(
      foundation.commandBindings.find((binding) => binding.commandRef === 'command.vexlife.where'),
      replacement
    );
    assert.throws(() => slash({
      kind: 'KNOWN_COMMAND',
      command: '/where',
      suggestion: null
    }, { foundation }), /no-action and no-process/);
  }
});

test('EFX02-09 rejects duplicate command, alias, and operator-form ownership', () => {
  const duplicateCommand = structuredClone(experienceFoundation);
  duplicateCommand.commandBindings.push(structuredClone(duplicateCommand.commandBindings[0]));
  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/where',
    suggestion: null
  }, { foundation: duplicateCommand }), /duplicate CommandBinding/);

  const duplicateAlias = structuredClone(experienceFoundation);
  duplicateAlias.commandBindings[1].aliases[0].literal = duplicateAlias.commandBindings[0].aliases[0].literal;
  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/where',
    suggestion: null
  }, { foundation: duplicateAlias }), /duplicate command alias/);

  const duplicateForm = structuredClone(experienceFoundation);
  duplicateForm.interactionForms.push(structuredClone(
    duplicateForm.interactionForms.find((form) => form.formRef === EXPERIENCE_COMMAND_SLASH_FORM_REF)
  ));
  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/where',
    suggestion: null
  }, { foundation: duplicateForm }), /duplicate interaction form/);
});

test('EFX02-10 rejects malformed or authority-smuggling classifier receipts', () => {
  for (const classification of [
    { kind:'OTHER', command:'/where', suggestion:null },
    { kind:'NOT_COMMAND', command:'/where', suggestion:null },
    { kind:'KNOWN_COMMAND', command:'/where', suggestion:'/help' },
    { kind:'KNOWN_COMMAND', command:'/where now', suggestion:null },
    { kind:'UNKNOWN_COMMAND', command:'/wat', suggestion:'help' },
    { kind:'KNOWN_COMMAND', command:'/where', suggestion:null, permissionGranted:true },
    { kind:'UNKNOWN_COMMAND', command:'/wat', suggestion:null, privateHumanMemory:'secret' }
  ]) {
    assert.throws(
      () => slash(classification),
      /classifier receipt|receipt command|suggestion|unsupported/
    );
  }
});

test('EFX02-11 rejects aliases, suggestions, and command refs absent from accepted source', () => {
  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/unregistered',
    suggestion: null
  }), /KNOWN_COMMAND alias is not registered/);

  assert.throws(() => slash({
    kind: 'UNKNOWN_COMMAND',
    command: '/wat',
    suggestion: '/unregistered'
  }), /suggestion is not an accepted command alias/);

  assert.throws(
    () => modelTool('command.vexlife.unregistered'),
    /commandRef is not registered/
  );
});

test('EFX02-12 keeps Help context exact and rejects it for every non-help route', () => {
  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/help',
    suggestion: null
  }), /requires one current Help context/);

  assert.throws(() => modelTool('command.vexlife.help'), /requires one current Help context/);

  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/where',
    suggestion: null
  }, { help: helpContext() }), /allowed only for command\.vexlife\.help/);

  assert.throws(() => slash({
    kind: 'UNKNOWN_COMMAND',
    command: '/hep',
    suggestion: '/help'
  }, { help: helpContext() }), /allowed only for command\.vexlife\.help/);

  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/help',
    suggestion: null
  }, {
    help: helpContext({ privateHumanMemory:'must-not-cross' })
  }), /Help context contains unsupported field/);
});

test('EFX02-13 whitelists accepted source fields and never projects private extras', () => {
  const foundation = structuredClone(experienceFoundation);
  foundation.privateHumanMemory = { ref:'memory.private.foundation' };
  foundation.commandBindings.find(
    (binding) => binding.commandRef === 'command.vexlife.where'
  ).providerReasoning = 'must-not-cross';

  const projection = slash({
    kind: 'KNOWN_COMMAND',
    command: '/where',
    suggestion: null
  }, { foundation });

  assert.equal(Object.hasOwn(projection.foundationProjection, 'privateHumanMemory'), false);
  assert.equal(Object.hasOwn(projection.commandProjectionOrNull, 'providerReasoning'), false);
  assert.equal(JSON.stringify(projection).includes('must-not-cross'), false);
});

test('EFX02-14 pins the canonical Foundation source, command owners, aliases, and operator forms', () => {
  for (const [field, replacement] of [
    ['foundationRef', 'foundation.vexlife.experience.forged'],
    ['foundationVersion', 2],
    ['sourceRef', 'source.blueprint.forged'],
    ['sourcePath', 'blueprint/forged.json']
  ]) {
    const foundation = structuredClone(experienceFoundation);
    foundation[field] = replacement;
    assert.throws(() => slash({
      kind: 'KNOWN_COMMAND',
      command: '/where',
      suggestion: null
    }, { foundation }), /canonical source identity drifted/);
  }

  const unacceptedCommand = structuredClone(experienceFoundation);
  unacceptedCommand.commandBindings.push({
    commandRef: 'command.vexlife.unaccepted',
    purpose: 'Structurally plausible but not accepted source.',
    capabilityRef: 'capability.unaccepted',
    actionRefOrNull: null,
    processRefOrNull: null,
    aliases: [{
      literal: '/unaccepted',
      formRef: EXPERIENCE_COMMAND_SLASH_FORM_REF
    }]
  });
  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/unaccepted',
    suggestion: null
  }, { foundation: unacceptedCommand }), /accepted command owner set drifted/);

  const capabilityDrift = structuredClone(experienceFoundation);
  capabilityDrift.commandBindings.find(
    (binding) => binding.commandRef === 'command.vexlife.where'
  ).capabilityRef = 'capability.unaccepted';
  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/where',
    suggestion: null
  }, { foundation: capabilityDrift }), /CommandBinding owner drifted/);

  const aliasDrift = structuredClone(experienceFoundation);
  aliasDrift.commandBindings.find(
    (binding) => binding.commandRef === 'command.vexlife.where'
  ).aliases[0].literal = '/elsewhere';
  assert.throws(() => slash({
    kind: 'KNOWN_COMMAND',
    command: '/elsewhere',
    suggestion: null
  }, { foundation: aliasDrift }), /CommandBinding owner drifted/);

  const formPlatformDrift = structuredClone(experienceFoundation);
  formPlatformDrift.interactionForms.find(
    (form) => form.formRef === EXPERIENCE_COMMAND_MODEL_TOOL_FORM_REF
  ).platformRefs.push('platform.ios');
  assert.throws(() => modelTool('command.vexlife.where', {
    foundation: formPlatformDrift
  }), /MODEL_TOOL platformRefs drifted/);
});

test('EFX02-15 is deterministic, deeply immutable, content-addressed, and performs no effect', () => {
  const first = slash({
    kind: 'KNOWN_COMMAND',
    command: '/help',
    suggestion: null
  }, { help: helpContext() });
  const second = slash({
    kind: 'KNOWN_COMMAND',
    command: '/help',
    suggestion: null
  }, { help: helpContext() });

  assert.deepEqual(first, second);
  assert.equal(first.semanticFingerprint, semanticHash({
    schemaVersion: first.schemaVersion,
    truthClass: first.truthClass,
    audienceClasses: first.audienceClasses,
    foundationProjection: first.foundationProjection,
    inputProjection: first.inputProjection,
    routeDisposition: first.routeDisposition,
    commandProjectionOrNull: first.commandProjectionOrNull,
    suggestionProjectionOrNull: first.suggestionProjectionOrNull,
    guidanceProjectionOrNull: first.guidanceProjectionOrNull,
    boundaries: first.boundaries,
    effects: first.effects,
    authorityGranted: first.authorityGranted,
    effectEvidence: first.effectEvidence
  }));
  assert.equal(
    first.projectionRef,
    `projection.vexlife.experience-command.${first.semanticFingerprint.slice(0, 32)}`
  );

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.inputProjection), true);
  assert.equal(Object.isFrozen(first.commandProjectionOrNull), true);
  assert.equal(Object.isFrozen(first.guidanceProjectionOrNull), true);
  assert.equal(first.effects, false);
  assert.equal(first.authorityGranted, false);
  assert.ok(Object.values(first.effectEvidence).every((value) => value === false));
  assert.deepEqual(Object.keys(first.effectEvidence).sort(), [
    'actionExecuted',
    'commandExecuted',
    'commandExecutionRequested',
    'commandPermissionGranted',
    'journeyEffect',
    'memoryWritten',
    'modelToolInvoked',
    'modelTurnCreated',
    'modelTurnRequested',
    'navigationEffect',
    'networkEffect',
    'persistenceEffect'
  ]);
});

// [VXG RealForever][EFX-02]
