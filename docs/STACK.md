# Scientific implementation stack

PR #1 contains the original plan's foundation, SVG feasibility/export, initial physical sizing, base components, and first timeline/tensor examples. Do not manufacture duplicate PRs for those changes.

Dependent branches complete the plan in this order:

1. `stack/02-annotations`: remaining PR0/4/6 guardrails, units, annotation primitives and frame handles.
2. `stack/03-ports`: PR7 arbitrary named perimeter ports, existing router integration and regression tests.
3. `stack/04-composition`: PR8 measured row/column/grid/stack/overlay and explicit placement ownership.
4. `stack/05-domain`: remaining PR9/10 temporal/domain primitives and repeated sequences.
5. `stack/06-acceptance`: PR1/11 executable multi-domain acceptance corpus.
6. `stack/07-publication`: PR12 structural and publication lint.
7. `stack/08-assets`: PR13 pre-mount sanitized SVG plot assets and panel composition.
8. `stack/09-pdf-release`: PR14 vector PDF, native CLI integration and release gates.

Each branch targets the immediately preceding branch. All remain draft until repository-level checks pass. The last branch contains the cumulative implementation. No merge or npm publication is part of this change.
