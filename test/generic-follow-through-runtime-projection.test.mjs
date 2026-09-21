import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { approvePairing, createPairingOffer, issueCapabilityLease } from '../src/core/home-bridge.mjs';
import { addFamilyMember, createFamilySpace } from '../src/core/family-space-store.mjs';
import { createFamilyChannel } from '../src/core/family-conversation.mjs';
import { materializeConversationChannel } from '../src/core/conversation-store.mjs';
import {
  acceptIntentAssignment,
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { SingleWorkerIntentScheduler } from '../src/core/intent-scheduler.mjs';
import {
  createConcernAggregate,
  createHumanAttentionRequest,
  createSchedulerDueConcernObservation,
  deriveConcernSubject,
  evaluateConcernThreshold,
  recordHumanAttentionRequest,
  recordSchedulerDueConcernObservation,
  recordThresholdEvaluation
} from '../src/core/concern-watch.mjs';
import {
  persistIntentWorkgraphRuntimeSnapshot
} from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import {
  persistIntentSchedulerRuntimeSnapshot
} from '../src/core/intent-scheduler-runtime-snapshot.mjs';
import {
  persistConcernWatchRuntimeSnapshot
} from '../src/core/concern-watch-runtime-snapshot.mjs';
import {
  GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SCHEMA,
  GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SOURCE_REF,
  readGenericFollowThroughRuntimeProjection
} from '../src/core/generic-follow-through-runtime-projection.mjs';
import { canonicalize, semanticHash } from '../src/core/utils.mjs';
import { BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF, createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_BUNDLE = loadBlueprint(ROOT);
const INTENT_REGISTRY = SOURCE_BUNDLE.intentRegistry;
const SCHEDULER_REGISTRY = SOURCE_BUNDLE.schedulerRegistry;
const CONCERN_REGISTRY = SOURCE_BUNDLE.blueprint.concernWatch;
const T0 = '2026-09-20T06:00:00.000Z';
const T1 = '2026-09-20T06:01:00.000Z';
const T9 = '2026-09-20T06:09:00.000Z';
const FAMILY_HOME_REF = 'vex-home.device.generic-runtime-product';
const FAMILY_DEVICE_REF = 'device.generic-runtime-product';
const FAMILY_PRINCIPAL_REF = 'principal.victor.generic-runtime-test';
const FAMILY_CAPABILITY_REF = 'capability.vexlife.companion-navigation';
const FAMILY_SPACE_REF = 'space.generic-runtime.product';
const FAMILY_CHANNEL_REF = 'channel.generic-runtime.product';
const FAMILY_THREAD_REF = 'thread.generic-runtime.product';

function tempHome(t, label) {
  const rawRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-grp-${label}-`));
  const root = fs.realpathSync.native(rawRoot);
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return home;
}

function bindingRefs(nodes) {
  return Object.fromEntries(INTENT_REGISTRY.bindingFields.map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => Array.isArray(item[field]) ? item[field] : [item[field]]).filter(Boolean))].sort()
  ]));
}

function workgraph(suffix, {
  originSpeakerRef = 'principal.victor.generic-runtime-test',
  threadRef = `thread.generic-runtime.${suffix}`,
  channelRef = `channel.generic-runtime.${suffix}`
} = {}) {
  const intentRef = `intent.generic-runtime.${suffix}`;
  const intent = createIntentEnvelope({
    intentRef,
    originMessageRef: `message.${intentRef}`,
    originSpeakerRef,
    recipientRoleRef: 'role.vex.companion',
    projectRef: 'project.vexlife.root-hub',
    threadRef,
    channelRef,
    originalContentHash: semanticHash({ suffix }),
    desiredOutcome: {
      intentKey: 'GENERIC_RUNTIME_SNAPSHOT_TEST',
      summary: 'Exercise owner-local generic follow-through runtime snapshots'
    },
    constraints: ['NO_EXTERNAL_EFFECTS'],
    createdAt: T0,
    sourceLineageRef: `lineage.generic-runtime.${suffix}`
  }, INTENT_REGISTRY);
  const node = createWorkNode({
    workNodeRef: `work-node.generic-runtime.${suffix}.due`,
    rootIntentRef: intentRef,
    purpose: 'Persist one actual owner Workgraph and due follow-through lineage',
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.companion',
    priorityClass: 'NORMAL',
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.generic-runtime.${suffix}`,
    effectEnvelopeRef: `effect-envelope.generic-runtime.${suffix}`,
    resourceEnvelopeRef: `resource-envelope.generic-runtime.${suffix}`,
    expectedTransitionRef: `expected-transition.generic-runtime.${suffix}`,
    completionGateRefs: [`completion-gate.generic-runtime.${suffix}`],
    returnRouteRef: `return-route.generic-runtime.${suffix}`,
    sourceRefs: [`source.generic-runtime.${suffix}`],
    createdAt: T0
  }, INTENT_REGISTRY);
  let graph = createIntentWorkgraph({
    graphRef: `intent-workgraph.generic-runtime.${suffix}`,
    intent,
    nodes: [node],
    transitions: [],
    receipts: [],
    bindingRefs: bindingRefs([node]),
    createdAt: T0
  }, INTENT_REGISTRY);
  graph = acceptIntentAssignment(graph, {
    assignmentRef: `assignment.generic-runtime.${suffix}`,
    sourceIntentRef: intentRef,
    workNodeRef: node.workNodeRef,
    assigneeRef: 'lineage.vex.generic-runtime-test',
    acceptingActorRef: intent.originSpeakerRef,
    acceptedAt: T0,
    sourceRefs: [`source.assignment.generic-runtime.${suffix}`]
  }, INTENT_REGISTRY).graph;
  return graph;
}

