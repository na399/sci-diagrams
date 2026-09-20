# Scientific figures in sci-diagrams

This is an Eraser Diagrams fork. MDP, the stock profile, resolver, Chromium measurement and routing remain the foundation. Scientific figures use an opt-in component library, measured composition and strict editable SVG. No separate figure protocol, desktop editor or agent runtime is introduced.

**Status: implementation stack available; release qualification pending.** See [the PR stack](docs/STACK.md) and [qualification gates](docs/QUALIFICATION.md). Committed integration tests are not evidence that they have passed.

## Run a figure

Use Node 22.12 or newer, the pnpm version in `package.json`, and Chrome/Chromium.

```sh
pnpm install --frozen-lockfile
pnpm build

node tools/scientific/render.mjs fixtures/scientific/cohort-timeline.json \
  --width 178mm --format svg,pdf,png,json \
  --out-dir out/scientific
```

The multi-format helper performs one figure render and writes the requested `.svg`, `.pdf`, `.png`, `.html` and `.measured.json` artifacts. `--width-mm 178` remains supported. Set `--chromium-path` or `CHROMIUM_PATH` when automatic macOS/Linux browser discovery is insufficient.

The **native CLI now also supports SVG and PDF**:

```sh
node packages/diagrams-cli/dist/cli.js render \
  fixtures/scientific/cohort-timeline.json \
  --profile scientific --format svg --width 178mm -o out/timeline.svg
```

Use `--profile scientific-web` for the alternative web theme. The stock profile remains the default. These profile/width/assets/lint switches are render flags; browserless `validate`, `registry` and `schema` retain the existing custom-library configuration mechanism. `--print-config` reports that existing configuration, not the additive render-only switches.

`--lint` runs publication checks before writing. Add `--fail-on-warning` to reject warnings as well as errors. The multi-format helper uses the source document's `title` for SVG accessibility; the API accepts explicit title/description options. A missing title can itself produce a publication warning.

Writes are atomic per file, not transactional across an output directory. Source overwrite and colliding native-CLI batch destinations are rejected. Invocation/I/O failures return exit 2, rejected figures return 1, and successful exports return 0. No raster fallback is performed.

## Compose an imported plot

```sh
node tools/scientific/render.mjs fixtures/scientific/assets/panels.json \
  --assets fixtures/scientific/assets/registry.json \
  --width 178mm --format svg,pdf,png \
  --out-dir out/panels
```

An explicit registry maps asset IDs to relative local paths, for example `{ "plot": "plot.svg" }`. Paths are resolved relative to the registry directory, cannot escape it through symlinks, and are bounded by file/count/total-size limits. API callers can instead supply a bounded `svgAssets` map of SVG strings. Source documents reference those IDs through `SciSvgAsset`; they cannot choose arbitrary filesystem paths or network URLs.

SVG intake is validated while inert before assets enter the scene. Scripts, event handlers, raster images, external resources, resource cycles, excessive expansion, unsupported effects and `foreignObject` fail closed. Supported static CSS is inlined and IDs are isolated per imported instance. An exact external-only standard SVG 1.1 doctype can be removed without fetching it; internal entity declarations remain forbidden. See [SVG assets](docs/architecture/svg-assets.md).

## API

```ts
import { writeFile } from 'node:fs/promises';
import { createRenderer } from '@eraserlabs/diagrams';
import { scientificLibrary, scientificNormalizers } from '@eraserlabs/diagrams/scientific';

const renderer = await createRenderer({
  chromiumPath: '/usr/bin/chromium',
  library: scientificLibrary,
  normalizers: scientificNormalizers,
  svgOptions: {
    widthMm: 178,
    title: 'Study design',
    description: 'Synthetic cohort illustration.',
    background: 'white',
    minFontPt: 7,
    minStrokePt: 0.5,
  },
});
try {
  const result = await renderer.render({
    entities: [{
      tag: 'SciBlock', id: 'cohort', x: 20, y: 20,
      width: 220, height: 90, label: 'Eligible cohort\nSynthetic example',
    }],
    connections: [],
    outputs: { svg: true, pdf: true, png: true, json: true },
  });
  if (!result.ok) { throw new Error(JSON.stringify(result.errors)); }
  const report = await renderer.lintSvg(result.svg);
  if (!report.ok) { throw new Error(JSON.stringify(report.issues)); }
  await writeFile('study.svg', result.svg);
  await writeFile('study.pdf', result.pdf);
} finally {
  await renderer.close();
}
```

