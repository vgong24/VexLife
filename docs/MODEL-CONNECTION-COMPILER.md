# Model Connection Compiler and Vex Self-Capability Frame

`[VXG RealForever]`

## Purpose

R3 is the smallest source-bound join between accepted VexLife capability truth and
accepted external model/runtime truth.

It does **not** create another capability compiler, scheduler, runtime, effect
authority, Home owner, Memory owner, Atlas engine, or training owner.

```text
compileCapabilityFrame()
+ active RELEASE_QUALIFIED model bundle
+ compatible RELEASE_QUALIFIED operational profile
+ current source-bound runtime capability profile
+ closed external ModelTurnWitness
+ irreducible model-connection bindings
-> model-connection projection
-> bounded Vex self-capability frame
```

## Permanent boundaries

```text
VEX_SELF_CAPABILITY_FRAME != SECOND_CAPABILITY_COMPILER
MODEL_CONNECTION_COMPILER != SECOND_SCHEDULER
MODEL_CONNECTION_REGISTRY != RUNTIME_CENSUS_LOG
MODEL_SELF_REPORT != EXTERNAL_RUNTIME_PROOF
CAPABILITY_AVAILABLE != CAPABILITY_EXECUTED
RUNTIME_NATIVE_TOOL_SUPPORT != TOOL_EFFECT_AUTHORITY
MULTIMODAL_DECLARATION != MULTIMODAL_INPUT_AUTHORITY
UNKNOWN != AVAILABLE
HELD != UNAVAILABLE
SELF_CAPABILITY_FRAME != EFFECT_GRANT
```

The compiler calls the existing `compileCapabilityFrame()` and preserves its
permission/effect/resource/stage decisions. A model-connection binding may add a
runtime prerequisite; it may only narrow a canonical capability into
`HELD`, `UNAVAILABLE`, or `UNKNOWN`. It cannot upgrade a canonical non-executable
capability.

## Runtime capability source

`blueprint/model-runtime-capabilities.json` source-binds the accepted R1
Windows census to the current typed model bundle and operational profile.

Observed and available:

```text
C00 C01 C02 C03 C04 C05 C06 C07 C08 C09 C10
```

Intentionally held:

```text
C11 multimodal declaration only
C12 native tool-call declaration only
```

The exact census declared vision/video and native tool template support, but no
multimodal input or native tool execution was performed. VexLife's tool-effect
path remains Scheduler + ToolResultRelay.

Raw provider responses, raw reasoning content, and the provider-reported
absolute local model path are not copied into this registry.

## Binding overlay

`blueprint/model-connection-binding-registry.json` contains only edges not safely
derivable from the canonical capability registry itself. The first source-bound
bindings identify the accepted root capability kernel as model-assisted
read-only planning/synthesis participants and require only C00 text inference.

C12 is deliberately **not** required: deterministic tool execution remains owned
by the Scheduler / ToolResultRelay path rather than the model runtime's native
tool-call facility.

## Model-connection projection

`compileModelConnection()` validates:

- the active runtime-capability profile is current;
- its model bundle and operational profile are release-qualified and mutually compatible;
- runtime revision, executable digest, model/projector artifact refs and endpoint agree;
- the supplied ModelTurnWitness is a closed external witness;
- any witness model/profile/runtime refs that are present do not contradict source;
- the visible compatibility model and numeric-loopback origin agree with the selected source profiles.

For each canonical capability:

```text
canonical non-executable -> HELD
explicit stale/blocked/superseded currentness -> HELD
required runtime cell intentionally held -> HELD
required runtime cell not supported -> UNAVAILABLE
required runtime cell missing/unknown -> UNKNOWN
canonical currentness missing/unknown/unrecognized -> UNKNOWN
otherwise canonical CURRENT + executable -> AVAILABLE
```

`actuallyUsedRefs[]` must be visible and AVAILABLE. The projection still grants
no effect authority.

## Self-capability frame

`formVexSelfCapabilityFrame()` produces a bounded current reference projection.
It may contain only the admitted current-context refs:

```text
homeRef
deviceRef
companionLineageRef
projectRef
threadRef
channelRef
screenRef
selectedNodeRef
```

The frame includes available/held/unavailable/unknown capability refs, actually
used refs, runtime cell dispositions, currentness/source refs, and explicit
coverage/truncation evidence.

It does not embed the ModelTurnWitness, raw provider payload, raw reasoning,
credentials, local model paths, or private conversation bodies.

```text
effectAuthorityGranted=false
```

always.

## Downstream

R4 (`github.issue.vexlife.371`) consumes the accepted R3 projection for
**How This Turn Formed** / Atlas UX. R4 remains the human disclosure owner.

R3 itself performs no model call, tool call, network action, Home/Memory
mutation, training, activation, or publication.


## Parent re-entry: reusable live-turn projection closure

After the bounded R4 disclosure was accepted, the Model Connection Totality parent
re-entered the producer/consumer chain. The accepted R3 owners were present, but the
real browser-turn producer did not yet carry their projection/frame, and R2 safe
runtime metadata remained deeper than the visible R4 row set.

The reusable composition therefore remains layered:

```text
closed external ModelTurnWitness
+ source-owned ADOPTED_READ_ONLY capabilityFrameInput
+ schedulerDispatchReceipts[].capabilityRef actual-use evidence
+ accepted R3 registries
-> full modelConnectionProjection
-> separately token-bounded selfCapabilityFrame
-> safe R4 machine evidence
-> existing calm bounded human disclosure
```

Direct single-turn / untaught-G0 runtime modes do not own the adopted capability-frame
input and therefore remain typed UNKNOWN for model-connection composition. They do not
borrow the adopted runtime's executable/current stages.

`actuallyUsedRefs[]` is derived only from accepted scheduler-dispatch receipts whose
admission/completion fingerprints are present and whose `externalEffectsExecuted` is
false. Model prose, request formation, visible response text, and mere capability
availability cannot claim actual use.

The full R3 projection is reusable independently of the self-frame token budget. R4's
machine projection may additionally carry the already-safe R2 output hash/count/role/
finish/refusal/tool-count fields, usage/timing summaries, structured-output state, and
unknown-upstream **metadata**. Raw provider response, raw unknown values, raw reported
local paths, and raw reasoning remain excluded; reasoning trace content remains sealed.

The browser bridge only consumes a server-owned composer. Browser requests cannot inject
that owner. The later `scripts/serve-browser.mjs` composition tail is serialized behind
its current foreign writer custody and is not part of this source phase.

```text
CAPABILITY_AVAILABLE != CAPABILITY_EXECUTED
BOUNDED_SELF_FRAME != EXHAUSTIVE_REUSABLE_SOURCE
R4_MACHINE_PROJECTION != R4_VISIBLE_ROW_SET
UNKNOWN != AVAILABLE
HELD != UNAVAILABLE
C11/C12 remain HELD absent independent later evidence and authority
VISIBLE_DISCLOSURE != EFFECT_AUTHORITY
```

<!-- [VXG RealForever] -->
