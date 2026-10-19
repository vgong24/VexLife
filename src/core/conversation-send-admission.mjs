import { semanticHash } from './utils.mjs';

export const CONVERSATION_SEND_ADMISSION_SCHEMA = 'vexlife.conversation-send-admission/v2';
export const CONVERSATION_SEND_ADMISSION_TRUTH_CLASS = 'EXACT_SEND_ATTEMPT_NO_EFFECT_ADMISSION';
export const ADDRESSED_CONVERSATION_CURRENTNESS_SCHEMA = 'vexlife.addressed-conversation-currentness/v1';

const STATIC = Object.freeze({
  actionRef: 'action.message.send',
  permissionRef: 'permission.conversation.send',
  effectClass: 'LOCAL_APPEND',
  confirmation: 'COMPOSER_SEND',
  recovery: 'MESSAGE_CORRECTION_NOT_ERASURE',
  processRef: 'process.vexlife.conversation.send-addressed',
  effectOwnerRule: 'conversation service owns append; model may draft but does not write directly',
  processRecoveryRule: 'append correction or retraction; never silently overwrite original',
  pathScope: 'vex-home/messages'
});

const HEX64 = /^[0-9a-f]{64}$/u;
const FORBIDDEN_AUTHORITY_KEYS = new Set([
  'authorized',
  'authorityGranted',
  'permissionGranted',
  'effectAuthorityGranted',
  'appendAuthorized',
  'executionAuthorityGranted'
]);
const INPUT_KEYS = new Set([
  'sendAttemptRef',
  'staticSource',
  'conversation',
  'confirmationWitness',
  'addressedConversationCurrentness',
  'resourceAdmission',
  'contextAdmission'
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be one object`);
  return value;
}
function string(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be one non-empty string`);
  return value;
}
function optionalString(value, label) {
  if (value === null || value === undefined) return null;
  return string(value, label);
}
function strings(value, label, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${label} must contain non-empty strings`);
  }
  if (new Set(value).size !== value.length) throw new TypeError(`${label} must not contain duplicates`);
  return [...value];
}
function sorted(value) { return [...value].sort(); }
function exact(value, expected, label) {
  if (value !== expected) throw new TypeError(`${label} must be ${expected}`);
}
function exactArray(value, expected, label) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) throw new TypeError(`${label} does not match current source`);
}
function exactKeys(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${label}.${key} is not admitted`);
}
function sha256(value, label) {
  if (!HEX64.test(value ?? '')) throw new TypeError(`${label} must be one SHA-256`);
  return value;
}
function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be one non-negative safe integer`);
  return value;
}
function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeDeep(item)])));
  return value;
}
function assertNoCallerAuthorityBooleans(value, label = 'input') {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORITY_KEYS.has(key)) throw new TypeError(`${label}.${key} cannot supply authority`);
    if (item && typeof item === 'object') assertNoCallerAuthorityBooleans(item, `${label}.${key}`);
  }
}

function validateStaticSource(value) {
  const source = object(value, 'staticSource');
  const action = object(source.action, 'staticSource.action');
  const permission = object(source.permission, 'staticSource.permission');
  const process = object(source.process, 'staticSource.process');

  exact(action.actionRef, STATIC.actionRef, 'actionRef');
  exact(action.permissionRef, STATIC.permissionRef, 'action.permissionRef');
  exact(action.effectClass, STATIC.effectClass, 'action.effectClass');
  if (action.inputSchema?.channelRef !== 'ref' || action.inputSchema?.content !== 'string') {
    throw new TypeError('action.message.send input schema drifted');
  }

  exact(permission.permissionRef, STATIC.permissionRef, 'permissionRef');
  exact(permission.effectClass, STATIC.effectClass, 'permission.effectClass');
  exact(permission.confirmation, STATIC.confirmation, 'permission.confirmation');
  exact(permission.recovery, STATIC.recovery, 'permission.recovery');

  exact(process.processRef, STATIC.processRef, 'processRef');
  exact(process.effectOwnerRule, STATIC.effectOwnerRule, 'process.effectOwnerRule');
  exact(process.recoveryRule, STATIC.processRecoveryRule, 'process.recoveryRule');
  exactArray(process.authorityEnvelope?.effects, [STATIC.effectClass], 'process.authorityEnvelope.effects');
  exactArray(process.authorityEnvelope?.pathScope, [STATIC.pathScope], 'process.authorityEnvelope.pathScope');
  for (const required of ['channelRef', 'speakerRef', 'recipientRefs', 'originalLanguage', 'originalContent']) {
    if (!process.requiredInputs?.includes(required)) throw new TypeError(`process required input missing: ${required}`);
  }
  for (const required of ['message input fits resource/context admission', 'conversation permission is active']) {
    if (!process.preconditions?.includes(required)) throw new TypeError(`process precondition drifted: ${required}`);
  }

  exact(source.currentness, 'CURRENT', 'staticSource.currentness');
  const sourceVersionRef = string(source.sourceVersionRef, 'staticSource.sourceVersionRef');
  const sourceRefs = sorted(strings(source.sourceRefs, 'staticSource.sourceRefs', { min: 3 }));
  return { sourceVersionRef, sourceRefs };
}

function validateConversation(value) {
  const allowed = new Set([
    'projectRef', 'threadRef', 'channelRef', 'channelState', 'memberRefs', 'speakerRef', 'recipientRefs',
    'content', 'originalLanguage', 'replyToMessageRefOrNull', 'contextRangeRefs'
  ]);
  exactKeys(value, allowed, 'conversation');
  const projectRef = string(value.projectRef, 'conversation.projectRef');
  const threadRef = string(value.threadRef, 'conversation.threadRef');
  const channelRef = string(value.channelRef, 'conversation.channelRef');
  exact(value.channelState, 'ACTIVE', 'conversation.channelState');
  const memberRefs = sorted(strings(value.memberRefs, 'conversation.memberRefs', { min: 2 }));
  const speakerRef = string(value.speakerRef, 'conversation.speakerRef');
  const recipientRefs = sorted(strings(value.recipientRefs, 'conversation.recipientRefs', { min: 1 }));
  if (!memberRefs.includes(speakerRef)) throw new TypeError('speakerRef is not a current channel member');
  for (const recipientRef of recipientRefs) if (!memberRefs.includes(recipientRef)) throw new TypeError(`${recipientRef} is not a current channel member`);
  if (typeof value.content !== 'string') throw new TypeError('conversation.content must be a string');
  const originalLanguage = string(value.originalLanguage, 'conversation.originalLanguage');
  const replyToMessageRefOrNull = optionalString(value.replyToMessageRefOrNull, 'conversation.replyToMessageRefOrNull');
  const contextRangeRefs = sorted(strings(value.contextRangeRefs ?? [], 'conversation.contextRangeRefs'));
  return {
    projectRef, threadRef, channelRef, channelState: 'ACTIVE', memberRefs, speakerRef, recipientRefs,
    contentHash: semanticHash(value.content), originalLanguage, replyToMessageRefOrNull, contextRangeRefs
  };
}

function validateConfirmation(value, expected) {
  const allowed = new Set(['witnessRef', 'confirmation', 'currentness', 'sendAttemptRef', 'channelRef', 'contentHash', 'sourceRef']);
  exactKeys(value, allowed, 'confirmationWitness');
  const witnessRef = string(value.witnessRef, 'confirmationWitness.witnessRef');
  exact(value.confirmation, STATIC.confirmation, 'confirmationWitness.confirmation');
  exact(value.currentness, 'CURRENT', 'confirmationWitness.currentness');
  exact(value.sendAttemptRef, expected.sendAttemptRef, 'confirmationWitness.sendAttemptRef');
  exact(value.channelRef, expected.channelRef, 'confirmationWitness.channelRef');
  exact(value.contentHash, expected.contentHash, 'confirmationWitness.contentHash');
  return { witnessRef, sourceRef: string(value.sourceRef, 'confirmationWitness.sourceRef') };
}

function validateAddressedConversationCurrentness(value, conversation) {
  const allowed = new Set([
    'schemaVersion', 'projectionRef', 'currentness', 'threadRef', 'channelRef', 'channelState', 'memberRefs',
    'channelSha256', 'channelRecordSha256', 'headMessageRefOrNull', 'headSequenceOrNull', 'headSha256OrNull',
    'nextMessageSequence', 'sourceRefs'
  ]);
  exactKeys(value, allowed, 'addressedConversationCurrentness');
  exact(value.schemaVersion, ADDRESSED_CONVERSATION_CURRENTNESS_SCHEMA, 'addressedConversationCurrentness.schemaVersion');
  exact(value.currentness, 'CURRENT', 'addressedConversationCurrentness.currentness');
  exact(value.threadRef, conversation.threadRef, 'addressedConversationCurrentness.threadRef');
  exact(value.channelRef, conversation.channelRef, 'addressedConversationCurrentness.channelRef');
  exact(value.channelState, conversation.channelState, 'addressedConversationCurrentness.channelState');
  const memberRefs = sorted(strings(value.memberRefs, 'addressedConversationCurrentness.memberRefs', { min: 2 }));
  exactArray(memberRefs, conversation.memberRefs, 'addressedConversationCurrentness.memberRefs');

  const headMessageRefOrNull = optionalString(value.headMessageRefOrNull, 'addressedConversationCurrentness.headMessageRefOrNull');
  const headSequenceOrNull = value.headSequenceOrNull == null
    ? null
    : nonNegativeInteger(value.headSequenceOrNull, 'addressedConversationCurrentness.headSequenceOrNull');
  const headSha256OrNull = value.headSha256OrNull == null
    ? null
    : sha256(value.headSha256OrNull, 'addressedConversationCurrentness.headSha256OrNull');
  const nextMessageSequence = nonNegativeInteger(value.nextMessageSequence, 'addressedConversationCurrentness.nextMessageSequence');
  const headAbsent = headMessageRefOrNull === null && headSequenceOrNull === null && headSha256OrNull === null;
  const headPresent = headMessageRefOrNull !== null && headSequenceOrNull !== null && headSha256OrNull !== null;
  if (!headAbsent && !headPresent) throw new TypeError('addressedConversationCurrentness head identity must be entirely present or entirely absent');
  if (headAbsent && nextMessageSequence !== 0) throw new TypeError('addressedConversationCurrentness.nextMessageSequence must be 0 without a head');
  if (headPresent && nextMessageSequence !== headSequenceOrNull + 1) {
    throw new TypeError('addressedConversationCurrentness.nextMessageSequence must advance the exact current head');
  }

  return {
    schemaVersion: ADDRESSED_CONVERSATION_CURRENTNESS_SCHEMA,
    projectionRef: string(value.projectionRef, 'addressedConversationCurrentness.projectionRef'),
    currentness: 'CURRENT',
    channelSha256: sha256(value.channelSha256, 'addressedConversationCurrentness.channelSha256'),
    channelRecordSha256: sha256(value.channelRecordSha256, 'addressedConversationCurrentness.channelRecordSha256'),
    headMessageRefOrNull,
    headSequenceOrNull,
    headSha256OrNull,
    nextMessageSequence,
    sourceRefs: sorted(strings(value.sourceRefs, 'addressedConversationCurrentness.sourceRefs', { min: 1 }))
  };
}

function validateAdmissionProjection(value, label) {
  const allowed = new Set(['admissionRef', 'state', 'currentness', 'semanticFingerprint', 'sourceRefs']);
  exactKeys(value, allowed, label);
  exact(value.state, 'ADMITTED', `${label}.state`);
  exact(value.currentness, 'CURRENT', `${label}.currentness`);
  if (!HEX64.test(value.semanticFingerprint ?? '')) throw new TypeError(`${label}.semanticFingerprint must be one SHA-256`);
  return {
    admissionRef: string(value.admissionRef, `${label}.admissionRef`),
    semanticFingerprint: value.semanticFingerprint,
    sourceRefs: sorted(strings(value.sourceRefs, `${label}.sourceRefs`, { min: 1 }))
  };
}
function receiptCore(input) {
  exactKeysinput, INPUT_KEYS, 'input');
  assertNoCallerAuthorityBooleans(input.staticSource, 'staticSource');
  assertNoCallerAuthorityBooleans(input.conversation, 'conversation');
  assertNoCallerAuthorityBooleans(input.confirmationWitness, 'confirmationWitness');
  assertNoCallerAuthorityBooleans(input.addressedConversationCurrentness, 'addressedConversationCurrentness');
  assertNoCallerAuthorityBooleans(input.resourceAdmission, 'resourceAdmission');
  assertNoCallerAuthorityBooleans(input.contextAdmission, 'contextAdmission');

  const sendAttemptRef = string(input.sendAttemptRef, 'sendAttemptRef');
  const staticSource = validateStaticSource(input.staticSource);
  const conversation = validateConversation(input.conversation);
  const confirmation = validateConfirmation(input.confirmationWitness, {
    sendAttemptRef,
    channelRef: conversation.channelRef,
    contentHash: conversation.contentHash
  });
  const addressedCurrentness = validateAddressedConversationCurrentness(input.addressedConversationCurrentness, conversation);
  const resource = validateAdmissionProjection(input.resourceAdmission, 'resourceAdmission');
  const context = validateAdmissionProjection(input.contextAdmission, 'contextAdmission');

  const sourceRefs = sorted([...new Set([
    ...staticSource.sourceRefs,
    confirmation.sourceRef,
    ...addressedCurrentness.sourceRefs,
    ...resource.sourceRefs,
    ...context.sourceRefs
  ])]);

  return {
    schemaVersion: CONVERSATION_SEND_ADMISSION_SCHEMA,
    truthClass: CONVERSATION_SEND_ADMISSION_TRUTH_CLASS,
    state: 'ADMITTED',
    currentness: 'CURRENT',
    sendAttemptRef,
    actionRef: STATIC.actionRef,
    permission: { permissionRef: STATIC.permissionRef, state: 'ADMITTED' },
    effect: {
      effectClass: STATIC.effectClass,
      attemptScope: 'EXACT_BOUND_SEND_ATTEMPT',
      disposition: 'ADMITTED_EXACT_ATTEMPT',
      performed: false,
      persistenceOwner: 'CONVERSATION_EFFECT_OWNER'
    },
    confirmation: STATIC.confirmation,
    recovery: STATIC.recovery,
    processRef: STATIC.processRef,
    projectRef: conversation.projectRef,
    threadRef: conversation.threadRef,
    channelRef: conversation.channelRef,
    channelState: conversation.channelState,
    memberRefs: conversation.memberRefs,
    speakerRef: conversation.speakerRef,
    recipientRefs: conversation.recipientRefs,
    contentHash: conversation.contentHash,
    originalLanguage: conversation.originalLanguage,
    replyToMessageRefOrNull: conversation.replyToMessageRefOrNull,
    contextRangeRefs: conversation.contextRangeRefs,
    addressedConversationCurrentnessRef: addressedCurrentness.projectionRef,
    channelSha256: addressedCurrentness.channelSha256,
    channelRecordSha256: addressedCurrentness.channelRecordSha256,
    priorMessageRefOrNull: addressedCurrentness.headMessageRefOrNull,
    priorMessageSequenceOrNull: addressedCurrentness.headSequenceOrNull,
    priorHeadSha256OrNull: addressedCurrentness.headSha256OrNull,
    nextMessageSequence: addressedCurrentness.nextMessageSequence,
    confirmationWitnessRef: confirmation.witnessRef,
    resourceAdmissionRef: resource.admissionRef,
    resourceAdmissionFingerprint: resource.semanticFingerprint,
    contextAdmissionRef: context.admissionRef,
    contextAdmissionFingerprint: context.semanticFingerprint,
    sourceVersionRef: staticSource.sourceVersionRef,
    sourceRefs,
    rawContentIncluded: false,
    messageAppendPerformed: false,
    modelCallPerformed: false,
    activeTurnCurrentnessRequired: false,
    livedCompanionWriterCurrentnessRequired: false,
    authorityWideningPerformed: false,
    duplicateEffectSuppressionOwner: 'CONVERSATION_EFFECT_OWNER'
  };
}

export function formConversationSendAdmission(input) {
  const core = receiptCore(input);
  const semanticFingerprint = semanticHash(core);
  return freezeDeep({
    ...core,
    admissionRef: `admission.vexlife.conversation-send.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

