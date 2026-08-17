import { semanticHash } from './utils.mjs';

const INTERPRETATION_STATES = new Set(['CANDIDATE', 'CONFIRMED', 'CORRECTED', 'HELD']);
const AMBIGUITY_STATES = new Set(['CLEAR', 'AMBIGUOUS', 'DISPUTED', 'UNKNOWN']);
const MATERIALITY_STATES = new Set(['ORDINARY', 'MATERIAL']);
const ORIGINATOR_KINDS = new Set(['HUMAN', 'AI']);
const ADMISSION_STATES = new Set(['ADMITTED', 'REVIEW_REQUIRED', 'UNAVAILABLE', 'UNKNOWN']);
const LOCALIZATION_READINESS_STATES = new Set(['TRANSLATION_READY', 'GLOSSARY_READY', 'CANDIDATE', 'UNAVAILABLE', 'UNKNOWN']);
const RUNTIME_CURRENTNESS_STATES = new Set(['CURRENT', 'STALE', 'INVALID', 'UNKNOWN']);
const DELIVERY_STATES = new Set(['NOT_DELIVERED', 'QUEUED', 'DELIVERED', 'FAILED']);
const ACKNOWLEDGEMENT_STATES = new Set(['NOT_REQUESTED', 'PENDING', 'ACKNOWLEDGED', 'UNKNOWN']);
const UNDERSTANDING_STATES = new Set(['NOT_ASSESSED', 'UNDERSTOOD', 'MISUNDERSTOOD', 'UNKNOWN']);
const SEMANTIC_EQUIVALENCE_STATES = new Set(['NOT_CHECKED', 'CONSISTENT', 'PARTIAL', 'CONTRADICTED', 'UNKNOWN']);
const PROJECTION_MODES = new Set(['MODEL_NATIVE', 'LOCALIZATION_PIPELINE', 'HUMAN_REVIEW', 'NONE']);
const FORBIDDEN_RELAY_FIELDS = new Set([
  'rawText', 'rawUtterance', 'sourceText', 'messageContent', 'content', 'translatedText',
  'generatedText', 'generatedAnswer', 'modelOutput', 'providerResponse', 'prompt',
  'conversationTranscript', 'audio', 'credential', 'token', 'originalContent'
]);

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isRef = (value) => typeof value === 'string' && value.length > 0;
const isRefArray = (value, { allowEmpty = false } = {}) => Array.isArray(value)
  && (allowEmpty || value.length > 0)
  && value.every(isRef);
const unique = (values) => [...new Set(values)];
const sameSet = (left, right) => left.length === right.length && left.every((value) => right.includes(value));

function scanForbiddenRelayFields(value, path = 'semanticRelay', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenRelayFields(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (!isObject(value)) return findings;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RELAY_FIELDS.has(key)) findings.push(`${path}.${key}`);
    else scanForbiddenRelayFields(child, `${path}.${key}`, findings);
  }
  return findings;
}

function requireRef(value, name, errors) {
  if (!isRef(value)) errors.push(`${name} must be a non-empty stable reference`);
}

function requireRefs(value, name, errors, options = {}) {
  if (!isRefArray(value, options)) errors.push(`${name} must be an array of stable references`);
}

function normalizedCapability(value) {
  if (!isObject(value)) {
    return {
      capabilityRef: null,
      currentnessState: 'UNKNOWN',
      multilingualOutput: false,
      supportedLanguageRefs: [],
      evidenceRefs: []
    };
  }
  return {
    capabilityRef: value.capabilityRef ?? null,
    currentnessState: value.currentnessState ?? 'UNKNOWN',
    multilingualOutput: value.multilingualOutput === true,
    supportedLanguageRefs: Array.isArray(value.supportedLanguageRefs) ? [...value.supportedLanguageRefs] : [],
    evidenceRefs: Array.isArray(value.evidenceRefs) ? [...value.evidenceRefs] : []
  };
}

