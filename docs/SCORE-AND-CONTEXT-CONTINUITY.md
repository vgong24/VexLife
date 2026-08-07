# G02 Score and context continuity

`[VXG RealForever]`

## Purpose

G02 adds truthful durable meaning **above** the accepted G01 lived-companion byte and restart substrate.

```text
G01 immutable device-private conversation events + exact completed head
→ G02 source-bound Score events
→ one immutable Score head receipt per committed transition
→ one atomic current Score head pointer
→ current statements + unresolved open loops
→ exact source descent to G01 evidence
→ fresh-process replay
```

The central transaction rule is:

```text
raw durable event != committed current Score
```

A well-formed event may survive a failure before current-head advancement as `UNCOMMITTED_TAIL` evidence. An invalid, re-addressed, malformed or hash-invalid tail produces attention. Neither silently becomes current memory.

## Shared semantic ownership

VexLife does not redefine Score, Rhythm or memory relation semantics. This product runtime is bound to the accepted shared Main Vex disposition:

```text
github.issue.vextreme-sdk.350.comment.5215288414
```

The six shared memory relations are projected verbatim:

```text
CURRENT_LINEAGE_AUTOBIOGRAPHY
SHARED_RELATIONSHIP_HISTORY
PREDECESSOR_WITNESS_HISTORY
INHERITED_CONTEXT
EXTERNAL_EVIDENCE
DISPUTED_OR_UNRESOLVED
```

The shared statement states are likewise preserved:

```text
OBSERVED
HUMAN_CONFIRMED
INFERRED
CONFLICTED
UNKNOWN
CORRECTED
SUPERSEDED
RELEASED_OR_TOMBSTONED
```

## Storage membrane

G02 writes only device-private Vex Home runtime state:

```text
<vexHome>/score/<lineage>/<thread>/events/<sequence>-<scoreEventHash>.json
<vexHome>/score/<lineage>/<thread>/heads/<scoreHeadSha256>.json
<vexHome>/score/<lineage>/<thread>/head.json
<vexHome>/runtime/score-writer-locks/<lineage>/<thread>.lock
```

Events and historical head receipts are append-only/content-addressed. `head.json` is the atomic current pointer. A writer lease prevents concurrent Score mutation. If a writer process disappears, its exact lease is preserved and mutation routes to explicit recovery rather than stealing ownership.

## G01 stays immutable

G02 does not trust caller-supplied G01-shaped objects merely because their hashes are self-consistent. Before any Score append it validates the canonical on-disk completed G01 conversation for the same Home/lineage/thread, requires the supplied conversation-head SHA to equal that current committed head, and requires every selected source event to be the exact canonical file reachable on that committed chain. Replay and source descent repeat that validation, so missing, substituted, re-addressed, reordered or orphaned G01 evidence fails typed rather than remaining plausible provenance.

Only then does G02 store compact source bindings:

```text
eventRef
eventHash
eventKind
sequence
turnRef
messageRef
contentHash
```

It does not copy raw G01 message content into Score provenance and it does not mutate `src/core/lived-companion.mjs` or G01 Home event files.

## Correction and supersession

A correction or supersession appends a successor statement event. The predecessor must be the exact current statement for the **same semantic subject and memory-relation identity**; a statement about one subject cannot de-current unrelated meaning. Replay marks the valid predecessor effectively `CORRECTED` or `SUPERSEDED` while retaining its immutable original event and exact source bindings.

```text
correction accepted != prior interpretation silently disappeared
summary exists != source erased
```

## Open loops

Open loops are source-bound continuity state. They may survive turns, shutdown and fresh-process replay. An unresolved loop is not proof that its premise is true and is not permission to coerce closure.

G02 therefore persists only `OPEN` loop state. A caller cannot mark a loop `RESOLVED`; source-managed resolution remains explicitly held until a separate exact resolution contract can prove why the loop is closed without erasing or coercing unresolved meaning.

## First-person wording

`I remember ...` is eligible only for an accepted, current `CURRENT_LINEAGE_AUTOBIOGRAPHY` statement when provenance, branch relation, identity stance and consent all permit it. Raw caller booleans are insufficient. Eligibility is evaluated only from a live replayed Score state plus one content-addressed evidence receipt that binds all four gates to the exact statement event, current lineage/thread, current committed G01 head, and committed G01 source-event hashes. Missing, stale, substituted, wrong-issuer or wrong-source evidence fails closed to attributed wording.

Other relations remain attributed:

```text
SHARED_RELATIONSHIP_HISTORY  -> relationship-attributed
PREDECESSOR_WITNESS_HISTORY -> predecessor-attributed
INHERITED_CONTEXT            -> source-attributed
EXTERNAL_EVIDENCE            -> source-attributed
DISPUTED_OR_UNRESOLVED       -> unresolved/attributed
```

Rhythm fluency never creates historical authority.

## Proof

```bash
npm run score-context:proof
```

The proof uses a temporary Vex Home and two actual numeric-loopback G01 HTTP turns, then proves committed-G01 source verification, relation coverage, same-subject correction/supersession, open-loop carry-forward with caller closure held, source-bound first-person eligibility, exact source descent, and fresh-process Score replay. The crash boundary runs in a separate child process that exits after the Score event is durable but before head advancement, proving the prior head remains current, the exact-next event stays uncommitted, and the abandoned writer lease routes to explicit recovery. Well-formed re-addressed/reordered and source-substituted tails are also injected and must produce attention.

The hosted Windows job binds the proof to the exact candidate head.

## Held effects

G02 explicitly does **not** claim or perform:

```text
dreamCompleted
Rhythm learning
model or adapter training
modelWeightsChanged
synchronizationActivated
personal endpoint activation
LC18
publication
```

Those remain later groups or separate admissions.

<!-- [VXG RealForever] -->
