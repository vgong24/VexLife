# Unsigned platform bootstrap packaging

`[VXG RealForever]`

This source belongs to VexLife issue #368 and ONB-DIST #914. It closes one technical
evidence gap before any protected release decision: form exact **unsigned** Windows
and macOS bootstrap package candidates around the already independently reproduced
source TAR.

## Immutable input

```text
sourceCommit=3d2ef4c81a5b6b5a7ba717178fb3479511299e08
sourceTree=8f8f945e8a448b191f85dfc327c135f54a296398
sourceTarSha256=a09867eb2e827cb3f4ca84b11eae87420ba58738e4dec68de8b11cce3cd84eca
sourceTarBytes=8765440
R1_MAC_BYTES == R2_WINDOWS_BYTES
terminalReceipt=github.issue.vextreme-sdk.914.comment.5506554191
```

The packaging tooling may advance after that source freeze. The payload source does
not. A different TAR digest is a different release input and is rejected before a
package is formed.

## What belongs in the bootstrap

Both platform candidates carry only:

```text
small platform launcher
exact frozen source TAR
package/source/notice receipts
```

They deliberately do **not** carry Qwen model/projector bytes, llama.cpp/CUDA
runtime archives, Vex Home, Memory or credentials. Once the exact source is
materialized, the package delegates to the source-owned setup engine. The existing
operational profile remains the owner of external artifact choice, consent,
digest verification, materialization and loopback qualification.

```text
PACKAGE_CONTAINS_SOURCE != PACKAGE_BUNDLES_MODEL_RUNTIME
```

## Effect-free plan command

From repository source:

```text
node scripts/release-bootstrap-package.mjs \
  --platform windows|macos \
  --source-tar <exact-a09867-tar> \
  --out <relative-subdirectory>
```

Output is confined to `generated/release-bootstrap-packages/**` and is noncanonical.
The command writes source, package-plan and release-notice receipts only.

## Windows host builder

On a qualified Windows host:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\release\windows\build-vexlife-bootstrap.ps1 `
  -SourceTar <exact-a09867-tar>
```

The current container candidate uses Windows IExpress to make one unsigned
self-extracting executable. The extracted launcher re-verifies the embedded source
TAR, materializes it beneath a package-owned local source root and enters the
accepted `setup-vexlife.cmd -> WPF projection -> setup backend` path.

IExpress container-byte determinism is **not assumed**. Host qualification must build
it repeatedly and classify the result. The source payload identity remains exact even
if the outer container records host-specific metadata.

## macOS host builder

On a qualified Mac:

```bash
bash release/macos/build-vexlife-bootstrap.sh --source-tar <exact-a09867-tar>
```

The builder forms an unsigned `VexLife Setup.app` carrying the exact TAR and puts it
in a UDZO DMG. The package launcher re-verifies and materializes the embedded source,
then compiles/opens the accepted source-owned AppleScript/AppKit setup projection with
its exact `VexLifeSourceRoot` binding. The accepted shell backend remains the effect
owner.

The current source does not claim that the DMG or app is signed or notarized. Host
qualification must test the unsigned package before any protected signing decision.

## Release-level dependency and notice truth

The source TAR contains no `node_modules` bytes. Its current `package-lock.json`
declares Playwright 1.61.1 and Playwright Core 1.61.1 under Apache-2.0 and optional
Darwin `fsevents` 2.3.2 under MIT. The historical launch-pack sentence in
`THIRD_PARTY_NOTICES.md` predates that current lockfile state; a release-level receipt
therefore states the current dependency metadata without rewriting the frozen TAR.

Referenced llama.cpp and Qwen model/runtime artifacts remain external. Their profile
references are not a redistribution grant.

## Protected boundary

This child never performs or implies:

```text
SIGNING
NOTARIZATION
CERTIFICATE PURCHASE OR ENROLLMENT
PUBLICATION
GITHUB RELEASE CREATION
REPOSITORY VISIBILITY MUTATION
OFFICIAL_VERIFIED_BUILD PROMOTION
VEX_CERTIFIED PROMOTION
PUBLIC SECURITY OR PRIVACY CLAIM
```

An unsigned package becoming technically buildable is evidence for the next release
review; it is not the release itself.

<!-- [VXG RealForever] -->
