# SVG plot assets and panels

A trusted caller supplies `createRenderer({..., svgAssets: {training: svgText}})`. The source document selects a key with `{tag:"SciSvgAsset", id:"plot", asset:"training", width:400, height:260, ...}`. JSON cannot request an arbitrary file or URL. The registry is copied and bounded to 128 entries/20 MiB. Individual SVGs are limited to 5 MiB and bounded structural/resource expansion.

The existing mount pipeline installs only trusted component markup first. Every required vector asset is parsed and sanitized while inert; none of the asset subtrees is inserted until all required sources pass. Thus PNG and HTML requests receive the same protection as SVG. Unknown assets and unsafe content return source-qualified `E_ASSET` stage diagnostics. Caller/study source remains unchanged.

The importer uses the shared SVG safety boundary, supports common static plotting CSS through inlining, namespaces IDs per instance, preserves aspect ratio and strips all input data-* roles so assets cannot impersonate Eraser bodies or slots. The exact standard external-only SVG 1.1 doctype is removed without fetching it. Internal entities and other doctypes still fail. Namespaced xlink references remain namespaced. Scripts, remote resources, HTML, animation, unsupported effects and raster images do not enter the scene. This is not a general Illustrator/Inkscape file converter.

Editable input text stays text. Already outlined glyphs cannot become editable text again; assets with no text receive a warning. Metadata/comments are not an acceptable place for clinical identifiers because they are still present in the caller's source; examples here are synthetic.

`fixtures/scientific/assets/panels.json` composes a native method panel with a vector plot. Its registry.json explicitly maps the training key to plot.svg for the forthcoming native CLI. No second figure compositor is introduced.

Local validation: 12 real Chromium asset assertions passed, including an actual Matplotlib SVG with text, CSS, clip paths and xlink reuse; two imports with unique resources; metadata/doctype handling; atomic unsafe-asset rejection; and missing-key failure. The preview was visually inspected. The 38 publication/safety checks still pass. The real renderer panel integration and all-format rejection tests are committed but remain workspace CI gates.
