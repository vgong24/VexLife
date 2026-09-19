import {
  FamilyHostRuntimeError,
  deriveFamilyPrincipalBindingRef,
  hostFamily
} from './family-host-runtime.mjs';
import {
  FamilyJoinRuntimeError,
  joinFamilyFromInvitation
} from './family-join-runtime.mjs';
import {
  FamilyMembershipRuntimeError,
  leaveFamilyAndContinueConversation
} from './family-membership-runtime.mjs';
import {
  FamilyInvitationStoreError,
  readFamilyInvitation
} from './family-invitation-store.mjs';
import {
  FamilySpaceStoreError,
  readFamilySpace
} from './family-space-store.mjs';
import {
  ConversationStoreError,
  listConversationChannelBindings
} from './conversation-store.mjs';

export const BROWSER_FAMILY_LIFECYCLE_BRIDGE_SCHEMA =
  'vexlife.browser-family-lifecycle-bridge/v1';

export const BROWSER_FAMILY_LIFECYCLE_OPERATIONS = Object.freeze([
  'HOST',
  'JOIN',
  'LEAVE'
]);

const HOST_FIELDS = new Set(['idempotencyKey']);
const JOIN_FIELDS = new Set(['invitationRef']);
const LEAVE_FIELDS = new Set(['spaceRef']);
const STABLE = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;