export function verifyConversationSendAdmission(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
  if (receipt.schemaVersion !== CONVERSATION_SEND_ADMISSION_SCHEMA || receipt.truthClass !== CONVERSATION_SEND_ADMISSION_TRUTH_CLASS) return false;
  if (!HEX64.test(receipt.semanticFingerprint ?? '') || receipt.admissionRef !== `admission.vexlife.conversation-send.${receipt.semanticFingerprint.slice(0, 32)}`) return false;
  const { admissionRef, semanticFingerprint, ...core } = receipt;
  return semanticHash(core) === semanticFingerprint
    && core.state === 'ADMITTED'
    && core.currentness === 'CURRENT'
    && core.permission?.permissionRef === STATIC.permissionRef
    && core.permission?.state === 'ADMITTED'
    && core.effect?.effectClass === STATIC.effectClass
    && core.effect?.attemptScope === 'EXACT_BOUND_SEND_ATTEMPT'
    && core.effect?.disposition === 'ADMITTED_EXACT_ATTEMPT'
    && core.effect?.performed === false
    && core.effect?.persistenceOwner === 'CONVERSATION_EFFECT_OWNER'
    && core.rawContentIncluded === false
    && core.messageAppendPerformed === false
    && core.modelCallPerformed === false
    && core.activeTurnCurrentnessRequired === false
    && core.livedCompanionWriterCurrentnessRequired === false
    && core.authorityWideningPerformed === false
    && core.duplicateEffectSuppressionOwner === 'CONVERSATION_EFFECT_OWNER';
}

export function assertConversationSendAdmissionMatches(receipt, input) {
  if (!verifyConversationSendAdmission(receipt)) throw new TypeError('conversation send admission receipt is invalid');
  const expected = formConversationSendAdmission(input);
  if (receipt.admissionRef !== expected.admissionRef || receipt.semanticFingerprint !== expected.semanticFingerprint) {
    throw new TypeError('conversation send admission does not match the exact current send attempt');
  }
  return receipt;
}
