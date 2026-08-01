import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { deriveRequiredLensRefs, scaffoldFeatureContract, validateFeatureRegistry, validateReviewLensRegistry } from '../src/core/feature-registry.mjs';
import { deriveRepositoryHealth, compactCurrentProjection, validateBuildHealthRegistry } from '../src/core/build-health.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { runSchedulerSimulation } from '../scripts/scheduler-simulate.mjs';
import { runContinuityEvolutionSimulation } from '../scripts/evolution-simulate.mjs';

const bundle = loadBlueprint();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cultural review lenses and registered features validate as part of the universal blueprint', () => {
  const lens = validateReviewLensRegistry(bundle.reviewLenses);
  const feature = validateFeatureRegistry(bundle.featureRegistry, bundle);
  assert.equal(lens.ok, true, lens.errors.join('\n'));
  assert.equal(feature.ok, true, feature.errors.join('\n'));
  assert.ok(lens.stats.lenses >= 12);
  assert.ok(feature.stats.features >= 7);
});

test('feature scaffold makes architectural obligations visible instead of silently omitting them', () => {
  const candidate = scaffoldFeatureContract({
    featureRef: 'feature.vexlife.synthetic-proof',
    purpose: 'Prove the scaffold exposes the full foundation contract.',
    platformRefs: ['platform.browser']
  });
  assert.equal(candidate.status, 'PROPOSED');
  assert.ok(candidate.reviewLensRefs.includes('lens.vexlife.intent-and-placement'));
  assert.ok(candidate.reviewLensRefs.includes('lens.vexlife.identity-lattice'));
  assert.equal(candidate.rollbackRouteRef, 'REQUIRED');
  assert.deepEqual(candidate.stateRefs, []);
});

test('derived feature lenses include UI, platform, resource and effect boundaries when implicated', () => {
  const refs = deriveRequiredLensRefs({
    canonicalNodeRefs: ['screen.vexlife.synthetic'],
    localizationRefs: ['synthetic.label'],
    platformRefs: ['platform.browser', 'platform.windows'],
    resourceClass: 'INTERACTIVE',
    dataClass: 'PRIVATE_MESSAGE',
    effectClass: 'LOCAL_WRITE',
    concurrencyClass: 'ONE_WRITER',
    projectionRefs: ['projection.synthetic']
  });
  for (const required of [
    'lens.vexlife.design-system',
    'lens.vexlife.usability-and-journey',
    'lens.vexlife.accessibility',
    'lens.vexlife.localization-intent',
    'lens.vexlife.security-privacy-permission',
    'lens.vexlife.recovery-migration-continuity',
    'lens.vexlife.concurrency-and-relay',
    'lens.vexlife.platform-environment',
    'lens.vexlife.resource-and-context',
    'lens.vexlife.visibility-terrain-health'
  ]) assert.ok(refs.includes(required), required);
});

test('registered repository health checks resolve through source-managed cultural lenses', () => {
  const result = validateBuildHealthRegistry(bundle.buildHealth, bundle.reviewLenses);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.ok(result.stats.checks >= 10);
});

test('equal semantic health inputs do not create another current transition', () => {
  const executedCurrentPass = { checkRef: 'check.blueprint', state: 'PASSED', executed: true, currentness: 'CURRENT' };
  const first = deriveRepositoryHealth({
    sourceTreeRef: 'tree.1',
    blueprintHash: 'blueprint.1',
    checkResults: [executedCurrentPass]
  });
  const second = deriveRepositoryHealth({
    sourceTreeRef: 'tree.1',
    blueprintHash: 'blueprint.1',
    checkResults: [executedCurrentPass],
    previousProjection: first.projection
  });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.projection.semanticHash, first.projection.semanticHash);
});

test('repository health is healthy only from executed current receipts', () => {
  const checkResults = bundle.buildHealth.checks.map((check) => ({
    checkRef: check.checkRef,
    semanticState: 'PASSED',
    transportState: 'EXECUTED',
    executed: true,
    currentness: 'CURRENT',
    detailRef: check.command
  }));
  const result = deriveRepositoryHealth({ sourceTreeRef: 'tree.current', blueprintHash: 'blueprint.current', checkResults });
  assert.equal(result.projection.state, 'HEALTHY');
  assert.equal(result.projection.receiptSummary.executedCurrentPassed, checkResults.length);
  assert.deepEqual(result.projection.unresolvedCheckRefs, []);
});

