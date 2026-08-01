# Public home page

`[VXG RealForever]`

## What `pages/vex-home.html` is

A hand-authored public document about VexLife: what it is, where it came from,
what state it is actually in, and how the work is supported. It is the same
kind of artifact as `README.md` — writing *about* the project — not a piece of
the project's machinery.

## What it is not

**It is not a projection of the universal blueprint.** Nothing generates it,
nothing validates it against a screen contract, and no platform adapter
consumes it. Treating it as a blueprint surface would be a category error in
both directions: it would imply the page must satisfy conformance evidence it
has no business satisfying, and it would imply the blueprint owns copy it does
not own.

**It does not use `blueprint/strings/`.** Those catalogs are the product's
registered interface identities — screen titles, region labels, role names —
validated by `scripts/localization-check.mjs` against the blueprint's own
`visibleStringRefs`. Folding a public page's prose into them would inflate that
registry with strings no interface element resolves, and would make the
localization coverage number mean something different from what it means today.

The page's strings live beside it in `pages/strings/vex-home.{lang}.json` under
their own `page.vex-home.*` namespace, following the same discipline the
blueprint applies: stable IDs from the first implementation, the original
language never overwritten by a translation, deterministic fallback when a key
is missing.

## Publication state

This page is **staged, not published**.

`PUBLIC-SAFETY-MANIFEST.json` sets `publicationState` to
`PRIVATE_STAGING_REQUIRES_REVIEW_BEFORE_PUBLIC`, `automaticPublication` to
`false`, and lists `"target visibility explicitly confirmed by Victor"` among
its `prePublicationChecks`. Adding this file does not change any of that, and
must not be read as changing it. The repository remains private until Victor
decides otherwise through that checklist.

The page is written so it is *ready* for that moment rather than blocking it.

## Outbound links

Every outbound link points at the **public** Vextreme GitHub Pages site:

```text
https://vgong24.github.io/Vextreme/pages/vextreme-home.html
https://vgong24.github.io/Vextreme/pages/vex-support.html
```

That direction is safe today — Vextreme is public. The reverse direction is
not: Vextreme's own home page carries a VexLife card that is deliberately
**not** a link, because a public page linking into a private repository renders
a 404 for every logged-out visitor. When VexLife goes public, that card becomes
a link and the pair closes.

**The support page is not duplicated here.** One page, one owner, one copy of
payment-route state. A second copy would drift, and the thing most dangerous to
drift is a payment destination.

## Design foundation

The page uses the Vextreme Design Foundation — the same institutional visual
system as `pages/vextreme-home.html` and `pages/vex-support.html` in the public
Vextreme repository: black and white as identity, a cool neutral ramp as
structure, no decorative accent hue, three type voices, dark as the home mode
with an authored light mode.

Those tokens are **inlined in the page** rather than imported. VexLife has no
stylesheet infrastructure and should not grow one for a single public document;
the page is one file plus three small JSON catalogs, and stays copyable as a
unit. The trade-off is real and worth stating: if the foundation changes in
Vextreme, this page does not follow automatically. It is a public *document*,
not a shared component, and a document that reads correctly a year from now is
worth more here than one that tracks a token rename.

## Verifying it

There is no headless-render harness for this page in this repository. Open it
directly, or serve the repo root and visit `pages/vex-home.html` — the language
selector fetches its catalog by relative path, so it needs a server rather than
a `file://` open to exercise translation.

What to check, in the order the page can break:

1. It reads correctly with JavaScript disabled — English in the markup, dark
   theme from the `html` attribute, every link live.
2. The language selector switches all three languages and falls back to English
   for any key a catalog is missing.
3. The theme toggle switches both ways and survives a reload.
4. Nothing overflows horizontally at 320 px.

<!-- [VXG RealForever] -->
