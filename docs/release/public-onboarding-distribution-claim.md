# VexLife Public Alpha — onboarding and distribution claim

`[VXG RealForever]`

This is the history-preserving same-lane currentization of the DCO-safe Public
Alpha onboarding/distribution source from `github.issue.vexlife.175` / draft PR
`#177`. It preserves PR #176/#177 formation provenance without treating the
August source snapshot, expired lease, or old Windows-only copy as current
product truth.

```text
schemaVersion=vexlife.public-alpha.onboarding-distribution.claim/v3
issueRef=github.issue.vexlife.175
parentOnbDistRef=github.issue.vextreme-sdk.914
prRef=github.pull.vexlife.177
repository=vgong24/VexLife
laneRef=lane.vexlife.public-alpha.onboarding-distribution.ee29651d-769d-432c-8969-966ee31dc724
workRef=work.vexlife.public-alpha.onboarding-distribution.f663d2cc-d82d-43b3-8c56-3a2c774b9e2d
branch=VXG-082126-ops-vexlife-public-alpha-onboarding-dco2
historicalHead=c6a6235330ed8be06c6e20f6ba12f86731e6123e
historicalTree=add4686d9866ffb38cfb7930fa5907ae28f2551f
currentMainAtSuccessor=6f5a2a905c06c13d3a8096003b7a5b57be4ed329
currentMainTreeAtSuccessor=e7a26e873c2fae608e4f4929b524aa4b2f736000
historicalClaimRef=claim.vexlife.public-alpha.onboarding-distribution.8e757f7e-302e-41b9-9801-38f9b397666d
historicalClaimLeaseState=EXPIRED_2026-08-24
freshClaimRef=claim.vexlife.public-alpha.onboarding-distribution.f8f7ef35-b38a-4542-b2b1-5be65578f3f4
freshClaimReceipt=github.comment.vexlife.177.5445567299
freshClaimRenewBy=2026-08-28
claimState=ACTIVE_SUCCESSOR_CURRENTIZATION
semanticRelation=SAME_SEMANTIC_TASK
```

## Why currentization is required

The original #177 source correctly established the public journey grammar,
localization shape, zero-effect browser boundary, and five-chapter projection of
the accepted thirteen-stage onboarding spine. It later became stale because
accepted source advanced substantially while the draft remained parked.

Current accepted source now establishes:

```text
Windows 10/11 x64 + compatible NVIDIA GPU/driver
  = RELEASE_QUALIFIED source-local profile
  = source front door: setup-vexlife.cmd

macOS arm64 + exact Apple M4 Pro
  = RELEASE_QUALIFIED source-local profile
  = stable exact-source bootstrap: setup-vexlife.command
  = state-detect-first + explicit Home/effect consent

Linux and other Mac/GPU combinations
  = do not inherit either qualification

unsigned local release-candidate construction
  = accepted deterministic owner (#179)
  != public GitHub Release
  != signed/OFFICIAL build
```

Accepted Mac lineage is consumed from `github.issue.vexlife.194`,
`github.issue.vexlife.218`, merged `github.pull.vexlife.235`, and terminal return
`github.comment.vexlife.235.5436167426`. The parent ONB-DIST convergence return
is `github.comment.vextreme-sdk.914.5436247958`; the explicit #177 wake is
`github.comment.vexlife.177.5436238178`.

## Exact current writer membrane

```text
docs/release/public-onboarding-distribution-claim.md
docs/release/public-onboarding-multi-lens-review.md
pages/vexlife-onboarding.html
pages/vexlife-onboarding.css
pages/vexlife-onboarding.js
pages/strings/vexlife-onboarding.en.json
pages/strings/vexlife-onboarding.ja.json
pages/strings/vexlife-onboarding.zh.json
scripts/public-onboarding-practicum.mjs
test/public-onboarding-practicum.test.mjs
source-manifest-parts/bucket-70.json
source-manifest-parts/bucket-61.json
source-manifest-parts/bucket-a3.json
source-manifest-parts/bucket-2b.json
source-manifest-parts/bucket-da.json
source-manifest-parts/bucket-45.json
source-manifest-parts/bucket-d1.json
source-manifest-parts/bucket-a9.json
source-manifest-parts/bucket-4d.json
source-manifest-parts/bucket-25.json
```

The generated bucket files are rebuilt from the current-main co-bucket records
plus this lane's exact final UTF-8 source records. Historical bucket bytes are
not replayed over current `main`.

## Public journey owned by this lane

```text
EXPLAIN
→ OBTAIN
→ VERIFY
→ ESTABLISH
→ MEET
→ RECOVER
```

The page remains a zero-effect explanation surface. It composes current owners;
it does not absorb them. Windows/Mac setup owners retain setup and lifecycle
semantics. The release-candidate owner retains unsigned candidate construction.
First Home, Public Home, P11, signing, release publication and Pages deployment
remain separate owners/effects.

## Uploadability classes remain distinct

```text
PR_SOURCE_UPLOAD
!= RELEASE_ARTIFACT_UPLOAD
!= PAGES_PUBLICATION
!= REVIEW_EVIDENCE_RETURN
!= FUTURE_COMMUNITY_PACKAGE_INGESTION
```

The repository is already public. This lane neither changes visibility nor uses
public repository visibility as evidence that Pages, a GitHub Release, or a
signed build exists.

## Permanent non-collapse / held effects

```text
PAGES_VISIT != DOWNLOAD
DOWNLOAD != VERIFIED_RELEASE
UNSIGNED_LOCAL_RELEASE_CANDIDATE != PUBLIC_GITHUB_RELEASE
VERIFIED_RELEASE != SIGNED_OFFICIAL_BUILD
SOURCE_SETUP != NATIVE_INSTALLER
SETUP_SUCCESS != FIRST_REAL_COMPANION_EXCHANGE
BROWSER_LOADED != MODEL_READY
UNINSTALL_PRESERVE != DELETE_HOME
MODEL_PROVIDER != VEX_IDENTITY
EN_ZH_JA_POC != ALL_LOCALES_COMPLETE
E2E_BROWSER_SIMULATION != HUMAN_P11_ACCEPTANCE
DESIGN_REVIEW_ARTIFACT != PRODUCT_SOURCE
PUBLIC_REPOSITORY != PAGES_PUBLICATION
```

Held by this lane:

```text
Pages enablement/deployment
GitHub Release creation/upload
signing / OFFICIAL_VERIFIED_BUILD
P11 fresh-human/fresh-machine acceptance
Home or Memory mutation/deletion
model/runtime activation or training as a lifecycle side effect
force/reset/rebase/amend/squash/history rewrite
```

The source candidate may proceed through deterministic proof, fresh claimless
Independent Assurance, exact lifecycle review, ordinary merge and post-merge
verification when each exact current gate is earned. Those source-lifecycle
effects do not manufacture any held public-distribution effect.

<!-- [VXG RealForever] -->
