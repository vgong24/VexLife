import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { loadBlueprint, validateBlueprint, buildIdentityIndex } from '../src/core/blueprint.mjs';
import { StateCell, combineStateCells } from '../src/core/state-relay.mjs';
import { Atlas } from '../src/core/atlas.mjs';
import { Localizer, createOriginalMessage, proposeVexRefinement, acceptRefinement } from '../src/core/localization.mjs';
import { attachSemanticRelay, composeSemanticRelay, createChannel, createMessage, contextForParticipant, validateSemanticRelay } from '../src/core/conversation.mjs';
import { LivedCompanionError, initializeLivedCompanionHome, performLivedCompanionTurn } from '../src/core/lived-companion.mjs';
import { NavigationLattice, SelectionStore } from '../src/core/navigation.mjs';
import { TerrainLayout } from '../src/core/terrain.mjs';
import { createDeviceInstallation, createScoreRecord, synchronizeScore } from '../src/core/device-family.mjs';

const bundle = loadBlueprint();

test('blueprint identities, references and required language coverage validate', () => {
  const result = validateBlueprint(bundle);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.stats.platforms, 5);
  assert.equal(result.stats.languages, 3);
});

test('state cells and combined projections suppress semantic no-ops', () => {
  const a = new StateCell({ count: 1 }, { name: 'a' });
  const b = new StateCell({ label: 'x' }, { name: 'b' });
  const combined = combineStateCells([a, b], (left, right) => ({ summary: `${left.count}:${right.label}` }), { name: 'combined' });
  let changed = 0;
  combined.subscribe((event) => { if (event.changed) changed += 1; });
  a.set({ count: 1 });
  b.set({ label: 'x' });
  assert.equal(changed, 0);
  a.set({ count: 2 });
  assert.equal(changed, 1);
  combined.dispose();
});

test('Atlas uses bounded traversal and returns a coverage receipt', () => {
  const atlas = new Atlas(buildIdentityIndex(bundle));
  const result = atlas.query({ startRefs: ['element.chat.composer'], depthLimit: 2, resultLimit: 6, tokenBudget: 300 });
  assert.ok(result.results.some((item) => item.ref === 'element.chat.composer'));
  assert.ok(result.results.some((item) => item.ref === 'action.message.send'));
  assert.ok(result.coverage.usedTokens <= 300);
});

test('directional channels isolate sibling conversation context', () => {
  const victor = 'person.victor';
  const companion = 'role.vex.companion';
  const guide = 'role.vex.guide';
  const companionChannel = createChannel({ channelRef: 'channel.companion', threadRef: 'thread.open', kind: 'DIRECT', memberRefs: [victor, companion], labelStringRef: 'channel.companion.name' });
  const guideChannel = createChannel({ channelRef: 'channel.guide', threadRef: 'thread.open', kind: 'DIRECT', memberRefs: [victor, guide], labelStringRef: 'channel.guide.name' });
  const messages = [
    createMessage({ messageRef: 'm1', channel: companionChannel, speakerRef: victor, recipientRefs: [companion], content: 'Hello companion', sequence: 0 }),
    createMessage({ messageRef: 'm2', channel: companionChannel, speakerRef: companion, recipientRefs: [victor], content: 'Hello Victor', sequence: 1 }),
    createMessage({ messageRef: 'm3', channel: guideChannel, speakerRef: victor, recipientRefs: [guide], content: 'Guide, what screen is this?', sequence: 0 })
  ];
  assert.deepEqual(contextForParticipant(messages, guideChannel, guide).map((item) => item.messageRef), ['m3']);
  assert.deepEqual(contextForParticipant(messages, companionChannel, companion).map((item) => item.messageRef), ['m1', 'm2']);
});

