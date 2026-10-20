#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { loadBrowserCompanionHomeIdentity } from '../src/core/browser-companion-bridge.mjs';
import { validateIntentWorkgraph } from '../src/core/intent-validation.mjs';
import { persistIntentWorkgraphRuntimeSnapshot } from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import {
  VEXLIFE_TOCOMPLETION_PROJECT_REF,
  formVexLifeToCompletionWorkgraph,
} from '../src/core/vexlife-tocompletion-project.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--home' || !args[1]) {
  console.error('Usage: npm run project:tocompletion:import -- --home <existing-vex-home>');
  process.exit(2);
}

const homeIdentity = loadBrowserCompanionHomeIdentity(path.resolve(args[1]));
const home = homeIdentity.home;

const sourceBundle = loadBlueprint();
const intentTrustSnapshot = JSON.parse(fs.readFileSync(
  new URL('../blueprint/intent-trust-snapshot.json', import.meta.url),
  'utf8'
));
const graph = formVexLifeToCompletionWorkgraph({
  intentRegistry: sourceBundle.intentRegistry,
});
const validation = validateIntentWorkgraph(graph, {
  registry: sourceBundle.intentRegistry,
  registeredProcessRefs: sourceBundle.factory.processes.map((item) => item.processRef),
  registeredRoleRefs: sourceBundle.blueprint.roles.map((item) => item.roleRef),
  trustSnapshot: intentTrustSnapshot,
});
if (!validation.ok) {
  throw new Error(`ToCompletion Workgraph validation blocked: ${validation.errors[0] ?? validation.state}`);
}

const result = persistIntentWorkgraphRuntimeSnapshot({
  home,
  graph,
  instanceRef: 'instance.vexlife.tocompletion.p0b.b06.project-import',
  observedAt: new Date().toISOString(),
});

console.log(JSON.stringify({
  schemaVersion: 'vexlife.tocompletion-project-import-result/v1',
  state: result.state,
  changed: result.changed,
  projectRef: VEXLIFE_TOCOMPLETION_PROJECT_REF,
  graphRef: result.graph.graphRef,
  semanticFingerprint: result.graph.semanticFingerprint,
  pointerSha256: result.pointer.pointerSha256,
  effects: {
    homeMutationPerformed: result.changed,
    providerMutationPerformed: false,
    sourceMutationPerformed: false,
  },
}, null, 2));

// [VXG RealForever]
