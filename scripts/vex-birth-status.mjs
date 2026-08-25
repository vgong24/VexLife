#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VEX_BIRTH_REGISTRY_SCHEMA = 'vexlife.vex-birth-registry/v1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(HERE, '..');
const DEFAULT_REGISTRY = path.join(DEFAULT_REPO, 'blueprint', 'vex-birth-registry.json');
const SHA256 = /^[0-9a-f]{64}$/u;

export class VexBirthStatusError extends Error {
  constructor(code, message, details = null) { super(message); this.name = 'VexBirthStatusError'; this.code = code; this.details = details; }
}
const fail = (code, message, details = null) => { throw new VexBirthStatusError(code, message, details); };
const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const get = (value, dotted = '') => dotted.split('.').filter(Boolean).reduce((cursor, key) => cursor?.[key], value);
const same = (left, right) => object(left) || object(right) || Array.isArray(left) || Array.isArray(right)
  ? JSON.stringify(left) === JSON.stringify(right) : Object.is(left, right);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function canonicalRoot(raw, label, mustExist) {
  if (typeof raw !== 'string' || !raw) fail('VEX_BIRTH_ROOT_INVALID', `${label} is required`);
  const requested = path.resolve(raw);
  if (!fs.existsSync(requested)) {
    if (mustExist) fail('VEX_BIRTH_ROOT_MISSING', `${label} does not exist`, { path: requested });
    return { path: requested, exists: false };
  }
  const stat = fs.lstatSync(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('VEX_BIRTH_ROOT_INVALID', `${label} must be one regular directory`, { path: requested });
  const real = fs.realpathSync.native(requested);
  const equal = process.platform === 'win32' ? real.toLowerCase() === requested.toLowerCase() : real === requested;
  if (!equal) fail('VEX_BIRTH_ROOT_ALIAS', `${label} must use its canonical identity`, { requested, real });
  return { path: real, exists: true };
}

function bound(root, relative, label) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || path.win32.isAbsolute(relative)) {
    fail('VEX_BIRTH_PATH_INVALID', `${label} must be repository/Home relative`, { relative });
  }
  const target = path.resolve(root.path, relative);
  const relation = path.relative(root.path, target);
  if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail('VEX_BIRTH_PATH_ESCAPE', `${label} escapes its root`, { relative });
  }
  if (root.exists) {
    let cursor = root.path;
    for (const segment of relation.split(path.sep)) {
      cursor = path.join(cursor, segment);
      if (!fs.existsSync(cursor)) break;
      if (fs.lstatSync(cursor).isSymbolicLink()) fail('VEX_BIRTH_PATH_ALIAS', `${label} traverses a symlink/junction`, { path: cursor });
    }
  }
  return target;
}

function readJson(root, relative, label) {
  const file = bound(root, relative, label);
  if (!root.exists || !fs.existsSync(file)) return { file, present: false, value: null, errors: [] };
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) return { file, present: true, value: null, errors: [`${label} is not a regular file`] };
  try { return { file, present: true, value: JSON.parse(fs.readFileSync(file, 'utf8')), sha256: hashFile(file), errors: [] }; }
  catch (error) { return { file, present: true, value: null, sha256: hashFile(file), errors: [`${label} contains invalid JSON: ${error.message}`] }; }
}

function strings(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item)) fail('VEX_BIRTH_REGISTRY_INVALID', `${label} must be nonempty strings`);
}

export function validateVexBirthRegistry(input) {
  if (!object(input) || input.schemaVersion !== VEX_BIRTH_REGISTRY_SCHEMA) fail('VEX_BIRTH_REGISTRY_INVALID', `schemaVersion must be ${VEX_BIRTH_REGISTRY_SCHEMA}`);
  strings(input.statusVocabulary, 'statusVocabulary'); strings(input.reviewLensRefs, 'reviewLensRefs'); strings(input.terminalPredicate, 'terminalPredicate');
  if (!Array.isArray(input.stages) || input.stages.length !== 13) fail('VEX_BIRTH_REGISTRY_INVALID', 'exactly VB0 through VB12 are required');
  const keys = new Set();
  input.stages.forEach((stage, index) => {
    if (stage.code !== `VB${index}` || stage.sequence !== index || !stage.stageRef) fail('VEX_BIRTH_REGISTRY_INVALID', `stage ${index} identity/order is invalid`);
    if (!input.statusVocabulary.includes(stage.missingState) || !Array.isArray(stage.requirements) || !stage.requirements.length) fail('VEX_BIRTH_REGISTRY_INVALID', `${stage.code} is incomplete`);
    for (const requirement of stage.requirements) {
      if (requirement.kind !== 'JSON' || !requirement.key || keys.has(requirement.key) || !['HOME', 'REPOSITORY'].includes(requirement.root)) fail('VEX_BIRTH_REGISTRY_INVALID', `${stage.code} requirement is invalid`);
      keys.add(requirement.key);
      for (const linked of requirement.linkedJsonBindings ?? []) {
        if (!linked.key || keys.has(linked.key) || !['HOME', 'REPOSITORY'].includes(linked.root)) fail('VEX_BIRTH_REGISTRY_INVALID', `${requirement.key} linked receipt is invalid`);
        keys.add(linked.key);
      }
    }
  });
  return structuredClone(input);
}