test('navigation screen frame preserves selected node and breadcrumb', () => {
  const lattice = new NavigationLattice([
    { nodeRef: 'product', parentNodeRef: null, kind: 'PRODUCT' },
    { nodeRef: 'screen', parentNodeRef: 'product', kind: 'SCREEN' },
    { nodeRef: 'thread', parentNodeRef: 'screen', kind: 'THREAD_SELECTOR' }
  ]);
  lattice.navigate({ screenRef: 'screen.chat', routeRef: 'route.chat', threadRef: 'thread.open', selectedNodeRef: 'thread' });
  const frame = lattice.screenFrame();
  assert.deepEqual(frame.breadcrumbNodeRefs, ['product', 'screen', 'thread']);
  assert.equal(frame.rawPointerLogIncluded, false);
});

test('navigation keeps semantic current context separate from interaction provenance', () => {
  const lattice = new NavigationLattice([
    { nodeRef: 'terrain.a', parentNodeRef: null, kind: 'PROJECT' },
    { nodeRef: 'terrain.b', parentNodeRef: null, kind: 'PROJECT' }
  ]);
  const seeded = lattice.navigate({
    selectedNodeRef: 'terrain.a',
    elementRef: 'terrain.a',
    actionRef: 'action.terrain.node.select'
  });
  assert.equal(seeded.changed, true);
  const historicalSeed = structuredClone(lattice.fullJourney()[0]);
  const beforeInteractionCount = lattice.fullJourney().length;
  const interaction = lattice.navigate({
    elementRef: 'element.vex.summon',
    interactionRef: 'interaction.vex.summon',
    actionRef: 'action.vex.summon'
  });
  assert.equal(interaction.changed, false);
  assert.equal(interaction.journeyChanged, true);
  assert.equal(lattice.state.value.selectedNodeRef, 'terrain.a');
  assert.equal(interaction.journeyEvent.elementRef, 'element.vex.summon');
  assert.equal(interaction.journeyEvent.interactionRef, 'interaction.vex.summon');
  assert.equal(interaction.journeyEvent.actionRef, 'action.vex.summon');
  assert.equal(lattice.fullJourney().length, beforeInteractionCount + 1);
  assert.deepEqual(lattice.fullJourney()[0], historicalSeed);

  const duplicate = lattice.navigate({
    elementRef: 'element.vex.summon',
    interactionRef: 'interaction.vex.summon',
    actionRef: 'action.vex.summon'
  });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.journeyChanged, false);
  assert.equal(lattice.fullJourney().length, beforeInteractionCount + 1);

  const transition = lattice.navigate({
    selectedNodeRef: 'terrain.b',
    elementRef: 'element.project.b',
    interactionRef: 'interaction.project.select',
    actionRef: 'action.project.select'
  });
  assert.equal(transition.changed, true);
  assert.equal(transition.journeyChanged, true);
  assert.equal(lattice.state.value.selectedNodeRef, 'terrain.b');
  assert.equal(transition.journeyEvent.toFrame.selectedNodeRef, 'terrain.b');
  assert.equal(lattice.screenFrame().trajectory.at(-1).interactionRef, 'interaction.project.select');
});

test('selection is stable by explicit group', () => {
  const store = new SelectionStore();
  store.select('selection.thread', 'thread.one');
  assert.equal(store.isSelected('selection.thread', 'thread.one'), true);
  store.select('selection.thread', 'thread.two');
  assert.equal(store.isSelected('selection.thread', 'thread.one'), false);
  assert.equal(store.isSelected('selection.thread', 'thread.two'), true);
});

test('translations and Vex refinements never overwrite original speech', () => {
  const message = createOriginalMessage({ messageRef: 'm', channelRef: 'c', speakerRef: 'victor', recipientRefs: ['friend'], language: 'en', content: 'I need space.' });
  const candidate = proposeVexRefinement(message, { projectionRef: 'p', content: 'I care about this and need a little time before I answer.', vexRef: 'vex', changeNotes: ['made care explicit'] });
  const accepted = acceptRefinement(candidate, 'p', 'victor');
  assert.equal(accepted.originalContent, 'I need space.');
  assert.equal(accepted.originalContentHash, message.originalContentHash);
  assert.equal(accepted.projections[0].approvalState, 'ACCEPTED_BY_SENDER');
});

