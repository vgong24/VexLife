import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack, buildRegistryProjection } from '../src/core/registry.mjs';
import { PUBLIC_LEARNING_STATE_DIMENSIONS, buildPublicLearningProjection, loadPublicLearningSource, queryPublicLearningProjection, validatePublicLearningInputs, validatePublicLearningSourceBinding } from '../src/core/public-learning.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BINDING = Object.freeze({ repository:'vgong24/VexLife', commitSha:'18eac7b607dee58ddb0b1de0637efbd9abd58852', treeSha:'57f07e0216affd672cb55fe63d0c2e6082f13b38', sourceAcceptanceState:'CANDIDATE_PROOF_ONLY' });
const ACCEPTED = Object.freeze({ ...BINDING, sourceAcceptanceState:'ACCEPTED_CURRENT' });
const source = () => loadPublicLearningSource(ROOT);
const canonical = () => { const bundle=loadBlueprint(ROOT); return {bundle,canonicalRegistry:compileRegistryPack(bundle)}; };
function invalid(mutator) { const {registry,catalogs}=source(), {bundle,canonicalRegistry}=canonical(); mutator(registry,catalogs); try { validatePublicLearningInputs({root:ROOT,bundle,canonicalRegistry,registry,catalogs}); return null; } catch (error) { return error.message; } }

test('PLP-00/01/06 registry, canonical refs and EN/JA/ZH are exact', () => {
  const {registry,catalogs}=source(), {bundle,canonicalRegistry}=canonical();
  const result=validatePublicLearningInputs({root:ROOT,bundle,canonicalRegistry,registry,catalogs});
  assert.deepEqual(result.stats,{groupCount:3,canonicalNodeCount:5,leafCount:5,localeCount:3,stringKeyCount:50});
  assert.equal(registry.prototype.finalHomeHierarchy,false);
});

test('PLP-02/03 public groups own presentation only and all edges are admitted', () => {
  const projection=buildPublicLearningProjection({root:ROOT,sourceBinding:BINDING}), refs=new Set(projection.nodes.map((n)=>n.ref));
  for (const node of projection.nodes) for (const edge of node.edges??[]) assert.equal(refs.has(edge.to),true,`${node.ref} -> ${edge.to}`);
  for (const group of projection.nodes.filter((n)=>n.nodeClass==='PUBLIC_GROUPING_NODE')) { assert.equal(group.states.implementationState,null); assert.equal(group.states.capabilityStage,null); assert.equal('effectClass' in group,false); }
});

