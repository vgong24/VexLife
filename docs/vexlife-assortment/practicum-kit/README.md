# VexLife Assortment practicum kit

`[VXG RealForever]`

This directory owns the reusable **Assortment practicum harness**, not product
semantics and not a second VexLife runtime.

It exists because repeated preview iterations independently rebuilt source
acquisition, stale-process cleanup, Chromium attachment, readiness checks,
navigation walks and receipts. That duplication produced preventable handoff
regressions even when canonical VexLife remained healthy.

## Permanent boundary

```text
PRACTICUM_KIT != PRODUCT_SOURCE
PRACTICUM_KIT != CANONICAL_JOURNEY
PRACTICUM_KIT != PRESENTATION_GRAPH_OWNER
PRACTICUM_KIT != INTENT_WORKGRAPH_OWNER
PRACTICUM_RECEIPT != DURABLE_PRODUCT_HISTORY
```

The kit consumes accepted owners:

```text
Navigation / Journey
  reference/browser/modules/navigation-controller.js

Presentation Observer
  registry.vexlife.presentation-graph.001
  owner github.issue.vexlife.719
  scripts/presentation-graph-observer.mjs

Intent Workgraph / Queue
  registry.vexlife.intent-orchestration.001
```

## Handoff contract

A human preview package is eligible for Victor only after the package has proved:

```text
P0  exact accepted source + executable predecessor binding
P1  patch formation / syntax / source-owner wiring
P2  real-browser VexLife initialization
P3  passive interactive readiness without navigation actions
P4  executable new-path + inherited-path regression proof

P0 + P1 + P2 + P3 + P4
-> PACKAGE_HANDOFF_ELIGIBLE

P5  RUN-1 gives Victor a fresh untouched visible browser
    RUN-2 is optional executable VexWalk

P6  Victor human walk / acceptance
```

These layers never collapse:

```text
SERVER_READY != BROWSER_READY
BROWSER_READY != APP_INITIALIZED
APP_INITIALIZED != INTERACTIVE_READY
INTERACTIVE_READY != HUMAN_WALK_ACCEPTED

PARSE_PASS != RUNTIME_PASS
STATIC_WIRING != LIVE_BINDING
VISIBLE_UI != INTERACTIVE_UI
HANDLER_EXISTS != DESTINATION_REACHABLE
```

## Package interface

Every future Assortment practicum should expose one ZIP containing:

```text
RUN-1-PREVIEW.sh
  fresh preview-owned runtime
  fresh browser profile
  visible browser launch
  zero navigation actions

RUN-2-VEXWALK.sh
  optional
  connects only to RUN-1's browser
  resets to declared walk start
  human-paced execution
  session-local receipts
```

Default human pacing is 3000ms between visible actions and may be overridden by
`VEXWALK_STEP_DELAY_MS`. Machine regression proof may use zero delay, but it is
performed before packaging and never hidden inside Victor's RUN-1.

## Receipt policy

```text
ACTION CONTRACT
-> EXECUTE
-> OBSERVE
-> RECEIPT

timestamp = primary evidence
duration = derived
raw pointer logging = false
```

Session receipts belong to the disposable preview runtime and are deleted when
RUN-1 stops. A receipt becomes durable only when a bounded human/design/proof
claim explicitly promotes its ref into the Assortment continuity record.

## Reusable files

- `CONTRACT.json` — machine-readable practicum laws and defaults.
- `preview-runtime-doctor.sh` — cleans only provably Assortment-preview-owned
  server/browser processes.
- `cdp-client.mjs` — small dependency-free Chromium DevTools Protocol helpers.
- `passive-readiness.mjs` — P2/P3 browser/runtime/interactivity proof without
  clicking or navigating.
- `vexwalk-runner.mjs` — optional source-driven action walk and receipt runner.

Package-specific code should contain only the delta:

```text
exact accepted head/tree + blob bindings
patch recipe / payload
passive-readiness contract
VexWalk contract
small RUN-1 / RUN-2 wrappers
```

Do not fork these reusable files into bespoke variants unless the common
contract itself needs to change. Fix the kit once and let later packages copy
that accepted version.

<!-- [VXG RealForever][VEXLIFE-ASSORTMENT][PRACTICUM-KIT] -->
