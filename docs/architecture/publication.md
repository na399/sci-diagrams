# Publication lint and vector intake

`await renderer.lintSvg(svg, options)` validates inert XML before measuring it in an isolated browser shadow root. Options are widthMm, minFontPt, minStrokePt, maxWidthMm, maxHeightMm, allowedFonts, checkOverlaps and requireText. Returned metrics are physical millimeters, editable text count, final-transform minimum point sizes and declared font families. Warnings do not become errors unless the caller chooses that policy.

Generic defaults of 7 pt text and 0.5 pt strokes are configurable project preferences, not universal journal requirements. Font-family reports do not prove that a particular installed font supplied every glyph. Overlap detection is an optional bounded-box heuristic; it does not certify visual correctness. Raster images are outside this strict vector profile, rather than being assigned a misleading DPI pass.

Safety intake rejects scripts, handlers, foreignObject, animation, images, external references, DTD/entities, duplicate/unresolved IDs, cyclic/excessive resource expansion, invalid viewBox, unsupported effects, CSS fetches/escapes/at-rules and excessive element/geometry budgets. Styles use a bounded static paint/font declaration subset and simple selectors; they are inlined before mounting and never installed globally. Nonvisual metadata, comments and foreign editor attributes are removed. Asset imports will reuse this boundary.

Scientific fontFamily accepts bounded plain family names and optional generic fallback, such as `Arial, sans-serif`. Font installation/staging remains caller-owned. No font files are added by this stack.

Local verification: 38 real Chromium intake/publication assertions passed, including XML/CSS attacks, cycles, stylesheet specificity, namespaced resources, physical scaling, transformed small text, overflow and cleanup. New modules pass isolated strict TypeScript compilation. Workspace build and the committed renderer-level integration tests remain merge gates.
