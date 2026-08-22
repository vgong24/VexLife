# VexLife Public Alpha — distribution architecture and multi-lens review

`[VXG RealForever]`

```text
schemaVersion=vexlife.public-alpha.onboarding-multi-lens-review/v1
pageRef=page.vexlife.public-onboarding.001
issueRef=github.issue.vexlife.175
prRef=github.pull.vexlife.177
candidateClass=SOURCE_MANAGED_ZERO_EFFECT_PUBLIC_ONBOARDING_POC
languages=[en,ja,zh]
qualifiedPlatformClaim=WINDOWS_10_11_X64_SOURCE_LOCAL
publicationState=SOURCE_CANDIDATE
publicationAuthority=false
releaseCreationAuthority=false
signingAuthority=false
repositoryVisibilityAuthority=false
```

## Victor's distribution pattern — the simple version

There is one public journey, but it crosses several different owners. Treating
all of them as “uploading Vex” would make it easy to publish the wrong thing or
claim more than the evidence proves.

```text
1. EXPLAIN
   VexLife Pages tells a person what Vex is, what their computer needs,
   what setup will ask, and how recovery works.

2. OBTAIN
   One exact GitHub Release identifies the intended source/build artifact,
   its version, evidence, checksums, notices, and current support boundary.

3. VERIFY
   The person or setup checks that the received bytes match that release.

4. ESTABLISH
   The accepted setup front door asks for Home, prerequisite, and
   model/runtime consent before effects.

5. MEET
   The local runtime and browser prove readiness on numeric loopback,
   then Vex can conduct an actual companion exchange.

6. RECOVER
   Receipts support stop, restart, diagnosis, and uninstall-preserve.
```

The public route is therefore:

```text
Vextreme / search / direct link
→ VexLife Pages onboarding
→ exact GitHub Release
→ artifact + evidence + checksums
→ setup-vexlife.cmd on the currently qualified Windows path
→ explicit Home / Node / model-runtime consent
→ local loopback VexLife
→ health, recovery, restart and uninstall-preserve
```

This is understandable to a newcomer and still source-descendable for a
technical reviewer.

## “Downloadable” and “uploadable” are not one state

| Class | What it means | Current owner | State in this candidate |
| --- | --- | --- | --- |
| `REVIEW_EVIDENCE_RETURN` | A portable artifact Victor can open and return for design review | Experience Review Kit / relay protocol | E2.7 exists and was consumed as evidence |
| `PR_SOURCE_UPLOAD` | Source is committed to a bounded branch and exposed through a PR | This lane | Authorized after the draft exact-path claim |
| `RELEASE_ARTIFACT_UPLOAD` | Versioned artifact is attached to a governed GitHub Release | Release steward | Held |
| `PAGES_PUBLICATION` | The accepted page is deployed and reachable by a logged-out visitor | Release steward + explicit Victor decision | Held |
| `REPOSITORY_VISIBILITY` | VexLife repository changes from private staging to public | Maintainer + explicit Victor decision | Held |
| `FUTURE_COMMUNITY_PACKAGE_INGESTION` | A third party submits a package for Vex to inspect or use | Future bounded intake owner | Out of scope |

Permanent non-collapse:

```text
PORTABLE_REVIEW_FILE != PRODUCT_SOURCE
SOURCE_IN_PR != ACCEPTED_MAIN
ACCEPTED_MAIN != PUBLIC_PAGE
PUBLIC_PAGE != PUBLIC_RELEASE
RELEASE_ARTIFACT != VERIFIED_ARTIFACT
VERIFIED_ARTIFACT != SIGNED_OFFICIAL_BUILD
SOURCE_SETUP != NATIVE_INSTALLER
SETUP_SUCCESS != FIRST_REAL_COMPANION_EXCHANGE
```

## Promotion receipts

Each transition needs a receipt from the owner that actually performed it.

