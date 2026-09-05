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

<!-- [VXG RealForever] -->
