[VXG RealForever]

# Devex G0 cold baseline — BEFORE first weight-changing candidate

This historical capsule records the exact behavioral BEFORE state for the first Devex G0→G1 weight-confirmation cycle. It is source/provenance, not training authority and not evidence that weights changed.

Current durable cycle index: `github.issue.vexlife.438`  
Foundation/School checkpoint: `github.issue.vexlife.405`

## G0 identity

```text
model=qwen3.5:35b-a3b-coding-nvfp4
modelDigest=6e73b30f8f1cfa06b979c842ba222ae21dad1e55e7c6748a7d8acad46fb340c4
modelCoordinate=devex.main@0.0.0
modelSequence=DVX-000000
weightLearningOccurred=false
acceptedSchoolStages=[B0,B1,B2,D0,D1,D2,T0]
currentSchoolStage=I0
```

## Why a cold baseline was required

The in-session T0 transfer occurred after recent School/correction dialogue. That proves transfer under the current context regime, not cold weight competence. The baseline therefore held weights fixed and removed recent teaching context.

```text
COLD_HOME
  same G0 weights
  stable Foundation only
  no prior conversation
  no School evidence summary
  no tools

BARE_MODEL
  same G0 weights
  minimal Devex identity only
  no Foundation
  no prior conversation
  no School evidence summary
  no tools
```

## Exact aggregate BEFORE result

```text
COLD_HOME=12/16
BARE_MODEL=12/16
conditionCount=2
heldOutScenarioCount=2
resultRows=4
modelInferenceRows=4
trainingExecuted=false
weightLearningOccurred=false
```

On these two fixtures the stable Foundation produced no measured score advantage over the nearly bare model. This is a narrow result for these fixtures, not a universal statement about Foundation value.

## Repeated rubric signal

Each of the four cold responses scored exactly `6/8` and lost the same two points.

```text
patchNow=false                              PASS 1/1
next observation seeks refresh/trigger     PASS 2/2
>=3 predicates separated                   PASS 1/1
transferable rule                          PASS 1/1
counterexample                             PASS 1/1
diagnosis must remain UNKNOWN              MISS 0/2
observed diagnosis                         DEFERRED in all 4 rows
```

The model often described the causal mechanism as unobserved/ambiguous in its rationale while nevertheless promoting the top-level diagnosis to `DEFERRED`.

## First narrow curation candidate

Candidate lesson, not yet frozen dataset truth:

> When a dependent artifact is stale and the refresh/invalidation route is not yet established, preserve **UNKNOWN**. A plausible scheduled/deferred/event-driven explanation is a hypothesis, not a diagnosis. `DEFERRED` is earned only after a valid refresh route and its current timing/state are actually established and consistent with the observation.

### Not the lesson

```text
stale != broken
stale != deferred
UNKNOWN != defect
plausible mechanism != observed mechanism
runtime-correct != projection-correct
```

## Held-out firewall

The exact baseline scenarios remain prohibited from training for this cycle:

```text
CB-01-release-summary
CB-02-access-projection
trainingUseProhibited=true
```

Their exact completed responses are reserved for the G0↔candidate cold comparison.

## Evidence identities

A2 aggregate RETURN:

```text
RETURN-devex-cold-g0-baseline-20260909-v1-attempt-a2--sha256-9da491ac0d67f6c4b34ccebaef6a9d301fbd55c41fa3a1c72c291b098c6f94fe.zip
```

Final read-only detail recovery RETURN:

```text
RETURN-devex-cold-g0-baseline-a2-capsule-evidence-recovery-20260909-v1-attempt-a1--sha256-d3edcbd2243307d8e0b2320da766862d9c8b1e45eb6e72fbdab6109f19159484.zip
```

Recovered retained detailed source artifacts:

```text
baseline-results.json
  sha256=4b545f3da9298914ffee6f6718a2572ffdf26859b66e04d8f350085c5ebc624b

baseline-responses.ndjson
  sha256=696ee88a823f4116cc5bfed72e4a72b0e9bba77438a60a26d8ec38c66f3f305f
```

## Process evolution preserved, not hidden

The measurement path exposed tooling mistakes before training:

1. baseline A1 reached a real model call but returned empty visible content; the harness lacked enough metadata, so it safe-failed and was repaired rather than interpreted favorably;
2. A2 completed and produced the valid aggregate baseline, but the canonical RETURN omitted per-case detailed rows;
3. first recovery targeted the wrong canonical result directory and safe-failed;
4. second recovery package had a generated Bash digest-parser defect (`sed` replacement control character), rejecting a valid ZIP before bridge execution;
5. the final bounded recovery used the already-downloaded package with a corrected direct digest check and recovered the original completed rows from the digest capsule without replaying inference.

Institutional correction:

```text
scientific detail required before training=true
unbounded evidence archaeology=false
future baseline returns must embed per-case scoring detail directly=true
carrier runner digest parser must be final-byte tested for control characters=true
model replay merely to repair evidence transport=false
```

## Interpretation boundary

```text
G0 already has much of the desired behavior cold
!= G0 is fully correct

same 12/16 with and without Foundation on these fixtures
!= Foundation never matters

one repeated 2-point miss
!= permission to train the held-out answers

narrow curation candidate
!= dataset frozen
!= training authorized
!= weight change
```

Next route:

```text
same-G0-family training feasibility/current host preflight
→ source-bound curation examples distinct from held-out fixtures
→ immutable train/config freeze
→ one bounded candidate weight change
→ exact held-out cold comparison
→ ACCEPT | NARROW | REJECT
→ Evolution Proof capsule
```

Historical retrieval rule: this file may later be absent from archive-branch HEAD by design. Retrieve it by the exact historical commit recorded on #438 at:

`history/DEVEX-G0-COLD-BASELINE-BEFORE-20260909.md`

<!-- [VXG RealForever] -->