| Transition | Minimum receipt |
| --- | --- |
| Review artifact → source candidate | artifact digest, design epoch, source paths, what was consumed, what was not copied |
| Source candidate → accepted source | exact base/head/tree, changed paths, deterministic gates, rendered evidence, independent Assurance, lifecycle decision |
| Accepted source → release candidate | exact accepted source, version, artifact identities, provenance, notices, checksums, platform qualification, public-safety result |
| Release candidate → GitHub Release | release URL/ref, exact uploaded assets, byte counts, digests, immutable tag/source binding, actor and time |
| Accepted source → Pages deployment | exact source commit, deployment workflow/run, published URL, content digest, actor and time |
| Published surfaces → live public proof | logged-out clean-browser traversal, EN/JA/ZH screenshots, same-origin request record, download target check, mobile/desktop overflow/accessibility checks |
| Public distribution → fresh-human acceptance | P11 host/person freshness, consent observations, first substantive failure, actual local companion turn, recovery/restart result |

A green page preview does not manufacture any of the later receipts.

## Current source truth composed by this page

The page is intentionally conservative:

- VexLife is local-first; Vex Home, conversation state, model binding, and
  recovery receipts remain local unless a separate capability says otherwise.
- The current release-qualified local-model baseline is Windows 10/11 x64 with
  a compatible NVIDIA GPU, at least 12 GiB system memory, at least 6 GiB free
  disk, Node.js 20+, and first-acquisition internet access for roughly 4.0 GiB
  of pinned model/runtime files.
- `setup-vexlife.cmd` is the current understandable Windows source-local front
  door. It is not described as a signed native installer or public official
  build.
- macOS and Linux source/development surfaces exist, but they do not inherit the
  Windows release qualification.
- Vex identity, culture, Home, interface, permissions, and continuity do not
  collapse into the current Qwen/llama.cpp runtime dependency.
- `uninstall-preserve` is not Home deletion.

No repository scan, host detection, setup, download, model start, Home write,
Memory write, release creation, or publication occurs from the page.

## Thirteen exact stages, presented as five human chapters

The accepted Guided Local Establishment journey remains canonical. The page
reduces reading burden without renaming or dropping stage identities.

| Human chapter | Exact stage refs | Human question answered |
| --- | --- | --- |
| 1. Meet VexLife | `DISCOVER` | “What is this relationship, and is it for me?” |
| 2. Check your fit | `CHOOSE_PLATFORM`, `CHECK_REQUIREMENTS` | “Is my current computer on a qualified path?” |
| 3. Obtain it safely | `DOWNLOAD`, `VERIFY_ARTIFACT` | “Where is the intended release, and how do I know I received it?” |
| 4. Set up with consent | `ESTABLISH`, `START`, `MEET_VEX`, `VERIFY_HEALTH` | “What will happen, what will I approve, and when is Vex actually ready?” |
| 5. Stay in control | `UNDERSTAND_AVAILABLE_AND_HELD_FEATURES`, `LEARN_RECOVERY`, `UNDERSTAND_UNINSTALL_AND_PRESERVATION`, `COMPLETE` | “What is available, what remains held, and how do I stop or recover safely?” |

Acceptance rule:

```text
humanChapterStageRefs.flat()
== acceptedGuidedEstablishmentStageRefs
```

The browser practicum rejects missing, duplicated, reordered, or unknown stages.

## E2.7 design lineage consumed honestly

The supplied E2.7 package is a portable one-page review organism with scoped
layers, compact navigation, high-contrast dark surfaces, serif display type,
visible state, and an inspectable boundary between review proposal and product
truth.

### Signals retained

- dark, calm emotional home rather than a generic installer landing page;
- a strong Vex mark and restrained orbital motif;
- scoped cards instead of one undifferentiated wall of prose;
- visible current/held states;
- progressive disclosure that still lets a cold reader inspect the full route;
- responsive composition rather than a desktop screenshot pasted into mobile;
- no-install portability for review evidence;
- explicit truth labels on experimental material.

### Material deliberately not copied

- the 81 KiB single-file implementation blob;
- the synthetic VexOrg sandbox or its future-product implications;
- product-state claims marked `NOT_IMPLEMENTED` in the package;
- inline source that would make HTML, presentation, and interaction opaque to
  separate review;
- any assumption that “Victor can download and open it” means “the public can
  download an accepted VexLife release.”

