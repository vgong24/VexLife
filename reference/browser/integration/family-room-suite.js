export const familyRoomSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.family-room/v1',
  async run({ app, state, helpers:{ delay, assert } }) {
    const checks = [];
    assert(app.familyRoom && typeof app.familyRoom.refresh === 'function', 'Family room controller unavailable');
    const snapshot = await app.familyRoom.refresh();
    await delay(0);
    const host = document.querySelector('#familyRoomProjection');
    assert(host, 'Family room status projection was not rendered inside Chat');
    assert(['CURRENT','EMPTY','HELD_UNAVAILABLE'].includes(snapshot.state), 'Family room truth state is invalid');
    assert(host.dataset.truthClass === snapshot.truthClass, 'Family room DOM truth class does not match controller truth');
    if (snapshot.workStatus.state === 'CURRENT') {
      assert(Number.isSafeInteger(snapshot.workStatus.pendingCount) && snapshot.workStatus.pendingCount >= 0,
        'FTE-02 Family work pending projection is invalid');
      assert(Number.isSafeInteger(snapshot.workStatus.activeCount) && snapshot.workStatus.activeCount >= 0,
        'FTE-02 Family work active projection is invalid');
      assert(Number.isSafeInteger(snapshot.workStatus.dueCount) && snapshot.workStatus.dueCount >= 0,
        'FTE-05 Family due projection is invalid');
      assert(Number.isSafeInteger(snapshot.workStatus.attentionCount) && snapshot.workStatus.attentionCount >= 0,
        'FTE-05 Family attention projection is invalid');
      const serializedWork = JSON.stringify(snapshot.workStatus);
      for (const forbidden of ['workNodeRef','assignmentRef','schedulerAggregate','concernAggregate','evidenceRefs']) {
        assert(!serializedWork.includes(forbidden), 'FTE-02 raw generic follow-through truth leaked into Family browser');
      }
      checks.push('FTE-02/05 Family browser receives only compact source-bound generic follow-through counts');
    } else {
      assert(snapshot.workStatus.state === 'HELD_UNAVAILABLE',
        'FTE-08 unavailable generic work truth did not fail closed visibly');
      checks.push('FTE-08 missing generic follow-through truth remains visibly held rather than becoming zero work');
    }

    const securityNode = host.querySelector('[data-family-security-state]');
    assert(securityNode, 'VFS03-09 Family security status is not rendered inside the existing Family card');
    assert(securityNode.dataset.familySecurityState === snapshot.securityStatus.state,
      'VFS03-09 Family security DOM state does not match compact server truth');
    assert(snapshot.securityStatus.roleCanAct === false && snapshot.securityStatus.effectAuthorityGranted === false,
      'VFS03-04 visible security status inflated effect authority');
    if (snapshot.securityStatus.state === 'CURRENT') {
      for (const key of ['missingCount','unknownCount','withheldCount','telemetryGapCount']) {
        assert(Number.isSafeInteger(snapshot.securityStatus[key]) && snapshot.securityStatus[key] >= 0,
          'VFS03-05 compact Family security gap count is invalid');
      }
      assert(snapshot.securityStatus.attackEstablished === false,
        'VFS03-06 visible Family security status invented attack attribution');
    } else {
      assert(snapshot.securityStatus.state === 'HELD_UNAVAILABLE',
        'VFS03-00 unavailable Family security truth did not fail closed visibly');
    }
    assert(!/\b(?:SAFE|CLEAR)\b/u.test(securityNode.textContent),
      'VFS03-08 Family security UI rendered universal SAFE/CLEAR assurance');
    checks.push('VFS03-00/04/05/06/08/09 visible Family security status stays compact, fail-closed and non-authoritative');

    if (snapshot.state === 'HELD_UNAVAILABLE') {
      assert(app.familyRoom.roomCount() === 0, 'Held Family room fabricated a live channel');
      assert(snapshot.truthClass === 'HELD_UNAVAILABLE', 'Held Family projection did not preserve its explicit held truth class');
      checks.push('FAM-UI-00 unavailable server authority remains visibly held and cannot fabricate a live Family room');
    } else if (snapshot.state === 'CURRENT') {
      const view = app.familyRoom.snapshot();
      assert(view.rooms.length > 0, 'CURRENT Family bootstrap lacks rooms');
      assert(view.rooms.every((room) => room.familyCompanionIncluded === true), 'CURRENT Family room lacks exactly one source-owned Family Vex binding');
      assert(app.familyRoom.roomCount() === view.rooms.length, 'CURRENT Family room projection did not materialize exact live rooms');
      checks.push('FAM-UI-00 current server-owned Family rooms materialize into the existing Chat contextual projection');
    } else {
      assert(app.familyRoom.roomCount() === 0, 'EMPTY Family bootstrap created a room');
      checks.push('FAM-UI-00 empty current Family truth remains visibly empty without synthetic promotion');
    }
    app.openContext('chat');
    await delay(0);
    assert(!document.querySelector('#contextSurface').hidden, 'Family room projection is not inside the existing contextual Chat surface');
    assert(document.querySelector('.e27-terrain'), 'Family room projection replaced Terrain instead of remaining contextual');
    checks.push('FAM-UI-01 Family remains a contextual Chat projection over Terrain, not a second app shell');

    const lifecycleControls=document.querySelector('#familyLifecycleControls');
    assert(lifecycleControls,'Family lifecycle controls are not projected inside the existing Family card');
    assert(typeof app.familyRoom.hostFamily==='function','Family Host consumer action is unavailable');
    assert(typeof app.familyRoom.joinFamily==='function','Family Join consumer action is unavailable');
    assert(typeof app.familyRoom.leaveFamily==='function','Family Leave consumer action is unavailable');
    const hostButton=document.querySelector('#familyHostButton');
    const joinInput=document.querySelector('#familyJoinInvitationRef');
    const joinButton=document.querySelector('#familyJoinButton');
    const leaveButton=document.querySelector('#familyLeaveButton');
    assert(hostButton&&joinInput&&joinButton&&leaveButton,'Family lifecycle native controls are incomplete');
    assert(joinInput.getAttribute('type')==='text','Join control does not use a native text input');
    assert(!lifecycleControls.textContent.includes('principalRef'),'Family lifecycle controls leaked principal authority vocabulary');
    if(snapshot.state==='HELD_UNAVAILABLE'){
      assert(hostButton.disabled&&joinInput.disabled&&joinButton.disabled&&leaveButton.disabled,'Held Family lifecycle controls remained actionable');
    }
    checks.push('FAM-UI-03 Host/Join/Leave stay inside the existing Family projection and emit no browser identity authority');

    assert(typeof app.familyComposerIdentity === 'function', 'Family composer identity projection is unavailable');
    const nonVictorKey='family-non-victor-integration';
    const familyVexKey='family-vex-non-victor-integration';
    const nonVictorRef='person.alex';
    const priorNonVictor=app.roles[nonVictorKey];
    const priorFamilyVex=app.roles[familyVexKey];
    try {
      app.roles[nonVictorKey]={actorRef:nonVictorRef,label:'Alex',avatar:'A',familyRoomProjection:true};
      app.roles[familyVexKey]={actorRef:'lineage.vex.family.integration',labelRef:'family-room.vex',avatar:'V',familyRoomProjection:true};
      const identity=app.familyComposerIdentity({
        kind:'GROUP',
        familyRoomProjection:true,
        memberKeys:['victor',nonVictorKey,familyVexKey]
      },nonVictorRef);
      assert(identity.selfRoleKey===nonVictorKey,'Non-Victor Family principal was not selected as composer self');
      assert(identity.recipientKeys.includes('victor'),'Victor was incorrectly removed from a non-Victor Family recipient projection');
      assert(!identity.recipientKeys.includes(nonVictorKey),'Current non-Victor Family principal remained in its own recipient projection');
      assert(app.visibleRoleLabel(identity.selfRoleKey)==='Alex','Composer source label did not use the current non-Victor principal role');
      assert(identity.recipientKeys.map(app.visibleRoleLabel).includes(app.visibleRoleLabel('victor')),'Displayed recipient labels do not retain Victor for the non-Victor speaker');
      checks.push('FAM-UI-02 non-Victor currentPrincipalRef drives composer self and excludes only the actual current speaker');
    } finally {
      if(priorNonVictor===undefined)delete app.roles[nonVictorKey];else app.roles[nonVictorKey]=priorNonVictor;
      if(priorFamilyVex===undefined)delete app.roles[familyVexKey];else app.roles[familyVexKey]=priorFamilyVex;
    }

    state.familyRoomProofState = snapshot.state;
    return { suiteRef:this.suiteRef, state:'PASS', checks };
  }
});

// [VXG RealForever]
