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
    if (snapshot.state === 'HELD_UNAVAILABLE') {
      assert(app.familyRoom.roomCount() === 0, 'Held Family room fabricated a live channel');
      assert(app.state.dataTruthClass === 'CURRENT_SYNTHETIC_REFERENCE', 'Held Family projection promoted synthetic reference data to live');
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
    state.familyRoomProofState = snapshot.state;
    return { suiteRef:this.suiteRef, state:'PASS', checks };
  }
});

// [VXG RealForever]