export function loadVexBirthRegistry(file = DEFAULT_REGISTRY) {
  try { return validateVexBirthRegistry(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))); }
  catch (error) { if (error instanceof VexBirthStatusError) throw error; fail('VEX_BIRTH_REGISTRY_UNREADABLE', error.message, { file }); }
}

function assertionError(value, assertion, registry, now) {
  const observed = get(value, assertion.path);
  switch (assertion.operator) {
    case 'EQUALS': return same(observed, assertion.value) ? null : `${assertion.path} must equal ${JSON.stringify(assertion.value)}`;
    case 'NOT_EQUALS_PATH': return observed !== undefined && !same(observed, get(value, assertion.otherPath)) ? null : `${assertion.path} must differ from ${assertion.otherPath}`;
    case 'MATCHES': return typeof observed === 'string' && new RegExp(assertion.pattern, 'u').test(observed) ? null : `${assertion.path} does not match ${assertion.pattern}`;
    case 'GREATER_THAN': return typeof observed === 'number' && observed > assertion.value ? null : `${assertion.path} must be > ${assertion.value}`;
    case 'MIN_ITEMS': return Array.isArray(observed) && observed.length >= assertion.value ? null : `${assertion.path} needs at least ${assertion.value} item(s)`;
    case 'IS_ARRAY': return Array.isArray(observed) ? null : `${assertion.path} must be an array`;
    case 'IN': return assertion.values.some(item => same(item, observed)) ? null : `${assertion.path} is outside the admitted vocabulary`;
    case 'ISO_TIMESTAMP': return iso(observed) ? null : `${assertion.path} must be canonical ISO-8601 UTC`;
    case 'NOT_EXPIRED': return iso(observed) && Date.parse(observed) > now.getTime() ? null : `${assertion.path} is expired or invalid`;
    case 'ARRAY_INCLUDES_ALL': {
      const expected = assertion.valuesFromRegistry ? get(registry, assertion.valuesFromRegistry) : assertion.values;
      return Array.isArray(observed) && Array.isArray(expected) && expected.every(item => observed.includes(item)) ? null : `${assertion.path} lacks required values`;
    }
    case 'ARRAY_INCLUDES_ALL_STAGE_REFS': return Array.isArray(observed) && registry.stages.slice(0, -1).every(stage => observed.includes(stage.stageRef)) ? null : `${assertion.path} lacks one or more VB stage refs`;
    default: return `unsupported assertion operator ${assertion.operator}`;
  }
}

function acceptedState(value, acceptedStates) {
  if (!acceptedStates) return true;
  return object(value) && acceptedStates.includes(value.state);
}

