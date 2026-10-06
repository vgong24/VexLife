#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SUBJECT_CLASSES = Object.freeze(['RESOURCE_PLACEMENT','DERIVED_COLLECTION','PRESENCE','CONTEXTUAL_INDEX','EXTERNAL_SERVICE']);
export const MOVEMENT_CLASSES = Object.freeze(['G','P','V','A','S']);
export const PLACEMENT_POSTURES = Object.freeze(['PLACED','UNPLACED','HELD']);
export const ORIENTATION_RELATION_CLASSES = Object.freeze(['ORIENTATION_NEIGHBOR','CONTEXTUAL_ASSOCIATION','CONTINUATION_ENTRY','ORIENTATION_RELATED']);
export const PLATFORM_POSTURES = Object.freeze(['SHARED_IDENTITY','ADAPTER_REQUIRED','HELD','NOT_APPLICABLE']);
export const STATE_VOCABULARIES = Object.freeze({
  currentness: Object.freeze(['CURRENT','HELD','UNKNOWN']),
  visibility: Object.freeze(['VISIBLE','HIDDEN','HELD','UNKNOWN']),
  attention: Object.freeze(['ATTENTION','NONE','HELD','UNKNOWN']),
  recovery: Object.freeze(['AVAILABLE','UNAVAILABLE','HELD','UNKNOWN'])
});
const AXES = Object.keys(STATE_VOCABULARIES);
const EFFECTS = ['network','provider','publication','Home','Memory','training','modelWeights','sensorActivation','relationshipMutation','conversationMutation','libraryMutation','semanticMutation','effectAuthority'];
const NON_COLLAPSE = [
  'VEX_FURNISHING != SEMANTIC_OWNER','RESOURCE_IDENTITY != CURRENT_PLACEMENT','PLACEMENT_MOVE != RESOURCE_MIGRATION',
  'MULTI_HOME_PROJECTION != DUPLICATE_RESOURCE','FURNISHING_REGISTRY != CURRENT_STATE_STORE','FURNISHING_PROJECTION != PRODUCT_TRUTH',
  'PRESENTATION_GRAPH != SEMANTIC_OWNER','ANDROID_PROJECTION != ANDROID_SEMANTIC_FORK','VEX_PERCEPTION != EFFECT_AUTHORITY'
];
const copy = (x) => structuredClone(x);
const req = (x, label) => { if (typeof x !== 'string' || !x.trim()) throw new Error(`${label} must be a non-empty string`); return x; };
const nullable = (x, label) => { if (x !== null) req(x, label); };
const uniqStrings = (x, label, nonempty = false) => {
  if (!Array.isArray(x) || (nonempty && !x.length)) throw new Error(`${label} must be ${nonempty ? 'a non-empty ' : 'an '}array`);
  x.forEach((v, i) => req(v, `${label}[${i}]`));
  if (new Set(x).size !== x.length) throw new Error(`${label} contains duplicate values`);
  return [...x];
};
const exact = (x, keys, label) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`${label} must be an object`);
  const extra = Object.keys(x).find((k) => !keys.includes(k)); if (extra) throw new Error(`${label} has unsupported field ${extra}`);
  const missing = keys.find((k) => !Object.hasOwn(x, k)); if (missing) throw new Error(`${label} missing ${missing}`);
};
const setEq = (a, b, label) => { if (JSON.stringify([...a].sort()) !== JSON.stringify([...b].sort())) throw new Error(`${label} does not match closed vocabulary`); };
function stable(x) { if (Array.isArray(x)) return x.map(stable); if (!x || typeof x !== 'object') return x; return Object.fromEntries(Object.keys(x).sort().map((k) => [k, stable(x[k])])); }
function digest(x) { return crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex'); }

function placement(p, label) {
  exact(p, ['placementRef','terrainNodeRefOrNull','presentationRefOrNull','routeRefOrNull','experienceDispositionRefOrNull','ownerRefs','sourceRefs'], label);
  req(p.placementRef, `${label}.placementRef`); nullable(p.terrainNodeRefOrNull, `${label}.terrainNodeRefOrNull`); nullable(p.presentationRefOrNull, `${label}.presentationRefOrNull`); nullable(p.routeRefOrNull, `${label}.routeRefOrNull`); nullable(p.experienceDispositionRefOrNull, `${label}.experienceDispositionRefOrNull`);
  uniqStrings(p.ownerRefs, `${label}.ownerRefs`, true); uniqStrings(p.sourceRefs, `${label}.sourceRefs`, true);
  if (!p.terrainNodeRefOrNull && !p.presentationRefOrNull && !p.routeRefOrNull) throw new Error(`${label} must bind Terrain, Presentation, or Navigation`);
  return {...copy(p), ownerRefs:[...p.ownerRefs].sort(), sourceRefs:[...p.sourceRefs].sort()};
}
function binding(b, axis, label) {
  exact(b, ['bindingRef','ownerRef','sourceRef','required'], label); req(b.bindingRef, `${label}.bindingRef`); req(b.ownerRef, `${label}.ownerRef`); req(b.sourceRef, `${label}.sourceRef`); if (typeof b.required !== 'boolean') throw new Error(`${label}.required must be boolean`);
  return {...copy(b), axis};
}
function record(r, label) {
  exact(r, ['furnishingRef','subject','placement','bindings','orientationRelations','platformProjections','wakePredicates'], label); req(r.furnishingRef, `${label}.furnishingRef`);
  exact(r.subject, ['subjectClass','subjectRef','resourceRefOrNull','semanticOwnerRefs','sourceRefs'], `${label}.subject`);
  if (!SUBJECT_CLASSES.includes(r.subject.subjectClass)) throw new Error(`${label}.subject has unsupported subjectClass`);
  req(r.subject.subjectRef, `${label}.subject.subjectRef`); nullable(r.subject.resourceRefOrNull, `${label}.subject.resourceRefOrNull`); uniqStrings(r.subject.semanticOwnerRefs, `${label}.subject.semanticOwnerRefs`); uniqStrings(r.subject.sourceRefs, `${label}.subject.sourceRefs`, true);
  if (r.subject.subjectClass === 'RESOURCE_PLACEMENT' && !r.subject.resourceRefOrNull) throw new Error(`${label} RESOURCE_PLACEMENT requires resourceRefOrNull`);
  if (['DERIVED_COLLECTION','CONTEXTUAL_INDEX'].includes(r.subject.subjectClass) && r.subject.resourceRefOrNull !== null) throw new Error(`${label} ${r.subject.subjectClass} must not claim a canonical resource store`);
  exact(r.placement, ['posture','primary','contextual'], `${label}.placement`); if (!PLACEMENT_POSTURES.includes(r.placement.posture)) throw new Error(`${label}.placement has unsupported posture`);
  const primary = r.placement.primary === null ? null : placement(r.placement.primary, `${label}.placement.primary`);
  if (!Array.isArray(r.placement.contextual)) throw new Error(`${label}.placement.contextual must be an array`);
  const contextual = r.placement.contextual.map((p,i)=>placement(p,`${label}.placement.contextual[${i}]`)).sort((a,b)=>a.placementRef.localeCompare(b.placementRef));
  if (r.placement.posture === 'PLACED' && !primary) throw new Error(`${label} PLACED posture requires a primary placement`);
  if (r.placement.posture === 'UNPLACED' && (primary || contextual.length)) throw new Error(`${label} UNPLACED posture cannot carry placements`);
  if (!r.subject.semanticOwnerRefs.length && !['DERIVED_COLLECTION','CONTEXTUAL_INDEX'].includes(r.subject.subjectClass) && r.placement.posture !== 'HELD') throw new Error(`${label} requires semantic owner or HELD posture`);
  const placeRefs=[primary,...contextual].filter(Boolean).map(x=>x.placementRef); if(new Set(placeRefs).size!==placeRefs.length) throw new Error(`${label} contains duplicate placementRef`);
  exact(r.bindings, AXES, `${label}.bindings`); const bindings={}; const bindingRefs=[];
  for(const axis of AXES){ if(!Array.isArray(r.bindings[axis])) throw new Error(`${label}.bindings.${axis} must be an array`); bindings[axis]=r.bindings[axis].map((b,i)=>binding(b,axis,`${label}.bindings.${axis}[${i}]`)).sort((a,b)=>a.bindingRef.localeCompare(b.bindingRef)); bindingRefs.push(...bindings[axis].map(b=>b.bindingRef)); }
  if(new Set(bindingRefs).size!==bindingRefs.length) throw new Error(`${label} contains duplicate bindingRef`);
  if(!Array.isArray(r.orientationRelations)) throw new Error(`${label}.orientationRelations must be an array`);
  const orientationRelations=r.orientationRelations.map((x,i)=>{ const q=`${label}.orientationRelations[${i}]`; exact(x,['relationRef','relationClass','targetSubjectRef','ownerRef','sourceRef'],q); req(x.relationRef,`${q}.relationRef`); if(!ORIENTATION_RELATION_CLASSES.includes(x.relationClass)) throw new Error(`${q} has unsupported relationClass`); req(x.targetSubjectRef,`${q}.targetSubjectRef`); req(x.ownerRef,`${q}.ownerRef`); req(x.sourceRef,`${q}.sourceRef`); return copy(x); }).sort((a,b)=>a.relationRef.localeCompare(b.relationRef));
  if(new Set(orientationRelations.map(x=>x.relationRef)).size!==orientationRelations.length) throw new Error(`${label} contains duplicate relationRef`);
  if(!Array.isArray(r.platformProjections)) throw new Error(`${label}.platformProjections must be an array`);
  const platformProjections=r.platformProjections.map((x,i)=>{ const q=`${label}.platformProjections[${i}]`; exact(x,['projectionRef','platformRef','posture','ownerRef','sourceRef'],q); req(x.projectionRef,`${q}.projectionRef`); req(x.platformRef,`${q}.platformRef`); if(!PLATFORM_POSTURES.includes(x.posture)) throw new Error(`${q} has unsupported posture`); req(x.ownerRef,`${q}.ownerRef`); req(x.sourceRef,`${q}.sourceRef`); return copy(x); }).sort((a,b)=>a.projectionRef.localeCompare(b.projectionRef));
  if(new Set(platformProjections.map(x=>x.projectionRef)).size!==platformProjections.length) throw new Error(`${label} contains duplicate projectionRef`);
  if(!Array.isArray(r.wakePredicates)) throw new Error(`${label}.wakePredicates must be an array`);
  const wakePredicates=r.wakePredicates.map((x,i)=>{ const q=`${label}.wakePredicates[${i}]`; exact(x,['predicateRef','ownerRef','sourceRef'],q); req(x.predicateRef,`${q}.predicateRef`); req(x.ownerRef,`${q}.ownerRef`); req(x.sourceRef,`${q}.sourceRef`); return copy(x); }).sort((a,b)=>a.predicateRef.localeCompare(b.predicateRef));
  if(new Set(wakePredicates.map(x=>x.predicateRef)).size!==wakePredicates.length) throw new Error(`${label} contains duplicate predicateRef`);
  return {furnishingRef:r.furnishingRef,subject:{...copy(r.subject),semanticOwnerRefs:[...r.subject.semanticOwnerRefs].sort(),sourceRefs:[...r.subject.sourceRefs].sort()},placement:{posture:r.placement.posture,primary,contextual},bindings,orientationRelations,platformProjections,wakePredicates};
}
function checkKnown(r, known) {
  const check=(ref,label)=>{if(!known.has(ref)) throw new Error(`${r.furnishingRef} ${label} references unknown ref ${ref}`);};
  if(r.subject.subjectClass==='RESOURCE_PLACEMENT') check(r.subject.subjectRef,'subjectRef'); if(r.subject.resourceRefOrNull) check(r.subject.resourceRefOrNull,'resourceRefOrNull'); r.subject.semanticOwnerRefs.forEach(x=>check(x,'semanticOwnerRef')); r.subject.sourceRefs.forEach(x=>check(x,'subject sourceRef'));
  for(const p of [r.placement.primary,...r.placement.contextual].filter(Boolean)){ for(const x of [p.terrainNodeRefOrNull,p.presentationRefOrNull,p.routeRefOrNull,p.experienceDispositionRefOrNull].filter(Boolean)) check(x,'placement identity'); p.ownerRefs.forEach(x=>check(x,'placement ownerRef')); p.sourceRefs.forEach(x=>check(x,'placement sourceRef')); }
  for(const axis of AXES) for(const b of r.bindings[axis]){check(b.ownerRef,`${axis} ownerRef`);check(b.sourceRef,`${axis} sourceRef`);}
  for(const x of r.orientationRelations){check(x.targetSubjectRef,'orientation targetSubjectRef');check(x.ownerRef,'orientation ownerRef');check(x.sourceRef,'orientation sourceRef');}
  for(const x of r.platformProjections){check(x.platformRef,'platformRef');check(x.ownerRef,'platform ownerRef');check(x.sourceRef,'platform sourceRef');}
  for(const x of r.wakePredicates){check(x.ownerRef,'wake ownerRef');check(x.sourceRef,'wake sourceRef');}
}
export function loadFurnishingRegistry(root=ROOT){return JSON.parse(fs.readFileSync(path.join(root,'blueprint/furnishing-registry.json'),'utf8'));}
export function validateFurnishingRegistry(registry){
  exact(registry,['schemaVersion','registryRef','registryVersion','ownerRef','parentRef','sourcePlacementRef','purpose','effects','nonCollapseRules','contract','furnishings'],'furnishing registry');
  if(registry.schemaVersion!=='vexlife.furnishing-registry/v0') throw new Error('unsupported Furnishing registry schemaVersion'); req(registry.registryRef,'registryRef'); if(!Number.isInteger(registry.registryVersion)||registry.registryVersion<1) throw new Error('registryVersion must be a positive integer'); ['ownerRef','parentRef','sourcePlacementRef','purpose'].forEach(k=>req(registry[k],k));
  exact(registry.effects,EFFECTS,'effects'); EFFECTS.forEach(k=>{if(registry.effects[k]!==false) throw new Error(`Furnishing registry may not grant ${k}`);}); uniqStrings(registry.nonCollapseRules,'nonCollapseRules',true); NON_COLLAPSE.forEach(x=>{if(!registry.nonCollapseRules.includes(x)) throw new Error(`missing non-collapse rule ${x}`);});
  exact(registry.contract,['subjectClasses','movementClasses','placementPostures','orientationRelationClasses','platformPostures','derivedStateVocabularies','projectionPolicy'],'contract'); setEq(uniqStrings(registry.contract.subjectClasses,'contract.subjectClasses'),SUBJECT_CLASSES,'subjectClasses'); setEq(uniqStrings(registry.contract.movementClasses,'contract.movementClasses'),MOVEMENT_CLASSES,'movementClasses'); setEq(uniqStrings(registry.contract.placementPostures,'contract.placementPostures'),PLACEMENT_POSTURES,'placementPostures'); setEq(uniqStrings(registry.contract.orientationRelationClasses,'contract.orientationRelationClasses'),ORIENTATION_RELATION_CLASSES,'orientationRelationClasses'); setEq(uniqStrings(registry.contract.platformPostures,'contract.platformPostures'),PLATFORM_POSTURES,'platformPostures'); exact(registry.contract.derivedStateVocabularies,AXES,'derivedStateVocabularies'); AXES.forEach(a=>setEq(uniqStrings(registry.contract.derivedStateVocabularies[a],a),STATE_VOCABULARIES[a],a));
  const p=registry.contract.projectionPolicy; exact(p,['registryStoresDynamicTruth','missingRequiredBindingState','conflictingSourceObservationsState','semanticRelationAuthority','effectAuthorityGranted','boundedNeighborhoods','rawHistoryRequired'],'projectionPolicy'); if(p.registryStoresDynamicTruth||p.semanticRelationAuthority||p.effectAuthorityGranted||!p.boundedNeighborhoods||p.rawHistoryRequired||p.missingRequiredBindingState!=='UNKNOWN'||p.conflictingSourceObservationsState!=='UNKNOWN') throw new Error('invalid Furnishing projection authority/currentness policy');
  if(!Array.isArray(registry.furnishings)) throw new Error('furnishings must be an array'); const normalized=registry.furnishings.map((r,i)=>record(r,`furnishings[${i}]`)); if(new Set(normalized.map(x=>x.furnishingRef)).size!==normalized.length) throw new Error('duplicate furnishingRef'); return {ok:true,furnishingCount:normalized.length};
}
export function compileFurnishingRegistry(registry,{knownRefs=null}={}){
  validateFurnishingRegistry(registry); const furnishings=registry.furnishings.map((r,i)=>record(r,`furnishings[${i}]`)).sort((a,b)=>a.furnishingRef.localeCompare(b.furnishingRef));
  const subjects=new Set(furnishings.map(x=>x.subject.subjectRef)); if(subjects.size!==furnishings.length) throw new Error('duplicate subjectRef');
  for(const r of furnishings){ if(knownRefs){ if(!(knownRefs instanceof Set)) throw new Error('knownRefs must be a Set'); checkKnown(r,knownRefs); } }
  const core={schemaVersion:'vexlife.furnishing-contract/v0',registryRef:registry.registryRef,registryVersion:registry.registryVersion,ownerRef:registry.ownerRef,subjectClasses:[...SUBJECT_CLASSES],movementClasses:[...MOVEMENT_CLASSES],furnishings};
  return {...core,registryRevision:digest(core),semanticAuthority:false,currentStateAuthority:false,effectAuthority:false};
}
function identity(x){return {subjectClass:x.subject.subjectClass,subjectRef:x.subject.subjectRef,resourceRefOrNull:x.subject.resourceRefOrNull,semanticOwnerRefs:[...x.subject.semanticOwnerRefs].sort(),sourceRefs:[...x.subject.sourceRefs].sort()};}
export function validateMovement(before,after,movementClass){
  if(!MOVEMENT_CLASSES.includes(movementClass)) throw new Error(`unsupported movementClass ${movementClass}`); const a=record(before,'before'); const b=record(after,'after'); if(movementClass==='S') throw new Error('S semantic migration must be routed to the semantic owner');
  if(a.furnishingRef!==b.furnishingRef||JSON.stringify(identity(a))!==JSON.stringify(identity(b))) throw new Error(`${movementClass} movement cannot change Furnishing or semantic subject identity`);
  if(['G','V','A'].includes(movementClass)&&JSON.stringify(stable(a))!==JSON.stringify(stable(b))) throw new Error(`${movementClass} movement is external projection truth and must not rewrite static Furnishing registry semantics`);
  return {ok:true,movementClass,semanticIdentityPreserved:true};
}
function observationMap(observations){ if(!Array.isArray(observations)) throw new Error('observations must be an array'); const m=new Map(); observations.forEach((x,i)=>{const q=`observations[${i}]`; exact(x,['bindingRef','ownerRef','sourceRef','state','reasonRefs','evidenceRefs','effectAuthorityGranted'],q); ['bindingRef','ownerRef','sourceRef','state'].forEach(k=>req(x[k],`${q}.${k}`)); uniqStrings(x.reasonRefs,`${q}.reasonRefs`); uniqStrings(x.evidenceRefs,`${q}.evidenceRefs`); if(x.effectAuthorityGranted!==false) throw new Error(`${x.bindingRef} observation attempts to grant effect authority`); if(m.has(x.bindingRef)) throw new Error(`duplicate observation for ${x.bindingRef}`); m.set(x.bindingRef,copy(x));}); return m; }
function axisState(bindings,axis,obs){ if(!bindings.length) return {state:'UNKNOWN',observations:[],unknowns:[`NO_${axis.toUpperCase()}_BINDINGS`]}; const used=[],unknowns=[]; for(const b of bindings){const o=obs.get(b.bindingRef); if(!o){if(b.required) unknowns.push(`MISSING_REQUIRED_BINDING:${b.bindingRef}`); continue;} if(o.ownerRef!==b.ownerRef||o.sourceRef!==b.sourceRef) throw new Error(`${b.bindingRef} observation identity mismatch`); if(!STATE_VOCABULARIES[axis].includes(o.state)) throw new Error(`${b.bindingRef} has invalid ${axis} state ${o.state}`); used.push(o);} used.sort((a,b)=>a.bindingRef.localeCompare(b.bindingRef)); if(unknowns.length) return {state:'UNKNOWN',observations:used,unknowns}; if(!used.length) return {state:'UNKNOWN',observations:[],unknowns:[`NO_${axis.toUpperCase()}_OBSERVATIONS`]}; const states=[...new Set(used.map(x=>x.state))]; return states.length===1?{state:states[0],observations:used,unknowns:[]}:{state:'UNKNOWN',observations:used,unknowns:[`CONFLICTING_${axis.toUpperCase()}_SOURCE_OBSERVATIONS`]}; }
export function selectFurnishingNeighborhood(compiled,{seedFurnishingRefs,maxHops=1,maxResults=32}={}){
  if(compiled?.schemaVersion!=='vexlife.furnishing-contract/v0') throw new Error('compiled Furnishing contract required'); if(!Array.isArray(seedFurnishingRefs)||!seedFurnishingRefs.length) throw new Error('seedFurnishingRefs must be a non-empty array'); if(!Number.isInteger(maxHops)||maxHops<0||maxHops>8) throw new Error('maxHops must be an integer between 0 and 8'); if(!Number.isInteger(maxResults)||maxResults<1||maxResults>128) throw new Error('maxResults must be an integer between 1 and 128');
  const byRef=new Map(compiled.furnishings.map(x=>[x.furnishingRef,x])), bySubject=new Map(compiled.furnishings.map(x=>[x.subject.subjectRef,x.furnishingRef])), q=[], d=new Map(); for(const ref of [...new Set(seedFurnishingRefs)].sort()){if(!byRef.has(ref)) throw new Error(`unknown seed Furnishing ref ${ref}`);d.set(ref,0);q.push(ref);} while(q.length&&d.size<maxResults){const cur=q.shift(),n=d.get(cur);if(n>=maxHops)continue;for(const rel of byRef.get(cur).orientationRelations){const target=bySubject.get(rel.targetSubjectRef);if(!target||d.has(target))continue;d.set(target,n+1);q.push(target);if(d.size>=maxResults)break;}} return [...d].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).map(([furnishingRef,hops])=>({furnishingRef,hops}));
}
export function projectFurnishings(compiled,{observations=[],currentSemanticContextRefOrNull=null,selectedFurnishingRefOrNull=null,includeFurnishingRefsOrNull=null}={}){
  if(compiled?.schemaVersion!=='vexlife.furnishing-contract/v0') throw new Error('compiled Furnishing contract required'); nullable(currentSemanticContextRefOrNull,'currentSemanticContextRefOrNull'); nullable(selectedFurnishingRefOrNull,'selectedFurnishingRefOrNull'); const byRef=new Map(compiled.furnishings.map(x=>[x.furnishingRef,x])); const refs=includeFurnishingRefsOrNull===null?[...byRef.keys()].sort():uniqStrings(includeFurnishingRefsOrNull,'includeFurnishingRefsOrNull').sort(); refs.forEach(x=>{if(!byRef.has(x)) throw new Error(`unknown included Furnishing ref ${x}`);}); if(selectedFurnishingRefOrNull&&!byRef.has(selectedFurnishingRefOrNull)) throw new Error(`unknown selected Furnishing ref ${selectedFurnishingRefOrNull}`); if(selectedFurnishingRefOrNull&&!refs.includes(selectedFurnishingRefOrNull)) throw new Error('selected Furnishing ref must be included in the bounded projection');
  const obs=observationMap(observations), allowed=new Set(refs.flatMap(ref=>AXES.flatMap(a=>byRef.get(ref).bindings[a].map(b=>b.bindingRef)))); for(const ref of obs.keys()) if(!allowed.has(ref)) throw new Error(`observation references unknown or out-of-scope binding ${ref}`);
  const furnishings=refs.map(ref=>{const r=byRef.get(ref),states=Object.fromEntries(AXES.map(a=>[a,axisState(r.bindings[a],a,obs)])); const whyVisible=states.visibility.observations.filter(x=>x.state==='VISIBLE').flatMap(x=>x.reasonRefs).sort(),attentionReasons=states.attention.observations.filter(x=>x.state==='ATTENTION').flatMap(x=>x.reasonRefs).sort(),unknowns=AXES.flatMap(a=>states[a].unknowns).sort(),sources=new Set(r.subject.sourceRefs); for(const p of [r.placement.primary,...r.placement.contextual].filter(Boolean)) p.sourceRefs.forEach(x=>sources.add(x)); AXES.forEach(a=>r.bindings[a].forEach(b=>sources.add(b.sourceRef))); [...r.orientationRelations,...r.platformProjections,...r.wakePredicates].forEach(x=>sources.add(x.sourceRef)); AXES.forEach(a=>states[a].observations.forEach(o=>o.evidenceRefs.forEach(x=>sources.add(x)))); return {furnishingRef:r.furnishingRef,subject:copy(r.subject),placement:copy(r.placement),orientationRelations:copy(r.orientationRelations),...states,platformProjections:copy(r.platformProjections),wakePredicates:copy(r.wakePredicates),whyVisible,attentionReasons,unknowns,sourceRefs:[...sources].sort(),semanticAuthority:false,effectAuthorityGranted:false};});
  const id=digest({registryRevision:compiled.registryRevision,currentSemanticContextRefOrNull,selectedFurnishingRefOrNull,refs}).slice(0,24); return {schemaVersion:'vexlife.furnishing-projection/v0',sourceRegistryRef:compiled.registryRef,registryRevision:compiled.registryRevision,currentSemanticContextRefOrNull,currentFurnishingNeighborhoodRef:`neighborhood.vexlife.furnishing.${id}`,selectedFurnishingRefOrNull,furnishingRefs:refs,furnishings,semanticAuthority:false,effectAuthorityGranted:false};
}
async function main(){const compiled=compileFurnishingRegistry(loadFurnishingRegistry(ROOT));process.stdout.write(`${JSON.stringify({schemaVersion:'vexlife.furnishing-compiler-result/v0',state:'PASS',registryRef:compiled.registryRef,registryRevision:compiled.registryRevision,furnishingCount:compiled.furnishings.length,semanticAuthority:compiled.semanticAuthority,currentStateAuthority:compiled.currentStateAuthority,effectAuthority:compiled.effectAuthority},null,2)}\n`);}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) await main();
// [VXG RealForever]