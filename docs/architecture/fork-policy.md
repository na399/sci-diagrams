# Fork policy

Base upstream commit: `e11d8530f18dd76831226253648eb34402183890`.

Eraser is the product base. Scientific requirements are optional additions to its MDP profile, existing renderer, and router. This is not a SolFigure revival. Keep upstream history and license notices. Do not introduce another source document protocol, workflow engine, editor, hosted service, or statistical plotting implementation.

Preserve package boundaries: protocol and utils are leaves; resolve remains platform-pure; render owns browser measurement and serialization; layout owns routing; diagrams owns I/O, libraries and export orchestration; CLI consumes diagrams/resolve. No lower package imports scientific tags.

The `@eraserlabs/*` workspace names are internal compatibility names. They must not be published from this fork. Distribution stays source-based until a separate namespace release is deliberately approved.

Merge stacked PRs bottom-up. After merging a lower PR, retarget its immediate dependent PR to main. Do not squash/rebase lower branches while dependent work is outstanding without restacking descendants. Never force-push main.

Every upstream update must pass the stock tests, scientific tests, type checks, dependency boundaries, security corpus and reference figures. An unavailable test is pending, not passing. SVG is a generated artifact; editable MDP JSON remains the source of truth. Imported vectors must be sanitized before any browser mounts them.
