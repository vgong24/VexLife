# VexLife Public Alpha — distribution architecture and multi-lens review

`[VXG RealForever]`

```text
schemaVersion=vexlife.public-alpha.onboarding-multi-lens-review/v2
pageRef=page.vexlife.public-onboarding.001
issueRef=github.issue.vexlife.175
prRef=github.pull.vexlife.177
candidateClass=SOURCE_MANAGED_ZERO_EFFECT_PUBLIC_ONBOARDING_POC
languages=[en,ja,zh]
qualifiedPlatformClaim=WINDOWS_10_11_X64_NVIDIA_AND_MACOS_ARM64_APPLE_M4_PRO_SOURCE_LOCAL
repositoryVisibilityState=PUBLIC_CURRENT_NO_MUTATION_BY_THIS_LANE
publicationState=SOURCE_CANDIDATE
publicationAuthority=false
releaseCreationAuthority=false
signingAuthority=false
```

## Distribution pattern — simple outside, exact underneath

The public journey remains:

```text
1. EXPLAIN
   Understand VexLife, supported source-local profiles, consent and recovery.

2. OBTAIN
   Distinguish exact source / unsigned local candidate from a future governed
   public GitHub Release.

3. VERIFY
   Verify the exact intended artifact and evidence before setup.

4. ESTABLISH
   Use the accepted platform front door; software determines state and the
   human authorizes Home and external effects.

5. MEET
   A qualified local runtime and browser prove truthful readiness on loopback.

6. RECOVER
   Stop, restart, diagnose and uninstall-preserve without treating departure
   as Home deletion.
```

Current source-local front doors are platform-specific projections over accepted
effect contracts:

```text
Windows 10/11 x64 NVIDIA
  → extracted source
  → setup-vexlife.cmd

macOS arm64 exact Apple M4 Pro
  → setup-vexlife.command stable exact-source bootstrap
  → state detect first
  → explicit Home/effect consent
```

They are both `RELEASE_QUALIFIED` source-local profiles. Neither is a signed
public `OFFICIAL_VERIFIED_BUILD`. Linux and nearby but unqualified hardware do
not inherit qualification by similarity.

## “Downloadable” and “uploadable” are not one state

| Class | Meaning | Current owner/state |
| --- | --- | --- |
| `REVIEW_EVIDENCE_RETURN` | portable review proof | Experience/Review evidence only |
| `PR_SOURCE_UPLOAD` | bounded source exposed through this PR | this lane |
| `RELEASE_ARTIFACT_UPLOAD` | asset attached to governed GitHub Release | held / release owner |
| `PAGES_PUBLICATION` | accepted page deployed and publicly reachable | held / Pages lifecycle |
| `REPOSITORY_VISIBILITY` | repository public/private state | already PUBLIC; no mutation by this lane |
| `FUTURE_COMMUNITY_PACKAGE_INGESTION` | third-party package intake | out of scope |

Permanent distinctions:

```text
PORTABLE_REVIEW_FILE != PRODUCT_SOURCE
SOURCE_IN_PR != ACCEPTED_MAIN
ACCEPTED_MAIN != PUBLIC_PAGE
PUBLIC_PAGE != PUBLIC_RELEASE
UNSIGNED_LOCAL_RELEASE_CANDIDATE != PUBLIC_GITHUB_RELEASE
RELEASE_ARTIFACT != VERIFIED_ARTIFACT
VERIFIED_ARTIFACT != SIGNED_OFFICIAL_BUILD
SOURCE_SETUP != NATIVE_INSTALLER
SETUP_SUCCESS != FIRST_REAL_COMPANION_EXCHANGE
```

## Current source truth composed by this page

- VexLife is local-first; Home, conversation state, model binding and recovery
  receipts remain local unless a separately admitted capability says otherwise.
- Windows 10/11 x64 + compatible NVIDIA and macOS arm64 + exact Apple M4 Pro are
  the two current source-local `RELEASE_QUALIFIED` profiles.
- Both require at least 12 GiB system memory, 6 GiB free disk, Node.js 20+, and
  first-acquisition internet for pinned model/runtime material.
- Windows uses `setup-vexlife.cmd`; the Apple M4 Pro path uses the stable
  `setup-vexlife.command` exact-source bootstrap and state-first consent route.
- #179 can form a deterministic **unsigned local release candidate**. That is
  useful distribution evidence, not a public GitHub Release or signed build.
- `uninstall-preserve` preserves Home/Memory/conversation/recovery/model material;
  destructive Home deletion remains separate.
