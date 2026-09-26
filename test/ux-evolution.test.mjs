import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyProjectionCoverage,deriveProjectionCoverageReport,validateUxEvolutionRegistry} from '../src/core/ux-evolution.mjs';

const load=()=>JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-registry.json',import.meta.url),'utf8'));

test('E0/LJ-01 validates against the canonical shell active-surface host with zero cutover',()=>{
  const r=validateUxEvolutionRegistry(load());
  assert.equal(r.state,'PASS',r.errors.join('\n'));
  assert.equal(r.migrationRecordCount,7);
  assert.equal(r.findingCount,21);
  assert.equal(r.visualScenarioCount,11);
  assert.equal(r.supportingUxSurfaceCount,2);
  assert.equal(r.browserBehaviorChange,false);
  assert.equal(r.cutoverAllowed,false);
  assert.equal(r.projectionHostState,'ACTIVE_SURFACE_MIGRATED_SURFACES');
});

test('migration accounting remains non-owner while Journal and Conversation have bounded Evolution active-surface presentations',()=>{
  const records=load().migrationRecords;
  const journal=records.find(x=>x.semanticRef==='feature.vexlife.living-journal');
  const conversation=records.find(x=>x.semanticRef==='feature.vexlife.addressed-conversation');
  assert.equal(journal.disposition,'REDESIGN_PRESENTATION');
  assert.equal(journal.migrationLifecycleState,'SHADOW_IMPLEMENTED');
  assert.equal(journal.parityState,'PARTIAL');
  assert.deepEqual(journal.evolutionProjectionRefs,['projection.living-journal.evolution-active-surface']);
  assert.ok(journal.semanticOwnerRefs.every(x=>!x.includes('ux-evolution')));
  assert.equal(conversation.disposition,'REDESIGN_PRESENTATION');
  assert.equal(conversation.migrationLifecycleState,'SHADOW_IMPLEMENTED');
  assert.equal(conversation.parityState,'PARTIAL');
  assert.deepEqual(conversation.evolutionProjectionRefs,['projection.conversation.evolution-shadow']);
  assert.ok(conversation.semanticOwnerRefs.every(x=>!x.includes('ux-evolution')));
  for(const record of records.filter(x=>x!==journal&&x!==conversation)){
    assert.equal(record.disposition,'HELD');
    assert.equal(record.migrationLifecycleState,'SOURCE_MAPPED');
    assert.equal(record.evolutionProjectionRefs.length,0);
    assert.ok(record.semanticOwnerRefs.every(x=>!x.includes('ux-evolution')));
  }
});

test('coverage contains one bounded migration and no loss or cutover',()=>{
  const r=deriveProjectionCoverageReport(load());
  assert.equal(r.counts.HELD,5);
  assert.equal(r.counts.SHADOW_MIGRATION,2);
  assert.equal(r.counts.LOST,0);
  assert.equal(r.counts.NEW,0);
  assert.equal(r.counts.CUTOVER_OCCURRED,0);
});

test('cutover still fails closed without accepted parity',()=>{
  const r=load();
  r.migrationRecords[0]={...r.migrationRecords[0],evolutionProjectionRefs:['projection.evolution.chat'],disposition:'REPLACE',migrationLifecycleState:'CUTOVER_DEFAULT',cutoverDisposition:'CUTOVER_PROPOSED',parityState:'PARTIAL'};
  const v=validateUxEvolutionRegistry(r);
  assert.equal(v.state,'BLOCKED');
  assert.ok(v.errors.some(x=>x.startsWith('CUTOVER_REQUIRES_ACCEPTANCE:')));
});

test('visual assurance remains #625-owned and exact-head gated',()=>{
  const r=load();
  assert.equal(r.visualAssurance.ownerRef,'github.issue.vexlife.625');
  assert.equal(r.visualAssurance.evolutionCandidateRequiresExactHead,true);
});

test('Journal active-surface contract keeps the shell presentation-only and the semantic owners unchanged',()=>{
  const r=load();
  const h=r.projectionHost;
  const p=h.activeSurfaceProjection;
  const j=r.migrationRecords.find(x=>x.semanticRef==='feature.vexlife.living-journal');
  assert.equal(h.defaultProjection,'REFERENCE_PROJECTION');
  assert.equal(h.hostRef,'host.vexlife.shell.evolution-active-surface.001');
  assert.equal(h.oneActiveRenderer,true);
  assert.equal(h.rendererTransitionClass,'SHELL_ACTIVE_SURFACE');
  assert.equal(h.priorRendererDisposition,'REFERENCE_SURFACE_RETAINED_HIDDEN');
  assert.equal(h.evolutionHostLoadsReferenceRenderer,true);
  assert.equal(h.dualRendererMountAllowed,false);
  assert.equal(h.cutoverAuthority,false);
  assert.equal(p.surfaceRef,'surface.vexlife.living-journal');
  assert.equal(p.stateOwnerPolicy,'UNCHANGED_SERVICE_CONTEXT');
  assert.equal(p.memoryOwnerPolicy,'UNCHANGED_ACCEPTED_MEMORY_OWNERS');
  assert.equal(p.journeyOwnerPolicy,'UNCHANGED_NAVIGATION_JOURNEY_OWNER');
  assert.equal(p.semanticBackOwnerRef,'module.vexlife.core.navigation');
  assert.equal(p.shellOwnsSurfaceTitle,true);
  assert.equal(p.shellOwnsCloseControl,true);
  assert.equal(p.semanticClosePolicy,'REGISTERED_ADAPTER_REQUEST_CLOSE');
  assert.equal(p.projectionFallbackMutatesSemanticJourney,false);
  assert.equal(p.localMarginaliaDurability,'SESSION_ONLY_NON_MEMORY');
  assert.equal(p.newSemanticCapabilityAuthority,false);
  assert.equal(p.cutoverAuthority,false);
  assert.equal(p.retirementAuthority,false);
  assert.ok(j.sourceRefs.includes('src/core/browser-living-journal-memory-bridge.mjs'));
});

test('classification still treats SHADOW_IMPLEMENTED Reference+Evolution as bounded migration',()=>{
  const j=load().migrationRecords.find(x=>x.semanticRef==='feature.vexlife.living-journal');
  assert.equal(classifyProjectionCoverage(j),'SHADOW_MIGRATION');
});

// [VXG RealForever]
