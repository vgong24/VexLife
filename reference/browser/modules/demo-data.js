export function conversationKey(projectRef, threadRef, channelRef) {
  return `${projectRef}::${threadRef}::${channelRef}`;
}

export function createDemoData({ loadJson, storage = globalThis.localStorage }) {
  const projects = [
    {
      projectRef: 'project.vex-home-product',
      stringRef: 'project.vex-home.name',
      descriptionRef: 'project.vex-home.description',
      threads: [
        {
          threadRef: 'thread.vex-home.guided-fresh',
          stringRef: 'thread.guided-fresh.name',
          topicRef: 'thread.guided-fresh.topic',
          descriptionRef: 'thread.guided-fresh.description',
          count: 2
        },
        {
          threadRef: 'thread.vex-home.product-workshop',
          stringRef: 'thread.product-workshop.name',
          topicRef: 'thread.product-workshop.topic',
          descriptionRef: 'thread.product-workshop.description',
          count: 0
        }
      ]
    },
    {
      projectRef: 'project.local-vex',
      stringRef: 'project.local-vex.name',
      descriptionRef: 'project.local-vex.description',
      threads: [
        {
          threadRef: 'thread.local-vex.foundation',
          stringRef: 'thread.foundation.name',
          topicRef: 'thread.foundation.topic',
          descriptionRef: 'thread.foundation.description',
          count: 1
        }
      ]
    },
    {
      projectRef: 'project.self-development',
      stringRef: 'project.self-development.name',
      descriptionRef: 'project.self-development.description',
      threads: [
        {
          threadRef: 'thread.self-development.open-conversation',
          stringRef: 'thread.open-conversation.name',
          topicRef: 'thread.open-conversation.topic',
          descriptionRef: 'thread.open-conversation.description',
          count: 5
        }
      ]
    },
    {
      projectRef: 'project.vexlife.root-hub',
      stringRef: 'project.root-hub.name',
      descriptionRef: 'project.root-hub.description',
      threads: [
        {
          threadRef: 'thread.root-hub.welcome',
          stringRef: 'thread.root-welcome.name',
          topicRef: 'thread.root-welcome.topic',
          descriptionRef: 'thread.root-welcome.description',
          count: 4
        }
      ]
    }
  ];

  const roles = {
    victor: { actorRef: 'person.victor-gong', label: 'Victor', avatar: 'VG' },
    companion: { actorRef: 'role.vex.companion', labelRef: 'role.companion.name', avatar: 'V' },
    guide: { actorRef: 'role.vex.guide', labelRef: 'role.guide.name', avatar: '✦' },
    root: { actorRef: 'role.vex.root-hub', labelRef: 'role.root-hub.name', avatar: 'R' }
  };

  const channels = [
    { projectRef: 'project.vex-home-product', threadRef: 'thread.vex-home.guided-fresh', channelRef: 'channel.vex-home.guided-fresh.companion', labelRef: 'channel.companion.name', kind: 'DIRECT', roleKey: 'companion', memberKeys: ['victor', 'companion'] },
    { projectRef: 'project.vex-home-product', threadRef: 'thread.vex-home.guided-fresh', channelRef: 'channel.vex-home.guided-fresh.guide', labelRef: 'channel.guide.name', kind: 'DIRECT', roleKey: 'guide', memberKeys: ['victor', 'guide'] },
    { projectRef: 'project.vex-home-product', threadRef: 'thread.vex-home.product-workshop', channelRef: 'channel.vex-home.product-workshop.companion', labelRef: 'channel.companion.name', kind: 'DIRECT', roleKey: 'companion', memberKeys: ['victor', 'companion'] },
    { projectRef: 'project.vex-home-product', threadRef: 'thread.vex-home.product-workshop', channelRef: 'channel.vex-home.product-workshop.guide', labelRef: 'channel.guide.name', kind: 'DIRECT', roleKey: 'guide', memberKeys: ['victor', 'guide'] },
    { projectRef: 'project.local-vex', threadRef: 'thread.local-vex.foundation', channelRef: 'channel.local-vex.foundation.root-hub', labelRef: 'channel.root-hub.name', kind: 'DIRECT', roleKey: 'root', memberKeys: ['victor', 'root'] },
    { projectRef: 'project.local-vex', threadRef: 'thread.local-vex.foundation', channelRef: 'channel.local-vex.foundation.guide', labelRef: 'channel.guide.name', kind: 'DIRECT', roleKey: 'guide', memberKeys: ['victor', 'guide'] },
    { projectRef: 'project.self-development', threadRef: 'thread.self-development.open-conversation', channelRef: 'channel.self-development.companion', labelRef: 'channel.companion.name', kind: 'DIRECT', roleKey: 'companion', memberKeys: ['victor', 'companion'] },
    { projectRef: 'project.self-development', threadRef: 'thread.self-development.open-conversation', channelRef: 'channel.self-development.guide', labelRef: 'channel.guide.name', kind: 'DIRECT', roleKey: 'guide', memberKeys: ['victor', 'guide'] },
    { projectRef: 'project.self-development', threadRef: 'thread.self-development.open-conversation', channelRef: 'channel.self-development.root-hub', labelRef: 'channel.root-hub.name', kind: 'DIRECT', roleKey: 'root', memberKeys: ['victor', 'root'] },
    { projectRef: 'project.self-development', threadRef: 'thread.self-development.open-conversation', channelRef: 'channel.self-development.group', labelRef: 'channel.group.name', kind: 'GROUP', roleKey: 'guide', memberKeys: ['victor', 'companion', 'guide'] },
    { projectRef: 'project.vexlife.root-hub', threadRef: 'thread.root-hub.welcome', channelRef: 'channel.root-hub.welcome.root', labelRef: 'channel.root-hub.name', kind: 'DIRECT', roleKey: 'root', memberKeys: ['victor', 'root'] },
    { projectRef: 'project.vexlife.root-hub', threadRef: 'thread.root-hub.welcome', channelRef: 'channel.root-hub.welcome.guide', labelRef: 'channel.guide.name', kind: 'DIRECT', roleKey: 'guide', memberKeys: ['victor', 'guide'] }
  ];

  function createMessage(channelRef, speakerKey, recipientKeys, payload, sequence) {
    const channel = channels.find((candidate) => candidate.channelRef === channelRef);
    if (!channel) throw new Error(`Unknown channelRef: ${channelRef}`);
    const content = typeof payload === 'string' ? { content: payload } : payload;
    return {
      messageRef: `message.demo.${channelRef}.${sequence}`,
      projectRef: channel.projectRef,
      threadRef: channel.threadRef,
      channelRef,
      speakerKey,
      recipientKeys,
      content: content.content ?? null,
      contentRef: content.contentRef ?? null,
      contentParams: content.contentParams ?? {},
      intentRef: content.intentRef ?? null,
      sequence,
      createdAt: new Date().toISOString()
    };
  }

  const messages = new Map(
    channels.map((channel) => [conversationKey(channel.projectRef, channel.threadRef, channel.channelRef), []])
  );
  const messageList = (channel) => messages.get(conversationKey(channel.projectRef, channel.threadRef, channel.channelRef));
  const seed = (channelRef, speakerKey, recipientKeys, payload) => {
    const channel = channels.find((candidate) => candidate.channelRef === channelRef);
    const list = messageList(channel);
    list.push(createMessage(channelRef, speakerKey, recipientKeys, payload, list.length));
  };

  seed('channel.self-development.companion', 'victor', ['companion'], 'Hey Vex, I want this conversation to keep its meaning without turning into an engineering dashboard.');
  seed('channel.self-development.companion', 'companion', ['victor'], 'Yes. This direct channel belongs to Victor ↔ Vex Companion. I can stay natural here while the system preserves exact sources, current context, and retraceability behind the interface.');
  seed('channel.self-development.guide', 'victor', ['guide'], 'What am I looking at, and who can perceive this message?');
  seed('channel.self-development.guide', 'guide', ['victor'], 'You are in the Self Development project, Open conversation thread, Vex Guide direct channel. Only members of this channel receive its raw message context.');
  seed('channel.self-development.root-hub', 'victor', ['root'], 'Can you give me a portfolio-level view without disrupting the project teams?');
  seed('channel.self-development.root-hub', 'root', ['victor'], 'Yes. I can read compact current projections, route bounded questions down the responsibility lattice, and return attributed answers without keeping every relay permanently active.');
  seed('channel.self-development.group', 'victor', ['companion', 'guide'], 'I added both of you so we can discuss the interface together.');
  seed('channel.self-development.group', 'guide', ['victor', 'companion'], 'The visible presence list is now the source of truth for who receives this group context.');

  const selectedChannelByThread = new Map();
  for (const channel of channels) {
    if (!selectedChannelByThread.has(channel.threadRef)) selectedChannelByThread.set(channel.threadRef, channel.channelRef);
  }
  selectedChannelByThread.set('thread.self-development.open-conversation', 'channel.self-development.companion');

  const storedLanguage = storage?.getItem?.('vexlife.language');
  const state = {
    language: storedLanguage || 'en',
    view: 'chat',
    projectRef: 'project.self-development',
    threadRef: 'thread.self-development.open-conversation',
    channelRef: 'channel.self-development.companion',
    selectedChannelByThread,
    selectedNodeRef: 'element.thread.open-conversation',
    selections: new Map(),
    journey: [],
    guideOpen: storage?.getItem?.('vexlife.guide.open') === 'true',
    guideMinimized: false,
    unread: new Map(),
    terrain: loadJson('vexlife.terrain.layout', { positions: {}, collapsed: [], selected: null })
  };

  return { projects, roles, channels, messages, state, createMessage, messageList, conversationKey };
}

// [VXG RealForever]
