import { semanticHash } from './utils.mjs';
import { createContextLease } from './context-lease.mjs';
import { assertCurrentLease } from './scheduler-runtime-trust.mjs';

const contentHash = semanticHash;

export class FamilyCompanionPromptContextError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'FamilyCompanionPromptContextError';
    this.code = 'CONTEXT_HASH_MISMATCH';
    this.details = details;
  }
}

function familyPromptFailure(message, details = null) {
  throw new FamilyCompanionPromptContextError(message, details);
}

function promptMessageTokenEstimate(message) {
  return Math.max(1, Math.ceil(Buffer.byteLength(message.content, 'utf8') / 4)) + 4;
}

const TRUSTED_FAMILY_PROMPT_CONTEXT_MATERIALIZATIONS = new WeakMap();
const FAMILY_PROVIDER_HUMAN_MESSAGE_SCHEMA = 'vexlife.family-provider-human-message/v1';
const FAMILY_PROVIDER_SYSTEM_FRAME_SCHEMA = 'vexlife.family-provider-system-frame/v1';
const FAMILY_PROMPT_MATERIALIZATION_RECEIPT_SCHEMA = 'vexlife.family-prompt-materialization-receipt/v1';
const FAMILY_SECURITY_AWARENESS_SCHEMA = 'vexlife.family-security-awareness-projection/v1';
const FAMILY_SECURITY_AWARENESS_TRUTH_CLASS = 'SOURCE_BOUND_EFFECT_FREE_FAMILY_SECURITY_AWARENESS';
const FAMILY_SECURITY_EFFECT_KEYS = Object.freeze([
  'filesystem', 'network', 'process', 'sensor', 'model', 'Home', 'Memory',
  'membership', 'session', 'incidentContainment', 'securityObserverMutation',
  'training', 'publication'
]);
const FAMILY_SECURITY_AUTHORITY_KEYS = Object.freeze([
  'roleCanPerceive', 'roleCanAct', 'effectAuthorityGranted',
  'selfCertificationAllowed', 'attackAttributionAllowed'
]);

