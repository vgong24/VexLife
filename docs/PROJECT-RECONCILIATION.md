# Project Reconciliation

`[VXG RealForever]`

## Purpose

P0B-B04 joins existing project, repository, provider, and proof truth without
creating another work-state or proof owner.

The human question is:

```text
this work exists in the Project
+ source / PR / checks / proof are changing
-> what evidence is actually current for this work?
-> did the exact candidate move?
-> did proof go stale?
-> did the exact proven candidate reach accepted main?
```

B04 answers those questions with one deterministic reconciliation projection.
It does not mutate the Intent Workgraph.

## Canonical owners

```text
Project Continuity
  project/work relationship truth

Repository Orientation / Repository Evidence
  repository, branch, head, tree, base and current-work grounding

Build Health
  semantic validation-evidence policy and proof-cell currentness

GitHub/provider observation
  PR, merge and check transport facts

Project Reconciliation B04
  exact relation + deterministic join of the owners above

Intent Workgraph / Project Planning B03
  lifecycle mutation and validated transition execution

Purpose Workspace B05
  later human-visible Board/Graph reconciliation consumer
```

Permanent:

```text
GITHUB_ISSUE != WORK_NODE
PR_STATE != WORK_STATE
CHECK_SUCCESS != SEMANTIC_PROOF_BY_ITSELF
PROVIDER_TIMESTAMP != CURRENTNESS
PROVIDER_OBSERVATION != SOURCE_AUTHORITY
RECONCILIATION_DISPOSITION != TRANSITION_AUTHORITY
PR_MERGED != WORK_CLOSED
COMPLETION_EVIDENCE_READY != COMPLETED
STALE_PROOF -> REVERIFY_REQUIRED
EXACT_POST_MERGE_TREE + CURRENT_PROOF -> COMPLETION_EVIDENCE_READY
```

## Project evidence relation

A `vexlife.project-evidence-relation/v1` relation binds one canonical Project
work node to the repository/proof identity that should be reconciled:

```text
relationRef
projectRef
workNodeRef
repositoryRef
workRef
validationProfileRef
sourceRefs[]
formedAt
semanticFingerprint
```

The relation is not a GitHub issue mapping by implication. A GitHub issue, pull
request, comment, workflow, check, or timestamp never becomes the canonical work
node merely because it mentions the same subject.

## Provider observation

A `vexlife.project-provider-observation/v1` record is a normalized observation
of provider facts. B04 does not fetch those facts itself.

For an open PR the observation binds:

```text
repositoryRef
workRef
pullRequestNumber
baseSha
headSha
headTreeSha
candidateSourceTreeSha256
checksState
observedAt
sourceRefs[]
```

For a merged PR it additionally binds:

```text
mergeCommitSha
mergeTreeSha
currentMainSha
mergeCommitReachableFromMain=true
```

The source-tree SHA-256 is an independently grounded Source Manifest identity
used to validate Build Health evidence. Git object tree identity and Source
Manifest tree identity are intentionally separate.

```text
GIT_TREE_SHA != SOURCE_MANIFEST_TREE_SHA256
```

Provider checks are carried as context only:

```text
SUCCESS
PENDING
FAILED
UNKNOWN
```

A green provider check never substitutes for the canonical Build Health
validation-evidence bundle.

## Build Health proof join

B04 calls the existing
`validateValidationEvidenceBundle(bundle, policy, expectedTarget)` owner.

The expected target is independently constructed from the exact provider/source
observation:

```text
repositoryRef
baseSha
candidateHeadSha
candidateTreeSha
sourceTreeSha256
observedHeadSha
```

Therefore an internally self-consistent old proof does not remain current merely
because its own fields agree.

```text
VALID_OLD_BUNDLE + MOVED_HEAD -> REVERIFY_REQUIRED
PROVIDER_GREEN + MISSING_CANONICAL_PROOF -> REVERIFY_REQUIRED
```

## Dispositions

### CURRENT_IN_REVIEW

Earned only when:

```text
Project relation matches exact CURRENT Project snapshot
+ Orientation says the same active work / exact PR / base / head / tree
+ Orientation Source Manifest identity matches the exact candidate source tree
+ canonical Build Health evidence validates for that exact target
+ provider state is OPEN
```

This says the evidence is current for review. It does not mean READY, mergeable,
or complete.

### REVERIFY_REQUIRED

Used when source/provider currentness or semantic proof no longer binds the exact
candidate, including a moved head or non-exact post-merge tree.

It is an attention/reverification disposition, not a Workgraph state transition.

### COMPLETION_EVIDENCE_READY

Earned only when:

```text
canonical exact-candidate proof is CURRENT
+ provider observation says MERGED
+ merge tree == exact reviewed/proven candidate tree
+ merge commit is reachable from observed current main
+ accepted-main Orientation observation is current
```

This is intentionally weaker than work completion:

```text
COMPLETION_EVIDENCE_READY != COMPLETED
```

If the current Workgraph state canonically allows `-> COMPLETED`, B04 may
project that possible transition as an explanatory next step, but always with:

```text
transitionAuthority=NONE
effects=false
executionAuthority=NONE
```

The transition must still be admitted and executed by the canonical Workgraph /
B03 transaction owner.

### HELD_UNKNOWN

Used when the provider/source state itself is insufficient to reconcile. UNKNOWN
holds only the dependent conclusion; it is not converted into false failure or
completion.

## CLI

The read-only source-managed command is:

```bash
npm run project:reconcile -- \
  --home <vex-home> \
  --project <project-definition.json> \
  --relation <project-evidence-relation.json> \
  --orientation <orientation-receipt.json> \
  --validation-evidence <build-health-evidence.json> \
  --provider <provider-observation.json>
```

The CLI first recompiles the exact CURRENT Project Continuity snapshot from the
selected Vex Home. It then delegates all proof semantics to Build Health and all
reconciliation semantics to B04.

It performs:

```text
Home mutation = false
provider mutation = false
source mutation = false
Workgraph mutation = false
```

Provider acquisition remains Operations/provider work outside this source
compiler.

## What B04 does not own

B04 does not implement:

```text
Workgraph lifecycle mutation
Project Planning persistence
GitHub API acquisition
GitHub issue or Project mutation
check execution
Build Health proof generation
source checkout/currentness ownership
Purpose Workspace Board/Graph rendering
drag/drop or keyboard interactions
ToCompletion live-project import
Heretic model/runtime/Home setup
Memory / Score / Dream / Rhythm
training or weight mutation
```

Those remain with their existing owners or B05/B06/P1 successors.

## Acceptance burden

Focused proof must establish at least:

```text
registry vocabulary and content-addressed relation/provider records
exact OPEN candidate + current canonical proof -> CURRENT_IN_REVIEW
wrong provider PR identity -> REVERIFY_REQUIRED
moved provider head -> REVERIFY_REQUIRED
Orientation/source-tree mismatch -> REVERIFY_REQUIRED
green provider checks without canonical proof -> REVERIFY_REQUIRED
exact merged candidate tree + reachable main + current proof -> COMPLETION_EVIDENCE_READY
merge-tree substitution -> REVERIFY_REQUIRED
UNKNOWN provider state -> HELD_UNKNOWN
no output grants transition or execution authority
```

Repository syntax, Blueprint, Source Manifest, DCO, exact source-owner proof,
fresh assurance, lifecycle currentness, READY, merge, and post-merge verification
remain separate obligations.

<!-- [VXG RealForever][VEXLIFE][TOCOMPLETION][P0B][PROJECT-RECONCILIATION][B04] -->
