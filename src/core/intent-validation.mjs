import { semanticHash } from './utils.mjs';
import {
  buildAttributedProjectionFingerprint,
  buildGraphSnapshotFingerprint,
  buildIntentFingerprint,
  buildIntentTrustSnapshotFingerprint,
  buildIntentTrustSourceHash,
  buildReceiptFingerprint,
  buildTransitionFingerprint,
  buildWorkNodeFingerprint
} from './intent-workgraph.mjs';

const REQUIRED_PROCESS_REFS = [
  'process.vexlife.intent.capture',
  'process.vexlife.intent.decompose-candidate',
  'process.vexlife.intent.validate-workgraph',
  'process.vexlife.intent.project-ready-set',
  'process.vexlife.intent.verify-transition',
  'process.vexlife.intent.converge-parent'
];

function missingFields(value, fields) {
  return fields.filter((field) => {
    const item = value?.[field];
    return item === undefined || item === null || item === '';
  });
}

function uniqueRefs(items, field, label, errors) {
  const refs = new Set();
  for (const item of items) {
    const ref = item?.[field];
    if (!ref) errors.push(`${label} missing ${field}`);
    else if (refs.has(ref)) errors.push(`duplicate ${label} ref ${ref}`);
    else refs.add(ref);
  }
  return refs;
}

function uniqueValues(values, label, errors) {
  const seen = new Set();
  for (const value of values ?? []) {
    if (!value) errors.push(`${label} contains an empty value`);
    else if (seen.has(value)) errors.push(`duplicate ${label} ${value}`);
    else seen.add(value);
  }
  return seen;
}

function sameValues(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function validateStateRefCoverage(states, entries, label, errors) {
  const stateSet = uniqueValues(states, `${label} state`, errors);
  const entryStates = uniqueValues((entries ?? []).map((item) => item?.state), `${label} ref state`, errors);
  uniqueRefs(entries ?? [], 'ref', label, errors);
  if (!sameValues(stateSet, entryStates)) {
    errors.push(`${label} refs must exactly cover declared states`);
  }
  return stateSet;
}

function detectCycle(nodesByRef, edgeField) {
  const visiting = new Set();
  const visited = new Set();
  const route = [];
  function visit(ref) {
    if (visiting.has(ref)) return [...route.slice(route.indexOf(ref)), ref];
    if (visited.has(ref)) return null;
    visiting.add(ref);
    route.push(ref);
    for (const targetRef of nodesByRef.get(ref)?.[edgeField] ?? []) {
      if (!nodesByRef.has(targetRef)) continue;
      const cycle = visit(targetRef);
      if (cycle) return cycle;
    }
    route.pop();
    visiting.delete(ref);
    visited.add(ref);
    return null;
  }
  for (const ref of nodesByRef.keys()) {
    const cycle = visit(ref);
    if (cycle) return cycle;
  }
  return null;
}

function topologicalOrder(nodesByRef) {
  const indegree = new Map([...nodesByRef.keys()].map((ref) => [ref, 0]));
  const consumers = new Map([...nodesByRef.keys()].map((ref) => [ref, []]));
  for (const node of nodesByRef.values()) {
    for (const dependencyRef of node.dependencyRefs ?? []) {
      if (!nodesByRef.has(dependencyRef)) continue;
      indegree.set(node.workNodeRef, indegree.get(node.workNodeRef) + 1);
      consumers.get(dependencyRef).push(node.workNodeRef);
    }
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([ref]) => ref).sort();
  const order = [];
  while (queue.length) {
    const ref = queue.shift();
    order.push(ref);
    for (const consumer of consumers.get(ref)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        queue.push(consumer);
        queue.sort();
      }
    }
  }
  return order;
}

function isTransitionAllowed(registry, priorState, nextState) {
  return (registry?.allowedTransitions?.[priorState] ?? []).includes(nextState);
}

function exactCurrentReceipt(receipts, dependency, requirement) {
  const matches = receipts.filter((receipt) =>
    receipt.currentness === 'CURRENT' &&
    receipt.state === 'PROVEN' &&
    receipt.workNodeRef === dependency.workNodeRef &&
    receipt.expectedTransitionRef === requirement.expectedTransitionRef &&
    receipt.nodeSemanticFingerprint === dependency.semanticFingerprint &&
    receipt.sourceState === dependency.state &&
    receipt.disposition === dependency.state &&
    requirement.allowedDispositions.includes(receipt.disposition)
  );
  return matches.length === 1 ? matches[0] : null;
}

function requirementFor(node, dependencyRef) {
  return (node.dependencyRequirements ?? []).find((item) => item.dependencyWorkNodeRef === dependencyRef);
}