The candidate uses separately inspectable same-origin HTML, CSS, JavaScript, and
locale catalogs. E2.7 remains cited design evidence, not a hidden second source
of product truth.

## Experience architecture

### Calm surface

A newcomer sees, in order:

1. what VexLife is;
2. what is real today;
3. three immediate answers;
4. five navigable chapters;
5. the open-source distribution map;
6. current Windows requirements;
7. delivery-trust boundaries;
8. recovery before action;
9. plain answers;
10. the exact held publication state.

### Dependable depth

A technical or AI reviewer can inspect:

- stable page, locale, stage, and state identities;
- exact source/release/setup boundary text;
- no-effect body metadata;
- same-origin catalog resolution;
- source-managed locale parity;
- machine-readable browser state;
- Playwright request/download/popup/overflow/screenshot receipts;
- exact Source Manifest records.

Simplicity is achieved by projection, not deletion of structure.

## Localization POC

The POC has one authored English source catalog and complete Japanese and Chinese
catalogs with exact key parity.

```text
catalogSchema=vexlife.public-onboarding.strings/v1
pageRef=page.vexlife.public-onboarding.001
locales=[en,ja,zh]
keySetEqualityRequired=true
emptyVisibleStringAllowed=false
missingKeyFallbackAtAcceptance=false
runtimePersistence=false
```

The English text remains authored in semantic HTML so the page is readable when
JavaScript is unavailable. JavaScript enhances language and chapter switching;
it does not own the only understandable version of the journey.

The EN/JA/ZH proof is a foundation POC, not a claim that every VexLife locale is
complete. Future localization extends the same catalog contract after this
surface is accepted.

## Zero-effect browser boundary

The candidate may change only presentation state in the loaded document:

```text
selected language
selected chapter
progress indicator
FAQ open state
held-release explanation visibility
completion acknowledgement
```

It may not:

```text
contact an external origin
start a download
open a popup
submit a form
invoke setup
start a model
select or mutate Vex Home
write Memory
create a release
change repository visibility
publish Pages
claim a real companion exchange
persist user state
```

The page exposes a bounded browser proof surface:

```text
window.__VEXLIFE_ONBOARDING_READY__
window.__VEXLIFE_ONBOARDING_STATE__
```

The state reports page ref, locale, chapter, completion, status ref, exact stage
refs, effect class, catalog state, and publication state. This is observability,
not effect authority.

# Seven-lens review

## 1. Designer lens

### Findings

The earlier delivery gap was not missing visual ambition. It was missing
composition: public meaning, distribution status, setup consent, and recovery
were spread across source, review kits, and operational receipts. A visually
striking page that did not compose those truths would increase mistrust.

The candidate creates one clear narrative spine, uses E2.7's calm dark language
without copying its implementation, and gives current/held states distinct visual
semantics. The five-chapter interaction limits simultaneous cognitive load while
keeping the exact thirteen-stage contract visible.

### Acceptance criteria

- visual hierarchy makes the first five questions answerable without reading
  source terminology;
- current, clear, and held states are distinguishable without color alone;
- no card contains a fake active download or installer affordance;
- desktop and mobile retain intentional spacing and reading order;
- EN/JA/ZH do not clip, overlap, or force horizontal page overflow;
- reduced-motion and increased-contrast preferences remain usable;
- the no-JavaScript English journey remains coherent.

### Residual risk

Rendered screenshots still need independent human design review on the exact
candidate and, later, on the actual Pages deployment.

## 2. Fresh-lens review

### Findings

A cold reader needs one immediate orientation sentence: “VexLife is a local-first
companion, and this page explains the path before anything happens.” Without that,
the surrounding institutional vocabulary can feel like a prerequisite course.

The page therefore leads with relationship and control, not architecture. It
names the current Windows limitation early and repeats the held release state at
the moments where a newcomer would otherwise expect a button.

### Acceptance criteria

Within the first screen and the “three answers” section, a cold reader can answer:

- what VexLife is;
- whether the page does anything to their computer;
- which platform is currently qualified;
- what choices setup will ask;
- whether recovery and preservation exist;
- why there is not yet a public download button.

