# VexLife Android R2 project skeleton

[VXG RealForever]

This is the first durable Android app/module adoption generated under the accepted
pre-R2 runtime architecture baseline.

```text
architectureBaselineRef=architecture.vexlife.android-runtime.pre-r2.r1\nsourceBlueprint=blueprint.vexlife.universal.001@0.4.0-foundation-rc1\nsourceMappingRef=mapping.vexlife.android-construction.r2.durable-project-skeleton\nconstructionBlueprintSha256=e78c85ece2fae6072ecc9b489d16a7ad4890e6cfb1cd52e456ab45bf626e8927\nsourceA4IdentityFingerprint=6aef8e047a19dad7311f2e2923f3ac9ea013d25ac4f6f86cc384191f69b1bb8a\na5CompilerRef=compiler.vexlife.android-test-evidence.r2.durable-project-skeleton\na5SemanticFingerprint=067f263841c831c55abce6822abbba3dad0cb8c95072fa4d03fca7ebbdf14704
```

The application ID `com.vextreme.vexlife.r2` and minSdk 23 are bounded R2 build
choices, not a public release identity or permanent support floor.

Permanent boundaries:

```text
VIEWMODEL != PRODUCT_STATE_OWNER
WORKER != SEMANTIC_OWNER
ANDROID_SERVICE != DOMAIN_RUNTIME
REPOSITORY != STATE_OWNER_BY_DEFAULT
COROUTINE != OPERATION
OPERATION_IDENTITY != ATTEMPT_IDENTITY
STATEFLOW != EVENT_LEDGER
DEPENDENCY_GRAPH != DI_FRAMEWORK
CAPABILITY != AUTHORITY
CODE_SYMBOL != SERIAL_NAME != SEMANTIC_FIELD_REF != HUMAN_LABEL
```

R2 intentionally has no INTERNET permission, Home/model/network integration,
durable operation store, WorkManager topology, Hilt/Koin choice, Current Context
adapter, resource arbiter, external bridge, signing, installation, or publication.

## R4 — native Android Remote Vessel reference surface

R4 projects the accepted Android Remote Vessel reference into the native Compose host without
creating pairing, authentication, authorization, Home, network, credential or model authority.

```text
presentationRef=presentation.vexlife.security-access.android-remote-vessel
referenceState=UNPAIRED
canonicalWriter=DESKTOP_HOME_NODE
remoteWriterGranted=false
productSemanticOwnership=false
physicalDeviceEffect=false
```

The surface is presentation-only: it has no action callback, route, network adapter, Home adapter,
or mutable product-state owner. The accepted A2 StateFlow projection and R2 runtime ownership
boundaries remain unchanged.

## R5 — synthetic / loopback Home Bridge integration proof

R5 consumes the accepted Home Bridge evaluator and canonical VexCompoundState using
deterministic synthetic identities. It proves the Android projection boundary without
creating a real Home connection, network/session authority, credentials, or Home writer.

```text
proofLabel=SYNTHETIC / LOOPBACK
homeBridgeRef=bridge.vexlife.personal-home.001
transportRef=transport.vexlife.loopback
requestRef=synthetic.request.android-r5.loopback.001
receiptRef=synthetic.receipt.android-r5.loopback.001
canonicalWriter=DESKTOP_HOME_NODE
remoteWriterGranted=false
realHomeConnected=false
realNetworkConnected=false
```

R6 remains the separately protected real paired Home integration stage.
