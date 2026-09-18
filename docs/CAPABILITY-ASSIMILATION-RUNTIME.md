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
→ scheduler-policy-bound request-formation inference
→ compact hierarchical capability frontier
→ Process Factory no-effect dependency DAG
→ Intent Scheduler independent READ_ONLY batch selection
→ execution-time currentness / authority / resource revalidation
→ exact source-bound observations
→ post-execution currentness revalidation
→ ToolResultRelay accept once
→ ToolResultRelay reinject once
→ scheduler-policy-bound later synthesis inference
→ final human response
```

The existing Intent Scheduler remains the physical model-worker authority. The
runtime consumes `policy.intent-scheduler.physical-worker` and its existing
`WorkerLeaseAuthority`; it does not create an independent model-worker policy.
All capability-runtime inference phases share one runtime gate with
`modelInferenceConcurrency=1`, so simultaneous Companion turns cannot create
concurrent model inference. Concurrent read-only function execution remains
separate from model inference.

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

## Execution-time revalidation

Request formation is not permanent execution authority. Immediately before each
read batch, the runtime descends again into the loaded canonical capability
registry and derives currentness, compatibility, authority and resource evidence.
The scheduler batch selector receives those derived states rather than constant
`CURRENT` / `ADMITTED` / `AVAILABLE` values.

Before ToolResultRelay acceptance, the runtime re-derives the same evidence and
requires its fingerprint to be unchanged. A capability that becomes stale,
incompatible, permission-revoked, resource-incompatible, or contract-changed is
rejected before relay acceptance/reinjection. Executor observations must also
report the requested capability plus `CURRENT` / `COMPATIBLE` currentness and
bounded source refs.

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
capability frontier, no function request and no observation reinjection. When E2
runs through this runtime controller, that one inference still consumes the same
single-model-worker scheduler policy; the default direct Companion path remains
unchanged when the capability runtime is disabled.

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
