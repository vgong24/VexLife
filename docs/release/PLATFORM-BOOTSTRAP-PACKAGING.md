# Unsigned platform bootstrap packaging

`[VXG RealForever]`

This source belongs to VexLife issue #368 and ONB-DIST #914. It closes one technical
evidence gap before any protected release decision: form exact **unsigned** Windows
and macOS bootstrap package candidates around the already independently reproduced
source TAR.

## Immutable input

```text
sourceCommit=6a73b49fad78711261fc50aeae8e8cbe62c11da9
sourceTree=8cdb1e0c1f54ae526a3012c6e5c4feae9ba2be5f
sourceTarSha256=9949cfe2e95ff59f039e38b7d5c4285b4d2752f01de1904c7bb1db7275caabad
sourceTarBytes=11151360
R1_MAC_BYTES == R2_WINDOWS_BYTES
terminalReceipt=github.issue.vexlife.635.comment.5770160855
```

The packaging tooling may advance after that source freeze. The payload source does
not. A different TAR digest is a different release input and is rejected before a
package is formed.

Every package plan separately binds the **packaging-tool** Git HEAD/tree and exact Git
blob IDs for the six executable packaging sources. Planning fails if any of those
working-copy bytes differ from their committed blobs. Host build receipts then bind the
SHA-256 of that exact package plan, so immutable payload identity and packaging recipe
identity remain distinct and both are auditable.

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
  --source-tar <exact-9949cfe2-tar> \
  --out <relative-subdirectory>
```

Output is confined to `generated/release-bootstrap-packages/**` and is noncanonical.
The command writes source, package-plan and release-notice receipts only.

## Windows host builder

On a qualified Windows host:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\release\windows\build-vexlife-bootstrap.ps1 `
  -SourceTar <exact-9949cfe2-tar>
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
bash release/macos/build-vexlife-bootstrap.sh --source-tar <exact-9949cfe2-tar>
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
