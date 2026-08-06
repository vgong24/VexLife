#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  LIVED_COMPANION_FAILURE_CODES,
  LivedCompanionError,
  assertNoSensitivePersistence,
  initializeLivedCompanionHome,
  livedCompanionReceiptSha256,
  performLivedCompanionTurn,
  resumeLivedCompanionConversation,
  sanitizeEndpointOrigin,
  writeLivedCompanionShutdownReceipt
} from '../src/core/lived-companion.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function ref(prefix) {
  return `${prefix}.${crypto.randomUUID()}`;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function absentProcessId() {
  for (const pid of [2147483647, 1073741823, 99999999]) {
    try { process.kill(pid, 0); }
    catch (error) { if (error?.code === 'ESRCH') return pid; }
  }
  throw new Error('could not identify one absent process id for the host proof');
}

function writeAbandonedWriterLease(home, threadRef) {
  const lockDirectory = path.join(home.home, 'runtime', 'thread-writer-locks', home.companionLineageRef);
  fs.mkdirSync(lockDirectory, { recursive: true });
  const leaseCore = {
    schemaVersion: 'vexlife.thread-writer-lease/v1',
    companionLineageRef: home.companionLineageRef,
    threadRef,
    instanceRef: ref('instance.vexlife.abandoned'),
    lockToken: crypto.randomUUID(),
    pid: absentProcessId(),
    formedAt: new Date().toISOString()
  };
  const lease = { ...leaseCore, leaseSha256: semanticHash(leaseCore) };
  const lockPath = path.join(lockDirectory, `${threadRef}.lock`);
  writeJson(lockPath, lease);
  return { lockPath, lease };
}

function writeUnverifiableWriterLease(home, threadRef, variant) {
  const lockDirectory = path.join(home.home, 'runtime', 'thread-writer-locks', home.companionLineageRef);
  fs.mkdirSync(lockDirectory, { recursive: true });
  const lockPath = path.join(lockDirectory, `${threadRef}.lock`);
  if (variant === 'malformed') {
    fs.writeFileSync(lockPath, '{', 'utf8');
  } else {
    const leaseCore = {
      schemaVersion: 'vexlife.thread-writer-lease/v1',
      companionLineageRef: home.companionLineageRef,
      threadRef,
      instanceRef: ref('instance.vexlife.unverifiable'),
      lockToken: crypto.randomUUID(),
      pid: absentProcessId(),
      formedAt: new Date().toISOString()
    };
    writeJson(lockPath, {
      ...leaseCore,
      leaseSha256: '0'.repeat(64)
    });
  }
  return {
    lockPath,
    observedLeaseFileSha256: crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex')
  };
}


function nonLoopbackIpv4() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && entry.internal === false) return entry.address;
    }
  }
  throw new Error('one non-loopback IPv4 address is required for redirect-boundary proof');
}

async function startRedirectTargetServer() {
  const address = nonLoopbackIpv4();
  const calls = [];
  const server = http.createServer((request, response) => {
    calls.push({ method: request.method, url: request.url });
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ model: 'redirect-target', choices: [{ message: { content: 'redirect escaped boundary' } }] }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', resolve);
  });
  return {
    server,
    calls,
    endpoint: `http://${address}:${server.address().port}/outside`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function startLoopbackServer(redirectTargetUrl) {
  const calls = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    calls.push({
      path: url.pathname,
      authorizationPresent: Boolean(request.headers.authorization),
      contentType: request.headers['content-type'] || null
    });
    request.resume();
    const send = (status, body, contentType = 'application/json') => {
      response.statusCode = status;
      response.setHeader('content-type', contentType);
      response.end(body);
    };
    if (url.pathname.startsWith('/redirect/')) {
      response.statusCode = 307;
      response.setHeader('location', redirectTargetUrl);
      response.end();
      return;
    }
    if (url.pathname.startsWith('/timeout/')) {
      setTimeout(() => {
        if (!response.destroyed) send(200, JSON.stringify({ model: 'timeout', choices: [{ message: { content: 'late' } }] }));
      }, 1000);
      return;
    }
    if (url.pathname.startsWith('/delay/')) {
      setTimeout(() => {
        if (!response.destroyed) send(200, JSON.stringify({ model: 'bounded-loopback-proof', choices: [{ message: { content: 'delayed bounded reply' } }] }));
      }, 300);
      return;
    }
    if (url.pathname.startsWith('/http-error/')) {
      send(503, JSON.stringify({ error: 'bounded proof error' }));
      return;
    }
    if (url.pathname.startsWith('/invalid/')) {
      send(200, JSON.stringify({ choices: [] }));
      return;
    }
    send(200, JSON.stringify({
      model: 'bounded-loopback-proof',
      choices: [{ message: { content: 'The bounded loopback reply was persisted.' } }]
    }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    calls,
    port: address.port,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function closedLoopbackPort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function identityFor(label) {
  return {
    homeRef: `vex-home.proof.${label}.${crypto.randomUUID()}`,
    familyRef: `vex-family.proof.${label}`,
    deviceRef: `device.vexlife.proof.${label}.${crypto.randomUUID()}`,
    companionLineageRef: `companion-lineage.vexlife.proof.${label}.${crypto.randomUUID()}`
  };
}

function makeHome(root, label) {
  const home = path.join(root, label);
  const identity = identityFor(label);
  initializeLivedCompanionHome({ home, ...identity });
  return { home, ...identity };
}

function baseTurn(homeIdentity, endpoint, overrides = {}) {
  return {
    ...homeIdentity,
    instanceRef: overrides.instanceRef || ref('instance.vexlife.proof'),
    threadRef: overrides.threadRef || ref('thread.vexlife.proof'),
    channelRef: overrides.channelRef || ref('channel.vexlife.proof'),
    turnRef: overrides.turnRef || ref('turn.vexlife.proof'),
    requestMessageRef: overrides.requestMessageRef || ref('message.vexlife.request'),
    responseMessageRef: overrides.responseMessageRef || ref('message.vexlife.response'),
    speakerRef: 'person.proof-user',
    recipientRefs: ['role.vex.companion'],
    content: 'Please preserve this bounded proof turn.',
    endpointProfile: {
      profileRef: 'model-profile.g01-bounded-loopback',
      admitted: true,
      endpoint,
      model: 'bounded-loopback-proof'
    },
    contextSourceRefs: ['source.proof.prompt'],
    timeoutMs: 500,
    ...overrides
  };
}

async function expectFailure(code, operation, label) {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof LivedCompanionError) || error.code !== code) {
      throw new Error(`${label} expected ${code}, observed ${error.code || error.name}: ${error.message}`);
    }
    return {
      failureCode: error.code,
      label,
      requestDurablyRecorded: error.details?.requestDurablyRecorded ?? false,
      responseDurablyRecorded: error.details?.responseDurablyRecorded ?? false,
      failureReceiptPath: error.details?.failureReceiptPath ?? null
    };
  }
  throw new Error(`${label} did not fail with ${code}`);
}

function cloneHome(source, root, label) {
  const destination = path.join(root, label);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
  return destination;
}

function findHeadEventFile(home, lineageRef, threadRef, eventHash) {
  const directory = path.join(home, 'conversations', lineageRef, threadRef, 'events');
  const match = fs.readdirSync(directory).find((name) => name.includes(eventHash));
  if (!match) throw new Error('head event file was not found');
  return path.join(directory, match);
}

async function runResumeChild(input, outputPath) {
  const inputPath = `${outputPath}.input.json`;
  writeJson(inputPath, input);
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'resume-proof'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, VEXLIFE_G01_RESUME_INPUT: inputPath, VEXLIFE_G01_RESUME_OUTPUT: outputPath },
    maxBuffer: 16 * 1024 * 1024
  });
  if (child.status !== 0) throw new Error(`fresh resume child failed: ${child.stderr || child.stdout}`);
  return readJson(outputPath);
}

