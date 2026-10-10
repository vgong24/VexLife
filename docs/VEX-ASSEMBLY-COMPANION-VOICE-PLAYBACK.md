# Vex Assembly VA-I06 — Companion Voice Playback

**Anchor:** `[VXG RealForever]`
**Assembly:** `github.issue.vextreme-sdk.1796`
**VexLife placement:** `github.issue.vexlife.845`

## Purpose

VA-I06 adds the smallest VexLife product consumer for the already accepted Voice runtime package boundary. It does not copy the private SDK implementation into VexLife, publish that package, or create a second conversation/runtime owner.

The server-owned adapter runs only after one Companion turn is already durably complete. Voice failure never rewrites, rolls back, or falsifies that completed turn.

## Current-turn boundary

`readCurrentLivedCompanionCompletedTurn(...)` remains the conversation truth owner. The Voice adapter binds the in-memory completed response to the same current Home/device/lineage/thread/head/turn/response message/model and persisted response-content hash before any engine attempt.

The current-turn projection exposes only verified refs/hashes plus response/model identity. It still reports `rawConversationContentIncluded=false`; the response text used for playback stays in the already-authorized in-memory completed-turn result.

## Package and host boundary

VexLife loads only the accepted package exports from a device-private package workspace under Vex Home:

- `vextreme-sdk/voice-runtime`
- `vextreme-sdk/voice-runtime/process`
- `vextreme-sdk/voice-runtime/espeak-ng-1.52.0-distribution`
- `vextreme-sdk/voice-runtime/espeak-ng-1.52.0-profile`

No private SDK repository URL, commit identity, source path or implementation bytes are committed here. Package installation/materialization is a separate host effect. The adapter reads a content-addressed host-local binding at `runtime/voice/binding.json` and is HELD when it is absent or not current.

The host binding must match the current Vex Home/device/lineage and current qualified model operational profile. The accepted package remains responsible for validating eSpeak dependency/binding/qualification evidence, executable identity, cleared Voice profile and direct process execution.

## Product playback contract

One exact completed response becomes one semantic unit with no requested prosody controls. The accepted direct-playback port owns engine invocation and forms the engine semantic-playback receipt.

VexLife then forms `vexlife.companion-voice-playback-receipt/v1` containing only product/session lineage plus the engine receipt reference:

- `turnRef`
- `responseMessageRef`
- `conversationHeadSha256`
- `companionLineageRef`
- `HomeRef`
- `voiceProfileRef`
- `runtimeDependencyRef`
- `enginePlaybackReceiptRefOrHash`
- `engineCompletionObserved`
- `osAudioRoutingObserved`
- `humanAudibilityState`
- `formedAt`

Permanent truth split:

```text
engineCompletionObserved=true
!= osAudioRoutingObserved=true
!= humanAudibilityState=HEARD
```

The current engine proves direct engine-audio process completion. VA-I06 does not infer OS sample acceptance, speaker audibility, human hearing or semantic meaning heard.

## Held host prerequisite

The accepted canonical eSpeak 1.52.0 Runtime Dependency Materialization evidence is currently Windows-qualified. No accepted macOS artifact/binding/qualification exists yet. Therefore the source consumer may be implemented and reviewed now, while macOS lived-host playback remains held until its rightful RDM owner provides real current host evidence.

This document does not authorize Homebrew, another installer, a guessed artifact hash, network fetch, install, administrator effect, or a fabricated runtime receipt.

## Held effects

Microphone, ASR, continuous listening, Voice cloning, training, weight mutation, public/package-registry publication and human-hearing inference remain outside VA-I06.

<!-- [VXG RealForever][VEX-ASSEMBLY][VA-I06][COMPANION-VOICE] -->