function validateProjectionCollection(
  items,
  contract,
  refField,
  label,
  graph,
  registry,
  registeredRoles,
  trustedActors,
  errors
) {
  uniqueRefs(items, refField, label, errors);
  for (const item of items) {
    for (const field of missingFields(item, contract?.requiredFields ?? [])) {
      errors.push(`${item?.[refField] ?? `unknown ${label}`} missing ${field}`);
    }
    if (item.sourceIntentRef !== graph.rootIntentRef) {
      errors.push(`${item?.[refField]} source intent mismatch`);
    }
    if (item.semanticFingerprint !== buildAttributedProjectionFingerprint(item)) {
      errors.push(`${item?.[refField]} has non-canonical semantic fingerprint`);
    }
    if (!(item.sourceRefs?.length)) errors.push(`${item?.[refField]} missing source refs`);
    if (!(registry.authorityDispositions ?? []).includes(item.authorityDisposition)) {
      errors.push(`${item?.[refField]} has invalid authority disposition ${item.authorityDisposition}`);
    }
    if (!(registry.effectDispositions ?? []).includes(item.effectDisposition)) {
      errors.push(`${item?.[refField]} has invalid effect disposition ${item.effectDisposition}`);
    }
    if (!registeredRoles.has(item.actorRoleRef)) {
      errors.push(`${item?.[refField]} references unresolved actor role ${item.actorRoleRef}`);
    }
    if (!trustedActors.has(item.actorRef)) {
      errors.push(`${item?.[refField]} references unresolved actor ${item.actorRef}`);
    }
  }
}

function validateAttributedProjections(
  graph,
  registry,
  registeredRoles,
  trustSnapshot,
  trustSnapshotValid,
  errors
) {
  const contracts = registry.attributedProjectionContracts ?? {};
  const trustedActors = trustSnapshotValid ? new Set(trustSnapshot.actorRefs ?? []) : new Set();
  validateProjectionCollection(
    graph.interpretations ?? [],
    contracts.interpretation,
    'interpretationRef',
    'interpretation',
    graph,
    registry,
    registeredRoles,
    trustedActors,
    errors
  );
  validateProjectionCollection(
    graph.proposedPlans ?? [],
    contracts.plan,
    'planRef',
    'plan',
    graph,
    registry,
    registeredRoles,
    trustedActors,
    errors
  );
  validateProjectionCollection(
    graph.authorizations ?? [],
    contracts.authorization,
    'authorizationRef',
    'authorization',
    graph,
    registry,
    registeredRoles,
    trustedActors,
    errors
  );
  for (const item of [...(graph.interpretations ?? []), ...(graph.proposedPlans ?? [])]) {
    if (item.authorityDisposition !== 'NO_AUTHORITY' || item.effectDisposition !== 'NO_EFFECTS') {
      errors.push(`${projectionIdentity(item)} must remain NO_AUTHORITY and NO_EFFECTS`);
    }
  }
  const trustedEffects = trustSnapshotValid
    ? new Set(trustSnapshot.bindingRefs?.effectEnvelopeRef ?? [])
    : new Set();
  const trustedDecisions = trustSnapshotValid ? new Set(trustSnapshot.decisionRefs ?? []) : new Set();
  const trustedAuthorizations = trustSnapshotValid ? trustSnapshot.authorizationBindings ?? [] : [];
  for (const authorization of graph.authorizations ?? []) {
    if (!trustedEffects.has(authorization.effectEnvelopeRef)) {
      errors.push(`${authorization.authorizationRef} references unresolved authorization effect ${authorization.effectEnvelopeRef}`);
    }
    if (!trustedDecisions.has(authorization.decisionRef)) {
      errors.push(`${authorization.authorizationRef} references unresolved decision ${authorization.decisionRef}`);
    }
    const exact = trustedAuthorizations.filter((binding) =>
      binding.authorizationRef === authorization.authorizationRef &&
      binding.actorRef === authorization.actorRef &&
      binding.actorRoleRef === authorization.actorRoleRef &&
      binding.decisionRef === authorization.decisionRef &&
      binding.effectEnvelopeRef === authorization.effectEnvelopeRef &&
      binding.authorityDisposition === authorization.authorityDisposition &&
      binding.effectDisposition === authorization.effectDisposition
    );
    if (exact.length !== 1) {
      errors.push(`${authorization.authorizationRef} does not resolve exactly through the trusted authorization snapshot`);
    }
  }
}

function projectionIdentity(item) {
  return item.interpretationRef ?? item.planRef ?? item.authorizationRef ?? 'unknown attributed projection';
}

function validateBinding(node, field, values, registered, errors) {
  for (const ref of Array.isArray(values) ? values : [values]) {
    if (!ref) continue;
    if (!registered.has(ref)) errors.push(`${node.workNodeRef} references unresolved ${field} ${ref}`);
  }
}

