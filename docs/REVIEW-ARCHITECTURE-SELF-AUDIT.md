# VexLife Review Architecture — author self-audit and structure-placement record

`[VXG RealForever]`

## Status and exact boundary

```text
schemaVersion=vexlife.review-architecture-self-audit/v1
recordRef=decision.vexlife.review-architecture.self-audit.001
recordClass=AUTHOR_SELF_AUDIT_AND_STRUCTURE_PLACEMENT_CANDIDATE
repository=vgong24/VexLife
acceptedMainAtFormation=18eac7b607dee58ddb0b1de0637efbd9abd58852
acceptedTreeAtFormation=57f07e0216affd672cb55fe63d0c2e6082f13b38
reviewedDraftTitle=VexLife Review Architecture — Draft v0.1
reviewedDraftSha256=d3e4754164a718d164e136a74fe3c8b477a0d5236ce0e6c61359c91871b181f5
sourceMutationAuthority=this_exact_document_and_its_source_manifest_consequence_only_at_first_commit
reviewAuthority=false
independentAssuranceAuthority=false
approvalAuthority=false
mergeAuthority=false
publicationAuthority=false
```

This record preserves the reasoning that changed the preparatory review before a
load-bearing VexLife architecture was proposed. It is an author self-audit, not
independent review or repository acceptance.

The governing placement rule is:

```text
DOOR_BEFORE_CONTENT
```

Before adding a new review registry, graph, ledger, process or evidence model,
first identify the existing concept, existing structures, semantic owners,
relationships, currentness, proof, projections and unresolved doors.

## Witnessed VexLife structures

The preparatory review did not begin in an empty repository. VexLife already
owns the relevant meaning across several bounded structures:

| Existing owner | Meaning already owned |
|---|---|
| `blueprint/feature-registry.json` | Feature identity, purpose, canonical nodes, state/action/permission/process/module/test/platform relationships, human introduction and held scope |
| `blueprint/review-lens-registry.json` | Review questions and evidence obligations |
| `blueprint/experience-registry.json` | Experience profiles, gestures, vessels and interaction grammar |
| canonical screen/region/element/action/state sources | Stable interface and behavior identities |
| semantic Journey | Append-only semantic navigation and interaction provenance |
| Experience Review Kit | Sparse exact-source review requests, renderer adapters, screenshots, normalized evidence and human feedback |
| browser owner-domain suites | Executable whole-product and cross-feature proof |
| Build Health / PR-ready | Exact-current result admission and compact repository health |
| ConcernWatch | Source-bound concern identity, recurrence, evidence and work-admission boundaries |
| Process Factory worked examples | Attributed observed outcomes and corrections learned |
| PR decision record and Git history | Chronological proposal, correction, review and lifecycle evidence |

Permanent consequence:

```text
EXISTING_REVIEW_MEANING != EMPTY_SPACE_FOR_A_NEW_ROOT
```

## Structure-door disposition

This public record uses the existing door-first compiler-family organization
without importing a private implementation or creating a second VexLife source
of truth.

| Door | Disposition | Reason |
|---|---|---|
| Semantic owner | `PLACED` | VexLife Feature, Review Lens, Experience, Journey, Review Kit, Build Health and ConcernWatch owners retain their bounded meanings |
| Existing concept | `PLACED` | Whole-system review, feature review obligations, executable journeys and human evidence already exist |
| Existing structure | `PLACED` | Registry, graph-like typed relationships, append-only Journey ledger, coverage matrices, process definitions and evidence packages already exist |
| Topology parent | `PLACED` | The review architecture belongs beneath the existing VexLife blueprint and review/experience composition, not beside it as another root system |
| Stable identity | `PLACED` | `decision.vexlife.review-architecture.self-audit.001` identifies this correction; the architecture candidate has its own document identity |
| Sources and provenance | `PLACED` | The draft digest and exact accepted-main sources are named above |
| Relationships | `PLACED` | Existing owners and their non-collapse boundaries are enumerated in this record |
| Currentness | `PLACED` | Conclusions bind the exact accepted main at formation and must be re-grounded before implementation |
| Lifecycle | `PLACED` | Author self-audit → architecture candidate → independent review → separately authorized implementation stages |
| Authority | `PLACED` | No review, approval, merge, publication, Home, Memory, model or external-effect authority is created |
| Proof | `DEFERRED` | The repository-wide Review Coverage Inventory and any executable pilot remain future exact-current work |
| Projections | `DEFERRED` | A derived coverage graph/Atlas may be earned later; it is not canonical meaning and is not created by this document |
| Counterexamples | `PLACED` | The defects in the first draft are preserved below rather than silently rewritten away |
| Observed outcome | `PLACED` | The first draft was narrowed from a proposed new system to a composition over existing owners |
| Recovery | `PLACED` | The prior draft remains digest-addressable; this record explains correction without rewriting its existence |