test('PLP-04/05 source currentness is explicit input, never PR/clock inference', () => {
  assert.deepEqual(validatePublicLearningSourceBinding(BINDING),BINDING);
  assert.throws(()=>validatePublicLearningSourceBinding({...BINDING,openPr:185}),/unexpected field/u);
  assert.throws(()=>validatePublicLearningSourceBinding({...BINDING,sourceAcceptanceState:'OPEN_PR'}),/invalid sourceAcceptanceState/u);
  const code=fs.readFileSync(path.join(ROOT,'src/core/public-learning.mjs'),'utf8');
  assert.doesNotMatch(code,/Date\.now|new Date|fetch\s*\(|api\.github\.com|child_process|execFile|spawn\s*\(/u);
});

test('PLP-07 state dimensions remain independent and deployment is never synthesized', () => {
  for (const [binding,state] of [[BINDING,'CANDIDATE_PROOF_ONLY'],[ACCEPTED,'ACCEPTED_CURRENT']]) {
    const projection=buildPublicLearningProjection({root:ROOT,sourceBinding:binding});
    assert.deepEqual(projection.stateDimensions,[...PUBLIC_LEARNING_STATE_DIMENSIONS]);
    for (const node of projection.nodes) { assert.deepEqual(Object.keys(node.states).sort(),[...PUBLIC_LEARNING_STATE_DIMENSIONS].sort()); assert.equal(node.states.sourceAcceptanceState,state); assert.equal(node.states.liveDeploymentState,'NOT_DEPLOYED'); assert.notEqual(node.states.publicAvailabilityState,'AVAILABLE'); }
  }
});

test('PLP-08/11/13 private, conflicting and pollution-shaped inputs fail closed', () => {
  assert.match(invalid((r)=>r.canonicalNodes[0].sourcePaths.push('docs/private-continuity/secret.txt')),/protected material|not public-admitted/u);
  assert.match(invalid((r)=>r.publicGroups.push(structuredClone(r.publicGroups[0]))),/duplicate group/u);
  assert.match(invalid((r)=>{r.leafPresentations[1].routePath=r.leafPresentations[0].routePath;}),/duplicate leaf route|invalid or duplicate leaf route/u);
  assert.match(invalid((r)=>r.canonicalNodes[0].relatedRefs.push('state.vexlife.private-unadmitted')),/non-public identity/u);
  assert.match(invalid((r)=>{r.publicGroups[0].effectClass='PUBLIC_EXTERNAL';}),/claims canonical\/effect authority/u);
  assert.match(invalid((r)=>{r.adversarial=JSON.parse('{"__proto__":{"polluted":true}}');}),/forbidden object key/u);
  assert.match(invalid((r)=>{r.adversarial={constructor:{prototype:{polluted:true}}};}),/forbidden object key/u);
});

test('PLP-06/12 localization and public source descent fail closed', () => {
  assert.match(invalid((_r,c)=>{delete c.ja.strings['public.leaf.atlas.why'];}),/key set differs|exactly cover/u);
  assert.match(invalid((r)=>{r.canonicalNodes[0].canonicalRef='module.vexlife.missing.public-learning-fixture';}),/canonical ref does not resolve/u);
  const {registry}=source();
  for (const node of registry.canonicalNodes) for (const p of node.sourcePaths??[]) { assert.equal(path.isAbsolute(p),false); assert.equal(p.includes('..'),false); assert.equal(fs.existsSync(path.join(ROOT,p)),true,p); }
});

test('PLP-09 deterministic source/config yields identical projection bytes and hash', () => {
  const a=buildPublicLearningProjection({root:ROOT,sourceBinding:BINDING}), b=buildPublicLearningProjection({root:ROOT,sourceBinding:BINDING});
  assert.equal(a.projectionHash,b.projectionHash); assert.equal(JSON.stringify(a),JSON.stringify(b));
});

test('PLP-10 bounded Atlas exposes architecture neighborhood and More-relationships count', () => {
  const projection=buildPublicLearningProjection({root:ROOT,sourceBinding:BINDING});
  const full=queryPublicLearningProjection(projection,{startRefs:['public-group.vexlife.architecture.001'],depthLimit:2,resultLimit:12,tokenBudget:2000});
  const refs=new Set(full.results.map((x)=>x.ref)); for (const ref of ['public-group.vexlife.architecture.registries.001','public-group.vexlife.architecture.atlas.001','module.vexlife.core.atlas','module.vexlife.core.registry']) assert.equal(refs.has(ref),true,ref);
  const bounded=queryPublicLearningProjection(projection,{startRefs:['public-group.vexlife.architecture.001'],depthLimit:1,resultLimit:2,tokenBudget:1200});
  assert.equal(bounded.relationshipSummary.shownRelationshipCount,1); assert.equal(bounded.relationshipSummary.additionalPublicRelationshipCount,2);
});

test('PLP-14 effects stay all false and synthetic biography is absent', () => {
  const projection=buildPublicLearningProjection({root:ROOT,sourceBinding:BINDING});
  assert.equal(Object.values(projection.effects).every((v)=>v===false),true); assert.doesNotMatch(JSON.stringify(projection),/CURRENT_SYNTHETIC_REFERENCE|private Home contents|conversation body/iu);
});

test('PLP-15 module fragment registers core projection and builder without browser/Pages ownership', () => {
  const bundle=loadBlueprint(ROOT), byRef=new Map(bundle.modules.modules.map((m)=>[m.moduleRef,m]));
  assert.equal(byRef.get('module.vexlife.core.public-learning')?.path,'src/core/public-learning.mjs');
  assert.equal(byRef.get('module.vexlife.script.build-public-learning-projection')?.path,'scripts/build-public-learning-projection.mjs');
  assert.equal(byRef.get('module.vexlife.core.public-learning')?.tests.includes('test/public-learning-projection.test.mjs'),true);
  const publicLearningModules=[...byRef.values()].filter((m)=>m.moduleRef.includes('public-learning'));
  assert.equal(publicLearningModules.some((m)=>/^(?:reference\/browser|pages\/|\.github\/workflows\/)/u.test(m.path??'')),false);
  assert.equal(publicLearningModules.flatMap((m)=>m.writes??[]).some((target)=>/^(?:reference\/browser|pages\/|\.github\/workflows\/)/u.test(target)),false);
});

test('public projection never mutates accepted compiled registry', () => {
  const {bundle,canonicalRegistry}=canonical(), before=buildRegistryProjection(canonicalRegistry), {registry,catalogs}=source();
  const projection=buildPublicLearningProjection({root:ROOT,bundle,registry,catalogs,sourceBinding:BINDING}), after=buildRegistryProjection(canonicalRegistry);
  assert.equal(before.semanticHash,after.semanticHash); assert.equal(before.entryCount,after.entryCount); assert.equal(projection.canonicalRegistry.semanticHash,before.semanticHash);
});

// [VXG RealForever]