test('Localizer switches languages while retaining deterministic fallback', () => {
  const localizer = new Localizer({ catalogs: bundle.strings });
  assert.equal(localizer.text('nav.chat'), 'Chat');
  localizer.setLanguage('zh');
  assert.equal(localizer.text('nav.chat'), '聊天');
});

test('Terrain layout can move and collapse without changing canonical parents', () => {
  const terrain = new TerrainLayout(bundle.blueprint.terrain);
  terrain.move('terrain.project.self-development', 10, 20);
  terrain.setCollapsed('terrain.project.self-development', true);
  const projection = terrain.projection();
  const project = projection.find((item) => item.terrainNodeRef === 'terrain.project.self-development');
  const thread = projection.find((item) => item.terrainNodeRef === 'terrain.thread.open-conversation');
  assert.deepEqual(project.position, { x: 10, y: 20 });
  assert.equal(project.childCount, 1);
  assert.equal(thread.hidden, true);
  assert.equal(thread.parentRef, 'terrain.project.self-development');
});

test('Score sync shares scoped records without collapsing device lineages or Rhythm', () => {
  const windows = createDeviceInstallation({ personRef: 'person.victor', familyRef: 'family.victor', deviceName: 'Windows', platform: 'win32', architecture: 'x64' });
  const mac = createDeviceInstallation({ personRef: 'person.victor', familyRef: 'family.victor', deviceName: 'MacBook', platform: 'darwin', architecture: 'arm64' });
  const record = createScoreRecord({ recordRef: 'memory.one', type: 'MEMORY', subjectRef: 'subject.project', scopeRef: 'PROJECT_SHARED', content: 'Blueprint foundation accepted.', sourceLineageRef: windows.companionLineageRef });
  const sync = synchronizeScore({ targetInstallation: mac, records: [record], allowedScopes: ['PROJECT_SHARED'] });
  assert.notEqual(windows.companionLineageRef, mac.companionLineageRef);
  assert.equal(sync.records.length, 1);
  assert.equal(sync.lineageCollapsed, false);
  assert.equal(sync.rhythmImported, false);
});

test('Terrain semantic depth, pixel scale and centering remain independent projection state', () => {
  const terrain = new TerrainLayout(bundle.blueprint.terrain);
  const beforeParents = terrain.projection().map((item) => [item.terrainNodeRef, item.parentRef]);
  terrain.setPixelScale(1.5);
  terrain.setSemanticDepth(2);
  terrain.centerOn('terrain.thread.open-conversation');
  assert.deepEqual(terrain.viewportProjection(), {
    pixelScale: 1.5,
    semanticDepth: 2,
    semanticDepthRef: 'semantic-depth.terrain.source-descent',
    semanticDepthClass: 'SOURCE_DESCENT',
    labelStringRef: 'terrain.semantic-depth.source-descent',
    centerNodeRef: 'terrain.thread.open-conversation'
  });
  terrain.setSemanticDepth(0);
  assert.equal(terrain.viewportProjection().pixelScale, 1.5);
  assert.deepEqual(terrain.projection().map((item) => [item.terrainNodeRef, item.parentRef]), beforeParents);
  terrain.move('terrain.project.vex-home-product', 900, 250);
  terrain.move('terrain.project.local-vex', 100, 250);
  assert.deepEqual(
    terrain.siblingRefs('terrain.project.vex-home-product').slice(0, 2),
    ['terrain.project.local-vex', 'terrain.project.self-development']
  );
  assert.throws(() => terrain.setSemanticDepth(3), /semanticDepth/);
});

