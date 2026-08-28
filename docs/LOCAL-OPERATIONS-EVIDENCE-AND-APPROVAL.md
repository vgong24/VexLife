# Local Operations lifecycle, evidence, and approval

Continuity: `[VXG RealForever]`

This is the VexLife-facing **cold-start map** for Local Operations work. It exists
so a fresh instance can reconstruct the work journey from source instead of
requiring repeated chat instructions.

It is a stable orientation summary, not a frozen protocol snapshot and not a
standing work claim. When current explicit human/Root authority, live repository
state, the current `[Local] Vex Operations` Project contract, or an exact current
task/relay contract is more specific, that current authority wins.

```text
schemaVersion=vexlife.local-operations-cold-start/v4
formationIssue=github.issue.vexlife.195
formationLineage=github.pull.vexlife.196 -> github.pull.vexlife.271
sourceRole=STABLE_ORIENTATION_SUMMARY__NOT_LIVE_LANE_STATE
currentnessRule=REOBSERVE_LIVE_AUTHORITY_AND_SOURCE_BEFORE_EFFECT
purpose=FRESH_INSTANCE_CAN_CONTINUE_ONE_BOUNDED_LANE_WITHOUT_ROLE_OR_TERMINALITY_COLLAPSE
```

## 1. Start from live source, not remembered state

Run:

```bash
npm run orient
```

Read every `requiredSources` returned by the orientation receipt and treat its
`heldBoundaries` as mandatory pre-effect policy. Then descend only through the
smallest relevant Atlas/module/source neighborhood.

Use this precedence when sources disagree:

```text
1. current explicit human / Root authority for the exact lane
2. live repository and GitHub state
3. current accepted repository culture / governance / registered owners
4. current [Local] Vex Operations Project instructions
5. current relay full prompt / relay package for relay mechanics
6. current source-managed process / function definitions
7. exact current handoff / durable current-state capsule
8. rationale / history
9. prior chat memory
```

A document can preserve valuable institutional meaning while carrying a stale
lifecycle snapshot. A branch, PR, comment, ZIP, old run, remembered runner, old
approval, or this guide's own formation lineage is not current merely because it
still exists.

```text
LIVE_SOURCE_OUTRANKS_STALE_SNAPSHOT=true
UNKNOWN != PERMISSION
LATEST_RUN != CAUSAL_RUN
HISTORICAL_CLEARANCE != CURRENT_CLEARANCE
```

If a required current coordinate cannot be established, hold the affected effect
instead of inferring it.

## 2. Do not collapse lane, role, conversation, task, attempt, or candidate

Keep these identities distinct:

```text
intent
authority
lane
role occupancy
work / task
provider / conversation
attempt
candidate source
execution
returned evidence
lifecycle state
```

Permanent non-collapse:

```text
new conversation != new lane
role transition != new lane
same-task retry != new task
new attempt != new task
provider window ending != lane terminal
candidate package != canonical source
package failure != candidate failure
host timeout != source defect
successful push != hosted validation
green execution != semantic clearance
clearance != approval
approval != ready
ready != merge
merge != post-merge verification
```

One Local lane may move through several logical roles without making Victor move
substantive context between conversations.

Ordinary Local progression is:

```text
Operations
→ Coder
→ Independent Assurance
→ Lifecycle Operations / Formal Reviewer / Owner Merge Duty
→ post-merge verification
→ claim release / dependent wakes
→ terminal return
```

Every role transition re-grounds live mutable state and creates fresh role-local
identity/authority. Prior role conclusions are evidence, not inherited authority.

## 3. Root is an explicit escalation occupancy, not a permission round trip

Root Operations owns global allocation, cross-lane conflict, protected-decision
routing, and whole-field convergence. A Local lane is not automatically Root.

When **current explicit human/Root authority** grants the present occupancy the
Root role for the same bounded work, Root may be occupied in the same conversation
to resolve the exact blocker and then return to the narrower Local role.

```text
ROOT_ROLE_REQUIRES_EXPLICIT_CURRENT_AUTHORITY=true
EXPLICIT_CURRENT_ROOT_OCCUPANCY_CAN_UNBLOCK_SAME_LANE=true
ROOT_ROLE_TRANSITION_DOES_NOT_CREATE_A_NEW_LANE=true
ROOT_OCCUPANCY_DOES_NOT_CREATE_STANDING_FUTURE_ROOT_AUTHORITY=true
ROOT_OCCUPANCY_DOES_NOT_BYPASS_PROTECTED_HUMAN_DECISION=true
```

