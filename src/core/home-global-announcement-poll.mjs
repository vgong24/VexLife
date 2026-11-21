import { evaluateRemoteRequest } from './home-bridge.mjs';
import {
  HomeBridgeSessionAuthorityError,
  validateHomeBridgeSessionAuthorityProjection
} from './home-bridge-session-authority.mjs';
import {
  GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
  GlobalAnnouncementContractError,
  validateGlobalAnnouncementPollRequest
} from './global-announcement-contract.mjs';
import { semanticHash } from './utils.mjs';

export const HOME_GLOBAL_ANNOUNCEMENT_POLL_ACTION_REF =
  'action.global-announcement.home-routed-poll';
export const GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF =
  'capability.vexlife.global-announcement-poll';
export const HOME_GLOBAL_ANNOUNCEMENT_POLL_ADMISSION_SCHEMA =
  'vexlife.home-global-announcement-poll-admission/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;

class HomeGlobalAnnouncementPollAdmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HomeGlobalAnnouncementPollAdmissionError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new HomeGlobalAnnouncementPollAdmissionError(code, message);
};

function safeRef(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('GLOBAL_ANNOUNCEMENT_HOME_ADMISSION_INPUT_INVALID', `${label} must be one safe opaque ref`);
  }
  return value;
}

function refs(values, label) {
  if (!Array.isArray(values)) {
    fail('GLOBAL_ANNOUNCEMENT_HOME_ADMISSION_INPUT_INVALID', `${label} must be a ref array`);
  }
  const normalized = values.map((value, index) => safeRef(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('GLOBAL_ANNOUNCEMENT_HOME_ADMISSION_INPUT_INVALID', `${label} must not contain duplicate refs`);
  }
  return Object.freeze([...normalized].sort());
}

function normalizeClock(value) {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) {
    fail('GLOBAL_ANNOUNCEMENT_HOME_ADMISSION_INPUT_INVALID', 'current time is invalid');
  }
}

function noEffectTruth() {
  return Object.freeze({
    admissionEqualsProviderExecution: false,
    providerRequestPerformed: false,
    networkEffectPerformed: false,
    providerResultPersisted: false,
    HomePayloadReadOrWrite: false,
    announcementFamilyStateMutation: false,
    notificationDecisionPerformed: false,
    remoteHomeWriteGranted: false,
    memoryMutation: false,
    publication: false
  });
}

function unavailable(reason, details = {}) {
  return Object.freeze({
    schemaVersion: HOME_GLOBAL_ANNOUNCEMENT_POLL_ADMISSION_SCHEMA,
    contractRef: GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
    actionRef: HOME_GLOBAL_ANNOUNCEMENT_POLL_ACTION_REF,
    capabilityRef: GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF,
    state: 'HOME_ROUTED_GLOBAL_ANNOUNCEMENT_POLL_UNAVAILABLE',
    reason,
    details: Object.freeze(structuredClone(details)),
    pollRequest: null,
    canonicalWriter: null,
    remoteWriterGranted: false,
    standingHomeAuthority: false,
    truth: noEffectTruth()
  });
}

export function evaluateHomeGlobalAnnouncementPollAdmission({
  pollRequest,
  sessionAuthority,
  now,
  roleCapabilityRefs = [],
  projectCapabilityRefs = [],
  resourceCapabilityRefs = [],
  rawModelEndpointExposed = false
} = {}) {
  try {
    normalizeClock(now);
    const requestIntent = validateGlobalAnnouncementPollRequest(pollRequest);
    const authority = validateHomeBridgeSessionAuthorityProjection(sessionAuthority);
    const roleScope = refs(roleCapabilityRefs, 'roleCapabilityRefs');
    const projectScope = refs(projectCapabilityRefs, 'projectCapabilityRefs');
    const resourceScope = refs(resourceCapabilityRefs, 'resourceCapabilityRefs');

    const request = Object.freeze({
      requestRef: requestIntent.requestRef,
      deviceRef: authority.deviceRef,
      leaseRef: authority.lease.leaseRef,
      channelRef: 'channel.vexlife.global-announcement-poll',
      speakerRef: authority.principalRef,
      actionRef: HOME_GLOBAL_ANNOUNCEMENT_POLL_ACTION_REF,
      idempotencyKey: null
    });
    const admission = evaluateRemoteRequest({
      request,
      membership: authority.membership,
      lease: authority.lease,
      now,
      currentRevocationGeneration: authority.currentRevocationGeneration,
      registeredActionRefs: [HOME_GLOBAL_ANNOUNCEMENT_POLL_ACTION_REF],
      requiredCapabilityRefs: [GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF],
      roleCapabilityRefs: roleScope,
      projectCapabilityRefs: projectScope,
      resourceCapabilityRefs: resourceScope,
      rawModelEndpointExposed
    });
    if (admission.state !== 'REMOTE_REQUEST_ADMITTED') {
      return unavailable(`HOME_BRIDGE_${admission.state}`, {
        bridgeReason: admission.reason ?? null
      });
    }
    if (!admission.effectiveCapabilityRefs.includes(GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF)) {
      return unavailable('HOME_BRIDGE_CAPABILITY_INTERSECTION_MISSING');
    }
    if (admission.canonicalWriter !== 'DESKTOP_HOME_NODE' || admission.remoteWriterGranted !== false) {
      return unavailable('HOME_BRIDGE_WRITER_BOUNDARY_COLLAPSE');
    }

    const pollRequestHash = semanticHash(requestIntent);
    const admissionRef = `admission.vexlife.global-announcement-poll.${semanticHash({
      requestHash: admission.requestHash,
      pollRequestHash,
      authorityReceiptRef: authority.authorityReceiptRef
    }).slice(0, 32)}`;

    return Object.freeze({
      schemaVersion: HOME_GLOBAL_ANNOUNCEMENT_POLL_ADMISSION_SCHEMA,
      contractRef: GLOBAL_ANNOUNCEMENT_CONTRACT_REF,
      actionRef: HOME_GLOBAL_ANNOUNCEMENT_POLL_ACTION_REF,
      capabilityRef: GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF,
      state: 'HOME_ROUTED_GLOBAL_ANNOUNCEMENT_POLL_ADMITTED',
      admissionRef,
      requestHash: admission.requestHash,
      pollRequestHash,
      authorityReceiptRef: authority.authorityReceiptRef,
      sourceReceiptRefs: Object.freeze([...authority.sourceReceiptRefs]),
      currentnessRefs: Object.freeze([...authority.currentnessRefs]),
      pollRequest: requestIntent,
      admittedCapabilityRefs: Object.freeze([GLOBAL_ANNOUNCEMENT_POLL_CAPABILITY_REF]),
      canonicalWriter: admission.canonicalWriter,
      remoteWriterGranted: false,
      standingHomeAuthority: false,
      truth: noEffectTruth()
    });
  } catch (error) {
    if (error instanceof GlobalAnnouncementContractError
        || error instanceof HomeBridgeSessionAuthorityError
        || error instanceof HomeGlobalAnnouncementPollAdmissionError) {
      return unavailable(error.code);
    }
    throw error;
  }
}

// [VXG RealForever]
