import {
  acceptFamilyInvitation,
  readFamilyInvitation
} from './family-invitation-store.mjs';
import {
  addFamilyMember,
  readFamilySpace
} from './family-space-store.mjs';
import {
  createFamilyChannel,
  FAMILY_HISTORY_FROM_JOIN_POLICY
} from './family-conversation.mjs';
import {
  materializeConversationChannel,
  readConversationChannelBinding
} from './conversation-store.mjs';
import { deriveFamilySuccessorChannelRef } from './family-membership-runtime.mjs';
import { deriveFamilyPrincipalBindingRef } from './family-host-runtime.mjs';
import { semanticHash } from './utils.mjs';

export const FAMILY_JOIN_RUNTIME_SCHEMA = 'vexlife.family-join-runtime/v1';
const REF=/^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const INPUT_KEYS=new Set(['home','invitationRef','priorChannelRef','currentAuthorityProjection','observedAt','instanceRef','faults']);
const FAULT_KEYS=new Set(['failAfterMembershipTransition','failAfterChannelMaterialization','failAfterInvitationAcceptance']);

export class FamilyJoinRuntimeError extends Error {
  constructor(code,message,details=null){super(message);this.name='FamilyJoinRuntimeError';this.code=code;this.details=details;}
}
const fail=(code,message,details=null)=>{throw new FamilyJoinRuntimeError(code,message,details);};
function exactKeys(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)) fail('FAMILY_JOIN_INPUT_INVALID',label+' must be one object');
  const extra=Object.keys(value).find((key)=>!keys.has(key));
  if(extra) fail('FAMILY_JOIN_UNTRUSTED_FIELD',label+' contains untrusted field '+extra);
}
function boundedKeys(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)) fail('FAMILY_JOIN_INPUT_INVALID',label+' must be one object');
  const extra=Object.keys(value).find((key)=>!keys.has(key));
  if(extra) fail('FAMILY_JOIN_UNTRUSTED_FIELD',label+' contains untrusted field '+extra);
}
function stable(value,label){
  if(typeof value!=='string'||!REF.test(value)) fail('FAMILY_JOIN_INPUT_INVALID',label+' must be one portable lowercase stable ref');
  return value;
}
function time(value,label){
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value) fail('FAMILY_JOIN_INPUT_INVALID',label+' must be canonical ISO-8601 UTC');
  return value;
}
function currentSpace(home,spaceRef){
  const result=readFamilySpace({home,spaceRef});
  if(result.state!=='CURRENT'||!result.record) fail('FAMILY_JOIN_FAMILY_NOT_FOUND','Family Space is unavailable');
  return result.record;
}
function priorChannel(home,priorChannelRef,invitation){
  const projection=readConversationChannelBinding({home,channelRef:priorChannelRef});
  const channel=projection.channel;
  const binding=channel?.familySpaceBinding;
  if(
    projection.state!=='CURRENT'||!channel||channel.kind!=='GROUP'||binding?.audienceKind!=='GROUP'
    ||binding.spaceRef!==invitation.spaceRef
    ||binding.familySpaceRecordSha256!==invitation.expectedFamilyRecordSha256
    ||binding.membershipGeneration!==invitation.expectedMembershipGeneration
    ||binding.historyVisibilityPolicyRef!==FAMILY_HISTORY_FROM_JOIN_POLICY
    ||typeof binding.familyCompanionLineageRef!=='string'
  ) fail('FAMILY_JOIN_CHANNEL_MISMATCH','prior channel is not the exact invitation source Family GROUP binding');
  return channel;
}
function exactJoinedMember(record,invitation,principalRef,principalBindingRef){
  if(
    record.revision!==invitation.expectedFamilyRevision+1
    ||record.membershipGeneration!==invitation.expectedMembershipGeneration+1
    ||record.priorRecordSha256!==invitation.expectedFamilyRecordSha256
  ) fail('FAMILY_JOIN_STALE','Family state is not the exact invitation-bound N-to-N+1 result');
  const member=record.members.find((candidate)=>candidate.principalRef===principalRef);
  if(
    !member||member.status!=='ACTIVE'||member.principalBindingRef!==principalBindingRef
    ||member.role!=='MEMBER'||member.historyVisibilityPolicyRef!==FAMILY_HISTORY_FROM_JOIN_POLICY
    ||record.transitionRef!==`transition.vex-family.member.add.${member.membershipRef}`
  ) fail('FAMILY_JOIN_STALE','Family state is not the exact recoverable invitation-bound add');
  return member;
}

