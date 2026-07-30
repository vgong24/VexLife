# Blueprint changes and cross-platform adoption

`[VXG RealForever]`

## Do not break stable mains to create attention

A universal blueprint PR should not intentionally make every accepted platform main uncompilable. Instead it produces a versioned contract and adoption kits.

```text
Blueprint PR
  canonical change + impact report + browser proof
      ↓
Contract artifact
  exact blueprint version and affected refs
      ↓
Platform adoption branch per target
  regenerated catalogs + adapter stubs + conformance tests
      ↓
Native implementation and review
      ↓
Conformance receipt returns to blueprint matrix
```

## Breaking change

A breaking change increments `contractVersion` and names:

```text
changeRef
supersedesVersion
affectedNodeRefs[]
affectedPlatforms[]
requiredAdapterChanges[]
requiredTests[]
migrationNotes[]
rollbackRoute
```

Generated stubs may fail conformance tests on the **adoption branch** until the platform owner implements them. Stable releases remain usable.

## Branch and PR mapping

Suggested downstream branch:

```text
VXG-MMddyy-{platform}-adopt-{blueprintChangeSlug}
```

Every downstream PR carries the same `blueprintChangeRef` and returns:

```text
platformRef
sourceBlueprintVersion
implementedNodeRefs[]
heldNodeRefs[]
compileEvidence
uiEvidence
accessibilityEvidence
permissionEvidence
environmentEvidence
reviewRef
mergeRef?
```

## Monorepo first, multi-repository later

While platform implementations live together, the generator writes separate platform adoption directories and a local conformance matrix.

When repositories split, a release workflow can publish a blueprint artifact and dispatch adoption requests. GitHub transport is an adapter, not the source of platform identity.

## Why not compile errors everywhere?

Compile errors are useful proof inside an isolated adoption branch because they reveal unimplemented contracts. They are poor global coordination because they turn one blueprint proposal into an outage.

Use:

```text
accepted current platform version remains green
candidate adoption branch fails visibly until complete
blueprint matrix reports OUTDATED / IN_PROGRESS / CONFORMANT / HELD
```

## Bug propagation

A universal bug fix adds or updates one blueprint test. The impact report identifies every platform whose evidence depends on that contract. Each platform acknowledges completion; no one has to rediscover the original defect independently.

<!-- [VXG RealForever] -->