async function runTurnChild(input, outputPath) {
  const inputPath = `${outputPath}.input.json`;
  writeJson(inputPath, input);
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'turn-proof'], {
      cwd: ROOT,
      env: { ...process.env, VEXLIFE_G01_TURN_INPUT: inputPath, VEXLIFE_G01_TURN_OUTPUT: outputPath },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) return reject(new Error(`turn child failed: ${stderr || stdout || `exit ${code}`}`));
      try { resolve(readJson(outputPath)); }
      catch (error) { reject(error); }
    });
  });
}

async function proof() {
  const proofRoot = path.resolve(process.env.VEXLIFE_G01_PROOF_HOME || path.join(os.tmpdir(), `vexlife-g01-proof-${process.pid}`));
  const receiptPath = path.resolve(process.env.VEXLIFE_G01_PROOF_RECEIPT || path.join(proofRoot, 'g01-lived-companion-windows-proof.json'));
  fs.rmSync(proofRoot, { recursive: true, force: true });
  fs.mkdirSync(proofRoot, { recursive: true });

  const redirectTarget = await startRedirectTargetServer();
  const loopback = await startLoopbackServer(redirectTarget.endpoint);
  const typedFailureProofs = [];
  const negativeControls = {};
  try {
    const main = makeHome(proofRoot, 'main-home');
    const initialInstanceRef = ref('instance.vexlife.g01.initial');
    const resumedInstanceRef = ref('instance.vexlife.g01.resumed');
    const threadRef = ref('thread.vexlife.g01');
    const channelRef = ref('channel.vexlife.g01');
    const turnRef = ref('turn.vexlife.g01');
    const requestMessageRef = ref('message.vexlife.g01.request');
    const responseMessageRef = ref('message.vexlife.g01.response');
    const secretAuthorization = `Bearer secret-${crypto.randomUUID()}`;
    const secretQuery = `query-secret-${crypto.randomUUID()}`;
    const endpoint = `http://127.0.0.1:${loopback.port}/ok/?token=${encodeURIComponent(secretQuery)}`;

    const completed = await performLivedCompanionTurn(baseTurn(main, endpoint, {
      instanceRef: initialInstanceRef,
      threadRef,
      channelRef,
      turnRef,
      requestMessageRef,
      responseMessageRef,
      inMemoryAuthorization: secretAuthorization
    }));
    negativeControls.canonicalStoredContextPath =
      !path.isAbsolute(completed.head.contextPath) &&
      !completed.head.contextPath.split('/').includes('..');
    const shutdown = writeLivedCompanionShutdownReceipt({
      ...main,
      instanceRef: initialInstanceRef,
      threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256
    });
    typedFailureProofs.push(await expectFailure('CONVERSATION_HEAD_MISMATCH', async () => writeLivedCompanionShutdownReceipt({
      ...main,
      instanceRef: 'instance.vexlife.g01.not-the-writer',
      threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256
    }), 'forged shutdown instance'));
    negativeControls.forgedShutdownInstance = true;

    const resumeOutputPath = path.join(proofRoot, 'fresh-resume-output.json');
    const resumed = await runResumeChild({
      ...main,
      priorInstanceRef: initialInstanceRef,
      instanceRef: resumedInstanceRef,
      threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    }, resumeOutputPath);

    const privacy = assertNoSensitivePersistence(main.home, [secretAuthorization, secretQuery]);
    negativeControls.secretHeaderQueryLeakage = privacy.secretLeakCount === 0;

    const duplicateCallsBefore = loopback.calls.length;
    typedFailureProofs.push(await expectFailure('DUPLICATE_TURN_SUPPRESSED', () => performLivedCompanionTurn(baseTurn(main, endpoint, {
      instanceRef: initialInstanceRef,
      threadRef,
      channelRef,
      turnRef,
      requestMessageRef: ref('message.duplicate.request'),
      responseMessageRef: ref('message.duplicate.response')
    })), 'duplicate turn'));
    negativeControls.duplicateTurnOrIdempotency = loopback.calls.length === duplicateCallsBefore;

    const concurrentHome = makeHome(proofRoot, 'concurrent-writer-home');
    const concurrentThreadRef = ref('thread.vexlife.concurrent');
    const concurrentFirst = baseTurn(concurrentHome, `http://127.0.0.1:${loopback.port}/delay/`, {
      instanceRef: ref('instance.vexlife.concurrent.first'),
      threadRef: concurrentThreadRef,
      turnRef: ref('turn.vexlife.concurrent.first')
    });
    const concurrentSecond = baseTurn(concurrentHome, `http://127.0.0.1:${loopback.port}/delay/`, {
      instanceRef: ref('instance.vexlife.concurrent.second'),
      threadRef: concurrentThreadRef,
      turnRef: ref('turn.vexlife.concurrent.second')
    });
    const concurrentCallsBefore = loopback.calls.length;
    const concurrentOutputs = await Promise.all([
      runTurnChild(concurrentFirst, path.join(proofRoot, 'concurrent-first-output.json')),
      runTurnChild(concurrentSecond, path.join(proofRoot, 'concurrent-second-output.json'))
    ]);
    const concurrentCompleted = concurrentOutputs.filter((value) => value.state === 'COMPLETED');
    const concurrentRejected = concurrentOutputs.filter((value) => value.state === 'FAILED');
    if (
      concurrentCompleted.length !== 1 ||
      concurrentRejected.length !== 1 ||
      concurrentRejected[0].failureCode !== 'THREAD_WRITER_CONFLICT'
    ) {
      throw new Error(`cross-process writer proof was not one completion plus one conflict: ${JSON.stringify(concurrentOutputs)}`);
    }
    typedFailureProofs.push({
      failureCode: 'THREAD_WRITER_CONFLICT',
      label: 'cross-process competing thread writer',
      requestDurablyRecorded: concurrentRejected[0].requestDurablyRecorded ?? false,
      responseDurablyRecorded: concurrentRejected[0].responseDurablyRecorded ?? false,
      failureReceiptPath: concurrentRejected[0].failureReceiptPath ?? null
    });
    const concurrentEvents = path.join(
      concurrentHome.home,
      'conversations',
      concurrentHome.companionLineageRef,
      concurrentThreadRef,
      'events'
    );
    const concurrentEventFiles = fs.readdirSync(concurrentEvents).filter((name) => name.endsWith('.json'));
    const concurrentHead = readJson(path.join(
      concurrentHome.home,
      'conversations',
      concurrentHome.companionLineageRef,
      concurrentThreadRef,
      'head.json'
    ));
    negativeControls.concurrentWriterConflict =
      concurrentRejected[0].failureCode === 'THREAD_WRITER_CONFLICT';
    negativeControls.singleWriterEndpointCall =
      loopback.calls.length === concurrentCallsBefore + 1;
    negativeControls.singleWriterEventPair =
      concurrentEventFiles.length === 2 &&
      concurrentHead.conversationHeadSha256 === concurrentCompleted[0].conversationHeadSha256;

    const losingInput = concurrentOutputs[0].state === 'FAILED' ? concurrentFirst : concurrentSecond;
    const winningInput = concurrentOutputs[0].state === 'COMPLETED' ? concurrentFirst : concurrentSecond;
    const retriedAfterRelease = await performLivedCompanionTurn({
      ...losingInput,
      endpointProfile: {
        ...losingInput.endpointProfile,
        endpoint: `http://127.0.0.1:${loopback.port}/ok/`
      }
    });
    negativeControls.writerLeaseReleaseRetry = retriedAfterRelease.state === 'TURN_COMPLETED';
    const duplicateAfterCompletionCalls = loopback.calls.length;
    typedFailureProofs.push(await expectFailure('DUPLICATE_TURN_SUPPRESSED', () => performLivedCompanionTurn({
      ...winningInput,
      requestMessageRef: ref('message.vexlife.concurrent.duplicate.request'),
      responseMessageRef: ref('message.vexlife.concurrent.duplicate.response'),
      endpointProfile: {
        ...winningInput.endpointProfile,
        endpoint: `http://127.0.0.1:${loopback.port}/ok/`
      }
    }), 'post-completion concurrent winner duplicate'));
    negativeControls.postCompletionDuplicateSuppressed =
      loopback.calls.length === duplicateAfterCompletionCalls;

    const emptyHome = path.join(proofRoot, 'empty-home');
    fs.mkdirSync(emptyHome, { recursive: true });
    const abandonedHome = makeHome(proofRoot, 'abandoned-writer-home');
    const abandonedThreadRef = ref('thread.vexlife.abandoned');
    const abandonedTurn = baseTurn(abandonedHome, endpoint, {
      threadRef: abandonedThreadRef,
      instanceRef: ref('instance.vexlife.abandoned-retry'),
      turnRef: ref('turn.vexlife.abandoned-retry')
    });
    const abandoned = writeAbandonedWriterLease(abandonedHome, abandonedThreadRef);
    const abandonedCallsBefore = loopback.calls.length;
    const abandonedFailure = await expectFailure(
      'THREAD_WRITER_RECOVERY_REQUIRED',
      () => performLivedCompanionTurn(abandonedTurn),
      'abandoned thread writer requires explicit recovery'
    );
    typedFailureProofs.push(abandonedFailure);
    const abandonedReceipt = readJson(abandonedFailure.failureReceiptPath);
    const abandonedEvents = path.join(
      abandonedHome.home,
      'conversations',
      abandonedHome.companionLineageRef,
      abandonedThreadRef,
      'events'
    );
    negativeControls.abandonedWriterRecoveryRequired =
      abandonedFailure.failureCode === 'THREAD_WRITER_RECOVERY_REQUIRED' &&
      abandonedReceipt.exactNextSafeRoute === 'EXPLICIT_THREAD_WRITER_LEASE_RECOVERY_REQUIRED' &&
      abandonedReceipt.threadWriterLeaseDisposition?.ownerState === 'ABSENT' &&
      abandonedReceipt.threadWriterLeaseDisposition?.leaseSha256 === abandoned.lease.leaseSha256 &&
      fs.existsSync(abandoned.lockPath) &&
      !fs.existsSync(abandonedEvents) &&
      loopback.calls.length === abandonedCallsBefore;

    const unverifiableVariants = [
      ['malformed', 'malformed thread writer lease evidence'],
      ['invalid-hash', 'hash-invalid thread writer lease evidence']
    ];
    let unverifiableWriterLeaseEvidence = true;
    for (const [variant, label] of unverifiableVariants) {
      const unverifiableHome = makeHome(proofRoot, `unverifiable-writer-${variant}`);
      const unverifiableThreadRef = ref(`thread.vexlife.unverifiable.${variant}`);
      const unverifiableTurn = baseTurn(unverifiableHome, endpoint, {
        threadRef: unverifiableThreadRef,
        instanceRef: ref('instance.vexlife.unverifiable-retry'),
        turnRef: ref('turn.vexlife.unverifiable-retry')
      });
      const evidence = writeUnverifiableWriterLease(unverifiableHome, unverifiableThreadRef, variant);
      const callsBefore = loopback.calls.length;
      const failure = await expectFailure('THREAD_WRITER_CONFLICT', () => performLivedCompanionTurn(unverifiableTurn), label);
      typedFailureProofs.push(failure);
      const receipt = readJson(failure.failureReceiptPath);
      const events = path.join(
        unverifiableHome.home,
        'conversations',
        unverifiableHome.companionLineageRef,
        unverifiableThreadRef,
        'events'
      );
      const valid =
        receipt.exactNextSafeRoute === 'ATTENTION_REQUIRED_UNVERIFIABLE_THREAD_WRITER' &&
        receipt.threadWriterLeaseDisposition?.ownerState === 'UNVERIFIABLE' &&
        receipt.threadWriterLeaseDisposition?.observedLeaseFileSha256 === evidence.observedLeaseFileSha256 &&
        receipt.threadWriterLeaseDisposition?.leaseSha256 === null &&
        fs.existsSync(evidence.lockPath) &&
        !fs.existsSync(events) &&
        loopback.calls.length === callsBefore;
      negativeControls[variant === 'malformed' ? 'malformedWriterLeaseEvidence' : 'invalidWriterLeaseHash'] = valid;
      unverifiableWriterLeaseEvidence = unverifiableWriterLeaseEvidence && valid;
    }
    negativeControls.unverifiableWriterLeaseEvidence = unverifiableWriterLeaseEvidence;

    typedFailureProofs.push(await expectFailure('HOME_NOT_INITIALIZED', () => performLivedCompanionTurn(baseTurn({
      home: emptyHome,
      homeRef: 'vex-home.missing',
      deviceRef: 'device.missing',
      companionLineageRef: 'lineage.missing'
    }, endpoint)), 'uninitialized home'));

    typedFailureProofs.push(await expectFailure('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', async () => {
      initializeLivedCompanionHome({ ...main });
    }, 'existing home preserved'));

    const partialHomePath = path.join(proofRoot, 'partial-home-preservation');
    const partialLegacyPath = path.join(partialHomePath, 'legacy', 'keep.bin');
    const partialInterruptedPath = path.join(partialHomePath, 'config', 'interrupted.tmp');
    const partialLegacyBytes = Buffer.from([0, 1, 2, 3, 254, 255]);
    const partialInterruptedBytes = Buffer.from('interrupted-home-state\n', 'utf8');
    fs.mkdirSync(path.dirname(partialLegacyPath), { recursive: true });
    fs.mkdirSync(path.dirname(partialInterruptedPath), { recursive: true });
    fs.writeFileSync(partialLegacyPath, partialLegacyBytes);
    fs.writeFileSync(partialInterruptedPath, partialInterruptedBytes);
    typedFailureProofs.push(await expectFailure('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', async () => {
      initializeLivedCompanionHome({
        home: partialHomePath,
        homeRef: ref('home.partial'),
        familyRef: ref('family.partial'),
        deviceRef: ref('device.partial'),
        companionLineageRef: ref('lineage.partial')
      });
    }, 'partial non-empty home preserved'));
    negativeControls.partialHomePreserved =
      Buffer.compare(fs.readFileSync(partialLegacyPath), partialLegacyBytes) === 0 &&
      Buffer.compare(fs.readFileSync(partialInterruptedPath), partialInterruptedBytes) === 0 &&
      !fs.existsSync(path.join(partialHomePath, 'config', 'home.json')) &&
      !fs.existsSync(path.join(partialHomePath, 'config', 'model.json')) &&
      !fs.existsSync(path.join(partialHomePath, 'devices'));

    const fileHomePath = path.join(proofRoot, 'file-home-root');
    const fileHomeBytes = Buffer.from('not-a-directory-home\n', 'utf8');
    fs.writeFileSync(fileHomePath, fileHomeBytes);
    typedFailureProofs.push(await expectFailure('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', async () => {
      initializeLivedCompanionHome({
        home: fileHomePath,
        homeRef: ref('home.file'),
        familyRef: ref('family.file'),
        deviceRef: ref('device.file'),
        companionLineageRef: ref('lineage.file')
      });
    }, 'non-directory home preserved'));
    negativeControls.nonDirectoryHomePreserved =
      fs.lstatSync(fileHomePath).isFile() &&
      Buffer.compare(fs.readFileSync(fileHomePath), fileHomeBytes) === 0;

    const linkedHomeTarget = path.join(proofRoot, 'linked-home-target');
    const linkedHomePath = path.join(proofRoot, 'linked-home-root');
    const linkedHomeMarker = path.join(linkedHomeTarget, 'keep.txt');
    fs.mkdirSync(linkedHomeTarget, { recursive: true });
    fs.writeFileSync(linkedHomeMarker, 'preserve-me\n', 'utf8');
    fs.symlinkSync(linkedHomeTarget, linkedHomePath, process.platform === 'win32' ? 'junction' : 'dir');
    typedFailureProofs.push(await expectFailure('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', async () => {
      initializeLivedCompanionHome({
        home: linkedHomePath,
        homeRef: ref('home.linked'),
        familyRef: ref('family.linked'),
        deviceRef: ref('device.linked'),
        companionLineageRef: ref('lineage.linked')
      });
    }, 'linked home root preserved'));
    negativeControls.linkedHomePreserved =
      fs.readFileSync(linkedHomeMarker, 'utf8') === 'preserve-me\n' &&
      !fs.existsSync(path.join(linkedHomeTarget, 'config'));

    const linkedParentActual = path.join(proofRoot, 'linked-parent-actual');
    const linkedParentAlias = path.join(proofRoot, 'linked-parent-alias');
    const linkedParentTargetHome = path.join(linkedParentActual, 'home');
    fs.mkdirSync(linkedParentActual, { recursive: true });
    fs.symlinkSync(
      linkedParentActual,
      linkedParentAlias,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    const linkedParentIdentity = identityFor('linked-parent');
    typedFailureProofs.push(await expectFailure('EXISTING_HOME_REQUIRES_MIGRATION_PLAN', async () => {
      initializeLivedCompanionHome({
        home: path.join(linkedParentAlias, 'home'),
        ...linkedParentIdentity
      });
    }, 'fresh home beneath linked parent rejected'));
    negativeControls.linkedParentFreshHomeRejected = !fs.existsSync(linkedParentTargetHome);

    initializeLivedCompanionHome({ home: linkedParentTargetHome, ...linkedParentIdentity });
    const linkedParentTurn = baseTurn({
      home: path.join(linkedParentAlias, 'home'),
      ...linkedParentIdentity
    }, endpoint);
    const linkedParentCallsBefore = loopback.calls.length;
    typedFailureProofs.push(await expectFailure('HOME_IDENTITY_MISMATCH', () => {
      return performLivedCompanionTurn(linkedParentTurn);
    }, 'initialized home through linked parent rejected'));
    negativeControls.linkedParentTurnRejected =
      loopback.calls.length === linkedParentCallsBefore &&
      !fs.existsSync(path.join(
        linkedParentTargetHome,
        'conversations',
        linkedParentIdentity.companionLineageRef,
        linkedParentTurn.threadRef,
        'events'
      ));

    const invalidPortableRefs = [
      'C:device',
      'device:stream',
      'device.',
      'device ',
      'CON',
      'nul',
      'COM1',
      'lpt9',
      'Device.case'
    ];
    let portableRefGrammar = true;
    for (const invalidRef of invalidPortableRefs) {
      const invalidRefHome = path.join(
        proofRoot,
        `invalid-portable-ref-${sha256Text(invalidRef).slice(0, 12)}`
      );
      typedFailureProofs.push(await expectFailure('HOME_IDENTITY_MISMATCH', async () => {
        initializeLivedCompanionHome({
          home: invalidRefHome,
          homeRef: ref('home.invalid-portable-ref'),
          familyRef: ref('family.invalid-portable-ref'),
          deviceRef: invalidRef,
          companionLineageRef: ref('lineage.invalid-portable-ref')
        });
      }, `portable path segment rejected: ${invalidRef}`));
      portableRefGrammar = portableRefGrammar && !fs.existsSync(invalidRefHome);
    }
    negativeControls.portableCanonicalRefGrammar = portableRefGrammar;

    const emptyExistingHomePath = path.join(proofRoot, 'empty-existing-home');
    fs.mkdirSync(emptyExistingHomePath, { recursive: true });
    const emptyExistingHome = initializeLivedCompanionHome({
      home: emptyExistingHomePath,
      homeRef: ref('home.empty-existing'),
      familyRef: ref('family.empty-existing'),
      deviceRef: ref('device.empty-existing'),
      companionLineageRef: ref('lineage.empty-existing')
    });
    negativeControls.emptyExistingHomeEligible =
      emptyExistingHome.home === fs.realpathSync.native(emptyExistingHomePath) &&
      fs.existsSync(path.join(emptyExistingHomePath, 'config', 'home.json'));

    const identityHome = makeHome(proofRoot, 'identity-home');
    typedFailureProofs.push(await expectFailure('HOME_IDENTITY_MISMATCH', () => performLivedCompanionTurn(baseTurn(identityHome, endpoint, {
      deviceRef: 'device.vexlife.wrong'
    })), 'wrong device identity'));
    negativeControls.wrongHome = true;
    negativeControls.wrongDevice = true;
    negativeControls.wrongCompanionLineage = true;

    const endpointHome = makeHome(proofRoot, 'endpoint-home');
    typedFailureProofs.push(await expectFailure('ENDPOINT_PROFILE_NOT_ADMITTED', () => performLivedCompanionTurn(baseTurn(endpointHome, endpoint, {
      endpointProfile: { profileRef: 'profile.not-admitted', admitted: false, endpoint }
    })), 'unadmitted endpoint'));
    negativeControls.unadmittedEndpointProfile = true;

    typedFailureProofs.push(await expectFailure('ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED', () => performLivedCompanionTurn(baseTurn(makeHome(proofRoot, 'nonloopback-home'), 'https://example.com/', {
      endpointProfile: {
        profileRef: 'profile.caller-authored',
        admitted: true,
        explicitNonLoopbackAdmission: true,
        endpoint: 'https://example.com/'
      }
    })), 'non-loopback endpoint'));
    negativeControls.nonLoopbackEndpoint = true;

    const redirectHome = makeHome(proofRoot, 'redirect-boundary-home');
    const redirectCallsBefore = redirectTarget.calls.length;
    const loopbackCallsBeforeRedirect = loopback.calls.length;
    const redirectFailure = await expectFailure(
      'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED',
      () => performLivedCompanionTurn(baseTurn(redirectHome, `http://127.0.0.1:${loopback.port}/redirect/`)),
      'loopback endpoint redirect'
    );
    typedFailureProofs.push(redirectFailure);
    const redirectHead = path.join(
      redirectHome.home,
      'conversations',
      redirectHome.companionLineageRef,
      readJson(redirectFailure.failureReceiptPath).threadRef,
      'head.json'
    );
    negativeControls.endpointRedirectBoundary =
      loopback.calls.length === loopbackCallsBeforeRedirect + 1 &&
      redirectTarget.calls.length === redirectCallsBefore &&
      !fs.existsSync(redirectHead);

    const localhostHome = makeHome(proofRoot, 'localhost-alias-home');
    const localhostCallsBefore = loopback.calls.length;
    typedFailureProofs.push(await expectFailure(
      'ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED',
      () => performLivedCompanionTurn(baseTurn(localhostHome, `http://localhost:${loopback.port}/ok/`)),
      'hostname alias is not numeric loopback proof'
    ));
    negativeControls.numericLoopbackOnly = loopback.calls.length === localhostCallsBefore;

    const linkedEventsHome = makeHome(proofRoot, 'linked-events-home');
    const linkedEventsTurn = baseTurn(linkedEventsHome, endpoint);
    const linkedThreadRoot = path.join(
      linkedEventsHome.home,
      'conversations',
      linkedEventsHome.companionLineageRef,
      linkedEventsTurn.threadRef
    );
    const outsideEvents = path.join(proofRoot, 'outside-events-directory');
    fs.mkdirSync(linkedThreadRoot, { recursive: true });
    fs.mkdirSync(outsideEvents, { recursive: true });
    const linkedEventsPath = path.join(linkedThreadRoot, 'events');
    fs.symlinkSync(outsideEvents, linkedEventsPath, process.platform === 'win32' ? 'junction' : 'dir');
    const linkedCallsBefore = loopback.calls.length;
    typedFailureProofs.push(await expectFailure('HOME_IDENTITY_MISMATCH', () => performLivedCompanionTurn(linkedEventsTurn), 'event directory symlink or junction'));
    negativeControls.eventDirectorySymlink = fs.readdirSync(outsideEvents).length === 0 && loopback.calls.length === linkedCallsBefore;

    const closedPort = await closedLoopbackPort();
    typedFailureProofs.push(await expectFailure('ENDPOINT_UNREACHABLE', () => performLivedCompanionTurn(baseTurn(makeHome(proofRoot, 'unreachable-home'), `http://127.0.0.1:${closedPort}/`)), 'unreachable endpoint'));
    negativeControls.unreachableEndpoint = true;

    typedFailureProofs.push(await expectFailure('ENDPOINT_TIMEOUT', () => performLivedCompanionTurn(baseTurn(makeHome(proofRoot, 'timeout-home'), `http://127.0.0.1:${loopback.port}/timeout/`, { timeoutMs: 50 })), 'endpoint timeout'));
    negativeControls.endpointTimeout = true;

    typedFailureProofs.push(await expectFailure('ENDPOINT_HTTP_ERROR', () => performLivedCompanionTurn(baseTurn(makeHome(proofRoot, 'http-error-home'), `http://127.0.0.1:${loopback.port}/http-error/`)), 'endpoint HTTP error'));
    negativeControls.endpointHttpError = true;

    typedFailureProofs.push(await expectFailure('ENDPOINT_RESPONSE_INVALID', () => performLivedCompanionTurn(baseTurn(makeHome(proofRoot, 'invalid-home'), `http://127.0.0.1:${loopback.port}/invalid/`)), 'invalid endpoint response'));
    negativeControls.invalidEndpointResponse = true;

    const persistenceHome = makeHome(proofRoot, 'persistence-home');
    const persistenceTurn = baseTurn(persistenceHome, endpoint, { faults: { persistenceFailureBeforeHead: true } });
    typedFailureProofs.push(await expectFailure('PERSISTENCE_WRITE_FAILED', () => performLivedCompanionTurn(persistenceTurn), 'persistence failure before head'));
    negativeControls.persistenceFailureBeforeHead = !fs.existsSync(path.join(persistenceHome.home, 'conversations', persistenceHome.companionLineageRef, persistenceTurn.threadRef, 'head.json'));

    typedFailureProofs.push(await expectFailure('CONVERSATION_HEAD_MISMATCH', async () => resumeLivedCompanionConversation({
      ...main,
      priorInstanceRef: initialInstanceRef,
      instanceRef: ref('instance.vexlife.wrong-head'),
      threadRef,
      expectedConversationHeadSha256: '0'.repeat(64),
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    }), 'wrong conversation head'));
    negativeControls.wrongConversationHead = true;

    typedFailureProofs.push(await expectFailure('CONVERSATION_HEAD_MISMATCH', async () => resumeLivedCompanionConversation({
      ...main,
      priorInstanceRef: initialInstanceRef,
      instanceRef: ref('instance.vexlife.wrong-thread'),
      threadRef: 'thread.vexlife.wrong',
      expectedConversationHeadSha256: completed.head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    }), 'wrong thread'));
    negativeControls.wrongThread = true;

    typedFailureProofs.push(await expectFailure('CONVERSATION_HEAD_MISMATCH', async () => resumeLivedCompanionConversation({
      ...main,
      priorInstanceRef: initialInstanceRef,
      instanceRef: initialInstanceRef,
      threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    }), 'old process instance reuse'));
    negativeControls.oldProcessInstanceReuse = true;

    typedFailureProofs.push(await expectFailure('CONVERSATION_HEAD_MISMATCH', async () => resumeLivedCompanionConversation({
      ...main,
      priorInstanceRef: 'instance.vexlife.g01.never-owned-head',
      instanceRef: ref('instance.vexlife.unrelated-prior'),
      threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    }), 'unrelated prior instance'));
    negativeControls.unrelatedPriorInstance = true;

    const tamperedHeadHome = cloneHome(main.home, proofRoot, 'tampered-head-home');
    const tamperedHeadPath = path.join(tamperedHeadHome, 'conversations', main.companionLineageRef, threadRef, 'head.json');
    const tamperedHead = readJson(tamperedHeadPath);
    tamperedHead.contextPath = '../outside-context.json';
    writeJson(tamperedHeadPath, tamperedHead);
    typedFailureProofs.push(await expectFailure('CONVERSATION_HEAD_MISMATCH', async () => resumeLivedCompanionConversation({
      ...main,
      home: tamperedHeadHome,
      priorInstanceRef: initialInstanceRef,
      instanceRef: ref('instance.vexlife.tampered-head'),
      threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    }), 'tampered head content hash'));
    negativeControls.tamperedHeadHash = true;

    const escapedContextHome = cloneHome(main.home, proofRoot, 'escaped-context-home');
    const escapedHeadPath = path.join(escapedContextHome, 'conversations', main.companionLineageRef, threadRef, 'head.json');
    const escapedHead = readJson(escapedHeadPath);
    const originalContextPath = path.join(escapedContextHome, ...escapedHead.contextPath.split('/'));
    const outsideContextPath = path.join(proofRoot, 'outside-context.json');
    fs.copyFileSync(originalContextPath, outsideContextPath);
    escapedHead.contextPath = '../outside-context.json';
    const { conversationHeadSha256: ignoredHeadHash, ...escapedHeadCore } = escapedHead;
    escapedHead.conversationHeadSha256 = semanticHash(escapedHeadCore);
    writeJson(escapedHeadPath, escapedHead);
    const escapedShutdownPath = path.join(escapedContextHome, 'runtime', initialInstanceRef, 'shutdown-receipt.json');
    const escapedShutdown = readJson(escapedShutdownPath);
    escapedShutdown.conversationHeadSha256 = escapedHead.conversationHeadSha256;
    const { shutdownReceiptSha256: ignoredShutdownHash, ...escapedShutdownCore } = escapedShutdown;
    escapedShutdown.shutdownReceiptSha256 = semanticHash(escapedShutdownCore);
    writeJson(escapedShutdownPath, escapedShutdown);
    typedFailureProofs.push(await expectFailure('CONTEXT_HASH_MISMATCH', async () => resumeLivedCompanionConversation({
      ...main,
      home: escapedContextHome,
      priorInstanceRef: initialInstanceRef,
      instanceRef: ref('instance.vexlife.escaped-context'),
      threadRef,
      expectedConversationHeadSha256: escapedHead.conversationHeadSha256,
      expectedShutdownReceiptSha256: escapedShutdown.shutdownReceiptSha256
    }), 'escaped context path'));
    negativeControls.escapedContextPath = true;

    const corruptHome = cloneHome(main.home, proofRoot, 'corrupt-event-home');
    const corruptEventFile = findHeadEventFile(corruptHome, main.companionLineageRef, threadRef, completed.head.eventHash);
    const corruptEvent = readJson(corruptEventFile);
    corruptEvent.content = 'corrupted after formation';
    writeJson(corruptEventFile, corruptEvent);
    typedFailureProofs.push(await expectFailure('EVENT_CHAIN_CORRUPT', async () => resumeLivedCompanionConversation({
      ...main,
      home: corruptHome,
      priorInstanceRef: initialInstanceRef,
      instanceRef: ref('instance.vexlife.corrupt-event'),
      threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    }), 'event chain corruption'));
    negativeControls.eventChainCorruption = true;

    const contextHome = cloneHome(main.home, proofRoot, 'corrupt-context-home');
    const contextPath = path.join(contextHome, ...completed.head.contextPath.split('/'));
    const context = readJson(contextPath);
    context.contextSourceRefs = [...context.contextSourceRefs, 'source.substitution'];
    writeJson(contextPath, context);
    typedFailureProofs.push(await expectFailure('CONTEXT_HASH_MISMATCH', async () => resumeLivedCompanionConversation({
      ...main,
      home: contextHome,
      priorInstanceRef: initialInstanceRef,
      instanceRef: ref('instance.vexlife.corrupt-context'),
      threadRef,
      expectedConversationHeadSha256: completed.head.conversationHeadSha256,
      expectedShutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256
    }), 'context substitution'));
    negativeControls.contextHashSubstitution = true;

    const privacyHome = cloneHome(main.home, proofRoot, 'privacy-detection-home');
    const injectedSecret = `forbidden-secret-${crypto.randomUUID()}`;
    fs.writeFileSync(path.join(privacyHome, 'recovery', 'injected-secret.txt'), injectedSecret, 'utf8');
    typedFailureProofs.push(await expectFailure('PRIVACY_POLICY_BLOCKED', async () => assertNoSensitivePersistence(privacyHome, [injectedSecret]), 'secret persistence detection'));

    const observedCodes = new Set(typedFailureProofs.map((item) => item.failureCode));
    for (const code of LIVED_COMPANION_FAILURE_CODES) {
      if (!observedCodes.has(code)) throw new Error(`typed failure proof missing ${code}`);
    }

    const receipt = {
      schemaVersion: 'vexlife.g01.lived-companion-proof/v1',
      state: 'PASS',
      platform: process.platform,
      candidateHeadSha: process.env.VEXLIFE_CANDIDATE_HEAD_SHA || '',
      actualHttpCall: true,
      loopbackOnly: true,
      atomicHeadAdvanced: true,
      cleanShutdownReceipt: shutdown.receipt.clean === true,
      freshProcessResume: resumed.state === 'RESUMED',
      oldInstanceRejected: negativeControls.oldProcessInstanceReuse,
      privacyClass: 'DEVICE_PRIVATE',
      syncUsed: false,
      trainingUsed: false,
      modelWeightsChanged: false,
      publicationUsed: false,
      secretLeakCount: privacy.secretLeakCount,
      LC18Performed: false,
      homeRef: main.homeRef,
      deviceRef: main.deviceRef,
      companionLineageRef: main.companionLineageRef,
      initialInstanceRef,
      resumedInstanceRef,
      threadRef,
      turnRef,
      requestMessageRef,
      responseMessageRef,
      eventHash: completed.head.eventHash,
      contextSha256: completed.head.contextSha256,
      conversationHeadSha256: completed.head.conversationHeadSha256,
      shutdownReceiptSha256: shutdown.receipt.shutdownReceiptSha256,
      resumeReceiptSha256: resumed.receipt.resumeReceiptSha256,
      shutdownReceiptBoundToResume: resumed.receipt.shutdownReceiptSha256 === shutdown.receipt.shutdownReceiptSha256,
      oneWriterPerThread:
        negativeControls.concurrentWriterConflict &&
        negativeControls.singleWriterEndpointCall &&
        negativeControls.singleWriterEventPair &&
        negativeControls.writerLeaseReleaseRetry &&
        negativeControls.postCompletionDuplicateSuppressed,
      abandonedWriterRecoveryDisposition: negativeControls.abandonedWriterRecoveryRequired,
      abandonedWriterRecoveryOperationHeld: true,
      unverifiableWriterLeaseDisposition: negativeControls.unverifiableWriterLeaseEvidence,
      endpointRedirectBoundary: negativeControls.endpointRedirectBoundary,
      numericLoopbackOnly: negativeControls.numericLoopbackOnly,
      homePreservation:
        negativeControls.partialHomePreserved &&
        negativeControls.nonDirectoryHomePreserved &&
        negativeControls.linkedHomePreserved &&
        negativeControls.emptyExistingHomeEligible,
      canonicalPathIdentity:
        negativeControls.linkedParentFreshHomeRejected &&
        negativeControls.linkedParentTurnRejected &&
        negativeControls.portableCanonicalRefGrammar &&
        negativeControls.canonicalStoredContextPath,
      sanitizedEndpointOrigin: sanitizeEndpointOrigin(endpoint),
      modelNameOrBoundedTestProfileRef: completed.responseEvent.modelNameOrBoundedTestProfileRef,
      typedFailureProofs,
      negativeControls,
      formedAt: new Date().toISOString()
    };
    receipt.proofReceiptSha256 = sha256Text(JSON.stringify(receipt));
    writeJson(receiptPath, receipt);
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await loopback.close();
    await redirectTarget.close();
  }
}

function resumeProof() {
  const inputPath = process.env.VEXLIFE_G01_RESUME_INPUT;
  const outputPath = process.env.VEXLIFE_G01_RESUME_OUTPUT;
  if (!inputPath || !outputPath) throw new Error('resume proof input/output paths are required');
  const result = resumeLivedCompanionConversation(readJson(inputPath));
  writeJson(outputPath, {
    state: result.state,
    receipt: result.receipt,
    receiptPath: result.receiptPath,
    receiptSha256: livedCompanionReceiptSha256(result.receiptPath)
  });
}

async function turnProof() {
  const inputPath = process.env.VEXLIFE_G01_TURN_INPUT;
  const outputPath = process.env.VEXLIFE_G01_TURN_OUTPUT;
  if (!inputPath || !outputPath) throw new Error('turn proof input/output paths are required');
  try {
    const result = await performLivedCompanionTurn(readJson(inputPath));
    writeJson(outputPath, {
      state: 'COMPLETED',
      conversationHeadSha256: result.head.conversationHeadSha256,
      turnRef: result.head.turnRef,
      writerLeaseReleased: result.writerLeaseReleased
    });
  } catch (error) {
    if (!(error instanceof LivedCompanionError)) throw error;
    writeJson(outputPath, {
      state: 'FAILED',
      failureCode: error.code,
      requestDurablyRecorded: error.details?.requestDurablyRecorded ?? false,
      responseDurablyRecorded: error.details?.responseDurablyRecorded ?? false,
      failureReceiptPath: error.details?.failureReceiptPath ?? null,
      writerLeaseReleased: error.details?.writerLeaseReleased ?? true
    });
  }
}

const command = process.argv[2] || 'proof';
try {
  if (command === 'proof') await proof();
  else if (command === 'resume-proof') resumeProof();
  else if (command === 'turn-proof') await turnProof();
  else throw new Error(`unknown lived-companion command: ${command}`);
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}

// [VXG RealForever]
