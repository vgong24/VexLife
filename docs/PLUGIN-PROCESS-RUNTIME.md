# VexLife Plugin + Process Runtime

## Purpose

This foundation turns recurring Root and VexLocalBridge work into versioned process-plugin instances instead of per-attempt procedural rewrites.

```text
Atlas discovers
→ Plugin Registry resolves implementation
→ Process Factory compiles a no-effect plan
→ a separately admitted executor performs effects
→ typed receipts prove the result
```

## Permanent boundary

The plugin runtime never grants authority. It validates a declared plugin against the accepted Process Factory, typed templates, module registry, foundation versions, effect envelope and resource budget.

A process plan is not an execution receipt.

## Cold-start Root path

A fresh Root receives one complete JSON packet and runs:

```bash
npm run root:process -- --packet test/fixtures/root-process/fresh-root-packet.json
```

The command:

1. loads accepted Blueprint, Process Factory and Module Registry sources;
2. validates the plugin registry;
3. extends Atlas with plugin-to-process/module/foundation/template edges;
4. resolves one compatible plugin bundle;
5. compiles one deterministic no-effect Process Factory plan;
6. emits a packet hash, coverage receipt and plan hash.

It does not fetch or reconstruct prior chats. It does not scrape historical GitHub comments. Mutable repository currentness remains a separate live preflight input.

## Generic executor rule

Future VexLocalBridge tasks vary through a typed task manifest. They do not embed a new executor implementation.

```text
immutable source artifact
+ package-contained evidence manifest
+ generic executor version/digest
+ live currentness preflight
+ typed terminal-result contract
```

The accepted runtime evidence policy permits live GitHub reads only for main, branch head, claim, PR state and authenticated identity.

## Learned-failure retention

The conformance suite encodes the failures that caused the executor-redesign freeze:

- missing packet inputs fail closed;
- stale foundation versions fail closed;
- missing authority fails closed;
- tampered plugin step bindings fail closed;
- replay with identical packet/time produces the identical plan hash;
- historical-comment scraping is prohibited by registry contract.

A new Root instance uses the same packet, plugin and tests rather than relearning these failures through another physical attempt.

## Extension

New work should normally add one process definition, typed templates, one plugin record and tests. Core runtime changes are reserved for plugin ABI evolution, not ordinary feature work.

<!-- [VXG RealForever] -->
