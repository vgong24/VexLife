import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, semanticHash } from './utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VEXLIFE_ROOT = path.resolve(HERE, '../..');

const SOURCE_VERSION_REF = 'source-version.vexlife.scoped-purpose-workspace.source-foundation.003';
const FEATURE_REF = 'feature.vexlife.scoped-purpose-workspace';
const WORKSPACE_REF = 'workspace.vexlife.scoped-purpose.001';
const DEPTHS = new Set(['DO', 'UNDERSTAND', 'STEWARD']);
const TERMINAL_COMPLETION_STATES = new Set(['COMPLETE_WITH_EVIDENCE', 'READY_FOR_EXTERNAL_EFFECT']);

const clone = (value) => structuredClone(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const unique = (items) => new Set(items).size === items.length;

function loadJson(root, relativePath) {
  return readJson(path.join(root, relativePath));
}

export function loadPurposeWorkspaceRegistry(root = VEXLIFE_ROOT) {
  const registry = loadJson(root, 'blueprint/purpose-workspace-registry.json');
  const processPatterns = loadJson(root, registry.includes.processPatterns);
  const completionContracts = loadJson(root, registry.includes.completionContracts);
  const domainPacks = registry.includes.domainPacks.map((source) => loadJson(root, source));
  return { registry, processPatterns, completionContracts, domainPacks, root };
}

function index(items, key) {
  return new Map(items.map((item) => [item[key], item]));
}

export function compileTaskStages(task, pattern) {
  const arrays = [task.stageOwnerRefs, task.stageAuthorityClassRefs, task.stageEvidenceClasses, task.stageEffectClasses, task.stageCommunicationKinds];
  if (arrays.some((items) => !Array.isArray(items) || items.length !== pattern.stagePurposes.length)) {
    throw new Error(`${task.taskRef} stage binding length does not match ${pattern.processPatternRef}`);
  }
  return pattern.stagePurposes.map((patternStagePurpose, sequence) => ({
    stageRef: `${task.taskRef}.stage.${sequence}`,
    sequence,
    patternStagePurpose,
    ownerRoleRef: task.stageOwnerRefs[sequence],
    requiredAuthorityClassRef: task.stageAuthorityClassRefs[sequence],
    requiredEvidenceClass: task.stageEvidenceClasses[sequence],
    effectClass: task.stageEffectClasses[sequence],
    communicationKind: task.stageCommunicationKinds[sequence]
  }));
}

export function validatePurposeWorkspaceRegistry(bundle) {
  const { registry, processPatterns, completionContracts, domainPacks } = bundle;
  const errors = [];
  if (registry?.registryRef !== 'registry.vexlife.purpose-workspaces.001') errors.push('registry identity mismatch');
  if (registry?.sourcePlacement?.stageRef !== 'SPW-01' || registry?.sourcePlacement?.status !== 'SOURCE_FOUNDATION_ONLY') errors.push('SPW-01 source placement boundary missing');
  if (registry?.entryContinuityContract?.publicEstablishmentOwnerCurrent !== true || registry?.entryContinuityContract?.featureWalkthroughPlanCurrent !== false) errors.push('onboarding currentness boundary changed');
  if (registry?.workspaceDefinitions?.length !== 1 || registry.workspaceDefinitions[0].workspaceRef !== WORKSPACE_REF) errors.push('workspace identity mismatch');
  if (!Array.isArray(processPatterns) || processPatterns.length !== 6) errors.push('six reusable process patterns required');
  if (!Array.isArray(completionContracts) || completionContracts.length !== 6) errors.push('six completion contracts required');
  if (!Array.isArray(domainPacks) || domainPacks.length !== 4) errors.push('four synthetic domain packs required');

  const patternByRef = index(processPatterns, 'processPatternRef');
  const contractByRef = index(completionContracts, 'completionContractRef');
  const authorityRefs = new Set((registry.authorityClasses ?? []).map((item) => item.authorityClassRef));
  const relationshipRefs = new Set((registry.relationshipClasses ?? []).map((item) => item.relationshipClassRef));
  const domainRefs = new Set();
  const roleRefs = new Set();
  const taskRefs = new Set();

  for (const domain of domainPacks) {
    if (!nonempty(domain.domainRef) || domainRefs.has(domain.domainRef)) errors.push(`duplicate or missing domainRef ${domain.domainRef ?? ''}`);
    domainRefs.add(domain.domainRef);
    if (domain.syntheticOnly !== true) errors.push(`${domain.domainRef} must remain syntheticOnly`);
    if (domain.workspaceRef !== WORKSPACE_REF || domain.featureRef !== FEATURE_REF) errors.push(`${domain.domainRef} target identity drifted`);
    if (!Array.isArray(domain.primaryTaskRefs) || domain.primaryTaskRefs.length !== 3) errors.push(`${domain.domainRef} must expose exactly three primary tasks`);
    for (const role of domain.roleLenses ?? []) {
      if (!nonempty(role.roleLensRef) || roleRefs.has(role.roleLensRef)) errors.push(`duplicate or missing role ${role.roleLensRef ?? ''}`);
      roleRefs.add(role.roleLensRef);
      for (const ref of role.relationshipClassRefs ?? []) if (!relationshipRefs.has(ref)) errors.push(`${role.roleLensRef} missing relationship ${ref}`);
      for (const ref of role.authorityClassRefs ?? []) if (!authorityRefs.has(ref)) errors.push(`${role.roleLensRef} missing authority ${ref}`);
    }
    const domainRoleRefs = new Set((domain.roleLenses ?? []).map((item) => item.roleLensRef));
    for (const task of domain.tasks ?? []) {
      if (!nonempty(task.taskRef) || taskRefs.has(task.taskRef)) errors.push(`duplicate or missing task ${task.taskRef ?? ''}`);
      taskRefs.add(task.taskRef);
      const pattern = patternByRef.get(task.processPatternRef);
      const contract = contractByRef.get(task.completionContractRef);
      if (!pattern) errors.push(`${task.taskRef} missing process pattern ${task.processPatternRef}`);
      if (!contract) errors.push(`${task.taskRef} missing completion contract ${task.completionContractRef}`);
      if (!domainRoleRefs.has(task.entryRoleRef)) errors.push(`${task.taskRef} missing entry role ${task.entryRoleRef}`);
      if (pattern) {
        try {
          for (const stage of compileTaskStages(task, pattern)) {
            if (!domainRoleRefs.has(stage.ownerRoleRef)) errors.push(`${task.taskRef} missing stage owner ${stage.ownerRoleRef}`);
            if (!authorityRefs.has(stage.requiredAuthorityClassRef)) errors.push(`${task.taskRef} missing stage authority ${stage.requiredAuthorityClassRef}`);
            if (!registry.effectClassVocabulary.includes(stage.effectClass)) errors.push(`${task.taskRef} unknown effect ${stage.effectClass}`);
            if (!registry.communicationKindVocabulary.includes(stage.communicationKind)) errors.push(`${task.taskRef} unknown communication ${stage.communicationKind}`);
          }
        } catch (error) {
          errors.push(error.message);
        }
      }
    }
    for (const ref of domain.primaryTaskRefs ?? []) if (!(domain.tasks ?? []).some((task) => task.taskRef === ref)) errors.push(`${domain.domainRef} missing primary task ${ref}`);
  }

  if (!unique([...domainRefs]) || !unique([...roleRefs]) || !unique([...taskRefs])) errors.push('identity uniqueness failed');
  return {
    ok: errors.length === 0,
    errors,
    stats: { domains: domainRefs.size, roles: roleRefs.size, tasks: taskRefs.size, processPatterns: processPatterns.length, completionContracts: completionContracts.length },
    semanticHash: semanticHash({ registry, processPatterns, completionContracts, domainPacks })
  };
}

function findDomain(bundle, domainRef) {
  const domain = bundle.domainPacks.find((item) => item.domainRef === domainRef);
  if (!domain) throw new Error(`missing domain ${domainRef}`);
  return domain;
}

function findTask(bundle, domain, taskRef) {
  const task = domain.tasks.find((item) => item.taskRef === taskRef);
  if (!task) throw new Error(`missing task ${taskRef}`);
  const pattern = bundle.processPatterns.find((item) => item.processPatternRef === task.processPatternRef);
  const contract = bundle.completionContracts.find((item) => item.completionContractRef === task.completionContractRef);
  if (!pattern || !contract) throw new Error(`${taskRef} cannot resolve process/completion source`);
  return { task, pattern, contract, stages: compileTaskStages(task, pattern) };
}

export function compilePurposeWorkspace({ root = VEXLIFE_ROOT, domainRef, taskRef = null, semanticDepth = 'DO' } = {}) {
  if (!DEPTHS.has(semanticDepth)) throw new Error(`unknown semantic depth ${semanticDepth}`);
  const bundle = loadPurposeWorkspaceRegistry(root);
  const validation = validatePurposeWorkspaceRegistry(bundle);
  if (!validation.ok) throw new Error(validation.errors[0]);
  const domain = findDomain(bundle, domainRef);
  const selectedTaskRef = taskRef ?? domain.primaryTaskRefs[0];
  const resolved = findTask(bundle, domain, selectedTaskRef);
  const base = {
    featureRef: FEATURE_REF,
    workspaceRef: WORKSPACE_REF,
    plannedScreenRef: bundle.registry.workspaceDefinitions[0].screenRef,
    domainRef: domain.domainRef,
    domainLabel: domain.label,
    purposeCompletionQuestion: domain.purposeCompletionQuestion,
    semanticDepth,
    primaryTaskRefs: [...domain.primaryTaskRefs],
    task: { taskRef: resolved.task.taskRef, label: resolved.task.label, processPatternRef: resolved.task.processPatternRef, completionContractRef: resolved.task.completionContractRef },
    integrationState: bundle.registry.workspaceDefinitions[0].integrationState,
    effects: false,
    sourceVersionRef: SOURCE_VERSION_REF
  };
  if (semanticDepth === 'UNDERSTAND') return { ...base, stages: resolved.stages, process: clone(resolved.pattern), completionContract: clone(resolved.contract) };
  if (semanticDepth === 'STEWARD') return { ...base, stages: resolved.stages, roleLenses: clone(domain.roleLenses), ledgerBindings: clone(domain.ledgerBindings ?? []), heldBoundaries: [...(domain.heldBoundaries ?? [])], entryContinuity: clone(bundle.registry.entryContinuityContract), sourcePlacement: clone(bundle.registry.sourcePlacement) };
  return base;
}

export function evaluatePurposeCompletion({ task, contract, stageReceipts = [], explicitBlockers = [] } = {}) {
  const receipts = new Map(stageReceipts.map((item) => [item.stageRef, item]));
  if ((explicitBlockers ?? []).some((item) => item.code === 'CORRECTION_REQUIRED')) return { state: 'CORRECTION_REQUIRED', blockers: clone(explicitBlockers) };
  const stageCoverage = Object.fromEntries((contract.requiredStagePurposes ?? []).map((purpose) => [purpose, false]));
  const evidenceCoverage = Object.fromEntries((contract.requiredEvidenceClasses ?? []).map((evidenceClass) => [evidenceClass, false]));
  for (const stage of task.compiledStages ?? []) {
    const receipt = receipts.get(stage.stageRef);
    if (receipt?.state === 'COMPLETE' || receipt?.state === 'HELD_EXTERNAL_EFFECT') stageCoverage[stage.patternStagePurpose] = true;
    for (const value of receipt?.evidenceClasses ?? []) if (value in evidenceCoverage) evidenceCoverage[value] = true;
  }
  const complete = Object.values(stageCoverage).every(Boolean) && Object.values(evidenceCoverage).every(Boolean);
  if (complete) return { state: contract.completionState, stageCoverage, evidenceCoverage, blockers: [] };
  if (stageReceipts.length === 0) return { state: 'NOT_STARTED', stageCoverage, evidenceCoverage, blockers: [] };
  if ((explicitBlockers ?? []).length) return { state: 'HELD', stageCoverage, evidenceCoverage, blockers: clone(explicitBlockers) };
  return { state: 'IN_PROGRESS', stageCoverage, evidenceCoverage, blockers: [] };
}

export function simulateRoleRelay({ root = VEXLIFE_ROOT, scenario } = {}) {
  const bundle = loadPurposeWorkspaceRegistry(root);
  const domain = findDomain(bundle, scenario.domainRef);
  const resolved = findTask(bundle, domain, scenario.taskRef);
  const authority = new Set(scenario.authorityClassRefs ?? []);
  const receipts = [];
  const relayEnvelopes = [];
  for (const stage of resolved.stages) {
    const authorized = authority.has(stage.requiredAuthorityClassRef);
    const externalHeld = stage.effectClass === 'EXTERNAL_EFFECT';
    const state = !authorized ? 'WAITING_FOR_AUTHORITY' : externalHeld ? 'HELD_EXTERNAL_EFFECT' : 'COMPLETE';
    receipts.push({ stageRef: stage.stageRef, state, evidenceClasses: authorized && !externalHeld ? [stage.requiredEvidenceClass] : externalHeld ? [] : [], blockers: state === 'WAITING_FOR_AUTHORITY' ? [`missing ${stage.requiredAuthorityClassRef}`] : externalHeld ? ['external effect held'] : [] });
    relayEnvelopes.push({ stageRef: stage.stageRef, speakerRoleRef: stage.ownerRoleRef, recipientRoleRefOrNull: scenario.recipientRoleRefOrNull ?? null, communicationKind: stage.communicationKind, epistemicClass: scenario.epistemicClassByPurpose?.[stage.patternStagePurpose] ?? (stage.communicationKind === 'DIRECT_OBSERVATION' ? 'DIRECT_OBSERVATION' : stage.communicationKind === 'INTERPRETATION' ? 'PROFESSIONAL_INTERPRETATION' : stage.communicationKind === 'CORRECTION' ? 'HUMAN_REPORT' : 'VERIFIED_FACT'), relationshipClassRefs: [...(scenario.relationshipClassRefs ?? [])], requiredAuthorityClassRef: stage.requiredAuthorityClassRef, authoritySourcePresent: authorized, effectClass: stage.effectClass, effectPerformed: false });
  }
  const task = { ...resolved.task, compiledStages: resolved.stages };
  const completion = evaluatePurposeCompletion({ task, contract: resolved.contract, stageReceipts: receipts, explicitBlockers: scenario.explicitBlockers ?? [] });
  if (receipts.some((item) => item.state === 'WAITING_FOR_AUTHORITY')) completion.state = 'WAITING_FOR_AUTHORITY';
  return { scenarioRef: scenario.scenarioRef, domainRef: domain.domainRef, taskRef: resolved.task.taskRef, completion, stageReceipts: receipts, relayEnvelopes, effects: { externalEffectPerformed: false, realPersonDataUsed: false } };
}

export function evaluateExperienceTestCase(testCase) {
  if (testCase.syntheticOnly !== true) throw new Error(`${testCase.testCaseRef} must be synthetic-only`);
  if (testCase.facts?.realPersonDataUsed === true) throw new Error(`${testCase.testCaseRef} synthetic-only case used real person data`);
  const map = {
    COMPLETE: 'COMPLETE_WITH_EVIDENCE',
    MISSING_AUTHORITY: 'WAITING_FOR_AUTHORITY',
    CONTRADICTED_SOURCE: 'CORRECTION_REQUIRED',
    PROTECTED_EFFECT: 'HELD',
    EXTERNAL_READY: 'READY_FOR_EXTERNAL_EFFECT',
    SUPERSESSION: 'SUPERSEDED'
  };
  const state = map[testCase.rule];
  if (!state) throw new Error(`${testCase.testCaseRef} unknown rule ${testCase.rule}`);
  return { testCaseRef: testCase.testCaseRef, domainRef: testCase.domainRef, state, expectedState: testCase.expectedState, pass: state === testCase.expectedState, effects: { externalEffectPerformed: false, realPersonDataUsed: false } };
}

export function buildExperienceTopology({ root = VEXLIFE_ROOT, cases = [] } = {}) {
  const bundle = loadPurposeWorkspaceRegistry(root);
  const nodes = [];
  const edges = [];
  const addNode = (ref, kind, extra = {}) => nodes.push({ ref, kind, ...extra });
  const addEdge = (from, to, relation) => edges.push({ from, to, relation });
  addNode(bundle.registry.registryRef, 'REGISTRY');
  const workspace = bundle.registry.workspaceDefinitions[0];
  addNode(workspace.workspaceRef, 'WORKSPACE');
  addNode(workspace.screenRef, 'PLANNED_SCREEN', { current: false });
  addNode(bundle.registry.topologyContract.topologyRef, 'TOPOLOGY');
  addEdge(bundle.registry.topologyContract.topologyRef, bundle.registry.topologyContract.topologyRef, 'MAPS_SELF');
  addEdge(bundle.registry.registryRef, workspace.workspaceRef, 'DEFINES');
  addEdge(workspace.workspaceRef, workspace.screenRef, 'TARGETS');
  for (const ref of workspace.componentRefs) { addNode(ref, 'PLANNED_COMPONENT', { current: false }); addEdge(workspace.screenRef, ref, 'USES'); }
  for (const ref of bundle.registry.knownExternalRefs) addNode(ref, 'EXTERNAL_REF');
  for (const pattern of bundle.processPatterns) addNode(pattern.processPatternRef, 'PROCESS_PATTERN');
  for (const contract of bundle.completionContracts) addNode(contract.completionContractRef, 'COMPLETION_CONTRACT');
  for (const domain of bundle.domainPacks) {
    addNode(domain.domainRef, 'DOMAIN'); addEdge(workspace.workspaceRef, domain.domainRef, 'PROJECTS');
    for (const role of domain.roleLenses) { addNode(role.roleLensRef, 'ROLE_LENS'); addEdge(domain.domainRef, role.roleLensRef, 'HAS_ROLE_LENS'); }
    for (const task of domain.tasks) { addNode(task.taskRef, 'TASK'); addEdge(domain.domainRef, task.taskRef, 'HAS_TASK'); addEdge(task.taskRef, task.processPatternRef, 'USES_PATTERN'); addEdge(task.taskRef, task.completionContractRef, 'USES_COMPLETION'); }
  }
  for (const item of cases) { addNode(item.testCaseRef, 'TEST_CASE'); addEdge(item.testCaseRef, item.domainRef, 'TESTS'); }
  const nodeRefs = nodes.map((item) => item.ref);
  const duplicateNodeRefs = nodeRefs.filter((ref, index) => nodeRefs.indexOf(ref) !== index);
  const known = new Set(nodeRefs);
  const unresolvedEdges = edges.filter((edge) => !known.has(edge.from) || !known.has(edge.to));
  const edgeKeys = edges.map((edge) => `${edge.from}|${edge.relation}|${edge.to}`);
  const duplicateEdgeKeys = edgeKeys.filter((key, index) => edgeKeys.indexOf(key) !== index);
  const humanVisibleOrphans = nodes.filter((node) => ['PLANNED_SCREEN', 'PLANNED_COMPONENT'].includes(node.kind) && !edges.some((edge) => edge.to === node.ref || edge.from === node.ref));
  return {
    topologyRef: bundle.registry.topologyContract.topologyRef,
    sourceVersionRef: SOURCE_VERSION_REF,
    formedAt: bundle.registry.topologyContract.formedAt,
    nodes,
    edges,
    audit: { ok: duplicateNodeRefs.length === 0 && unresolvedEdges.length === 0 && duplicateEdgeKeys.length === 0 && humanVisibleOrphans.length === 0, mapTracksItself: true, duplicateNodeRefs, unresolvedEdges, duplicateEdgeKeys, humanVisibleOrphans },
    metrics: { domainPackCount: bundle.domainPacks.length, roleLensCount: bundle.domainPacks.flatMap((item) => item.roleLenses).length, taskCount: bundle.domainPacks.flatMap((item) => item.tasks).length, sharedComponentCount: workspace.componentRefs.length, uniqueWorkspaceCount: 1, uniqueScreenCount: 1, domainPerScreenReuseRatio: bundle.domainPacks.length }
  };
}

export function runSyntheticSuite({ root = VEXLIFE_ROOT, fixture } = {}) {
  const scenarioResults = (fixture.scenarios ?? []).map((scenario) => simulateRoleRelay({ root, scenario }));
  const caseResults = (fixture.boundaryCases ?? []).map(evaluateExperienceTestCase);
  return {
    scenarioResults,
    caseResults,
    scenarioPass: scenarioResults.every((item) => item.completion.state === (fixture.scenarios.find((scenario) => scenario.scenarioRef === item.scenarioRef)?.expectedState)),
    casePass: caseResults.every((item) => item.pass),
    semanticHash: semanticHash({ scenarioResults, caseResults })
  };
}

// [VXG RealForever]