function evaluateRequirement(requirement, registry, roots, evidence, now) {
  const root = requirement.root === 'HOME' ? roots.home : roots.repository;
  const read = readJson(root, requirement.path, requirement.key);
  const result = { key: requirement.key, path: requirement.path, root: requirement.root, ...read, accepted: false, linked: [] };
  if (!read.present || !read.value) { evidence.set(result.key, result); return result; }
  if (read.value.schemaVersion !== requirement.schemaVersion) result.errors.push(`${result.key}.schemaVersion must be ${requirement.schemaVersion}`);
  for (const assertion of requirement.assertions ?? []) {
    const error = assertionError(read.value, assertion, registry, now); if (error) result.errors.push(error);
  }
  for (const binding of requirement.fileBindings ?? []) {
    const bindingRoot = binding.root === 'HOME' ? roots.home : roots.repository;
    const relative = get(read.value, binding.pathField);
    const expected = get(read.value, binding.sha256Field);
    try {
      const file = bound(bindingRoot, relative, `${result.key}.${binding.pathField}`);
      if (!bindingRoot.exists || !fs.existsSync(file) || !fs.lstatSync(file).isFile()) result.errors.push(`${binding.pathField} is missing`);
      else if (!SHA256.test(expected ?? '') || hashFile(file) !== expected) result.errors.push(`${binding.pathField} SHA-256 mismatch`);
    } catch (error) { result.errors.push(error.message); }
  }
  for (const linked of requirement.linkedJsonBindings ?? []) {
    const linkedRoot = linked.root === 'HOME' ? roots.home : roots.repository;
    const linkedPath = get(read.value, linked.pathField);
    const expected = get(read.value, linked.sha256Field);
    let linkedResult;
    try {
      const linkedRead = readJson(linkedRoot, linkedPath, linked.key);
      linkedResult = { key: linked.key, path: linkedPath, root: linked.root, ...linkedRead, accepted: false };
      if (!linkedRead.present || !linkedRead.value) linkedResult.errors.push(`${linked.key} is missing`);
      else {
        if (linkedRead.value.schemaVersion !== linked.schemaVersion) linkedResult.errors.push(`${linked.key}.schemaVersion must be ${linked.schemaVersion}`);
        if (!SHA256.test(expected ?? '') || linkedRead.sha256 !== expected) linkedResult.errors.push(`${linked.key} SHA-256 mismatch`);
        for (const assertion of linked.assertions ?? []) { const error = assertionError(linkedRead.value, assertion, registry, now); if (error) linkedResult.errors.push(error); }
      }
    } catch (error) { linkedResult = { key: linked.key, path: linkedPath, root: linked.root, present: false, value: null, errors: [error.message], accepted: false }; }
    linkedResult.accepted = linkedResult.present && linkedResult.errors.length === 0;
    if (!linkedResult.accepted) result.errors.push(...linkedResult.errors.map(error => `${linked.key}: ${error}`));
    result.linked.push(linkedResult); evidence.set(linked.key, linkedResult);
  }
  result.accepted = result.errors.length === 0 && result.linked.every(item => item.accepted) && acceptedState(read.value, requirement.acceptedStates);
  evidence.set(result.key, result); return result;
}

function endpoint(spec, evidence) {
  const split = spec.indexOf(':'); if (split < 1) return undefined;
  return get(evidence.get(spec.slice(0, split))?.value, spec.slice(split + 1));
}

function bindingError(binding, evidence) {
  const left = endpoint(binding.left, evidence);
  if (binding.operator === 'EQUALS_LITERAL') return same(left, binding.value) ? null : `${binding.left} must equal ${JSON.stringify(binding.value)}`;
  const right = endpoint(binding.right, evidence);
  if (binding.operator === 'EQUALS') return same(left, right) ? null : `${binding.left} does not match ${binding.right}`;
  if (binding.operator === 'ARRAY_SUBSET_OF') return Array.isArray(left) && Array.isArray(right) && left.every(item => right.includes(item)) ? null : `${binding.left} is not a subset of ${binding.right}`;
  return `unsupported binding ${binding.operator}`;
}

function publicEvidence(result) {
  return { key: result.key, path: result.path, root: result.root, present: result.present, valid: result.present && result.errors.length === 0, accepted: result.accepted, state: result.value?.state ?? null, sha256: result.sha256 ?? null, errors: result.errors, linked: (result.linked ?? []).map(publicEvidence) };
}

function stageState(stage, requirements, bindings, predecessorAccepted, evidence) {
  if (!predecessorAccepted) return { state: 'BLOCKED', accepted: false, reason: 'PREDECESSOR_NOT_ACCEPTED' };
  if (requirements.some(item => item.present && (item.errors.length || item.linked.some(link => !link.accepted))) || bindings.length) return { state: 'BLOCKED', accepted: false, reason: 'EVIDENCE_INVALID_OR_CONTRADICTORY' };
  if (requirements.some(item => !item.present)) return { state: stage.missingState, accepted: false, reason: 'REQUIRED_EVIDENCE_MISSING' };
  if (stage.code === 'VB9') {
    const disposition = evidence.get('vb9_disposition')?.value?.candidateDisposition;
    if (disposition === 'REJECT') return { state: 'REJECTED', accepted: false, reason: 'CANDIDATE_REJECTED' };
    if (disposition === 'NARROW') return { state: 'IN_PROGRESS', accepted: false, reason: 'CANDIDATE_NARROWED' };
  }
  if (requirements.every(item => item.accepted)) return { state: 'ACCEPTED', accepted: true, reason: 'ALL_REQUIRED_EVIDENCE_ACCEPTED' };
  return { state: 'EVIDENCE_PRESENT_UNREVIEWED', accepted: false, reason: 'EVIDENCE_NOT_ACCEPTED' };
}

