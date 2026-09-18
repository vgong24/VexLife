# Platform architecture and generation

`[VXG RealForever]`

## Territories

```text
Vex Home / continuity territory
  identity, Score, Rhythm, context, trails, permissions, receipts, model manifests

Universal Blueprint territory
  product identities, interface contracts, design tokens, strings, state selectors,
  actions, permissions, tests and platform conformance requirements

Platform territory
  native rendering, lifecycle, storage, permissions, accessibility, packaging,
  process/model integration and environment-specific evidence
```

The platform is an interface into the companion home. The platform is not the companion identity.

## Canonical adapters

```kotlin
interface IVexLifePlatform {
    val platformRef: PlatformRef
    val capabilityProjection: StateFlow<PlatformCapabilities>
    val permissionProjection: StateFlow<PermissionState>

    fun render(screen: ScreenContract): PlatformScreen
    fun bind(action: ActionContract): PlatformAction
    fun localize(ref: StringRef, locale: LocaleRef): String
    fun observe(selector: StateSelectorRef): StateFlow<Projection>
    suspend fun requestPermission(ref: PermissionRef): PermissionReceipt
    suspend fun execute(intent: IntentEnvelope): EffectReceipt
    fun provideEnvironmentEvidence(): PlatformEvidence
}

interface IAtlasPlatform {
    fun inspect(ref: NodeRef, budget: QueryBudget): AtlasProjection
    fun currentScreenFrame(): ScreenFrame
    fun publishSemanticNavigation(event: NavigationEvent)
}
```

## Targets

### Browser

- TypeScript/JavaScript or another web implementation.
- Semantic DOM and stable `data-node-ref` attributes.
- URL/history and deep-link projection.
- CSS custom properties generated from semantic design tokens.
- service-worker/storage permissions declared explicitly.
- screen-frame events generated from semantic navigation, not pointer logging.

### Android

- Kotlin and Jetpack Compose.
- `StateFlow`, immutable state and structured concurrency.
- navigation routes and deep links generated from stable route refs.
- runtime permissions, activities, services, intents and broadcast receivers bound to permission/effect contracts.
- lifecycle-aware collection and cancellation proof.
- accessibility semantics and screenshot/UI tests keyed by element refs.

### iOS

- SwiftUI with KMP shared contracts or generated Swift models.
- explicit entitlements and privacy descriptions.
- scene lifecycle and background-task evidence.
- actor/structured concurrency isolation.
- accessibility identifiers equal to stable element refs.

### Windows

- Kotlin Compose Desktop, WinUI or another native adapter.
- process and filesystem capability evidence.
- package/signing lifecycle and recovery boundaries.
- native file picker mapped to project access grants.

### macOS

- SwiftUI or Compose Desktop adapter.
- app sandbox, security-scoped bookmarks and model-file access evidence.
- native menu/window behavior without changing universal screen identities.

## Generation is not string replacement

The generator does not simply rename `IVexLife` into platform classes. It emits:

- stable identity catalogs;
- platform adapter interfaces;
- string catalogs;
- design tokens;
- route and screen registries;
- permission and capability manifests;
- conformance tests and held gaps.

Handwritten platform code implements those contracts. Generated and handwritten boundaries remain visible.

## Platform-specific edge conditions

A universal action such as `action.folder.assign` may require:

```text
Browser: local server bridge or File System Access API limitation disclosure
Android: Storage Access Framework URI grant and persisted permission
macOS: security-scoped bookmark
Windows: native folder picker and ACL validation
iOS: document picker / security-scoped URL limits
```

The universal contract states the purpose and minimum safety. The platform adapter states how the environment proves it.

<!-- [VXG RealForever] -->