- the model provider/runtime is not Vex identity.
- the page itself performs no setup, download, Home, Memory, model, release,
  publication or external-origin effect.

## Thirteen exact stages, five calm human chapters

| Human chapter | Exact stage refs |
| --- | --- |
| 1. Meet VexLife | `DISCOVER` |
| 2. Check your fit | `CHOOSE_PLATFORM`, `CHECK_REQUIREMENTS` |
| 3. Obtain it safely | `DOWNLOAD`, `VERIFY_ARTIFACT` |
| 4. Set up with consent | `ESTABLISH`, `START`, `MEET_VEX`, `VERIFY_HEALTH` |
| 5. Stay in control | `UNDERSTAND_AVAILABLE_AND_HELD_FEATURES`, `LEARN_RECOVERY`, `UNDERSTAND_UNINSTALL_AND_PRESERVATION`, `COMPLETE` |

The human projection may reduce reading burden; it may not rename, duplicate,
drop or reorder canonical stage identity.

## E2.7 design lineage — consume lessons, not prototype authority

Retained lessons:

- calm dark emotional home rather than an installer wall;
- strong but restrained Vex identity;
- progressive disclosure with current/held truth visible;
- responsive composition rather than shrunken desktop;
- review evidence portable without being mistaken for product source;
- no fake active action at a held boundary.

Not copied: the single-file prototype blob, synthetic sandbox state, unimplemented
future claims, or any inference that “reviewable/downloadable” means “public
release.” The source remains inspectable HTML/CSS/JS plus explicit locale files.

## Localization and zero-effect browser boundary

The catalog contract remains:

```text
catalogSchema=vexlife.public-onboarding.strings/v1
pageRef=page.vexlife.public-onboarding.001
locales=[en,ja,zh]
keyCount=166
keySetEqualityRequired=true
sourceLocale=en
runtimePersistence=false
```

JavaScript enhances locale/chapter presentation only. English remains readable
without JavaScript. The page exposes bounded proof state through
`window.__VEXLIFE_ONBOARDING_READY__` and
`window.__VEXLIFE_ONBOARDING_STATE__`; observability is not effect authority.

# Seven-lens review

## 1. Designer lens

### Findings
The five-chapter spine still works after Mac currentization because the product
change is truth expansion, not a new information architecture. Showing two
qualified source-local profiles in one calm requirements section is clearer than
forking the onboarding page by platform.

### Acceptance criteria
- current/held states remain visually distinct without color alone;
- platform truth is scannable rather than duplicated into two separate journeys;
- no fake release/download affordance exists;
- desktop/mobile, reduced motion and increased contrast remain usable;
- EN/JA/ZH do not clip or force horizontal overflow.

### Residual risk
Exact rendered evidence is still required on the final head.

## 2. Fresh-lens review

### Findings
A cold reader now needs to learn only: VexLife is local-first, this preview is
zero-effect, two narrow source-local profiles are qualified, and public release
is still later. That is simpler and more truthful than the stale Windows-only
limitation.

### Acceptance criteria
The first screen/quick path answers what VexLife is, whether the page does
anything, which platforms are currently qualified, what setup asks, whether
recovery exists, and why no public release button exists.

### Residual risk
A future logged-out human review may still find internal vocabulary.

## 3. Human perspective

### Findings
The accepted Mac route strengthened the original human rule:

```text
SOFTWARE_DETERMINES_MACHINE_STATE
!= HUMAN_GUESSES_MACHINE_STATE

HUMAN_AUTHORIZES_HOME_AND_EXTERNAL_EFFECTS
!= SILENT_CONSENT
```

### Acceptance criteria
- consent is described before protected effects;
- state detection belongs to software;
- preservation/exit are visible before encouragement;
- “unavailable,” “held,” and “unsupported” are not collapsed;
- no language pressures the person to proceed.

### Residual risk
Browser proof cannot establish informed human consent or P11 freshness.

## 4. AI / semantic-system lens

### Findings
Stable page/locale/stage identities remain the machine bridge between visible
copy and source truth. Current platform claims are explicit enough for a future
reviewer to detect stale Windows-only regression.

### Acceptance criteria
- one stable pageRef;
- exact 166-key EN/JA/ZH parity;
- exact unique 13-stage order and five-chapter coverage;
- explicit source-candidate/effect states;
- same-origin catalog reads only;
- current copy names both qualified profiles and the separate release boundary.

### Residual risk
Release-specific artifact/version data remains rightly owned elsewhere.

## 5. Non-technical perspective

