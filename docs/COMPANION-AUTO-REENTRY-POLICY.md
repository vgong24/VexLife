# Companion auto-reentry policy — VR-04

Continuity: `[VXG RealForever]`

## Purpose

VR-04 defines when the product may automatically form **one existing VR-02 recovery request identity**. It does not start, stop, kill, load, infer, repair, download, activate, train, rebuild Home, mutate Memory, or choose another model/generation.

```text
READY -> NO_EFFECT

STARTING -> RETRY_IN_PROGRESS

RECOVERABLE
+ SAFE_REENTRY_AVAILABLE
+ exact VR02 recovery request
+ current rightful-owner route
+ no competing in-flight request
-> FORM_RECOVERY_REQUEST
!= PERFORM_RUNTIME_EFFECT

ACTION_REQUIRED | UNAVAILABLE | HELD
-> HELD
-> NO_AUTOMATIC_EFFECT
```

## Ownership

The policy consumes canonical Vex Reboot availability/request truth and a foreign current rightful-owner route. The route must bind the same Companion binding, Home and runtime adapter. Platform lifecycle/process mechanics remain with their current owners.

The policy output grants no effect authority. A consumer may delegate the exact request only through separately current owner authority.

## Idempotence

```text
same availability projection
+ same VR02 request
+ same rightful owner route
-> same decision

same request already in flight
-> REQUEST_ALREADY_IN_FLIGHT
-> no second delegation

different request already in flight
-> HELD
```

This keeps multiple startup callers, browser tabs, or retry surfaces from implying multiple runtime processes.

## Fail-closed boundaries

Automatic reentry never widens into model selection/swap, artifact download, activation, training, Home rebuild/delete, Memory mutation, repair, unknown-process termination or fallback generation.

Platform integration remains separately admitted after owner/currentness proof. This source is policy/proof only.

<!-- [VEX-REBOOT][VR04][AUTO-REENTRY-POLICY][VXG RealForever] -->
