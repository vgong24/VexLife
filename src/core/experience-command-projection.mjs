import { projectGuidanceForDevex } from './devex-guidance-projection.mjs';
import { semanticHash } from './utils.mjs';

export const EXPERIENCE_COMMAND_PROJECTION_SCHEMA = 'vexlife.experience-command-projection/v1';
export const EXPERIENCE_COMMAND_FOUNDATION_SCHEMA = 'vexlife.experience-foundation/v1';
export const EXPERIENCE_COMMAND_CLASSIFIER_RECEIPT_KINDS = Object.freeze([
  'NOT_COMMAND',
  'UNKNOWN_COMMAND',
  'KNOWN_COMMAND'
]);
export const EXPERIENCE_COMMAND_REQUEST_KINDS = Object.freeze([
  'CLASSIFIER_RECEIPT',
  'MODEL_TOOL_REQUEST'
]);
export const EXPERIENCE_COMMAND_SLASH_FORM_REF = 'form.vexlife.operator.slash-alias';
export const EXPERIENCE_COMMAND_MODEL_TOOL_FORM_REF = 'form.vexlife.operator.model-tool';

const REQUIRED_NON_COLLAPSE_RULES = Object.freeze([
  'COMMAND_BINDING != EFFECT_AUTHORITY',
  'SLASH_STRING != COMMAND_IDENTITY',
  'SLASH_STRING != HUMAN_MESSAGE',
  'UNKNOWN_SLASH_COMMAND != MODEL_TURN',
  'ACTION_REF != MODEL_TOOL'
]);
const EFFECT_FIELDS = Object.freeze([
  'commandPermissionGranted',
  'commandExecutionRequested',
  'commandExecuted',
  'actionExecuted',
  'modelTurnRequested',
  'modelTurnCreated',
  'modelToolInvoked',
  'navigationEffect',
  'journeyEffect',
  'persistenceEffect',
  'memoryWritten',
  'networkEffect'
]);
const HELP_COMMAND_REF = 'command.vexlife.help';
const FORBIDDEN_REQUEST_FIELDS = Object.freeze([
  'input',
  'text',
  'rawText',
  'message',
  'prompt',
  'content',
  'privateHumanMemory',
  'providerPayload',
  'reasoning',
  'credentials',
  'secret',
  'classifier'
]);

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])
    ));
  }
  return value;
}

function strictKeys(value, allowed, label) {
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) throw new TypeError(`${label} contains unsupported field ${extra[0]}`);
}

function noEffects() {
  return freezeDeep(Object.fromEntries(EFFECT_FIELDS.map((field) => [field, false])));
}

function projectInteractionForm(form, expectedKind) {
  if (!object(form) || !nonempty(form.formRef) || form.formKind !== expectedKind ||
      form.consumerClass !== 'OPERATOR') {
    throw new TypeError(`Experience Foundation ${expectedKind} interaction form is invalid`);
  }
  if (!Array.isArray(form.platformRefs) || form.platformRefs.some((ref) => !nonempty(ref)) ||
      new Set(form.platformRefs).size !== form.platformRefs.length) {
    throw new TypeError(`Experience Foundation ${expectedKind} platformRefs are invalid`);
  }
  return freezeDeep({
    formRef: form.formRef,
    formKind: form.formKind,
    consumerClass: form.consumerClass,
    platformRefs: [...form.platformRefs].sort(),
    purpose: nonempty(form.purpose) ? form.purpose : null
  });
}

