import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  NATIVE_WORKER_BINDING_SCHEMA,
  NATIVE_WORKER_MANIFEST_SCHEMA,
  consumeNativeWorkerResult,
  loadNativeWorker,
  prepareNativeWorker,
  runPreparedNativeWorker
} from './native-worker-supervisor.mjs';
import { semanticHash } from './utils.mjs';

export const TYPED_COMMAND_REGISTRY_SCHEMA = 'vexlife.cli-typed-command-registry/v1';
export const TYPED_COMMAND_AUTHORITY_SCHEMA = 'vexlife.typed-command-effect-authority/v1';
export const TYPED_COMMAND_EFFECT_RECEIPT_SCHEMA = 'vexlife.typed-command-effect-receipt/v1';
export const TYPED_COMMAND_CAPABILITY_REF = 'capability.vexlife.cli.typed';
export const TYPED_COMMAND_EFFECT_REF = 'effect.vexlife.typed-local-process';
export const TYPED_COMMAND_PERMISSION_REF = 'permission.cli.execute';
export const TYPED_COMMAND_RESOURCE_CLASS = 'COMMAND_DECLARED';
export const TYPED_COMMAND_PROCESS_REF = 'process.vexlife.cli.execute-typed';
export const TYPED_COMMAND_SOURCE_REF = 'source.vexlife.typed-command-runtime';
export const TYPED_COMMAND_SOURCE_VERSION_REF = 'typed-command-runtime.v1';

const REF = /^[a-z0-9](?:[a-z0-9._-]{0,190}[a-z0-9])?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)(?!.*\\)[A-Za-z0-9._/-]+$/u;
const AUTHORITY_KEYS = Object.freeze([
  'schemaVersion', 'authorityRef', 'state', 'capabilityRef', 'effectRef', 'commandRef',
  'homeRef', 'companionLineageRef', 'threadRef', 'taskIntentSha256', 'parametersSha256',
  'workingScopeRef', 'resourceLeaseRef', 'formedAt', 'expiresAt', 'singleUseNonce', 'sourceRefs'
]);
const COMMAND_KEYS = Object.freeze([
  'commandRef', 'capabilityRef', 'effectRef', 'processRef', 'purposeRef', 'humanLabel',
  'executableClass', 'scriptPath', 'scriptSha256', 'fixedArguments', 'parametersSchemaRef',
  'allowedParameterKeys', 'workingScopeRef', 'workingDirectory', 'resultContractRef',
  'timeoutMs', 'maxStdoutBytes', 'effects'
]);
const EFFECT_KEYS = Object.freeze([
  'process', 'network', 'sourceMutation', 'homeSemanticMutation', 'memoryMutation',
  'modelMutation', 'training', 'weightMutation', 'publication'
]);