function projectionMode(target) {
  const ownerStates = [target.localeQualityState, target.terminologyState, target.authorityState];
  if (ownerStates.some((state) => state === 'UNAVAILABLE' || state === 'UNKNOWN')) return 'NONE';
  if (ownerStates.some((state) => state === 'REVIEW_REQUIRED')) return target.humanReviewAvailable === true ? 'HUMAN_REVIEW' : 'NONE';
  const admitted = ownerStates.every((state) => state === 'ADMITTED');
  const runtime = target.runtimeCapability;
  if (
    admitted
    && runtime.currentnessState === 'CURRENT'
    && runtime.multilingualOutput === true
    && runtime.supportedLanguageRefs.includes(target.targetLanguageRef)
    && runtime.evidenceRefs.length > 0
  ) return 'MODEL_NATIVE';
  if (admitted && target.localizationReadinessState === 'TRANSLATION_READY') return 'LOCALIZATION_PIPELINE';
  if (admitted && target.humanReviewAvailable === true) return 'HUMAN_REVIEW';
  return 'NONE';
}

function semanticEquivalence(source, receipt) {
  if (receipt === undefined || receipt === null) return { state: 'NOT_CHECKED', findingRefs: [] };
  if (!isObject(receipt)) return { state: 'UNKNOWN', findingRefs: ['finding.semantic-relay.equivalence.invalid'] };
  if (isRefArray(receipt.contradictionRefs, { allowEmpty: true }) && receipt.contradictionRefs.length > 0) {
    return { state: 'CONTRADICTED', findingRefs: unique(receipt.contradictionRefs) };
  }
  const complete = ['canonicalMeaningRefs', 'intentRefs', 'sourceRefs', 'evidenceRefs']
    .every((field) => isRefArray(receipt[field], { allowEmpty: false }))
    && isRef(receipt.boundaryClassRef);
  if (!complete) return { state: 'UNKNOWN', findingRefs: ['finding.semantic-relay.equivalence.incomplete'] };
  const sourceMeaning = unique(source.canonicalMeaningRefs);
  const projectedMeaning = unique(receipt.canonicalMeaningRefs);
  const sourceIntent = unique(source.intentRefs);
  const projectedIntent = unique(receipt.intentRefs);
  if (
    projectedMeaning.some((ref) => !sourceMeaning.includes(ref))
    || projectedIntent.some((ref) => !sourceIntent.includes(ref))
    || receipt.boundaryClassRef !== source.boundaryClassRef
  ) return { state: 'CONTRADICTED', findingRefs: ['finding.semantic-relay.equivalence.reference-drift'] };
  if (
    sameSet(sourceMeaning, projectedMeaning)
    && sameSet(sourceIntent, projectedIntent)
    && source.sourceRefs.every((ref) => receipt.sourceRefs.includes(ref))
    && source.evidenceRefs.every((ref) => receipt.evidenceRefs.includes(ref))
  ) return { state: 'CONSISTENT', findingRefs: [] };
  return { state: 'PARTIAL', findingRefs: ['finding.semantic-relay.equivalence.partial-lineage'] };
}

function confirmationRequired(input) {
  if (input.originatorKind !== 'HUMAN' || input.onBehalfOfOriginator !== true || input.materiality !== 'MATERIAL') return false;
  const crossLanguage = input.targets.some((target) => target.targetLanguageRef !== input.sourceLanguageRef);
  return crossLanguage || input.ambiguityState !== 'CLEAR';
}

