import {
  createRelationship,
  exportRelationship,
  listRelationships,
  readRelationship,
  recoverAbandonedRelationshipWriter,
  relationshipRefFor,
  transitionRelationship
} from './relationships-store.mjs';

export const BROWSER_RELATIONSHIPS_PERSISTENCE_SCHEMA = 'vexlife.browser-relationships-persistence/v1';
export const BROWSER_RELATIONSHIPS_PREPARED_SCHEMA = 'vexlife.browser-relationships-prepared/v1';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const CLASSES = new Set(['FRIEND', 'FAMILY', 'COLLABORATOR', 'OTHER']);
const ACTIONS = new Set(['BLOCK', 'REVOKE', 'WITHDRAW', 'DISCONNECT', 'RECONNECT', 'UPDATE_CURRENTNESS', 'TOMBSTONE']);
const PREPARE_KEYS = new Set([
  'counterpartParticipantRef','counterpartCurrentKeyRef','localRelationshipClass','invitationRef',
  'invitationCurrentnessRef','observedAt','instanceRef','lastAcceptedPeerCurrentnessRef','routeRef',
  'sessionGeneration','deliveryObservationRef'
]);
const PREPARED_KEYS = new Set([
  'schemaVersion','state','relationshipRef','counterpartParticipantRef','counterpartCurrentKeyRef',
  'localRelationshipClass','invitationRef','invitationCurrentnessRef','observedAt','instanceRef',
  'lastAcceptedPeerCurrentnessRef','routeRef','sessionGeneration','deliveryObservationRef','effects'
]);
const TRANSITION_KEYS = new Set([
  'counterpartParticipantRef','action','expectedRevision','observedAt','instanceRef','counterpartCurrentKeyRef',
  'invitationCurrentnessRef','lastAcceptedPeerCurrentnessRef','routeRef','sessionGeneration',
  'deliveryObservationRef','recoveryOrTombstoneRef'
]);
const NO_EFFECTS = Object.freeze({
  relationshipMutationPerformed:false, canonicalRelationshipPersisted:false, networkEffectPerformed:false,
  providerEffectPerformed:false, MemoryEffectPerformed:false, HomeLayoutEffectPerformed:false,
  modelRuntimePerformed:false, publicationPerformed:false, publicSearchPerformed:false,
  semanticAcknowledgementCreated:false, reciprocalFriendshipCreated:false
});