test('navigation consumes Terrain spatial sibling order while preserving full and recent journey projections', () => {
  const terrain = new TerrainLayout([
    { terrainNodeRef: 'a', parentRef: 'root', defaultPosition: { x: 300, y: 0 } },
    { terrainNodeRef: 'b', parentRef: 'root', defaultPosition: { x: 200, y: 0 } },
    { terrainNodeRef: 'c', parentRef: 'root', defaultPosition: { x: 100, y: 0 } }
  ]);
  const lattice = new NavigationLattice([
    { nodeRef: 'root', parentNodeRef: null, kind: 'ROOT' },
    { nodeRef: 'a', parentNodeRef: 'root', kind: 'THREAD' },
    { nodeRef: 'b', parentNodeRef: 'root', kind: 'THREAD' },
    { nodeRef: 'c', parentNodeRef: 'root', kind: 'THREAD' }
  ]);
  lattice.navigate({ screenRef: 'screen.chat', routeRef: 'route.chat', selectedNodeRef: 'b', actionRef: 'action.seed' });
  assert.deepEqual(lattice.siblingRefs(), ['a', 'b', 'c']);
  const spatialSiblingRefs = terrain.siblingRefs('b');
  assert.deepEqual(spatialSiblingRefs, ['c', 'b', 'a']);
  assert.throws(() => lattice.navigateSibling('NEXT'), /ordered sibling projection is required/);
  const moved = lattice.navigateSibling('NEXT', { orderedSiblingRefs: spatialSiblingRefs });
  assert.equal(moved.changed, true);
  assert.equal(lattice.state.value.selectedNodeRef, 'a');
  assert.equal(moved.journeyEvent.actionRef, 'action.navigation.sibling');
  assert.equal(lattice.navigateSibling('NEXT', { orderedSiblingRefs: spatialSiblingRefs }).reason, 'SIBLING_BOUNDARY');
  assert.throws(
    () => lattice.navigateSibling('PREVIOUS', { orderedSiblingRefs: ['a', 'b'] }),
    /exactly cover canonical siblings/
  );
  for (let index = 0; index < 15; index += 1) {
    lattice.navigate({ selectedNodeRef: index % 2 === 0 ? 'a' : 'b', actionRef: `action.synthetic.${index}` });
  }
  const projection = lattice.journeyProjection({ recentLimit: 4 });
  assert.ok(projection.fullEventCount > projection.recentTrajectory.length);
  assert.equal(projection.recentTrajectory.length, 4);
  assert.equal(lattice.fullJourney().length, projection.fullEventCount);
  assert.equal(lattice.screenFrame().journeyEventCount, projection.fullEventCount);
});

function semanticRelayFixture(overrides = {}) {
  const recipientRef = overrides.recipientRef ?? 'role.vex.companion';
  const sourceLanguageRef = overrides.sourceLanguageRef ?? 'language.en';
  const targetLanguageRef = overrides.targetLanguageRef ?? sourceLanguageRef;
  return {
    relayRef: overrides.relayRef ?? 'relay.semantic.test',
    sourceMessageRef: overrides.sourceMessageRef ?? 'message.semantic.test',
    sourceLanguageRef,
    sourceLocaleRef: overrides.sourceLocaleRef ?? 'locale.en-US',
    preferredConversationLanguageRef: overrides.preferredConversationLanguageRef ?? 'language.en',
    requestedResponseLanguageRef: overrides.requestedResponseLanguageRef ?? targetLanguageRef,
    uiLocaleRef: overrides.uiLocaleRef ?? 'locale.en-US',
    originatorRef: overrides.originatorRef ?? 'person.victor',
    originatorKind: overrides.originatorKind ?? 'HUMAN',
    onBehalfOfOriginator: overrides.onBehalfOfOriginator ?? false,
    materiality: overrides.materiality ?? 'ORDINARY',
    ambiguityState: overrides.ambiguityState ?? 'CLEAR',
    recipientRefs: [recipientRef],
    intentRefs: ['intent.semantic.test'],
    canonicalMeaningRefs: ['meaning.semantic.test'],
    interpretationProjectionRef: overrides.interpretationProjectionRef ?? 'projection.interpretation.test',
    interpretationState: overrides.interpretationState ?? 'CANDIDATE',
    confirmedByRef: overrides.confirmedByRef,
    confirmationReceiptRef: overrides.confirmationReceiptRef,
    supersedesInterpretationProjectionRef: overrides.supersedesInterpretationProjectionRef,
    boundaryClassRef: 'boundary.semantic.test',
    targets: [{
      recipientRef,
      recipientPreferredLanguageRef: targetLanguageRef,
      targetLanguageRef,
      targetAudienceRef: 'audience.semantic.test',
      runtimeCapability: Object.hasOwn(overrides, 'runtimeCapability') ? overrides.runtimeCapability : {
        capabilityRef: 'capability.runtime.multilingual.test',
        currentnessState: 'CURRENT',
        multilingualOutput: true,
        supportedLanguageRefs: [targetLanguageRef],
        evidenceRefs: ['evidence.runtime.multilingual.test']
      },
      localeQualityState: overrides.localeQualityState ?? 'ADMITTED',
      terminologyState: overrides.terminologyState ?? 'ADMITTED',
      authorityState: overrides.authorityState ?? 'ADMITTED',
      localizationReadinessState: overrides.localizationReadinessState ?? 'UNAVAILABLE',
      humanReviewAvailable: overrides.humanReviewAvailable ?? false,
      localizedProjectionRef: overrides.localizedProjectionRef,
      equivalenceReceipt: overrides.equivalenceReceipt ?? {
        canonicalMeaningRefs: ['meaning.semantic.test'],
        intentRefs: ['intent.semantic.test'],
        sourceRefs: ['source.semantic.test'],
        evidenceRefs: ['evidence.semantic.test'],
        boundaryClassRef: 'boundary.semantic.test',
        contradictionRefs: []
      },
      deliveryState: overrides.deliveryState ?? 'DELIVERED',
      acknowledgementState: overrides.acknowledgementState ?? 'ACKNOWLEDGED',
      understandingState: overrides.understandingState ?? 'UNKNOWN'
    }],
    sourceRefs: ['source.semantic.test'],
    evidenceRefs: ['evidence.semantic.test'],
    authorityRefs: ['authority.semantic.test']
  };
}