function validateRelayInput(input) {
  const errors = scanForbiddenRelayFields(input).map((path) => `${path} is forbidden in reference-only semantic relay metadata`);
  if (!isObject(input)) return ['semantic relay input must be an object'];
  for (const field of [
    'relayRef', 'sourceMessageRef', 'sourceLanguageRef', 'preferredConversationLanguageRef',
    'requestedResponseLanguageRef', 'originatorRef', 'interpretationProjectionRef', 'boundaryClassRef'
  ]) requireRef(input[field], field, errors);
  for (const field of ['recipientRefs', 'intentRefs', 'canonicalMeaningRefs', 'sourceRefs', 'evidenceRefs', 'authorityRefs']) {
    requireRefs(input[field], field, errors);
  }
  if (!ORIGINATOR_KINDS.has(input.originatorKind)) errors.push('originatorKind is invalid');
  if (!INTERPRETATION_STATES.has(input.interpretationState)) errors.push('interpretationState is invalid');
  if (!AMBIGUITY_STATES.has(input.ambiguityState)) errors.push('ambiguityState is invalid');
  if (!MATERIALITY_STATES.has(input.materiality)) errors.push('materiality is invalid');
  if (typeof input.onBehalfOfOriginator !== 'boolean') errors.push('onBehalfOfOriginator must be boolean');
  if (input.sourceLocaleRef !== undefined && input.sourceLocaleRef !== null && !isRef(input.sourceLocaleRef)) errors.push('sourceLocaleRef must be a stable reference or null');
  if (input.uiLocaleRef !== undefined && input.uiLocaleRef !== null && !isRef(input.uiLocaleRef)) errors.push('uiLocaleRef must be a stable reference or null');
  if (!Array.isArray(input.targets) || input.targets.length === 0) errors.push('targets must be a non-empty array');
  const recipients = new Set(input.recipientRefs ?? []);
  const targetKeys = new Set();
  for (const [index, rawTarget] of (input.targets ?? []).entries()) {
    const path = `targets[${index}]`;
    if (!isObject(rawTarget)) { errors.push(`${path} must be an object`); continue; }
    for (const field of ['recipientRef', 'recipientPreferredLanguageRef', 'targetLanguageRef', 'targetAudienceRef']) requireRef(rawTarget[field], `${path}.${field}`, errors);
    if (isRef(rawTarget.recipientRef) && !recipients.has(rawTarget.recipientRef)) errors.push(`${path}.recipientRef is not declared in recipientRefs`);
    const key = `${rawTarget.recipientRef ?? ''}::${rawTarget.targetLanguageRef ?? ''}`;
    if (targetKeys.has(key)) errors.push(`${path} duplicates a recipient/language target`);
    targetKeys.add(key);
    for (const field of ['localeQualityState', 'terminologyState', 'authorityState']) if (!ADMISSION_STATES.has(rawTarget[field])) errors.push(`${path}.${field} is invalid`);
    if (!LOCALIZATION_READINESS_STATES.has(rawTarget.localizationReadinessState)) errors.push(`${path}.localizationReadinessState is invalid`);
    if (typeof rawTarget.humanReviewAvailable !== 'boolean') errors.push(`${path}.humanReviewAvailable must be boolean`);
    if (!DELIVERY_STATES.has(rawTarget.deliveryState)) errors.push(`${path}.deliveryState is invalid`);
    if (!ACKNOWLEDGEMENT_STATES.has(rawTarget.acknowledgementState)) errors.push(`${path}.acknowledgementState is invalid`);
    if (!UNDERSTANDING_STATES.has(rawTarget.understandingState)) errors.push(`${path}.understandingState is invalid`);
    if (rawTarget.deliveryState !== 'DELIVERED' && rawTarget.acknowledgementState === 'ACKNOWLEDGED') errors.push(`${path} cannot acknowledge before delivery`);
    if (rawTarget.deliveryState !== 'DELIVERED' && ['UNDERSTOOD', 'MISUNDERSTOOD'].includes(rawTarget.understandingState)) errors.push(`${path} cannot record understanding before delivery`);
    if (rawTarget.acknowledgementState !== 'ACKNOWLEDGED' && ['UNDERSTOOD', 'MISUNDERSTOOD'].includes(rawTarget.understandingState)) errors.push(`${path} cannot record understanding before acknowledgement`);
    const capability = normalizedCapability(rawTarget.runtimeCapability);
    if (!RUNTIME_CURRENTNESS_STATES.has(capability.currentnessState)) errors.push(`${path}.runtimeCapability.currentnessState is invalid`);
    if (capability.capabilityRef !== null && !isRef(capability.capabilityRef)) errors.push(`${path}.runtimeCapability.capabilityRef must be a stable reference or null`);
    requireRefs(capability.supportedLanguageRefs, `${path}.runtimeCapability.supportedLanguageRefs`, errors, { allowEmpty: true });
    requireRefs(capability.evidenceRefs, `${path}.runtimeCapability.evidenceRefs`, errors, { allowEmpty: true });
    if (capability.multilingualOutput && capability.evidenceRefs.length === 0) errors.push(`${path}.runtimeCapability multilingualOutput requires evidenceRefs`);
  }
  for (const recipientRef of recipients) {
    if (!(input.targets ?? []).some((target) => target?.recipientRef === recipientRef)) errors.push(`recipientRef ${recipientRef} has no target`);
  }
  return errors;
}