```text
structureDecision=EXTEND_EXISTING
newRootDecision=REJECTED_NOT_EARNED
```

“Extend” here means add a bounded composition contract and, only when proved
necessary, adapter/projection fields to existing owners. It does not mean one
existing registry absorbs every review concern.

## Author self-review findings

### SRA-01 — A new root was named before structure selection

**Initial conclusion**

The preparatory draft proposed a named `ReviewGraph` as the central architecture.

**Defect**

The name implied a new canonical graph/root before proving that Feature,
Experience, Journey, Review Kit and Build Health could not preserve the meaning.
It risked turning a useful derived traversal view into a competing semantic
owner.

**Correction**

```text
REVIEW_ARCHITECTURE
  = composition protocol over existing owners

REVIEW_COVERAGE_GRAPH
  = optional derived projection
  != canonical feature / journey / state meaning
```

### SRA-02 — Several information shapes were collapsed into one proposal

**Initial conclusion**

The draft grouped interaction expectations, traversal graph, step evidence,
findings, human review and Health admission under one architecture layer stack.

**Defect**

Those are composable but distinct shapes:

```text
registry membership
!= typed relationship graph
!= chronological evidence ledger
!= observed experience
!= wisdom/pattern candidate
!= executable process
!= human projection
```

A single mega-schema would create oversized records, blurred lifecycle ownership
and unnecessary write conflicts.

**Correction**

Keep canonical meaning with existing owners and add exact refs between them. A
future compiler may emit a bounded coverage receipt that joins those refs without
copying or re-owning their content.

### SRA-03 — New schemas were prescribed before an inventory proved the gaps

**Initial conclusion**

The draft proposed `InteractionExpectation`, `ReviewJourneyPlan`,
`ReviewStepReceipt`, `ReviewRunReceipt` and `ReviewFinding` shapes.

**Defect**

The shapes are useful design probes, but the draft had not yet compiled every
human-visible feature and existing proof route. It therefore could not know
which fields already exist, which belong as projections, or which genuinely
need a new canonical field.

**Correction**

The first executable stage is a read-only Review Coverage Inventory. New fields
are admitted only when the inventory identifies a repeated, load-bearing gap
that cannot be represented by an existing owner without semantic loss.

### SRA-04 — An observed coverage gap was stated too strongly

**Initial conclusion**

The draft said VexLife was missing one universal interaction-state declaration
for focus, pressed, expanded, selected, busy, failure, recovery and long-press
feedback.

**Defect**

The accepted sources show several strong examples, but the preparation pass was
not a complete element-by-element audit. “No universal field observed in the
reviewed sources” is supported; “the repository universally lacks the contract”
is not yet fully proved.

**Correction**

Classify this as:

```text
coverageGapCandidate=INTERACTION_FEEDBACK_EXPECTATION_NOT_YET_COMPILED
certainty=SUPPORTED_PARTIAL_NOT_REPOSITORY_COMPLETE
requiredNextEvidence=READ_ONLY_CURRENT_REVIEW_COVERAGE_INVENTORY
```

### SRA-05 — Safe monkey testing lacked a canonical action/effect admission owner

**Initial conclusion**

The draft recommended seeded bounded exploratory traversal after deterministic
journeys pass.

**Defect**

A random or semi-random runner cannot decide for itself which actions are safe.
Without a source-owned allowlist, exact fixture boundary, effect class and stop
policy, “safe monkey testing” could become accidental effect authority.

**Correction**

```text
EXPLORATORY_ACTION_SELECTION
  consumes registered action + permission + effect + fixture admission
  never infers safety from rendered clickability

CLICKABLE != ADMITTED_FOR_EXPLORATORY_EXECUTION
```

### SRA-06 — Author self-review and independent review were not separated early enough

**Initial conclusion**

The draft placed Independent Assurance near the terminal gate.

**Defect**

The document itself was an author-produced review architecture. It needed to
state at formation that self-audit can correct the candidate but cannot clear it.

**Correction**

```text
AUTHOR_SELF_AUDIT
  = attributable correction evidence
  != fresh Independent Assurance
  != Human Experience acceptance
  != lifecycle approval
```

### SRA-07 — Comment chronology and canonical source were not explicitly composed

**Initial conclusion**