test('semantic relay preserves canonical raw message while source requested and UI languages remain distinct', () => {
  const channel = createChannel({
    channelRef: 'channel.semantic',
    threadRef: 'thread.semantic',
    kind: 'DIRECT',
    memberRefs: ['person.victor', 'role.vex.companion'],
    labelStringRef: 'channel.semantic.name'
  });
  const message = createMessage({
    messageRef: 'message.semantic.source',
    channel,
    speakerRef: 'person.victor',
    recipientRefs: ['role.vex.companion'],
    language: 'zh',
    content: '原始内容必须保持不变。',
    sequence: 0
  });
  const attached = attachSemanticRelay(message, semanticRelayFixture({
    sourceMessageRef: message.messageRef,
    sourceLanguageRef: 'language.zh',
    preferredConversationLanguageRef: 'language.en',
    requestedResponseLanguageRef: 'language.ja',
    uiLocaleRef: 'locale.en-US',
    targetLanguageRef: 'language.ja',
    runtimeCapability: {
      capabilityRef: 'capability.runtime.stale',
      currentnessState: 'STALE',
      multilingualOutput: true,
      supportedLanguageRefs: ['language.ja'],
      evidenceRefs: ['evidence.runtime.stale']
    }
  }));
  assert.equal(attached.status, 'COMPOSED');
  assert.equal(attached.message.content, message.content);
  assert.equal(attached.message.contentHash, message.contentHash);
  assert.equal(attached.relay.sourceLanguageRef, 'language.zh');
  assert.equal(attached.relay.requestedResponseLanguageRef, 'language.ja');
  assert.equal(attached.relay.uiLocaleRef, 'locale.en-US');
  assert.equal(attached.relay.targets[0].projectionMode, 'NONE');
  assert.equal(attached.relay.targets[0].deliveryState, 'DELIVERED');
  assert.equal(attached.relay.targets[0].acknowledgementState, 'ACKNOWLEDGED');
  assert.equal(attached.relay.targets[0].understandingState, 'UNKNOWN');
  assert.equal(JSON.stringify(attached.relay).includes(message.content), false);
  assert.equal(validateSemanticRelay(attached.relay, { sourceMessageRef: message.messageRef, recipientRefs: message.recipientRefs }).ok, true);
});

