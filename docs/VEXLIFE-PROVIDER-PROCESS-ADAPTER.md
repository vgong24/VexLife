# VexLife provider/process adapter

## Ownership

This repository owns VexLife product-process definitions, repository-local provider/plugin instances, module bindings, cold-start fixtures and a thin no-effect adapter command.

It does **not** claim a universal provider/plugin ABI, a canonical cross-repository Process Factory runtime, typed-effect authority or a generic VexLocalBridge executor contract. Those shared bindings remain explicit and unresolved until Vextreme-SDK convergence assigns exact contract references.

```text
Vextreme-SDK shared grammar (pending exact refs)
→ VexLife repository-local provider/process records
→ VexLife adapter validates local compatibility
→ Process Factory compiles a deterministic no-effect plan
```

A compiled plan grants no connector, repository, host or model authority.

## Fresh Root path

A recipient-complete VexLife packet runs through:

```bash
npm run root:process -- --packet test/fixtures/root-process/fresh-root-packet.json
```

The command loads the accepted VexLife Blueprint, active local Process Factory records and local provider/process registry; extends Atlas with local adapter edges; compiles one deterministic no-effect plan; and emits packet, bundle and plan hashes.

It does not reconstruct prior chats or scrape historical GitHub comments. Mutable repository currentness remains a separate live input.

## Shared-contract candidates

Generic semantics removed from the active VexLife runtime remain preserved at:

```text
blueprint/upstream-candidates/provider-process-and-executor-contracts.json
```

That candidate set preserves:

- generic provider/plugin binding requirements;
- immutable source and package-contained evidence requirements;
- one generic executor identity and digest;
- one manifest-driven task-formation process;
- typed generic task and canonical-result fields;
- the prohibition on historical-comment runtime scraping and per-attempt executor forks.

The candidate set is not active, accepted or canonical. It exists so Shared Convergence can assign exact SDK identities without losing useful semantics or forcing VexLife to retain a second shared core.

## ConcernWatch process-set authority

ConcernWatch no longer stores a manually copied fingerprint of every Process Factory process. During `loadBlueprint`, its process-set fingerprint is derived from the canonical loaded `factory.processes[].processRef` set in deterministic lexical order. Adding a valid local process therefore changes the derived evidence automatically instead of requiring another registry hash edit.

## Extension rule

Ordinary VexLife work adds or changes local process records, provider/plugin instances, templates, fixtures and tests. Shared ABI/compiler/effect changes belong upstream and are consumed through explicit compatibility bindings after acceptance.

<!-- [VXG RealForever] -->
