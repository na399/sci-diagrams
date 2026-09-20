# Scientific figures in sci-diagrams

`sci-diagrams` is an Eraser Diagrams fork, not a new figure protocol. The scientific extension keeps MDP documents, the resolver, browser measurement, routing, and existing stock rendering. It adds an opt-in scientific component library and strict SVG output from the same applied scene.

**Status: experimental foundation.** The repository-wide build and real renderer integration tests must pass before this branch is considered release-ready. See [validation status](docs/architecture/scientific-extension.md#validation-status).

## Run an example

Use the fork checkout, Node 22.12 or newer, pnpm as pinned by `package.json`, and a local Chrome/Chromium installation. There are no new runtime dependencies.

```sh
pnpm install --frozen-lockfile
pnpm build

node tools/scientific/render.mjs fixtures/scientific/cohort-timeline.json \
  --width-mm 178 --format svg,png,json \
  --out-dir out/scientific
```

Browser discovery checks `CHROMIUM_PATH` and common macOS/Linux installation paths. To specify Chrome on macOS:

```sh
node tools/scientific/render.mjs fixtures/scientific/dense-model.json \
  --chromium-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --width-mm 178 --format svg,png,html,json
```

The helper writes `name.svg`, `name.png`, `name.html`, and `name.measured.json` as requested. Each file is written through a temporary file and rename. A render or strict-SVG failure writes no requested artifacts. An I/O failure during multi-file output may leave earlier completed files; this is not a transactional export directory. Source JSON is not overwritten.

`--transparent` preserves a transparent PNG canvas and SVG background; it does not remove component fills. `--fail-on-warning` prevents writes when any warning occurs. Warnings and errors are JSON on stderr. Exit codes are 0 for success, 1 for a rejected figure, and 2 for invocation, browser, or I/O failures.

This helper is additive. The existing `eraser-diagrams` CLI has not yet gained an `--format svg` flag. Use the helper or API for SVG. Existing custom-library configuration remains available for the upstream CLI's supported outputs.

## API

```ts
import { writeFile } from 'node:fs/promises';
import { createRenderer } from '@eraserlabs/diagrams';
import {
  scientificLibrary,
  scientificNormalizers,
} from '@eraserlabs/diagrams/scientific';

const renderer = await createRenderer({
  chromiumPath: '/usr/bin/chromium',
  library: scientificLibrary,
  normalizers: scientificNormalizers,
  svgOptions: {
    widthMm: 178,
    title: 'Study design',
    description: 'Predictor ascertainment and follow-up relative to index.',
    background: 'white',
    minFontPt: 7,
    minStrokePt: 0.5,
  },
});

try {
  const result = await renderer.render({
    entities: [
      {
        tag: 'SciBlock', id: 'cohort', x: 20, y: 20,
        width: 220, height: 90, label: 'Eligible cohort\nSynthetic example',
      },
    ],
    connections: [],
    outputs: { svg: true, png: true, json: true },
  });
  if (!result.ok) {
    throw new Error(JSON.stringify(result.errors));
  }
  await writeFile('study.svg', result.svg);
} finally {
  await renderer.close();
}
```

The `@eraserlabs/*` workspace names are retained to minimize upstream divergence. This fork must **not** be published to npm under the upstream namespace. A fork-owned namespace is a release prerequisite.

Use `createScientificLibrary('web')` for the alternative subdued web palette. A library and its normalizers must be supplied together. The stock library remains the default; the scientific profile does not silently replace it or merge its vocabulary.

## Components

| Tag | Current capability |
| --- | --- |
| `SciBlock` | Module, process, cohort, or other labeled rectangle |
| `SciGroup` | Fixed-size MDP container with a title |
| `SciText` | Plain annotation text, with explicit newline breaks |
| `SciOperator` | Labeled ellipse, including Unicode mathematical operators |
| `SciTensor` | Schematic tensor with optional dimension labels |
| `SciMatrix` | Abstract 4-by-4 matrix glyph, not a data heatmap |
| `SciDimension` | Horizontal dimension line and label |
| `SciBrace` | Horizontal brace and label |
| `SciTimeline` | Proportional numeric timelines, lanes, points, intervals |
| `SciLink` | Existing Eraser routing with vector arrowheads and SVG labels |

Entities require `id`, `x`, and `y`. Geometry remains in Eraser's pixel coordinate system. Set `width` and `height` explicitly for dense figures. Plain labels accept `\n`; automatic wrapping, Markdown, TeX, and automatic label collision avoidance are not included.

`SciGroup` uses normal flat MDP `containerId` references. Child coordinates are scene coordinates, not parent-relative coordinates. It is not an implicit row/grid layout or a dynamically sized panel. Ensure its authored bounds enclose its members.

`SciLink` supports `fromPort`/`toPort` values `top`, `right`, `bottom`, and `left`, existing `straight`/`elbow` route choices, and explicit `points`. Arbitrary named ports have not been added. `labelWidth` sets a connection label's viewport when the conservative default is inadequate. Long labels should use explicit newlines and sufficient space.

## Quantitative timelines

```json
{
  "entities": [{
    "tag": "SciTimeline", "id": "study-time", "x": 20, "y": 20,
    "width": 1000, "start": -365, "end": 90, "origin": 0,
    "ticks": [-365, -180, -60, 0, 30, 90],
    "lanes": [{"id": "predictors", "label": "Predictors"}],
    "items": [{
      "id": "baseline", "lane": "predictors", "kind": "interval",
      "start": -365, "end": -60, "closed": "left",
      "label": "Feature ascertainment"
    }]
  }],
  "connections": []
}
```

Positions are proportional to the numeric domain. Out-of-domain values are rejected rather than clamped. Numeric units must be identified in the figure text; this is not a calendar/date/time-zone engine.

`kind: "event"` requires a `start` and forbids `end`. An interval requires `end > start`. Endpoint closure is explicit: `left` means `[start, end)`, `right` means `(start, end]`, `both` includes both, and `neither` excludes both. The default is `left`. Solid circles denote included endpoints and white-filled circles excluded endpoints. The latter currently assume a white plotting background.

Lanes and items need unique IDs. A lane reference must exist. The initial limits are 32 lanes, 512 items, and 64 ticks. Overlapping items and labels in one lane are not automatically separated. Use separate lanes and human review. The renderer does not validate clinical study design, clinical validity of a risk window, or cohort-count arithmetic.

## Explicit arrangement helpers

```ts
import { arrange } from '@eraserlabs/diagrams/scientific';

const entities = arrange([
  { tag: 'SciBlock', id: 'a', width: 200, height: 80, label: 'Input' },
  { tag: 'SciBlock', id: 'b', width: 200, height: 80, label: 'Model' },
], { type: 'row', x: 20, y: 20, gap: 40, align: 'center' });
```

`row`, `column`, and `grid` operate on known sizes, clone their inputs, and emit ordinary MDP coordinates. They refuse to overwrite authored `x` or `y`. There is no new document envelope, implicit composition stage, constraint solver, or change to MDP coordinate semantics.

## Strict SVG contract

SVG is extracted from the applied browser scene, after Eraser has measured and routed it. It is not a screenshot and does not run an independent layout. Vector-safe templates paint with SVG while unpainted HTML wrappers may position SVG islands.

The exporter preserves text as `<text>`, routes as paths, and source identity in `data-mdp-id`/`data-mdp-tag` groups. It resolves supported presentation styles and namespaces SVG resource IDs within one output document. It rejects unsupported HTML paint, `foreignObject`, raster images, scripts/event handlers, external or unresolved resource references, unsupported effects, and detected text viewport overflow. There is no silent raster fallback.

This is a restricted export contract, not arbitrary HTML/CSS-to-SVG conversion or an untrusted-SVG import sanitizer. Template libraries and normalizers remain trusted installed code, governed by Eraser's existing validation rules. Imported SVG assets are not supported yet. Manual SVG edits do not round-trip back into MDP; source JSON remains authoritative.

Physical output width does not alter the underlying geometry. Font and stroke checks use the **final physical scale**, so shrinking a dense figure can produce warnings. Default 7-point text and 0.5-point strokes are configurable project thresholds, not universal journal requirements. Warnings do not establish publication compliance. No complete contrast, overlap, accessibility, or scientific-correctness audit is implied.

Fonts remain editable references and are not embedded or outlined. The initial profile uses generic font families. Pin the browser and installed fonts for reproducible builds, and check the result in the intended editor/submission tool. Cross-platform byte identity and Illustrator/Inkscape interoperability have not been certified. For multiple inline SVG figures on one web page, isolate them with `<img>` until document-level resource-ID prefixes are added.

## Examples and tests

The three source fixtures are synthetic and contain no patient data:

- `fixtures/scientific/dense-model.json`: model boundary, multiple modalities, operators, a residual path, tensor/matrix glyphs, and annotations.
- `fixtures/scientific/cohort-timeline.json`: proportional ascertainment, exclusion gap, index, outcome, and follow-up windows.
- `fixtures/scientific/cohort-design.json`: branching, exclusions, comparison groups, and synthetic counts.

After dependency installation and build:

```sh
pnpm typecheck
pnpm depcruise
pnpm lint
pnpm test
pnpm --filter @eraserlabs/diagrams exec playwright install chromium --with-deps
pnpm --filter @eraserlabs/diagrams exec playwright test test/scientific-svg.spec.ts
pnpm test:e2e
```

The dedicated integration tests attach generated SVG/PNG previews to the Playwright report. Those reports, not hand-edited pictures, are the acceptance evidence. Fixtures are acceptance **inputs**, not a claim that the full integration gate has already passed.
