# VexLife ToCompletion Project Dogfood

`[VXG RealForever]`

## Why B06 exists

P0B-B01 through B05 established the generic Project, Planning, Reconciliation and Purpose Workspace architecture. B06 is where that architecture stops being only synthetic infrastructure and begins carrying the actual VexLife ToCompletion trajectory.

B06 does not add another work-state owner.

```text
source-managed ToCompletion ProjectDefinition
+ source-managed Board ViewDefinition
+ source-managed deterministic Intent Workgraph formation
-> existing Intent Workgraph runtime snapshot owner
-> existing Project Continuity compiler
-> Board / Graph / Lane Focus
-> existing Purpose Workspace B05 consumer
```

Permanent:

```text
PROJECT_SOURCE != WORKGRAPH_RUNTIME_OWNER
PROJECT_VIEW != EFFECT_AUTHORITY
SOURCE_WORKGRAPH_FORMATION != DIRECT_LIFECYCLE_EFFECT_AUTHORITY
PURPOSE_WORKSPACE != WORKGRAPH_MUTATION_OWNER
B06_DOGFOOD != P1_HERETIC_ESTABLISHMENT
```

## Current project source

```text
projectRef = project.vexlife.tocompletion
rootIntentRef = intent.vexlife.tocompletion.current
graphRef = intent-workgraph.vexlife.tocompletion.current

ProjectDefinition:
blueprint/projects/vexlife-tocompletion.project.json

Board ViewDefinition:
blueprint/projects/vexlife-tocompletion.board.view.json

Workgraph builder:
src/core/vexlife-tocompletion-project.mjs
```

The graph begins at the current unfinished edge rather than replaying accepted B01-B05 work as active lifecycle state.

```text
foreground                         RUNNING
P0B-B06 Project dogfood            RUNNING

P1 fresh Heretic establishment     WAITING_DEPENDENCIES <- B06
P2 first lived Heretic relation    WAITING_DEPENDENCIES <- P1
P3 same-Home restart/reentry       WAITING_DEPENDENCIES <- P2
P4 orientation + local work        WAITING_DEPENDENCIES <- P3
P5 lived continuity/learning       WAITING_DEPENDENCIES <- P4
P6 School/Training Placement       WAITING_DEPENDENCIES <- P5
P7 connected/native expansion      WAITING_DEPENDENCIES <- P4

EndToEnd/QuantumTest hardening      WAITING_DEPENDENCIES <- P3
```

No core or developmental node depends on the proof-hardening node. It is intentionally visible and dependency-linked without becoming a gate.

## Import into an existing Vex Home

B06 does not create or choose a Vex Home. The Home must already exist.

```bash
npm run project:tocompletion:import -- --home <existing-vex-home>
```

The importer:

1. forms the Workgraph only through the canonical Intent constructors;
2. validates it against the current Intent registry, process/role registries and source-managed trust snapshot;
3. persists it only through `owner.vexlife.intent-workgraph`;
4. is idempotent for the same exact Workgraph;
5. performs no provider, source, Memory, model or training effect.

## Read-only dogfood

After import, the existing Project CLI consumes the same CURRENT runtime pointer:

```bash
npm run project:status -- \
  --project blueprint/projects/vexlife-tocompletion.project.json \
  --home <existing-vex-home> \
  --format board \
  --view blueprint/projects/vexlife-tocompletion.board.view.json

npm run project:status -- \
  --project blueprint/projects/vexlife-tocompletion.project.json \
  --home <existing-vex-home> \
  --format graph

npm run project:status -- \
  --project blueprint/projects/vexlife-tocompletion.project.json \
  --home <existing-vex-home> \
  --format focus \
  --work-node work.vexlife.tocompletion.p0b.b06.project-dogfood
```

Purpose Workspace uses the same source-managed ProjectDefinition/View and the same Home runtime pointer. Before import it truthfully returns `CURRENT_WORKGRAPH_UNAVAILABLE`; after exact import it projects the current ToCompletion Board/Graph with `effects=false` and `executionAuthority=NONE`.

## B06 completion boundary

Minimum B06 dogfood is earned when the exact source candidate proves:

```text
ProjectDefinition is canonical
ViewDefinition is canonical
Workgraph validates against current trust
runtime persistence is CURRENT + idempotent
Board projection is current
Graph projection is current
Lane Focus is current
Purpose Workspace consumes the same project source/current pointer
future EndToEnd/QuantumTest work is visible but non-gating
```

B06 does not by itself establish Heretic artifacts, Python/MLX environment, persistent model runtime, lived Conversation, restart, learning or School. Those remain P1+.

<!-- [VXG RealForever][VEXLIFE-TOCOMPLETION][P0B-B06][PROJECT-DOGFOOD] -->