function projectCommandBinding(binding, aliasOwners) {
  if (!object(binding) || !nonempty(binding.commandRef) || !nonempty(binding.capabilityRef) ||
      !nonempty(binding.purpose)) {
    throw new TypeError('Experience Foundation CommandBinding identity is incomplete');
  }
  if (binding.actionRefOrNull !== null || binding.processRefOrNull !== null) {
    throw new TypeError(`${binding.commandRef} must remain no-action and no-process in EFX-02`);
  }
  if (!Array.isArray(binding.aliases) || binding.aliases.length === 0) {
    throw new TypeError(`${binding.commandRef} requires at least one slash alias`);
  }

  const aliases = binding.aliases.map((alias, index) => {
    if (!object(alias) || !nonempty(alias.literal) || !alias.literal.startsWith('/') ||
        /\s/u.test(alias.literal) || alias.formRef !== EXPERIENCE_COMMAND_SLASH_FORM_REF) {
      throw new TypeError(`${binding.commandRef} alias ${index} is invalid`);
    }
    const prior = aliasOwners.get(alias.literal);
    if (prior && prior !== binding.commandRef) {
      throw new TypeError(`duplicate command alias ${alias.literal}`);
    }
    aliasOwners.set(alias.literal, binding.commandRef);
    return { literal: alias.literal, formRef: alias.formRef };
  }).sort((left, right) => left.literal.localeCompare(right.literal));

  if (new Set(aliases.map((alias) => alias.literal)).size !== aliases.length) {
    throw new TypeError(`${binding.commandRef} contains duplicate aliases`);
  }

  return freezeDeep({
    commandRef: binding.commandRef,
    purpose: binding.purpose,
    capabilityRef: binding.capabilityRef,
    actionRefOrNull: null,
    processRefOrNull: null,
    aliases
  });
}

function acceptedExperienceFoundation(source) {
  if (!object(source) || source.schemaVersion !== EXPERIENCE_COMMAND_FOUNDATION_SCHEMA ||
      source.effects !== false || !nonempty(source.foundationRef) || !nonempty(source.sourceRef)) {
    throw new TypeError('one accepted no-effect Experience Foundation is required');
  }
  for (const rule of REQUIRED_NON_COLLAPSE_RULES) {
    if (!source.nonCollapseRules?.includes(rule)) {
      throw new TypeError(`Experience Foundation is missing non-collapse rule ${rule}`);
    }
  }
  if (!Array.isArray(source.interactionForms) || !Array.isArray(source.commandBindings) ||
      source.commandBindings.length === 0) {
    throw new TypeError('Experience Foundation command and interaction-form projections are required');
  }

  const formRefs = new Set();
  for (const form of source.interactionForms) {
    if (!object(form) || !nonempty(form.formRef)) {
      throw new TypeError('Experience Foundation contains an invalid interaction form');
    }
    if (formRefs.has(form.formRef)) throw new TypeError(`duplicate interaction form ${form.formRef}`);
    formRefs.add(form.formRef);
  }

  const slashSource = source.interactionForms.find(
    (form) => form.formRef === EXPERIENCE_COMMAND_SLASH_FORM_REF
  );
  const modelToolSource = source.interactionForms.find(
    (form) => form.formRef === EXPERIENCE_COMMAND_MODEL_TOOL_FORM_REF
  );
  const slashForm = projectInteractionForm(slashSource, 'SLASH_ALIAS');
  const modelToolForm = projectInteractionForm(modelToolSource, 'MODEL_TOOL');

  const aliasOwners = new Map();
  const commandRefs = new Set();
  const commandBindings = source.commandBindings.map((binding) => {
    if (commandRefs.has(binding?.commandRef)) {
      throw new TypeError(`duplicate CommandBinding ${binding.commandRef}`);
    }
    commandRefs.add(binding?.commandRef);
    return projectCommandBinding(binding, aliasOwners);
  }).sort((left, right) => left.commandRef.localeCompare(right.commandRef));

  return freezeDeep({
    foundationRef: source.foundationRef,
    sourceRef: source.sourceRef,
    slashForm,
    modelToolForm,
    commandBindings
  });
}