export function composeSemanticRelay(input) {
  const errors = validateRelayInput(input);
  if (errors.length > 0) return Object.freeze({ status: 'REJECTED', errors: unique(errors), confirmationRequired: false, relay: null });
  const mustConfirm = confirmationRequired(input);
  if (input.interpretationState === 'HELD') {
    return Object.freeze({ status: 'HELD_BY_ORIGINATOR', errors: [], confirmationRequired: mustConfirm, relay: null });
  }
  if (mustConfirm && !['CONFIRMED', 'CORRECTED'].includes(input.interpretationState)) {
    return Object.freeze({ status: 'HOLD_CONFIRMATION_REQUIRED', errors: [], confirmationRequired: true, relay: null });
  }
  if (['CONFIRMED', 'CORRECTED'].includes(input.interpretationState)) {
    if (!isRef(input.confirmedByRef) || !isRef(input.confirmationReceiptRef)) {
      return Object.freeze({ status: 'REJECTED', errors: ['confirmed/corrected interpretation requires confirmer and confirmation receipt refs'], confirmationRequired: mustConfirm, relay: null });
    }
    if (input.originatorKind === 'HUMAN' && input.confirmedByRef !== input.originatorRef) {
      return Object.freeze({ status: 'REJECTED', errors: ['originating human must confirm or correct an interpretation made on their behalf'], confirmationRequired: mustConfirm, relay: null });
    }
  }
  if (input.interpretationState === 'CORRECTED') {
    if (!isRef(input.supersedesInterpretationProjectionRef) || input.supersedesInterpretationProjectionRef === input.interpretationProjectionRef) {
      return Object.freeze({ status: 'REJECTED', errors: ['corrected interpretation requires a distinct superseded interpretation projection ref'], confirmationRequired: mustConfirm, relay: null });
    }
  } else if (input.supersedesInterpretationProjectionRef !== undefined && input.supersedesInterpretationProjectionRef !== null) {
    return Object.freeze({ status: 'REJECTED', errors: ['only corrected interpretation may supersede a prior interpretation projection'], confirmationRequired: mustConfirm, relay: null });
  }

  const targets = input.targets.map((rawTarget) => {
    const target = {
      ...rawTarget,
      runtimeCapability: normalizedCapability(rawTarget.runtimeCapability)
    };
    const equivalence = semanticEquivalence(input, rawTarget.equivalenceReceipt);
    return {
      recipientRef: target.recipientRef,
      recipientPreferredLanguageRef: target.recipientPreferredLanguageRef,
      targetLanguageRef: target.targetLanguageRef,
      targetAudienceRef: target.targetAudienceRef,
      runtimeCapability: target.runtimeCapability,
      localeQualityState: target.localeQualityState,
      terminologyState: target.terminologyState,
      authorityState: target.authorityState,
      localizationReadinessState: target.localizationReadinessState,
      humanReviewAvailable: target.humanReviewAvailable,
      projectionMode: projectionMode(target),
      localizedProjectionRef: target.localizedProjectionRef ?? null,
      semanticEquivalenceState: equivalence.state,
      semanticDriftFindingRefs: equivalence.findingRefs,
      deliveryState: target.deliveryState,
      acknowledgementState: target.acknowledgementState,
      understandingState: target.understandingState
    };
  }).sort((left, right) => `${left.recipientRef}::${left.targetLanguageRef}`.localeCompare(`${right.recipientRef}::${right.targetLanguageRef}`));

  const relay = {
    schemaVersion: 'vexlife.semantic-relay-reference/v1',
    relayRef: input.relayRef,
    sourceMessageRef: input.sourceMessageRef,
    sourceLanguageRef: input.sourceLanguageRef,
    sourceLocaleRef: input.sourceLocaleRef ?? null,
    preferredConversationLanguageRef: input.preferredConversationLanguageRef,
    requestedResponseLanguageRef: input.requestedResponseLanguageRef,
    uiLocaleRef: input.uiLocaleRef ?? null,
    originatorRef: input.originatorRef,
    originatorKind: input.originatorKind,
    onBehalfOfOriginator: input.onBehalfOfOriginator,
    materiality: input.materiality,
    ambiguityState: input.ambiguityState,
    recipientRefs: unique(input.recipientRefs),
    intentRefs: unique(input.intentRefs),
    canonicalMeaningRefs: unique(input.canonicalMeaningRefs),
    interpretationProjectionRef: input.interpretationProjectionRef,
    interpretationState: input.interpretationState,
    confirmedByRef: input.confirmedByRef ?? null,
    confirmationReceiptRef: input.confirmationReceiptRef ?? null,
    supersedesInterpretationProjectionRef: input.supersedesInterpretationProjectionRef ?? null,
    boundaryClassRef: input.boundaryClassRef,
    targets,
    sourceRefs: unique(input.sourceRefs),
    evidenceRefs: unique(input.evidenceRefs),
    authorityRefs: unique(input.authorityRefs)
  };
  const validation = validateSemanticRelay(relay);
  if (!validation.ok) return Object.freeze({ status: 'REJECTED', errors: validation.errors, confirmationRequired: mustConfirm, relay: null });
  return Object.freeze({ status: 'COMPOSED', errors: [], confirmationRequired: mustConfirm, relay: Object.freeze(relay) });
}

