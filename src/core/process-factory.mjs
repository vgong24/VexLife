import { semanticHash } from './utils.mjs';

function clone(value) {
  return structuredClone(value);
}

function canonicalRefs(values = []) {
  if (!Array.isArray(values)) throw new Error('dependency refs must be an array');
  if (values.some((value) => typeof value !== 'string' || !value)) {
    throw new Error('dependency refs must contain only non-empty strings');
  }
  return [...new Set(values)].sort();
}

function normalizeStep(step, index, priorRef = null) {
  if (typeof step === 'string') {
    return {
      nodeRef: `step.${String(index + 1).padStart(3, '0')}`,
      functionRef: step,
      capabilityRef: null,
      arguments: {},
      dependencyRefs: priorRef ? [priorRef] : [],
      effectClass: 'SERIAL_PROCESS_STEP',
      parallelClass: 'SERIAL',
      sourceRefs: []
    };
  }
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    throw new Error(`process step ${index} must be a string or object`);
  }
  const nodeRef = step.nodeRef ?? step.stepRef ?? `step.${String(index + 1).padStart(3, '0')}`;
  if (typeof nodeRef !== 'string' || !nodeRef) throw new Error(`process step ${index} missing nodeRef`);
  const explicitDependencies = Object.hasOwn(step, 'dependencyRefs');
  return {
    nodeRef,
    functionRef: step.functionRef ?? step.operationRef ?? step.capabilityRef ?? nodeRef,
    capabilityRef: step.capabilityRef ?? null,
    arguments: clone(step.arguments ?? {}),
    dependencyRefs: canonicalRefs(explicitDependencies
      ? step.dependencyRefs
      : priorRef ? [priorRef] : []),
    effectClass: step.effectClass ?? 'SERIAL_PROCESS_STEP',
    parallelClass: step.parallelClass ??
      (step.effectClass === 'READ_ONLY' ? 'INDEPENDENT_READ_ONLY' : 'SERIAL'),
    sourceRefs: canonicalRefs(step.sourceRefs),
    metadata: clone(step.metadata ?? {})
  };
}

export function compileDependencyDag(steps = []) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('dependency DAG requires at least one process step');
  }
  const nodes = [];
  for (const [index, step] of steps.entries()) {
    nodes.push(normalizeStep(step, index, nodes.at(-1)?.nodeRef ?? null));
  }
  const byRef = new Map();
  for (const node of nodes) {
    if (byRef.has(node.nodeRef)) throw new Error(`dependency DAG duplicate nodeRef ${node.nodeRef}`);
    byRef.set(node.nodeRef, node);
  }
  for (const node of nodes) {
    if (node.dependencyRefs.includes(node.nodeRef)) {
      throw new Error(`dependency DAG node ${node.nodeRef} depends on itself`);
    }
    for (const dependencyRef of node.dependencyRefs) {
      if (!byRef.has(dependencyRef)) {
        throw new Error(`dependency DAG node ${node.nodeRef} references missing dependency ${dependencyRef}`);
      }
    }
  }

  const indegree = new Map(nodes.map((node) => [node.nodeRef, node.dependencyRefs.length]));
  const dependents = new Map(nodes.map((node) => [node.nodeRef, []]));
  for (const node of nodes) {
    for (const dependencyRef of node.dependencyRefs) dependents.get(dependencyRef).push(node.nodeRef);
  }
  for (const refs of dependents.values()) refs.sort();
  const ready = nodes.filter((node) => indegree.get(node.nodeRef) === 0)
    .map((node) => node.nodeRef).sort();
  const topologicalOrder = [];
  while (ready.length) {
    const nodeRef = ready.shift();
    topologicalOrder.push(nodeRef);
    for (const dependentRef of dependents.get(nodeRef)) {
      indegree.set(dependentRef, indegree.get(dependentRef) - 1);
      if (indegree.get(dependentRef) === 0) {
        ready.push(dependentRef);
        ready.sort();
      }
    }
  }
  if (topologicalOrder.length !== nodes.length) throw new Error('dependency DAG contains a cycle');

  const graphCore = {
    schemaVersion: 'vexlife.compiled-process-dependency-dag/v1',
    nodes: nodes.map((node) => clone(node)),
    topologicalOrder,
    externalEffectsExecuted: false
  };
  return Object.freeze({
    ...graphCore,
    graphHash: semanticHash(graphCore)
  });
}

export class ProcessFactory {
  constructor(definition) {
    this.definition = structuredClone(definition);
    this.foundations = new Map((definition.foundations ?? []).map((item) => [item.foundationRef, item]));
    this.processes = new Map((definition.processes ?? []).map((item) => [item.processRef, item]));
    this.templates = new Map((definition.templates ?? []).map((item) => [item.templateRef, item]));
  }

  requireProcess(processRef) {
    const process = this.processes.get(processRef);
    if (!process) throw new Error(`missing process ${processRef}`);
    return process;
  }

