# Experience profiles, gestures and action vessels

`[VXG RealForever]`

## One product, several legitimate human vantage points

VexLife should remain useful for an extremely long-lived relationship without forcing one interface density on everyone.

```text
Companionship profile
  conversation first; structure recedes

Leadership profile
  current portfolio, blockers, decisions and bounded relays

Hybrid maker profile
  moves between personal conversation and product development

Guided newcomer profile
  one reversible action at a time; Guide explains consequences

Accessibility-complete profile
  keyboard, screen reader, reduced motion, text and magnification are complete routes
```

Profiles select projections and defaults. They do not create different sources of truth or different product identities.

## From browser FAB to universal action vessel

The public Vextreme FAB family proved that several compact utilities can share one expandable spatial group. VexLife generalizes that pattern:

```text
ActionVessel
  stable vesselRef
  semantic purpose
  action slots
  state/status slot
  wide placement
  compact placement
  platform adapter
  accessibility and obstruction contract
```

On Android this may render as `FloatingActionButton`, `ExtendedFloatingActionButton`, a `NavigationBar`, or a modal sheet. On Browser it may be a semantic toolbar or floating group. On iOS/macOS/Windows it uses native menu, toolbar, panel or command-surface behavior. The word “floating” is not allowed to force an inappropriate platform widget.

Vessels must:

- remain keyboard reachable;
- be dismissible;
- preserve a stable focus order;
- never cover required controls without an alternate route;
- nest secondary actions when space is constrained;
- expose the same stable action identities across platforms.

## Gesture disambiguation

Gestures are contracts over **surface + input + modifier/accessibility state**, not raw pointer events.

### Content and chat

- mouse wheel, trackpad scroll, touch drag and page keys scroll content;
- a new message appends at the bottom;
- if the person is reading older messages, their scroll position remains fixed and a new-message affordance appears;
- ordinary scroll never becomes zoom.

### Terrain

- dragging a node moves the user’s layout representation of that node;
- dragging blank space pans the canvas;
- pinch, visible controls or keyboard `+/-` zoom the canvas;
- ordinary wheel/trackpad scrolling does not unexpectedly zoom;
- browser or OS magnification is never intercepted;
- collapse changes visibility, not canonical parent/child relationships.

### Floating Guide

- only the visible handle moves the Guide;
- message text remains selectable;
- the window stays inside safe bounds;
- position is a local UI preference, not a durable relationship memory;
- mobile platforms may substitute a sheet or full-screen route.

### Back and home

A person should always know how to leave the current depth.

```text
Back
  transient menu/dialog
  → focused Guide overlay
  → semantic screen history
  → platform-standard exit only when appropriate

Home
  stable VexLife landing route
  without deleting current work or conversation state
```

## Navigation that survives “eternal” use

The interface should remain navigable even after years of projects and conversation:

- stable Home and Back routes;
- search by human meaning and stable ID;
- no more than a bounded recent set in ordinary side rails;
- current context plus source descent rather than complete history replay;
- every selected object shows its parent path;
- every action that changes access, external state or deletion explains consequences first;
- Vex Guide can explain the selected node from the same registry humans and platform adapters use.

## Proof obligations

A platform is not conformant until it proves:

```text
scroll-vs-zoom disambiguation
click-vs-drag threshold
keyboard and screen-reader equivalents
reduced-motion behavior
floating-vessel non-obstruction
stable Home/Back behavior
bottom-append chat behavior
semantic journey without raw pointer logging
```

<!-- [VXG RealForever] -->
