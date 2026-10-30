import { semanticHash } from './utils.mjs';

export const PORTABLE_CONVERGENCE_SCHEMA_VERSION = 'vexlife.portable-convergence-contract/v1';
export const PORTABLE_CONVERGENCE_REQUIRED_INVARIANTS = Object.freeze([
  'INDEPENDENT_INPUT_OWNERSHIP',
  'LATEST_COHERENT_INPUT_REQUIRED',
  'RELATIONSHIP_OUTPUT_NOT_EFFECT_COMMAND',
  'SEMANTIC_STATE_NOT_DISPLAY_STATE',
  'RELATIONSHIP_OUTPUT_HANDS_TO_FAMILY_STATE',
  'LOADED_DOCUMENT_SOURCE_DISTINCT_FROM_CURRENT_SERVER_SOURCE',
  'STALE_OBSERVATION_CANNOT_OVERWRITE_CURRENT_GENERATION',
  'READY_REQUIRES_CURRENT_SELECTED_CONVERSATION',
  'RECOVERY_TRUTH_DOES_NOT_REQUIRE_SEND_CURRENTNESS',
  'SOURCE_MISMATCH_PRECEDES_RECOVERY_PRESENTATION',
  'SOURCE_DESCENT',
  'PROOF_OBLIGATION_IDENTITY'
]);

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;
const CONTRACT_KEYS = Object.freeze([
  'schemaVersion','contractRef','relationshipRef','ownerBlueprintRef','purpose','initialStateRef',
  'canonicalSource','authority','inputIdentities','stateIdentities','invariantIdentities',
  'relationshipLawRows','sourceBindings','heldRealizations'
]);
const CANONICAL_SOURCE_KEYS = Object.freeze(['repository','path','compositionField']);
const AUTHORITY_KEYS = Object.freeze([
  'portableMeaningOwner','platformRealizationOwner','effectAuthorityOwner','rendererAuthorityOwner','stateOwnerTransferAllowed'
]);
const INPUT_KEYS = Object.freeze(['inputRef','ownerRef','brief','independentOwner','requiredForCoherence']);
const STATE_KEYS = Object.freeze([
  'stateRef','kind','brief','conditions','semanticState','familySemanticState','displayState','effectCommand'
]);
const INVARIANT_KEYS = Object.freeze(['invariantRef','code','statement']);
const LAW_KEYS = Object.freeze(['rowRef','when','derivedStateRef','effectAuthorityGranted','sourceRefs']);
const SOURCE_KEYS = Object.freeze(['sourceRef','repository','commit','role','paths']);

function nonEmptyString(value){return typeof value==='string'&&value.length>0;}
function exactKeys(value,expected){if(!value||typeof value!=='object'||Array.isArray(value))return false;return JSON.stringify(Object.keys(value).sort())===JSON.stringify([...expected].sort());}
function validRef(value){return nonEmptyString(value)&&REF.test(value);}
function nonEmptyStringArray(value){return Array.isArray(value)&&value.length>0&&value.every(nonEmptyString)&&new Set(value).size===value.length;}
function identityEntry({ref,kind,brief,record,edges=[]}){return Object.freeze({ref,kind,brief,stateHash:semanticHash(record),edges:Object.freeze(edges.map(edge=>Object.freeze(edge)))});}

function collectIdentities(contract,errors){
  const specs=[['inputIdentities','inputRef'],['stateIdentities','stateRef'],['invariantIdentities','invariantRef'],['relationshipLawRows','rowRef'],['sourceBindings','sourceRef']];
  const all=new Set([contract.contractRef,contract.relationshipRef]);
  const byField={};
  for(const [field,refField] of specs){
    const items=contract[field];
    const refs=new Set();byField[field]=refs;
    if(!Array.isArray(items)||items.length===0){errors.push(`${contract.contractRef??'portable convergence contract'} ${field} must be a non-empty array`);continue;}
    for(const [index,item] of items.entries()){
      const ref=item?.[refField];
      if(!validRef(ref)){errors.push(`${contract.contractRef??'portable convergence contract'} ${field}[${index}] missing valid ${refField}`);continue;}
      if(refs.has(ref))errors.push(`${contract.contractRef} duplicate ${refField} ${ref}`);
      if(all.has(ref))errors.push(`${contract.contractRef} duplicate stable identity ${ref}`);
      refs.add(ref);all.add(ref);
    }
  }
  return {all,byField};
}

