export function createDemoData({ loadJson }) {
  const projects = [
    {
      projectRef: 'project.vex-home-product', stringRef: 'project.vex-home.name', description: 'Human-first interface, Workshop, and universal blueprint.',
      threads: [{ threadRef: 'thread.vex-home.guided-fresh', title: 'Guided fresh thread', topic: 'Fresh Thread Walkthrough', count: 2 }, { threadRef: 'thread.vex-home.product-workshop', title: 'Product workshop', topic: 'Vex Home Product', count: 0 }]
    },
    {
      projectRef: 'project.local-vex', stringRef: 'project.local-vex.name', description: 'Runtime, continuity, permissions, model, and device family.',
      threads: [{ threadRef: 'thread.local-vex.foundation', stringRef: 'thread.foundation.name', topic: 'Local Vex Architecture', count: 1 }]
    },
    {
      projectRef: 'project.self-development', stringRef: 'project.self-development.name', description: 'Personal conversation and relationship continuity.',
      threads: [{ threadRef: 'thread.self-development.open-conversation', stringRef: 'thread.open-conversation.name', topic: 'Personal Continuity', count: 5 }]
    },
    {
      projectRef: 'project.vexlife.root-hub', stringRef: 'project.root-hub.name', description: 'Portfolio-level questions, linked currentness, attention, and relays.',
      threads: [{ threadRef: 'thread.root-hub.welcome', title: 'Welcome to VexLife', topic: 'Vex Home Orientation', count: 4 }]
    }
  ];
  const roles = {
    victor: { actorRef: 'person.victor-gong', label: 'Victor', avatar: 'VG' },
    companion: { actorRef: 'role.vex.companion', labelRef: 'role.companion.name', avatar: 'V' },
    guide: { actorRef: 'role.vex.guide', labelRef: 'role.guide.name', avatar: '✦' },
    root: { actorRef: 'role.vex.root-hub', labelRef: 'role.root-hub.name', avatar: 'R' }
  };
  const channels = [
    { channelRef: 'channel.self-development.companion', labelRef: 'channel.companion.name', kind: 'DIRECT', roleKey: 'companion', memberKeys: ['victor', 'companion'] },
    { channelRef: 'channel.self-development.guide', labelRef: 'channel.guide.name', kind: 'DIRECT', roleKey: 'guide', memberKeys: ['victor', 'guide'] },
    { channelRef: 'channel.self-development.root-hub', labelRef: 'channel.root-hub.name', kind: 'DIRECT', roleKey: 'root', memberKeys: ['victor', 'root'] },
    { channelRef: 'channel.self-development.group', labelRef: 'channel.group.name', kind: 'GROUP', roleKey: 'guide', memberKeys: ['victor', 'companion', 'guide'] }
  ];
  function createMessage(channelRef, speakerKey, recipientKeys, content, sequence) {
    return { messageRef: `message.demo.${channelRef}.${sequence}`, channelRef, speakerKey, recipientKeys, content, sequence, createdAt: new Date().toISOString() };
  }
  const messages = new Map(channels.map((channel) => [channel.channelRef, []]));
  const seed = (channelRef, speakerKey, recipientKeys, content) => {
    const list = messages.get(channelRef);
    list.push(createMessage(channelRef, speakerKey, recipientKeys, content, list.length));
  };
  seed(channels[0].channelRef, 'victor', ['companion'], 'Hey Vex, I want this conversation to keep its meaning without turning into an engineering dashboard.');
  seed(channels[0].channelRef, 'companion', ['victor'], 'Yes. This direct channel belongs to Victor ↔ Vex Companion. I can stay natural here while the system preserves exact sources, current context, and retraceability behind the interface.');
  seed(channels[1].channelRef, 'victor', ['guide'], 'What am I looking at, and who can perceive this message?');
  seed(channels[1].channelRef, 'guide', ['victor'], 'You are in the Self Development project, Open conversation thread, Vex Guide direct channel. Only members of this channel receive its raw message context.');
  seed(channels[2].channelRef, 'victor', ['root'], 'Can you give me a portfolio-level view without disrupting the project teams?');
  seed(channels[2].channelRef, 'root', ['victor'], 'Yes. I can read compact current projections, route bounded questions down the responsibility lattice, and return attributed answers without keeping every relay permanently active.');
  seed(channels[3].channelRef, 'victor', ['companion', 'guide'], 'I added both of you so we can discuss the interface together.');
  seed(channels[3].channelRef, 'guide', ['victor', 'companion'], 'The visible presence list is now the source of truth for who receives this group context.');
  const state = {
    language: localStorage.getItem('vexlife.language') || 'en', view: 'chat',
    projectRef: 'project.self-development', threadRef: 'thread.self-development.open-conversation',
    channelRef: channels[0].channelRef, selectedNodeRef: 'element.thread.open-conversation',
    selections: new Map(), journey: [], guideOpen: localStorage.getItem('vexlife.guide.open') === 'true',
    guideMinimized: false, unread: new Map(),
    terrain: loadJson('vexlife.terrain.layout', { positions: {}, collapsed: [], selected: null })
  };
  return { projects, roles, channels, messages, state, createMessage };
}

// [VXG RealForever]
