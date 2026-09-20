# Qualification status and merge gates

## Current status

The implementation is present across PRs #1–#9. All remain draft. The cumulative branch is `stack/09-pdf-release`.

The implementation environment could read/write GitHub through the connector but could not resolve GitHub/npm hosts for a full checkout and dependency installation. No GitHub Actions runs were visible when checked on 2026-09-20. Consequently **full-workspace build, type checks, lint, unit tests, native CLI integration and renderer integration are not reported as passing**.

### Local checks actually run for the final export work

| Check | Result | Scope |
| --- | --- | --- |
| PDF print-helper assertions | 17 passed | Real local Chromium; success/failure cleanup, concurrent printing, physical units, invalid inputs and blocked requests |
| PDF artifact inspection | 5 PDFs inspected | Each had one page, searchable test labels, vector drawing objects and no raster images |
| Local SVG registry loader assertions | 18 passed | Actual new file-loader module; bounded files, invalid UTF-8, malformed registries, path/symlink escapes |
| Output-safety assertions | 10 passed | Actual new output module; source aliases, duplicate destinations, replacement and temporary-file cleanup |
| Isolated module compilation | Passed for the helper/file/output modules | Not the complete workspace or its integration types |
| Multi-format helper syntax | Passed | Node syntax check; not a full renderer invocation |

These are local smoke assertions, **not counts from a completed repository Vitest/Playwright run**. Local Chromium was 144.0.7559.96, not the repository's pinned test browser. Earlier PR-local checks are described in their PRs and likewise do not replace qualification of the final cumulative tree.

## Automated gates

After installing the repository dependencies and a test browser:

```sh
pnpm install --frozen-lockfile
pnpm --filter @eraserlabs/diagrams exec playwright install chromium --with-deps
pnpm build
pnpm typecheck
pnpm -r typecheck
pnpm depcruise
pnpm lint
pnpm test
pnpm test:e2e
node tools/scientific/acceptance.mjs
```

The PDF inspection tests require Poppler `pdfinfo` and `pdftotext` on PATH. CI installs these as test-only dependencies. On a local machine, install them before running the complete PDF test suite. Browser installation remains caller-owned; an explicit `CHROMIUM_PATH` is supported for local work, but qualification should record the exact browser/font environment.

CI preserves browser reports plus the three-domain corpus under `out/scientific-acceptance`. The corpus runner emits SVG, PDF, PNG, measured JSON, hashes and publication findings. Its `qualified: false` field is deliberate: a successful automated run does not assert human publication review.

Required automated results:

- Existing stock-profile and JSON round-trip regressions pass without being disabled.
- New annotations, named ports, measured composition, timeline/domain, asset and publication tests pass.
- Native CLI SVG/PDF exports pass, reject source overwrite and respect warning/error gates.
- PDF tests establish a one-page output, requested physical size within the documented print tolerance, searchable labels and no raster fallback.
- Three-domain rendering and the imported-plot example run through the actual installed resolver/router, not local stubs.

## Human figure review

Review the dense model, cohort timeline, cohort design and imported-plot panel at their actual physical sizes. Check long labels, mathematical symbols, ports, bypass paths, braces, panel alignment, interval endpoints, scale proportionality and plot clipping.

Compare SVG and PDF in the tools that will actually consume the figures. Verify fonts, extracted text and grayscale legibility. Resolve blocking findings and record dispositions for warnings. These checks do not validate clinical study design or scientific claims.

For a reproducibility receipt, record the source/asset/theme hashes, commit, Node/pnpm/browser versions, OS and font environment, dimensions, diagnostics, inspected artifact hashes and reviewer. A PDF hash identifies the inspected file; it is not a promise of repeatable PDF metadata bytes.

## Merge and release

Do not merge solely because the stack has implementation commits. Run the cumulative gates first, then review the small diffs bottom-up.

A low-friction merge strategy is a regular merge commit for #1, retarget #2 to `main`, merge it, then repeat through #9. This preserves ancestry. Squashing/rebasing parent PRs requires restacking descendants; do not force-update branches that have acquired other work.

The upstream npm publication guard is backported to #1 and also present in the cumulative tip, so the first merge does not invoke upstream package publication. Intermediate branches may show that small parent-only backport as an out-of-date base until retargeted; preserve the guard when reconciling.

Package namespace selection, npm publication, a hosted service and editor distribution are not authorized or performed by this stack. The inherited `@eraserlabs/*` names are development-only.
