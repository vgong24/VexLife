# VexLife Experience Foundation

`[VXG RealForever]`

```text
schemaVersion=vexlife.experience-foundation/v1
formationRef=github.issue.vexlife.418
workRef=work.vexlife.experience-foundation.f39c1bd2-4c92-4bb9-81b2-f0632bd8c14f
implementationState=SOURCE_IMPLEMENTED__PENDING_EXACT_GENERATED_CLOSURE_AND_FINAL_REVIEW
```

## Purpose

The Experience Foundation composes the existing VexLife Experience, Interface Builder,
Capability, Action, Process, Registry, localization and test owners so one semantic action
can be projected truthfully across human-visible UI, platform-native controls, operator/Devex
commands and evidence without creating parallel semantic owners.

The foundation extends current architecture. It does not replace E2.7/E2.8, invent another
Experience compiler, or make a browser redesign.

## Permanent identity and ownership rules

```text
ELEMENT_REF != LABEL_STRING_REF
ACTION_REF != INTERACTION_FORM
ACTION_REF != BUTTON
ACTION_REF != SLASH_ALIAS
ACTION_REF != MODEL_TOOL
COMPONENT != EXPERIENCE_PATTERN
EXPERIENCE_PATTERN != FEATURE
INTERACTION_FORM != SEMANTIC_MEANING
COMMAND_BINDING != EFFECT_AUTHORITY
AVAILABILITY != PERMISSION
AVAILABILITY != CAPABILITY_STAGE
EXPOSURE != AVAILABILITY
PERSONAL_LAYOUT != CANONICAL_TOPOLOGY
PROJECTION != CANONICAL_MEANING
EXPERIENCE_REVISION != MODEL_MEMORY
```

`elementRef` remains VexLife's stable product element identity. Copy, localization, theme and
platform presentation may change without renaming canonical element/action identities.

## Experience child structures

The existing Experience Registry owns reusable child identities for:

```text
EXPERIENCE_PATTERN
  reusable human-problem / interaction composition above component mechanics

INTERACTION_FORM
  platform/consumer expression of one semantic action/component

EXPOSURE_CLASS
  discoverability policy such as PRIMARY, CONTEXTUAL, RECOVERY or EXPERT

AVAILABILITY_STATE
  visible availability with typed reason and recovery refs
```

These records do not own domain meaning. They reference current canonical owners.

## Command bindings

Commands are a typed projection over existing Capability, Action and Process semantics.

```text
commandRef
  -> capabilityRef
  -> actionRef(s)
  -> optional processRef
  -> permission/effect/resource semantics inherited from current owners
  -> interaction aliases/forms
```

```text
SLASH_STRING != COMMAND_IDENTITY
SLASH_STRING != HUMAN_MESSAGE
UNKNOWN_SLASH_COMMAND != MODEL_TURN
```

This foundation defines and validates command identities only. Input routing and model-turn
control remain separate runtime/adaptor work.

## Derived projections

The compiled identity registry may derive a reference-only Experience source map and a
deterministic `experienceRevision`.

```text
experience source map
  semantic ref -> owner/source/consumer/pattern/form/exposure/test relationships

experienceRevision
  deterministic semantic hash over the admitted Experience/interface/capability projection
```

Derived projections never duplicate raw private text, message bodies or provider prompts.

## First-stage no-effect boundary

EFX-00 is source-only. It performs no browser, Home, Memory, model, network, publication or
external effect. Human rendering, Devex command routing, Relationships adoption and re-entry
currentness integration are bounded successors after this foundation is accepted.

<!-- [VXG RealForever] -->