function validateContract(contract,index,errors,{knownOwnerRefs=null}={}){
  const label=contract?.contractRef??`portable convergence contract ${index}`;
  if(!contract||typeof contract!=='object'||Array.isArray(contract)){errors.push(`portable convergence contract ${index} must be an object`);return {laws:0,ownedRefs:0};}
  if(!exactKeys(contract,CONTRACT_KEYS))errors.push(`${label} must use exact top-level fields`);
  for(const field of ['contractRef','relationshipRef','ownerBlueprintRef','purpose','initialStateRef']){
    if(!nonEmptyString(contract[field])||(field!=='purpose'&&!REF.test(contract[field])))errors.push(`${label} missing valid ${field}`);
  }
  if(contract.schemaVersion!==PORTABLE_CONVERGENCE_SCHEMA_VERSION)errors.push(`${label} schemaVersion must be ${PORTABLE_CONVERGENCE_SCHEMA_VERSION}`);
  if(contract.ownerBlueprintRef!=='blueprint.vexlife.universal.001')errors.push(`${label} ownerBlueprintRef must remain blueprint.vexlife.universal.001`);
  if(!exactKeys(contract.canonicalSource,CANONICAL_SOURCE_KEYS)||contract.canonicalSource.repository!=='vgong24/VexLife'||contract.canonicalSource.path!=='blueprint/fragments/convergence-contracts/interface-currentness.json'||contract.canonicalSource.compositionField!=='convergenceContracts')errors.push(`${label} canonicalSource must bind the VexLife convergenceContracts composition`);
  if(!exactKeys(contract.authority,AUTHORITY_KEYS)||contract.authority.portableMeaningOwner!==true||contract.authority.platformRealizationOwner!==false||contract.authority.effectAuthorityOwner!==false||contract.authority.rendererAuthorityOwner!==false||contract.authority.stateOwnerTransferAllowed!==false)errors.push(`${label} authority boundary is malformed`);

  const {all,byField}=collectIdentities(contract,errors);
  const inputs=byField.inputIdentities??new Set();
  const states=byField.stateIdentities??new Set();
  const sources=byField.sourceBindings??new Set();
  if(!states.has(contract.initialStateRef))errors.push(`${label} initialStateRef must reference one declared state`);

  for(const [idx,input] of (contract.inputIdentities??[]).entries()){
    if(!exactKeys(input,INPUT_KEYS))errors.push(`${label} inputIdentities[${idx}] must use exact input fields`);
    if(!validRef(input.ownerRef)||!nonEmptyString(input.brief))errors.push(`${input.inputRef??label} requires ownerRef and brief`);
    if(input.independentOwner!==true||input.requiredForCoherence!==true)errors.push(`${input.inputRef??label} must remain independently owned and required for coherence`);
    if(knownOwnerRefs instanceof Set&&!knownOwnerRefs.has(input.ownerRef))errors.push(`${input.inputRef} ownerRef does not resolve: ${input.ownerRef}`);
  }
  for(const [idx,state] of (contract.stateIdentities??[]).entries()){
    if(!exactKeys(state,STATE_KEYS))errors.push(`${label} stateIdentities[${idx}] must use exact state fields`);
    if(!nonEmptyString(state.kind)||!nonEmptyString(state.brief)||!nonEmptyStringArray(state.conditions))errors.push(`${state.stateRef??label} requires kind brief and conditions`);
    if(state.semanticState!==true||state.familySemanticState!==true||state.displayState!==false||state.effectCommand!==false)errors.push(`${state.stateRef??label} must remain portable semantic Family state and never display/effect state`);
  }
  const invariantCodes=new Set();
  for(const [idx,invariant] of (contract.invariantIdentities??[]).entries()){
    if(!exactKeys(invariant,INVARIANT_KEYS))errors.push(`${label} invariantIdentities[${idx}] must use exact invariant fields`);
    if(!nonEmptyString(invariant.code)||!nonEmptyString(invariant.statement))errors.push(`${invariant.invariantRef??label} requires code and statement`);
    if(invariantCodes.has(invariant.code))errors.push(`${label} duplicate invariant code ${invariant.code}`);
    invariantCodes.add(invariant.code);
  }
  for(const required of PORTABLE_CONVERGENCE_REQUIRED_INVARIANTS)if(!invariantCodes.has(required))errors.push(`${label} missing required invariant ${required}`);

  const derivedStates=new Set();
  for(const [idx,row] of (contract.relationshipLawRows??[]).entries()){
    if(!exactKeys(row,LAW_KEYS)){errors.push(`${label} relationshipLawRows[${idx}] must use exact law fields`);continue;}
    if(!nonEmptyStringArray(row.when))errors.push(`${row.rowRef??label} when must be a non-empty unique string array`);
    if(!states.has(row.derivedStateRef))errors.push(`${row.rowRef??label} references missing derivedStateRef ${row.derivedStateRef}`);
    if(row.derivedStateRef===contract.initialStateRef)errors.push(`${row.rowRef??label} must not derive initialStateRef`);
    if(row.effectAuthorityGranted!==false)errors.push(`${row.rowRef??label} must never grant effect authority`);
    if(!Array.isArray(row.sourceRefs)||row.sourceRefs.length===0||row.sourceRefs.some(ref=>!sources.has(ref)))errors.push(`${row.rowRef??label} sourceRefs must bind existing sourceBindings`);
    if(states.has(row.derivedStateRef))derivedStates.add(row.derivedStateRef);
  }
  for(const stateRef of states)if(stateRef!==contract.initialStateRef&&!derivedStates.has(stateRef))errors.push(`${label} semantic state has no derivation law: ${stateRef}`);

  for(const [idx,source] of (contract.sourceBindings??[]).entries()){
    if(!exactKeys(source,SOURCE_KEYS))errors.push(`${label} sourceBindings[${idx}] must use exact source fields`);
    if(!nonEmptyString(source.repository)||!HEX40.test(source.commit??'')||!nonEmptyString(source.role)||!nonEmptyStringArray(source.paths))errors.push(`${source.sourceRef??label} source binding is malformed`);
  }
  if(!Array.isArray(contract.heldRealizations)||contract.heldRealizations.length===0||contract.heldRealizations.some(x=>!nonEmptyString(x))||new Set(contract.heldRealizations).size!==contract.heldRealizations.length)errors.push(`${label} heldRealizations must be unique and non-empty`);
  return {laws:contract.relationshipLawRows?.length??0,ownedRefs:all.size,inputs:inputs.size,states:states.size};
}