export function validateIntentTrustSnapshot(snapshot, {
  registry,
  registeredRoleRefs = []
} = {}) {
  const errors = [];
  if (!snapshot) {
    return { ok: false, current: false, errors: ['trusted intent snapshot is required'] };
  }
  if (snapshot.schemaVersion !== registry?.trustedSnapshotSchemaVersion) {
    errors.push('unexpected intent trust snapshot schema');
  }
  for (const field of missingFields(snapshot, registry?.trustedSnapshotRequiredFields ?? [])) {
    errors.push(`intent trust snapshot missing ${field}`);
  }
  if (snapshot.currentness !== 'CURRENT') errors.push('intent trust snapshot is not CURRENT');
  if (!/^[a-f0-9]{64}$/.test(snapshot.sourceHash ?? '')) {
    errors.push('intent trust snapshot sourceHash must be a lowercase SHA-256');
  } else if (snapshot.sourceHash !== buildIntentTrustSourceHash(snapshot)) {
    errors.push('intent trust snapshot sourceHash does not match its exact identity set');
  }
  if (snapshot.semanticFingerprint !== buildIntentTrustSnapshotFingerprint(snapshot)) {
    errors.push('intent trust snapshot has a stale or non-canonical semantic fingerprint');
  }
  const expectedBindingFields = new Set(registry?.bindingFields ?? []);
  const actualBindingFields = new Set(Object.keys(snapshot.bindingRefs ?? {}));
  if (!sameValues(expectedBindingFields, actualBindingFields)) {
    errors.push('intent trust snapshot binding fields must exactly cover the registry binding fields');
  }
  for (const field of expectedBindingFields) {
    uniqueValues(snapshot.bindingRefs?.[field] ?? [], `trusted ${field}`, errors);
  }
  const actorRefs = uniqueValues(snapshot.actorRefs ?? [], 'trusted actor ref', errors);
  const decisionRefs = uniqueValues(snapshot.decisionRefs ?? [], 'trusted decision ref', errors);
  const authorizationRefs = uniqueRefs(
    snapshot.authorizationBindings ?? [],
    'authorizationRef',
    'trusted authorization binding',
    errors
  );
  const registeredRoles = new Set(registeredRoleRefs);
  for (const binding of snapshot.authorizationBindings ?? []) {
    for (const field of missingFields(binding, registry?.trustedAuthorizationBindingRequiredFields ?? [])) {
      errors.push(`${binding.authorizationRef ?? 'unknown authorization binding'} missing ${field}`);
    }
    if (!actorRefs.has(binding.actorRef)) {
      errors.push(`${binding.authorizationRef} references untrusted actor ${binding.actorRef}`);
    }
    if (!registeredRoles.has(binding.actorRoleRef)) {
      errors.push(`${binding.authorizationRef} references unregistered actor role ${binding.actorRoleRef}`);
    }
    if (!decisionRefs.has(binding.decisionRef)) {
      errors.push(`${binding.authorizationRef} references untrusted decision ${binding.decisionRef}`);
    }
    if (!(snapshot.bindingRefs?.effectEnvelopeRef ?? []).includes(binding.effectEnvelopeRef)) {
      errors.push(`${binding.authorizationRef} references untrusted effect envelope ${binding.effectEnvelopeRef}`);
    }
    if (!(registry.authorityDispositions ?? []).includes(binding.authorityDisposition)) {
      errors.push(`${binding.authorizationRef} has invalid trusted authority disposition ${binding.authorityDisposition}`);
    }
    if (!(registry.effectDispositions ?? []).includes(binding.effectDisposition)) {
      errors.push(`${binding.authorizationRef} has invalid trusted effect disposition ${binding.effectDisposition}`);
    }
  }
  return {
    ok: errors.length === 0,
    current: errors.length === 0 && snapshot.currentness === 'CURRENT',
    errors,
    stats: {
      bindingFields: actualBindingFields.size,
      actors: actorRefs.size,
      decisions: decisionRefs.size,
      authorizations: authorizationRefs.size
    },
    semanticHash: semanticHash(snapshot)
  };
}

function validateReceiptContracts(graph, registry, nodesByRef, errors) {
  const currentGroups = new Map();
  const receiptStates = new Set(registry.receiptStates ?? []);
  const currentnessStates = new Set(registry.receiptCurrentnessStates ?? []);
  for (const receipt of graph.receipts ?? []) {
    for (const field of missingFields(receipt, registry.receiptRequiredFields ?? [])) {
      errors.push(`${receipt.receiptRef ?? 'unknown receipt'} missing ${field}`);
    }
    if (receipt.semanticFingerprint !== buildReceiptFingerprint(receipt)) {
      errors.push(`${receipt.receiptRef} has non-canonical semantic fingerprint`);
    }
    if (!(receipt.sourceRefs?.length) || !(receipt.sourceHashes?.length)) {
      errors.push(`${receipt.receiptRef} missing source refs or hashes`);
    }
    if (!receiptStates.has(receipt.state)) errors.push(`${receipt.receiptRef} has invalid receipt state ${receipt.state}`);
    if (!currentnessStates.has(receipt.currentness)) errors.push(`${receipt.receiptRef} has invalid currentness ${receipt.currentness}`);
    const node = nodesByRef.get(receipt.workNodeRef);
    if (!node) {
      errors.push(`${receipt.receiptRef} references missing work node ${receipt.workNodeRef}`);
      continue;
    }
    if (receipt.currentness === 'CURRENT') {
      if (receipt.expectedTransitionRef !== node.expectedTransitionRef) {
        errors.push(`${receipt.receiptRef} targets wrong expected transition ${receipt.expectedTransitionRef}`);
      }
      if (receipt.nodeSemanticFingerprint !== node.semanticFingerprint) {
        errors.push(`${receipt.receiptRef} targets stale or wrong node fingerprint`);
      }
      if (receipt.sourceState !== node.state || receipt.disposition !== node.state) {
        errors.push(`${receipt.receiptRef} has stale source-state or disposition binding`);
      }
      const key = `${receipt.workNodeRef}|${receipt.expectedTransitionRef}`;
      const group = currentGroups.get(key) ?? [];
      group.push(receipt);
      currentGroups.set(key, group);
    }
  }
  for (const [key, receipts] of currentGroups) {
    if (receipts.length < 2) continue;
    const identities = new Set(receipts.map((receipt) => [
      receipt.nodeSemanticFingerprint,
      receipt.disposition,
      receipt.sourceState,
      receipt.semanticFingerprint
    ].join('|')));
    errors.push(`${identities.size === 1 ? 'duplicate' : 'conflicting'} current receipts for ${key}`);
  }
}

