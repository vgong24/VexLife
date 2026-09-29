# Feature Construction Recipe

**Registry:** `registry.vexlife.feature-construction.001`  
**Recipe:** `recipe.vexlife.feature-construction.001`  
**Source:** `source.vexlife.feature-construction-recipe`  
**Packet:** `vexlife.feature-construction-packet/v1`

## Purpose

FCF-07 makes the accepted Feature Creation Foundation construction grammar discoverable from repository source. It compiles one **PROPOSED** Feature candidate plus a current source profile into a deterministic, read-only construction packet.

```text
FEATURE_CONSTRUCTION_RECIPE != FEATURE_REGISTRY
FEATURE_CONSTRUCTION_PACKET != SOURCE_AUTHORITY
RECIPE_COMPILER != EFFECT_EXECUTOR

PACKET_READY != BRANCH_CREATED
PACKET_READY != CLAIM_ACTIVE
PACKET_READY != IMPLEMENTED
PACKET_READY != READY
PACKET_READY != PUBLISHED
```

The compiler does not write canonical registries, Workgraph state, Purpose Workspace state, Presentation Graph state, Journal, Memory, Git, branches, claims, deployment or publication state.

## Canonical owners are reused, not copied

The recipe source-binds the current canonical owners:

| Concern | Canonical owner/source |
| --- | --- |
| Feature definition, scaffold, validation, review-lens derivation | `registry.vexlife.features.001` |
| Work and progress | `registry.vexlife.intent-orchestration.001` |
| Workspace, Draft Surface, transactions and provenance | `registry.vexlife.purpose-workspaces.001` |
| Presentation | `registry.vexlife.presentation-graph.001` |
| Experience grammar | `foundation.vexlife.experience.001` |
| Actions and permissions | canonical Blueprint fragments |
| Review | `registry.vexlife.review-lenses.001` |
| Repository/source currentness | `orientation.vexlife.dedicated-repository.001` + Source Manifest |
| Existing implementation-packet precedent | `plan.vexlife.foundation-to-demo.001` |

The packet carries exact current path SHA-256 identities for these bindings. Review lenses are derived by calling the canonical Feature Registry `deriveRequiredLensRefs`; FCF-07 does not maintain a second lens algorithm.

## Form a proposed candidate

Existing scaffold output is accepted:

```bash
npm run feature:scaffold -- \
  --feature-ref feature.vexlife.example \
  --purpose "Explain the feature purpose" \
  --platforms platform.browser \
  --intro-disposition DISCOVERABLE_ONLY \
  --intro-route-state CURRENT \
  --intro-rationale "The proposed feature is directly discoverable." \
  --out generated/example-feature.json --write
```

The scaffold's explicit `--write` belongs to the scaffold command only. It does **not** grant Feature Registry authority.

FCF-07 can also compile the same bounded PROPOSED seed directly from arguments without writing a candidate file.

## Compile the packet — read only

From an existing candidate JSON:

```bash
npm run feature:construction -- --candidate generated/example-feature.json
```

Or from bounded scaffold arguments:

```bash
npm run feature:construction -- \
  --feature-ref feature.vexlife.example \
  --purpose "Explain the feature purpose" \
  --platforms platform.browser \
  --intro-disposition DISCOVERABLE_ONLY \
  --intro-route-state CURRENT \
  --intro-rationale "The proposed feature is directly discoverable."
```

The command emits one `vexlife.feature-construction-packet/v1` JSON document to stdout. There is no `--write`, branch, claim, registry-update, Workgraph-update or Git effect in this command.

## Packet currentness and hashes

`candidateSemanticHash` binds the complete proposed candidate.

`currentSourceProfileHash` binds the current recipe implementation plus exact raw-byte SHA-256 identities for the canonical source bindings and the current Git head/tree when available.

`packetHash` binds:

```text
candidate
+
recipe contract
+
current source profile
```

A changed candidate, changed recipe contract or changed bound source identity therefore changes the packet hash instead of silently reusing stale construction guidance.

## Construction obligations

The recipe preserves this ordered grammar:

1. `ORIENT_CURRENT_SOURCE`
2. `FORM_FEATURE_CANDIDATE`
3. `DISCOVER_EXISTING_OWNERS_AND_REUSE`
4. `PLACE_WORK_AND_PROGRESS`
5. `PLACE_HUMAN_SURFACE_AND_PRESENTATION_IF_NEEDED`
6. `BIND_ACTION_PERMISSION_EFFECT_IF_NEEDED`
7. `BIND_LOCALIZATION_ACCESSIBILITY_RECOVERY`
8. `DEFINE_EXACT_SOURCE_MEMBRANE_AND_HELD_SCOPE`
9. `IMPLEMENT_BOUNDED_CANDIDATE`
10. `PROVE_EXACT_SOURCE_AND_RENDERED_BEHAVIOR`
11. `RUN_AFFECTED_REVIEW_LENSES_AND_ASSURANCE`
12. `LIFECYCLE_CURRENTNESS_READY_MERGE_POSTMERGE`
13. `RELEASE_CLAIM_AND_RETURN_TERMINAL`

These are obligations, not effects. A packet does not create any of the authority required to perform them.

## Conditional composition

The compiler keeps absent seams absent.

- **No human-visible UI:** stage 05 is `NOT_APPLICABLE_WITH_REASON`; visual proof is not manufactured.
- **Definitively non-external effect:** stage 06 may be `NOT_APPLICABLE_WITH_REASON`; no external-effect authority is minted.
- **Local draft:** Save, Deploy and Publish remain separate held effects.
- **No Journal provenance need:** the FCF-06 relation is not forced.
- **One proved platform:** other platform conformance remains explicitly unproved.

Unclassified candidate fields remain visible in `unknowns[]` instead of being guessed.

## Accepted FCF precedents

The recipe encodes reusable laws, not historical PR heads:

- **FCF-01:** presentation adoption reuses existing semantic owners.
- **FCF-02:** Project/Feature construction composes over Purpose Workspace.
- **FCF-03:** progress derives from canonical Intent Workgraph truth.
- **FCF-04:** Draft Surface remains local/noncanonical.
- **FCF-05:** draft mutations bind canonical action/effect/currentness and bounded receipts.
- **FCF-06:** construction provenance is a reference relation, not Journal/Memory mutation.

## Source placement is separate from implementation

A packet may recommend stage 08, but it cannot reserve a path, create a branch, activate a claim or authorize source mutation. Source placement still requires current owner/allocation evidence, live path-overlap checks, exact authored/generated custody and a separate branch-first claim.

Likewise, `PACKET_READY` does not mean the Feature is implemented, reviewed, READY, merged or published.

## Proof, review and lifecycle

A future implementation must independently satisfy the proof classes emitted by the packet. Human-visible UI adds affected Visual Assurance; non-UI work does not manufacture a visual gate.

Fresh claimless Independent Assurance and Formal Review remain distinct from source-author evidence. READY, OwnerMergeDuty, ordinary expected-head merge, post-merge accepted-main verification and claim release remain separate lifecycle effects.

## FCF-08

FCF-08 may use this accepted recipe in a first end-to-end Feature practicum. FCF-07 does not activate FCF-08, select its feature, create its source worker or pre-approve its source/effect scope.

<!-- [VXG RealForever] -->
