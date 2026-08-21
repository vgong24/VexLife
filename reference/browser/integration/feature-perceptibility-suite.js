export const featurePerceptibilitySuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.feature-perceptibility/v1',
  async run({ app, helpers:{ assert } }) {
    const checks=[]; const adapter=app.featureWalkthrough; const patientZero=app.patientZeroWalkthrough;
    assert(adapter?.adapterRef==='adapter.vexlife.browser.feature-walkthrough-guide/v1','FPD-00 live Feature Perceptibility adapter unavailable');
    assert(patientZero&&typeof patientZero.replay==='function'&&typeof patientZero.next==='function','FPD-00 Patient Zero controls unavailable');
    const feature=app.featureWalkthrough.offer('feature.vexlife.living-journal'); assert(feature.state==='READY',`FPD-01 Living Journal route not READY: ${feature.state}`); checks.push('FPD-01 Living Journal WALKTHROUGH route is CURRENT/READY');
    const originalContext=app.state.contextProjection; const originalGuideOpen=app.state.guideOpen; const originalGuideMinimized=app.state.guideMinimized;
    const preferenceKey=['vexlife.guide.feature-introduction','feature.vexlife.living-journal',feature.planRef,feature.sourceVersionRef].map(encodeURIComponent).join('/'); const originalPreference=localStorage.getItem(preferenceKey);
    try {
      adapter.clearPreference('feature.vexlife.living-journal'); await app.openLivingJournal({loadMemory:false});
      const archiveTarget=app.guide.evaluateActionTarget('element.living-journal.archive.open'); assert(archiveTarget.state==='AVAILABLE','FPD-02 permission.none archive target not admitted'); checks.push('FPD-02 permission.none target admitted');
      app.openContext('chat'); const protectedTarget=app.guide.evaluateActionTarget('element.chat.composer'); assert(protectedTarget.state==='UNAVAILABLE'&&protectedTarget.reason==='PERMISSION_NOT_ADMITTED_BY_GUIDE','FPD-03 real permission target unexpectedly admitted'); checks.push('FPD-03 permission.conversation.send remains rejected'); await app.openLivingJournal({loadMemory:false});
      const journeyStart=app.navigation.fullJourney().length; const later=patientZero.later(); assert(later.state==='DEFERRED','FPD-04 Later did not defer'); assert(app.navigation.fullJourney().length===journeyStart+1,'FPD-04 Later did not append ordinary Journey event');
      const shown=patientZero.show(); assert(shown.state==='ACTIVE','FPD-05 Show me did not start'); const suppressed=patientZero.suppress(); assert(suppressed.state==='SUPPRESSED','FPD-06 suppression not scoped'); assert(adapter.offer('feature.vexlife.living-journal').state==='SUPPRESSED','FPD-06 unsolicited offer not suppressed'); const replay=patientZero.replay(); assert(replay.state==='ACTIVE','FPD-07 explicit replay blocked by suppression');
      for(let i=0;i<9;i++){const next=patientZero.next();if(i<8)assert(next.state==='ACTIVE',`FPD-08 stage ${i} did not remain active`);else assert(next.state==='PLAN_STAGES_EXHAUSTED'&&next.completionAuthority==='JOURNEY_REQUIRED','FPD-08 exhaustion fabricated completion authority');}
      const delta=app.navigation.fullJourney().slice(journeyStart); const actions=delta.map(e=>e.actionRef); for(const ref of ['action.living-journal.walkthrough.later','action.living-journal.walkthrough.show','action.living-journal.walkthrough.suppress','action.living-journal.walkthrough.replay','action.living-journal.walkthrough.next'])assert(actions.includes(ref),`FPD-09 missing Journey action ${ref}`); const nextEvents=delta.filter(e=>e.actionRef==='action.living-journal.walkthrough.next'); assert(nextEvents.length===9,'FPD-09 expected nine Next Journey events'); assert(new Set(nextEvents.map(e=>e.subjectRef)).size===9,'FPD-09 Next Journey subjects are not distinct'); checks.push('FPD-09 controls append ordinary distinct semantic Journey evidence');
      assert(!Object.hasOwn(replay,'completed')&&!Object.hasOwn(replay,'completion'),'FPD-10 runner fabricated lived completion'); checks.push('FPD-10 plan exhaustion remains distinct from Journey completion');
    } finally { if(originalPreference===null)localStorage.removeItem(preferenceKey);else localStorage.setItem(preferenceKey,originalPreference); app.guide.setOpen(originalGuideOpen); app.state.guideMinimized=originalGuideMinimized; if(originalContext==='terrain'||originalContext===null)app.returnToTerrain(); else if(originalContext==='living-journal')await app.openLivingJournal({loadMemory:false}); else app.openContext(originalContext); }
    return Object.freeze({suiteRef:this.suiteRef,state:'PASS',checks});
  }
});

// [VXG RealForever]