function validateTransitionLedgers(
  graph,
  registry,
  nodesByRef,
  registeredProcesses,
  registeredRoles,
  trustedActors,
  errors
) {
  const byNode = new Map();
  for (const transition of graph.transitions ?? []) {
    const transitionErrorsBefore = errors.length;
    for (const field of missingFields(transition, registry.transitionRequiredFields ?? [])) {
      errors.push(`${transition.transitionRef ?? 'unknown transition'} missing ${field}`);
    }
    if (!nodesByRef.has(transition.workNodeRef)) {
      errors.push(`${transition.transitionRef} references unknown work node ${transition.workNodeRef}`);
    }
    if (!Number.isInteger(transition.sequence) || transition.sequence < 0) {
      errors.push(`${transition.transitionRef} sequence must be a non-negative integer`);
    }
    if (!(registry.lifecycleStates ?? []).includes(transition.priorState) ||
        !(registry.lifecycleStates ?? []).includes(transition.nextState)) {
      errors.push(`${transition.transitionRef} references an unknown lifecycle state`);
    }
    if (!registeredProcesses.has(transition.processRef)) {
      errors.push(`${transition.transitionRef} references unresolved process ${transition.processRef}`);
    }
    if (!registeredRoles.has(transition.actorRoleRef)) {
      errors.push(`${transition.transitionRef} references unresolved actor role ${transition.actorRoleRef}`);
    }
    if (!trustedActors.has(transition.actorRef)) {
      errors.push(`${transition.transitionRef} references unresolved actor ${transition.actorRef}`);
    }
    if (!(transition.sourceRefs?.length)) errors.push(`${transition.transitionRef} missing source refs`);
    if (transition.semanticFingerprint !== buildTransitionFingerprint(transition)) {
      errors.push(`${transition.transitionRef} has non-canonical semantic fingerprint`);
    }
    if (errors.length !== transitionErrorsBefore) continue;
    const ledger = byNode.get(transition.workNodeRef) ?? [];
    ledger.push(transition);
    byNode.set(transition.workNodeRef, ledger);
  }
  for (const node of nodesByRef.values()) {
    const ledger = [...(byNode.get(node.workNodeRef) ?? [])].sort((left, right) =>
      left.sequence - right.sequence || left.transitionRef.localeCompare(right.transitionRef));
    const fingerprints = new Set();
    let replayState = node.initialState;
    for (const [index, transition] of ledger.entries()) {
      if (transition.sequence !== index) errors.push(`${node.workNodeRef} transition ledger has duplicate or retrograde sequence`);
      if (fingerprints.has(transition.semanticFingerprint)) errors.push(`${node.workNodeRef} transition ledger has duplicate semantic transition`);
      fingerprints.add(transition.semanticFingerprint);
      if (transition.priorState !== replayState) {
        errors.push(`${transition.transitionRef} is disconnected: expected prior state ${replayState}`);
      }
      if (!isTransitionAllowed(registry, transition.priorState, transition.nextState)) {
        errors.push(`${transition.transitionRef} disallows ${transition.priorState} -> ${transition.nextState}`);
      }
      replayState = transition.nextState;
    }
    if (replayState !== node.state) {
      errors.push(`${node.workNodeRef} final state ${node.state} does not match replay state ${replayState}`);
    }
  }
  return [...byNode.values()].flat();
}

function validateContainment(nodesByRef, registry, errors) {
  const claimedParents = new Map();
  for (const parent of nodesByRef.values()) {
    for (const childRef of parent.childRefs ?? []) {
      const child = nodesByRef.get(childRef);
      if (!child) continue;
      const parents = claimedParents.get(childRef) ?? [];
      parents.push(parent.workNodeRef);
      claimedParents.set(childRef, parents);
      if (child.parentWorkNodeRef !== parent.workNodeRef) {
        errors.push(`${parent.workNodeRef}/${childRef} parent-child relationship is not symmetric`);
      }
      if ((registry.terminalStates ?? []).includes(parent.state) &&
          !(registry.terminalStates ?? []).includes(child.state) &&
          !['COMPLETED', 'CONVERGED'].includes(child.state)) {
        errors.push(`${parent.workNodeRef} is terminal while descendant ${childRef} remains active`);
      }
    }
    if (parent.parentWorkNodeRef) {
      const owner = nodesByRef.get(parent.parentWorkNodeRef);
      if (!owner) errors.push(`${parent.workNodeRef} references missing parent ${parent.parentWorkNodeRef}`);
      else if (!(owner.childRefs ?? []).includes(parent.workNodeRef)) {
        errors.push(`${parent.workNodeRef}/${owner.workNodeRef} parent-child relationship is not symmetric`);
      }
    }
  }
  for (const [childRef, parents] of claimedParents) {
    if (new Set(parents).size > 1) errors.push(`${childRef} is claimed by multiple parents ${parents.sort().join(', ')}`);
  }
  const hierarchyCycle = detectCycle(nodesByRef, 'childRefs');
  if (hierarchyCycle) errors.push(`containment hierarchy cycle ${hierarchyCycle.join(' -> ')}`);
  return hierarchyCycle;
}