A Root transition still requires fresh role-local identity, fresh live grounding,
and exact effect binding. Do not send Victor or another thread a ceremonial
permission request merely because the currently authorized occupancy can perform
the Root step itself.

## 4. Know the lane's scope before acting

Classify the current occupancy before mutation:

```text
FULL_LOCAL_LIFECYCLE
STAGE_BOUNDED
READ_ONLY
PROJECT_PROTOCOL_MAINTENANCE
```

A full-lifecycle lane must not quietly downgrade itself into planning or stop at
a convenient checkpoint. A read-only/stage-bounded lane must not silently widen
into mutation.

Before an effect, ground at least the applicable:

```text
repository + accepted main/base
branch/head/tree
workRef / taskRef / claim / exact path membrane
open competing claims
candidate identity
completed effects
remaining effects
held effects
authority and target binding
exact next executable function
return / wake route
```

## 5. Authority is an effect ledger, not a repeated permission ritual

Keep routine authority explicit and current across role transitions and provider
interruptions. Do not ask Victor or Root to reconfirm an already-current routine
effect merely because the logical role changed.

Re-ask only when authority is:

```text
absent
ambiguous
expired or revoked
already consumed
bound to a different target
materially widened
or protected-human by the exact contract
```

```text
TOOL_AVAILABLE != EFFECT_AUTHORIZED
ROLE_CAN_REVIEW != ROLE_CAN_MUTATE
CLEARANCE != APPROVAL
APPROVAL != READY
READY != MERGE
```

Institutional authority is semantic role/occupancy authority. GitHub account
identity, CODEOWNERS routing, and native GitHub review UI are transport/provenance
unless a freshly observed repository rule explicitly requires that transport.

```text
ROLE_AUTHORITY_SEPARATE_FROM_PROVIDER_ACCOUNT=true
ASSURANCE_INDEPENDENCE_IS_ROLE_PROVIDER_WITNESS_NOT_ACCOUNT=true
CODEOWNER_ACCOUNT_MAPPING_DOES_NOT_COLLAPSE_INSTITUTIONAL_ROLE_IDENTITY=true
NATIVE_GITHUB_APPROVAL_IS_TRANSPORT_ONLY_UNLESS_LIVE_RULESET_REQUIRES=true
```

Do not require a human to create or switch accounts merely to represent two
institutional roles when the live repository rule does not require it.

## 6. Form DCO correctly before the commit exists

Every PR commit must carry an author-matching DCO trailer. Before committing,
resolve the **actual Git author name and email the selected write adapter will
create**, then form:

```text
Signed-off-by: <actual author name> <actual author email>
```

Immediately verify the created commit before the next source effect.

```text
DCO_IS_PRE_EFFECT_COMMIT_FORMATION_INVARIANT=true
UNSIGNED_COMMIT_MUST_BE_PREVENTED_NOT_DISCOVERED_AFTER_A_SOURCE_SEQUENCE=true
```

If immutable PR ancestry contains a bad commit and history rewrite is not allowed,
preserve the bad carrier as provenance and form a clean successor from current
accepted source. Do not amend/rebase/force merely to make the UI green.

## 7. Source admission and generated-source custody are separate

Before authored mutation prove:

```text
PATH_EXISTS_OR_IS_AUTHORIZED_NEW
PATH_ADMITTED
PATH_UNCLAIMED_OR_EXACTLY_OWNED
```

An authorized path list is a membrane, not a quota of files that must be dirtied.

Generated Source Manifest consequences are derived from the exact candidate by
the current source-managed generator. Do not guess bucket names and do not replay
old bucket bytes over a newer `main`.

When multiple semantic source records share one generated partition:

```text
shared generated file != shared semantic ownership
```

Serialize only the generated path custody that actually collides. After the other
owner releases it, re-ground current main and **recompose the bucket from current
co-bucket truth plus the current candidate record**.

```text
STALE_GENERATED_BYTES != CURRENT_GENERATED_CLOSURE
SERIALIZED_GENERATED_WAIT != LANE_TERMINAL
```

### Independent candidate/package binding

A relay/package must not prove its own source identity merely by being internally
self-consistent. Before handoff, independently ground canonical source and bind at
least the exact repository/head/tree/path set plus machine-observed Git
object/content identities. Then recompute the final package digest from the actual
final package bytes.