test('material human on-behalf ambiguity or cross-language relay requires confirm correct or hold', () => {
  const candidate = composeSemanticRelay(semanticRelayFixture({
    sourceLanguageRef: 'language.en',
    targetLanguageRef: 'language.ja',
    onBehalfOfOriginator: true,
    materiality: 'MATERIAL',
    ambiguityState: 'AMBIGUOUS',
    interpretationState: 'CANDIDATE'
  }));
  assert.equal(candidate.status, 'HOLD_CONFIRMATION_REQUIRED');
  assert.equal(candidate.relay, null);

  const held = composeSemanticRelay(semanticRelayFixture({
    sourceLanguageRef: 'language.en',
    targetLanguageRef: 'language.ja',
    onBehalfOfOriginator: true,
    materiality: 'MATERIAL',
    ambiguityState: 'AMBIGUOUS',
    interpretationState: 'HELD'
  }));
  assert.equal(held.status, 'HELD_BY_ORIGINATOR');

  const confirmed = composeSemanticRelay(semanticRelayFixture({
    sourceLanguageRef: 'language.en',
    targetLanguageRef: 'language.ja',
    onBehalfOfOriginator: true,
    materiality: 'MATERIAL',
    ambiguityState: 'AMBIGUOUS',
    interpretationState: 'CONFIRMED',
    confirmedByRef: 'person.victor',
    confirmationReceiptRef: 'receipt.confirmation.semantic.test'
  }));
  assert.equal(confirmed.status, 'COMPOSED');
  assert.equal(confirmed.relay.confirmedByRef, 'person.victor');

  const corrected = composeSemanticRelay(semanticRelayFixture({
    sourceLanguageRef: 'language.en',
    targetLanguageRef: 'language.ja',
    onBehalfOfOriginator: true,
    materiality: 'MATERIAL',
    ambiguityState: 'AMBIGUOUS',
    interpretationState: 'CORRECTED',
    interpretationProjectionRef: 'projection.interpretation.corrected',
    confirmedByRef: 'person.victor',
    confirmationReceiptRef: 'receipt.correction.semantic.test',
    supersedesInterpretationProjectionRef: 'projection.interpretation.original'
  }));
  assert.equal(corrected.status, 'COMPOSED');
  assert.equal(corrected.relay.supersedesInterpretationProjectionRef, 'projection.interpretation.original');
});

test('semantic relay runtime multilingual mode fails closed without current explicit evidence and never carries raw text', () => {
  const current = composeSemanticRelay(semanticRelayFixture({ targetLanguageRef: 'language.ja' }));
  assert.equal(current.status, 'COMPOSED');
  assert.equal(current.relay.targets[0].projectionMode, 'MODEL_NATIVE');

  for (const currentnessState of ['STALE', 'INVALID', 'UNKNOWN']) {
    const result = composeSemanticRelay(semanticRelayFixture({
      targetLanguageRef: 'language.ja',
      runtimeCapability: {
        capabilityRef: `capability.runtime.${currentnessState.toLowerCase()}`,
        currentnessState,
        multilingualOutput: true,
        supportedLanguageRefs: ['language.ja'],
        evidenceRefs: ['evidence.runtime.explicit']
      }
    }));
    assert.equal(result.status, 'COMPOSED');
    assert.equal(result.relay.targets[0].projectionMode, 'NONE');
  }

  const absent = composeSemanticRelay(semanticRelayFixture({ targetLanguageRef: 'language.ja', runtimeCapability: null }));
  assert.equal(absent.status, 'COMPOSED');
  assert.equal(absent.relay.targets[0].runtimeCapability.currentnessState, 'UNKNOWN');
  assert.equal(absent.relay.targets[0].projectionMode, 'NONE');

  const raw = composeSemanticRelay({ ...semanticRelayFixture(), rawText: 'must never enter metadata' });
  assert.equal(raw.status, 'REJECTED');
  assert.match(raw.errors.join('\n'), /rawText/);
});

