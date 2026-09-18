# Third-party notices

The foundation launch-pack audit found no npm dependency, development dependency,
lockfile, vendored package, external browser asset, or CDN asset. Runtime source
imports use Node.js built-ins or local modules. No other third-party code was
identified in launch pack v0.4; this is a provenance record, not a warranty about
all possible rights.

## Runtime artifacts referenced by operational profiles

Operational profiles may reference external runtime/model artifacts without
vendoring them into this repository. A profile reference does not itself grant
network, installation, activation, redistribution, publication, or official-build
authority.

The current Windows source-local `RELEASE_QUALIFIED` operational profile references:

- **llama.cpp b10107** at immutable revision
  `c0bc8591e8815c63cb01dd3f051a8b0df02501c9`, distributed by the ggml-org
  project under the MIT License. The profile pins the Windows x64 CUDA 12.4
  runtime archive (`247064556` bytes) and CUDA-runtime archive (`391443627`
  bytes) by exact SHA-256 and records the upstream license as the controlling
  runtime notice.
- **Qwen3.5-4B** GGUF derivative artifacts published by `bartowski` from the
  Qwen3.5-4B model family. The selected Q4_K_M model (`3013027808` bytes) and
  BF16 projector (`675569216` bytes) are pinned to exact repository revisions
  and SHA-256 digests. The model repository declares Apache-2.0.

`RELEASE_QUALIFIED` here means the current VexLife source-local Windows setup may
resolve these exact upstream artifacts for the admitted local companion route. It
does **not** mean VexLife redistributes the model/runtime bytes, that a signed or
public `OFFICIAL_VERIFIED_BUILD` exists, or that public distribution rights have
been separately cleared.

The artifacts remain external to canonical VexLife source. Download providers
are transport locations, not Vex identity or artifact identity.

## Contributor Covenant 3.0

`CODE_OF_CONDUCT.md` is adapted from Contributor Covenant 3.0, permanently
available at <https://www.contributor-covenant.org/version/3/0/> and sourced from
the Organization for Ethical Source repository at commit
`7255a28d23d5bc296de2e4e4e9bb5ee1126f1345`.

Contributor Covenant is stewarded by the Organization for Ethical Source and
licensed under Creative Commons Attribution-ShareAlike 4.0 International:
<https://creativecommons.org/licenses/by-sa/4.0/>.

## Developer Certificate of Origin 1.1

`CONTRIBUTING.md` reproduces the Developer's Certificate of Origin 1.1 verbatim.
Copyright (C) 2004, 2006 The Linux Foundation and its contributors. Everyone is
permitted to copy and distribute verbatim copies of that document, but changing it
is not allowed. Canonical source: <https://developercertificate.org/>.

## GitHub Actions

The CI workflows reference, but do not vendor:

- `actions/checkout` v4.2.2 at commit
  `11bd71901bbe5b1630ceea73d27597364c9af683`, licensed under MIT.
- `actions/setup-node` v4.4.0 at commit
  `49933ea5288caeca8642d1e84afbd3f7d6820020`, licensed under MIT.

Their repositories and controlling license files remain the authoritative notices.
Any future dependency or third-party material must record its exact origin,
version, license, required notices, and preferred source before admission.

<!-- [VXG RealForever] -->
