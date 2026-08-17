export const identityLocalizationSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.identity-localization/v1',
  async run({ app, helpers:{ assert, selectLanguage } }) {
    const checks = [];
    const start = {
      language:app.state.language,
      projectRef:app.state.projectRef,
      threadRef:app.state.threadRef,
      channelRef:app.state.channelRef
    };
    const selfProject = app.projects.find((project)=>project.projectRef==='project.self-development');
    const selfThread = selfProject?.threads.find((thread)=>thread.threadRef==='thread.self-development.open-conversation');
    assert(selfProject && selfThread, 'LB0 self-development provenance fixture unavailable');
    app.chat.selectThread(selfProject,selfThread,'element.thread.open-conversation');
    app.projectFrame();

    const directNodeRef = (roleKey) => roleKey==='companion'?'element.channel.companion':roleKey==='guide'?'element.channel.guide':'element.channel.root-hub';
    const directByRole = new Map(app.channels
      .filter((channel)=>channel.threadRef===selfThread.threadRef&&channel.kind==='DIRECT'&&['companion','guide','root'].includes(channel.roleKey))
      .map((channel)=>[channel.roleKey,channel]));
    assert(directByRole.size===3, 'LB0 Companion/Guide/Root direct fixtures incomplete');

    for (const language of ['en','zh','ja']) {
      selectLanguage(language);
      assert(document.documentElement.lang === language, `D11 ${language} localization state missing`);
      for (const roleKey of ['companion','guide','root']) {
        const channel = directByRole.get(roleKey);
        app.chat.selectChannel(channel,directNodeRef(roleKey));
        app.projectFrame();
        const expected = app.visibleRoleLabel(roleKey);
        const actorRef = app.roles[roleKey].actorRef;
        const selectedTab = document.querySelector(`#channelTabs [data-channel-ref="${CSS.escape(channel.channelRef)}"]`);
        assert(selectedTab?.textContent===expected, `LB1 ${language} ${roleKey} direct channel lost visible role provenance`);
        assert(expected.startsWith(`${app.visibleVexName()} · `)&&expected!==app.visibleVexName(), `LB1 ${language} ${roleKey} qualifier does not preserve one-primary-Vex grammar`);
        assert(selectedTab.dataset.sourceRoleRef===actorRef&&selectedTab.title===actorRef, `LB3 ${language} ${roleKey} source roleRef projection drifted`);
        assert(selectedTab.textContent!==app.visibleVexName(), `LB8 ${language} ${roleKey} relies on hidden title instead of visible qualifier`);

        const presence = [...document.querySelectorAll('#presence span')];
        assert(presence.some((span)=>span.textContent===expected&&span.dataset.sourceRoleRef===actorRef), `LB2 ${language} ${roleKey} presence lost material role provenance`);
        assert(document.querySelector('#composerAddress')?.textContent.includes(expected), `LB4 ${language} ${roleKey} composer attribution collapsed material role`);
        const contextRows = [...document.querySelectorAll('#contextSummary .context-row')];
        assert(contextRows[2]?.querySelector('strong')?.textContent.includes(expected), `LB4 ${language} ${roleKey} context channel attribution collapsed material role`);
        assert(contextRows[3]?.querySelector('strong')?.textContent.includes(expected), `LB4 ${language} ${roleKey} visible-to attribution collapsed material role`);
        assert([...document.querySelectorAll('#messageFeed .message-header strong')].some((header)=>header.textContent.includes(expected)), `LB2 ${language} ${roleKey} message attribution lost material role provenance`);
      }
    }

    selectLanguage('en');
    const group = app.channels.find((channel)=>channel.threadRef===selfThread.threadRef&&channel.kind==='GROUP');
    assert(group, 'LB2 group provenance fixture unavailable');
    app.chat.selectChannel(group,'element.channel.group');
    app.projectFrame();
    const groupPresence = [...document.querySelectorAll('#presence span')].map((span)=>span.textContent);
    assert(groupPresence.includes(app.visibleRoleLabel('companion'))&&groupPresence.includes(app.visibleRoleLabel('guide')), 'LB2 group presence does not distinguish material Vex roles');
    const groupHeaders = [...document.querySelectorAll('#messageFeed .message-header strong')].map((header)=>header.textContent);
    assert(groupHeaders.some((header)=>header.includes(app.visibleRoleLabel('guide'))&&header.includes(app.visibleRoleLabel('companion'))), 'LB2 group message attribution lost speaker/recipient role provenance');

    const visibleText = document.body.textContent;
    assert(!visibleText.includes('provider-binding.openai')&&!visibleText.includes('instance.vexlife.e28'), 'LB9 provider/instance identity leaked into ordinary product projection');
    assert(!document.querySelector('#guideWindow').hidden && document.querySelector('#guideWindow').textContent.includes(app.t('vex.visible.name')), 'D12 ambient Vex not visible');

    const restoreProject = app.projects.find((project)=>project.projectRef===start.projectRef);
    const restoreThread = restoreProject?.threads.find((thread)=>thread.threadRef===start.threadRef);
    if(restoreProject&&restoreThread){
      app.chat.selectThread(restoreProject,restoreThread,`element.${restoreThread.threadRef}`);
      const restoreChannel = app.channels.find((channel)=>channel.channelRef===start.channelRef);
      if(restoreChannel)app.chat.selectChannel(restoreChannel,directNodeRef(restoreChannel.roleKey));
    }
    selectLanguage(start.language);
    app.projectFrame();

    checks.push(
      'D11 localization remains stable',
      'D12 one visible Vex occupies the E2.7 ambient vessel',
      'LB1 direct Vex channels preserve one primary Vex plus visible canonical role qualifier',
      'LB2 group presence and message attribution distinguish material Vex roles without persona multiplication',
      'LB3 visible qualifiers derive from canonical roleRef and localized role labels',
      'LB4 composer and context attribution retain material participant roles',
      'LB5 one-visible-Vex vessel semantics remain unchanged',
      'LB6 EN/ZH/JA role provenance has no identity fallback hole',
      'LB7 channel membership and routing owners remain unchanged',
      'LB8 hidden titles are not accepted as provenance visibility',
      'LB9 provider and coder instance identity remain absent from ordinary projection',
      'LB10 identity-localization remains one mandatory fail-closed owner suite'
    );
    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.localized-identity-en', checks };
  }
});

// [VXG RealForever]