export function validatePortableConvergenceContracts(contracts,options={}){
  const errors=[];
  if(!Array.isArray(contracts)||contracts.length===0)return {ok:false,errors:['universal blueprint missing portable convergenceContracts composition'],stats:{contracts:0,laws:0,ownedRefs:0,inputs:0,states:0}};
  const contractRefs=new Set(),relationshipRefs=new Set();let laws=0,ownedRefs=0,inputs=0,states=0;
  for(const [index,contract] of contracts.entries()){
    if(contractRefs.has(contract?.contractRef))errors.push(`duplicate portable convergence contract ${contract.contractRef}`);
    if(relationshipRefs.has(contract?.relationshipRef))errors.push(`duplicate portable convergence relationship ${contract.relationshipRef}`);
    if(contract?.contractRef)contractRefs.add(contract.contractRef);if(contract?.relationshipRef)relationshipRefs.add(contract.relationshipRef);
    const stats=validateContract(contract,index,errors,options);laws+=stats.laws;ownedRefs+=stats.ownedRefs;inputs+=stats.inputs;states+=stats.states;
  }
  return {ok:errors.length===0,errors,stats:{contracts:contracts.length,laws,ownedRefs,inputs,states}};
}

export function buildPortableConvergenceIdentityEntries(contracts){
  const validation=validatePortableConvergenceContracts(contracts);
  if(!validation.ok)throw new Error(`Portable Convergence invalid: ${validation.errors.join('; ')}`);
  const entries=[];
  for(const contract of contracts){
    const parent=contract.contractRef;
    for(const source of contract.sourceBindings)entries.push(identityEntry({ref:source.sourceRef,kind:'CONVERGENCE_SOURCE',brief:`${source.role}: ${source.repository}@${source.commit}`,record:source}));
    entries.push(identityEntry({ref:parent,kind:'CONVERGENCE_CONTRACT',brief:contract.purpose,record:contract,edges:[{type:'OWNS',to:contract.relationshipRef},{type:'OWNER_BLUEPRINT',to:contract.ownerBlueprintRef},...contract.sourceBindings.map(source=>({type:'SOURCE',to:source.sourceRef}))]}));
    entries.push(identityEntry({ref:contract.relationshipRef,kind:'CONVERGENCE_RELATIONSHIP',brief:contract.purpose,record:{relationshipRef:contract.relationshipRef,contractRef:parent,initialStateRef:contract.initialStateRef},edges:[{type:'CONTRACT',to:parent},{type:'INITIAL_STATE',to:contract.initialStateRef},...contract.inputIdentities.map(input=>({type:'INPUT',to:input.inputRef})),...contract.relationshipLawRows.map(row=>({type:'LAW',to:row.rowRef}))]}));
    for(const input of contract.inputIdentities)entries.push(identityEntry({ref:input.inputRef,kind:'CONVERGENCE_INPUT',brief:input.brief,record:input,edges:[{type:'CONTRACT',to:parent},{type:'OWNER',to:input.ownerRef}]}));
    for(const state of contract.stateIdentities)entries.push(identityEntry({ref:state.stateRef,kind:'CONVERGENCE_STATE',brief:state.brief,record:state,edges:[{type:'CONTRACT',to:parent},{type:'RELATIONSHIP',to:contract.relationshipRef}]}));
    for(const invariant of contract.invariantIdentities)entries.push(identityEntry({ref:invariant.invariantRef,kind:'CONVERGENCE_INVARIANT',brief:invariant.statement,record:invariant,edges:[{type:'CONTRACT',to:parent}]}));
    for(const row of contract.relationshipLawRows)entries.push(identityEntry({ref:row.rowRef,kind:'CONVERGENCE_LAW_ROW',brief:`derive ${row.derivedStateRef}`,record:row,edges:[{type:'CONTRACT',to:parent},{type:'DERIVES',to:row.derivedStateRef},...row.sourceRefs.map(sourceRef=>({type:'SOURCE',to:sourceRef}))]}));
  }
  return Object.freeze(entries);
}

// [VXG RealForever]
