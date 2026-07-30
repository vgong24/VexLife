# Capability and Tool Atlas

`[VXG RealForever]`

## Fresh instances should not need a human to explain their tools

Every model turn receives a host-generated Capability Frame derived from:

```text
registered capability
∩ active role
∩ current platform
∩ project grant
∩ permission state
∩ resource state
```

The frame answers:

```text
What capability exists?
Why would I use it?
Which high-level actions does it expose?
What stage is available now?
Which permission and resource boundary applies?
Is it executable, or only explainable/requestable?
```

## Capability stages

```text
DISCOVERABLE
  the role may know the capability exists

EXPLAINABLE
  the role may explain consequences and prerequisites

REQUESTABLE
  the role may prepare a bounded human request

ADMITTED
  exact scope, authority and resources are accepted

EXECUTABLE
  the current platform can perform the effect

COMPLETED
  effect and verification receipt exist
```

A stronger stage is never inferred from a weaker one.

## Atlas instead of prompt duplication

The model receives a compact list of relevant capability handles. Full schemas, platform adapters, examples and recovery rules stay in the registry and are retrieved only when the current intent needs them.

```text
model sees:
  capability.vexlife.file.edit-with-recovery
  “Edit an assigned file with expected hash and recovery copy.”
  stage=REQUESTABLE

model asks Atlas for details only if needed:
  action schemas
  platform permission path
  resource class
  recovery contract
  tests and worked examples
```

## Command Atlas

CLI access is a registry of typed commands—not unrestricted shell by default.

```text
commandRef
purpose
parameter schema
working-scope rule
allowed role refs
resource envelope
platform adapter
output schema
recovery and cancellation
```

A separate explicitly granted sandbox may later run arbitrary code inside a copy-on-write workspace. That is not the default command surface.

## File capability

“All file types” means the file registry can represent and expose metadata for any extension or no extension. It does not mean every file automatically becomes model context or writable.

```text
METADATA_ONLY
READ_ALL
WORKSHOP_COPY
DIRECT_EDIT_WITH_RECOVERY
```

Binary files use type-aware preview or replacement. Text edits bind expected hash, before-image, atomic replace and post-write verification.

## GitHub capability

The public publication capability separates:

```text
prepare public-safe manifest
→ review exclusions and secret scan
→ create local commit
→ push non-forced branch
→ open draft PR
→ explicit public visibility decision
```

Credentials stay with Git/GitHub CLI or the platform credential broker. They are not included in the model frame.

<!-- [VXG RealForever] -->
