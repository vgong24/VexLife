import { semanticHash } from './utils.mjs';

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

  compile({ processRef, inputs = {}, sourceRefs = {}, currentFoundationVersions = {}, authority = {}, resourceBudget = {}, recipientRef = null, now = new Date().toISOString() }) {
    const process = this.requireProcess(processRef);
    const missingInputs = (process.requiredInputs ?? []).filter((name) => inputs[name] === undefined || inputs[name] === null || inputs[name] === '');
    if (missingInputs.length) return { state: 'BLOCKED_MISSING_INPUT', processRef, missingInputs };

    const staleFoundations = [];
    const foundations = [];
    for (const ref of process.foundationDependencies ?? []) {
      const foundation = this.foundations.get(ref);
      if (!foundation) throw new Error(`${processRef} references missing foundation ${ref}`);
      foundations.push({ foundationRef: ref, foundationVersion: foundation.foundationVersion });
      const observed = currentFoundationVersions[ref];
      if (observed !== undefined && observed !== foundation.foundationVersion) staleFoundations.push({ foundationRef: ref, expected: foundation.foundationVersion, observed });
    }
    if (staleFoundations.length) return { state: 'BLOCKED_STALE_FOUNDATION', processRef, staleFoundations };

    const requestedEffects = new Set(process.authorityEnvelope?.effects ?? []);
    const grantedEffects = new Set(authority.effects ?? []);
    const deniedEffects = [...requestedEffects].filter((effect) => !grantedEffects.has(effect));
    if (deniedEffects.length) return { state: 'BLOCKED_AUTHORITY', processRef, deniedEffects };

    const requiredTokens = Number(resourceBudget.requiredTokens ?? 0);
    const availableTokens = Number(resourceBudget.availableTokens ?? Number.POSITIVE_INFINITY);
    if (requiredTokens > availableTokens) return { state: 'BLOCKED_RESOURCE_BUDGET', processRef, requiredTokens, availableTokens };

    const planCore = {
      schemaVersion: 'vexlife.compiled-process-plan/v0', processRef, processVersion: process.processVersion,
      purpose: process.purpose, inputs: structuredClone(inputs), sourceRefs: structuredClone(sourceRefs),
      foundationRefs: foundations, steps: [...(process.steps ?? [])], effectOwnerRule: process.effectOwnerRule,
      authorityEnvelope: structuredClone(process.authorityEnvelope), outputTemplateRefs: [...(process.outputTemplateRefs ?? [])],
      returnRouteRule: process.returnRouteRule, closureRule: process.closureRule, recoveryRule: process.recoveryRule,
      recipientRef, formedAt: now
    };
    return { state: 'PLAN_READY_NO_EFFECT', plan: { ...planCore, planHash: semanticHash(planCore) } };
  }

  renderReceipt(plan, { disposition, outputRefs = [], effectReceiptRefs = [], now = new Date().toISOString() }) {
    const receipt = {
      schemaVersion: 'vexlife.process-render-receipt/v0', processRef: plan.processRef, processVersion: plan.processVersion,
      foundationRefs: plan.foundationRefs, inputSourceRefs: Object.values(plan.sourceRefs ?? {}), resolvedBindings: plan.inputs,
      outputTemplateRefs: plan.outputTemplateRefs, outputRefs: [...outputRefs], effectReceiptRefs: [...effectReceiptRefs],
      disposition, recipientRef: plan.recipientRef, formedAt: now, planHash: plan.planHash
    };
    return { ...receipt, outputHash: semanticHash(receipt) };
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
    for (const ref of process.foundationDependencies ?? []) if (!foundations.has(ref)) errors.push(`${process.processRef} missing foundation ${ref}`);
    for (const ref of process.outputTemplateRefs ?? []) if (!templates.has(ref)) errors.push(`${process.processRef} missing template ${ref}`);
    if (!(process.requiredInputs ?? []).length) errors.push(`${process.processRef} must declare required inputs`);
    if (!(process.steps ?? []).length) errors.push(`${process.processRef} must declare steps`);
  }
  for (const example of definition.workedExamples ?? []) if (!processes.has(example.formedFromProcessRef)) errors.push(`${example.exampleRef} missing process ${example.formedFromProcessRef}`);
  return { ok: errors.length === 0, errors, stats: { foundations: foundations.size, processes: processes.size, templates: templates.size, examples: (definition.workedExamples ?? []).length } };
}

// [VXG RealForever]
