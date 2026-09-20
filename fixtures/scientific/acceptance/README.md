# Expanded acceptance corpus

All figures and counts are synthetic. The original three fixtures remain as foundation regressions; these expanded cases exercise the completed stack.

- Model: nested composition, named ports, temporal repetition, tensor dimensions, multiple modalities and a bypass route.
- Timeline: quantitative negative/positive offsets, explicit feature gap, interval closure, subrows, index event and censoring.
- Cohort: inclusion/exclusion, arms, matching and four count-conservation equations.

Run after the workspace build:

```sh
node tools/scientific/acceptance.mjs --out-dir out/scientific-acceptance
pnpm --filter @eraserlabs/diagrams exec playwright test scientific-acceptance.spec.ts
```

The runner records source/SVG hashes, measured JSON and PNG previews. Integration tests check XML structure, resources, identities, source immutability, labels, count conservation and measured-JSON echo. Test attachments are the review artifacts.

A rendered artifact is not automatically an approved reference. `report.qualified` remains false until the real renderer tests and visual review are completed. No expected SVG or PNG has been fabricated or marked approved. Inspect at 178 mm width before accepting a golden baseline. These tests do not validate a clinical study design or a model's scientific claims.