function ownerObjects(suffix, scope = {}) {
  const graph = workgraph(suffix, scope);
  const scheduler = new SingleWorkerIntentScheduler({
    workerRef: `worker.generic-runtime.${suffix}`,
    schedulerInstanceRef: `scheduler.generic-runtime.${suffix}`,
    schedulerRegistry: SCHEDULER_REGISTRY
  });
  scheduler.advanceObservedClock({
    observedAt: T0,
    eventRef: `clock.generic-runtime.${suffix}.initial`
  });
  const formed = scheduler.formDueIntent(graph, {
    assignmentRef: graph.acceptedAssignments[0].assignmentRef,
    dueAt: T1,
    formedAt: T0,
    observedAt: T0,
    sourceRefs: [`source.generic-runtime.${suffix}.due`]
  });
  scheduler.advanceObservedClock({
    observedAt: T1,
    eventRef: `clock.generic-runtime.${suffix}.due`,
    graph
  });

  const concernInput = {
    schedulerAggregate: scheduler.aggregate,
    schedulerRegistry: SCHEDULER_REGISTRY,
    intentRegistry: INTENT_REGISTRY,
    workgraph: graph,
    dueRef: formed.due.dueRef,
    aboutScopeRef: `scope.generic-runtime.${suffix}`
  };
  const observation = createSchedulerDueConcernObservation(concernInput, { registry: CONCERN_REGISTRY });
  const subject = deriveConcernSubject({
    observations: [observation],
    subjectKind: 'FOLLOW_THROUGH_DUE'
  }, { registry: CONCERN_REGISTRY });
  let concern = createConcernAggregate({ subject, formedAt: T0 }, { registry: CONCERN_REGISTRY });
  concern = recordSchedulerDueConcernObservation(concern, concernInput, { registry: CONCERN_REGISTRY }).aggregate;
  const threshold = evaluateConcernThreshold(concern, { observedAt: T1 }, { registry: CONCERN_REGISTRY });
  concern = recordThresholdEvaluation(concern, threshold, { registry: CONCERN_REGISTRY }).aggregate;
  const request = createHumanAttentionRequest(concern, {
    whyVictorIsNeeded: 'One accepted generic follow-through assignment is due.',
    smallestDecisionOrEvidence: 'Acknowledge, reschedule, or cancel the due follow-through.',
    availableOptions: [
      'option.follow-through.acknowledge',
      'option.follow-through.reschedule',
      'option.follow-through.cancel'
    ],
    recommendedOption: 'option.follow-through.acknowledge',
    consequenceOfWaiting: 'The accepted assignment remains due.',
    safeUntil: T9,
    returnRouteRef: graph.nodes[0].returnRouteRef,
    formedAt: T1
  }, { registry: CONCERN_REGISTRY });
  concern = recordHumanAttentionRequest(concern, request, { registry: CONCERN_REGISTRY }).aggregate;
  return { graph, scheduler, concern };
}