export class BrowserFamilyLifecycleBridgeError extends Error {
  constructor(code, message, httpStatus = 409, details = null) {
    super(message);
    this.name = 'BrowserFamilyLifecycleBridgeError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const fail = (code, message, httpStatus = 409, details = null) => {
  throw new BrowserFamilyLifecycleBridgeError(code, message, httpStatus, details);
};

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function stable(value, label) {
  if (typeof value !== 'string' || !STABLE.test(value)) {
    fail(
      'BROWSER_FAMILY_LIFECYCLE_INPUT_INVALID',
      `${label} must be one portable lowercase stable ref`,
      400
    );
  }
  return value;
}

function exactIntent(operation, intent) {
  if (!BROWSER_FAMILY_LIFECYCLE_OPERATIONS.includes(operation)) {
    fail(
      'BROWSER_FAMILY_LIFECYCLE_INPUT_INVALID',
      'Family lifecycle operation is not admitted',
      400
    );
  }
  if (!isObject(intent)) {
    fail(
      'BROWSER_FAMILY_LIFECYCLE_INPUT_INVALID',
      'Family lifecycle intent must be one object',
      400
    );
  }
  const allowed =
    operation === 'HOST' ? HOST_FIELDS
      : operation === 'JOIN' ? JOIN_FIELDS
        : LEAVE_FIELDS;
  const keys = Object.keys(intent);
  const extra = keys.find((key) => !allowed.has(key));
  if (extra) {
    fail(
      'BROWSER_FAMILY_LIFECYCLE_UNTRUSTED_FIELD',
      `Family lifecycle intent contains untrusted authority field ${extra}`,
      400
    );
  }
  if (keys.length !== allowed.size) {
    fail(
      'BROWSER_FAMILY_LIFECYCLE_INPUT_INVALID',
      'Family lifecycle intent is missing required fields',
      400
    );
  }
  if (operation === 'HOST') stable(intent.idempotencyKey, 'intent.idempotencyKey');
  else if (operation === 'JOIN') stable(intent.invitationRef, 'intent.invitationRef');
  else stable(intent.spaceRef, 'intent.spaceRef');
  return Object.freeze({ ...intent });
}

function authorityPrincipal(currentAuthorityProjection, observedAt) {
  deriveFamilyPrincipalBindingRef(currentAuthorityProjection, observedAt);
  return stable(
    currentAuthorityProjection?.membership?.principalRef,
    'currentAuthorityProjection.membership.principalRef'
  );
}

function channels(home) {
  const result = listConversationChannelBindings({ home, limit: 1000 });
  return Array.isArray(result.channels) ? result.channels : [];
}

function uniqueGroup(matches, code, message) {
  if (matches.length !== 1) {
    fail(code, message, matches.length === 0 ? 404 : 409, {
      candidateCount: matches.length
    });
  }
  return matches[0];
}

function invitationSourceGroup(home, invitation) {
  return uniqueGroup(
    channels(home).filter((channel) => {
      const binding = channel?.familySpaceBinding;
      return channel?.kind === 'GROUP'
        && binding?.audienceKind === 'GROUP'
        && binding.spaceRef === invitation.spaceRef
        && binding.membershipGeneration === invitation.expectedMembershipGeneration
        && binding.familySpaceRecordSha256 === invitation.expectedFamilyRecordSha256;
    }),
    'BROWSER_FAMILY_LIFECYCLE_INVITATION_CHANNEL_UNAVAILABLE',
    'Invitation source Family GROUP channel is missing or ambiguous'
  );
}

function currentFamilyGroup(home, record) {
  return uniqueGroup(
    channels(home).filter((channel) => {
      const binding = channel?.familySpaceBinding;
      return channel?.kind === 'GROUP'
        && binding?.audienceKind === 'GROUP'
        && binding.spaceRef === record.spaceRef
        && binding.membershipGeneration === record.membershipGeneration
        && binding.familySpaceRecordSha256 === record.recordSha256
        && binding.familyCompanionLineageRef === record.familyCompanionLineageRef;
    }),
    'BROWSER_FAMILY_LIFECYCLE_CURRENT_CHANNEL_UNAVAILABLE',
    'Current Family GROUP channel is missing or ambiguous'
  );
}

function leaveTransitionRef(member) {
  return `transition.vex-family.member.leave.${member.membershipRef}`;
}

function priorLeaveGroup(home, record, principalRef) {
  if (
    !Number.isSafeInteger(record.revision)
    || record.revision < 1
    || !Number.isSafeInteger(record.membershipGeneration)
    || record.membershipGeneration < 1
    || typeof record.priorRecordSha256 !== 'string'
  ) {
    fail(
      'BROWSER_FAMILY_LIFECYCLE_LEAVE_RECOVERY_STALE',
      'Current Family state does not expose an exact prior LEAVE recovery coordinate',
      409
    );
  }
  const expectedMembershipGeneration = record.membershipGeneration - 1;
  const matches = channels(home).filter((channel) => {
    const binding = channel?.familySpaceBinding;
    return channel?.kind === 'GROUP'
      && binding?.audienceKind === 'GROUP'
      && binding.spaceRef === record.spaceRef
      && binding.membershipGeneration === expectedMembershipGeneration
      && binding.familySpaceRecordSha256 === record.priorRecordSha256
      && binding.familyCompanionLineageRef === record.familyCompanionLineageRef
      && Array.isArray(binding.audienceMemberBindings)
      && binding.audienceMemberBindings.some((member) => member.principalRef === principalRef);
  });
  if (matches.length !== 1) {
    fail(
      'BROWSER_FAMILY_LIFECYCLE_LEAVE_RECOVERY_STALE',
      'Prior Family GROUP channel for LEAVE recovery is missing or ambiguous',
      409,
      { candidateCount: matches.length }
    );
  }
  return matches[0];
}

function safeHost(result) {
  return Object.freeze({
    state: result.state,
    establishmentRef: result.establishmentRef,
    spaceRef: result.spaceRef,
    familyCompanionLineageRef: result.familyCompanionLineageRef,
    threadRef: result.threadRef,
    channelRef: result.initialChannelRef,
    membershipGeneration: result.membershipGeneration,
    familySpaceRecordSha256: result.familySpaceRecordSha256,
    familySpaceState: result.familySpaceState,
    channelMaterializationState: result.channelMaterializationState
  });
}

function safeJoin(result) {
  return Object.freeze({
    state: result.state,
    invitationRef: result.invitationRef,
    spaceRef: result.spaceRef,
    membershipRef: result.membershipRef,
    priorChannelRef: result.priorChannelRef ?? null,
    channelRef: result.successorChannelRef,
    threadRef: result.threadRef ?? null,
    membershipGeneration: result.membershipGeneration,
    familySpaceRecordSha256: result.familySpaceRecordSha256,
    membershipTransitionPerformed: result.membershipTransitionPerformed,
    channelMaterializationPerformed: result.channelMaterializationPerformed,
    invitationAcceptancePerformed: result.invitationAcceptancePerformed
  });
}

function safeLeave(result) {
  return Object.freeze({
    state: result.state,
    spaceRef: result.spaceRef,
    priorChannelRef: result.priorChannelRef,
    channelRef: result.successorChannelRef,
    threadRef: result.threadRef,
    priorMembershipGeneration: result.priorMembershipGeneration,
    membershipGeneration: result.membershipGeneration,
    familySpaceRecordSha256: result.familySpaceRecordSha256,
    membershipTransitionPerformed: result.membershipTransitionPerformed,
    channelMaterializationState: result.channelMaterializationState
  });
}

function sanitizeOwnerError(error) {
  if (error instanceof BrowserFamilyLifecycleBridgeError) throw error;

  const code = error?.code ?? 'BROWSER_FAMILY_LIFECYCLE_OWNER_FAILED';
  const input = code.includes('INPUT_INVALID') || code.includes('UNTRUSTED_FIELD');
  const denied =
    code.includes('AUTHORITY_NOT_CURRENT')
    || code.includes('AUTHORITY_IDENTITY_MISMATCH')
    || code.includes('AUTHORITY_REVOCATION_MISMATCH')
    || code.includes('MEMBER_DENIED')
    || code.includes('PRINCIPAL_MISMATCH');
  const missing = code.includes('NOT_FOUND') || code.includes('UNAVAILABLE');
  const conflict =
    code.includes('STALE')
    || code.includes('EXPIRED')
    || code.includes('TERMINAL')
    || code.includes('CONFLICT')
    || code.includes('MISMATCH')
    || code.includes('HELD')
    || code.includes('CONTINUATION_REQUIRED')
    || code.includes('FINALIZATION_REQUIRED');

  const known =
    error instanceof FamilyHostRuntimeError
    || error instanceof FamilyJoinRuntimeError
    || error instanceof FamilyMembershipRuntimeError
    || error instanceof FamilyInvitationStoreError
    || error instanceof FamilySpaceStoreError
    || error instanceof ConversationStoreError;

  if (!known) throw error;

  const status = input ? 400 : denied ? 403 : missing ? 404 : conflict ? 409 : 503;
  fail(
    code,
    'Family lifecycle owner rejected the request safely',
    status,
    error?.details ?? null
  );
}

export function executeBrowserFamilyLifecycle({
  home,
  operation,
  intent,
  currentAuthorityProjection,
  observedAt,
  instanceRef
} = {}) {
  try {
    const admitted = exactIntent(operation, intent);
    const principalRef = authorityPrincipal(currentAuthorityProjection, observedAt);
    const writerRef = stable(instanceRef, 'instanceRef');

    if (operation === 'HOST') {
      const hosted = hostFamily({
        home,
        currentAuthorityProjection,
        idempotencyKey: admitted.idempotencyKey,
        observedAt,
        instanceRef: `${writerRef}.host`,
        faults: {}
      });
      return Object.freeze({
        schemaVersion: BROWSER_FAMILY_LIFECYCLE_BRIDGE_SCHEMA,
        operation,
        state: 'CURRENT',
        result: safeHost(hosted)
      });
    }

    if (operation === 'JOIN') {
      const invitationProjection = readFamilyInvitation({
        home,
        invitationRef: admitted.invitationRef,
        observedAt
      });
      const invitation = invitationProjection.record;
      if (!invitation) {
        fail(
          'BROWSER_FAMILY_LIFECYCLE_INVITATION_NOT_FOUND',
          'Family invitation is unavailable',
          404
        );
      }
      const prior = invitationSourceGroup(home, invitation);
      const joined = joinFamilyFromInvitation({
        home,
        invitationRef: invitation.invitationRef,
        priorChannelRef: prior.channelRef,
        currentAuthorityProjection,
        observedAt,
        instanceRef: `${writerRef}.join`,
        faults: {}
      });
      return Object.freeze({
        schemaVersion: BROWSER_FAMILY_LIFECYCLE_BRIDGE_SCHEMA,
        operation,
        state: 'CURRENT',
        result: safeJoin(joined)
      });
    }

    const family = readFamilySpace({ home, spaceRef: admitted.spaceRef });
    if (family.state !== 'CURRENT' || !family.record) {
      fail(
        'BROWSER_FAMILY_LIFECYCLE_FAMILY_NOT_FOUND',
        'Family Space is unavailable',
        404
      );
    }
    const member = family.record.members.find(
      (candidate) => candidate.principalRef === principalRef
    );
    if (!member) {
      fail(
        'BROWSER_FAMILY_LIFECYCLE_MEMBER_DENIED',
        'Authenticated principal is not a member of this Family',
        403
      );
    }

    let prior;
    let expectedRevision;
    let expectedMembershipGeneration;
    if (member.status === 'ACTIVE') {
      prior = currentFamilyGroup(home, family.record);
      expectedRevision = family.record.revision;
      expectedMembershipGeneration = family.record.membershipGeneration;
    } else if (member.status === 'LEFT') {
      if (family.record.transitionRef !== leaveTransitionRef(member)) {
        fail(
          'BROWSER_FAMILY_LIFECYCLE_LEAVE_RECOVERY_STALE',
          'Current Family state is not the exact immediate self-LEAVE child',
          409
        );
      }
      prior = priorLeaveGroup(home, family.record, principalRef);
      expectedRevision = family.record.revision - 1;
      expectedMembershipGeneration = family.record.membershipGeneration - 1;
    } else {
      fail(
        'BROWSER_FAMILY_LIFECYCLE_MEMBER_DENIED',
        'Authenticated principal is not active or exactly recoverable after self-LEAVE',
        403
      );
    }

    const left = leaveFamilyAndContinueConversation({
      home,
      spaceRef: family.record.spaceRef,
      priorChannelRef: prior.channelRef,
      currentPrincipalRef: principalRef,
      expectedRevision,
      expectedMembershipGeneration,
      observedAt,
      instanceRef: `${writerRef}.leave`,
      faults: {}
    });
    return Object.freeze({
      schemaVersion: BROWSER_FAMILY_LIFECYCLE_BRIDGE_SCHEMA,
      operation,
      state: 'CURRENT',
      result: safeLeave(left)
    });
  } catch (error) {
    return sanitizeOwnerError(error);
  }
}

// [VXG RealForever]
