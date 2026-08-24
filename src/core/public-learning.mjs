import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Atlas } from './atlas.mjs';
import { loadBlueprint, VEXLIFE_ROOT } from './blueprint.mjs';
import { compileRegistryPack, buildRegistryProjection } from './registry.mjs';
import { canonicalize, readJson, requireSafeRelativePath, semanticHash } from './utils.mjs';

export const PUBLIC_LEARNING_SCHEMA = 'vexlife.public-learning-registry/v1';
export const PUBLIC_LEARNING_STRINGS_SCHEMA = 'vexlife.public-learning-strings/v1';
export const PUBLIC_LEARNING_PROJECTION_SCHEMA = 'vexlife.public-learning-projection/v1';
export const PUBLIC_LEARNING_STATE_DIMENSIONS = Object.freeze([
  'registrationState', 'implementationState', 'capabilityStage', 'publicAvailabilityState',
  'sourceAcceptanceState', 'liveDeploymentState', 'currentnessState', 'dataClass'
]);
const SOURCE_STATES = new Set(['ACCEPTED_CURRENT', 'CANDIDATE_PROOF_ONLY']);
const AVAILABILITY = new Set(['PUBLIC_STATIC', 'EXPLAINABLE_ONLY', 'LOCAL_VEXLIFE_REQUIRED', 'HELD', 'UNKNOWN']);
const GROUP_AUTHORITY = new Set(['actionRef','actionRefs','capabilityStage','effectClass','implementationState','permissionRef','permissionRefs','processRef','processRefs','state','stateRef','stateRefs','status','writes']);
const PROTECTED = /(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9._~+\/-]{16,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:^|[\\/])(?:\.git|\.ssh|docs[\\/]private-continuity)(?:[\\/]|$)|(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)[^\s]+|javascript\s*:|<\s*script\b)/iu;
const TREE_HEADER = /^(100644|100755|120000) blob ([0-9a-f]{40})$/u;

function need(condition, message) { if (!condition) throw new Error(message); }
const clone = (value) => structuredClone(value);
const stable = (value, label) => { need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value), `${label} must be a stable ref`); return value; };
const stringRef = (value, label) => { need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value), `${label} must be a string ref`); return value; };
const unique = (values, label) => { need(Array.isArray(values) && new Set(values).size === values.length && values.every(Boolean), `${label} must contain unique refs`); return values; };

function runGit(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8').trim() : '';
    throw new Error(`public learning Git identity check failed (${args.join(' ')}): ${stderr || error.message}`);
  }
}

function gitBlobId(bytes) {
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, 'utf8'), bytes])).digest('hex');
}

function splitNullRecords(buffer) {
  const records = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index > start) records.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (start < buffer.length) records.push(buffer.subarray(start));
  return records;
}

function decodeGitPath(buffer) {
  const value = buffer.toString('utf8');
  need(Buffer.from(value, 'utf8').equals(buffer), 'public learning source tree contains a non-UTF-8 path');
  return value;
}

function safeJson(value, label) {
  const text = JSON.stringify(value);
  need(!PROTECTED.test(text), `${label} contains protected material`);
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const proto = Object.getPrototypeOf(v);
    need(proto === Object.prototype || proto === null, `${label} must use plain JSON objects`);
    for (const [key, nested] of Object.entries(v)) {
      need(key !== '__proto__', `${label} contains a forbidden object key`);
      need(!(key === 'constructor' && nested && typeof nested === 'object' && Object.hasOwn(nested, 'prototype')), `${label} contains a forbidden object key`);
      walk(nested);
    }
  };
  walk(value);
}

function publicPath(root, value, label) {
  requireSafeRelativePath(value, label);
  const normalized = value.replace(/\\/gu, '/');
  need(!path.isAbsolute(normalized), `${label} must be repository-relative`);
  need(!['.git/','.github/private/','docs/private-continuity/','node_modules/','artifacts/'].some((prefix) => normalized.startsWith(prefix)), `${label} is not public-admitted`);
  if (root) need(fs.existsSync(path.join(root, normalized)), `${label} does not exist in the source root`);
  return normalized;
}