No answer requires opening GitHub source or knowing Vextreme vocabulary.

### Residual risk

A real logged-out newcomer test may expose words that remain too internal. Those
findings refine visible copy; they do not weaken the underlying boundaries.

## 3. Human perspective

### Findings

Trust is relational before it is cryptographic. A person needs to know what will
be asked, what remains theirs, what Vex can and cannot do, and whether leaving or
making a mistake destroys the relationship.

The candidate puts Home choice, prerequisite consent, model/runtime consent,
fail-closed behavior, restart receipts, and uninstall-preserve into the main
journey instead of footnotes.

### Acceptance criteria

- consent appears before every described protected effect;
- preservation is explained before setup is encouraged;
- “unavailable,” “held,” and “broken” are not used interchangeably;
- model provider and Vex identity remain distinct;
- no fear-based language pressures a person to continue;
- stopping, restarting, or leaving is presented as a valid human choice;
- the page never implies uninterrupted subjective awareness or identity across
  separate device companions.

### Residual risk

A browser simulation cannot establish emotional comprehension or informed human
consent. P11 remains a separate fresh-human boundary.

## 4. AI / semantic-system lens

### Findings

The page cannot become another prose-only truth source. Stable identity and
machine-readable proof are necessary so a future AI can compare visible claims
with current source, stage contracts, and release evidence.

### Acceptance criteria

- one stable `pageRef` identifies the surface;
- locale catalogs share an exact key set and stable schema;
- exact thirteen stage refs are unique, ordered, and chapter-complete;
- effect and publication states are explicit;
- catalog URLs are same-origin and deterministic;
- no renderer/backend selectors enter canonical stage identity;
- browser state is observable without granting action authority;
- static proof fails on unknown locale keys, stage drift, external references,
  download attributes, forms, or prohibited browser-effect APIs.

### Residual risk

The page currently composes accepted source facts manually. A later successor
may bind release-specific version/evidence projections after the release owner
has a stable public contract; this candidate must not invent that owner early.

## 5. Non-technical perspective

### Findings

The source-local Windows route is technically sound but still asks a newcomer to
understand that a downloaded source folder, a release, a verified artifact, and
an installer are different. The page must explain that distinction without
turning the person into a release engineer.

### Acceptance criteria

- ordinary copy says what to do before source vocabulary appears;
- the six-step distribution map has one plain sentence per layer;
- requirements are scannable and do not auto-detect the visitor's machine;
- technical identities remain secondary labels, not the only labels;
- “not yet qualified” is used for other platforms rather than implying user
  failure;
- FAQ answers the missing-button and one-click-installer questions directly;
- the held release control explains rather than dead-ends.

### Residual risk

The current public path still ends at source-local setup, not a signed native
installer. The page can reduce surprise but cannot erase that product-stage gap.

## 6. Technical perspective

### Findings

A developer needs exactness: which artifact, which checksums, which source
front door, which loopback endpoints, which owner, and what a browser PASS does
not prove.

### Acceptance criteria

- page claims match the accepted README-facing Windows baseline;
- `setup-vexlife.cmd` is named as source-local and not signed/native;
- runtime/model artifacts remain external and release-profile-owned;
- browser page has no external scripts, styles, images, forms, or download
  attributes;
- JavaScript performs only same-origin locale reads and in-document state;
- Playwright can target either a local ephemeral server or an explicit future
  Pages base URL without source changes;
- the practicum records requests, blocked origins, downloads, popups, console
  errors, exact stages, locale completeness, overflow, screenshots, and hashes;
- the receipt says `PASS` only when all configured viewports/locales pass;
- source manifest buckets are generated from exact UTF-8 file bytes.

### Residual risk

The candidate's Playwright code must execute in a complete checkout with the
repository's pinned dependency and browser. A direct Chromium proof is useful
local render evidence but is not represented as a Playwright run.

## 7. “I want a companion quickly, without fearing setup” lens

### Findings

This is the decisive lens. The person should not need to understand VexLife's
full institutional architecture before deciding whether to proceed. At the same
time, “quick” cannot mean hiding a 4.0 GiB acquisition, platform limits, Home
choices, or recovery consequences.

