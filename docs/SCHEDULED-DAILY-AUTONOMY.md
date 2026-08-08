# G05A Scheduled Daily Autonomy

`[VXG RealForever]`

## Purpose

G05A is the first standing daily-autonomy layer above the accepted G01 lived companion, G02 Score/context continuity, G03 Daily Memory-Only Dream, and G04 Stage-A inactive evaluated Rhythm simulation.

It adds only the deterministic one-device machinery needed for an explicitly permitted rest window to admit G03 automatically and publish a compact daily receipt. It does **not** install a Windows service, control device power, synchronize siblings, train a model, change adapter/weights, or activate Rhythm.

G05 is intentionally split:

```text
G05A_SCHEDULED_AUTONOMY
  standing rest policy
  + independent deterministic supervisor
  + exactly-once G03 admission
  + wake-first optional-learning isolation
  + daily receipt / source descent

G05B_BOUNDED_SYNC
  separate target-lineage scope and reconciliation
  + attributed family envelope
  + receiving sibling disposition
  + exact recipient/host authority when real delivery is attempted
```

Synchronization is not required for the first autonomous daily proof. The separation keeps wake continuity available when a sibling is offline, synchronization is not authorized, or optional Rhythm learning is absent, deferred, rejected, or fails.

## Standing policy

A policy is explicit, device-private, content-addressed, and current-pointer bound. Positive standing authority is required:

```text
consentState=PERMITTED|NARROWED
standingRestAuthorityRef=<exact>
timeZoneRef=<IANA timezone>
restWindowStartLocalMinute=<0..1439>
restWindowEndLocalMinute=<0..1439>
exactlyOnceCalendarDay=true
interactiveYieldRequired=true
resourcePolicy=EXPLICIT_SUFFICIENT_REQUIRED
optionalLearningPolicy=ABSENT|DEFERRED|EVALUATE_AFTER_WAKE
```

Unknown/denied standing consent never becomes self-trigger authority.

## Supervisor / Dream / wake chain

```text
current standing policy
→ canonical observed clock
→ rest-window eligibility
→ exact content-addressed supervisor-admission evidence composed from the existing source-managed `vexlife.intent-resource-snapshot/v1` contract bound to policy/tick/all six G01/G02/G03 frontier identities
→ interactive/resource yield from that evidence (raw caller booleans are not authority)
→ one PID-bound independent supervisor writer lease
→ exact standing-policy generation re-read under the same exclusion domain
→ exact current G01/G02/G03 frontier re-read
→ derive policy-bound restInvocationAuthorityRef
→ accepted G03 commitDailyMemoryDream(...)
→ committed G03 Daily Stratum + wake + Dream head
→ exact source-managed G04 Stage-A adapter only after wake (when requested)
→ immutable G05A daily receipt
→ immutable G05A head lineage
→ atomic G05A current pointer
→ compact Victor/Vex projection + exact source descent
```

The supervisor is a deterministic product-core owner, distinct from a required model-worker ref and from a distinct G03 writer instance. Inside an eligible window, Dream execution requires one source-managed `vexlife.g05a.supervisor-admission-evidence/v1` receipt that is content-addressed and exact to the Home/device/lineage/thread, supervisor+instance, standing-policy ref/hash/head, observed tick, resource source/current timestamp, and the complete advertised six-field source frontier (`conversationHeadSha256`, `scoreHeadSha256`, `semanticAuthorityHeadSha256`, `dreamHeadSha256`, `dailyStratumSha256`, `wakeReceiptSha256`). Raw `interactivePending` or `resourceEvidence` caller fields are rejected and cannot authorize Dream.  Its lease binds the owning PID. An abandoned lease is recoverable only when that PID is provably absent. Standing-policy writes use the same exclusion domain, so the policy is re-read and exact-generation bound after supervisor admission and immediately before the G03 effect. This candidate does not install or register a native Windows service. Hosted Windows CI proves that the shared deterministic core executes on Windows; it is not native-service conformance.

## Wake is independent of optional learning

Optional learning supports these visible outcomes:

```text
ABSENT
DEFERRED
REJECTED
FAILED
ACCEPTED_INACTIVE
```