export function validateSemanticRelay(relay, expected = {}) {
  const errors = scanForbiddenRelayFields(relay).map((path) => `${path} is forbidden in reference-only semantic relay metadata`);
  if (!isObject(relay)) return Object.freeze({ ok: false, errors: ['semantic relay must be an object'] });
  if (relay.schemaVersion !== 'vexlife.semantic-relay-reference/v1') errors.push('semantic relay schemaVersion is invalid');
  for (const field of [
    'relayRef', 'sourceMessageRef', 'sourceLanguageRef', 'preferredConversationLanguageRef',
    'requestedResponseLanguageRef', 'originatorRef', 'interpretationProjectionRef', 'boundaryClassRef'
  ]) requireRef(relay[field], field, errors);
  for (const field of ['recipientRefs', 'intentRefs', 'canonicalMeaningRefs', 'sourceRefs', 'evidenceRefs', 'authorityRefs']) requireRefs(relay[field], field, errors);
  if (!ORIGINATOR_KINDS.has(relay.originatorKind)) errors.push('originatorKind is invalid');
  if (!INTERPRETATION_STATES.has(relay.interpretationState) || relay.interpretationState === 'HELD') errors.push('persisted relay interpretationState must be CANDIDATE, CONFIRMED, or CORRECTED');
  if (!AMBIGUITY_STATES.has(relay.ambiguityState)) errors.push('ambiguityState is invalid');
  if (!MATERIALITY_STATES.has(relay.materiality)) errors.push('materiality is invalid');
  if (typeof relay.onBehalfOfOriginator !== 'boolean') errors.push('onBehalfOfOriginator must be boolean');
  if (relay.sourceLocaleRef !== null && relay.sourceLocaleRef !== undefined && !isRef(relay.sourceLocaleRef)) errors.push('sourceLocaleRef is invalid');
  if (relay.uiLocaleRef !== null && relay.uiLocaleRef !== undefined && !isRef(relay.uiLocaleRef)) errors.push('uiLocaleRef is invalid');
  const mustConfirm = relay.originatorKind === 'HUMAN'
    && relay.onBehalfOfOriginator === true
    && relay.materiality === 'MATERIAL'
    && (relay.ambiguityState !== 'CLEAR' || relay.targets?.some((target) => target.targetLanguageRef !== relay.sourceLanguageRef));
  if (mustConfirm && !['CONFIRMED', 'CORRECTED'].includes(relay.interpretationState)) errors.push('material human on-behalf relay lacks exact confirmation/correction');
  if (['CONFIRMED', 'CORRECTED'].includes(relay.interpretationState)) {
    if (!isRef(relay.confirmedByRef) || !isRef(relay.confirmationReceiptRef)) errors.push('confirmed/corrected relay lacks confirmation refs');
    if (relay.originatorKind === 'HUMAN' && relay.confirmedByRef !== relay.originatorRef) errors.push('human on-behalf relay was not confirmed by originator');
  }
  if (relay.interpretationState === 'CORRECTED') {
    if (!isRef(relay.supersedesInterpretationProjectionRef) || relay.supersedesInterpretationProjectionRef === relay.interpretationProjectionRef) errors.push('corrected relay lacks distinct superseded projection ref');
  } else if (relay.supersedesInterpretationProjectionRef !== null && relay.supersedesInterpretationProjectionRef !== undefined) errors.push('non-corrected relay cannot supersede an interpretation projection');
  if (!Array.isArray(relay.targets) || relay.targets.length === 0) errors.push('targets must be non-empty');
  const recipientSet = new Set(relay.recipientRefs ?? []);
  for (const [index, target] of (relay.targets ?? []).entries()) {
    const path = `targets[${index}]`;
    if (!isObject(target)) { errors.push(`${path} must be an object`); continue; }
    for (const field of ['recipientRef', 'recipientPreferredLanguageRef', 'targetLanguageRef', 'targetAudienceRef']) requireRef(target[field], `${path}.${field}`, errors);
    if (!recipientSet.has(target.recipientRef)) errors.push(`${path}.recipientRef is not declared`);
    if (!PROJECTION_MODES.has(target.projectionMode)) errors.push(`${path}.projectionMode is invalid`);
    for (const field of ['localeQualityState', 'terminologyState', 'authorityState']) if (!ADMISSION_STATES.has(target[field])) errors.push(`${path}.${field} is invalid`);
    if (!LOCALIZATION_READINESS_STATES.has(target.localizationReadinessState)) errors.push(`${path}.localizationReadinessState is invalid`);
    if (typeof target.humanReviewAvailable !== 'boolean') errors.push(`${path}.humanReviewAvailable is invalid`);
    if (!DELIVERY_STATES.has(target.deliveryState)) errors.push(`${path}.deliveryState is invalid`);
    if (!ACKNOWLEDGEMENT_STATES.has(target.acknowledgementState)) errors.push(`${path}.acknowledgementState is invalid`);
    if (!UNDERSTANDING_STATES.has(target.understandingState)) errors.push(`${path}.understandingState is invalid`);
    if (!SEMANTIC_EQUIVALENCE_STATES.has(target.semanticEquivalenceState)) errors.push(`${path}.semanticEquivalenceState is invalid`);
    requireRefs(target.semanticDriftFindingRefs, `${path}.semanticDriftFindingRefs`, errors, { allowEmpty: true });
    const capability = normalizedCapability(target.runtimeCapability);
    if (!RUNTIME_CURRENTNESS_STATES.has(capability.currentnessState)) errors.push(`${path}.runtime capability currentness is invalid`);
    if (capability.capabilityRef !== null && !isRef(capability.capabilityRef)) errors.push(`${path}.runtime capability ref is invalid`);
    requireRefs(capability.supportedLanguageRefs, `${path}.runtime capability supported languages`, errors, { allowEmpty: true });
    requireRefs(capability.evidenceRefs, `${path}.runtime capability evidence`, errors, { allowEmpty: true });
    if (target.projectionMode === 'MODEL_NATIVE' && !(
      capability.currentnessState === 'CURRENT'
      && capability.multilingualOutput === true
      && capability.supportedLanguageRefs.includes(target.targetLanguageRef)
      && capability.evidenceRefs.length > 0
      && target.localeQualityState === 'ADMITTED'
      && target.terminologyState === 'ADMITTED'
      && target.authorityState === 'ADMITTED'
    )) errors.push(`${path}.MODEL_NATIVE lacks current explicit multilingual capability and owner evidence`);
    if (target.deliveryState !== 'DELIVERED' && target.acknowledgementState === 'ACKNOWLEDGED') errors.push(`${path} acknowledges before delivery`);
    if (target.acknowledgementState !== 'ACKNOWLEDGED' && ['UNDERSTOOD', 'MISUNDERSTOOD'].includes(target.understandingState)) errors.push(`${path} records understanding before acknowledgement`);
  }
  if (expected.sourceMessageRef !== undefined && relay.sourceMessageRef !== expected.sourceMessageRef) errors.push('semantic relay sourceMessageRef does not match event/message source identity');
  if (expected.recipientRefs !== undefined && !sameSet(unique(relay.recipientRefs ?? []), unique(expected.recipientRefs))) errors.push('semantic relay recipientRefs do not match event/message recipients');
  return Object.freeze({ ok: errors.length === 0, errors: unique(errors) });
}