function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
  }
  return value;
}
function exactKeys(value, keys) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
function stableRef(value) { return typeof value === 'string' && REF.test(value); }
function canonicalRefs(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !stableRef(value))) {
    throw new TypeError('sourceRefs must contain one or more stable refs');
  }
  return [...new Set(values)].sort();
}
function canonicalDirectory(value, label) {
  if (typeof value !== 'string' || !value) throw new TypeError(`${label} is required`);
  const requested = path.resolve(value);
  const stat = fs.lstatSync(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be one regular directory`);
  const real = fs.realpathSync.native(requested);
  if (real !== requested) throw new Error(`${label} must use its canonical path`);
  return real;
}
function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function regularFile(root, relativePath, label) {
  if (typeof relativePath !== 'string' || !SAFE_RELATIVE.test(relativePath) || path.posix.normalize(relativePath) !== relativePath) {
    throw new Error(`${label} path is not one safe relative source path`);
  }
  const candidate = path.resolve(root, ...relativePath.split('/'));
  if (!contained(root, candidate)) throw new Error(`${label} escapes source root`);
  let cursor = root;
  for (const segment of relativePath.split('/')) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link`);
  }
  const stat = fs.lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is not one regular file`);
  if (fs.realpathSync.native(candidate) !== candidate) throw new Error(`${label} is not canonical`);
  return candidate;
}
function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function readJsonRegular(file, label) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || fs.realpathSync.native(file) !== file) {
    throw new Error(`${label} must be one canonical regular file`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
}
function nowMs(clock) {
  const value = clock();
  const ms = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(ms)) throw new TypeError('typed-command clock must return a finite timestamp');
  return ms;
}
function canonicalNow(clock) { return new Date(nowMs(clock)).toISOString(); }
function commandParameters(command, parameters) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new TypeError('typed-command parameters must be one object');
  }
  const allowed = new Set(command.allowedParameterKeys);
  const keys = Object.keys(parameters);
  if (keys.some((key) => !allowed.has(key)) || keys.length !== allowed.size) {
    throw new Error('typed-command parameters do not match the exact registered key set');
  }
  return freezeDeep(structuredClone(parameters));
}

export function validateTypedCommandRegistry(value, { sourceRoot = null } = {}) {
  if (!exactKeys(value, ['schemaVersion', 'registryRef', 'registryVersion', 'commands'])
      || value.schemaVersion !== TYPED_COMMAND_REGISTRY_SCHEMA
      || !stableRef(value.registryRef)
      || !Number.isSafeInteger(value.registryVersion) || value.registryVersion < 1
      || !Array.isArray(value.commands) || value.commands.length === 0) {
    return { ok: false, errors: ['TYPED_COMMAND_REGISTRY_INVALID'] };
  }
  const errors = [];
  const refs = new Set();
  for (const command of value.commands) {
    if (!exactKeys(command, COMMAND_KEYS)) { errors.push('TYPED_COMMAND_COMMAND_FIELDS_INVALID'); continue; }
    for (const field of ['commandRef', 'capabilityRef', 'effectRef', 'processRef', 'purposeRef', 'parametersSchemaRef', 'workingScopeRef', 'resultContractRef']) {
      if (!stableRef(command[field])) errors.push(`TYPED_COMMAND_${field.toUpperCase()}_INVALID`);
    }
    if (refs.has(command.commandRef)) errors.push('TYPED_COMMAND_DUPLICATE_COMMAND_REF');
    refs.add(command.commandRef);
    if (command.capabilityRef !== TYPED_COMMAND_CAPABILITY_REF || command.effectRef !== TYPED_COMMAND_EFFECT_REF || command.processRef !== TYPED_COMMAND_PROCESS_REF) {
      errors.push('TYPED_COMMAND_OWNER_BINDING_INVALID');
    }
    if (typeof command.humanLabel !== 'string' || !command.humanLabel || command.humanLabel.length > 160) errors.push('TYPED_COMMAND_LABEL_INVALID');
    if (command.executableClass !== 'CURRENT_NODE_RUNTIME') errors.push('TYPED_COMMAND_EXECUTABLE_CLASS_INVALID');
    if (typeof command.scriptPath !== 'string' || !SAFE_RELATIVE.test(command.scriptPath) || path.posix.normalize(command.scriptPath) !== command.scriptPath) errors.push('TYPED_COMMAND_SCRIPT_PATH_INVALID');
    if (!SHA256.test(command.scriptSha256 ?? '')) errors.push('TYPED_COMMAND_SCRIPT_SHA_INVALID');
    if (!Array.isArray(command.fixedArguments) || command.fixedArguments.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) errors.push('TYPED_COMMAND_ARGV_INVALID');
    if (!Array.isArray(command.allowedParameterKeys) || new Set(command.allowedParameterKeys).size !== command.allowedParameterKeys.length || command.allowedParameterKeys.some((key) => typeof key !== 'string' || !key)) errors.push('TYPED_COMMAND_PARAMETER_KEYS_INVALID');
    if (typeof command.workingDirectory !== 'string' || !SAFE_RELATIVE.test(command.workingDirectory) || command.workingDirectory.includes('..')) errors.push('TYPED_COMMAND_WORKING_DIRECTORY_INVALID');
    if (!Number.isSafeInteger(command.timeoutMs) || command.timeoutMs < 1000 || command.timeoutMs > 300000) errors.push('TYPED_COMMAND_TIMEOUT_INVALID');
    if (!Number.isSafeInteger(command.maxStdoutBytes) || command.maxStdoutBytes < 1024 || command.maxStdoutBytes > 1048576) errors.push('TYPED_COMMAND_OUTPUT_BOUND_INVALID');
    if (!exactKeys(command.effects, EFFECT_KEYS)
        || command.effects.process !== true
        || EFFECT_KEYS.filter((key) => key !== 'process').some((key) => command.effects[key] !== false)) errors.push('TYPED_COMMAND_EFFECT_BOUNDARY_INVALID');
    if (sourceRoot && errors.length === 0) {
      try {
        const source = canonicalDirectory(sourceRoot, 'typed-command sourceRoot');
        const script = regularFile(source, command.scriptPath, 'typed-command script');
        if (sha256File(script) !== command.scriptSha256) errors.push('TYPED_COMMAND_SCRIPT_SOURCE_DRIFT');
        const working = path.resolve(source, ...command.workingDirectory.split('/'));
        if (!contained(source, working) || fs.realpathSync.native(working) !== working || !fs.lstatSync(working).isDirectory()) errors.push('TYPED_COMMAND_WORKING_SCOPE_DRIFT');
      } catch { errors.push('TYPED_COMMAND_SOURCE_BINDING_INVALID'); }
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() };
}

function validateAuthority(value, { command, taskIntent, context, clock }) {
  if (!exactKeys(value, AUTHORITY_KEYS)
      || value.schemaVersion !== TYPED_COMMAND_AUTHORITY_SCHEMA
      || !stableRef(value.authorityRef) || value.state !== 'CURRENT'
      || value.capabilityRef !== TYPED_COMMAND_CAPABILITY_REF
      || value.effectRef !== TYPED_COMMAND_EFFECT_REF
      || value.commandRef !== command.commandRef
      || !stableRef(value.homeRef) || !stableRef(value.companionLineageRef) || !stableRef(value.threadRef)
      || !SHA256.test(value.taskIntentSha256 ?? '') || !SHA256.test(value.parametersSha256 ?? '')
      || value.workingScopeRef !== command.workingScopeRef || !stableRef(value.resourceLeaseRef)
      || !canonicalTimestamp(value.formedAt) || !canonicalTimestamp(value.expiresAt)
      || !stableRef(value.singleUseNonce)) {
    throw new Error('TYPED_COMMAND_AUTHORITY_INVALID');
  }
  canonicalRefs(value.sourceRefs);
  const now = nowMs(clock);
  if (!(Date.parse(value.formedAt) <= now && now < Date.parse(value.expiresAt))) throw new Error('TYPED_COMMAND_AUTHORITY_EXPIRED');
  if (value.homeRef !== context?.homeRef || value.companionLineageRef !== context?.companionLineageRef || value.threadRef !== context?.threadRef) {
    throw new Error('TYPED_COMMAND_AUTHORITY_CONTEXT_MISMATCH');
  }
  if (value.taskIntentSha256 !== semanticHash(taskIntent)) throw new Error('TYPED_COMMAND_AUTHORITY_INTENT_MISMATCH');
  if (value.parametersSha256 !== semanticHash({})) throw new Error('TYPED_COMMAND_AUTHORITY_PARAMETERS_MISMATCH');
  const core = structuredClone(value);
  return freezeDeep({ ...core, semanticFingerprint: semanticHash(core) });
}

function validateOrientationResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || result.schemaVersion !== 'vexlife.orientation-receipt/v1'
      || !['GROUNDED', 'ATTENTION'].includes(result.state)
      || result.currentness !== 'CURRENT'
      || result.repository?.slug !== 'vgong24/VexLife'
      || result.repository?.visibility?.value !== 'PRIVATE'
      || result.lifecycle?.state !== 'PRIVATE_STAGING'
      || result.blueprint?.valid !== true
      || result.blueprint?.sourceManifestCurrent !== true
      || result.blueprint?.pathTopologyValid !== true
      || !Array.isArray(result.heldBoundaries)
      || !result.exactNextRoute || typeof result.exactNextRoute !== 'object') {
    throw new Error('TYPED_COMMAND_ORIENTATION_RESULT_INVALID');
  }
  return result;
}

function effectReceiptFromCompletion({ authority, command, workRef, workerRef, processPlan, completion }) {
  const record = completion.machineCompletionRecord;
  if (!record || record.schemaVersion !== 'vexlife.typed-command-machine-completion/v1'
      || record.commandRef !== command.commandRef || record.authorityRef !== authority.authorityRef
      || record.workRef !== workRef || record.processPlanHash !== processPlan.planHash) {
    throw new Error('TYPED_COMMAND_COMPLETION_LINEAGE_INVALID');
  }
  const core = {
    schemaVersion: TYPED_COMMAND_EFFECT_RECEIPT_SCHEMA,
    state: 'TYPED_COMMAND_EFFECT_COMPLETED',
    effectRef: TYPED_COMMAND_EFFECT_REF,
    authorityRef: authority.authorityRef,
    authorityFingerprint: authority.semanticFingerprint,
    commandRegistryRef: record.commandRegistryRef,
    commandRef: command.commandRef,
    processRef: command.processRef,
    processPlanHash: processPlan.planHash,
    workRef,
    workerRef,
    resultRef: completion.resultRef,
    machineCompletionRecordSha256: completion.machineCompletionRecordSha256,
    orientationReceiptSha256: record.orientationReceiptSha256,
    externalEffectsExecuted: true,
    processEffectPerformed: true,
    networkEffectPerformed: false,
    sourceMutationPerformed: false,
    homeSemanticMutationPerformed: false,
    memoryMutationPerformed: false,
    modelMutationPerformed: false,
    trainingEffectPerformed: false,
    weightMutationPerformed: false,
    publicationEffectPerformed: false,
    completedAt: completion.consumedAt
  };
  const effectReceiptSha256 = semanticHash(core);
  return freezeDeep({ ...core, effectReceiptRef: `receipt.vexlife.typed-command.${effectReceiptSha256.slice(0, 32)}`, effectReceiptSha256 });
}

function observationFromCompletion({ registry, command, authority, effectReceipt, completion }) {
  const orientation = validateOrientationResult(completion.machineCompletionRecord.orientationReceipt);
  const orientationSummary = {
    state: orientation.state,
    currentness: orientation.currentness,
    repository: {
      slug: orientation.repository.slug,
      visibility: orientation.repository.visibility.value
    },
    git: {
      branch: orientation.git?.branch ?? null,
      checkoutSha: orientation.git?.checkoutSha ?? null,
      candidateHeadSha: orientation.git?.candidateHeadSha ?? null,
      workingTree: orientation.git?.workingTree ?? null
    },
    currentWork: structuredClone(orientation.currentWork),
    lifecycle: structuredClone(orientation.lifecycle),
    blueprint: structuredClone(orientation.blueprint),
    heldBoundaries: [...orientation.heldBoundaries],
    exactNextRoute: structuredClone(orientation.exactNextRoute)
  };
  const payload = freezeDeep({
    state: 'TYPED_COMMAND_COMPLETED',
    commandRef: command.commandRef,
    effectReceiptRef: effectReceipt.effectReceiptRef,
    executionAuthorityRef: authority.authorityRef,
    resultRef: completion.resultRef,
    orientation: orientationSummary,
    effects: {
      externalEffectsExecuted: true,
      processEffectPerformed: true,
      networkEffectPerformed: false,
      sourceMutationPerformed: false,
      homeSemanticMutationPerformed: false,
      memoryMutationPerformed: false,
      modelMutationPerformed: false,
      trainingEffectPerformed: false,
      weightMutationPerformed: false,
      publicationEffectPerformed: false
    }
  });
  return freezeDeep({
    summaryRef: `summary.${TYPED_COMMAND_CAPABILITY_REF}.${semanticHash(payload).slice(0, 20)}`,
    capabilityRef: TYPED_COMMAND_CAPABILITY_REF,
    sourceRefs: canonicalRefs([
      registry.registryRef,
      TYPED_COMMAND_SOURCE_REF,
      effectReceipt.effectReceiptRef,
      ...authority.sourceRefs
    ]),
    currentness: {
      state: 'CURRENT',
      sourceRef: TYPED_COMMAND_SOURCE_REF,
      sourceVersionRef: TYPED_COMMAND_SOURCE_VERSION_REF,
      compatibility: 'COMPATIBLE'
    },
    payload
  });
}

export function createTypedCommandEffectSupport({
  sourceRoot,
  runtimeRoot,
  authorityPath = null,
  registryPath = 'blueprint/cli-typed-command-registry.json',
  clock = () => Date.now()
} = {}) {
  if (typeof clock !== 'function') throw new TypeError('typed-command support clock must be one function');
  const source = canonicalDirectory(sourceRoot, 'typed-command sourceRoot');
  const runtime = canonicalDirectory(runtimeRoot, 'typed-command runtimeRoot');
  const registryFile = regularFile(source, registryPath, 'typed-command registry');
  const registry = readJsonRegular(registryFile, 'typed-command registry');
  const registryValidation = validateTypedCommandRegistry(registry, { sourceRoot: source });
  if (!registryValidation.ok) throw new Error(`TYPED_COMMAND_REGISTRY_INVALID:${registryValidation.errors.join(',')}`);
  const commandByRef = new Map(registry.commands.map((command) => [command.commandRef, freezeDeep(structuredClone(command))]));
  const absoluteAuthorityPath = authorityPath === null ? null : path.resolve(authorityPath);
  if (absoluteAuthorityPath !== null && !contained(runtime, absoluteAuthorityPath)) {
    throw new Error('TYPED_COMMAND_AUTHORITY_PATH_OUTSIDE_RUNTIME_ROOT');
  }

  function workerIdentity(authorityRef) {
    return `worker.typed-command.${semanticHash({ authorityRef }).slice(0, 24)}`;
  }
  function workerRoot(authorityRef) {
    return path.join(runtime, 'native-workers', workerIdentity(authorityRef));
  }
  function authorityState({ taskIntent, context }) {
    if (absoluteAuthorityPath === null) return freezeDeep({ state: 'HELD', reasonCode: 'AUTHORITY_PATH_ABSENT' });
    let raw;
    try { raw = readJsonRegular(absoluteAuthorityPath, 'typed-command authority'); }
    catch { return freezeDeep({ state: 'HELD', reasonCode: 'AUTHORITY_UNREADABLE' }); }
    const command = commandByRef.get(raw.commandRef);
    if (!command) return freezeDeep({ state: 'HELD', reasonCode: 'COMMAND_NOT_REGISTERED' });
    try {
      const authority = validateAuthority(raw, { command, taskIntent, context, clock });
      const existingRoot = workerRoot(authority.authorityRef);
      if (fs.existsSync(existingRoot)) {
        return freezeDeep({ state: 'HELD', reasonCode: 'AUTHORITY_ALREADY_RESERVED_OR_CONSUMED', authorityRef: authority.authorityRef });
      }
      return freezeDeep({
        state: 'ADMITTED',
        authorityRef: authority.authorityRef,
        semanticFingerprint: authority.semanticFingerprint,
        capabilityRef: TYPED_COMMAND_CAPABILITY_REF,
        effectRef: TYPED_COMMAND_EFFECT_REF,
        commandRegistryRef: registry.registryRef,
        commandRef: command.commandRef,
        parametersTemplate: {},
        parametersSha256: authority.parametersSha256,
        workingScopeRef: authority.workingScopeRef,
        resourceLeaseRef: authority.resourceLeaseRef,
        expiresAt: authority.expiresAt,
        sourceRefs: authority.sourceRefs
      });
    } catch (error) {
      return freezeDeep({ state: 'HELD', reasonCode: error.message });
    }
  }

  async function execute({ request, workRef, taskIntent, context, authority: admittedAuthority, processPlan } = {}) {
    if (!request || request.capabilityRef !== TYPED_COMMAND_CAPABILITY_REF || !stableRef(workRef)) {
      throw new Error('TYPED_COMMAND_EXECUTION_INPUT_INVALID');
    }
    if (!processPlan || processPlan.processRef !== TYPED_COMMAND_PROCESS_REF || processPlan.externalEffectsExecuted !== false || !SHA256.test(processPlan.planHash ?? '')) {
      throw new Error('TYPED_COMMAND_PROCESS_PLAN_INVALID');
    }
    if (absoluteAuthorityPath === null) throw new Error('TYPED_COMMAND_AUTHORITY_PATH_ABSENT');
    const raw = readJsonRegular(absoluteAuthorityPath, 'typed-command authority');
    const command = commandByRef.get(raw.commandRef);
    if (!command) throw new Error('TYPED_COMMAND_COMMAND_NOT_REGISTERED');
    const authority = validateAuthority(raw, { command, taskIntent, context, clock });
    if (!admittedAuthority || admittedAuthority.state !== 'ADMITTED' || admittedAuthority.authorityRef !== authority.authorityRef || admittedAuthority.semanticFingerprint !== authority.semanticFingerprint) {
      throw new Error('TYPED_COMMAND_AUTHORITY_REVALIDATION_MISMATCH');
    }
    if (request.arguments?.commandRef !== command.commandRef) throw new Error('TYPED_COMMAND_REQUEST_COMMAND_MISMATCH');
    const parameters = commandParameters(command, request.arguments?.parameters ?? {});
    if (semanticHash(parameters) !== authority.parametersSha256) throw new Error('TYPED_COMMAND_REQUEST_PARAMETERS_NOT_AUTHORIZED');
    if (processPlan.inputs?.commandRef !== command.commandRef || semanticHash(processPlan.inputs?.parameters ?? null) !== semanticHash(parameters)
        || processPlan.inputs?.workingScopeRef !== authority.workingScopeRef || processPlan.inputs?.resourceLeaseRef !== authority.resourceLeaseRef
        || !(processPlan.authorityEnvelope?.effects ?? []).includes('EXECUTE_TYPED_COMMAND')) {
      throw new Error('TYPED_COMMAND_PROCESS_PLAN_BINDING_MISMATCH');
    }

    const exactWorkerRef = workerIdentity(authority.authorityRef);
    const exactWorkerRoot = workerRoot(authority.authorityRef);
    const script = regularFile(source, command.scriptPath, 'typed-command script');
    if (sha256File(script) !== command.scriptSha256) throw new Error('TYPED_COMMAND_SCRIPT_SOURCE_DRIFT');
    const executablePath = fs.realpathSync.native(process.execPath);
    const executableStat = fs.lstatSync(executablePath);
    if (executableStat.isSymbolicLink() || !executableStat.isFile()) throw new Error('TYPED_COMMAND_NODE_EXECUTABLE_INVALID');
    const manifest = {
      schemaVersion: NATIVE_WORKER_MANIFEST_SCHEMA,
      workerRef: exactWorkerRef,
      workRef,
      purposeRef: command.purposeRef,
      humanLabel: command.humanLabel,
      executableRef: 'executable.vexlife.node.current',
      argv: [script, ...command.fixedArguments],
      sourceRootRelativeWorkingDirectory: command.workingDirectory,
      schedulingClass: 'INTERACTIVE',
      pauseMode: 'NONE',
      resultContractRef: command.resultContractRef,
      executionAuthorityRef: authority.authorityRef
    };
    const binding = {
      schemaVersion: NATIVE_WORKER_BINDING_SCHEMA,
      bindingRef: `binding.typed-command.${semanticHash({ executablePath, executableSha256: sha256File(executablePath) }).slice(0, 24)}`,
      executableRef: manifest.executableRef,
      executablePath,
      executableSha256: sha256File(executablePath),
      hostRef: 'host.vexlife.current',
      observedAt: canonicalNow(clock)
    };

    let loaded = null;
    if (fs.existsSync(exactWorkerRoot)) {
      loaded = loadNativeWorker(exactWorkerRoot);
      if (loaded.manifest.executionAuthorityRef !== authority.authorityRef || loaded.manifest.workRef !== workRef || loaded.manifest.workerRef !== exactWorkerRef) {
        throw new Error('TYPED_COMMAND_EXISTING_WORKER_LINEAGE_MISMATCH');
      }
    } else {
      const prepared = prepareNativeWorker({ runtimeRoot: runtime, sourceRoot: source, manifest, binding, now: () => nowMs(clock) });
      loaded = loadNativeWorker(prepared.workerRoot);
    }

    if (loaded.receipt.state === 'STANDING_BY') {
      await runPreparedNativeWorker(exactWorkerRoot, { now: () => nowMs(clock) });
      loaded = loadNativeWorker(exactWorkerRoot);
    }
    if (loaded.receipt.state === 'WRAPPING_UP') {
      const stdoutPath = path.join(exactWorkerRoot, 'stdout.log');
      const stderrPath = path.join(exactWorkerRoot, 'stderr.log');
      for (const [file, label] of [[stdoutPath, 'stdout'], [stderrPath, 'stderr']]) {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink() || !stat.isFile() || fs.realpathSync.native(file) !== file) throw new Error(`TYPED_COMMAND_${label.toUpperCase()}_INVALID`);
      }
      const stdout = fs.readFileSync(stdoutPath);
      const stderr = fs.readFileSync(stderrPath);
      if (stdout.length > command.maxStdoutBytes || stderr.length > command.maxStdoutBytes) throw new Error('TYPED_COMMAND_OUTPUT_BOUND_EXCEEDED');
      let orientationReceipt;
      try { orientationReceipt = JSON.parse(stdout.toString('utf8')); }
      catch { throw new Error('TYPED_COMMAND_STDOUT_NOT_JSON'); }
      validateOrientationResult(orientationReceipt);
      const machineCompletionRecord = freezeDeep({
        schemaVersion: 'vexlife.typed-command-machine-completion/v1',
        commandRegistryRef: registry.registryRef,
        commandRef: command.commandRef,
        authorityRef: authority.authorityRef,
        workRef,
        processPlanHash: processPlan.planHash,
        stdoutSha256: crypto.createHash('sha256').update(stdout).digest('hex'),
        stderrSha256: crypto.createHash('sha256').update(stderr).digest('hex'),
        orientationReceipt,
        orientationReceiptSha256: semanticHash(orientationReceipt),
        effects: structuredClone(command.effects)
      });
      const resultRef = `result.vexlife.typed-command.${semanticHash({ authorityRef: authority.authorityRef, workRef, commandRef: command.commandRef }).slice(0, 24)}`;
      consumeNativeWorkerResult(exactWorkerRoot, {
        resultRef,
        machineCompletionRecord,
        humanSummary: 'Current VexLife repository orientation completed and was verified.'
      }, { now: () => nowMs(clock) });
      loaded = loadNativeWorker(exactWorkerRoot);
    }
    if (loaded.receipt.state !== 'DONE' || !loaded.completion) {
      throw new Error(`TYPED_COMMAND_WORKER_NOT_TERMINAL:${loaded.receipt.state}`);
    }
    const effectReceipt = effectReceiptFromCompletion({
      authority,
      command,
      workRef,
      workerRef: exactWorkerRef,
      processPlan,
      completion: loaded.completion
    });
    const observation = observationFromCompletion({ registry, command, authority, effectReceipt, completion: loaded.completion });
    return freezeDeep({
      state: 'TYPED_COMMAND_EFFECT_COMPLETED',
      authority,
      effectReceipt,
      observation,
      nativeWorker: {
        workerRef: exactWorkerRef,
        state: loaded.receipt.state,
        resultRef: loaded.completion.resultRef,
        completionSha256: semanticHash(loaded.completion)
      }
    });
  }

  return Object.freeze({
    schemaVersion: 'vexlife.typed-command-effect-support/v1',
    registryRef: registry.registryRef,
    currentAuthority: authorityState,
    execute
  });
}

// [VXG RealForever]