function persistOwnerObjects(home, suffix, scope = {}) {
  const owned = ownerObjects(suffix, scope);
  const graphReceipt = persistIntentWorkgraphRuntimeSnapshot({ home, graph: owned.graph });
  const schedulerReceipt = persistIntentSchedulerRuntimeSnapshot({
    home,
    scheduler: owned.scheduler,
    schedulerRegistry: SCHEDULER_REGISTRY
  });
  const concernReceipt = persistConcernWatchRuntimeSnapshot({
    home,
    aggregate: owned.concern,
    registry: CONCERN_REGISTRY
  });
  return {
    graphFingerprint: graphReceipt.graph.semanticFingerprint,
    schedulerFingerprint: schedulerReceipt.aggregate.semanticFingerprint,
    concernFingerprint: concernReceipt.aggregate.semanticFingerprint
  };
}

function onlyJsonFile(directory) {
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.json'));
  assert.equal(files.length, 1);
  return path.join(directory, files[0]);
}

function rewriteCanonical(file, value) {
  fs.writeFileSync(file, JSON.stringify(canonicalize(value)), 'utf8');
}

test('GRP-01..07 owner-local durable snapshots compose one source-managed CURRENT read projection', (t) => {
  const home = tempHome(t, 'current');
  const expected = persistOwnerObjects(home, 'current');

  const projection = readGenericFollowThroughRuntimeProjection({ home, sourceBundle: SOURCE_BUNDLE });
  assert.equal(projection.schemaVersion, GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SCHEMA);
  assert.equal(projection.state, 'CURRENT');
  assert.equal(projection.currentness, 'CURRENT');
  assert.equal(projection.sourceRef, GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SOURCE_REF);
  assert.equal(projection.workgraphs.length, 1);
  assert.equal(projection.schedulerAggregates.length, 1);
  assert.equal(projection.concernAggregates.length, 1);
  assert.equal(projection.workgraphs[0].semanticFingerprint, expected.graphFingerprint);
  assert.equal(projection.schedulerAggregates[0].semanticFingerprint, expected.schedulerFingerprint);
  assert.equal(projection.concernAggregates[0].semanticFingerprint, expected.concernFingerprint);

  assert.equal(fs.existsSync(path.join(home, 'runtime', 'intent-workgraph')), true);
  assert.equal(fs.existsSync(path.join(home, 'runtime', 'intent-scheduler')), true);
  assert.equal(fs.existsSync(path.join(home, 'runtime', 'concern-watch')), true);
  assert.equal(fs.existsSync(path.join(home, 'runtime', 'follow-through')), false);
  assert.equal(fs.existsSync(path.join(home, 'runtime', 'generic-follow-through')), false);

  assert.throws(
    () => createVexLifeBrowserServer({ resolveFamilyWorkProjection: async () => ({ state: 'CURRENT' }) }),
    /source-managed and cannot be caller supplied/
  );
});

