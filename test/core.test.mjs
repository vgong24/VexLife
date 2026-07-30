import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint, validateBlueprint, buildIdentityIndex } from '../src/core/blueprint.mjs';
import { StateCell, combineStateCells } from '../src/core/state-relay.mjs';
import { Atlas } from '../src/core/atlas.mjs';
import { Localizer, createOriginalMessage, proposeVexRefinement, acceptRefinement } from '../src/core/localization.mjs';
import { createChannel, createMessage, contextForParticipant } from '../src/core/conversation.mjs';
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

// [VXG RealForever]