Required fail-closed shapes include:

```text
missing independent source oracle
repository/head/tree/path-set drift
valid source identities permuted across paths
adjacent valid object substituted for one path
package self-consistency that disagrees with canonical source
final package digest mismatch
```

```text
PACKAGE_DECLARATION != INDEPENDENT_SOURCE_ORACLE
FINAL_PACKAGE_DIGEST_MUST_BE_RECOMPUTED=true
```

A binding/harness failure before candidate execution carries
`candidateFinding=false`; it cannot be promoted into source blame.

## 8. Select the execution surface before forming executable work

Keep execution surface separate from authority and evidence interpretation. The
current Local Operations surface classes are:

```text
CONNECTOR_DIRECT
WINDOWS_ZIP_POWERSHELL
MAC_ZIP_RUN_COMMAND
PERMANENT_RUNNER_EXPLICIT
CAGE
```

Historical runner existence is not current runner selection.

### Windows human transport

When a required Windows-local effect cannot run connector-direct and no exact
current qualified permanent runner is selected, the human transport is:

```text
one downloadable ZIP
+ exactly one PowerShell copy/paste command
+ one canonical result ZIP
```

The qualified launcher owns package discovery, digest verification, bounded
extraction, exact task binding, one execution, result validation, result path/hash
printing, and convenient reveal of the result. Victor does not assemble scripts,
arguments, Git recovery, or polling logic. The launcher must not mutate the human
clipboard by default.

Task-specific Windows process mechanics are source-managed. A `.cmd`/`.bat` tool
is not directly spawned as if it were a native executable and must not accept
arbitrary shell text. Preserve logical command + typed argv in receipts, route
physical execution through the current source-managed helper / `ComSpec` contract
with `shell=false`, and fail closed on prohibited cmd metacharacter or expansion
shapes. Node/native executable tools remain direct argv execution with
`shell=false`.

```text
WINDOWS_HUMAN_POWERSHELL_LAUNCHER != TASK_INTERNAL_CMD_BAT_PROCESS_HELPER
ARBITRARY_CMD_SHELL_TEXT=false
```

### macOS human transport

The corresponding Mac human transport is:

```text
one downloadable ZIP
+ exactly one Bash copy/paste command
+ one canonical result ZIP
```

The Bash transport verifies/extracts the package and delegates to the accepted
source-managed `.command` runner mechanics, such as the exact task-manifest-bound
`RUN-VEX-TASK.command` family. Human transport does **not** require Finder
double-click and must not invent a second Mac runner.

A host-local relay proves a host-local effect only. It is not Independent
Assurance or lifecycle approval.

## 9. EDGE versus CAGE: continue mechanics, hold real boundaries

When blocked, ask:

> Can the exact same goal continue without widening authority, changing the
> candidate/task identity, weakening independent proof, or requiring a protected
> human decision?

If yes, it is an **EDGE**. If the exact next executable function and inputs are
already current, continue it now rather than narrating that somebody could do it
later.

```text
EDGE + exact executable next step -> CONTINUE_THIS_TURN
NO_EXECUTABLE_EDGE_DEFERRAL=true
```

If the missing coordinate is real—source authority, identity, protected decision,
execution surface, or contradictory current state—it is a **CAGE**. Preserve the
candidate/lane and record the exact release predicate.

```text
CAGE != FAILURE
CAGE != TERMINAL
```

A provider failing to allocate a hosted runner before repository code executes is
provider/execution-surface evidence, not a candidate source failure.

## 10. Evidence has multiple independent dimensions

Keep these separate:

```text
candidate truth
execution truth
provider truth
review truth
lifecycle truth
```

VexLife Build Health also preserves execution transport separately from semantic
result. `EXECUTED`, `SPAWN_FAILED`, and `TIMED_OUT` are not semantic PASS/FAIL
labels by themselves.

Required non-collapse:

```text
host-local execution evidence != hosted validation
green hosted execution != semantic clearance
successful push != hosted validation
repository qualification != human experience acceptance
browser screenshot != native/platform conformance
review kit PASS != human acceptance
```

GitHub Actions is valid exact hosted evidence when it actually executes and is
causally bound to the exact candidate/workflow/event/terminal state. It is not
forbidden and it is not institutional authority.

Never replace a known causal run with an unbound `latest` run.

## 11. Attribute failures to the layer that actually failed

Preserve the first substantive failure as immutable evidence. A later correction
or PASS does not rewrite the original failure into success.