export function attachSemanticRelay(message, relayInput) {
  if (!isObject(message) || !isRef(message.messageRef)) throw new Error('message with stable messageRef is required');
  const composed = composeSemanticRelay({ ...relayInput, sourceMessageRef: relayInput.sourceMessageRef ?? message.messageRef });
  if (composed.status !== 'COMPOSED') return Object.freeze({ ...composed, message });
  const validation = validateSemanticRelay(composed.relay, { sourceMessageRef: message.messageRef, recipientRefs: message.recipientRefs });
  if (!validation.ok) return Object.freeze({ status: 'REJECTED', errors: validation.errors, confirmationRequired: composed.confirmationRequired, relay: null, message });
  return Object.freeze({ ...composed, message: Object.freeze({ ...message, semanticRelay: composed.relay }) });
}

export function createChannel({ channelRef, threadRef, kind, memberRefs, labelStringRef }) {
  if (!channelRef || !threadRef) throw new Error('channelRef and threadRef are required');
  const members = [...new Set(memberRefs ?? [])];
  if (members.length < 2) throw new Error('a channel needs at least two members');
  return { channelRef, threadRef, kind, memberRefs: members, labelStringRef, state: 'ACTIVE', createdAt: new Date().toISOString() };
}

export function createMessage({ messageRef, channel, speakerRef, recipientRefs, content, language = 'en', sequence, createdAt = new Date().toISOString() }) {
  if (!channel.memberRefs.includes(speakerRef)) throw new Error(`${speakerRef} is not a channel member`);
  const recipients = [...new Set(recipientRefs ?? [])];
  if (recipients.length === 0) throw new Error('recipientRefs are required');
  for (const recipient of recipients) if (!channel.memberRefs.includes(recipient)) throw new Error(`${recipient} is not a channel member`);
  return {
    messageRef,
    threadRef: channel.threadRef,
    channelRef: channel.channelRef,
    speakerRef,
    recipientRefs: recipients,
    witnessRefs: [...channel.memberRefs],
    sequence,
    language,
    content,
    contentHash: semanticHash(content),
    createdAt
  };
}

export function messagesForChannel(messages, channelRef) {
  return messages.filter((message) => message.channelRef === channelRef).sort((a, b) => a.sequence - b.sequence);
}

export function contextForParticipant(messages, channel, participantRef) {
  if (!channel.memberRefs.includes(participantRef)) throw new Error(`${participantRef} is not a member of ${channel.channelRef}`);
  return messagesForChannel(messages, channel.channelRef);
}

export function createRelay({ relayRef, originChannelRef, originSpeakerRef, requestingRoleRef, targetRoleRef, route, question, urgency = 'NORMAL' }) {
  return {
    relayRef,
    originChannelRef,
    originSpeakerRef,
    requestingRoleRef,
    targetRoleRef,
    route: [...route],
    question,
    urgency,
    state: 'QUEUED',
    createdAt: new Date().toISOString()
  };
}

// [VXG RealForever]