test('not-run, registered-only, unknown and stale pass states never become healthy', () => {
  for (const candidate of [
    { state: 'REGISTERED_NOT_EXECUTED', executed: false, currentness: 'UNKNOWN' },
    { state: 'NOT_RUN', executed: false, currentness: 'UNKNOWN' },
    { state: 'UNKNOWN', executed: false, currentness: 'UNKNOWN' },
    { state: 'PASSED', executed: true, currentness: 'STALE' },
    { state: 'PASSED', executed: false, currentness: 'CURRENT' }
  ]) {
    const result = deriveRepositoryHealth({
      sourceTreeRef: 'tree.current',
      blueprintHash: 'blueprint.current',
      checkResults: [{ checkRef: 'check.example', ...candidate }]
    });
    assert.equal(result.projection.state, 'ATTENTION', JSON.stringify(candidate));
    assert.deepEqual(result.projection.unresolvedCheckRefs, ['check.example']);
  }
});

test('executed current failure blocks repository health', () => {
  const result = deriveRepositoryHealth({
    sourceTreeRef: 'tree.current',
    blueprintHash: 'blueprint.current',
    checkResults: [{ checkRef: 'check.example', semanticState: 'FAILED', transportState: 'EXECUTED', executed: true, currentness: 'CURRENT' }]
  });
  assert.equal(result.projection.state, 'BLOCKED');
  assert.deepEqual(result.projection.blockingCheckRefs, ['check.example']);
});

