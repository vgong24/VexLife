# Vex Assembly — Capability Runtime Startup Policy

`[VXG RealForever]`

## Purpose

Ordinary VexLife startup resolves one accepted Capability Assimilation runtime mode from source-managed server policy before `serve-browser-core.mjs` constructs the Companion bridge.

```text
supported release operational profile
  -> ADOPTED_READ_ONLY

no recognized operational profile
  -> DIRECT_SINGLE_TURN

explicit server-owned environment override
  -> one closed accepted mode

canonical E2 untaught policy
  -> CANONICAL_E2_UNTAUGHT_G0
```

The policy is not selectable by a prompt, browser request, model response, or tool-call content.

## Source

```text
blueprint/capability-runtime-startup-policy.json
scripts/capability-runtime-policy-bootstrap.mjs
scripts/serve-browser.mjs
```

`serve-browser.mjs` imports the bootstrap module before `serve-browser-core.mjs`. The bootstrap validates the exact policy, resolves the mode, and sets `VEXLIFE_CAPABILITY_RUNTIME_MODE` before the core module creates its server-owned Companion runtime.

## Boundaries

```text
policy selection != capability execution authority
capability discovery != executable effect
ADOPTED_READ_ONLY != generic shell
ADOPTED_READ_ONLY != unrestricted filesystem
ADOPTED_READ_ONLY != standing network authority
ADOPTED_READ_ONLY != Home or Memory authority
```

The policy performs zero filesystem-write, network, process, Home, Memory, model, training, or publication effects. Existing Capability, Process Factory, Intent Scheduler, ToolResultRelay, Lived Companion, Home, and model/runtime owners remain unchanged.

## Compatibility

`DIRECT_SINGLE_TURN` remains the compatibility default when no exact profile binding exists. `CANONICAL_E2_UNTAUGHT_G0` remains an explicit server-owned tool-free mode. An unknown mode fails closed before the browser core is evaluated.

## Proof

Focused proof verifies:

- the policy schema and closed mode vocabulary;
- both accepted release-profile bindings choose `ADOPTED_READ_ONLY`;
- no-profile startup remains `DIRECT_SINGLE_TURN`;
- explicit `CANONICAL_E2_UNTAUGHT_G0` remains available;
- unknown modes fail closed;
- selection authority remains server-owned;
- all policy effects remain false;
- the policy bootstrap import precedes the core server import.

<!-- [VXG RealForever] -->