function terminal(registry, evidence, stages) {
  const ev = (key, dotted) => get(evidence.get(key)?.value, dotted);
  const accepted = code => stages.find(stage => stage.code === code)?.accepted === true;
  const values = {
    victorReadableRunbookAccepted: ev('vb12_replay', 'victorReadableRunbookAccepted') === true,
    cleanBaseInstallObserved: accepted('VB1'), isolatedHomeUsed: ev('vb0_host_source', 'isolatedHomeUsed') === true,
    untaughtBaselineWitnessed: ev('vb2_baseline', 'untaughtBaselineWitnessed') === true,
    cultivationSessionObserved: ev('vb3_cultivation', 'cultivationSessionObserved') === true,
    falseLessonAndCounterexampleReviewReturned: ev('vb4_stabilization', 'falseLessonAndCounterexampleReviewReturned') === true,
    trainingPackFrozen: ev('vb5_pack', 'trainingPackFrozen') === true, heldoutPackFrozen: ev('vb5_pack', 'heldoutPackFrozen') === true,
    realTrainingRunObserved: ev('vb7_training_binding', 'realTrainingRunObserved') === true,
    trainingActuallyExecuted: ev('vb7_training_receipt', 'trainingActuallyExecuted') === true,
    modelWeightsChanged: ev('vb7_training_receipt', 'modelWeightsChanged') === true,
    changedParameterCountPositive: Number(ev('vb7_training_receipt', 'changedParameterCount')) > 0,
    candidateArtifactDistinct: typeof ev('vb7_training_binding', 'sourceArtifactFingerprint') === 'string' && ev('vb7_training_binding', 'sourceArtifactFingerprint') !== ev('vb7_training_binding', 'candidateArtifactFingerprint'),
    heldoutEvaluationReturned: ev('vb8_review', 'heldoutEvaluationReturned') === true,
    independentAssuranceClear: ev('vb8_review', 'independentAssuranceClear') === true,
    candidateDispositionAccept: accepted('VB9') && ev('vb9_disposition', 'candidateDisposition') === 'ACCEPT',
    acceptedG1Registered: ev('vb10_registration', 'acceptedG1Registered') === true,
    g0RollbackPreserved: ev('vb10_registration', 'g0RollbackPreserved') === true && ev('vb10_activation', 'g0RollbackPreserved') === true,
    g1ActivatedBySeparateAuthority: ev('vb10_activation', 'g1ActivatedBySeparateAuthority') === true && ev('vb10_activation', 'separateFromTrainingRun') === true,
    g1WakeWitnessed: ev('vb11_wake', 'g1WakeWitnessed') === true,
    cleanReadmeReplayObserved: ev('vb12_replay', 'cleanReadmeReplayObserved') === true
  };
  const ordered = registry.terminalPredicate.map(name => ({ name, satisfied: values[name] === true }));
  return { values, ordered, satisfied: ordered.every(item => item.satisfied) };
}

