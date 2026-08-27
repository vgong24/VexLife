# Local Operations lifecycle, evidence, and approval

Continuity: `[VXG RealForever]`

This is the VexLife-facing **cold-start map** for Local Operations work. It exists
so a fresh instance can reconstruct the work journey from source instead of
requiring repeated chat instructions.

It is intentionally a stable summary rather than a frozen copy of one protocol
release. When a current Root allocation, current `[Local] Vex Operations`
Project contract, or exact task/relay package supplies a more specific current
rule, that exact current authority wins.

```text
schemaVersion=vexlife.local-operations-cold-start/v2
issueRef=github.issue.vexlife.195
supersededCarrier=github.pull.vexlife.196
activeCarrier=github.pull.vexlife.271
laneRef=lane.vexlife.process.local-operations-cold-start.20260827.001
workRef=work.vexlife.process.local-operations-cold-start.20260827.001
purpose=FRESH_INSTANCE_CAN_CONTINUE_ONE_BOUNDED_LANE_WITHOUT_ROLE_OR_TERMINALITY_COLLAPSE
```

<!-- VXG-WORK-CLAIM
{"schemaVersion":"work-coordination.claim/v1","workRef":"work.vexlife.process.local-operations-cold-start.20260827.001","actorRef":"Coder[VEXLIFE][PROCESS][LOCAL-OPERATIONS-COLD-START]","instanceRef":"instance.vexlife.process.local-operations-cold-start.20260827.001","repository":"vgong24/VexLife","branch":"VXG-082726-process-local-ops-lifecycle-cold-start-dco-clean","epic":{"name":"VexLife Process","item":"current Local Operations cold-start lifecycle guidance"},"status":"authored-current-guidance-generated-pending","paths":["AGENTS.md","docs/LOCAL-OPERATIONS-EVIDENCE-AND-APPROVAL.md"],"generatedPaths":[],"coordinationOnly":false,"implementationAuthority":true,"sourceManifestSerializerAuthority":false,"reviewAuthority":false,"mergeAuthority":false,"publicationAuthority":false}
VXG-WORK-CLAIM -->

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
current explicit human / Root authority for the exact lane
> live repository and GitHub state
> current accepted repository culture / governance / registered owners
> current Local Operations contract and exact relay/task contract
> current handoff / durable receipts
> historical rationale and prior chat
```

A document can preserve valuable institutional meaning while carrying a stale
lifecycle snapshot. A branch, PR, comment, ZIP, old run, remembered runner, or
old approval is not current merely because it still exists.

```text
LIVE_SOURCE_OUTRANKS_STALE_SNAPSHOT=true
UNKNOWN != PERMISSION
LATEST_RUN != CAUSAL_RUN
HISTORICAL_CLEARANCE != CURRENT_CLEARANCE
```

If a required current coordinate cannot be established, hold the affected
effect instead of inferring it.

## 2. Do not collapse lane, role, conversation, attempt, or candidate

Keep these identities distinct:

```text
intent
lane
work / task
role occupancy
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
```

One Local lane may move through several logical roles without making Victor move
substantive context between conversations.

Normal progression is:

```text
Operations
→ Coder
→ Independent Assurance
→ Lifecycle Operations / Formal Reviewer / Owner Merge Duty
→ post-merge verification
→ terminal return
```

Every role transition re-grounds live mutable state and creates fresh role-local
identity/authority. Prior role conclusions are evidence, not inherited authority.

## 3. Know the lane's scope before acting

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
workRef / claim / exact path membrane
open competing claims
candidate identity
completed effects
remaining effects
held effects
authority and target binding
exact next executable function
return / wake route
```

## 4. Authority is an effect ledger, not a repeated permission ritual

Keep routine authority explicit and current across role transitions and
provider interruptions. Do not ask Victor to reconfirm an already-current
routine effect merely because the logical role changed.

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

## 5. Form DCO correctly before the commit exists

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

If an immutable PR ancestry contains a bad commit and history rewrite is not
allowed, preserve the bad carrier as provenance and form a clean successor from
current accepted source. Do not amend/rebase/force merely to make the UI green.