function usedStringRefs(registry) {
  const refs = new Set([registry.prototype?.purposeRef]);
  for (const group of registry.publicGroups ?? []) [group.titleRef, group.briefRef, group.purposeRef].forEach((ref) => refs.add(ref));
  for (const node of registry.canonicalNodes ?? []) [node.titleRef, node.briefRef].forEach((ref) => refs.add(ref));
  for (const leaf of registry.leafPresentations ?? []) [leaf.titleRef, leaf.summaryRef, ...Object.values(leaf.sectionRefs ?? {})].forEach((ref) => refs.add(ref));
  refs.delete(null); refs.delete(undefined);
  return [...refs].sort();
}

export function validatePublicLearningSourceBinding(binding) {
  safeJson(binding, 'public learning source binding');
  need(binding?.repository === 'vgong24/VexLife', 'source repository must be vgong24/VexLife');
  need(/^[0-9a-f]{40}$/u.test(binding?.commitSha ?? '') && /^[0-9a-f]{40}$/u.test(binding?.treeSha ?? ''), 'source binding requires full lowercase commit/tree SHAs');
  need(SOURCE_STATES.has(binding?.sourceAcceptanceState), 'invalid sourceAcceptanceState');
  need(Object.keys(binding).every((key) => ['repository','commitSha','treeSha','sourceAcceptanceState'].includes(key)), 'source binding contains an unexpected field');
  return clone(binding);
}

