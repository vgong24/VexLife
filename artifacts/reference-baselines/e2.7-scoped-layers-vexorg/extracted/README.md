# VexLife E2.7 — Scoped Layers + VexOrg Sandbox

Open `START-HERE.html`.

This candidate is built on the human-approved **E2.6 reference design baseline**. It does not replace E2.6; it declares a delta against it.

## New interaction refinements

- **Scope owns interaction.** Scrollable embedded surfaces keep their own scroll position and contain wheel/scroll momentum instead of also moving the parent Terrain/page.
- Scoped scroll state is remembered per semantic surface when revisiting through the journey.
- **Vex can be resized from all four corners** on desktop using direct press-drag-release gestures. Existing Small / Medium / Large presets remain available.
- The Vex conversation body keeps its own scroll scope.

## VexOrg synthetic sandbox

From:

```text
Vextreme
→ Your Business Potential
→ VexOrg Demo Company
```

you can explore a mock organization with:

```text
departments
teams
projects
people
self-logged contributions
recipient-controlled kudos
resource proposals
privacy / authority boundaries
```

The VexOrg lens offers:

```text
Structure
Projects
Contributions
```

as different projections over the same mock organization.

Right-click a synthetic person such as **Maya Chen** to create a mock **Propose move to Project Aurora** action. The proposal remains pending until acknowledged and does not silently alter the person's assignment.

## Anti-surveillance design boundary

This prototype deliberately avoids individual velocity/high-producer scoring as the default resource-planning mechanism. It demonstrates shared role/assignment truth, declared capacity, self-logged contribution, and explicitly shared kudos instead.

```text
private human + Vex conversation
!=
organization-visible VexOrg scope
```

If VexOrg earns implementation, it should be formed as a separate product/work family. This Review Kit/design lane is only providing the review sandbox.

No `FEEDBACK.md` is required for this refinement round; conversational review remains sufficient.

[VXG RealForever]
