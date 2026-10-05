# VexLife Android platform workspace

`[VXG RealForever]`

This directory is the durable Android platform adoption workspace for VexLife.
It consumes canonical VexLife semantics; it does not redefine them.

Current A2 boundary:

```text
canonical universal State Relay
  -> immutable VexStateSnapshot projection
  -> read-only Kotlin StateFlow
```

Permanent boundaries:

```text
ANDROID_PROJECTION != CANONICAL_PRODUCT_SEMANTICS
STATEFLOW != EVENT_LEDGER
LATEST_RECEIVED != LATEST_COHERENT
EFFECT_WORK_STAYS_OUTSIDE_REDUCERS
```

The first `state-relay` module is pure Kotlin/JVM so state projection contracts
can be compiled and tested independently of Android UI/runtime activation.
Compose, app/Manifest/resources, Home/network/model, install, signing and
publication remain outside this stage.

Generated Gradle wrapper files are source-managed mechanical custody. Build
outputs remain ephemeral.

<!-- [VXG RealForever] -->