  compile({
    processRef,
    inputs = {},
    sourceRefs = {},
    currentFoundationVersions = {},
    authority = {},
    resourceBudget = {},
    recipientRef = null,
    now = new Date().toISOString()
  }) {
    const process = this.requireProcess(processRef);
    const missingInputs = (process.requiredInputs ?? []).filter((name) =>
      inputs[name] === undefined || inputs[name] === null || inputs[name] === '');
    if (missingInputs.length) return { state: 'BLOCKED_MISSING_INPUT', processRef, missingInputs };

    const staleFoundations = [];
    const foundations = [];
    for (const ref of process.foundationDependencies ?? []) {
      const foundation = this.foundations.get(ref);
      if (!foundation) throw new Error(`${processRef} references missing foundation ${ref}`);
      foundations.push({ foundationRef: ref, foundationVersion: foundation.foundationVersion });
      const observed = currentFoundationVersions[ref];
      if (observed !== undefined && observed !== foundation.foundationVersion) {
        staleFoundations.push({
          foundationRef: ref,
          expected: foundation.foundationVersion,
          observed
        });
      }
    }
    if (staleFoundations.length) return { state: 'BLOCKED_STALE_FOUNDATION', processRef, staleFoundations };

    const requestedEffects = new Set(process.authorityEnvelope?.effects ?? []);
    const grantedEffects = new Set(authority.effects ?? []);
    const deniedEffects = [...requestedEffects].filter((effect) => !grantedEffects.has(effect));
    if (deniedEffects.length) return { state: 'BLOCKED_AUTHORITY', processRef, deniedEffects };

    const requiredTokens = Number(resourceBudget.requiredTokens ?? 0);
    const availableTokens = Number(resourceBudget.availableTokens ?? Number.POSITIVE_INFINITY);
    if (requiredTokens > availableTokens) {
      return {
        state: 'BLOCKED_RESOURCE_BUDGET',
        processRef,
        requiredTokens,
        availableTokens
      };
    }

    let dependencyDag;
    try {
      dependencyDag = compileDependencyDag(process.steps ?? []);
    } catch (error) {
      return {
        state: 'BLOCKED_INVALID_DEPENDENCY_DAG',
        processRef,
        reason: error.message
      };
    }

    const planCore = {
      schemaVersion: 'vexlife.compiled-process-plan/v1',
      processRef,
      processVersion: process.processVersion,
      purpose: process.purpose,
      inputs: clone(inputs),
      sourceRefs: clone(sourceRefs),
      foundationRefs: foundations,
      steps: clone(process.steps ?? []),
      dependencyDag,
      effectOwnerRule: process.effectOwnerRule,
      authorityEnvelope: clone(process.authorityEnvelope),
      outputTemplateRefs: [...(process.outputTemplateRefs ?? [])],
      returnRouteRule: process.returnRouteRule,
      closureRule: process.closureRule,
      recoveryRule: process.recoveryRule,
      recipientRef,
      formedAt: now,
      externalEffectsExecuted: false
    };
    return {
      state: 'PLAN_READY_NO_EFFECT',
      plan: {
        ...planCore,
        planHash: semanticHash(planCore)
      }
    };
  }

  renderReceipt(plan, {
    disposition,
    outputRefs = [],
    effectReceiptRefs = [],
    now = new Date().toISOString()
  }) {
    const receipt = {
      schemaVersion: 'vexlife.process-render-receipt/v1',
      processRef: plan.processRef,
      processVersion: plan.processVersion,
      dependencyGraphHash: plan.dependencyDag?.graphHash ?? null,
      foundationRefs: plan.foundationRefs,
      inputSourceRefs: Object.values(plan.sourceRefs ?? {}),
      resolvedBindings: plan.inputs,
      outputTemplateRefs: plan.outputTemplateRefs,
      outputRefs: [...outputRefs],
      effectReceiptRefs: [...effectReceiptRefs],
      disposition,
      recipientRef: plan.recipientRef,
      formedAt: now,
      planHash: plan.planHash
    };
    return {
      ...receipt,
      outputHash: semanticHash(receipt)
    };
  }
}

export function validateProcessFactory(definition) {
  const errors = [];
  const foundations = new Set();
  const processes = new Set();
  const templates = new Set();
  for (const foundation of definition.foundations ?? []) {
    if (!foundation.foundationRef) errors.push('foundation missing ref');
    if (foundations.has(foundation.foundationRef)) errors.push(`duplicate foundation ${foundation.foundationRef}`);
    foundations.add(foundation.foundationRef);
  }
  for (const template of definition.templates ?? []) {
    if (!template.templateRef) errors.push('template missing ref');
    if (templates.has(template.templateRef)) errors.push(`duplicate template ${template.templateRef}`);
    templates.add(template.templateRef);
  }
  for (const process of definition.processes ?? []) {
    if (!process.processRef) errors.push('process missing ref');
    if (processes.has(process.processRef)) errors.push(`duplicate process ${process.processRef}`);
    processes.add(process.processRef);
    for (const ref of process.foundationDependencies ?? []) {
      if (!foundations.has(ref)) errors.push(`${process.processRef} missing foundation ${ref}`);
    }
    for (const ref of process.outputTemplateRefs ?? []) {
      if (!templates.has(ref)) errors.push(`${process.processRef} missing template ${ref}`);
    }
    if (!(process.requiredInputs ?? []).length) errors.push(`${process.processRef} must declare required inputs`);
    if (!(process.steps ?? []).length) errors.push(`${process.processRef} must declare steps`);
    if ((process.steps ?? []).length) {
      try {
        compileDependencyDag(process.steps);
      } catch (error) {
        errors.push(`${process.processRef} invalid dependency DAG: ${error.message}`);
      }
    }
  }
  for (const example of definition.workedExamples ?? []) {
    if (!processes.has(example.formedFromProcessRef)) {
      errors.push(`${example.exampleRef} missing process ${example.formedFromProcessRef}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    stats: {
      foundations: foundations.size,
      processes: processes.size,
      templates: templates.size,
      examples: (definition.workedExamples ?? []).length
    }
  };
}

// [VXG RealForever]
