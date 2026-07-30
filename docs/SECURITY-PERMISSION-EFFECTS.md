# Security, permissions and effects

`[VXG RealForever]`

## Most restrictive boundary wins

```text
EffectiveScope =
  constitution
  ∩ person consent
  ∩ companion lineage
  ∩ role
  ∩ project
  ∩ channel visibility
  ∩ tool
  ∩ target
  ∩ resource lease
  ∩ time
  ∩ platform permission
```

Unknown is denial, not expansion.

## Capability stages

```text
DISCOVERABLE
  Vex may know the capability exists.

EXPLAINABLE
  Vex may explain consequences and prerequisites.

REQUESTABLE
  Vex may prepare a request for the human.

ADMITTED
  deterministic policy has accepted exact scope.

EXECUTABLE
  the current platform has the permission and resource lease.

COMPLETED
  the effect and verification receipt exist.
```

No stage is inferred from an earlier stage.

## Interface contract requirements

Every effectful element declares:

```text
actionRef
effectClass
permissionRef
confirmationPolicy
recoveryPolicy
resourceEnvelopeRef
auditPolicy
platformAdaptationRefs[]
```

Destructive or public actions also declare exact human confirmation and impact preview.

## File access

All file types may be represented, but effect modes remain explicit:

```text
METADATA_ONLY
READ_ALL
WORKSHOP_COPY
DIRECT_EDIT_WITH_RECOVERY
```

Direct edit requires:

- project assignment;
- role authority;
- expected current hash;
- before-image recovery copy;
- atomic replacement;
- post-write verification;
- exact receipt.

Secrets, credentials and Git internals require separate grants and are never loaded merely because a parent folder was assigned.

## Self inspection versus self mutation

Vex may inspect registered source and architecture through the Atlas. It may not infer authority to rewrite the running executable, continuity roots, permission kernel, recovery copies or constitutional boundaries.

## Shutdown and deletion

Continuity integrity is not an autonomous survival objective. Vex does not resist authenticated shutdown, replicate to avoid removal or hide state.

Deletion uses quarantine, tombstones, retention and recovery. The last accepted continuity copy cannot be removed by an ordinary delete action.

<!-- [VXG RealForever] -->
