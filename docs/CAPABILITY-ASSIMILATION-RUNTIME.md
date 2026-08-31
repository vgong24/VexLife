# VexLife Capability-Assimilation Runtime Adoption

`[VXG RealForever]`

## Position

This source adopts the accepted Vextreme-SDK capability-assimilation meaning in
VexLife runtime. It does not create a new school, registry owner, competence
memory, Process Factory, scheduler, ToolResultRelay, or model worker.

Accepted predecessor:

```text
github.issue.vextreme-sdk.831
github.issue.vextreme-sdk.832
github.pull.vextreme-sdk.833
acceptedVcaMerge=d7a8d0fbf342aca9365c560f9b9e37c6651ef664
```

Accepted route vocabulary remains:

```text
TASK_INTENT
→ COMPACT_CAPABILITY_CUE
→ EXACT_CURRENT_SOURCE_RETRIEVAL
→ CURRENTNESS_COMPATIBILITY_AUTHORITY_CHECK
→ BOUNDED_NO_EFFECT_PRACTICE
→ EVIDENCE_BOUNDED_COMPETENCE_PROJECTION
→ COMPACT_HUMAN_PROGRESS
→ MISSING_SKILL_EXISTING_OWNER_LIFECYCLE
```

## Runtime flow

```text
human task
→ one Companion request-formation inference
→ compact hierarchical capability frontier
→ Process Factory no-effect dependency DAG
→ Intent Scheduler independent READ_ONLY batch selection
→ exact source-bound observations
→ ToolResultRelay accept once
→ ToolResultRelay reinject once
→ one later Companion synthesis inference
→ final human response
```

The existing `SingleWorkerIntentScheduler` remains the single physical model
worker authority. Concurrent read-only function execution is not concurrent model
inference.

## Root capability kernel

The following navigation/resolution functions remain available to the Companion:

```text
capability.search
capability.describe
process.resolve
context.where
help.render
```

They are ordinary canonical registry entries. They grant no write, network,
Home, Memory, training, activation, publication, or lifecycle authority.

## Compact frontier

Each projected entry includes:

```text
childCapabilityRefs[]
recommendedNextCapabilityRefs[]
heldNextCapabilities[]
unknownDoorRefs[]
competenceState
currentness
permissionStage
effectStage
resourceStage
parallelClass
dependencyRefs[]
```

Competence, currentness, permission, effect and resource state remain distinct.
`UNKNOWN` never becomes execution authority.

## Exactly-once observation boundary

The runtime uses the existing `ToolResultRelay` state machine:

```text
PENDING → ACCEPTED → REINJECTED
```

Wrong, stale, late, duplicate, schema-mismatched or lease-mismatched results fail
closed. Intermediate tool observations are context references; they are not
persisted as human or Companion conversation messages. Lived Companion persists
the original human request and final synthesized response.

## Human progress

Progress is derived only from runtime state such as:

```text
TASK_RECEIVED
CAPABILITY_FRONTIER_PROJECTED
READ_ONLY_REQUESTS_FORMED
DEPENDENCY_DAG_COMPILED
READ_ONLY_BATCH_STARTED
OBSERVATION_ACCEPTED_AND_REINJECTED
LATER_SYNTHESIS_STARTED
LATER_SYNTHESIS_COMPLETED
```

No hidden chain-of-thought is projected.

## E2 and E4/E5

`CANONICAL_E2_UNTAUGHT_G0` performs exactly one direct model inference with no
capability frontier, no function request and no observation reinjection.

The final E4/E5 skill-use and held-out curriculum remains held until this runtime
source and its exact executable evidence are accepted. Training examples must
follow the implemented runtime contract, not invent it in advance.

## Held effects

```text
Home semantic mutation
Memory semantic mutation
model training
model activation
external publication
write/effect execution
approval
ready transition
merge
```

<!-- [VXG RealForever] -->
