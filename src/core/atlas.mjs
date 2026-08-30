import { projectArchitectureMeaningAtlasNode } from './architecture-meaning.mjs';
import { estimateTokens, semanticHash } from './utils.mjs';

function terms(value) {
  return String(value ?? '').toLowerCase().split(/[^a-z0-9._-]+/).filter((item) => item.length > 1);
}

function fail(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const EXTERNAL_NODE_KEYS = [
  'ref', 'kind', 'brief', 'currentness', 'edges', 'meaningSource',
  'canonicalOwnerRepositoryRef', 'sourceBinding', 'stateHash'
];
const EXTERNAL_SOURCE_BINDING_KEYS = [
  'schemaVersion', 'profile', 'registryRef', 'sourceDigestSha256',
  'projectionBundleDigestSha256', 'profileDigestSha256'
];
const HEX64 = /^[0-9a-f]{64}$/u;

function externalNodeBody(node) {
  return {
    ref: node.ref,
    kind: node.kind,
    brief: node.brief,
    currentness: node.currentness,
    edges: node.edges,
    meaningSource: node.meaningSource,
    canonicalOwnerRepositoryRef: node.canonicalOwnerRepositoryRef,
    sourceBinding: node.sourceBinding
  };
}

function validateProjectedExternalNode(node) {
  if (!isObject(node)) fail('ATLAS_EXTERNAL_NODE_INVALID');
  const actual = Object.keys(node).sort();
  const expected = [...EXTERNAL_NODE_KEYS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('ATLAS_EXTERNAL_NODE_SCHEMA_DRIFT');
  if (typeof node.ref !== 'string' || !node.ref.trim()) fail('ATLAS_EXTERNAL_REF_REQUIRED');
  if (node.kind !== 'EXTERNAL_MEANING') fail('ATLAS_EXTERNAL_KIND_INVALID');
  if (typeof node.brief !== 'string' || !node.brief.trim()) fail('ATLAS_EXTERNAL_BRIEF_REQUIRED');
  if (node.currentness !== 'SOURCE_BOUND_EXTERNAL_MEANING') fail('ATLAS_EXTERNAL_CURRENTNESS_INVALID');
  if (!Array.isArray(node.edges) || node.edges.length !== 0) fail('ATLAS_EXTERNAL_EDGES_NOT_ADMITTED');
  if (node.meaningSource !== 'SDK_MAA_CONSUMER_ENVELOPE') fail('ATLAS_EXTERNAL_MEANING_SOURCE_INVALID');
  if (node.canonicalOwnerRepositoryRef !== 'vgong24/Vextreme-SDK') fail('ATLAS_EXTERNAL_OWNER_INVALID');
  if (!isObject(node.sourceBinding)) fail('ATLAS_EXTERNAL_SOURCE_BINDING_REQUIRED');
  const bindingKeys = Object.keys(node.sourceBinding).sort();
  const expectedBindingKeys = [...EXTERNAL_SOURCE_BINDING_KEYS].sort();
  if (JSON.stringify(bindingKeys) !== JSON.stringify(expectedBindingKeys)) fail('ATLAS_EXTERNAL_SOURCE_BINDING_SCHEMA_DRIFT');
  for (const key of ['schemaVersion', 'profile', 'registryRef']) {
    if (typeof node.sourceBinding[key] !== 'string' || !node.sourceBinding[key].trim()) fail('ATLAS_EXTERNAL_SOURCE_BINDING_INVALID', key);
  }
  for (const key of ['sourceDigestSha256', 'projectionBundleDigestSha256', 'profileDigestSha256']) {
    if (typeof node.sourceBinding[key] !== 'string' || !HEX64.test(node.sourceBinding[key])) fail('ATLAS_EXTERNAL_SOURCE_DIGEST_INVALID', key);
  }
  if (typeof node.stateHash !== 'string' || !HEX64.test(node.stateHash)) fail('ATLAS_EXTERNAL_STATE_HASH_INVALID');
  if (node.stateHash !== semanticHash(externalNodeBody(node))) fail('ATLAS_EXTERNAL_STATE_HASH_MISMATCH');
  return node;
}

function composeQueryNodes(canonicalNodes, externalMeaningEnvelopes) {
  if (!Array.isArray(externalMeaningEnvelopes)) fail('ATLAS_EXTERNAL_MEANING_ENVELOPES_INVALID');
  const nodes = new Map(canonicalNodes);
  const seen = new Set();
  for (const envelope of externalMeaningEnvelopes) {
    const node = validateProjectedExternalNode(projectArchitectureMeaningAtlasNode(envelope));
    if (canonicalNodes.has(node.ref)) fail('ATLAS_EXTERNAL_REF_COLLISION', node.ref);
    if (seen.has(node.ref)) fail('ATLAS_EXTERNAL_REF_DUPLICATE', node.ref);
    seen.add(node.ref);
    nodes.set(node.ref, node);
  }
  return nodes;
}

export class Atlas {
  constructor(nodes) {
    this.nodes = new Map(nodes.map((node) => [node.ref, { ...node, stateHash: semanticHash(node) }]));
    this.reverse = new Map();
    for (const node of this.nodes.values()) {
      for (const edge of node.edges ?? []) {
        const list = this.reverse.get(edge.to) ?? [];
        list.push({ type: edge.type, to: node.ref, reverse: true });
        this.reverse.set(edge.to, list);
      }
    }
  }

  get(ref) { return this.nodes.get(ref) ?? null; }

  query({
    intent = '',
    startRefs = [],
    edgeTypes = null,
    depthLimit = 2,
    resultLimit = 12,
    tokenBudget = 1200,
    externalMeaningEnvelopes = [],
    externalNodes = undefined
  } = {}) {
    if (externalNodes !== undefined) fail('ATLAS_DIRECT_EXTERNAL_NODE_INJECTION_FORBIDDEN');
    const nodes = composeQueryNodes(this.nodes, externalMeaningEnvelopes);
    const wantedTerms = new Set(terms(intent));
    const edgeFilter = edgeTypes ? new Set(edgeTypes) : null;
    const queue = [];
    const visited = new Set();
    const results = [];
    let usedTokens = 0;

    for (const ref of startRefs) if (nodes.has(ref)) queue.push({ ref, depth: 0, via: 'START' });
    if (queue.length === 0) {
      const scored = [...nodes.values()].map((node) => {
        const haystack = new Set(terms(`${node.ref} ${node.kind} ${node.brief}`));
        const score = [...wantedTerms].filter((term) => haystack.has(term)).length;
        return { node, score };
      }).sort((a, b) => b.score - a.score || a.node.ref.localeCompare(b.node.ref));
      for (const item of scored.slice(0, Math.max(resultLimit, 1))) queue.push({ ref: item.node.ref, depth: 0, via: 'SEARCH' });
    }

    let truncatedBy = null;
    while (queue.length > 0) {
      const item = queue.shift();
      if (visited.has(item.ref)) continue;
      visited.add(item.ref);
      const node = nodes.get(item.ref);
      if (!node) continue;
      const external = node.kind === 'EXTERNAL_MEANING';
      const projection = {
        ref: node.ref,
        kind: node.kind,
        brief: node.brief,
        stateHash: node.stateHash,
        currentness: external ? node.currentness : 'CURRENT_BLUEPRINT',
        via: item.via,
        depth: item.depth,
        ...(external ? {
          meaningSource: node.meaningSource,
          canonicalOwnerRepositoryRef: node.canonicalOwnerRepositoryRef
        } : {})
      };
      const cost = estimateTokens(projection);
      if (usedTokens + cost > tokenBudget) { truncatedBy = 'TOKEN_BUDGET'; break; }
      results.push(projection);
      usedTokens += cost;
      if (results.length >= resultLimit) { truncatedBy = queue.length ? 'RESULT_LIMIT' : null; break; }
      if (item.depth >= depthLimit) continue;
      const outgoing = node.edges ?? [];
      const incoming = this.reverse.get(node.ref) ?? [];
      for (const edge of [...outgoing, ...incoming]) {
        if (edgeFilter && !edgeFilter.has(edge.type)) continue;
        if (!visited.has(edge.to)) queue.push({ ref: edge.to, depth: item.depth + 1, via: edge.type });
      }
    }

    return {
      intent,
      results,
      coverage: {
        startRefs,
        depthLimit,
        resultLimit,
        tokenBudget,
        usedTokens,
        visitedCount: visited.size,
        truncated: Boolean(truncatedBy),
        truncatedBy
      }
    };
  }
}

// [VXG RealForever]