export function verifyPublicLearningSourceRoot(root = VEXLIFE_ROOT, sourceBinding) {
  const binding = validatePublicLearningSourceBinding(sourceBinding);
  const requestedRoot = fs.realpathSync(path.resolve(root));
  const prefix = runGit(requestedRoot, ['rev-parse', '--show-prefix']).toString('utf8').trim();
  const gitRoot = fs.realpathSync(runGit(requestedRoot, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
  need(prefix === '' && gitRoot === requestedRoot, 'public learning source root must be the Git worktree root');

  const commitSha = runGit(requestedRoot, ['rev-parse', '--verify', `${binding.commitSha}^{commit}`]).toString('utf8').trim();
  need(commitSha === binding.commitSha, 'public learning source commit did not resolve exactly');
  const treeSha = runGit(requestedRoot, ['show', '-s', '--format=%T', binding.commitSha]).toString('utf8').trim();
  need(treeSha === binding.treeSha, `public learning source tree mismatch: expected ${binding.treeSha}, got ${treeSha}`);
  const headSha = runGit(requestedRoot, ['rev-parse', 'HEAD']).toString('utf8').trim();
  need(headSha === binding.commitSha, `public learning source root HEAD mismatch: expected ${binding.commitSha}, got ${headSha}`);

  const status = runGit(requestedRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none']).toString('utf8');
  need(status.trim() === '', 'public learning source root must be clean; ambient worktree/index/untracked bytes are not accepted input');

  const records = splitNullRecords(runGit(requestedRoot, ['ls-tree', '-r', '-z', '--full-tree', binding.commitSha]));
  let verifiedBlobCount = 0;
  for (const record of records) {
    const separator = record.indexOf(9);
    need(separator > 0, 'public learning source tree emitted a malformed entry');
    const header = record.subarray(0, separator).toString('ascii');
    const relativePath = decodeGitPath(record.subarray(separator + 1));
    const match = header.match(TREE_HEADER);
    need(match, `public learning source tree contains an unsupported entry: ${relativePath}`);
    const [, mode, objectId] = match;
    const target = path.join(requestedRoot, ...relativePath.split('/'));
    let stat;
    try { stat = fs.lstatSync(target); } catch { throw new Error(`public learning source path is missing: ${relativePath}`); }
    let bytes;
    if (mode === '120000' && stat.isSymbolicLink()) bytes = Buffer.from(fs.readlinkSync(target), 'utf8');
    else {
      need(stat.isFile(), `public learning source path is not a file: ${relativePath}`);
      bytes = fs.readFileSync(target);
    }
    need(gitBlobId(bytes) === objectId, `public learning source bytes differ from bound Git tree: ${relativePath}`);
    verifiedBlobCount += 1;
  }
  need(verifiedBlobCount > 0, 'public learning source tree contains no verifiable blobs');
  return { repositoryRoot: requestedRoot, commitSha, treeSha, verifiedBlobCount };
}

export function loadPublicLearningSource(root = VEXLIFE_ROOT) {
  const registry = readJson(path.join(root, 'blueprint/public-learning-registry.json'));
  const catalogs = Object.fromEntries((registry.requiredLocales ?? []).map((locale) => [locale, readJson(path.join(root, `blueprint/public-learning/strings/${locale}.json`))]));
  return { registry, catalogs };
}

export function validatePublicLearningInputs({ root = VEXLIFE_ROOT, bundle = null, registry, catalogs, canonicalRegistry = null } = {}) {
  safeJson(registry, 'public learning registry');
  Object.entries(catalogs ?? {}).forEach(([locale, catalog]) => safeJson(catalog, `public learning ${locale} catalog`));
  need(registry?.schemaVersion === PUBLIC_LEARNING_SCHEMA, 'invalid public learning schema');
  stable(registry.registryRef, 'registryRef'); stable(registry.projectionRef, 'projectionRef');
  need(registry.sourceLocale === 'en' && JSON.stringify(registry.requiredLocales) === JSON.stringify(['en','ja','zh']), 'required locales must be exactly en, ja, zh');
  need(JSON.stringify(registry.stateDimensions) === JSON.stringify(PUBLIC_LEARNING_STATE_DIMENSIONS), 'state dimensions drifted');
  need(JSON.stringify(canonicalize(registry.sourcePolicy)) === JSON.stringify(canonicalize({inputProductRootClass:'EXACT_SOURCE_BINDING',acceptedState:'ACCEPTED_CURRENT',candidateProofState:'CANDIDATE_PROOF_ONLY',openPrInput:false,historicalUnmergedInput:false,worktreeInput:false,wallClockAsProductTruth:false,browserRuntimeRepositoryScan:false})), 'source policy drifted');

  const currentBundle = bundle ?? loadBlueprint(root);
  const compiled = canonicalRegistry ?? compileRegistryPack(currentBundle);
  const canonicalRefs = new Set(compiled.entries.keys());
  const groups = registry.publicGroups ?? [], configs = registry.canonicalNodes ?? [], leaves = registry.leafPresentations ?? [];
  const groupRefs = new Set(), configRefs = new Set(), publicRefs = new Set([registry.registryRef]);
  for (const group of groups) {
    stable(group.groupRef, 'groupRef'); need(!groupRefs.has(group.groupRef), `duplicate group ${group.groupRef}`); groupRefs.add(group.groupRef); publicRefs.add(group.groupRef);
    need(!Object.keys(group).some((key) => GROUP_AUTHORITY.has(key)), `${group.groupRef} claims canonical/effect authority`);
    [group.titleRef,group.briefRef,group.purposeRef].forEach((ref) => stringRef(ref, 'group string ref'));
    unique(group.childGroupRefs ?? [], 'childGroupRefs'); unique(group.memberRefs ?? [], 'memberRefs');
  }
  for (const config of configs) {
    stable(config.canonicalRef, 'canonicalRef'); need(!configRefs.has(config.canonicalRef), `duplicate canonical config ${config.canonicalRef}`); configRefs.add(config.canonicalRef); publicRefs.add(config.canonicalRef);
    need(canonicalRefs.has(config.canonicalRef), `canonical ref does not resolve: ${config.canonicalRef}`); need(AVAILABILITY.has(config.publicAvailabilityState), `${config.canonicalRef} has invalid public availability`);
    [config.titleRef,config.briefRef].forEach((ref) => stringRef(ref, 'canonical string ref')); stable(config.leafRef, 'leafRef'); unique(config.relatedRefs ?? [], 'relatedRefs');
    (config.sourcePaths ?? []).forEach((sourcePath) => publicPath(root, sourcePath, `${config.canonicalRef} sourcePath`));
  }
  for (const group of groups) {
    if (group.parentGroupRef !== null) need(groupRefs.has(group.parentGroupRef), `${group.groupRef} has unknown parent`);
    (group.childGroupRefs ?? []).forEach((ref) => need(groupRefs.has(ref), `${group.groupRef} has unknown child`));
    (group.memberRefs ?? []).forEach((ref) => need(configRefs.has(ref), `${group.groupRef} member is not public-admitted`));
  }
  configs.forEach((config) => (config.relatedRefs ?? []).forEach((ref) => need(publicRefs.has(ref), `${config.canonicalRef} relates to a non-public identity`)));

  const catalogStrings = {};
  for (const locale of ['en','ja','zh']) {
    const catalog = catalogs?.[locale]; need(catalog?.schemaVersion === PUBLIC_LEARNING_STRINGS_SCHEMA && catalog.registryRef === registry.registryRef && catalog.locale === locale && catalog.sourceLocale === 'en', `${locale} catalog identity is invalid`);
    need(typeof catalog.languageName === 'string' && catalog.languageName.trim() && catalog.strings && typeof catalog.strings === 'object', `${locale} catalog is incomplete`);
    catalogStrings[locale] = catalog.strings;
  }
  const keySet = Object.keys(catalogStrings.en).sort();
  for (const locale of ['en','ja','zh']) { need(JSON.stringify(Object.keys(catalogStrings[locale]).sort()) === JSON.stringify(keySet), `${locale} key set differs`); Object.values(catalogStrings[locale]).forEach((value) => need(typeof value === 'string' && value.trim(), `${locale} contains empty copy`)); }
  need(JSON.stringify(keySet) === JSON.stringify(usedStringRefs(registry)), 'catalogs must exactly cover referenced public strings');

  const leafRefs = new Set(), routes = new Set(), leafByCanonical = new Map();
  for (const leaf of leaves) {
    stable(leaf.leafRef, 'leafRef'); need(!leafRefs.has(leaf.leafRef), `duplicate leaf ${leaf.leafRef}`); leafRefs.add(leaf.leafRef); need(configRefs.has(leaf.canonicalRef) && !leafByCanonical.has(leaf.canonicalRef), `${leaf.leafRef} has invalid canonical binding`); leafByCanonical.set(leaf.canonicalRef, leaf.leafRef);
    need(typeof leaf.routePath === 'string' && /^\/learn\/[A-Za-z0-9/_-]+\/$/u.test(leaf.routePath) && !leaf.routePath.includes('..') && !routes.has(leaf.routePath), `invalid or duplicate leaf route ${leaf.routePath}`); routes.add(leaf.routePath);
    [leaf.titleRef,leaf.summaryRef,...Object.values(leaf.sectionRefs ?? {})].forEach((ref) => stringRef(ref, 'leaf string ref'));
  }
  configs.forEach((config) => need(leafByCanonical.get(config.canonicalRef) === config.leafRef, `${config.canonicalRef} leaf does not resolve`));
  stable(registry.prototype?.prototypeRef, 'prototypeRef'); need(groupRefs.has(registry.prototype?.entryRef) && registry.prototype?.finalHomeHierarchy === false, 'prototype must bind a public group and remain non-final');
  return { ok:true, errors:[], stats:{groupCount:groups.length,canonicalNodeCount:configs.length,leafCount:leaves.length,localeCount:3,stringKeyCount:keySet.length}, bundle:currentBundle, canonicalRegistry:compiled };
}

function states(entry, config, binding, bundle) {
  const capabilityStage = entry.kind === 'CAPABILITY' ? (entry.defaultStage ?? 'UNKNOWN') : null;
  if (capabilityStage) need((bundle.capabilities?.stages ?? []).includes(capabilityStage), `${entry.ref} has invalid capability stage`);
  return { registrationState:'REGISTERED', implementationState:entry.kind === 'FEATURE' ? (entry.status ?? 'UNKNOWN') : null, capabilityStage, publicAvailabilityState:config.publicAvailabilityState, sourceAcceptanceState:binding.sourceAcceptanceState, liveDeploymentState:'NOT_DEPLOYED', currentnessState:binding.sourceAcceptanceState === 'ACCEPTED_CURRENT' ? 'CURRENT_SOURCE_BINDING' : 'CANDIDATE_PROOF_ONLY', dataClass:'PUBLIC_SAFE' };
}

export function buildPublicLearningProjection({ root = VEXLIFE_ROOT, sourceBinding } = {}) {
  const binding = validatePublicLearningSourceBinding(sourceBinding);
  verifyPublicLearningSourceRoot(root, binding);
  const loaded = loadPublicLearningSource(root);
  const validation = validatePublicLearningInputs({root,registry:loaded.registry,catalogs:loaded.catalogs});
  const compiled = validation.canonicalRegistry, before = buildRegistryProjection(compiled), en = loaded.catalogs.en.strings, nodes = [];
  const leafByCanonical = new Map(loaded.registry.leafPresentations.map((leaf) => [leaf.canonicalRef,leaf]));
  nodes.push({ref:loaded.registry.registryRef,kind:'PUBLIC_PROJECTION_REGISTRY',nodeClass:'PUBLIC_PROJECTION_REGISTRY',brief:loaded.registry.purpose,parentRef:null,states:{registrationState:'REGISTERED',implementationState:null,capabilityStage:null,publicAvailabilityState:'PUBLIC_STATIC',sourceAcceptanceState:binding.sourceAcceptanceState,liveDeploymentState:'NOT_DEPLOYED',currentnessState:binding.sourceAcceptanceState === 'ACCEPTED_CURRENT' ? 'CURRENT_SOURCE_BINDING':'CANDIDATE_PROOF_ONLY',dataClass:'PUBLIC_SAFE'},edges:loaded.registry.publicGroups.filter((g)=>g.parentGroupRef===null).map((g)=>({type:'PUBLIC_GROUP',to:g.groupRef})).sort((a,b)=>a.to.localeCompare(b.to))});
  for (const group of [...loaded.registry.publicGroups].sort((a,b)=>a.groupRef.localeCompare(b.groupRef))) { const edges=[...(group.parentGroupRef?[{type:'PUBLIC_PARENT',to:group.parentGroupRef}]:[]),...(group.childGroupRefs??[]).map((to)=>({type:'PUBLIC_GROUP',to})),...(group.memberRefs??[]).map((to)=>({type:'PUBLIC_MEMBER',to}))].sort((a,b)=>`${a.type}:${a.to}`.localeCompare(`${b.type}:${b.to}`)); nodes.push({ref:group.groupRef,kind:'PUBLIC_PROJECTION_GROUP',nodeClass:'PUBLIC_GROUPING_NODE',brief:en[group.briefRef],titleRef:group.titleRef,briefRef:group.briefRef,purposeRef:group.purposeRef,parentRef:group.parentGroupRef,states:{registrationState:'REGISTERED',implementationState:null,capabilityStage:null,publicAvailabilityState:'PUBLIC_STATIC',sourceAcceptanceState:binding.sourceAcceptanceState,liveDeploymentState:'NOT_DEPLOYED',currentnessState:binding.sourceAcceptanceState==='ACCEPTED_CURRENT'?'CURRENT_SOURCE_BINDING':'CANDIDATE_PROOF_ONLY',dataClass:'PUBLIC_SAFE'},relationshipSummary:{shownRelationshipCount:edges.length,additionalPublicRelationshipCount:0,projectionRuleRef:'rule.vexlife.public-learning.explicit-admission.001'},edges}); }
  for (const config of [...loaded.registry.canonicalNodes].sort((a,b)=>a.canonicalRef.localeCompare(b.canonicalRef))) { const entry=compiled.require(config.canonicalRef), groups=loaded.registry.publicGroups.filter((g)=>(g.memberRefs??[]).includes(config.canonicalRef)).map((g)=>g.groupRef), edges=[...groups.map((to)=>({type:'PUBLIC_GROUP_MEMBER_OF',to})),...(config.relatedRefs??[]).map((to)=>({type:'PUBLIC_RELATED',to}))].sort((a,b)=>`${a.type}:${a.to}`.localeCompare(`${b.type}:${b.to}`)), leaf=leafByCanonical.get(config.canonicalRef); nodes.push({ref:entry.ref,kind:entry.kind,nodeClass:'CANONICAL_NODE',canonicalKind:entry.kind,canonicalBrief:entry.brief??null,brief:en[config.briefRef],titleRef:config.titleRef,briefRef:config.briefRef,parentRef:null,states:states(entry,config,binding,validation.bundle),leafRef:config.leafRef,routePath:leaf?.routePath??null,sourcePaths:clone(config.sourcePaths??[]),relationshipSummary:{shownRelationshipCount:edges.length,additionalPublicRelationshipCount:0,projectionRuleRef:'rule.vexlife.public-learning.explicit-admission.001'},edges}); }
  const admitted = new Set(nodes.map((node)=>node.ref)); nodes.forEach((node)=>(node.edges??[]).forEach((edge)=>need(admitted.has(edge.to),`public edge target is not admitted: ${edge.to}`)));
  const configByRef = new Map(loaded.registry.canonicalNodes.map((config)=>[config.canonicalRef,config]));
  const leaves = [...loaded.registry.leafPresentations].sort((a,b)=>a.leafRef.localeCompare(b.leafRef)).map((leaf)=>({...clone(leaf),nodeClass:'LEAF_PRESENTATION',sourcePaths:clone(configByRef.get(leaf.canonicalRef).sourcePaths??[]),relatedRefs:clone(configByRef.get(leaf.canonicalRef).relatedRefs??[])}));
  const after = buildRegistryProjection(compiled); need(before.semanticHash===after.semanticHash&&before.entryCount===after.entryCount,'public projection mutated canonical registry');
  const base=canonicalize({schemaVersion:PUBLIC_LEARNING_PROJECTION_SCHEMA,registryRef:loaded.registry.registryRef,projectionRef:loaded.registry.projectionRef,prototype:clone(loaded.registry.prototype),sourceBinding:binding,sourcePolicy:clone(loaded.registry.sourcePolicy),stateDimensions:[...PUBLIC_LEARNING_STATE_DIMENSIONS],canonicalRegistry:before,nodes:nodes.sort((a,b)=>a.ref.localeCompare(b.ref)),leaves,strings:Object.fromEntries(Object.entries(loaded.catalogs).map(([locale,catalog])=>[locale,clone(catalog.strings)])),effects:{Home:false,Memory:false,modelRuntime:false,network:false,publication:false,repositoryMutation:false,releaseCreation:false,PagesDeployment:false,personalData:false}}); safeJson(base,'public learning projection'); return {...base,projectionHash:semanticHash(base)};
}

export function createPublicLearningAtlas(projection) { need(projection?.schemaVersion===PUBLIC_LEARNING_PROJECTION_SCHEMA,'invalid public learning projection'); return new Atlas(projection.nodes.map((node)=>({ref:node.ref,kind:node.kind,brief:node.brief,edges:clone(node.edges??[])}))); }
export function queryPublicLearningProjection(projection, options={}) { const receipt=createPublicLearningAtlas(projection).query(options), byRef=new Map(projection.nodes.map((node)=>[node.ref,node])), results=receipt.results.map((item)=>({...item,node:clone(byRef.get(item.ref))})), startRef=options.startRefs?.length===1?options.startRefs[0]:null, startNode=startRef?byRef.get(startRef):null, publicNeighbors=new Set((startNode?.edges??[]).map((edge)=>edge.to)), returned=new Set(results.filter((item)=>item.ref!==startRef).map((item)=>item.ref)); return {...receipt,results,relationshipSummary:startNode?{shownRelationshipCount:[...publicNeighbors].filter((ref)=>returned.has(ref)).length,additionalPublicRelationshipCount:[...publicNeighbors].filter((ref)=>!returned.has(ref)).length,projectionRuleRef:'rule.vexlife.public-learning.explicit-admission.001'}:null}; }

// [VXG RealForever]
