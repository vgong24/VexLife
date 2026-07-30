import { semanticHash } from './utils.mjs';

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