`outputs.pdf` derives from the same strict SVG export used by `outputs.svg`. It does not introduce a second diagram layout. PDF printing uses a dedicated page, leaves pooled scenes untouched and blocks network requests during printing. PDF-only requests do not implicitly return an SVG field. Expected print-validation failures carry `stageCode: E_PDF`; unexpected runtime errors are not disguised as invalid figure input.

The renderer supports 1–16 warm pages. Close is idempotent and rejects queued work. See [vector PDF](docs/architecture/vector-pdf.md) for font and physical-size limitations.

## Scientific vocabulary

| Family | Components/capabilities |
| --- | --- |
| Structure | `SciBlock`, `SciGroup`, `SciPanel`, `SciRegion`, `SciText` |
| Relationships | `SciLink`, `SciLeader`, explicit side/named ports, arrow and dash semantics |
| Annotations | `SciDimension`, `SciBrace`, `SciBracket`, `SciDivider`, `SciCallout` |
| Model/data glyphs | `SciOperator`, `SciTensor`, configurable abstract `SciMatrix`, `SciSequence`, `SciRepeat` |
| Temporal figures | `SciTimeline`, numeric scales, lanes/subrows, interval closure, index and censoring marks |
| Composition with results | `SciSvgAsset`, sanitized plot vectors in native panels |

Inspect `renderer.registryInfo()` and `renderer.tagSchema(tag)` for the implemented schema rather than assuming an arbitrary property is supported. Components are generic visual structures, not an AI-model or clinical ontology. Matrices and repeated blocks are schematic glyphs, not plotting/statistical computation.

### Placement and ports

The authored document remains flat MDP entities/connections, with `containerId` for containment. Coordinates remain Eraser scene pixels; physical output sizing is an export transform.

Measured row, column, grid, stack and overlay composition size children inside-out and place them outside-in. Explicit pins remain pins. Measured JSON retains `layoutItem: "flow"` for automatically placed entities so re-rendering does not accidentally pin every child. Group/panel frame growth does not scale text or tensor glyphs. The older explicit `arrange()` helper remains available for known-size layouts.

Named normalized perimeter ports are translated into Eraser's existing relative-port/face contracts. Unknown or malformed ports fail with source-qualified diagnostics. Named ports currently require rectangular routable bodies; curved outlines retain ordinary side-port behavior. Exact manually authored paths remain available.

### Timelines

Positions are proportional to explicit numeric offsets. The library does not convert calendar dates, months or time zones. Specify the intended `unit` and `originLabel`. Explicit subrows separate visual items without moving their time coordinates.

Interval closure is explicit: `left` means `[start,end)`, `right` means `(start,end]`, `both` includes both endpoints and `neither` excludes both. Intervals require `end > start`. Out-of-domain positions are rejected, not silently clamped. Events, intervals, lanes and censoring marks require valid references/IDs. White-filled excluded-endpoint markers currently assume a white timeline background.

Clinical intent, study-design validity and general cohort-count arithmetic remain the author's responsibility. The acceptance corpus has explicit synthetic count-conservation assertions; that is not a generic clinical validator.

## Publication and reproducibility

Strict SVG retains editable text, routed paths and source identities. Unsupported HTML/CSS is rejected, not converted to screenshots. The publication linter measures final physical font/stroke sizes, bounds and configured overlap/font rules. Thresholds such as 7 pt text and 0.5 pt strokes are configurable project settings, not universal journal requirements.

SVG font families are editable references, not automatically embedded fonts or outlined text. PDF font embedding is handled by Chromium and must be inspected for the selected fonts. Pin the browser, OS/font environment, source, assets and theme when qualifying a figure. Identical PDF bytes are not promised because the print backend writes metadata. Manually edited SVG does not become new MDP source.

Use `<img src="figure.svg">` to isolate multiple SVGs on a blog page unless resource IDs are additionally namespaced across documents. `--transparent` changes the canvas background, not explicit component fills.

Not included: arbitrary HTML-to-SVG conversion, automatic general text wrapping, a global constraint solver, TeX, statistical plotting, a GUI editor, `.solfig`, PPTX, or journal certification. Illustrator/Inkscape interoperability and cross-platform font identity still require qualification.

## Distribution

The `@eraserlabs/*` workspace names remain for development continuity. The fork must not publish packages under the upstream namespace. The inherited publish workflow is guarded in the foundation PR as well as the final cumulative branch. Choosing a fork-owned namespace and publishing a release require a separate explicit decision.

All example figures are synthetic. The [qualification checklist](docs/QUALIFICATION.md), not the existence of source fixtures or draft PRs, determines readiness.