export function joinFamilyFromInvitation(input={}){
  exactKeys(input,INPUT_KEYS,'join request');
  boundedKeys(input.faults,FAULT_KEYS,'join request faults');
  const invitationRef=stable(input.invitationRef,'invitationRef');
  const priorChannelRef=stable(input.priorChannelRef,'priorChannelRef');
  const observedAt=time(input.observedAt,'observedAt');
  const instanceRef=stable(input.instanceRef,'instanceRef');

  const principalBindingRef=deriveFamilyPrincipalBindingRef(input.currentAuthorityProjection,observedAt);
  const principalRef=stable(input.currentAuthorityProjection?.membership?.principalRef,'currentAuthorityProjection.membership.principalRef');

  const invitationProjection=readFamilyInvitation({home:input.home,invitationRef,observedAt});
  const invitation=invitationProjection.record;
  if(!invitation) fail('FAMILY_JOIN_INVITATION_NOT_FOUND','Family invitation is unavailable');

  if(invitation.state==='ACCEPTED'){
    if(invitation.acceptedPrincipalRefOrNull!==principalRef||invitation.acceptedMembershipRefOrNull==null||invitation.acceptedChannelRefOrNull==null){
      fail('FAMILY_JOIN_INVITATION_PRINCIPAL_MISMATCH','accepted invitation belongs to a different principal');
    }
    return Object.freeze({
      schemaVersion:FAMILY_JOIN_RUNTIME_SCHEMA,state:'IDEMPOTENT_ACCEPTED',invitationRef,spaceRef:invitation.spaceRef,
      principalRef,principalBindingRef:invitation.acceptedPrincipalBindingRefOrNull,membershipRef:invitation.acceptedMembershipRefOrNull,
      membershipGeneration:invitation.acceptedMembershipGenerationOrNull,familySpaceRecordSha256:invitation.acceptedFamilyRecordSha256OrNull,
      successorChannelRef:invitation.acceptedChannelRefOrNull,membershipTransitionPerformed:false,
      channelMaterializationPerformed:false,invitationAcceptancePerformed:false
    });
  }
  if(invitation.state!=='PENDING') fail('FAMILY_JOIN_INVITATION_TERMINAL','Family invitation is not PENDING');

  const prior=priorChannel(input.home,priorChannelRef,invitation);
  let family=currentSpace(input.home,invitation.spaceRef);
  let member;
  let membershipTransitionPerformed=false;

  if(family.membershipGeneration===invitation.expectedMembershipGeneration){
    if(family.revision!==invitation.expectedFamilyRevision||family.recordSha256!==invitation.expectedFamilyRecordSha256){
      fail('FAMILY_JOIN_STALE','Family state does not match exact invitation source generation');
    }
    if(Date.parse(observedAt)>=Date.parse(invitation.expiresAt)){
      fail('FAMILY_JOIN_INVITATION_EXPIRED','expired PENDING invitation cannot begin a new Join effect');
    }
    const result=addFamilyMember({
      home:input.home,spaceRef:invitation.spaceRef,actorPrincipalRef:invitation.inviterPrincipalRef,
      principalRef,principalBindingRef,role:'MEMBER',historyVisibilityPolicyRef:FAMILY_HISTORY_FROM_JOIN_POLICY,
      expectedRevision:invitation.expectedFamilyRevision,expectedMembershipGeneration:invitation.expectedMembershipGeneration,
      observedAt,instanceRef:`${instanceRef}.membership`
    });
    family=result.record;
    membershipTransitionPerformed=result.state==='MEMBER_ADDED';
    member=exactJoinedMember(family,invitation,principalRef,principalBindingRef);
    if(input.faults.failAfterMembershipTransition===true){
      fail('FAMILY_JOIN_CHANNEL_CONTINUATION_REQUIRED','Family membership add is durable but Join continuation was intentionally interrupted',{
        invitationRef,familySpaceRecordSha256:family.recordSha256,membershipGeneration:family.membershipGeneration
      });
    }
  }else if(family.membershipGeneration===invitation.expectedMembershipGeneration+1){
    member=exactJoinedMember(family,invitation,principalRef,principalBindingRef);
  }else{
    fail('FAMILY_JOIN_STALE','Family generation moved beyond the exact recoverable Join result');
  }

  if(Date.parse(member.joinedAt)>=Date.parse(invitation.expiresAt)){
    fail('FAMILY_JOIN_INVITATION_EXPIRED','canonical member add did not occur before invitation expiry');
  }

  const successorChannelRef=deriveFamilySuccessorChannelRef({
    spaceRef:family.spaceRef,threadRef:prior.threadRef,membershipGeneration:family.membershipGeneration,
    familySpaceRecordSha256:family.recordSha256,familyCompanionLineageRef:family.familyCompanionLineageRef
  });
  const successor=createFamilyChannel({
    channelRef:successorChannelRef,threadRef:prior.threadRef,kind:'GROUP',familySpaceRecord:family,
    labelStringRef:prior.labelStringRef,createdAt:family.updatedAt
  });
  const materialized=materializeConversationChannel({
    home:input.home,channel:successor,
    instanceRef:`${instanceRef}.channel.${semanticHash({invitationRef,successorChannelRef}).slice(0,16)}`,
    observedAt:successor.createdAt
  });
  const channelMaterializationPerformed=materialized.state==='MATERIALIZED';

  if(input.faults.failAfterChannelMaterialization===true){
    fail('FAMILY_JOIN_INVITATION_FINALIZATION_REQUIRED','Family membership and successor channel are durable but invitation finalization was intentionally interrupted',{invitationRef,successorChannelRef});
  }

  const accepted=acceptFamilyInvitation({
    home:input.home,invitationRef,expectedInvitationRevision:invitation.revision,
    acceptedPrincipalRef:principalRef,acceptedPrincipalBindingRef:member.principalBindingRef,
    expectedAcceptedFamilyRecordSha256:family.recordSha256,expectedAcceptedFamilyRevision:family.revision,
    expectedAcceptedMembershipGeneration:family.membershipGeneration,acceptedChannelRef:successorChannelRef,
    acceptedAt:member.joinedAt,observedAt,instanceRef:`${instanceRef}.invitation`,faults:{}
  });
  const invitationAcceptancePerformed=accepted.state==='INVITATION_ACCEPTED';

  if(input.faults.failAfterInvitationAcceptance===true){
    fail('FAMILY_JOIN_RESULT_NOT_EMITTED','Join is durably accepted but result emission was intentionally interrupted',{invitationRef,successorChannelRef});
  }

  return Object.freeze({
    schemaVersion:FAMILY_JOIN_RUNTIME_SCHEMA,
    state:membershipTransitionPerformed?'FAMILY_JOIN_ACCEPTED':'RECOVERED_FAMILY_JOIN_ACCEPTED',
    invitationRef,spaceRef:family.spaceRef,principalRef,principalBindingRef:member.principalBindingRef,membershipRef:member.membershipRef,
    priorChannelRef:prior.channelRef,successorChannelRef,threadRef:successor.threadRef,
    priorMembershipGeneration:invitation.expectedMembershipGeneration,membershipGeneration:family.membershipGeneration,
    familySpaceRecordSha256:family.recordSha256,membershipTransitionPerformed,channelMaterializationPerformed,
    invitationAcceptancePerformed,effects:Object.freeze({
      invitationStateMutation:invitationAcceptancePerformed,familyMembershipMutation:membershipTransitionPerformed,
      conversationChannelMutation:channelMaterializationPerformed,networkDelivery:false,relationshipsMutation:false,
      modelInvocation:false,memoryMutation:false,publicationMutation:false
    })
  });
}
// [VXG RealForever]