test('persisted semantic relay validation rejects incomplete or duplicate targets and projection-mode drift', () => {
  const composed = composeSemanticRelay(semanticRelayFixture({ targetLanguageRef: 'language.ja' }));
  assert.equal(composed.status, 'COMPOSED');

  const missingTarget = structuredClone(composed.relay);
  missingTarget.recipientRefs.push('role.vex.guide');
  let validation = validateSemanticRelay(missingTarget);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /recipientRef role\.vex\.guide has no target/);

  const duplicateTarget = structuredClone(composed.relay);
  duplicateTarget.targets.push(structuredClone(duplicateTarget.targets[0]));
  validation = validateSemanticRelay(duplicateTarget);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /duplicates a recipient\/language target/);

  const localizationDrift = structuredClone(composed.relay);
  localizationDrift.targets[0].runtimeCapability = {
    capabilityRef: null,
    currentnessState: 'UNKNOWN',
    multilingualOutput: false,
    supportedLanguageRefs: [],
    evidenceRefs: []
  };
  localizationDrift.targets[0].projectionMode = 'LOCALIZATION_PIPELINE';
  validation = validateSemanticRelay(localizationDrift);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /projectionMode does not match current target evidence; expected NONE/);

  const humanReviewDrift = structuredClone(localizationDrift);
  humanReviewDrift.targets[0].projectionMode = 'HUMAN_REVIEW';
  validation = validateSemanticRelay(humanReviewDrift);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /projectionMode does not match current target evidence; expected NONE/);
});

test('durable G01 relay admission rejects target and projection drift before endpoint or event effects', async () => {
  let calls = 0;
  const service = http.createServer((request, response) => {
    calls += 1;
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content: 'reply' } }] }));
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${service.address().port}/`;
  try {
    for (const variant of ['missing-target', 'projection-mode-drift']) {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-core-semantic-${variant}-`));
      const identity = {
        home,
        homeRef: `home.semantic.${variant}`,
        familyRef: `family.semantic.${variant}`,
        deviceRef: `device.semantic.${variant}`,
        companionLineageRef: `lineage.semantic.${variant}`
      };
      initializeLivedCompanionHome(identity);
      const requestMessageRef = `message.request.semantic.${variant}`;
      const relayResult = composeSemanticRelay(semanticRelayFixture({
        relayRef: `relay.semantic.${variant}`,
        sourceMessageRef: requestMessageRef,
        recipientRef: 'role.vex.companion'
      }));
      assert.equal(relayResult.status, 'COMPOSED');
      const invalidRelay = structuredClone(relayResult.relay);
      if (variant === 'missing-target') {
        invalidRelay.recipientRefs.push('role.vex.guide');
      } else {
        invalidRelay.targets[0].runtimeCapability = {
          capabilityRef: null,
          currentnessState: 'UNKNOWN',
          multilingualOutput: false,
          supportedLanguageRefs: [],
          evidenceRefs: []
        };
        invalidRelay.targets[0].projectionMode = 'LOCALIZATION_PIPELINE';
      }
      const recipientRefs = [...invalidRelay.recipientRefs];
      const threadRef = `thread.semantic.${variant}`;
      const callsBefore = calls;
      await assert.rejects(
        () => performLivedCompanionTurn({
          ...identity,
          instanceRef: `instance.semantic.${variant}`,
          threadRef,
          channelRef: `channel.semantic.${variant}`,
          turnRef: `turn.semantic.${variant}`,
          requestMessageRef,
          responseMessageRef: `message.response.semantic.${variant}`,
          speakerRef: 'person.semantic.test',
          recipientRefs,
          content: 'semantic validation probe',
          requestSemanticRelay: invalidRelay,
          endpointProfile: {
            profileRef: 'profile.loopback.semantic',
            admitted: true,
            endpoint,
            model: 'test-model'
          },
          timeoutMs: 200
        }),
        (error) => error instanceof LivedCompanionError && error.code === 'SEMANTIC_RELAY_INVALID'
      );
      assert.equal(calls, callsBefore);
      const threadRoot = path.join(home, 'conversations', identity.companionLineageRef, threadRef);
      assert.equal(fs.existsSync(path.join(threadRoot, 'head.json')), false);
      assert.equal(fs.existsSync(path.join(threadRoot, 'events')), false);
    }
  } finally {
    await new Promise((resolve) => service.close(resolve));
  }
});

// [VXG RealForever]