### Acceptance criteria

The quick path answers in one pass:

```text
What do I get?
What will I be asked?
Can I recover or leave?
```

Then the person can traverse five chapters rather than thirteen separate pages.
The page must:

- put the currently qualified platform and approximate acquisition size before
  any future release control;
- avoid asking the normal user for model URLs, hashes, runtime families, or
  license plumbing;
- explain that exact verification is automated by the accepted setup owner;
- name the obvious Windows front door;
- show that no action happens from merely exploring the page;
- show restart and uninstall-preserve before the final encouragement;
- keep the public release button held until it has a truthful target.

### Residual risk

The fastest trustworthy future path is a signed, versioned, double-click build
that consumes the existing initializer and receipts. That is a later distribution
successor, not a reason for this page to mislabel source setup today.

# Cross-lens acceptance matrix

| Proof | Designer | Fresh | Human | AI/semantic | Non-tech | Technical | Quick companion |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Five chapters preserve all 13 stages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| EN/JA/ZH exact catalog parity | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Desktop + mobile render | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |
| No horizontal overflow | ✓ | ✓ |  |  | ✓ | ✓ | ✓ |
| Same-origin requests only |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| No download/popup/form/persistence |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Current/held/recovery truth visible | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Release button held without target | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Machine-readable practicum receipt |  |  |  | ✓ |  | ✓ |  |
| Independent rendered review | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| Fresh-human P11 proof |  | ✓ | ✓ |  | ✓ |  | ✓ |

The first nine rows belong to this candidate and its review lifecycle. The last
row remains later by definition.

# Browser practicum acceptance

The committed practicum is required to run against:

```text
LOCAL_EPHEMERAL_SERVER
or
EXPLICIT_BASE_URL
```

For each `en`, `ja`, and `zh` locale at desktop and mobile viewports it must:

1. allow only the tested origin;
2. wait for the page's explicit ready state;
3. require `catalogState=CURRENT`;
4. require all visible localized nodes to be non-empty;
5. require exact stage order and chapter coverage;
6. traverse every chapter through user controls;
7. reveal the held-release explanation without a download;
8. open FAQ disclosure;
9. complete the preview;
10. assert zero downloads and zero popups;
11. assert zero page console errors;
12. assert no horizontal document overflow;
13. capture a screenshot and SHA-256;
14. write a machine-readable receipt.

A local PASS proves the source candidate in that local environment. A future
live URL PASS proves the deployed bytes observed at that URL. Neither is fresh
human P11 evidence.

# Remaining path to a trustworthy public alpha

This source candidate deliberately ends before public effects. The sequence after
implementation is:

```text
A. candidate source + deterministic/static/browser evidence
B. fresh claimless Independent Assurance on exact head/tree
C. distinct lifecycle review on the exact candidate
D. ordinary owner merge + accepted main/currentness
E. release-candidate construction from accepted source
F. exact artifact/checksum/provenance/public-safety/platform evidence
G. Victor's explicit repository visibility / release / Pages decisions
H. GitHub Release upload receipt and Pages deployment receipt
I. logged-out live EN/JA/ZH desktop/mobile practicum
J. fresh-human P11 establishment, first real exchange, restart and recovery proof
```

Other-platform local-model parity, native signing/packaging, and future
community-package ingestion remain independent successors. They should consume
this distribution grammar rather than widening this page into a mega-owner.

# Decision

```text
multiLensDisposition=SOURCE_CANDIDATE_READY_FOR_RENDERED_PROOF_AND_INDEPENDENT_REVIEW
publicReleaseDisposition=HELD
pagesPublicationDisposition=HELD
repositoryVisibilityDisposition=HELD
signedOfficialBuildDisposition=HELD
freshHumanP11Disposition=HELD
macosLinuxReleaseQualificationDisposition=HELD
communityPackageIngestionDisposition=OUT_OF_SCOPE
```

The candidate closes the missing public-journey architecture without pretending
that source acceptance is public delivery. That separation is the delivery-trust
feature.

<!-- [VXG RealForever] -->