function validateCompletedNode(node, graph, errors) {
  if (!['COMPLETED', 'CONVERGED', 'CLOSED'].includes(node.state)) return;
  const receipt = graph.receipts.find((item) =>
    item.currentness === 'CURRENT' &&
    item.workNodeRef === node.workNodeRef &&
    item.expectedTransitionRef === node.expectedTransitionRef &&
    item.nodeSemanticFingerprint === node.semanticFingerprint &&
    item.sourceState === node.state &&
    item.disposition === node.state &&
    item.state === 'PROVEN'
  );
  if (!receipt) {
    errors.push(`${node.workNodeRef} ${node.state} missing exact current expected-transition evidence ${node.expectedTransitionRef}`);
    return;
  }
  if (receipt.requiresMutation &&
      (!receipt.beforeImplementationHead || !receipt.afterImplementationHead ||
       receipt.beforeImplementationHead === receipt.afterImplementationHead)) {
    errors.push(`${node.workNodeRef} mutation transition is not proven by a changed implementation head`);
  }
}

function validateParentConvergence(node, nodesByRef, graph, errors) {
  if (!['CONVERGED', 'CLOSED'].includes(node.state)) return;
  for (const childRef of node.childRefs ?? []) {
    const child = nodesByRef.get(childRef);
    if (!child) continue;
    if (!['COMPLETED', 'CONVERGED', 'CLOSED', 'CANCELLED', 'SUPERSEDED'].includes(child.state)) {
      errors.push(`${node.workNodeRef} cannot ${node.state} before child ${childRef} has a terminal disposition`);
      continue;
    }
    const requirement = {
      expectedTransitionRef: child.expectedTransitionRef,
      allowedDispositions: ['COMPLETED', 'CONVERGED', 'CLOSED', 'CANCELLED', 'SUPERSEDED']
    };
    if (!exactCurrentReceipt(graph.receipts ?? [], child, requirement)) {
      errors.push(`${node.workNodeRef} cannot ${node.state} before exact current child receipt ${childRef}`);
    }
  }
}

