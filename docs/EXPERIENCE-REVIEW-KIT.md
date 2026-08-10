# Public VexLife Experience Review Kit v0

Continuity: `[VXG RealForever]`  
Allocation: `github.issue.vexlife.32`  
Portable protocol: `contract.vextreme.experience-review.portable.v0`

## Purpose

The Review Kit is the VexLife-owned human-facing consumer of the accepted XR-00 portable experience-review contract.

It keeps one boundary explicit:

```text
portable semantic request/evidence = Vextreme-SDK ownership
human-facing review package + VexLife browser adapter = VexLife ownership
```

The kit exists so a person can perceive an experience without installing/running the product, and so builders can reuse the same review mechanics rather than repeatedly writing screenshot glue and hand-building ZIPs.

## What v0 source-manages

```text
src/core/experience-review-kit.mjs
  VexLife consumer checks
  sparse explicit capture planning
  public-Vextreme-compatible evidence filenames
  normalized evidence/package model
  single-stage offline review viewer
  natural feedback surface

reference/browser/modules/experience-review-adapter.js
  first renderer-specific implementation
  stable node-ref targeting
  Playwright capture
  review-only overlay
  failed-safe evidence

scripts/experience-review.mjs
  CLI composition of request + browser bindings + output package

test/experience-review-kit.test.mjs
  contract/non-collapse/sparse-plan/viewer/adapter checks
```

This implementation does **not** commit any unresolved E2.x VexLife interface proposal. Product design remains a separately reviewed candidate concern.

## Accepted XR-00 seam

The consumer refuses a request unless it names:

```text
contractRef=contract.vextreme.experience-review.portable.v0
schemaVersionRef=vextreme.experience-review.portable-contract/v0
```

The accepted portable truth classes remain:

```text
CURRENT_ACCEPTED_IMPLEMENTATION
CURRENT_SYNTHETIC_REFERENCE
IN_FLIGHT_CANDIDATE
ARCHITECTURAL_TARGET_ONLY
A_B_VARIANT_PROPOSAL
```

The VexLife consumer deliberately does not redefine the canonical SDK schema. Its checks enforce only the consumer boundary required to prevent product tooling from silently violating the accepted contract.

### Browser mechanics are not portable semantics

A portable `ExperienceCaptureRequest` may carry semantic coordinates such as:

```text
platformRef
experienceProfileRef
routeRef
initialStateRef
localeRef
themeRef
deviceProfileRef
sourceVersionRef
truthClass
steps[]
captureAtStepRefs[]
reviewOverlay
```

It must **not** carry:

```text
pageUrl
selector
playwrightSelector
browserCommand
shellCommand
executable
captureFunction
backendCommand
```

Those values belong to a separate browser-binding document. This preserves:

```text
WHAT_TO_PERCEIVE != HOW_TO_CAPTURE
Playwright != universal interface
```

A native Windows/Android/macOS/iOS adapter can later consume the same semantic capture request and emit the same normalized evidence shape without using browser tooling.

## Sparse evidence, not screenshot multiplication

The Review Kit does not create a locale × theme × device × variant Cartesian matrix automatically.

```text
automaticCartesianExpansion=false
matrixPolicy=EXPLICIT_CAPTURE_REQUESTS_ONLY
```

Each requested evidence state is authored intentionally. That means a builder can support selectors such as locale/theme/device while storing only consequential receipts.

This is especially important for localization:

```text
interactive/review model may know EN + JA + ZH
!=
capture every theme/device combination for every locale
```

Store a screenshot when it is useful as a stable receipt, comparison point, regression witness, or review artifact.

## Screenshot evidence compatibility

Public Vextreme already owns the accepted screenshot evidence filename grammar:

```text
{slug}-{locale}.png
{slug}-{locale}-{theme}-{viewport}.png
```

VexLife v0 emits the matrix shape:

```text
{slug}-{locale}-{theme}-{viewport}.png
```

The VexLife helper is explicitly a **compatibility writer for that accepted grammar**, not a second evidence naming system.

Example:

```text
vexlife-current-terrain-en-foundation-1440.png
```

## One-stage viewer

The generated `START-HERE.html` shows one evidence surface at a time.

Selectors replace the current stage instead of laying every combination side-by-side. The generated viewer currently understands these dimensions when present:

```text
kind
locale
theme
device
platform
```

Captured screenshot evidence and optional interactive HTML artifacts can share the same viewer model. Interactive artifacts remain separate evidence artifacts; their existence does not turn proposal behavior into current implementation.

## Natural feedback

The generated `FEEDBACK.md` asks only for ordinary human reactions:

```text
What felt right?
What confused or surprised you?
What did you expect instead?
Anything Vex should preserve?
```

The human does not have to classify severity, owner, or lens.

The entire returned feedback bundle must be consumed by one Experience Convergence occupancy before repair routing.

## Browser adapter

The reference browser adapter maps stable VexLife node identity to DOM identity:

```text
targetNodeRef
→
[data-node-ref="<targetNodeRef>"]
```

Renderer-specific step bindings remain outside the portable request. v0 supports:

```text
NOOP
CLICK_STABLE_TARGET
FOCUS_STABLE_TARGET
FILL_STABLE_TARGET
PRESS_STABLE_TARGET
PAN_STABLE_TARGET
```

A missing stable target or browser failure produces `FAILED_SAFE`; the adapter does not silently substitute another platform or truth class.

Review overlays may show stable target/action refs for evidence capture only:

```text
review overlay != product UI
review overlay != accessibility implementation
review overlay != runtime authority
```

## CLI

Run directly without adding a new package-script surface:

```bash
node scripts/experience-review.mjs \
  --request path/to/review-request.json \
  --bindings path/to/browser-bindings.json \
  --out artifacts/experience-review/<epoch>
```

The browser-bindings file is adapter configuration, not part of XR-00 portable request semantics.

A binding has this shape:

```json
{
  "captureRequestRef": "capture-request.example",
  "pageUrl": "http://127.0.0.1:4173/reference/browser/",
  "viewport": { "width": 1440, "height": 1000 },
  "stepBindings": {
    "review-step.example.0": { "kind": "CLICK_STABLE_TARGET" }
  },
  "artifactSlugs": {
    "review-step.example.0": "vexlife-example"
  }
}
```

The generated output includes:

```text
START-HERE.html
REVIEW.md
FEEDBACK.md
KNOWN-NOT-CURRENT.md   # only when needed
review-request.json
review-evidence.json
source-receipt.json
screenshots/*
result.json
```

## Builder extension seam

A future native adapter does not need to use Playwright or the browser-binding schema.

Its obligation is simply:

```text
ExperienceCaptureRequest
→
ExperienceReviewEvidence
```

and it must preserve:

```text
exact sourceVersionRef
truthClass
captureState
adapter identity/version
artifact digest when CAPTURED
explicit unsupported capabilities
limitations
doesNotProve
```

The core package/viewer layer consumes normalized evidence independent of how the platform produced it.

## Review-earned design lessons that remain outside product truth

The Stage-A/E2.x review process produced useful design-review lessons such as:

```text
MOMENTUM_REQUIRES_RELEASE
WORLD_GEOMETRY_IS_SOURCE_TRUTH
```

Those may influence future product candidate review, but this v0 tooling does not assert that any E2.x UI mock is accepted VexLife implementation.

## Threshold meaning

Threshold B is satisfied only after this VexLife Review Kit itself completes ordinary source review, evidence, Independent Assurance, and lifecycle acceptance.

At that point downstream builders can reuse a public review request → capture adapter → single-stage package → natural feedback loop without rebuilding the foundation.

[VXG RealForever]