export class BrowserRelationshipsPersistenceError extends Error {
  constructor(code, message) { super(message); this.name='BrowserRelationshipsPersistenceError'; this.code=code; }
}
function fail(code,message){ throw new BrowserRelationshipsPersistenceError(code,message); }
function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('RELATIONSHIPS_PERSISTENCE_INPUT_INVALID', `${label} must be one object`);
  const extra=Object.keys(value).find((key)=>!keys.has(key));
  if (extra) fail('RELATIONSHIPS_PERSISTENCE_INPUT_INVALID', `${label} contains unadmitted field ${extra}`);
  return value;
}
function ref(value,label,optional=false) {
  if (optional && (value===undefined || value===null)) return null;
  if (typeof value!=='string' || !REF.test(value)) fail('RELATIONSHIPS_PERSISTENCE_IDENTITY_INVALID', `${label} must be one lowercase portable canonical ref`);
  return value;
}
function timestamp(value,label='observedAt') {
  if (typeof value!=='string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString()!==value) fail('RELATIONSHIPS_PERSISTENCE_INPUT_INVALID', `${label} must be canonical ISO-8601 UTC`);
  return value;
}
function session(value) {
  if (value===undefined || value===null) return null;
  if (!Number.isSafeInteger(value) || value<0) fail('RELATIONSHIPS_PERSISTENCE_INPUT_INVALID','sessionGeneration must be a non-negative safe integer');
  return value;
}
function localOwner(value) {
  const keys=new Set(['localParticipantRef','localStateRootRef']);
  exactObject(value,keys,'local owner binding');
  return Object.freeze({localParticipantRef:ref(value.localParticipantRef,'localParticipantRef'),localStateRootRef:ref(value.localStateRootRef,'localStateRootRef')});
}
function reducedEffects(value) {
  if (!value || typeof value!=='object') return NO_EFFECTS;
  return Object.freeze(Object.fromEntries(Object.keys(NO_EFFECTS).map((key)=>[key,value[key]===true])));
}
function verifyNoForbiddenEffect(effects) {
  for (const key of ['networkEffectPerformed','providerEffectPerformed','MemoryEffectPerformed','HomeLayoutEffectPerformed','modelRuntimePerformed','publicationPerformed','publicSearchPerformed','semanticAcknowledgementCreated','reciprocalFriendshipCreated']) {
    if (effects[key]===true) fail('RELATIONSHIPS_PERSISTENCE_EFFECT_CONTRADICTION', `${key} is forbidden for browser persistence`);
  }
}

export function createBrowserRelationshipsPersistenceBridge({ home, localOwnerBinding }) {
  if (typeof home!=='string' || !home) fail('RELATIONSHIPS_PERSISTENCE_HOME_REQUIRED','one explicit Vex Home storage root is required');
  if (!localOwnerBinding) fail('RELATIONSHIPS_IDENTITY_BINDING_REQUIRED','explicit local participant and state-root binding is required');
  const owner=localOwner(localOwnerBinding);
  const ownerInput=(counterpartParticipantRef)=>({home,...owner,counterpartParticipantRef:ref(counterpartParticipantRef,'counterpartParticipantRef')});

  function prepare(value) {
    exactObject(value,PREPARE_KEYS,'prepare input');
    const counterpartParticipantRef=ref(value.counterpartParticipantRef,'counterpartParticipantRef');
    const counterpartCurrentKeyRef=ref(value.counterpartCurrentKeyRef,'counterpartCurrentKeyRef');
    if (!CLASSES.has(value.localRelationshipClass)) fail('RELATIONSHIPS_PERSISTENCE_INPUT_INVALID','localRelationshipClass is not admitted');
    const invitationRef=ref(value.invitationRef,'invitationRef');
    const invitationCurrentnessRef=ref(value.invitationCurrentnessRef,'invitationCurrentnessRef');
    const observedAt=timestamp(value.observedAt);
    const instanceRef=ref(value.instanceRef,'instanceRef');
    const prepared=Object.freeze({
      schemaVersion:BROWSER_RELATIONSHIPS_PREPARED_SCHEMA,
      state:'PREPARED_NO_EFFECT',
      relationshipRef:relationshipRefFor({localParticipantRef:owner.localParticipantRef,counterpartParticipantRef}),
      counterpartParticipantRef,counterpartCurrentKeyRef,localRelationshipClass:value.localRelationshipClass,
      invitationRef,invitationCurrentnessRef,observedAt,instanceRef,
      lastAcceptedPeerCurrentnessRef:ref(value.lastAcceptedPeerCurrentnessRef,'lastAcceptedPeerCurrentnessRef',true),
      routeRef:ref(value.routeRef,'routeRef',true),sessionGeneration:session(value.sessionGeneration),
      deliveryObservationRef:ref(value.deliveryObservationRef,'deliveryObservationRef',true),effects:NO_EFFECTS
    });
    return prepared;
  }

  function validatePrepared(value) {
    exactObject(value,PREPARED_KEYS,'prepared relationship');
    if (value.schemaVersion!==BROWSER_RELATIONSHIPS_PREPARED_SCHEMA || value.state!=='PREPARED_NO_EFFECT') fail('RELATIONSHIPS_PERSISTENCE_PREPARED_INVALID','prepared relationship identity is invalid');
    const expected=prepare({
      counterpartParticipantRef:value.counterpartParticipantRef,counterpartCurrentKeyRef:value.counterpartCurrentKeyRef,
      localRelationshipClass:value.localRelationshipClass,invitationRef:value.invitationRef,invitationCurrentnessRef:value.invitationCurrentnessRef,
      observedAt:value.observedAt,instanceRef:value.instanceRef,lastAcceptedPeerCurrentnessRef:value.lastAcceptedPeerCurrentnessRef,
      routeRef:value.routeRef,sessionGeneration:value.sessionGeneration,deliveryObservationRef:value.deliveryObservationRef
    });
    if (expected.relationshipRef!==value.relationshipRef) fail('RELATIONSHIPS_PERSISTENCE_PREPARED_INVALID','prepared relationshipRef does not match explicit identities');
    if (!value.effects || Object.entries(NO_EFFECTS).some(([key,expectedValue])=>value.effects[key]!==expectedValue)) fail('RELATIONSHIPS_PERSISTENCE_PREPARED_INVALID','prepared no-effect truth is invalid');
    return expected;
  }

  function commit(value) {
    const prepared=validatePrepared(value);
    const receipt=createRelationship({home,...owner,
      counterpartParticipantRef:prepared.counterpartParticipantRef,counterpartCurrentKeyRef:prepared.counterpartCurrentKeyRef,
      localRelationshipClass:prepared.localRelationshipClass,invitationRef:prepared.invitationRef,
      invitationCurrentnessRef:prepared.invitationCurrentnessRef,observedAt:prepared.observedAt,instanceRef:prepared.instanceRef,
      lastAcceptedPeerCurrentnessRef:prepared.lastAcceptedPeerCurrentnessRef,routeRef:prepared.routeRef,
      sessionGeneration:prepared.sessionGeneration,deliveryObservationRef:prepared.deliveryObservationRef
    });
    const effects=reducedEffects(receipt.effects); verifyNoForbiddenEffect(effects);
    if (receipt.state!=='COMMITTED' || receipt.relationshipPersisted!==true) fail('RELATIONSHIPS_PERSISTENCE_RECEIPT_REQUIRED','canonical store did not return one durable commit receipt');
    const current=readRelationship(ownerInput(prepared.counterpartParticipantRef));
    if (current.relationshipRef!==receipt.relationshipRef || current.record.revision!==receipt.revision || current.record.localParticipantRef!==owner.localParticipantRef || current.record.localStateRootRef!==owner.localStateRootRef) fail('RELATIONSHIPS_PERSISTENCE_READBACK_MISMATCH','durable receipt and current readback disagree');
    return Object.freeze({schemaVersion:BROWSER_RELATIONSHIPS_PERSISTENCE_SCHEMA,state:'SAVED',relationshipRef:receipt.relationshipRef,receipt,current,effects});
  }

  function read(value) {
    exactObject(value,new Set(['counterpartParticipantRef']),'read input');
    return readRelationship(ownerInput(value.counterpartParticipantRef));
  }
  function list(value={}) {
    exactObject(value,new Set(['maxRelationships','includeTombstoned']),'list input');
    return listRelationships({home,...owner,maxRelationships:value.maxRelationships,includeTombstoned:value.includeTombstoned});
  }
  function transition(value) {
    exactObject(value,TRANSITION_KEYS,'transition input');
    const action=value.action;
    if (!ACTIONS.has(action)) fail('RELATIONSHIPS_PERSISTENCE_INPUT_INVALID','transition action is not admitted');
    const receipt=transitionRelationship({home,...owner,counterpartParticipantRef:ref(value.counterpartParticipantRef,'counterpartParticipantRef'),action,
      expectedRevision:value.expectedRevision,observedAt:timestamp(value.observedAt),instanceRef:ref(value.instanceRef,'instanceRef'),
      counterpartCurrentKeyRef:ref(value.counterpartCurrentKeyRef,'counterpartCurrentKeyRef',true),
      invitationCurrentnessRef:ref(value.invitationCurrentnessRef,'invitationCurrentnessRef',true),
      lastAcceptedPeerCurrentnessRef:ref(value.lastAcceptedPeerCurrentnessRef,'lastAcceptedPeerCurrentnessRef',true),
      routeRef:ref(value.routeRef,'routeRef',true),sessionGeneration:session(value.sessionGeneration),
      deliveryObservationRef:ref(value.deliveryObservationRef,'deliveryObservationRef',true),
      recoveryOrTombstoneRef:ref(value.recoveryOrTombstoneRef,'recoveryOrTombstoneRef',true)
    });
    const effects=reducedEffects(receipt.effects); verifyNoForbiddenEffect(effects);
    const current=readRelationship(ownerInput(value.counterpartParticipantRef));
    if (current.record.revision!==receipt.revision) fail('RELATIONSHIPS_PERSISTENCE_READBACK_MISMATCH','transition receipt and current readback disagree');
    return Object.freeze({schemaVersion:BROWSER_RELATIONSHIPS_PERSISTENCE_SCHEMA,state:'SAVED',relationshipRef:receipt.relationshipRef,receipt,current,effects});
  }
  function exportCurrent(value) {
    exactObject(value,new Set(['counterpartParticipantRef','maxTransitions']),'export input');
    return exportRelationship({...ownerInput(value.counterpartParticipantRef),maxTransitions:value.maxTransitions});
  }
  function recoverWriter(value) {
    exactObject(value,new Set(['expectedAbandonedInstanceRef']),'writer recovery input');
    return recoverAbandonedRelationshipWriter({home,...owner,expectedAbandonedInstanceRef:ref(value.expectedAbandonedInstanceRef,'expectedAbandonedInstanceRef')});
  }
  function tombstone(value) {
    exactObject(value,new Set(['counterpartParticipantRef','expectedRevision','observedAt','instanceRef']),'tombstone input');
    return transition({counterpartParticipantRef:value.counterpartParticipantRef,action:'TOMBSTONE',expectedRevision:value.expectedRevision,observedAt:value.observedAt,instanceRef:value.instanceRef,
      counterpartCurrentKeyRef:null,invitationCurrentnessRef:null,lastAcceptedPeerCurrentnessRef:null,routeRef:null,sessionGeneration:null,deliveryObservationRef:null,recoveryOrTombstoneRef:null});
  }
  return Object.freeze({ownerBinding:Object.freeze({...owner}),prepare,commit,read,list,transition,exportCurrent,recoverWriter,tombstone});
}

// [VXG RealForever]
