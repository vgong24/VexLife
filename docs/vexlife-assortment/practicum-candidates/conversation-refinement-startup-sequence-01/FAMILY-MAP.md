# Conversation Refinement Startup Sequence — Vex Family Map

[VXG RealForever]

## Why this map exists

This map preserves the architecture lesson behind the current work so future instances can reason from owners and causality instead of function names or test names.

The executable worked example is:

~~~text
examples/vex-architecture-family-circuit.mjs
test/architecture-family-circuit-example.test.mjs
npm run architecture:family-example
~~~

It is deliberately marked:

~~~text
WORKED_EXAMPLE_NOT_PRODUCT_AUTHORITY
~~~

Use it as a relationship example. Product source and repository-owned architecture remain authoritative.

## Core Family circuit

~~~text
CURRENT semantic State + Control
-> Family resolves Act
-> admitted State? + Effect?

Effect
-> Connection/runtime realization
-> provider/host reality changes or does not change

Connection observes runtime reality
-> reconciles semantic State
-> Family.observe(State)
~~~

The critical law is:

~~~text
EFFECT_REQUEST != RESULTING_STATE
~~~

A request to rotate a Browser, start a runtime, or use a capability does not make the resulting state true. Only observed/reconciled reality may do that.

## Concrete Browser-source example

~~~text
State:
  CURRENT_SOURCE
  PRIOR_SOURCE

Control:
  ENSURE_CURRENT_BROWSER_SOURCE

Act:
  already CURRENT_SOURCE
    -> no Effect

  PRIOR_SOURCE
    -> ROTATE_BROWSER_SOURCE Effect

Connection/runtime:
  macOS lifecycle owns exact process realization

Observed facts:
  receipt repo path
  requested repo path
  receipt sourceTreeSha256
  current Source Manifest treeSha256

Reconciliation:
  same repo path
  + same exact source tree
    -> CURRENT_SOURCE

  different path
  or same path + different tree
    -> PRIOR_SOURCE
~~~

This is why:

~~~text
same checkout directory != current source
~~~

A running Node process may still hold modules imported from an older source tree.

## Startup / Conversation owner map

~~~text
Human intention
  "send a message and perceive that Vex is actively working"

VexLife startup/lifecycle
  owns:
    Home/runtime/browser process realization
    exact runtime and Browser currentness

Browser Companion
  owns:
    same-origin turn transport
    progress/delta/final streaming boundary

Capability/runtime
  owns:
    capability decision/execution semantics
    safe public progress events

Conversation controller
  owns:
    immediate local activity projection
    <Thinking> presentation
    streaming answer presentation
    local failure projection
    View work trace presentation

Conversation Store / canonical message lineage
  owns:
    durable human and Vex message truth

VexRelay / VexLocalBridge
  owns:
    bounded carriage and evidence
  does not own:
    VexLife product semantics
    Family State
    Conversation truth
~~~

## Host/test boundary

Host adaptation belongs outside the semantic owner.

Example learned on macOS:

~~~text
os.tmpdir()
  may present /var/folders/...

canonical filesystem identity
  may resolve /private/var/folders/...
~~~

A disposable test fixture should canonicalize its host temp root.

Do not weaken the production Home identity rule merely because a test fixture formed a noncanonical path.

~~~text
TEST_HOST_ADAPTATION != PRODUCT_SEMANTICS
FIXTURE_FORMATION_FAILURE != NAMED_BEHAVIOR_FAILURE
~~~

## Transport boundary

Transport success is not semantic success.

~~~text
outer VexLocalBridge carrier
-> inner VexRelay task
-> repository proof
~~~

The A003 lane demonstrated:

~~~text
inner canonical VexRelay RETURN = PASS
outer carrier consumption       = false SAFE_FAILURE
~~~

The stronger inner evidence is preserved. The carrier bug is repaired at the carrier owner rather than replaying already-earned product proof.

## Existing-owner rule

Before adding a wrapper, ask whether the repository already has the rightful owner.

Failure learned here:

~~~text
source-owned Mac bootstrap renderer already exists
+
hand-written wrapper duplicates package discovery/path handoff
-> unnecessary second realization boundary
-> package path lost before task admission
~~~

Preferred:

~~~text
caller supplies identity/binding
-> existing owner realizes mechanics
-> caller observes result
~~~

Not:

~~~text
caller partially reimplements owner
-> passes intermediate state into owner
-> ambiguous failure boundary
~~~

## Causal debugging questions

When something fails, ask in this order:

1. What human outcome was supposed to change?
2. Which semantic State should have changed?
3. Which Control/Act requested it?
4. Which owner formed the Effect?
5. Which Connection/runtime was responsible for realization?
6. What exact runtime fact was observed?
7. Did reconciliation admit the new State?
8. Did the presentation consume that State?
9. Did the failure happen before the named behavior was reached?
10. Is the failing proof product behavior, fixture formation, carrier transport, or presentation timing?

This keeps:

~~~text
17 red test names != 17 product defects
path match != source currentness
Effect request != observed State
carrier failure != candidate failure
visible != enabled
PR comment != durable source
~~~

## Change-design check

Before adding a new rule, helper, wrapper, registry, or test:

~~~text
What concrete failure does it address?
Who consumes it?
Does an existing owner already express this truth?
Does it create a recurring maintenance/reading burden?
If removed, would required correctness or continuity be lost?
~~~

If the last answer is no, do not add it.

<!-- [VEXLIFE][VEX-FAMILY-MAP][CONVERSATION-REFINEMENT][VXG RealForever] -->