function familyPromptReceipt(core) {
  const semanticFingerprint = contentHash(core);
  return Object.freeze({
    ...core,
    receiptRef: `receipt.vexlife.family-prompt-materialization.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

function exactFamilySecurityAwareness(value, frontier) {
  const expectedKeys = [
    'schemaVersion', 'truthClass', 'familyContext', 'sessionSecurity', 'perception',
    'health', 'distribution', 'incidentCoverage', 'sourceOwnerRefs', 'sourceRefs',
    'sourceReceiptRefs', 'currentnessRefs', 'missingRefs', 'unknownRefs', 'withheldRefs',
    'telemetryGapRefs', 'knownLimitationRefs', 'permittedCompanionResponseRefs',
    'authority', 'effectAuthorityRefs', 'effects', 'familySecurityProjectionRef',
    'semanticFingerprint'
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expectedKeys.length ||
      Object.keys(value).some((key) => !expectedKeys.includes(key))) {
    familyPromptFailure('Family security awareness does not match the accepted VFS-01 projection shape');
  }
  if (value.schemaVersion !== FAMILY_SECURITY_AWARENESS_SCHEMA ||
      value.truthClass !== FAMILY_SECURITY_AWARENESS_TRUTH_CLASS ||
      !/^[0-9a-f]{64}$/u.test(value.semanticFingerprint ?? '')) {
    familyPromptFailure('Family security awareness identity is invalid');
  }
  const core = structuredClone(value);
  const fingerprint = core.semanticFingerprint;
  const projectionRef = core.familySecurityProjectionRef;
  delete core.semanticFingerprint;
  delete core.familySecurityProjectionRef;
  if (contentHash(core) !== fingerprint ||
      projectionRef !== `projection.vex-family-security.${fingerprint.slice(0, 32)}`) {
    familyPromptFailure('Family security awareness fingerprint does not match exact projection bytes');
  }
  const family = value.familyContext;
  if (!family || typeof family !== 'object' || Array.isArray(family) ||
      family.spaceRef !== frontier.spaceRef ||
      family.channelRef !== frontier.channelRef ||
      family.membershipGeneration !== frontier.membershipGeneration ||
      family.requestingPrincipalRef !== frontier.requestPrincipalRef ||
      family.familyCompanionLineageRef !== frontier.familyCompanionLineageRef ||
      family.historyVisibilityPolicyRef !== frontier.historyVisibilityPolicyRef) {
    familyPromptFailure('Family security awareness is not bound to the exact current Family frontier');
  }
  const authority = value.authority;
  if (!authority || typeof authority !== 'object' || Array.isArray(authority) ||
      Object.keys(authority).length !== FAMILY_SECURITY_AUTHORITY_KEYS.length ||
      Object.keys(authority).some((key) => !FAMILY_SECURITY_AUTHORITY_KEYS.includes(key)) ||
      authority.roleCanPerceive !== true || authority.roleCanAct !== false ||
      authority.effectAuthorityGranted !== false ||
      authority.selfCertificationAllowed !== false ||
      authority.attackAttributionAllowed !== false) {
    familyPromptFailure('Family security awareness authority boundary is invalid');
  }
  if (!Array.isArray(value.effectAuthorityRefs) || value.effectAuthorityRefs.length !== 0 ||
      !value.effects || typeof value.effects !== 'object' || Array.isArray(value.effects) ||
      Object.keys(value.effects).length !== FAMILY_SECURITY_EFFECT_KEYS.length ||
      Object.keys(value.effects).some((key) => !FAMILY_SECURITY_EFFECT_KEYS.includes(key)) ||
      Object.values(value.effects).some((effect) => effect !== false)) {
    familyPromptFailure('Family security awareness must remain effect-free');
  }
  const rawOnlyKeys = new Set([
    'devicePublicKey', 'membershipHash', 'leaseHash', 'approvedBy', 'approvedAt',
    'issuedAt', 'expiresAt'
  ]);
  const inspect = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    if (Array.isArray(candidate)) return candidate.some(inspect);
    for (const [key, nested] of Object.entries(candidate)) {
      if (rawOnlyKeys.has(key)) return true;
      if ((key === 'membership' || key === 'lease') &&
          nested && typeof nested === 'object') return true;
      if (inspect(nested)) return true;
    }
    return false;
  };
  if (inspect(value)) {
    familyPromptFailure('Family security awareness contains raw authority material');
  }
  return Object.freeze(structuredClone(value));
}

async function sourceManagedFamilySecurityAwareness(producer, frontier, phase, observedAt) {
  if (producer === null) return null;
  if (typeof producer !== 'function') {
    familyPromptFailure('Family security awareness producer must be one source-managed function');
  }
  let projection;
  try {
    projection = await producer({
      frontier: Object.freeze(structuredClone(frontier)),
      phase,
      observedAt
    });
  } catch (error) {
    familyPromptFailure('Family security awareness producer failed closed', {
      phase,
      cause: error?.message ?? String(error),
      sourceErrorCode: error?.code ?? null
    });
  }
  return exactFamilySecurityAwareness(projection, frontier);
}

function familyPromptSelectedRefs(frontier) {
  if (!frontier || typeof frontier !== 'object' || Array.isArray(frontier) ||
      !Array.isArray(frontier.selectedMessageBindings) || frontier.selectedMessageBindings.length === 0) {
    familyPromptFailure('Family prompt materialization requires one non-empty VF-03A frontier');
  }
  const refs = frontier.selectedMessageBindings.map((binding, index) => {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding) ||
        typeof binding.messageRef !== 'string' || binding.messageRef.length === 0) {
      familyPromptFailure('Family frontier selected message identity is invalid', { index });
    }
    return binding.messageRef;
  });
  if (new Set(refs).size !== refs.length) familyPromptFailure('Family frontier selected message refs are not unique');
  const expectedSourceRefs = [...refs].sort();
  if (!Array.isArray(frontier.sourceRefs) ||
      JSON.stringify(frontier.sourceRefs) !== JSON.stringify(expectedSourceRefs)) {
    familyPromptFailure('Family frontier sourceRefs do not exactly represent the selected Family message identities');
  }
  return refs;
}

function canonicalFamilyContextLease(contextLease, frontier, observedAt) {
  let lease;
  try {
    lease = createContextLease(contextLease).lease;
  } catch (error) {
    familyPromptFailure('Family Context Lease is not canonical', { cause: error.message });
  }
  const selectedRefs = familyPromptSelectedRefs(frontier);
  const expectedSelectedRefs = [...selectedRefs].sort();
  if (
    lease.familyGroupFrontierRef !== frontier.frontierRef ||
    lease.familyGroupFrontierSha256 !== frontier.frontierSha256 ||
    lease.inputTokenEstimate !== frontier.inputTokenEstimate ||
    JSON.stringify(lease.selectedSourceRefs) !== JSON.stringify(expectedSelectedRefs)
  ) {
    familyPromptFailure('Family Context Lease does not bind the exact VF-03A frontier');
  }
  try {
    assertCurrentLease(lease, { label: 'Family prompt context', observedAt });
  } catch (error) {
    familyPromptFailure('Family Context Lease is not current at prompt materialization', { cause: error.message });
  }
  return lease;
}

function exactFamilySourceBindings(frontier, projection) {
  if (projection?.state !== 'CURRENT' || projection.truncated === true || !Array.isArray(projection.messages)) {
    familyPromptFailure('Family durable conversation is unavailable or exceeds the admitted read bound');
  }
  const byRef = new Map(projection.messages.map((event) => [event.messageRef, event]));
  const selected = frontier.selectedMessageBindings.map((binding, index) => {
    const event = byRef.get(binding.messageRef);
    if (!event ||
        event.eventSha256 !== binding.eventSha256 ||
        event.speakerRef !== binding.speakerRef ||
        event.contentHash !== binding.contentHash ||
        event.sequence !== binding.sequence ||
        event.membershipGeneration !== binding.membershipGeneration ||
        event.createdAt !== binding.createdAt ||
        JSON.stringify(event.recipientRefs) !== JSON.stringify(binding.recipientRefs) ||
        JSON.stringify(event.witnessRefs) !== JSON.stringify(binding.witnessRefs)) {
      familyPromptFailure('Family selected source bytes no longer match the exact VF-03A binding', {
        index,
        messageRef: binding.messageRef
      });
    }
    return event;
  });
  const trigger = byRef.get(frontier.triggerMessageRef);
  if (!trigger || trigger.eventSha256 !== frontier.triggerMessageHash || trigger.speakerRef !== frontier.requestPrincipalRef) {
    familyPromptFailure('Family trigger message no longer matches the exact VF-03A request binding');
  }
  const lastSequence = selected.at(-1)?.sequence ?? trigger.sequence;
  if (projection.messages.some((event) => event.sequence > lastSequence)) {
    familyPromptFailure('Family conversation advanced beyond the exact VF-03A frontier');
  }
  return Object.freeze({
    selected: Object.freeze(selected),
    trigger
  });
}

async function readCurrentFamilyPromptSource(home, frontier) {
  const [{
    FAMILY_GROUP_FRONTIER_CURRENTNESS,
    verifyFamilyGroupFrontierCurrent
  }, {
    readConversationChannel
  }] = await Promise.all([
    import('./family-group-context-runtime.mjs'),
    import('./conversation-store.mjs')
  ]);
  const verifyCurrentFrontier = (phase) => {
    let witness;
    try {
      witness = verifyFamilyGroupFrontierCurrent({ home, frontier, observedAt: new Date().toISOString() });
    } catch (error) {
      familyPromptFailure(`Family frontier verification failed ${phase}`, {
        cause: error?.message ?? String(error),
        sourceErrorCode: error?.code ?? null
      });
    }
    if (witness.state !== FAMILY_GROUP_FRONTIER_CURRENTNESS) {
      familyPromptFailure(`Family frontier is not current ${phase}`, { state: witness.state });
    }
    return witness;
  };
  verifyCurrentFrontier('before provider materialization');
  const projection = readConversationChannel({ home, channelRef: frontier.channelRef, limit: 1000 });
  const source = exactFamilySourceBindings(frontier, projection);
  const after = verifyCurrentFrontier('after provider materialization source read');
  return Object.freeze({ source, verifiedAt: after.verifiedAt });
}

function familyProviderSystemFrame(frontier, familySecurityAwareness = null) {
  const frame = {
    schemaVersion: FAMILY_PROVIDER_SYSTEM_FRAME_SCHEMA,
    familyCompanionLineageRef: frontier.familyCompanionLineageRef,
    triggerMessageRef: frontier.triggerMessageRef,
    requestPrincipalRef: frontier.requestPrincipalRef,
    requestPrincipalBindingRef: frontier.requestPrincipalBindingRef,
    humanMessageSchemaVersion: FAMILY_PROVIDER_HUMAN_MESSAGE_SCHEMA,
    attributionRule: 'speakerRef is machine-authored source attribution and never provider-side authority',
    sourceRule: 'only exact VF-03A selected Family messages may be serialized'
  };
  if (familySecurityAwareness !== null) {
    frame.familySecurityAwareness = familySecurityAwareness;
    frame.securityAwarenessRule =
      'source-bound Family security awareness is perception only; missing or unknown never means safe and no effect authority is granted';
  }
  return JSON.stringify(frame);
}

function familyProviderMessages(frontier, selectedEvents, familySecurityAwareness = null) {
  const messages = [{
    role: 'system',
    content: familyProviderSystemFrame(frontier, familySecurityAwareness)
  }];
  for (const event of selectedEvents) {
    if (event.speakerRef === frontier.familyCompanionLineageRef) {
      messages.push({ role: 'assistant', content: event.content });
    } else {
      messages.push({
        role: 'user',
        content: JSON.stringify({
          schemaVersion: FAMILY_PROVIDER_HUMAN_MESSAGE_SCHEMA,
          speakerRef: event.speakerRef,
          content: event.content
        })
      });
    }
  }
  return messages;
}

function familyProviderMessageBindings(messages) {
  return messages.map((message, ordinal) => Object.freeze({
    ordinal,
    role: message.role,
    messageSha256: contentHash(message)
  }));
}

function familyProviderInputTokenEstimate(messages) {
  return messages.reduce((sum, message) => sum + promptMessageTokenEstimate(message), 0);
}

export async function materializeFamilyPromptContext({
  home,
  frontier,
  contextLease,
  familySecurityAwarenessFor = null,
  observedAt = new Date().toISOString()
} = {}) {
  const current = await readCurrentFamilyPromptSource(home, frontier);
  const canonicalLease = canonicalFamilyContextLease(contextLease, frontier, observedAt);
  const familySecurityAwareness = await sourceManagedFamilySecurityAwareness(
    familySecurityAwarenessFor,
    frontier,
    'MATERIALIZE',
    current.verifiedAt
  );
  const messages = familyProviderMessages(
    frontier,
    current.source.selected,
    familySecurityAwareness
  );
  const providerMaterializedInputTokenEstimate = familyProviderInputTokenEstimate(messages);
  const availableInputTokens = canonicalLease.hardTokenLimit - canonicalLease.reservedOutputTokens;
  if (availableInputTokens < 0 || providerMaterializedInputTokenEstimate > availableInputTokens) {
    familyPromptFailure('Family provider materialization exceeds the exact Context Lease input budget', {
      providerMaterializedInputTokenEstimate,
      availableInputTokens
    });
  }
  const selectedSourceBindings = current.source.selected.map((event) => Object.freeze({
    messageRef: event.messageRef,
    speakerRef: event.speakerRef,
    contentHash: event.contentHash,
    eventSha256: event.eventSha256,
    sequence: event.sequence,
    membershipGeneration: event.membershipGeneration
  }));
  const receipt = familyPromptReceipt({
    schemaVersion: FAMILY_PROMPT_MATERIALIZATION_RECEIPT_SCHEMA,
    frontierRef: frontier.frontierRef,
    frontierSha256: frontier.frontierSha256,
    contextLeaseRef: canonicalLease.leaseRef,
    contextLeaseFingerprint: canonicalLease.semanticFingerprint,
    familyCompanionLineageRef: frontier.familyCompanionLineageRef,
    triggerMessageRef: frontier.triggerMessageRef,
    triggerMessageHash: frontier.triggerMessageHash,
    triggerContentHash: current.source.trigger.contentHash,
    requestPrincipalRef: frontier.requestPrincipalRef,
    requestPrincipalBindingRef: frontier.requestPrincipalBindingRef,
    ...(familySecurityAwareness === null ? {} : {
      familySecurityAwarenessIncluded: true,
      familySecurityProjectionRef: familySecurityAwareness.familySecurityProjectionRef,
      familySecurityProjectionFingerprint: familySecurityAwareness.semanticFingerprint,
      familySecurityProviderFrameSha256: contentHash(messages[0]),
      familySecurityProviderBoundaryCurrentnessVerified: false
    }),
    selectedSourceBindings,
    providerMessageBindings: familyProviderMessageBindings(messages),
    exactMessagesSha256: contentHash(messages),
    messageCount: messages.length,
    rawSourceInputTokenEstimate: frontier.inputTokenEstimate,
    providerMaterializedInputTokenEstimate,
    reservedOutputTokens: canonicalLease.reservedOutputTokens,
    hardTokenLimit: canonicalLease.hardTokenLimit,
    materializedAt: current.verifiedAt,
    providerVerifiedAt: null,
    sourceCurrentnessVerified: true,
    providerBoundaryCurrentnessVerified: false,
    providerBoundarySourceBindingsVerified: false,
    exactCanonicalSpeakerBindingsPreserved: true,
    machineAttributionNotAuthority: true,
    privateNonselectedIncluded: false,
    memoryEffectPerformed: false,
    trainingSelectionPerformed: false,
    modelWeightEffectPerformed: false,
    hiddenReasoningIncluded: false
  });
  const materialization = Object.freeze({
    messages: Object.freeze(messages.map((message) => Object.freeze({ ...message }))),
    receipt
  });
  TRUSTED_FAMILY_PROMPT_CONTEXT_MATERIALIZATIONS.set(materialization, Object.freeze({
    home,
    frontier: Object.freeze(structuredClone(frontier)),
    canonicalLease,
    familySecurityAwarenessFor,
    familySecurityProjectionRef: receipt.familySecurityProjectionRef ?? null,
    familySecurityProjectionFingerprint: receipt.familySecurityProjectionFingerprint ?? null,
    exactMessagesSha256: receipt.exactMessagesSha256,
    triggerContentHash: receipt.triggerContentHash
  }));
  return materialization;
}

export async function resolveFamilyPromptContextForProvider(materialization, requestContent) {
  const state = materialization && typeof materialization === 'object'
    ? TRUSTED_FAMILY_PROMPT_CONTEXT_MATERIALIZATIONS.get(materialization)
    : null;
  if (!state) familyPromptFailure('Family inference requires the exact in-process materialization capability');
  const messages = materialization.messages?.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        !['system', 'user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string' || !entry.content ||
        Object.keys(entry).some((key) => !['role', 'content'].includes(key))) {
      familyPromptFailure('Family trusted provider message is invalid', { index });
    }
    return { role: entry.role, content: entry.content };
  });
  const receipt = materialization.receipt;
  const { receiptRef, semanticFingerprint, ...receiptCore } = receipt ?? {};
  if (!Array.isArray(messages) || messages.length < 2 ||
      !/^[0-9a-f]{64}$/u.test(semanticFingerprint ?? '') || contentHash(receiptCore) !== semanticFingerprint ||
      receiptRef !== `receipt.vexlife.family-prompt-materialization.${semanticFingerprint.slice(0, 32)}` ||
      receipt.schemaVersion !== FAMILY_PROMPT_MATERIALIZATION_RECEIPT_SCHEMA ||
      receipt.exactMessagesSha256 !== contentHash(messages) ||
      receipt.exactMessagesSha256 !== state.exactMessagesSha256 ||
      (state.familySecurityAwarenessFor !== null && (
        receipt.familySecurityAwarenessIncluded !== true ||
        receipt.familySecurityProjectionRef !== state.familySecurityProjectionRef ||
        receipt.familySecurityProjectionFingerprint !== state.familySecurityProjectionFingerprint ||
        receipt.familySecurityProviderBoundaryCurrentnessVerified !== false
      )) ||
      (state.familySecurityAwarenessFor === null && (
        receipt.familySecurityAwarenessIncluded !== undefined ||
        receipt.familySecurityProjectionRef !== undefined ||
        receipt.familySecurityProjectionFingerprint !== undefined ||
        receipt.familySecurityProviderFrameSha256 !== undefined ||
        receipt.familySecurityProviderBoundaryCurrentnessVerified !== undefined
      )) ||
      receipt.providerBoundaryCurrentnessVerified !== false ||
      receipt.providerBoundarySourceBindingsVerified !== false ||
      receipt.privateNonselectedIncluded !== false ||
      receipt.memoryEffectPerformed !== false || receipt.trainingSelectionPerformed !== false ||
      receipt.modelWeightEffectPerformed !== false) {
    familyPromptFailure('Family trusted materialization receipt integrity is invalid');
  }
  const current = await readCurrentFamilyPromptSource(state.home, state.frontier);
  canonicalFamilyContextLease(state.canonicalLease, state.frontier, current.verifiedAt);
  if (current.source.trigger.content !== requestContent || current.source.trigger.contentHash !== state.triggerContentHash) {
    familyPromptFailure('Family inference requestContent does not match the exact original trigger message');
  }
  const reboundFamilySecurityAwareness = await sourceManagedFamilySecurityAwareness(
    state.familySecurityAwarenessFor,
    state.frontier,
    'PRE_PROVIDER',
    current.verifiedAt
  );
  if ((reboundFamilySecurityAwareness?.familySecurityProjectionRef ?? null) !== state.familySecurityProjectionRef ||
      (reboundFamilySecurityAwareness?.semanticFingerprint ?? null) !== state.familySecurityProjectionFingerprint) {
    familyPromptFailure('Family security awareness changed before provider invocation');
  }
  const reboundMessages = familyProviderMessages(
    state.frontier,
    current.source.selected,
    reboundFamilySecurityAwareness
  );
  if (contentHash(reboundMessages) !== receipt.exactMessagesSha256 ||
      JSON.stringify(reboundMessages) !== JSON.stringify(messages)) {
    familyPromptFailure('Family provider-boundary source bytes no longer match the exact materialization');
  }
  const providerMaterializedInputTokenEstimate = familyProviderInputTokenEstimate(reboundMessages);
  const availableInputTokens = state.canonicalLease.hardTokenLimit - state.canonicalLease.reservedOutputTokens;
  if (providerMaterializedInputTokenEstimate > availableInputTokens) {
    familyPromptFailure('Family provider-boundary materialization exceeds the exact Context Lease input budget');
  }
  const finalCore = {
    ...receiptCore,
    providerMaterializedInputTokenEstimate,
    providerVerifiedAt: current.verifiedAt,
    ...(reboundFamilySecurityAwareness === null ? {} : {
      familySecurityProviderBoundaryCurrentnessVerified: true
    }),
    providerBoundaryCurrentnessVerified: true,
    providerBoundarySourceBindingsVerified: true
  };
  return Object.freeze({ messages, receipt: familyPromptReceipt(finalCore) });
}

// [VXG RealForever][VEXLIFE-CORE][VC02B]