## 6. Source admission and generated-source custody are separate

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

Serialize only the generated path custody that actually collides. After the
other owner releases it, re-ground current main and **recompose the bucket from
current co-bucket truth plus the current candidate record**.

```text
STALE_GENERATED_BYTES != CURRENT_GENERATED_CLOSURE
SERIALIZED_GENERATED_WAIT != LANE_TERMINAL
```

## 7. Select the execution surface before forming executable work

Keep execution surface separate from authority and from evidence interpretation.
The current Local Operations surface classes are:

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
arguments, Git recovery, or polling logic.

### macOS human transport

The corresponding Mac human transport is:

```text
one downloadable ZIP
+ exactly one Bash copy/paste command
+ one canonical result ZIP
```

The Bash transport verifies/extracts the package and delegates to the accepted
source-managed `.command` runner mechanics (for example the exact task-bound
`RUN-VEX-TASK.command` family). Human transport does **not** require Finder
double-click and must not invent a second Mac runner.

A host-local relay proves a host-local effect only. It is not Independent
Assurance or lifecycle approval.

## 8. EDGE versus CAGE: continue mechanics, hold real boundaries

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

A provider failing to allocate a hosted runner before repository code executes
is provider/execution-surface evidence, not a candidate source failure.

## 9. Evidence has multiple independent dimensions

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

## 10. Attribute failures to the layer that actually failed

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

## 11. Retry, successor, and dependency sequencing

For the **same semantic task**, preserve the task/lane/work/candidate binding and
rotate attempt-local identity/evidence. Do not create a new task merely because
an attempt failed.

A genuinely new semantic task requires a fresh successor identity and exact
source/authority placement. Never hide a new frontier inside a terminal lane.

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
as safely possible and record:

```text
who owns the blocking seam
exact path/predicate
safe parallel work remaining
wake predicate
wake route
claim state
```

`WAITING` is a lifecycle state, not permission to disappear.

## 12. Independent Assurance is exact and goes stale on head change

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

Any source-head change makes the prior clearance historical. A Coder-authored
self-audit can be useful evidence but is not independent clearance.

If Assurance finds a bounded source defect, return to the same Coder lane,
correct only the evidence-backed finding, regenerate exact consequences, re-run
causal gates, and obtain fresh Assurance.

## 13. Lifecycle progression after technical clearance

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
→ dependent-lane wakes
→ F15 terminal return
```

Do not infer the next effect merely because the previous one succeeded.

## 14. Checkpoint is not terminal

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

Even merge is not terminal until the required post-merge verification,
coordination cleanup, and return/wake obligations are complete.

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
MERGE != TERMINAL_RETURN
```

## 15. Convergence and dependent wakes are part of completion

A child does not need to implement every parent frontier. It **does** need to
return its accepted result to the parent and wake every known dependent whose
blocking predicate became true.

Examples of causal wake classes:

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

## 16. Victor's role is irreducibly human, not technical state interpreter

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

## 17. Cold-start checklist

Before mutation, relay delivery, Assurance, lifecycle effect, retry/successor, or
terminal return, be able to answer `YES` to every applicable item:

```text
entry/lane identity exact?
live main/head/tree/current claims re-grounded?
required orientation sources consumed?
exact current authority covers this effect?
authored and generated membranes distinct?
actual Git author + DCO trailer known before commit?
execution surface selected before executable handoff?
Windows exactly one PowerShell command / Mac exactly one Bash command?
causal evidence bound to exact candidate, not latest?
failure attributed to the layer that actually executed?
EDGE continued now; CAGE records exact release predicate?
same-task retry preserves task identity?
new semantic successor has fresh identity and source placement?
Assurance fresh for exact head?
lifecycle effects individually re-grounded?
post-merge verification and claim release complete?
known dependents/parent have been woken/returned?
Victor asked only for irreducible human action?
hidden Local action remaining is truthfully NONE before terminal return?
```

If an applicable answer is `NO`, the affected effect remains held.

<!-- [VXG RealForever] -->
