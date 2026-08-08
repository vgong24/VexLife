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
→ interactive/resource yield checks
→ one independent supervisor writer lease
→ exact current G01/G02/G03 frontier re-read
→ derive policy-bound restInvocationAuthorityRef
→ accepted G03 commitDailyMemoryDream(...)
→ committed G03 Daily Stratum + wake + Dream head
→ optional learning callback only after wake
→ immutable G05A daily receipt
→ atomic G05A current pointer
→ compact Victor/Vex projection + exact source descent
```

The supervisor is a deterministic product-core owner, distinct from a model worker and from the G03 writer. This candidate does not install or register a native Windows service. Hosted Windows CI proves that the shared deterministic core executes on Windows; it is not native-service conformance.

## Wake is independent of optional learning

Optional learning supports these visible outcomes:

```text
ABSENT
DEFERRED
REJECTED
FAILED
ACCEPTED_INACTIVE
```

The callback runs only after the G03 wake is committed. `FAILED` is caught and recorded in the G05A receipt. G05A re-reads Score and the G03 Dream head after the callback and rejects any unexpected continuity mutation. A learning failure therefore cannot roll back or strand the already committed wake.

G04 Stage A remains `FAITHFUL_SIMULATED_RHYTHM_CANDIDATE` / `ACCEPTED_INACTIVE_SIMULATION_ONLY`. Real private training, model/trainer runtime, adapter creation, weight mutation, and Rhythm activation remain separate Stage-B effects.

## Exactly-once and recovery

A committed G05A receipt for the same local calendar date suppresses duplicate ticks without forming another G03 day.

If execution stops after G03 wake but before the G05A receipt/current pointer, the next exact tick observes the already committed same-day G03 frontier. It may complete the missing G05A receipt only when the G03 pre-rest orientation carries the exact rest-invocation authority derived from the current standing policy. Policy-generation drift fails closed instead of attaching a new policy to an old wake.

A concurrent supervisor writer is rejected. Interactive work and unknown/insufficient resource evidence yield before Dream.

## Daily receipt truth

The immutable receipt binds:

```text
calendarDateRef / timeZoneRef / observedAt
standing policy ref/hash + standing authority
supervisor ref/instance
G01 conversation / G02 Score / semantic-owner source heads
G03 Dream head / Daily Stratum / wake receipt
optional learning disposition + bounded failure code
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

Raw conversation bodies are not copied into the G05A receipt or projection.

## Proof

`npm run scheduled-daily-autonomy:proof` uses isolated synthetic Vex Homes and proves `G05A-0` through `G05A-12`, including standing-consent rejection, timezone/rest-window determinism, single-supervisor exclusion, interactive/resource yielding, actual G03 admission and wake, stale-source rejection, duplicate suppression, optional-learning absence/defer/reject/failure, crash-after-wake recovery, policy-drift rejection, source descent, and all held-effect flags.

The hosted Windows job writes:

```text
generated/health/g05a-scheduled-daily-autonomy-windows-proof.json
```

and binds the exact candidate head when GitHub supplies it.

## Next frontier

`G05B_BOUNDED_SYNC` remains separate. Source formation may build an offline deterministic reconciliation contract from the accepted device-family semantics, but real target-device delivery still requires exact target lineage, scopes, recipient disposition, host/effect authority, and non-identity-collapse evidence.

<!-- [VXG RealForever] -->
