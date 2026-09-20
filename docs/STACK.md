# Scientific implementation stack

The original PR0–PR14 milestones are represented by nine dependent PRs. PR #1 already implemented multiple foundation/vector milestones; subsequent PRs extend that work rather than duplicating it.

| PR | Branch | Base | Original-plan coverage |
| --- | --- | --- | --- |
| [#1](https://github.com/na399/sci-diagrams/pull/1) | `feat/scientific-svg-foundation` | `main` | Foundation, SVG feasibility/export, initial units/library, first annotations and domain examples |
| [#2](https://github.com/na399/sci-diagrams/pull/2) | `stack/02-annotations` | #1 branch | Remaining PR0/4/6 guardrails, physical units, annotation primitives and frame handles |
| [#3](https://github.com/na399/sci-diagrams/pull/3) | `stack/03-ports` | #2 branch | PR7 named normalized perimeter ports, existing router integration and regression cases |
| [#4](https://github.com/na399/sci-diagrams/pull/4) | `stack/04-composition` | #3 branch | PR8 measured row/column/grid/stack/overlay and placement ownership |
| [#5](https://github.com/na399/sci-diagrams/pull/5) | `stack/05-domain` | #4 branch | Remaining PR9/10 timelines, sequences, repeated motifs and scientific glyphs |
| [#6](https://github.com/na399/sci-diagrams/pull/6) | `stack/06-acceptance` | #5 branch | PR1/11 executable dense-model, cohort-timeline and cohort-design acceptance corpus |
| [#7](https://github.com/na399/sci-diagrams/pull/7) | `stack/07-publication` | #6 branch | PR12 inert SVG safety and measured publication lint |
| [#8](https://github.com/na399/sci-diagrams/pull/8) | `stack/08-assets` | #7 branch | PR13 sanitized SVG plot assets and native/imported panel composition |
| [#9](https://github.com/na399/sci-diagrams/pull/9) | `stack/09-pdf-release` | #8 branch | PR14 vector PDF, native CLI, bounded asset-file loading, output safety, CI and release qualification |

`stack/09-pdf-release` contains the cumulative implementation. All nine PRs are **implementation-complete and ready for review**. They remain unmerged pending the [qualification gates](QUALIFICATION.md). Feature code, source fixtures and committed test cases are not claims of a successful complete-workspace run.

The inherited npm publishing guard is also backported to #1, so it protects the first merge rather than arriving only at the last milestone. No branches have been force-rewritten or merged. See the qualification document for bottom-up merge/retarget guidance, including that small parent-only backport.

## Boundaries retained

MDP stays the source document model. The scientific library is opt-in, generic placement/routing remains in Eraser's existing layers, and SVG/PDF reject unsupported paint rather than rasterizing it. No SolFigure protocol, GUI editor, hosted service, plotting/statistical engine or LLM runtime is introduced.

## Entry points

- [Scientific usage and API](../SCIENTIFIC.md)
- [Vector PDF contract](architecture/vector-pdf.md)
- [Imported SVG assets](architecture/svg-assets.md)
- [Qualification status and commands](QUALIFICATION.md)

No npm publication or hosted deployment is part of this stack.
