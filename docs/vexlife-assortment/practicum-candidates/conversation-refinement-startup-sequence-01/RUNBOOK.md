# Conversation Refinement Startup Sequence — Runbook

[VXG RealForever]

## Runbook law

This file records commands and execution routes by evidence state.

Do not copy a command from chat into the stable path merely because it looks plausible.

Every entry is one of:

~~~text
PROVEN
CANDIDATE / NOT YET PROMOTED
FAILED / DO NOT REUSE
~~~

A command moves to `PROVEN` only after its claimed effect is observed.

## PROVEN — architecture relationship example

From the VexLife repository:

~~~bash
npm run architecture:family-example
~~~

Expected relationship:

~~~text
PRIOR_SOURCE
-> ENSURE_CURRENT_BROWSER_SOURCE
-> ROTATE_BROWSER_SOURCE Effect
-> Connection realizes rotation
-> observed exact source identity
-> CURRENT_SOURCE
~~~

Deterministic test:

~~~bash
node --test test/architecture-family-circuit-example.test.mjs
~~~

## PROVEN — current Conversation Refinement repository proof family

The VexRelay A003 retained inner RETURN proved the following exact-head repository predicates on `89c28965...`:

~~~bash
node scripts/check-syntax.mjs
node scripts/source-manifest.mjs
node --test test/browser-companion-bridge.test.mjs
node --test --test-name-pattern='MACUPDATE01|MACUPDATE02' test/macos-source-rotation.test.mjs
node --test test/architecture-family-circuit-example.test.mjs
npm run architecture:family-example
~~~

Do not rerun that exact repository proof simply because its outer carrier later failed to consume the already-formed inner RETURN.

Rerun only when the implicated source changes or currentness classification requires it.

## PROVEN — source-owned VexLife lifecycle entry

The repository-owned Mac lifecycle entry is:

~~~bash
node scripts/macos-lifecycle.mjs --operation start --repo <EXACT_VEXLIFE_REPOSITORY_PATH>
~~~

This entry point owns VexLife runtime/Browser lifecycle behavior. Callers should provide the exact repository path and then consume the lifecycle receipt.

A startup command succeeding does not by itself prove the Conversation Refinement visual experience.

## CANDIDATE / NOT YET PROMOTED — full lived Conversation Refinement route

The desired stable route is:

~~~text
1. exact current VexLife candidate source
2. repository proof current
3. source-owned host bootstrap/lifecycle entry
4. Browser source currentness proves current tree
5. open/focus VexLife Conversation
6. human Send
7. observe:
   - immediate pulsing sparkle
   - <Thinking> public phases
   - response streaming
   - durable Vex response
   - View work trace
~~~

The exact one-command host bootstrap for this route is **not yet promoted**.

When the first successful current-head run is observed, replace this section with:

~~~text
PROVEN HOST ENTRY
artifact/ref:
exact command:
expected visible experience:
observed result:
receipt/evidence ref:
source head/tree:
~~~

Do not preserve a failed shell wrapper as the stable route.

## CANDIDATE — VexRelay repository carriage

For repository-operations proof without Local Workspace:

~~~text
current Vextreme-SDK contract
docs/private-continuity/vexrelay/current-contract.json

repository operations
-> adapter.vexrelay.repository/v2

Mac host carrier
-> adapter.vexlocalbridge.native-vexrelay-task-archive/v1
~~~

Use the source-owned Mac bootstrap renderer:

~~~text
Vextreme-SDK:
lib/vexlocalbridge/mac-source-bootstrap-command.js
renderMacSourceBootstrapCommand(...)
~~~

The caller should supply exact bindings such as package SHA, SDK head, and SDK tree.

Do not hand-compose a second package-discovery/bootstrap layer around this owner unless the current contract explicitly requires it.

## FAILED / DO NOT REUSE — hand-written SDK bootstrap wrapper

A hand-written wrapper in this lane:

~~~text
manually locate ZIP
-> manually clone exact SDK
-> pass $PACKAGE into RUN-VEX-TASK.command
~~~

failed before task admission with:

~~~text
VexLocalBridge: no digest-bound task ZIP found.
~~~

The wrapper had already found and hashed the exact ZIP, so the later package-path handoff created an unnecessary second failure boundary.

Do not reuse or incrementally patch that wrapper.

Use the source-owned bootstrap renderer instead.

## FAILED / DO NOT REUSE — broad Mac suite as human progression gate

Do not use the entire:

~~~bash
node --test test/macos-lifecycle.test.mjs
~~~

as Victor's routine progression gate for Conversation Refinement.

Legacy fixtures in that broad suite may form fresh Homes beneath raw macOS `/var/...` aliases and fail before their named behavior.

Run only the focused proof implicated by the current source change, and keep deterministic repository proof out of the human lived-experience loop whenever Relay can carry it.

## FAILED / DO NOT REUSE — interactive shell comment blocks

Do not give Victor interactive zsh blocks containing commentary lines beginning with `#` unless the command explicitly establishes the shell behavior that accepts them.

One prior block stopped at:

~~~text
zsh: command not found: #
~~~

Human command blocks should be source-generated where possible and otherwise contain only executable shell.

## Human feedback contract

Before any human host action, state four things prominently:

~~~text
WHAT CHANGED
WHY IT CHANGED
WHAT VICTOR SHOULD EXPERIENCE
WHAT TO RETURN / REPORT
~~~

Victor should not need to read the entire technical response to know what the run is testing.

## After the next successful lived run

Update this runbook immediately:

1. move the exact successful host entry to `PROVEN`;
2. bind the exact VexLife head/tree and source-owned entry point;
3. record the expected visible experience;
4. record the observed human result;
5. keep failed routes below as anti-regression history;
6. remove no failure lesson unless its cause is demonstrably obsolete.

<!-- [VEXLIFE][CONVERSATION-REFINEMENT][STARTUP-SEQUENCE][RUNBOOK][VXG RealForever] -->