function acceptedClassifierReceipt(receipt) {
  if (!object(receipt)) throw new TypeError('classifier receipt is required');
  strictKeys(receipt, new Set(['kind', 'command', 'suggestion']), 'classifier receipt');

  if (!EXPERIENCE_COMMAND_CLASSIFIER_RECEIPT_KINDS.includes(receipt.kind)) {
    throw new TypeError(`unsupported classifier receipt kind ${receipt.kind}`);
  }
  if (receipt.kind === 'NOT_COMMAND') {
    if (receipt.command !== null || receipt.suggestion !== null) {
      throw new TypeError('NOT_COMMAND receipt must have null command and suggestion');
    }
  } else {
    if (!nonempty(receipt.command) || !receipt.command.startsWith('/') ||
        /\s/u.test(receipt.command)) {
      throw new TypeError(`${receipt.kind} receipt command must be one slash literal`);
    }
    if (receipt.kind === 'KNOWN_COMMAND' && receipt.suggestion !== null) {
      throw new TypeError('KNOWN_COMMAND receipt suggestion must be null');
    }
    if (receipt.kind === 'UNKNOWN_COMMAND' &&
        !(receipt.suggestion === null ||
          (nonempty(receipt.suggestion) && receipt.suggestion.startsWith('/') &&
           !/\s/u.test(receipt.suggestion)))) {
      throw new TypeError('UNKNOWN_COMMAND receipt suggestion must be null or one slash literal');
    }
  }

  return freezeDeep({
    kind: receipt.kind,
    command: receipt.command,
    suggestion: receipt.suggestion
  });
}

function acceptedRequest(request) {
  if (!object(request)) throw new TypeError('command projection request is required');
  for (const field of FORBIDDEN_REQUEST_FIELDS) {
    if (Object.hasOwn(request, field)) {
      throw new TypeError(`command projection request cannot contain ${field}`);
    }
  }
  if (!EXPERIENCE_COMMAND_REQUEST_KINDS.includes(request.kind)) {
    throw new TypeError(`unsupported command projection request kind ${request.kind}`);
  }

  if (request.kind === 'CLASSIFIER_RECEIPT') {
    strictKeys(request, new Set(['kind', 'classification']), 'classifier projection request');
    return freezeDeep({
      kind: request.kind,
      classification: acceptedClassifierReceipt(request.classification)
    });
  }

  strictKeys(request, new Set(['kind', 'commandRef']), 'model-tool projection request');
  if (!nonempty(request.commandRef)) {
    throw new TypeError('MODEL_TOOL_REQUEST requires commandRef');
  }
  return freezeDeep({ kind: request.kind, commandRef: request.commandRef });
}

function aliasIndex(foundation) {
  return new Map(foundation.commandBindings.flatMap((binding) =>
    binding.aliases.map((alias) => [alias.literal, binding])
  ));
}

function commandIndex(foundation) {
  return new Map(foundation.commandBindings.map((binding) => [binding.commandRef, binding]));
}

function commandProjection(binding, formRef, literalOrNull) {
  if (!binding) return null;
  return freezeDeep({
    commandRef: binding.commandRef,
    capabilityRef: binding.capabilityRef,
    purpose: binding.purpose,
    aliases: binding.aliases,
    actionRefOrNull: null,
    processRefOrNull: null,
    projectedFormRef: formRef,
    projectedLiteralOrNull: literalOrNull,
    permissionGranted: false,
    executionRequested: false,
    executionPerformed: false
  });
}

function suggestionProjection(binding, literal) {
  if (!binding || !literal) return null;
  return freezeDeep({
    literal,
    commandRef: binding.commandRef,
    capabilityRef: binding.capabilityRef,
    permissionGranted: false,
    executionRequested: false
  });
}

function projectHelpGuidance(binding, helpContextOrNull) {
  if (binding?.commandRef !== HELP_COMMAND_REF) {
    if (helpContextOrNull !== null) {
      throw new TypeError('Help context is allowed only for command.vexlife.help');
    }
    return null;
  }
  if (!object(helpContextOrNull)) {
    throw new TypeError('command.vexlife.help requires one current Help context');
  }
  strictKeys(
    helpContextOrNull,
    new Set(['helpProjection', 'selfCapabilityFrame', 'interactionCueOrNull', 'isKnownSemanticRef']),
    'Help context'
  );
  return projectGuidanceForDevex({
    commandBinding: binding,
    helpProjection: helpContextOrNull.helpProjection,
    selfCapabilityFrame: helpContextOrNull.selfCapabilityFrame,
    interactionCueOrNull: helpContextOrNull.interactionCueOrNull ?? null,
    isKnownSemanticRef: helpContextOrNull.isKnownSemanticRef ?? null
  });
}