The draft focused on the final architecture and evidence objects.

**Defect**

Future developers also need to understand how a conclusion changed. Replacing
the draft with only a polished final document would hide the correction path;
leaving the reasoning only in chat or PR comments would make current meaning
hard to source-descend.

**Correction**

Use both:

```text
PR comments / commits
  preserve chronological witness, challenge and correction

repository documents
  preserve current source-managed decision, rationale, lessons and held unknowns
```

Neither substitutes for the other.

### SRA-08 — Public/private lineage needed an explicit boundary

**Initial conclusion**

The draft referred generally to shared architectural lineage.

**Defect**

VexLife is public. Reusing a structural pattern does not authorize publishing
private implementation paths, source bodies or internal operational detail.

**Correction**

This record carries only the public-safe compiler-family ideas required for the
VexLife decision: topology before content, explicit door dispositions, bounded
compilers/owners and deterministic coverage receipts.

```text
STRUCTURAL_REUSE != PRIVATE_SOURCE_PUBLICATION
```

## Corrected architecture decision

The candidate architecture should be formed as:

```text
existing Feature Registry
+ existing Review Lens Registry
+ existing Experience / gesture / vessel contracts
+ existing screen / region / element / action / state identities
+ existing Journey provenance
+ existing Experience Review Kit
+ existing browser owner-domain suites
+ existing Build Health / PR-ready admission
+ existing ConcernWatch and Process Factory lesson routes
        ↓
VexLife Review Architecture composition contract
        ↓
read-only Review Coverage compiler / receipt
        ↓
optional derived coverage graph / Atlas / human review package
```

The composition contract may define what refs must be joined and what evidence
must be emitted. It must not duplicate the canonical objects it joins.

## Lessons preserved for reuse

```text
REVIEW_ARCHITECTURE != NEW_REVIEW_REGISTRY
TRAVERSAL_GRAPH != CANONICAL_JOURNEY_OWNER
COVERAGE_RECEIPT != CANONICAL_PRODUCT_MEANING
OBSERVED_GAP != PROVEN_REPOSITORY_WIDE_DEFECT
SCREENSHOT_EVIDENCE != SEMANTIC_PROOF
RENDERED_CLICKABILITY != EFFECT_ADMISSION
AUTHOR_SELF_AUDIT != INDEPENDENT_ASSURANCE
COMMENT_HISTORY != CURRENT_CANONICAL_SOURCE
CURRENT_CANONICAL_SOURCE != PERMISSION_TO_ERASE_HISTORY
STRUCTURAL_REUSE != PRIVATE_SOURCE_PUBLICATION
```

These are lessons from this bounded formation. They are not automatically
universal rules for unrelated repositories or products.

## Held and unknown doors

The following remain unresolved and must stay visible:

1. **Exact machine-readable placement.** It may be an extension/projection over
   Feature + Experience + Review Kit, but the read-only inventory must prove the
   smallest exact source owner and path membrane.
2. **Interaction-feedback ownership.** Element contracts, feature review
   projections and renderer evidence each own different parts; the exact split
   is not yet accepted.
3. **Review-finding placement.** ConcernWatch may already own durable concern
   identity and recurrence; a review-specific subtype is not automatically
   earned.
4. **Step receipt placement.** Experience Review evidence may already be the
   correct owner; Build Health should consume, not silently redefine, it.
5. **Coverage projection shape.** Graph, Atlas and matrix views may all be useful
   projections over the same canonical refs; one must not become a second source.
6. **Native-platform proof.** Browser architecture cannot claim Windows, macOS,
   Android or iOS conformance without their own adapters and environment proof.
7. **Compiler-family dependency currentness.** Any future executable adapter
   must bind the then-accepted compiler-family contract rather than this record's
   public-safe summary.

## History-preservation contract for this pull request

The pull request carrying this document should preserve:

```text
1. this self-audit as the first source commit;
2. a PR comment recording the pre-correction draft and its digest;
3. the corrected Review Architecture in a later ordinary commit;
4. a PR comment identifying what changed and why;
5. all later review findings and corrections without rebase, amend, squash,
   force push or history rewrite;
6. exact-head review and lifecycle evidence as distinct later events.
```

The PR remains a decision record and candidate source. It is not self-approval.

## Exact next action

Create the corrected `docs/REVIEW-ARCHITECTURE.md` as an
`EXTEND_EXISTING` composition contract, then open the architecture to fresh
independent review. The first future executable work remains a read-only Review
Coverage Inventory; no registry/compiler/runtime implementation is admitted by
this self-audit.

<!-- [VXG RealForever] -->