### Findings
The person should choose a platform and follow its obvious front door; they
should not learn model URLs, checksums or runtime-family plumbing. Mac state-first
setup is especially useful evidence that “simple” can mean software decides the
state while the human decides permission.

### Acceptance criteria
- Windows and Apple M4 Pro are described in ordinary language;
- the distribution map has one plain sentence per boundary;
- requirements do not auto-scan the visitor;
- Linux/other hardware is “not qualified by this evidence,” not “broken”;
- the held release explanation does not dead-end.

### Residual risk
Both accepted routes are still source-local rather than signed packaged builds.

## 6. Technical perspective

### Findings
The page must match current README/profile owners, not old #177 prose.

### Acceptance criteria
- Windows 10/11 x64 NVIDIA and exact Apple M4 Pro claims match accepted source;
- `setup-vexlife.cmd` and `setup-vexlife.command` are identified as source-local
  front doors, not signed installers;
- the unsigned local release candidate is not represented as a public Release;
- page resources remain same-origin and no-effect;
- Playwright records origin, locale, stage, download/popup/error/overflow and
  screenshot evidence;
- final Source Manifest buckets are generated from current-main co-bucket state
  plus exact final source records.

### Residual risk
Hosted/full-checkout execution remains required before clearance.

## 7. “I want a companion quickly, without fearing setup” lens

### Findings
The fastest trustworthy route is now platform-aware without becoming technical:
choose a qualified platform, use its obvious source-local front door, let
software classify state, approve only understandable effects, and know the
preservation route in advance.

### Acceptance criteria
- quick path answers what I get / what I approve / how I recover;
- approximate several-GiB acquisition is not hidden;
- normal users do not provide model/runtime plumbing;
- both obvious front doors are named;
- merely exploring the page performs no action;
- release control remains held until a truthful public target exists.

### Residual risk
A future signed/double-click distribution surface remains a separate successor,
not a reason to mislabel source-local routes today.

# Cross-lens acceptance matrix

| Proof | Designer | Fresh | Human | AI | Non-tech | Technical | Quick |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Five chapters preserve 13 stages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| EN/JA/ZH exact parity | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Windows + Mac current truth | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Desktop + mobile render | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |
| Same-origin / zero-effect |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Release boundary held truthfully | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Machine-readable practicum |  |  |  | ✓ |  | ✓ |  |
| Fresh-human P11 |  | ✓ | ✓ |  | ✓ |  | ✓ |

P11 remains later by definition.

# Browser practicum acceptance

For every EN/JA/ZH × desktop/mobile case the existing practicum must continue to
prove: tested origin only, explicit ready/current catalog, non-empty visible
copy, exact stage/chapter coverage, user-control traversal, held release without
download, FAQ disclosure, completion, zero downloads/popups/page errors,
no horizontal overflow, screenshot hash and machine-readable receipt.

Local source proof is not live Pages proof. Live Pages proof is not P11.

# Remaining path after this source candidate

```text
A. exact currentized source + deterministic/render evidence
B. fresh claimless Independent Assurance on exact head/tree
C. distinct lifecycle/currentness decision
D. ordinary expected-head merge + post-merge verification
E. separately governed release/Pages/signing work if and when authorized
F. logged-out live public proof after actual deployment
G. fresh-human/fresh-machine P11 under its own owner and consent boundary
```

Repository visibility is already public and is not a future effect in this lane.
No source-lifecycle completion here creates GitHub Release, Pages, signing or P11
authority.

# Decision

```text
multiLensDisposition=SOURCE_CANDIDATE_READY_FOR_EXACT_GATES_AND_INDEPENDENT_ASSURANCE
publicReleaseDisposition=HELD
pagesPublicationDisposition=HELD
repositoryVisibilityDisposition=CURRENT_PUBLIC__NO_MUTATION_BY_THIS_LANE
signedOfficialBuildDisposition=HELD
freshHumanP11Disposition=HELD
macosM4ProReleaseQualificationDisposition=SOURCE_LOCAL_RELEASE_QUALIFIED
windowsNvidiaReleaseQualificationDisposition=SOURCE_LOCAL_RELEASE_QUALIFIED
linuxAndOtherHardwareQualificationDisposition=HELD_NOT_INHERITED
communityPackageIngestionDisposition=OUT_OF_SCOPE
```

The feature is the trustworthy composition boundary: make the ordinary path
understandable while preserving exact owners and refusing to turn adjacent
success into a stronger claim.

<!-- [VXG RealForever] -->
