import { estimateTokens, semanticHash } from './utils.mjs';

function terms(value) {
  return String(value ?? '').toLowerCase().split(/[^a-z0-9._-]+/).filter((item) => item.length > 1);
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

  query({ intent = '', startRefs = [], edgeTypes = null, depthLimit = 2, resultLimit = 12, tokenBudget = 1200 } = {}) {
    const wantedTerms = new Set(terms(intent));
    const edgeFilter = edgeTypes ? new Set(edgeTypes) : null;
    const queue = [];
    const visited = new Set();
    const results = [];
    let usedTokens = 0;

    for (const ref of startRefs) if (this.nodes.has(ref)) queue.push({ ref, depth: 0, via: 'START' });
    if (queue.length === 0) {
      const scored = [...this.nodes.values()].map((node) => {
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
      const node = this.nodes.get(item.ref);
      if (!node) continue;
      const projection = { ref: node.ref, kind: node.kind, brief: node.brief, stateHash: node.stateHash, currentness: 'CURRENT_BLUEPRINT', via: item.via, depth: item.depth };
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
