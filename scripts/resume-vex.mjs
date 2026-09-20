#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ActivatedModelRuntimeBindingError,
  loadActivatedModelRuntimeBindingRegistry,
  planActivatedModelResume,
  readActivatedBindingSourceIdentity,
  startOrResumeActivatedModelRuntime
} from '../src/core/activated-model-runtime-binding.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(HERE, '..');
const REGISTRY_PATH = path.join(SOURCE_ROOT, 'blueprint', 'activated-model-runtime-bindings.json');
const MODULE_PATH = path.join(SOURCE_ROOT, 'src', 'core', 'activated-model-runtime-binding.mjs');
const args = process.argv.slice(2);
const ALLOWED_FLAGS = new Set(['--home', '--handoff', '--handoff-sha256', '--runtime-attempt-ref', '--plan-only']);

function fail(code, message, exitCode = 2, detail = null) {
  const result = {
    schemaVersion: 'vexlife.activated-model-resume-result/v1',
    state: 'FAILED_SAFE',
    code,
    message
  };
  if (detail?.runtimeAttemptRef) result.runtimeAttemptRef = detail.runtimeAttemptRef;
  if (detail?.originalFailure) result.originalFailure = detail.originalFailure;
  if (detail?.runtimeCleanup) result.runtimeCleanup = detail.runtimeCleanup;
  console.log(JSON.stringify(result));
  process.exit(exitCode);
}

function parseArguments() {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!ALLOWED_FLAGS.has(flag)) {
      fail('ACTIVATED_MODEL_CLI_INJECTION_REJECTED', `Unknown or unowned runtime-selection argument: ${flag}`);
    }
    if (flag === '--plan-only') {
      if (values.has(flag)) fail('ACTIVATED_MODEL_CLI_INVALID', '--plan-only may appear only once');
      values.set(flag, true);
      continue;
    }
    if (values.has(flag)) fail('ACTIVATED_MODEL_CLI_INVALID', `${flag} may appear only once`);
    const value = args[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      fail('ACTIVATED_MODEL_CLI_INVALID', `${flag} requires one value`);
    }
    values.set(flag, value);
    index += 1;
  }
  const handoff = values.get('--handoff') ?? null;
  const handoffSha256 = values.get('--handoff-sha256') ?? null;
  if ((handoff === null) !== (handoffSha256 === null)) {
    fail('ACTIVATED_MODEL_HANDOFF_ARGUMENTS_INCOMPLETE', '--handoff and --handoff-sha256 must be supplied together');
  }
  return Object.freeze({
    home: path.resolve(values.get('--home') ?? process.env.VEXLIFE_HOME ?? path.join(os.homedir(), '.vexlife')),
    handoff: handoff === null ? null : path.resolve(handoff),
    handoffSha256,
    runtimeAttemptRef: values.get('--runtime-attempt-ref') ?? null,
    planOnly: values.has('--plan-only')
  });
}

function readHandoff(filePath) {
  if (filePath === null) return null;
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      fail('ACTIVATED_MODEL_HANDOFF_UNAVAILABLE', 'Digest-bound handoff must be one regular non-link file');
    }
    return fs.readFileSync(filePath);
  } catch (error) {
    if (error instanceof ActivatedModelRuntimeBindingError) throw error;
    fail('ACTIVATED_MODEL_HANDOFF_UNAVAILABLE', 'Digest-bound handoff could not be read');
  }
}

async function main() {
  const options = parseArguments();
  const handoffBytes = readHandoff(options.handoff);
  const { binding } = loadActivatedModelRuntimeBindingRegistry(REGISTRY_PATH);
  const sourceIdentity = await readActivatedBindingSourceIdentity({
    sourceRoot: SOURCE_ROOT,
    registryPath: REGISTRY_PATH,
    modulePath: MODULE_PATH
  });

  if (options.planOnly) {
    const plan = await planActivatedModelResume({
      home: options.home,
      binding,
      sourceDigests: {
        registrySha256: sourceIdentity.registrySha256,
        moduleSha256: sourceIdentity.moduleSha256
      },
      sourceIdentity,
      handoffBytes,
      handoffSha256: options.handoffSha256
    });
    console.log(JSON.stringify({
      schemaVersion: 'vexlife.activated-model-resume-result/v1',
      state: 'PLAN_READY_NO_EFFECT',
      sourceIdentity,
      plan
    }));
    return;
  }

  const runtime = await startOrResumeActivatedModelRuntime({
    home: options.home,
    binding,
    sourceIdentity,
    handoffBytes,
    handoffSha256: options.handoffSha256,
    runtimeAttemptRef: options.runtimeAttemptRef
  });

  console.log(JSON.stringify({
    schemaVersion: 'vexlife.activated-model-resume-result/v1',
    state: 'ACTIVATED_MODEL_RUNTIME_QUALIFIED__STARTING_EXISTING_BROWSER',
    bindingRef: runtime.bindingRef,
    modelRef: runtime.modelRef,
    modelProfileRef: runtime.modelProfileRef,
    endpoint: runtime.endpoint,
    requestModel: runtime.requestModel,
    runtimeDisposition: runtime.runtimeDisposition,
    runtimeAttemptRef: runtime.runtimeAttemptRef,
    runtimeStartedByAttemptRef: runtime.runtimeStartedByAttemptRef,
    receiptRef: runtime.receiptRef,
    browserScript: binding.browserBinding.existingServerScript
  }));

  const browserScript = path.join(SOURCE_ROOT, ...binding.browserBinding.existingServerScript.split('/'));
  const browser = spawn(process.execPath, [browserScript], {
    cwd: SOURCE_ROOT,
    env: { ...process.env, ...runtime.browserEnvironment },
    stdio: 'inherit',
    shell: false,
    windowsHide: true
  });
  const terminateBrowser = () => {
    try { browser.kill('SIGTERM'); } catch {}
  };
  process.once('SIGINT', terminateBrowser);
  process.once('SIGTERM', terminateBrowser);
  const exitCode = await new Promise((resolve, reject) => {
    browser.once('error', reject);
    browser.once('exit', (code, signal) => resolve(Number.isInteger(code) ? code : signal ? 1 : 0));
  });
  process.exitCode = exitCode;
}

main().catch((error) => {
  const code = error instanceof ActivatedModelRuntimeBindingError
    ? error.code
    : 'ACTIVATED_MODEL_RESUME_FAILED_SAFE';
  fail(code, error?.message ?? 'Activated model resume failed safely', 6, error instanceof ActivatedModelRuntimeBindingError ? error.detail : null);
});

// [VXG RealForever]
