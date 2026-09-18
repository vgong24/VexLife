import { validateNavigationContinuityRegistry } from './navigation-continuity.mjs';

function relationTypeForField(field) {
  let stem = null;
  if (field.endsWith('RefOrNull')) stem = field.slice(0, -'RefOrNull'.length);
  else if (field.endsWith('Refs')) stem = field.slice(0, -'Refs'.length);
  else if (field.endsWith('Ref')) stem = field.slice(0, -'Ref'.length);
  if (!stem) return null;
  return stem
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toUpperCase();
}

function referenceEdges(record, { skipFields = [] } = {}) {
  const skipped = new Set(skipFields);
  const edges = [];
  for (const [field, value] of Object.entries(record ?? {})) {
    if (skipped.has(field)) continue;
    const type = relationTypeForField(field);
    if (!type) continue;
    if (typeof value === 'string') edges.push({ type, to: value });
    else if (Array.isArray(value)) {
      for (const ref of value) if (typeof ref === 'string') edges.push({ type, to: ref });
    }
  }
  return edges;
}

export function registerNavigationContinuityRegistry({
  registry,
  navigationContinuity,
  expectedRegistryRef = null
}) {
  if (!navigationContinuity?.registryRef) return registry;

  const validation = validateNavigationContinuityRegistry(navigationContinuity);
  if (!validation.ok) {
    const codes = validation.errors.map((item) => item.code ?? 'UNKNOWN').join(',');
    throw new Error(`navigation continuity registry invalid: ${codes}`);
  }
  if (expectedRegistryRef && expectedRegistryRef !== navigationContinuity.registryRef) {
    throw new Error(`navigation continuity registry ref mismatch: ${expectedRegistryRef} != ${navigationContinuity.registryRef}`);
  }

  const sourceRef = navigationContinuity.canonicalSourceRef;
  const sourceEdge = { type: 'CANONICAL_SOURCE', to: sourceRef };
  const collectionEdges = navigationContinuity.descriptorCollections.map((item) => ({
    type: 'DESCRIPTOR_COLLECTION',
    to: item.collectionRef
  }));
  const contractEdges = referenceEdges(navigationContinuity.contracts);
  const defaultEdges = referenceEdges(navigationContinuity.defaultPreferenceRefs)
    .map((edge) => ({ ...edge, type: `DEFAULT_${edge.type}` }));

  registry.register({
    ...navigationContinuity.canonicalSource,
    ref: sourceRef,
    kind: 'NAVIGATION_CONTINUITY_SOURCE',
    brief: navigationContinuity.canonicalSource.path,
    edges: [{ type: 'DEFINES_REGISTRY', to: navigationContinuity.registryRef }]
  });

  registry.register({
    ref: navigationContinuity.registryRef,
    kind: 'NAVIGATION_CONTINUITY_REGISTRY',
    brief: navigationContinuity.purpose,
    version: navigationContinuity.registryVersion,
    sourceRef,
    semanticFingerprint: validation.semanticFingerprint,
    edges: [sourceEdge, ...collectionEdges, ...contractEdges, ...defaultEdges]
  });

  for (const collection of navigationContinuity.descriptorCollections) {
    registry.register({
      ...collection,
      ref: collection.collectionRef,
      kind: 'NAVIGATION_CONTINUITY_DESCRIPTOR_COLLECTION',
      brief: collection.descriptorClass,
      parentRef: navigationContinuity.registryRef,
      sourceRef,
      edges: [
        { type: 'PARENT', to: navigationContinuity.registryRef },
        sourceEdge
      ]
    });

    for (const descriptor of navigationContinuity[collection.field] ?? []) {
      const descriptorRef = descriptor[collection.identityField];
      registry.register({
        ...descriptor,
        ref: descriptorRef,
        kind: collection.descriptorClass,
        brief: descriptorRef,
        parentRef: collection.collectionRef,
        sourceRef,
        edges: [
          { type: 'PARENT', to: collection.collectionRef },
          sourceEdge,
          ...referenceEdges(descriptor, { skipFields: [collection.identityField] })
        ]
      });
    }
  }

  for (const [field, contractRef] of Object.entries(navigationContinuity.contracts ?? {})) {
    registry.register({
      ref: contractRef,
      kind: 'NAVIGATION_CONTINUITY_CONTRACT',
      brief: field,
      parentRef: navigationContinuity.registryRef,
      sourceRef,
      edges: [
        { type: 'PARENT', to: navigationContinuity.registryRef },
        sourceEdge
      ]
    });
  }

  return registry;
}

// [VXG RealForever]