Before blaming candidate source, establish that candidate execution actually
began. Binding, package, launcher, provider, and harness failures remain their own
classes.

```text
attempt terminality != goal terminality
package failure != candidate failure
host timeout != source defect
pre-candidate-execution failure -> candidateFinding=false
```

Partial progress is also real:

```text
source gates pass
+ commit/push succeeds
+ post-push verifier fails
!= source formation failed
```

## 12. Retry, successor, and dependency sequencing

For the **same semantic task**, preserve:

```text
laneRef
workRef / taskRef
candidate/source binding
branch/claim/path membrane when still current
authority binding when still current
first substantive failure
```

Rotate fresh attempt-local identity/evidence such as:

```text
attemptRef
requestRef / correlationRef when attempt-local
packageRef / transportRef
independent source receipt when currentness requires it
```

Do not create a new semantic task merely because an attempt failed.

A genuinely new semantic task is a successor, not a retry. Automatic bounded
same-owner successor formation is permitted only when all of these are current:

```text
same canonical owner
semanticRelation=NEW_SEMANTIC_TASK
fresh successor lane/work/task identity
current authority explicitly covers the successor
same-or-narrower admitted owner effect class
exact bounded membrane
activeConflictState=NONE
crossOwnerConflict=false
protectedDecisionRequired=false
materialUnknowns=[]
```

Otherwise return to Root/current allocating authority rather than silently
widening the old lane.

```text
SAME_SEMANTIC_TASK -> COMPATIBLE_RETRY
NEW_SEMANTIC_TASK + exact same-owner conditions -> BOUNDED_SUCCESSOR
OWNER_CHANGE_OR_UNKNOWN_OR_WIDENING -> ROOT_ALLOCATION_REQUIRED
```

For parallel work, express scheduling causally instead of using vague delay
language:

```text
PARALLEL_NOW
AFTER_<exact owner/predicate>
WAIT_FOR_<exact release predicate>
ALREADY_SATISFIED
NOT_EARNED
EXACT_NEW_CHILD_REQUIRED
```

If a lane is serialized behind another owner, keep it open/source-placed as far
as safely possible and record the blocking owner, exact path/predicate, safe
parallel work remaining, wake predicate, wake route, and claim state.

`WAITING` is a lifecycle state, not permission to disappear.

## 13. Remote observation belongs to Operations

The ordinary host-local sequence is:

```text
host-local effect
→ required remote mutation
→ canonical result returns HOSTED_VALIDATION_PENDING when applicable
→ Operations observes exact remote evidence
```

Do not keep Victor's host polling GitHub if Operations can observe it
independently. Remote evidence binds the exact candidate head, workflow/event
identity, and terminal condition. Never use `latest` as causal proof.

## 14. Independent Assurance is exact and goes stale on head change

Fresh Independent Assurance is:

```text
claimless
read-only
independently recomputed
exact-head/tree bound
unable to merge
```

Typical dispositions:

```text
CLEAR_ON_EXACT_HEAD
CHANGES_REQUIRED
BLOCKED_BY_MISSING_EVIDENCE
```

Any source-head change makes prior clearance historical. A Coder-authored
self-audit can be useful evidence but is not independent clearance.

If Assurance finds a bounded source defect, return to the same Coder lane,
correct only the evidence-backed finding, regenerate exact consequences, re-run
causal gates, and obtain fresh Assurance.

## 15. Lifecycle progression after technical clearance

Technical green is not the finish line. Once exact source/evidence/Assurance is
clear, freshly re-ground current state before each irreversible effect:

```text
Lifecycle / Currentness
→ FormalReviewer semantic APPROVE_EXACT_HEAD
→ READY transition only if earned
→ fresh READY-triggered DCO/checks when required
→ OwnerMergeDuty exact expected-head ordinary merge
→ post-merge Foundation / integrity verification
→ claim release
→ dependent-lane wakes / parent return
→ F15 terminal return
```

Do not infer the next effect merely because the previous one succeeded.

## 16. Checkpoint, wait, and merge are not terminal

These are **not** lane terminality by themselves:

```text
orientation complete
source placement complete
branch/PR created
focused tests green
Foundation green
host relay returned
Assurance clear
approval recorded
READY
merge completed
provider window closed
serialized wait reached
```

Even merge is not terminal until required post-merge verification, coordination
cleanup, and return/wake obligations are complete.