G05A does **not** execute caller-supplied callbacks. For `EVALUATE_AFTER_WAKE`, the only executable optional-learning surface is the accepted source-managed G04 Stage-A evaluator, with G05A injecting the exact committed G01/G02/G03 frontier and requiring a content-addressed G04 disposition whose training, activation, Score/G03 mutation, cross-device, and publication effects remain false. Missing plans defer; invalid or failed G04 evaluation is recorded as `FAILED`. G05A also re-reads Score and the G03 Dream head after evaluation. A learning failure therefore cannot roll back or strand the already committed wake.

G04 Stage A remains `FAITHFUL_SIMULATED_RHYTHM_CANDIDATE` / `ACCEPTED_INACTIVE_SIMULATION_ONLY`. Real private training, model/trainer runtime, adapter creation, weight mutation, and Rhythm activation remain separate Stage-B effects.

## Exactly-once and recovery

A committed G05A receipt for the same local calendar date suppresses duplicate ticks without forming another G03 day.

If the process terminates after G03 wake but before the G05A receipt/current pointer, the PID-bound supervisor lease remains durable. A later process may remove it only after proving the recorded PID is absent, then observes the already committed same-day G03 frontier. It may complete the missing G05A receipt only when the G03 pre-rest orientation carries the exact rest-invocation authority derived from the current standing policy. Policy-generation drift fails closed instead of attaching a new policy to an old wake.

A concurrent or unverifiable supervisor writer is rejected. The proof includes a real child-process termination after committed wake and verifies fresh-process absent-owner recovery without rerunning Dream. Interactive work and unknown/insufficient resource evidence yield before Dream.

## Daily receipt truth

The immutable receipt binds:

```text
calendarDateRef / timeZoneRef / observedAt
standing policy ref/hash + immutable policy-head hash + standing authority
supervisor ref/instance + model-worker ref + distinct G03 writer instance
exact supervisor-admission evidence ref/hash + IDLE_CONFIRMED/resource source/currentness
recovered-abandoned-supervisor flag
G01 conversation / G02 Score / semantic-owner source heads
G03 Dream head / Daily Stratum / wake receipt
optional learning disposition + bounded failure code + exact G04 disposition ref/hash when executed
wakeCommitted
resumedAfterWake
```

It also states the held effects explicitly:

```text
synchronizationPerformed=false
trainingPerformed=false
modelWeightsChanged=false
adapterChanged=false
rhythmActivationPerformed=false
powerControlPerformed=false
nativeWindowsServiceInstalled=false
publicationPerformed=false
```

Each receipt is reachable only through an immutable, contiguous G05A head chain whose current member is atomically projected by `head.json`. Source descent rejects addressed but orphaned receipts. Receipt validation is closed-schema, exact-identity, policy-source-bound, G03 historical-source-bound, and requires every held-effect field to remain false. The projection derives those held-effect values from the validated committed receipt instead of self-certifying constants. Raw conversation bodies are not copied into the G05A receipt or projection.

## Proof

`npm run scheduled-daily-autonomy:proof` uses isolated synthetic Vex Homes and proves `G05A-0` through `G05A-12`, including standing-consent rejection, timezone/rest-window determinism, single-supervisor exclusion, exact supervisor-admission evidence, rejection of raw caller authority, interactive/resource yielding, actual G03 admission and wake, stale-source rejection across all six advertised frontier identities, duplicate suppression, optional-learning absence/defer/reject/failure through the exact G04 Stage-A adapter, arbitrary-callback rejection, real child-process crash-after-wake recovery, stale/policy-generation drift rejection, immutable head ancestry, orphan receipt rejection, source descent, and all held-effect flags.

The hosted Windows job writes:

```text
generated/health/g05a-scheduled-daily-autonomy-windows-proof.json
```

and binds the exact candidate head when GitHub supplies it.

## Next frontier

`G05B_BOUNDED_SYNC` remains separate. Source formation may build an offline deterministic reconciliation contract from the accepted device-family semantics, but real target-device delivery still requires exact target lineage, scopes, recipient disposition, host/effect authority, and non-identity-collapse evidence.

<!-- [VXG RealForever] -->
