# Scientific extension architecture

## Baseline and governing decision

Fork: `na399/sci-diagrams`.
Upstream: `eraserlabs/eraser-diagrams`.
Inspected base commit: `e11d8530f18dd76831226253648eb34402183890`.

Eraser is the base product and architecture. Earlier SolFigure work supplies requirements only. This implementation does not introduce a new document protocol, package hierarchy, editor, archive format, or execution framework.

Existing MDP envelopes, tag dispatch, schema validation, template isolation, browser measurement, routing, and measured-JSON reconstruction remain authoritative. The stock profile and PNG default remain unchanged. Existing licenses and history are retained. Fork-owned package names and a reviewed publishing workflow are required before distribution to npm; the current workspace namespace is development-only.

## Changes by layer

| Layer | Change |
| --- | --- |
| `protocol` | None |
| `layout` | None |
| `resolve` | Export `NormalizationError`; convert expected cross-field input failures to `E_SCHEMA`; avoid calling normalizers on schema-invalid objects; unexpected errors still propagate |
| `render` | Node-safe export of a browser-executed strict SVG serializer; no new layout pass |
| `diagrams` | `outputs.svg`, physical SVG options, transparent PNG option, diagnostic source pointers, scientific MDP library and explicit geometry helpers |
| `tools/scientific` | Additive local CLI helper using the same renderer API |
| Tests/docs | Unit and integration regressions, three synthetic source fixtures, capability/limitation documentation |

The SVG serializer deliberately has no captured runtime dependencies. `diagrams` sends it through `page.evaluate` after the existing browser pipeline applies layout. This avoids changing the upstream browser-bundle API solely to add an export path.

```text
MDP source + chosen profile
          |
          v
existing resolver
          |
          v
existing browser fill / measurement / router / apply
          |
          +---- existing HTML / PNG / measured JSON
          |
          v
restricted SVG extraction + physical-scale checks
          |
          v
editable SVG, or structured export errors
```

## Vector-safe path

Scientific entities use SVG bodies. Connections use the existing SVG route overlay plus an SVG label inside an unpainted HTML positioning span. The router therefore receives the same measured label box that the exported label uses.

No arbitrary HTML-to-SVG translation is attempted. Unsupported HTML paint and unsupported SVG constructs fail. There is no image or `foreignObject` fallback. Structural export checks are not an untrusted-content sandbox: libraries and normalizers are trusted installed code and must still pass upstream validation before mounting.

MDP `data-each` repeats a host's children. Text repetitions use a `<g>` host containing a `<text>` child. Upstream repeated subtrees are substitution-only, so event/interval primitives are pre-partitioned rather than relying on nested conditional directives. These are compatibility decisions, not changes to MDP.

Source JSON remains authoritative. Measured JSON preserves authored properties and adds geometry through upstream reconstruction. Editing an SVG does not update its MDP source.

## Composition and temporal semantics

`arrange()` is an explicit pure helper for row, column, and grid placements with known dimensions. It returns cloned MDP objects and refuses to overwrite authored coordinates. It is not an implicit composition engine. No general constraint solver or second graph router is introduced.

`SciTimeline` is a profile component, not clinical logic in the layout engine. It maps numeric relative coordinates linearly inside its own viewport. Interval endpoints have explicit closure. Domain violations, reversed intervals, duplicate IDs, and unknown lanes are rejected. Scientific/clinical validity, counts, missingness, and study-methodology checks remain the author's responsibility.

## Milestone accounting

| Planned area | Status in this branch |
| --- | --- |
| Eraser-first guardrails | Documented; protocol/layout unchanged |
| Native vector feasibility | Implemented; isolated browser checks available |
| SVG output | API and additive helper implemented; integration gate pending |
| Physical sizing | Width in millimeters with preserved aspect ratio |
| Scientific library | Ten initial tags; explicit label lines |
| Annotations | Horizontal dimensions and braces; plain text |
| Ports | Existing face ports only; arbitrary named ports deferred |
| Composition | Explicit row/column/grid helpers; no measured or implicit composition |
| Timeline | Linear numeric scale, lanes, points, interval closure |
| Model primitives | Tensor/matrix glyphs and generic operators |
| Acceptance figures | Three synthetic sources and real-renderer tests committed |
| Publication lint | Initial physical font/stroke warnings and text viewport checks only |
| SVG asset import / plot panels | Deferred |
| PDF export | Deferred |
| Editor / archive / collaboration | Out of scope |

## Validation status

Local verification on 2026-09-20:

- 15 standalone Chromium exporter checks passed, including rejection cases and deterministic output.
- The applied-scene versus exported-SVG comparison changed 0 of 144,000 pixels in its test fixture.
- 16 dependency-free geometry checks passed under Node.
- 32 isolated component/browser checks passed across the three fixture families. These exercise the scientific normalizers/templates with a local copy of the upstream fill algorithm; they do not exercise the complete resolver/router pipeline.
- New isolated modules type-checked. The scientific library check used local interface stubs because full workspace dependencies could not be obtained.

The environment could not clone or install the complete repository, and the fresh fork had no Actions runs when inspected. **A successful full build, dependency-boundary check, repository lint/test run, and actual renderer integration run have not been established.** The PR remains draft until those gates pass. Isolated evidence must not be described as complete integration coverage.

The repository contains tests using the actual resolver and renderer to close this gap. Run the commands in `SCIENTIFIC.md`, inspect the Playwright SVG/PNG attachments, and update this status only with real results.

## Release gate and next work

Before merge as a usable release: run the full build, typecheck, dependency-cruiser, lint, unit suite, existing browser tests, and scientific SVG integration suite; inspect all three figures at intended physical size. Verify fonts and an independent SVG consumer. Preserve source files and do not repair expected artifacts by hand to hide mismatches.

After integration is green, prioritize named perimeter ports and measured-size composition only where acceptance figures demonstrate a need. Then consider safe SVG asset import and vector PDF export. Do not add a new source protocol, general solver, editor, or domain ontology to solve those incremental requirements.

For upstream synchronization, merge the inspected upstream changes on a separate integration branch, run both stock and scientific regressions, and review any changes to template fill, measurement, apply-layer paint ordering, SVG masks, and output typing. No untested automatic upstream merge is configured.