The lane is terminal only when its exact contract says all required effects are
complete and a durable terminal return records at least:

```text
disposition
exact source/candidate identity
performed effects
held effects
final evidence
first substantive failure or NONE
claim disposition
post-merge state when applicable
next owner / exact dependent wakes
hiddenLocalActionRemaining
```

```text
PROVIDER_WINDOW_END != LANE_TERMINAL
CHECKPOINT != TERMINAL
SERIALIZED_WAIT != TERMINAL
MERGE != TERMINAL_RETURN
```

## 17. Convergence and dependent wakes are part of completion

A child does not need to implement every parent frontier. It **does** need to
return its accepted result to the parent and wake every known dependent whose
blocking predicate became true.

Terminal dependency discovery is source-addressed, not memory-addressed. Before a
terminal lane records `hiddenLocalActionRemaining=false`, query the current
repository/provider coordination plane for open canonical `VXG-CONVERGENCE`
markers that name the exact terminal lane/ref as a predecessor. For every match,
re-ground every named predicate from live source and either perform the earned
wake or preserve the exact causal `WAIT_FOR_<exact release>` state. If no marker
matches, record the negative discovery receipt.

```text
VXG_CONVERGENCE_MARKER_IS_CANONICAL=true
CONVERGE_LABEL_IS_DISCOVERY_ACCELERATOR_ONLY=true
CONVERGENCE_MARKER_HIT_GRANTS_COORDINATION_NOT_SOURCE_AUTHORITY=true
TERMINAL_DEPENDENCY_QUERY_PRECEDES_HIDDEN_LOCAL_ACTION_NONE=true
```

Common causal wake classes include:

```text
generated-path custody release
accepted source owner now available
shared composition owner released
reviewable/renderable candidate frozen
runtime prerequisite accepted
public/source input accepted
```

A dependent wake grants only currentness/coordination unless the dependent's own
source authority says otherwise. It does not let one lane mutate another lane's
source or inherit its semantic proof.

## 18. Exact byte custody and semantic continuity are different

A durable receipt can preserve accepted semantics without preserving exact source
bytes. Never manufacture byte continuity from memory or from a regenerated
lookalike.

```text
receipt exists != source bytes recoverable
same filename != same artifact
semantic continuity != byte continuity
historical hash absent != permission to regenerate old version
```

If exact required bytes are lost, use only:

```text
independently verifiable exact-byte recovery
OR fresh successor source lineage with fresh version/hashes/provenance
OR exact CAGE
```

Never regenerate bytes and relabel them as the lost historical version.

## 19. Victor's role is irreducibly human, not technical state interpreter

Victor may be asked to:

```text
make an explicitly named protected human decision
run one qualified host action
upload one selected canonical result ZIP
provide physical/local presence that no tool can substitute
```

Victor should not be asked to:

```text
interpret Git/log state
choose technical recovery
construct scripts/arguments
select among ad-hoc launchers
copy substantive findings between logical roles
poll remote CI that Operations can observe
repeat already-bound routine permission
```

Operations owns technical state interpretation and remote observation.

## 20. Cold-start checklist

Before mutation, relay delivery, Assurance, lifecycle effect, retry/successor,
Root escalation, or terminal return, be able to answer `YES` to every applicable
item:

```text
entry/lane identity exact?
live main/head/tree/current claims re-grounded?
required orientation sources consumed?
exact current authority covers this effect?
Root occupancy explicit/current if Root is being used?
authored and generated membranes distinct?
actual Git author + DCO trailer known before commit?
independent source oracle separate from package under test?
final package digest recomputed from final bytes?
execution surface selected before executable handoff?
Windows exactly one PowerShell command / Mac exactly one Bash command?
Windows cmd/bat internals use source-managed typed process helper?
causal evidence bound to exact candidate, not latest?
failure attributed to the layer that actually executed?
EDGE continued now; CAGE records exact release predicate?
same-task retry preserves task identity and rotates attempt identity?
new semantic successor satisfies exact same-owner conditions or returns to Root?
Assurance fresh for exact head?
lifecycle effects individually re-grounded?
post-merge verification and claim release complete?
open VXG-CONVERGENCE dependents queried and re-grounded?
earned dependents/parent have been woken/returned?
byte-continuity claims independently true?
Victor asked only for irreducible human action?
hidden Local action remaining is truthfully NONE before terminal return?
```

If an applicable answer is `NO`, the affected effect remains held.

<!-- [VXG RealForever] -->