export function projectExperienceCommand({
  experienceFoundation,
  request,
  helpContextOrNull = null
} = {}) {
  const foundation = acceptedExperienceFoundation(experienceFoundation);
  const accepted = acceptedRequest(request);
  const byAlias = aliasIndex(foundation);
  const byCommand = commandIndex(foundation);

  let routeDisposition;
  let formProjectionOrNull = null;
  let classifierReceiptOrNull = null;
  let binding = null;
  let literalOrNull = null;
  let suggestion = null;

  if (accepted.kind === 'CLASSIFIER_RECEIPT') {
    classifierReceiptOrNull = accepted.classification;

    if (accepted.classification.kind === 'NOT_COMMAND') {
      routeDisposition = 'NOT_COMMAND';
    } else {
      formProjectionOrNull = foundation.slashForm;
      literalOrNull = accepted.classification.command;

      if (accepted.classification.kind === 'UNKNOWN_COMMAND') {
        routeDisposition = 'LOCAL_REJECT_UNKNOWN_COMMAND';
        if (accepted.classification.suggestion !== null) {
          const suggestedBinding = byAlias.get(accepted.classification.suggestion);
          if (!suggestedBinding) {
            throw new TypeError('UNKNOWN_COMMAND suggestion is not an accepted command alias');
          }
          suggestion = suggestionProjection(
            suggestedBinding,
            accepted.classification.suggestion
          );
        }
      } else {
        binding = byAlias.get(accepted.classification.command);
        if (!binding) {
          throw new TypeError('KNOWN_COMMAND alias is not registered by the Experience Foundation');
        }
        routeDisposition = 'REGISTERED_COMMAND_PROJECTED';
      }
    }
  } else {
    formProjectionOrNull = foundation.modelToolForm;
    binding = byCommand.get(accepted.commandRef);
    if (!binding) {
      throw new TypeError('MODEL_TOOL_REQUEST commandRef is not registered by the Experience Foundation');
    }
    routeDisposition = 'REGISTERED_COMMAND_PROJECTED';
  }

  const guidanceProjectionOrNull = projectHelpGuidance(binding, helpContextOrNull);
  const projectedCommand = commandProjection(
    binding,
    formProjectionOrNull?.formRef ?? null,
    literalOrNull
  );

  const core = {
    schemaVersion: EXPERIENCE_COMMAND_PROJECTION_SCHEMA,
    truthClass: 'SOURCE_BOUND_NO_EFFECT_COMMAND_PROJECTION',
    audienceClasses: ['DEVEX', 'OPERATOR'],
    foundationProjection: {
      foundationRef: foundation.foundationRef,
      sourceRef: foundation.sourceRef
    },
    inputProjection: {
      requestKind: accepted.kind,
      classifierReceiptOrNull,
      formProjectionOrNull,
      literalOrNull,
      requestedCommandRefOrNull:
        accepted.kind === 'MODEL_TOOL_REQUEST' ? accepted.commandRef : null
    },
    routeDisposition,
    commandProjectionOrNull: projectedCommand,
    suggestionProjectionOrNull: suggestion,
    guidanceProjectionOrNull,
    boundaries: {
      classifierReceiptGrantsCommandPermission: false,
      knownCommandMeansExecuted: false,
      unknownCommandCreatesModelTurn: false,
      notCommandGrantsOrdinaryMessageAuthority: false,
      commandBindingGrantsEffectAuthority: false,
      modelToolFormGrantsSemanticAction: false,
      guidanceRelevanceGrantsCommandPermission: false,
      privateHumanMemoryProjected: false
    },
    effects: false,
    authorityGranted: false,
    effectEvidence: noEffects()
  };
  const semanticFingerprint = semanticHash(core);
  return freezeDeep({
    ...core,
    projectionRef: `projection.vexlife.experience-command.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

// [VXG RealForever][EFX-02]
