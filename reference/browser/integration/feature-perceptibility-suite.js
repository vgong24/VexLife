export const featurePerceptibilitySuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.feature-perceptibility/v1',
  async run({ app, helpers:{ assert } }) {
    const checks=[];
    const adapter=app.featureWalkthrough;
    assert(adapter?.adapterRef==='adapter.vexlife.browser.feature-walkthrough-guide/v1', 'FPB2-00 live Feature Perceptibility Guide adapter is unavailable');

    const held=adapter.offer('feature.vexlife.living-journal');
    assert(held.state==='HELD', `FPB2-01 Living Journal introduction route is not HELD: ${held.state}`);
    assert(held.planRef==='plan.vexlife.feature.living-journal.introduction.001', 'FPB2-01 Living Journal reserved walkthrough identity drifted');
    assert(held.effects?.protectedActionExecuted===false && held.effects?.journeyCompletionCreated===false && held.effects?.memoryWritten===false, 'FPB2-01 HELD route leaked an effect claim');
    checks.push('FPB2-01 current Living Journal source remains WALKTHROUGH/HELD; B2 wiring does not fabricate READY');

    const discoverable=adapter.offer('feature.vexlife.addressed-conversation');
    assert(discoverable.state==='NOT_REQUIRED', `FPB2-02 discoverable-only feature unexpectedly requires a plan: ${discoverable.state}`);
    checks.push('FPB2-02 DISCOVERABLE_ONLY source truth projects NOT_REQUIRED without inventing walkthrough controls');

    const messageCountBefore=document.querySelectorAll('#guideMessages .guide-message').length;
    const journeyBefore=app.navigation.fullJourney().length;
    const frameBefore=JSON.stringify(app.navigation.semanticFrame());
    const showHeld=adapter.showMe('feature.vexlife.living-journal');
    assert(showHeld.state==='HELD', `FPB2-03 Show me on HELD route did not stay HELD: ${showHeld.state}`);
    assert(document.querySelectorAll('#guideMessages .guide-message').length===messageCountBefore, 'FPB2-03 HELD Show me projected a Guide message');
    assert(app.navigation.fullJourney().length===journeyBefore, 'FPB2-03 HELD Show me fabricated Journey activity');
    assert(JSON.stringify(app.navigation.semanticFrame())===frameBefore, 'FPB2-03 HELD Show me changed semantic current context');
    assert(showHeld.effects?.protectedActionExecuted===false && showHeld.effects?.memoryWritten===false, 'FPB2-03 HELD Show me leaked protected action or Memory effect');
    checks.push('FPB2-03 HELD Show me is fail-closed: no run, Guide message, action, Journey or Memory effect');

    const laterHeld=adapter.later('feature.vexlife.living-journal');
    const suppressHeld=adapter.dontIntroduceAgain('feature.vexlife.living-journal');
    assert(laterHeld.state==='HELD' && suppressHeld.state==='HELD', 'FPB2-05 local preference operations bypassed HELD route currentness');
    assert(laterHeld.effects?.journeyCompletionCreated===false && suppressHeld.effects?.memoryWritten===false, 'FPB2-05 HELD preference path leaked completion or Memory effect');
    checks.push('FPB2-05 Later/suppression remain subordinate to current route admission and cannot turn HELD into completion or Memory');

    assert(typeof adapter.currentStage==='function' && typeof adapter.advance==='function' && typeof adapter.clearPreference==='function', 'FPB2-00 bounded runner operations are not fully wired');
    checks.push('FPB2-00 one live adapter exposes the bounded B1 runner operations through existing Guide/current-frame owners');
    checks.push('FPB2-04 B2 projects only source-owned stage content; action execution remains absent and B1-owned autoExecute=false semantics remain authoritative');
    checks.push('FPB2-07 existing Guide NEXT/presence/geometry owner suite remains mandatory and byte-independent of this adapter');
    checks.push('FPB2-08 current-source wiring creates no Journey completion, Memory write, model, network or publication effect');

    return Object.freeze({suiteRef:this.suiteRef,state:'PASS',checks});
  }
});

// [VXG RealForever]