export function validateIntentRegistry(registry, {
  registeredProcessRefs = registry?.processRefs ?? []
} = {}) {
  const errors = [];
  if (registry?.schemaVersion !== 'vexlife.intent-orchestration-registry/v0') errors.push('unexpected intent registry schema');
  if (!registry?.registryRef) errors.push('intent registry missing registryRef');
  if (!registry?.systemRef) errors.push('intent registry missing systemRef');
  const lifecycle = validateStateRefCoverage(
    registry?.lifecycleStates ?? [],
    registry?.lifecycleStateRefs ?? [],
    'intent lifecycle',
    errors
  );
  const receiptStates = validateStateRefCoverage(
    registry?.receiptStates ?? [],
    registry?.receiptStateRefs ?? [],
    'intent receipt state',
    errors
  );
  const transitionSources = new Set(Object.keys(registry?.allowedTransitions ?? {}));
  if (!sameValues(lifecycle, transitionSources)) {
    errors.push('intent allowedTransitions must declare exactly one entry for every lifecycle state');
  }
  for (const [state, targets] of Object.entries(registry?.allowedTransitions ?? {})) {
    uniqueValues(targets, `${state} transition target`, errors);
    if (!lifecycle.has(state)) errors.push(`intent registry missing lifecycle state ${state}`);
    for (const target of targets ?? []) {
      if (!lifecycle.has(target)) errors.push(`intent transition ${state} references unknown target ${target}`);
    }
  }
  const formationStates = uniqueValues(registry?.allowedFormationStates ?? [], 'allowed formation state', errors);
  if (formationStates.size === 0) errors.push('intent registry missing allowed formation states');
  for (const state of formationStates) {
    if (!lifecycle.has(state)) errors.push(`intent formation policy references unknown state ${state}`);
  }
  const cancellationStates = new Set(Object.keys(registry?.cancellationPolicy ?? {}));
  if (!sameValues(lifecycle, cancellationStates)) {
    errors.push('intent cancellation policy must exactly cover every lifecycle state');
  }
  const cancellationSettled = new Set(registry?.cancellationSettledStates ?? []);
  for (const state of lifecycle) {
    const policy = registry?.cancellationPolicy?.[state];
    if (!policy) continue;
    if (policy.mode === 'PRESERVE_SETTLED') {
      if (!cancellationSettled.has(state)) {
        errors.push(`intent cancellation policy may not preserve runnable state ${state}`);
      }
    } else if (policy.mode === 'TRANSITION') {
      if (!policy.targetState || !(registry.allowedTransitions?.[state] ?? []).includes(policy.targetState)) {
        errors.push(`intent cancellation policy for ${state} is not an allowed transition`);
      }
      if (!cancellationSettled.has(policy.targetState)) {
        errors.push(`intent cancellation target ${policy.targetState} for ${state} is not settled`);
      }
    } else {
      errors.push(`intent cancellation policy for ${state} has invalid mode ${policy.mode}`);
    }
  }
  for (const state of cancellationSettled) {
    if (!lifecycle.has(state)) errors.push(`intent cancellation settled state ${state} is unknown`);
  }
  const processRefs = uniqueValues(registry?.processRefs ?? [], 'intent process ref', errors);
  const canonicalProcesses = new Set(registeredProcessRefs);
  for (const ref of REQUIRED_PROCESS_REFS) {
    if (!processRefs.has(ref)) errors.push(`intent registry missing process ${ref}`);
  }
  const knownIntentKeys = uniqueValues(
    (registry?.knownIntentProcessRoutes ?? []).map((route) => route.intentKey),
    'known intent route key',
    errors
  );
  const knownRouteRefs = uniqueRefs(
    registry?.knownIntentProcessRoutes ?? [],
    'resolutionRef',
    'known intent route',
    errors
  );
  for (const route of registry?.knownIntentProcessRoutes ?? []) {
    if (!processRefs.has(route.processRef)) {
      errors.push(`${route.resolutionRef} references unknown intent process ${route.processRef}`);
    }
    if (!canonicalProcesses.has(route.processRef)) {
      errors.push(`${route.resolutionRef} references non-canonical process ${route.processRef}`);
    }
  }
  uniqueRefs(registry?.projectionIdentities ?? [], 'projectionRef', 'intent projection', errors);
  const contractRefs = uniqueValues(
    [
      registry?.receiptContract?.contractRef,
      ...Object.values(registry?.attributedProjectionContracts ?? {}).map((contract) => contract.contractRef)
    ].filter(Boolean),
    'intent contract ref',
    errors
  );
  const identityRefs = [
    ...(registry?.lifecycleStateRefs ?? []).map((item) => item.ref),
    ...(registry?.receiptStateRefs ?? []).map((item) => item.ref),
    ...(registry?.projectionIdentities ?? []).map((item) => item.projectionRef),
    ...contractRefs,
    ...knownRouteRefs
  ];
  uniqueValues(identityRefs, 'intent registry identity ref', errors);
  for (const field of [
    'intentEnvelopeRequiredFields',
    'workNodeRequiredFields',
    'transitionRequiredFields',
    'receiptRequiredFields',
    'trustedSnapshotRequiredFields',
    'trustedAuthorizationBindingRequiredFields',
    'lifecycleStateRefs',
    'receiptStateRefs',
    'projectionIdentities',
    'attributedProjectionContracts',
    'knownIntentProcessRoutes'
  ]) if (!registry?.[field] || Object.keys(registry[field]).length === 0) errors.push(`intent registry missing ${field}`);
  return {
    ok: errors.length === 0,
    errors,
    stats: {
      lifecycleStates: lifecycle.size,
      receiptStates: receiptStates.size,
      processRefs: processRefs.size,
      intentFields: registry?.intentEnvelopeRequiredFields?.length ?? 0,
      workNodeFields: registry?.workNodeRequiredFields?.length ?? 0,
      receiptFields: registry?.receiptRequiredFields?.length ?? 0,
      knownIntentRoutes: knownIntentKeys.size
    },
    semanticHash: semanticHash(registry ?? {})
  };
}

