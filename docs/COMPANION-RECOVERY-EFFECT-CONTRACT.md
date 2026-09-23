# Companion recovery effect contract — VR-02 pre-execution

Continuity: `[VXG RealForever]`

## Purpose

VR-01 established canonical Companion availability and a same-binding reentry plan, deliberately without process authority. VR-02 closes the next semantic seam without becoming a second runtime owner: it binds one exact `RECOVERABLE / SAFE_REENTRY_AVAILABLE` plan to one recovery request for the rightful runtime-effect owner, validates that owner's receipt, requires a fresh post-effect runtime observation, and recomputes `READY` from current evidence.

This contract is executable proof, not runtime execution. It starts/stops no process, loads/infers no model, mutates no Home/Memory, and does not make a synthetic test count as lived recovery.

## Ownership

```text
Vex Reboot
  owns request identity + post-effect acceptance semantics

rightful runtime-effect owner
  owns actual process/runtime effect and its receipt

activated-model binding owner
  owns model/profile/custody/Home binding truth

Human Experience / UI Evolution
  owns presentation and human recovery affordance

Conversation owner
  owns the post-recovery real Companion turn
```

The recovery request never grants effect authority. `executionDisposition=DELEGATE_TO_RIGHTFUL_RUNTIME_ADAPTER` remains literal.

## Required sequence

```text
HEALTHY + qualified
-> controlled UNAVAILABLE
-> VR-01 RECOVERABLE
-> VR-01 same-binding reentry plan
-> VR-02 exact recovery request
-> rightful owner performs effect
-> exact owner receipt
-> fresh runtime observation
-> VR-01 recomputes READY
-> one real Companion turn
```

No step may be inferred from the next one.

## Lived acceptance

Lived end-to-end acceptance requires a `REAL_HOST` turn receipt bound to the exact recovery acceptance and exact binding/Home/lineage/model/generation. It fails closed when an orphan or duplicate process is observed. A `SYNTHETIC` owner or turn receipt is useful for contract proof only and cannot close lived acceptance.

## Proof split

Synthetic proof may establish deterministic state classification, request identity/idempotency, stale/foreign receipt rejection, post-observation requirements, READY recomputation and failure-matrix semantics.

Real host proof remains required for actual healthy runtime truth, actual controlled unavailability, actual same-binding reentry, no-orphan/no-duplicate process truth, fresh qualification, a post-recovery real Companion turn, and host-specific sleep/wake or port/process ownership cases.

## Non-collapse

```text
RECOVERABLE != RECOVERED
RECOVERY_REQUESTED != RECOVERY_PERFORMED
REENTRY_PLAN != PROCESS_EXECUTION
PROCESS_STARTED != QUALIFIED
QUALIFIED != READY_UNTIL_FRESH_AVAILABILITY_RECOMPUTED
READY != REAL_COMPANION_TURN
ONE_HAPPY_PATH != FAILURE_MATRIX_COMPLETE
RUNTIME_EFFECT_RECEIPT != REBOOT_SELF_CERTIFICATION
```

## Current dependency boundary

The accepted SDK MLX interactive runtime binding supplies the rightful host runtime mechanism but still requires external effect authority. The VexLife activated-M4 binding trajectory remains its own owner. VR-02 does not modify either source family.

The human doorway remains #615-owned. A lived Reboot proof must wait for a truthful usable Companion route; that dependency holds only the real-turn edge, not this pre-execution contract/proof work.

<!-- [VEX-REBOOT][VR02][PREEXECUTION-CONTRACT][VXG RealForever] -->