export function evaluateVexBirth({ home = path.join(os.homedir(), '.vexlife'), repositoryRoot = DEFAULT_REPO, registry = null, registryPath = DEFAULT_REGISTRY, now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('VEX_BIRTH_TIME_INVALID', 'now must be a valid Date');
  const source = registry ? validateVexBirthRegistry(registry) : loadVexBirthRegistry(registryPath);
  const roots = { home: canonicalRoot(home, 'Vex Home', false), repository: canonicalRoot(repositoryRoot, 'repository root', true) };
  const evidence = new Map(); const stages = []; let predecessorAccepted = true;
  for (const stage of source.stages) {
    const requirements = stage.requirements.map(item => evaluateRequirement(item, source, roots, evidence, now));
    const bindings = requirements.every(item => item.present) ? (stage.bindings ?? []).map(item => bindingError(item, evidence)).filter(Boolean) : [];
    const derived = stageState(stage, requirements, bindings, predecessorAccepted, evidence);
    stages.push({ stageRef: stage.stageRef, code: stage.code, sequence: stage.sequence, name: stage.name, humanMeaning: stage.humanMeaning, ...derived, evidence: requirements.map(publicEvidence), bindingErrors: bindings, nextActionOwnerRoleRef: stage.nextActionOwnerRoleRef, nextAction: stage.nextAction });
    predecessorAccepted &&= derived.accepted;
  }
  const predicate = terminal(source, evidence, stages); const allAccepted = stages.every(stage => stage.accepted);
  const current = stages.find(stage => !stage.accepted) ?? null;
  let birthState = allAccepted && predicate.satisfied ? source.terminalState : source.incompleteState;
  if (current?.code === 'VB9' && current.state === 'REJECTED') birthState = 'VEX_G1_CANDIDATE_REJECTED';
  let nextAction = current?.nextAction ?? 'No further action; terminal evidence is complete.';
  let nextActionOwnerRoleRef = current?.nextActionOwnerRoleRef ?? null;
  const disposition = evidence.get('vb9_disposition')?.value?.candidateDisposition;
  if (current?.code === 'VB9' && disposition === 'NARROW') { nextAction = 'Return to VB4/VB5: narrow the lesson, add counterexamples, and freeze a new pack.'; nextActionOwnerRoleRef = 'role.vexlife.vex-birth.training-identity-reviewer'; }
  if (current?.code === 'VB9' && disposition === 'REJECT') { nextAction = 'Keep G0 current. Return to VB3/VB4 and begin a corrected cultivation generation.'; nextActionOwnerRoleRef = 'role.vexlife.vex-birth.operations'; }
  return Object.freeze({
    schemaVersion: 'vexlife.vex-birth-status/v1', laneName: source.humanLaneName, registryRef: source.registryRef,
    evaluatedAt: now.toISOString(), readOnly: true, home: roots.home.path, homeExists: roots.home.exists,
    repositoryRoot: roots.repository.path, birthState, completionClaimAllowed: birthState === source.terminalState,
    currentStageRef: current?.stageRef ?? null, currentStageCode: current?.code ?? null, nextActionOwnerRoleRef, nextAction,
    summary: { acceptedStages: stages.filter(stage => stage.accepted).length, totalStages: stages.length, blockedStages: stages.filter(stage => stage.state === 'BLOCKED').length, readyForHumanActionStages: stages.filter(stage => stage.state === 'READY_FOR_HUMAN_ACTION').length, evidencePresentUnreviewedStages: stages.filter(stage => stage.state === 'EVIDENCE_PRESENT_UNREVIEWED').length, rejectedStages: stages.filter(stage => stage.state === 'REJECTED').length },
    terminalPredicate: predicate, stages
  });
}

function argumentsFrom(argv) {
  const options = { home: path.join(os.homedir(), '.vexlife'), repositoryRoot: DEFAULT_REPO, registryPath: DEFAULT_REGISTRY, json: false, requireBorn: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true; else if (arg === '--require-born') options.requireBorn = true;
    else if (['--home', '--repo', '--registry'].includes(arg)) { const value = argv[++i]; if (!value) fail('VEX_BIRTH_ARGUMENT_INVALID', `${arg} requires a value`); if (arg === '--home') options.home = value; else if (arg === '--repo') options.repositoryRoot = value; else options.registryPath = value; }
    else fail('VEX_BIRTH_ARGUMENT_INVALID', `unknown argument ${arg}`);
  }
  return options;
}

function human(status) {
  const lines = [status.laneName, `Birth state: ${status.birthState}`, `Accepted stages: ${status.summary.acceptedStages}/${status.summary.totalStages}`, `Current stage: ${status.currentStageCode ?? 'TERMINAL'}`, `Next owner: ${status.nextActionOwnerRoleRef ?? 'NONE'}`, `Next action: ${status.nextAction}`, '', 'Stages:'];
  for (const stage of status.stages) lines.push(`  ${stage.code} ${stage.state.padEnd(29)} ${stage.name}`);
  lines.push('', `Completion claim allowed: ${status.completionClaimAllowed ? 'YES' : 'NO'}`);
  if (!status.completionClaimAllowed) lines.push(`Unsatisfied terminal predicates: ${status.terminalPredicate.ordered.filter(item => !item.satisfied).map(item => item.name).join(', ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

function main() {
  try { const options = argumentsFrom(process.argv.slice(2)); const status = evaluateVexBirth(options); options.json ? process.stdout.write(`${JSON.stringify(status, null, 2)}\n`) : human(status); if (options.requireBorn && !status.completionClaimAllowed) process.exitCode = 3; }
  catch (error) { const payload = error instanceof VexBirthStatusError ? { schemaVersion: 'vexlife.vex-birth-status-error/v1', code: error.code, error: error.message, details: error.details } : { schemaVersion: 'vexlife.vex-birth-status-error/v1', code: 'VEX_BIRTH_UNEXPECTED', error: error.message }; process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`); process.exitCode = 2; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

// [VXG RealForever]