export function validateIntentWorkgraph(graph, {
  registry,
  registeredProcessRefs = registry?.processRefs ?? [],
  registeredRoleRefs = [],
  trustSnapshot = null
} = {}) {
  const errors = [];
  const attentions = [];
  const registeredProcesses = new Set(registeredProcessRefs);
  const registeredRoles = new Set(registeredRoleRefs);
  const trustValidation = validateIntentTrustSnapshot(trustSnapshot, {
    registry,
    registeredRoleRefs
  });
  errors.push(...trustValidation.errors.map((error) => `trust snapshot: ${error}`));
  const trustSnapshotValid = trustValidation.ok && trustValidation.current;
  const trustedActors = trustSnapshotValid ? new Set(trustSnapshot.actorRefs ?? []) : new Set();
  if (graph?.schemaVersion !== 'vexlife.intent-workgraph/v0') errors.push('unexpected workgraph schema');
  if (!graph?.graphRef) errors.push('workgraph missing graphRef');
  if (!graph?.intent) errors.push('workgraph missing immutable intent');
  else {
    for (const field of missingFields(graph.intent, registry.intentEnvelopeRequiredFields)) errors.push(`intent envelope missing ${field}`);
    if (graph.rootIntentRef !== graph.intent.intentRef) errors.push('workgraph root intent does not match envelope');
    if (graph.intent.semanticFingerprint !== buildIntentFingerprint(graph.intent)) errors.push('intent envelope has non-canonical semantic fingerprint');
  }
  if (graph?.semanticFingerprint !== buildGraphSnapshotFingerprint(graph)) {
    errors.push('workgraph semantic fingerprint is stale or non-canonical');
  }
  validateAttributedProjections(
    graph,
    registry,
    registeredRoles,
    trustSnapshot,
    trustSnapshotValid,
    errors
  );

  const nodeRefs = uniqueRefs(graph?.nodes ?? [], 'workNodeRef', 'work node', errors);
  uniqueRefs(graph?.transitions ?? [], 'transitionRef', 'transition', errors);
  uniqueRefs(graph?.receipts ?? [], 'receiptRef', 'receipt', errors);
  const nodesByRef = new Map((graph?.nodes ?? []).filter((node) => node.workNodeRef).map((node) => [node.workNodeRef, node]));
  const lifecycle = new Set(registry?.lifecycleStates ?? []);
  const priorities = new Set(registry?.priorityVocabulary ?? []);
  const allowedFormationStates = new Set(registry?.allowedFormationStates ?? []);
  const activeFingerprints = new Map();
  const duplicateExemptStates = new Set(registry?.activeSemanticDuplicateExemptStates ?? []);
  const graphBindingClaims = Object.fromEntries((registry?.bindingFields ?? []).map((field) => [
    field,
    [...new Set((graph?.nodes ?? [])
      .flatMap((node) => Array.isArray(node[field]) ? node[field] : [node[field]])
      .filter(Boolean))].sort()
  ]));
  if (semanticHash(graph?.bindingRefs ?? {}) !== semanticHash(graphBindingClaims)) {
    errors.push('workgraph bindingRefs must exactly describe node binding claims');
  }

  for (const node of graph?.nodes ?? []) {
    for (const field of missingFields(node, registry.workNodeRequiredFields)) errors.push(`${node.workNodeRef ?? 'unknown work node'} missing ${field}`);
    if (!(node.sourceRefs?.length)) errors.push(`${node.workNodeRef} missing sourceRefs`);
    if (node.semanticFingerprint !== buildWorkNodeFingerprint(node)) errors.push(`${node.workNodeRef} has non-canonical semantic fingerprint`);
    if (node.rootIntentRef !== graph.rootIntentRef) errors.push(`${node.workNodeRef} root intent mismatch`);
    if (!lifecycle.has(node.initialState) || !lifecycle.has(node.state)) errors.push(`${node.workNodeRef} has unknown lifecycle state`);
    if (!allowedFormationStates.has(node.initialState)) {
      errors.push(`${node.workNodeRef} initial state ${node.initialState} is not allowed by the formation policy`);
    }
    if (!registeredProcesses.has(node.processRef)) errors.push(`${node.workNodeRef} references missing process ${node.processRef}`);
    if (!registeredRoles.has(node.roleRef)) errors.push(`${node.workNodeRef} references missing role ${node.roleRef}`);
    if (!priorities.has(node.priorityClass)) errors.push(`${node.workNodeRef} has unknown priority ${node.priorityClass}`);
    if ((node.dependencyRefs ?? []).includes(node.workNodeRef)) errors.push(`${node.workNodeRef} has a self-dependency`);
    for (const dependencyRef of node.dependencyRefs ?? []) if (!nodeRefs.has(dependencyRef)) errors.push(`${node.workNodeRef} references missing dependency ${dependencyRef}`);
    for (const childRef of node.childRefs ?? []) if (!nodeRefs.has(childRef)) errors.push(`${node.workNodeRef} references missing child ${childRef}`);

    const requirementRefs = (node.dependencyRequirements ?? []).map((item) => item.dependencyWorkNodeRef).sort();
    if (JSON.stringify(requirementRefs) !== JSON.stringify([...(node.dependencyRefs ?? [])].sort())) {
      errors.push(`${node.workNodeRef} dependency requirements do not exactly cover dependencyRefs`);
    }
    for (const requirement of node.dependencyRequirements ?? []) {
      if (!requirement.expectedTransitionRef || !(requirement.allowedDispositions?.length)) {
        errors.push(`${node.workNodeRef} has incomplete dependency requirement ${requirement.dependencyWorkNodeRef}`);
      }
    }

    for (const field of registry.bindingFields ?? []) {
      const values = node[field];
      if (!values || (Array.isArray(values) && values.length === 0)) errors.push(`${node.workNodeRef} missing ${field}`);
      const registered = trustSnapshotValid
        ? new Set(trustSnapshot.bindingRefs?.[field] ?? [])
        : new Set();
      validateBinding(node, field, values, registered, errors);
    }
    if (!duplicateExemptStates.has(node.state)) {
      const priorRef = activeFingerprints.get(node.semanticFingerprint);
      if (priorRef) errors.push(`active semantic duplicate ${priorRef} and ${node.workNodeRef}`);
      else activeFingerprints.set(node.semanticFingerprint, node.workNodeRef);
    }
    if (node.state === 'HELD_UNKNOWN') attentions.push(`${node.workNodeRef} remains HELD_UNKNOWN`);
    if (['BLOCKED', 'FAILED_RECOVERABLE'].includes(node.state) && !node.blockingReasonRef) {
      errors.push(`${node.workNodeRef} missing blockingReasonRef`);
    }
    if (['NEEDS_CLARIFICATION', 'WAITING_HUMAN', 'HELD_UNKNOWN'].includes(node.state) && !node.requiredHumanDecisionRef) {
      errors.push(`${node.workNodeRef} missing requiredHumanDecisionRef`);
    }
  }

  validateReceiptContracts(graph, registry, nodesByRef, errors);
  const validatedTransitions = validateTransitionLedgers(
    graph,
    registry,
    nodesByRef,
    registeredProcesses,
    registeredRoles,
    trustedActors,
    errors
  );
  const currentTransitions = new Map();
  for (const transition of validatedTransitions) {
    const prior = currentTransitions.get(transition.workNodeRef);
    if (!prior ||
        transition.sequence > prior.sequence ||
        (transition.sequence === prior.sequence && transition.transitionRef.localeCompare(prior.transitionRef) > 0)) {
      currentTransitions.set(transition.workNodeRef, transition);
    }
  }
  const expectedCurrentPointers = {
    transitionByWorkNodeRef: Object.fromEntries([...currentTransitions.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([ref, transition]) => [ref, transition.transitionRef])),
    currentReceiptRefs: (graph?.receipts ?? [])
      .filter((item) => item.currentness === 'CURRENT')
      .map((item) => item.receiptRef)
      .sort()
  };
  if (semanticHash(graph?.currentPointers ?? null) !== semanticHash(expectedCurrentPointers)) {
    errors.push('workgraph current pointers are stale or non-canonical');
  }
  const dependencyCycle = detectCycle(nodesByRef, 'dependencyRefs');
  if (dependencyCycle) errors.push(`workgraph cycle ${dependencyCycle.join(' -> ')}`);
  const hierarchyCycle = validateContainment(nodesByRef, registry, errors);
  for (const node of nodesByRef.values()) {
    validateCompletedNode(node, graph, errors);
    validateParentConvergence(node, nodesByRef, graph, errors);
  }

  const sets = projectIntentSets(graph, { registry, nodesByRef });
  return {
    ok: errors.length === 0,
    state: errors.length ? 'BLOCKED' : attentions.length ? 'ATTENTION' : 'PLAN_VALIDATED',
    currentness: 'CURRENT',
    errors,
    attentions,
    cycle: dependencyCycle,
    hierarchyCycle,
    topologicalOrder: dependencyCycle ? [] : topologicalOrder(nodesByRef),
    sets,
    semanticHash: semanticHash({ graphRef: graph?.graphRef, graphFingerprint: graph?.semanticFingerprint, errors, attentions, sets })
  };
}

