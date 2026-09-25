# Living Journal Evolution presentation contract

Continuity: [VXG RealForever]

This document describes presentation seams intentionally stabilized by the Living Journal Evolution work. It is a DevEx map, not a new semantic owner.

## Design intent

The Journal is a testimony/story-preservation surface, not a report form. The primary experience is one shell-owned surface header, one Journal options affordance, one bounded vertically scrolling entry feed, reusable entry cells, and optional progressive continuation.

Do not make Vantage, archive navigation, source inspection, semantic return controls, or page-window controls permanent primary-reader chrome merely because their controller capabilities exist.

## Stable reusable seams

### Active-surface adapter mount context

Adapters receive body, surfaceRef, semanticRef, projection, and—when shell presentation composition is available—actions. body is the shell-owned active-surface body. actions is the optional shell-owned action row used only for presentation composition. Semantic-only consumers may omit actions; the adapter must still preserve canonical mount, Reference fallback, Close, and Journey ownership. A surface may compose one concise surface affordance into actions when present. The surface must restore moved canonical DOM during close/fallback. Semantic close remains owned by the registered adapter requestClose contract.

Living Journal uses this seam to present only #livingJournalOptionsOpen in the active header. The shell Reference and Close controls remain shell-owned but are composed into the Journal options layer while Journal is mounted.

### Journal options layer

#livingJournalTools identifies component.vexlife.journal.options-layer and consumes the qualified #703 e29-forward-layer.

The layer preserves visible dismissal, Escape dismissal, focus entry/return, viewport confinement, compact sheet/full-screen adaptation, and no semantic navigation on presentation dismissal.

### Entry feed

#livingJournalSpread identifies component.vexlife.journal.entry-feed and is the single Journal reader scroll owner.

### Entry cell

.living-journal-entry identifies component.vexlife.journal.entry-cell.

Required visible grammar: date; time when available; short testimony/event title; short preserved preview/body; optional progressive continuation.

Source bindings, temporal lineage, Memory currentness, archive identity, and other accountability metadata stay attached to the controller/data contract even when they are not permanent visible controls.

## Bounded volume

The first reader set is bounded to 12 entries. The synthetic reference fixture intentionally carries 12 entries so desktop and compact proofs exercise realistic scroll pressure instead of a four-row happy path.

Internal continuation methods may remain for future orchestration, but the primary reader does not expose Next/Previous page chrome.

## Ownership

- shell title / active host / close semantics: existing shell owners
- shared forward-layer mechanics: github.issue.vexlife.703
- Journal reader grammar / entry feed: github.issue.vexlife.626
- Memory truth: existing Memory owners
- Journey/back semantics: existing navigation owner

No presentation seam here grants Memory, Home, model, network, training, publication, cutover, or Reference-retirement authority.

## DevEx rule

Prefer extending a named seam/component contract over adding a one-off selector or second container. Future surface-level actions should consume the adapter actions seam. Transient menus/dialogs should consume the qualified forward-layer. Lists/feeds should declare one scroll owner and reusable cells. New semantic capabilities must route to the rightful semantic owner instead of hiding inside presentation code.