test('GRP-08/15/16 fresh product Family bootstrap consumes healthy owner truth and holds only work on owner failure', (t) => {
  const home = tempHome(t, 'fresh-process');
  const expected = persistOwnerObjects(home, 'fresh-process', {
    originSpeakerRef: FAMILY_PRINCIPAL_REF,
    threadRef: FAMILY_THREAD_REF,
    channelRef: FAMILY_CHANNEL_REF
  });

  const producerUrl = pathToFileURL(path.join(ROOT, 'src/core/generic-follow-through-runtime-projection.mjs')).href;
  const serverUrl = pathToFileURL(path.join(ROOT, 'scripts/serve-browser.mjs')).href;
  const familySpaceUrl = pathToFileURL(path.join(ROOT, 'src/core/family-space-store.mjs')).href;
  const familyConversationUrl = pathToFileURL(path.join(ROOT, 'src/core/family-conversation.mjs')).href;
  const conversationStoreUrl = pathToFileURL(path.join(ROOT, 'src/core/conversation-store.mjs')).href;
  const homeBridgeUrl = pathToFileURL(path.join(ROOT, 'src/core/home-bridge.mjs')).href;
  const utilsUrl = pathToFileURL(path.join(ROOT, 'src/core/utils.mjs')).href;
  const program = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { readGenericFollowThroughRuntimeProjection } from ${JSON.stringify(producerUrl)};
    import { createVexLifeBrowserServer } from ${JSON.stringify(serverUrl)};
    import { addFamilyMember, createFamilySpace } from ${JSON.stringify(familySpaceUrl)};
    import { createFamilyChannel } from ${JSON.stringify(familyConversationUrl)};
    import { materializeConversationChannel } from ${JSON.stringify(conversationStoreUrl)};
    import { approvePairing, createPairingOffer, issueCapabilityLease } from ${JSON.stringify(homeBridgeUrl)};
    import { canonicalize, semanticHash } from ${JSON.stringify(utilsUrl)};

    const home = process.env.VEXLIFE_HOME;
    const T0 = ${JSON.stringify(T0)};
    const T1 = ${JSON.stringify(T1)};
    const T9 = ${JSON.stringify(T9)};
    const HOME = ${JSON.stringify(FAMILY_HOME_REF)};
    const DEVICE = ${JSON.stringify(FAMILY_DEVICE_REF)};
    const PRINCIPAL = ${JSON.stringify(FAMILY_PRINCIPAL_REF)};
    const CAP = ${JSON.stringify(FAMILY_CAPABILITY_REF)};
    const SPACE = ${JSON.stringify(FAMILY_SPACE_REF)};
    const CHANNEL = ${JSON.stringify(FAMILY_CHANNEL_REF)};
    const THREAD = ${JSON.stringify(FAMILY_THREAD_REF)};

    const projection = readGenericFollowThroughRuntimeProjection({ home });
    let record = createFamilySpace({
      home,
      spaceRef: SPACE,
      ownerPrincipalRef: PRINCIPAL,
      ownerPrincipalBindingRef: 'principal-binding.generic-runtime-product',
      familyCompanionLineageRef: 'lineage.vex.family.generic-runtime-test',
      observedAt: T0,
      instanceRef: 'instance.generic-runtime.family-create'
    }).record;
    record = addFamilyMember({
      home,
      spaceRef: SPACE,
      actorPrincipalRef: PRINCIPAL,
      principalRef: 'principal.family.generic-runtime-peer',
      principalBindingRef: 'principal-binding.generic-runtime-peer',
      expectedRevision: record.revision,
      expectedMembershipGeneration: record.membershipGeneration,
      observedAt: '2026-09-20T06:00:30.000Z',
      instanceRef: 'instance.generic-runtime.family-add-peer'
    }).record;
    const channel = createFamilyChannel({
      channelRef: CHANNEL,
      threadRef: THREAD,
      familySpaceRecord: record,
      createdAt: T1
    });
    materializeConversationChannel({
      home,
      channel,
      instanceRef: 'instance.generic-runtime.family-channel',
      observedAt: T1
    });

    const offer = createPairingOffer({
      pairingRef: 'pairing.generic-runtime-product',
      homeNodeRef: HOME,
      homePublicKey: 'home-public-key-generic-runtime-product',
      oneTimeNonceHash: 'nonce-generic-runtime-product',
      humanFingerprint: 'fingerprint-generic-runtime-product',
      requestedCapabilityRefs: [CAP],
      expiresAt: T9
    });
    const paired = approvePairing({
      offer,
      principalRef: PRINCIPAL,
      deviceRef: DEVICE,
      devicePublicKey: 'device-public-key-generic-runtime-product',
      approvedCapabilityRefs: [CAP],
      approvedBy: PRINCIPAL,
      approvedAt: T0,
      expectedFingerprint: 'fingerprint-generic-runtime-product'
    });
    const lease = issueCapabilityLease({
      leaseRef: 'lease.generic-runtime-product',
      membership: paired.membership,
      requestedCapabilityRefs: [CAP],
      projectRefs: [],
      issuedAt: T0,
      expiresAt: T9,
      revocationGeneration: 0
    });
    const resolveAuthority = async () => ({
      membership: paired.membership,
      lease,
      currentRevocationGeneration: 0
    });
    const companionBridge = Object.freeze({
      status() { return Object.freeze({ state: 'TEST_ONLY' }); },
      async performTurn() { throw new Error('GRP Family bootstrap proof must not invoke a model'); }
    });
    const server = createVexLifeBrowserServer({
      companionBridge,
      genericFollowThroughRuntimeHome: home,
      familyConversationHome: home,
      familyConversationNow: () => T1,
      resolveFamilyConversationAuthority: resolveAuthority
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = 'http://127.0.0.1:' + String(server.address().port);
    const bootstrap = async () => {
      const response = await fetch(base + '/api/v1/family/bootstrap');
      const body = await response.json();
      return { status: response.status, body };
    };

    const healthy = await bootstrap();

    const pointerDir = path.join(home, 'runtime', 'concern-watch', 'current');
    const pointerNames = fs.readdirSync(pointerDir).filter((name) => name.endsWith('.json'));
    if (pointerNames.length !== 1) throw new Error('Expected one Concern Watch current pointer');
    const pointerFile = path.join(pointerDir, pointerNames[0]);
    const originalPointerBytes = fs.readFileSync(pointerFile, 'utf8');

    const stalePointer = JSON.parse(originalPointerBytes);
    const { pointerSha256: _priorPointerSha256, ...staleCore } = stalePointer;
    staleCore.currentness = 'STALE';
    fs.writeFileSync(pointerFile, JSON.stringify(canonicalize({
      ...staleCore,
      pointerSha256: semanticHash(staleCore)
    })), 'utf8');
    const stale = await bootstrap();

    fs.writeFileSync(pointerFile, originalPointerBytes, 'utf8');
    fs.writeFileSync(pointerFile, '{}', 'utf8');
    const corrupt = await bootstrap();

    fs.writeFileSync(pointerFile, originalPointerBytes, 'utf8');
    fs.rmSync(pointerFile);
    const missing = await bootstrap();

    await new Promise((resolve) => server.close(resolve));
    process.stdout.write(JSON.stringify({
      sourceRef: projection.sourceRef,
      graphFingerprint: projection.workgraphs[0]?.semanticFingerprint ?? null,
      schedulerFingerprint: projection.schedulerAggregates[0]?.semanticFingerprint ?? null,
      concernFingerprint: projection.concernAggregates[0]?.semanticFingerprint ?? null,
      healthy,
      stale,
      corrupt,
      missing
    }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: ROOT,
    env: { ...process.env, VEXLIFE_HOME: home },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(child.status, 0, child.stderr);
  const observed = JSON.parse(child.stdout);
  assert.equal(observed.sourceRef, GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SOURCE_REF);
  assert.equal(observed.graphFingerprint, expected.graphFingerprint);
  assert.equal(observed.schedulerFingerprint, expected.schedulerFingerprint);
  assert.equal(observed.concernFingerprint, expected.concernFingerprint);

  assert.equal(observed.healthy.status, 200);
  assert.equal(observed.healthy.body.state, 'CURRENT');
  assert.equal(observed.healthy.body.rooms.length, 1);
  assert.equal(observed.healthy.body.rooms[0].channelRef, FAMILY_CHANNEL_REF);
  assert.deepEqual(observed.healthy.body.workStatus, {
    state: 'CURRENT',
    pendingCount: 0,
    activeCount: 0,
    dueCount: 1,
    attentionCount: 1,
    sourceRef: BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF
  });

  for (const held of [observed.stale, observed.corrupt, observed.missing]) {
    assert.equal(held.status, 200);
    assert.equal(held.body.state, 'CURRENT');
    assert.equal(held.body.rooms.length, 1);
    assert.equal(held.body.rooms[0].channelRef, FAMILY_CHANNEL_REF);
    assert.deepEqual(held.body.workStatus, {
      state: 'HELD_UNAVAILABLE',
      pendingCount: null,
      activeCount: null,
      dueCount: null,
      attentionCount: null,
      sourceRef: null
    });
  }
});

test('GRP-09 missing, stale, corrupt and cross-owner lineage snapshots fail closed', (t) => {
  const missingHome = tempHome(t, 'missing');
  const missingOwned = ownerObjects('missing');
  persistIntentWorkgraphRuntimeSnapshot({ home: missingHome, graph: missingOwned.graph });
  persistIntentSchedulerRuntimeSnapshot({
    home: missingHome,
    scheduler: missingOwned.scheduler,
    schedulerRegistry: SCHEDULER_REGISTRY
  });
  assert.throws(
    () => readGenericFollowThroughRuntimeProjection({ home: missingHome, sourceBundle: SOURCE_BUNDLE }),
    /Concern Watch runtime snapshot surface is unavailable/
  );

  const staleHome = tempHome(t, 'stale');
  persistOwnerObjects(staleHome, 'stale');
  const schedulerPointer = onlyJsonFile(path.join(staleHome, 'runtime', 'intent-scheduler', 'current'));
  const stalePointer = JSON.parse(fs.readFileSync(schedulerPointer, 'utf8'));
  const { pointerSha256: _priorPointerHash, ...staleCore } = stalePointer;
  staleCore.currentness = 'STALE';
  rewriteCanonical(schedulerPointer, { ...staleCore, pointerSha256: semanticHash(staleCore) });
  assert.throws(
    () => readGenericFollowThroughRuntimeProjection({ home: staleHome, sourceBundle: SOURCE_BUNDLE }),
    /pointer is stale, substituted, or corrupt/
  );

  const corruptHome = tempHome(t, 'corrupt');
  persistOwnerObjects(corruptHome, 'corrupt');
  const graphPointerFile = onlyJsonFile(path.join(corruptHome, 'runtime', 'intent-workgraph', 'current'));
  const graphPointer = JSON.parse(fs.readFileSync(graphPointerFile, 'utf8'));
  const graphSnapshot = path.join(
    corruptHome,
    'runtime',
    'intent-workgraph',
    'snapshots',
    `${graphPointer.semanticFingerprint}.json`
  );
  rewriteCanonical(graphSnapshot, { forged: true });
  assert.throws(
    () => readGenericFollowThroughRuntimeProjection({ home: corruptHome, sourceBundle: SOURCE_BUNDLE }),
    /not canonical current Workgraph truth|does not match its current pointer/
  );

  const mismatchHome = tempHome(t, 'mismatch');
  const first = ownerObjects('lineage-a');
  const second = ownerObjects('lineage-b');
  persistIntentWorkgraphRuntimeSnapshot({ home: mismatchHome, graph: second.graph });
  persistIntentSchedulerRuntimeSnapshot({
    home: mismatchHome,
    scheduler: first.scheduler,
    schedulerRegistry: SCHEDULER_REGISTRY
  });
  persistConcernWatchRuntimeSnapshot({
    home: mismatchHome,
    aggregate: first.concern,
    registry: CONCERN_REGISTRY
  });
  assert.throws(
    () => readGenericFollowThroughRuntimeProjection({ home: mismatchHome, sourceBundle: SOURCE_BUNDLE }),
    /references a Workgraph that is not current/
  );
});

test('GRP-10/11 producer snapshot and browser binding remain read-only and do not touch held FT-E source', (t) => {
  const home = tempHome(t, 'effects');
  persistOwnerObjects(home, 'effects');
  const before = fs.readdirSync(path.join(home, 'runtime')).sort();
  const projection = readGenericFollowThroughRuntimeProjection({ home, sourceBundle: SOURCE_BUNDLE });
  const after = fs.readdirSync(path.join(home, 'runtime')).sort();
  assert.deepEqual(after, before);
  assert.equal(projection.state, 'CURRENT');
  assert.deepEqual(before, ['concern-watch', 'intent-scheduler', 'intent-workgraph']);
});

// [VXG RealForever]