export function projectIntentSets(graph, {
  registry,
  nodesByRef = new Map((graph?.nodes ?? []).map((node) => [node.workNodeRef, node]))
} = {}) {
  const terminalStates = new Set(registry?.terminalStates ?? []);
  const ready = [];
  const waiting = [];
  const blocked = [];
  const terminal = [];
  const detailsByRef = {};
  for (const node of graph?.nodes ?? []) {
    const unmetDependencyRefs = (node.dependencyRefs ?? []).filter((dependencyRef) => {
      const dependency = nodesByRef.get(dependencyRef);
      const requirement = requirementFor(node, dependencyRef);
      return !dependency || !requirement || !exactCurrentReceipt(graph.receipts ?? [], dependency, requirement);
    });
    if (node.state === 'READY' && unmetDependencyRefs.length === 0) ready.push(node.workNodeRef);
    if (node.state === 'READY' && unmetDependencyRefs.length > 0) waiting.push(node.workNodeRef);
    if (['NEEDS_CLARIFICATION', 'WAITING_DEPENDENCIES', 'WAITING_RESOURCE', 'WAITING_TOOL', 'WAITING_HUMAN', 'PAUSED_AT_CHECKPOINT', 'HELD_UNKNOWN'].includes(node.state)) {
      waiting.push(node.workNodeRef);
    }
    if (['BLOCKED', 'FAILED_RECOVERABLE'].includes(node.state)) blocked.push(node.workNodeRef);
    if (terminalStates.has(node.state)) terminal.push(node.workNodeRef);
    detailsByRef[node.workNodeRef] = {
      waitingReason: unmetDependencyRefs.length ? 'UNMET_EXACT_DEPENDENCY_RECEIPTS' :
        (waiting.includes(node.workNodeRef) ? node.state : null),
      unmetDependencyRefs: unmetDependencyRefs.sort(),
      blockingReasonRef: node.blockingReasonRef ?? null,
      requiredHumanDecisionRef: node.requiredHumanDecisionRef ?? null,
      evidenceSourceRefs: [...new Set(node.sourceRefs ?? [])].sort().slice(0, 8)
    };
  }
  return {
    ready: [...new Set(ready)].sort(),
    waiting: [...new Set(waiting)].sort(),
    blocked: [...new Set(blocked)].sort(),
    terminal: [...new Set(terminal)].sort(),
    detailsByRef
  };
}

export function transitionAllowed(priorState, nextState, registry) {
  return isTransitionAllowed(registry, priorState, nextState);
}

// [VXG RealForever]