test('health command accepts only an exact-head executed-current receipt', () => {
  const validation = validateBlueprint(bundle);
  const simulation = runSchedulerSimulation({ root: ROOT, writeReceipt: true }).receipt;
  const continuity = runContinuityEvolutionSimulation({ root: ROOT, writeReceipt: true }).receipt;
  const source = buildSourceManifest(ROOT);
  const repository = collectRepositoryEvidence(ROOT);
  const receiptArg = `generated/health/vexlife-health-${process.pid}-${Date.now()}.json`;
  const receiptPath = path.join(ROOT, ...receiptArg.split('/'));
  const checkResults = bundle.buildHealth.checks.map((check) => ({
    checkRef: check.checkRef,
    semanticState: 'PASSED',
    transportState: 'EXECUTED',
    executed: true,
    currentness: 'CURRENT',
    detailRef: check.command
  }));
  const receipt = {
    schemaVersion: 'vexlife.pr-ready-receipt/v1',
    state: 'PR_READY_PASSED',
    headSha: repository.git.candidateHeadSha,
    candidateHeadSha: repository.git.candidateHeadSha,
    testedCheckoutSha: repository.git.checkoutSha,
    testedMergeSha: repository.git.testedMergeSha,
    baseSha: repository.git.baseSha,
    sourceTreeSha256: source.treeSha256,
    blueprintHash: validation.semanticHash,
    checkResultContractRef: bundle.buildHealth.checkResultContract.contractRef,
    sourceStability: { state: 'PASS' },
    schedulerSimulation: {
      receiptPath: bundle.schedulerRegistry.simulationContract.receiptPath,
      state: 'EXECUTED_CURRENT',
      receiptRef: simulation.receiptRef,
      contractRef: simulation.contractRef,
      semanticFingerprint: simulation.semanticFingerprint,
      sourceTreeSha256: simulation.sourceTreeSha256,
      blueprintHash: simulation.blueprintHash,
      schedulerRegistryHash: simulation.schedulerRegistryHash,
      journeyStates: simulation.journeyStates,
      finalHealthState: simulation.finalProjection.health.state,
      orphanedPendingToolCalls: simulation.orphanedPendingToolCalls,
      externalEffectsExecuted: simulation.externalEffectsExecuted,
      selfCertifiedRuntimeEvidence: simulation.selfCertifiedRuntimeEvidence,
      errors: []
    },
    continuitySimulation: {
      receiptPath: bundle.evolution.simulationContract.receiptPath,
      state: 'EXECUTED_CURRENT',
      receiptRef: continuity.receiptRef,
      contractRef: continuity.contractRef,
      semanticFingerprint: continuity.semanticFingerprint,
      candidateHeadSha: continuity.candidateHeadSha,
      testedCheckoutSha: continuity.testedCheckoutSha,
      testedMergeSha: continuity.testedMergeSha,
      baseSha: continuity.baseSha,
      sourceTreeSha256: continuity.sourceTreeSha256,
      blueprintHash: continuity.blueprintHash,
      evolutionRegistryHash: continuity.evolutionRegistryHash,
      journeyStates: continuity.journeyStates,
      continuityGateBindings: continuity.continuityGateBindings,
      canonicalWorkNodeRef: continuity.canonicalWorkNodeRef,
      canonicalWorkNodeFinalState: continuity.canonicalWorkNodeFinalState,
      schedulerContextLeaseFingerprint: continuity.schedulerContextLeaseFingerprint,
      schedulerCompletionVerificationFingerprint: continuity.schedulerCompletionVerificationFingerprint,
      schedulerCompletionEvidenceLineageFingerprint: continuity.schedulerCompletionEvidenceLineageFingerprint,
      schedulerWorkgraphTransitionFingerprint: continuity.schedulerWorkgraphTransitionFingerprint,
      schedulerCompletionFingerprint: continuity.schedulerCompletionFingerprint,
      externalEffectsExecuted: continuity.externalEffectsExecuted,
      modelWeightsChanged: continuity.modelWeightsChanged,
      errors: []
    },
    checkResults
  };
  try {
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    const current = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', receiptArg], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(current.status, 0, current.stderr);
    assert.equal(JSON.parse(current.stdout).receiptState, 'EXECUTED_CURRENT');
    assert.equal(JSON.parse(current.stdout).state, 'HEALTHY');

    fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, candidateHeadSha: '0'.repeat(40) }));
    const stale = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', receiptArg], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(stale.status, 1);
    assert.equal(JSON.parse(stale.stdout).receiptState, 'STALE');
    assert.equal(JSON.parse(stale.stdout).state, 'ATTENTION');
    assert.ok(JSON.parse(stale.stdout).unresolvedCheckRefs.length > 0);

    fs.writeFileSync(receiptPath, JSON.stringify({
      ...receipt,
      schedulerSimulation: { ...receipt.schedulerSimulation, semanticFingerprint: '0'.repeat(64) }
    }));
    const unbound = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', receiptArg], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(unbound.status, 1);
    assert.equal(JSON.parse(unbound.stdout).receiptState, 'INVALID');
    assert.match(JSON.parse(unbound.stdout).errors.join('\n'), /does not exactly bind/);

    fs.writeFileSync(receiptPath, JSON.stringify({
      ...receipt,
      continuitySimulation: { ...receipt.continuitySimulation, semanticFingerprint: '0'.repeat(64) }
    }));
    const continuityUnbound = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', receiptArg], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(continuityUnbound.status, 1);
    assert.equal(JSON.parse(continuityUnbound.stdout).receiptState, 'INVALID');
    assert.match(JSON.parse(continuityUnbound.stdout).errors.join('\n'), /continuity evolution simulation receipt/);

    fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, checkResults: checkResults.slice(1) }));
    const incomplete = spawnSync(process.execPath, ['scripts/health-check.mjs', '--receipt', receiptArg], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(incomplete.status, 1);
    assert.equal(JSON.parse(incomplete.stdout).receiptState, 'INVALID');
    assert.match(JSON.parse(incomplete.stdout).errors.join('\n'), /check coverage/);
  } finally {
    fs.rmSync(receiptPath, { force: true });
  }
});

test('effectful receipt CLI arguments fail closed outside generated/health', () => {
  for (const [script, unsafe] of [
    ['scripts/scheduler-simulate.mjs', '../scheduler-proof.json'],
    ['scripts/pr-ready.mjs', 'artifacts/pr-ready.json'],
    ['scripts/health-check.mjs', path.resolve(ROOT, 'generated/health/absolute.json')]
  ]) {
    const result = spawnSync(process.execPath, [script, '--receipt', unsafe], { cwd: ROOT, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}\n${result.stdout}`, /safe relative path|under generated\/health/);
  }
});

test('compact current projection exposes foundation status without dumping full registries', () => {
  const validation = validateBlueprint(bundle);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const current = compactCurrentProjection(bundle, validation);
  assert.equal(current.blueprintState, 'VALID');
  assert.equal(current.bridgeState, 'CONTRACT_REGISTERED');
  assert.equal(current.features, bundle.featureRegistry.features.length);
  assert.equal('screens' in current, false);
});

// [VXG RealForever]
